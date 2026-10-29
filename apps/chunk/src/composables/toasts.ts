import { ref } from 'vue'

export interface Toast {
	id: number
	title: string
	text?: string
	kind: 'error' | 'info' | 'success'
	/** How long the toast stays up, in milliseconds; the toaster dismisses it when this runs out. */
	duration: number
}

const toasts = ref<Toast[]>([])
let nextId = 0

/** Shows a toast; an identical one already on screen is restarted instead of stacking a copy. */
export function pushToast(toast: Omit<Toast, 'id' | 'duration'>) {
	const duration = toast.kind === 'error' ? 8000 : 3500
	toasts.value = [
		...toasts.value.filter(
			(entry) =>
				entry.kind !== toast.kind || entry.title !== toast.title || entry.text !== toast.text,
		),
		{ ...toast, id: nextId++, duration },
	]
}

export function dismissToast(id: number) {
	toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

/** Shows any thrown value from the Rust core or the network as an error toast. */
export function reportError(error: unknown, title = 'Что-то пошло не так') {
	console.error(error)
	const text =
		typeof error === 'string'
			? error
			: error && typeof error === 'object' && 'message' in error
				? String((error as { message: unknown }).message)
				: undefined
	pushToast({ kind: 'error', title, text })
}

export function useToasts() {
	return toasts
}

/** Shared state must not be hot-swapped: a fresh copy would lose its core event subscriptions, so reload instead. */
import.meta.hot?.accept(() => window.location.reload())
