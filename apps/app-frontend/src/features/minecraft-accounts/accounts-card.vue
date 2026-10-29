<template>
	<OfflineAccountModal ref="offlineAccountModal" @added="setAccount" />
	<div ref="root" class="relative">
		<button
			v-if="compact"
			v-tooltip.right="selectedAccount?.profile.name ?? formatMessage(messages.addAccount)"
			class="flex size-11 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent transition-colors hover:bg-surface-4"
			:class="{ 'bg-surface-4': open }"
			:aria-expanded="open"
			:aria-label="formatMessage(messages.accountMenu)"
			@click="open = !open"
		>
			<Avatar v-if="selectedAccount" size="28px" :src="avatarUrl" />
			<UserPlusIcon v-else class="size-5 text-brand" />
		</button>
		<button
			v-else
			class="flex h-8 max-w-48 cursor-pointer items-center gap-2 rounded-lg border-0 bg-transparent pl-1 pr-2 text-contrast transition-colors hover:bg-surface-4"
			:class="{ 'bg-surface-4': open }"
			:aria-expanded="open"
			:aria-label="formatMessage(messages.accountMenu)"
			@click="open = !open"
		>
			<Avatar v-if="selectedAccount" size="24px" :src="avatarUrl" />
			<UserPlusIcon v-else class="size-5 text-brand" />
			<span class="truncate text-sm font-semibold">
				{{ selectedAccount ? selectedAccount.profile.name : formatMessage(messages.addAccount) }}
			</span>
			<ChevronDownIcon
				class="size-4 shrink-0 text-secondary transition-transform"
				:class="{ 'rotate-180': open }"
			/>
		</button>
		<Transition name="account-menu">
			<div
				v-if="open"
				class="absolute z-50 flex w-72 flex-col gap-1 rounded-xl bg-surface-3 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
				:class="compact ? 'bottom-0 left-full ml-2' : 'right-0 top-full mt-2'"
			>
				<p class="m-0 px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-secondary">
					{{ formatMessage(messages.accounts) }}
				</p>
				<p v-if="accounts.length === 0" class="m-0 px-2 pb-2 text-sm text-secondary">
					{{ formatMessage(messages.notSignedIn) }}
				</p>
				<div
					v-for="account in accounts"
					:key="account.profile.id"
					class="group flex items-center gap-1 rounded-lg hover:bg-surface-4"
				>
					<button
						class="flex min-w-0 flex-grow cursor-pointer items-center gap-2 border-0 bg-transparent p-2 text-left"
						@click="setAccount(account)"
					>
						<Avatar :src="getAccountAvatarUrl(account)" size="28px" />
						<span class="flex min-w-0 flex-col">
							<span
								class="truncate text-sm"
								:class="isSelected(account) ? 'font-semibold text-contrast' : 'text-primary'"
							>
								{{ account.profile.name }}
							</span>
							<span class="text-xs text-secondary">
								{{
									formatMessage(
										account.offline ? messages.offlineAccount : messages.microsoftAccount,
									)
								}}
							</span>
						</span>
						<CheckIcon v-if="isSelected(account)" class="ml-auto size-4 shrink-0 text-brand" />
					</button>
					<IconButton
						v-tooltip="formatMessage(messages.removeAccount)"
						type="quiet"
						color="red"
						:label="formatMessage(messages.removeAccount)"
						class="mr-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
						@click="logout(account.profile.id)"
					>
						<TrashIcon />
					</IconButton>
				</div>
				<div class="my-1 h-px bg-surface-5" />
				<button class="account-menu-action" @click="addOfflineAccount($event)">
					<UserPlusIcon />
					{{ formatMessage(messages.addOfflineAccount) }}
				</button>
				<button class="account-menu-action" :disabled="loginDisabled" @click="login()">
					<SpinnerIcon v-if="loginDisabled" class="animate-spin" />
					<LogInIcon v-else />
					{{ formatMessage(messages.addMicrosoftAccount) }}
				</button>
			</div>
		</Transition>
	</div>
</template>

<script setup lang="ts">
import {
	CheckIcon,
	ChevronDownIcon,
	LogInIcon,
	SpinnerIcon,
	TrashIcon,
	UserPlusIcon,
} from '@modrinth/assets'
import {
	Avatar,
	defineMessages,
	IconButton,
	injectNotificationManager,
	useVIntl,
} from '@modrinth/ui'
import { onClickOutside } from '@vueuse/core'
import type { Ref } from 'vue'
import { computed, onUnmounted, ref } from 'vue'

import steveSkinUrl from '@/assets/skins/steve.png'
import { useAppEvent } from '@/composables/use-app-event'
import { handleSevereError } from '@/composables/use-error.js'
import {
	get_default_user,
	login as login_flow,
	remove_user,
	set_default_user,
	users,
} from '@/helpers/auth'
import { generatePlayerHeadBlob, getPlayerHeadUrl } from '@/helpers/rendering/player-head'
import type { Skin } from '@/helpers/skins'
import { get_available_skins } from '@/helpers/skins'

import OfflineAccountModal from './offline-account-modal.vue'

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()

withDefaults(
	defineProps<{
		/** Shows only the avatar and opens the menu to the right, for the navigation rail. */
		compact?: boolean
	}>(),
	{ compact: false },
)

const emit = defineEmits<{
	change: []
}>()

type MinecraftCredential = {
	profile: {
		id: string
		name: string
	}
	offline?: boolean
}

const root = ref<HTMLElement | null>(null)
const open = ref(false)
const accounts: Ref<MinecraftCredential[]> = ref([])
const loginDisabled = ref(false)
const defaultUser = ref<string | undefined>()
const equippedSkin = ref<Skin | null>(null)
const equippedHeadUrl = ref<string>()
const steveHeadUrl = ref<string>()
const offlineAccountModal = ref<InstanceType<typeof OfflineAccountModal> | null>(null)
let headRequest = 0

onClickOutside(root, () => (open.value = false))

generatePlayerHeadBlob(steveSkinUrl, 64)
	.then((blob) => (steveHeadUrl.value = URL.createObjectURL(blob)))
	.catch((error) => console.warn('Failed to render the default player head:', error))

async function updateHeadUrl(skin: Skin | null) {
	const request = ++headRequest
	if (equippedHeadUrl.value) URL.revokeObjectURL(equippedHeadUrl.value)
	equippedHeadUrl.value = undefined
	if (!skin) return
	const url = await getPlayerHeadUrl(skin)
	if (request !== headRequest) URL.revokeObjectURL(url)
	else equippedHeadUrl.value = url
}

onUnmounted(() => {
	headRequest++
	if (equippedHeadUrl.value) URL.revokeObjectURL(equippedHeadUrl.value)
	if (steveHeadUrl.value) URL.revokeObjectURL(steveHeadUrl.value)
})

async function refreshValues() {
	defaultUser.value = await get_default_user().catch(handleError)
	const userList = await users().catch(handleError)
	accounts.value = Array.isArray(userList) ? [...userList] : []
	accounts.value.sort((a, b) => (a.profile?.name ?? '').localeCompare(b.profile?.name ?? ''))

	const active = accounts.value.find((account) => account.profile.id === defaultUser.value)
	if (!active || active.offline) {
		equippedSkin.value = null
		void updateHeadUrl(null)
		return
	}

	try {
		const skins = await get_available_skins()
		equippedSkin.value = skins.find((skin) => skin.is_equipped) ?? null

		await updateHeadUrl(equippedSkin.value)
	} catch {
		equippedSkin.value = null
		void updateHeadUrl(null)
	}
}

async function setEquippedSkin(skin: Skin) {
	equippedSkin.value = skin

	try {
		await updateHeadUrl(skin)
	} catch (error) {
		console.warn('Failed to get head render for equipped skin:', error)
	}
}

function setLoginDisabled(value: boolean) {
	loginDisabled.value = value
}

defineExpose({
	refreshValues,
	setEquippedSkin,
	setLoginDisabled,
	login,
	loginDisabled,
})

await refreshValues()

const selectedAccount = computed(() =>
	accounts.value.find((account) => account.profile.id === defaultUser.value),
)

function isSelected(account: MinecraftCredential) {
	return selectedAccount.value?.profile.id === account.profile.id
}

const avatarUrl = computed(() => {
	if (!selectedAccount.value || selectedAccount.value.offline) {
		return steveHeadUrl.value
	}
	if (equippedSkin.value?.texture_key) {
		const cachedUrl = equippedHeadUrl.value
		if (cachedUrl) {
			return cachedUrl
		}
		return `https://mc-heads.net/avatar/${equippedSkin.value.texture_key}/128`
	}
	return `https://mc-heads.net/avatar/${selectedAccount.value.profile.id}/128`
})

function getAccountAvatarUrl(account: MinecraftCredential) {
	if (account.offline) {
		return steveHeadUrl.value
	}
	if (isSelected(account) && equippedHeadUrl.value) {
		return equippedHeadUrl.value
	}
	return `https://mc-heads.net/avatar/${account.profile.id}/128`
}

async function setAccount(account: MinecraftCredential) {
	defaultUser.value = account.profile.id
	await set_default_user(account.profile.id).catch(handleError)
	await refreshValues()
	emit('change')
}

function addOfflineAccount(event?: MouseEvent) {
	open.value = false
	offlineAccountModal.value?.show(event)
}

async function login() {
	open.value = false
	loginDisabled.value = true
	const loggedIn = await login_flow().catch(handleSevereError)

	if (loggedIn) {
		await setAccount(loggedIn)
	}

	loginDisabled.value = false
}

async function logout(id: string) {
	await remove_user(id).catch(handleError)
	await refreshValues()
	if (!selectedAccount.value && accounts.value.length > 0) {
		await setAccount(accounts.value[0])
	} else {
		emit('change')
	}
}

useAppEvent('process', async (e) => {
	if (e.event === 'launched') {
		await refreshValues()
	}
})

const messages = defineMessages({
	accountMenu: {
		id: 'minecraft-account.menu',
		defaultMessage: 'Аккаунт Minecraft',
	},
	accounts: {
		id: 'minecraft-account.menu.heading',
		defaultMessage: 'Аккаунты',
	},
	notSignedIn: {
		id: 'minecraft-account.no-account',
		defaultMessage: 'Добавьте аккаунт, чтобы играть',
	},
	addAccount: {
		id: 'minecraft-account.add-account.short',
		defaultMessage: 'Добавить аккаунт',
	},
	addOfflineAccount: {
		id: 'minecraft-account.add-offline-account',
		defaultMessage: 'Добавить офлайн-аккаунт',
	},
	addMicrosoftAccount: {
		id: 'minecraft-account.add-microsoft-account',
		defaultMessage: 'Добавить аккаунт Microsoft',
	},
	removeAccount: {
		id: 'minecraft-account.remove-account',
		defaultMessage: 'Remove account',
	},
	microsoftAccount: {
		id: 'minecraft-account.microsoft-label',
		defaultMessage: 'Microsoft',
	},
	offlineAccount: {
		id: 'minecraft-account.offline-label',
		defaultMessage: 'Офлайн-аккаунт',
	},
})
</script>

<style lang="scss" scoped>
.account-menu-action {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem;
	border: 0;
	border-radius: var(--radius-lg);
	background: transparent;
	color: var(--color-base);
	font-size: 0.875rem;
	font-weight: 500;
	text-align: left;
	cursor: pointer;

	&:hover:not(:disabled) {
		background: var(--surface-4);
		color: var(--color-contrast);
	}

	&:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	svg {
		width: 1.125rem;
		height: 1.125rem;
		color: var(--color-secondary);
	}
}

.account-menu-enter-active,
.account-menu-leave-active {
	transition:
		opacity 0.12s ease,
		transform 0.12s ease;
}

.account-menu-enter-from,
.account-menu-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}
</style>
