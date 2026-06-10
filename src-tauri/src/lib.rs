use serde::Serialize;
use std::env;
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize)]
pub struct RootStatus {
  pub path: String,
  pub exists: bool,
}

#[derive(Serialize)]
pub struct DesktopProbe {
  pub bd_binary: String,
  pub bd_version: String,
  pub project_roots: Vec<String>,
  pub root_statuses: Vec<RootStatus>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
    .invoke_handler(tauri::generate_handler![desktop_probe])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn desktop_probe() -> Result<DesktopProbe, String> {
  let bd_binary = env::var("BD_BIN").unwrap_or_else(|_| "bd".to_string());
  let bd_version = resolve_bd_version(&bd_binary)?;
  let roots = resolve_roots();
  let root_statuses = roots
    .iter()
    .map(|root| RootStatus {
      path: root.to_string_lossy().to_string(),
      exists: root.exists(),
    })
    .collect();

  Ok(DesktopProbe {
    bd_binary,
    bd_version,
    project_roots: roots
      .into_iter()
      .map(|root| root.to_string_lossy().to_string())
      .collect(),
    root_statuses,
  })
}

fn resolve_bd_version(bd_binary: &str) -> Result<String, String> {
  let output = run_bd_version(bd_binary)?;
  if output.status.success() {
    return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
  }

  Err(stderr_message(&output, bd_binary))
}

fn run_bd_version(bd_binary: &str) -> Result<std::process::Output, String> {
  match Command::new(bd_binary).arg("--version").output() {
    Ok(output) => Ok(output),
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
      if cfg!(target_os = "macos") {
        let fallback = "/opt/homebrew/bin/bd";
        Command::new(fallback)
          .arg("--version")
          .output()
          .map_err(|fallback_err| {
            format!("failed to run {bd_binary} and fallback {fallback}: {fallback_err}")
          })
      } else {
        Err(format!("bd binary not found: {bd_binary}"))
      }
    }
    Err(err) => Err(format!("failed to run {bd_binary}: {err}")),
  }
}

fn stderr_message(output: &std::process::Output, bd_binary: &str) -> String {
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  if stderr.is_empty() {
    format!("{} exited with status {}", bd_binary, output.status)
  } else {
    format!("{} exited with status {}: {}", bd_binary, output.status, stderr)
  }
}

fn resolve_roots() -> Vec<PathBuf> {
  if let Some(raw_roots) = env::var_os("BD_ROOTS") {
    return env::split_paths(&raw_roots).collect();
  }

  let home = env::var_os("HOME")
    .or_else(|| env::var_os("USERPROFILE"))
    .map(PathBuf::from);

  home
    .map(|mut root| {
      root.push("Code");
      vec![root]
    })
    .unwrap_or_default()
}
