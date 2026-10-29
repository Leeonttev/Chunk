<script setup lang="ts">
import mark from '@/assets/chunk-mark.svg'
withDefaults(defineProps<{ intro?: boolean; wordmark?: boolean }>(), {
	intro: false,
	wordmark: true,
})
</script>
<template>
	<span class="logo" :class="{ 'logo--intro': intro }">
		<img :src="mark" class="logo__mark" alt="" />
		<span v-if="wordmark" class="logo__word">Chunk</span>
	</span>
</template>
<style scoped>
.logo {
	display: inline-flex;
	align-items: center;
	gap: 0.5em;
	line-height: 1;
	color: var(--text);
}
.logo__mark {
	height: 1.65em;
	width: auto;
}
.logo__word {
	font-family: var(--font-heading);
	font-weight: 850;
	letter-spacing: -0.055em;
}
.logo--intro {
	animation: logo-rise 0.6s var(--ease) both;
}
@keyframes logo-rise {
	from {
		opacity: 0;
		transform: translateY(12px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
</style>
