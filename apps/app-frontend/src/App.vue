<script setup>
import { ModrinthApiError } from '@modrinth/api-client'
import { RefreshCwIcon } from '@modrinth/assets'
import {
	ContentInstallModal,
	ContentUpdaterModal,
	CreationFlowModal,
	defineMessages,
	I18nDebugPanel,
	LoadingBar,
	NotificationPanel,
	PopupNotificationPanel,
	provideLoadingState,
	provideModalBehavior,
	provideModrinthClient,
	provideNotificationManager,
	providePageContext,
	providePopupNotificationManager,
	TooltipDirective,
	useVIntl,
} from '@modrinth/ui'
import { useQueries, useQuery, useQueryClient } from '@tanstack/vue-query'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { type } from '@tauri-apps/plugin-os'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

import { useRouteLoading } from '@/app/runtime/use-route-loading'
import NavRail from '@/app/shell/nav-rail.vue'
import AppSidebar from '@/app/shell/sidebar/index.vue'
import AppTitleBar from '@/app/shell/title-bar/index.vue'
import ErrorModal from '@/components/ui/ErrorModal.vue'
import AddServerToInstanceModal from '@/components/ui/install_flow/AddServerToInstanceModal.vue'
import UnknownPackWarningModal from '@/components/ui/install_flow/UnknownPackWarningModal.vue'
import IconEditorModal from '@/components/ui/instance_settings/icon-editor-modal/index.vue'
import MinecraftAuthErrorModal from '@/components/ui/minecraft-auth-error-modal/MinecraftAuthErrorModal.vue'
import MinecraftRequiredModal from '@/components/ui/minecraft-required-modal/MinecraftRequiredModal.vue'
import InstallToPlayModal from '@/components/ui/modal/InstallToPlayModal.vue'
import ModpackAlreadyInstalledModal from '@/components/ui/modal/ModpackAlreadyInstalledModal.vue'
import UpdateToPlayModal from '@/components/ui/modal/UpdateToPlayModal.vue'
import SplashScreen from '@/components/ui/SplashScreen.vue'
import { useCheckDisableMouseover } from '@/composables/macCssFix.js'
import { useAppEvent } from '@/composables/use-app-event'
import { useAppSettings } from '@/composables/use-app-settings.ts'
import { useError } from '@/composables/use-error.js'
import { useInstanceMetadataRefresh } from '@/composables/use-instance-metadata-refresh'
import { useQuickInstanceLimit } from '@/composables/use-quick-instance-limit.ts'
import { isDarkTheme, useTheme } from '@/composables/use-theme.ts'
import { provideMinecraftAccounts } from '@/features/minecraft-accounts/context'
import AppSettingsModal from '@/features/settings/app-settings-modal/index.vue'
import { provideSettingsActions } from '@/features/settings/settings-actions'
import { rememberAccountAppearance } from '@/helpers/account-appearance.ts'
import { get_version } from '@/helpers/cache.js'
import { gameSettingsQueryOptions } from '@/helpers/game-options'
import { get as getInstance, run, set_global_synced_option } from '@/helpers/instance'
import { maxMemoryQueryOptions } from '@/helpers/jre.js'
import { mergeUrlQuery, parseModrinthLink } from '@/helpers/project-links.ts'
import {
	appSettingsKeys,
	appSettingsQueryOptions,
	get as getSettings,
	set as setSettings,
} from '@/helpers/settings.ts'
import { debugStartup, traceStartupStep } from '@/helpers/startup-debug'
import { get_opening_command, initialize_state } from '@/helpers/state'
import {
	gameOptionsSyncSourcesQueryOptions,
	globalSyncedOptionsQueryOptions,
	initializedSyncedOptionsQueryOptions,
	syncedOptionsKeys,
	syncedServersQueryOptions,
} from '@/helpers/synced-options'
import { syncedPackQueryOptions } from '@/helpers/synced-packs'
import { parse_modrinth_user_link } from '@/helpers/users'
import { getOS, isDev } from '@/helpers/utils.js'
import { start_join_server, start_join_singleplayer_world } from '@/helpers/worlds.ts'
import i18n, { setLocale } from '@/i18n.config'
import { instanceListQueryOptions, screenshotKeys } from '@/pages/instance/query-options'
import { createAppClient } from '@/platform/modrinth-client'
import { appUpdateState } from '@/providers/app-update.ts'
import { createContentInstall, provideContentInstall } from '@/providers/content-install'
import { provideAppUpdateDownloadProgress } from '@/providers/download-progress.ts'
import { createServerInstall, provideServerInstall } from '@/providers/server-install'
import { setupProviders } from '@/providers/setup'
import { setupAppEventsProvider } from '@/providers/setup/app-events'
import { setupAuthProvider } from '@/providers/setup/auth'
import { setupAppUserPreferencesProvider } from '@/providers/setup/user-preferences.ts'
import { createBreadcrumbManager, provideBreadcrumbManager } from '@/shared/breadcrumbs'

import { AppNotificationManager } from './providers/app-notifications'
import { AppPopupNotificationManager } from './providers/app-popup-notifications'

debugStartup('App setup entered')
const appSettings = useAppSettings()
const appTheme = useTheme()
const quickInstances = useQuickInstanceLimit()
const router = useRouter()
const route = useRoute()
const { channel: appEventChannel, events: appEvents } = setupAppEventsProvider()
useInstanceMetadataRefresh(appEvents)
const breadcrumbManager = createBreadcrumbManager()
provideBreadcrumbManager(breadcrumbManager)
const APP_SIDEBAR_WIDTH = 300
const credentials = ref(null)
const sidebarVisible = computed(
	() => route.path.startsWith('/project') || route.path.startsWith('/user'),
)
const notificationManager = new AppNotificationManager()
provideNotificationManager(notificationManager)
const { handleError, addNotification } = notificationManager

useAppEvent(
	'warning',
	(event) =>
		addNotification({
			title: formatMessage(messages.warning),
			text: event.message,
			type: 'warning',
		}),
	appEvents,
)

const popupNotificationManager = new AppPopupNotificationManager()
providePopupNotificationManager(popupNotificationManager)

const tauriApiClient = createAppClient()
provideModrinthClient(tauriApiClient)
providePageContext({
	hierarchicalSidebarAvailable: ref(true),
	showAds: ref(false),
	adConsentAvailable: ref(false),
	floatingActionBarOffsets: {
		left: ref('4.5rem'),
		right: computed(() => (sidebarVisible.value ? `${APP_SIDEBAR_WIDTH}px` : '0px')),
	},
	featureFlags: {
		serverRamAsBytesAlwaysOn: computed(() =>
			appSettings.getFeatureFlag('server_ram_as_bytes_always_on'),
		),
	},
	openExternalUrl: (url) => void openUrl(url),
})
provideModalBehavior({
	noblur: computed(() => !appTheme.advancedRendering),
})

const creationIconEditorModal = ref(null)
const creationGeneratedIcon = ref(null)
const creationIconTarget = ref('creation-flow')

const {
	installationModal,
	unknownPackWarningModal,
	fetchExistingInstanceNames,
	handleCreate,
	searchProjects,
	getLoaderManifest,
	setModpackAlreadyInstalledModal,
	handleModpackDuplicateCreateAnyway,
	handleModpackDuplicateGoToInstance,
	onboardingChecklist,
	tags,
} = setupProviders(
	tauriApiClient,
	notificationManager,
	popupNotificationManager,
	appEvents,
	(iconPath) =>
		creationGeneratedIcon.value?.path === iconPath ? creationGeneratedIcon.value.config : null,
)

async function randomizeCreationIcon() {
	const generated = await creationIconEditorModal.value?.randomizeAndSave()
	if (!generated) return null

	creationGeneratedIcon.value = { path: generated.iconPath, config: generated.config }
	return {
		path: generated.iconPath,
		previewUrl: convertFileSrc(generated.iconPath),
	}
}

function customizeCreationIcon() {
	creationIconTarget.value = 'creation-flow'
	creationIconEditorModal.value?.show()
}

function customizeContentInstallIcon() {
	creationIconTarget.value = 'content-install'
	creationIconEditorModal.value?.show()
}

function onCreationIconSaved(iconPath, config) {
	creationGeneratedIcon.value = { path: iconPath, config }
	if (creationIconTarget.value === 'content-install') {
		modInstallModal.value?.setIcon(iconPath, convertFileSrc(iconPath))
		return
	}

	const context = installationModal.value?.ctx
	if (!context) return

	context.instanceIcon.value = null
	context.instanceIconUrl.value = convertFileSrc(iconPath)
	context.instanceIconPath.value = iconPath
}

const offline = ref(!navigator.onLine)
window.addEventListener('offline', () => {
	offline.value = true
})
window.addEventListener('online', () => {
	offline.value = false
})

const os = ref('')
const isDevEnvironment = ref(false)

const stateInitialized = ref(false)
const globalSyncedOptionsQuery = useQuery({
	...globalSyncedOptionsQueryOptions(),
	enabled: computed(() => stateInitialized.value),
})
useQueries({
	queries: computed(() =>
		[
			appSettingsQueryOptions(),
			instanceListQueryOptions(),
			maxMemoryQueryOptions(),
			gameSettingsQueryOptions(),
			initializedSyncedOptionsQueryOptions(),
			gameOptionsSyncSourcesQueryOptions(),
			syncedServersQueryOptions(),
			syncedPackQueryOptions('resourcepack'),
			syncedPackQueryOptions('datapack'),
		].map((options) => ({
			...options,
			enabled: stateInitialized.value && options.enabled !== false,
		})),
	),
})

const isMaximized = ref(false)
const isFullscreen = ref(false)

watch([os, isFullscreen], ([osName, fullscreen]) => {
	document.documentElement.classList.toggle('mac-traffic-lights', osName === 'MacOS' && !fullscreen)
})

let unlistenEditMenu

function handleEditMenuAction(action) {
	const event = new CustomEvent(`edit-menu:${action}`, { cancelable: true })
	if (document.dispatchEvent(event)) document.execCommand(action)
}

onMounted(async () => {
	try {
		const listeners = await Promise.all([
			listen('edit-menu://undo', () => handleEditMenuAction('undo')),
			listen('edit-menu://redo', () => handleEditMenuAction('redo')),
		])
		unlistenEditMenu = () => listeners.forEach((unlisten) => unlisten())
	} catch (error) {
		handleError(error)
	}

	await useCheckDisableMouseover()

	document.querySelector('body').addEventListener('click', handleClick)
	document.querySelector('body').addEventListener('auxclick', handleAuxClick)
	document.querySelector('body').addEventListener('contextmenu', handleContextMenu)
})

onUnmounted(async () => {
	document.querySelector('body').removeEventListener('click', handleClick)
	document.querySelector('body').removeEventListener('auxclick', handleAuxClick)
	document.querySelector('body').removeEventListener('contextmenu', handleContextMenu)
	unlistenEditMenu?.()
})

const { formatMessage } = useVIntl()

const messages = defineMessages({
	warning: { id: 'app.notification.warning', defaultMessage: 'Warning' },
	home: {
		id: 'app.nav.home',
		defaultMessage: 'Home',
	},
	screenshots: {
		id: 'app.nav.screenshots',
		defaultMessage: 'Screenshots',
	},
	createNewInstance: {
		id: 'app.nav.create-new-instance',
		defaultMessage: 'Create new instance',
	},
	restarting: {
		id: 'app.restarting',
		defaultMessage: 'Restarting...',
	},
})

async function setupApp() {
	tags.initialize()
	await traceStartupStep('Initialize onboarding checklist', () => onboardingChecklist.initialize())

	const {
		native_decorations,
		theme,
		locale,
		hide_nametag_skins_page,
		advanced_rendering,
		toggle_sidebar,
		sync_theme_across_devices,
		sync_behavior_across_devices,
		sync_features_across_devices,
		show_files_tab_in_instances,
		show_worlds_tab_in_instances,
		show_screenshots_tab_in_instances,
		show_skin_selector_in_sidebar,
		refocus_on_game_close,
		compact_instance_cards,
		show_play_time,
		warn_on_unknown_modpacks,
		skip_non_essential_warnings,
		show_jump_in,
		always_show_copy_details,
		hide_installed_modpacks,
		advanced_filters_collapsed,
		dismissed_photosensitivity_filter_warning,
		friends_active_collapsed,
		friends_online_collapsed,
		friends_offline_collapsed,
		friends_pending_collapsed,
		developer_mode,
		feature_flags,
	} = await traceStartupStep('Read startup settings', getSettings)

	// Initialize locale from saved settings
	if (locale) {
		await traceStartupStep('Apply startup locale', () => setLocale(locale))
	}

	Object.assign(appSettings.featureFlags, feature_flags)
	isMaximized.value = await traceStartupStep('Read window maximized state', () =>
		getCurrentWindow().isMaximized(),
	)
	isFullscreen.value = await traceStartupStep('Read window fullscreen state', () =>
		getCurrentWindow().isFullscreen(),
	)
	os.value = await traceStartupStep('Read operating system', getOS)
	isDevEnvironment.value = await traceStartupStep('Read development mode', isDev)
	appSettings.nativeDecorations = native_decorations
	if (os.value !== 'MacOS') {
		await traceStartupStep('Apply window decorations', () =>
			getCurrentWindow().setDecorations(native_decorations),
		)
	}

	appTheme.preferred = theme
	appTheme.advancedRendering = advanced_rendering
	appTheme.syncAcrossDevices = sync_theme_across_devices
	appSettings.syncBehaviorAcrossDevices = sync_behavior_across_devices
	appSettings.syncFeaturesAcrossDevices = sync_features_across_devices
	appSettings.hideNametagSkinsPage = hide_nametag_skins_page
	appSettings.toggleSidebar = toggle_sidebar
	appSettings.showFilesTabInInstances = show_files_tab_in_instances
	appSettings.showWorldsTabInInstances = show_worlds_tab_in_instances
	appSettings.showScreenshotsTabInInstances = show_screenshots_tab_in_instances
	appSettings.showSkinSelectorInSidebar = show_skin_selector_in_sidebar
	appSettings.refocusOnGameClose = refocus_on_game_close
	appSettings.compactInstanceCards = compact_instance_cards
	appSettings.showPlayTime = show_play_time
	appSettings.warnOnUnknownModpacks = warn_on_unknown_modpacks
	appSettings.skipNonEssentialWarnings = skip_non_essential_warnings
	appSettings.showJumpIn = show_jump_in
	appSettings.alwaysShowCopyDetails = always_show_copy_details
	appSettings.hideInstalledModpacks = hide_installed_modpacks
	appSettings.advancedFiltersCollapsed = advanced_filters_collapsed
	appSettings.dismissedPhotosensitivityFilterWarning = dismissed_photosensitivity_filter_warning
	appSettings.friendsActiveCollapsed = friends_active_collapsed
	appSettings.friendsOnlineCollapsed = friends_online_collapsed
	appSettings.friendsOfflineCollapsed = friends_offline_collapsed
	appSettings.friendsPendingCollapsed = friends_pending_collapsed
	appSettings.devMode = developer_mode
	stateInitialized.value = true
	debugStartup('App state initialized')
	await traceStartupStep('Render initialized app', nextTick)

	await traceStartupStep('Register window resize listener', () =>
		getCurrentWindow().onResized(async () => {
			isMaximized.value = await getCurrentWindow().isMaximized()
			isFullscreen.value = await getCurrentWindow().isFullscreen()
		}),
	)

	const osType = await traceStartupStep('Read operating system type', async () => type())
	if (osType === 'macos') {
		document.getElementsByTagName('html')[0].classList.add('mac')
	} else {
		document.getElementsByTagName('html')[0].classList.add('windows')
	}

	traceStartupStep('Read opening command', get_opening_command).then(handleCommand)
}

const stateFailed = ref(false)
const { loading, onSuspensePending, onSuspenseResolve } = useRouteLoading({
	stateInitialized,
	stateFailed,
})
provideLoadingState(loading)

traceStartupStep('Initialize backend state', () => initialize_state(appEventChannel))
	.then(() => {
		traceStartupStep('Initialize frontend state', setupApp).catch((err) => {
			stateFailed.value = true
			console.error(err)
			error.showError(err, null, false, 'state_init')
		})
	})
	.catch((err) => {
		stateFailed.value = true
		console.error('Failed to initialize app', err)
		error.showError(err, null, false, 'state_init')
	})

const queryClient = useQueryClient()

const error = useError()
const errorModal = ref()
const minecraftAuthErrorModal = ref()
const minecraftRequiredModal = ref()

const contentInstall = createContentInstall({ router, handleError, appEvents })
provideContentInstall(contentInstall)
const {
	instances: contentInstallInstances,
	compatibleLoaders: contentInstallLoaders,
	gameVersions: contentInstallGameVersions,
	loading: contentInstallLoading,
	defaultTab: contentInstallDefaultTab,
	preferredLoader: contentInstallPreferredLoader,
	preferredGameVersion: contentInstallPreferredGameVersion,
	releaseGameVersions: contentInstallReleaseGameVersions,
	projectInfo: contentInstallProjectInfo,
	handleInstallToInstance,
	handleCreateAndInstall,
	prepareNewInstance,
	handleNavigate: handleContentInstallNavigate,
	handleCancel: handleContentInstallCancel,
	setContentInstallModal,
	setModpackAlreadyInstalledModal: setContentInstallModpackAlreadyInstalledModal,
	handleModpackDuplicateCreateAnyway: handleContentInstallModpackDuplicateCreateAnyway,
	handleModpackDuplicateGoToInstance: handleContentInstallModpackDuplicateGoToInstance,
	setIncompatibilityWarningModal: setContentIncompatibilityWarningModal,
	incompatibilityWarningVersions: contentInstallIncompatibilityWarningVersions,
	incompatibilityWarningCurrentGameVersion: contentInstallIncompatibilityWarningCurrentGameVersion,
	incompatibilityWarningCurrentLoader: contentInstallIncompatibilityWarningCurrentLoader,
	incompatibilityWarningProjectType: contentInstallIncompatibilityWarningProjectType,
	incompatibilityWarningProjectIconUrl: contentInstallIncompatibilityWarningProjectIconUrl,
	incompatibilityWarningProjectName: contentInstallIncompatibilityWarningProjectName,
	incompatibilityWarningMessage: contentInstallIncompatibilityWarningMessage,
	incompatibilityWarningInstalling: contentInstallIncompatibilityWarningInstalling,
	handleIncompatibilityWarningInstall: handleContentInstallIncompatibilityWarningInstall,
	handleIncompatibilityWarningCancel: handleContentInstallIncompatibilityWarningCancel,
} = contentInstall

async function prepareCreationProjectInstall(projectId, projectType) {
	if (projectType === 'modpack') {
		await contentInstall.install(
			projectId,
			null,
			null,
			'CreationModalProject',
			undefined,
			(instanceId) => void router.push(`/instance/${encodeURIComponent(instanceId)}`),
		)
		return null
	}

	await prepareNewInstance(projectId)
	const info = contentInstallProjectInfo.value
	if (!info) throw new Error(`Project information is unavailable: '${projectId}'`)

	return {
		projectId,
		title: info.title,
		iconUrl: info.iconUrl,
		link: info.link,
		owner: info.owner,
		compatibleLoaders: [...contentInstallLoaders.value],
		gameVersions: [...contentInstallGameVersions.value],
		releaseGameVersions: new Set(contentInstallReleaseGameVersions.value),
	}
}

const serverInstall = createServerInstall({
	router,
	handleError,
	popupNotificationManager,
	appEvents,
})
provideServerInstall(serverInstall)
const {
	setInstallToPlayModal: setServerInstallToPlayModal,
	setUpdateToPlayModal: setServerUpdateToPlayModal,
	setAddServerToInstanceModal: setServerAddServerToInstanceModal,
} = serverInstall

const modInstallModal = ref()
const modpackAlreadyInstalledModal = ref()
const contentInstallModpackAlreadyInstalledModal = ref()
const addServerToInstanceModal = ref()
const incompatibilityWarningModal = ref()
const installToPlayModal = ref()
const updateToPlayModal = ref()

const appSettingsModal = ref()

provideSettingsActions({
	openSettings: () => appSettingsModal.value?.show(),
	openProfile: () => appSettingsModal.value?.show(),
	openFeatureFlags: () => appSettingsModal.value?.showFeatureFlags(),
	openSyncedOptions: () => appSettingsModal.value?.showSyncedOptions(),
	openInstanceDefaults: (tab) => appSettingsModal.value?.showInstanceDefaults(tab),
})

watch(incompatibilityWarningModal, (modal) => {
	if (modal) {
		setContentIncompatibilityWarningModal(modal)
	}
})

const authProvider = setupAuthProvider(credentials, () => {})

const userPreferences = setupAppUserPreferencesProvider(authProvider, notificationManager)
let userPreferencesSync = Promise.resolve()

watch(
	[userPreferences.preferences, stateInitialized],
	([preferences, initialized]) => {
		if (!preferences || !initialized) return

		userPreferencesSync = userPreferencesSync
			.then(async () => {
				const settings = await getSettings()
				const selectedTheme = preferences.appearance.auto ? 'system' : preferences.appearance.theme
				const userId = credentials.value?.user_id ?? credentials.value?.user?.id
				if (userId) {
					rememberAccountAppearance(userId, preferences.appearance)
				}
				if (appTheme.syncAcrossDevices && isDarkTheme(preferences.appearance.theme)) {
					appTheme.preferredDark = preferences.appearance.theme
				}
				const locale = preferences.localization.locale
				const behavior = preferences.behavior
				let settingsChanged = false

				if (appTheme.syncAcrossDevices && appTheme.preferred !== selectedTheme) {
					appTheme.preferred = selectedTheme
				}
				if (i18n.global.locale.value !== locale) {
					await setLocale(locale)
				}

				if (appTheme.syncAcrossDevices && settings.theme !== selectedTheme) {
					settings.theme = selectedTheme
					settingsChanged = true
				}
				if (settings.locale !== locale) {
					settings.locale = locale
					settingsChanged = true
				}

				if (behavior && appSettings.syncBehaviorAcrossDevices) {
					const behaviorSettings = {
						refocus_on_game_close: 'refocusOnGameClose',
						compact_instance_cards: 'compactInstanceCards',
						show_play_time: 'showPlayTime',
						warn_on_unknown_modpacks: 'warnOnUnknownModpacks',
						skip_non_essential_warnings: 'skipNonEssentialWarnings',
					}
					for (const [key, stateKey] of Object.entries(behaviorSettings)) {
						const value = behavior[key] ?? settings[key]
						appSettings[stateKey] = value
						if (settings[key] !== value) {
							settings[key] = value
							settingsChanged = true
						}
					}

					appSettings.toggleSidebar = behavior.hide_right_sidebar
					appSettings.hideNametagSkinsPage = behavior.hide_nametag

					if (settings.hide_on_process_start !== behavior.minimize_app) {
						settings.hide_on_process_start = behavior.minimize_app
						settingsChanged = true
					}
					if (settings.toggle_sidebar !== behavior.hide_right_sidebar) {
						settings.toggle_sidebar = behavior.hide_right_sidebar
						settingsChanged = true
					}
					if (settings.hide_nametag_skins_page !== behavior.hide_nametag) {
						settings.hide_nametag_skins_page = behavior.hide_nametag
						settingsChanged = true
					}
				}

				if (behavior && appSettings.syncFeaturesAcrossDevices) {
					const featureSettings = {
						show_jump_in: 'showJumpIn',
						show_files_tab_in_instances: 'showFilesTabInInstances',
						show_worlds_tab_in_instances: 'showWorldsTabInInstances',
						show_screenshots_tab_in_instances: 'showScreenshotsTabInInstances',
						show_skin_selector_in_sidebar: 'showSkinSelectorInSidebar',
					}
					for (const [key, stateKey] of Object.entries(featureSettings)) {
						const value = behavior[key] ?? settings[key]
						appSettings[stateKey] = value
						if (settings[key] !== value) {
							settings[key] = value
							settingsChanged = true
						}
					}
					if (typeof behavior.quick_instance_count === 'number') {
						quickInstances.setLimit(behavior.quick_instance_count)
					}

					const showAllScreenshots = behavior.show_all_screenshots
					if (typeof showAllScreenshots === 'boolean') {
						const globalSyncedOptions =
							globalSyncedOptionsQuery.data.value ??
							(await queryClient.fetchQuery(globalSyncedOptionsQueryOptions()))
						if (globalSyncedOptions.screenshots !== showAllScreenshots) {
							const updatedGlobalSyncedOptions = await set_global_synced_option(
								'screenshots',
								showAllScreenshots,
							)
							queryClient.setQueryData(syncedOptionsKeys.global, updatedGlobalSyncedOptions)
							await queryClient.invalidateQueries({ queryKey: screenshotKeys.all })
						}
					}
				}

				if (settingsChanged) {
					await setSettings(settings)
					queryClient.setQueryData(appSettingsKeys.all, settings)
				}
			})
			.catch(handleError)
	},
	{ immediate: true },
)

onMounted(() => {
	invoke('show_window')

	error.setErrorModal(errorModal.value)
	error.setMinecraftAuthErrorModal(minecraftAuthErrorModal.value)
	error.setMinecraftRequiredModal(minecraftRequiredModal.value)

	setContentIncompatibilityWarningModal(incompatibilityWarningModal.value)
	setContentInstallModal(modInstallModal.value)
	setContentInstallModpackAlreadyInstalledModal(contentInstallModpackAlreadyInstalledModal.value)
	setModpackAlreadyInstalledModal(modpackAlreadyInstalledModal.value)
	setServerAddServerToInstanceModal(addServerToInstanceModal.value)
	setServerInstallToPlayModal(installToPlayModal.value)
	setServerUpdateToPlayModal(updateToPlayModal.value)
})

const navRail = ref(null)
provideMinecraftAccounts(computed(() => navRail.value?.minecraftAccounts ?? null))

useAppEvent('command', handleCommand, appEvents)

async function handleCommand(e) {
	if (!e) return

	if (e.event === 'LaunchInstance') {
		const instance = await getInstance(e.id).catch(handleError)
		if (!instance || instance.quarantined) return

		if (e.server) {
			await start_join_server(e.id, e.server).catch(handleError)
		} else if (e.singleplayer_world) {
			await start_join_singleplayer_world(e.id, e.singleplayer_world).catch(handleError)
		} else {
			await run(e.id).catch(handleError)
		}
	} else if (e.event === 'InstallVersion') {
		const version = await get_version(e.id, 'must_revalidate').catch(handleError)
		if (version) {
			await contentInstall
				.install(version.project_id, version.id, null, 'URLConfirmModal', undefined, undefined, {
					showProjectInfo: true,
				})
				.catch(handleError)
		}
	} else {
		await contentInstall
			.install(e.id, null, null, 'URLConfirmModal', undefined, undefined, { showProjectInfo: true })
			.catch(handleError)
	}
}

const { restarting } = appUpdateState

async function openModrinthProjectLinkInApp(parsed) {
	const { slug, pathSuffix, url } = parsed
	const loadToken = loading.begin()
	try {
		const { id } = await tauriApiClient.labrinth.projects_v2.check(slug)
		const query = mergeUrlQuery(route.query, url)
		await router.push({
			path: `/project/${id}${pathSuffix}`,
			query,
			hash: url.hash || undefined,
		})
	} catch (err) {
		if (err instanceof ModrinthApiError && err.statusCode === 404) {
			openUrl(url.href)
		} else {
			handleError(err)
		}
	} finally {
		loading.end(loadToken)
	}
}

function handleClick(e) {
	let target = e.target
	while (target != null) {
		if (target.matches('a')) {
			if (
				target.href &&
				['http://', 'https://', 'mailto:', 'tel:'].some((v) => target.href.startsWith(v)) &&
				!target.classList.contains('router-link-active') &&
				!target.href.startsWith('http://localhost') &&
				!target.href.startsWith('https://tauri.localhost') &&
				!target.href.startsWith('http://tauri.localhost')
			) {
				const userPath = parse_modrinth_user_link(target.href)
				const parsed = parseModrinthLink(target.href)
				if (userPath) {
					void router.push(userPath)
				} else if (target.target !== '_blank' && parsed) {
					void openModrinthProjectLinkInApp(parsed)
				} else {
					openUrl(target.href)
				}
			}
			e.preventDefault()
			break
		}
		target = target.parentElement
	}
}

function handleAuxClick(e) {
	// disables middle click -> new tab
	if (e.button === 1) {
		e.preventDefault()
		// instead do a left click
		const event = new MouseEvent('click', {
			view: window,
			bubbles: true,
			cancelable: true,
		})
		e.target.dispatchEvent(event)
	}
}

function handleContextMenu(event) {
	const target = event.target
	if (target instanceof Element) {
		if (target.closest('img, textarea, [contenteditable="true"]')) return
		const input = target.closest('input')
		if (
			input &&
			!['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range'].includes(input.type)
		) {
			return
		}
	}

	const selection = window.getSelection()
	if (
		target instanceof Node &&
		selection &&
		!selection.isCollapsed &&
		selection.containsNode(target, true)
	) {
		return
	}

	event.preventDefault()
}

provideAppUpdateDownloadProgress({ progress: appUpdateState.progress, version: ref() })
</script>

<template>
	<TooltipDirective />
	<SplashScreen v-if="!stateFailed" ref="splashScreen" data-tauri-drag-region />
	<div id="teleports"></div>
	<div
		v-if="stateInitialized"
		class="app-grid-layout relative"
		:class="{ 'disable-advanced-rendering': !appTheme.advancedRendering }"
	>
		<Transition name="fade">
			<div
				v-if="restarting"
				data-tauri-drag-region
				class="inset-0 fixed bg-black/80 backdrop-blur z-[200] flex items-center justify-center"
			>
				<span
					data-tauri-drag-region
					class="flex items-center gap-4 text-contrast font-semibold text-xl select-none cursor-default"
				>
					<RefreshCwIcon data-tauri-drag-region class="animate-spin w-6 h-6" />
					{{ formatMessage(messages.restarting) }}
				</span>
			</div>
		</Transition>
		<AppSettingsModal ref="appSettingsModal" />
		<CreationFlowModal
			ref="installationModal"
			type="instance"
			show-snapshot-toggle
			skip-setup-type
			:fetch-existing-instance-names="fetchExistingInstanceNames"
			:search-projects="searchProjects"
			:prepare-project-install="prepareCreationProjectInstall"
			:create-project-install="handleCreateAndInstall"
			:get-loader-manifest="getLoaderManifest"
			:randomize-instance-icon="randomizeCreationIcon"
			:customize-instance-icon="customizeCreationIcon"
			@create="handleCreate"
		/>
		<IconEditorModal
			ref="creationIconEditorModal"
			:config="creationGeneratedIcon?.config"
			@saved="onCreationIconSaved"
		/>
		<UnknownPackWarningModal ref="unknownPackWarningModal" />
		<NavRail ref="navRail" :show-screenshots="!!globalSyncedOptionsQuery.data.value?.screenshots" />
		<AppTitleBar />
	</div>
	<div
		v-if="stateInitialized"
		class="app-contents"
		:class="{
			'sidebar-enabled': sidebarVisible,
			'disable-advanced-rendering': !appTheme.advancedRendering,
		}"
	>
		<div class="app-viewport flex-grow router-view">
			<div
				class="loading-indicator-container h-8 fixed z-50 pointer-events-none"
				:style="{
					top: 'calc(var(--top-bar-height))',
					left: 'calc(var(--left-bar-width))',
					width: 'calc(100% - var(--left-bar-width) - var(--right-bar-width))',
				}"
			>
				<LoadingBar position="absolute" />
			</div>
			<div
				v-if="appSettings.featureFlags.page_path"
				class="absolute bottom-0 left-0 m-2 bg-tooltip-bg text-tooltip-text font-semibold rounded-full px-2 py-1 text-xs z-50"
			>
				{{ route.fullPath }}
			</div>
			<div
				id="background-teleport-target"
				class="absolute h-full -z-10 overflow-hidden"
				:style="{
					width: 'calc(100% - var(--right-bar-width))',
				}"
			></div>
			<RouterView v-slot="{ Component }">
				<template v-if="Component">
					<Suspense @pending="onSuspensePending" @resolve="onSuspenseResolve">
						<component :is="Component"></component>
					</Suspense>
				</template>
			</RouterView>
		</div>
		<AppSidebar v-show="sidebarVisible" :visible="sidebarVisible" />
	</div>
	<I18nDebugPanel />
	<NotificationPanel :has-sidebar="sidebarVisible" />
	<PopupNotificationPanel :has-sidebar="sidebarVisible" />
	<ErrorModal ref="errorModal" />
	<MinecraftAuthErrorModal ref="minecraftAuthErrorModal" />
	<MinecraftRequiredModal ref="minecraftRequiredModal" />
	<ContentInstallModal
		ref="modInstallModal"
		:instances="contentInstallInstances"
		:compatible-loaders="contentInstallLoaders"
		:game-versions="contentInstallGameVersions"
		:loading="contentInstallLoading"
		:default-tab="contentInstallDefaultTab"
		:preferred-loader="contentInstallPreferredLoader"
		:preferred-game-version="contentInstallPreferredGameVersion"
		:release-game-versions="contentInstallReleaseGameVersions"
		:project-info="contentInstallProjectInfo"
		:randomize-icon="randomizeCreationIcon"
		:customize-icon="customizeContentInstallIcon"
		@install="handleInstallToInstance"
		@create-and-install="handleCreateAndInstall"
		@navigate="handleContentInstallNavigate"
		@cancel="handleContentInstallCancel"
	/>
	<ModpackAlreadyInstalledModal
		ref="modpackAlreadyInstalledModal"
		@create-anyway="handleModpackDuplicateCreateAnyway"
		@go-to-instance="handleModpackDuplicateGoToInstance"
	/>
	<AddServerToInstanceModal ref="addServerToInstanceModal" />
	<ContentUpdaterModal
		ref="incompatibilityWarningModal"
		mode="incompatibility-warning"
		:versions="contentInstallIncompatibilityWarningVersions"
		:current-game-version="contentInstallIncompatibilityWarningCurrentGameVersion"
		:current-loader="contentInstallIncompatibilityWarningCurrentLoader"
		current-version-id=""
		:is-app="true"
		:project-type="contentInstallIncompatibilityWarningProjectType"
		:project-icon-url="contentInstallIncompatibilityWarningProjectIconUrl"
		:project-name="contentInstallIncompatibilityWarningProjectName"
		:warning="contentInstallIncompatibilityWarningMessage"
		:action-loading="contentInstallIncompatibilityWarningInstalling"
		@update="handleContentInstallIncompatibilityWarningInstall"
		@cancel="handleContentInstallIncompatibilityWarningCancel"
	/>
	<ModpackAlreadyInstalledModal
		ref="contentInstallModpackAlreadyInstalledModal"
		@create-anyway="handleContentInstallModpackDuplicateCreateAnyway"
		@go-to-instance="handleContentInstallModpackDuplicateGoToInstance"
	/>
	<InstallToPlayModal ref="installToPlayModal" :show-external-warnings="false" />
	<UpdateToPlayModal ref="updateToPlayModal" :show-external-warnings="false" />
</template>

<style lang="scss" scoped>
.app-grid-layout,
.app-contents {
	--top-bar-height: 2.75rem;
	--left-bar-width: 4.5rem;
	--right-bar-width: 300px;
}

.app-grid-layout {
	display: grid;
	grid-template: 'nav status' 'nav dummy';
	grid-template-columns: var(--left-bar-width) 1fr;
	grid-template-rows: auto minmax(0, 1fr);
	position: relative;
	//z-index: 0;
	background-color: var(--color-raised-bg);
	height: 100vh;
}

[data-tauri-drag-region-exclude] {
	-webkit-app-region: no-drag;
}

.app-contents {
	position: absolute;
	z-index: 1;
	left: var(--left-bar-width);
	top: var(--top-bar-height);
	right: 0;
	bottom: 0;
	height: calc(100vh - var(--top-bar-height));
	background-color: var(--color-bg);
	border-top-left-radius: 0.75rem;
	overflow: hidden;

	display: grid;
	grid-template-columns: 1fr 0px;
	// transition: grid-template-columns 0.4s ease-in-out;

	&.sidebar-enabled {
		grid-template-columns: 1fr 300px;
	}
}

.loading-indicator-container {
	overflow: hidden;
}

.disable-advanced-rendering {
	*,
	:deep(*) {
		box-shadow: none !important;
		--tw-drop-shadow:;
	}
}

.app-viewport {
	flex-grow: 1;
	height: 100%;
	overflow: auto;
	overflow-x: hidden;
	scrollbar-gutter: stable;
}

@media (prefers-reduced-motion: no-preference) {
	.nav-button-animated-enter-active {
		transition: all 0.5s cubic-bezier(0.15, 1.4, 0.64, 0.96);
	}

	.nav-button-animated-leave-active {
		transition: all 0.25s ease;
	}

	.nav-button-animated-enter-active {
		position: relative;
	}

	.nav-button-animated-enter-active::before {
		content: '';
		inset: 0;
		border-radius: 100vw;
		background-color: var(--color-brand-highlight);
		position: absolute;
		animation: pop 0.5s ease-in forwards;
		opacity: 0;
	}

	@keyframes pop {
		0% {
			scale: 0.5;
		}
		50% {
			opacity: 0.5;
		}
		100% {
			scale: 1.5;
		}
	}

	.nav-button-animated-enter-from {
		scale: 0.5;
		translate: -2rem 0;
		opacity: 0;
	}

	.nav-button-animated-leave-to {
		scale: 0.75;
		opacity: 0;
	}

	.fade-enter-active {
		transition: 0.25s ease-in-out;
	}

	.fade-enter-from {
		opacity: 0;
	}
}
</style>
<style>
.os-theme-dark,
.os-theme-light {
	--os-handle-bg: var(--color-scrollbar) !important;
	--os-handle-bg-hover: var(--color-scrollbar) !important;
	--os-handle-bg-active: var(--color-scrollbar) !important;
}

.windows {
	.fake-appbar {
		height: 2.5rem !important;
	}

	.info-card {
		right: 22rem;
	}

	.profile-card {
		right: 8rem;
	}
}
</style>
