<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { core } from '@/api/core'
import AddAccountModal from '@/components/AddAccountModal.vue'
import AppNavRail from '@/components/AppNavRail.vue'
import AppLogo from '@/components/AppLogo.vue'
import CreateInstanceModal from '@/components/CreateInstanceModal.vue'
import TitleBar from '@/components/TitleBar.vue'
import AutofixModal from '@/components/AutofixModal.vue'
import LauncherUpdate from '@/components/LauncherUpdate.vue'
import { useUpdater } from '@/composables/updater'
import UiToaster from '@/components/ui/UiToaster.vue'
import { startStore } from '@/composables/store'

const MIN_SPLASH_MS = 900

const ready = ref(false)
const failure = ref<string | null>(null)

onMounted(async () => {
	const startedAt = Date.now()
	await core.showWindow().catch(() => {})
	try {
		await core.initialize()
		await startStore()
		if (import.meta.env.PROD) void useUpdater().checkUpdates()
	} catch (error) {
		failure.value =
			error && typeof error === 'object' && 'message' in error
				? String((error as { message: unknown }).message)
				: String(error)
		return
	}
	const elapsed = Date.now() - startedAt
	setTimeout(() => (ready.value = true), Math.max(0, MIN_SPLASH_MS - elapsed))
})
</script>

<template>
	<Transition name="splash">
		<div v-if="!ready" class="splash" data-tauri-drag-region>
			<AppLogo intro class="splash__logo" />
			<p v-if="failure" class="splash__error selectable">
				Не удалось запустить ядро лаунчера:<br />{{ failure }}
			</p>
		</div>
	</Transition>
	<div v-if="ready" class="shell">
		<AppNavRail />
		<div class="shell__frame">
			<TitleBar />
			<main class="shell__main">
				<RouterView v-slot="{ Component }">
					<Transition name="page" mode="out-in">
						<component :is="Component" />
					</Transition>
				</RouterView>
			</main>
		</div>
		<CreateInstanceModal />
		<!-- Account creation stays above the instance creation dialog. -->
		<AddAccountModal />
		<AutofixModal />
		<LauncherUpdate />
	</div>
	<UiToaster />
</template>

<style scoped>
.shell {
	position: relative;
	display: flex;
	flex-direction: row;
	height: 100%;
	background: var(--bg);
}

.shell__frame {
	min-width: 0;
	position: relative;
	display: flex;
	flex: 1;
	flex-direction: column;
	min-height: 0;
	background: var(--bg);
	overflow: hidden;
	isolation: isolate;
}

.shell__main {
	position: relative;
	z-index: 1;
	flex: 1;
	min-height: 0;
	overflow: hidden;
}

.scene-enter-active,
.scene-leave-active {
	transition: opacity 0.3s var(--ease);
}

.scene-enter-from,
.scene-leave-to {
	opacity: 0;
}

.splash {
	position: fixed;
	inset: 0;
	z-index: 3000;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 24px;
	background: var(--bg);
}

.splash__logo {
	font-size: 52px;
}

.splash__error {
	max-width: 480px;
	color: var(--danger);
	text-align: center;
	font-size: 13px;
}

.splash-leave-active {
	transition: opacity 0.35s var(--ease);
}

.splash-leave-to {
	opacity: 0;
}

.page-enter-active {
	transition:
		opacity 0.26s var(--ease-out),
		translate 0.32s var(--ease-out);
}

.page-leave-active {
	transition:
		opacity 0.12s var(--ease),
		translate 0.12s var(--ease);
}

.page-enter-from {
	opacity: 0;
	translate: 0 12px;
}

.page-leave-to {
	opacity: 0;
	translate: 0 -6px;
}
</style>
