<script setup lang="ts">
import { Boxes, Check, ChevronDown, Compass, Images, Plus, Settings, Shirt } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { type Account } from '@/api/core'
import { selectAccount, useStore } from '@/composables/store'
import { reportError } from '@/composables/toasts'
import { addAccountOpen } from '@/composables/ui-state'
import AccountAvatar from './AccountAvatar.vue'
import AppLogo from './AppLogo.vue'
import UiMenuItem from './ui/UiMenuItem.vue'
import UiPopover from './ui/UiPopover.vue'
const route = useRoute()
const { accounts, activeAccount } = useStore()
const pickerOpen = ref(false)
const links = [
	{
		to: '/instances',
		label: 'Библиотека',
		icon: Boxes,
		match: (path: string) => path.startsWith('/instance'),
	},
	{
		to: '/catalog',
		label: 'Каталог',
		icon: Compass,
		match: (path: string) => path.startsWith('/catalog'),
	},
	{
		to: '/screenshots',
		label: 'Скриншоты',
		icon: Images,
		match: (path: string) => path.startsWith('/screenshots'),
	},
]
async function pick(account: Account) {
	pickerOpen.value = false
	try {
		await selectAccount(account)
	} catch (error) {
		reportError(error, 'Не удалось выбрать аккаунт')
	}
}
</script>
<template>
	<aside class="sidebar">
		<RouterLink to="/instances" class="sidebar__brand" aria-label="Chunk — библиотека"
			><AppLogo
		/></RouterLink>
		<nav class="sidebar__nav" aria-label="Основная навигация">
			<RouterLink
				v-for="link in links"
				:key="link.to"
				:to="link.to"
				class="sidebar__button"
				:class="{ 'sidebar__button--active': link.match(route.path) }"
				:aria-current="link.match(route.path) ? 'page' : undefined"
			>
				<component :is="link.icon" /><span>{{ link.label }}</span>
			</RouterLink>
		</nav>
		<div class="sidebar__bottom">
			<RouterLink
				to="/wardrobe"
				class="sidebar__button"
				:class="{ 'sidebar__button--active': route.path === '/wardrobe' }"
			>
				<Shirt /><span>Гардероб</span>
			</RouterLink>
			<RouterLink
				to="/settings"
				class="sidebar__button"
				:class="{ 'sidebar__button--active': route.path === '/settings' }"
			>
				<Settings /><span>Настройки</span>
			</RouterLink>
			<UiPopover v-model:open="pickerOpen" placement="top-start" width="100%">
				<template #trigger="{ toggle }">
					<button class="sidebar__account" @click="toggle">
						<AccountAvatar :account="activeAccount" :size="36" />
						<span class="sidebar__identity"
							><strong>{{ activeAccount?.profile.name ?? 'Добавить аккаунт' }}</strong>
							<small>{{
								activeAccount
									? activeAccount.offline
										? 'Офлайн'
										: 'Microsoft'
									: 'Вход в Minecraft'
							}}</small></span
						>
						<ChevronDown class="sidebar__chevron" />
					</button>
				</template>
				<UiMenuItem
					v-for="account in accounts"
					:key="account.profile.id"
					:active="account.profile.id === activeAccount?.profile.id"
					@click="pick(account)"
				>
					<AccountAvatar :account="account" :size="28" /><span class="sidebar__name">{{
						account.profile.name
					}}</span>
					<Check v-if="account.profile.id === activeAccount?.profile.id" />
				</UiMenuItem>
				<UiMenuItem
					@click="
						() => {
							pickerOpen = false
							addAccountOpen = true
						}
					"
					><Plus />Добавить аккаунт</UiMenuItem
				>
			</UiPopover>
		</div>
	</aside>
</template>
<style scoped>
.sidebar {
	display: flex;
	flex-direction: column;
	width: var(--nav-rail-width);
	flex-shrink: 0;
	padding: 0 12px 14px;
	background: var(--chrome-bg);
}
.sidebar__brand {
	display: flex;
	align-items: center;
	flex-shrink: 0;
	height: 64px;
	padding: 0 14px;
	margin-bottom: 12px;
	font-size: 25px;
}
.sidebar__nav,
.sidebar__bottom {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.sidebar__bottom {
	margin-top: auto;
	padding-top: 24px;
}
.sidebar__button {
	position: relative;
	display: flex;
	align-items: center;
	gap: 12px;
	min-height: 46px;
	padding: 0 14px;
	border: 0;
	border-radius: 9px;
	background: transparent;
	color: var(--text-2);
	cursor: pointer;
	text-align: left;
	font-weight: 550;
	transition:
		background-color 0.16s var(--ease),
		color 0.16s var(--ease);
}

.sidebar__button::before {
	content: '';
	position: absolute;
	left: 0;
	top: 12px;
	bottom: 12px;
	width: 3px;
	border-radius: 3px;
	background: var(--accent);
	transform: scaleY(0);
	transition: transform 0.28s var(--ease-spring);
}

.sidebar__button svg {
	transition:
		color 0.16s var(--ease),
		transform 0.28s var(--ease-spring);
}

.sidebar__button:hover svg {
	transform: translateX(2px);
}
.sidebar__button:hover,
.sidebar__account:hover {
	background: var(--surface-2);
	color: var(--text);
}
.sidebar__button--active {
	background: var(--surface-2);
	color: var(--text);
}
.sidebar__button--active::before {
	transform: scaleY(1);
}
.sidebar__button--active svg {
	color: var(--accent);
}
.sidebar__button svg {
	width: 20px;
	height: 20px;
	flex-shrink: 0;
}
.sidebar__account {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	margin-top: 14px;
	padding: 12px 8px;
	border: 0;
	border-radius: 10px;
	background: transparent;
	text-align: left;
	cursor: pointer;
}
.sidebar__identity {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	gap: 3px;
}
.sidebar__identity strong,
.sidebar__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.sidebar__identity small {
	color: var(--text-3);
	font-size: 11px;
}
.sidebar__chevron {
	width: 14px;
	flex-shrink: 0;
}
</style>
