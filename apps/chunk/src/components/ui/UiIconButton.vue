<script setup lang="ts">
withDefaults(
	defineProps<{
		label: string
		size?: 'sm' | 'md'
		active?: boolean
		danger?: boolean
		disabled?: boolean
	}>(),
	{ size: 'md', active: false, danger: false, disabled: false },
)
</script>

<template>
	<button
		type="button"
		class="ui-icon-button"
		:class="[
			`ui-icon-button--${size}`,
			{ 'ui-icon-button--active': active, 'ui-icon-button--danger': danger },
		]"
		:aria-label="label"
		v-tip="label"
		:disabled="disabled"
	>
		<slot />
	</button>
</template>

<style scoped>
.ui-icon-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	border: 0;
	border-radius: var(--radius-md);
	background: transparent;
	color: var(--text-2);
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.ui-icon-button--md {
	width: 34px;
	height: 34px;
}

.ui-icon-button--sm {
	width: 28px;
	height: 28px;
	border-radius: var(--radius-sm);
}

.ui-icon-button :deep(svg) {
	width: 17px;
	height: 17px;
}

.ui-icon-button--sm :deep(svg) {
	width: 15px;
	height: 15px;
}

.ui-icon-button:hover:not(:disabled),
.ui-icon-button--active {
	background: var(--surface-3);
	color: var(--text);
}

.ui-icon-button--danger:hover:not(:disabled) {
	background: var(--danger-soft);
	color: var(--danger);
}

.ui-icon-button:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
</style>
