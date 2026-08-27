use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct RegistryEntry {
    pub id: String,
    pub path: String,
    pub label: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Registry {
    pub version: u32,
    pub projects: Vec<RegistryEntry>,
}

pub fn registry_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "cannot locate home directory".to_string())?;

    Ok(PathBuf::from(home)
        .join(".config")
        .join("bd-board")
        .join("projects.json"))
}

pub fn load() -> Result<Registry, String> {
    let path = registry_path()?;

    if !path.exists() {
        return Ok(Registry {
            version: 1,
            projects: vec![],
        });
    }

    let raw = fs::read_to_string(&path).map_err(|err| format!("failed to read registry: {err}"))?;

    let registry: Registry = serde_json::from_str(&raw).map_err(|err| {
        format!(
            "{} is not valid bd board registry JSON: {err}",
            path.display()
        )
    })?;

    if registry.version != 1 {
        return Err(format!(
            "unsupported registry version {}; expected 1",
            registry.version
        ));
    }

    Ok(registry)
}

pub fn save(registry: &Registry) -> Result<(), String> {
    let path = registry_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "registry path has no parent".to_string())?;

    fs::create_dir_all(parent)
        .map_err(|err| format!("failed to create registry directory: {err}"))?;

    let tmp_path = parent.join("projects.json.tmp");
    let json = serde_json::to_string_pretty(registry)
        .map_err(|err| format!("failed to serialize registry: {err}"))?;

    fs::write(&tmp_path, json)
        .map_err(|err| format!("failed to write registry temp file: {err}"))?;

    fs::rename(&tmp_path, &path)
        .map_err(|err| format!("failed to move registry temp file: {err}"))?;

    Ok(())
}

pub fn make_id(label: &str, existing: &[RegistryEntry]) -> String {
    let mut id = label
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'a'..='z' | '0'..='9' | '.' | '_' | '-' => c,
            _ => '-',
        })
        .collect::<String>();

    // Collapse repeated dashes
    while id.contains("--") {
        id = id.replace("--", "-");
    }

    // Trim leading/trailing dashes
    id = id.trim_matches('-').to_string();

    if id.is_empty() {
        id = "project".to_string();
    }

    // Check for collisions and append suffix if needed
    let mut final_id = id.clone();
    let mut counter = 2;
    while existing.iter().any(|e| e.id == final_id) {
        final_id = format!("{}-{}", id, counter);
        counter += 1;
    }

    final_id
}

pub fn add(path: &std::path::Path, label: Option<String>) -> Result<RegistryEntry, String> {
    let canonical_path = std::fs::canonicalize(path)
        .map_err(|err| format!("failed to resolve path: {err}"))?
        .to_string_lossy()
        .to_string();

    let mut registry = load()?;

    // Check if entry with same canonical path already exists
    if let Some(existing) = registry.projects.iter().find(|e| e.path == canonical_path) {
        return Ok(existing.clone());
    }

    let folder_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("project");

    let final_label = label.unwrap_or_else(|| folder_name.to_string());
    let id = make_id(&final_label, &registry.projects);

    let entry = RegistryEntry {
        id,
        path: canonical_path,
        label: final_label,
    };

    registry.projects.push(entry.clone());
    save(&registry)?;

    Ok(entry)
}

pub fn remove(id: &str) -> Result<(), String> {
    let mut registry = load()?;
    let initial_len = registry.projects.len();

    registry.projects.retain(|e| e.id != id);

    if registry.projects.len() == initial_len {
        return Err(format!("unknown project id: {id}"));
    }

    save(&registry)?;
    Ok(())
}

pub fn rename(id: &str, new_label: String) -> Result<RegistryEntry, String> {
    let mut registry = load()?;

    // Find and update the project
    for entry in &mut registry.projects {
        if entry.id == id {
            entry.label = new_label;
            let result = entry.clone();
            save(&registry)?;
            return Ok(result);
        }
    }

    Err(format!("unknown project id: {id}"))
}

pub fn relocate(id: &str, new_path: String) -> Result<RegistryEntry, String> {
    let canonical_path = std::fs::canonicalize(&new_path)
        .map_err(|err| format!("failed to resolve path: {err}"))?
        .to_string_lossy()
        .to_string();

    let mut registry = load()?;

    // Find and update the project path
    for entry in &mut registry.projects {
        if entry.id == id {
            entry.path = canonical_path;
            let result = entry.clone();
            save(&registry)?;
            return Ok(result);
        }
    }

    Err(format!("unknown project id: {id}"))
}

pub fn find(id: &str) -> Result<RegistryEntry, String> {
    let registry = load()?;
    registry
        .projects
        .iter()
        .find(|e| e.id == id)
        .cloned()
        .ok_or_else(|| format!("unknown project id: {id}"))
}
