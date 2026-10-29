<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window'
import { saveWindowState, StateFlags } from '@tauri-apps/plugin-window-state'
import { Copy, Minus, Square, X } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref } from 'vue'

const appWindow = getCurrentWindow()
const maximized = ref(false)
let unlisten: (() => void) | undefined

onMounted(async () => {
	maximized.value = await appWindow.isMaximized()
	unlisten = await appWindow.onResized(async () => {
		maximized.value = await appWindow.isMaximized()
	})
})
onUnmounted(() => unlisten?.())

async function close() {
	await saveWindowState(StateFlags.ALL)
	await appWindow.close()
}
</script>

<template>
	<div class="window-controls">
		<button class="window-control" aria-label="Свернуть" @click="appWindow.minimize()">
			<Minus />
		</button>
		<button
			class="window-control"
			:aria-label="maximized ? 'Восстановить' : 'Развернуть'"
			@click="appWindow.toggleMaximize()"
		>
			<Copy v-if="maximized" class="window-control__restore" />
			<Square v-else />
		</button>
		<button class="window-control window-control--close" aria-label="Закрыть" @click="close">
			<X />
		</button>
	</div>
</template>

<style scoped>
.window-controls {
	display: flex;
	align-items: center;
	gap: 2px;
}

.window-control {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 32px;
	border: 0;
	border-radius: 10px;
	background: transparent;
	color: var(--text-3);
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.window-control svg {
	width: 15px;
	height: 15px;
}

.window-control__restore {
	transform: scaleX(-1);
}

.window-control:hover {
	background: rgba(255, 255, 255, 0.06);
	color: var(--text);
}

.window-control--close:hover {
	background: var(--danger-soft);
	color: var(--danger);
}
</style>
