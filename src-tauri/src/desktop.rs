use serde::Serialize;
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

#[derive(Serialize)]
pub struct WriteConfig {
  pub writes_enabled: bool,
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
      Err(format!("bd exited with status {}: {}", output.status, stderr))
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

fn env_roots() -> Vec<PathBuf> {
  if let Some(raw_roots) = env::var_os("BD_ROOTS") {
    return env::split_paths(&raw_roots).collect();
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
  value.get(key).and_then(Value::as_str).map(|s| s.to_string())
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
    bead_id: value_str(value, "bead_id")
      .if_empty_then(|| value_str(value, "issue_id")),
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
    if self.is_empty() { fallback() } else { self }
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

fn project_counts(dir: &Path) -> ProjectCounts {
  let query = "SELECT status, COUNT(*) AS c FROM issues GROUP BY status";
  let rows = bd_json(dir, &["sql", "--json", query]).ok();
  let mut counts = ProjectCounts {
    open: 0,
    in_progress: 0,
    blocked: 0,
    closed: 0,
    deferred: 0,
    total: 0,
  };

  let Some(Value::Array(rows)) = rows else {
    return counts;
  };

  for row in rows {
    let status = row.get("status").and_then(Value::as_str).unwrap_or_default();
    let n = row
      .get("c")
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

fn get_project_knowledge_inner(database: &str) -> Result<ProjectKnowledge, String> {
  let dir = resolve_dir(database)?;
  let comment_query = format!(
    "
    SELECT
      c.id AS id,
      c.issue_id AS bead_id,
      i.title AS bead_title,
      c.author AS author,
      c.text AS text,
      c.created_at AS created_at
    FROM comments c
    LEFT JOIN issues i ON i.id = c.issue_id
    ORDER BY c.created_at DESC
    LIMIT {COMMENTS_LIMIT}
  "
  );

  let knowledge_query = format!(
    "
    SELECT
      c.id AS id,
      c.issue_id AS bead_id,
      i.title AS bead_title,
      c.author AS author,
      c.text AS text,
      c.created_at AS created_at
    FROM comments c
    LEFT JOIN issues i ON i.id = c.issue_id
    WHERE c.text LIKE 'LEARNED:%'
       OR c.text LIKE 'DECISION:%'
       OR c.text LIKE 'FACT:%'
       OR c.text LIKE 'PATTERN:%'
       OR c.text LIKE 'INVESTIGATION:%'
       OR c.text LIKE 'MUST-CHECK:%'
       OR c.text LIKE 'DEVIATION:%'
    ORDER BY c.created_at DESC
    LIMIT {KNOWLEDGE_LIMIT}
  "
  );

  let raw_comments = bd_json(&dir, &["sql", "--json", &comment_query])?;
  let raw_knowledge = bd_json(&dir, &["sql", "--json", &knowledge_query])?;

  let comments = raw_comments
    .as_array()
    .cloned()
    .unwrap_or_default()
    .into_iter()
    .map(|value| map_project_comment(&value))
    .collect();

  let knowledge = raw_knowledge
    .as_array()
    .cloned()
    .unwrap_or_default()
    .into_iter()
    .filter_map(|value| map_knowledge_entry(&value))
    .collect();

  Ok(ProjectKnowledge { comments, knowledge })
}

fn is_write_enabled() -> bool {
  matches!(
    env::var("BD_BOARD_ALLOW_WRITE")
      .unwrap_or_default()
      .to_lowercase()
      .as_str(),
    "1" | "true" | "yes"
  )
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
pub fn get_write_config() -> Result<WriteConfig, String> {
  Ok(WriteConfig {
    writes_enabled: is_write_enabled(),
  })
}
