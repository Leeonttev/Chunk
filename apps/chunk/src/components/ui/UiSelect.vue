<script setup lang="ts" generic="T extends string">
import { Check, ChevronDown } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import UiMenuItem from './UiMenuItem.vue'
import UiPopover from './UiPopover.vue'

const model = defineModel<T | null>({ default: null })

const props = defineProps<{
	options: { value: T; label: string; hint?: string }[]
	placeholder?: string
}>()

const open = ref(false)
const current = computed(() => props.options.find((option) => option.value === model.value))

function pick(value: T) {
	model.value = value
	open.value = false
}
</script>

<template>
	<UiPopover v-model:open="open" width="100%" class="ui-select">
		<template #trigger="{ toggle }">
			<button type="button" class="ui-select__trigger" :class="{ open }" @click="toggle">
				<span :class="{ faint: !current }">{{ current?.label ?? placeholder }}</span>
				<ChevronDown class="ui-select__chevron" />
			</button>
		</template>
		<UiMenuItem
			v-for="option in options"
			:key="option.value"
			:active="option.value === model"
			@click="pick(option.value)"
		>
			<span class="ui-select__label">{{ option.label }}</span>
			<span v-if="option.hint" class="faint ui-select__hint">{{ option.hint }}</span>
			<Check v-if="option.value === model" class="ui-select__check" />
		</UiMenuItem>
	</UiPopover>
</template>

<style scoped>
.ui-select {
	width: 100%;
}

.ui-select__trigger {
	display: flex;
	align-items: center;
	justify-content: space-between;
	width: 100%;
	height: 38px;
	padding: 0 12px;
	border: 0;
	border-radius: var(--radius-md);
	background: var(--surface-2);
	box-shadow: inset 0 0 0 1px var(--border);
	text-align: left;
	cursor: pointer;
}

.ui-select__trigger:hover,
.ui-select__trigger.open {
	background: var(--surface-3);
}

.ui-select__chevron {
	width: 16px;
	height: 16px;
	color: var(--text-3);
}

.ui-select__label {
	flex: 1;
}

.ui-select__hint {
	font-size: 12px;
}

.ui-select__check {
	color: var(--accent);
}
</style>
