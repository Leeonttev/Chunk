<template>
	<NewModal
		ref="modal"
		:header="formatMessage(messages.title)"
		width="min(28rem, calc(95vw - 10rem))"
	>
		<form class="flex flex-col gap-2" @submit.prevent="submit">
			<label for="offline-account-username" class="font-semibold text-contrast">
				{{ formatMessage(messages.usernameLabel) }}
			</label>
			<Input
				id="offline-account-username"
				v-model="username"
				:error="showError"
				maxlength="16"
				autocomplete="off"
				spellcheck="false"
				:placeholder="formatMessage(messages.usernamePlaceholder)"
				aria-describedby="offline-account-username-help"
			/>
			<p
				id="offline-account-username-help"
				class="m-0 text-sm"
				:class="showError ? 'text-red' : 'text-secondary'"
			>
				{{ formatMessage(messages.usernameHelp) }}
			</p>
		</form>
		<template #actions>
			<div class="flex justify-end gap-2">
				<Button @click="modal?.hide()">
					{{ formatMessage(messages.cancel) }}
				</Button>
				<Button type="colored" color="brand" :disabled="!isValid || submitting" @click="submit">
					<SpinnerIcon v-if="submitting" class="animate-spin" />
					<PlusIcon v-else />
					{{ formatMessage(messages.add) }}
				</Button>
			</div>
		</template>
	</NewModal>
</template>

<script setup lang="ts">
import { PlusIcon, SpinnerIcon } from '@modrinth/assets'
import {
	Button,
	defineMessages,
	injectNotificationManager,
	Input,
	NewModal,
	useVIntl,
} from '@modrinth/ui'
import { computed, ref } from 'vue'

import { offline_login } from '@/helpers/auth'

const OFFLINE_USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

const emit = defineEmits<{
	added: [account: { profile: { id: string; name: string } }]
}>()

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()

const modal = ref<InstanceType<typeof NewModal> | null>(null)
const username = ref('')
const submitting = ref(false)

const isValid = computed(() => OFFLINE_USERNAME_PATTERN.test(username.value.trim()))
const showError = computed(() => username.value.length > 0 && !isValid.value)

function show(event?: MouseEvent) {
	username.value = ''
	modal.value?.show(event)
}

async function submit() {
	if (!isValid.value || submitting.value) return

	submitting.value = true
	try {
		const account = await offline_login(username.value.trim())
		modal.value?.hide()
		emit('added', account)
	} catch (error) {
		handleError(error as Error)
	} finally {
		submitting.value = false
	}
}

defineExpose({ show })

const messages = defineMessages({
	title: {
		id: 'minecraft-account.offline.title',
		defaultMessage: 'Офлайн-аккаунт',
	},
	usernameLabel: {
		id: 'minecraft-account.offline.username-label',
		defaultMessage: 'Ник в игре',
	},
	usernamePlaceholder: {
		id: 'minecraft-account.offline.username-placeholder',
		defaultMessage: 'Steve',
	},
	usernameHelp: {
		id: 'minecraft-account.offline.username-help',
		defaultMessage: 'От 3 до 16 символов: латинские буквы, цифры и «_».',
	},
	cancel: {
		id: 'minecraft-account.offline.cancel',
		defaultMessage: 'Отмена',
	},
	add: {
		id: 'minecraft-account.offline.add',
		defaultMessage: 'Добавить',
	},
})
</script>
