<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { Check, Cpu, LoaderCircle, MemoryStick, Monitor, PenLine, Terminal } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'

import { core, type Instance } from '@/api/core'
import UiInput from '@/components/ui/UiInput.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiToggle from '@/components/ui/UiToggle.vue'
import { useStore } from '@/composables/store'
import { reportError } from '@/composables/toasts'

const props = defineProps<{ instance: Instance }>()
const { refreshInstances } = useStore()

const MEMORY_STEP = 512
const RESOLUTIONS: [number, number][] = [
	[1280, 720],
	[1600, 900],
	[1920, 1080],
	[2560, 1440],
]
const JVM_PRESETS = [
	{ flag: '-XX:+UseG1GC', hint: 'Сборщик G1' },
	{ flag: '-XX:+UseZGC', hint: 'Сборщик ZGC' },
	{ flag: '-XX:+AlwaysPreTouch', hint: 'Память сразу' },
	{ flag: '-XX:+ParallelRefProcEnabled', hint: 'Параллельно' },
]

const settingsTab = ref<'general' | 'java' | 'window'>('general')
const settingsTabs = [
	{ value: 'general' as const, label: 'Основное' },
	{ value: 'java' as const, label: 'Java и память' },
	{ value: 'window' as const, label: 'Окно игры' },
]
const name = ref('')
const overrideMemory = ref(false)
const memory = ref(4096)
const systemMemory = ref(8192)
const globalMemory = ref<number | null>(null)
const overrideArgs = ref(false)
const args = ref('')
const overrideResolution = ref(false)
const width = ref(1280)
const height = ref(720)
const status = ref<'idle' | 'saving' | 'saved'>('idle')
let hydrating = false

const maxMemory = computed(() => Math.max(MEMORY_STEP * 2, systemMemory.value - 1024))
const memoryPresets = computed(() =>
	[2048, 4096, 6144, 8192, 12288, 16384].filter((value) => value <= maxMemory.value),
)

function gb(megabytes: number) {
	return `${(megabytes / 1024).toFixed(1).replace(/\.0$/, '').replace('.', ',')} ГБ`
}

function reset() {
	hydrating = true
	const instance = props.instance
	name.value = instance.name
	overrideMemory.value = !!instance.memory
	memory.value = Math.min(instance.memory?.maximum ?? globalMemory.value ?? 4096, maxMemory.value)
	overrideArgs.value = (instance.extra_launch_args?.length ?? 0) > 0
	args.value = (instance.extra_launch_args ?? []).join(' ')
	overrideResolution.value = !!instance.game_resolution
	width.value = instance.game_resolution?.[0] ?? 1280
	height.value = instance.game_resolution?.[1] ?? 720
	queueMicrotask(() => (hydrating = false))
}

watch(() => props.instance.id, reset, { immediate: true })

onMounted(async () => {
	const [total, settings] = await Promise.all([
		core.java.maxMemory().catch(() => 8192),
		core.settings.get().catch(() => null),
	])
	hydrating = true
	systemMemory.value = total
	globalMemory.value = settings?.memory.maximum ?? null
	if (!overrideMemory.value) memory.value = Math.min(globalMemory.value ?? 4096, maxMemory.value)
	else memory.value = Math.min(memory.value, maxMemory.value)
	queueMicrotask(() => (hydrating = false))
})

const jvmFlags = computed(() => args.value.split(/\s+/).filter(Boolean))

function toggleFlag(flag: string) {
	const flags = jvmFlags.value
	args.value = (
		flags.includes(flag) ? flags.filter((entry) => entry !== flag) : [...flags, flag]
	).join(' ')
	if (!overrideArgs.value) overrideArgs.value = true
}

function pickResolution([w, h]: [number, number]) {
	width.value = w
	height.value = h
	overrideResolution.value = true
}

const persist = useDebounceFn(async () => {
	status.value = 'saving'
	try {
		await core.instances.edit(props.instance.id, {
			name: name.value.trim() || props.instance.name,
			memory: overrideMemory.value ? { maximum: memory.value } : null,
			extra_launch_args: overrideArgs.value ? jvmFlags.value : null,
			game_resolution: overrideResolution.value
				? [Math.max(320, width.value || 1280), Math.max(240, height.value || 720)]
				: null,
		})
		await refreshInstances()
		status.value = 'saved'
	} catch (error) {
		status.value = 'idle'
		reportError(error, 'Не удалось сохранить')
	}
}, 600)

watch([name, overrideMemory, memory, overrideArgs, args, overrideResolution, width, height], () => {
	if (!hydrating) void persist()
})
</script>

<template>
	<div class="settings">
		<nav class="settings__tabs" aria-label="Параметры сборки">
			<button
				v-for="tab in settingsTabs"
				:key="tab.value"
				:class="{ active: settingsTab === tab.value }"
				@click="settingsTab = tab.value"
			>
				{{ tab.label }}
			</button>
		</nav>
		<p class="settings__status" :class="`settings__status--${status}`">
			<template v-if="status === 'saving'"><LoaderCircle class="spin" /> Сохранение…</template>
			<template v-else-if="status === 'saved'"><Check /> Сохранено</template>
			<template v-else>Сохраняется само</template>
		</p>

		<section v-show="settingsTab === 'general'" class="card card--wide card--row">
			<span class="card__icon"><PenLine /></span>
			<div class="card__titles">
				<h3>Название</h3>
				<p>Название в вашей библиотеке.</p>
			</div>
			<UiInput v-model="name" :maxlength="64" class="card__name" />
		</section>

		<section v-show="settingsTab === 'java'" class="card card--wide">
			<header class="card__head">
				<span class="card__icon"><MemoryStick /></span>
				<div class="card__titles">
					<h3>Оперативная память</h3>
					<p>
						{{
							overrideMemory
								? `Своё значение для этой сборки`
								: `Как в общих настройках${globalMemory ? `: ${gb(globalMemory)}` : ''}`
						}}
					</p>
				</div>
				<UiToggle v-model="overrideMemory" label="Своя память" />
			</header>
			<div class="memory" :class="{ 'memory--off': !overrideMemory }">
				<div class="memory__value">
					<strong>{{ gb(memory) }}</strong>
					<span>из {{ gb(systemMemory) }}</span>
				</div>
				<UiSlider
					v-model="memory"
					class="memory__slider"
					:min="1024"
					:max="maxMemory"
					:step="MEMORY_STEP"
					label="Память"
					:disabled="!overrideMemory"
				/>
				<div class="chips">
					<button
						v-for="preset in memoryPresets"
						:key="preset"
						type="button"
						class="chip"
						:class="{ 'chip--active': overrideMemory && memory === preset }"
						@click="
							() => {
								memory = preset
								overrideMemory = true
							}
						"
					>
						{{ gb(preset).replace(' ГБ', '') }}
					</button>
				</div>
			</div>
		</section>

		<section v-show="settingsTab === 'window'" class="card">
			<header class="card__head">
				<span class="card__icon"><Monitor /></span>
				<div class="card__titles">
					<h3>Окно игры</h3>
					<p>{{ overrideResolution ? `${width} × ${height}` : 'Размер по умолчанию' }}</p>
				</div>
				<UiToggle v-model="overrideResolution" label="Своё разрешение" />
			</header>
			<div class="chips">
				<button
					v-for="preset in RESOLUTIONS"
					:key="preset.join('x')"
					type="button"
					class="chip"
					:class="{
						'chip--active': overrideResolution && width === preset[0] && height === preset[1],
					}"
					@click="pickResolution(preset)"
				>
					{{ preset[0] }}×{{ preset[1] }}
				</button>
				<span class="resolution">
					<input
						v-model.number="width"
						type="number"
						min="320"
						class="resolution__input"
						aria-label="Ширина"
						@focus="overrideResolution = true"
					/>
					<span class="resolution__x">×</span>
					<input
						v-model.number="height"
						type="number"
						min="240"
						class="resolution__input"
						aria-label="Высота"
						@focus="overrideResolution = true"
					/>
				</span>
			</div>
		</section>

		<section v-show="settingsTab === 'java'" class="card">
			<header class="card__head">
				<span class="card__icon"><Cpu /></span>
				<div class="card__titles">
					<h3>Аргументы Java</h3>
					<p>Для тонкой настройки, обычно не нужны</p>
				</div>
				<UiToggle v-model="overrideArgs" label="Свои аргументы Java" />
			</header>
			<div class="chips">
				<button
					v-for="preset in JVM_PRESETS"
					:key="preset.flag"
					type="button"
					class="chip"
					:class="{ 'chip--active': overrideArgs && jvmFlags.includes(preset.flag) }"
					v-tip="preset.flag"
					@click="toggleFlag(preset.flag)"
				>
					{{ preset.hint }}
				</button>
			</div>
			<label class="args" :class="{ 'args--off': !overrideArgs }">
				<Terminal />
				<input
					v-model="args"
					class="args__input"
					placeholder="-XX:+UseG1GC"
					spellcheck="false"
					@focus="overrideArgs = true"
				/>
			</label>
		</section>
	</div>
</template>

<style scoped>
.settings__tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.settings__tabs button {
	padding: 9px 12px;
	border: 0;
	border-radius: 8px;
	background: var(--surface-1);
	color: var(--text-2);
	cursor: pointer;
}
.settings__tabs button.active {
	background: var(--accent-soft);
	color: var(--accent-text);
}

.settings {
	position: relative;
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	align-content: start;
	gap: 10px;
}

.settings__status {
	justify-self: end;
	margin-bottom: 4px;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	color: var(--text-3);
	font-size: 12.5px;
	font-weight: 600;
}

.settings__status--saved {
	color: var(--success);
}

.settings__status svg {
	width: 14px;
	height: 14px;
}

.card {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 14px 16px;
	border-radius: var(--radius-xl);
	background: var(--surface-1);
}

.card--wide {
	grid-column: 1 / -1;
}

.card--row {
	flex-direction: row;
	align-items: center;
}

.card__name {
	width: min(360px, 45%);
}

.card__head {
	display: flex;
	align-items: center;
	gap: 12px;
}

.card__icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	flex-shrink: 0;
	border-radius: 11px;
	background: var(--accent-soft);
	color: var(--accent-text);
}

.card__icon svg {
	width: 18px;
	height: 18px;
}

.card__titles {
	flex: 1;
	min-width: 0;
}

.card__titles h3 {
	font-size: 15px;
	font-weight: 700;
}

.card__titles p {
	margin-top: 1px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: normal;
	color: var(--text-3);
	font-size: 12.5px;
}

.memory {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px 20px;
	transition: opacity 0.16s var(--ease);
}

.memory--off {
	opacity: 0.45;
}

.memory__value {
	display: flex;
	align-items: baseline;
	gap: 6px;
	min-width: 132px;
}

.memory__value strong {
	font-family: var(--font-heading);
	font-size: 26px;
	font-weight: 800;
	line-height: 1;
}

.memory__value span {
	color: var(--text-3);
	font-size: 12.5px;
	font-weight: 600;
	white-space: nowrap;
}

.memory__slider {
	flex: 1;
	min-width: 200px;
	width: auto;
}

.chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.chip {
	height: 32px;
	padding: 0 11px;
	border: 0;
	border-radius: 9px;
	background: var(--surface-2);
	color: var(--text-2);
	font-size: 12.5px;
	font-weight: 600;
	white-space: nowrap;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.chip:hover {
	background: var(--surface-3);
	color: var(--text);
}

.chip--active,
.chip--active:hover {
	background: var(--accent);
	color: #fff;
}

.resolution {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.resolution__input {
	width: 64px;
	height: 32px;
	padding: 0 8px;
	border: 0;
	border-radius: 9px;
	background: var(--surface-2);
	color: var(--text);
	font: inherit;
	font-size: 12.5px;
	font-weight: 600;
	text-align: center;
	appearance: textfield;
}

.resolution__input::-webkit-inner-spin-button {
	appearance: none;
}

.resolution__x {
	color: var(--text-3);
}

.args {
	display: flex;
	align-items: center;
	gap: 10px;
	height: 36px;
	padding-left: 12px;
	border-radius: var(--radius-md);
	background: var(--surface-2);
	color: var(--text-3);
	transition: opacity 0.16s var(--ease);
}

.args--off {
	opacity: 0.5;
}

.args svg {
	width: 15px;
	height: 15px;
	flex-shrink: 0;
}

.args__input {
	width: 100%;
	height: 100%;
	padding: 0 12px 0 0;
	border: 0;
	background: transparent;
	color: var(--text);
	font-family: ui-monospace, Consolas, monospace;
	font-size: 12.5px;
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
