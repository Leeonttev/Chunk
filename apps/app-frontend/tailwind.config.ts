import preset from '@modrinth/tooling-config/tailwind/tailwind-preset.ts'
import type { Config } from 'tailwindcss'

const config: Config = {
	content: [
		'./src/app/**/*.{js,vue,ts}',
		'./src/components/**/*.{js,vue,ts}',
		'./src/features/**/*.{js,vue,ts}',
		'./src/layouts/**/*.vue',
		'./src/pages/**/*.vue',
		'./src/plugins/**/*.{js,ts}',
		'./src/App.vue',
		'./src/error.vue',
		// monorepo - TODO: migrate this to its own package
		'../../packages/**/*.{js,vue,ts}',
		'!../../packages/**/node_modules/**',
	],
	presets: [preset],
	theme: {
		extend: {
			borderRadius: {
				lg: '0.5rem',
				xl: '0.5rem',
				'2xl': '0.625rem',
				'3xl': '0.75rem',
			},
		},
	},
}

export default config
