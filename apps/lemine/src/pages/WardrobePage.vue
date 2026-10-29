<script setup lang="ts">
import { Check, ImagePlus, LoaderCircle, Shirt, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { core, type Skin } from '@/api/core'
import { useActiveSkin } from '@/composables/active-skin'
import { renderPlayerBody } from '@/composables/player-head'
import { useStore } from '@/composables/store'
import { pushToast, reportError } from '@/composables/toasts'
import { addAccountOpen } from '@/composables/ui-state'

import SkinViewer from '@/components/SkinViewer.vue'
import UiButton from '@/components/ui/UiButton.vue'

type Variant = 'CLASSIC' | 'SLIM'

const MODELS: { value: Variant; label: string }[] = [
	{ value: 'CLASSIC', label: 'Классика' },
	{ value: 'SLIM', label: 'Тонкие руки' },
]
const SKELETON_TILES = 5

const { activeAccount } = useStore()
const activeSkin = useActiveSkin()

const skins = ref<Skin[]>([])
const textures = ref<Record<string, string>>({})
const bodies = ref<Record<string, string>>({})
const candidate = ref<Skin | null>(null)
const loading = ref(false)
const applying = ref(false)
const uploading = ref(false)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const licensed = computed(() => !!activeAccount.value && !activeAccount.value.offline)
const previewTexture = computed(() =>
	candidate.value
		? (textures.value[candidate.value.texture_key] ?? null)
		: activeSkin.texture.value,
)
/** Arm model picked in the wardrobe but not saved yet; it only changes the preview until saved. */
const draftVariant = ref<Variant | null>(null)
const shownVariant = computed(() => draftVariant.value ?? candidate.value?.variant ?? null)
const previewSlim = computed(() =>
	candidate.value ? shownVariant.value === 'SLIM' : activeSkin.slim.value,
)
const isEquipped = computed(() => !candidate.value || candidate.value.is_equipped)
const modelChanged = computed(
	() => !!candidate.value && !!draftVariant.value && draftVariant.value !== candidate.value.variant,
)
const canApply = computed(() => !applying.value && (!isEquipped.value || modelChanged.value))
const applyLabel = computed(() => {
	if (isEquipped.value) return modelChanged.value ? 'Сохранить' : 'Уже надет'
	return 'Надеть'
})

watch(candidate, () => (draftVariant.value = null))

let loadGeneration = 0

async function load() {
	const generation = ++loadGeneration
	candidate.value = null
	skins.value = []
	loading.value = false
	if (!licensed.value) return
	loading.value = true
	try {
		const loaded = await core.skins.list()
		if (generation !== loadGeneration) return
		skins.value = loaded.filter((skin) => skin.source !== 'default')
		candidate.value = skins.value.find((skin) => skin.is_equipped) ?? null
		await Promise.all(
			skins.value.map(async (skin) => {
				if (textures.value[skin.texture_key]) return
				const url = await core.skins.textureDataUrl(skin.texture).catch(() => null)
				if (!url) return
				textures.value = { ...textures.value, [skin.texture_key]: url }
				const body = await renderPlayerBody(url, skin.variant === 'SLIM', 6).catch(() => null)
				if (body) bodies.value = { ...bodies.value, [skin.texture_key]: body }
			}),
		)
	} catch (error) {
		if (generation === loadGeneration) reportError(error, 'Не удалось загрузить скины')
	} finally {
		if (generation === loadGeneration) loading.value = false
	}
}

watch(
	() => activeAccount.value?.profile.id,
	() => {
		void Promise.all([load(), activeSkin.refresh()])
	},
	{ immediate: true },
)

/** Picks an arm model for the selected skin; it is only previewed until the wardrobe is saved. */
function setVariant(variant: Variant) {
	if (!candidate.value) return
	draftVariant.value = variant === candidate.value.variant ? null : variant
}

/** Persists a pending arm model change for a skin, keeping its texture and cape. */
async function saveVariant(skin: Skin, variant: Variant) {
	const [bytes, capes] = await Promise.all([
		core.skins.textureBytes(skin.texture),
		skin.cape_id ? core.skins.capes() : Promise.resolve([]),
	])
	const cape = capes.find((entry) => entry.id === skin.cape_id) ?? null
	const saved = await core.skins.save(skin, bytes, variant, cape)
	skin.variant = variant
	const url = textures.value[skin.texture_key]
	if (url) {
		const body = await renderPlayerBody(url, variant === 'SLIM', 6).catch(() => null)
		if (body) bodies.value = { ...bodies.value, [skin.texture_key]: body }
	}
	return { ...saved, variant }
}

async function apply() {
	const skin = candidate.value
	if (!skin) return
	applying.value = true
	const wasEquipped = skin.is_equipped
	try {
		const variant = modelChanged.value ? draftVariant.value! : null
		const target = variant ? await saveVariant(skin, variant) : skin
		draftVariant.value = null
		activeSkin.setSlim(target.variant === 'SLIM')
		await core.skins.equip(target)
		if (!wasEquipped) await activeSkin.refresh()
		activeSkin.setSlim(target.variant === 'SLIM')
		await load()
		pushToast({ kind: 'success', title: wasEquipped ? 'Скин сохранён' : 'Скин надет' })
	} catch (error) {
		reportError(error, wasEquipped ? 'Не удалось сохранить скин' : 'Не удалось надеть скин')
	} finally {
		applying.value = false
	}
}

/** Slim skins leave the outer column of the right arm transparent; classic ones paint it. */
function detectVariant(file: Blob) {
	return new Promise<Variant>((resolve) => {
		const url = URL.createObjectURL(file)
		const image = new Image()
		image.onload = () => {
			const canvas = document.createElement('canvas')
			canvas.width = image.naturalWidth
			canvas.height = image.naturalHeight
			const context = canvas.getContext('2d')
			URL.revokeObjectURL(url)
			if (!context || image.naturalHeight < 64) return resolve('CLASSIC')
			context.drawImage(image, 0, 0)
			resolve(context.getImageData(54, 20, 1, 1).data[3] === 0 ? 'SLIM' : 'CLASSIC')
		}
		image.onerror = () => {
			URL.revokeObjectURL(url)
			resolve('CLASSIC')
		}
		image.src = url
	})
}

async function upload(file: File | undefined) {
	if (!file) return
	if (file.type && file.type !== 'image/png') {
		reportError(new Error('Нужен файл PNG'), 'Не удалось загрузить скин')
		return
	}
	uploading.value = true
	try {
		const bytes = new Uint8Array(await file.arrayBuffer())
		await core.skins.addCustom(bytes, await detectVariant(file))
		await Promise.all([load(), activeSkin.refresh()])
		pushToast({ kind: 'success', title: 'Скин загружен и надет' })
	} catch (error) {
		reportError(error, 'Не удалось загрузить скин')
	} finally {
		uploading.value = false
		if (fileInput.value) fileInput.value.value = ''
	}
}

function onDrop(event: DragEvent) {
	dragging.value = false
	void upload(event.dataTransfer?.files?.[0])
}

async function remove(skin: Skin) {
	try {
		await core.skins.remove(skin)
		await load()
	} catch (error) {
		reportError(error, 'Не удалось удалить скин')
	}
}
</script>

<template>
	<div class="wardrobe-page">
		<header class="page-head">
			<h1>Гардероб</h1>
			<p>Выберите скин, примерьте его и настройте модель персонажа.</p>
		</header>
		<div class="wardrobe">
			<div class="stage">
				<div class="stage__viewer">
					<SkinViewer :texture="previewTexture" :slim="previewSlim" />
					<span class="stage__shadow" />
				</div>
				<div class="stage__caption">
					<span class="stage__name">{{ activeAccount?.profile.name ?? 'Игрок' }}</span>
					<span v-if="licensed" class="stage__status" :class="{ 'stage__status--on': isEquipped }">
						<span class="stage__dot" />
						{{ modelChanged ? 'Не сохранено' : isEquipped ? 'Сейчас надет' : 'Примерка' }}
					</span>
					<div v-if="licensed && candidate" class="model" role="radiogroup" aria-label="Модель">
						<button
							v-for="option in MODELS"
							:key="option.value"
							type="button"
							role="radio"
							class="model__option"
							:class="{ 'model__option--active': shownVariant === option.value }"
							:aria-checked="shownVariant === option.value"
							@click="setVariant(option.value)"
						>
							{{ option.label }}
						</button>
					</div>
					<span v-else class="stage__tag">{{ previewSlim ? 'Тонкие руки' : 'Классика' }}</span>
				</div>
			</div>

			<div v-if="!licensed" class="locked">
				<span class="locked__icon"><Shirt /></span>
				<h2>Скин по нику</h2>
				<p class="muted">
					На офлайн-аккаунте показывается скин игрока с ником
					<strong>{{ activeAccount?.profile.name }}</strong
					>. Чтобы носить свои скины и менять их здесь, войдите через Microsoft.
				</p>
				<UiButton
					variant="primary"
					@click="
						() => {
							addAccountOpen = true
						}
					"
				>
					Войти через Microsoft
				</UiButton>
			</div>

			<div
				v-else
				class="library"
				:class="{ 'library--drag': dragging }"
				@dragover.prevent="dragging = true"
				@dragleave.self="dragging = false"
				@drop.prevent="onDrop"
			>
				<header class="library__head">
					<span class="library__eyebrow">Гардероб</span>
					<h2 class="library__title">
						Мои скины <span v-if="skins.length" class="library__count">{{ skins.length }}</span>
					</h2>
				</header>

				<div class="library__grid">
					<button
						type="button"
						class="tile tile--upload"
						:disabled="uploading"
						@click="fileInput?.click()"
					>
						<LoaderCircle v-if="uploading" class="spin" />
						<ImagePlus v-else />
						<span class="tile__upload-title">{{ uploading ? 'Загрузка…' : 'Загрузить' }}</span>
						<span class="tile__upload-hint">PNG или перетащите файл сюда</span>
					</button>
					<input
						ref="fileInput"
						type="file"
						accept="image/png"
						hidden
						@change="upload(($event.target as HTMLInputElement).files?.[0])"
					/>

					<span
						v-for="index in loading && skins.length === 0 ? SKELETON_TILES : 0"
						:key="`skeleton-${index}`"
						class="tile tile--skeleton"
						aria-hidden="true"
					/>
					<button
						v-for="skin in skins"
						:key="skin.texture_key"
						type="button"
						class="tile"
						:class="{ 'tile--selected': candidate?.texture_key === skin.texture_key }"
						@click="candidate = skin"
					>
						<span class="tile__pedestal" />
						<img v-if="bodies[skin.texture_key]" :src="bodies[skin.texture_key]" alt="" />
						<span v-else class="tile__placeholder" aria-hidden="true" />
						<span v-if="skin.is_equipped" v-tip="'Сейчас надет'" class="tile__badge"
							><Check
						/></span>
						<span
							v-else
							v-tip="'Удалить'"
							role="button"
							class="tile__remove"
							@click.stop="remove(skin)"
						>
							<Trash2 />
						</span>
					</button>
				</div>

				<p v-if="!loading && skins.length === 0" class="library__empty">
					Своих скинов пока нет. Загрузите PNG, и он сразу появится на персонаже.
				</p>

				<footer class="library__footer">
					<UiButton variant="primary" size="lg" :disabled="!canApply" @click="apply">
						<LoaderCircle v-if="applying" class="spin" />
						<Shirt v-else />
						{{ applyLabel }}
					</UiButton>
				</footer>

				<div v-if="dragging" class="library__drop">
					<ImagePlus />
					Отпустите, чтобы загрузить скин
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.wardrobe-page {
	display: flex;
	flex-direction: column;
	gap: 24px;
	height: 100%;
	padding: 24px var(--page-gutter) 28px;
}
.page-head h1 {
	font-size: 30px;
}
.page-head p {
	margin-top: 6px;
	color: var(--text-3);
}

.wardrobe {
	display: grid;
	grid-template-columns: minmax(250px, 32%) minmax(0, 1fr);
	flex: 1;
	min-height: 0;
	gap: 24px;
}

.stage {
	border-radius: var(--radius-xl);
	background:
		radial-gradient(ellipse at 50% 70%, var(--accent-soft), transparent 65%), var(--surface-1);
	position: relative;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.stage__viewer {
	position: relative;
	flex: 1;
	min-height: 0;
	margin-top: 24px;
}

.stage__viewer :deep(.skin-viewer) {
	position: relative;
	z-index: 1;
}

.stage__shadow {
	position: absolute;
	left: 50%;
	bottom: 6px;
	width: 140px;
	height: 22px;
	transform: translateX(-50%);
	border-radius: 50%;
	background: radial-gradient(closest-side, rgba(0, 0, 0, 0.6), transparent);
}

.stage__caption {
	position: relative;
	z-index: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 12px 16px 22px;
}

.stage__name {
	font-family: var(--font);
	font-size: 20px;
	font-weight: 700;
}

.stage__status {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-top: -2px;
	color: var(--text-3);
	font-size: 12.5px;
	font-weight: 600;
}

.stage__status--on {
	color: var(--accent-text);
}

.stage__dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: currentColor;
}

.stage__tag {
	padding: 3px 9px;
	border-radius: 7px;
	background: rgba(255, 255, 255, 0.1);
	color: var(--text-2);
	font-size: 12px;
	font-weight: 700;
}

.stage__tag--on {
	background: var(--accent-soft);
	color: var(--accent-text);
}

.library {
	position: relative;
	display: flex;
	flex-direction: column;
	min-height: 0;
	padding: 20px;
	border-radius: var(--radius-xl);
	background: var(--surface-1);
}

.library__head {
	padding-right: 40px;
}

.library__eyebrow {
	color: var(--accent-text);
	font-size: 12px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}

.library__title {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-top: 4px;
	font-size: 26px;
}

.library__count {
	padding: 2px 9px;
	border-radius: 8px;
	background: var(--surface-3);
	color: var(--text-2);
	font-family: var(--font);
	font-size: 13px;
	font-weight: 700;
}

.library__grid {
	display: grid;
	flex: 1;
	grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
	grid-auto-rows: 168px;
	align-content: start;
	gap: 10px;
	min-height: 0;
	margin-top: 18px;
	padding: 2px;
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: var(--surface-4) transparent;
}

.tile {
	position: relative;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: flex-end;
	padding: 0 0 18px;
	border: 0;
	border-radius: var(--radius-lg);
	background: var(--surface-2);
	overflow: hidden;
	cursor: pointer;
	transition:
		transform 0.16s var(--ease),
		box-shadow 0.16s var(--ease);
}

.tile:hover {
	transform: translateY(-2px);
}

.tile--selected,
.tile--selected:hover {
	background: var(--accent-soft);
	box-shadow: inset 0 0 0 2px var(--accent);
}

.tile__pedestal {
	position: absolute;
	left: 50%;
	bottom: 12px;
	width: 64px;
	height: 12px;
	transform: translateX(-50%);
	border-radius: 50%;
	background: radial-gradient(closest-side, rgba(0, 0, 0, 0.55), transparent);
}

.tile img {
	position: relative;
	width: 60px;
	height: 120px;
	image-rendering: pixelated;
	transition: transform 0.2s var(--ease);
}

.tile:hover img {
	transform: scale(1.06);
}

.tile__badge,
.tile__remove {
	position: absolute;
	top: 8px;
	right: 8px;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 26px;
	height: 26px;
	border-radius: 8px;
}

.tile__badge {
	background: var(--accent);
	color: #fff;
}

.tile__remove {
	background: rgba(0, 0, 0, 0.45);
	color: var(--text-2);
	opacity: 0;
	transition:
		opacity 0.14s var(--ease),
		background-color 0.14s var(--ease);
}

.tile:hover .tile__remove {
	opacity: 1;
}

.tile__remove:hover {
	background: var(--danger-soft);
	color: var(--danger);
}

.tile__badge svg,
.tile__remove svg {
	width: 14px;
	height: 14px;
}

.tile--upload {
	justify-content: center;
	gap: 6px;
	padding: 12px;
	background: var(--surface-2);
	color: var(--text-2);
}

.tile--upload:hover {
	background: var(--surface-3);
	color: var(--text);
}

.tile--upload > svg {
	width: 26px;
	height: 26px;
	margin-bottom: 4px;
	color: var(--accent-text);
}

.tile__upload-title {
	font-size: 14px;
	font-weight: 700;
}

.tile__upload-hint {
	color: var(--text-3);
	font-size: 11.5px;
	line-height: 1.35;
	text-align: center;
}

.library__empty {
	margin-top: 4px;
	color: var(--text-3);
	font-size: 13px;
}

.library__footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding-top: 16px;
}

.library__drop {
	position: absolute;
	inset: 12px;
	z-index: 3;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 10px;
	border-radius: var(--radius-lg);
	background: rgba(36, 207, 120, 0.22);
	backdrop-filter: blur(4px);
	color: #fff;
	font-size: 15px;
	font-weight: 700;
	pointer-events: none;
}

.library__drop svg {
	width: 32px;
	height: 32px;
}

.locked {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	justify-content: center;
	gap: 14px;
	padding: 40px;
}

.locked__icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 52px;
	height: 52px;
	border-radius: 16px;
	background: var(--accent-soft);
	color: var(--accent-text);
}

.locked__icon svg {
	width: 24px;
	height: 24px;
}

.locked h2 {
	font-size: 26px;
}

.locked p {
	max-width: 420px;
	line-height: 1.55;
}

.spin {
	animation: spin 0.9s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}

.model {
	display: flex;
	gap: 2px;
	width: 100%;
	max-width: 240px;
	margin-top: 4px;
	padding: 3px;
	border-radius: 11px;
	background: rgba(0, 0, 0, 0.35);
	backdrop-filter: blur(6px);
}

.model__option {
	flex: 1;
	height: 30px;
	padding: 0 10px;
	border: 0;
	border-radius: 7px;
	background: transparent;
	color: var(--text-3);
	font: inherit;
	font-size: 12px;
	font-weight: 700;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.model__option:hover:not(:disabled) {
	color: var(--text);
}

.model__option--active,
.model__option--active:hover:not(:disabled) {
	background: var(--accent);
	color: #fff;
}

.model__option:disabled {
	cursor: progress;
}

.tile--skeleton,
.tile__placeholder {
	background: linear-gradient(
		100deg,
		var(--surface-2) 30%,
		rgba(255, 255, 255, 0.06) 50%,
		var(--surface-2) 70%
	);
	background-size: 220% 100%;
	animation: shimmer 1.3s ease-in-out infinite;
	cursor: default;
}

.tile--skeleton:hover {
	transform: none;
}

.tile__placeholder {
	position: relative;
	width: 52px;
	height: 112px;
	border-radius: 8px;
}

@keyframes shimmer {
	from {
		background-position: 120% 0;
	}
	to {
		background-position: -120% 0;
	}
}
</style>
