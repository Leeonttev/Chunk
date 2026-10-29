import { Channel } from '@tauri-apps/api/core'
import { onScopeDispose } from 'vue'

import type { AppEvent } from '#events/AppEvent'

import { decodeAppEvent } from './event-codec'

export type AppEventType = AppEvent['type']
export type AppEventPayload<Type extends AppEventType> = Extract<AppEvent, { type: Type }>['payload']
type Handler = (payload: unknown) => void

const handlers = new Map<AppEventType, Set<Handler>>()

/** Channel that the Rust core streams every app event through; passed once to `initialize_state`. */
export const eventChannel = new Channel<ArrayBuffer>((payload) => {
	const event = decodeAppEvent(payload)
	for (const handler of handlers.get(event.type) ?? []) {
		try {
			handler(event.payload)
		} catch (error) {
			console.error(`Unhandled ${event.type} event`, error)
		}
	}
})

export function onAppEvent<Type extends AppEventType>(
	type: Type,
	handler: (payload: AppEventPayload<Type>) => void,
) {
	let set = handlers.get(type)
	if (!set) handlers.set(type, (set = new Set()))
	set.add(handler as Handler)
	return () => set.delete(handler as Handler)
}

/** Subscribes for the lifetime of the calling component or effect scope. */
export function useAppEvent<Type extends AppEventType>(
	type: Type,
	handler: (payload: AppEventPayload<Type>) => void,
) {
	onScopeDispose(onAppEvent(type, handler))
}

/** Shared state must not be hot-swapped: a fresh copy would lose its core event subscriptions, so reload instead. */
import.meta.hot?.accept(() => window.location.reload())
