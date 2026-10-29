<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { useDebounceFn } from '@vueuse/core'
import {
	ArrowUpCircle,
	FilePlus,
	LoaderCircle,
	Package,
	Plus,
	Search,
	Trash2,
} from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { type ContentItem, core, type Instance, modpackLink } from '@/api/core'
import { useAppEvent } from '@/api/events'
import { autofixDisabled, baseFileName, clearAutofixMark } from '@/composables/autofix'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiToggle from '@/components/ui/UiToggle.vue'
import { useStore } from '@/composables/store'
import { reportError } from '@/composables/toasts'

export type ContentFilter = 'mod' | 'resourcepack' | 'shaderpack'

const props = defineProps<{ instance: Instance; type: ContentFilter }>()
const router = useRouter()
const { installJobs } = useStore()

const items = ref<ContentItem[]>([])
const loading = ref(true)
const query = ref('')
const updating = reactive(new Set<string>())
const updatingAll = ref(false)
const loaded = ref(false)

/** The install job currently changing this instance (e.g. a bulk update), if any. */
const job = computed(() => installJobs.get(props.instance.id) ?? null)
const jobPercent = computed(() => {
	const progress = job.value?.progress
	return progress?.total
		? Math.min(99, Math.floor((progress.current / progress.total) * 100))
		: null
})
const filter = ref<'all' | 'enabled' | 'disabled' | 'updates' | 'pack' | 'own'>('all')

const isPack = computed(() => !!modpackLink(props.instance))

const NOUNS: Record<ContentFilter, { add: string; empty: string }> = {
	mod: { add: 'Найти моды', empty: 'Модов пока нет' },
	resourcepack: { add: 'Найти ресурспаки', empty: 'Ресурспаков пока нет' },
	shaderpack: { add: 'Найти шейдеры', empty: 'Шейдеров пока нет' },
}

const ofType = computed(() => items.value.filter((item) => item.project_type === props.type))
const packCount = computed(() => ofType.value.filter((item) => item.from_pack).length)

const outdated = computed(() => ofType.value.filter((item) => item.has_update))
const disabledCount = computed(() => ofType.value.filter((item) => !item.enabled).length)

const filters = computed(() =>
	[
		{ value: 'all' as const, label: 'Все', count: ofType.value.length, show: true },
		{
			value: 'enabled' as const,
			label: 'Включены',
			count: ofType.value.length - disabledCount.value,
			show: disabledCount.value > 0,
		},
		{
			value: 'disabled' as const,
			label: 'Выключены',
			count: disabledCount.value,
			show: disabledCount.value > 0,
		},
		{
			value: 'updates' as const,
			label: 'Есть обновления',
			count: outdated.value.length,
			show: outdated.value.length > 0,
		},
		{
			value: 'pack' as const,
			label: 'Из сборки',
			count: packCount.value,
			show: isPack.value && packCount.value > 0,
		},
		{
			value: 'own' as const,
			label: 'Мои',
			count: ofType.value.length - packCount.value,
			show: isPack.value && packCount.value > 0,
		},
	].filter((entry) => entry.show),
)

function passesFilter(item: ContentItem) {
	switch (filter.value) {
		case 'enabled':
			return item.enabled
		case 'disabled':
			return !item.enabled
		case 'updates':
			return item.has_update
		case 'pack':
			return Boolean(item.from_pack)
		case 'own':
			return !item.from_pack
		default:
			return true
	}
}

const visible = computed(() => {
	const needle = query.value.trim().toLowerCase()
	return ofType.value
		.filter(passesFilter)
		.filter((item) => !needle || displayName(item).toLowerCase().includes(needle))
		.sort(
			(a, b) =>
				Number(b.has_update) - Number(a.has_update) || displayName(a).localeCompare(displayName(b)),
		)
})

watch(filters, (list) => {
	if (!list.some((entry) => entry.value === filter.value)) filter.value = 'all'
})

function disabledByAutofix(item: ContentItem) {
	return (
		!item.enabled &&
		(autofixDisabled.value[props.instance.id] ?? []).includes(baseFileName(item.file_name))
	)
}

function displayName(item: ContentItem) {
	return item.project?.title ?? item.file_name.replace(/\.(jar|zip)(\.disabled)?$/i, '')
}

async function load() {
	try {
		items.value = await core.content.list(props.instance)
		loaded.value = true
	} catch (error) {
		if (loaded.value) console.warn('content refresh failed', error)
		else reportError(error, 'Не удалось загрузить контент')
	} finally {
		loading.value = false
	}
}

/** Core events arrive in bursts while files change; refresh once they settle and no job is running. */
const reloadSoon = useDebounceFn(() => {
	if (!job.value) void load()
}, 600)

watch(
	() => props.instance.id,
	() => {
		loaded.value = false
		void load()
	},
	{ immediate: true },
)
watch(job, (current, previous) => {
	if (previous && !current) {
		updatingAll.value = false
		void load()
	}
})
watch(
	() => props.type,
	() => {
		query.value = ''
		filter.value = 'all'
	},
)
useAppEvent('instance', (payload) => {
	if (payload.instance_id === props.instance.id) void reloadSoon()
})

async function toggle(item: ContentItem) {
	const previous = item.enabled
	if (!previous) clearAutofixMark(props.instance.id, item.file_name)
	item.enabled = !previous
	try {
		await core.content.toggle(props.instance.id, item.file_path)
		await load()
	} catch (error) {
		item.enabled = previous
		reportError(error, 'Не удалось переключить')
	}
}

async function remove(item: ContentItem) {
	items.value = items.value.filter((entry) => entry !== item)
	await core.content
		.remove(props.instance.id, item.file_path)
		.catch((error) => reportError(error, 'Не удалось удалить'))
	await load()
}

async function update(item: ContentItem) {
	updating.add(item.file_path)
	try {
		await core.content.update(props.instance.id, item.file_path)
	} catch (error) {
		reportError(error, `Не удалось обновить «${displayName(item)}»`)
	} finally {
		updating.delete(item.file_path)
	}
}

async function updateAll() {
	const updates = outdated.value.flatMap((item) =>
		item.update_version_id
			? [{ project_path: item.file_path, version_id: item.update_version_id }]
			: [],
	)
	if (updates.length === 0) return
	updatingAll.value = true
	try {
		await core.content.updateMany(props.instance.id, updates)
	} catch (error) {
		updatingAll.value = false
		reportError(error, 'Не удалось обновить моды')
	}
}

async function addFromFile() {
	const selection = await open({
		multiple: true,
		filters: [{ name: 'Моды и паки', extensions: ['jar', 'zip'] }],
	})
	const paths = Array.isArray(selection) ? selection : selection ? [selection] : []
	for (const path of paths) {
		await core.content
			.addFromPath(props.instance.id, path)
			.catch((error) => reportError(error, 'Не удалось добавить файл'))
	}
	await load()
}

function openProject(item: ContentItem) {
	if (!item.project) return
	const type = { mod: 'mod', resourcepack: 'resourcepack', shaderpack: 'shader', datapack: 'mod' }[
		item.project_type
	]
	void router.push({
		path: `/catalog/${item.project.slug || item.project.id}`,
		query: { instance: props.instance.id, type },
	})
}

function browse() {
	const type = props.type === 'shaderpack' ? 'shader' : props.type
	void router.push({ path: '/catalog', query: { instance: props.instance.id, type } })
}
</script>

<template>
	<div class="content">
		<div class="content__head">
			<div class="content__toolbar">
				<UiInput v-model="query" placeholder="Поиск по названию" class="content__search">
					<template #icon><Search /></template>
				</UiInput>
				<UiButton variant="ghost" @click="addFromFile"><FilePlus /> Из файла</UiButton>
				<UiButton variant="primary" @click="browse"><Plus /> {{ NOUNS[type].add }}</UiButton>
			</div>

			<div v-if="ofType.length > 0" class="filters">
				<div class="origins" role="tablist">
					<button
						v-for="entry in filters"
						:key="entry.value"
						type="button"
						role="tab"
						class="origin"
						:class="{
							'origin--active': filter === entry.value,
							'origin--updates': entry.value === 'updates',
						}"
						:aria-selected="filter === entry.value"
						@click="filter = entry.value"
					>
						{{ entry.label }}
						<span class="origin__count">{{ entry.count }}</span>
					</button>
				</div>
				<button
					v-if="outdated.length > 0"
					type="button"
					class="update-all"
					:disabled="updatingAll || !!job"
					@click="updateAll"
				>
					<LoaderCircle v-if="updatingAll || job" class="spin" />
					<ArrowUpCircle v-else />
					{{
						updatingAll || job
							? `Обновляем${jobPercent !== null ? ` ${jobPercent}%` : '…'}`
							: `Обновить всё (${outdated.length})`
					}}
				</button>
			</div>
		</div>

		<div v-if="!loading && visible.length === 0" class="content__empty">
			<span class="content__empty-icon"><Package /></span>
			<p>{{ query ? 'Ничего не найдено' : NOUNS[type].empty }}</p>
			<UiButton v-if="!query" variant="primary" size="sm" @click="browse">
				<Plus /> {{ NOUNS[type].add }}
			</UiButton>
		</div>

		<ul v-else class="content__grid">
			<li
				v-for="item in visible"
				:key="item.file_path"
				class="card"
				:class="{ 'card--disabled': !item.enabled }"
			>
				<img v-if="item.project?.icon_url" :src="item.project.icon_url" alt="" class="card__icon" />
				<span v-else class="card__icon card__icon--blank"><Package /></span>
				<div class="card__text">
					<button
						v-if="item.project"
						type="button"
						class="card__name card__name--link"
						@click="openProject(item)"
					>
						{{ displayName(item) }}
					</button>
					<span v-else class="card__name">{{ displayName(item) }}</span>
					<span class="card__meta">
						<span
							v-if="disabledByAutofix(item)"
							v-tip="'Автофикс выключил этот мод, потому что с ним игра вылетала'"
							class="card__origin card__origin--fix"
						>
							выключен автофиксом
						</span>
						<span
							v-if="item.from_pack"
							v-tip="'Пришёл вместе со сборкой. Обновление сборки может его заменить'"
							class="card__origin"
						>
							из сборки
						</span>
						<span class="card__version">{{ item.version?.version_number ?? item.file_name }}</span>
						<template v-if="item.owner">{{ item.owner.name }}</template>
					</span>
				</div>
				<div class="card__actions">
					<button
						v-if="item.has_update"
						type="button"
						class="card__update"
						:disabled="updating.has(item.file_path)"
						@click="update(item)"
					>
						<LoaderCircle v-if="updating.has(item.file_path)" class="spin" />
						<ArrowUpCircle v-else />
						Обновить
					</button>
					<UiIconButton label="Удалить" size="sm" danger class="card__remove" @click="remove(item)">
						<Trash2 />
					</UiIconButton>
					<UiToggle
						:model-value="item.enabled"
						:label="item.enabled ? 'Выключить' : 'Включить'"
						@update:model-value="toggle(item)"
					/>
				</div>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.content {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.content__head {
	position: sticky;
	top: 0;
	z-index: 2;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-bottom: 4px;
	background: var(--bg);
}

.content__toolbar {
	flex-wrap: wrap;
	display: flex;
	align-items: center;
	gap: 8px;
}

.content__search {
	flex: 1;
	min-width: 140px;
}

.content__grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 2px 8px;
	margin: 0;
	padding: 6px;
	border-radius: var(--radius-xl);
	background: var(--surface-1);
	list-style: none;
}

.card {
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
	height: 62px;
	padding: 0 12px 0 10px;
	border-radius: var(--radius-lg);
	transition: background-color 0.14s var(--ease);
}

.card:hover {
	background: var(--surface-2);
}

.card--disabled .card__icon,
.card--disabled .card__text {
	opacity: 0.45;
}

.card__icon {
	width: 40px;
	height: 40px;
	flex-shrink: 0;
	border-radius: 10px;
	object-fit: cover;
	background: var(--surface-3);
}

.card__icon--blank {
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--text-3);
}

.card__icon--blank svg {
	width: 20px;
	height: 20px;
}

.card__text {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	gap: 4px;
}

.card__name {
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 14px;
	font-weight: 700;
}

.card__name--link {
	padding: 0;
	border: 0;
	background: transparent;
	color: var(--text);
	font-family: inherit;
	text-align: left;
	cursor: pointer;
	transition: color 0.14s var(--ease);
}

.card__name--link:hover {
	color: var(--accent-text);
}

.card__meta {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	color: var(--text-3);
	font-size: 12px;
}

.card__version {
	max-width: 160px;
	overflow: hidden;
	text-overflow: ellipsis;
	padding: 1px 7px;
	border-radius: 6px;
	background: var(--surface-3);
	color: var(--text-2);
	font-size: 11.5px;
	font-weight: 600;
}

.card__origin {
	flex-shrink: 0;
	padding: 1px 7px;
	border-radius: 6px;
	background: var(--accent-soft);
	color: var(--accent-text);
	font-size: 11.5px;
	font-weight: 700;
}

.card__origin--fix {
	background: rgba(227, 178, 60, 0.16);
	color: #f0c454;
}

.filters {
	display: flex;
	align-items: center;
	gap: 12px;
}

.origins {
	display: flex;
	flex: 1;
	flex-wrap: wrap;
	gap: 6px;
}

.origin--updates:not(.origin--active) .origin__count {
	background: var(--accent);
	color: #fff;
}

.update-all {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	gap: 7px;
	height: 34px;
	padding: 0 14px;
	border: 0;
	border-radius: 10px;
	background: var(--accent);
	color: #fff;
	font: inherit;
	font-size: 13px;
	font-weight: 700;
	cursor: pointer;
	transition: background-color 0.14s var(--ease);
}

.update-all:hover:not(:disabled) {
	background: var(--accent-hover);
}

.update-all:disabled {
	background: var(--surface-3);
	color: var(--text-3);
	cursor: default;
}

.update-all svg {
	width: 15px;
	height: 15px;
}

.origin {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	height: 34px;
	padding: 0 12px;
	border: 0;
	border-radius: 10px;
	background: var(--surface-1);
	color: var(--text-2);
	font: inherit;
	font-size: 13px;
	font-weight: 700;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.origin:hover {
	background: var(--surface-2);
	color: var(--text);
}

.origin--active,
.origin--active:hover {
	background: var(--accent-soft);
	color: #fff;
}

.origin__count {
	padding: 0 6px;
	border-radius: 6px;
	background: rgba(0, 0, 0, 0.3);
	color: var(--text-2);
	font-size: 11.5px;
}

.card__actions :deep(.ui-toggle) {
	background: var(--surface-4);
}

.card__actions :deep(.ui-toggle--on) {
	background: rgba(255, 255, 255, 0.82);
}

.card__actions :deep(.ui-toggle__thumb) {
	background: #8a8a90;
}

.card__actions :deep(.ui-toggle--on .ui-toggle__thumb) {
	background: #151517;
}

.card__actions {
	display: flex;
	align-items: center;
	gap: 6px;
}

.card__remove {
	opacity: 0;
	transition: opacity 0.14s var(--ease);
}

.card:hover .card__remove {
	opacity: 1;
}

.card__update {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 30px;
	padding: 0 11px;
	border: 0;
	border-radius: 9px;
	background: var(--accent-soft);
	color: var(--accent-text);
	font: inherit;
	font-size: 12.5px;
	font-weight: 700;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.card__update:hover:not(:disabled) {
	background: var(--accent);
	color: #fff;
}

.card__update svg {
	width: 14px;
	height: 14px;
}

.content__empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	padding: 64px 0;
	color: var(--text-3);
}

.content__empty-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 64px;
	height: 64px;
	border-radius: 20px;
	background: var(--surface-1);
}

.content__empty-icon svg {
	width: 26px;
	height: 26px;
}

.spin {
	animation: spin 0.9s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
