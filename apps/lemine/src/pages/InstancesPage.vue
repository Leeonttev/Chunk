<script setup lang="ts">
import dayjs from 'dayjs'
import {
	ChevronRight,
	Folder,
	FolderPlus,
	Pencil,
	Plus,
	RefreshCw,
	Settings2,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { type Instance, modpackLink } from '@/api/core'
import FolderModal from '@/components/FolderModal.vue'
import InstanceIcon from '@/components/InstanceIcon.vue'
import PlayButton from '@/components/PlayButton.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import { loaderLabel } from '@/composables/format'
import { ICON_BACKGROUNDS } from '@/composables/instance-icons'
import { type InstanceGroup, useInstanceGroups } from '@/composables/instance-groups'
import { availablePackUpdate, loadPackVersions } from '@/composables/modpacks'
import { useStore } from '@/composables/store'
import { createInstanceOpen } from '@/composables/ui-state'

const router = useRouter()
const { instances, selectedInstanceId, running, runningAs, installJobs } = useStore()
const { groups, assignments, collapsedGroups, moveInstance, toggleGroupCollapsed } =
	useInstanceGroups()

watch(
	() => instances.value.map((instance) => modpackLink(instance)?.projectId),
	(projectIds) => {
		for (const projectId of new Set(projectIds)) {
			if (projectId) void loadPackVersions(projectId).catch(() => {})
		}
	},
	{ immediate: true },
)

const folderModalOpen = ref(false)
const editingGroup = ref<InstanceGroup | null>(null)
const draggedInstanceId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const dragPosition = ref({ x: 0, y: 0 })
const pointerDrag = ref<{
	instanceId: string
	pointerId: number
	startX: number
	startY: number
	active: boolean
} | null>(null)
let suppressCardClick = false

/** Folders first, then a virtual "no folder" section that also works as a drop target. */
const sections = computed(() => [
	...groups.value.map((group) => ({
		...group,
		virtual: false,
		instances: instances.value.filter((instance) => assignments.value[instance.id] === group.id),
	})),
	{
		id: 'ungrouped',
		name: groups.value.length ? 'Без папки' : 'Все сборки',
		virtual: true,
		instances: instances.value.filter(
			(instance) => !groups.value.some((group) => group.id === assignments.value[instance.id]),
		),
	},
])
const draggedInstance = computed(() =>
	instances.value.find((instance) => instance.id === draggedInstanceId.value),
)
const countLabel = computed(() => {
	const count = instances.value.length
	const mod10 = count % 10
	const mod100 = count % 100
	const word =
		mod10 === 1 && mod100 !== 11
			? 'сборка'
			: mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
				? 'сборки'
				: 'сборок'
	return `${count} ${word}`
})
const runningCount = computed(() => instances.value.filter((entry) => running.has(entry.id)).length)

function cover(instance: Instance) {
	let hash = 7
	for (const char of instance.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
	const fallback = ICON_BACKGROUNDS[hash % ICON_BACKGROUNDS.length]
	const top = instance.icon_config?.background.top_color ?? fallback.top
	const bottom = instance.icon_config?.background.bottom_color ?? fallback.bottom
	return { backgroundImage: 'linear-gradient(145deg, ' + top + '55, ' + bottom + '18)' }
}

function lastPlayed(instance: Instance) {
	return instance.last_played ? dayjs(instance.last_played).fromNow() : 'ещё не запускалась'
}

function openFolderModal(group: InstanceGroup | null) {
	editingGroup.value = group
	folderModalOpen.value = true
}

const editingInstances = computed(() =>
	editingGroup.value
		? instances.value.filter(
				(instance) => assignments.value[instance.id] === editingGroup.value?.id,
			)
		: [],
)

function openInstance(instance: Instance) {
	if (suppressCardClick) return
	selectedInstanceId.value = instance.id
	void router.push(`/instance/${instance.id}`)
}

function startPointerDrag(event: PointerEvent, instanceId: string) {
	if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
	const card = event.currentTarget as HTMLElement
	card.setPointerCapture(event.pointerId)
	pointerDrag.value = {
		instanceId,
		pointerId: event.pointerId,
		startX: event.clientX,
		startY: event.clientY,
		active: false,
	}
}

function updatePointerDrag(event: PointerEvent) {
	const drag = pointerDrag.value
	if (!drag || drag.pointerId !== event.pointerId) return
	if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6)
		return
	drag.active = true
	draggedInstanceId.value = drag.instanceId
	dragPosition.value = { x: event.clientX, y: event.clientY }
	suppressCardClick = true
	const target = document
		.elementFromPoint(event.clientX, event.clientY)
		?.closest<HTMLElement>('[data-drop-group]')
	dropTargetId.value = target?.dataset.dropGroup ?? null
}

function finishPointerDrag(event: PointerEvent) {
	const drag = pointerDrag.value
	if (!drag || drag.pointerId !== event.pointerId) return
	if (drag.active && dropTargetId.value) {
		moveInstance(drag.instanceId, dropTargetId.value === 'ungrouped' ? null : dropTargetId.value)
	}
	pointerDrag.value = null
	draggedInstanceId.value = null
	dropTargetId.value = null
	window.setTimeout(() => (suppressCardClick = false), 0)
}
</script>

<template>
	<div class="library">
		<header class="head">
			<div>
				<h1 class="head__title">Мои сборки</h1>
				<p class="head__stats">
					<span>{{ countLabel }}</span>
					<span v-if="groups.length">{{ groups.length }} в папках</span>
					<span v-if="runningCount" class="head__live">
						<span class="head__dot" /> {{ runningCount }} запущено
					</span>
				</p>
			</div>
			<div class="head__actions">
				<UiButton variant="secondary" @click="openFolderModal(null)">
					<FolderPlus /> Новая папка
				</UiButton>
				<UiButton variant="primary" @click="createInstanceOpen = true">
					<Plus /> Новая сборка
				</UiButton>
			</div>
		</header>

		<div v-if="instances.length" class="sections">
			<section
				v-for="section in sections"
				v-show="!section.virtual || section.instances.length || groups.length"
				:key="section.id"
				class="section"
				:class="{ 'section--drop': dropTargetId === section.id }"
				:data-drop-group="section.id"
			>
				<header class="section__head">
					<button
						type="button"
						class="section__title"
						:class="{ 'section__title--collapsed': collapsedGroups.includes(section.id) }"
						@click="toggleGroupCollapsed(section.id)"
					>
						<ChevronRight class="section__chevron" />
						<Folder
							v-if="!section.virtual"
							class="section__folder"
							:style="{ color: groups.find((group) => group.id === section.id)?.color }"
						/>
						<h2>{{ section.name }}</h2>
						<span class="section__count">{{ section.instances.length }}</span>
						<Transition name="peek">
							<span
								v-if="collapsedGroups.includes(section.id) && section.instances.length"
								class="section__peek"
							>
								<InstanceIcon
									v-for="instance in section.instances.slice(0, 5)"
									:key="instance.id"
									:path="instance.icon_path"
									:name="instance.name"
									:size="26"
									class="section__peek-icon"
								/>
								<span v-if="section.instances.length > 5" class="section__peek-more">
									+{{ section.instances.length - 5 }}
								</span>
							</span>
						</Transition>
					</button>
					<div v-if="!section.virtual" class="section__tools">
						<UiIconButton
							label="Изменить папку"
							@click="openFolderModal(groups.find((group) => group.id === section.id) ?? null)"
						>
							<Pencil />
						</UiIconButton>
					</div>
				</header>

				<div
					class="section__collapse"
					:class="{ 'section__collapse--collapsed': collapsedGroups.includes(section.id) }"
				>
					<div class="section__inner">
						<div class="grid">
							<article
								v-for="instance in section.instances"
								:key="instance.id"
								class="tile"
								:class="{
									'tile--dragging': draggedInstanceId === instance.id,
								}"
								@pointerdown="startPointerDrag($event, instance.id)"
								@pointermove="updatePointerDrag"
								@pointerup="finishPointerDrag"
								@pointercancel="finishPointerDrag"
								@click="openInstance(instance)"
							>
								<div class="tile__cover">
									<div class="tile__art" :style="cover(instance)" />
									<InstanceIcon
										:path="instance.icon_path"
										:name="instance.name"
										:size="72"
										class="tile__icon"
									/>
									<span v-if="running.has(instance.id)" class="tile__live">
										<span class="head__dot" />
										{{ runningAs.get(instance.id)?.profile.name ?? 'Запущена' }}
									</span>
									<span
										v-if="availablePackUpdate(instance)"
										v-tip="`Автор выпустил версию ${availablePackUpdate(instance)!.version_number}`"
										class="tile__update"
									>
										<RefreshCw /> Обновление
									</span>
									<div class="tile__quick" @click.stop>
										<button
											v-tip="'Управление'"
											type="button"
											class="tile__quick-button"
											@click="openInstance(instance)"
										>
											<Settings2 />
										</button>
									</div>
								</div>
								<div class="tile__body">
									<h3 class="tile__name">{{ instance.name }}</h3>
									<p class="tile__meta">
										{{ loaderLabel(instance.loader) }} · {{ instance.game_version }}
									</p>
									<div class="tile__footer" @click.stop>
										<span class="tile__time">{{ lastPlayed(instance) }}</span>
										<PlayButton :instance="instance" compact />
									</div>
								</div>
							</article>
							<button
								v-if="section.virtual"
								type="button"
								class="tile tile--new"
								@click="createInstanceOpen = true"
							>
								<span class="tile__plus"><Plus /></span>
								<span class="tile__name">Новая сборка</span>
								<span class="tile__meta">Загрузчик и версия на выбор</span>
							</button>
							<p v-else-if="!section.instances.length" class="section__empty">
								Зажмите карточку и перетащите её в эту папку
							</p>
						</div>
					</div>
				</div>
			</section>
		</div>

		<div v-else class="empty">
			<span class="empty__icon"><FolderPlus /></span>
			<h2>Сборок пока нет</h2>
			<p>Создайте первую — выберите загрузчик и версию Minecraft.</p>
			<UiButton variant="primary" size="lg" @click="createInstanceOpen = true">
				<Plus /> Новая сборка
			</UiButton>
		</div>

		<section v-if="installJobs.size" class="downloads" aria-label="Загрузки">
			<h2>Загрузки</h2>
			<div v-for="[instanceId, job] in installJobs" :key="instanceId" class="downloads__row">
				<RefreshCw class="downloads__icon" />
				<div class="downloads__text">
					<strong>{{
						instances.find((item) => item.id === instanceId)?.name ?? 'Установка сборки'
					}}</strong
					><span>Загрузка и установка файлов</span>
				</div>
				<progress
					:value="job.progress?.total ? job.progress.current : undefined"
					:max="job.progress?.total || 1"
					aria-label="Ход установки"
				/>
				<span>{{
					job.progress?.total
						? Math.min(99, Math.floor((job.progress.current / job.progress.total) * 100)) + '%'
						: 'Установка…'
				}}</span>
			</div>
		</section>

		<FolderModal
			v-model:open="folderModalOpen"
			:group="editingGroup"
			:instances="editingInstances"
		/>

		<Teleport to="body">
			<div
				v-if="draggedInstance"
				class="drag-preview"
				:style="{ left: `${dragPosition.x}px`, top: `${dragPosition.y}px` }"
			>
				<InstanceIcon :path="draggedInstance.icon_path" :name="draggedInstance.name" :size="32" />
				<strong>{{ draggedInstance.name }}</strong>
			</div>
		</Teleport>
	</div>
</template>

<style scoped>
.tile__footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-top: 16px;
}
.tile__footer .tile__time {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.downloads {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin-top: 28px;
}
.downloads h2 {
	font-size: 18px;
}
.downloads__row {
	display: flex;
	align-items: center;
	gap: 18px;
	padding: 20px;
	border-radius: var(--radius-lg);
	background: var(--surface-1);
}
.downloads__icon {
	width: 22px;
	color: var(--accent);
}
.downloads__text {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}
.downloads__text strong {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.downloads__text span {
	color: var(--text-3);
	font-size: 12px;
}
.downloads progress {
	width: 30%;
	height: 6px;
	accent-color: var(--accent);
}
@media (max-width: 1150px) {
	.head {
		flex-wrap: wrap;
		gap: 16px;
	}
}

.library {
	position: relative;
	height: 100%;
	padding: var(--titlebar-clearance) var(--page-gutter) var(--nav-clearance);
	overflow-y: auto;
	isolation: isolate;
	scrollbar-width: thin;
	scrollbar-color: var(--surface-4) transparent;
}

.section__peek {
	display: inline-flex;
	align-items: center;
	margin-left: 8px;
}

.section__peek-icon {
	margin-left: -8px;
	border-radius: 8px;
	box-shadow: 0 0 0 2px var(--bg);
}

.section__peek-icon:first-child {
	margin-left: 0;
}

.section__peek-more {
	margin-left: 6px;
	color: var(--text-3);
	font-size: 12px;
	font-weight: 700;
}

.peek-enter-active,
.peek-leave-active {
	transition:
		opacity 0.18s var(--ease),
		transform 0.18s var(--ease);
}

.peek-enter-from,
.peek-leave-to {
	opacity: 0;
	transform: translateX(-6px);
}

.head {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 24px;
	margin-bottom: 20px;
}

.head__title {
	font-size: 38px;
	line-height: 1;
}

.head__stats {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 16px;
	margin-top: 10px;
	color: var(--text-3);
	font-size: 13px;
	font-weight: 600;
}

.head__live {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	color: var(--success);
}

.head__dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: currentColor;
	box-shadow: 0 0 8px currentColor;
}

.head__actions {
	display: flex;
	gap: 8px;
}

.sections {
	display: flex;
	flex-direction: column;
	gap: 26px;
}

.section__head {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 12px;
}

.section__title {
	display: flex;
	align-items: center;
	gap: 9px;
	padding: 4px 6px 4px 2px;
	border: 0;
	border-radius: var(--radius-md);
	background: transparent;
	color: var(--text);
	cursor: pointer;
}

.section__title h2 {
	font-size: 18px;
}

.section__chevron {
	width: 17px;
	height: 17px;
	color: var(--text-3);
	transform: rotate(90deg);
	transition: transform 0.18s var(--ease);
}

.section__title--collapsed .section__chevron {
	transform: rotate(0);
}

.section__folder {
	width: 17px;
	height: 17px;
	color: var(--accent-text);
	transition: color 0.14s var(--ease);
}

.section--drop .section__folder {
	color: #fff;
}

.section__count {
	padding: 1px 8px;
	border-radius: 7px;
	background: var(--surface-2);
	color: var(--text-3);
	font-size: 12px;
	font-weight: 700;
}

.section__tools {
	display: flex;
	gap: 2px;
	margin-left: auto;
}

.section__collapse {
	display: grid;
	grid-template-rows: 1fr;
	transition:
		grid-template-rows 0.24s var(--ease),
		opacity 0.2s var(--ease);
}

.section__collapse--collapsed {
	grid-template-rows: 0fr;
	opacity: 0;
}

.section__inner {
	min-height: 0;
	overflow: hidden;
	padding: 4px;
	margin: -4px;
}

.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
	gap: 18px;
	border-radius: var(--radius-xl);
	transition: background-color 0.14s var(--ease);
}

.section--drop .grid {
	background: rgba(36, 207, 120, 0.08);
}

.section__empty {
	grid-column: 1 / -1;
	padding: 22px;
	border-radius: var(--radius-lg);
	background: var(--surface-1);
	color: var(--text-3);
	font-size: 13px;
	text-align: center;
}

.tile {
	position: relative;
	display: flex;
	flex-direction: column;
	border: 0;
	border-radius: var(--radius-xl);
	background: var(--surface-1);
	color: var(--text);
	text-align: left;
	overflow: hidden;
	cursor: pointer;
	user-select: none;
	transition:
		transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
		box-shadow 0.2s var(--ease);
}

.tile:hover {
	transform: translateY(-4px);
}

.tile--dragging {
	opacity: 0.35;
	transform: none;
}

.tile__art {
	position: absolute;
	inset: 0;
	z-index: -1;
}
.tile__art::after {
	content: '';
	position: absolute;
	inset: 0;
	opacity: 0.16;
	background-image:
		linear-gradient(30deg, transparent 48%, var(--text-3) 49%, transparent 50%),
		linear-gradient(150deg, transparent 48%, var(--text-3) 49%, transparent 50%);
	background-size: 48px 84px;
	mask-image: linear-gradient(90deg, transparent, black);
}
.tile__cover {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	height: 132px;
	overflow: hidden;
	isolation: isolate;
}

.tile:hover .tile__icon {
	border-radius: 22%;
	transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tile:hover .tile__icon {
	transform: scale(1.08) rotate(-3deg);
}

.tile__live {
	position: absolute;
	top: 10px;
	left: 10px;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	max-width: calc(100% - 20px);
	padding: 3px 9px;
	overflow: hidden;
	border-radius: 7px;
	background: rgba(0, 0, 0, 0.45);
	font-size: 11.5px;
	font-weight: 700;
	text-overflow: ellipsis;
	white-space: nowrap;
	backdrop-filter: blur(6px);
}

.tile__live {
	color: var(--success);
}

.tile__update {
	position: absolute;
	top: 10px;
	right: 10px;
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 3px 9px;
	border-radius: 7px;
	background: var(--accent);
	color: var(--on-accent);
	font-size: 11.5px;
	font-weight: 700;
	box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}

.tile__update svg {
	width: 12px;
	height: 12px;
}

.tile__quick {
	position: absolute;
	right: 10px;
	bottom: 10px;
	display: flex;
	gap: 6px;
	opacity: 0;
	transform: translateY(6px);
	transition:
		opacity 0.16s var(--ease),
		transform 0.16s var(--ease);
}

.tile:hover .tile__quick {
	opacity: 1;
	transform: none;
}

.tile__quick-button {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 34px;
	height: 34px;
	border: 0;
	border-radius: 10px;
	background: rgba(24, 24, 24, 0.78);
	color: #fff;
	cursor: pointer;
	backdrop-filter: blur(6px);
	transition: background-color 0.14s var(--ease);
}

.tile__quick-button:hover {
	background: rgba(24, 24, 24, 0.95);
}

.tile__quick-button--play {
	background: var(--accent);
}

.tile__quick-button--play:hover {
	background: var(--accent-hover);
}

.tile__quick-button svg {
	width: 16px;
	height: 16px;
}

.tile__body {
	display: flex;
	flex-direction: column;
	gap: 3px;
	padding: 16px;
}

.tile__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 19px;
	font-weight: 700;
}

.tile__meta {
	color: var(--text-2);
	font-size: 12.5px;
	font-weight: 600;
}

.tile__time {
	color: var(--text-3);
	font-size: 12px;
}

.tile--new {
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-height: 210px;
	padding: 16px;
	background: var(--surface-1);
	text-align: center;
}

.tile--new:hover {
	background: var(--surface-2);
}

.tile__plus {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 56px;
	height: 56px;
	margin-bottom: 6px;
	border-radius: 16px;
	background: var(--accent-soft);
	color: var(--accent-text);
	transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.tile--new:hover .tile__plus {
	transform: scale(1.1) rotate(90deg);
}

.tile__plus svg {
	width: 24px;
	height: 24px;
}

.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	padding: 80px 0;
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
	font-size: 24px;
}

.empty p {
	margin-bottom: 8px;
	color: var(--text-3);
}

.drag-preview {
	position: fixed;
	z-index: 30000;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 14px 8px 8px;
	border-radius: 14px;
	background: var(--panel);
	box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
	color: var(--text);
	font-size: 13.5px;
	pointer-events: none;
	transform: translate(12px, 12px);
	backdrop-filter: blur(10px);
}
</style>
