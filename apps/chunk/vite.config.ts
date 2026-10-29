import vue from '@vitejs/plugin-vue'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'vite'

import tauriConf from '../app/tauri.conf.json'

const projectRootDir = resolve(__dirname)
const envFilePath = resolve(projectRootDir, '../../packages/app-lib/.env')

if (existsSync(envFilePath)) {
	for (const line of readFileSync(envFilePath, 'utf-8').split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const eqIndex = trimmed.indexOf('=')
		if (eqIndex === -1) continue
		const key = trimmed.slice(0, eqIndex)
		if (!(key in process.env)) process.env[key] = trimmed.slice(eqIndex + 1)
	}
}

function devCsp() {
	return Object.entries(tauriConf.app.security.csp)
		.map(([directive, sources]) => {
			const list = Array.isArray(sources) ? [...sources] : [sources]
			if (directive === 'connect-src') list.push('ws://localhost:1420')
			return `${directive} ${list.join(' ')}`
		})
		.join('; ')
}

export default defineConfig({
	resolve: {
		alias: [
			{ find: '#events', replacement: resolve(projectRootDir, 'src/generated/app-events') },
			{ find: '@', replacement: resolve(projectRootDir, 'src') },
		],
	},
	plugins: [vue()],
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		headers: { 'content-security-policy': devCsp() },
	},
	envPrefix: ['VITE_', 'TAURI_', 'MODRINTH_'],
	build: {
		target: process.env.TAURI_ENV_PLATFORM == 'windows' ? 'chrome105' : 'safari15',
		minify: !process.env.TAURI_ENV_DEBUG,
		sourcemap: !!process.env.TAURI_ENV_DEBUG,
	},
})
