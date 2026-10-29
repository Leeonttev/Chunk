<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { InstallJobSnapshot } from '#events/InstallJobSnapshot'

import { core } from '@/api/core'
import { syncInstallJobs, useStore } from '@/composables/store'
import { reportError } from '@/composables/toasts'

import InstanceIcon from './InstanceIcon.vue'
import UiPopover from './ui/UiPopover.vue'
import WindowControls from './WindowControls.vue'

const route = useRoute()
const router = useRouter()

/** vue-router keeps neighbouring entries in `history.state`; re-read it whenever the route changes. */
const canGoBack = computed(() => route.fullPath !== undefined && !!window.history.state?.back)
const canGoForward = computed(() => route.fullPath !== undefined && !!window.history.state?.forward)

useEventListener(window, 'mouseup', (event: MouseEvent) => {
	if (event.button !== 3 && event.button !== 4) return
	event.preventDefault()
	if (event.button === 3 && canGoBack.value) router.back()
	if (event.button === 4 && canGoForward.value) router.forward()
})
const { installJobs, instances } = useStore()
const jobsOpen = ref(false)
const cancelling = ref(new Set<string>())
const jobs = computed(() => [...installJobs.values()])
const activeJobs = computed(() => jobs.value.length)

function percentOf(job: InstallJobSnapshot) {
	const progress = job.progress
	return progress?.total
		? Math.min(99, Math.floor((progress.current / progress.total) * 100))
		: null
}

const jobLabel = computed(() => {
	if (activeJobs.value > 1) return `Установок: ${activeJobs.value}`
	const percent = jobs.value[0] ? percentOf(jobs.value[0]) : null
	return percent === null ? 'Установка…' : `Установка ${percent}%`
})

function instanceOf(job: InstallJobSnapshot) {
	return instances.value.find((instance) => instance.id === job.instance_id) ?? null
}

function titleOf(job: InstallJobSnapshot) {
	return job.display?.title ?? instanceOf(job)?.name ?? 'Сборка'
}

/** Re-checks with the core a few times, so a cancel never leaves a "Cancelling…" row behind. */
async function confirmCancelled(jobId: string) {
	for (let attempt = 0; attempt < 10; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, 1500))
		await syncInstallJobs()
		if (!jobs.value.some((entry) => entry.job_id === jobId)) return
	}
}

async function cancel(job: InstallJobSnapshot) {
	cancelling.value = new Set(cancelling.value).add(job.job_id)
	try {
		await core.installs.cancel(job.job_id)
		void confirmCancelled(job.job_id)
	} catch (error) {
		await syncInstallJobs()
		if (!jobs.value.some((entry) => entry.job_id === job.job_id)) return
		reportError(error, 'Не удалось отменить установку')
		const next = new Set(cancelling.value)
		next.delete(job.job_id)
		cancelling.value = next
	}
}

watch(activeJobs, (count) => {
	if (count === 0) {
		jobsOpen.value = false
		cancelling.value = new Set()
	}
})
</script>

<template>
	<header class="titlebar" data-tauri-drag-region>
		<div class="titlebar__bar" data-tauri-drag-region>
			<div class="titlebar__side" data-tauri-drag-region>
				<span class="titlebar__history">
					<button
						v-tip="'Назад'"
						type="button"
						class="titlebar__arrow"
						:disabled="!canGoBack"
						aria-label="Назад"
						@click="router.back()"
					>
						<ChevronLeft />
					</button>
					<button
						v-tip="'Вперёд'"
						type="button"
						class="titlebar__arrow"
						:disabled="!canGoForward"
						aria-label="Вперёд"
						@click="router.forward()"
					>
						<ChevronRight />
					</button>
				</span>
			</div>

			<div class="titlebar__side titlebar__side--end" data-tauri-drag-region>
				<UiPopover
					v-if="activeJobs > 0"
					v-model:open="jobsOpen"
					placement="bottom-end"
					width="320px"
				>
					<template #trigger="{ toggle }">
						<button
							type="button"
							class="titlebar__jobs"
							:class="{ 'titlebar__jobs--open': jobsOpen }"
							@click="toggle"
						>
							<LoaderCircle class="spin" />
							{{ jobLabel }}
							<ChevronDown class="titlebar__jobs-chevron" />
						</button>
					</template>
					<div class="jobs">
						<div v-for="job in jobs" :key="job.job_id" class="job">
							<InstanceIcon :path="instanceOf(job)?.icon_path" :name="titleOf(job)" :size="34" />
							<div class="job__text">
								<span class="job__title">{{ titleOf(job) }}</span>
								<span class="job__status">
									{{
										job.canceling || cancelling.has(job.job_id)
											? 'Отменяем…'
											: job.paused
												? 'На паузе'
												: percentOf(job) === null
													? 'Подготовка…'
													: `${percentOf(job)}%`
									}}
								</span>
								<span class="job__bar">
									<span class="job__fill" :style="{ width: `${percentOf(job) ?? 0}%` }" />
								</span>
							</div>
							<button
								v-tip="job.can_cancel ? 'Отменить установку' : 'Этот шаг нельзя прервать'"
								type="button"
								class="job__cancel"
								:disabled="!job.can_cancel || job.canceling || cancelling.has(job.job_id)"
								aria-label="Отменить установку"
								@click="cancel(job)"
							>
								<X />
							</button>
						</div>
					</div>
				</UiPopover>
				<WindowControls />
			</div>
		</div>
	</header>
</template>

<style scoped>
.titlebar {
	position: relative;
	flex-shrink: 0;
	background: var(--bg);
	z-index: 30;
	display: flex;
	align-items: center;
	height: 64px;
	padding: 0 14px 0 var(--page-gutter);
}

.titlebar__bar {
	display: grid;
	grid-template-columns: 1fr auto;
	align-items: center;
	gap: 12px;
	width: 100%;
	height: 40px;
	padding: 0;
	border-radius: 16px;
	background: transparent;
}

.titlebar__side {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
	height: 100%;
}

.titlebar__side--end {
	justify-content: flex-end;
}

.titlebar__history {
	display: flex;
	align-items: center;
	gap: 2px;
	padding-left: 0;
	border: 0;
}

.titlebar__arrow {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	padding: 0;
	border: 0;
	border-radius: 10px;
	background: transparent;
	color: var(--text-2);
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.titlebar__arrow:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.06);
	color: var(--text);
}

.titlebar__arrow:disabled {
	color: var(--surface-4);
	cursor: default;
}

.titlebar__arrow svg {
	width: 18px;
	height: 18px;
}

.titlebar :deep(.window-controls) {
	height: 40px;
	padding: 4px;
}

.titlebar__jobs {
	display: flex;
	align-items: center;
	gap: 7px;
	height: 32px;
	padding: 0 10px 0 12px;
	border: 0;
	border-radius: 10px;
	background: var(--accent-soft);
	color: var(--accent-text);
	font: inherit;
	font-size: 12.5px;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.14s var(--ease);
}

.titlebar__jobs:hover,
.titlebar__jobs--open {
	background: rgba(36, 207, 120, 0.24);
}

.titlebar__jobs svg {
	width: 14px;
	height: 14px;
}

.titlebar__jobs-chevron {
	opacity: 0.7;
	transition: transform 0.16s var(--ease);
}

.titlebar__jobs--open .titlebar__jobs-chevron {
	transform: rotate(180deg);
}

.jobs {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.job {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px;
	border-radius: var(--radius-md);
}

.job__text {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	gap: 3px;
}

.job__title {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 13.5px;
	font-weight: 700;
}

.job__status {
	color: var(--text-3);
	font-size: 12px;
	font-weight: 600;
}

.job__bar {
	height: 4px;
	margin-top: 2px;
	border-radius: 999px;
	background: var(--surface-3);
	overflow: hidden;
}

.job__fill {
	display: block;
	height: 100%;
	border-radius: inherit;
	background: var(--accent);
	transition: width 0.3s var(--ease);
}

.job__cancel {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	padding: 0;
	border: 0;
	border-radius: 10px;
	background: var(--surface-3);
	color: var(--text-2);
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.job__cancel:hover:not(:disabled) {
	background: var(--danger-soft);
	color: var(--danger);
}

.job__cancel:disabled {
	color: var(--text-3);
	opacity: 0.5;
	cursor: default;
}

.job__cancel svg {
	width: 16px;
	height: 16px;
}

.spin {
	animation: spin 0.9s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
