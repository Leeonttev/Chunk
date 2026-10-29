<script setup lang="ts">
import { ref, watchEffect } from 'vue'

import type { Account } from '@/api/core'
import { renderPlayerHead } from '@/composables/player-head'

const props = withDefaults(defineProps<{ account: Account | null; size?: number }>(), {
	size: 28,
})

const src = ref<string>()

watchEffect(async () => {
	const account = props.account
	if (!account || account.offline) {
		src.value = await renderPlayerHead().catch(() => undefined)
		return
	}
	src.value = `https://mc-heads.net/avatar/${account.profile.id}/${props.size * 2}`
})
</script>

<template>
	<img
		v-if="src"
		class="account-avatar"
		:src="src"
		alt=""
		:style="{ width: `${size}px`, height: `${size}px` }"
	/>
	<span v-else class="account-avatar" :style="{ width: `${size}px`, height: `${size}px` }" />
</template>

<style scoped>
.account-avatar {
	display: inline-block;
	flex-shrink: 0;
	border-radius: 6px;
	background: var(--surface-4);
	image-rendering: pixelated;
}
</style>
