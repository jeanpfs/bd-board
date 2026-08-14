use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const BD_FALLBACK: &str = "/opt/homebrew/bin/bd";
const MAX_BUFFER: usize = 64 * 1024 * 1024;
const COMMENTS_LIMIT: usize = 250;
const KNOWLEDGE_LIMIT: usize = 500;

#[derive(Serialize)]
pub struct ProjectCounts {
    pub open: i64,
    pub in_progress: i64,
    pub blocked: i64,
    pub closed: i64,
    pub deferred: i64,
    pub total: i64,
}

#[derive(Serialize)]
pub struct Project {
    pub name: String,
    pub dir: String,
    pub database: String,
    pub counts: ProjectCounts,
}

#[derive(Serialize)]
pub struct Comment {
    pub id: String,
    pub author: Option<String>,
    pub text: String,
    pub created_at: Option<String>,
}

#[derive(Serialize)]
pub struct ProjectComment {
    pub id: String,
    pub bead_id: String,
    pub bead_title: Option<String>,
    pub author: Option<String>,
    pub text: String,
    pub created_at: Option<String>,
    pub knowledge_type: Option<String>,
}

#[derive(Serialize)]
pub struct ProjectKnowledgeEntry {
    pub id: String,
    pub bead_id: String,
    pub bead_title: Option<String>,
    pub author: Option<String>,
    pub text: String,
    pub created_at: Option<String>,
    #[serde(rename = "type")]
    pub kind: String,
    pub content: String,
    pub knowledge_type: Option<String>,
}

#[derive(Serialize)]
pub struct ProjectKnowledge {
    pub comments: Vec<ProjectComment>,
    pub knowledge: Vec<ProjectKnowledgeEntry>,
}

#[derive(Serialize)]
pub struct RelatedBead {
    pub id: String,
    pub title: String,
    pub status: String,
    pub issue_type: String,
    pub dependency_type: String,
}

#[derive(Serialize, Clone)]
pub struct Bead {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub acceptance_criteria: Option<String>,
    pub design: Option<String>,
    pub notes: Option<String>,
    pub status: String,
    pub priority: i64,
    pub issue_type: String,
    pub assignee: Option<String>,
    pub owner: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
    pub labels: Vec<String>,
    pub parent: Option<String>,
    pub comment_count: Option<i64>,
    pub dependency_count: Option<i64>,
    pub dependent_count: Option<i64>,
    pub children: Option<Vec<String>>,
    pub child_beads: Option<Vec<Bead>>,
}

#[derive(Serialize)]
pub struct BeadDetail {
    #[serde(flatten)]
    pub bead: Bead,
    pub dependencies: Vec<RelatedBead>,
    pub comments: Vec<Comment>,
}

#[derive(Deserialize, Default)]
pub struct BeadUpdateInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub acceptance_criteria: Option<String>,
    pub design: Option<String>,
    pub notes: Option<String>,
    pub priority: Option<i64>,
    pub issue_type: Option<String>,
    pub assignee: Option<String>,
    pub labels: Option<Vec<String>>,
}

fn bd_binary() -> String {
    env::var("BD_BIN").unwrap_or_else(|_| "bd".to_string())
}

fn run_bd(dir: &Path, args: &[&str]) -> Result<String, String> {
    let primary = bd_binary();
    let run = |bin: &str| {
        Command::new(bin)
            .arg("-C")
            .arg(dir)
            .args(args)
            .output()
            .map_err(|err| err.to_string())
    };

    let output = match run(&primary) {
        Ok(output) => output,
        Err(err) if err.contains("No such file or directory") => run(BD_FALLBACK)?,
        Err(err) => return Err(format!("failed to run {primary}: {err}")),
    };

    if output.stdout.len() > MAX_BUFFER {
        return Err("bd output exceeded buffer".to_string());
    }

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err(format!("bd exited with status {}", output.status))
        } else {
            Err(format!(
                "bd exited with status {}: {}",
                output.status, stderr
            ))
        }
    }
}

fn bd_json(dir: &Path, args: &[&str]) -> Result<Value, String> {
    let raw = run_bd(dir, args)?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(Value::Array(Vec::new()));
    }
    serde_json::from_str(trimmed).map_err(|err| err.to_string())
}

fn bd_json_lines(dir: &Path, args: &[&str]) -> Result<Vec<Value>, String> {
    let raw = run_bd(dir, args)?;
    raw.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_str(line).map_err(|err| err.to_string()))
        .collect()
}

fn expand_home_with(path: PathBuf, home: Option<PathBuf>) -> PathBuf {
    let path_str = path.to_string_lossy();
    if path_str != "~" && !path_str.starts_with("~/") {
        return path;
    }
    let Some(home) = home else {
        return path;
    };
    if path_str == "~" {
        return home;
    }
    home.join(&path_str[2..])
}

fn expand_home(path: PathBuf) -> PathBuf {
    let home = env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    expand_home_with(path, home)
}

fn env_roots() -> Vec<PathBuf> {
    if let Some(raw_roots) = env::var_os("BD_ROOTS") {
        return env::split_paths(&raw_roots).map(expand_home).collect();
    }

    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .map(|mut root| {
            root.push("Code");
            vec![root]
        })
        .unwrap_or_default()
}

pub fn resolve_roots() -> Vec<PathBuf> {
    env_roots()
}

fn parse_comment_text(text: &str) -> Option<(String, String)> {
    let trimmed = text.trim_start();
    let lower = trimmed.to_ascii_uppercase();
    let prefixes = [
        "LEARNED:",
        "DECISION:",
        "FACT:",
        "PATTERN:",
        "INVESTIGATION:",
        "MUST-CHECK:",
        "DEVIATION:",
    ];

    for prefix in prefixes {
        if let Some(_rest) = lower.strip_prefix(prefix) {
            let content = trimmed[prefix.len()..].trim();
            if content.is_empty() {
                return None;
            }
            let kind = prefix.trim_end_matches(':').to_ascii_lowercase();
            return Some((kind, content.to_string()));
        }
    }

    None
}

fn value_str(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn value_opt_str(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(|s| s.to_string())
}

fn value_i64(value: &Value, key: &str) -> Option<i64> {
    value
        .get(key)
        .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|n| n as i64)))
}

fn value_labels(value: &Value) -> Vec<String> {
    value
        .get("labels")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default()
}

fn map_bead(value: &Value) -> Bead {
    Bead {
        id: value_str(value, "id"),
        title: value_str(value, "title"),
        description: value_opt_str(value, "description"),
        acceptance_criteria: value_opt_str(value, "acceptance_criteria"),
        design: value_opt_str(value, "design"),
        notes: value_opt_str(value, "notes"),
        status: value_str(value, "status"),
        priority: value_i64(value, "priority").unwrap_or(2),
        issue_type: value_str(value, "issue_type"),
        assignee: value_opt_str(value, "assignee"),
        owner: value_opt_str(value, "owner"),
        created_at: value_opt_str(value, "created_at"),
        updated_at: value_opt_str(value, "updated_at"),
        closed_at: value_opt_str(value, "closed_at"),
        labels: value_labels(value),
        parent: value_opt_str(value, "parent"),
        comment_count: value_i64(value, "comment_count"),
        dependency_count: value_i64(value, "dependency_count"),
        dependent_count: value_i64(value, "dependent_count"),
        children: None,
        child_beads: None,
    }
}

fn map_comment(value: &Value) -> Comment {
    Comment {
        id: value_str(value, "id"),
        author: value_opt_str(value, "author").or_else(|| value_opt_str(value, "created_by")),
        text: value
            .get("text")
            .or_else(|| value.get("body"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        created_at: value_opt_str(value, "created_at"),
    }
}

fn map_project_comment(value: &Value) -> ProjectComment {
    let text = value
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let knowledge_type = parse_comment_text(&text).map(|(kind, _)| kind);
    ProjectComment {
        id: value_str(value, "id"),
        bead_id: value_str(value, "bead_id").if_empty_then(|| value_str(value, "issue_id")),
        bead_title: value_opt_str(value, "bead_title")
            .or_else(|| value_opt_str(value, "title"))
            .filter(|s| !s.is_empty()),
        author: value_opt_str(value, "author").or_else(|| value_opt_str(value, "created_by")),
        text,
        created_at: value_opt_str(value, "created_at"),
        knowledge_type,
    }
}

trait EmptyFallback {
    fn if_empty_then(self, fallback: impl FnOnce() -> String) -> String;
}

impl EmptyFallback for String {
    fn if_empty_then(self, fallback: impl FnOnce() -> String) -> String {
        if self.is_empty() {
            fallback()
        } else {
            self
        }
    }
}

fn map_knowledge_entry(value: &Value) -> Option<ProjectKnowledgeEntry> {
    let comment = map_project_comment(value);
    let (kind, content) = parse_comment_text(&comment.text)?;
    let knowledge_type = Some(kind.clone());
    Some(ProjectKnowledgeEntry {
        id: comment.id,
        bead_id: comment.bead_id,
        bead_title: comment.bead_title,
        author: comment.author,
        text: comment.text,
        created_at: comment.created_at,
        kind,
        content,
        knowledge_type,
    })
}

fn discover_projects_inner() -> Result<Vec<Project>, String> {
    let mut projects = Vec::new();

    for root in resolve_roots() {
        let entries = match fs::read_dir(&root) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }

            let meta_path = dir.join(".beads").join("metadata.json");
            let raw = match fs::read_to_string(&meta_path) {
                Ok(raw) => raw,
                Err(_) => continue,
            };

            let meta: Value = match serde_json::from_str(&raw) {
                Ok(meta) => meta,
                Err(_) => continue,
            };

            let database = meta
                .get("dolt_database")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());

            let Some(database) = database else {
                continue;
            };

            let counts = project_counts(&dir);
            projects.push(Project {
                name: database.clone(),
                dir: dir.to_string_lossy().to_string(),
                database,
                counts,
            });
        }
    }

    projects.sort_by(|a, b| {
        b.counts
            .total
            .cmp(&a.counts.total)
            .then_with(|| a.name.cmp(&b.name))
    });

    Ok(projects)
}

fn build_counts_from_groups(rows: &[Value]) -> ProjectCounts {
    let mut counts = ProjectCounts {
        open: 0,
        in_progress: 0,
        blocked: 0,
        closed: 0,
        deferred: 0,
        total: 0,
    };

    for row in rows {
        let status = row.get("group").and_then(Value::as_str).unwrap_or_default();
        let n = row
            .get("count")
            .and_then(|v| v.as_i64().or_else(|| v.as_u64().map(|n| n as i64)))
            .unwrap_or(0);
        counts.total += n;
        match status {
            "open" => counts.open += n,
            "in_progress" | "hooked" => counts.in_progress += n,
            "blocked" => counts.blocked += n,
            "closed" => counts.closed += n,
            "deferred" => counts.deferred += n,
            _ => {}
        }
    }

    counts
}

fn project_counts(dir: &Path) -> ProjectCounts {
    let result = bd_json(dir, &["count", "--by-status", "--json"]).ok();
    let groups = result
        .as_ref()
        .and_then(|v| v.get("groups"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    build_counts_from_groups(&groups)
}

fn resolve_dir(database: &str) -> Result<PathBuf, String> {
    discover_projects_inner()?
        .into_iter()
        .find(|project| project.database == database)
        .map(|project| PathBuf::from(project.dir))
        .ok_or_else(|| format!("Unknown database: {database}. Run discoverProjects first."))
}

fn derive_children(beads: Vec<Bead>) -> Vec<Bead> {
    let mut child_map: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    for bead in &beads {
        if let Some(parent) = &bead.parent {
            child_map
                .entry(parent.clone())
                .or_default()
                .push(bead.id.clone());
        }
    }

    let bead_by_id: std::collections::HashMap<String, Bead> =
        beads.iter().cloned().map(|b| (b.id.clone(), b)).collect();

    beads
        .into_iter()
        .map(|mut bead| {
            if let Some(children) = child_map.get(&bead.id) {
                bead.children = Some(children.clone());
                bead.child_beads = Some(
                    children
                        .iter()
                        .filter_map(|id| bead_by_id.get(id).cloned())
                        .collect(),
                );
            }
            bead
        })
        .collect()
}

fn list_beads_inner(database: &str) -> Result<Vec<Bead>, String> {
    let dir = resolve_dir(database)?;
    let raw = bd_json(&dir, &["list", "--all", "--json"])?;
    let beads = raw
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|value| map_bead(&value))
        .collect();
    Ok(derive_children(beads))
}

fn get_bead_detail_inner(database: &str, id: &str) -> Result<BeadDetail, String> {
    let dir = resolve_dir(database)?;
    let raw_arr = bd_json(&dir, &["show", id, "--json"])?;
    let raw_comments = bd_json(&dir, &["comments", id, "--json"]).ok();

    let raw = raw_arr
        .as_array()
        .and_then(|arr| arr.first())
        .cloned()
        .unwrap_or(Value::Object(Default::default()));
    let bead = map_bead(&raw);
    let raw_deps = raw
        .get("dependencies")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let dependencies = raw_deps
        .into_iter()
        .map(|d| RelatedBead {
            id: value_str(&d, "id"),
            title: value_str(&d, "title"),
            status: value_str(&d, "status"),
            issue_type: value_str(&d, "issue_type"),
            dependency_type: value_str(&d, "dependency_type"),
        })
        .collect();

    let comments = match raw_comments {
        Some(Value::Array(items)) => items.into_iter().map(|v| map_comment(&v)).collect(),
        _ => Vec::new(),
    };

    Ok(BeadDetail {
        bead,
        dependencies,
        comments,
    })
}

fn build_project_knowledge(issues: &[Value]) -> ProjectKnowledge {
    let mut raw_comments: Vec<Value> = Vec::new();
    for issue in issues {
        let title = issue.get("title").cloned().unwrap_or(Value::Null);
        if let Some(Value::Array(issue_comments)) = issue.get("comments") {
            for comment in issue_comments {
                let mut merged = comment.clone();
                if let Value::Object(map) = &mut merged {
                    map.insert("title".to_string(), title.clone());
                }
                raw_comments.push(merged);
            }
        }
    }

    let by_date_desc = |a: &Option<String>, b: &Option<String>| {
        b.as_deref().unwrap_or("").cmp(a.as_deref().unwrap_or(""))
    };

    let mut comments: Vec<ProjectComment> = raw_comments.iter().map(map_project_comment).collect();
    comments.sort_by(|a, b| by_date_desc(&a.created_at, &b.created_at));
    comments.truncate(COMMENTS_LIMIT);

    let mut knowledge: Vec<ProjectKnowledgeEntry> = raw_comments
        .iter()
        .filter_map(map_knowledge_entry)
        .collect();
    knowledge.sort_by(|a, b| by_date_desc(&a.created_at, &b.created_at));
    knowledge.truncate(KNOWLEDGE_LIMIT);

    ProjectKnowledge {
        comments,
        knowledge,
    }
}

fn get_project_knowledge_inner(database: &str) -> Result<ProjectKnowledge, String> {
    let dir = resolve_dir(database)?;
    match bd_json_lines(&dir, &["export"]) {
        Ok(issues) => Ok(build_project_knowledge(&issues)),
        Err(_) => Ok(ProjectKnowledge {
            comments: Vec::new(),
            knowledge: Vec::new(),
        }),
    }
}

fn run_bd_mut(dir: &Path, args: &[String]) -> Result<String, String> {
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    run_bd(dir, &arg_refs)
}

fn update_bead_status_inner(database: &str, id: &str, status: &str) -> Result<(), String> {
    let dir = resolve_dir(database)?;
    run_bd(&dir, &["update", id, "--status", status])?;
    Ok(())
}

fn build_update_bead_args(
    id: &str,
    update: &BeadUpdateInput,
    existing_labels: &[String],
) -> Vec<String> {
    let mut args = vec!["update".to_string(), id.to_string()];

    if let Some(title) = &update.title {
        args.push("--title".to_string());
        args.push(title.clone());
    }
    if let Some(description) = &update.description {
        args.push("--description".to_string());
        args.push(description.clone());
    }
    if let Some(acceptance) = &update.acceptance_criteria {
        args.push("--acceptance".to_string());
        args.push(acceptance.clone());
    }
    if let Some(design) = &update.design {
        args.push("--design".to_string());
        args.push(design.clone());
    }
    if let Some(notes) = &update.notes {
        args.push("--notes".to_string());
        args.push(notes.clone());
    }
    if let Some(priority) = update.priority {
        args.push("--priority".to_string());
        args.push(priority.to_string());
    }
    if let Some(issue_type) = &update.issue_type {
        args.push("--type".to_string());
        args.push(issue_type.clone());
    }
    if let Some(assignee) = &update.assignee {
        args.push("--assignee".to_string());
        args.push(assignee.clone());
    }
    if let Some(labels) = &update.labels {
        if !labels.is_empty() {
            args.push("--set-labels".to_string());
            args.push(labels.join(","));
        } else {
            for label in existing_labels {
                args.push("--remove-label".to_string());
                args.push(label.clone());
            }
        }
    }

    args
}

fn update_bead_inner(database: &str, id: &str, update: BeadUpdateInput) -> Result<(), String> {
    let dir = resolve_dir(database)?;
    let existing_labels = if update.labels.is_some() {
        get_bead_detail_inner(database, id)?.bead.labels
    } else {
        Vec::new()
    };
    let args = build_update_bead_args(id, &update, &existing_labels);
    if args.len() <= 2 {
        return Ok(());
    }
    run_bd_mut(&dir, &args)?;
    Ok(())
}

fn build_preview_delete_bead_args(id: &str) -> Vec<String> {
    vec![
        "delete".to_string(),
        id.to_string(),
        "--cascade".to_string(),
    ]
}

fn build_delete_bead_args(id: &str) -> Vec<String> {
    vec![
        "delete".to_string(),
        id.to_string(),
        "--cascade".to_string(),
        "--force".to_string(),
    ]
}

fn preview_delete_bead_inner(database: &str, id: &str) -> Result<String, String> {
    let dir = resolve_dir(database)?;
    let args = build_preview_delete_bead_args(id);
    let out = run_bd_mut(&dir, &args)?;
    Ok(out.trim().to_string())
}

fn delete_bead_inner(database: &str, id: &str) -> Result<(), String> {
    let dir = resolve_dir(database)?;
    let args = build_delete_bead_args(id);
    run_bd_mut(&dir, &args)
        .map(|_| ())
        .map_err(|err| format!("Unable to delete bead. {err}"))
}

fn create_bead_inner(
    database: &str,
    title: &str,
    description: Option<&str>,
    kind: Option<&str>,
    parent: Option<&str>,
) -> Result<String, String> {
    let dir = resolve_dir(database)?;
    let mut args = vec![
        "create".to_string(),
        "--title".to_string(),
        title.to_string(),
        "--silent".to_string(),
    ];
    if let Some(description) = description.filter(|s| !s.is_empty()) {
        args.push("-d".to_string());
        args.push(description.to_string());
    }
    if let Some(kind) = kind.filter(|s| !s.is_empty()) {
        args.push("--type".to_string());
        args.push(kind.to_string());
    }
    if let Some(parent) = parent.filter(|s| !s.is_empty()) {
        args.push("--parent".to_string());
        args.push(parent.to_string());
    }
    let out = run_bd_mut(&dir, &args)?;
    Ok(out.trim().to_string())
}

fn add_comment_inner(database: &str, id: &str, text: &str) -> Result<(), String> {
    let dir = resolve_dir(database)?;
    run_bd(&dir, &["comment", id, text])?;
    Ok(())
}

#[tauri::command]
pub fn discover_projects() -> Result<Vec<Project>, String> {
    discover_projects_inner()
}

#[tauri::command]
pub fn list_beads(database: String) -> Result<Vec<Bead>, String> {
    list_beads_inner(&database)
}

#[tauri::command]
pub fn get_bead_detail(database: String, id: String) -> Result<BeadDetail, String> {
    get_bead_detail_inner(&database, &id)
}

#[tauri::command]
pub fn get_project_knowledge(database: String) -> Result<ProjectKnowledge, String> {
    get_project_knowledge_inner(&database)
}

#[tauri::command]
pub fn update_bead_status(database: String, id: String, status: String) -> Result<(), String> {
    update_bead_status_inner(&database, &id, &status)
}

#[tauri::command]
pub fn update_bead(database: String, id: String, update: BeadUpdateInput) -> Result<(), String> {
    update_bead_inner(&database, &id, update)
}

#[tauri::command]
pub fn preview_delete_bead(database: String, id: String) -> Result<String, String> {
    preview_delete_bead_inner(&database, &id)
}

#[tauri::command]
pub fn delete_bead(database: String, id: String) -> Result<(), String> {
    delete_bead_inner(&database, &id)
}

#[tauri::command]
pub fn create_bead(
    database: String,
    title: String,
    description: Option<String>,
    r#type: Option<String>,
    parent: Option<String>,
) -> Result<String, String> {
    create_bead_inner(
        &database,
        &title,
        description.as_deref(),
        r#type.as_deref(),
        parent.as_deref(),
    )
}

#[tauri::command]
pub fn add_comment(database: String, id: String, text: String) -> Result<(), String> {
    add_comment_inner(&database, &id, &text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn expand_home_expands_bare_tilde() {
        let home = PathBuf::from("/Users/me");
        assert_eq!(
            expand_home_with(PathBuf::from("~"), Some(home.clone())),
            home
        );
    }

    #[test]
    fn expand_home_expands_tilde_prefixed_path() {
        let home = PathBuf::from("/Users/me");
        assert_eq!(
            expand_home_with(PathBuf::from("~/Code"), Some(home)),
            PathBuf::from("/Users/me/Code")
        );
    }

    #[test]
    fn expand_home_leaves_absolute_path_unchanged() {
        let home = PathBuf::from("/Users/me");
        assert_eq!(
            expand_home_with(PathBuf::from("/Users/me/Code"), Some(home)),
            PathBuf::from("/Users/me/Code")
        );
    }

    #[test]
    fn expand_home_leaves_relative_non_tilde_path_unchanged() {
        assert_eq!(
            expand_home_with(PathBuf::from("../Code"), Some(PathBuf::from("/Users/me"))),
            PathBuf::from("../Code")
        );
    }

    #[test]
    fn build_counts_from_groups_maps_bd_count_by_status_groups() {
        let rows = vec![
            json!({"group": "open", "count": 16}),
            json!({"group": "blocked", "count": 9}),
        ];
        let counts = build_counts_from_groups(&rows);
        assert_eq!(counts.open, 16);
        assert_eq!(counts.blocked, 9);
        assert_eq!(counts.in_progress, 0);
        assert_eq!(counts.closed, 0);
        assert_eq!(counts.deferred, 0);
        assert_eq!(counts.total, 25);
    }

    #[test]
    fn build_counts_from_groups_handles_empty_groups() {
        let counts = build_counts_from_groups(&[]);
        assert_eq!(counts.total, 0);
        assert_eq!(counts.open, 0);
    }

    #[test]
    fn build_counts_from_groups_folds_hooked_into_in_progress() {
        let rows = vec![json!({"group": "hooked", "count": 3})];
        let counts = build_counts_from_groups(&rows);
        assert_eq!(counts.in_progress, 3);
        assert_eq!(counts.total, 3);
    }

    #[test]
    fn build_project_knowledge_combines_and_orders_comments_newest_first() {
        let issues = vec![
            json!({
                "id": "ravo-fvs",
                "title": "Primeiro deploy manual",
                "comments": [{
                    "id": "c1",
                    "issue_id": "ravo-fvs",
                    "author": "Jean",
                    "text": "ping",
                    "created_at": "2026-08-10T00:00:00Z",
                }],
            }),
            json!({
                "id": "ravo-cbf",
                "title": "Ligar backup automático",
                "comments": [{
                    "id": "c2",
                    "issue_id": "ravo-cbf",
                    "author": "Jean",
                    "text": "LEARNED: backups precisam de restore testado",
                    "created_at": "2026-08-12T00:00:00Z",
                }],
            }),
        ];

        let result = build_project_knowledge(&issues);
        let ids: Vec<&str> = result.comments.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids, vec!["c2", "c1"]);
        assert_eq!(result.comments[0].bead_id, "ravo-cbf");
        assert_eq!(
            result.comments[0].bead_title.as_deref(),
            Some("Ligar backup automático")
        );
    }

    #[test]
    fn build_project_knowledge_splits_tagged_and_plain_comments() {
        let issues = vec![json!({
            "id": "ravo-cbf",
            "title": "Ligar backup automático",
            "comments": [
                {
                    "id": "c1",
                    "issue_id": "ravo-cbf",
                    "author": "Jean",
                    "text": "LEARNED: backups precisam de restore testado",
                    "created_at": "2026-08-12T00:00:00Z",
                },
                {
                    "id": "c2",
                    "issue_id": "ravo-cbf",
                    "author": "Jean",
                    "text": "just a note",
                    "created_at": "2026-08-11T00:00:00Z",
                },
            ],
        })];

        let result = build_project_knowledge(&issues);
        assert_eq!(result.comments.len(), 2);
        assert_eq!(result.knowledge.len(), 1);
        assert_eq!(result.knowledge[0].id, "c1");
        assert_eq!(result.knowledge[0].kind, "learned");
        assert_eq!(
            result.knowledge[0].content,
            "backups precisam de restore testado"
        );
    }

    #[test]
    fn build_project_knowledge_handles_issue_without_comments() {
        let issues = vec![json!({"id": "ravo-nyu", "title": "No comments"})];
        let result = build_project_knowledge(&issues);
        assert!(result.comments.is_empty());
        assert!(result.knowledge.is_empty());
    }

    #[test]
    fn build_project_knowledge_truncates_to_configured_limits() {
        let many: Vec<Value> = (0..(COMMENTS_LIMIT + 20))
            .map(|i| {
                json!({
                    "id": format!("c{i}"),
                    "issue_id": "ravo-many",
                    "author": "Jean",
                    "text": format!("LEARNED: entry {i}"),
                    "created_at": format!("2026-08-{:02}T00:00:00Z", (i % 28) + 1),
                })
            })
            .collect();
        let issues = vec![json!({"id": "ravo-many", "title": "Many comments", "comments": many})];

        let result = build_project_knowledge(&issues);
        assert_eq!(result.comments.len(), COMMENTS_LIMIT);
        assert_eq!(
            result.knowledge.len(),
            KNOWLEDGE_LIMIT.min(COMMENTS_LIMIT + 20)
        );
    }

    #[test]
    fn build_update_bead_args_builds_arguments_for_editable_fields() {
        let update = BeadUpdateInput {
            title: Some("Updated title".to_string()),
            description: Some("Updated description".to_string()),
            acceptance_criteria: Some("Updated acceptance".to_string()),
            design: Some("Updated design".to_string()),
            notes: Some("Updated notes".to_string()),
            priority: Some(0),
            issue_type: Some("feature".to_string()),
            assignee: Some("Jean".to_string()),
            labels: Some(vec!["backend".to_string(), "ui".to_string()]),
        };

        let args = build_update_bead_args("bd-board-a2k", &update, &[]);

        assert_eq!(
            args,
            vec![
                "update",
                "bd-board-a2k",
                "--title",
                "Updated title",
                "--description",
                "Updated description",
                "--acceptance",
                "Updated acceptance",
                "--design",
                "Updated design",
                "--notes",
                "Updated notes",
                "--priority",
                "0",
                "--type",
                "feature",
                "--assignee",
                "Jean",
                "--set-labels",
                "backend,ui",
            ]
        );
    }

    #[test]
    fn build_update_bead_args_removes_existing_labels_when_labels_explicitly_empty() {
        let update = BeadUpdateInput {
            labels: Some(vec![]),
            ..Default::default()
        };
        let existing = vec!["old".to_string(), "ui".to_string()];

        let args = build_update_bead_args("bd-board-a2k", &update, &existing);

        assert_eq!(
            args,
            vec![
                "update",
                "bd-board-a2k",
                "--remove-label",
                "old",
                "--remove-label",
                "ui",
            ]
        );
    }

    #[test]
    fn delete_bead_args_keep_preview_and_confirmed_commands_separate() {
        assert_eq!(
            build_preview_delete_bead_args("bd-board-a2k"),
            vec!["delete", "bd-board-a2k", "--cascade"]
        );
        assert_eq!(
            build_delete_bead_args("bd-board-a2k"),
            vec!["delete", "bd-board-a2k", "--cascade", "--force"]
        );
    }
}
