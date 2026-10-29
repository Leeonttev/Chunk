import { type IconConfig, core } from '@/api/core'

const assets = import.meta.glob<string>('@/assets/instance-icons/*.png', {
	eager: true,
	import: 'default',
})

function asset(file: string) {
	return assets[`/src/assets/instance-icons/${file}.png`]
}

export interface IconBackground {
	id: string
	name: string
	top: string
	bottom: string
}

export interface IconSymbol {
	id: string
	name: string
	asset: string
	group: 'loader' | 'modded' | 'vanilla'
}

export const ICON_BACKGROUNDS: IconBackground[] = [
	{ id: 'purple', name: 'Фиолетовый', top: '#4739FF', bottom: '#6670FF' },
	{ id: 'lavender', name: 'Лавандовый', top: '#C056FD', bottom: '#B889FF' },
	{ id: 'blue', name: 'Голубой', top: '#227EFF', bottom: '#5EC1FF' },
	{ id: 'green', name: 'Зелёный', top: '#0B9F21', bottom: '#4FD24B' },
	{ id: 'lime', name: 'Лаймовый', top: '#6FDA1D', bottom: '#CBFF50' },
	{ id: 'yellow', name: 'Жёлтый', top: '#FFC629', bottom: '#FFEE53' },
	{ id: 'orange', name: 'Оранжевый', top: '#FF8D29', bottom: '#FFB452' },
	{ id: 'rose', name: 'Красный', top: '#D62E63', bottom: '#F95C62' },
	{ id: 'pink', name: 'Розовый', top: '#F640C0', bottom: '#FF7BF1' },
	{ id: 'light_gray', name: 'Светло-серый', top: '#AEAEAE', bottom: '#D9D9D9' },
	{ id: 'gray', name: 'Серый', top: '#373C4C', bottom: '#4C4F58' },
	{ id: 'dark_gray', name: 'Тёмный', top: '#1B1D29', bottom: '#252731' },
]

const symbol = (
	id: string,
	name: string,
	file: string,
	group: IconSymbol['group'],
): IconSymbol => ({
	id,
	name,
	asset: asset(file),
	group,
})

export const ICON_SYMBOLS: IconSymbol[] = [
	symbol('fabric', 'Fabric', 'fabric', 'loader'),
	symbol('forge', 'Forge', 'forge', 'loader'),
	symbol('neoforge', 'NeoForge', 'neoforge', 'loader'),
	symbol('quilt', 'Quilt', 'quilt', 'loader'),
	symbol('grass_block', 'Блок травы', 'grass-block', 'vanilla'),
	symbol('crafting_table', 'Верстак', 'crafting-table', 'vanilla'),
	symbol('furnace', 'Печь', 'furnace', 'vanilla'),
	symbol('chest', 'Сундук', 'chest', 'vanilla'),
	symbol('bookshelf', 'Книжная полка', 'bookshelf', 'vanilla'),
	symbol('redstone_block', 'Блок редстоуна', 'redstone-block', 'vanilla'),
	symbol('sticky_piston', 'Липкий поршень', 'sticky-piston', 'vanilla'),
	symbol('slime_block', 'Блок слизи', 'slime-block', 'vanilla'),
	symbol('cake', 'Торт', 'cake', 'vanilla'),
	symbol('campfire', 'Костёр', 'campfire', 'vanilla'),
	symbol('pickaxe', 'Кирка', 'pickaxe', 'vanilla'),
	symbol('sword', 'Меч', 'sword', 'vanilla'),
	symbol('zombie', 'Зомби', 'zombie', 'vanilla'),
	symbol('creeper', 'Крипер', 'creeper', 'vanilla'),
	symbol('skeleton', 'Скелет', 'skeleton', 'vanilla'),
	symbol('ender_dragon', 'Эндер-дракон', 'ender-dragon', 'vanilla'),
	symbol('ender_chest', 'Эндер-сундук', 'ender-chest', 'vanilla'),
	symbol('sculk_sensor', 'Скалк-сенсор', 'sculk-sensor', 'vanilla'),
	symbol('beacon', 'Маяк', 'beacon', 'vanilla'),
	symbol('enchanting_table', 'Стол зачарований', 'enchanting-table', 'vanilla'),
	symbol('lantern', 'Фонарь', 'lantern', 'vanilla'),
	symbol('tnt', 'Динамит', 'tnt', 'vanilla'),
	symbol('command_block', 'Командный блок', 'command-block', 'vanilla'),
	symbol('poke_ball', 'Покебол', 'poke-ball', 'modded'),
	symbol('orb', 'Сфера', 'orb', 'modded'),
	symbol('cooking_pot', 'Кастрюля', 'cooking-pot', 'modded'),
	symbol('skillet', 'Сковорода', 'skillet', 'modded'),
	symbol('globe', 'Глобус', 'globe', 'modded'),
	symbol('pancakes', 'Блинчики', 'pancakes', 'modded'),
	symbol('backpack', 'Рюкзак', 'backpack', 'modded'),
	symbol('couch', 'Диван', 'couch', 'modded'),
	symbol('tiny_potato', 'Картошка', 'tiny-potato', 'modded'),
	symbol('blue_shark', 'Акула', 'blue-shark', 'modded'),
	symbol('brown_bear', 'Медведь', 'brown-bear', 'modded'),
	symbol('moobloom', 'Цветочная корова', 'moobloom', 'modded'),
	symbol('create_wrench', 'Ключ', 'wrench', 'modded'),
	symbol('cogwheel', 'Шестерня', 'cogwheel', 'modded'),
	symbol('engine', 'Двигатель', 'engine', 'modded'),
	symbol('tire', 'Колесо', 'tire', 'modded'),
	symbol('oxygen_distributor', 'Кислородный узел', 'oxygen-distributor', 'modded'),
	symbol('space_helmet', 'Шлем', 'space-helmet', 'modded'),
	symbol('gizmo', 'Гаджет', 'gizmo', 'modded'),
	symbol('terminal', 'Терминал', 'terminal', 'modded'),
]

/** Combinations where the symbol blends into the background. */
const CLASHES = new Set([
	'purple:globe',
	'blue:globe',
	'gray:cogwheel',
	'dark_gray:cogwheel',
	'rose:poke_ball',
	'lime:slime_block',
	'green:slime_block',
	'rose:redstone_block',
	'rose:couch',
	'orange:space_helmet',
	'rose:tnt',
	'yellow:moobloom',
	'light_gray:skillet',
	'light_gray:cooking_pot',
])

export interface IconChoice {
	background: IconBackground
	symbol: IconSymbol
}

export function toConfig({ background, symbol }: IconChoice): IconConfig {
	return {
		background: {
			type: 'linear-top-down-gradient',
			top_color: background.top,
			bottom_color: background.bottom,
		},
		symbol: symbol.id,
	}
}

export function fromConfig(config?: IconConfig | null): IconChoice | null {
	if (!config) return null
	const background = ICON_BACKGROUNDS.find(
		(entry) =>
			entry.top === config.background.top_color && entry.bottom === config.background.bottom_color,
	)
	const symbol = ICON_SYMBOLS.find((entry) => entry.id === config.symbol)
	return background && symbol ? { background, symbol } : null
}

export function gradient(background: IconBackground) {
	return `linear-gradient(to bottom, ${background.top}, ${background.bottom})`
}

/** Picks a random readable combination, skipping loader logos and the current choice. */
export function randomIcon(current?: IconChoice | null): IconChoice {
	const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]
	const symbols = ICON_SYMBOLS.filter((entry) => entry.group !== 'loader')
	for (;;) {
		const choice = { background: pick(ICON_BACKGROUNDS), symbol: pick(symbols) }
		if (CLASHES.has(`${choice.background.id}:${choice.symbol.id}`)) continue
		if (
			current &&
			choice.background.id === current.background.id &&
			choice.symbol.id === current.symbol.id
		)
			continue
		return choice
	}
}

async function symbolBytes(symbol: IconSymbol) {
	const response = await fetch(symbol.asset)
	return Array.from(new Uint8Array(await response.arrayBuffer()))
}

/** Renders the icon into the core cache and returns its file path for a new instance. */
export async function renderIcon(choice: IconChoice, remember = false) {
	return core.instances.cacheIcon(toConfig(choice), await symbolBytes(choice.symbol), remember)
}

export async function applyIcon(instanceId: string, choice: IconChoice) {
	return core.instances.setGeneratedIcon(
		instanceId,
		toConfig(choice),
		await symbolBytes(choice.symbol),
	)
}
