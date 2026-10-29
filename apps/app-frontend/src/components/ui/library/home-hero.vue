<script setup lang="ts">
import {
	BoxesIcon,
	FolderOpenIcon,
	PlayIcon,
	PlusIcon,
	SpinnerIcon,
	StopCircleIcon,
} from '@modrinth/assets'
import {
	Avatar,
	Button,
	defineMessages,
	formatLoaderLabel,
	useRelativeTime,
	useVIntl,
} from '@modrinth/ui'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { useImageThumbnail } from '@/composables/use-image-thumbnail'
import { useInstanceLaunch } from '@/composables/use-instance-launch'
import { getInstanceIconUrl } from '@/helpers/instance'
import type { GameInstance } from '@/helpers/types'
import { showInstanceInFolder } from '@/helpers/utils.js'

const props = defineProps<{
	instance: GameInstance
}>()

const router = useRouter()
const { formatMessage } = useVIntl()
const formatRelativeTime = useRelativeTime()
const { playing, busy, play, stop } = useInstanceLaunch(() => props.instance)

const localIcon = computed(() => {
	const path = props.instance.icon_path
	return path && !/^https?:/.test(path) && !path.toLowerCase().endsWith('.svg') ? path : undefined
})
const thumbnail = useImageThumbnail(
	localIcon,
	() => 384,
	() => String(props.instance.modified),
)
const iconSrc = computed(() =>
	localIcon.value ? thumbnail.value : getInstanceIconUrl(props.instance.icon_path),
)

const playtimeHours = computed(() => {
	const seconds = props.instance.submitted_time_played + props.instance.recent_time_played
	return Math.floor(seconds / 3600)
})

const meta = computed(() => {
	const parts = [
		`${formatLoaderLabel(props.instance.loader)} ${props.instance.game_version}`,
		props.instance.last_played
			? formatMessage(messages.lastPlayed, { time: formatRelativeTime(props.instance.last_played) })
			: formatMessage(messages.neverPlayed),
	]
	if (playtimeHours.value > 0) {
		parts.push(formatMessage(messages.playtime, { hours: playtimeHours.value }))
	}
	return parts
})

const instancePath = computed(() => `/instance/${encodeURIComponent(props.instance.id)}`)

function addContent() {
	void router.push({
		path: `/browse/${props.instance.loader === 'vanilla' ? 'resourcepack' : 'mod'}`,
		query: { i: props.instance.id },
	})
}

const messages = defineMessages({
	eyebrow: { id: 'app.home.hero.eyebrow', defaultMessage: 'Продолжить игру' },
	lastPlayed: { id: 'app.home.hero.last-played', defaultMessage: 'играли {time}' },
	neverPlayed: { id: 'app.home.hero.never-played', defaultMessage: 'ещё не запускалась' },
	playtime: {
		id: 'app.home.hero.playtime',
		defaultMessage: '{hours, plural, one {# час} few {# часа} other {# часов}} в игре',
	},
	play: { id: 'app.home.hero.play', defaultMessage: 'Играть' },
	stop: { id: 'app.home.hero.stop', defaultMessage: 'Остановить' },
	preparing: { id: 'app.home.hero.preparing', defaultMessage: 'Подготовка…' },
	content: { id: 'app.home.hero.content', defaultMessage: 'Контент' },
	addContent: { id: 'app.home.hero.add-content', defaultMessage: 'Добавить моды' },
	folder: { id: 'app.home.hero.folder', defaultMessage: 'Папка' },
})
</script>

<template>
	<section class="home-hero relative isolate overflow-hidden rounded-xl bg-surface-2">
		<img
			v-if="iconSrc"
			:src="iconSrc"
			alt=""
			aria-hidden="true"
			class="home-hero__backdrop pointer-events-none absolute -right-16 -top-24 -z-10 size-[28rem] object-cover"
		/>
		<div class="flex flex-col gap-8 p-8">
			<div class="flex items-center gap-6">
				<RouterLink :to="instancePath" class="shrink-0">
					<Avatar :src="iconSrc" :alt="instance.name" size="7rem" class="!rounded-xl" />
				</RouterLink>
				<div class="flex min-w-0 flex-col gap-2">
					<span class="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">
						{{ formatMessage(messages.eyebrow) }}
					</span>
					<RouterLink
						:to="instancePath"
						class="truncate text-4xl font-bold tracking-tight text-contrast hover:underline"
					>
						{{ instance.name }}
					</RouterLink>
					<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-secondary">
						<template v-for="(part, index) in meta" :key="part">
							<span v-if="index > 0" aria-hidden="true">·</span>
							<span>{{ part }}</span>
						</template>
					</div>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Button v-if="playing" type="colored" color="red" size="xl" class="min-w-44" @click="stop">
					<StopCircleIcon />
					{{ formatMessage(messages.stop) }}
				</Button>
				<Button
					v-else
					type="colored"
					color="brand"
					size="xl"
					class="min-w-44"
					:disabled="busy || instance.quarantined"
					@click="play"
				>
					<SpinnerIcon v-if="busy" class="animate-spin" />
					<PlayIcon v-else />
					{{ formatMessage(busy ? messages.preparing : messages.play) }}
				</Button>
				<Button size="lg" type="quiet" @click="router.push(instancePath)">
					<BoxesIcon />
					{{ formatMessage(messages.content) }}
				</Button>
				<Button size="lg" type="quiet" :disabled="instance.quarantined" @click="addContent">
					<PlusIcon />
					{{ formatMessage(messages.addContent) }}
				</Button>
				<Button size="lg" type="quiet" @click="showInstanceInFolder(instance.id)">
					<FolderOpenIcon />
					{{ formatMessage(messages.folder) }}
				</Button>
			</div>
		</div>
	</section>
</template>

<style scoped>
.home-hero {
	background-image: radial-gradient(
		ellipse at 85% 0%,
		rgba(139, 92, 246, 0.22) 0%,
		rgba(139, 92, 246, 0) 60%
	);
}

.home-hero__backdrop {
	filter: blur(72px) saturate(1.4);
	opacity: 0.35;
}
</style>
