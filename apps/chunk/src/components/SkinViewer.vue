<script setup lang="ts">
import {
	CrouchAnimation,
	HitAnimation,
	IdleAnimation,
	type PlayerAnimation,
	RunningAnimation,
	SkinViewer,
	WalkingAnimation,
	WaveAnimation,
} from 'skinview3d'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type SkinMood = 'idle' | 'launching'
export type SkinEmote = 'wave' | 'crouch' | 'hit' | 'jump' | 'wander'

const props = defineProps<{
	texture: string | null
	slim: boolean
	cape?: string | null
	/** Follows the cursor with the head, reacts to hover and plays random idle emotes. */
	lively?: boolean
	/** Keeps the player busy mining a block to its left, glancing at the cursor now and then. */
	work?: boolean
	/** Disables rotating the model with the mouse. */
	locked?: boolean
	mood?: SkinMood
	zoom?: number
}>()

const emit = defineEmits<{
	poke: []
	/** Where the player's feet touch the ground: offset from the canvas centre and from its bottom, in CSS pixels. */
	drift: [x: number, ground: number]
	/** Fired at the end of every pickaxe swing while working. */
	strike: []
}>()

const BASE_YAW = 0.45
const WORK_YAW = -1.05
const HEAD_YAW_LIMIT = 1.0
const HEAD_PITCH_LIMIT = 0.55
const JUMP_MS = 520
const JUMP_HEIGHT = 3.2
const IDLE_EMOTES: SkinEmote[] = ['wave', 'crouch', 'hit', 'jump', 'wander', 'wander', 'wander']
const WALK_SPEED = 7
const WANDER_RANGE = 14
const WALK_YAW = 1.25
const FEET_Y = -16
const SWING_SPEED = 0.42
const SWING_PHASE = 18 / (2 * Math.PI)

const canvas = ref<HTMLCanvasElement | null>(null)
const host = ref<HTMLElement | null>(null)
const dragging = ref(false)
let viewer: SkinViewer | null = null
let resizeObserver: ResizeObserver | null = null
let frame = 0
let emoteTimer: ReturnType<typeof setTimeout> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let jumpStartedAt = 0
let pointer: { x: number; y: number } | null = null
let pressAt: { x: number; y: number } | null = null
let lastHoverWave = 0
let wanderTarget: number | null = null
let lastFrameAt = 0
let lastDrift = ''
let distractedUntil = 0
let lastSwing = 0

const isWorking = () => !!props.work && props.mood !== 'launching'

function baseAnimation(): PlayerAnimation {
	if (props.mood === 'launching') {
		const running = new RunningAnimation()
		running.speed = 0.9
		return running
	}
	if (isWorking() && performance.now() >= distractedUntil) {
		const swing = new HitAnimation()
		swing.speed = SWING_SPEED
		lastSwing = 0
		return swing
	}
	return new IdleAnimation()
}

/** Switches animation without the library's reset of the player's position and facing. */
function setAnimation(animation: PlayerAnimation) {
	if (!viewer) return
	const player = viewer.playerObject
	const position = player.position.clone()
	const yaw = player.rotation.y
	viewer.animation = animation
	player.position.copy(position)
	player.rotation.y = yaw
}

function restoreBase() {
	setAnimation(baseAnimation())
}

/** Pauses work so the player can look around for a moment. */
function distract(ms: number) {
	distractedUntil = Math.max(distractedUntil, performance.now() + ms)
	if (viewer && viewer.animation instanceof HitAnimation) setAnimation(new IdleAnimation())
}

/** Plays a short gesture, then returns to the mood's base animation. */
function emote(kind: SkinEmote) {
	if (!viewer || props.mood === 'launching') return
	if (emoteTimer) clearTimeout(emoteTimer)
	emoteTimer = null
	if (isWorking()) distract(kind === 'jump' ? 2600 : 3000)
	if (kind === 'jump') {
		jumpStartedAt = performance.now()
		return
	}
	if (kind === 'wander') {
		if (isWorking()) return
		const x = viewer.playerObject.position.x
		const side = Math.abs(x) > 3 ? -Math.sign(x) : Math.random() < 0.5 ? -1 : 1
		wanderTarget =
			Math.abs(x) > 3 && Math.random() < 0.5 ? 0 : side * (5 + Math.random() * (WANDER_RANGE - 5))
		setAnimation(new WalkingAnimation())
		return
	}
	wanderTarget = null
	const animation =
		kind === 'wave'
			? new WaveAnimation('right')
			: kind === 'crouch'
				? new CrouchAnimation()
				: new HitAnimation()
	if (kind === 'wave') animation.speed = 1.6
	setAnimation(animation)
	emoteTimer = setTimeout(
		() => {
			emoteTimer = null
			restoreBase()
		},
		kind === 'wave' ? 1900 : kind === 'crouch' ? 1300 : 900,
	)
}

/** While idle, plays a random gesture; while working, takes a short break to watch the cursor. */
function scheduleIdleEmote() {
	if (idleTimer) clearTimeout(idleTimer)
	if (!props.lively) return
	const working = isWorking()
	idleTimer = setTimeout(
		() => {
			if (!dragging.value) {
				if (isWorking()) distract(2200 + Math.random() * 1600)
				else emote(IDLE_EMOTES[Math.floor(Math.random() * IDLE_EMOTES.length)])
			}
			scheduleIdleEmote()
		},
		working ? 6000 + Math.random() * 6000 : 14000 + Math.random() * 10000,
	)
}

function approach(current: number, target: number, rate = 0.12) {
	return current + (target - current) * rate
}

function tick(now: number) {
	if (!viewer) return
	const player = viewer.playerObject
	const delta = lastFrameAt ? Math.min(0.05, (now - lastFrameAt) / 1000) : 0
	lastFrameAt = now
	const walking = wanderTarget !== null && props.mood !== 'launching'
	const working = isWorking() && now >= distractedUntil

	if (working && !walking && !emoteTimer && !(viewer.animation instanceof HitAnimation)) {
		restoreBase()
	}

	if (walking && wanderTarget !== null) {
		const remaining = wanderTarget - player.position.x
		const direction = Math.sign(remaining)
		player.rotation.y = approach(player.rotation.y, direction * WALK_YAW, 0.15)
		const step = WALK_SPEED * delta
		if (Math.abs(remaining) <= step) {
			player.position.x = wanderTarget
			wanderTarget = null
			restoreBase()
		} else {
			player.position.x += direction * step
		}
	} else if (working) {
		player.rotation.y = approach(player.rotation.y, WORK_YAW, 0.08)
		player.position.x = approach(player.position.x, 0, 0.08)
	} else if (!dragging.value) {
		const swing = props.lively ? 0.16 : 0.28
		player.rotation.y = approach(player.rotation.y, BASE_YAW + Math.sin(now / 2600) * swing, 0.05)
	}

	if (working && viewer.animation instanceof HitAnimation) {
		const swings = Math.floor(viewer.animation.progress * SWING_PHASE)
		if (swings > lastSwing) {
			lastSwing = swings
			emit('strike')
		}
	}

	const elapsed = now - jumpStartedAt
	player.position.y = elapsed < JUMP_MS ? Math.sin((elapsed / JUMP_MS) * Math.PI) * JUMP_HEIGHT : 0

	const head = player.skin.head
	if (props.lively && pointer && host.value && !dragging.value && !walking && !working) {
		const rect = host.value.getBoundingClientRect()
		const headX = rect.left + rect.width / 2
		const headY = rect.top + rect.height * 0.28
		const nx = Math.max(-1, Math.min(1, (pointer.x - headX) / (window.innerWidth / 2)))
		const ny = Math.max(-1, Math.min(1, (pointer.y - headY) / (window.innerHeight / 2)))
		const yaw = Math.max(-HEAD_YAW_LIMIT, Math.min(HEAD_YAW_LIMIT, nx * 1.2 - player.rotation.y))
		head.rotation.y = approach(head.rotation.y, yaw)
		head.rotation.x = approach(head.rotation.x, ny * HEAD_PITCH_LIMIT)
	} else {
		head.rotation.y = approach(head.rotation.y, 0, 0.06)
		head.rotation.x = approach(head.rotation.x, working ? 0.35 : 0, 0.06)
	}

	if (host.value) {
		const feet = player.position.clone()
		feet.y = FEET_Y
		feet.project(viewer.camera)
		const x = Math.round((feet.x * host.value.clientWidth) / 2)
		const ground = Math.round(((feet.y + 1) / 2) * host.value.clientHeight)
		const key = `${x}:${ground}`
		if (key !== lastDrift) {
			lastDrift = key
			emit('drift', x, ground)
		}
	}
	frame = requestAnimationFrame(tick)
}

function onWindowPointer(event: PointerEvent) {
	pointer = { x: event.clientX, y: event.clientY }
}

function onWindowLeave() {
	pointer = null
}

function onEnter() {
	if (!props.lively || performance.now() - lastHoverWave < 8000) return
	lastHoverWave = performance.now()
	emote('wave')
}

function onDown(event: PointerEvent) {
	dragging.value = !props.locked
	pressAt = { x: event.clientX, y: event.clientY }
}

function onUp(event: PointerEvent) {
	dragging.value = false
	if (pressAt && Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) < 5) emit('poke')
	pressAt = null
}

function applyLock() {
	if (viewer) viewer.controls.enableRotate = !props.locked
}

async function applyTexture() {
	if (!viewer) return
	if (props.texture)
		await viewer.loadSkin(props.texture, { model: props.slim ? 'slim' : 'default' })
	if (props.cape) await viewer.loadCape(props.cape)
	else viewer.resetCape()
}

onMounted(() => {
	if (!canvas.value || !host.value) return
	viewer = new SkinViewer({
		canvas: canvas.value,
		width: host.value.clientWidth,
		height: host.value.clientHeight,
	})
	viewer.animation = baseAnimation()
	viewer.autoRotate = false
	viewer.zoom = props.zoom ?? 0.92
	viewer.fov = 38
	viewer.playerObject.rotation.y = props.work ? WORK_YAW : BASE_YAW
	viewer.controls.enableZoom = false
	applyLock()
	frame = requestAnimationFrame(tick)
	resizeObserver = new ResizeObserver(() => {
		if (viewer && host.value) viewer.setSize(host.value.clientWidth, host.value.clientHeight)
	})
	resizeObserver.observe(host.value)
	window.addEventListener('pointermove', onWindowPointer, { passive: true })
	document.documentElement.addEventListener('pointerleave', onWindowLeave)
	scheduleIdleEmote()
	void applyTexture()
})

watch(
	() => [props.texture, props.slim, props.cape],
	() => void applyTexture(),
)
watch(
	() => props.mood,
	() => {
		if (emoteTimer) clearTimeout(emoteTimer)
		emoteTimer = null
		wanderTarget = null
		restoreBase()
	},
)
watch(() => [props.lively, props.work], scheduleIdleEmote)
watch(() => props.locked, applyLock)
watch(
	() => props.zoom,
	(zoom) => {
		if (viewer) viewer.zoom = zoom ?? 0.92
	},
)

onBeforeUnmount(() => {
	cancelAnimationFrame(frame)
	if (emoteTimer) clearTimeout(emoteTimer)
	if (idleTimer) clearTimeout(idleTimer)
	window.removeEventListener('pointermove', onWindowPointer)
	document.documentElement.removeEventListener('pointerleave', onWindowLeave)
	resizeObserver?.disconnect()
	viewer?.dispose()
	viewer = null
})

defineExpose({ emote, distract })
</script>

<template>
	<div
		ref="host"
		class="skin-viewer"
		:class="{ 'skin-viewer--locked': locked }"
		@pointerenter="onEnter"
		@pointerdown="onDown"
		@pointerup="onUp"
		@pointerleave="dragging = false"
	>
		<canvas ref="canvas" />
	</div>
</template>

<style scoped>
.skin-viewer {
	width: 100%;
	height: 100%;
	cursor: grab;
}

.skin-viewer:active {
	cursor: grabbing;
}

.skin-viewer--locked,
.skin-viewer--locked:active {
	cursor: pointer;
}
</style>
