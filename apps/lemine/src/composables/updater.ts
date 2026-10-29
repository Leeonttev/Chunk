import { invoke } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { computed, ref, shallowRef } from 'vue'

import { core } from '@/api/core'
import { useStore } from '@/composables/store'
import { updateInstalling } from '@/composables/update-lock'

const available = shallowRef<Update | null>(null)
const checking = ref(false)
const dialogOpen = ref(false)
const message = ref('')
const error = ref('')
const downloaded = ref(0)
const total = ref<number | undefined>()
const stage = ref<'download' | 'install'>('download')
const { instances, running, launching, installJobs } = useStore()
const blocked = computed(() => running.size > 0 || launching.size > 0 || installJobs.size > 0)
const progress = computed(() =>
	total.value ? Math.min(100, Math.floor((downloaded.value / total.value) * 100)) : null,
)

async function checkUpdates(manual = false) {
	if (checking.value || updateInstalling.value) return
	checking.value = true
	error.value = ''
	message.value = ''
	try {
		if (!(await invoke<boolean>('are_updates_enabled'))) {
			if (manual) message.value = 'Обновления доступны в установленной версии Chunk.'
			return
		}
		const next = await check({ timeout: 20000 })
		const previous = available.value
		available.value = next
		await previous?.close().catch(() => {})
		if (next) dialogOpen.value = true
		else if (manual) message.value = 'Установлена последняя версия.'
	} catch (cause) {
		console.warn('Update check failed', cause)
		if (manual)
			error.value =
				'Не удалось проверить обновления. Проверьте интернет; возможно, первый выпуск ещё не опубликован.'
	} finally {
		checking.value = false
	}
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
		checking,
		dialogOpen,
		message,
		error,
		progress,
		stage,
		blocked,
		updateInstalling,
		checkUpdates,
		installUpdate,
	}
}
