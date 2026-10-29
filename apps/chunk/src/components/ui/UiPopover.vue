<script setup lang="ts">
import { onClickOutside, useEventListener } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'

const open = defineModel<boolean>('open', { default: false })

const props = withDefaults(
	defineProps<{
		placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
		/** CSS width of the panel; `100%` matches the trigger width. */
		width?: string
	}>(),
	{ placement: 'bottom-start', width: 'auto' },
)

const GAP = 6
const EDGE = 12
const MAX_HEIGHT = 360

const root = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const position = ref<Record<string, string>>({})

onClickOutside(root, () => (open.value = false), { ignore: [panel] })

/** Positions the panel against the viewport, flipping vertically when there is no room. */
function place() {
	if (!root.value) return
	const rect = root.value.getBoundingClientRect()
	const below = window.innerHeight - rect.bottom - GAP - EDGE
	const above = rect.top - GAP - EDGE
	const preferTop = props.placement.startsWith('top')
	const openUp = preferTop
		? above >= Math.min(MAX_HEIGHT, below)
		: below < Math.min(MAX_HEIGHT, 200) && above > below
	const style: Record<string, string> = {
		maxHeight: `${Math.min(MAX_HEIGHT, openUp ? above : below)}px`,
	}
	if (openUp) style.bottom = `${window.innerHeight - rect.top + GAP}px`
	else style.top = `${rect.bottom + GAP}px`
	if (props.placement.endsWith('end')) style.right = `${window.innerWidth - rect.right}px`
	else style.left = `${rect.left}px`
	style.width = props.width === '100%' ? `${rect.width}px` : props.width
	position.value = style
}

watch(open, async (value) => {
	if (!value) return
	place()
	await nextTick()
	place()
})

useEventListener(window, 'resize', () => open.value && place())
useEventListener(window, 'scroll', () => open.value && place(), { capture: true, passive: true })
</script>

<template>
	<div ref="root" class="ui-popover">
		<slot name="trigger" :open="open" :toggle="() => (open = !open)" />
		<Teleport to="body">
			<Transition name="ui-popover">
				<div v-if="open" ref="panel" class="ui-popover__panel" :style="position">
					<slot :close="() => (open = false)" />
				</div>
			</Transition>
		</Teleport>
	</div>
</template>

<style scoped>
.ui-popover {
	position: relative;
	display: inline-flex;
}

.ui-popover__panel {
	position: fixed;
	z-index: 40000;
	min-width: 200px;
	padding: 6px;
	border-radius: var(--radius-lg);
	background: var(--surface-2);
	box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: var(--surface-4) transparent;
}

.ui-popover-enter-active {
	transition:
		opacity 0.18s var(--ease-out),
		transform 0.24s var(--ease-spring);
}

.ui-popover-leave-active {
	transition:
		opacity 0.12s var(--ease),
		transform 0.12s var(--ease);
}

.ui-popover-enter-from,
.ui-popover-leave-to {
	opacity: 0;
	transform: translateY(-6px) scale(0.97);
}
</style>
