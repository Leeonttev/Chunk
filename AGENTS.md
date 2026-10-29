# Chunk

Chunk is a Russian-language Minecraft launcher, a fork of the Modrinth App with everything unrelated to the launcher removed. **Read [`apps/lemine/AGENTS.md`](apps/lemine/AGENTS.md) before doing anything**: it explains the project, how it works, design rules and known pitfalls. **Every change must be logged in that file's «Журнал изменений» section** (date, what changed, files, gotchas). The user speaks Russian and is not a programmer: reply in plain Russian.

## Layout

| Path                                   | What it is                                                     |
| -------------------------------------- | -------------------------------------------------------------- |
| `apps/lemine`                          | Launcher UI (Vue 3, Vite, TypeScript)                          |
| `apps/app`                             | Tauri 2 shell (`theseus_gui`), window, commands, updater       |
| `apps/installer`                       | Custom graphical installer/uninstaller (`chunk-installer`)     |
| `packages/app-lib`                     | Launcher core in Rust (`theseus`): instances, installs, auth   |
| `packages/daedalus`                    | Minecraft and loader metadata types                            |
| `packages/modrinth-content-management` | Content set handling used by the core                          |
| `packages/ariadne`, `path-util`, `serde-binhum`, `async-minecraft-ping` | Small libraries the core depends on |
| `scripts/release-chunk.mjs`            | Builds a signed release into `dist/release-<version>/`         |

## Commands

- Dev: `pnpm app:dev` (needs `$HOME/.cargo/bin` in `PATH`).
- Frontend check: `npx vue-tsc --noEmit` and `npx prettier --write <files>` in `apps/lemine`.
- Rust check: `cargo check -p theseus_gui -p chunk-installer`.
- Release: bump `apps/lemine/package.json`, run `pnpm release "что нового"`, publish with `gh release create v<version> --latest` and every file from `dist/release-<version>/`.

## Rules

- Indent with tabs.
- No heading comments; doc comments only where they help, inline comments only when truly necessary.
- Do not pipe command output through `head`/`tail` to truncate it; use command flags instead.
- Commits and PRs show only the user as author: never add `Co-Authored-By: Claude` or similar lines.
- When given problems, fix them rather than saying you did not introduce them.
