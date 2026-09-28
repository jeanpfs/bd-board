use crate::registry::{self, RegistryEntry};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

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
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub dir: String,
    pub beads_path: String,
    pub prefix: Option<String>,
    pub external: bool,
    pub missing: bool,
    pub error: Option<String>,
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

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BeadsLocation {
    pub beads_path: String,
    pub database_path: String,
    pub prefix: Option<String>,
    pub external: bool,
}

fn probe_beads_location(dir: &Path) -> Result<BeadsLocation, String> {
    let raw = run_bd(dir, &["where", "--json"])?;
    let value: Value = serde_json::from_str(&raw)
        .map_err(|err| format!("failed to parse bd where output: {err}"))?;

    let beads_path = value
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| "bd where returned no beads path".to_string())?
        .to_string();

    let database_path = value
        .get("database_path")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let prefix = value
        .get("prefix")
        .and_then(Value::as_str)
        .map(|s| s.to_string());

    // Determine if beads is external (outside the project folder)
    let expected_beads_path = dir.join(".beads");
    let external = match (
        std::fs::canonicalize(&beads_path),
        std::fs::canonicalize(&expected_beads_path),
    ) {
        (Ok(canonical_beads), Ok(canonical_expected)) => canonical_beads != canonical_expected,
        _ => beads_path != expected_beads_path.to_string_lossy(),
    };

    Ok(BeadsLocation {
        beads_path,
        database_path,
        prefix,
        external,
    })
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

pub fn bd_candidates() -> Vec<String> {
    let mut candidates = Vec::new();

    // (a) BD_BIN when set and non-empty
    if let Ok(bin) = env::var("BD_BIN") {
        if !bin.is_empty() {
            candidates.push(bin);
        }
    }

    // (b) $HOME/.local/bin/bd — the wrapper
    if let Ok(home) = env::var("HOME") {
        candidates.push(format!("{}/.local/bin/bd", home));
    }

    // (c) "bd" from PATH
    candidates.push("bd".to_string());

    // (d) Fallback
    candidates.push(BD_FALLBACK.to_string());

    candidates
}

fn bd_error_message(stdout: &str, stderr: &str, status: &std::process::ExitStatus) -> String {
    let stdout_trim = stdout.trim();
    let stderr_trim = stderr.trim();

    // Try to parse stdout as JSON and extract message or error
    if !stdout_trim.is_empty() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(stdout_trim) {
            // Check for message field
            if let Some(msg) = json.get("message").and_then(|v| v.as_str()) {
                if !msg.is_empty() {
                    let mut result = msg.to_string();
                    if let Some(hint) = json.get("hint").and_then(|v| v.as_str()) {
                        if !hint.is_empty() {
                            result.push_str(&format!(" ({})", hint));
                        }
                    }
                    return result;
                }
            }

            // Check for error field
            if let Some(err) = json.get("error").and_then(|v| v.as_str()) {
                if !err.is_empty() {
                    let mut result = err.to_string();
                    if let Some(hint) = json.get("hint").and_then(|v| v.as_str()) {
                        if !hint.is_empty() {
                            result.push_str(&format!(" ({})", hint));
                        }
                    }
                    return result;
                }
            }
        }
    }

    // Fall back to stderr
    if !stderr_trim.is_empty() {
        return format!("bd exited with status {}: {}", status, stderr_trim);
    }

    // Last resort
    format!("bd exited with status {}", status)
}

struct BdCapture {
    bin: String,
    stdout: String,
    stderr: String,
    status: std::process::ExitStatus,
}

fn exec_bd(dir: &Path, args: &[&str]) -> Result<BdCapture, String> {
    let candidates = bd_candidates();

    for candidate in &candidates {
        let mut cmd = Command::new(candidate);
        cmd.current_dir(dir).args(args);

        match cmd.output() {
            Ok(output) => {
                if output.stdout.len() > MAX_BUFFER {
                    return Err("bd output exceeded buffer".to_string());
                }

                return Ok(BdCapture {
                    bin: candidate.clone(),
                    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                    status: output.status,
                });
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                continue;
            }
            Err(err) => {
                return Err(format!("failed to run {}: {}", candidate, err));
            }
        }
    }

    // Exhausted all candidates
    let candidate_list = candidates.join(", ");
    Err(format!("bd not found (tried: {})", candidate_list))
}

fn run_bd(dir: &Path, args: &[&str]) -> Result<String, String> {
    let cap = exec_bd(dir, args)?;
    if cap.status.success() {
        Ok(cap.stdout)
    } else {
        Err(bd_error_message(&cap.stdout, &cap.stderr, &cap.status))
    }
}

// ---------------------------------------------------------------------------
// Events-journal change feed (mirrors src/lib/bead-feed-server.ts)
// ---------------------------------------------------------------------------

const FEED_PAGE_SIZE: usize = 1000;
const JOURNAL_DISABLED_MARKER: &str = "events journal is disabled";
const TRUNCATED_CODE: &str = "events_journal_truncated";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum BeadFeedMessage {
    Live { seq: i64 },
    Change { seq: i64, issue_ids: Vec<String> },
    Disabled,
    Unsupported { message: String },
    Error { message: String },
}

#[derive(Debug, PartialEq)]
enum FeedLine {
    Record { seq: i64, issue_ids: Vec<String> },
    Truncated { head: i64 },
}

fn parse_feed_line(line: &str) -> Option<FeedLine> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let value: Value = serde_json::from_str(trimmed).ok()?;
    let obj = value.as_object()?;

    if obj.get("code").and_then(Value::as_str) == Some(TRUNCATED_CODE) {
        if let Some(head) = obj.get("head").and_then(Value::as_i64) {
            return Some(FeedLine::Truncated { head });
        }
    }

    let seq = obj.get("seq").and_then(Value::as_i64)?;
    obj.get("op").and_then(Value::as_str)?;

    let mut issue_ids = Vec::new();
    let issue_id = obj
        .get("issue_id")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty());
    if let Some(id) = issue_id {
        issue_ids.push(id.to_string());
    }
    let target = obj
        .get("dep")
        .and_then(|d| d.get("target"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty());
    if let Some(t) = target {
        if Some(t) != issue_id {
            issue_ids.push(t.to_string());
        }
    }
    Some(FeedLine::Record { seq, issue_ids })
}

fn tail_args(since: i64, limit: Option<usize>, follow: bool) -> Vec<String> {
    let mut args: Vec<String> = ["events", "tail", "--json", "--since"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    args.push(since.to_string());
    if let Some(limit) = limit {
        args.push("--limit".to_string());
        args.push(limit.to_string());
    }
    if follow {
        args.push("--follow".to_string());
    }
    args
}

#[derive(Debug, PartialEq)]
enum DrainOutcome {
    Ready(i64),
    Disabled,
    Unsupported(String),
}

fn find_truncated_head(stdout: &str) -> Option<i64> {
    stdout.lines().find_map(|l| match parse_feed_line(l) {
        Some(FeedLine::Truncated { head }) => Some(head),
        _ => None,
    })
}

fn record_seqs(stdout: &str) -> Vec<i64> {
    stdout
        .lines()
        .filter_map(|l| match parse_feed_line(l) {
            Some(FeedLine::Record { seq, .. }) => Some(seq),
            _ => None,
        })
        .collect()
}

fn drain_journal(
    exec: &mut dyn FnMut(&[String]) -> Result<BdCapture, String>,
    since: i64,
) -> DrainOutcome {
    let mut cur = since;
    let mut checked_reset = false;
    let mut first = true;

    loop {
        let r = match exec(&tail_args(cur, Some(FEED_PAGE_SIZE), false)) {
            Ok(r) => r,
            Err(err) => return DrainOutcome::Unsupported(err),
        };
        if first && r.stderr.contains(JOURNAL_DISABLED_MARKER) {
            return DrainOutcome::Disabled;
        }
        if !r.status.success() {
            if let Some(head) = find_truncated_head(&r.stdout) {
                return DrainOutcome::Ready(head);
            }
            return DrainOutcome::Unsupported(bd_error_message(&r.stdout, &r.stderr, &r.status));
        }

        let seqs = record_seqs(&r.stdout);
        if let Some(last) = seqs.last() {
            cur = *last;
        }
        if seqs.len() == FEED_PAGE_SIZE {
            first = false;
            continue;
        }

        if first && seqs.is_empty() && cur > 0 && !checked_reset {
            let v = match exec(&tail_args(cur - 1, Some(1), false)) {
                Ok(v) => v,
                Err(err) => return DrainOutcome::Unsupported(err),
            };
            let valid = if v.status.success() {
                record_seqs(&v.stdout).first() == Some(&cur)
            } else {
                find_truncated_head(&v.stdout).is_some_and(|head| head >= cur)
            };
            if !valid {
                cur = 0;
                checked_reset = true;
                first = true;
                continue;
            }
        }

        return DrainOutcome::Ready(cur);
    }
}

#[derive(Default)]
pub struct FeedWatch {
    cancelled: AtomicBool,
    child: Mutex<Option<Child>>,
}

impl FeedWatch {
    fn kill_child(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(child) = guard.as_mut() {
                let _ = child.kill();
            }
        }
    }
}

#[derive(Default)]
pub struct FeedWatches {
    next_id: AtomicU32,
    watches: Arc<Mutex<HashMap<u32, Arc<FeedWatch>>>>,
}

impl FeedWatches {
    pub fn cancel_all(&self) {
        let all: Vec<Arc<FeedWatch>> = match self.watches.lock() {
            Ok(mut map) => map.drain().map(|(_, w)| w).collect(),
            Err(_) => return,
        };
        for watch in all {
            watch.cancelled.store(true, Ordering::SeqCst);
            watch.kill_child();
        }
    }
}

fn run_feed(dir: &Path, since: i64, watch: &FeedWatch, send: &dyn Fn(BeadFeedMessage) -> bool) {
    let emit = |msg: BeadFeedMessage| -> bool {
        if send(msg) {
            true
        } else {
            watch.cancelled.store(true, Ordering::SeqCst);
            watch.kill_child();
            false
        }
    };

    let mut bin = String::new();
    let outcome = {
        let mut exec = |args: &[String]| -> Result<BdCapture, String> {
            let refs: Vec<&str> = args.iter().map(String::as_str).collect();
            let cap = exec_bd(dir, &refs)?;
            if bin.is_empty() {
                bin = cap.bin.clone();
            }
            Ok(cap)
        };
        drain_journal(&mut exec, since)
    };

    let mut cur = match outcome {
        DrainOutcome::Disabled => {
            emit(BeadFeedMessage::Disabled);
            return;
        }
        DrainOutcome::Unsupported(message) => {
            emit(BeadFeedMessage::Unsupported { message });
            return;
        }
        DrainOutcome::Ready(seq) => {
            if !emit(BeadFeedMessage::Live { seq }) {
                return;
            }
            seq
        }
    };

    loop {
        if watch.cancelled.load(Ordering::SeqCst) {
            return;
        }
        let mut child = match Command::new(&bin)
            .current_dir(dir)
            .args(tail_args(cur, None, true))
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => child,
            Err(err) => {
                emit(BeadFeedMessage::Error {
                    message: format!("failed to run {}: {}", bin, err),
                });
                return;
            }
        };
        let Some(stdout) = child.stdout.take() else {
            let _ = child.kill();
            let _ = child.wait();
            emit(BeadFeedMessage::Error {
                message: "bd events tail produced no stdout".to_string(),
            });
            return;
        };
        if let Ok(mut guard) = watch.child.lock() {
            *guard = Some(child);
        }
        if watch.cancelled.load(Ordering::SeqCst) {
            watch.kill_child();
        }

        let mut truncated = false;
        for line in BufReader::new(stdout).lines() {
            if watch.cancelled.load(Ordering::SeqCst) {
                break;
            }
            let Ok(line) = line else { break };
            match parse_feed_line(&line) {
                Some(FeedLine::Record { seq, issue_ids }) => {
                    cur = seq;
                    if !emit(BeadFeedMessage::Change { seq, issue_ids }) {
                        break;
                    }
                }
                Some(FeedLine::Truncated { head }) => {
                    cur = head;
                    truncated = true;
                    if !emit(BeadFeedMessage::Change {
                        seq: head,
                        issue_ids: Vec::new(),
                    }) {
                        break;
                    }
                }
                None => {}
            }
        }

        let child = watch.child.lock().ok().and_then(|mut g| g.take());
        let status = child.map(|mut c| {
            let _ = c.kill();
            c.wait()
        });
        if watch.cancelled.load(Ordering::SeqCst) {
            return;
        }
        if truncated {
            continue;
        }
        let status_text = match status {
            Some(Ok(s)) => s.to_string(),
            Some(Err(e)) => e.to_string(),
            None => "unknown".to_string(),
        };
        emit(BeadFeedMessage::Error {
            message: format!("bd events tail exited ({})", status_text),
        });
        return;
    }
}

#[tauri::command]
pub fn watch_bead_feed(
    project_id: String,
    since: i64,
    on_message: tauri::ipc::Channel<BeadFeedMessage>,
    watches: tauri::State<'_, FeedWatches>,
) -> Result<u32, String> {
    let dir = resolve_dir(&project_id)?;
    let id = watches.next_id.fetch_add(1, Ordering::SeqCst);
    let watch = Arc::new(FeedWatch::default());
    watches
        .watches
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, watch.clone());
    let registry = watches.watches.clone();

    std::thread::spawn(move || {
        run_feed(&dir, since.max(0), &watch, &|m| on_message.send(m).is_ok());
        if let Ok(mut map) = registry.lock() {
            map.remove(&id);
        }
    });

    Ok(id)
}

#[tauri::command]
pub fn unwatch_bead_feed(watch_id: u32, watches: tauri::State<'_, FeedWatches>) {
    let removed = watches
        .watches
        .lock()
        .ok()
        .and_then(|mut m| m.remove(&watch_id));
    if let Some(watch) = removed {
        watch.cancelled.store(true, Ordering::SeqCst);
        watch.kill_child();
    }
}

#[tauri::command]
pub fn enable_events_journal(project_id: String) -> Result<(), String> {
    run_bd(
        &resolve_dir(&project_id)?,
        &["config", "set", "events-journal", "true"],
    )
    .map(|_| ())
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
    let registry = registry::load()?;

    for entry in registry.projects {
        let dir_path = PathBuf::from(&entry.path);

        // Check if folder exists
        if !dir_path.exists() {
            projects.push(Project {
                id: entry.id.clone(),
                name: entry.label.clone(),
                dir: entry.path.clone(),
                beads_path: String::new(),
                prefix: None,
                external: false,
                missing: true,
                error: Some("folder no longer exists".into()),
                counts: ProjectCounts {
                    open: 0,
                    in_progress: 0,
                    blocked: 0,
                    closed: 0,
                    deferred: 0,
                    total: 0,
                },
            });
            continue;
        }

        // Probe beads location
        match probe_beads_location(&dir_path) {
            Ok(location) => {
                let counts = project_counts(&dir_path);
                projects.push(Project {
                    id: entry.id.clone(),
                    name: entry.label.clone(),
                    dir: entry.path.clone(),
                    beads_path: location.beads_path,
                    prefix: location.prefix,
                    external: location.external,
                    missing: false,
                    error: None,
                    counts,
                });
            }
            Err(err) => {
                projects.push(Project {
                    id: entry.id.clone(),
                    name: entry.label.clone(),
                    dir: entry.path.clone(),
                    beads_path: String::new(),
                    prefix: None,
                    external: false,
                    missing: false,
                    error: Some(err),
                    counts: ProjectCounts {
                        open: 0,
                        in_progress: 0,
                        blocked: 0,
                        closed: 0,
                        deferred: 0,
                        total: 0,
                    },
                });
            }
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

fn resolve_dir(project_id: &str) -> Result<PathBuf, String> {
    let entry = registry::find(project_id)?;
    let path = PathBuf::from(&entry.path);
    if !path.exists() {
        return Err(format!(
            "project directory no longer exists: {}",
            entry.path
        ));
    }
    Ok(path)
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

fn list_beads_inner(project_id: &str) -> Result<Vec<Bead>, String> {
    let dir = resolve_dir(project_id)?;
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

fn get_bead_detail_inner(project_id: &str, id: &str) -> Result<BeadDetail, String> {
    let dir = resolve_dir(project_id)?;
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

fn get_project_knowledge_inner(project_id: &str) -> Result<ProjectKnowledge, String> {
    let dir = resolve_dir(project_id)?;
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

fn update_bead_status_inner(project_id: &str, id: &str, status: &str) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
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

fn update_bead_inner(project_id: &str, id: &str, update: BeadUpdateInput) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    let existing_labels = if update.labels.is_some() {
        get_bead_detail_inner(project_id, id)?.bead.labels
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

fn preview_delete_bead_inner(project_id: &str, id: &str) -> Result<String, String> {
    let dir = resolve_dir(project_id)?;
    let args = build_preview_delete_bead_args(id);
    let out = run_bd_mut(&dir, &args)?;
    Ok(out.trim().to_string())
}

fn delete_bead_inner(project_id: &str, id: &str) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    let args = build_delete_bead_args(id);
    run_bd_mut(&dir, &args)
        .map(|_| ())
        .map_err(|err| format!("Unable to delete bead. {err}"))
}

fn create_bead_inner(
    project_id: &str,
    title: &str,
    description: Option<&str>,
    kind: Option<&str>,
    parent: Option<&str>,
) -> Result<String, String> {
    let dir = resolve_dir(project_id)?;
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

fn add_comment_inner(project_id: &str, id: &str, text: &str) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd(&dir, &["comment", id, text])?;
    Ok(())
}

#[tauri::command]
pub fn list_projects() -> Result<Vec<Project>, String> {
    discover_projects_inner()
}

#[tauri::command]
pub fn list_beads(project_id: String) -> Result<Vec<Bead>, String> {
    list_beads_inner(&project_id)
}

#[tauri::command]
pub fn get_bead_detail(project_id: String, id: String) -> Result<BeadDetail, String> {
    get_bead_detail_inner(&project_id, &id)
}

#[tauri::command]
pub fn get_project_knowledge(project_id: String) -> Result<ProjectKnowledge, String> {
    get_project_knowledge_inner(&project_id)
}

#[tauri::command]
pub fn update_bead_status(project_id: String, id: String, status: String) -> Result<(), String> {
    update_bead_status_inner(&project_id, &id, &status)
}

#[tauri::command]
pub fn update_bead(project_id: String, id: String, update: BeadUpdateInput) -> Result<(), String> {
    update_bead_inner(&project_id, &id, update)
}

#[tauri::command]
pub fn preview_delete_bead(project_id: String, id: String) -> Result<String, String> {
    preview_delete_bead_inner(&project_id, &id)
}

#[tauri::command]
pub fn delete_bead(project_id: String, id: String) -> Result<(), String> {
    delete_bead_inner(&project_id, &id)
}

#[tauri::command]
pub fn create_bead(
    project_id: String,
    title: String,
    description: Option<String>,
    r#type: Option<String>,
    parent: Option<String>,
) -> Result<String, String> {
    create_bead_inner(
        &project_id,
        &title,
        description.as_deref(),
        r#type.as_deref(),
        parent.as_deref(),
    )
}

#[tauri::command]
pub fn add_comment(project_id: String, id: String, text: String) -> Result<(), String> {
    add_comment_inner(&project_id, &id, &text)
}

#[tauri::command]
pub fn probe_project(path: String) -> Result<BeadsLocation, String> {
    let dir_path = PathBuf::from(path);
    probe_beads_location(&dir_path)
}
fn is_missing_workspace_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("no_beads_directory")
        || lower.contains("no active beads workspace")
        || lower.contains("bd where returned no beads path")
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PathStatus {
    Valid {
        prefix: Option<String>,
        external: bool,
    },
    NeedsInit {
        suggested_prefix: String,
    },
    Invalid {
        reason: String,
    },
}

#[tauri::command]
pub fn check_project_path(path: String) -> PathStatus {
    let dir_path = PathBuf::from(&path);

    if !dir_path.exists() {
        return PathStatus::Invalid {
            reason: "Path does not exist".to_string(),
        };
    }

    match probe_beads_location(&dir_path) {
        Ok(location) => PathStatus::Valid {
            prefix: location.prefix,
            external: location.external,
        },
        Err(err) if is_missing_workspace_error(&err) => {
            let suggested_prefix = dir_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("project")
                .to_string();
            PathStatus::NeedsInit { suggested_prefix }
        }
        Err(reason) => PathStatus::Invalid { reason },
    }
}

#[derive(Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AddProjectOutcome {
    Registered {
        project: Project,
    },
    NeedsInit {
        path: String,
        suggested_prefix: String,
    },
}

#[tauri::command]
pub fn add_project(path: String, name: Option<String>) -> Result<AddProjectOutcome, String> {
    let dir_path = PathBuf::from(&path);

    match probe_beads_location(&dir_path) {
        Ok(location) => {
            // Register in the registry
            let entry = registry::add(&dir_path, name)?;

            // Get the counts
            let counts = project_counts(&dir_path);

            Ok(AddProjectOutcome::Registered {
                project: Project {
                    id: entry.id.clone(),
                    name: entry.label.clone(),
                    dir: entry.path,
                    beads_path: location.beads_path,
                    prefix: location.prefix,
                    external: location.external,
                    missing: false,
                    error: None,
                    counts,
                },
            })
        }
        Err(err) if is_missing_workspace_error(&err) => {
            let canonical_path = std::fs::canonicalize(&dir_path)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| path.clone());
            let suggested_prefix = dir_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("project")
                .to_string();

            Ok(AddProjectOutcome::NeedsInit {
                path: canonical_path,
                suggested_prefix,
            })
        }
        Err(err) => Err(err),
    }
}

#[tauri::command]
pub fn remove_project(id: String) -> Result<(), String> {
    registry::remove(&id)
}

fn build_init_args(prefix: &str) -> Vec<String> {
    vec![
        "init".to_string(),
        "--non-interactive".to_string(),
        "--quiet".to_string(),
        "-p".to_string(),
        prefix.to_string(),
    ]
}

#[tauri::command]
pub fn init_project(
    path: String,
    prefix: Option<String>,
    name: Option<String>,
) -> Result<Project, String> {
    let dir_path = PathBuf::from(&path);

    // Try to probe first to see if it already has beads
    let probe_result = probe_beads_location(&dir_path);

    if let Ok(location) = probe_result {
        // Already a beads project
        if !location.external {
            // Beads is in the expected location, just register it
            let entry = registry::add(&dir_path, name.clone())?;
            let counts = project_counts(&dir_path);
            return Ok(Project {
                id: entry.id.clone(),
                name: entry.label.clone(),
                dir: entry.path,
                beads_path: location.beads_path,
                prefix: location.prefix,
                external: location.external,
                missing: false,
                error: None,
                counts,
            });
        }
    }

    // Initialize beads with the specified prefix
    let folder_name = dir_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("project")
        .to_string();

    let final_prefix = prefix.unwrap_or(folder_name);

    // Build and run bd init with proper args (no -C flag)
    let init_args = build_init_args(&final_prefix);
    run_bd_mut(&dir_path, &init_args)?;

    // Probe again to get the location
    let location = probe_beads_location(&dir_path)?;

    // Register in the registry
    let entry = registry::add(&dir_path, name)?;

    // Get the counts
    let counts = project_counts(&dir_path);

    Ok(Project {
        id: entry.id.clone(),
        name: entry.label.clone(),
        dir: entry.path,
        beads_path: location.beads_path,
        prefix: location.prefix,
        external: location.external,
        missing: false,
        error: None,
        counts,
    })
}

#[tauri::command]
pub fn rename_project(id: String, name: String) -> Result<RegistryEntry, String> {
    registry::rename(&id, name)
}

#[tauri::command]
pub fn relocate_project(id: String, path: String) -> Result<RegistryEntry, String> {
    registry::relocate(&id, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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

    #[test]
    fn build_init_args_returns_correct_args_without_c_flag() {
        let args = build_init_args("ravo");
        assert_eq!(
            args,
            vec!["init", "--non-interactive", "--quiet", "-p", "ravo"]
        );
    }

    #[test]
    fn bd_error_message_extracts_message_field_from_json() {
        let stdout = r#"{"error":"no_beads_directory","hint":"run bd init","message":"no beads project found","schema_version":1}"#;
        let stderr = "";
        let status = std::process::Command::new("false").output().unwrap().status;

        let result = bd_error_message(stdout, stderr, &status);
        assert_eq!(result, "no beads project found (run bd init)");
    }

    #[test]
    fn bd_error_message_extracts_error_field_when_message_missing() {
        let stdout = r#"{"error":"some_error","hint":"try this","schema_version":1}"#;
        let stderr = "";
        let status = std::process::Command::new("false").output().unwrap().status;

        let result = bd_error_message(stdout, stderr, &status);
        assert_eq!(result, "some_error (try this)");
    }

    #[test]
    fn bd_error_message_falls_back_to_stderr() {
        let stdout = "";
        let stderr = "boom";
        let status = std::process::Command::new("false").output().unwrap().status;

        let result = bd_error_message(stdout, stderr, &status);
        assert!(result.contains("boom"));
    }

    #[test]
    fn bd_candidates_includes_wrapper_before_fallback() {
        // When BD_BIN is not set, we should get the wrapper and fallback
        let candidates = bd_candidates();

        // The wrapper should be in the list
        let home = std::env::var("HOME").unwrap_or_default();
        let wrapper_path = format!("{}/.local/bin/bd", home);

        assert!(
            candidates.contains(&wrapper_path),
            "Wrapper path not found in candidates"
        );
        assert!(
            candidates.contains(&BD_FALLBACK.to_string()),
            "Fallback not found in candidates"
        );

        // Wrapper should come before the fallback
        let wrapper_idx = candidates.iter().position(|c| c == &wrapper_path).unwrap();
        let fallback_idx = candidates.iter().position(|c| c == BD_FALLBACK).unwrap();
        assert!(
            wrapper_idx < fallback_idx,
            "Wrapper should come before fallback"
        );
        assert!(
            wrapper_idx < fallback_idx,
            "Wrapper should come before fallback"
        );
    }

    #[test]
    fn is_missing_workspace_error_matches_no_beads_directory_code() {
        assert!(is_missing_workspace_error(
            "no_beads_directory (run bd init)"
        ));
    }

    #[test]
    fn is_missing_workspace_error_matches_no_active_beads_workspace_text() {
        assert!(is_missing_workspace_error(
            "No active beads workspace found. (check BEADS_DIR/worktree setup, or run 'bd init' to create a new database)"
        ));
    }

    #[test]
    fn is_missing_workspace_error_matches_bd_where_internal_message() {
        assert!(is_missing_workspace_error(
            "bd where returned no beads path"
        ));
    }

    #[test]
    fn is_missing_workspace_error_ignores_unrelated_errors() {
        assert!(!is_missing_workspace_error("bd not found (tried: bd)"));
        assert!(!is_missing_workspace_error(
            "failed to parse bd where output: expected value"
        ));
    }

    #[test]
    fn add_project_outcome_needs_init_serializes_with_camel_case_kind() {
        let outcome = AddProjectOutcome::NeedsInit {
            path: "/Users/jeanpfs/Code/bd-board".to_string(),
            suggested_prefix: "bd-board".to_string(),
        };
        let value = serde_json::to_value(&outcome).unwrap();
        assert_eq!(
            value,
            json!({
                "kind": "needsInit",
                "path": "/Users/jeanpfs/Code/bd-board",
                "suggestedPrefix": "bd-board",
            })
        );
    }

    #[test]
    fn add_project_outcome_registered_serializes_with_project_payload() {
        let outcome = AddProjectOutcome::Registered {
            project: Project {
                id: "bd-board".to_string(),
                name: "bd-board".to_string(),
                dir: "/Users/jeanpfs/Code/bd-board".to_string(),
                beads_path: "/Users/jeanpfs/Code/jeanpfs-ai/beads/bd-board/.beads".to_string(),
                prefix: Some("bd-board".to_string()),
                external: true,
                missing: false,
                error: None,
                counts: build_counts_from_groups(&[]),
            },
        };
        let value = serde_json::to_value(&outcome).unwrap();
        assert_eq!(
            value.get("kind").and_then(|v| v.as_str()),
            Some("registered")
        );
        assert!(value.get("project").and_then(|v| v.as_object()).is_some());
    }

    #[test]
    fn bd_error_message_real_no_beads_directory_payload_is_classifiable() {
        let stdout = r#"{"error":"no_beads_directory","message":"No active beads workspace found.","hint":"check BEADS_DIR/worktree setup, or run 'bd init' to create a new database","schema_version":1}"#;
        let stderr = "";
        let status = std::process::Command::new("false").output().unwrap().status;

        let result = bd_error_message(stdout, stderr, &status);
        assert!(is_missing_workspace_error(&result));
        assert!(result.contains("No active beads workspace found."));
    }

    #[test]
    fn parse_feed_line_dep_record_with_issue_and_target() {
        let line =
            r#"{"seq":7,"op":"dep_add","issue_id":"a","dep":{"kind":"blocks","target":"b"}}"#;
        let result = parse_feed_line(line);
        assert_eq!(
            result,
            Some(FeedLine::Record {
                seq: 7,
                issue_ids: vec!["a".to_string(), "b".to_string()]
            })
        );
    }

    #[test]
    fn parse_feed_line_truncation() {
        let line = r#"{"code":"events_journal_truncated","error":"journal was reset","floor":0,"head":100,"since":50}"#;
        let result = parse_feed_line(line);
        assert_eq!(result, Some(FeedLine::Truncated { head: 100 }));
    }

    #[test]
    fn parse_feed_line_note_returns_none() {
        let line = "note: the events journal is disabled";
        assert_eq!(parse_feed_line(line), None);
    }

    #[test]
    fn parse_feed_line_garbage_returns_none() {
        assert_eq!(parse_feed_line("not json at all"), None);
        assert_eq!(parse_feed_line(""), None);
        assert_eq!(parse_feed_line("   "), None);
    }

    #[test]
    fn drain_journal_disabled() {
        let mut exec = |_args: &[String]| -> Result<BdCapture, String> {
            Ok(BdCapture {
                bin: "bd".to_string(),
                stdout: "".to_string(),
                stderr: "note: the events journal is disabled for this workspace (enable with 'bd config set events-journal true'); …"
                    .to_string(),
                status: std::process::Command::new("true").output().unwrap().status,
            })
        };
        let outcome = drain_journal(&mut exec, 0);
        assert_eq!(outcome, DrainOutcome::Disabled);
    }

    #[test]
    fn drain_journal_pagination() {
        let mut call_count = 0;
        let mut calls: Vec<Vec<String>> = Vec::new();
        let mut exec = |args: &[String]| -> Result<BdCapture, String> {
            call_count += 1;
            calls.push(args.to_vec());
            let stdout = if call_count == 1 {
                (1..=1000)
                    .map(|i| {
                        serde_json::json!({
                            "seq": i,
                            "op": "create",
                            "issue_id": format!("id-{}", i),
                        })
                        .to_string()
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            } else if call_count == 2 {
                (1001..=1003)
                    .map(|i| {
                        serde_json::json!({
                            "seq": i,
                            "op": "update",
                            "issue_id": format!("id-{}", i),
                        })
                        .to_string()
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                String::new()
            };
            Ok(BdCapture {
                bin: "bd".to_string(),
                stdout,
                stderr: String::new(),
                status: std::process::Command::new("true").output().unwrap().status,
            })
        };
        let outcome = drain_journal(&mut exec, 0);
        assert_eq!(outcome, DrainOutcome::Ready(1003));
        assert_eq!(calls[1], tail_args(1000, Some(FEED_PAGE_SIZE), false));
    }

    #[test]
    fn drain_journal_truncated_head() {
        let mut exec = |_args: &[String]| -> Result<BdCapture, String> {
            Ok(BdCapture {
                bin: "bd".to_string(),
                stdout: r#"{"code":"events_journal_truncated","error":"reset","floor":0,"head":980,"since":0}"#
                    .to_string(),
                stderr: String::new(),
                status: std::process::Command::new("false").output().unwrap().status,
            })
        };
        let outcome = drain_journal(&mut exec, 0);
        assert_eq!(outcome, DrainOutcome::Ready(980));
    }

    #[test]
    fn drain_journal_unsupported() {
        let mut exec = |_args: &[String]| -> Result<BdCapture, String> {
            Ok(BdCapture {
                bin: "bd".to_string(),
                stdout: String::new(),
                stderr: "Error: unknown command \"events\" for \"bd\"".to_string(),
                status: std::process::Command::new("false").output().unwrap().status,
            })
        };
        let outcome = drain_journal(&mut exec, 0);
        match outcome {
            DrainOutcome::Unsupported(msg) => assert!(msg.contains("unknown command")),
            _ => panic!("expected Unsupported, got {:?}", outcome),
        }
    }

    #[test]
    fn drain_journal_stale_checkpoint() {
        let mut call_count = 0;
        let mut calls: Vec<Vec<String>> = Vec::new();
        let mut exec = |args: &[String]| -> Result<BdCapture, String> {
            call_count += 1;
            calls.push(args.to_vec());
            let stdout = String::new();
            Ok(BdCapture {
                bin: "bd".to_string(),
                stdout,
                stderr: String::new(),
                status: std::process::Command::new("true").output().unwrap().status,
            })
        };
        let outcome = drain_journal(&mut exec, 50);
        assert_eq!(outcome, DrainOutcome::Ready(0));
        assert_eq!(call_count, 3);
        assert_eq!(calls[0], tail_args(50, Some(FEED_PAGE_SIZE), false));
        assert_eq!(calls[1], tail_args(49, Some(1), false));
        assert_eq!(calls[2], tail_args(0, Some(FEED_PAGE_SIZE), false));
    }

    #[test]
    fn drain_journal_valid_checkpoint() {
        let mut call_count = 0;
        let mut exec = |_args: &[String]| -> Result<BdCapture, String> {
            call_count += 1;
            let stdout = if call_count == 1 {
                String::new()
            } else if call_count == 2 {
                serde_json::json!({
                    "seq": 50,
                    "op": "create",
                    "issue_id": "id-50",
                })
                .to_string()
            } else {
                String::new()
            };
            Ok(BdCapture {
                bin: "bd".to_string(),
                stdout,
                stderr: String::new(),
                status: std::process::Command::new("true").output().unwrap().status,
            })
        };
        let outcome = drain_journal(&mut exec, 50);
        assert_eq!(outcome, DrainOutcome::Ready(50));
        assert_eq!(call_count, 2);
    }

    #[test]
    fn bead_feed_message_change_serializes_correctly() {
        let msg = BeadFeedMessage::Change {
            seq: 5,
            issue_ids: vec!["x".to_string()],
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert_eq!(json, r#"{"type":"change","seq":5,"issueIds":["x"]}"#);
    }
}
