<template>
	<Teleport to="body">
		<section
			v-if="showControls"
			ref="controlsEl"
			class="window-controls pointer-events-auto fixed top-0 right-0 z-[10001] flex"
			data-tauri-drag-region-exclude
		>
			<button class="window-control" aria-label="Свернуть" @click="getCurrentWindow().minimize()">
				<MinimizeIcon />
			</button>
			<button
				class="window-control"
				:aria-label="isMaximized ? 'Восстановить' : 'Развернуть'"
				@click="getCurrentWindow().toggleMaximize()"
			>
				<RestoreIcon v-if="isMaximized" />
				<MaximizeIcon v-else />
			</button>
			<button
				class="window-control window-control--close"
				aria-label="Закрыть"
				@click="handleClose"
			>
				<XIcon />
			</button>
		</section>
	</Teleport>
</template>

<script setup>
import { MaximizeIcon, MinimizeIcon, RestoreIcon, XIcon } from '@modrinth/assets'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { saveWindowState, StateFlags } from '@tauri-apps/plugin-window-state'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { useAppSettings } from '@/composables/use-app-settings.ts'
import { get as getSettings } from '@/helpers/settings.ts'
import { getOS } from '@/helpers/utils.js'

const appSettings = useAppSettings()

const nativeDecorations = ref(true)
const isMaximized = ref(false)
const os = ref('')
const controlsEl = ref(null)

const alwaysShowAppControls = computed(() => appSettings.getFeatureFlag('always_show_app_controls'))

const showControls = computed(
	() =>
		alwaysShowAppControls.value ||
		(!nativeDecorations.value && (os.value === 'Windows' || os.value === 'Linux')),
)

function setWindowControlsWidth(width) {
	document.documentElement.style.setProperty('--window-controls-width', `${width}px`)
}

let resizeObserver
watch(controlsEl, (el) => {
	resizeObserver?.disconnect()
	resizeObserver = undefined
	if (!el) {
		setWindowControlsWidth(0)
		return
	}

	resizeObserver = new ResizeObserver(() => {
		setWindowControlsWidth(el.getBoundingClientRect().width)
	})
	resizeObserver.observe(el)
	setWindowControlsWidth(el.getBoundingClientRect().width)
})

onMounted(async () => {
	os.value = await getOS()

	const settings = await getSettings()
	nativeDecorations.value = settings.native_decorations

	if (os.value !== 'MacOS') {
		await getCurrentWindow().setDecorations(nativeDecorations.value)
	}

	isMaximized.value = await getCurrentWindow().isMaximized()

	const unlisten = await getCurrentWindow().onResized(async () => {
		isMaximized.value = await getCurrentWindow().isMaximized()
	})

	onUnmounted(() => {
		unlisten()
	})
})

onUnmounted(() => {
	resizeObserver?.disconnect()
	document.documentElement.style.removeProperty('--window-controls-width')
})

const handleClose = async () => {
	await saveWindowState(StateFlags.ALL)
	await getCurrentWindow().close()
}
</script>
<style scoped>
.window-controls {
	height: 2.75rem;
	align-items: center;
	gap: 0.125rem;
	padding: 0 0.625rem 0 0.25rem;
}

.window-control {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 2rem;
	height: 2rem;
	border: 0;
	border-radius: 0.375rem;
	background: transparent;
	color: var(--color-secondary);
	cursor: pointer;
	transition:
		background-color 0.12s ease,
		color 0.12s ease;
}

.window-control svg {
	width: 0.9375rem;
	height: 0.9375rem;
}

.window-control:hover {
	background: var(--surface-4);
	color: var(--color-contrast);
}

.window-control--close:hover {
	background: rgba(232, 17, 35, 0.16);
	color: #ff5c6c;
}
</style>
