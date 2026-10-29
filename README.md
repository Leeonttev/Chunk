<p align="center">
	<img alt="Chunk — лаунчер Minecraft" src=".github/assets/chunk-banner.png">
</p>

<p align="center">
	<a href="https://github.com/Leeonttev/Chunk/releases/latest"><img alt="Последняя версия" src="https://img.shields.io/github/v/release/Leeonttev/Chunk?color=24cf78&label=%D0%B2%D0%B5%D1%80%D1%81%D0%B8%D1%8F&style=for-the-badge&cacheSeconds=1800"></a>
	<a href="https://github.com/Leeonttev/Chunk/releases"><img alt="Скачивания" src="https://img.shields.io/github/downloads/Leeonttev/Chunk/latest/Chunk-Setup.exe?color=24cf78&label=%D1%81%D0%BA%D0%B0%D1%87%D0%B8%D0%B2%D0%B0%D0%BD%D0%B8%D1%8F&style=for-the-badge&cacheSeconds=1800"></a>
	<img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2F%2011-20262a?style=for-the-badge">
	<a href="COPYING.md"><img alt="Лицензия GPL-3.0" src="https://img.shields.io/badge/%D0%BB%D0%B8%D1%86%D0%B5%D0%BD%D0%B7%D0%B8%D1%8F-GPL--3.0-20262a?style=for-the-badge"></a>
</p>

<p align="center">
	<b>Chunk</b> — быстрый и красивый лаунчер Minecraft на русском языке.<br>
	Моды, шейдеры, ресурспаки и готовые сборки с Modrinth в пару кликов. Без рекламы и слежки.
</p>

<p align="center">
	<a href="https://github.com/Leeonttev/Chunk/releases/latest/download/Chunk-Setup.exe"><b>⬇ Скачать Chunk для Windows</b></a>
</p>

---

## Возможности

- **Каталог Modrinth внутри лаунчера.** Моды, ресурспаки, шейдеры и целые сборки: поиск, фильтры по версии и загрузчику, установка одной кнопкой.
- **Чужие сборки становятся вашими.** Ставите сборку автора и меняете в ней что угодно, а когда автор выпустит обновление — обновляетесь, не теряя своих модов.
- **Автофикс.** Если после обновления модов игра не запускается, Chunk найдёт причину и предложит исправление: обновить Fabric/Quilt Loader, поставить нужную Java или выключить мешающие моды. Ничего не меняется без вашего согласия.
- **Обновление модов пачкой.** «Обновить всё» одной операцией, с прогрессом и возможностью отменить.
- **Вход без лицензии и через Microsoft.** Играйте по нику или с аккаунтом Microsoft, несколько аккаунтов одновременно.
- **Гардероб.** Свои скины, примерка в 3D, классическая и тонкая модель рук.
- **Скриншоты всех сборок в одном месте** с просмотром в полном качестве.
- **Статус в Discord** — друзья видят, во что вы играете.
- **Сам обновляется.** Новые версии Chunk приходят автоматически.

## Скриншоты

<p align="center">
	<img alt="Библиотека сборок" src=".github/assets/screenshot-library.png" width="49%">
	<img alt="Управление сборкой" src=".github/assets/screenshot-instance.png" width="49%">
</p>

## Установка

1. [Скачайте **Chunk-Setup.exe**](https://github.com/Leeonttev/Chunk/releases/latest/download/Chunk-Setup.exe) — это всегда последняя версия.
2. Запустите файл и нажмите «Установить».
3. Если Windows покажет «Windows защитила ваш компьютер», нажмите **«Подробнее» → «Выполнить в любом случае»**. Это предупреждение появляется у всех программ без платной цифровой подписи.

Права администратора не нужны. Удалить Chunk можно через «Параметры → Приложения».

## Для разработчиков

Нужны [Node.js](https://nodejs.org/), [pnpm](https://pnpm.io/), [Rust](https://www.rust-lang.org/tools/install) и [зависимости Tauri](https://v2.tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm app:dev
```

| Часть                     | Папка               |
| ------------------------- | ------------------- |
| Интерфейс лаунчера (Vue)  | `apps/chunk`        |
| Оболочка приложения       | `apps/app`          |
| Ядро (Rust)               | `packages/app-lib`  |
| Установщик                | `apps/installer`    |

Выпуск новой версии: поднимите версию в `apps/chunk/package.json` и запустите

```bash
node scripts/release-chunk.mjs "Что нового в этой версии"
```

Скрипт соберёт подписанное обновление и установщик в `dist/release-<версия>/` — эти файлы загружаются в новый выпуск на GitHub.

## Лицензия и благодарности

Chunk основан на открытом исходном коде [Modrinth App](https://github.com/modrinth/code) и распространяется на условиях **GNU GPL-3.0**. Подробности — в [COPYING.md](COPYING.md).

Chunk — независимый проект и не связан с Modrinth и Rinth, Inc. Каталог модов предоставляется сервисом [Modrinth](https://modrinth.com). Minecraft — товарный знак Mojang Studios; Chunk не связан с Mojang и Microsoft.
