<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { onKeyStroke } from '@vueuse/core'
import dayjs from 'dayjs'
import DOMPurify from 'dompurify'
import {
	ArrowLeft,
	Bug,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Code2,
	Download,
	ExternalLink,
	FileText,
	Heart,
	Images,
	Layers,
	LoaderCircle,
	MessagesSquare,
	BookOpen,
	RefreshCw,
	X,
} from 'lucide-vue-next'
import { marked } from 'marked'
import { type Component, computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { type ContentKind, core, modpackLink } from '@/api/core'
import {
	type CatalogKind,
	getProject,
	getProjectVersions,
	type Project,
	type ProjectVersion,
} from '@/api/modrinth'
import InstanceIcon from '@/components/InstanceIcon.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiPopover from '@/components/ui/UiPopover.vue'
import { categoryLabels } from '@/composables/categories'
import { formatCount, loaderLabel } from '@/composables/format'
import { installModpack, latestVersion } from '@/composables/modpacks'
import { useStore } from '@/composables/store'
import { pushToast, reportError } from '@/composables/toasts'

type Tab = 'description' | 'versions' | 'gallery'

const VERSION_TYPES: Record<ProjectVersion['version_type'], string> = {
	release: 'Релиз',
	beta: 'Бета',
	alpha: 'Альфа',
}

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const { instances, selectedInstance, installJobs } = useStore()

const kind = computed<CatalogKind>(
	() =>
		(['mod', 'resourcepack', 'shader', 'modpack'] as const).find(
			(value) => value === route.query.type,
		) ?? 'mod',
)
const isPack = computed(() => kind.value === 'modpack')
const targetId = ref<string | null>(
	(route.query.instance as string | undefined) ?? selectedInstance.value?.id ?? null,
)
const target = computed(
	() => instances.value.find((instance) => instance.id === targetId.value) ?? null,
)
const targetOpen = ref(false)

const project = ref<Project | null>(null)
const versions = ref<ProjectVersion[]>([])
const tab = ref<Tab>('description')
const installedIds = ref(new Set<string>())
const installingVersion = ref<string | null>(null)
const lightbox = ref<number | null>(null)

const tabs = computed(() =>
	(
		[
			{ value: 'description', label: 'Описание', icon: FileText },
			{ value: 'versions', label: 'Версии', icon: Layers, count: versions.value.length },
			{
				value: 'gallery',
				label: 'Галерея',
				icon: Images,
				count: project.value?.gallery.length ?? 0,
			},
		] as { value: Tab; label: string; icon: Component; count?: number }[]
	).filter((entry) => entry.value !== 'gallery' || (entry.count ?? 0) > 0),
)

const html = computed(() =>
	project.value
		? DOMPurify.sanitize(marked.parse(project.value.body, { async: false }) as string)
		: '',
)

const isInstalled = computed(() => !!project.value && installedIds.value.has(project.value.id))

/** The instance created from this modpack, if it has been installed before. */
const packInstance = computed(() =>
	project.value
		? (instances.value.find((instance) => modpackLink(instance)?.projectId === project.value?.id) ??
			null)
		: null,
)
const packInstalling = computed(
	() => !!packInstance.value && installJobs.has(packInstance.value.id),
)

/** Hero background: the featured gallery image, or the project's brand colour as a gradient. */
const hero = computed(() => {
	const current = project.value
	if (!current) return {}
	const image = current.gallery.find((entry) => entry.featured) ?? current.gallery[0]
	const tint = current.color != null ? `#${current.color.toString(16).padStart(6, '0')}` : '#7d61e0'
	return {
		'--tint': tint,
		backgroundImage: image ? `url("${image.url}")` : undefined,
	}
})

const gameVersions = computed(() => project.value?.game_versions.slice(-8).reverse() ?? [])
const categories = computed(() => categoryLabels(project.value?.categories ?? []))

const links = computed(() =>
	(
		[
			{ label: 'Исходный код', url: project.value?.source_url, icon: Code2 },
			{ label: 'Баг-трекер', url: project.value?.issues_url, icon: Bug },
			{ label: 'Вики', url: project.value?.wiki_url, icon: BookOpen },
			{ label: 'Discord', url: project.value?.discord_url, icon: MessagesSquare },
		] as { label: string; url?: string | null; icon: Component }[]
	).filter((link): link is { label: string; url: string; icon: Component } => !!link.url),
)

async function loadProject() {
	try {
		project.value = await getProject(props.id)
	} catch (error) {
		reportError(error, 'Проект не найден')
	}
}

async function loadVersions() {
	if (!project.value) return
	const filter =
		target.value && !isPack.value
			? {
					gameVersion: target.value.game_version,
					loader: kind.value === 'mod' ? target.value.loader : undefined,
				}
			: undefined
	versions.value = await getProjectVersions(project.value.id, filter).catch(() => [])
}

async function loadInstalled() {
	installedIds.value = new Set(
		target.value ? await core.content.installedProjectIds(target.value.id).catch(() => []) : [],
	)
}

watch(
	() => props.id,
	async () => {
		project.value = null
		tab.value = 'description'
		await loadProject()
		await Promise.all([loadVersions(), loadInstalled()])
	},
	{ immediate: true },
)
watch(targetId, () => void Promise.all([loadVersions(), loadInstalled()]))

async function install(versionId: string | null = null) {
	if (isPack.value && project.value) {
		installingVersion.value = versionId ?? 'latest'
		try {
			await installModpack(project.value, versionId ?? latestVersion(versions.value)?.id)
		} catch (error) {
			reportError(error, 'Не удалось установить сборку')
		} finally {
			installingVersion.value = null
		}
		return
	}
	if (!target.value || !project.value) return
	installingVersion.value = versionId ?? 'latest'
	try {
		await core.content.install(target.value.id, {
			project_id: project.value.id,
			version_id: versionId,
			content_type: kind.value as ContentKind,
			selected: {
				game_versions: [target.value.game_version],
				loaders: kind.value === 'mod' ? [target.value.loader] : undefined,
			},
		})
		await loadInstalled()
		pushToast({
			kind: 'success',
			title: `${project.value.title} установлен`,
			text: target.value.name,
		})
	} catch (error) {
		reportError(error, 'Не удалось установить')
	} finally {
		installingVersion.value = null
	}
}

function onDescriptionClick(event: MouseEvent) {
	const link = (event.target as HTMLElement).closest('a')
	if (!link?.href) return
	event.preventDefault()
	void openUrl(link.href)
}

function pickTarget(id: string) {
	targetId.value = id
	targetOpen.value = false
}

function step(delta: number) {
	const count = project.value?.gallery.length ?? 0
	if (lightbox.value === null || !count) return
	lightbox.value = (lightbox.value + delta + count) % count
}

onKeyStroke('Escape', () => (lightbox.value = null))
onKeyStroke('ArrowLeft', () => step(-1))
onKeyStroke('ArrowRight', () => step(1))
</script>

<template>
	<div class="project">
		<template v-if="project">
			<header class="hero">
				<div class="hero__backdrop" :style="hero" />
				<div class="hero__shade" />
				<button class="hero__back" @click="router.back()"><ArrowLeft /> Каталог</button>
				<div class="hero__main">
					<img v-if="project.icon_url" :src="project.icon_url" alt="" class="hero__icon" />
					<span v-else class="hero__icon" />
					<div class="hero__info">
						<h1 class="hero__title">{{ project.title }}</h1>
						<p class="hero__description">{{ project.description }}</p>
						<p class="hero__stats">
							<span class="hero__chip"><Download /> {{ formatCount(project.downloads) }}</span>
							<span class="hero__chip"><Heart /> {{ formatCount(project.followers) }}</span>
							<span class="hero__chip">
								<RefreshCw /> обновлён {{ dayjs(project.updated).fromNow() }}
							</span>
						</p>
					</div>
					<div class="hero__install">
						<UiPopover v-if="!isPack" v-model:open="targetOpen" placement="bottom-end" width="100%">
							<template #trigger="{ toggle }">
								<button class="target" :class="{ 'target--open': targetOpen }" @click="toggle">
									<InstanceIcon
										v-if="target"
										:path="target.icon_path"
										:name="target.name"
										:size="34"
									/>
									<span class="target__text">
										<span class="target__label">В сборку</span>
										<span class="target__name">{{ target?.name ?? 'Выберите' }}</span>
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
						<span v-if="isPack && packInstalling" class="install install--busy">
							<LoaderCircle class="spin" /> Устанавливается…
						</span>
						<button
							v-else-if="isPack && packInstance"
							type="button"
							class="install install--done install--open"
							@click="router.push(`/instance/${packInstance.id}`)"
						>
							<Check /> Открыть сборку
						</button>
						<span v-else-if="isInstalled" class="install install--done"><Check /> Установлен</span>
						<button
							v-else
							type="button"
							class="install"
							:disabled="(!isPack && !target) || versions.length === 0 || !!installingVersion"
							@click="install()"
						>
							<LoaderCircle v-if="installingVersion" class="spin" />
							<Download v-else />
							{{
								versions.length === 0 && (target || isPack)
									? 'Нет версий'
									: installingVersion
										? 'Ставим…'
										: isPack
											? 'Установить сборку'
											: 'Установить'
							}}
						</button>
					</div>
				</div>
			</header>

			<div class="layout">
				<div class="main">
					<nav class="tabs" role="tablist">
						<button
							v-for="entry in tabs"
							:key="entry.value"
							type="button"
							role="tab"
							class="tab"
							:class="{ 'tab--active': tab === entry.value }"
							:aria-selected="tab === entry.value"
							@click="tab = entry.value"
						>
							<component :is="entry.icon" />
							{{ entry.label }}
							<span v-if="entry.count" class="tab__count">{{ entry.count }}</span>
						</button>
					</nav>

					<!-- eslint-disable-next-line vue/no-v-html -->
					<article
						v-if="tab === 'description'"
						class="card markdown selectable"
						@click="onDescriptionClick"
						v-html="html"
					/>

					<div v-else-if="tab === 'versions'" class="versions">
						<p v-if="versions.length === 0" class="card versions__empty">
							{{
								isPack
									? 'У сборки пока нет версий.'
									: `Нет версий для «${target?.name ?? 'выбранной сборки'}».`
							}}
						</p>
						<article v-for="version in versions" :key="version.id" class="version">
							<span class="version__type" :class="`version__type--${version.version_type}`">
								{{ VERSION_TYPES[version.version_type] }}
							</span>
							<div class="version__info">
								<strong class="version__name">{{ version.name || version.version_number }}</strong>
								<span class="version__meta">
									<span v-for="loader in version.loaders" :key="loader" class="version__chip">
										{{ loaderLabel(loader as never) }}
									</span>
									<span class="version__muted">
										{{ version.game_versions.slice(-3).join(', ') }}
									</span>
									<span class="version__muted">
										{{ dayjs(version.date_published).format('D MMM YYYY') }}
									</span>
									<span class="version__muted">
										<Download /> {{ formatCount(version.downloads) }}
									</span>
								</span>
							</div>
							<button
								type="button"
								class="version__install"
								:disabled="(!isPack && !target) || !!installingVersion"
								@click="install(version.id)"
							>
								<LoaderCircle v-if="installingVersion === version.id" class="spin" />
								<Download v-else />
								Эту версию
							</button>
						</article>
					</div>

					<div v-else class="gallery">
						<button
							v-for="(image, index) in project.gallery"
							:key="image.url"
							type="button"
							class="shot"
							@click="lightbox = index"
						>
							<img :src="image.url" :alt="image.title ?? ''" loading="lazy" />
							<span v-if="image.title" class="shot__title">{{ image.title }}</span>
						</button>
					</div>
				</div>

				<aside class="aside">
					<section class="card side">
						<h3 class="side__title">Совместимость</h3>
						<span class="side__label">Версии игры</span>
						<div class="chips">
							<span v-for="version in gameVersions" :key="version" class="chip">{{ version }}</span>
						</div>
						<template v-if="project.loaders.length">
							<span class="side__label">Загрузчики</span>
							<div class="chips">
								<span v-for="loader in project.loaders" :key="loader" class="chip chip--accent">
									{{ loaderLabel(loader as never) }}
								</span>
							</div>
						</template>
					</section>
					<section v-if="categories.length" class="card side">
						<h3 class="side__title">Категории</h3>
						<div class="chips">
							<span v-for="category in categories" :key="category" class="chip">{{
								category
							}}</span>
						</div>
					</section>
					<section v-if="links.length" class="card side">
						<h3 class="side__title">Ссылки</h3>
						<button
							v-for="link in links"
							:key="link.url"
							type="button"
							class="link"
							@click="openUrl(link.url)"
						>
							<component :is="link.icon" class="link__icon" />
							<span class="link__label">{{ link.label }}</span>
							<ExternalLink class="link__out" />
						</button>
					</section>
				</aside>
			</div>
		</template>

		<div v-else class="loading">
			<span class="loading__hero" />
			<span class="loading__line" />
			<span class="loading__line loading__line--short" />
		</div>

		<Teleport to="body">
			<Transition name="lightbox">
				<div v-if="project && lightbox !== null" class="lightbox" @click.self="lightbox = null">
					<button class="lightbox__close" aria-label="Закрыть" @click="lightbox = null">
						<X />
					</button>
					<button
						v-if="project.gallery.length > 1"
						class="lightbox__nav lightbox__nav--prev"
						aria-label="Предыдущая"
						@click="step(-1)"
					>
						<ChevronLeft />
					</button>
					<figure class="lightbox__figure">
						<img :src="project.gallery[lightbox].url" alt="" />
						<figcaption v-if="project.gallery[lightbox].title">
							{{ project.gallery[lightbox].title }}
						</figcaption>
					</figure>
					<button
						v-if="project.gallery.length > 1"
						class="lightbox__nav lightbox__nav--next"
						aria-label="Следующая"
						@click="step(1)"
					>
						<ChevronRight />
					</button>
				</div>
			</Transition>
		</Teleport>
	</div>
</template>

<style scoped>
.project {
	height: 100%;
	padding: var(--titlebar-clearance) var(--page-gutter) var(--nav-clearance);
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: var(--surface-4) transparent;
}

.hero {
	position: relative;
	margin-bottom: 18px;
	padding: 18px 28px 28px;
	border-radius: var(--radius-xl);
	background: var(--surface-1);
	overflow: hidden;
	isolation: isolate;
}

.hero__backdrop {
	position: absolute;
	inset: -10%;
	z-index: -2;
	background-color: color-mix(in srgb, var(--tint, #7d61e0) 45%, #1c1c20);
	background-position: center;
	background-size: cover;
	filter: blur(18px) saturate(1.2);
	opacity: 0.55;
}

.hero__shade {
	position: absolute;
	inset: 0;
	z-index: -1;
	background:
		linear-gradient(90deg, rgba(23, 27, 30, 0.55), rgba(23, 27, 30, 0.85) 70%),
		linear-gradient(180deg, transparent 40%, rgba(23, 27, 30, 0.6));
}

.hero__back {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 0;
	border: 0;
	background: transparent;
	color: rgba(255, 255, 255, 0.72);
	font: inherit;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	transition: color 0.14s var(--ease);
}

.hero__back:hover {
	color: #fff;
}

.hero__back svg {
	width: 15px;
	height: 15px;
}

.hero__main {
	display: flex;
	align-items: center;
	gap: 22px;
	margin-top: 18px;
}

.hero__icon {
	width: 104px;
	height: 104px;
	flex-shrink: 0;
	border-radius: 24px;
	object-fit: cover;
	background: var(--surface-3);
}

.hero__info {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	gap: 8px;
}

.hero__title {
	font-size: 36px;
	line-height: 1.05;
	overflow-wrap: anywhere;
}

.hero__description {
	display: -webkit-box;
	overflow: hidden;
	color: rgba(255, 255, 255, 0.78);
	font-size: 14px;
	line-height: 1.45;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}

.hero__stats {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 2px;
}

.hero__chip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 4px 10px;
	border-radius: 8px;
	background: rgba(0, 0, 0, 0.35);
	color: #fff;
	font-size: 12px;
	font-weight: 700;
	backdrop-filter: blur(6px);
}

.hero__chip svg {
	width: 13px;
	height: 13px;
}

.hero__install {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	gap: 6px;
	padding: 6px;
	border-radius: 18px;
	background: var(--panel);
	backdrop-filter: blur(10px);
}

.target {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 230px;
	height: 52px;
	padding: 0 12px 0 9px;
	border: 0;
	border-radius: 13px;
	background: transparent;
	color: var(--text);
	text-align: left;
	cursor: pointer;
	transition: background-color 0.14s var(--ease);
}

.target:hover,
.target--open {
	background: var(--surface-3);
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

.install {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-width: 170px;
	height: 52px;
	padding: 0 22px;
	border: 0;
	border-radius: 13px;
	background: var(--accent);
	color: #fff;
	font-family: var(--font-heading);
	font-size: 15px;
	font-weight: 700;
	cursor: pointer;
	transition: background-color 0.14s var(--ease);
}

.install:hover:not(:disabled) {
	background: var(--accent-hover);
}

.install:disabled {
	background: var(--surface-3);
	color: var(--text-3);
	cursor: default;
}

.install--busy {
	background: var(--surface-3);
	color: var(--text-2);
	cursor: default;
}

.install--open {
	cursor: pointer;
}

.install--open:hover {
	background: rgba(74, 222, 128, 0.22);
}

.install--done {
	background: rgba(74, 222, 128, 0.14);
	color: var(--success);
	cursor: default;
}

.install svg {
	width: 17px;
	height: 17px;
}

.layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 290px;
	gap: 18px;
	align-items: start;
}

.main {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 14px;
}

.tabs {
	display: flex;
	gap: 6px;
}

.tab {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	height: 42px;
	padding: 0 16px;
	border: 0;
	border-radius: 12px;
	background: var(--surface-1);
	color: var(--text-2);
	font: inherit;
	font-size: 14px;
	font-weight: 700;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.tab:hover {
	background: var(--surface-2);
	color: var(--text);
}

.tab--active,
.tab--active:hover {
	background: var(--accent-soft);
	color: #fff;
}

.tab svg {
	width: 16px;
	height: 16px;
}

.tab--active svg {
	color: var(--accent-text);
}

.tab__count {
	padding: 1px 7px;
	border-radius: 7px;
	background: rgba(0, 0, 0, 0.3);
	color: var(--text-2);
	font-size: 11.5px;
}

.card {
	border-radius: var(--radius-xl);
	background: var(--surface-1);
}

.markdown {
	padding: 26px 30px;
	color: var(--text-2);
	line-height: 1.7;
	overflow-wrap: anywhere;
}

.markdown :deep(> :first-child) {
	margin-top: 0;
}

.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3) {
	margin: 1.5em 0 0.5em;
	color: var(--text);
	letter-spacing: -0.01em;
}

.markdown :deep(h1) {
	font-size: 22px;
}

.markdown :deep(h2) {
	font-size: 18px;
}

.markdown :deep(h3) {
	font-size: 15px;
}

.markdown :deep(p) {
	margin: 0.7em 0;
}

.markdown :deep(a) {
	color: var(--accent-text);
}

.markdown :deep(img) {
	max-width: 100%;
	height: auto;
	border-radius: var(--radius-md);
}

.markdown :deep(code) {
	padding: 1px 6px;
	border-radius: 5px;
	background: var(--surface-3);
	font-size: 12.5px;
}

.markdown :deep(pre) {
	padding: 14px;
	border-radius: var(--radius-md);
	background: var(--surface-2);
	overflow-x: auto;
}

.markdown :deep(hr) {
	height: 1px;
	margin: 1.5em 0;
	border: 0;
	background: var(--surface-3);
}

.markdown :deep(ul),
.markdown :deep(ol) {
	padding-left: 1.3em;
}

.markdown :deep(blockquote) {
	margin: 1em 0;
	padding: 4px 0 4px 14px;
	border-left: 3px solid var(--accent);
	color: var(--text-3);
}

.versions {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.versions__empty {
	padding: 22px;
	color: var(--text-3);
	text-align: center;
}

.version {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 12px 12px 12px 14px;
	border-radius: var(--radius-lg);
	background: var(--surface-1);
	transition: background-color 0.14s var(--ease);
}

.version:hover {
	background: var(--surface-2);
}

.version__type {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 64px;
	height: 40px;
	flex-shrink: 0;
	border-radius: 10px;
	font-size: 12px;
	font-weight: 800;
}

.version__type--release {
	background: rgba(74, 222, 128, 0.14);
	color: var(--success);
}

.version__type--beta {
	background: rgba(227, 178, 60, 0.16);
	color: #f0c454;
}

.version__type--alpha {
	background: var(--danger-soft);
	color: var(--danger);
}

.version__info {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	gap: 5px;
}

.version__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 14.5px;
	font-weight: 700;
}

.version__meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 12px;
}

.version__chip {
	padding: 1px 7px;
	border-radius: 6px;
	background: var(--surface-3);
	color: var(--text-2);
	font-size: 11.5px;
	font-weight: 700;
}

.version__muted {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--text-3);
	font-size: 12px;
}

.version__muted svg {
	width: 12px;
	height: 12px;
}

.version__install {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 36px;
	padding: 0 14px;
	border: 0;
	border-radius: 10px;
	background: var(--surface-3);
	color: var(--text);
	font: inherit;
	font-size: 13px;
	font-weight: 700;
	cursor: pointer;
	transition: background-color 0.14s var(--ease);
}

.version__install:hover:not(:disabled) {
	background: var(--accent);
}

.version__install:disabled {
	color: var(--text-3);
	cursor: default;
}

.version__install svg {
	width: 15px;
	height: 15px;
}

.gallery {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 12px;
}

.shot {
	position: relative;
	padding: 0;
	border: 0;
	border-radius: var(--radius-lg);
	background: var(--surface-1);
	overflow: hidden;
	cursor: zoom-in;
}

.shot img {
	display: block;
	width: 100%;
	aspect-ratio: 16 / 9;
	object-fit: cover;
	transition: transform 0.4s var(--ease);
}

.shot:hover img {
	transform: scale(1.06);
}

.shot__title {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	padding: 18px 12px 10px;
	background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.75));
	color: #fff;
	font-size: 12.5px;
	font-weight: 600;
	text-align: left;
}

.aside {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.side {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 16px 18px;
}

.side__title {
	font-size: 15px;
	font-weight: 700;
}

.side__label {
	color: var(--text-3);
	font-size: 12px;
	font-weight: 700;
}

.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.chip {
	padding: 4px 9px;
	border-radius: 8px;
	background: var(--surface-3);
	color: var(--text-2);
	font-size: 12px;
	font-weight: 700;
}

.chip--accent {
	background: var(--accent-soft);
	color: var(--accent-text);
}

.link {
	display: flex;
	align-items: center;
	gap: 10px;
	height: 40px;
	padding: 0 12px;
	border: 0;
	border-radius: 10px;
	background: var(--surface-2);
	color: var(--text-2);
	font: inherit;
	font-size: 13.5px;
	font-weight: 600;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.link:hover {
	background: var(--surface-3);
	color: var(--text);
}

.link__icon {
	width: 16px;
	height: 16px;
	color: var(--accent-text);
}

.link__label {
	flex: 1;
	text-align: left;
}

.link__out {
	width: 14px;
	height: 14px;
	color: var(--text-3);
}

.loading {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.loading__hero,
.loading__line {
	display: block;
	border-radius: var(--radius-xl);
	background: linear-gradient(
		100deg,
		var(--surface-1) 30%,
		rgba(255, 255, 255, 0.05) 50%,
		var(--surface-1) 70%
	);
	background-size: 220% 100%;
	animation: shimmer 1.3s ease-in-out infinite;
}

.loading__hero {
	height: 200px;
}

.loading__line {
	height: 42px;
	width: 60%;
}

.loading__line--short {
	width: 35%;
}

@keyframes shimmer {
	from {
		background-position: 120% 0;
	}
	to {
		background-position: -120% 0;
	}
}

.lightbox {
	position: fixed;
	inset: 0;
	z-index: 35000;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 18px;
	padding: 48px;
	background: rgba(6, 6, 8, 0.88);
	backdrop-filter: blur(8px);
}

.lightbox__figure {
	display: flex;
	max-width: min(1400px, 100%);
	max-height: 100%;
	margin: 0;
	flex-direction: column;
	align-items: center;
	gap: 10px;
}

.lightbox__figure img {
	max-width: 100%;
	max-height: calc(100vh - 140px);
	border-radius: var(--radius-lg);
	box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
}

.lightbox__figure figcaption {
	color: var(--text-2);
	font-size: 13px;
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

.lightbox-enter-active,
.lightbox-leave-active {
	transition: opacity 0.18s var(--ease);
}

.lightbox-enter-from,
.lightbox-leave-to {
	opacity: 0;
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
