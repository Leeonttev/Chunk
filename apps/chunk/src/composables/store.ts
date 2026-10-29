import { useStorage } from '@vueuse/core'
import { computed, reactive, ref } from 'vue'

import type { InstallJobSnapshot } from '#events/InstallJobSnapshot'

import { type Account, core, type Instance } from '@/api/core'
import { onAppEvent } from '@/api/events'

import { handleSessionEnd, noteLaunch, noteStop } from './autofix'
import { reportError } from './toasts'
import { updateInstalling } from './update-lock'

const instances = ref<Instance[]>([])
const accounts = ref<Account[]>([])
const activeAccountId = ref<string | null>(null)
const running = reactive(new Set<string>())
const launching = reactive(new Set<string>())
/** Which account each running instance was launched with, so several can run under different nicknames. */
const runningAs = reactive(new Map<string, Account>())
const runningAccountIds = useStorage<Record<string, string>>('chunk:running-instance-accounts', {})
const installJobs = reactive(new Map<string, InstallJobSnapshot>())
/**
 * Jobs that already reported a final status. The core can deliver a stale "running" snapshot
 * after the final one (e.g. the reply to a cancel request), which must not bring the job back.
 */
const finishedJobIds = new Set<string>()
const selectedInstanceId = useStorage<string | null>('chunk:selected-instance', null)

const sortedInstances = computed(() =>
	[...instances.value].sort((a, b) => {
		const aTime = new Date(a.last_played ?? a.created).getTime()
		const bTime = new Date(b.last_played ?? b.created).getTime()
		return bTime - aTime
	}),
)

const selectedInstance = computed(
	() =>
		instances.value.find((instance) => instance.id === selectedInstanceId.value) ??
		sortedInstances.value[0] ??
		null,
)

const activeAccount = computed(
	() => accounts.value.find((account) => account.profile.id === activeAccountId.value) ?? null,
)

async function refreshInstances() {
	try {
		instances.value = await core.instances.list()
	} catch (error) {
		reportError(error, 'Не удалось загрузить сборки')
	}
}

async function refreshAccounts() {
	try {
		const [list, active] = await Promise.all([core.accounts.list(), core.accounts.active()])
		accounts.value = list.sort((a, b) => a.profile.name.localeCompare(b.profile.name))
		activeAccountId.value = active
	} catch (error) {
		reportError(error, 'Не удалось загрузить аккаунты')
	}
}

async function refreshRunning() {
	await Promise.all(
		instances.value.map(async (instance) => {
			const processes = await core.instances.processes(instance.id).catch(() => [])
			if (processes.length > 0) {
				running.add(instance.id)
				if (!runningAs.has(instance.id)) {
					const accountId = runningAccountIds.value[instance.id] ?? activeAccount.value?.profile.id
					const account = accounts.value.find((item) => item.profile.id === accountId)
					if (account) rememberRunningAccount(instance.id, account)
				}
			} else if (!launching.has(instance.id)) {
				running.delete(instance.id)
				forgetRunningAccount(instance.id)
			}
		}),
	)
}

function rememberRunningAccount(instanceId: string, account: Account) {
	runningAs.set(instanceId, account)
	runningAccountIds.value = { ...runningAccountIds.value, [instanceId]: account.profile.id }
}

function forgetRunningAccount(instanceId: string) {
	runningAs.delete(instanceId)
	const next = { ...runningAccountIds.value }
	delete next[instanceId]
	runningAccountIds.value = next
}

let started = false
const RUNNING_POLL_MS = 4000

/** Loads initial state and keeps it in sync with events from the Rust core. Call once on boot. */
export async function startStore() {
	if (started) return
	started = true

	onAppEvent('instance', (payload) => {
		if (payload.event === 'removed' && selectedInstanceId.value === payload.instance_id) {
			selectedInstanceId.value = null
		}
		void refreshInstances()
	})
	onAppEvent('process', (payload) => {
		void refreshRunning().then(refreshInstances)
		if (payload.event !== 'finished') return
		const instance = instances.value.find((entry) => entry.id === payload.instance_id)
		const code = /exit_code=(-?\d+)/.exec(payload.message)?.[1]
		if (instance) {
			void handleSessionEnd(instance, code === undefined ? null : Number(code))
		}
	})
	onAppEvent('install_job', (job) => {
		if (!job.instance_id || finishedJobIds.has(job.job_id)) return
		if (job.status === 'queued' || job.status === 'running') {
			installJobs.set(job.instance_id, job)
		} else {
			finishedJobIds.add(job.job_id)
			installJobs.delete(job.instance_id)
			if (job.status === 'failed' && job.error && !job.canceling) {
				reportError(job.error, 'Установка не удалась')
			}
			void refreshInstances()
		}
	})

	await Promise.all([refreshInstances(), refreshAccounts()])
	await refreshRunning()
	setInterval(() => void refreshRunning(), RUNNING_POLL_MS)
}

/** Drops jobs the core no longer runs, in case their final event was lost or overtaken. */
export async function syncInstallJobs() {
	const active = await core.installs.active().catch(() => null)
	if (!active) return
	const activeIds = new Set(active.map((job) => job.job_id))
	for (const [instanceId, job] of installJobs) {
		if (!activeIds.has(job.job_id)) {
			finishedJobIds.add(job.job_id)
			installJobs.delete(instanceId)
		}
	}
	if (installJobs.size === 0) void refreshInstances()
}

/** Launches an instance under the given account, making it the remembered default. */
export async function launchInstance(instance: Instance, account: Account | null) {
	if (updateInstalling.value) return
	if (!account) throw new Error('Нужен аккаунт')
	if (running.has(instance.id) || launching.has(instance.id)) return
	launching.add(instance.id)
	rememberRunningAccount(instance.id, account)
	let launched = false
	try {
		await selectAccount(account)
		noteLaunch(instance, account, launchInstance)
		await core.instances.run(instance.id)
		running.add(instance.id)
		launched = true
	} catch (error) {
		reportError(error, 'Не удалось запустить игру')
	} finally {
		launching.delete(instance.id)
		if (!launched) forgetRunningAccount(instance.id)
		void refreshRunning()
	}
}

/** Makes the account the one used for the next launch, without starting anything. */
export async function selectAccount(account: Account) {
	if (account.profile.id === activeAccountId.value) return
	await core.accounts.setActive(account.profile.id)
	activeAccountId.value = account.profile.id
}

export async function stopInstance(instance: Instance) {
	noteStop(instance.id)
	try {
		await core.instances.kill(instance.id)
	} catch (error) {
		reportError(error, 'Не удалось остановить игру')
	} finally {
		await refreshRunning()
	}
}

/** Deletes an instance and refreshes the list right away instead of waiting for the core event. */
export async function removeInstance(instance: Instance) {
	try {
		await core.instances.remove(instance.id)
	} catch (error) {
		reportError(error, 'Не удалось удалить сборку')
	} finally {
		running.delete(instance.id)
		forgetRunningAccount(instance.id)
		if (selectedInstanceId.value === instance.id) selectedInstanceId.value = null
		await refreshInstances()
	}
}

export function useStore() {
	return {
		instances: sortedInstances,
		selectedInstance,
		selectedInstanceId,
		accounts,
		activeAccount,
		activeAccountId,
		running,
		launching,
		runningAs,
		installJobs,
		refreshInstances,
		refreshAccounts,
	}
}

/** Shared state must not be hot-swapped: a fresh copy would lose its core event subscriptions, so reload instead. */
import.meta.hot?.accept(() => window.location.reload())
