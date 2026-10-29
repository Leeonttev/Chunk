import type { ContentKind, Loader } from './core'

const API =
	(import.meta.env.MODRINTH_API_URL as string | undefined) ?? 'https://api.modrinth.com/v2/'

export interface SearchHit {
	project_id: string
	slug: string
	title: string
	description: string
	author: string
	icon_url: string | null
	downloads: number
	follows: number
	categories: string[]
	date_modified: string
	/** Brand colour picked by Modrinth from the icon, as a 0xRRGGBB number. */
	color?: number | null
	/** URL of the featured gallery image, used as the card cover. */
	featured_gallery?: string | null
}

export interface SearchResult {
	hits: SearchHit[]
	total_hits: number
	offset: number
	limit: number
}

export interface Project {
	id: string
	slug: string
	title: string
	description: string
	body: string
	icon_url: string | null
	downloads: number
	followers: number
	categories: string[]
	game_versions: string[]
	loaders: string[]
	gallery: { url: string; title?: string | null; featured: boolean }[]
	source_url?: string | null
	issues_url?: string | null
	wiki_url?: string | null
	discord_url?: string | null
	updated: string
	color?: number | null
}

export interface ProjectVersion {
	id: string
	name: string
	version_number: string
	version_type: 'release' | 'beta' | 'alpha'
	game_versions: string[]
	loaders: string[]
	date_published: string
	downloads: number
}

/** What the catalog can browse: installable content plus whole modpacks. */
export type CatalogKind = ContentKind | 'modpack'

export type SortIndex = 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'

const PROJECT_TYPE_FACET: Record<CatalogKind, string> = {
	mod: 'project_type:mod',
	resourcepack: 'project_type:resourcepack',
	shader: 'project_type:shader',
	modpack: 'project_type:modpack',
}

async function get<T>(path: string): Promise<T> {
	const response = await fetch(new URL(path, API))
	if (!response.ok) throw new Error(`Modrinth: ${response.status} ${response.statusText}`)
	return (await response.json()) as T
}

/** Loaders a content kind is filtered by for an instance; shaders and packs ignore mod loaders. */
function loaderFacet(kind: CatalogKind, loader: Loader | undefined): string[] | null {
	if (!loader || kind !== 'mod' || loader === 'vanilla') return null
	return [`categories:${loader}`]
}

export function searchProjects(options: {
	kind: CatalogKind
	query: string
	sort: SortIndex
	offset: number
	limit: number
	gameVersion?: string
	loader?: Loader
}): Promise<SearchResult> {
	const facets: string[][] = [[PROJECT_TYPE_FACET[options.kind]]]
	if (options.gameVersion) facets.push([`versions:${options.gameVersion}`])
	const loader = loaderFacet(options.kind, options.loader)
	if (loader) facets.push(loader)

	const params = new URLSearchParams({
		query: options.query,
		index: options.sort,
		offset: String(options.offset),
		limit: String(options.limit),
		facets: JSON.stringify(facets),
	})
	return get(`search?${params}`)
}

export const getProject = (id: string) => get<Project>(`project/${encodeURIComponent(id)}`)

/** Display name of whoever owns a project: the owner member, else the first listed member. */
export async function getProjectAuthor(id: string) {
	const members = await get<{ role: string; is_owner?: boolean; user: { username: string } }[]>(
		`project/${encodeURIComponent(id)}/members`,
	)
	const owner =
		members.find((member) => member.is_owner) ??
		members.find((member) => member.role === 'Owner') ??
		members[0]
	return owner?.user.username ?? null
}

export function getProjectVersions(id: string, filter?: { gameVersion?: string; loader?: string }) {
	const params = new URLSearchParams()
	if (filter?.gameVersion) params.set('game_versions', JSON.stringify([filter.gameVersion]))
	if (filter?.loader) params.set('loaders', JSON.stringify([filter.loader]))
	const query = params.size > 0 ? `?${params}` : ''
	return get<ProjectVersion[]>(`project/${encodeURIComponent(id)}/version${query}`)
}
