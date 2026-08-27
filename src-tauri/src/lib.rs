use serde::Serialize;
use std::env;
use std::process::Command;

mod desktop;
mod registry;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopProbe {
    pub bd_binary: String,
    pub bd_version: String,
    pub registry_path: String,
    pub project_count: usize,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

    #[cfg(feature = "wdio")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .setup(|_| {
            #[cfg(debug_assertions)]
            match desktop_probe() {
                Ok(probe) => {
                    println!("desktop probe: {} {}", probe.bd_binary, probe.bd_version);
                }
                Err(err) => {
                    eprintln!("desktop probe failed: {}", err);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_probe,
            desktop::list_projects,
            desktop::add_project,
            desktop::remove_project,
            desktop::probe_project,
            desktop::init_project,
            desktop::list_beads,
            desktop::get_bead_detail,
            desktop::get_project_knowledge,
            desktop::update_bead_status,
            desktop::update_bead,
            desktop::preview_delete_bead,
            desktop::delete_bead,
            desktop::create_bead,
            desktop::add_comment
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn desktop_probe() -> Result<DesktopProbe, String> {
    let bd_version = resolve_bd_version()?;
    let bd_binary = find_bd_binary()?.to_string_lossy().to_string();

    let registry_path = registry::registry_path()?.to_string_lossy().to_string();
    let registry = registry::load()?;
    let project_count = registry.projects.len();

    Ok(DesktopProbe {
        bd_binary,
        bd_version,
        registry_path,
        project_count,
    })
}

fn find_bd_binary() -> Result<std::path::PathBuf, String> {
    let candidates = desktop::bd_candidates();
    for candidate in candidates {
        if let Ok(output) = Command::new(&candidate).arg("--version").output() {
            if output.status.success() {
                return Ok(std::path::PathBuf::from(candidate));
            }
        }
    }
    Err("bd binary not found in any candidate".to_string())
}

fn resolve_bd_version() -> Result<String, String> {
    let candidates = desktop::bd_candidates();
    for candidate in candidates {
        if let Ok(output) = Command::new(&candidate).arg("--version").output() {
            if output.status.success() {
                return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
            }
        }
    }
    Err("bd binary not found in any candidate".to_string())
}
