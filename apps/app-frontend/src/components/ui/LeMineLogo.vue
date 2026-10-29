<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
	defineProps<{
		/** Plays the assembling intro and a looping shine, used on the splash screen. */
		intro?: boolean
		/** Shows the "LeMine" wordmark next to the mark. */
		wordmark?: boolean
	}>(),
	{ intro: false, wordmark: true },
)

const id = useId()
const gradientId = `lemine-gradient-${id}`
const clipId = `lemine-clip-${id}`

const LEFT_HALF =
	'M311.673 237.857C310.165 240.301 306.607 240.304 305.095 237.863L294.606 220.923C293.103 218.496 289.571 218.481 288.048 220.896L189.737 376.814C188.117 379.383 189.967 382.725 193.007 382.725H273.551C274.972 382.725 276.278 383.503 276.952 384.752L328.555 480.314C329.942 482.883 328.078 486 325.153 486H3.87004C0.860913 486 -0.993431 482.719 0.563164 480.148L288.077 5.40143C289.572 2.93324 293.153 2.91604 294.672 5.36975L373.748 133.146C374.516 134.386 374.517 135.952 373.751 137.194L311.673 237.857Z'
const RIGHT_HALF =
	'M421.445 5.68626C420.058 3.11685 421.922 0 424.847 0H746.13C749.139 0 750.993 3.28128 749.437 5.85155L461.923 480.599C460.428 483.067 456.847 483.084 455.328 480.63L376.257 352.862C375.487 351.617 375.488 350.046 376.26 348.803L438.568 248.482C440.081 246.046 443.632 246.049 445.14 248.488L455.395 265.072C456.897 267.501 460.431 267.516 461.954 265.1L560.263 109.186C561.883 106.617 560.033 103.275 556.993 103.275H476.449C475.028 103.275 473.722 102.497 473.048 101.248L421.445 5.68626Z'
</script>

<template>
	<span
		class="lemine-logo inline-flex items-center gap-[0.45em] leading-none select-none"
		:class="{ 'lemine-logo--intro': intro }"
	>
		<svg viewBox="-40 -20 830 526" class="lemine-mark h-[1.1em] w-auto shrink-0" aria-hidden="true">
			<defs>
				<linearGradient
					:id="gradientId"
					x1="0"
					y1="0"
					x2="750"
					y2="486"
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0" stop-color="#c4b5fd" />
					<stop offset="0.55" stop-color="#8b5cf6" />
					<stop offset="1" stop-color="#6d28d9" />
				</linearGradient>
				<clipPath :id="clipId">
					<path :d="LEFT_HALF" />
					<path :d="RIGHT_HALF" />
				</clipPath>
			</defs>
			<path class="lemine-half lemine-half--left" :d="LEFT_HALF" :fill="`url(#${gradientId})`" />
			<path class="lemine-half lemine-half--right" :d="RIGHT_HALF" :fill="`url(#${gradientId})`" />
			<g v-if="intro" :clip-path="`url(#${clipId})`">
				<rect class="lemine-shine" x="-260" y="-40" width="160" height="566" fill="white" />
			</g>
		</svg>
		<span v-if="wordmark" class="lemine-wordmark font-bold tracking-[-0.02em]">LeMine</span>
	</span>
</template>

<style scoped>
.lemine-half {
	transform-box: view-box;
	transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.2, 1);
}

.lemine-logo:hover .lemine-half--left {
	transform: translateX(-34px);
}

.lemine-logo:hover .lemine-half--right {
	transform: translateX(34px);
}

.lemine-logo--intro .lemine-half--left {
	animation: lemine-join-left 0.9s cubic-bezier(0.2, 0.9, 0.2, 1) both;
}

.lemine-logo--intro .lemine-half--right {
	animation: lemine-join-right 0.9s cubic-bezier(0.2, 0.9, 0.2, 1) both;
}

.lemine-logo--intro .lemine-mark {
	animation:
		lemine-lock 0.35s ease-out 0.75s both,
		lemine-glow 2.4s ease-in-out 1.1s infinite;
}

.lemine-logo--intro .lemine-wordmark {
	animation: lemine-rise 0.6s cubic-bezier(0.2, 0.9, 0.2, 1) 0.55s both;
}

.lemine-shine {
	opacity: 0.35;
	transform: skewX(-20deg);
	animation: lemine-shine 2.4s ease-in-out 1.1s infinite;
}

@keyframes lemine-join-left {
	from {
		opacity: 0;
		transform: translateX(-220px);
	}
	to {
		opacity: 1;
		transform: translateX(0);
	}
}

@keyframes lemine-join-right {
	from {
		opacity: 0;
		transform: translateX(220px);
	}
	to {
		opacity: 1;
		transform: translateX(0);
	}
}

@keyframes lemine-lock {
	0% {
		transform: scale(1);
	}
	40% {
		transform: scale(1.06);
	}
	100% {
		transform: scale(1);
	}
}

@keyframes lemine-glow {
	0%,
	100% {
		filter: drop-shadow(0 0 0 rgba(139, 92, 246, 0));
	}
	50% {
		filter: drop-shadow(0 0 18px rgba(139, 92, 246, 0.55));
	}
}

@keyframes lemine-rise {
	from {
		opacity: 0;
		transform: translateY(0.35em);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@keyframes lemine-shine {
	0% {
		transform: translateX(0) skewX(-20deg);
	}
	45%,
	100% {
		transform: translateX(1150px) skewX(-20deg);
	}
}

@media (prefers-reduced-motion: reduce) {
	.lemine-half,
	.lemine-mark,
	.lemine-wordmark,
	.lemine-shine {
		animation: none !important;
		transition: none !important;
	}
}
</style>
