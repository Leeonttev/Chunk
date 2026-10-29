import steveSkin from '@/assets/steve.png'

const cache = new Map<string, Promise<string>>()

/** Renders the face and hat layer of a 64×64 skin texture into a data URL. */
export function renderPlayerHead(textureUrl: string = steveSkin, size = 64): Promise<string> {
	const key = `${textureUrl}@${size}`
	let pending = cache.get(key)
	if (!pending) {
		pending = new Promise((resolve, reject) => {
			const image = new Image()
			image.crossOrigin = 'anonymous'
			image.onload = () => {
				const canvas = document.createElement('canvas')
				canvas.width = size
				canvas.height = size
				const context = canvas.getContext('2d')
				if (!context) return reject(new Error('Canvas is not available'))
				context.imageSmoothingEnabled = false
				context.drawImage(image, 8, 8, 8, 8, 0, 0, size, size)
				context.drawImage(image, 40, 8, 8, 8, 0, 0, size, size)
				resolve(canvas.toDataURL())
			}
			image.onerror = () => reject(new Error('Skin texture failed to load'))
			image.src = textureUrl
		})
		cache.set(key, pending)
	}
	return pending
}

type Part = [sx: number, sy: number, w: number, h: number, dx: number, dy: number]

/** Renders the front of the whole player (both layers) from a skin texture into a data URL. */
export function renderPlayerBody(textureUrl: string, slim = false, scale = 6): Promise<string> {
	const key = `body:${textureUrl}@${slim}@${scale}`
	let pending = cache.get(key)
	if (!pending) {
		pending = new Promise((resolve, reject) => {
			const image = new Image()
			image.crossOrigin = 'anonymous'
			image.onload = () => {
				const legacy = image.naturalHeight < 64
				const arm = slim ? 3 : 4
				const canvas = document.createElement('canvas')
				canvas.width = 16 * scale
				canvas.height = 32 * scale
				const context = canvas.getContext('2d')
				if (!context) return reject(new Error('Canvas is not available'))
				context.imageSmoothingEnabled = false

				const draw = ([sx, sy, w, h, dx, dy]: Part, mirror = false) => {
					context.save()
					if (mirror) {
						context.translate((dx + w) * scale, dy * scale)
						context.scale(-1, 1)
						context.drawImage(image, sx, sy, w, h, 0, 0, w * scale, h * scale)
					} else {
						context.drawImage(image, sx, sy, w, h, dx * scale, dy * scale, w * scale, h * scale)
					}
					context.restore()
				}

				const rightArmX = 4 - arm
				const base: Part[] = [
					[8, 8, 8, 8, 4, 0],
					[20, 20, 8, 12, 4, 8],
					[44, 20, arm, 12, rightArmX, 8],
					[4, 20, 4, 12, 4, 20],
				]
				base.forEach((part) => draw(part))
				if (legacy) {
					draw([44, 20, arm, 12, 12, 8], true)
					draw([4, 20, 4, 12, 8, 20], true)
				} else {
					draw([36, 52, arm, 12, 12, 8])
					draw([20, 52, 4, 12, 8, 20])
				}

				const overlays: Part[] = [[40, 8, 8, 8, 4, 0]]
				if (!legacy) {
					overlays.push(
						[20, 36, 8, 12, 4, 8],
						[44, 36, arm, 12, rightArmX, 8],
						[52, 52, arm, 12, 12, 8],
						[4, 36, 4, 12, 4, 20],
						[4, 52, 4, 12, 8, 20],
					)
				}
				overlays.forEach((part) => draw(part))
				resolve(canvas.toDataURL())
			}
			image.onerror = () => reject(new Error('Skin texture failed to load'))
			image.src = textureUrl
		})
		cache.set(key, pending)
	}
	return pending
}
