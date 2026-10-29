<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useStore } from '@/composables/store'

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
const { installJobs } = useStore()
const activeJobs = computed(() => installJobs.size)
const jobLabel = computed(() => {
	if (activeJobs.value > 1) return `Установок: ${activeJobs.value}`
	const progress = [...installJobs.values()][0]?.progress
	const percent = progress?.total
		? Math.min(99, Math.floor((progress.current / progress.total) * 100))
		: null
	return percent === null ? 'Установка…' : `Установка ${percent}%`
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
				<div v-if="activeJobs > 0" class="titlebar__jobs">
					<LoaderCircle class="spin" />
					{{ jobLabel }}
				</div>
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
	padding: 0 12px;
	border-radius: 10px;
	background: var(--accent-soft);
	color: var(--accent-text);
	font-size: 12.5px;
	font-weight: 600;
}

.titlebar__jobs svg {
	width: 14px;
	height: 14px;
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
