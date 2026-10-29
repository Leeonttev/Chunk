//! Keeps the game window titled after the instance it was launched from.

use std::time::Duration;

const CHECK_INTERVAL: Duration = Duration::from_millis(1500);

/// Retitles every visible top-level window of `pid` to `title` until `alive` returns false.
/// Minecraft resets its title on some screens, so the check repeats instead of running once.
pub fn keep_window_title(
    pid: u32,
    title: String,
    alive: impl Fn() -> bool + Send + 'static,
) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(CHECK_INTERVAL).await;
            if !alive() {
                break;
            }
            let title = title.clone();
            let _ = tokio::task::spawn_blocking(move || set_title(pid, &title))
                .await;
        }
    });
}

#[cfg(windows)]
fn set_title(pid: u32, title: &str) {
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId,
        IsWindowVisible, SetWindowTextW,
    };
    use windows::core::{BOOL, PCWSTR};

    struct Target {
        pid: u32,
        title: Vec<u16>,
    }

    unsafe extern "system" fn visit(hwnd: HWND, data: LPARAM) -> BOOL {
        // SAFETY: `data` points at the `Target` owned by `set_title`, alive for the whole enumeration.
        let target = unsafe { &*(data.0 as *const Target) };
        let mut owner = 0u32;
        // SAFETY: plain Win32 queries on a window handle supplied by EnumWindows.
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut owner));
            if owner != target.pid || !IsWindowVisible(hwnd).as_bool() {
                return BOOL(1);
            }
            let mut current = [0u16; 512];
            let length = GetWindowTextW(hwnd, &mut current).max(0) as usize;
            let wanted = &target.title[..target.title.len() - 1];
            if &current[..length] != wanted {
                let _ = SetWindowTextW(hwnd, PCWSTR(target.title.as_ptr()));
            }
        }
        BOOL(1)
    }

    let target = Target {
        pid,
        title: title.encode_utf16().chain(std::iter::once(0)).collect(),
    };
    // SAFETY: the callback only reads `target`, which outlives this call.
    let _ = unsafe {
        EnumWindows(Some(visit), LPARAM(&target as *const Target as isize))
    };
}

#[cfg(not(windows))]
fn set_title(_pid: u32, _title: &str) {}
