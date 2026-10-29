import { useStorage } from '@vueuse/core'

export interface InstanceGroup {
	id: string
	name: string
	/** Accent colour of the folder; older folders without one use the app accent. */
	color?: string
}

export const FOLDER_COLORS = [
	'#7d61e0',
	'#4f8cff',
	'#2bb3c0',
	'#4cc26a',
	'#e3b23c',
	'#ef8a3a',
	'#e5534b',
	'#d65db1',
]

const groups = useStorage<InstanceGroup[]>('chunk:instance-groups', [])
const assignments = useStorage<Record<string, string>>('chunk:instance-group-assignments', {})
const collapsedGroups = useStorage<string[]>('chunk:collapsed-instance-groups', [])

function createGroup(name: string, color = FOLDER_COLORS[0]) {
	const clean = name.trim()
	if (!clean) return null
	const group: InstanceGroup = {
		id: globalThis.crypto?.randomUUID?.() ?? `group-${Date.now()}`,
		name: clean,
		color,
	}
	groups.value = [...groups.value, group]
	return group
}

function updateGroup(id: string, name: string, color?: string) {
	const clean = name.trim()
	if (!clean) return
	groups.value = groups.value.map((group) =>
		group.id === id ? { ...group, name: clean, color: color ?? group.color } : group,
	)
}

function removeGroup(id: string) {
	groups.value = groups.value.filter((group) => group.id !== id)
	collapsedGroups.value = collapsedGroups.value.filter((groupId) => groupId !== id)
	assignments.value = Object.fromEntries(
		Object.entries(assignments.value).filter(([, groupId]) => groupId !== id),
	)
}

function moveInstance(instanceId: string, groupId: string | null) {
	const next = { ...assignments.value }
	if (groupId) next[instanceId] = groupId
	else delete next[instanceId]
	assignments.value = next
}

function toggleGroupCollapsed(id: string) {
	collapsedGroups.value = collapsedGroups.value.includes(id)
		? collapsedGroups.value.filter((groupId) => groupId !== id)
		: [...collapsedGroups.value, id]
}

export function useInstanceGroups() {
	return {
		groups,
		assignments,
		collapsedGroups,
		createGroup,
		updateGroup,
		removeGroup,
		moveInstance,
		toggleGroupCollapsed,
	}
}

import.meta.hot?.accept(() => window.location.reload())
