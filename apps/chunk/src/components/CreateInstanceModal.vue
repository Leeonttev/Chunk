<script setup lang="ts">
import { Dices, Pencil } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { core, type GameVersion, type Loader, type LoaderManifest } from '@/api/core'
import {
	gradient,
	ICON_SYMBOLS,
	type IconChoice,
	randomIcon,
	renderIcon,
	toConfig,
} from '@/composables/instance-icons'
import { useStore } from '@/composables/store'
import { reportError } from '@/composables/toasts'
import { createInstanceOpen } from '@/composables/ui-state'

import IconEditorModal from './IconEditorModal.vue'
import UiButton from './ui/UiButton.vue'
import UiModal from './ui/UiModal.vue'
import UiSelect from './ui/UiSelect.vue'
import UiToggle from './ui/UiToggle.vue'

const LOADERS: { value: Loader; label: string; hint: string }[] = [
	{ value: 'fabric', label: 'Fabric', hint: 'Лёгкий и быстрый, больше всего модов' },
	{ value: 'neoforge', label: 'NeoForge', hint: 'Крупные моды на новых версиях' },
	{ value: 'forge', label: 'Forge', hint: 'Классика, много модов для старых версий' },
	{ value: 'quilt', label: 'Quilt', hint: 'Совместим с модами Fabric' },
]

const QUICK_VERSIONS = 5

const { selectedInstanceId, refreshInstances } = useStore()

const name = ref('')
const loader = ref<Loader>('fabric')
const gameVersion = ref<string | null>(null)
const showSnapshots = ref(false)
const busy = ref(false)
const icon = ref<IconChoice>(randomIcon())
const iconEditorOpen = ref(false)

const allVersions = ref<GameVersion[]>([])
const manifests = ref<Partial<Record<Loader, LoaderManifest>>>({})
const manifestFailed = ref<Partial<Record<Loader, boolean>>>({})

const loaderLogo = (value: Loader) => ICON_SYMBOLS.find((entry) => entry.id === value)?.asset

async function loadVersions() {
	if (allVersions.value.length > 0) return
	try {
		allVersions.value = (await core.metadata.gameVersions()).versions
	} catch (error) {
		reportError(error, 'Не удалось получить список версий')
	}
}

async function loadManifest(target: Loader) {
	if (target === 'vanilla' || manifests.value[target]) return
	try {
		manifests.value = { ...manifests.value, [target]: await core.metadata.loaderVersions(target) }
		manifestFailed.value = { ...manifestFailed.value, [target]: false }
	} catch {
		manifestFailed.value = { ...manifestFailed.value, [target]: true }
	}
}

const supportedVersions = computed(() => {
	const manifest = manifests.value[loader.value]
	if (loader.value === 'vanilla' || !manifest) return null
	const ids = manifest.gameVersions.map((entry) => entry.id)
	return ids.some((id) => id.includes('${')) ? null : new Set(ids)
})

const versionOptions = computed(() =>
	allVersions.value
		.filter((version) => (showSnapshots.value ? true : version.type === 'release'))
		.filter((version) => !supportedVersions.value || supportedVersions.value.has(version.id))
		.map((version) => ({
			value: version.id,
			label: version.id,
			hint: version.type === 'release' ? undefined : 'снапшот',
		})),
)

const quickVersions = computed(() => versionOptions.value.slice(0, QUICK_VERSIONS))

const loaderUnavailable = computed(
	() => loader.value !== 'vanilla' && manifestFailed.value[loader.value] === true,
)

const loaderLabel = computed(
	() => LOADERS.find((entry) => entry.value === loader.value)?.label ?? '',
)

const autoName = computed(() =>
	gameVersion.value ? `${loaderLabel.value} ${gameVersion.value}` : loaderLabel.value,
)

watch(createInstanceOpen, async (open) => {
	if (!open) return
	name.value = ''
	icon.value = randomIcon()
	await Promise.all([loadVersions(), loadManifest(loader.value)])
})

watch(loader, (value) => void loadManifest(value))

watch(versionOptions, (options) => {
	if (!options.some((option) => option.value === gameVersion.value)) {
		gameVersion.value = options[0]?.value ?? null
	}
})

function pickIcon(choice: IconChoice) {
	icon.value = choice
	iconEditorOpen.value = false
}

async function create() {
	if (!gameVersion.value || busy.value || loaderUnavailable.value) return
	busy.value = true
	try {
		const before = new Set((await core.instances.list()).map((instance) => instance.id))
		await core.instances.create({
			name: name.value.trim() || autoName.value,
			gameVersion: gameVersion.value,
			loader: loader.value,
			loaderVersion: loader.value === 'vanilla' ? null : 'stable',
			iconPath: await renderIcon(icon.value, true),
			iconConfig: toConfig(icon.value),
		})
		await refreshInstances()
		const created = (await core.instances.list()).find((instance) => !before.has(instance.id))
		if (created) selectedInstanceId.value = created.id
		createInstanceOpen.value = false
	} catch (error) {
		reportError(error, 'Не удалось создать сборку')
	} finally {
		busy.value = false
	}
}
</script>

<template>
	<UiModal v-model:open="createInstanceOpen" width="640px" bare>
		<form class="create" @submit.prevent="create">
			<header class="preview">
				<div class="preview__backdrop" :style="{ backgroundImage: gradient(icon.background) }" />
				<div class="preview__shade" />
				<span class="preview__eyebrow">Новая сборка</span>
				<div class="preview__main">
					<button
						v-tip="'Выбрать иконку'"
						type="button"
						class="preview__icon"
						:style="{ backgroundImage: gradient(icon.background) }"
						aria-label="Выбрать иконку"
						@click="iconEditorOpen = true"
					>
						<img :src="icon.symbol.asset" alt="" />
						<span class="preview__icon-hint"><Pencil /></span>
					</button>
					<div class="preview__text">
						<input
							v-model="name"
							class="preview__name"
							:placeholder="autoName"
							:maxlength="64"
							spellcheck="false"
							aria-label="Название сборки"
						/>
						<span class="preview__meta">
							<span class="preview__tag">{{ loaderLabel }}</span>
							<span v-if="gameVersion" class="preview__tag">{{ gameVersion }}</span>
						</span>
					</div>
					<button
						v-tip="'Случайная иконка'"
						type="button"
						class="preview__dice"
						aria-label="Случайная иконка"
						@click="icon = randomIcon(icon)"
					>
						<Dices />
					</button>
				</div>
			</header>

			<div class="create__body">
				<section class="create__section">
					<h3 class="create__label">Загрузчик модов</h3>
					<div class="loaders">
						<button
							v-for="entry in LOADERS"
							:key="entry.value"
							type="button"
							class="loader"
							:class="{ 'loader--active': loader === entry.value }"
							@click="loader = entry.value"
						>
							<img :src="loaderLogo(entry.value)" alt="" class="loader__logo" />
							<span class="loader__name">{{ entry.label }}</span>
							<span class="loader__hint">{{ entry.hint }}</span>
						</button>
					</div>
				</section>

				<section class="create__section">
					<div class="create__row">
						<h3 class="create__label">Версия Minecraft</h3>
						<label class="create__toggle">
							<span class="faint">Снапшоты</span>
							<UiToggle v-model="showSnapshots" label="Показывать снапшоты" />
						</label>
					</div>
					<div class="versions">
						<button
							v-for="option in quickVersions"
							:key="option.value"
							type="button"
							class="version"
							:class="{ 'version--active': gameVersion === option.value }"
							@click="gameVersion = option.value"
						>
							{{ option.label }}
						</button>
						<UiSelect
							v-model="gameVersion"
							:options="versionOptions"
							placeholder="Загрузка…"
							class="versions__all"
						/>
					</div>
				</section>

				<p v-if="loaderUnavailable" class="create__warning">
					Не удалось получить версии {{ loaderLabel }}. Проверьте интернет или выберите другой
					загрузчик.
				</p>
			</div>

			<footer class="create__footer">
				<UiButton variant="ghost" size="lg" @click="createInstanceOpen = false">Отмена</UiButton>
				<UiButton
					variant="primary"
					size="lg"
					type="submit"
					:disabled="!gameVersion || busy || loaderUnavailable"
				>
					{{ busy ? 'Создание…' : 'Создать сборку' }}
				</UiButton>
			</footer>
		</form>
	</UiModal>
	<IconEditorModal v-model:open="iconEditorOpen" :initial="icon" @save="pickIcon" />
</template>

<style scoped>
.create {
	display: flex;
	flex-direction: column;
}

.preview {
	position: relative;
	padding: 18px 22px 22px;
	overflow: hidden;
	isolation: isolate;
}

.preview__backdrop {
	position: absolute;
	inset: -40%;
	z-index: -2;
	filter: blur(60px) saturate(1.3);
	opacity: 0.6;
	transition: background-image 0.3s var(--ease);
}

.preview__shade {
	position: absolute;
	inset: 0;
	z-index: -1;
	background: linear-gradient(180deg, rgba(38, 38, 43, 0.2) 0%, rgba(38, 38, 43, 0.85) 100%);
}

.preview__eyebrow {
	color: rgba(255, 255, 255, 0.7);
	font-size: 12px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}

.preview__main {
	display: flex;
	align-items: center;
	gap: 18px;
	margin-top: 14px;
}

.preview__icon {
	position: relative;
	width: 84px;
	height: 84px;
	flex-shrink: 0;
	padding: 0;
	border: 0;
	border-radius: 24%;
	box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45);
	overflow: hidden;
	cursor: pointer;
	transition: transform 0.16s var(--ease);
}

.preview__icon:hover {
	transform: scale(1.04) rotate(-2deg);
}

.preview__icon img {
	width: 100%;
	height: 100%;
	image-rendering: pixelated;
}

.preview__icon-hint {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.45);
	color: #fff;
	opacity: 0;
	transition: opacity 0.14s var(--ease);
}

.preview__icon:hover .preview__icon-hint {
	opacity: 1;
}

.preview__icon-hint svg {
	width: 20px;
	height: 20px;
}

.preview__text {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	gap: 8px;
}

.preview__name {
	width: 100%;
	padding: 4px 8px;
	margin-left: -8px;
	border: 0;
	border-radius: var(--radius-md);
	background: transparent;
	color: #fff;
	font-family: var(--font-heading);
	font-size: 28px;
	font-weight: 800;
	line-height: 1.1;
	transition: background-color 0.14s var(--ease);
}

.preview__name::placeholder {
	color: rgba(255, 255, 255, 0.9);
}

.preview__name:hover,
.preview__name:focus {
	background: rgba(0, 0, 0, 0.25);
}

.preview__meta {
	display: flex;
	gap: 6px;
}

.preview__tag {
	padding: 3px 9px;
	border-radius: 7px;
	background: rgba(0, 0, 0, 0.35);
	color: #fff;
	font-size: 12px;
	font-weight: 700;
}

.preview__dice {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	flex-shrink: 0;
	align-self: flex-end;
	border: 0;
	border-radius: var(--radius-md);
	background: rgba(0, 0, 0, 0.3);
	color: #fff;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		transform 0.3s var(--ease);
}

.preview__dice:hover {
	background: rgba(0, 0, 0, 0.5);
	transform: rotate(90deg);
}

.preview__dice svg {
	width: 19px;
	height: 19px;
}

.create__body {
	display: flex;
	flex-direction: column;
	gap: 20px;
	padding: 18px 22px 8px;
}

.create__section {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.create__label {
	color: var(--text-2);
	font-family: inherit;
	font-size: 13px;
	font-weight: 700;
}

.create__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
}

.create__toggle {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12.5px;
}

.loaders {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 8px;
}

.loader {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 6px;
	padding: 12px;
	border: 0;
	border-radius: var(--radius-lg);
	background: var(--surface-2);
	color: var(--text);
	text-align: left;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		box-shadow 0.14s var(--ease);
}

.loader:hover {
	background: var(--surface-3);
}

.loader--active,
.loader--active:hover {
	background:
		radial-gradient(120% 120% at 0% 0%, rgba(36, 207, 120, 0.35) 0%, rgba(36, 207, 120, 0) 70%),
		var(--surface-2);
	box-shadow: inset 0 0 0 2px var(--accent);
}

.loader__logo {
	width: 36px;
	height: 36px;
	border-radius: 9px;
	image-rendering: pixelated;
}

.loader__name {
	font-size: 14px;
	font-weight: 700;
}

.loader__hint {
	color: var(--text-3);
	font-size: 11.5px;
	line-height: 1.35;
}

.versions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.version {
	height: 38px;
	padding: 0 14px;
	border: 0;
	border-radius: var(--radius-md);
	background: var(--surface-2);
	color: var(--text-2);
	font-size: 13.5px;
	font-weight: 700;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.version:hover {
	background: var(--surface-3);
	color: var(--text);
}

.version--active,
.version--active:hover {
	background: var(--accent);
	color: #fff;
}

.versions__all {
	flex: 1;
	min-width: 150px;
}

.create__warning {
	padding: 10px 12px;
	border-radius: var(--radius-md);
	background: var(--danger-soft);
	color: var(--danger);
	font-size: 13px;
}

.create__footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding: 14px 22px 20px;
}
</style>
