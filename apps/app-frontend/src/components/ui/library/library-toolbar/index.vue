<script setup lang="ts">
import { PlusIcon } from '@modrinth/assets'
import { Button, defineMessages, useVIntl } from '@modrinth/ui'
import { inject } from 'vue'

const showCreationModal = inject<() => void>('showCreationModal')
const { formatMessage } = useVIntl()
const messages = defineMessages({
	library: { id: 'app.library.title', defaultMessage: 'Library' },
	newInstance: { id: 'app.library.instance.new', defaultMessage: 'New instance' },
})
</script>

<template>
	<div class="flex items-center justify-between gap-4">
		<h2 class="m-0 text-2xl font-semibold tracking-tight text-contrast">
			{{ formatMessage(messages.library) }}
		</h2>
		<Button type="colored" color="brand" @click="showCreationModal?.()">
			<PlusIcon />
			{{ formatMessage(messages.newInstance) }}
		</Button>
	</div>
</template>
