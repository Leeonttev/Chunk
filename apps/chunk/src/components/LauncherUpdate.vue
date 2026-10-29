<script setup lang="ts">
import { computed } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { useUpdater } from '@/composables/updater'

const { available, dialogOpen, error, progress, stage, blocked, updateInstalling, installUpdate } =
	useUpdater()
const open = computed({
	get: () => dialogOpen.value,
	set: (value: boolean) => {
		if (!updateInstalling.value) dialogOpen.value = value
	},
})
</script>

<template>
	<UiModal v-model:open="open" title="Обновление Chunk" width="520px">
		<div class="update-body" aria-live="polite">
			<p>
				Доступна версия <strong>{{ available?.version }}</strong>
			</p>
			<p v-if="available?.body" class="notes selectable">{{ available.body }}</p>
			<p v-else>Новая версия лаунчера готова к установке.</p>
			<p>После обновления Chunk перезапустится. Ваши сборки и настройки сохранятся.</p>
			<p v-if="blocked">Сначала закройте игру и дождитесь завершения установки сборок.</p>
			<template v-if="updateInstalling">
				<p>
					{{
						stage === 'install'
							? 'Установка обновления…'
							: `Загрузка${progress === null ? '…' : `: ${progress}%`}`
					}}
				</p>
				<progress v-if="stage === 'download'" :value="progress ?? undefined" max="100" />
			</template>
			<p v-if="error" class="update-error">{{ error }}</p>
		</div>
		<template #footer>
			<UiButton variant="ghost" :disabled="updateInstalling" @click="open = false">Позже</UiButton>
			<UiButton variant="primary" :disabled="updateInstalling || blocked" @click="installUpdate">
				{{ updateInstalling ? 'Обновление…' : 'Обновить и перезапустить' }}
			</UiButton>
		</template>
	</UiModal>
</template>

<style scoped>
.update-body {
	display: grid;
	gap: 16px;
	line-height: 1.5;
}
.notes {
	white-space: pre-wrap;
	max-height: 220px;
	overflow-y: auto;
}
.update-error {
	color: var(--danger);
}
progress {
	width: 100%;
	accent-color: var(--accent);
}
</style>
