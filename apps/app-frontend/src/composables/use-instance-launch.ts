import { injectNotificationManager } from '@modrinth/ui'
import type { MaybeRefOrGetter } from 'vue'
import { computed, onMounted, ref, toValue, watch } from 'vue'

import { useAppEvent } from '@/composables/use-app-event'
import { handleSevereError } from '@/composables/use-error.js'
import { kill, run } from '@/helpers/instance'
import { get_by_instance_id } from '@/helpers/process'
import type { GameInstance } from '@/helpers/types'

type ProcessEvent = 'installing' | 'launched' | 'finished'

/**
 * Tracks whether an instance is running and exposes play/stop actions for it.
 */
export function useInstanceLaunch(instanceSource: MaybeRefOrGetter<GameInstance>) {
	const { handleError } = injectNotificationManager()
	const instance = computed(() => toValue(instanceSource))

	const playing = ref(false)
	const launching = ref(false)
	const currentEvent = ref<ProcessEvent | null>(null)

	const installing = computed(() => instance.value.install_stage.includes('installing'))
	const busy = computed(
		() =>
			launching.value ||
			installing.value ||
			currentEvent.value === 'installing' ||
			(currentEvent.value === 'launched' && !playing.value),
	)

	async function refresh() {
		const processes = (await get_by_instance_id(instance.value.id).catch(handleError)) ?? []
		playing.value = processes.length > 0
	}

	async function play() {
		if (instance.value.quarantined || busy.value) return
		launching.value = true
		await run(instance.value.id).catch((error) =>
			handleSevereError(error, { instanceId: instance.value.id }),
		)
		launching.value = false
	}

	async function stop() {
		playing.value = false
		await kill(instance.value.id).catch(handleError)
	}

	useAppEvent('process', (event) => {
		if (event.instance_id !== instance.value.id) return
		currentEvent.value = event.event as ProcessEvent
		playing.value = event.event === 'launched'
	})

	watch(
		() => instance.value.id,
		() => {
			currentEvent.value = null
			void refresh()
		},
	)
	onMounted(refresh)

	return { playing, busy, installing, play, stop }
}
