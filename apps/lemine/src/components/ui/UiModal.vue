<script lang="ts">
/** Shared by every modal: each newly opened one stacks above those already open. */
let nextLayer = 1000
const openStack: number[] = []
</script>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { onBeforeUnmount, ref, watch } from 'vue'

const open = defineModel<boolean>('open', { default: false })

withDefaults(
	defineProps<{
		title?: string
		width?: string
		/** Drops body padding so the content can run edge to edge, with a floating close button. */
		bare?: boolean
	}>(),
	{ width: '440px' },
)

const layer = ref(nextLayer)

function release() {
	const index = openStack.indexOf(layer.value)
	if (index !== -1) openStack.splice(index, 1)
	window.removeEventListener('keydown', onKey)
}

/** Escape closes only the modal on top, not every open one at once. */
function onKey(event: KeyboardEvent) {
	if (event.key === 'Escape' && openStack[openStack.length - 1] === layer.value) open.value = false
}

watch(
	open,
	(value) => {
		if (value) {
			layer.value = ++nextLayer
			openStack.push(layer.value)
			window.addEventListener('keydown', onKey)
		} else {
			release()
		}
	},
	{ immediate: true },
)
onBeforeUnmount(release)
</script>

<template>
	<Teleport to="body">
		<Transition name="ui-modal">
			<div v-if="open" class="ui-modal" :style="{ zIndex: layer }" @mousedown.self="open = false">
				<section class="ui-modal__panel" :style="{ width }" role="dialog" aria-modal="true">
					<header v-if="title" class="ui-modal__header">
						<h2 class="ui-modal__title">{{ title }}</h2>
						<button class="ui-modal__close" aria-label="Закрыть" @click="open = false">
							<X />
						</button>
					</header>
					<button
						v-if="!title"
						class="ui-modal__close ui-modal__close--floating"
						aria-label="Закрыть"
						@click="open = false"
					>
						<X />
					</button>
					<div class="ui-modal__body" :class="{ 'ui-modal__body--bare': bare }">
						<slot />
					</div>
					<footer v-if="$slots.footer" class="ui-modal__footer">
						<slot name="footer" />
					</footer>
				</section>
			</div>
		</Transition>
	</Teleport>
</template>

<style scoped>
.ui-modal {
	position: fixed;
	inset: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 24px;
	background: var(--overlay);
	backdrop-filter: blur(2px);
}

.ui-modal__panel {
	display: flex;
	flex-direction: column;
	max-width: 100%;
	max-height: calc(100vh - 48px);
	border-radius: var(--radius-xl);
	background: var(--surface-1);
	box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
	overflow: hidden;
}

.ui-modal__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 18px 20px 4px;
}

.ui-modal__title {
	font-size: 18px;
}

.ui-modal__close {
	display: flex;
	padding: 6px;
	border: 0;
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--text-3);
	cursor: pointer;
}

.ui-modal__close:hover {
	background: var(--surface-3);
	color: var(--text);
}

.ui-modal__close svg {
	width: 16px;
	height: 16px;
}

.ui-modal__panel {
	position: relative;
}

.ui-modal__close--floating {
	position: absolute;
	top: 14px;
	right: 14px;
	z-index: 2;
	background: rgba(0, 0, 0, 0.3);
	color: rgba(255, 255, 255, 0.8);
}

.ui-modal__body {
	padding: 16px 20px;
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: var(--surface-4) transparent;
}

.ui-modal__body.ui-modal__body--bare {
	padding: 0;
}

.ui-modal__footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding: 4px 20px 20px;
}

.ui-modal-enter-active {
	transition: opacity 0.22s var(--ease-out);
}

.ui-modal-leave-active {
	transition: opacity 0.16s var(--ease);
}

.ui-modal-enter-active .ui-modal__panel {
	transition:
		transform 0.34s var(--ease-spring),
		opacity 0.22s var(--ease-out);
}

.ui-modal-leave-active .ui-modal__panel {
	transition:
		transform 0.16s var(--ease),
		opacity 0.16s var(--ease);
}

.ui-modal-enter-from,
.ui-modal-leave-to {
	opacity: 0;
}

.ui-modal-enter-from .ui-modal__panel {
	opacity: 0;
	transform: translateY(14px) scale(0.95);
}

.ui-modal-leave-to .ui-modal__panel {
	opacity: 0;
	transform: translateY(6px) scale(0.98);
}
</style>
