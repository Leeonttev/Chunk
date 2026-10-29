<script setup lang="ts">
import { CompassIcon, HomeIcon, ImageIcon, SettingsIcon, ShirtIcon } from '@modrinth/assets'
import { defineMessages, useVIntl } from '@modrinth/ui'
import type { Component } from 'vue'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import LeMineLogo from '@/components/ui/LeMineLogo.vue'
import AccountsCard from '@/features/minecraft-accounts/accounts-card.vue'
import type { MinecraftAccountsActions } from '@/features/minecraft-accounts/context'
import { injectSettingsActions } from '@/features/settings/settings-actions'

const props = defineProps<{
	showScreenshots: boolean
}>()

const route = useRoute()
const settingsActions = injectSettingsActions()
const { formatMessage } = useVIntl()

const accounts = ref<InstanceType<typeof AccountsCard> | null>(null)

const minecraftAccounts = computed<MinecraftAccountsActions | null>(() => {
	const card = accounts.value
	if (!card) return null
	return {
		loginDisabled: card.loginDisabled,
		refreshValues: card.refreshValues,
		setEquippedSkin: card.setEquippedSkin,
		setLoginDisabled: card.setLoginDisabled,
		login: card.login,
	}
})

defineExpose({ minecraftAccounts })

type RailItem = { label: string; to: string; icon: Component; active: boolean }

const items = computed<RailItem[]>(() => {
	const list: RailItem[] = [
		{
			label: formatMessage(messages.home),
			to: '/',
			icon: HomeIcon,
			active: route.path === '/' || route.path.startsWith('/instance'),
		},
		{
			label: formatMessage(messages.catalog),
			to: '/browse/mod',
			icon: CompassIcon,
			active: ['/browse', '/project', '/user'].some((path) => route.path.startsWith(path)),
		},
		{
			label: formatMessage(messages.skins),
			to: '/skins',
			icon: ShirtIcon,
			active: route.path.startsWith('/skins'),
		},
	]
	if (props.showScreenshots) {
		list.push({
			label: formatMessage(messages.screenshots),
			to: '/screenshots',
			icon: ImageIcon,
			active: route.path.startsWith('/screenshots'),
		})
	}
	return list
})

const messages = defineMessages({
	home: { id: 'app.rail.home', defaultMessage: 'Главная' },
	catalog: { id: 'app.rail.catalog', defaultMessage: 'Каталог' },
	skins: { id: 'app.rail.skins', defaultMessage: 'Скины' },
	screenshots: { id: 'app.rail.screenshots', defaultMessage: 'Скрины' },
	settings: { id: 'app.rail.settings', defaultMessage: 'Настройки' },
})
</script>

<template>
	<nav class="nav-rail flex h-full flex-col items-center bg-bg-raised pb-3 [grid-area:nav]">
		<div
			data-tauri-drag-region
			class="flex h-[--top-bar-height] w-full shrink-0 items-center justify-center"
		>
			<RouterLink to="/" aria-label="LeMine" class="flex">
				<LeMineLogo :wordmark="false" class="text-[1.375rem]" />
			</RouterLink>
		</div>
		<div class="mt-2 flex w-full flex-col items-center gap-1">
			<RouterLink
				v-for="item in items"
				:key="item.to"
				:to="item.to"
				class="rail-item"
				:class="{ 'rail-item--active': item.active }"
			>
				<span class="rail-item__icon">
					<component :is="item.icon" />
				</span>
				<span class="rail-item__label">{{ item.label }}</span>
			</RouterLink>
		</div>
		<div class="mt-auto flex flex-col items-center gap-1">
			<button class="rail-item" @click="settingsActions.openSettings()">
				<span class="rail-item__icon">
					<SettingsIcon />
				</span>
				<span class="rail-item__label">{{ formatMessage(messages.settings) }}</span>
			</button>
			<Suspense>
				<AccountsCard ref="accounts" compact />
			</Suspense>
		</div>
	</nav>
</template>

<style scoped>
.nav-rail {
	width: var(--left-bar-width);
}

.rail-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	width: 100%;
	padding: 0.25rem 0;
	border: 0;
	background: transparent;
	color: var(--color-secondary);
	cursor: pointer;
	transition: color 0.12s ease;
}

.rail-item__icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 2.75rem;
	height: 2rem;
	border-radius: 0.5rem;
	transition: background-color 0.12s ease;
}

.rail-item__icon svg {
	width: 1.25rem;
	height: 1.25rem;
}

.rail-item__label {
	font-size: 0.6875rem;
	font-weight: 600;
	line-height: 1;
}

.rail-item:hover {
	color: var(--color-contrast);
}

.rail-item:hover .rail-item__icon {
	background: var(--surface-3);
}

.rail-item--active {
	color: var(--color-contrast);
}

.rail-item--active .rail-item__icon,
.rail-item--active:hover .rail-item__icon {
	background: var(--surface-4);
}
</style>
