<script setup lang="ts">
import { computed } from 'vue'

const model = defineModel<number>({ required: true })

const props = withDefaults(
	defineProps<{ min: number; max: number; step?: number; label: string; disabled?: boolean }>(),
	{
		step: 1,
	},
)

const fill = computed(() => {
	const span = props.max - props.min
	return span > 0
		? ((Math.min(Math.max(model.value, props.min), props.max) - props.min) / span) * 100
		: 0
})
</script>

<template>
	<input
		v-model.number="model"
		type="range"
		class="ui-slider"
		:min="min"
		:max="max"
		:step="step"
		:aria-label="label"
		:disabled="disabled"
		:style="{ '--fill': `${fill}%` }"
	/>
</template>

<style scoped>
.ui-slider {
	width: 100%;
	height: 22px;
	margin: 0;
	background: transparent;
	appearance: none;
	cursor: pointer;
}

.ui-slider::-webkit-slider-runnable-track {
	height: 8px;
	border-radius: 999px;
	background: linear-gradient(90deg, var(--accent) var(--fill), var(--surface-3) var(--fill));
}

.ui-slider::-webkit-slider-thumb {
	width: 20px;
	height: 20px;
	margin-top: -6px;
	border: 0;
	border-radius: 50%;
	background: #fff;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
	appearance: none;
	transition: transform 0.12s var(--ease);
}

.ui-slider:disabled {
	cursor: default;
}

.ui-slider:hover:not(:disabled)::-webkit-slider-thumb,
.ui-slider:active:not(:disabled)::-webkit-slider-thumb {
	transform: scale(1.12);
}
</style>
