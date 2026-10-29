<script setup lang="ts" generic="T extends string">
const model = defineModel<T>({ required: true })

defineProps<{
	options: { value: T; label: string }[]
	/** Spreads the options evenly across the full width. */
	stretch?: boolean
}>()
</script>

<template>
	<div class="ui-segmented" :class="{ 'ui-segmented--stretch': stretch }" role="tablist">
		<button
			v-for="option in options"
			:key="option.value"
			type="button"
			role="tab"
			class="ui-segmented__item"
			:class="{ 'ui-segmented__item--active': model === option.value }"
			:aria-selected="model === option.value"
			@click="model = option.value"
		>
			{{ option.label }}
		</button>
	</div>
</template>

<style scoped>
.ui-segmented {
	display: inline-flex;
	gap: 2px;
	padding: 3px;
	border-radius: var(--radius-md);
	background: var(--surface-2);
	box-shadow: inset 0 0 0 1px var(--border);
}

.ui-segmented--stretch {
	display: flex;
}

.ui-segmented--stretch .ui-segmented__item {
	flex: 1;
}

.ui-segmented__item {
	height: 30px;
	padding: 0 14px;
	border: 0;
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--text-2);
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.ui-segmented__item:hover {
	color: var(--text);
}

.ui-segmented__item--active {
	background: var(--surface-3);
	color: var(--text);
}
</style>
