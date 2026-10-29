<script setup lang="ts">
import { convertFileSrc } from '@tauri-apps/api/core'
import { computed, ref, watch } from 'vue'

import { gradient, ICON_BACKGROUNDS, ICON_SYMBOLS } from '@/composables/instance-icons'

const props = withDefaults(defineProps<{ path?: string | null; name: string; size?: number }>(), {
	path: null,
	size: 40,
})

const failed = ref(false)
watch(
	() => props.path,
	() => (failed.value = false),
)

const src = computed(() => {
	if (!props.path || failed.value) return null
	return /^https?:/.test(props.path) ? props.path : convertFileSrc(props.path)
})

/** A stable generated icon derived from the name, for instances that have none. */
const fallback = computed(() => {
	let hash = 7
	for (const char of props.name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
	const symbols = ICON_SYMBOLS.filter((entry) => entry.group !== 'loader')
	return {
		background: gradient(ICON_BACKGROUNDS[hash % ICON_BACKGROUNDS.length]),
		symbol: symbols[(hash >>> 8) % symbols.length].asset,
	}
})
</script>

<template>
	<span
		class="instance-icon"
		:style="{
			width: `${size}px`,
			height: `${size}px`,
			backgroundImage: src ? undefined : fallback.background,
		}"
	>
		<img v-if="src" :src="src" alt="" @error="failed = true" />
		<img v-else :src="fallback.symbol" alt="" />
	</span>
</template>

<style scoped>
.instance-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	border-radius: 22%;
	overflow: hidden;
}

.instance-icon img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	image-rendering: pixelated;
}
</style>
