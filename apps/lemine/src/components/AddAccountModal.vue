<script setup lang="ts">
import { KeyRound, UserRound } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { core } from '@/api/core'
import { useStore } from '@/composables/store'
import { reportError } from '@/composables/toasts'
import { addAccountOpen } from '@/composables/ui-state'

import UiButton from './ui/UiButton.vue'
import UiInput from './ui/UiInput.vue'
import UiModal from './ui/UiModal.vue'

const NICKNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

const { refreshAccounts } = useStore()
const nickname = ref('')
const busy = ref(false)

const nicknameValid = computed(() => NICKNAME_PATTERN.test(nickname.value.trim()))
const nicknameInvalid = computed(() => nickname.value.length > 0 && !nicknameValid.value)

watch(addAccountOpen, (open) => {
	if (open) nickname.value = ''
})

async function addOffline() {
	if (!nicknameValid.value || busy.value) return
	busy.value = true
	try {
		await core.accounts.loginOffline(nickname.value.trim())
		await refreshAccounts()
		addAccountOpen.value = false
	} catch (error) {
		reportError(error, 'Не удалось добавить аккаунт')
	} finally {
		busy.value = false
	}
}

async function addMicrosoft() {
	busy.value = true
	try {
		const account = await core.accounts.loginMicrosoft()
		if (account) {
			await core.accounts.setActive(account.profile.id)
			await refreshAccounts()
			addAccountOpen.value = false
		}
	} catch (error) {
		reportError(error, 'Вход через Microsoft не удался')
	} finally {
		busy.value = false
	}
}
</script>

<template>
	<UiModal v-model:open="addAccountOpen" title="Новый аккаунт" width="420px">
		<div class="add-account">
			<form class="add-account__option" @submit.prevent="addOffline">
				<div class="add-account__heading">
					<UserRound />
					<div>
						<strong>Офлайн</strong>
						<p class="muted">Любой ник, без входа. Для одиночной игры и офлайн-серверов.</p>
					</div>
				</div>
				<UiInput
					v-model="nickname"
					placeholder="Ник, например Steve"
					:maxlength="16"
					:invalid="nicknameInvalid"
				/>
				<p v-if="nicknameInvalid" class="add-account__hint">
					3–16 символов: латинские буквы, цифры и «_»
				</p>
				<UiButton variant="primary" type="submit" block :disabled="!nicknameValid || busy">
					Добавить
				</UiButton>
			</form>
			<div class="add-account__or"><span>или</span></div>
			<div class="add-account__option">
				<div class="add-account__heading">
					<KeyRound />
					<div>
						<strong>Лицензия Microsoft</strong>
						<p class="muted">Свой скин и игра на серверах с проверкой лицензии.</p>
					</div>
				</div>
				<UiButton block :disabled="busy" @click="addMicrosoft">Войти через Microsoft</UiButton>
			</div>
		</div>
	</UiModal>
</template>

<style scoped>
.add-account {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.add-account__option {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.add-account__heading {
	display: flex;
	gap: 12px;
}

.add-account__heading svg {
	flex-shrink: 0;
	width: 20px;
	height: 20px;
	margin-top: 1px;
	color: var(--accent-text);
}

.add-account__heading p {
	font-size: 12.5px;
}

.add-account__hint {
	color: var(--danger);
	font-size: 12px;
}

.add-account__or {
	display: flex;
	align-items: center;
	gap: 10px;
	color: var(--text-3);
	font-size: 12px;
}

.add-account__or::before,
.add-account__or::after {
	content: '';
	flex: 1;
	height: 1px;
	background: var(--surface-3);
}
</style>
