<script setup lang="ts">
import { convertFileSrc } from '@tauri-apps/api/core'
import dayjs from 'dayjs'
import { Globe, Play, Plus, Server, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { core, type Instance, type World } from '@/api/core'
import { onAppEvent } from '@/api/events'
import UiButton from '@/components/ui/UiButton.vue'
import UiIconButton from '@/components/ui/UiIconButton.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { useStore } from '@/composables/store'
import { reportError } from '@/composables/toasts'
import { addAccountOpen } from '@/composables/ui-state'

const props = defineProps<{ instance: Instance }>()
const { activeAccount, running } = useStore()

const worlds = ref<World[]>([])
const addOpen = ref(false)
const serverName = ref('')
const serverAddress = ref('')

const GAME_MODES: Record<string, string> = {
	survival: 'Выживание',
	creative: 'Творческий',
	adventure: 'Приключение',
	spectator: 'Наблюдатель',
}

const singleplayer = computed(() => worlds.value.filter((world) => world.type === 'singleplayer'))
const servers = computed(() => worlds.value.filter((world) => world.type === 'server'))

async function load() {
	try {
		worlds.value = (await core.worlds.list(props.instance.id)).filter(
			(world) => world.display_status !== 'hidden',
		)
	} catch (error) {
		reportError(error, 'Не удалось загрузить миры')
	}
}

watch(() => props.instance.id, load, { immediate: true })
onAppEvent('instance', (payload) => {
	if (payload.instance_id === props.instance.id) void load()
})

function iconOf(world: World) {
	if (!world.icon) return null
	return /^(data:|https?:)/.test(world.icon) ? world.icon : convertFileSrc(world.icon)
}

async function join(world: World) {
	if (!activeAccount.value) {
		addAccountOpen.value = true
		return
	}
	try {
		if (world.type === 'singleplayer') await core.worlds.joinSingleplayer(props.instance.id, world.path)
		else await core.worlds.joinServer(props.instance.id, world.address)
	} catch (error) {
		reportError(error, 'Не удалось зайти')
	}
}

async function addServer() {
	if (!serverAddress.value.trim()) return
	try {
		await core.worlds.addServer(
			props.instance.id,
			serverName.value.trim() || serverAddress.value.trim(),
			serverAddress.value.trim(),
		)
		addOpen.value = false
		serverName.value = ''
		serverAddress.value = ''
		await load()
	} catch (error) {
		reportError(error, 'Не удалось добавить сервер')
	}
}

async function removeServer(world: World) {
	if (world.type !== 'server') return
	await core.worlds
		.removeServer(props.instance.id, world.index)
		.catch((error) => reportError(error, 'Не удалось удалить сервер'))
	await load()
}
</script>

<template>
	<div class="worlds">
		<section class="worlds__section">
			<div class="worlds__heading">
				<span class="eyebrow">Одиночные миры</span>
			</div>
			<p v-if="singleplayer.length === 0" class="faint worlds__empty">
				Миры появятся здесь после первого запуска игры.
			</p>
			<div class="worlds__grid">
				<div v-for="world in singleplayer" :key="world.name" class="world">
					<img v-if="iconOf(world)" :src="iconOf(world)!" alt="" class="world__icon" />
					<span v-else class="world__icon world__icon--blank"><Globe /></span>
					<div class="world__text">
						<span class="world__name">{{ world.name }}</span>
						<span class="world__meta">
							<template v-if="world.type === 'singleplayer'">
								{{ world.hardcore ? 'Хардкор' : (GAME_MODES[world.game_mode] ?? world.game_mode) }}
							</template>
							<template v-if="world.last_played"> · {{ dayjs(world.last_played).fromNow() }}</template>
						</span>
					</div>
					<UiIconButton label="Играть в этот мир" :disabled="running.has(instance.id)" @click="join(world)">
						<Play />
					</UiIconButton>
				</div>
			</div>
		</section>

		<section class="worlds__section">
			<div class="worlds__heading">
				<span class="eyebrow">Серверы</span>
				<UiButton size="sm" variant="ghost" @click="addOpen = true"><Plus /> Добавить</UiButton>
			</div>
			<p v-if="servers.length === 0" class="faint worlds__empty">Серверов пока нет.</p>
			<div class="worlds__grid">
				<div v-for="world in servers" :key="world.type === 'server' ? world.index : world.name" class="world">
					<img v-if="iconOf(world)" :src="iconOf(world)!" alt="" class="world__icon" />
					<span v-else class="world__icon world__icon--blank"><Server /></span>
					<div class="world__text">
						<span class="world__name">{{ world.name }}</span>
						<span class="world__meta selectable">{{ world.type === 'server' ? world.address : '' }}</span>
					</div>
					<UiIconButton label="Удалить" size="sm" danger @click="removeServer(world)">
						<Trash2 />
					</UiIconButton>
					<UiIconButton label="Зайти на сервер" :disabled="running.has(instance.id)" @click="join(world)">
						<Play />
					</UiIconButton>
				</div>
			</div>
		</section>

		<UiModal v-model:open="addOpen" title="Добавить сервер" width="400px">
			<form class="worlds__form" @submit.prevent="addServer">
				<UiInput v-model="serverName" placeholder="Название (необязательно)" />
				<UiInput v-model="serverAddress" placeholder="Адрес, например play.example.ru" />
			</form>
			<template #footer>
				<UiButton variant="ghost" @click="addOpen = false">Отмена</UiButton>
				<UiButton variant="primary" :disabled="!serverAddress.trim()" @click="addServer">Добавить</UiButton>
			</template>
		</UiModal>
	</div>
</template>

<style scoped>
.worlds {
	display: flex;
	flex-direction: column;
	gap: 26px;
}

.worlds__section {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.worlds__heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	min-height: 30px;
}

.worlds__empty {
	font-size: 13px;
}

.worlds__grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 8px;
}

.world {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px;
	border-radius: var(--radius-lg);
	background: var(--surface-1);
}

.world__icon {
	width: 44px;
	height: 44px;
	flex-shrink: 0;
	border-radius: var(--radius-md);
	object-fit: cover;
	image-rendering: pixelated;
	background: var(--surface-2);
}

.world__icon--blank {
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--text-3);
}

.world__icon--blank svg {
	width: 20px;
	height: 20px;
}

.world__text {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
}

.world__name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 600;
}

.world__meta {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--text-3);
	font-size: 12px;
}

.worlds__form {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
</style>
