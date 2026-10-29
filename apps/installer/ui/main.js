const { invoke } = window.__TAURI__.core
const { listen } = window.__TAURI__.event
const appWindow = window.__TAURI__.window.getCurrentWindow()

const $ = (id) => document.getElementById(id)
const screens = ['welcome', 'progress', 'done', 'uninstall', 'error']
let retry = () => {}
let uninstalling = false

function show(name) {
	for (const screen of screens) $(`screen-${screen}`).hidden = screen !== name
}

function fail(message, again) {
	$('error-text').textContent = message
	retry = again
	show('error')
}

function setProgress(percent, stage) {
	const value = Math.max(0, Math.min(100, Math.round(percent)))
	$('fill').style.width = `${value}%`
	$('percent').textContent = `${value}%`
	if (stage) $('stage').textContent = stage
}

async function runInstall() {
	setProgress(0, 'Подготовка')
	show('progress')
	try {
		await invoke('install', { desktop: $('desktop').checked })
		$('done-hint').textContent = $('desktop').checked
			? 'Ярлыки есть на рабочем столе и в меню «Пуск»'
			: 'Ярлык есть в меню «Пуск»'
		show('done')
	} catch (error) {
		fail(String(error), runInstall)
	}
}

async function runUninstall() {
	$('uninstall').disabled = true
	try {
		await invoke('uninstall', { removeData: $('remove-data').checked })
		$('done-title').textContent = 'Chunk удалён'
		$('done-hint').textContent = 'Спасибо, что играли!'
		$('launch').hidden = true
		show('done')
	} catch (error) {
		fail(String(error), runUninstall)
	} finally {
		$('uninstall').disabled = false
	}
}

$('minimize').addEventListener('click', () => appWindow.minimize())
$('close').addEventListener('click', () => appWindow.close())
$('finish').addEventListener('click', () => appWindow.close())
$('cancel').addEventListener('click', () => appWindow.close())
$('install').addEventListener('click', runInstall)
$('uninstall').addEventListener('click', runUninstall)
$('retry').addEventListener('click', () => retry())
$('launch').addEventListener('click', async () => {
	try {
		await invoke('launch')
		await appWindow.close()
	} catch (error) {
		fail(String(error), () => show('done'))
	}
})

listen('progress', ({ payload }) => setProgress(payload.percent, payload.stage))

invoke('info').then((info) => {
	uninstalling = info.mode === 'uninstall'
	$('version').textContent = info.version
	$('size').textContent = `${info.sizeMb} МБ`
	$('path').textContent = `Папка: ${info.installDir}`
	if (uninstalling) {
		$('bar-title').textContent = 'Удаление'
		$('tagline').textContent = info.installedVersion
			? `Установлена версия ${info.installedVersion}`
			: 'Лаунчер Minecraft'
		show('uninstall')
	} else {
		if (info.installedVersion) {
			$('install').textContent =
				info.installedVersion === info.version ? 'Переустановить' : 'Обновить'
			$('tagline').textContent = `Сейчас установлена версия ${info.installedVersion}`
		}
		if (!info.hasPayload) {
			$('install').disabled = true
			$('path').textContent = 'В этой сборке установщика нет файлов лаунчера'
		}
		show('welcome')
	}
	appWindow.show()
})
