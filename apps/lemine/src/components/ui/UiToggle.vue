<script setup lang="ts">
const model = defineModel<boolean>({ default: false })

defineProps<{ label?: string }>()
</script>

<template>
	<button
		type="button"
		role="switch"
		class="ui-toggle"
		:class="{ 'ui-toggle--on': model }"
		:aria-checked="model"
		:aria-label="label"
		@click="model = !model"
	>
		<span class="ui-toggle__thumb" />
	</button>
</template>

<style scoped>
.ui-toggle {
	position: relative;
	flex-shrink: 0;
	width: 38px;
	height: 22px;
	padding: 0;
	border: 0;
	border-radius: 999px;
	background: var(--surface-4);
	cursor: pointer;
	transition: background-color 0.16s var(--ease);
}

.ui-toggle--on {
	background: var(--accent);
}

.ui-toggle__thumb {
	position: absolute;
	top: 3px;
	left: 3px;
	width: 16px;
	height: 16px;
	border-radius: 50%;
	background: #fff;
	transition: transform 0.16s var(--ease);
}

.ui-toggle--on .ui-toggle__thumb {
	transform: translateX(16px);
}
</style>
