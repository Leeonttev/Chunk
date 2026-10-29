import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { computed, ref, shallowRef } from 'vue'

import { core } from '@/api/core'
import { useStore } from '@/composables/store'
import { updateInstalling } from '@/composables/update-lock'

import packageInfo from '../../package.json'

const REPO = 'Leeonttev/Chunk'
const SETUP_URL = `https://github.com/${REPO}/releases/latest/download/Chunk-Setup.exe`

/** A newer release this copy cannot install by itself: the player downloads the installer. */
export interface ManualRelease {
	version: string
	notes: string
}

type Status = 'idle' | 'checking' | 'latest' | 'available' | 'error'

const available = shallowRef<Update | null>(null)
const manualRelease = shallowRef<ManualRelease | null>(null)
const status = ref<Status>('idle')
const checkedAt = ref<Date | null>(null)
const dialogOpen = ref(false)
const error = ref('')
const downloaded = ref(0)
const total = ref<number | undefined>()
const stage = ref<'download' | 'install'>('download')
const { instances, running, launching, installJobs } = useStore()
const checking = computed(() => status.value === 'checking')
const latestVersion = computed(
	() => available.value?.version ?? manualRelease.value?.version ?? null,
)
const blocked = computed(() => running.size > 0 || launching.size > 0 || installJobs.size > 0)
const progress = computed(() =>
	total.value ? Math.min(100, Math.floor((downloaded.value / total.value) * 100)) : null,
)

function isNewer(candidate: string, current: string) {
	const parse = (version: string) =>
		version
			.replace(/^v/, '')
			.split(/[.-]/)
			.slice(0, 3)
			.map((part) => Number.parseInt(part, 10) || 0)
	const next = parse(candidate)
	const now = parse(current)
	for (let index = 0; index < 3; index++) {
		if (next[index] !== now[index]) return next[index] > now[index]
	}
	return false
}

async function fetchLatestRelease(): Promise<ManualRelease> {
	const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
		headers: { Accept: 'application/vnd.github+json' },
		signal: AbortSignal.timeout(15000),
	})
	if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
	const release = (await response.json()) as { tag_name: string; body?: string | null }
	return { version: release.tag_name.replace(/^v/, ''), notes: release.body ?? '' }
}

async function checkWithUpdater() {
	const next = await check({ timeout: 20000 })
	const previous = available.value
	available.value = next
	await previous?.close().catch(() => {})
	return next !== null
}

async function checkWithGitHub() {
	const release = await fetchLatestRelease()
	manualRelease.value = isNewer(release.version, packageInfo.version) ? release : null
	return manualRelease.value !== null
}

async function checkUpdates(manual = false) {
	if (checking.value || updateInstalling.value) return
	status.value = 'checking'
	error.value = ''
	try {
		let found: boolean
		if (await invoke<boolean>('are_updates_enabled')) {
			try {
				found = await checkWithUpdater()
			} catch (cause) {
				console.warn('Updater check failed, asking GitHub directly', cause)
				found = await checkWithGitHub()
			}
		} else {
			found = await checkWithGitHub()
		}
		checkedAt.value = new Date()
		status.value = found ? 'available' : 'latest'
		if (found && (manual || available.value)) dialogOpen.value = true
	} catch (cause) {
		console.warn('Update check failed', cause)
		status.value = 'error'
		error.value = 'Не удалось связаться с GitHub. Проверьте интернет и попробуйте ещё раз.'
	}
}

async function downloadInstaller() {
	await openUrl(SETUP_URL)
	dialogOpen.value = false
}

async function installUpdate() {
	const update = available.value
	if (!update || updateInstalling.value || checking.value) return
	error.value = ''
	if (blocked.value) {
		error.value = 'Закройте игру и дождитесь завершения установки сборок.'
		return
	}
	updateInstalling.value = true
	stage.value = 'download'
	downloaded.value = 0
	total.value = undefined
	try {
		await update.download(
			(event) => {
				if (event.event === 'Started') total.value = event.data.contentLength
				if (event.event === 'Progress') downloaded.value += event.data.chunkLength
			},
			{ timeout: 120000 },
		)
		const processes = await Promise.all(
			instances.value.map((instance) => core.instances.processes(instance.id).catch(() => [])),
		)
		if (blocked.value || processes.some((list) => list.length > 0)) throw new Error('game-running')
		stage.value = 'install'
		await update.install()
		await invoke('restart_app')
	} catch (cause) {
		console.warn('Update installation failed', cause)
		error.value =
			cause instanceof Error && cause.message === 'game-running'
				? 'Закройте игру и повторите обновление.'
				: 'Не удалось установить обновление. Текущая версия остаётся доступной. Попробуйте ещё раз.'
	} finally {
		updateInstalling.value = false
	}
}

export function useUpdater() {
	return {
		available,
		manualRelease,
		latestVersion,
		status,
		checkedAt,
		checking,
		dialogOpen,
		error,
		progress,
		stage,
		blocked,
		updateInstalling,
		checkUpdates,
		installUpdate,
		downloadInstaller,
	}
}
