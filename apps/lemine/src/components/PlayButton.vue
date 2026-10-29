<script setup lang="ts">
import { Check, ChevronDown, LoaderCircle, Play, Plus, Square } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { type Account, core, type Instance } from '@/api/core'
import { launchInstance, selectAccount, stopInstance, useStore } from '@/composables/store'
import { reportError } from '@/composables/toasts'
import { addAccountOpen } from '@/composables/ui-state'

import AccountAvatar from './AccountAvatar.vue'
import UiMenuItem from './ui/UiMenuItem.vue'
import UiPopover from './ui/UiPopover.vue'

const props = defineProps<{
	instance: Instance
	/** Puts the account picker before the play button and drops its own background, for use inside a launch bar. */
	embedded?: boolean
	/** Uses the sidebar account and fits a library card. */
	compact?: boolean
}>()

const { accounts, activeAccount, running, runningAs, launching, installJobs } = useStore()
const pickerOpen = ref(false)

const isRunning = computed(() => running.has(props.instance.id))
const job = computed(() => installJobs.get(props.instance.id) ?? null)
const isInstalling = computed(() => !!job.value)
const needsInstall = computed(
	() =>
		!isInstalling.value &&
		props.instance.install_stage !== 'installed' &&
		props.instance.install_stage !== 'pack_installed',
)
const installPercent = computed(() => {
	const progress = job.value?.progress
	if (!progress || !progress.total) return null
	return Math.min(99, Math.floor((progress.current / progress.total) * 100))
})
const isLaunching = computed(() => launching.has(props.instance.id))
const shownAccount = computed(() =>
	isRunning.value ? (runningAs.get(props.instance.id) ?? activeAccount.value) : activeAccount.value,
)
const busy = computed(() => isInstalling.value || isLaunching.value)

const label = computed(() => {
	if (isRunning.value) return 'Остановить'
	if (isInstalling.value)
		return installPercent.value === null ? 'Установка…' : `Установка ${installPercent.value}%`
	if (isLaunching.value) return 'Запуск…'
	if (needsInstall.value) return 'Доустановить'
	return 'Играть'
})

function onMainClick() {
	if (isRunning.value) {
		void stopInstance(props.instance)
		return
	}
	if (needsInstall.value) {
		void core.instances
			.repair(props.instance)
			.catch((error) => reportError(error, 'Не удалось установить сборку'))
		return
	}
	if (!activeAccount.value) {
		addAccountOpen.value = true
		return
	}
	void launchInstance(props.instance, activeAccount.value)
}

function pick(account: Account) {
	pickerOpen.value = false
	void selectAccount(account)
}
</script>

<template>
	<div
		class="play"
		:class="{
			'play--running': isRunning,
			'play--embedded': embedded,
			'play--compact': compact,
		}"
	>
		<button class="play__main" :disabled="busy" @click="onMainClick">
			<LoaderCircle v-if="busy" class="spin" />
			<Square v-else-if="isRunning" />
			<Play v-else />
			<span>{{ label }}</span>
		</button>
		<UiPopover v-if="!compact" v-model:open="pickerOpen" placement="top-start" width="100%">
			<template #trigger="{ toggle }">
				<button
					class="play__account"
					:class="{ 'play__account--open': pickerOpen }"
					:disabled="isRunning"
					@click="toggle"
				>
					<AccountAvatar :account="shownAccount" :size="32" />
					<span class="play__account-text">
						<span class="play__account-name">
							{{ shownAccount?.profile.name ?? 'Добавить аккаунт' }}
						</span>
						<span v-if="shownAccount" class="play__account-kind">
							{{ isRunning ? 'играет сейчас' : shownAccount.offline ? 'офлайн' : 'Microsoft' }}
						</span>
					</span>
					<ChevronDown />
				</button>
			</template>
			<UiMenuItem
				v-for="account in accounts"
				:key="account.profile.id"
				:active="account.profile.id === activeAccount?.profile.id"
				@click="pick(account)"
			>
				<AccountAvatar :account="account" :size="32" />
				<span class="play__menu-account">
					<span>{{ account.profile.name }}</span>
					<span class="faint">{{ account.offline ? 'Офлайн' : 'Microsoft' }}</span>
				</span>
				<Check v-if="account.profile.id === activeAccount?.profile.id" class="play__check" />
			</UiMenuItem>
			<UiMenuItem
				@click="
					() => {
						pickerOpen = false
						addAccountOpen = true
					}
				"
			>
				<Plus />
				Добавить аккаунт
			</UiMenuItem>
		</UiPopover>
		<span v-if="$slots['after-account']" class="play__extra"><slot name="after-account" /></span>
	</div>
</template>

<style scoped>
.play.play--compact {
	height: 36px;
}
.play--compact .play__main {
	min-width: 110px;
	padding: 0 14px;
	font-size: 13px;
}
.play {
	display: inline-flex;
	align-items: stretch;
	gap: 8px;
	height: 52px;
}

.play--embedded {
	gap: 4px;
}

.play--embedded > .ui-popover {
	order: 1;
}

.play__extra {
	display: flex;
	align-items: center;
	order: 2;
}

.play--embedded .play__main {
	order: 3;
	margin-left: 6px;
}

.play--embedded .play__account {
	background: transparent;
}

.play--embedded .play__account:hover:not(:disabled) {
	background: var(--surface-3);
}

.play--embedded .play__account--open {
	background: var(--surface-3);
}

.play__main {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	min-width: 180px;
	padding: 0 30px;
	border: 0;
	border-radius: var(--radius-md);
	background: var(--accent);
	color: var(--on-accent);
	font-family: var(--font-heading);
	font-size: 16px;
	font-weight: 700;
	cursor: pointer;
	transition: background-color 0.16s var(--ease);
}

.play__main:hover:not(:disabled) {
	background: var(--accent-hover);
}

.play--running .play__main {
	color: var(--text);
	background: var(--surface-3);
}

.play__main svg {
	width: 18px;
	height: 18px;
	fill: currentColor;
}

.play__main .spin {
	fill: none;
}

.play__main:disabled {
	cursor: progress;
}

.play__account {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 200px;
	height: 100%;
	padding: 0 14px 0 10px;
	border: 0;
	border-radius: var(--radius-md);
	background: var(--surface-3);
	color: var(--text);
	text-align: left;
	cursor: pointer;
	transition: background-color 0.16s var(--ease);
}

.play__account:hover:not(:disabled) {
	background: var(--surface-4);
}

.play__account:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.play__account > svg {
	width: 16px;
	height: 16px;
	color: var(--text-3);
}

.play__account-text {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	line-height: 1.2;
}

.play__account-name {
	max-width: 140px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 14px;
	font-weight: 700;
}

.play__account-kind {
	color: var(--text-3);
	font-size: 11.5px;
}

.play__menu-account {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	line-height: 1.25;
}

.play__menu-account > span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.play__menu-account .faint {
	font-size: 11.5px;
}

.play__check {
	color: var(--accent);
}

.spin {
	animation: spin 0.9s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
