//! bd refuses to auto-migrate a remote-backed database whose schema is behind.
//! Mirrors src/lib/migration-gate.ts: parsing of bd's report and the encoding
//! of the gate into plain-string errors.

use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct MigrationGateOption {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub label: String,
    pub commands: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub when: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MigrationGate {
    pub pending: i64,
    pub current_version: i64,
    pub latest_version: i64,
    pub options: Vec<MigrationGateOption>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docs: Option<String>,
}

const MARKER: &str = "bd-migration-gate:";

fn option_label(id: &str) -> &str {
    match id {
        "migrate" => "Designated migrator",
        "adopt" => "Every other clone",
        other => other,
    }
}

fn json_number(value: Option<&Value>) -> Option<i64> {
    let value = value?;
    value.as_i64().or_else(|| value.as_f64().map(|n| n as i64))
}

fn json_string(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(str::to_string)
}

fn parse_json_gate(text: &str) -> Option<MigrationGate> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end <= start {
        return None;
    }
    let json: Value = serde_json::from_str(&text[start..=end]).ok()?;
    let gate = json.get("remote_migrate_gate")?.as_object()?;

    let current = json_number(gate.get("current_version")).unwrap_or(0);
    let latest = json_number(gate.get("latest_version")).unwrap_or(0);
    let pending = json_number(gate.get("pending")).unwrap_or(latest - current);
    let options = gate
        .get("options")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .map(|o| {
                    let id = json_string(o.get("id"));
                    MigrationGateOption {
                        label: id
                            .as_deref()
                            .map(option_label)
                            .unwrap_or("Option")
                            .to_string(),
                        id,
                        commands: o
                            .get("commands")
                            .and_then(Value::as_array)
                            .map(|c| {
                                c.iter()
                                    .map(|v| match v.as_str() {
                                        Some(s) => s.to_string(),
                                        None => v.to_string(),
                                    })
                                    .collect()
                            })
                            .unwrap_or_default(),
                        when: json_string(o.get("when")),
                        risk: json_string(o.get("risk")),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Some(MigrationGate {
        pending,
        current_version: current,
        latest_version: latest,
        options,
        hint: json_string(json.get("hint")),
        docs: json_string(gate.get("docs")),
    })
}

fn leading_digits(text: &str) -> Option<(i64, &str)> {
    let end = text
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(text.len());
    if end == 0 {
        return None;
    }
    Some((text[..end].parse().ok()?, &text[end..]))
}

/// `(v<from> -> v<to>)` at the start of `text`, whitespace allowed around `->`.
fn version_range(text: &str) -> Option<(i64, i64)> {
    let rest = text.strip_prefix("(v")?;
    let (from, rest) = leading_digits(rest)?;
    let rest = rest.trim_start().strip_prefix("->")?;
    let rest = rest.trim_start().strip_prefix('v')?;
    let (to, rest) = leading_digits(rest)?;
    rest.starts_with(')').then_some((from, to))
}

/// `refusing to auto-apply N pending schema migrations ... (vA -> vB)`.
fn text_gate_summary(text: &str) -> Option<(i64, i64, i64)> {
    const LEAD: &str = "refusing to auto-apply ";
    const TRAIL: &str = " pending schema migrations";
    let mut offset = 0;
    while let Some(found) = text[offset..].find(LEAD) {
        let after = offset + found + LEAD.len();
        offset = after;
        let Some((pending, rest)) = leading_digits(&text[after..]) else {
            continue;
        };
        let Some(rest) = rest.strip_prefix(TRAIL) else {
            continue;
        };
        let line = rest.split('\n').next().unwrap_or_default();
        // The regex's `[^\n]*` is greedy, so the last version range on the line wins.
        let range = line
            .rmatch_indices("(v")
            .find_map(|(i, _)| version_range(&line[i..]));
        if let Some((current, latest)) = range {
            return Some((pending, current, latest));
        }
    }
    None
}

/// A bullet line `• who (qualifier): cmd && cmd`.
fn text_option(line: &str) -> Option<MigrationGateOption> {
    let body = line.trim_start().strip_prefix('•')?.trim_start();
    for (i, _) in body.match_indices(':') {
        let label = body[..i].trim();
        let rest = body[i + 1..].trim_start();
        if label.is_empty() || rest.len() <= "bd ".len() || !rest.starts_with("bd ") {
            continue;
        }
        let mut chars = label.chars();
        let first = chars.next()?;
        return Some(MigrationGateOption {
            id: None,
            label: first.to_uppercase().chain(chars).collect(),
            commands: rest.split("&&").map(|c| c.trim().to_string()).collect(),
            when: None,
            risk: None,
        });
    }
    None
}

fn parse_text_gate(text: &str) -> Option<MigrationGate> {
    let (pending, current, latest) = text_gate_summary(text)?;
    Some(MigrationGate {
        pending,
        current_version: current,
        latest_version: latest,
        options: text.lines().filter_map(text_option).collect(),
        hint: None,
        docs: None,
    })
}

/// Finds a migration gate in bd output; JSON wins over the text warning.
pub fn parse_migration_gate(stdout: &str, stderr: &str) -> Option<MigrationGate> {
    parse_json_gate(stdout)
        .or_else(|| parse_json_gate(stderr))
        .or_else(|| parse_text_gate(stderr))
        .or_else(|| parse_text_gate(stdout))
}

pub fn summarize_migration_gate(gate: &MigrationGate) -> String {
    format!(
        "Schema migration pending (v{} → v{}, {} migrations): writes are blocked until one clone migrates.",
        gate.current_version, gate.latest_version, gate.pending
    )
}

/// The gate travels inside the error string behind a marker line.
pub fn migration_gate_error(gate: &MigrationGate, detail: &str) -> String {
    let json = serde_json::to_string(gate).unwrap_or_default();
    format!(
        "{}\n{}\n{}{}",
        summarize_migration_gate(gate),
        detail,
        MARKER,
        json
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_json_gate_with_option_labels() {
        let stdout = r#"{"hint":"coordinate","remote_migrate_gate":{"current_version":3,"latest_version":5,"docs":"https://x/y","options":[{"id":"migrate","commands":["bd migrate"],"when":"one clone","risk":"high"},{"id":"adopt","commands":["bd pull","bd sync"]},{"id":"other","commands":[]},{"commands":["bd x"]}]}}"#;
        let gate = parse_migration_gate(stdout, "").unwrap();
        assert_eq!(gate.pending, 2);
        assert_eq!(gate.current_version, 3);
        assert_eq!(gate.latest_version, 5);
        assert_eq!(gate.hint.as_deref(), Some("coordinate"));
        assert_eq!(gate.docs.as_deref(), Some("https://x/y"));
        let labels: Vec<_> = gate.options.iter().map(|o| o.label.as_str()).collect();
        assert_eq!(
            labels,
            ["Designated migrator", "Every other clone", "other", "Option"]
        );
        assert_eq!(gate.options[0].when.as_deref(), Some("one clone"));
        assert_eq!(gate.options[0].risk.as_deref(), Some("high"));
        assert_eq!(gate.options[1].commands, ["bd pull", "bd sync"]);
    }

    #[test]
    fn json_gate_on_stderr_and_explicit_pending() {
        let stderr = r#"warn {"remote_migrate_gate":{"current_version":1,"latest_version":9,"pending":4,"options":[]}}"#;
        let gate = parse_migration_gate("not json", stderr).unwrap();
        assert_eq!(gate.pending, 4);
        assert!(gate.options.is_empty());
    }

    #[test]
    fn parses_text_gate_with_bullet_options() {
        let stderr = "Warning: refusing to auto-apply 2 pending schema migrations on a remote-backed database (v7 -> v9)\n  • designated migrator (one clone): bd migrate && bd dolt push\n  • every other clone: bd dolt pull\nnoise: not a bullet\n";
        let gate = parse_migration_gate("", stderr).unwrap();
        assert_eq!(gate.pending, 2);
        assert_eq!(gate.current_version, 7);
        assert_eq!(gate.latest_version, 9);
        assert_eq!(gate.options.len(), 2);
        assert_eq!(gate.options[0].label, "Designated migrator (one clone)");
        assert_eq!(gate.options[0].commands, ["bd migrate", "bd dolt push"]);
        assert_eq!(gate.options[1].label, "Every other clone");
        assert_eq!(gate.options[1].commands, ["bd dolt pull"]);
        assert!(gate.options[0].id.is_none());
    }

    #[test]
    fn text_gate_tolerates_spaced_arrow_and_ignores_unrelated_output() {
        let stderr = "refusing to auto-apply 1 pending schema migrations (v4  ->  v5)";
        let gate = parse_migration_gate("", stderr).unwrap();
        assert_eq!((gate.current_version, gate.latest_version), (4, 5));
        assert!(parse_migration_gate("{}", "Error: boom").is_none());
    }

    #[test]
    fn gate_error_has_summary_detail_and_marker_json() {
        let gate = MigrationGate {
            pending: 2,
            current_version: 3,
            latest_version: 5,
            options: vec![MigrationGateOption {
                id: None,
                label: "Every other clone".into(),
                commands: vec!["bd pull".into()],
                when: None,
                risk: None,
            }],
            hint: None,
            docs: None,
        };
        let message = migration_gate_error(&gate, "Error: blocked");
        assert_eq!(
            message,
            "Schema migration pending (v3 → v5, 2 migrations): writes are blocked until one clone migrates.\nError: blocked\nbd-migration-gate:{\"pending\":2,\"currentVersion\":3,\"latestVersion\":5,\"options\":[{\"label\":\"Every other clone\",\"commands\":[\"bd pull\"]}]}"
        );
    }
}
