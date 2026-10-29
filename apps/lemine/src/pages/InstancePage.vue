<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import dayjs from 'dayjs'
import {
	ArrowLeft,
	Blocks,
	Clock3,
	Ellipsis,
	FolderOpen,
	Globe,
	Hourglass,
	Image as ImageIcon,
	Package,
	Pencil,
	RefreshCw,
	ScrollText,
	Settings2,
	Sparkles,
	Trash2,
	Wrench,
} from 'lucide-vue-next'
import { computed, type Component, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { type ContentItem, core, modpackLink, type World } from '@/api/core'
import { useAppEvent } from '@/api/events'
import IconEditorModal from '@/components/IconEditorModal.vue'
import InstanceContent, { type ContentFilter } from '@/components/instance/InstanceContent.vue'
import InstanceLog from '@/components/instance/InstanceLog.vue'
import InstanceSettings from '@/components/instance/InstanceSettings.vue'
import InstanceWorlds from '@/components/instance/InstanceWorlds.vue'
import InstanceIcon from '@/components/InstanceIcon.vue'
import PlayButton from '@/components/PlayButton.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiMenuItem from '@/components/ui/UiMenuItem.vue'
import UiModal from '@/components/ui/UiModal.vue'
import UiPopover from '@/components/ui/UiPopover.vue'
import { loaderLabel } from '@/composables/format'
import { applyIcon, fromConfig, type IconChoice } from '@/composables/instance-icons'
import {
	availablePackUpdate,
	installedPackVersion,
	loadPackVersions,
	packAuthor,
	updateModpack,
} from '@/composables/modpacks'
import { removeInstance, useStore } from '@/composables/store'
import { reportError } from '@/composables/toasts'

type Section = ContentFilter | 'worlds' | 'log' | 'settings'

const props = defineProps<{ id: string }>()

const router = useRouter()
const { instances, selectedInstanceId, running, runningAs, refreshInstances, installJobs } =
	useStore()

const section = ref<Section>('mod')
const content = ref<ContentItem[]>([])
const worlds = ref<World[]>([])
const iconEditorOpen = ref(false)
const savingIcon = ref(false)
const confirmDelete = ref(false)
const confirmUpdate = ref(false)
const updating = ref(false)
const menuOpen = ref(false)

const instance = computed(() => instances.value.find((entry) => entry.id === props.id) ?? null)

const pack = computed(() => (instance.value ? modpackLink(instance.value) : null))
const author = computed(() => (pack.value ? packAuthor(pack.value.projectId) : undefined))
const packVersion = computed(() => (instance.value ? installedPackVersion(instance.value) : null))
const packUpdate = computed(() => (instance.value ? availablePackUpdate(instance.value) : null))
const packBusy = computed(
	() => !!instance.value && (running.has(instance.value.id) || installJobs.has(instance.value.id)),
)

const countOf = (type: ContentFilter) =>
	content.value.filter((item) => item.project_type === type).length
const updatesOf = (type: ContentFilter) =>
	content.value.filter((item) => item.project_type === type && item.has_update).length

const nav = computed<
	{ value: Section; label: string; icon: Component; count?: number; dot?: boolean }[]
>(() => [
	{ value: 'mod', label: 'Моды', icon: Blocks, count: countOf('mod'), dot: updatesOf('mod') > 0 },
	{
		value: 'resourcepack',
		label: 'Ресурспаки',
		icon: ImageIcon,
		count: countOf('resourcepack'),
		dot: updatesOf('resourcepack') > 0,
	},
	{
		value: 'shaderpack',
		label: 'Шейдеры',
		icon: Sparkles,
		count: countOf('shaderpack'),
		dot: updatesOf('shaderpack') > 0,
	},
	{ value: 'worlds', label: 'Миры', icon: Globe, count: worlds.value.length },
	{ value: 'log', label: 'Лог игры', icon: ScrollText },
	{ value: 'settings', label: 'Настройки', icon: Settings2 },
])

const hoursPlayed = computed(() => {
	const current = instance.value
	if (!current) return 0
	return Math.floor((current.submitted_time_played + current.recent_time_played) / 3600)
})

const stats = computed(() => {
	const current = instance.value
	if (!current) return []
	const singleplayer = worlds.value.filter((world) => world.type === 'singleplayer').length
	return [
		{ label: 'mods', icon: Blocks, text: plural(countOf('mod'), 'мод', 'мода', 'модов') },
		{ label: 'worlds', icon: Globe, text: plural(singleplayer, 'мир', 'мира', 'миров') },
		{ label: 'hours', icon: Hourglass, text: `${hoursPlayed.value} ч в игре` },
	]
})

function plural(count: number, one: string, few: string, many: string) {
	const mod10 = count % 10
	const mod100 = count % 100
	const word =
		mod10 === 1 && mod100 !== 11
			? one
			: mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
				? few
				: many
	return `${count} ${word}`
}

const lastPlayed = computed(() =>
	instance.value?.last_played
		? `Играли ${dayjs(instance.value.last_played).fromNow()}`
		: 'Ещё не запускалась',
)

async function loadCounts() {
	const instanceId = props.id
	const current = instance.value
	const [items, list] = await Promise.all([
		current ? core.content.list(current).catch(() => null) : null,
		core.worlds.list(instanceId).catch(() => null),
	])
	if (instanceId !== props.id) return
	if (items) content.value = items
	if (list) worlds.value = list
}

watch(
	() => props.id,
	(id) => {
		selectedInstanceId.value = id
		section.value = instance.value?.loader === 'vanilla' ? 'resourcepack' : 'mod'
		void loadCounts()
		if (pack.value) void loadPackVersions(pack.value.projectId, true).catch(() => {})
	},
	{ immediate: true },
)

watch(instance, (current) => {
	if (!current && instances.value.length > 0) void router.replace('/')
})

const loadCountsSoon = useDebounceFn(() => {
	if (!installJobs.has(props.id)) void loadCounts()
}, 800)

useAppEvent('instance', (payload) => {
	if (payload.instance_id === props.id) void loadCountsSoon()
})

watch(
	() => installJobs.has(props.id),
	(busy, wasBusy) => {
		if (wasBusy && !busy) void loadCounts()
	},
)

function fromMenu(action: () => void) {
	menuOpen.value = false
	action()
}

async function openFolder() {
	try {
		await core.system.openPath(await core.instances.fullPath(props.id))
	} catch (error) {
		reportError(error, 'Не удалось открыть папку')
	}
}

async function repair() {
	if (!instance.value) return
	await core.instances
		.repair(instance.value)
		.catch((error) => reportError(error, 'Не удалось переустановить'))
}

function openPackPage() {
	if (!pack.value) return
	void router.push({ path: `/catalog/${pack.value.projectId}`, query: { type: 'modpack' } })
}

async function runPackUpdate() {
	if (!instance.value || !packUpdate.value) return
	updating.value = true
	try {
		await updateModpack(instance.value, packUpdate.value)
		confirmUpdate.value = false
	} catch (error) {
		reportError(error, 'Не удалось обновить сборку')
	} finally {
		updating.value = false
	}
}

async function saveIcon(choice: IconChoice) {
	savingIcon.value = true
	try {
		await applyIcon(props.id, choice)
		await refreshInstances()
		iconEditorOpen.value = false
	} catch (error) {
		reportError(error, 'Не удалось сменить иконку')
	} finally {
		savingIcon.value = false
	}
}

async function remove() {
	if (!instance.value) return
	confirmDelete.value = false
	await removeInstance(instance.value)
	await router.replace('/')
}
</script>

<template>
	<div v-if="instance" class="instance-page">
		<header class="banner">
			<div class="banner__main">
				<button class="banner__icon" aria-label="Сменить иконку" @click="iconEditorOpen = true">
					<InstanceIcon :path="instance.icon_path" :name="instance.name" :size="64" />
					<span class="banner__icon-hint"><Pencil /></span>
				</button>
				<div class="banner__info">
					<div class="banner__tags">
						<RouterLink to="/instances" class="banner__tag banner__tag--back">
							<ArrowLeft /> Сборки
						</RouterLink>
						<span class="banner__tag">{{ loaderLabel(instance.loader) }}</span>
						<span class="banner__tag">{{ instance.game_version }}</span>
						<button
							v-if="pack"
							v-tip="'Открыть страницу сборки на Modrinth'"
							type="button"
							class="banner__tag banner__tag--pack"
							@click="openPackPage"
						>
							<Package />
							{{ author ? `Сборка от ${author}` : 'Сборка с Modrinth'
							}}{{ packVersion ? ` · ${packVersion.version_number}` : '' }}
						</button>
						<span v-if="running.has(instance.id)" class="banner__tag banner__tag--live">
							<span class="banner__live-dot" />
							Запущена{{
								runningAs.get(instance.id) ? ` · ${runningAs.get(instance.id)!.profile.name}` : ''
							}}
						</span>
					</div>
					<h1 class="banner__title">{{ instance.name }}</h1>
					<p class="banner__meta">
						<span><Clock3 /> {{ lastPlayed }}</span>
						<span v-for="stat in stats" :key="stat.label">
							<component :is="stat.icon" /> {{ stat.text }}
						</span>
					</p>
				</div>
				<div class="banner__actions">
					<UiButton variant="secondary" size="sm" @click="openFolder"
						><FolderOpen /> Папка</UiButton
					>
					<button
						v-if="packUpdate"
						v-tip="
							packBusy
								? 'Дождитесь, пока игра закроется'
								: `Автор выпустил версию ${packUpdate.version_number}`
						"
						type="button"
						class="banner__update"
						:disabled="packBusy"
						@click="confirmUpdate = true"
					>
						<RefreshCw /> Обновить сборку
					</button>
					<UiPopover v-model:open="menuOpen" placement="bottom-end" width="230px">
						<template #trigger="{ toggle }">
							<button
								type="button"
								class="banner__more"
								:class="{ 'banner__more--open': menuOpen }"
								aria-label="Ещё"
								@click="toggle"
							>
								<Ellipsis />
							</button>
						</template>
						<UiMenuItem @click="fromMenu(openFolder)"><FolderOpen /> Открыть папку</UiMenuItem>
						<UiMenuItem @click="fromMenu(() => (iconEditorOpen = true))">
							<Pencil /> Сменить иконку
						</UiMenuItem>
						<UiMenuItem @click="fromMenu(repair)"><Wrench /> Переустановить</UiMenuItem>
						<UiMenuItem danger @click="fromMenu(() => (confirmDelete = true))">
							<Trash2 /> Удалить сборку
						</UiMenuItem>
					</UiPopover>
					<PlayButton :instance="instance" compact class="banner__play" />
				</div>
			</div>
		</header>

		<div class="instance-workspace">
			<nav class="tabs" role="tablist" aria-label="Разделы сборки" aria-orientation="vertical">
				<button
					v-for="entry in nav"
					:key="entry.value"
					type="button"
					role="tab"
					class="tab"
					:class="{ 'tab--active': section === entry.value }"
					:aria-selected="section === entry.value"
					@click="section = entry.value"
				>
					<component :is="entry.icon" class="tab__icon" />
					{{ entry.label }}
					<span v-if="entry.count" class="tab__count">{{ entry.count }}</span>
					<span v-if="entry.dot" v-tip="'Есть обновления'" class="tab__dot" />
				</button>
			</nav>

			<section class="panel">
				<header class="panel__heading">
					<h2>{{ nav.find((entry) => entry.value === section)?.label }}</h2>
					<p v-if="section === 'settings'">Параметры запуска только для этой сборки</p>
				</header>
				<InstanceContent
					:key="instance.id + section"
					v-if="section === 'mod' || section === 'resourcepack' || section === 'shaderpack'"
					:instance="instance"
					:type="section"
				/>
				<InstanceWorlds v-else-if="section === 'worlds'" :instance="instance" />
				<InstanceLog v-else-if="section === 'log'" :instance="instance" />
				<InstanceSettings v-else :key="instance.id" :instance="instance" />
			</section>
		</div>

		<IconEditorModal
			v-model:open="iconEditorOpen"
			:initial="fromConfig(instance.icon_config)"
			:busy="savingIcon"
			@save="saveIcon"
		/>

		<UiModal v-model:open="confirmUpdate" title="Обновить сборку?" width="440px">
			<div v-if="packUpdate" class="update">
				<p class="update__versions">
					<span class="update__chip">{{ packVersion?.version_number ?? 'текущая' }}</span>
					→
					<span class="update__chip update__chip--new">{{ packUpdate.version_number }}</span>
				</p>
				<ul class="update__list">
					<li>Моды и файлы сборки заменятся новыми от автора.</li>
					<li>То, что вы добавили сами, останется на месте.</li>
					<li>Миры, скриншоты и ваши настройки не тронутся.</li>
				</ul>
			</div>
			<template #footer>
				<UiButton variant="ghost" @click="confirmUpdate = false">Отмена</UiButton>
				<UiButton variant="primary" :disabled="updating || packBusy" @click="runPackUpdate">
					{{ updating ? 'Запускаем…' : 'Обновить' }}
				</UiButton>
			</template>
		</UiModal>

		<UiModal v-model:open="confirmDelete" title="Удалить сборку?" width="400px">
			<p class="muted">
				«{{ instance.name }}» будет удалена вместе с модами, мирами и настройками. Это нельзя
				отменить.
			</p>
			<template #footer>
				<UiButton variant="ghost" @click="confirmDelete = false">Отмена</UiButton>
				<UiButton variant="danger" @click="remove">Удалить</UiButton>
			</template>
		</UiModal>
	</div>
</template>

<style scoped>
.instance-workspace {
	display: grid;
	grid-template-columns: 170px minmax(0, 1fr);
	gap: 24px;
	flex: 1;
	min-height: 0;
}
.panel__heading {
	margin-bottom: 16px;
	flex-shrink: 0;
}
.panel__heading h2 {
	font-size: 21px;
}
.panel__heading p {
	margin-top: 4px;
	color: var(--text-3);
	font-size: 13px;
}
.tab__count {
	margin-left: auto;
}
@media (max-width: 1200px) {
	.banner__main {
		flex-wrap: wrap;
	}
	.banner__actions {
		width: 100%;
	}
	.instance-workspace {
		grid-template-columns: 150px minmax(0, 1fr);
		gap: 16px;
	}
}

.instance-page {
	display: flex;
	flex-direction: column;
	gap: 24px;
	height: 100%;
	padding: var(--titlebar-clearance) var(--page-gutter) 0;
}

.banner {
	position: relative;
	flex-shrink: 0;
	padding: 18px 20px;
	border-radius: var(--radius-xl);
	background: var(--surface-1);
	overflow: hidden;
	isolation: isolate;
}

.banner__main {
	display: flex;
	align-items: center;
	gap: 20px;
}

.banner__icon {
	position: relative;
	display: flex;
	flex-shrink: 0;
	padding: 0;
	border: 0;
	border-radius: 22%;
	background: transparent;
	overflow: hidden;
	cursor: pointer;
}

.banner__icon-hint {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.5);
	color: #fff;
	opacity: 0;
	transition: opacity 0.14s var(--ease);
}

.banner__icon:hover .banner__icon-hint {
	opacity: 1;
}

.banner__icon-hint svg {
	width: 22px;
	height: 22px;
}

.banner__info {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 7px;
	min-width: 0;
}

.banner__tags {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.banner__tag {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 3px 9px;
	border: 0;
	border-radius: 7px;
	background: rgba(0, 0, 0, 0.35);
	color: #fff;
	font: inherit;
	font-size: 12px;
	font-weight: 700;
	backdrop-filter: blur(6px);
}

.banner__tag svg {
	width: 13px;
	height: 13px;
}

.banner__tag--back,
.banner__tag--pack {
	cursor: pointer;
	transition: background-color 0.14s var(--ease);
}

.banner__tag--back {
	color: rgba(255, 255, 255, 0.75);
}

.banner__tag--back:hover,
.banner__tag--pack:hover {
	background: rgba(0, 0, 0, 0.55);
	color: #fff;
}

.banner__tag--pack {
	background: var(--accent-soft);
}

.banner__tag--live {
	background: rgba(74, 222, 128, 0.18);
	color: var(--success);
}

.banner__live-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: currentColor;
}

.banner__title {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 27px;
	line-height: 1.05;
}

.banner__meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 18px;
	color: rgba(255, 255, 255, 0.7);
	font-size: 13px;
}

.banner__meta span {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.banner__meta svg {
	width: 14px;
	height: 14px;
}

.banner__actions {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	gap: 6px;
	padding: 0;
	flex-wrap: wrap;
	justify-content: flex-end;
}

.banner__update,
.banner__more {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	height: 36px;
	border: 0;
	border-radius: 13px;
	font: inherit;
	font-size: 14px;
	font-weight: 700;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.banner__update {
	padding: 0 16px;
	background: var(--accent-soft);
	color: var(--accent-text);
}

.banner__update:hover:not(:disabled) {
	background: rgba(36, 207, 120, 0.32);
	color: #fff;
}

.banner__update:disabled {
	color: var(--text-3);
	cursor: default;
}

.banner__more {
	width: 36px;
	background: transparent;
	color: var(--text-2);
}

.banner__more:hover,
.banner__more--open {
	background: var(--surface-3);
	color: var(--text);
}

.banner__update svg,
.banner__more svg {
	width: 18px;
	height: 18px;
}

.banner__play :deep(.play__main) {
	min-width: 130px;
	border-radius: 13px;
}

.tabs {
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
	gap: 6px;
	overflow-y: auto;
	scrollbar-width: none;
}

.tab {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	gap: 8px;
	height: 42px;
	padding: 0 14px;
	border: 0;
	border-radius: 12px;
	background: transparent;
	color: var(--text-2);
	font: inherit;
	font-size: 13px;
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

.tab__icon {
	width: 16px;
	height: 16px;
}

.tab--active .tab__icon {
	color: var(--accent-text);
}

.tab__count {
	padding: 1px 7px;
	border-radius: 7px;
	background: rgba(0, 0, 0, 0.3);
	color: var(--text-2);
	font-size: 11.5px;
}

.tab__dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--accent);
}

.panel {
	display: flex;
	flex: 1;
	min-height: 0;
	flex-direction: column;
	min-width: 0;
	padding-right: 8px;
	padding-bottom: var(--nav-clearance);
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: var(--surface-4) transparent;
}

.panel > :last-child {
	flex: 0 0 auto;
}

.panel > .log {
	flex: 1;
	min-height: 0;
}

.update {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.update__versions {
	display: flex;
	align-items: center;
	gap: 10px;
	color: var(--text-3);
	font-weight: 700;
}

.update__chip {
	padding: 4px 10px;
	border-radius: 8px;
	background: var(--surface-3);
	color: var(--text-2);
	font-size: 13px;
}

.update__chip--new {
	background: var(--accent-soft);
	color: var(--accent-text);
}

.update__list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-left: 18px;
	color: var(--text-2);
	font-size: 13.5px;
	line-height: 1.5;
}
</style>
