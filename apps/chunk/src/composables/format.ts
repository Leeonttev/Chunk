import type { Loader } from '@/api/core'

const LOADER_LABELS: Record<Loader, string> = {
	vanilla: 'Ванилла',
	fabric: 'Fabric',
	forge: 'Forge',
	quilt: 'Quilt',
	neoforge: 'NeoForge',
}

export const loaderLabel = (loader: Loader) => LOADER_LABELS[loader] ?? loader

export function formatCount(value: number) {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.0', '')} млн`
	if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace('.0', '')} тыс.`
	return String(value)
}

export function formatBytes(bytes: number) {
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`
	return `${bytes} Б`
}
