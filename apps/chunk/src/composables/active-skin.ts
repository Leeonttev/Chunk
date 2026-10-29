import { computed, effectScope, ref, watch, type Ref } from 'vue'

import { type Account, core, type Skin } from '@/api/core'
import steveSkin from '@/assets/steve.png'

import { useStore } from './store'

const texture = ref<string>(steveSkin)
const slim = ref(false)
const equipped = ref<Skin | null>(null)
let started = false
let request = 0

/**
 * Slim (Alex) skins leave the outer column of the right arm transparent, classic (Steve) ones
 * paint it — the same check Minecraft tools use when a skin's model isn't stored anywhere.
 */
function detectSlim(url: string) {
	return new Promise<boolean>((resolve) => {
		const image = new Image()
		image.crossOrigin = 'anonymous'
		image.onload = () => {
			if (image.naturalHeight < 64) return resolve(false)
			const canvas = document.createElement('canvas')
			canvas.width = image.naturalWidth
			canvas.height = image.naturalHeight
			const context = canvas.getContext('2d')
			if (!context) return resolve(false)
			context.drawImage(image, 0, 0)
			try {
				resolve(context.getImageData(54, 20, 1, 1).data[3] === 0)
			} catch {
				resolve(false)
			}
		}
		image.onerror = () => resolve(false)
		image.src = url
	})
}

function canLoad(url: string) {
	return new Promise<boolean>((resolve) => {
		const image = new Image()
		image.crossOrigin = 'anonymous'
		image.onload = () => resolve(image.naturalWidth >= 64)
		image.onerror = () => resolve(false)
		image.src = url
	})
}

async function resolveFor(account: Account | null) {
	const current = ++request
	const apply = (url: string, isSlim: boolean, skin: Skin | null) => {
		if (current !== request) return
		texture.value = url
		slim.value = isSlim
		equipped.value = skin
	}
	if (!account) return apply(steveSkin, false, null)
	if (account.offline) {
		const byNickname = `https://mc-heads.net/skin/${encodeURIComponent(account.profile.name)}`
		if (!(await canLoad(byNickname))) return apply(steveSkin, false, null)
		return apply(byNickname, await detectSlim(byNickname), null)
	}
	try {
		const skin = (await core.skins.list()).find((entry) => entry.is_equipped) ?? null
		const url = skin ? await core.skins.textureDataUrl(skin.texture) : steveSkin
		const isSlim =
			skin?.variant === 'SLIM' || (skin?.variant === 'UNKNOWN' && (await detectSlim(url)))
		apply(url, isSlim, skin)
	} catch {
		apply(steveSkin, false, null)
	}
}

/** The skin texture of the active account, kept current as the account or its skin changes. */
export function useActiveSkin() {
	const { activeAccount } = useStore()
	if (!started) {
		started = true
		effectScope(true).run(() => {
			watch(
				() => activeAccount.value?.profile.id,
				() => void resolveFor(activeAccount.value),
				{ immediate: true },
			)
		})
	}
	return {
		texture,
		slim,
		equipped,
		refresh: () => resolveFor(activeAccount.value),
		/** Applies a model change right away, before the skin server reports it back. */
		setSlim: (value: boolean) => {
			request += 1
			slim.value = value
		},
	}
}

/** Resolves the skin for a particular account without changing which account will be used for launch. */
export function useAccountSkin(account: Readonly<Ref<Account | null>>) {
	const { activeAccount } = useStore()
	const localTexture = ref<string>(steveSkin)
	const localSlim = ref(false)
	let localRequest = 0

	watch(
		[() => account.value?.profile.id, () => activeAccount.value?.profile.id],
		async () => {
			const current = ++localRequest
			const selected = account.value
			if (!selected || selected.profile.id === activeAccount.value?.profile.id) return
			const identity = selected.offline ? selected.profile.name : selected.profile.id
			const url = `https://mc-heads.net/skin/${encodeURIComponent(identity)}`
			const resolved = (await canLoad(url)) ? url : steveSkin
			const isSlim = resolved === steveSkin ? false : await detectSlim(resolved)
			if (current !== localRequest) return
			localTexture.value = resolved
			localSlim.value = isSlim
		},
		{ immediate: true },
	)

	const shared = computed(() => account.value?.profile.id === activeAccount.value?.profile.id)
	return {
		texture: computed(() => (shared.value ? texture.value : localTexture.value)),
		slim: computed(() => (shared.value ? slim.value : localSlim.value)),
	}
}

/** Shared state must not be hot-swapped: a fresh copy would lose its core event subscriptions, so reload instead. */
import.meta.hot?.accept(() => window.location.reload())
