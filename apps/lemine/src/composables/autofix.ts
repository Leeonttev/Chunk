import { useStorage } from '@vueuse/core'
import { ref, shallowRef } from 'vue'

import { type Account, type ContentItem, core, type Instance, type Loader } from '@/api/core'

import { pushToast } from './toasts'

/** A session that ran this long without crashing proves the current mod set works. */
const HEALTHY_SESSION_MS = 3 * 60 * 1000
/** How often the live log is checked for a loader error screen while the game starts. */
const LOG_POLL_MS = 2000
/** How many lines of the log the fix dialog shows as evidence. */
const EXCERPT_LINES = 40
/** Mod ids that belong to the game or loader itself and must never be switched off. */
const PROTECTED_IDS =
	/^(minecraft|java|fabricloader|fabric|fabric-api-base|forge|neoforge|quilt_loader|mixinextras)$|^fabric-.+-v\d+$/
/** Jars in stack traces that are part of the game or loader, not user mods. */
const PLATFORM_JARS =
	/^(minecraft|client|server|forge|fmlcore|fmlloader|fmlearlydisplay|javafmllanguage|lowcodelanguage|mclanguage|neoforge|loader|fabric-loader|mixin|sponge-mixin|bootstraplauncher|securejarhandler|modlauncher|eventbus|coremods|jdk|java|guava|netty|lwjgl|datafixerupper|brigadier|authlib)/i
/** Lines the mod loader prints when it refuses to start and shows its own error window instead. */
const LOADER_ERROR =
	/Incompatible mods? found|Some of your mods are incompatible|Mod resolution (?:encountered an incompatible mod set|failed)|net\.fabricmc\.loader\.impl\.FormattedException/i
/** Log lines worth showing to the user when explaining a failed start. */
const EVIDENCE =
	/Incompatible|incompatible|Replace mod|Remove mod|requires|depends|Exception|ERROR|FATAL|Caused by|Mixin apply|has failed/
/** Names the loaders use for themselves in dependency errors. */
const LOADER_MODS: Partial<Record<Loader, { name: string; id: string }>> = {
	fabric: { name: 'Fabric Loader', id: 'fabricloader' },
	quilt: { name: 'Quilt Loader', id: 'quilt_loader' },
}

/** Whether the launcher looks for a fix and offers it when a game fails to start. */
export const autofixEnabled = useStorage('lemine:autofix', true)
/** Mod set of each instance's last healthy session, as `project@version` (or file name) keys. */
const healthySets = useStorage<Record<string, string[]>>('lemine:autofix-healthy', {})
/** File names (without `.disabled`) that autofix switched off, per instance, so the UI can say so. */
export const autofixDisabled = useStorage<Record<string, string[]>>('lemine:autofix-disabled', {})

export type FixStep =
	| { kind: 'loader'; loaderName: string; from: string | null; to: string }
	| { kind: 'java'; version: number }
	| { kind: 'disable'; mods: ContentItem[] }

export type StepState = 'pending' | 'running' | 'done' | 'failed'

export interface FixPlan {
	instance: Instance
	account: Account | null
	/** True when the game is still open on the loader's error window. */
	gameOpen: boolean
	steps: FixStep[]
	/** Lines from the log and crash report that led to this plan. */
	evidence: string[]
}

type Relaunch = (instance: Instance, account: Account | null) => Promise<void>

interface Session {
	startedAt: number
	account: Account | null
	relaunch: Relaunch
	stopping: boolean
	/** A plan was already offered for this session, so its exit must not offer another. */
	offered: boolean
	watcher: ReturnType<typeof setInterval> | null
}

/** The fix waiting for the user's decision, shown by `AutofixModal`. */
export const pendingFix = shallowRef<FixPlan | null>(null)
/** Progress of the fix being applied, one entry per step of `pendingFix`. */
export const fixProgress = ref<{ state: StepState; note?: string }[]>([])
export const fixRunning = ref(false)

const sessions = new Map<string, Session>()

export const baseFileName = (fileName: string) => fileName.replace(/\.disabled$/i, '')

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function itemKey(item: ContentItem) {
	return item.project && item.version
		? `${item.project.id}@${item.version.id}`
		: baseFileName(item.file_name)
}

/** The core returns the live log as one string; split it so callers can work line by line. */
async function liveLog(instanceId: string) {
	const buffer = (await core.logs.live(instanceId).catch(() => '')) as unknown
	const text = Array.isArray(buffer) ? buffer.join('\n') : String(buffer ?? '')
	return text.split(/\r?\n/)
}

/** Remembers a launch so a crash can be told apart from a normal exit and relaunched as the same account. */
export function noteLaunch(instance: Instance, account: Account | null, relaunch: Relaunch) {
	stopWatching(sessions.get(instance.id))
	const session: Session = {
		startedAt: Date.now(),
		account,
		relaunch,
		stopping: false,
		offered: false,
		watcher: null,
	}
	sessions.set(instance.id, session)
	watchForLoaderError(instance, session)
}

/** Marks a stop the user asked for, so the forced exit is not treated as a crash. */
export function noteStop(instanceId: string) {
	const session = sessions.get(instanceId)
	if (!session) return
	session.stopping = true
	stopWatching(session)
}

function stopWatching(session: Session | undefined) {
	if (session?.watcher) clearInterval(session.watcher)
	if (session) session.watcher = null
}

/**
 * Fabric and Quilt do not crash on an incompatible mod set: they open an error window and wait.
 * Watch the live log during start-up and offer a fix as soon as that window appears.
 */
function watchForLoaderError(instance: Instance, session: Session) {
	session.watcher = setInterval(async () => {
		if (Date.now() - session.startedAt > HEALTHY_SESSION_MS || session.stopping) {
			stopWatching(session)
			return
		}
		if (!autofixEnabled.value) return
		const log = await liveLog(instance.id)
		if (!log.some((line) => LOADER_ERROR.test(line))) return
		stopWatching(session)
		session.offered = true
		await offerFix(instance, session, log.join('\n'), true)
	}, LOG_POLL_MS)
}

const compareVersions = (a: string, b: string) => {
	const left = a.split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0)
	const right = b.split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0)
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		const diff = (left[index] ?? 0) - (right[index] ?? 0)
		if (diff) return diff
	}
	return 0
}

/** The newest loader version a crash text asks for, e.g. "requires version 0.19.5 or later of mod 'Fabric Loader'". */
function requiredLoaderVersion(text: string, loader: Loader) {
	const own = LOADER_MODS[loader]
	if (!own) return null
	const name = own.name.replace(/ /g, '\\s')
	const patterns = [
		new RegExp(`Replace mod '${name}' \\(${own.id}\\) \\S+ with version ([\\d.]+)`, 'g'),
		new RegExp(`requires version ([\\d.]+) or later of mod '${name}'`, 'g'),
		new RegExp(`depends ${own.id} @ \\[>=([\\d.]+)`, 'g'),
	]
	let wanted: string | null = null
	for (const pattern of patterns) {
		for (const match of text.matchAll(pattern)) {
			if (!wanted || compareVersions(match[1], wanted) > 0) wanted = match[1]
		}
	}
	return wanted
}

/** The Java major version mods ask for, e.g. "requires version 25 or later of 'OpenJDK 64-Bit Server VM' (java)". */
function requiredJava(text: string) {
	let wanted = 0
	const patterns = [
		/requires version (\d+) or later of '[^']*' \(java\)/g,
		/depends java @ \[>=(\d+)/g,
		/has been compiled by a more recent version of the Java Runtime \(class file version (\d+)/g,
	]
	for (const [index, pattern] of patterns.entries()) {
		for (const match of text.matchAll(pattern)) {
			const value = Number(match[1])
			const major = index === 2 ? value - 44 : value
			if (major > wanted) wanted = major
		}
	}
	return wanted || null
}

/** The newest stable loader version at least `minimum` for this instance's game version. */
async function pickLoaderVersion(instance: Instance, minimum: string) {
	const manifest = await core.metadata.loaderVersions(instance.loader)
	const entry =
		manifest.gameVersions.find((version) => version.id === instance.game_version) ??
		manifest.gameVersions.find((version) => version.id.includes('${'))
	const candidates = (entry?.loaders ?? []).filter(
		(version) => compareVersions(version.id, minimum) >= 0,
	)
	const stable = candidates.filter((version) => version.stable)
	return (stable.length ? stable : candidates).sort((a, b) => compareVersions(b.id, a.id))[0]?.id
}

async function waitForInstalls(instanceId: string) {
	const deadline = Date.now() + 10 * 60 * 1000
	while (Date.now() < deadline) {
		await sleep(1500)
		const active = await core.installs.active().catch(() => [])
		if (!active.some((job) => job.instance_id === instanceId)) return
	}
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
	parts.push((await liveLog(instanceId)).slice(-4000).join('\n'))
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
		/Mod '([^']+)' \(([\w.-]+)\)([^\n]*?)(?:requires|is incompatible|conflicts|breaks)([^\n]*)/g,
	)) {
		if (/(?:Fabric|Quilt) Loader|fabricloader|quilt_loader|\(java\)/.test(match[3] + match[4]))
			continue
		add(match[2], match[1])
	}
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

/** Works out what would make the game start again, without changing anything yet. */
async function buildSteps(instance: Instance, text: string, since: number): Promise<FixStep[]> {
	const steps: FixStep[] = []
	const loaderNeeded = requiredLoaderVersion(text, instance.loader)
	if (
		loaderNeeded &&
		(!instance.loader_version || compareVersions(instance.loader_version, loaderNeeded) < 0)
	) {
		const to = await pickLoaderVersion(instance, loaderNeeded).catch(() => undefined)
		if (to) {
			steps.push({
				kind: 'loader',
				loaderName: LOADER_MODS[instance.loader]?.name ?? 'Загрузчик',
				from: instance.loader_version ?? null,
				to,
			})
		}
	}
	const java = requiredJava(text)
	if (java) steps.push({ kind: 'java', version: java })
	if (steps.length > 0) return steps

	const mods = await enabledMods(instance).catch(() => [])
	let culprits = matchBlamed(mods, text)
	if (culprits.length === 0 && Date.now() - since < HEALTHY_SESSION_MS) {
		culprits = changedSinceHealthy(instance.id, mods)
	}
	if (culprits.length > 0) steps.push({ kind: 'disable', mods: culprits })
	return steps
}

function evidenceOf(text: string) {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line && EVIDENCE.test(line))
	return [...new Set(lines)].slice(0, EXCERPT_LINES)
}

async function offerFix(instance: Instance, session: Session, log: string, gameOpen: boolean) {
	if (pendingFix.value?.instance.id === instance.id) return
	const text = gameOpen ? log : await crashText(instance.id, session.startedAt)
	const steps = await buildSteps(instance, text, session.startedAt)
	if (steps.length === 0) {
		pushToast({
			kind: 'error',
			title: 'Игра не запустилась',
			text: 'Автофикс не нашёл, что исправить. Загляните во вкладку «Лог игры»',
		})
		return
	}
	pendingFix.value = {
		instance,
		account: session.account,
		gameOpen,
		steps,
		evidence: evidenceOf(text),
	}
	fixProgress.value = steps.map(() => ({ state: 'pending' }))
}

export function dismissFix() {
	if (fixRunning.value) return
	const plan = pendingFix.value
	pendingFix.value = null
	if (plan) sessions.delete(plan.instance.id)
}

async function runStep(instance: Instance, step: FixStep) {
	if (step.kind === 'loader') {
		await core.instances.edit(instance.id, {
			loader: instance.loader,
			game_version: instance.game_version,
			loader_version: step.to,
		})
		await core.instances.reinstallGame(instance.id)
		await waitForInstalls(instance.id)
		return `Установлен ${step.loaderName} ${step.to}`
	}
	if (step.kind === 'java') {
		const found = await core.java.find(step.version).catch(() => [])
		const path = found[0]?.path ?? (await core.java.autoInstall(step.version))
		await core.instances.edit(instance.id, { java_path: path })
		return found[0] ? `Используется ${found[0].version}` : `Скачана Java ${step.version}`
	}
	let switched = 0
	for (const item of step.mods) {
		try {
			await core.content.toggle(instance.id, item.file_path)
			switched++
			const list = autofixDisabled.value[instance.id] ?? []
			autofixDisabled.value = {
				...autofixDisabled.value,
				[instance.id]: [...new Set([...list, baseFileName(item.file_name)])],
			}
		} catch {
			// A mod that cannot be switched off is simply left as is.
		}
	}
	if (switched === 0) throw new Error('Не удалось выключить моды')
	return `Выключено модов: ${switched}`
}

/** Applies the pending plan step by step, then starts the game again. */
export async function applyFix() {
	const plan = pendingFix.value
	if (!plan || fixRunning.value) return
	fixRunning.value = true
	const session = sessions.get(plan.instance.id)
	if (session) session.stopping = true
	try {
		if (plan.gameOpen) {
			await core.instances.kill(plan.instance.id).catch(() => {})
			await sleep(1500)
		}
		let instance = plan.instance
		for (const [index, step] of plan.steps.entries()) {
			fixProgress.value[index] = { state: 'running' }
			try {
				const note = await runStep(instance, step)
				fixProgress.value[index] = { state: 'done', note }
				if (step.kind === 'loader') instance = { ...instance, loader_version: step.to }
			} catch (error) {
				fixProgress.value[index] = {
					state: 'failed',
					note: error instanceof Error ? error.message : String(error),
				}
				return
			}
		}
		const relaunch = session?.relaunch
		pendingFix.value = null
		if (relaunch) await relaunch(instance, plan.account)
	} finally {
		fixRunning.value = false
	}
}

/**
 * Handles the end of a game session. A clean or long session records the working mod set;
 * a crash, when autofix is on, offers a fix for the user to accept.
 */
export async function handleSessionEnd(instance: Instance, exitCode: number | null) {
	const session = sessions.get(instance.id)
	stopWatching(session)
	if (!session || session.stopping || session.offered) {
		if (!session?.offered) sessions.delete(instance.id)
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
			text: 'Включите «Автофикс» в настройках — лаунчер подскажет, что исправить',
		})
		return
	}
	session.offered = true
	await offerFix(instance, session, '', false)
}
