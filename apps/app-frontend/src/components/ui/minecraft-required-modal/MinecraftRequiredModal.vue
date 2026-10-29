<template>
	<OfflineAccountModal ref="offlineAccountModal" @added="onOfflineAccountAdded" />
	<NewModal ref="modal" :header="formatMessage(messages.header)" max-width="544px" no-padding>
		<div class="grid grid-cols-[1fr_auto] gap-2.5 h-[154px] px-7 pt-4 pb-1 pr-9">
			<div class="flex flex-col gap-2.5 items-start justify-center h-min mt-5">
				<div class="font-semibold text-xl text-contrast">
					{{ formatMessage(messages.descriptionHeader) }}
				</div>
				<div class="text-secondary leading-6">
					{{ formatMessage(messages.description) }}
				</div>
			</div>
			<div class="relative h-full w-[96px] overflow-hidden mx-3">
				<div class="absolute top-0 left-0 z-0 w-full flex grow-0 flex-col items-end p-0">
					<img :src="steveImage" alt="" class="self-stretch" />
				</div>
				<div
					class="absolute left-0 bottom-0 z-10 order-1 h-6 w-[120px] shrink-0 grow-0 bg-[linear-gradient(180deg,rgba(39,41,46,0)_0%,#27292E_80%,#27292E_100%)]"
				></div>
			</div>
		</div>

		<div class="flex flex-col gap-6 px-6 pb-6">
			<div class="grid grid-cols-2 gap-2">
				<Button type="colored" color="brand" @click="playOffline">
					<UserPlusIcon />
					{{ formatMessage(messages.playOffline) }}
				</Button>
				<Button :disabled="loadingSignIn" @click="signIn">
					<SpinnerIcon v-if="loadingSignIn" class="animate-spin" />
					<svg
						v-else
						width="20"
						height="20"
						viewBox="0 0 20 20"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<rect width="9.25" height="9.25" fill="#F25022" />
						<rect x="10.75" width="9.25" height="9.25" fill="#7FBA00" />
						<rect y="10.75" width="9.25" height="9.25" fill="#00A4EF" />
						<rect x="10.75" y="10.75" width="9.25" height="9.25" fill="#FFB900" />
					</svg>
					{{ formatMessage(messages.signIn) }}
				</Button>
			</div>
		</div>
	</NewModal>
</template>

<script setup lang="ts">
import { SpinnerIcon, UserPlusIcon } from '@modrinth/assets'
import { Button, defineMessages, NewModal, useVIntl } from '@modrinth/ui'
import { ref } from 'vue'

import steveImage from '@/assets/steve-look-up-left.webp'
import { handleSevereError } from '@/composables/use-error.js'
import { injectMinecraftAccounts } from '@/features/minecraft-accounts/context'
import OfflineAccountModal from '@/features/minecraft-accounts/offline-account-modal.vue'
import { login as loginFlow, set_default_user } from '@/helpers/auth.js'

const { formatMessage } = useVIntl()
const minecraftAccounts = injectMinecraftAccounts()

const messages = defineMessages({
	header: {
		id: 'minecraft-required.header',
		defaultMessage: 'Minecraft required',
	},
	descriptionHeader: {
		id: 'minecraft-required.description-header.lemine',
		defaultMessage: 'Добавьте аккаунт',
	},
	description: {
		id: 'minecraft-required.description.lemine',
		defaultMessage:
			'Играйте офлайн под любым ником или войдите в аккаунт Microsoft с купленной Minecraft.',
	},
	playOffline: {
		id: 'minecraft-required.play-offline',
		defaultMessage: 'Играть офлайн',
	},
	signIn: {
		id: 'minecraft-required.sign-in',
		defaultMessage: 'Sign in to Microsoft',
	},
})

const modal = ref<InstanceType<typeof NewModal>>()
const offlineAccountModal = ref<InstanceType<typeof OfflineAccountModal> | null>(null)
const loadingSignIn = ref(false)

function show() {
	modal.value?.show()
}

function playOffline(event: MouseEvent) {
	offlineAccountModal.value?.show(event)
}

async function onOfflineAccountAdded() {
	await minecraftAccounts.value?.refreshValues()
	modal.value?.hide()
}

async function signIn() {
	loadingSignIn.value = true

	try {
		const loggedIn = await loginFlow()
		if (!loggedIn) return

		await set_default_user(loggedIn.profile.id)
		await minecraftAccounts.value?.refreshValues()
		modal.value?.hide()
	} catch (error) {
		handleSevereError(error)
	} finally {
		loadingSignIn.value = false
	}
}

defineExpose({
	show,
})
</script>
