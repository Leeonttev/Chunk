<script setup lang="ts">
import { PlayIcon, PlusIcon } from '@modrinth/assets'
import {
	Button,
	ContextMenu,
	defineMessages,
	injectNotificationManager,
	useVIntl,
} from '@modrinth/ui'
import { useQuery } from '@tanstack/vue-query'
import dayjs from 'dayjs'
import { computed, inject, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

import HomeHero from '@/components/ui/library/home-hero.vue'
import HomeInstanceRow from '@/components/ui/library/home-instance-row.vue'
import { libraryScrollTop } from '@/components/ui/library/view-state'
import WelcomeScreen from '@/components/ui/WelcomeScreen.vue'
import { traceStartupStep } from '@/helpers/startup-debug'
import { instanceListQueryOptions } from '@/pages/instance/query-options'
import { injectOnboardingChecklist } from '@/providers/onboarding-checklist'
import { useRootBreadcrumb } from '@/shared/breadcrumbs'

defineOptions({
	name: 'LibraryPage',
})

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const { hasCreatedInstance, isReady } = injectOnboardingChecklist()
const showCreationModal = inject<() => void>('showCreationModal')
const pageOptions = ref<InstanceType<typeof ContextMenu>>()
onBeforeRouteLeave(() => {
	libraryScrollTop.value = document.querySelector('.app-viewport')?.scrollTop ?? 0
})

const messages = defineMessages({
	home: {
		id: 'app.navigation.home',
		defaultMessage: 'Home',
	},
	newInstance: {
		id: 'app.library.context-menu.create-instance',
		defaultMessage: 'New instance',
	},
	instances: {
		id: 'app.home.instances',
		defaultMessage: 'Сборки',
	},
	otherInstances: {
		id: 'app.home.other-instances',
		defaultMessage: 'Другие сборки',
	},
	libraryActionsLabel: {
		id: 'app.library.actions.label',
		defaultMessage: 'Library actions',
	},
})

useRootBreadcrumb({
	slot: 'root',
	id: 'home',
	label: formatMessage(messages.home),
	to: '/',
	visual: { type: 'icon', component: PlayIcon },
})

const instancesQuery = useQuery(instanceListQueryOptions())
const instances = computed(() => instancesQuery.data.value ?? [])
if (hasCreatedInstance.value) {
	await traceStartupStep('Load library instances', () => instancesQuery.suspense()).catch(
		handleError,
	)
}

const recentInstances = computed(() =>
	instances.value
		.slice()
		.sort((a, b) => dayjs(b.last_played ?? b.created).diff(dayjs(a.last_played ?? a.created))),
)
const heroInstance = computed(() => recentInstances.value[0])
const otherInstances = computed(() => recentInstances.value.slice(1))

function openPageContextMenu(event: MouseEvent) {
	if (
		!(event.target instanceof HTMLElement) ||
		!event.target.hasAttribute('data-library-page-background')
	) {
		return
	}

	event.preventDefault()
	event.stopPropagation()
	pageOptions.value?.open(event, [
		{
			id: 'new_instance',
			label: formatMessage(messages.newInstance),
			icon: PlusIcon,
			action: () => showCreationModal?.(),
		},
	])
}
</script>

<template>
	<WelcomeScreen v-if="isReady && !hasCreatedInstance" />
	<div
		v-else-if="isReady"
		data-library-page-background
		class="mx-auto flex w-full max-w-5xl flex-col gap-8 p-8"
		@contextmenu="openPageContextMenu"
	>
		<HomeHero v-if="heroInstance" :instance="heroInstance" />
		<section class="flex flex-col gap-2">
			<div class="flex items-center justify-between gap-4">
				<h2 class="m-0 text-sm font-semibold uppercase tracking-[0.14em] text-secondary">
					{{
						formatMessage(otherInstances.length > 0 ? messages.otherInstances : messages.instances)
					}}
				</h2>
				<Button type="quiet" @click="showCreationModal?.()">
					<PlusIcon />
					{{ formatMessage(messages.newInstance) }}
				</Button>
			</div>
			<div v-if="otherInstances.length > 0" class="flex flex-col">
				<HomeInstanceRow
					v-for="instance in otherInstances"
					:key="instance.id"
					:instance="instance"
				/>
			</div>
		</section>
		<ContextMenu ref="pageOptions" :label="formatMessage(messages.libraryActionsLabel)" />
	</div>
</template>
