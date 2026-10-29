<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import dayjs from 'dayjs'
import {
	Camera,
	ChevronLeft,
	ChevronRight,
	Expand,
	FolderOpen,
	Image as ImageIcon,
	Trash2,
	X,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'

import { core, type Screenshot } from '@/api/core'
import { onAppEvent } from '@/api/events'
import InstanceIcon from '@/components/InstanceIcon.vue'
import { useStore } from '@/composables/store'
import { pushToast, reportError } from '@/composables/toasts'

const { instances } = useStore()

const screenshots = ref<Screenshot[]>([])
const thumbnails = ref<Record<string, string>>({})
const loading = ref(true)
const instanceFilter = ref<string | null>(null)
const viewingId = ref<string | null>(null)
const fullImage = ref<string | null>(null)
const imageAspect = ref(16 / 9)
const confirmDelete = ref(false)
let queue: Promise<void> = Promise.resolve()

function plural(count: number, forms: [string, string, string]) {
	const tens = count % 100
	const ones = count % 10
	if (tens >= 11 && tens <= 14) return forms[2]
	if (ones === 1) return forms[0]
	if (ones >= 2 && ones <= 4) return forms[1]
	return forms[2]
}

const sorted = computed(() => [...screenshots.value].sort((a, b) => b.modified_at - a.modified_at))

/** One chip per instance that has screenshots, most recently used first. */
const sources = computed(() => {
	const map = new Map<string, { id: string; name: string; count: number }>()
	for (const shot of sorted.value) {
		const entry = map.get(shot.instance_id)
		if (entry) entry.count++
		else map.set(shot.instance_id, { id: shot.instance_id, name: shot.instance_name, count: 1 })
	}
	return [...map.values()]
})

const visible = computed(() =>
	sorted.value.filter((shot) => !instanceFilter.value || shot.instance_id === instanceFilter.value),
)

const latest = computed(() => visible.value[0] ?? null)

/** Remaining screenshots grouped by day, newest day first. */
const days = computed(() => {
	const groups: { key: string; label: string; shots: Screenshot[] }[] = []
	for (const shot of visible.value.slice(1)) {
		const day = dayjs(shot.modified_at)
		const key = day.format('YYYY-MM-DD')
		let group = groups[groups.length - 1]
		if (group?.key !== key) {
			group = { key, label: dayLabel(day), shots: [] }
			groups.push(group)
		}
		group.shots.push(shot)
	}
	return groups
})

const viewingIndex = computed(() => visible.value.findIndex((shot) => shot.id === viewingId.value))
const viewing = computed(() => visible.value[viewingIndex.value] ?? null)

function dayLabel(day: dayjs.Dayjs) {
	if (day.isSame(dayjs(), 'day')) return 'Сегодня'
	if (day.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Вчера'
	return day.format(day.isSame(dayjs(), 'year') ? 'D MMMM' : 'D MMMM YYYY')
}

function iconOf(instanceId: string) {
	return instances.value.find((instance) => instance.id === instanceId)?.icon_path ?? null
}

function requestThumbnail(shot: Screenshot) {
	if (thumbnails.value[shot.id]) return
	queue = queue.then(async () => {
		const url = await core.screenshots.thumbnail(shot.path, 720).catch(() => null)
		if (url) thumbnails.value = { ...thumbnails.value, [shot.id]: url }
	})
}

async function load() {
	try {
		screenshots.value = await core.screenshots.list()
		sorted.value.forEach(requestThumbnail)
	} catch (error) {
		reportError(error, 'Не удалось загрузить скриншоты')
	} finally {
		loading.value = false
	}
}

onMounted(load)
onAppEvent('instance', (payload) => {
	if (payload.event === 'screenshots_updated') void load()
})

watch(sources, (list) => {
	if (instanceFilter.value && !list.some((entry) => entry.id === instanceFilter.value))
		instanceFilter.value = null
})

watch(viewing, (shot) => {
	confirmDelete.value = false
	fullImage.value = shot ? (thumbnails.value[shot.id] ?? null) : null
	if (!shot) return
	const original = new Image()
	original.onload = () => {
		if (viewing.value?.id === shot.id) fullImage.value = shot.url
	}
	original.src = shot.url
})

function onImageLoad(event: Event) {
	const image = event.target as HTMLImageElement
	if (image.naturalHeight) imageAspect.value = image.naturalWidth / image.naturalHeight
}

function step(delta: number) {
	const count = visible.value.length
	if (viewingIndex.value < 0 || count < 2) return
	viewingId.value = visible.value[(viewingIndex.value + delta + count) % count].id
}

async function remove() {
	const shot = viewing.value
	if (!shot) return
	if (!confirmDelete.value) {
		confirmDelete.value = true
		return
	}
	const next = visible.value[viewingIndex.value + 1] ?? visible.value[viewingIndex.value - 1]
	try {
		await core.screenshots.remove(shot)
		screenshots.value = screenshots.value.filter((entry) => entry.id !== shot.id)
		viewingId.value = next?.id ?? null
		pushToast({ kind: 'success', title: 'Скриншот удалён', text: shot.instance_name })
	} catch (error) {
		reportError(error, 'Не удалось удалить скриншот')
	}
}

onKeyStroke('Escape', () => (viewingId.value = null))
onKeyStroke('ArrowLeft', () => step(-1))
onKeyStroke('ArrowRight', () => step(1))
</script>

<template>
	<div class="shots">
		<header class="head">
			<div>
				<h1 class="head__title">Скриншоты</h1>
				<p class="head__hint">
					<template v-if="screenshots.length">
						{{ screenshots.length }}
						{{ plural(screenshots.length, ['снимок', 'снимка', 'снимков']) }} из
						{{ sources.length }}
						{{ plural(sources.length, ['сборки', 'сборок', 'сборок']) }}
					</template>
					<template v-else>Всё, что вы сняли в игре на F2</template>
				</p>
			</div>
		</header>

		<nav v-if="sources.length > 1" class="filters">
			<button
				type="button"
				class="filter"
				:class="{ 'filter--active': !instanceFilter }"
				@click="instanceFilter = null"
			>
				<span class="filter__all"><ImageIcon /></span>
				Все
				<span class="filter__count">{{ screenshots.length }}</span>
			</button>
			<button
				v-for="source in sources"
				:key="source.id"
				type="button"
				class="filter"
				:class="{ 'filter--active': instanceFilter === source.id }"
				@click="instanceFilter = source.id"
			>
				<InstanceIcon :path="iconOf(source.id)" :name="source.name" :size="26" />
				<span class="filter__name">{{ source.name }}</span>
				<span class="filter__count">{{ source.count }}</span>
			</button>
		</nav>

		<div v-if="loading" class="skeletons">
			<span class="skeleton skeleton--hero" />
			<div class="grid">
				<span v-for="index in 6" :key="index" class="skeleton skeleton--tile" />
			</div>
		</div>

		<div v-else-if="visible.length === 0" class="empty">
			<span class="empty__icon"><Camera /></span>
			<strong class="empty__title">Здесь пока пусто</strong>
			<p class="empty__text">
				Нажмите <kbd class="key">F2</kbd> в игре — скриншот сразу появится на этой странице.
			</p>
		</div>

		<template v-else>
			<button v-if="latest" type="button" class="hero" @click="viewingId = latest.id">
				<span class="hero__image skeleton" />
				<img :key="latest.id" :src="latest.url" alt="" class="hero__image" decoding="async" />
				<span class="hero__shade" />
				<span class="hero__info">
					<span class="hero__eyebrow">Последний снимок</span>
					<span class="hero__source">
						<InstanceIcon
							:path="iconOf(latest.instance_id)"
							:name="latest.instance_name"
							:size="34"
						/>
						<span class="hero__text">
							<strong class="hero__name">{{ latest.instance_name }}</strong>
							<span class="hero__date">
								{{ dayjs(latest.modified_at).fromNow() }} ·
								{{ dayjs(latest.modified_at).format('D MMMM, HH:mm') }}
							</span>
						</span>
					</span>
				</span>
				<span class="hero__expand"><Expand /></span>
			</button>

			<section v-for="day in days" :key="day.key" class="day">
				<h2 class="day__title">
					{{ day.label }}
					<span class="day__count">{{ day.shots.length }}</span>
				</h2>
				<div class="grid stagger">
					<button
						v-for="shot in day.shots"
						:key="shot.id"
						type="button"
						class="tile"
						@click="viewingId = shot.id"
					>
						<img v-if="thumbnails[shot.id]" :src="thumbnails[shot.id]" alt="" class="tile__image" />
						<span v-else class="tile__image skeleton" />
						<span class="tile__caption">
							<InstanceIcon
								:path="iconOf(shot.instance_id)"
								:name="shot.instance_name"
								:size="22"
							/>
							<span class="tile__name">{{ shot.instance_name }}</span>
							<span class="tile__time">{{ dayjs(shot.modified_at).format('HH:mm') }}</span>
						</span>
					</button>
				</div>
			</section>
		</template>

		<Teleport to="body">
			<Transition name="lightbox">
				<div v-if="viewing" class="lightbox" @click.self="viewingId = null">
					<button class="lightbox__close" aria-label="Закрыть" @click="viewingId = null">
						<X />
					</button>
					<button
						v-if="visible.length > 1"
						class="lightbox__nav lightbox__nav--prev"
						aria-label="Предыдущий"
						@click="step(-1)"
					>
						<ChevronLeft />
					</button>
					<div class="lightbox__stage" @click.self="viewingId = null">
						<img
							v-if="fullImage"
							:src="fullImage"
							alt=""
							class="lightbox__image"
							:style="{ '--aspect': imageAspect }"
							@load="onImageLoad"
						/>
					</div>
					<button
						v-if="visible.length > 1"
						class="lightbox__nav lightbox__nav--next"
						aria-label="Следующий"
						@click="step(1)"
					>
						<ChevronRight />
					</button>
					<div class="lightbox__bar">
						<InstanceIcon
							:path="iconOf(viewing.instance_id)"
							:name="viewing.instance_name"
							:size="34"
						/>
						<span class="lightbox__text">
							<strong class="lightbox__name">{{ viewing.instance_name }}</strong>
							<span class="lightbox__date">
								{{ dayjs(viewing.modified_at).format('D MMMM YYYY, HH:mm') }} ·
								{{ viewingIndex + 1 }} из {{ visible.length }}
							</span>
						</span>
						<button type="button" class="bar-button" @click="core.screenshots.open(viewing)">
							<FolderOpen /> В папке
						</button>
						<button
							type="button"
							class="bar-button bar-button--danger"
							:class="{ 'bar-button--confirm': confirmDelete }"
							@click="remove"
						>
							<Trash2 /> {{ confirmDelete ? 'Точно удалить?' : 'Удалить' }}
						</button>
					</div>
				</div>
			</Transition>
		</Teleport>
	</div>
</template>

<style scoped>
.shots {
	height: 100%;
	padding: var(--titlebar-clearance) var(--page-gutter) var(--nav-clearance);
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: var(--surface-4) transparent;
}

.head {
	margin-bottom: 22px;
}

.head__title {
	font-size: 38px;
	line-height: 1;
}

.head__hint {
	margin-top: 10px;
	color: var(--text-3);
	font-size: 13px;
	font-weight: 600;
}

.filters {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 18px;
}

.filter {
	display: inline-flex;
	align-items: center;
	gap: 9px;
	height: 42px;
	padding: 0 12px 0 8px;
	border: 0;
	border-radius: 13px;
	background: var(--surface-1);
	color: var(--text-2);
	font: inherit;
	font-size: 13.5px;
	font-weight: 700;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.filter:hover {
	background: var(--surface-2);
	color: var(--text);
}

.filter--active,
.filter--active:hover {
	background: var(--accent-soft);
	color: #fff;
}

.filter__all {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 26px;
	height: 26px;
	border-radius: 8px;
	background: var(--surface-3);
}

.filter--active .filter__all {
	background: var(--accent);
}

.filter__all svg {
	width: 14px;
	height: 14px;
}

.filter__name {
	max-width: 180px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.filter__count {
	padding: 1px 7px;
	border-radius: 7px;
	background: rgba(0, 0, 0, 0.3);
	color: var(--text-2);
	font-size: 11.5px;
}

.hero {
	position: relative;
	display: block;
	width: 100%;
	height: clamp(240px, 42vh, 440px);
	margin-bottom: 26px;
	padding: 0;
	border: 0;
	border-radius: var(--radius-xl);
	background: var(--surface-1);
	overflow: hidden;
	cursor: zoom-in;
	isolation: isolate;
}

.hero__image {
	position: absolute;
	inset: 0;
	z-index: -2;
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
	transition: transform 0.6s var(--ease);
}

.hero:hover .hero__image {
	transform: scale(1.03);
}

.hero__shade {
	position: absolute;
	inset: 0;
	z-index: -1;
	background: linear-gradient(180deg, transparent 45%, rgba(10, 10, 12, 0.85));
}

.hero__info {
	position: absolute;
	left: 26px;
	bottom: 22px;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 10px;
	text-align: left;
}

.hero__eyebrow {
	padding: 4px 10px;
	border-radius: 8px;
	background: rgba(0, 0, 0, 0.4);
	color: #fff;
	font-size: 11.5px;
	font-weight: 800;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	backdrop-filter: blur(6px);
}

.hero__source {
	display: flex;
	align-items: center;
	gap: 12px;
}

.hero__text {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.hero__name {
	color: #fff;
	font-family: var(--font-heading);
	font-size: 22px;
	font-weight: 800;
}

.hero__date {
	color: rgba(255, 255, 255, 0.72);
	font-size: 13px;
	font-weight: 600;
}

.hero__expand {
	position: absolute;
	top: 16px;
	right: 16px;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	border-radius: 12px;
	background: var(--panel);
	color: #fff;
	opacity: 0;
	transform: scale(0.9);
	transition:
		opacity 0.16s var(--ease),
		transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.hero:hover .hero__expand {
	opacity: 1;
	transform: scale(1);
}

.hero__expand svg {
	width: 18px;
	height: 18px;
}

.day {
	margin-bottom: 26px;
}

.day__title {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 12px;
	font-size: 17px;
	font-weight: 800;
}

.day__count {
	padding: 1px 8px;
	border-radius: 7px;
	background: var(--surface-2);
	color: var(--text-3);
	font-size: 12px;
}

.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 12px;
}

.tile {
	position: relative;
	padding: 0;
	border: 0;
	border-radius: var(--radius-lg);
	background: var(--surface-1);
	aspect-ratio: 16 / 9;
	overflow: hidden;
	cursor: zoom-in;
	transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tile:hover {
	transform: translateY(-3px);
}

.tile__image {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
	transition: transform 0.4s var(--ease);
}

.tile:hover .tile__image {
	transform: scale(1.05);
}

.tile__caption {
	position: absolute;
	inset: auto 0 0 0;
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 26px 12px 10px;
	background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.75));
	color: #fff;
	font-size: 12.5px;
	font-weight: 700;
	opacity: 0;
	transform: translateY(6px);
	transition:
		opacity 0.16s var(--ease),
		transform 0.16s var(--ease);
}

.tile:hover .tile__caption {
	opacity: 1;
	transform: none;
}

.tile__name {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-align: left;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.tile__time {
	color: rgba(255, 255, 255, 0.7);
}

.skeletons {
	display: flex;
	flex-direction: column;
	gap: 26px;
}

.skeleton {
	display: block;
	border-radius: var(--radius-lg);
	background: linear-gradient(
		100deg,
		var(--surface-1) 30%,
		rgba(255, 255, 255, 0.05) 50%,
		var(--surface-1) 70%
	);
	background-size: 220% 100%;
	animation: shimmer 1.3s ease-in-out infinite;
}

.skeleton--hero {
	height: clamp(240px, 42vh, 440px);
	border-radius: var(--radius-xl);
}

.skeleton--tile {
	aspect-ratio: 16 / 9;
}

@keyframes shimmer {
	from {
		background-position: 120% 0;
	}
	to {
		background-position: -120% 0;
	}
}

.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	padding: 70px 24px;
	border-radius: var(--radius-xl);
	background: var(--surface-1);
	text-align: center;
}

.empty__icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 64px;
	height: 64px;
	margin-bottom: 6px;
	border-radius: 20px;
	background: var(--accent-soft);
	color: var(--accent-text);
}

.empty__icon svg {
	width: 28px;
	height: 28px;
}

.empty__title {
	font-family: var(--font-heading);
	font-size: 20px;
}

.empty__text {
	color: var(--text-3);
	font-size: 14px;
}

.key {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 30px;
	height: 26px;
	margin: 0 2px;
	padding: 0 7px;
	border-radius: 7px;
	background: var(--surface-3);
	box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.35);
	color: var(--text);
	font-family: inherit;
	font-size: 12.5px;
	font-weight: 800;
}

.lightbox {
	position: fixed;
	inset: 0;
	z-index: 35000;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 18px;
	padding: 24px 24px 104px;
	background: rgba(6, 6, 8, 0.9);
	backdrop-filter: blur(8px);
}

.lightbox__stage {
	display: flex;
	flex: 1;
	align-self: stretch;
	min-width: 0;
	align-items: center;
	justify-content: center;
	container-type: size;
}

.lightbox__image {
	display: block;
	width: min(100cqw, 100cqh * var(--aspect));
	aspect-ratio: var(--aspect);
	object-fit: cover;
	border-radius: var(--radius-lg);
	box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
}

.lightbox__close,
.lightbox__nav {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	border: 0;
	border-radius: 14px;
	background: var(--panel);
	color: #fff;
	cursor: pointer;
	transition: background-color 0.14s var(--ease);
}

.lightbox__close:hover,
.lightbox__nav:hover {
	background: var(--surface-3);
}

.lightbox__close {
	position: absolute;
	top: 18px;
	right: 18px;
	width: 42px;
	height: 42px;
}

.lightbox__nav {
	width: 48px;
	height: 48px;
}

.lightbox__close svg,
.lightbox__nav svg {
	width: 20px;
	height: 20px;
}

.lightbox__bar {
	position: absolute;
	left: 50%;
	bottom: 34px;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px 8px 8px 12px;
	border-radius: 18px;
	background: var(--panel);
	transform: translateX(-50%);
	backdrop-filter: blur(10px);
}

.lightbox__text {
	display: flex;
	min-width: 160px;
	margin-right: 8px;
	flex-direction: column;
	gap: 1px;
}

.lightbox__name {
	max-width: 260px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 14px;
}

.lightbox__date {
	color: var(--text-3);
	font-size: 12px;
	font-weight: 600;
	white-space: nowrap;
}

.bar-button {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	height: 42px;
	padding: 0 16px;
	border: 0;
	border-radius: 12px;
	background: var(--surface-3);
	color: var(--text);
	font: inherit;
	font-size: 13.5px;
	font-weight: 700;
	white-space: nowrap;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.bar-button:hover {
	background: var(--surface-4);
}

.bar-button--danger {
	background: transparent;
	color: var(--text-3);
}

.bar-button--danger:hover,
.bar-button--confirm {
	background: var(--danger-soft);
	color: var(--danger);
}

.bar-button svg {
	width: 16px;
	height: 16px;
}

.lightbox-enter-active,
.lightbox-leave-active {
	transition: opacity 0.18s var(--ease);
}

.lightbox-enter-from,
.lightbox-leave-to {
	opacity: 0;
}
</style>
