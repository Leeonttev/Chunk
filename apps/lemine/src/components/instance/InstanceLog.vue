<script setup lang="ts">
import { Copy, Eraser } from 'lucide-vue-next'
import { nextTick, ref, watch } from 'vue'

import { core, type Instance } from '@/api/core'
import { onAppEvent } from '@/api/events'
import UiButton from '@/components/ui/UiButton.vue'
import { pushToast, reportError } from '@/composables/toasts'

interface Line {
	id: number
	text: string
	level: 'error' | 'warn' | 'info'
}

const MAX_LINES = 5000

const props = defineProps<{ instance: Instance }>()
const lines = ref<Line[]>([])
const viewport = ref<HTMLElement | null>(null)
let nextId = 0
let stickToBottom = true

function levelOf(level: string | null | undefined, text: string): Line['level'] {
	const value = (level ?? '').toUpperCase()
	if (value === 'ERROR' || value === 'FATAL' || /\b(ERROR|FATAL|Exception)\b/.test(text))
		return 'error'
	if (value === 'WARN' || /\bWARN\b/.test(text)) return 'warn'
	return 'info'
}

function toLines(entry: unknown): Line[] {
	if (typeof entry === 'string') {
		return entry.split('\n').map((text) => ({ id: nextId++, text, level: levelOf(null, text) }))
	}
	if (!entry || typeof entry !== 'object') return []
	const event = entry as Record<string, unknown>
	if (event.type === 'legacy') return toLines(String(event.message ?? ''))
	const time = typeof event.timestamp_millis === 'number' ? new Date(event.timestamp_millis) : null
	const prefix = [
		time ? time.toLocaleTimeString('ru-RU') : null,
		event.level ? String(event.level) : null,
		event.thread_name ? String(event.thread_name) : null,
	]
		.filter(Boolean)
		.join(' · ')
	const message = [event.message, event.throwable].filter(Boolean).join('\n')
	const text = prefix ? `[${prefix}] ${message}` : String(message)
	const level = levelOf(event.level as string | null, text)
	return text.split('\n').map((part) => ({ id: nextId++, text: part, level }))
}

async function scrollToEnd() {
	await nextTick()
	if (stickToBottom && viewport.value) viewport.value.scrollTop = viewport.value.scrollHeight
}

function append(entries: Line[]) {
	lines.value.push(...entries)
	if (lines.value.length > MAX_LINES) lines.value.splice(0, lines.value.length - MAX_LINES)
	void scrollToEnd()
}

async function load() {
	lines.value = []
	try {
		const buffer = await core.logs.live(props.instance.id)
		append((Array.isArray(buffer) ? buffer : [buffer]).flatMap(toLines))
	} catch (error) {
		reportError(error, 'Не удалось загрузить лог')
	}
}

watch(() => props.instance.id, load, { immediate: true })

onAppEvent('log', (payload) => {
	if (payload.instance_id === props.instance.id) append(toLines(payload))
})
onAppEvent('process', (payload) => {
	if (payload.instance_id === props.instance.id && payload.event === 'launched') lines.value = []
})

function onScroll() {
	const element = viewport.value
	if (!element) return
	stickToBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24
}

async function clear() {
	lines.value = []
	await core.logs.clear(props.instance.id).catch(() => {})
}

async function copy() {
	await navigator.clipboard.writeText(lines.value.map((line) => line.text).join('\n'))
	pushToast({ kind: 'success', title: 'Лог скопирован' })
}
</script>

<template>
	<div class="log">
		<div class="log__toolbar">
			<span class="faint">{{
				lines.length ? `${lines.length} строк` : 'Запустите игру, чтобы увидеть вывод'
			}}</span>
			<UiButton size="sm" variant="ghost" :disabled="!lines.length" @click="copy"
				><Copy /> Копировать</UiButton
			>
			<UiButton size="sm" variant="ghost" :disabled="!lines.length" @click="clear"
				><Eraser /> Очистить</UiButton
			>
		</div>
		<div ref="viewport" class="log__viewport selectable" @scroll="onScroll">
			<div
				v-for="line in lines"
				:key="line.id"
				class="log__line"
				:class="`log__line--${line.level}`"
			>
				{{ line.text }}
			</div>
		</div>
	</div>
</template>

<style scoped>
.log {
	display: flex;
	flex-direction: column;
	gap: 10px;
	height: 100%;
	min-height: 0;
}

.log__toolbar {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 12.5px;
}

.log__toolbar .faint {
	flex: 1;
}

.log__viewport {
	flex: 1;
	min-height: 0;
	padding: 12px 14px;
	border-radius: var(--radius-lg);
	background: #08080c;
	font-family: 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace;
	font-size: 12px;
	line-height: 1.6;
	overflow: auto;
}

.log__line {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	color: #b9b9c6;
}

.log__line--warn {
	color: #f2c46d;
}

.log__line--error {
	color: #ff7b86;
}
</style>
