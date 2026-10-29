<script setup lang="ts">
import { Dices } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { core } from '@/api/core'
import {
	fromConfig,
	gradient,
	ICON_BACKGROUNDS,
	ICON_SYMBOLS,
	type IconChoice,
	randomIcon,
} from '@/composables/instance-icons'

import UiButton from './ui/UiButton.vue'
import UiModal from './ui/UiModal.vue'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{ initial: IconChoice | null; busy?: boolean }>()

const emit = defineEmits<{ save: [choice: IconChoice] }>()

const choice = ref<IconChoice>(randomIcon())
const recents = ref<IconChoice[]>([])

const groups = computed(() => [
	{ title: 'Загрузчики', symbols: ICON_SYMBOLS.filter((entry) => entry.group === 'loader') },
	{ title: 'Майнкрафт', symbols: ICON_SYMBOLS.filter((entry) => entry.group === 'vanilla') },
	{ title: 'Из модов', symbols: ICON_SYMBOLS.filter((entry) => entry.group === 'modded') },
])

watch(open, async (value) => {
	if (!value) return
	choice.value = props.initial ?? randomIcon()
	recents.value = (await core.instances.recentIcons().catch(() => []))
		.map(fromConfig)
		.filter((entry): entry is IconChoice => entry !== null)
		.slice(0, 8)
})
</script>

<template>
	<UiModal v-model:open="open" title="Иконка сборки" width="720px">
		<div class="editor">
			<aside class="editor__side">
				<span class="editor__preview" :style="{ backgroundImage: gradient(choice.background) }">
					<img :src="choice.symbol.asset" alt="" />
				</span>
				<span class="editor__caption">{{ choice.symbol.name }}</span>
				<UiButton variant="secondary" @click="choice = randomIcon(choice)">
					<Dices />
					Случайная
				</UiButton>
				<div v-if="recents.length" class="editor__recents">
					<span class="editor__label">Недавние</span>
					<div class="editor__recent-grid">
						<button
							v-for="(recent, index) in recents"
							:key="index"
							type="button"
							class="editor__recent"
							:style="{ backgroundImage: gradient(recent.background) }"
							@click="choice = recent"
						>
							<img :src="recent.symbol.asset" alt="" />
						</button>
					</div>
				</div>
			</aside>
			<div class="editor__main">
				<section>
					<span class="editor__label">Фон</span>
					<div class="editor__backgrounds">
						<button
							v-for="background in ICON_BACKGROUNDS"
							:key="background.id"
							type="button"
							class="editor__swatch"
							:class="{ 'editor__swatch--active': background.id === choice.background.id }"
							:style="{ backgroundImage: gradient(background) }"
							v-tip="background.name"
							:aria-label="background.name"
							@click="choice = { ...choice, background }"
						/>
					</div>
				</section>
				<section v-for="group in groups" :key="group.title">
					<span class="editor__label">{{ group.title }}</span>
					<div class="editor__symbols">
						<button
							v-for="symbol in group.symbols"
							:key="symbol.id"
							type="button"
							class="editor__symbol"
							:class="{ 'editor__symbol--active': symbol.id === choice.symbol.id }"
							v-tip="symbol.name"
							:aria-label="symbol.name"
							@click="choice = { ...choice, symbol }"
						>
							<img :src="symbol.asset" alt="" />
						</button>
					</div>
				</section>
			</div>
		</div>
		<template #footer>
			<UiButton variant="ghost" @click="open = false">Отмена</UiButton>
			<UiButton variant="primary" :disabled="busy" @click="emit('save', choice)">
				{{ busy ? 'Сохранение…' : 'Сохранить' }}
			</UiButton>
		</template>
	</UiModal>
</template>

<style scoped>
.editor {
	display: flex;
	gap: 24px;
	height: min(460px, calc(100vh - 220px));
}

.editor__side {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 12px;
	width: 180px;
	flex-shrink: 0;
}

.editor__preview {
	display: flex;
	align-items: center;
	justify-content: center;
	aspect-ratio: 1;
	border-radius: 24%;
	overflow: hidden;
}

.editor__preview img,
.editor__recent img,
.editor__symbol img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	image-rendering: pixelated;
}

.editor__caption {
	text-align: center;
	font-size: 13px;
	font-weight: 600;
	color: var(--text-2);
}

.editor__label {
	display: block;
	margin-bottom: 10px;
	font-size: 12.5px;
	font-weight: 600;
	color: var(--text-3);
}

.editor__recents {
	margin-top: 8px;
}

.editor__recent-grid {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 8px;
}

.editor__recent {
	aspect-ratio: 1;
	padding: 0;
	border: 0;
	border-radius: 24%;
	overflow: hidden;
	cursor: pointer;
	transition: transform 0.14s var(--ease);
}

.editor__recent:hover {
	transform: scale(1.06);
}

.editor__main {
	display: flex;
	flex-direction: column;
	gap: 20px;
	flex: 1;
	min-width: 0;
	overflow-y: auto;
	padding-right: 4px;
	scrollbar-width: thin;
	scrollbar-color: var(--surface-4) transparent;
}

.editor__backgrounds {
	display: grid;
	grid-template-columns: repeat(6, 1fr);
	gap: 8px;
}

.editor__swatch {
	aspect-ratio: 1;
	padding: 0;
	border: 0;
	border-radius: 24%;
	cursor: pointer;
	transition: transform 0.14s var(--ease);
}

.editor__symbols {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 8px;
}

.editor__symbol {
	aspect-ratio: 1;
	padding: 0;
	border: 0;
	border-radius: 24%;
	overflow: hidden;
	background: var(--surface-2);
	cursor: pointer;
	transition:
		transform 0.14s var(--ease),
		background-color 0.14s var(--ease);
}

.editor__swatch:hover,
.editor__symbol:hover {
	transform: scale(1.06);
}

.editor__symbol:hover {
	background: var(--surface-3);
}

.editor__swatch--active,
.editor__symbol--active {
	box-shadow:
		0 0 0 2px var(--surface-1),
		0 0 0 4px var(--accent);
}
</style>
