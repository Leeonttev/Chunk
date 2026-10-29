import { reactive } from 'vue'

import { core, type Instance, modpackLink } from '@/api/core'
import { getProjectAuthor, getProjectVersions, type ProjectVersion } from '@/api/modrinth'

import { pushToast } from './toasts'

const versionsByProject = reactive(new Map<string, ProjectVersion[]>())
const pending = new Map<string, Promise<ProjectVersion[]>>()
const authors = reactive(new Map<string, string | null>())

/** Author of a modpack project, loaded once and cached; undefined until known. */
export function packAuthor(projectId: string) {
	if (!authors.has(projectId)) {
		authors.set(projectId, null)
		void getProjectAuthor(projectId)
			.then((name) => authors.set(projectId, name))
			.catch(() => {})
	}
	return authors.get(projectId) ?? undefined
}

/** Fetches (once, unless forced) every version of a modpack project, newest first. */
export function loadPackVersions(projectId: string, force = false) {
	const cached = versionsByProject.get(projectId)
	if (cached && !force) return Promise.resolve(cached)
	let request = pending.get(projectId)
	if (!request || force) {
		request = getProjectVersions(projectId)
			.then((versions) => {
				versionsByProject.set(projectId, versions)
				return versions
			})
			.finally(() => pending.delete(projectId))
		pending.set(projectId, request)
	}
	return request
}

/** The version a fresh install or update should pick: the newest release, else the newest build. */
export function latestVersion(versions: ProjectVersion[]) {
	return versions.find((version) => version.version_type === 'release') ?? versions[0] ?? null
}

/** The pack version an instance currently has installed, once its versions are loaded. */
export function installedPackVersion(instance: Instance) {
	const link = modpackLink(instance)
	if (!link) return null
	return (
		versionsByProject.get(link.projectId)?.find((version) => version.id === link.versionId) ?? null
	)
}

/** A newer pack version than the installed one, or null when up to date or not yet checked. */
export function availablePackUpdate(instance: Instance) {
	const link = modpackLink(instance)
	if (!link) return null
	const versions = versionsByProject.get(link.projectId)
	if (!versions) return null
	const latest = latestVersion(versions)
	if (!latest || latest.id === link.versionId) return null
	const current = versions.find((version) => version.id === link.versionId)
	if (current && Date.parse(latest.date_published) <= Date.parse(current.date_published))
		return null
	return latest
}

/** Installs a modpack as a new, fully editable instance. */
export async function installModpack(
	project: { id: string; title: string; icon_url: string | null },
	versionId?: string,
) {
	const id = versionId ?? latestVersion(await loadPackVersions(project.id))?.id
	if (!id) throw new Error('У сборки нет версий для установки')
	await core.instances.installModpack({
		projectId: project.id,
		versionId: id,
		title: project.title,
		iconUrl: project.icon_url,
	})
	pushToast({
		kind: 'info',
		title: `${project.title} устанавливается`,
		text: 'Сборка появится в разделе «Сборки»',
	})
}

/** Moves a modpack instance to another pack version; content the user added stays. */
export async function updateModpack(instance: Instance, version: ProjectVersion) {
	await core.instances.updateModpack(instance.id, version.id)
	pushToast({
		kind: 'info',
		title: `${instance.name} обновляется`,
		text: `До версии ${version.version_number}`,
	})
}
