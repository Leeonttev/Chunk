<script setup lang="ts">
import { Check, Info, TriangleAlert, X } from 'lucide-vue-next'

import { dismissToast, useToasts } from '@/composables/toasts'

const toasts = useToasts()

const KINDS = {
	success: { icon: Check, label: 'Готово!' },
	error: { icon: TriangleAlert, label: 'Ошибка' },
	info: { icon: Info, label: 'Внимание' },
}
</script>

<template>
	<div class="ui-toaster" aria-live="polite">
		<TransitionGroup name="ui-toast">
			<div
				v-for="toast in toasts"
				:key="toast.id"
				class="ui-toast"
				:class="`ui-toast--${toast.kind}`"
				role="status"
			>
				<span class="ui-toast__badge">
					<component :is="KINDS[toast.kind].icon" />
				</span>
				<div class="ui-toast__content">
					<span class="ui-toast__label">{{ KINDS[toast.kind].label }}</span>
					<strong class="ui-toast__title">{{ toast.title }}</strong>
					<p v-if="toast.text" class="ui-toast__text selectable">{{ toast.text }}</p>
				</div>
				<button class="ui-toast__close" aria-label="Закрыть" @click="dismissToast(toast.id)">
					<X />
				</button>
				<span
					class="ui-toast__timer"
					:style="{ animationDuration: `${toast.duration}ms` }"
					@animationend="dismissToast(toast.id)"
				/>
			</div>
		</TransitionGroup>
	</div>
</template>

<style scoped>
.ui-toaster {
	position: fixed;
	top: 76px;
	right: 18px;
	z-index: 45000;
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 10px;
	width: min(360px, calc(100vw - 36px));
	pointer-events: none;
}

.ui-toast {
	--tone: var(--accent);
	--tone-deep: #4b3a9a;
	position: relative;
	display: flex;
	align-items: center;
	gap: 14px;
	width: 100%;
	padding: 12px 10px 14px 12px;
	border-radius: 16px;
	background: var(--panel);
	backdrop-filter: blur(14px);
	overflow: hidden;
	pointer-events: auto;
}

.ui-toast--success {
	--tone: #5fd068;
	--tone-deep: #2c6b31;
}

.ui-toast--error {
	--tone: #ff6b6b;
	--tone-deep: #7d2a2a;
}

.ui-toast__badge {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 42px;
	height: 42px;
	flex-shrink: 0;
	border-radius: 11px;
	background: linear-gradient(180deg, var(--tone) 0%, var(--tone-deep) 100%);
	color: #fff;
	box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.25);
	animation: badge-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.ui-toast__badge svg {
	width: 20px;
	height: 20px;
	stroke-width: 2.8;
	filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.35));
}

.ui-toast__content {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	gap: 1px;
	overflow-wrap: anywhere;
}

.ui-toast__label {
	color: var(--tone);
	font-family: var(--font-pixel);
	font-size: 13px;
	font-weight: 700;
	letter-spacing: 0.02em;
}

.ui-toast__title {
	color: var(--text);
	font-size: 14px;
	font-weight: 700;
	line-height: 1.3;
}

.ui-toast__text {
	margin-top: 2px;
	color: var(--text-3);
	font-size: 12.5px;
	line-height: 1.4;
}

.ui-toast__close {
	display: flex;
	align-items: center;
	justify-content: center;
	align-self: flex-start;
	width: 26px;
	height: 26px;
	flex-shrink: 0;
	border: 0;
	border-radius: 8px;
	background: transparent;
	color: var(--text-3);
	cursor: pointer;
	opacity: 0;
	transition:
		opacity 0.14s var(--ease),
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.ui-toast:hover .ui-toast__close {
	opacity: 1;
}

.ui-toast__close:hover {
	background: rgba(255, 255, 255, 0.08);
	color: var(--text);
}

.ui-toast__close svg {
	width: 14px;
	height: 14px;
}

.ui-toast__timer {
	position: absolute;
	left: 12px;
	right: 12px;
	bottom: 6px;
	height: 2px;
	border-radius: 2px;
	background: var(--tone);
	opacity: 0.55;
	transform-origin: left;
	animation: drain linear forwards;
}

.ui-toast:hover .ui-toast__timer {
	animation-play-state: paused;
}

@keyframes drain {
	from {
		transform: scaleX(1);
	}
	to {
		transform: scaleX(0);
	}
}

@keyframes badge-pop {
	from {
		transform: scale(0.4) rotate(-12deg);
	}
	to {
		transform: scale(1) rotate(0);
	}
}

.ui-toast-enter-active {
	transition:
		opacity 0.22s var(--ease),
		transform 0.42s cubic-bezier(0.22, 1.2, 0.36, 1);
}

.ui-toast-leave-active {
	transition:
		opacity 0.2s var(--ease),
		transform 0.25s var(--ease);
}

.ui-toast-enter-from {
	opacity: 0;
	transform: translateX(110%);
}

.ui-toast-leave-to {
	opacity: 0;
	transform: translateX(40%);
}

.ui-toast-move {
	transition: transform 0.25s var(--ease);
}
</style>
