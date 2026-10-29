<script setup lang="ts">
import { useDebounceFn, useIntersectionObserver } from '@vueuse/core'
import {
	ArrowDownUp,
	Blocks,
	Check,
	ChevronDown,
	Download,
	Heart,
	Image as ImageIcon,
	LoaderCircle,
	Package,
	PackageSearch,
	Search,
	Sparkles,
	X,
} from 'lucide-vue-next'
import { type Component, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { type ContentKind, core, modpackLink } from '@/api/core'
import { type CatalogKind, type SearchHit, searchProjects, type SortIndex } from '@/api/modrinth'
import InstanceIcon from '@/components/InstanceIcon.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiPopover from '@/components/ui/UiPopover.vue'
import { categoryLabels } from '@/composables/categories'
import { formatCount, loaderLabel } from '@/composables/format'
import { installModpack } from '@/composables/modpacks'
import { useStore } from '@/composables/store'
import { pushToast, reportError } from '@/composables/toasts'

const PAGE_SIZE = 24
const SKELETONS = 8

const KINDS: { value: CatalogKind; label: string; icon: Component }[] = [
	{ value: 'modpack', label: 'Сборки', icon: Package },
	{ value: 'mod', label: 'Моды', icon: Blocks },
	{ value: 'resourcepack', label: 'Ресурспаки', icon: ImageIcon },
	{ value: 'shader', label: 'Шейдеры', icon: Sparkles },
]

const SORTS: { value: SortIndex; label: string }[] = [
	{ value: 'relevance', label: 'По релевантности' },
	{ value: 'downloads', label: 'По скачиваниям' },
	{ value: 'follows', label: 'По подписчикам' },
	{ value: 'newest', label: 'Сначала новые' },
	{ value: 'updated', label: 'Недавно обновлённые' },
]

const route = useRoute()
const router = useRouter()
const { instances, selectedInstance, installJobs } = useStore()

const kind = ref<CatalogKind>(
	KINDS.find((entry) => entry.value === route.query.type)?.value ?? 'mod',
)
const query = ref('')
const sort = ref<SortIndex>('relevance')
const targetId = ref<string | null>(
	(route.query.instance as string | undefined) ?? selectedInstance.value?.id ?? null,
)
const targetOpen = ref(false)
const sortOpen = ref(false)

const hits = ref<SearchHit[]>([])
const total = ref(0)
const loading = ref(false)
const installed = ref(new Set<string>())
const installing = ref(new Set<string>())
const sentinel = ref<HTMLElement | null>(null)
let request = 0

const target = computed(
	() => instances.value.find((instance) => instance.id === targetId.value) ?? null,
)
const sortLabel = computed(() => SORTS.find((entry) => entry.value === sort.value)?.label ?? '')
const hasMore = computed(() => hits.value.length < total.value)
const browsingPacks = computed(() => kind.value === 'modpack')
/** Content filters apply only when picking mods or packs for a specific instance. */
const filterTarget = computed(() => (browsingPacks.value ? null : target.value))

/** Instances installed from each modpack project, so cards can show install progress. */
const packInstances = computed(() => {
	const map = new Map<string, string>()
	for (const instance of instances.value) {
		const link = modpackLink(instance)
		if (link) map.set(link.projectId, instance.id)
	}
	return map
})

function packProgress(projectId: string) {
	const instanceId = packInstances.value.get(projectId)
	const job = instanceId ? installJobs.get(instanceId) : undefined
	if (!job) return null
	const progress = job.progress
	return progress?.total ? Math.min(99, Math.floor((progress.current / progress.total) * 100)) : 0
}

function isInstalled(projectId: string) {
	return browsingPacks.value
		? packInstances.value.has(projectId) && packProgress(projectId) === null
		: installed.value.has(projectId)
}

function isInstalling(projectId: string) {
	return (
		installing.value.has(projectId) || (browsingPacks.value && packProgress(projectId) !== null)
	)
}

function installLabel(projectId: string) {
	if (!isInstalling(projectId)) return 'Установить'
	const percent = browsingPacks.value ? packProgress(projectId) : null
	return percent ? `Ставим ${percent}%` : 'Ставим…'
}

async function load(reset: boolean) {
	const current = ++request
	loading.value = true
	if (reset) hits.value = []
	try {
		const result = await searchProjects({
			kind: kind.value,
			query: query.value.trim(),
			sort: sort.value,
			offset: reset ? 0 : hits.value.length,
			limit: PAGE_SIZE,
			gameVersion: filterTarget.value?.game_version,
			loader: filterTarget.value?.loader,
		})
		if (current !== request) return
		hits.value = reset ? result.hits : [...hits.value, ...result.hits]
		total.value = result.total_hits
	} catch (error) {
		reportError(error, 'Каталог недоступен')
	} finally {
		if (current === request) loading.value = false
	}
}

async function loadInstalled() {
	installed.value = new Set(
		target.value ? await core.content.installedProjectIds(target.value.id).catch(() => []) : [],
	)
}

const debouncedReload = useDebounceFn(() => load(true), 300)

watch([kind, sort, targetId], () => void load(true), { immediate: true })
watch(query, () => void debouncedReload())
watch(targetId, () => void loadInstalled(), { immediate: true })

useIntersectionObserver(
	sentinel,
	([entry]) => {
		if (entry?.isIntersecting && hasMore.value && !loading.value) void load(false)
	},
	{ rootMargin: '400px' },
)

function cover(hit: SearchHit) {
	const tint = hit.color != null ? `#${hit.color.toString(16).padStart(6, '0')}` : '#7d61e0'
	return {
		'--tint': tint,
		backgroundImage: hit.featured_gallery ? `url("${hit.featured_gallery}")` : undefined,
	}
}

function categories(hit: SearchHit) {
	return categoryLabels(hit.categories).slice(0, 2)
}

async function install(hit: SearchHit) {
	if (browsingPacks.value) {
		installing.value = new Set(installing.value).add(hit.project_id)
		try {
			await installModpack({ id: hit.project_id, title: hit.title, icon_url: hit.icon_url })
		} catch (error) {
			reportError(error, `Не удалось установить ${hit.title}`)
		} finally {
			const after = new Set(installing.value)
			after.delete(hit.project_id)
			installing.value = after
		}
		return
	}
	if (!target.value) return
	installing.value = new Set(installing.value).add(hit.project_id)
	try {
		await core.content.install(target.value.id, {
			project_id: hit.project_id,
			content_type: kind.value as ContentKind,
			selected: {
				game_versions: [target.value.game_version],
				loaders: kind.value === 'mod' ? [target.value.loader] : undefined,
			},
		})
		await loadInstalled()
		pushToast({ kind: 'success', title: `${hit.title} установлен`, text: target.value.name })
	} catch (error) {
		reportError(error, `Не удалось установить ${hit.title}`)
	} finally {
		const after = new Set(installing.value)
		after.delete(hit.project_id)
		installing.value = after
	}
}

function openProject(hit: SearchHit) {
	void router.push({
		path: `/catalog/${hit.slug || hit.project_id}`,
		query: {
			instance: browsingPacks.value ? undefined : (targetId.value ?? undefined),
			type: kind.value,
		},
	})
}

function pickTarget(id: string) {
	targetId.value = id
	targetOpen.value = false
}

function pickSort(value: SortIndex) {
	sort.value = value
	sortOpen.value = false
}
</script>

<template>
	<div class="catalog">
		<header class="head">
			<div>
				<h1 class="head__title">Каталог</h1>
				<p class="head__hint">Сборки, моды, шейдеры и ресурспаки из Modrinth</p>
			</div>
			<UiPopover
				v-if="!browsingPacks"
				v-model:open="targetOpen"
				placement="bottom-end"
				width="100%"
			>
				<template #trigger="{ toggle }">
					<button class="target" :class="{ 'target--open': targetOpen }" @click="toggle">
						<InstanceIcon v-if="target" :path="target.icon_path" :name="target.name" :size="34" />
						<span class="target__text">
							<span class="target__label">Устанавливать в</span>
							<span class="target__name">{{ target?.name ?? 'Выберите сборку' }}</span>
						</span>
						<ChevronDown class="target__chevron" />
					</button>
				</template>
				<UiMenuItem
					v-for="instance in instances"
					:key="instance.id"
					:active="instance.id === targetId"
					@click="pickTarget(instance.id)"
				>
					<InstanceIcon :path="instance.icon_path" :name="instance.name" :size="30" />
					<span class="target__item">
						<span class="target__item-name">{{ instance.name }}</span>
						<span class="target__item-meta">
							{{ loaderLabel(instance.loader) }} · {{ instance.game_version }}
						</span>
					</span>
					<Check v-if="instance.id === targetId" class="target__check" />
				</UiMenuItem>
			</UiPopover>
		</header>

		<nav class="kinds" role="tablist">
			<button
				v-for="entry in KINDS"
				:key="entry.value"
				type="button"
				role="tab"
				class="kind"
				:class="{ 'kind--active': kind === entry.value }"
				:aria-selected="kind === entry.value"
				@click="kind = entry.value"
			>
				<span class="kind__icon"><component :is="entry.icon" /></span>
				<span class="kind__label">{{ entry.label }}</span>
				<span v-if="kind === entry.value && total" class="kind__count">
					{{ formatCount(total) }}
				</span>
			</button>
		</nav>

		<div class="toolbar">
			<label class="search">
				<Search class="search__icon" />
				<input
					v-model="query"
					class="search__input"
					:placeholder="`Найти ${KINDS.find((entry) => entry.value === kind)?.label.toLowerCase()}`"
					spellcheck="false"
				/>
				<button
					v-if="query"
					type="button"
					class="search__clear"
					aria-label="Очистить"
					@click="query = ''"
				>
					<X />
				</button>
			</label>
			<UiPopover v-model:open="sortOpen" placement="bottom-end" width="220px">
				<template #trigger="{ toggle }">
					<button class="sort" :class="{ 'sort--open': sortOpen }" @click="toggle">
						<ArrowDownUp />
						{{ sortLabel }}
					</button>
				</template>
				<UiMenuItem
					v-for="entry in SORTS"
					:key="entry.value"
					:active="entry.value === sort"
					@click="pickSort(entry.value)"
				>
					<span class="sort__item">{{ entry.label }}</span>
					<Check v-if="entry.value === sort" class="target__check" />
				</UiMenuItem>
			</UiPopover>
		</div>

		<p v-if="browsingPacks" class="compat">
			Сборка ставится как новая — дальше она ваша: меняйте что угодно, а когда автор выпустит
			обновление, его можно будет скачать
		</p>
		<p v-else-if="target" class="compat">
			Только совместимое с «{{ target.name }}» · {{ loaderLabel(target.loader) }}
			{{ target.game_version }}
		</p>

		<div class="grid">
			<article v-for="hit in hits" :key="hit.project_id" class="card" @click="openProject(hit)">
				<div class="card__cover" :style="cover(hit)">
					<span class="card__shade" />
				</div>
				<div class="card__body">
					<div class="card__head">
						<img v-if="hit.icon_url" :src="hit.icon_url" alt="" class="card__icon" loading="lazy" />
						<span v-else class="card__icon card__icon--blank"><PackageSearch /></span>
						<div class="card__titles">
							<h3 class="card__title">{{ hit.title }}</h3>
							<span class="card__author">{{ hit.author }}</span>
						</div>
					</div>
					<p class="card__description">{{ hit.description }}</p>
					<div v-if="categories(hit).length" class="card__tags">
						<span v-for="tag in categories(hit)" :key="tag" class="card__tag">{{ tag }}</span>
					</div>
					<footer class="card__footer" @click.stop>
						<span class="card__stat"><Download /> {{ formatCount(hit.downloads) }}</span>
						<span class="card__stat"><Heart /> {{ formatCount(hit.follows) }}</span>
						<span v-if="isInstalled(hit.project_id)" class="card__installed">
							<Check /> {{ browsingPacks ? 'Установлена' : 'Установлен' }}
						</span>
						<button
							v-else
							type="button"
							class="card__install"
							:disabled="(!browsingPacks && !target) || isInstalling(hit.project_id)"
							@click="install(hit)"
						>
							<LoaderCircle v-if="isInstalling(hit.project_id)" class="spin" />
							<Download v-else />
							{{ installLabel(hit.project_id) }}
						</button>
					</footer>
				</div>
			</article>
			<template v-if="loading">
				<div v-for="index in SKELETONS" :key="`skeleton-${index}`" class="card card--skeleton">
					<div class="card__cover" />
					<div class="card__body">
						<span class="skeleton skeleton--title" />
						<span class="skeleton" />
						<span class="skeleton skeleton--short" />
					</div>
				</div>
			</template>
		</div>

		<div v-if="!loading && hits.length === 0" class="empty">
			<span class="empty__icon"><PackageSearch /></span>
			<h2>Ничего не нашлось</h2>
			<p>Попробуйте другой запрос или выберите другую сборку.</p>
		</div>

		<div ref="sentinel" class="sentinel" />
	</div>
</template>

<style scoped>
.catalog {
	height: 100%;
	padding: var(--titlebar-clearance) var(--page-gutter) var(--nav-clearance);
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: var(--surface-4) transparent;
}

.head {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 24px;
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

.target {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 280px;
	height: 52px;
	padding: 0 14px 0 9px;
	border: 0;
	border-radius: 14px;
	background: var(--surface-1);
	color: var(--text);
	text-align: left;
	cursor: pointer;
	transition: background-color 0.14s var(--ease);
}

.target:hover,
.target--open {
	background: var(--surface-2);
}

.target__text {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	gap: 1px;
}

.target__label {
	color: var(--text-3);
	font-size: 11px;
	font-weight: 600;
}

.target__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 14px;
	font-weight: 700;
}

.target__chevron {
	width: 17px;
	height: 17px;
	color: var(--text-3);
	transition: transform 0.16s var(--ease);
}

.target--open .target__chevron {
	transform: rotate(180deg);
}

.target__item {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
}

.target__item-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 600;
}

.target__item-meta {
	color: var(--text-3);
	font-size: 12px;
}

.target__check {
	color: var(--accent);
}

.kinds {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	margin-bottom: 14px;
}

.kind {
	display: flex;
	align-items: center;
	gap: 12px;
	height: 64px;
	padding: 0 16px 0 12px;
	border: 0;
	border-radius: 16px;
	background: var(--surface-1);
	color: var(--text-2);
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.kind:hover {
	background: var(--surface-2);
	color: var(--text);
}

.kind--active,
.kind--active:hover {
	background:
		radial-gradient(120% 140% at 0% 0%, rgba(36, 207, 120, 0.35), transparent 70%), var(--surface-1);
	color: #fff;
}

.kind__icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	border-radius: 12px;
	background: var(--surface-3);
	transition: background-color 0.14s var(--ease);
}

.kind--active .kind__icon {
	background: var(--accent);
}

.kind__icon svg {
	width: 19px;
	height: 19px;
}

.kind__label {
	flex: 1;
	font-size: 15px;
	font-weight: 700;
}

.kind__count {
	padding: 2px 8px;
	border-radius: 7px;
	background: rgba(0, 0, 0, 0.3);
	color: var(--accent-text);
	font-size: 12px;
	font-weight: 700;
}

.toolbar {
	display: flex;
	gap: 10px;
	margin-bottom: 10px;
}

.search {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 12px;
	height: 52px;
	padding: 0 8px 0 18px;
	border-radius: 14px;
	background: var(--surface-1);
	transition: background-color 0.14s var(--ease);
}

.search:focus-within {
	background: var(--surface-2);
}

.search__icon {
	width: 19px;
	height: 19px;
	color: var(--text-3);
}

.search__input {
	flex: 1;
	min-width: 0;
	height: 100%;
	border: 0;
	background: transparent;
	color: var(--text);
	font: inherit;
	font-size: 15px;
}

.search__clear {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 34px;
	height: 34px;
	border: 0;
	border-radius: 10px;
	background: transparent;
	color: var(--text-3);
	cursor: pointer;
}

.search__clear:hover {
	background: var(--surface-3);
	color: var(--text);
}

.search__clear svg {
	width: 16px;
	height: 16px;
}

.sort {
	display: flex;
	align-items: center;
	gap: 8px;
	height: 52px;
	padding: 0 16px;
	border: 0;
	border-radius: 14px;
	background: var(--surface-1);
	color: var(--text-2);
	font: inherit;
	font-size: 13.5px;
	font-weight: 600;
	white-space: nowrap;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.sort:hover,
.sort--open {
	background: var(--surface-2);
	color: var(--text);
}

.sort svg {
	width: 16px;
	height: 16px;
}

.sort__item {
	flex: 1;
}

.compat {
	margin: 4px 2px 16px;
	color: var(--text-3);
	font-size: 12.5px;
	font-weight: 600;
}

.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
	gap: 14px;
}

.card {
	display: flex;
	flex-direction: column;
	border-radius: var(--radius-xl);
	background: var(--surface-1);
	overflow: hidden;
	cursor: pointer;
	transition:
		transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
		box-shadow 0.2s var(--ease);
}

.card:hover {
	transform: translateY(-4px);
}

.card__cover {
	position: relative;
	height: 92px;
	background-color: color-mix(in srgb, var(--tint, #7d61e0) 55%, #1c1c20);
	background-image: linear-gradient(
		135deg,
		color-mix(in srgb, var(--tint, #7d61e0) 70%, #1c1c20),
		color-mix(in srgb, var(--tint, #7d61e0) 25%, #1c1c20)
	);
	background-position: center;
	background-size: cover;
	transition: transform 0.4s var(--ease);
}

.card:hover .card__cover {
	transform: scale(1.04);
}

.card__shade {
	position: absolute;
	inset: 0;
	background: linear-gradient(180deg, rgba(38, 38, 43, 0) 30%, var(--surface-1) 100%);
}

.card__body {
	position: relative;
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 10px;
	padding: 0 16px 14px;
}

.card__head {
	display: flex;
	align-items: flex-end;
	gap: 12px;
	margin-top: -30px;
}

.card__icon {
	width: 60px;
	height: 60px;
	flex-shrink: 0;
	border-radius: 16px;
	object-fit: cover;
	background: var(--surface-3);
	box-shadow:
		0 0 0 3px var(--surface-1),
		0 10px 24px rgba(0, 0, 0, 0.4);
}

.card__icon--blank {
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--text-3);
}

.card__icon--blank svg {
	width: 24px;
	height: 24px;
}

.card__titles {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 2px;
	padding-bottom: 2px;
}

.card__title {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 15.5px;
	font-weight: 700;
}

.card__author {
	color: var(--text-3);
	font-size: 12px;
	font-weight: 600;
}

.card__description {
	display: -webkit-box;
	overflow: hidden;
	color: var(--text-2);
	font-size: 13px;
	line-height: 1.45;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}

.card__tags {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.card__tag {
	padding: 2px 8px;
	border-radius: 7px;
	background: var(--surface-3);
	color: var(--text-2);
	font-size: 11.5px;
	font-weight: 600;
}

.card__footer {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 6px;
	margin-top: auto;
	padding-top: 4px;
}

.card__stat {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	height: 32px;
	border-radius: 10px;
	background: var(--surface-2);
	color: var(--text-2);
	font-size: 12.5px;
	font-weight: 700;
	white-space: nowrap;
}

.card__stat svg {
	width: 13px;
	height: 13px;
}

.card__install,
.card__installed {
	display: inline-flex;
	grid-column: 1 / -1;
	align-items: center;
	justify-content: center;
	gap: 7px;
	height: 38px;
	padding: 0 12px;
	border: 0;
	border-radius: 11px;
	font: inherit;
	font-size: 13.5px;
	font-weight: 700;
}

.card__install {
	background: var(--accent);
	color: #fff;
	cursor: pointer;
	transition: background-color 0.14s var(--ease);
}

.card__install:hover:not(:disabled) {
	background: var(--accent-hover);
}

.card__install:disabled {
	background: var(--surface-3);
	color: var(--text-3);
	cursor: default;
}

.card__installed {
	background: rgba(74, 222, 128, 0.12);
	color: var(--success);
}

.card__install svg,
.card__installed svg {
	width: 14px;
	height: 14px;
}

.card--skeleton {
	cursor: default;
	pointer-events: none;
}

.card--skeleton .card__cover,
.skeleton {
	background: linear-gradient(
		100deg,
		var(--surface-2) 30%,
		rgba(255, 255, 255, 0.06) 50%,
		var(--surface-2) 70%
	);
	background-size: 220% 100%;
	animation: shimmer 1.3s ease-in-out infinite;
}

.card--skeleton .card__body {
	gap: 10px;
	padding-top: 16px;
}

.skeleton {
	display: block;
	height: 12px;
	border-radius: 6px;
}

.skeleton--title {
	width: 60%;
	height: 16px;
}

.skeleton--short {
	width: 40%;
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
	padding: 70px 0;
	text-align: center;
}

.empty__icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 72px;
	height: 72px;
	margin-bottom: 6px;
	border-radius: 22px;
	background: var(--accent-soft);
	color: var(--accent-text);
}

.empty__icon svg {
	width: 30px;
	height: 30px;
}

.empty h2 {
	font-size: 22px;
}

.empty p {
	color: var(--text-3);
}

.sentinel {
	height: 1px;
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
