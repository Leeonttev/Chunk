<script setup lang="ts">
import { useScrollIndicator } from '@modrinth/ui'
import { OverlayScrollbars } from 'overlayscrollbars'
import { onMounted, onScopeDispose, ref } from 'vue'

defineProps<{
	visible: boolean
}>()

const scrollContainer = ref<HTMLElement | null>(null)
const scrollViewport = ref<HTMLElement | null>(null)
const { showTopFade, showBottomFade, checkScrollState } = useScrollIndicator(scrollViewport)

let removeScrollbarListener: (() => void) | undefined

onMounted(() => {
	if (!scrollContainer.value) return
	const scrollbars = OverlayScrollbars(scrollContainer.value)
	if (!scrollbars) return
	scrollViewport.value = scrollbars.elements().viewport
	removeScrollbarListener = scrollbars.on('updated', checkScrollState)
})

onScopeDispose(() => removeScrollbarListener?.())

const scrollbarOptions = Object.freeze({
	overflow: {
		x: 'hidden',
		y: 'scroll',
	},
})
</script>

<template>
	<aside
		class="app-sidebar relative flex h-[calc(100vh-var(--top-bar-height))] w-[300px] shrink-0 flex-col overflow-visible border-0 border-l border-solid border-surface-4"
	>
		<div class="relative flex min-h-0 grow shrink flex-col">
			<div
				ref="scrollContainer"
				v-overlay-scrollbars="scrollbarOptions"
				class="relative min-h-0 grow shrink"
				data-overlayscrollbars-initialize
			>
				<div id="sidebar-teleport-target" class="contents"></div>
			</div>
			<div
				class="sidebar-scroll-fade pointer-events-none absolute inset-x-0 top-0 z-10 h-8 rotate-180 transition-opacity duration-200 motion-reduce:transition-none"
				:class="showTopFade ? 'opacity-100' : 'opacity-0'"
				aria-hidden="true"
			/>
			<div
				class="sidebar-scroll-fade pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 transition-opacity duration-200 motion-reduce:transition-none"
				:class="showBottomFade ? 'opacity-100' : 'opacity-0'"
				aria-hidden="true"
			/>
		</div>
	</aside>
</template>

<style scoped>
.app-sidebar {
	background: var(--surface-2);
	--color-button-bg: var(--surface-4);
	--color-divider: var(--surface-4);
	--color-divider-dark: var(--surface-5);
}

.sidebar-scroll-fade {
	background: var(--brand-gradient-fade-out-color);
}
</style>
