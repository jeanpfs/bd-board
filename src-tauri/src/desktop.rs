use crate::migration_gate::{self, MigrationGate};
use crate::registry::{self, RegistryEntry};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::collections::HashSet;
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
pub struct UnlinkedBead {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Serialize)]
pub struct DeletePlan {
    pub ids: Vec<String>,
    pub preview: String,
    pub unlinked: Vec<UnlinkedBead>,
}

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
    pub migration: Option<MigrationGate>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_at: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct BeadLink {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub direction: &'static str,
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
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub links: Vec<BeadLink>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub defer_until: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_minutes: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lease_expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heartbeat_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub close_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
}

#[derive(Serialize)]
pub struct BeadDetail {
    #[serde(flatten)]
    pub bead: Bead,
    pub dependencies: Vec<RelatedBead>,
    pub dependents: Vec<RelatedBead>,
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
    pub due: Option<String>,
    pub estimate: Option<i64>,
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

fn json_error_message(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if !trimmed.starts_with('{') {
        return None;
    }
    let json: Value = serde_json::from_str(trimmed).ok()?;
    let message = ["message", "error"]
        .iter()
        .filter_map(|key| json.get(*key).and_then(Value::as_str))
        .find(|s| !s.is_empty())?;
    let mut result = message.to_string();
    if let Some(hint) = json
        .get("hint")
        .and_then(Value::as_str)
        .filter(|h| !h.is_empty())
    {
        result.push_str(&format!(" ({})", hint));
    }
    Some(result)
}

fn bd_error_message(stdout: &str, stderr: &str, status: &std::process::ExitStatus) -> String {
    if let Some(message) = json_error_message(stdout).or_else(|| json_error_message(stderr)) {
        return message;
    }
    let stderr_trim = stderr.trim();
    if !stderr_trim.is_empty() {
        return format!("bd exited with status {}: {}", status, stderr_trim);
    }
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
        Err(bd_failure(&cap))
    }
}

/// Failed bd run: a migration gate is encoded into the error string (see migration_gate.rs).
fn bd_failure(cap: &BdCapture) -> String {
    let message = bd_error_message(&cap.stdout, &cap.stderr, &cap.status);
    let Some(gate) = migration_gate::parse_migration_gate(&cap.stdout, &cap.stderr) else {
        return message;
    };
    let detail = cap
        .stderr
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| line.starts_with("Error:"))
        .map(str::to_string)
        .unwrap_or(message);
    migration_gate::migration_gate_error(&gate, &detail)
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

/// Schedule and lifecycle text: bd can send empty strings for unset fields, which mean absent.
fn value_present_str(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
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

const BUILT_IN_STATUSES: [&str; 7] = [
    "open",
    "in_progress",
    "blocked",
    "deferred",
    "closed",
    "pinned",
    "hooked",
];
const STATUS_CATEGORIES: [&str; 5] = ["active", "wip", "done", "frozen", "unspecified"];

/// Category of a custom (non-built-in) status; `None` for built-ins.
fn status_category(status: &str, categories: &HashMap<String, String>) -> Option<String> {
    if BUILT_IN_STATUSES.contains(&status) {
        return None;
    }
    Some(
        categories
            .get(status)
            .cloned()
            .unwrap_or_else(|| "unspecified".to_string()),
    )
}

fn map_bead(value: &Value, categories: &HashMap<String, String>) -> Bead {
    let status = value_str(value, "status");
    Bead {
        id: value_str(value, "id"),
        title: value_str(value, "title"),
        description: value_opt_str(value, "description"),
        acceptance_criteria: value_opt_str(value, "acceptance_criteria"),
        design: value_opt_str(value, "design"),
        notes: value_opt_str(value, "notes"),
        status: status.clone(),
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
        links: Vec::new(),
        status_category: status_category(&status, categories),
        due_at: value_present_str(value, "due_at"),
        defer_until: value_present_str(value, "defer_until"),
        estimated_minutes: value_i64(value, "estimated_minutes"),
        started_at: value_present_str(value, "started_at"),
        lease_expires_at: value_present_str(value, "lease_expires_at"),
        heartbeat_at: value_present_str(value, "heartbeat_at"),
        close_reason: value_present_str(value, "close_reason"),
        external_ref: value_present_str(value, "external_ref"),
        created_by: value_present_str(value, "created_by"),
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
                migration: None,
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
                let (counts, migration) = project_counts(&dir_path);
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
                    migration,
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
                    migration: None,
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

fn status_categories(dir: &Path) -> HashMap<String, String> {
    let Ok(cap) = exec_bd(dir, &["statuses", "--json"]) else {
        return HashMap::new();
    };
    if !cap.status.success() {
        return HashMap::new();
    }
    serde_json::from_str::<Value>(cap.stdout.trim())
        .ok()
        .and_then(|json| {
            json.get("custom_statuses")
                .and_then(Value::as_array)
                .cloned()
        })
        .unwrap_or_default()
        .iter()
        .filter_map(|entry| {
            let name = entry.get("name").and_then(Value::as_str)?;
            let category = entry
                .get("category")
                .and_then(Value::as_str)
                .filter(|c| STATUS_CATEGORIES.contains(c))
                .unwrap_or("unspecified");
            Some((name.to_string(), category.to_string()))
        })
        .collect()
}

fn build_counts_from_groups(rows: &[Value], categories: &HashMap<String, String>) -> ProjectCounts {
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
            "open" | "pinned" => counts.open += n,
            "in_progress" | "hooked" => counts.in_progress += n,
            "blocked" => counts.blocked += n,
            "closed" => counts.closed += n,
            "deferred" => counts.deferred += n,
            other => match categories
                .get(other)
                .map(String::as_str)
                .unwrap_or("unspecified")
            {
                "wip" => counts.in_progress += n,
                "done" => counts.closed += n,
                "frozen" => counts.deferred += n,
                _ => counts.open += n,
            },
        }
    }

    counts
}

fn project_counts(dir: &Path) -> (ProjectCounts, Option<MigrationGate>) {
    let categories = status_categories(dir);
    let Ok(cap) = exec_bd(dir, &["count", "--by-status", "--json"]) else {
        return (build_counts_from_groups(&[], &categories), None);
    };
    // The gate is reported even when bd exits non-zero.
    let migration = migration_gate::parse_migration_gate(&cap.stdout, &cap.stderr);
    let groups = if cap.status.success() {
        serde_json::from_str::<Value>(cap.stdout.trim())
            .ok()
            .and_then(|v| v.get("groups").and_then(Value::as_array).cloned())
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    (build_counts_from_groups(&groups, &categories), migration)
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

/// Mirrors buildBeadGraph: links, parent and children derived from the raw rows.
fn build_bead_graph(raws: &[Value], categories: &HashMap<String, String>) -> Vec<Bead> {
    let mut beads: Vec<Bead> = raws.iter().map(|raw| map_bead(raw, categories)).collect();
    let known: HashSet<String> = beads.iter().map(|b| b.id.clone()).collect();
    let closed_gates: HashSet<String> = beads
        .iter()
        .filter(|b| b.issue_type == "gate" && b.status == "closed")
        .map(|b| b.id.clone())
        .collect();
    // A resolved gate no longer blocks; bd keeps the edge but drops the block.
    let edges: Vec<DependencyEdge> = dependency_edges(raws, &known)
        .into_iter()
        .filter(|e| !(e.kind == "blocks" && closed_gates.contains(&e.to)))
        .collect();

    let mut links: HashMap<String, Vec<BeadLink>> = HashMap::new();
    for edge in &edges {
        links.entry(edge.from.clone()).or_default().push(BeadLink {
            id: edge.to.clone(),
            kind: edge.kind.clone(),
            direction: "outgoing",
        });
        links.entry(edge.to.clone()).or_default().push(BeadLink {
            id: edge.from.clone(),
            kind: edge.kind.clone(),
            direction: "incoming",
        });
    }
    let parents = parents_of(raws, &edges);
    for bead in &mut beads {
        bead.links = links.remove(&bead.id).unwrap_or_default();
        if bead.parent.is_none() {
            bead.parent = parents.get(&bead.id).cloned();
        }
    }
    derive_children(beads)
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

/// `bd list` can hide gate issues; add the ones `bd gate list` reports.
fn merge_gate_rows(rows: &serde_json::Value, gates: &serde_json::Value) -> Vec<serde_json::Value> {
    let mut merged = rows.as_array().cloned().unwrap_or_default();
    let known: std::collections::HashSet<String> = merged
        .iter()
        .filter_map(|row| row.get("id").and_then(serde_json::Value::as_str))
        .map(String::from)
        .collect();
    merged.extend(
        gates
            .as_array()
            .into_iter()
            .flatten()
            .filter(|gate| {
                gate.get("id")
                    .and_then(serde_json::Value::as_str)
                    .is_some_and(|id| !known.contains(id))
            })
            .cloned(),
    );
    merged
}

fn list_beads_inner(project_id: &str) -> Result<Vec<Bead>, String> {
    let dir = resolve_dir(project_id)?;
    let raw = bd_json(&dir, build_list_beads_args())?;
    let gates = bd_json(&dir, build_list_gates_args())?;
    let categories = status_categories(&dir);
    let rows = merge_gate_rows(&raw, &gates);
    Ok(build_bead_graph(&rows, &categories))
}

fn build_show_bead_args(id: &str) -> Vec<String> {
    vec![
        "show".to_string(),
        id.to_string(),
        "--include-dependents".to_string(),
        "--json".to_string(),
    ]
}

fn map_related_bead(d: &Value) -> RelatedBead {
    RelatedBead {
        id: value_str(d, "id"),
        title: value_str(d, "title"),
        status: value_str(d, "status"),
        issue_type: value_str(d, "issue_type"),
        dependency_type: value_str(d, "dependency_type"),
        due_at: value_present_str(d, "due_at"),
    }
}

fn map_related_list(raw: &Value, key: &str) -> Vec<RelatedBead> {
    raw.get(key)
        .and_then(Value::as_array)
        .map(|items| items.iter().map(map_related_bead).collect())
        .unwrap_or_default()
}

fn get_bead_detail_inner(project_id: &str, id: &str) -> Result<BeadDetail, String> {
    let dir = resolve_dir(project_id)?;
    let raw_arr = bd_json(
        &dir,
        &build_show_bead_args(id)
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>(),
    )?;
    let raw_comments = bd_json(&dir, &["comments", id, "--json"]).ok();

    let raw = raw_arr
        .as_array()
        .and_then(|arr| arr.first())
        .cloned()
        .unwrap_or(Value::Object(Default::default()));
    let bead = map_bead(&raw, &HashMap::new());
    let dependencies = map_related_list(&raw, "dependencies");
    let dependents = map_related_list(&raw, "dependents");

    let comments = match raw_comments {
        Some(Value::Array(items)) => items.into_iter().map(|v| map_comment(&v)).collect(),
        _ => Vec::new(),
    };

    Ok(BeadDetail {
        bead,
        dependencies,
        dependents,
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
    if let Some(due) = &update.due {
        args.push("--due".to_string());
        args.push(due.clone());
    }
    if let Some(estimate) = update.estimate {
        args.push("--estimate".to_string());
        args.push(estimate.to_string());
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

fn build_list_beads_args() -> &'static [&'static str] {
    &["list", "--all", "--limit", "0", "--json"]
}

fn build_defer_args(id: &str, until: Option<&str>) -> Vec<String> {
    let mut args = vec!["defer".to_string(), id.to_string()];
    if let Some(until) = until.filter(|u| !u.is_empty()) {
        args.push("--until".to_string());
        args.push(until.to_string());
    }
    args
}

fn build_undefer_args(id: &str) -> Vec<String> {
    vec!["undefer".to_string(), id.to_string()]
}

fn defer_bead_inner(project_id: &str, id: &str, until: Option<&str>) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_defer_args(id, until))?;
    Ok(())
}

fn undefer_bead_inner(project_id: &str, id: &str) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_undefer_args(id))?;
    Ok(())
}

fn update_bead_inner(project_id: &str, id: &str, update: BeadUpdateInput) -> Result<(), String> {
    validate_bead_update(&update)?;
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

fn build_preview_delete_bead_args(ids: &[String]) -> Vec<String> {
    std::iter::once("delete".to_string())
        .chain(ids.iter().cloned())
        .collect()
}

fn build_delete_bead_args(ids: &[String]) -> Vec<String> {
    let mut args = build_preview_delete_bead_args(ids);
    args.push("--force".to_string());
    args
}

fn build_close_bead_args(id: &str, reason: Option<&str>, force: bool) -> Vec<String> {
    let mut args = vec!["close".to_string(), id.to_string()];
    if let Some(reason) = reason.filter(|r| !r.is_empty()) {
        args.push("--reason".to_string());
        args.push(reason.to_string());
    }
    if force {
        args.push("--force".to_string());
    }
    args
}

fn build_claim_args(id: &str, actor: Option<&str>) -> Result<Vec<String>, String> {
    let mut args = vec!["update".to_string(), id.to_string(), "--claim".to_string()];
    if let Some(actor) = actor.map(str::trim).filter(|a| !a.is_empty()) {
        if actor.starts_with('-') {
            return Err("actor is invalid".to_string());
        }
        args.push("--actor".to_string());
        args.push(actor.to_string());
    }
    Ok(args)
}

fn build_list_gates_args() -> &'static [&'static str] {
    &["gate", "list", "--all", "--json"]
}

fn build_stale_args(days: u32) -> Vec<String> {
    vec![
        "stale".to_string(),
        "--days".to_string(),
        days.to_string(),
        "--json".to_string(),
        "--limit".to_string(),
        "0".to_string(),
    ]
}

fn stale_days_checked(days: u32) -> Result<u32, String> {
    if (1..=365).contains(&days) {
        Ok(days)
    } else {
        Err("days must be a whole number from 1 to 365".to_string())
    }
}

fn build_resolve_gate_args(id: &str) -> Vec<String> {
    vec!["gate".to_string(), "resolve".to_string(), id.to_string()]
}

/// Reverts only leases already expired (`--older-than 0s`) for this bead.
fn build_reclaim_args(id: &str) -> Vec<String> {
    vec![
        "reclaim".to_string(),
        "--id".to_string(),
        id.to_string(),
        "--older-than".to_string(),
        "0s".to_string(),
        "--json".to_string(),
    ]
}

fn build_unclaim_args(id: &str, force: bool, actor: Option<&str>) -> Result<Vec<String>, String> {
    let mut args = vec!["unclaim".to_string(), id.to_string()];
    if force {
        args.push("--force".to_string());
    }
    if let Some(actor) = actor.map(str::trim).filter(|a| !a.is_empty()) {
        if actor.starts_with('-') {
            return Err("actor is invalid".to_string());
        }
        args.push("--actor".to_string());
        args.push(actor.to_string());
    }
    Ok(args)
}

const CONFIG_KEYS: [&str; 6] = [
    "claim.pools",
    "status.custom",
    "events-journal",
    "linear.api_key",
    "linear.team_id",
    "linear.project_id",
];
const CUSTOM_STATUS_CATEGORIES: [&str; 4] = ["active", "wip", "done", "frozen"];

/// The config keys the board may read or write; anything else is refused.
fn validate_config_key(key: &str) -> Result<(), String> {
    if CONFIG_KEYS.contains(&key) {
        Ok(())
    } else {
        Err("config key is not allowed".to_string())
    }
}

fn is_status_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

fn is_pool_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphanumeric())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '@' | '-'))
}

/// Linear team and project ids: a conservative charset, at most 128 characters.
fn is_linear_id(id: &str) -> bool {
    let mut chars = id.chars();
    id.len() <= 128
        && matches!(chars.next(), Some(c) if c.is_ascii_alphanumeric())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// `name` or `name:category`; a bare name is filed as `active`, bd's default.
fn is_custom_status_segment(segment: &str) -> bool {
    let (name, category) = match segment.split_once(':') {
        Some((name, category)) => (name, category),
        None => (segment, "active"),
    };
    is_status_name(name) && CUSTOM_STATUS_CATEGORIES.contains(&category)
}

fn validate_config_value(key: &str, value: &str) -> Result<(), String> {
    if value.starts_with('-') || value.contains(['\n', '\r']) {
        return Err("config value is invalid".to_string());
    }
    match key {
        "events-journal" if value != "true" && value != "false" => {
            Err("events-journal must be true or false".to_string())
        }
        "status.custom" if !value.trim().is_empty() => {
            if value
                .split(',')
                .all(|segment| is_custom_status_segment(segment.trim()))
            {
                Ok(())
            } else {
                Err("status.custom must list name or name:category entries".to_string())
            }
        }
        "claim.pools" if !value.trim().is_empty() => {
            if value.split(',').all(|pool| is_pool_name(pool.trim())) {
                Ok(())
            } else {
                Err("claim.pools names are invalid".to_string())
            }
        }
        "linear.api_key" if value.chars().any(char::is_whitespace) => {
            Err("linear.api_key must not contain whitespace".to_string())
        }
        "linear.team_id" | "linear.project_id" if !value.is_empty() && !is_linear_id(value) => {
            Err(format!("{key} is invalid"))
        }
        _ => Ok(()),
    }
}

fn build_set_config_args(key: &str, value: &str) -> Result<Vec<String>, String> {
    validate_config_key(key)?;
    validate_config_value(key, value)?;
    Ok(vec![
        "config".to_string(),
        "set".to_string(),
        key.to_string(),
        value.to_string(),
        "--json".to_string(),
    ])
}

fn build_get_config_args(key: &str) -> Result<Vec<String>, String> {
    validate_config_key(key)?;
    if key == "linear.api_key" {
        return Err("linear.api_key is write-only".to_string());
    }
    Ok(vec![
        "config".to_string(),
        "get".to_string(),
        key.to_string(),
        "--json".to_string(),
    ])
}

fn build_ready_explain_args() -> &'static [&'static str] {
    &["ready", "--explain", "--json", "--limit", "0"]
}

/// Mirrors the editor's relation kinds: each maps to the bd command that creates it.
fn build_add_relation_args(kind: &str, id: &str, target: &str) -> Result<Vec<String>, String> {
    let args: Vec<&str> = match kind {
        "blocked-by" => vec!["dep", "add", id, target],
        "blocks" => vec!["dep", "add", target, id],
        "relates-to" => vec!["dep", "relate", id, target],
        "duplicate-of" => vec!["duplicate", id, "--of", target],
        "supersedes" => vec!["supersede", target, "--with", id],
        other => return Err(format!("Unknown relation kind: {other}")),
    };
    Ok(args.into_iter().map(str::to_string).collect())
}

/// Removes an edge created by `build_add_relation_args`; duplicate-of and supersedes have no removal.
fn build_remove_relation_args(kind: &str, id: &str, target: &str) -> Result<Vec<String>, String> {
    let args: Vec<&str> = match kind {
        "blocked-by" => vec!["dep", "remove", id, target],
        "blocks" => vec!["dep", "remove", target, id],
        "relates-to" => vec!["dep", "unrelate", id, target],
        other => return Err(format!("Relation kind cannot be removed: {other}")),
    };
    Ok(args.into_iter().map(str::to_string).collect())
}

struct DependencyEdge {
    from: String,
    to: String,
    kind: String,
}

/// Mirrors parseDependencyEdges + collectEdges: deduped, restricted to known ids.
fn dependency_edges(raws: &[Value], known: &HashSet<String>) -> Vec<DependencyEdge> {
    let mut seen = HashSet::new();
    let mut edges = Vec::new();
    for raw in raws {
        let owner = value_str(raw, "id");
        let deps = raw
            .get("dependencies")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for entry in deps {
            let Some(to) = entry
                .get("depends_on_id")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
            else {
                continue;
            };
            let from = entry
                .get("issue_id")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| owner.clone());
            let kind = entry
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or("blocks")
                .to_string();
            if from.is_empty() || !known.contains(&from) || !known.contains(to) {
                continue;
            }
            if !seen.insert((from.clone(), to.to_string(), kind.clone())) {
                continue;
            }
            edges.push(DependencyEdge {
                from,
                to: to.to_string(),
                kind,
            });
        }
    }
    edges
}

/// Explicit `parent` wins; parent-child edges fill in the rest.
fn parents_of(raws: &[Value], edges: &[DependencyEdge]) -> HashMap<String, String> {
    let mut parents = HashMap::new();
    for raw in raws {
        if let Some(parent) = value_opt_str(raw, "parent").filter(|p| !p.is_empty()) {
            parents.insert(value_str(raw, "id"), parent);
        }
    }
    for edge in edges.iter().filter(|e| e.kind == "parent-child") {
        parents
            .entry(edge.from.clone())
            .or_insert_with(|| edge.to.clone());
    }
    parents
}

/// The bead plus its parent-child descendants, breadth-first, root first.
/// Never uses `--cascade`: it also follows blocks/related edges.
fn deletion_set(raws: &[Value], id: &str) -> Vec<String> {
    let known: HashSet<String> = raws.iter().map(|r| value_str(r, "id")).collect();
    let edges = dependency_edges(raws, &known);
    let parents = parents_of(raws, &edges);
    let mut children: HashMap<String, Vec<String>> = HashMap::new();
    for raw in raws {
        let child = value_str(raw, "id");
        if let Some(parent) = parents.get(&child) {
            children.entry(parent.clone()).or_default().push(child);
        }
    }
    let mut ids = vec![id.to_string()];
    let mut next = 0;
    while next < ids.len() {
        let current = ids[next].clone();
        next += 1;
        for child in children.get(&current).into_iter().flatten() {
            if !ids.contains(child) {
                ids.push(child.clone());
            }
        }
    }
    ids
}

/// Beads outside the deletion that depend on something inside it.
fn unlinked_dependents(raws: &[Value], ids: &[String]) -> Vec<UnlinkedBead> {
    let known: HashSet<String> = raws.iter().map(|r| value_str(r, "id")).collect();
    let edges = dependency_edges(raws, &known);
    let titles: HashMap<String, String> = raws
        .iter()
        .map(|r| (value_str(r, "id"), value_str(r, "title")))
        .collect();
    let deleting: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let mut seen = HashSet::new();
    let mut unlinked = Vec::new();
    for id in ids {
        for edge in edges
            .iter()
            .filter(|e| &e.to == id && !deleting.contains(e.from.as_str()))
        {
            if !seen.insert((edge.from.clone(), edge.kind.clone())) {
                continue;
            }
            let title = titles
                .get(&edge.from)
                .filter(|t| !t.is_empty())
                .cloned()
                .unwrap_or_else(|| edge.from.clone());
            unlinked.push(UnlinkedBead {
                id: edge.from.clone(),
                title,
                kind: edge.kind.clone(),
            });
        }
    }
    unlinked
}

/// Drops bd's CLI hints (the --cascade note and the "To proceed" command).
fn clean_delete_preview(text: &str) -> String {
    text.lines()
        .filter(|line| {
            !line.contains("has dependents not in deletion set") && !line.starts_with("To proceed")
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn plan_delete(dir: &Path, id: &str) -> Result<(Vec<Value>, Vec<String>), String> {
    let raws = bd_json(dir, build_list_beads_args())?
        .as_array()
        .cloned()
        .unwrap_or_default();
    if !raws.iter().any(|r| value_str(r, "id") == id) {
        return Err(format!("bead not found: {id}"));
    }
    let ids = deletion_set(&raws, id);
    Ok((raws, ids))
}

fn preview_delete_bead_inner(project_id: &str, id: &str) -> Result<DeletePlan, String> {
    let dir = resolve_dir(project_id)?;
    let (raws, ids) = plan_delete(&dir, id)?;
    let args = build_preview_delete_bead_args(&ids);
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let cap = exec_bd(&dir, &refs)?;
    // bd exits 1 when the preview lists dependents outside the deletion set.
    let is_preview = cap.status.code() == Some(1) && cap.stdout.contains("DELETE PREVIEW");
    if !cap.status.success() && !is_preview {
        return Err(bd_failure(&cap));
    }
    Ok(DeletePlan {
        preview: clean_delete_preview(&cap.stdout),
        unlinked: unlinked_dependents(&raws, &ids),
        ids,
    })
}

fn delete_bead_inner(project_id: &str, id: &str) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    plan_delete(&dir, id)
        .and_then(|(_, ids)| run_bd_mut(&dir, &build_delete_bead_args(&ids)))
        .map(|_| ())
        .map_err(|err| format!("Unable to delete bead. {err}"))
}

fn close_bead_inner(
    project_id: &str,
    id: &str,
    reason: Option<&str>,
    force: bool,
) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_close_bead_args(id, reason, force)).map(|_| ())
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BulkPatch {
    pub status: Option<String>,
    pub priority: Option<i64>,
    pub assignee: Option<String>,
    pub due: Option<String>,
    pub add_labels: Option<Vec<String>>,
}

/// Bead ids: an ASCII alphanumeric start, then alphanumerics, `_`, `.` or `-`,
/// within `max_len` bytes.
fn is_bd_token(value: &str, max_len: usize) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphanumeric())
        && value.len() <= max_len
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
}

/// bd label and issue-type names: non-empty, at most `max_chars` characters,
/// no comma or whitespace, no leading `-` (so bd cannot read them as flags).
fn is_bd_word(value: &str, max_chars: usize) -> bool {
    !value.is_empty()
        && value.chars().count() <= max_chars
        && !value.starts_with('-')
        && !value.chars().any(|c| c == ',' || c.is_whitespace())
}

fn validate_bead_update(update: &BeadUpdateInput) -> Result<(), String> {
    if let Some(labels) = &update.labels {
        if labels.iter().any(|label| !is_bd_word(label, 64)) {
            return Err("Label is invalid".to_string());
        }
    }
    if let Some(issue_type) = &update.issue_type {
        if !is_bd_word(issue_type, 40) {
            return Err("Type is invalid".to_string());
        }
    }
    Ok(())
}

fn validate_bulk_ids(ids: &[String]) -> Result<(), String> {
    if ids.is_empty() {
        return Err("Select at least one bead".to_string());
    }
    if ids.len() > 200 {
        return Err("Too many beads".to_string());
    }
    if ids.iter().any(|id| !is_bd_token(id, 160)) {
        return Err("Bead id is invalid".to_string());
    }
    Ok(())
}

/// Bead ids reach bd as positional args, so reject anything bd could read as a flag.
fn validate_bead_id(id: &str) -> Result<(), String> {
    if is_bd_token(id, 160) {
        Ok(())
    } else {
        Err("Bead id is invalid".to_string())
    }
}

/// `since` is an event sequence number; `limit` bounds one page of the journal.
fn validate_tail_request(since: i64, limit: i64) -> Result<(), String> {
    if since < 0 || !(1..=1000).contains(&limit) {
        return Err("Event window is invalid".to_string());
    }
    Ok(())
}

fn validate_bulk_patch(patch: &BulkPatch) -> Result<(), String> {
    let touched = patch.status.is_some()
        || patch.priority.is_some()
        || patch.assignee.is_some()
        || patch.due.is_some()
        || patch.add_labels.is_some();
    if !touched {
        return Err("No bead updates provided".to_string());
    }
    if let Some(status) = &patch.status {
        if status == "closed" || !matches!(status.as_str(), "open" | "in_progress" | "blocked") {
            return Err("Status is invalid".to_string());
        }
    }
    if let Some(priority) = patch.priority {
        if !(0..=4).contains(&priority) {
            return Err("Priority is invalid".to_string());
        }
    }
    if let Some(assignee) = &patch.assignee {
        if assignee.chars().count() > 120 || assignee.starts_with('-') {
            return Err("assignee is invalid".to_string());
        }
    }
    if let Some(due) = &patch.due {
        if due.chars().count() > 40 || due.starts_with('-') || due.contains(['\n', '\r']) {
            return Err("due is invalid".to_string());
        }
    }
    if let Some(labels) = &patch.add_labels {
        if labels.iter().any(|label| !is_bd_word(label, 64)) {
            return Err("Label is invalid".to_string());
        }
    }
    Ok(())
}

/// Ids come first so every flag applies to all of them.
fn build_update_many_args(ids: &[String], patch: &BulkPatch) -> Vec<String> {
    let mut args = vec!["update".to_string()];
    args.extend(ids.iter().cloned());
    if let Some(status) = &patch.status {
        args.push("--status".to_string());
        args.push(status.clone());
    }
    if let Some(priority) = patch.priority {
        args.push("--priority".to_string());
        args.push(priority.to_string());
    }
    if let Some(assignee) = &patch.assignee {
        args.push("--assignee".to_string());
        args.push(assignee.clone());
    }
    if let Some(due) = &patch.due {
        args.push("--due".to_string());
        args.push(due.clone());
    }
    for label in patch.add_labels.iter().flatten() {
        args.push("--add-label".to_string());
        args.push(label.clone());
    }
    args
}

fn build_close_many_args(ids: &[String], reason: Option<&str>, force: bool) -> Vec<String> {
    let mut args = vec!["close".to_string()];
    args.extend(ids.iter().cloned());
    if let Some(reason) = reason.filter(|r| !r.is_empty()) {
        args.push("--reason".to_string());
        args.push(reason.to_string());
    }
    if force {
        args.push("--force".to_string());
    }
    args
}

fn update_many_inner(project_id: &str, ids: &[String], patch: &BulkPatch) -> Result<(), String> {
    validate_bulk_ids(ids)?;
    validate_bulk_patch(patch)?;
    let args = build_update_many_args(ids, patch);
    if args.len() <= ids.len() + 1 {
        return Ok(());
    }
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &args)?;
    Ok(())
}

fn close_many_inner(
    project_id: &str,
    ids: &[String],
    reason: Option<&str>,
    force: bool,
) -> Result<(), String> {
    validate_bulk_ids(ids)?;
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_close_many_args(ids, reason, force)).map(|_| ())
}

#[tauri::command]
pub fn update_many(project_id: String, ids: Vec<String>, patch: BulkPatch) -> Result<(), String> {
    update_many_inner(&project_id, &ids, &patch)
}

#[tauri::command]
pub fn close_many(
    project_id: String,
    ids: Vec<String>,
    reason: Option<String>,
    force: bool,
) -> Result<(), String> {
    close_many_inner(&project_id, &ids, reason.as_deref(), force)
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TailEventsPage {
    stdout: String,
    disabled: bool,
}

/// One `events tail` run. A disabled journal exits 0 with a note on stderr.
/// Truncation can come with a non-zero exit, so the JSON error line in stdout
/// is accepted before the exit status.
fn tail_events_page(cap: &BdCapture) -> Result<TailEventsPage, String> {
    let disabled = cap.stderr.contains(JOURNAL_DISABLED_MARKER);
    if !cap.status.success() && !disabled && !cap.stdout.contains(TRUNCATED_CODE) {
        return Err(bd_failure(cap));
    }
    Ok(TailEventsPage {
        stdout: cap.stdout.clone(),
        disabled,
    })
}

fn tail_events_inner(project_id: &str, since: i64, limit: i64) -> Result<TailEventsPage, String> {
    let dir = resolve_dir(project_id)?;
    let limit = usize::try_from(limit).map_err(|_| "limit is invalid".to_string())?;
    let args = tail_args(since, Some(limit), false);
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let cap = exec_bd(&dir, &refs)?;
    tail_events_page(&cap)
}

fn claim_bead_inner(project_id: &str, id: &str, actor: Option<&str>) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_claim_args(id, actor)?).map(|_| ())
}

fn stale_beads_inner(project_id: &str, days: u32) -> Result<Vec<Bead>, String> {
    let days = stale_days_checked(days)?;
    let dir = resolve_dir(project_id)?;
    let owned = build_stale_args(days);
    let args: Vec<&str> = owned.iter().map(String::as_str).collect();
    let raw = bd_json(&dir, &args)?;
    let categories = status_categories(&dir);
    Ok(raw
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|value| map_bead(&value, &categories))
        .collect())
}

fn resolve_gate_inner(project_id: &str, id: &str) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_resolve_gate_args(id)).map(|_| ())
}

/// Number of beads `bd reclaim --json` reverted (`{"count":0,...}` when none).
fn parse_reclaim_count(stdout: &str) -> Result<u64, String> {
    serde_json::from_str::<serde_json::Value>(stdout.trim())
        .ok()
        .and_then(|value| value.get("count").and_then(serde_json::Value::as_u64))
        .ok_or_else(|| "Unexpected output from bd reclaim".to_string())
}

fn reclaim_bead_inner(project_id: &str, id: &str) -> Result<u64, String> {
    let dir = resolve_dir(project_id)?;
    parse_reclaim_count(&run_bd_mut(&dir, &build_reclaim_args(id))?)
}

fn unclaim_bead_inner(
    project_id: &str,
    id: &str,
    force: bool,
    actor: Option<&str>,
) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_unclaim_args(id, force, actor)?).map(|_| ())
}

/// The config value as text; an unset key reads as the empty string.
fn get_config_inner(project_id: &str, key: &str) -> Result<String, String> {
    let args = build_get_config_args(key)?;
    let dir = resolve_dir(project_id)?;
    let raw = run_bd_mut(&dir, &args)?;
    let value: Value = serde_json::from_str(raw.trim()).map_err(|err| err.to_string())?;
    Ok(value
        .get("value")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string())
}

fn set_config_inner(project_id: &str, key: &str, value: &str) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_set_config_args(key, value)?)?;
    Ok(())
}

/// Shared views list key: the only kv key the board reads or writes.
const VIEWS_KV_KEY: &str = "bd-board.views";
const QUERY_MAX_LEN: usize = 500;

fn validate_query_text(expr: &str) -> Result<(), String> {
    if expr.trim().is_empty() {
        return Err("Query is required.".to_string());
    }
    if expr.starts_with('-') || expr.contains(['\n', '\r']) {
        return Err("query is invalid".to_string());
    }
    if expr.chars().count() > QUERY_MAX_LEN {
        return Err("Query is too long.".to_string());
    }
    Ok(())
}

fn build_query_args(expr: &str) -> Result<Vec<String>, String> {
    validate_query_text(expr)?;
    Ok(vec![
        "query".to_string(),
        expr.to_string(),
        "--json".to_string(),
        "--limit".to_string(),
        "0".to_string(),
        "--all".to_string(),
    ])
}

fn build_parse_query_args(expr: &str) -> Result<Vec<String>, String> {
    validate_query_text(expr)?;
    Ok(vec![
        "query".to_string(),
        expr.to_string(),
        "--parse-only".to_string(),
    ])
}

fn validate_kv_key(key: &str) -> Result<(), String> {
    if key == VIEWS_KV_KEY {
        Ok(())
    } else {
        Err("kv key is not allowed".to_string())
    }
}

fn build_kv_get_args(key: &str) -> Result<Vec<String>, String> {
    validate_kv_key(key)?;
    Ok(vec![
        "kv".to_string(),
        "get".to_string(),
        key.to_string(),
        "--json".to_string(),
    ])
}

fn build_kv_set_args(key: &str, value: &str) -> Result<Vec<String>, String> {
    validate_kv_key(key)?;
    if value.len() > 200_000 || serde_json::from_str::<Vec<Value>>(value).is_err() {
        return Err("Shared views value is invalid".to_string());
    }
    Ok(vec![
        "kv".to_string(),
        "set".to_string(),
        key.to_string(),
        value.to_string(),
        "--json".to_string(),
    ])
}

fn query_beads_inner(project_id: &str, expr: &str) -> Result<Vec<Bead>, String> {
    let dir = resolve_dir(project_id)?;
    let args = build_query_args(expr)?;
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let rows = bd_json(&dir, &refs)?.as_array().cloned().unwrap_or_default();
    let categories = status_categories(&dir);
    Ok(build_bead_graph(&rows, &categories))
}

fn validate_query_inner(project_id: &str, expr: &str) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_parse_query_args(expr)?)?;
    Ok(())
}

/// The kv value, or None when the key is unset (bd exits 1 with `found: false`).
fn kv_get_inner(project_id: &str, key: &str) -> Result<Option<String>, String> {
    let args = build_kv_get_args(key)?;
    let dir = resolve_dir(project_id)?;
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let cap = exec_bd(&dir, &refs)?;
    let parsed: Option<Value> = serde_json::from_str(cap.stdout.trim()).ok();
    if cap.status.success() {
        let value = parsed.ok_or_else(|| "Unexpected output from bd kv get".to_string())?;
        return Ok(value.get("value").and_then(Value::as_str).map(str::to_string));
    }
    if parsed.as_ref().and_then(|v| v.get("found")) == Some(&Value::Bool(false)) {
        return Ok(None);
    }
    Err(bd_failure(&cap))
}

fn kv_set_inner(project_id: &str, key: &str, value: &str) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_kv_set_args(key, value)?)?;
    Ok(())
}

fn ready_explain_inner(project_id: &str) -> Result<Value, String> {
    let dir = resolve_dir(project_id)?;
    bd_json(&dir, build_ready_explain_args())
}

fn build_linear_sync_args(
    direction: &str,
    relations: bool,
    dry_run: bool,
) -> Result<Vec<String>, String> {
    let mut args = vec!["linear".to_string(), "sync".to_string()];
    match direction {
        "pull" => args.push("--pull".to_string()),
        "push" => args.push("--push".to_string()),
        "both" => {}
        _ => return Err("linear direction is not allowed".to_string()),
    }
    if relations {
        args.push("--relations".to_string());
    }
    if dry_run {
        args.push("--dry-run".to_string());
    }
    Ok(args)
}

fn linear_status_inner(project_id: &str) -> Result<Value, String> {
    let dir = resolve_dir(project_id)?;
    bd_json(&dir, &["linear", "status", "--json"])
}

/// Runs `bd linear sync`; a non-zero exit is returned with its output, not as an error.
fn linear_sync_inner(
    project_id: &str,
    direction: &str,
    relations: bool,
    dry_run: bool,
) -> Result<Value, String> {
    let dir = resolve_dir(project_id)?;
    let args = build_linear_sync_args(direction, relations, dry_run)?;
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let capture = exec_bd(&dir, &refs)?;
    let output = [capture.stdout.trim(), capture.stderr.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(serde_json::json!({
        "output": output,
        "exitCode": capture.status.code().unwrap_or(-1),
    }))
}

fn add_relation_inner(project_id: &str, id: &str, kind: &str, target: &str) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_add_relation_args(kind, id, target)?).map(|_| ())
}

fn remove_relation_inner(
    project_id: &str,
    id: &str,
    kind: &str,
    target: &str,
) -> Result<(), String> {
    let dir = resolve_dir(project_id)?;
    run_bd_mut(&dir, &build_remove_relation_args(kind, id, target)?).map(|_| ())
}

fn build_create_bead_args(
    title: &str,
    description: Option<&str>,
    kind: Option<&str>,
    parent: Option<&str>,
    labels: &[String],
) -> Vec<String> {
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
    if !labels.is_empty() {
        args.push("--labels".to_string());
        args.push(labels.join(","));
    }
    args
}

fn create_bead_inner(
    project_id: &str,
    title: &str,
    description: Option<&str>,
    kind: Option<&str>,
    parent: Option<&str>,
    labels: &[String],
) -> Result<String, String> {
    let dir = resolve_dir(project_id)?;
    let out = run_bd_mut(
        &dir,
        &build_create_bead_args(title, description, kind, parent, labels),
    )?;
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
pub fn preview_delete_bead(project_id: String, id: String) -> Result<DeletePlan, String> {
    preview_delete_bead_inner(&project_id, &id)
}

#[tauri::command]
pub fn close_bead(
    project_id: String,
    id: String,
    reason: Option<String>,
    force: bool,
) -> Result<(), String> {
    close_bead_inner(&project_id, &id, reason.as_deref(), force)
}

#[tauri::command]
pub fn tail_events(project_id: String, since: i64, limit: i64) -> Result<TailEventsPage, String> {
    validate_tail_request(since, limit)?;
    tail_events_inner(&project_id, since, limit)
}

#[tauri::command]
pub fn claim_bead(project_id: String, id: String, actor: Option<String>) -> Result<(), String> {
    validate_bead_id(&id)?;
    claim_bead_inner(&project_id, &id, actor.as_deref())
}

#[tauri::command]
pub fn stale_beads(project_id: String, days: u32) -> Result<Vec<Bead>, String> {
    stale_beads_inner(&project_id, days)
}

#[tauri::command]
pub fn resolve_gate(project_id: String, id: String) -> Result<(), String> {
    validate_bead_id(&id)?;
    resolve_gate_inner(&project_id, &id)
}

#[tauri::command]
pub fn reclaim_bead(project_id: String, id: String) -> Result<u64, String> {
    validate_bead_id(&id)?;
    reclaim_bead_inner(&project_id, &id)
}

#[tauri::command]
pub fn unclaim_bead(
    project_id: String,
    id: String,
    force: bool,
    actor: Option<String>,
) -> Result<(), String> {
    validate_bead_id(&id)?;
    unclaim_bead_inner(&project_id, &id, force, actor.as_deref())
}

#[tauri::command]
pub fn set_config(project_id: String, key: String, value: String) -> Result<(), String> {
    set_config_inner(&project_id, &key, &value)
}

#[tauri::command]
pub fn get_config(project_id: String, key: String) -> Result<String, String> {
    get_config_inner(&project_id, &key)
}

#[tauri::command]
pub fn query_beads(project_id: String, query: String) -> Result<Vec<Bead>, String> {
    query_beads_inner(&project_id, &query)
}

#[tauri::command]
pub fn validate_query(project_id: String, query: String) -> Result<(), String> {
    validate_query_inner(&project_id, &query)
}

#[tauri::command]
pub fn kv_get(project_id: String, key: String) -> Result<Option<String>, String> {
    kv_get_inner(&project_id, &key)
}

#[tauri::command]
pub fn kv_set(project_id: String, key: String, value: String) -> Result<(), String> {
    kv_set_inner(&project_id, &key, &value)
}

#[tauri::command]
pub fn ready_explain(project_id: String) -> Result<Value, String> {
    ready_explain_inner(&project_id)
}

#[tauri::command]
pub fn linear_status(project_id: String) -> Result<Value, String> {
    linear_status_inner(&project_id)
}

#[tauri::command]
pub fn linear_sync(
    project_id: String,
    direction: String,
    relations: bool,
    dry_run: bool,
) -> Result<Value, String> {
    linear_sync_inner(&project_id, &direction, relations, dry_run)
}

#[tauri::command]
pub fn add_relation(
    project_id: String,
    id: String,
    kind: String,
    target: String,
) -> Result<(), String> {
    validate_bead_id(&id)?;
    validate_bead_id(&target)?;
    add_relation_inner(&project_id, &id, &kind, &target)
}

#[tauri::command]
pub fn remove_relation(
    project_id: String,
    id: String,
    kind: String,
    target: String,
) -> Result<(), String> {
    validate_bead_id(&id)?;
    validate_bead_id(&target)?;
    remove_relation_inner(&project_id, &id, &kind, &target)
}

#[tauri::command]
pub fn defer_bead(project_id: String, id: String, until: Option<String>) -> Result<(), String> {
    validate_bead_id(&id)?;
    defer_bead_inner(&project_id, &id, until.as_deref())
}

#[tauri::command]
pub fn undefer_bead(project_id: String, id: String) -> Result<(), String> {
    validate_bead_id(&id)?;
    undefer_bead_inner(&project_id, &id)
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
    labels: Option<Vec<String>>,
) -> Result<String, String> {
    create_bead_inner(
        &project_id,
        &title,
        description.as_deref(),
        r#type.as_deref(),
        parent.as_deref(),
        &labels.unwrap_or_default(),
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
        project: Box<Project>,
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
            let (counts, migration) = project_counts(&dir_path);

            Ok(AddProjectOutcome::Registered {
                project: Box::new(Project {
                    id: entry.id.clone(),
                    name: entry.label.clone(),
                    dir: entry.path,
                    beads_path: location.beads_path,
                    prefix: location.prefix,
                    external: location.external,
                    missing: false,
                    error: None,
                    counts,
                    migration,
                }),
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
            let (counts, migration) = project_counts(&dir_path);
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
                migration,
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
    let (counts, migration) = project_counts(&dir_path);

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
        migration,
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
    fn stale_args_ask_for_json_with_no_row_cap() {
        assert_eq!(
            build_stale_args(10),
            vec!["stale", "--days", "10", "--json", "--limit", "0"]
        );
    }

    #[test]
    fn stale_days_must_be_one_to_365() {
        assert!(stale_days_checked(0).is_err());
        assert!(stale_days_checked(1).is_ok());
        assert!(stale_days_checked(365).is_ok());
        assert!(stale_days_checked(366).is_err());
    }

    #[test]
    fn set_config_args_writes_value_and_keeps_empty_value() {
        assert_eq!(
            build_set_config_args("claim.pools", "a,b").unwrap(),
            vec!["config", "set", "claim.pools", "a,b", "--json"]
        );
        assert_eq!(
            build_set_config_args("claim.pools", "").unwrap(),
            vec!["config", "set", "claim.pools", "", "--json"]
        );
    }

    #[test]
    fn set_config_args_rejects_flag_like_key() {
        assert!(build_set_config_args("--force", "x").is_err());
    }

    #[test]
    fn query_args_return_every_match_and_reject_flags() {
        assert_eq!(
            build_query_args("type=bug").unwrap(),
            vec!["query", "type=bug", "--json", "--limit", "0", "--all"]
        );
        assert_eq!(
            build_parse_query_args("type=bug").unwrap(),
            vec!["query", "type=bug", "--parse-only"]
        );
        assert!(build_query_args("-all").is_err());
        assert!(build_query_args("a\nb").is_err());
        assert!(build_query_args("   ").is_err());
    }

    #[test]
    fn kv_args_allow_only_the_views_key() {
        assert_eq!(
            build_kv_get_args(VIEWS_KV_KEY).unwrap(),
            vec!["kv", "get", VIEWS_KV_KEY, "--json"]
        );
        assert_eq!(
            build_kv_set_args(VIEWS_KV_KEY, "[]").unwrap(),
            vec!["kv", "set", VIEWS_KV_KEY, "[]", "--json"]
        );
        assert!(build_kv_get_args("other.key").is_err());
        assert!(build_kv_set_args(VIEWS_KV_KEY, "{}").is_err());
    }

    #[test]
    fn linear_sync_args_cover_each_direction_and_flags() {
        assert_eq!(
            build_linear_sync_args("both", false, false).unwrap(),
            vec!["linear", "sync"]
        );
        assert_eq!(
            build_linear_sync_args("pull", false, false).unwrap(),
            vec!["linear", "sync", "--pull"]
        );
        assert_eq!(
            build_linear_sync_args("push", true, false).unwrap(),
            vec!["linear", "sync", "--push", "--relations"]
        );
        assert_eq!(
            build_linear_sync_args("both", true, true).unwrap(),
            vec!["linear", "sync", "--relations", "--dry-run"]
        );
    }

    #[test]
    fn linear_sync_args_reject_unknown_direction() {
        assert!(build_linear_sync_args("sideways", false, false).is_err());
    }

    #[test]
    fn get_config_refuses_linear_api_key() {
        assert!(build_get_config_args("linear.api_key").is_err());
        assert!(build_get_config_args("linear.team_id").is_ok());
    }

    #[test]
    fn linear_api_key_rejects_whitespace_and_newlines() {
        assert!(build_set_config_args("linear.api_key", "lin api").is_err());
        assert!(build_set_config_args("linear.api_key", "lin\nkey").is_err());
        assert!(build_set_config_args("linear.api_key", "-lin").is_err());
        assert!(build_set_config_args("linear.api_key", "lin_api_abc").is_ok());
        assert!(build_set_config_args("linear.api_key", "").is_ok());
    }

    #[test]
    fn linear_ids_use_conservative_charset() {
        assert!(build_set_config_args("linear.team_id", "BIL").is_ok());
        assert!(build_set_config_args("linear.project_id", "f1e2-d3c4.b5_a6").is_ok());
        assert!(build_set_config_args("linear.team_id", "a b").is_err());
        assert!(build_set_config_args("linear.team_id", "-BIL").is_err());
        assert!(build_set_config_args("linear.project_id", "a/b").is_err());
        assert!(build_set_config_args("linear.team_id", "").is_ok());
    }

    #[test]
    fn config_args_refuse_keys_outside_the_allowlist() {
        assert!(build_set_config_args("sync.remote", "x").is_err());
        assert!(build_get_config_args("sync.remote").is_err());
        assert!(build_get_config_args("status.custom").is_ok());
    }

    #[test]
    fn config_args_refuse_flag_like_values() {
        assert!(build_set_config_args("claim.pools", "--force").is_err());
        assert!(build_set_config_args("status.custom", "-x:wip").is_err());
    }

    #[test]
    fn events_journal_accepts_only_true_or_false() {
        assert!(build_set_config_args("events-journal", "true").is_ok());
        assert!(build_set_config_args("events-journal", "yes").is_err());
    }

    #[test]
    fn status_custom_checks_names_and_categories() {
        assert!(build_set_config_args("status.custom", "qa,in_review:wip").is_ok());
        assert!(build_set_config_args("status.custom", "Bad Name:wip").is_err());
        assert!(build_set_config_args("status.custom", "qa:nope").is_err());
        assert!(build_set_config_args("status.custom", "qa,,ok").is_err());
    }

    #[test]
    fn claim_pools_checks_names() {
        assert!(build_set_config_args("claim.pools", "maya, ines-2").is_ok());
        assert!(build_set_config_args("claim.pools", "bad name").is_err());
    }

    #[test]
    fn tail_args_reads_json_from_cursor_with_limit() {
        assert_eq!(
            tail_args(7, Some(50), false),
            ["events", "tail", "--json", "--since", "7", "--limit", "50"]
        );
    }

    fn tail_capture(exit_ok: bool, stdout: &str, stderr: &str) -> BdCapture {
        let program = if exit_ok { "true" } else { "false" };
        BdCapture {
            bin: "bd".to_string(),
            stdout: stdout.to_string(),
            stderr: stderr.to_string(),
            status: std::process::Command::new(program).output().unwrap().status,
        }
    }

    #[test]
    fn tail_events_page_disabled_note_with_exit_zero_and_empty_stdout() {
        let cap = tail_capture(
            true,
            "",
            "note: the events journal is disabled for this workspace",
        );
        assert_eq!(
            tail_events_page(&cap),
            Ok(TailEventsPage {
                stdout: String::new(),
                disabled: true,
            })
        );
    }

    #[test]
    fn tail_events_page_disabled_keeps_records_printed_with_the_note() {
        let record = r#"{"seq":3,"ts":"2026-11-10T09:00:00Z","op":"create","issue_id":"x-1"}"#;
        let cap = tail_capture(true, record, "note: the events journal is disabled");
        assert_eq!(
            tail_events_page(&cap),
            Ok(TailEventsPage {
                stdout: record.to_string(),
                disabled: true,
            })
        );
    }

    #[test]
    fn tail_events_page_truncation_with_nonzero_exit_is_a_page() {
        let line = r#"{"code":"events_journal_truncated","error":"journal truncated","floor":10,"head":100,"since":5}"#;
        let cap = tail_capture(false, line, "");
        assert_eq!(
            tail_events_page(&cap),
            Ok(TailEventsPage {
                stdout: line.to_string(),
                disabled: false,
            })
        );
    }

    #[test]
    fn tail_events_page_failure_without_marker_is_an_error() {
        let cap = tail_capture(false, "", "boom");
        assert!(tail_events_page(&cap).is_err());
    }

    #[test]
    fn build_counts_from_groups_maps_bd_count_by_status_groups() {
        let rows = vec![
            json!({"group": "open", "count": 16}),
            json!({"group": "blocked", "count": 9}),
        ];
        let counts = build_counts_from_groups(&rows, &HashMap::new());
        assert_eq!(counts.open, 16);
        assert_eq!(counts.blocked, 9);
        assert_eq!(counts.in_progress, 0);
        assert_eq!(counts.closed, 0);
        assert_eq!(counts.deferred, 0);
        assert_eq!(counts.total, 25);
    }

    #[test]
    fn build_counts_from_groups_handles_empty_groups() {
        let counts = build_counts_from_groups(&[], &HashMap::new());
        assert_eq!(counts.total, 0);
        assert_eq!(counts.open, 0);
    }

    #[test]
    fn build_counts_from_groups_folds_hooked_into_in_progress() {
        let rows = vec![json!({"group": "hooked", "count": 3})];
        let counts = build_counts_from_groups(&rows, &HashMap::new());
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
            ..Default::default()
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
    fn delete_and_close_args_never_cascade() {
        let ids = vec!["bd-board-a2k".to_string(), "bd-board-b3m".to_string()];
        assert_eq!(
            build_preview_delete_bead_args(&ids),
            vec!["delete", "bd-board-a2k", "bd-board-b3m"]
        );
        assert_eq!(
            build_delete_bead_args(&ids),
            vec!["delete", "bd-board-a2k", "bd-board-b3m", "--force"]
        );
        assert_eq!(
            build_close_bead_args("bd-board-a2k", Some("done"), true),
            vec!["close", "bd-board-a2k", "--reason", "done", "--force"]
        );
    }

    #[test]
    fn bulk_update_args_put_every_id_before_the_flags() {
        let ids = vec!["bd-a1".to_string(), "bd-a2".to_string()];
        let patch = BulkPatch {
            status: Some("in_progress".to_string()),
            priority: Some(1),
            assignee: Some(String::new()),
            due: None,
            add_labels: Some(vec!["ui".to_string(), "pdf".to_string()]),
        };
        assert_eq!(
            build_update_many_args(&ids, &patch),
            vec![
                "update",
                "bd-a1",
                "bd-a2",
                "--status",
                "in_progress",
                "--priority",
                "1",
                "--assignee",
                "",
                "--add-label",
                "ui",
                "--add-label",
                "pdf",
            ]
        );
    }

    #[test]
    fn bulk_input_rejects_empty_and_unsafe_values() {
        let too_many: Vec<String> = (0..201).map(|i| format!("bd-{i}")).collect();
        assert_eq!(validate_bulk_ids(&[]), Err("Select at least one bead".to_string()));
        assert_eq!(validate_bulk_ids(&too_many), Err("Too many beads".to_string()));
        assert_eq!(
            validate_bulk_ids(&["--force".to_string()]),
            Err("Bead id is invalid".to_string())
        );
        assert!(validate_bulk_ids(&["bd-a1".to_string()]).is_ok());

        assert_eq!(
            validate_bulk_patch(&BulkPatch::default()),
            Err("No bead updates provided".to_string())
        );
        let closed = BulkPatch {
            status: Some("closed".to_string()),
            ..Default::default()
        };
        assert_eq!(validate_bulk_patch(&closed), Err("Status is invalid".to_string()));
        let high = BulkPatch {
            priority: Some(5),
            ..Default::default()
        };
        assert_eq!(validate_bulk_patch(&high), Err("Priority is invalid".to_string()));
        let flag_assignee = BulkPatch {
            assignee: Some("--force".to_string()),
            ..Default::default()
        };
        assert_eq!(
            validate_bulk_patch(&flag_assignee),
            Err("assignee is invalid".to_string())
        );
        let bad_label = BulkPatch {
            add_labels: Some(vec!["bad label".to_string()]),
            ..Default::default()
        };
        assert_eq!(validate_bulk_patch(&bad_label), Err("Label is invalid".to_string()));
    }

    #[test]
    fn bead_id_and_tail_guards_reject_flags_and_out_of_range_windows() {
        assert!(validate_bead_id("bd-a2k").is_ok());
        assert_eq!(validate_bead_id("--force"), Err("Bead id is invalid".to_string()));
        assert_eq!(validate_bead_id(""), Err("Bead id is invalid".to_string()));
        assert!(validate_tail_request(0, 1).is_ok());
        assert!(validate_tail_request(5, 1000).is_ok());
        assert_eq!(validate_tail_request(-1, 10), Err("Event window is invalid".to_string()));
        assert_eq!(validate_tail_request(0, 0), Err("Event window is invalid".to_string()));
        assert_eq!(validate_tail_request(0, 1001), Err("Event window is invalid".to_string()));
    }

    #[test]
    fn bd_word_rule_accepts_bd_labels_and_rejects_flags_and_split_values() {
        assert!(is_bd_word("provides:x", 64));
        assert!(is_bd_word("ui", 64));
        assert!(is_bd_word(&"a".repeat(64), 64));
        assert!(!is_bd_word(&"a".repeat(65), 64));
        assert!(!is_bd_word("", 64));
        assert!(!is_bd_word("a,b", 64));
        assert!(!is_bd_word("bad label", 64));
        assert!(!is_bd_word("-x", 64));
    }

    #[test]
    fn update_validation_accepts_bd_native_labels_and_custom_types() {
        let update = BeadUpdateInput {
            labels: Some(vec!["provides:x".to_string()]),
            issue_type: Some("spike".to_string()),
            ..Default::default()
        };
        assert_eq!(validate_bead_update(&update), Ok(()));
        let custom = BeadUpdateInput {
            issue_type: Some("research-2".to_string()),
            ..Default::default()
        };
        assert_eq!(validate_bead_update(&custom), Ok(()));
    }

    #[test]
    fn update_validation_rejects_flag_like_types_and_split_labels() {
        let flag_type = BeadUpdateInput {
            issue_type: Some("-bug".to_string()),
            ..Default::default()
        };
        assert_eq!(
            validate_bead_update(&flag_type),
            Err("Type is invalid".to_string())
        );
        let split = BeadUpdateInput {
            labels: Some(vec!["a,b".to_string()]),
            ..Default::default()
        };
        assert_eq!(
            validate_bead_update(&split),
            Err("Label is invalid".to_string())
        );
    }

    #[test]
    fn bulk_close_args_match_the_bd_cli() {
        let ids = vec!["bd-a1".to_string(), "bd-a2".to_string()];
        assert_eq!(
            build_close_many_args(&ids, None, false),
            vec!["close", "bd-a1", "bd-a2"]
        );
        assert_eq!(
            build_close_many_args(&ids, Some("done"), true),
            vec!["close", "bd-a1", "bd-a2", "--reason", "done", "--force"]
        );
    }

    #[test]
    fn lease_and_gate_args_match_the_bd_cli() {
        assert_eq!(
            build_list_gates_args(),
            vec!["gate", "list", "--all", "--json"]
        );
        assert_eq!(build_resolve_gate_args("g1"), vec!["gate", "resolve", "g1"]);
        let merged = merge_gate_rows(
            &serde_json::json!([{"id": "a"}, {"id": "g1"}]),
            &serde_json::json!([{"id": "g1"}, {"id": "g2"}]),
        );
        let ids: Vec<&str> = merged.iter().filter_map(|row| row["id"].as_str()).collect();
        assert_eq!(ids, vec!["a", "g1", "g2"]);
        assert_eq!(
            build_reclaim_args("bd-board-a2k"),
            vec![
                "reclaim",
                "--id",
                "bd-board-a2k",
                "--older-than",
                "0s",
                "--json"
            ]
        );
        assert_eq!(
            parse_reclaim_count(r#"{"count":0,"reclaimed":null,"schema_version":1}"#),
            Ok(0)
        );
        assert_eq!(parse_reclaim_count(r#"{"count":2}"#), Ok(2));
        assert!(parse_reclaim_count("✓ done").is_err());
        assert_eq!(
            build_get_config_args("claim.pools").unwrap(),
            vec!["config", "get", "claim.pools", "--json"]
        );
    }

    #[test]
    fn unclaim_args_force_and_actor_are_optional() {
        assert_eq!(
            build_unclaim_args("bd-board-a2k", false, None).unwrap(),
            vec!["unclaim", "bd-board-a2k"]
        );
        assert_eq!(
            build_unclaim_args("bd-board-a2k", true, Some("maya")).unwrap(),
            vec!["unclaim", "bd-board-a2k", "--force", "--actor", "maya"]
        );
        assert_eq!(
            build_unclaim_args("bd-board-a2k", false, Some("--force")).unwrap_err(),
            "actor is invalid"
        );
    }

    #[test]
    fn claim_args_add_the_actor_only_when_known() {
        assert_eq!(
            build_claim_args("bd-board-a2k", None).unwrap(),
            vec!["update", "bd-board-a2k", "--claim"]
        );
        assert_eq!(
            build_claim_args("bd-board-a2k", Some("maya")).unwrap(),
            vec!["update", "bd-board-a2k", "--claim", "--actor", "maya"]
        );
        assert_eq!(
            build_claim_args("bd-board-a2k", Some("  maya Chen  ")).unwrap(),
            vec!["update", "bd-board-a2k", "--claim", "--actor", "maya Chen"]
        );
        assert_eq!(build_claim_args("bd-board-a2k", Some("")).unwrap().len(), 3);
        assert_eq!(
            build_claim_args("bd-board-a2k", Some("  ")).unwrap().len(),
            3
        );
        assert!(build_claim_args("bd-board-a2k", Some("--force")).is_err());
        assert_eq!(
            build_ready_explain_args(),
            &["ready", "--explain", "--json", "--limit", "0"]
        );
    }

    #[test]
    fn build_create_bead_args_passes_labels_as_one_flag() {
        let labels = vec!["ui".to_string(), "pdf".to_string()];
        assert_eq!(
            build_create_bead_args("Fix", None, None, None, &labels),
            vec!["create", "--title", "Fix", "--silent", "--labels", "ui,pdf"]
        );
        assert_eq!(
            build_create_bead_args("Fix", None, None, None, &[]),
            vec!["create", "--title", "Fix", "--silent"]
        );
    }

    #[test]
    fn build_update_bead_args_passes_due_and_estimate() {
        let update = BeadUpdateInput {
            due: Some("tomorrow".to_string()),
            estimate: Some(180),
            ..Default::default()
        };
        assert_eq!(
            build_update_bead_args("bd-board-a2k", &update, &[]),
            vec![
                "update",
                "bd-board-a2k",
                "--due",
                "tomorrow",
                "--estimate",
                "180",
            ]
        );
    }

    #[test]
    fn build_update_bead_args_clears_due_with_empty_value() {
        let update = BeadUpdateInput {
            due: Some(String::new()),
            ..Default::default()
        };
        assert_eq!(
            build_update_bead_args("bd-board-a2k", &update, &[]),
            vec!["update", "bd-board-a2k", "--due", ""]
        );
    }

    #[test]
    fn defer_args_add_until_only_when_given() {
        assert_eq!(
            build_defer_args("bd-board-a2k", None),
            vec!["defer", "bd-board-a2k"]
        );
        assert_eq!(
            build_defer_args("bd-board-a2k", Some("next monday")),
            vec!["defer", "bd-board-a2k", "--until", "next monday"]
        );
        assert_eq!(
            build_undefer_args("bd-board-a2k"),
            vec!["undefer", "bd-board-a2k"]
        );
    }

    #[test]
    fn list_args_request_every_bead() {
        assert_eq!(
            build_list_beads_args(),
            vec!["list", "--all", "--limit", "0", "--json"]
        );
    }

    #[test]
    fn map_bead_carries_schedule_fields_and_omits_absent_ones() {
        let raw = serde_json::json!({
            "id": "bd-board-a2k",
            "title": "Schedule me",
            "status": "open",
            "issue_type": "task",
            "due_at": "2026-11-16T17:00:00Z",
            "estimated_minutes": 90,
            "close_reason": "",
        });
        let bead = map_bead(&raw, &HashMap::new());
        assert_eq!(bead.due_at.as_deref(), Some("2026-11-16T17:00:00Z"));
        assert_eq!(bead.estimated_minutes, Some(90));
        assert_eq!(bead.close_reason, None);

        let json = serde_json::to_value(&bead).expect("bead serializes");
        assert!(json.get("defer_until").is_none());
        assert!(json.get("close_reason").is_none());
        assert_eq!(json["estimated_minutes"], 90);
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
    fn bd_error_message_reads_json_on_stderr() {
        let stderr = r#"{"message":"bad input","hint":"fix it"}"#;
        let status = std::process::Command::new("false").output().unwrap().status;
        assert_eq!(bd_error_message("", stderr, &status), "bad input (fix it)");
    }

    #[test]
    fn build_counts_folds_custom_statuses_by_category() {
        let rows = vec![
            json!({"group": "review", "count": 2}),
            json!({"group": "qa", "count": 3}),
            json!({"group": "parked", "count": 4}),
            json!({"group": "unknown", "count": 5}),
            json!({"group": "pinned", "count": 1}),
        ];
        let categories = HashMap::from([
            ("review".to_string(), "wip".to_string()),
            ("qa".to_string(), "done".to_string()),
            ("parked".to_string(), "frozen".to_string()),
        ]);
        let counts = build_counts_from_groups(&rows, &categories);
        assert_eq!(counts.in_progress, 2);
        assert_eq!(counts.closed, 3);
        assert_eq!(counts.deferred, 4);
        assert_eq!(counts.open, 6);
        assert_eq!(counts.total, 15);
    }

    #[test]
    fn deletion_set_follows_parent_child_edges_breadth_first() {
        let raws = vec![
            json!({"id": "root"}),
            json!({"id": "a", "parent": "root"}),
            json!({"id": "b", "parent": "root"}),
            json!({"id": "c", "dependencies": [{"depends_on_id": "root", "type": "parent-child"}]}),
            json!({"id": "a1", "parent": "a"}),
            json!({"id": "other"}),
        ];
        assert_eq!(deletion_set(&raws, "root"), ["root", "a", "b", "c", "a1"]);
    }

    #[test]
    fn unlinked_dependents_excludes_beads_inside_the_deletion() {
        let raws = vec![
            json!({"id": "root", "title": "Root"}),
            json!({"id": "a", "title": "A", "parent": "root"}),
            json!({"id": "x", "title": "X", "dependencies": [{"depends_on_id": "root", "type": "blocks"}]}),
            json!({"id": "y", "title": "Y", "dependencies": [{"depends_on_id": "a", "type": "relates-to"}]}),
            json!({"id": "z", "title": "Z", "dependencies": [{"issue_id": "a", "depends_on_id": "root", "type": "parent-child"}]}),
        ];
        let ids = deletion_set(&raws, "root");
        let unlinked = unlinked_dependents(&raws, &ids);
        let found: Vec<(&str, &str)> = unlinked
            .iter()
            .map(|u| (u.id.as_str(), u.kind.as_str()))
            .collect();
        assert_eq!(found, [("x", "blocks"), ("y", "relates-to")]);
    }

    #[test]
    fn relation_args_map_each_kind_to_bd_command() {
        assert_eq!(
            build_add_relation_args("blocked-by", "a", "b").unwrap(),
            vec!["dep", "add", "a", "b"]
        );
        assert_eq!(
            build_add_relation_args("blocks", "a", "b").unwrap(),
            vec!["dep", "add", "b", "a"]
        );
        assert_eq!(
            build_add_relation_args("relates-to", "a", "b").unwrap(),
            vec!["dep", "relate", "a", "b"]
        );
        assert_eq!(
            build_add_relation_args("duplicate-of", "a", "b").unwrap(),
            vec!["duplicate", "a", "--of", "b"]
        );
        assert_eq!(
            build_add_relation_args("supersedes", "a", "b").unwrap(),
            vec!["supersede", "b", "--with", "a"]
        );
        assert!(build_add_relation_args("related", "a", "b").is_err());
    }

    #[test]
    fn relation_removal_reverses_blocks_and_rejects_non_removable_kinds() {
        assert_eq!(
            build_remove_relation_args("blocked-by", "a", "b").unwrap(),
            vec!["dep", "remove", "a", "b"]
        );
        assert_eq!(
            build_remove_relation_args("blocks", "a", "b").unwrap(),
            vec!["dep", "remove", "b", "a"]
        );
        assert_eq!(
            build_remove_relation_args("relates-to", "a", "b").unwrap(),
            vec!["dep", "unrelate", "a", "b"]
        );
        assert!(build_remove_relation_args("duplicate-of", "a", "b").is_err());
    }

    #[test]
    fn clean_delete_preview_drops_cli_hints() {
        let text = "2 beads\n  x has dependents not in deletion set\nTo proceed, run:\n  bd delete x --force\n";
        assert_eq!(clean_delete_preview(text), "2 beads\n  bd delete x --force");
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
            project: Box::new(Project {
                id: "bd-board".to_string(),
                name: "bd-board".to_string(),
                dir: "/Users/jeanpfs/Code/bd-board".to_string(),
                beads_path: "/Users/jeanpfs/Code/jeanpfs-ai/beads/bd-board/.beads".to_string(),
                prefix: Some("bd-board".to_string()),
                external: true,
                missing: false,
                error: None,
                counts: build_counts_from_groups(&[], &HashMap::new()),
                migration: None,
            }),
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

    fn graph_issue(id: &str, deps: Option<Vec<Value>>, extra: Value) -> Value {
        let mut row = json!({"id": id, "title": format!("Issue {id}"), "status": "open", "priority": 2, "issue_type": "task"});
        if let Some(deps) = deps {
            row["dependencies"] = Value::Array(deps);
        }
        for (k, v) in extra.as_object().cloned().unwrap_or_default() {
            row[k] = v;
        }
        row
    }

    fn graph_edge(from: &str, to: &str, kind: &str) -> Value {
        json!({"issue_id": from, "depends_on_id": to, "type": kind})
    }

    fn links_json(bead: &Bead) -> Value {
        serde_json::to_value(bead).unwrap()["links"].clone()
    }

    #[test]
    fn graph_reads_blocks_edges_in_both_directions() {
        let beads = build_bead_graph(
            &[
                graph_issue(
                    "ravo-fvs",
                    Some(vec![graph_edge("ravo-fvs", "ravo-nyu", "blocks")]),
                    json!({}),
                ),
                graph_issue("ravo-nyu", None, json!({})),
            ],
            &HashMap::new(),
        );
        assert_eq!(
            links_json(&beads[0]),
            json!([{"id": "ravo-nyu", "type": "blocks", "direction": "outgoing"}])
        );
        assert_eq!(
            links_json(&beads[1]),
            json!([{"id": "ravo-fvs", "type": "blocks", "direction": "incoming"}])
        );
    }

    #[test]
    fn graph_derives_parent_and_children_from_parent_child_edges() {
        let beads = build_bead_graph(
            &[
                graph_issue("ravo-epic", None, json!({"issue_type": "epic"})),
                graph_issue(
                    "ravo-sub",
                    Some(vec![graph_edge("ravo-sub", "ravo-epic", "parent-child")]),
                    json!({}),
                ),
            ],
            &HashMap::new(),
        );
        assert_eq!(beads[1].parent.as_deref(), Some("ravo-epic"));
        assert_eq!(beads[0].children, Some(vec!["ravo-sub".to_string()]));
    }

    #[test]
    fn graph_keeps_non_blocking_edge_types_with_their_own_type() {
        let beads = build_bead_graph(
            &[
                graph_issue(
                    "ravo-14f",
                    Some(vec![graph_edge("ravo-14f", "ravo-c4d", "discovered-from")]),
                    json!({}),
                ),
                graph_issue("ravo-c4d", None, json!({})),
            ],
            &HashMap::new(),
        );
        assert_eq!(
            links_json(&beads[0]),
            json!([{"id": "ravo-c4d", "type": "discovered-from", "direction": "outgoing"}])
        );
        assert_eq!(
            links_json(&beads[1]),
            json!([{"id": "ravo-14f", "type": "discovered-from", "direction": "incoming"}])
        );
    }

    #[test]
    fn graph_ignores_expanded_dependency_shape_and_omits_empty_links() {
        let beads = build_bead_graph(
            &[graph_issue(
                "ravo-fvs",
                Some(vec![
                    json!({"id": "ravo-nyu", "title": "Expanded", "dependency_type": "blocks"}),
                ]),
                json!({}),
            )],
            &HashMap::new(),
        );
        assert!(serde_json::to_value(&beads[0])
            .unwrap()
            .get("links")
            .is_none());
    }

    #[test]
    fn graph_drops_duplicate_edges_and_unknown_ids() {
        let beads = build_bead_graph(
            &[
                graph_issue(
                    "ravo-fvs",
                    Some(vec![
                        graph_edge("ravo-fvs", "ravo-nyu", "blocks"),
                        graph_edge("ravo-fvs", "ravo-nyu", "blocks"),
                        graph_edge("ravo-fvs", "ravo-gone", "blocks"),
                    ]),
                    json!({}),
                ),
                graph_issue("ravo-nyu", None, json!({})),
            ],
            &HashMap::new(),
        );
        assert_eq!(
            links_json(&beads[0]),
            json!([{"id": "ravo-nyu", "type": "blocks", "direction": "outgoing"}])
        );
    }

    #[test]
    fn graph_drops_blocks_edge_to_resolved_gate_only() {
        let dep = |to: &str| graph_edge("w", to, "blocks");
        let beads = build_bead_graph(
            &[
                json!({"id": "g1", "title": "g", "status": "closed", "issue_type": "gate"}),
                json!({"id": "g2", "title": "g", "status": "open", "issue_type": "gate"}),
                graph_issue("w", Some(vec![dep("g1"), dep("g2")]), json!({})),
            ],
            &HashMap::new(),
        );
        let w = beads.iter().find(|b| b.id == "w").unwrap();
        assert_eq!(
            links_json(w),
            json!([{"id": "g2", "type": "blocks", "direction": "outgoing"}])
        );
        let g1 = beads.iter().find(|b| b.id == "g1").unwrap();
        assert!(serde_json::to_value(g1).unwrap().get("links").is_none());
    }
}
