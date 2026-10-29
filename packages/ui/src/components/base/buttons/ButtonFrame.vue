<script setup lang="ts">
import type { Component, CSSProperties } from 'vue'
import { computed, ref } from 'vue'

import type {
	ButtonColor,
	ButtonInteraction,
	ButtonNativeType,
	ButtonSize,
	ButtonType,
} from './types'

const baseClasses = [
	// Base
	'relative inline-flex min-w-0 shrink-0 items-center justify-center',
	'whitespace-nowrap border-0 no-underline',
	// Interactions
	'touch-manipulation cursor-pointer select-none transition-[background-color,color,box-shadow,filter,opacity,transform] duration-150 ease-out',
	// Hovering
	'[&:not(:disabled):not([aria-disabled=true]):hover]:brightness-[--hover-brightness]',
	// Accessibility
	'[&:not(:disabled):not([aria-disabled=true]):focus-visible]:brightness-[--hover-brightness] focus-visible:outline-none [&:not(:disabled):not([aria-disabled=true]):focus-visible]:ring-4 [&:not(:disabled):not([aria-disabled=true]):focus-visible]:ring-brand-shadow',
	'disabled:cursor-not-allowed disabled:opacity-50',
	'[&[aria-disabled=true]]:cursor-not-allowed [&[aria-disabled=true]]:opacity-50',
].join(' ')

const sizeClasses: Record<ButtonSize, string> = {
	xs: 'h-7 gap-1 rounded-md px-2 text-[0.8125rem] font-medium leading-5 [&>svg]:size-4 [&>svg]:min-h-4 [&>svg]:min-w-4 [&>svg]:shrink-0',
	sm: 'h-8 gap-1.5 rounded-md px-2.5 text-sm font-medium leading-5 [&>svg]:size-4 [&>svg]:min-h-4 [&>svg]:min-w-4 [&>svg]:shrink-0',
	md: 'h-9 gap-2 rounded-lg px-3 text-sm font-medium leading-5 [&>svg]:size-[1.125rem] [&>svg]:min-h-[1.125rem] [&>svg]:min-w-[1.125rem] [&>svg]:shrink-0',
	lg: 'h-10 gap-2 rounded-lg px-4 text-[0.9375rem] font-semibold leading-5 [&>svg]:size-5 [&>svg]:min-h-5 [&>svg]:min-w-5 [&>svg]:shrink-0',
	xl: 'h-12 gap-2.5 rounded-lg px-5 text-base font-semibold leading-5 [&>svg]:size-5 [&>svg]:min-h-5 [&>svg]:min-w-5 [&>svg]:shrink-0',
}

const iconOnlySizeClasses: Record<ButtonSize, string> = {
	xs: 'w-7 !px-0',
	sm: 'w-8 !px-0',
	md: 'w-9 !px-0',
	lg: 'w-10 !px-0',
	xl: 'w-12 !px-0',
}

const typeClasses: Record<ButtonType, string> = {
	base: 'button-frame--base bg-surface-4 text-contrast [&>svg]:text-primary',
	colored:
		'button-frame--colored bg-[--button-color] text-[var(--color-accent-contrast)] [&>svg]:text-inherit',
	'colored-text':
		'button-frame--colored-text bg-surface-4 text-[--button-color] [&>svg]:text-inherit',
	outlined:
		'button-frame--outlined bg-transparent text-[var(--button-color,var(--color-contrast))] [&>svg]:text-[var(--button-color,var(--color-base))]',
	quiet: 'button-frame--quiet bg-transparent [&>svg]:text-inherit',
}

const interactionClasses: Record<ButtonInteraction, string> = {
	surface:
		'[&:not(:disabled):not([aria-disabled=true]):hover]:bg-surface-4 [&:not(:disabled):not([aria-disabled=true]):focus-visible]:bg-surface-4',
	filled:
		'[&:not(:disabled):not([aria-disabled=true]):hover]:!bg-[--button-color] [&:not(:disabled):not([aria-disabled=true]):focus-visible]:!bg-[--button-color] [&:not(:disabled):not([aria-disabled=true]):hover]:!text-[var(--color-accent-contrast)] [&:not(:disabled):not([aria-disabled=true]):focus-visible]:!text-[var(--color-accent-contrast)]',
	none: '[&:not(:disabled):not([aria-disabled=true]):hover]:!brightness-100 [&:not(:disabled):not([aria-disabled=true]):focus-visible]:!brightness-100',
}

const colorVariables: Record<ButtonColor, string> = {
	brand: 'var(--color-brand)',
	red: 'var(--color-red)',
	orange: 'var(--color-orange)',
	green: 'var(--color-green)',
	blue: 'var(--color-blue)',
	purple: 'var(--color-purple)',
	medal_promotion: 'var(--medal-promotion-text-orange, var(--color-orange))',
}

const props = withDefaults(
	defineProps<{
		as: string | Component
		type?: ButtonType
		color?: ButtonColor
		size?: ButtonSize
		interaction?: ButtonInteraction
		iconOnly?: boolean
		circular?: boolean
		nativeType?: ButtonNativeType
	}>(),
	{
		type: 'base',
		size: 'md',
		interaction: 'surface',
		iconOnly: false,
		circular: false,
		nativeType: undefined,
	},
)

const element = ref<HTMLElement | null>(null)
const classes = computed(() => [
	baseClasses,
	typeClasses[props.type],
	props.type === 'quiet' ? interactionClasses[props.interaction] : '',
	sizeClasses[props.size],
	props.iconOnly ? iconOnlySizeClasses[props.size] : '',
	props.circular ? '!rounded-full' : '',
])
const style = computed((): CSSProperties | undefined => {
	if ((props.type === 'outlined' || props.type === 'quiet') && !props.color) return undefined
	if (
		props.type !== 'colored' &&
		props.type !== 'colored-text' &&
		props.type !== 'outlined' &&
		props.type !== 'quiet'
	)
		return undefined

	return {
		'--button-color': colorVariables[props.color ?? 'brand'],
	} as CSSProperties
})

defineExpose({ element })
</script>

<template>
	<component
		:is="as"
		ref="element"
		data-button
		:type="props.nativeType"
		:class="classes"
		:style="style"
	>
		<slot />
	</component>
</template>

<style scoped>
.button-frame--base,
.button-frame--colored-text {
	box-shadow: none;
}

.button-frame--base:not(:disabled):not([aria-disabled='true']):hover,
.button-frame--colored-text:not(:disabled):not([aria-disabled='true']):hover {
	filter: none;
	background-color: var(--surface-5);
}

.button-frame--colored {
	box-shadow: none;
}

.button-frame--colored:not(:disabled):not([aria-disabled='true']):hover {
	filter: brightness(1.12);
}

.button-frame--outlined {
	box-shadow: none;
	background-color: var(--surface-4);
}

.button-frame--outlined:not(:disabled):not([aria-disabled='true']):hover {
	filter: none;
	background-color: var(--surface-5);
}

.button-frame--quiet {
	color: var(--button-color, var(--color-base));
}
</style>
