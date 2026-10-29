<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import {
	CircleAlert,
	CircleArrowDown,
	CircleCheck,
	Check,
	Cpu,
	Download,
	Gamepad2,
	Info,
	LoaderCircle,
	MemoryStick,
	Monitor,
	MonitorPlay,
	Plus,
	RefreshCw,
	Rocket,
	ShieldCheck,
	Terminal,
	Trash2,
	Users,
} from 'lucide-vue-next'
import { computed, type Component, onMounted, ref } from 'vue'

import { type AppSettings, core } from '@/api/core'
import { autofixEnabled } from '@/composables/autofix'
import { useStore } from '@/composables/store'
import { reportError } from '@/composables/toasts'
import { addAccountOpen } from '@/composables/ui-state'
import { useUpdater } from '@/composables/updater'

import authorMark from '../../../../branding/Vector.svg'

import packageInfo from '../../package.json'
import AccountAvatar from '@/components/AccountAvatar.vue'
import AppLogo from '@/components/AppLogo.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSlider from '@/components/ui/UiSlider.vue'
import UiToggle from '@/components/ui/UiToggle.vue'

type Section = 'accounts' | 'game' | 'launcher' | 'about'

const SECTIONS: { value: Section; label: string; hint: string; icon: Component }[] = [
	{ value: 'accounts', label: 'Аккаунты', hint: 'С каким ником заходить в игру', icon: Users },
	{ value: 'game', label: 'Игра', hint: 'Общие параметры для всех сборок', icon: Gamepad2 },
	{ value: 'launcher', label: 'Лаунчер', hint: 'Поведение самого Chunk', icon: Rocket },
	{ value: 'about', label: 'О приложении', hint: 'Что это за лаунчер', icon: Info },
]
const MEMORY_STEP = 512
const RESOLUTIONS: [number, number][] = [
	[1280, 720],
	[1600, 900],
	[1920, 1080],
	[2560, 1440],
]
const JVM_PRESETS = [
	{ flag: '-XX:+UseG1GC', hint: 'Сборщик G1' },
	{ flag: '-XX:+UseZGC', hint: 'Сборщик ZGC' },
	{ flag: '-XX:+AlwaysPreTouch', hint: 'Память сразу' },
	{ flag: '-XX:+ParallelRefProcEnabled', hint: 'Параллельно' },
]

const { accounts, activeAccountId, refreshAccounts } = useStore()
const section = ref<Section>('accounts')
const {
	latestVersion,
	status: updateStatus,
	checkedAt,
	checking,
	dialogOpen,
	error: updateError,
	updateInstalling,
	checkUpdates,
} = useUpdater()
const updateCard = computed(() => {
	switch (updateStatus.value) {
		case 'checking':
			return {
				icon: RefreshCw,
				title: 'Проверяем обновления…',
				text: 'Спрашиваем GitHub о новой версии',
			}
		case 'latest':
			return { icon: CircleCheck, title: 'У вас последняя версия', text: checkedText.value }
		case 'available':
			return {
				icon: CircleArrowDown,
				title: `Доступна версия ${latestVersion.value}`,
				text: `Сейчас установлена ${packageInfo.version}`,
			}
		case 'error':
			return { icon: CircleAlert, title: 'Не удалось проверить', text: updateError.value }
		default:
			return {
				icon: RefreshCw,
				title: 'Обновления',
				text: 'Проверьте, не вышла ли новая версия Chunk',
			}
	}
})
const checkedText = computed(() =>
	checkedAt.value
		? `Проверено в ${checkedAt.value.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
		: '',
)
const settings = ref<AppSettings | null>(null)
const systemMemory = ref(8192)
const status = ref<'idle' | 'saving' | 'saved'>('idle')
const confirmRemoveId = ref<string | null>(null)

const current = computed(() => SECTIONS.find((entry) => entry.value === section.value)!)
const maxMemory = computed(() => Math.max(MEMORY_STEP * 2, systemMemory.value - 1024))
const memoryPresets = computed(() =>
	[2048, 4096, 6144, 8192, 12288, 16384].filter((value) => value <= maxMemory.value),
)

onMounted(async () => {
	confirmRemoveId.value = null
	status.value = 'idle'
	try {
		const [loaded, total] = await Promise.all([
			core.settings.get(),
			core.java.maxMemory().catch(() => 8192),
		])
		settings.value = loaded
		systemMemory.value = total
	} catch (error) {
		reportError(error, 'Не удалось загрузить настройки')
	}
})

const persist = useDebounceFn(async () => {
	if (!settings.value) return
	status.value = 'saving'
	try {
		await core.settings.set(settings.value)
		status.value = 'saved'
	} catch (error) {
		status.value = 'idle'
		reportError(error, 'Не удалось сохранить')
	}
}, 450)

function update(patch: Partial<AppSettings>) {
	if (!settings.value) return
	settings.value = { ...settings.value, ...patch } as AppSettings
	void persist()
}

function flag(key: string) {
	return computed({
		get: () => Boolean(settings.value?.[key]),
		set: (value: boolean) => update({ [key]: value }),
	})
}

const fullscreen = flag('force_fullscreen')
const hideOnLaunch = flag('hide_on_process_start')
const refocus = flag('refocus_on_game_close')
const discord = flag('discord_rpc')

const memory = computed({
	get: () => Math.min(settings.value?.memory.maximum ?? 4096, maxMemory.value),
	set: (value: number) => update({ memory: { maximum: value } }),
})
const downloads = computed({
	get: () => settings.value?.max_concurrent_downloads ?? 10,
	set: (value: number) => update({ max_concurrent_downloads: value }),
})
const resolution = computed(
	() => (settings.value?.game_resolution as [number, number] | undefined) ?? [854, 480],
)
const jvmFlags = computed(() => (settings.value?.extra_launch_args as string[] | undefined) ?? [])
const jvmText = computed({
	get: () => jvmFlags.value.join(' '),
	set: (value: string) => update({ extra_launch_args: value.split(/\s+/).filter(Boolean) }),
})

function gb(megabytes: number) {
	return `${(megabytes / 1024).toFixed(1).replace(/\.0$/, '').replace('.', ',')} ГБ`
}

function setResolution(width: number, height: number) {
	update({ game_resolution: [Math.max(320, width || 854), Math.max(240, height || 480)] })
}

function toggleFlag(flagName: string) {
	const flags = jvmFlags.value
	update({
		extra_launch_args: flags.includes(flagName)
			? flags.filter((entry) => entry !== flagName)
			: [...flags, flagName],
	})
}

async function makeDefault(id: string) {
	await core.accounts.setActive(id).catch((error) => reportError(error, 'Не удалось выбрать'))
	await refreshAccounts()
}

async function removeAccount(id: string) {
	if (confirmRemoveId.value !== id) {
		confirmRemoveId.value = id
		return
	}
	confirmRemoveId.value = null
	await core.accounts.remove(id).catch((error) => reportError(error, 'Не удалось удалить аккаунт'))
	await refreshAccounts()
}
</script>

<template>
	<div class="settings-page">
		<div class="settings">
			<aside class="side">
				<div class="side__brand">
					<h1>Настройки</h1>
				</div>
				<nav class="side__nav">
					<button
						v-for="entry in SECTIONS"
						:key="entry.value"
						type="button"
						class="side__item"
						:class="{ 'side__item--active': section === entry.value }"
						@click="section = entry.value"
					>
						<component :is="entry.icon" />
						{{ entry.label }}
					</button>
				</nav>
			</aside>

			<section class="panel">
				<header class="panel__head">
					<div>
						<h2 class="panel__title">{{ current.label }}</h2>
						<p class="panel__hint">{{ current.hint }}</p>
					</div>
					<p
						v-if="section === 'game' || section === 'launcher'"
						class="panel__status"
						:class="`panel__status--${status}`"
					>
						<template v-if="status === 'saving'"
							><LoaderCircle class="spin" /> Сохранение…</template
						>
						<template v-else-if="status === 'saved'"><Check /> Сохранено</template>
						<template v-else>Сохраняется само</template>
					</p>
				</header>

				<div class="panel__body">
					<div v-if="section === 'accounts'" class="accounts">
						<article
							v-for="account in accounts"
							:key="account.profile.id"
							class="account"
							:class="{ 'account--default': account.profile.id === activeAccountId }"
						>
							<AccountAvatar :account="account" :size="52" class="account__avatar" />
							<div class="account__info">
								<strong class="account__name">{{ account.profile.name }}</strong>
								<span class="account__type">
									{{ account.offline ? 'Офлайн · вход по нику' : 'Microsoft · лицензия' }}
								</span>
							</div>
							<div class="account__actions">
								<span v-if="account.profile.id === activeAccountId" class="account__badge">
									<Check /> Основной
								</span>
								<button v-else type="button" class="pill" @click="makeDefault(account.profile.id)">
									Сделать основным
								</button>
								<button
									type="button"
									class="pill pill--danger"
									:class="{ 'pill--confirm': confirmRemoveId === account.profile.id }"
									@click="removeAccount(account.profile.id)"
								>
									<Trash2 />
									<template v-if="confirmRemoveId === account.profile.id">Удалить?</template>
								</button>
							</div>
						</article>
						<button type="button" class="account account--add" @click="addAccountOpen = true">
							<span class="account__plus"><Plus /></span>
							<span class="account__info">
								<strong class="account__name">Добавить аккаунт</strong>
								<span class="account__type">Ник для офлайна или вход через Microsoft</span>
							</span>
						</button>
					</div>

					<div v-else-if="section === 'game' && settings" class="cards stagger">
						<article class="card card--wide">
							<header class="card__head">
								<span class="card__icon"><MemoryStick /></span>
								<div class="card__titles">
									<h3>Оперативная память</h3>
									<p>Для сборок без своего значения</p>
								</div>
							</header>
							<div class="memory">
								<div class="memory__value">
									<strong>{{ gb(memory) }}</strong>
									<span>из {{ gb(systemMemory) }}</span>
								</div>
								<UiSlider
									v-model="memory"
									class="memory__slider"
									:min="1024"
									:max="maxMemory"
									:step="MEMORY_STEP"
									label="Память"
								/>
								<div class="chips">
									<button
										v-for="preset in memoryPresets"
										:key="preset"
										type="button"
										class="chip"
										:class="{ 'chip--active': memory === preset }"
										@click="memory = preset"
									>
										{{ gb(preset).replace(' ГБ', '') }}
									</button>
								</div>
							</div>
						</article>

						<article class="card">
							<header class="card__head">
								<span class="card__icon"><Monitor /></span>
								<div class="card__titles">
									<h3>Окно игры</h3>
									<p>{{ fullscreen ? 'Полный экран' : `${resolution[0]} × ${resolution[1]}` }}</p>
								</div>
							</header>
							<label class="line">
								<span>Полный экран</span>
								<UiToggle v-model="fullscreen" label="Полный экран" />
							</label>
							<div class="chips" :class="{ 'chips--off': fullscreen }">
								<button
									v-for="preset in RESOLUTIONS"
									:key="preset.join('x')"
									type="button"
									class="chip"
									:class="{
										'chip--active': resolution[0] === preset[0] && resolution[1] === preset[1],
									}"
									@click="setResolution(preset[0], preset[1])"
								>
									{{ preset[0] }}×{{ preset[1] }}
								</button>
							</div>
						</article>

						<article class="card">
							<header class="card__head">
								<span class="card__icon"><MonitorPlay /></span>
								<div class="card__titles">
									<h3>При запуске игры</h3>
									<p>Что делать с окном лаунчера</p>
								</div>
							</header>
							<label class="line">
								<span>Сворачивать лаунчер</span>
								<UiToggle v-model="hideOnLaunch" label="Сворачивать лаунчер" />
							</label>
							<label class="line">
								<span>Возвращать после игры</span>
								<UiToggle v-model="refocus" label="Возвращать после игры" />
							</label>
						</article>

						<article class="card card--wide">
							<header class="card__head">
								<span class="card__icon"><Cpu /></span>
								<div class="card__titles">
									<h3>Аргументы Java</h3>
									<p>Для тонкой настройки, обычно не нужны</p>
								</div>
							</header>
							<div class="chips">
								<button
									v-for="preset in JVM_PRESETS"
									:key="preset.flag"
									v-tip="preset.flag"
									type="button"
									class="chip"
									:class="{ 'chip--active': jvmFlags.includes(preset.flag) }"
									@click="toggleFlag(preset.flag)"
								>
									{{ preset.hint }}
								</button>
							</div>
							<label class="args">
								<Terminal />
								<input
									v-model.lazy="jvmText"
									class="args__input"
									placeholder="-XX:+UseG1GC"
									spellcheck="false"
								/>
							</label>
						</article>
					</div>

					<div v-else-if="section === 'launcher' && settings" class="cards stagger">
						<article class="card card--wide card--row">
							<span class="card__icon card__icon--discord">
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<path
										fill="currentColor"
										d="M19.6 5.3A16.8 16.8 0 0 0 15.4 4l-.5 1.1a15.6 15.6 0 0 0-5.8 0L8.6 4a16.7 16.7 0 0 0-4.2 1.3C1.7 9.3 1 13.2 1.3 17a16.9 16.9 0 0 0 5.2 2.6l1.1-1.8a10.9 10.9 0 0 1-1.7-.8l.4-.3a12 12 0 0 0 11.4 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.8a16.8 16.8 0 0 0 5.2-2.6c.4-4.4-.7-8.3-3.1-11.7ZM8.5 14.7c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9.9 1.9 2.1-.8 2.1-1.9 2.1Zm7 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9.9 1.9 2.1-.8 2.1-1.9 2.1Z"
									/>
								</svg>
							</span>
							<div class="card__titles">
								<h3>Статус в Discord</h3>
								<p>Показывать друзьям в Discord, что вы играете в Minecraft</p>
							</div>
							<UiToggle v-model="discord" label="Статус в Discord" />
						</article>

						<article class="card card--wide card--row">
							<span class="card__icon"><ShieldCheck /></span>
							<div class="card__titles">
								<h3>Автофикс сборок</h3>
								<p>
									Если сборка не запускается, лаунчер найдёт причину и предложит исправление:
									обновить загрузчик, поставить нужную Java или выключить мешающие моды. Ничего не
									меняется без вашего согласия
								</p>
							</div>
							<UiToggle v-model="autofixEnabled" label="Автофикс сборок" />
						</article>

						<article class="card card--wide">
							<header class="card__head">
								<span class="card__icon"><Download /></span>
								<div class="card__titles">
									<h3>Одновременные загрузки</h3>
									<p>Больше — быстрее ставятся моды, но сильнее нагружается сеть</p>
								</div>
							</header>
							<div class="memory">
								<div class="memory__value">
									<strong>{{ downloads }}</strong>
									<span>файлов сразу</span>
								</div>
								<UiSlider
									v-model="downloads"
									class="memory__slider"
									:min="1"
									:max="20"
									:step="1"
									label="Загрузки"
								/>
							</div>
						</article>
					</div>

					<div v-else-if="section === 'about'" class="about">
						<AppLogo class="about__logo" />
						<p class="about__version">Версия {{ packageInfo.version }}</p>
						<article
							class="card card--row update"
							:class="`update--${updateStatus}`"
							role="status"
							aria-live="polite"
						>
							<span class="card__icon update__icon">
								<component :is="updateCard.icon" :class="{ spin: checking }" />
							</span>
							<div class="card__titles">
								<h3>{{ updateCard.title }}</h3>
								<p v-if="updateCard.text">{{ updateCard.text }}</p>
							</div>
							<UiButton
								v-if="updateStatus === 'available'"
								variant="primary"
								:disabled="updateInstalling"
								@click="dialogOpen = true"
							>
								Обновить
							</UiButton>
							<UiButton
								v-else
								:variant="updateStatus === 'idle' ? 'primary' : 'secondary'"
								:disabled="checking || updateInstalling"
								@click="checkUpdates(true)"
							>
								{{
									checking
										? 'Проверяем…'
										: updateStatus === 'idle'
											? 'Проверить'
											: 'Проверить снова'
								}}
							</UiButton>
						</article>
						<div class="about__author">
							<img :src="authorMark" alt="Логотип leeonttev" width="34" height="22" />
							<div>
								<p>Разработчик — <strong>leeonttev</strong></p>
								<p class="about__origin">Основано на Modrinth App.</p>
							</div>
						</div>
						<div class="cards stagger">
							<article class="card">
								<h3 class="about__title">Личный лаунчер</h3>
								<p class="about__text">
									Без рекламы, телеметрии и лишних аккаунтов. Вход по нику или через Microsoft.
								</p>
							</article>
							<article class="card">
								<h3 class="about__title">Моды и паки</h3>
								<p class="about__text">
									Моды, шейдеры и ресурспаки скачиваются из открытого каталога Modrinth.
								</p>
							</article>
						</div>
					</div>
				</div>
			</section>
		</div>
	</div>
</template>

<style scoped>
.settings-page {
	height: 100%;
	padding: 24px var(--page-gutter) 0;
}
.side__brand h1 {
	font-size: 30px;
}
.accounts,
.cards,
.about {
	max-width: 1000px;
}

.about__author {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 18px 0 24px;
	color: var(--text-2);
	font-size: 13px;
}
.about__author img {
	opacity: 0.65;
	object-fit: contain;
}
.about__origin {
	margin-top: 4px;
	color: var(--text-3);
	font-size: 12px;
}
.settings {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr);
	height: 100%;
}

.side {
	display: flex;
	flex-direction: column;
	padding: 0 0 22px;
	gap: 18px;
}

.side__brand {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 0;
}

.side__logo {
	font-size: 22px;
}

.side__caption {
	color: var(--text-3);
	font-size: 12px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}

.side__nav {
	display: flex;
	flex-wrap: wrap;
	flex-direction: row;
	gap: 3px;
}

.side__item {
	display: flex;
	align-items: center;
	gap: 11px;
	height: 42px;
	padding: 0 12px;
	border: 0;
	border-radius: var(--radius-md);
	background: transparent;
	color: var(--text-2);
	font: inherit;
	font-size: 14px;
	font-weight: 600;
	text-align: left;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.side__item svg {
	width: 18px;
	height: 18px;
}

.side__item:hover {
	background: rgba(255, 255, 255, 0.05);
	color: var(--text);
}

.side__item--active,
.side__item--active:hover {
	background: var(--accent-soft);
	color: #fff;
}

.side__item--active svg {
	color: var(--accent-text);
}

.side__version {
	margin-top: auto;
	padding: 0 12px;
	color: var(--text-3);
	font-size: 12px;
	font-weight: 600;
}

.panel {
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.panel__head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;
	padding: 0 0 20px;
}

.panel__title {
	font-size: 26px;
}

.panel__hint {
	margin-top: 4px;
	color: var(--text-3);
	font-size: 13px;
}

.panel__status {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding-top: 8px;
	color: var(--text-3);
	font-size: 12.5px;
	font-weight: 600;
	white-space: nowrap;
}

.panel__status--saved {
	color: var(--success);
}

.panel__status svg {
	width: 14px;
	height: 14px;
}

.panel__body {
	flex: 1;
	min-height: 0;
	padding: 0 8px 28px 0;
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: var(--surface-4) transparent;
}

.accounts {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.account {
	display: flex;
	align-items: center;
	flex-direction: row;
	gap: 14px;
	padding: 16px;
	border: 0;
	border-radius: var(--radius-xl);
	background: var(--surface-1);
	color: var(--text);
	text-align: left;
}

.account--default {
	background: var(--surface-1);
	box-shadow: inset 3px 0 var(--accent);
}

.account__avatar {
	border-radius: 12px;
}

.account__info {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-width: 0;
}

.account__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 16px;
	font-weight: 700;
}

.account__type {
	color: var(--text-3);
	font-size: 12.5px;
}

.account__actions {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-top: 0;
	margin-left: auto;
}

.account__badge {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 32px;
	padding: 0 12px;
	border-radius: 9px;
	background: var(--accent-soft);
	color: var(--accent-text);
	font-size: 12.5px;
	font-weight: 700;
}

.account__badge svg {
	width: 14px;
	height: 14px;
}

.account--add {
	justify-content: flex-start;
	cursor: pointer;
	transition: background-color 0.14s var(--ease);
}

.account--add:hover {
	background: var(--surface-2);
}

.account__plus {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 52px;
	height: 52px;
	border-radius: 12px;
	background: var(--accent-soft);
	color: var(--accent-text);
}

.account__plus svg {
	width: 22px;
	height: 22px;
}

.pill {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 32px;
	padding: 0 12px;
	border: 0;
	border-radius: 9px;
	background: var(--surface-3);
	color: var(--text-2);
	font: inherit;
	font-size: 12.5px;
	font-weight: 700;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.pill:hover {
	background: var(--surface-4);
	color: var(--text);
}

.pill svg {
	width: 14px;
	height: 14px;
}

.pill--danger {
	margin-left: auto;
	padding: 0 10px;
	color: var(--text-3);
}

.pill--danger:hover,
.pill--confirm {
	background: var(--danger-soft);
	color: var(--danger);
}

.cards {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

.card {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px 18px;
	border-radius: var(--radius-xl);
	background: var(--surface-1);
}

.card--wide {
	grid-column: 1 / -1;
}

.card--row {
	flex-direction: row;
	align-items: center;
}

.card__head {
	display: flex;
	align-items: center;
	gap: 12px;
}

.card__icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 38px;
	height: 38px;
	flex-shrink: 0;
	border-radius: 11px;
	background: var(--accent-soft);
	color: var(--accent-text);
}

.card__icon svg {
	width: 18px;
	height: 18px;
}

.card__icon--discord {
	background: rgba(88, 101, 242, 0.2);
	color: #8b96ff;
}

.card__titles {
	flex: 1;
	min-width: 0;
}

.card__titles h3 {
	font-size: 15px;
	font-weight: 700;
}

.card__titles p {
	margin-top: 2px;
	color: var(--text-3);
	font-size: 12.5px;
}

.line {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	color: var(--text-2);
	font-size: 13.5px;
	font-weight: 600;
}

.memory {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px 20px;
}

.memory__value {
	display: flex;
	align-items: baseline;
	gap: 6px;
	min-width: 132px;
}

.memory__value strong {
	font-family: var(--font-heading);
	font-size: 26px;
	font-weight: 800;
	line-height: 1;
}

.memory__value span {
	color: var(--text-3);
	font-size: 12.5px;
	font-weight: 600;
	white-space: nowrap;
}

.memory__slider {
	flex: 1;
	min-width: 200px;
	width: auto;
}

.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	transition: opacity 0.16s var(--ease);
}

.chips--off {
	opacity: 0.4;
	pointer-events: none;
}

.chip {
	height: 32px;
	padding: 0 11px;
	border: 0;
	border-radius: 9px;
	background: var(--surface-2);
	color: var(--text-2);
	font: inherit;
	font-size: 12.5px;
	font-weight: 600;
	white-space: nowrap;
	cursor: pointer;
	transition:
		background-color 0.14s var(--ease),
		color 0.14s var(--ease);
}

.chip:hover {
	background: var(--surface-3);
	color: var(--text);
}

.chip--active,
.chip--active:hover {
	background: var(--accent);
	color: #fff;
}

.args {
	display: flex;
	align-items: center;
	gap: 10px;
	height: 38px;
	padding-left: 12px;
	border-radius: var(--radius-md);
	background: var(--surface-2);
	color: var(--text-3);
}

.args svg {
	width: 15px;
	height: 15px;
	flex-shrink: 0;
}

.args__input {
	width: 100%;
	height: 100%;
	padding: 0 12px 0 0;
	border: 0;
	background: transparent;
	color: var(--text);
	font-family: ui-monospace, Consolas, monospace;
	font-size: 12.5px;
}

.about {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	padding-top: 20px;
}

.about__logo {
	font-size: 44px;
}

.about__version {
	margin-bottom: 18px;
	color: var(--text-3);
	font-size: 13px;
	font-weight: 600;
}

.about .cards {
	width: 100%;
}

.update {
	width: 100%;
	max-width: 520px;
	margin-bottom: 4px;
}

.update--latest .update__icon {
	background: rgba(74, 222, 128, 0.14);
	color: var(--success);
}

.update--error .update__icon {
	background: var(--danger-soft);
	color: var(--danger);
}

.about__title {
	font-size: 15px;
	font-weight: 700;
}

.about__text {
	color: var(--text-3);
	font-size: 13px;
	line-height: 1.5;
}

.spin {
	animation: spin 0.9s linear infinite;
}

@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
</style>
