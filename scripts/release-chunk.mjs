// Builds a signed Chunk release into dist/release-<version>/:
//   Chunk-Setup.exe                 — the custom installer for new users; a fixed name keeps
//                                     /releases/latest/download/Chunk-Setup.exe and the download badge stable
//   Chunk_<version>_x64-setup.exe   — the NSIS package the in-app updater installs
//   Chunk_<version>_x64-setup.exe.sig
//   latest.json                     — the manifest the updater reads from the latest GitHub release
// Usage: node scripts/release-chunk.mjs "Что нового в этой версии"
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const REPO = 'Leeonttev/Chunk'
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const version = JSON.parse(readFileSync(join(root, 'apps/chunk/package.json'), 'utf8')).version
const notes = process.argv[2] ?? `Chunk ${version}`
const keyPath = process.env.CHUNK_SIGNING_KEY ?? join(homedir(), '.chunk', 'updater.key')

if (!existsSync(keyPath)) {
	console.error(`Нет ключа подписи: ${keyPath}`)
	process.exit(1)
}

const env = {
	...process.env,
	TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyPath, 'utf8').trim(),
	TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
	PATH: `${join(homedir(), '.cargo', 'bin')};${process.env.PATH}`,
}
const run = (command, cwd = root) => {
	console.log(`\n> ${command}`)
	execSync(command, { cwd, env, stdio: 'inherit' })
}

console.log(`Собираем Chunk ${version}`)
run('pnpm tauri build --bundles nsis --features updater', join(root, 'apps/app'))
run('cargo build -p chunk-installer --release')

const bundle = join(root, 'target/release/bundle/nsis')
const nsisName = `Chunk_${version}_x64-setup.exe`
const out = join(root, `dist/release-${version}`)
mkdirSync(out, { recursive: true })
copyFileSync(join(bundle, nsisName), join(out, nsisName))
copyFileSync(join(bundle, `${nsisName}.sig`), join(out, `${nsisName}.sig`))
copyFileSync(
	join(root, 'target/release/chunk-installer.exe'),
	join(out, 'Chunk-Setup.exe'),
)

const manifest = {
	version,
	notes,
	pub_date: new Date().toISOString(),
	platforms: {
		'windows-x86_64': {
			signature: readFileSync(join(bundle, `${nsisName}.sig`), 'utf8').trim(),
			url: `https://github.com/${REPO}/releases/download/v${version}/${nsisName}`,
		},
	},
}
writeFileSync(join(out, 'latest.json'), `${JSON.stringify(manifest, null, '\t')}\n`)

console.log(`\nГотово: ${out}`)
console.log(`Создайте на GitHub выпуск с тегом v${version} и загрузите все файлы из этой папки.`)
