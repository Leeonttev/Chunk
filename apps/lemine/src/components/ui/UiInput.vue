<script setup lang="ts">
const model = defineModel<string>({ default: '' })

defineProps<{
	placeholder?: string
	invalid?: boolean
	maxlength?: number
}>()
</script>

<template>
	<label class="ui-input" :class="{ 'ui-input--invalid': invalid }">
		<span v-if="$slots.icon" class="ui-input__icon"><slot name="icon" /></span>
		<input
			v-model="model"
			class="ui-input__field"
			:placeholder="placeholder"
			:maxlength="maxlength"
			spellcheck="false"
			autocomplete="off"
			v-bind="$attrs"
		/>
		<slot name="trailing" />
	</label>
</template>

<style scoped>
.ui-input {
	display: flex;
	align-items: center;
	gap: 8px;
	height: 38px;
	padding: 0 12px;
	border-radius: var(--radius-md);
	background: var(--surface-2);
	box-shadow: inset 0 0 0 1px var(--border);
	transition:
		background-color 0.14s var(--ease),
		box-shadow 0.14s var(--ease);
	cursor: text;
}

.ui-input:hover {
	background: var(--surface-3);
}

.ui-input:focus-within {
	background: var(--surface-3);
}

.ui-input--invalid,
.ui-input--invalid:focus-within {
	box-shadow: inset 0 0 0 1px var(--danger);
}

.ui-input__icon {
	display: flex;
	color: var(--text-3);
}

.ui-input__icon :deep(svg) {
	width: 16px;
	height: 16px;
}

.ui-input__field {
	flex: 1;
	min-width: 0;
	height: 100%;
	border: 0;
	outline: 0;
	background: transparent;
	user-select: text;
}

.ui-input__field::placeholder {
	color: var(--text-3);
}
</style>
