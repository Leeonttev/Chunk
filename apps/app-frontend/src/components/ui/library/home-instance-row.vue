<script setup lang="ts">
import { PlayIcon, SpinnerIcon, StopCircleIcon } from '@modrinth/assets'
import {
	Avatar,
	defineMessages,
	formatLoaderLabel,
	IconButton,
	useRelativeTime,
	useVIntl,
} from '@modrinth/ui'
import { computed } from 'vue'

import { useImageThumbnail } from '@/composables/use-image-thumbnail'
import { useInstanceLaunch } from '@/composables/use-instance-launch'
import { getInstanceIconUrl } from '@/helpers/instance'
import type { GameInstance } from '@/helpers/types'

const props = defineProps<{
	instance: GameInstance
}>()

const { formatMessage } = useVIntl()
const formatRelativeTime = useRelativeTime()
const { playing, busy, play, stop } = useInstanceLaunch(() => props.instance)

const localIcon = computed(() => {
	const path = props.instance.icon_path
	return path && !/^https?:/.test(path) && !path.toLowerCase().endsWith('.svg') ? path : undefined
})
const thumbnail = useImageThumbnail(
	localIcon,
	() => 96,
	() => String(props.instance.modified),
)
const iconSrc = computed(() =>
	localIcon.value ? thumbnail.value : getInstanceIconUrl(props.instance.icon_path),
)

const messages = defineMessages({
	play: { id: 'app.home.hero.play', defaultMessage: 'Играть' },
	stop: { id: 'app.home.hero.stop', defaultMessage: 'Остановить' },
	neverPlayed: { id: 'app.home.hero.never-played', defaultMessage: 'ещё не запускалась' },
})
</script>

<template>
	<RouterLink
		:to="`/instance/${encodeURIComponent(instance.id)}`"
		class="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2"
	>
		<Avatar :src="iconSrc" :alt="instance.name" size="2.5rem" class="!rounded-md" />
		<div class="flex min-w-0 flex-1 flex-col">
			<span class="truncate text-sm font-semibold text-contrast">{{ instance.name }}</span>
			<span class="truncate text-xs text-secondary">
				{{ formatLoaderLabel(instance.loader) }} {{ instance.game_version }} ·
				{{
					instance.last_played
						? formatRelativeTime(instance.last_played)
						: formatMessage(messages.neverPlayed)
				}}
			</span>
		</div>
		<IconButton
			v-if="playing"
			type="quiet"
			color="red"
			:label="formatMessage(messages.stop)"
			@click.prevent.stop="stop"
		>
			<StopCircleIcon />
		</IconButton>
		<IconButton
			v-else
			type="quiet"
			:label="formatMessage(messages.play)"
			:disabled="busy || instance.quarantined"
			class="opacity-70 group-hover:opacity-100"
			@click.prevent.stop="play"
		>
			<SpinnerIcon v-if="busy" class="animate-spin" />
			<PlayIcon v-else />
		</IconButton>
	</RouterLink>
</template>
