<script setup lang="ts">
import AppActionBar from './action-bar.vue'
import WindowControls from './window-controls.vue'
</script>

<template>
	<header
		data-tauri-drag-region
		class="app-title-bar relative z-[2] flex items-center bg-bg-raised [grid-area:status]"
	>
		<div data-tauri-drag-region class="h-full flex-1" />
		<section class="flex shrink-0 items-center gap-2 pr-2">
			<Suspense>
				<AppActionBar />
			</Suspense>
			<WindowControls />
		</section>
	</header>
</template>

<style scoped>
.app-title-bar {
	height: var(--top-bar-height);
	padding-right: var(--window-controls-width, 0px);
}
</style>
