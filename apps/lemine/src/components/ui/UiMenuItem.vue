<script setup lang="ts">
defineProps<{ active?: boolean; danger?: boolean; disabled?: boolean }>()
</script>

<template>
	<button
		type="button"
		class="ui-menu-item"
		:class="{ 'ui-menu-item--active': active, 'ui-menu-item--danger': danger }"
		:disabled="disabled"
	>
		<slot />
	</button>
</template>

<style scoped>
.ui-menu-item {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	min-height: 34px;
	padding: 6px 10px;
	border: 0;
	border-radius: var(--radius-md);
	background: transparent;
	color: var(--text-2);
	font-size: 13.5px;
	font-weight: 500;
	text-align: left;
	cursor: pointer;
}

.ui-menu-item:hover:not(:disabled) {
	background: var(--surface-4);
	color: var(--text);
}

.ui-menu-item--active {
	color: var(--text);
}

.ui-menu-item--danger:hover:not(:disabled) {
	background: var(--danger-soft);
	color: var(--danger);
}

.ui-menu-item:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}

.ui-menu-item :deep(svg) {
	flex-shrink: 0;
	width: 16px;
	height: 16px;
}
</style>
