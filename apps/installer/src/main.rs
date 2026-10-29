#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Chunk's own installer. It lays files, shortcuts and registry keys out exactly like the
//! Tauri NSIS bundle (`%LOCALAPPDATA%\Chunk`, `HKCU\…\Uninstall\Chunk`), so the launcher's
//! auto-updater, which still ships NSIS packages, updates an install made here in place.
//! Started as `uninstall.exe` (or with `--uninstall`) it removes the launcher instead.

use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};

const PRODUCT: &str = "Chunk";
const BINARY: &str = "Chunk.exe";
const PUBLISHER: &str = "leeonttev";
/// Folder name the launcher keeps instances, accounts and caches under.
const DATA_ID: &str = "Chunk";
/// Webview storage of the launcher; it shares the install folder with the binary.
const WEBVIEW_DATA: &str = "EBWebView";
const VERSION: &str = env!("CHUNK_VERSION");
const PAYLOAD_SIZE: usize = match usize::from_str_radix(env!("CHUNK_PAYLOAD_SIZE"), 10) {
    Ok(size) => size,
    Err(_) => 0,
};
static PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload.zst"));

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
#[cfg(windows)]
const DETACHED_PROCESS: u32 = 0x0000_0008;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Info {
    mode: &'static str,
    version: &'static str,
    installed_version: Option<String>,
    install_dir: String,
    size_mb: f64,
    has_payload: bool,
}

#[derive(Clone, Serialize)]
struct Progress {
    percent: f64,
    stage: &'static str,
}

fn uninstall_mode() -> bool {
    std::env::args().any(|arg| arg == "--uninstall")
        || std::env::current_exe()
            .ok()
            .and_then(|path| path.file_stem().map(|stem| stem.to_string_lossy().to_lowercase()))
            .is_some_and(|stem| stem.starts_with("uninstall"))
}

/// NSIS passes `/P` (passive) or `/S` (silent) when it runs an uninstaller without a window.
fn silent_mode() -> bool {
    std::env::args().any(|arg| arg == "/P" || arg == "/S")
}

fn install_dir() -> PathBuf {
    registry::install_location().unwrap_or_else(|| {
        PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join(PRODUCT)
    })
}

fn start_menu_link() -> PathBuf {
    PathBuf::from(std::env::var("APPDATA").unwrap_or_default())
        .join(r"Microsoft\Windows\Start Menu\Programs")
        .join(format!("{PRODUCT}.lnk"))
}

fn desktop_link() -> PathBuf {
    let profile = PathBuf::from(std::env::var("USERPROFILE").unwrap_or_default());
    let onedrive = std::env::var("OneDrive").ok().map(|path| PathBuf::from(path).join("Desktop"));
    onedrive
        .filter(|path| path.is_dir())
        .unwrap_or_else(|| profile.join("Desktop"))
        .join(format!("{PRODUCT}.lnk"))
}

fn hidden(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn launcher_running() -> bool {
    hidden(Command::new("tasklist").args(["/FI", &format!("IMAGENAME eq {BINARY}"), "/NH"]))
        .output()
        .map(|output| String::from_utf8_lossy(&output.stdout).contains(BINARY))
        .unwrap_or(false)
}

fn create_shortcut(link: &Path, target: &Path) -> Result<(), String> {
    let quote = |path: &Path| path.display().to_string().replace('\'', "''");
    let dir = target.parent().unwrap_or(target);
    let script = format!(
        "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{link}');\
         $s.TargetPath='{target}';$s.WorkingDirectory='{dir}';$s.IconLocation='{target},0';$s.Save()",
        link = quote(link),
        target = quote(target),
        dir = quote(dir),
    );
    let status = hidden(Command::new("powershell").args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        &script,
    ]))
    .status()
    .map_err(|error| error.to_string())?;
    if status.success() { Ok(()) } else { Err("не удалось создать ярлык".into()) }
}

fn emit(app: &AppHandle, percent: f64, stage: &'static str) {
    let _ = app.emit("progress", Progress { percent, stage });
}

#[tauri::command]
fn info() -> Info {
    Info {
        mode: if uninstall_mode() { "uninstall" } else { "install" },
        version: VERSION,
        installed_version: registry::installed_version(),
        install_dir: install_dir().display().to_string(),
        size_mb: (PAYLOAD_SIZE as f64 / 1024.0 / 1024.0 * 10.0).round() / 10.0,
        has_payload: PAYLOAD_SIZE > 0,
    }
}

fn do_install(app: &AppHandle, desktop: bool) -> Result<(), String> {
    if PAYLOAD_SIZE == 0 {
        return Err("В этой сборке установщика нет файлов лаунчера.".into());
    }
    emit(app, 2.0, "Подготовка");
    if launcher_running() {
        return Err("Chunk сейчас запущен. Закройте лаунчер и нажмите «Повторить».".into());
    }
    let dir = install_dir();
    fs::create_dir_all(&dir).map_err(|error| format!("Не удалось создать папку: {error}"))?;

    emit(app, 5.0, "Распаковываем файлы");
    let target = dir.join(BINARY);
    let temp = dir.join(format!("{BINARY}.new"));
    {
        let mut decoder =
            zstd::stream::read::Decoder::new(PAYLOAD).map_err(|error| error.to_string())?;
        let mut file = fs::File::create(&temp).map_err(|error| error.to_string())?;
        let mut buffer = vec![0u8; 256 * 1024];
        let mut written = 0usize;
        loop {
            let read = decoder.read(&mut buffer).map_err(|error| error.to_string())?;
            if read == 0 {
                break;
            }
            file.write_all(&buffer[..read]).map_err(|error| error.to_string())?;
            written += read;
            emit(app, 5.0 + 80.0 * written as f64 / PAYLOAD_SIZE as f64, "Распаковываем файлы");
        }
        file.sync_all().map_err(|error| error.to_string())?;
    }
    if target.exists() {
        fs::remove_file(&target)
            .map_err(|_| "Не удалось заменить старую версию. Закройте Chunk и повторите.".to_string())?;
    }
    fs::rename(&temp, &target).map_err(|error| error.to_string())?;

    emit(app, 88.0, "Добавляем удаление в Windows");
    let me = std::env::current_exe().map_err(|error| error.to_string())?;
    let uninstaller = dir.join("uninstall.exe");
    if me != uninstaller {
        fs::copy(&me, &uninstaller).map_err(|error| error.to_string())?;
    }
    registry::register(&dir, &target, &uninstaller, PAYLOAD_SIZE as u64)
        .map_err(|error| format!("Не удалось записать в реестр: {error}"))?;

    emit(app, 94.0, "Создаём ярлыки");
    create_shortcut(&start_menu_link(), &target)?;
    if desktop {
        create_shortcut(&desktop_link(), &target)?;
    }
    emit(app, 100.0, "Готово");
    Ok(())
}

#[tauri::command]
async fn install(app: AppHandle, desktop: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || do_install(&app, desktop))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
fn launch() -> Result<(), String> {
    let target = install_dir().join(BINARY);
    let mut command = Command::new(&target);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(DETACHED_PROCESS);
    }
    command
        .current_dir(target.parent().unwrap_or(Path::new(".")))
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn do_uninstall(remove_data: bool) -> Result<(), String> {
    if launcher_running() {
        return Err("Chunk сейчас запущен. Закройте лаунчер и нажмите «Повторить».".into());
    }
    let dir = install_dir();
    for link in [start_menu_link(), desktop_link()] {
        let _ = fs::remove_file(link);
    }
    registry::unregister();
    let me = std::env::current_exe().ok();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if Some(&path) == me.as_ref() || (!remove_data && entry.file_name() == WEBVIEW_DATA) {
                continue;
            }
            let _ = if path.is_dir() { fs::remove_dir_all(&path) } else { fs::remove_file(&path) };
        }
    }
    if remove_data {
        for base in ["APPDATA", "LOCALAPPDATA"] {
            if let Ok(root) = std::env::var(base) {
                let _ = fs::remove_dir_all(PathBuf::from(root).join(DATA_ID));
            }
        }
    }
    // The running uninstaller cannot delete itself; cmd removes the folder once it has exited.
    // Without /s rmdir keeps a folder that still holds the webview storage.
    let remove = match me.as_ref().filter(|me| me.parent() == Some(dir.as_path())) {
        Some(me) if !remove_data => {
            format!("del /f /q \"{}\" & rmdir \"{}\"", me.display(), dir.display())
        }
        _ if !remove_data => format!("rmdir \"{}\"", dir.display()),
        _ => format!("rmdir /s /q \"{}\"", dir.display()),
    };
    let mut cleanup = Command::new("cmd");
    cleanup.args(["/C", &format!("ping 127.0.0.1 -n 3 > nul & {remove}")]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cleanup.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    }
    let _ = cleanup.spawn();
    Ok(())
}

#[tauri::command]
async fn uninstall(remove_data: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || do_uninstall(remove_data))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(windows)]
mod registry {
    use super::{PRODUCT, PUBLISHER, VERSION};
    use std::path::{Path, PathBuf};
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    fn uninstall_key() -> String {
        format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{PRODUCT}")
    }

    fn product_key() -> String {
        format!(r"Software\{PUBLISHER}\{PRODUCT}")
    }

    pub fn install_location() -> Option<PathBuf> {
        let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(uninstall_key()).ok()?;
        let value: String = key.get_value("InstallLocation").ok()?;
        let path = PathBuf::from(value.trim_matches('"'));
        (!path.as_os_str().is_empty()).then_some(path)
    }

    pub fn installed_version() -> Option<String> {
        let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(uninstall_key()).ok()?;
        key.get_value("DisplayVersion").ok()
    }

    /// Same values the Tauri NSIS template writes, so either installer can update the other.
    pub fn register(dir: &Path, binary: &Path, uninstaller: &Path, size: u64) -> std::io::Result<()> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu.create_subkey(uninstall_key())?;
        let quoted = |path: &Path| format!("\"{}\"", path.display());
        key.set_value("DisplayName", &PRODUCT)?;
        key.set_value("DisplayIcon", &quoted(binary))?;
        key.set_value("DisplayVersion", &VERSION)?;
        key.set_value("Publisher", &PUBLISHER)?;
        key.set_value("InstallLocation", &quoted(dir))?;
        key.set_value("UninstallString", &quoted(uninstaller))?;
        key.set_value("MainBinaryName", &super::BINARY)?;
        key.set_value("CurrentUser", &1u32)?;
        key.set_value("NoModify", &1u32)?;
        key.set_value("NoRepair", &1u32)?;
        key.set_value("EstimatedSize", &((size / 1024) as u32))?;
        let (product, _) = hkcu.create_subkey(product_key())?;
        product.set_value("", &dir.display().to_string())?;
        Ok(())
    }

    pub fn unregister() {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let _ = hkcu.delete_subkey_all(uninstall_key());
        let _ = hkcu.delete_subkey_all(product_key());
    }
}

#[cfg(not(windows))]
mod registry {
    use std::path::{Path, PathBuf};
    pub fn install_location() -> Option<PathBuf> {
        None
    }
    pub fn installed_version() -> Option<String> {
        None
    }
    pub fn register(_: &Path, _: &Path, _: &Path, _: u64) -> std::io::Result<()> {
        Ok(())
    }
    pub fn unregister() {}
}

fn main() {
    if uninstall_mode() && silent_mode() {
        let code = i32::from(do_uninstall(false).is_err());
        std::process::exit(code);
    }
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![info, install, launch, uninstall])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let title = if uninstall_mode() { "Удаление Chunk" } else { "Установка Chunk" };
                let _ = window.set_title(title);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run the Chunk installer");
}
