import { invoke } from '@tauri-apps/api/core'

import { eventChannel } from './events'

export type Loader = 'vanilla' | 'fabric' | 'forge' | 'quilt' | 'neoforge'
export type ContentKind = 'mod' | 'resourcepack' | 'shader'

export interface IconConfig {
	background: { type: 'linear-top-down-gradient'; top_color: string; bottom_color: string }
	symbol: string
}

export interface Instance {
	id: string
	name: string
	icon_path?: string | null
	icon_config?: IconConfig | null
	game_version: string
	loader: Loader
	loader_version?: string | null
	install_stage: string
	quarantined: boolean
	created: string
	modified: string
	last_played?: string | null
	submitted_time_played: number
	recent_time_played: number
	memory?: { maximum: number } | null
	java_path?: string | null
	extra_launch_args?: string[] | null
	game_resolution?: [number, number] | null
	link?: InstanceLink | null
}

/** Where an instance came from; only `modrinth_modpack` is used by LeMine, the rest pass through. */
export type InstanceLink =
	| { type: 'modrinth_modpack'; project_id: string; version_id: string }
	| {
			type: Exclude<string, 'modrinth_modpack'>
			project_id?: string | null
			version_id?: string | null
	  }

/** The Modrinth modpack an instance was installed from, if any. */
export function modpackLink(instance: Pick<Instance, 'link'>) {
	const link = instance.link
	return link?.type === 'modrinth_modpack' && link.project_id && link.version_id
		? { projectId: link.project_id, versionId: link.version_id }
		: null
}

export interface ContentItem {
	file_name: string
	file_path: string
	id: string
	size: number
	enabled: boolean
	project_type: 'mod' | 'datapack' | 'resourcepack' | 'shaderpack'
	project: { id: string; slug?: string | null; title: string; icon_url?: string | null } | null
	version: { id: string; version_number: string } | null
	owner: { name: string } | null
	has_update: boolean
	update_version_id?: string | null
	/** Set by LeMine: the file came with the Modrinth modpack rather than being added by the user. */
	from_pack?: boolean
}

export interface Account {
	profile: { id: string; name: string }
	offline: boolean
	active: boolean
}

export interface GameVersion {
	id: string
	type: 'release' | 'snapshot' | 'old_alpha' | 'old_beta'
}

export interface LoaderManifest {
	gameVersions: { id: string; stable: boolean; loaders: { id: string; stable: boolean }[] }[]
}

interface BaseWorld {
	name: string
	last_played?: string
	icon?: string
	display_status: 'normal' | 'hidden' | 'favorite'
}
export type World =
	| (BaseWorld & { type: 'singleplayer'; path: string; game_mode: string; hardcore: boolean })
	| (BaseWorld & { type: 'server'; index: number; address: string })

export interface Screenshot {
	id: string
	instance_id: string
	instance_name: string
	file_name: string
	created_at: string
	modified_at: number
	path: string
	/** Asset-protocol URL of the original full-resolution file. */
	url: string
}

export interface Skin {
	texture_key: string
	name?: string
	variant: 'CLASSIC' | 'SLIM' | 'UNKNOWN'
	cape_id?: string
	texture: string
	source: 'default' | 'custom_external' | 'custom'
	is_equipped: boolean
}

export interface Cape {
	id: string
	name: string
	texture: string
	is_equipped: boolean
}

export interface JavaVersion {
	parsed_version: number
	version: string
	architecture: string
	path: string
}

export type AppSettings = Record<string, unknown> & {
	max_concurrent_downloads: number
	memory: { maximum: number }
	hide_on_process_start: boolean
	discord_rpc?: boolean
}

const call = <T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args)

export const core = {
	initialize: () => call<void>('initialize_state', { events: eventChannel }),
	showWindow: () => call<void>('show_window'),

	instances: {
		list: () => call<Instance[]>('plugin:instance|instance_list'),
		get: (instanceId: string) =>
			call<Instance | null>('plugin:instance|instance_get', { instanceId }),
		create: (request: {
			name: string
			gameVersion: string
			loader: Loader
			loaderVersion: string | null
			iconPath: string | null
			iconConfig: IconConfig | null
		}) => call<unknown>('plugin:install|install_create_instance', { request }),
		remove: (instanceId: string) => call<void>('plugin:instance|instance_remove', { instanceId }),
		edit: (instanceId: string, editInstance: Partial<Instance>) =>
			call<void>('plugin:instance|instance_edit', { instanceId, editInstance }),
		/** Reinstalls the game; modpack instances also restore the pack's own files. */
		repair: (instance: Instance) =>
			modpackLink(instance)
				? call<unknown>('plugin:instance|instance_repair_managed_modrinth', {
						instanceId: instance.id,
					})
				: call<unknown>('plugin:install|install_existing_instance', {
						instanceId: instance.id,
						force: false,
					}),
		/** Creates a new instance from a Modrinth modpack version. */
		installModpack: (pack: {
			projectId: string
			versionId: string
			title: string
			iconUrl: string | null
		}) =>
			call<{ instance_id?: string | null }>('plugin:install|install_create_modpack_instance', {
				location: {
					type: 'fromVersionId',
					project_id: pack.projectId,
					version_id: pack.versionId,
					title: pack.title,
					icon_url: pack.iconUrl,
				},
				postInstallEdit: null,
			}),
		/** Switches a modpack instance to another pack version, keeping content the user added. */
		updateModpack: (instanceId: string, versionId: string) =>
			call<unknown>('plugin:instance|instance_update_managed_modrinth_version', {
				instanceId,
				versionId,
			}),
		fullPath: (instanceId: string) =>
			call<string>('plugin:instance|instance_get_full_path', { instanceId }),
		run: (instanceId: string) =>
			call<unknown>('plugin:instance|instance_run', { instanceId, serverAddress: null }),
		kill: (instanceId: string) => call<void>('plugin:instance|instance_kill', { instanceId }),
		/** Renders a generated icon into the cache and returns its file path, without touching any instance. */
		cacheIcon: (config: IconConfig, symbolBytes: number[], addToRecents = false) =>
			call<string>('plugin:instance|instance_cache_generated_icon', {
				config,
				symbolBytes,
				addToRecents,
			}),
		setGeneratedIcon: (instanceId: string, config: IconConfig, symbolBytes: number[]) =>
			call<string>('plugin:instance|instance_edit_generated_icon', {
				instanceId,
				config,
				symbolBytes,
			}),
		recentIcons: () => call<IconConfig[]>('plugin:instance|instance_get_recent_icon_configs'),
		processes: (instanceId: string) =>
			call<unknown[]>('plugin:process|process_get_by_instance_id', { instanceId }),
	},

	content: {
		/** Everything installed in an instance; for modpacks the pack's own files are included and flagged. */
		list: async (instance: Pick<Instance, 'id' | 'link'>) => {
			const args = { instanceId: instance.id, cacheBehaviour: 'stale_while_revalidate' }
			const [own, pack] = await Promise.all([
				call<ContentItem[]>('plugin:instance|instance_get_content_items', args),
				modpackLink(instance)
					? call<ContentItem[]>('plugin:instance|instance_get_linked_modpack_content', args)
					: Promise.resolve([]),
			])
			const ownPaths = new Set(own.map((item) => item.file_path))
			return [
				...own,
				...pack
					.filter((item) => !ownPaths.has(item.file_path))
					.map((item) => ({ ...item, from_pack: true })),
			]
		},
		installedProjectIds: (instanceId: string) =>
			call<string[]>('plugin:instance|instance_get_installed_project_ids', { instanceId }),
		install: (
			instanceId: string,
			request: {
				project_id: string
				version_id?: string | null
				content_type: ContentKind
				selected?: { game_versions?: string[]; loaders?: string[] }
			},
		) =>
			call<unknown>('plugin:instance|instance_install_project_with_dependencies', {
				instanceId,
				request,
			}),
		/** Updates many files in one install job, so the core fetches metadata once instead of per file. */
		updateMany: (instanceId: string, updates: { project_path: string; version_id: string }[]) =>
			call<unknown>('plugin:install|install_bulk_update_content', { instanceId, updates }),
		toggle: (instanceId: string, projectPath: string) =>
			call<string>('plugin:instance|instance_toggle_disable_project', { instanceId, projectPath }),
		remove: (instanceId: string, projectPath: string) =>
			call<void>('plugin:instance|instance_remove_project', { instanceId, projectPath }),
		update: (instanceId: string, projectPath: string) =>
			call<string>('plugin:instance|instance_update_project', { instanceId, projectPath }),
		addFromPath: (instanceId: string, projectPath: string) =>
			call<string>('plugin:instance|instance_add_project_from_path', { instanceId, projectPath }),
	},

	accounts: {
		list: () => call<Account[]>('plugin:auth|get_users'),
		active: () => call<string | null>('plugin:auth|get_default_user'),
		setActive: (user: string) => call<void>('plugin:auth|set_default_user', { user }),
		remove: (user: string) => call<void>('plugin:auth|remove_user', { user }),
		loginMicrosoft: () => call<Account | null>('plugin:auth|login'),
		loginOffline: (username: string) => call<Account>('plugin:auth|offline_login', { username }),
	},

	metadata: {
		gameVersions: () =>
			call<{ versions: GameVersion[] }>('plugin:metadata|metadata_get_game_versions'),
		/** The core keys the NeoForge manifest as `neo`, matching its metadata server path. */
		loaderVersions: (loader: Loader) =>
			call<LoaderManifest>('plugin:metadata|metadata_get_loader_versions', {
				loader: loader === 'neoforge' ? 'neo' : loader,
			}),
	},

	worlds: {
		list: (instanceId: string) =>
			call<World[]>('plugin:worlds|get_instance_worlds', { instanceId }),
		joinSingleplayer: (instanceId: string, world: string) =>
			call<unknown>('plugin:worlds|start_join_singleplayer_world', { instanceId, world }),
		joinServer: (instanceId: string, address: string) =>
			call<unknown>('plugin:worlds|start_join_server', { instanceId, address }),
		addServer: (instanceId: string, name: string, address: string) =>
			call<number>('plugin:worlds|add_server_to_instance', {
				instanceId,
				name,
				address,
				packStatus: 'prompt',
			}),
		removeServer: (instanceId: string, index: number) =>
			call<void>('plugin:worlds|remove_server_from_instance', { instanceId, index }),
	},

	files: {
		/** Entries of a folder inside the instance directory; `modified` is in seconds. */
		list: (instanceId: string, path: string) =>
			call<{ name: string; path: string; kind: string; modified: number }[]>(
				'plugin:files|file_list',
				{ instanceId, path },
			),
		read: (instanceId: string, path: string) =>
			call<number[]>('plugin:files|file_read', { instanceId, path }),
	},

	logs: {
		live: (instanceId: string) =>
			call<string[]>('plugin:logs|logs_get_live_log_buffer', { instanceId }),
		clear: (instanceId: string) =>
			call<void>('plugin:logs|logs_clear_live_log_buffer', { instanceId }),
	},

	screenshots: {
		list: () => call<Screenshot[]>('plugin:instance|instance_list_all_screenshots'),
		open: (screenshot: Screenshot) =>
			call<void>('plugin:instance|instance_open_screenshot', {
				key: { instance_id: screenshot.instance_id, file_name: screenshot.file_name },
			}),
		remove: (screenshot: Screenshot) =>
			call<void>('plugin:instance|instance_delete_screenshots', {
				keys: [{ instance_id: screenshot.instance_id, file_name: screenshot.file_name }],
			}),
		thumbnail: (path: string, size: number) =>
			call<string>('plugin:utils|get_image_thumbnail', { path, size }),
	},

	skins: {
		list: () => call<Skin[]>('plugin:minecraft-skins|get_available_skins', {}),
		capes: () => call<Cape[]>('plugin:minecraft-skins|get_available_capes', {}),
		equip: (skin: Skin) => call<void>('plugin:minecraft-skins|equip_skin', { skin }),
		addCustom: (textureBlob: Uint8Array, variant: Skin['variant'], cape?: Cape) =>
			call<Skin>('plugin:minecraft-skins|add_and_equip_custom_skin', {
				textureBlob,
				variant,
				cape,
			}),
		remove: (skin: Skin) => call<void>('plugin:minecraft-skins|remove_custom_skin', { skin }),
		/** Updates a saved skin in place, e.g. switching its arm model, keeping its texture. */
		save: (skin: Skin, textureBlob: Uint8Array, variant: Skin['variant'], cape: Cape | null) =>
			call<Skin>('plugin:minecraft-skins|save_custom_skin', {
				skin,
				textureBlob,
				variant,
				cape,
				replaceTexture: false,
			}),
		textureBytes: async (texture: string) =>
			new Uint8Array(
				await call<number[]>('plugin:minecraft-skins|normalize_skin_texture', { texture }),
			),
		/** Returns a PNG data URL that WebGL can load without cross-origin restrictions. */
		textureDataUrl: async (texture: string) => {
			const bytes = new Uint8Array(
				await call<number[]>('plugin:minecraft-skins|normalize_skin_texture', { texture }),
			)
			let binary = ''
			for (const byte of bytes) binary += String.fromCharCode(byte)
			return `data:image/png;base64,${btoa(binary)}`
		},
	},

	java: {
		find: (version: number) =>
			call<JavaVersion[]>('plugin:jre|jre_find_filtered_jres', { version }),
		autoInstall: (javaVersion: number) =>
			call<string>('plugin:jre|jre_auto_install_java', { javaVersion }),
		/** Total system memory in megabytes; the core reports it in kilobytes. */
		maxMemory: async () => Math.floor((await call<number>('plugin:jre|jre_get_max_memory')) / 1024),
	},

	settings: {
		get: () => call<AppSettings>('plugin:settings|settings_get'),
		set: (settings: AppSettings) => call<void>('plugin:settings|settings_set', { settings }),
	},

	game: {
		/** PNG bytes of textures read from the installed Minecraft client jar, keyed by path under `textures/`. */
		textures: (names: string[]) => call<Record<string, number[]>>('read_game_textures', { names }),
	},

	system: {
		openPath: (path: string) => call<void>('plugin:utils|open_path', { path }),
		os: () => call<string>('plugin:utils|get_os'),
	},
}
