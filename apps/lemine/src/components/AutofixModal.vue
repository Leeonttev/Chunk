<script setup lang="ts">
import {
	Check,
	ChevronDown,
	Coffee,
	LoaderCircle,
	PackageX,
	TriangleAlert,
	Wrench,
	X,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import {
	applyFix,
	dismissFix,
	type FixStep,
	fixProgress,
	fixRunning,
	pendingFix,
} from '@/composables/autofix'

import UiButton from './ui/UiButton.vue'
import UiModal from './ui/UiModal.vue'

const showLog = ref(false)

const open = computed({
	get: () => !!pendingFix.value,
	set: (value: boolean) => {
		if (!value) dismissFix()
	},
})

const failed = computed(() => fixProgress.value.some((entry) => entry.state === 'failed'))

watch(pendingFix, () => (showLog.value = false))

function title(step: FixStep) {
	if (step.kind === 'loader') return `Обновить ${step.loaderName} до ${step.to}`
	if (step.kind === 'java') return `Запускать сборку на Java ${step.version}`
	return `Выключить ${step.mods.length === 1 ? 'мод' : `моды (${step.mods.length})`}`
}

function detail(step: FixStep) {
	if (step.kind === 'loader') {
		return `Сейчас ${step.from ?? 'не указан'}. Моды требуют версию новее, лаунчер докачает файлы игры`
	}
	if (step.kind === 'java') {
		return `Некоторые моды требуют Java ${step.version} или новее. Если её нет, лаунчер скачает её сам`
	}
	return step.mods
		.map((item) => item.project?.title ?? item.file_name.replace(/\.jar(\.disabled)?$/i, ''))
		.join(', ')
}

const ICONS = { loader: Wrench, java: Coffee, disable: PackageX }
</script>

<template>
	<UiModal v-model:open="open" title="Сборка не запустилась" width="560px">
		<div v-if="pendingFix" class="fix">
			<p class="fix__lead">
				<TriangleAlert />
				<span>
					«{{ pendingFix.instance.name }}» не смогла запуститься. Автофикс нашёл причину и
					предлагает исправить её так:
				</span>
			</p>

			<ol class="steps">
				<li
					v-for="(step, index) in pendingFix.steps"
					:key="index"
					class="step"
					:class="`step--${fixProgress[index]?.state ?? 'pending'}`"
				>
					<span class="step__icon">
						<LoaderCircle v-if="fixProgress[index]?.state === 'running'" class="spin" />
						<Check v-else-if="fixProgress[index]?.state === 'done'" />
						<X v-else-if="fixProgress[index]?.state === 'failed'" />
						<component :is="ICONS[step.kind]" v-else />
					</span>
					<span class="step__text">
						<strong>{{ title(step) }}</strong>
						<span class="step__detail selectable">{{
							fixProgress[index]?.note ?? detail(step)
						}}</span>
					</span>
				</li>
			</ol>

			<p class="fix__note">
				{{
					pendingFix.gameOpen
						? 'Окно ошибки игры закроется, после исправления игра запустится снова.'
						: 'После исправления игра запустится снова.'
				}}
				Выключенные моды можно включить обратно в списке модов.
			</p>

			<button
				v-if="pendingFix.evidence.length"
				type="button"
				class="fix__toggle"
				:class="{ 'fix__toggle--open': showLog }"
				@click="showLog = !showLog"
			>
				<ChevronDown /> {{ showLog ? 'Скрыть лог' : 'Почему так решил — показать лог' }}
			</button>
			<pre v-if="showLog" class="fix__log selectable">{{ pendingFix.evidence.join('\n') }}</pre>
		</div>
		<template #footer>
			<UiButton variant="ghost" :disabled="fixRunning" @click="dismissFix()">
				{{ failed ? 'Закрыть' : 'Не сейчас' }}
			</UiButton>
			<UiButton variant="primary" :disabled="fixRunning" @click="applyFix()">
				<LoaderCircle v-if="fixRunning" class="spin" />
				<Wrench v-else />
				{{ fixRunning ? 'Исправляем…' : failed ? 'Повторить' : 'Автофикс' }}
			</UiButton>
		</template>
	</UiModal>
</template>

<style scoped>
.fix {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.fix__lead {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	color: var(--text-2);
	line-height: 1.5;
}

.fix__lead svg {
	width: 18px;
	height: 18px;
	flex-shrink: 0;
	margin-top: 2px;
	color: #f0c454;
}

.steps {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.step {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 12px;
	border-radius: var(--radius-lg);
	background: var(--surface-2);
}

.step__icon {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	border-radius: 10px;
	background: var(--surface-3);
	color: var(--text-2);
}

.step--running .step__icon,
.step--done .step__icon {
	background: var(--accent-soft);
	color: var(--accent-text);
}

.step--failed .step__icon {
	background: var(--danger-soft);
	color: var(--danger);
}

.step__icon svg {
	width: 16px;
	height: 16px;
}

.step__text {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 3px;
}

.step__text strong {
	font-size: 14px;
}

.step__detail {
	color: var(--text-3);
	font-size: 12.5px;
	line-height: 1.45;
}

.step--failed .step__detail {
	color: var(--danger);
}

.fix__note {
	color: var(--text-3);
	font-size: 12.5px;
	line-height: 1.5;
}

.fix__toggle {
	display: inline-flex;
	align-self: flex-start;
	align-items: center;
	gap: 6px;
	padding: 0;
	border: 0;
	background: transparent;
	color: var(--text-2);
	font: inherit;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
}

.fix__toggle:hover {
	color: var(--text);
}

.fix__toggle svg {
	width: 15px;
	height: 15px;
	transition: transform 0.16s var(--ease);
}

.fix__toggle--open svg {
	transform: rotate(180deg);
}

.fix__log {
	max-height: 220px;
	margin: 0;
	padding: 12px;
	border-radius: var(--radius-md);
	background: var(--bg);
	color: var(--text-2);
	font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
	font-size: 11.5px;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
	overflow-y: auto;
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
