import type { Directive } from 'vue'

const SHOW_DELAY_MS = 350
const GAP = 8
const EDGE = 8

let bubble: HTMLDivElement | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let owner: HTMLElement | null = null

const texts = new WeakMap<HTMLElement, string>()

function ensureBubble() {
	if (bubble) return bubble
	bubble = document.createElement('div')
	bubble.className = 'tooltip'
	bubble.setAttribute('role', 'tooltip')
	document.body.appendChild(bubble)
	return bubble
}

function place(target: HTMLElement, element: HTMLDivElement) {
	const rect = target.getBoundingClientRect()
	const { width, height } = element.getBoundingClientRect()
	const above = rect.top - height - GAP
	const top = above >= EDGE ? above : rect.bottom + GAP
	const left = Math.min(
		Math.max(EDGE, rect.left + rect.width / 2 - width / 2),
		window.innerWidth - width - EDGE,
	)
	element.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
	element.dataset.side = above >= EDGE ? 'top' : 'bottom'
}

function show(target: HTMLElement) {
	const text = texts.get(target)
	if (!text) return
	const element = ensureBubble()
	element.textContent = text
	owner = target
	place(target, element)
	element.classList.add('tooltip--visible')
}

function hide() {
	if (timer) clearTimeout(timer)
	timer = null
	owner = null
	bubble?.classList.remove('tooltip--visible')
}

function onEnter(event: Event) {
	const target = event.currentTarget as HTMLElement
	if (timer) clearTimeout(timer)
	timer = setTimeout(() => show(target), SHOW_DELAY_MS)
}

/** A styled hover hint, used instead of the native `title` tooltip. */
export const vTip: Directive<HTMLElement, string | null | undefined> = {
	mounted(el, { value }) {
		texts.set(el, value ?? '')
		el.addEventListener('mouseenter', onEnter)
		el.addEventListener('mouseleave', hide)
		el.addEventListener('mousedown', hide)
	},
	updated(el, { value }) {
		texts.set(el, value ?? '')
		if (owner === el && bubble) {
			if (value) bubble.textContent = value
			else hide()
		}
	},
	beforeUnmount(el) {
		el.removeEventListener('mouseenter', onEnter)
		el.removeEventListener('mouseleave', hide)
		el.removeEventListener('mousedown', hide)
		if (owner === el) hide()
	},
}

declare module 'vue' {
	interface ComponentCustomProperties {
		vTip: typeof vTip
	}
}
