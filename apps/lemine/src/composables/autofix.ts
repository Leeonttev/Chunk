import { useStorage } from '@vueuse/core'

import { type Account, type ContentItem, core, type Instance } from '@/api/core'

import { pushToast } from './toasts'

/** A session that ran this long without crashing proves the current mod set works. */
const HEALTHY_SESSION_MS = 3 * 60 * 1000
/** How many fix-and-relaunch rounds to try before giving up on one launch. */
const MAX_ATTEMPTS = 3
/** Mod ids that belong to the game or loader itself and must never be switched off. */
const PROTECTED_IDS =
	/^(minecraft|java|fabricloader|fabric|fabric-api-base|forge|neoforge|quilt_loader|mixinextras)$|^fabric-.+-v\d+$/
/** Jars in stack traces that are part of the game or loader, not user mods. */
const PLATFORM_JARS =
	/^(minecraft|client|server|forge|fmlcore|fmlloader|fmlearlydisplay|javafmllanguage|lowcodelanguage|mclanguage|neoforge|loader|fabric-loader|mixin|sponge-mixin|bootstraplauncher|securejarhandler|modlauncher|eventbus|coremods|jdk|java|guava|netty|lwjgl|datafixerupper|brigadier|authlib)/i

export const autofixEnabled = useStorage('lemine:autofix', true)
/** Mod set of each instance's last healthy session, as `project@version` (or file name) keys. */
const healthySets = useStorage<Record<string, string[]>>('lemine:autofix-healthy', {})
/** File names (without `.disabled`) that autofix switched off, per instance, so the UI can say so. */
export const autofixDisabled = useStorage<Record<string, string[]>>('lemine:autofix-disabled', {})

interface Session {
	startedAt: number
	account: Account | null
	attempts: number
	stopping: boolean
}

const sessions = new Map<string, Session>()

export const baseFileName = (fileName: string) => fileName.replace(/\.disabled$/i, '')

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

function itemKey(item: ContentItem) {
	return item.project && item.version
		? `${item.project.id}@${item.version.id}`
		: baseFileName(item.file_name)
}

/** Remembers a launch so a crash can be told apart from a normal exit and relaunched as the same account. */
export function noteLaunch(instanceId: string, account: Account | null) {
	const previous = sessions.get(instanceId)
	sessions.set(instanceId, {
		startedAt: Date.now(),
		account,
		attempts: previous?.attempts ?? 0,
		stopping: false,
	})
}

/** Marks a stop the user asked for, so the forced exit is not treated as a crash. */
export function noteStop(instanceId: string) {
	const session = sessions.get(instanceId)
	if (session) session.stopping = true
}

/** Lets the UI forget an autofix mark once the user turns the mod back on. */
export function clearAutofixMark(instanceId: string, fileName: string) {
	const list = autofixDisabled.value[instanceId]
	if (!list) return
	const name = baseFileName(fileName)
	autofixDisabled.value = {
		...autofixDisabled.value,
		[instanceId]: list.filter((entry) => entry !== name),
	}
}

async function crashText(instanceId: string, since: number) {
	const parts: string[] = []
	const reports = await core.files.list(instanceId, 'crash-reports').catch(() => [])
	const latest = reports
		.filter((file) => file.kind === 'file' && file.modified * 1000 >= since - 5000)
		.sort((a, b) => b.modified - a.modified)[0]
	if (latest) {
		const bytes = await core.files.read(instanceId, latest.path).catch(() => null)
		if (bytes) parts.push(new TextDecoder().decode(new Uint8Array(bytes)))
	}
	const log = await core.logs.live(instanceId).catch(() => [])
	parts.push(log.slice(-4000).join('\n'))
	return parts.join('\n')
}

/** Mod ids, display names and jar names that the crash report or log blames. */
function blamed(text: string) {
	const ids = new Set<string>()
	const names = new Set<string>()
	const jars = new Set<string>()
	const add = (id?: string, name?: string) => {
		if (id && !PROTECTED_IDS.test(id.toLowerCase())) ids.add(id.toLowerCase())
		if (name) names.add(name.trim())
	}

	for (const match of text.matchAll(
		/Mod '([^']+)' \(([\w.-]+)\)[^\n]*?(?:requires|is incompatible|conflicts|breaks)/g,
	))
		add(match[2], match[1])
	for (const match of text.matchAll(/(?:Remove|Replace) mod '([^']+)' \(([\w.-]+)\)/g))
		add(match[2], match[1])
	for (const match of text.matchAll(/^\s*([^\n(]+?) \(([\w.-]+)\), Version:/gm))
		add(match[2], match[1])
	for (const match of text.matchAll(/from mod ([\w.-]+)/g)) add(match[1])
	for (const match of text.matchAll(/Mixin apply for mod ([\w.-]+) failed/g)) add(match[1])
	for (const match of text.matchAll(/Failure message: ([^\n]+?) \(([\w.-]+)\) has failed/g))
		add(match[2], match[1])
	for (const match of text.matchAll(/Mod File: [^\n]*[\\/]([^\\/\n]+\.jar)/g))
		jars.add(match[1].toLowerCase())

	const trace = text.split('\n').slice(0, 120).join('\n')
	for (const match of trace.matchAll(/\[([^\]\s/\\:%]+\.jar)[%:!]/g)) {
		if (!PLATFORM_JARS.test(match[1])) jars.add(match[1].toLowerCase())
	}
	return { ids, names, jars }
}

function matchBlamed(mods: ContentItem[], text: string) {
	const { ids, names, jars } = blamed(text)
	const normalizedIds = [...ids].map(normalize).filter(Boolean)
	const normalizedNames = [...names].map(normalize).filter(Boolean)
	return mods.filter((item) => {
		const file = baseFileName(item.file_name).toLowerCase()
		if (jars.has(file)) return true
		const slug = normalize(item.project?.slug ?? '')
		const title = normalize(item.project?.title ?? '')
		const fileBase = normalize(file.replace(/\.jar$/, ''))
		return (
			normalizedIds.some(
				(id) => id === slug || id === title || (id.length >= 4 && fileBase.startsWith(id)),
			) || normalizedNames.some((name) => name === title)
		)
	})
}

function rememberHealthy(instanceId: string, mods: ContentItem[]) {
	healthySets.value = { ...healthySets.value, [instanceId]: mods.map(itemKey) }
}

/** Mods added or changed since the last session that ran fine. */
function changedSinceHealthy(instanceId: string, mods: ContentItem[]) {
	const healthy = healthySets.value[instanceId]
	if (!healthy) return []
	const known = new Set(healthy)
	return mods.filter((item) => !known.has(itemKey(item)))
}

async function enabledMods(instance: Instance) {
	const items = await core.content.list(instance)
	return items.filter((item) => item.project_type === 'mod' && item.enabled)
}

/**
 * Handles the end of a game session. A clean or long session records the working mod set;
 * a crash, when autofix is on, switches off the mods to blame and relaunches.
 */
export async function handleSessionEnd(
	instance: Instance,
	exitCode: number | null,
	relaunch: (instance: Instance, account: Account | null) => Promise<void>,
) {
	const session = sessions.get(instance.id)
	if (!session || session.stopping) {
		sessions.delete(instance.id)
		return
	}
	const lasted = Date.now() - session.startedAt
	const crashed = exitCode !== null && exitCode !== 0

	if (!crashed || lasted >= HEALTHY_SESSION_MS) {
		sessions.delete(instance.id)
		const mods = await enabledMods(instance).catch(() => null)
		if (mods) rememberHealthy(instance.id, mods)
		return
	}

	if (!autofixEnabled.value) {
		sessions.delete(instance.id)
		pushToast({
			kind: 'error',
			title: 'Игра вылетела',
			text: 'Включите «Автофикс» в настройках — лаунчер сам найдёт и выключит мешающие моды',
		})
		return
	}

	if (session.attempts >= MAX_ATTEMPTS) {
		sessions.delete(instance.id)
		pushToast({
			kind: 'error',
			title: 'Автофикс не помог',
			text: 'Посмотрите вкладку «Лог игры» в настройках сборки',
		})
		return
	}

	const mods = await enabledMods(instance).catch(() => [])
	let culprits = matchBlamed(mods, await crashText(instance.id, session.startedAt))
	if (culprits.length === 0) culprits = changedSinceHealthy(instance.id, mods)
	if (culprits.length === 0) {
		sessions.delete(instance.id)
		pushToast({
			kind: 'error',
			title: 'Игра вылетела',
			text: 'Автофикс не нашёл виноватый мод — проверьте «Лог игры»',
		})
		return
	}

	const switched: string[] = []
	for (const item of culprits) {
		try {
			await core.content.toggle(instance.id, item.file_path)
			switched.push(item.project?.title ?? baseFileName(item.file_name))
			const list = autofixDisabled.value[instance.id] ?? []
			autofixDisabled.value = {
				...autofixDisabled.value,
				[instance.id]: [...new Set([...list, baseFileName(item.file_name)])],
			}
		} catch {
			// A mod that cannot be switched off is simply left as is.
		}
	}
	if (switched.length === 0) {
		sessions.delete(instance.id)
		return
	}

	session.attempts += 1
	pushToast({
		kind: 'info',
		title: `Автофикс: выключено ${switched.length}`,
		text: `${switched.slice(0, 3).join(', ')}${switched.length > 3 ? '…' : ''} — запускаем снова`,
	})
	await relaunch(instance, session.account)
}
