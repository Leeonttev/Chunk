<script setup lang="ts">
import { Check, Folder, Trash2 } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'

import type { Instance } from '@/api/core'
import { FOLDER_COLORS, type InstanceGroup, useInstanceGroups } from '@/composables/instance-groups'

import InstanceIcon from './InstanceIcon.vue'
import UiButton from './ui/UiButton.vue'
import UiModal from './ui/UiModal.vue'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
	/** The folder being edited; empty to create a new one. */
	group: InstanceGroup | null
	/** Instances inside the edited folder, shown in the preview. */
	instances: Instance[]
}>()

const { createGroup, updateGroup, removeGroup } = useInstanceGroups()

const name = ref('')
const color = ref(FOLDER_COLORS[0])
const confirmDelete = ref(false)
const input = ref<HTMLInputElement | null>(null)

const editing = computed(() => !!props.group)
const canSave = computed(() => name.value.trim().length > 0)

watch(open, async (value) => {
	if (!value) return
	name.value = props.group?.name ?? ''
	color.value = props.group?.color ?? FOLDER_COLORS[0]
	confirmDelete.value = false
	await nextTick()
	input.value?.focus()
	input.value?.select()
})

function save() {
	if (!canSave.value) return
	if (props.group) updateGroup(props.group.id, name.value, color.value)
	else createGroup(name.value, color.value)
	open.value = false
}

function remove() {
	if (!props.group) return
	if (!confirmDelete.value) {
		confirmDelete.value = true
		return
	}
	removeGroup(props.group.id)
	open.value = false
}
</script>

<template>
	<UiModal v-model:open="open" width="460px" bare>
		<form class="folder" :style="{ '--folder': color }" @submit.prevent="save">
			<header class="preview">
				<div class="preview__light" />
				<span class="preview__eyebrow">{{ editing ? 'Папка' : 'Новая папка' }}</span>
				<div class="preview__main">
					<span class="preview__icon">
						<Folder />
						<span v-if="instances.length" class="preview__stack">
							<InstanceIcon
								v-for="instance in instances.slice(0, 3)"
								:key="instance.id"
								:path="instance.icon_path"
								:name="instance.name"
								:size="22"
								class="preview__mini"
							/>
						</span>
					</span>
					<div class="preview__text">
						<strong class="preview__name">{{ name.trim() || 'Без названия' }}</strong>
						<span class="preview__count">
							{{ editing ? `${instances.length} в папке` : 'Пустая, сборки можно перетащить' }}
						</span>
					</div>
				</div>
			</header>

			<div class="folder__body">
				<label class="field">
					<span class="field__label">Название</span>
					<input
						ref="input"
						v-model="name"
						class="field__input"
						:maxlength="40"
						placeholder="Например, Выживание"
						spellcheck="false"
					/>
				</label>

				<div class="field">
					<span class="field__label">Цвет</span>
					<div class="swatches" role="radiogroup" aria-label="Цвет папки">
						<button
							v-for="option in FOLDER_COLORS"
							:key="option"
							type="button"
							role="radio"
							class="swatch"
							:class="{ 'swatch--active': color === option }"
							:style="{ background: option }"
							:aria-checked="color === option"
							@click="color = option"
						>
							<Check v-if="color === option" />
						</button>
					</div>
				</div>
			</div>

			<footer class="folder__footer">
				<button
					v-if="editing"
					type="button"
					class="delete"
					:class="{ 'delete--confirm': confirmDelete }"
					@click="remove"
				>
					<Trash2 />
					{{ confirmDelete ? 'Точно удалить?' : 'Удалить' }}
				</button>
				<span class="folder__spacer" />
				<UiButton variant="ghost" size="lg" @click="open = false">Отмена</UiButton>
				<UiButton variant="primary" size="lg" type="submit" :disabled="!canSave">
					{{ editing ? 'Сохранить' : 'Создать' }}
				</UiButton>
			</footer>
		</form>
	</UiModal>
</template>

<style scoped>
.folder {
	display: flex;
	flex-direction: column;
}

.preview {
	position: relative;
	padding: 20px 22px 22px;
	overflow: hidden;
	isolation: isolate;
}

.preview__light {
	position: absolute;
	inset: 0;
	z-index: -1;
	background:
		radial-gradient(
			120% 140% at 0% 0%,
			color-mix(in srgb, var(--folder) 45%, transparent) 0%,
			transparent 70%
		),
		var(--surface-1);
	transition: background 0.25s var(--ease);
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
	gap: 16px;
	margin-top: 14px;
}

.preview__icon {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 72px;
	height: 72px;
	flex-shrink: 0;
	border-radius: 20px;
	background: linear-gradient(
		160deg,
		var(--folder),
		color-mix(in srgb, var(--folder) 55%, #000) 100%
	);
	color: #fff;
	box-shadow: 0 14px 30px color-mix(in srgb, var(--folder) 35%, transparent);
	transition:
		background 0.25s var(--ease),
		box-shadow 0.25s var(--ease);
}

.preview__icon > svg {
	width: 32px;
	height: 32px;
	stroke-width: 2.2;
}

.preview__stack {
	position: absolute;
	right: -8px;
	bottom: -8px;
	display: flex;
}

.preview__mini {
	margin-left: -8px;
	border-radius: 7px;
	box-shadow: 0 0 0 2px var(--surface-1);
}

.preview__text {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 4px;
}

.preview__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: var(--font-heading);
	font-size: 24px;
	font-weight: 800;
	line-height: 1.1;
}

.preview__count {
	color: rgba(255, 255, 255, 0.65);
	font-size: 13px;
}

.folder__body {
	display: flex;
	flex-direction: column;
	gap: 18px;
	padding: 18px 22px 6px;
}

.field {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.field__label {
	color: var(--text-2);
	font-size: 13px;
	font-weight: 700;
}

.field__input {
	height: 44px;
	padding: 0 14px;
	border: 0;
	border-radius: var(--radius-md);
	background: var(--surface-2);
	color: var(--text);
	font: inherit;
	font-size: 15px;
	font-weight: 600;
	transition: background-color 0.14s var(--ease);
}

.field__input:hover,
.field__input:focus {
	background: var(--surface-3);
}

.swatches {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.swatch {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	border: 0;
	border-radius: 11px;
	color: #fff;
	cursor: pointer;
	transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.swatch:hover {
	transform: scale(1.1);
}

.swatch--active {
	transform: scale(1.08);
	box-shadow:
		0 0 0 2px var(--surface-1),
		0 0 0 4px var(--folder);
}

.swatch svg {
	width: 16px;
	height: 16px;
	stroke-width: 3;
}

.folder__footer {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 18px 22px 20px;
}

.folder__spacer {
	flex: 1;
}

.delete {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	height: 44px;
	padding: 0 14px;
	border: 0;
	border-radius: var(--radius-md);
	background: transparent;
	color: var(--text-3);
	font: inherit;
	font-size: 14px;
	font-weight: 700;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.delete:hover,
.delete--confirm {
	background: var(--danger-soft);
	color: var(--danger);
}

.delete svg {
	width: 16px;
	height: 16px;
}
</style>
