<script setup lang="ts">
withDefaults(
	defineProps<{
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
		size?: 'sm' | 'md' | 'lg'
		disabled?: boolean
		block?: boolean
		type?: 'button' | 'submit'
	}>(),
	{ variant: 'secondary', size: 'md', disabled: false, block: false, type: 'button' },
)
</script>

<template>
	<button
		:type="type"
		class="ui-button"
		:class="[`ui-button--${variant}`, `ui-button--${size}`, { 'ui-button--block': block }]"
		:disabled="disabled"
	>
		<slot />
	</button>
</template>

<style scoped>
.ui-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	border: 0;
	border-radius: var(--radius-md);
	font-weight: 600;
	white-space: nowrap;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease),
		transform 0.14s var(--ease);
}

.ui-button:active:not(:disabled) {
	transform: translateY(1px);
}

.ui-button:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.ui-button :deep(svg) {
	flex-shrink: 0;
	width: 16px;
	height: 16px;
}

.ui-button--sm {
	height: 30px;
	padding: 0 10px;
	font-size: 13px;
}

.ui-button--md {
	height: 36px;
	padding: 0 14px;
	font-size: 13.5px;
}

.ui-button--lg {
	height: 46px;
	padding: 0 22px;
	font-size: 15px;
	border-radius: var(--radius-lg);
}

.ui-button--lg :deep(svg) {
	width: 18px;
	height: 18px;
}

.ui-button--block {
	width: 100%;
}

.ui-button--primary {
	font-family: var(--font-heading);
	font-weight: 700;
	background: var(--accent);
	color: var(--on-accent);
}

.ui-button--primary:hover:not(:disabled) {
	background: var(--accent-hover);
}

.ui-button--secondary {
	background: var(--surface-2);
	box-shadow: inset 0 0 0 1px var(--border);
	color: var(--text);
}

.ui-button--secondary:hover:not(:disabled) {
	background: var(--surface-3);
}

.ui-button--ghost {
	background: transparent;
	color: var(--text-2);
}

.ui-button--ghost:hover:not(:disabled) {
	background: var(--surface-3);
	color: var(--text);
}

.ui-button--danger {
	background: var(--danger-soft);
	color: var(--danger);
}

.ui-button--danger:hover:not(:disabled) {
	background: var(--danger);
	color: #fff;
}
</style>
