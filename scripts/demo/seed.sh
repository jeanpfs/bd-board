#!/usr/bin/env bash
# Seeds three fictional Beads projects for the bd-board demo, fully isolated from any real beads workspace:
# HOME and BEADS_WORKSPACE_ROOT point at throwaway directories under /private/tmp.
#
# Then start the app against them (the registry is read from $HOME/.config/bd-board/projects.json):
#   HOME=/private/tmp/bdb-home BEADS_WORKSPACE_ROOT=/private/tmp/bdb-ws PATH=/private/tmp/bdb-home/.local/bin:$PATH pnpm dev
# and record with record.mjs.
set -euo pipefail
export HOME=/private/tmp/bdb-home
export BEADS_WORKSPACE_ROOT=/private/tmp/bdb-ws
export BEADS_ACTOR=maya
export BD_NON_INTERACTIVE=1
ROOT=/private/tmp/bdb-demo

mkdir -p "$HOME/.local/bin" "$HOME/.config/bd-board" "$ROOT" "$BEADS_WORKSPACE_ROOT"
ln -sf "$(command -v bd)" "$HOME/.local/bin/bd"
export PATH="$HOME/.local/bin:$PATH"

mk() { # name prefix
  rm -rf "$ROOT/$1" "$BEADS_WORKSPACE_ROOT/$1" && mkdir -p "$ROOT/$1" && cd "$ROOT/$1"
  git init -q
  git config user.name maya && git config user.email maya@example.com
  bd init -p "$2" --non-interactive --quiet >/dev/null 2>&1
}
c() { bd create "$@" --silent; }

# ---------------------------------------------------------------- ledger: invoicing app
mk ledger ldg
E1=$(c "Recurring invoices" -t epic -p 1 -d "Let customers schedule invoices that are created and sent automatically.")
a=$(c "Schedule model and migration" -t task -p 1 --parent "$E1" -a maya -l backend)
b=$(c "Cron worker that issues due invoices" -t task -p 1 --parent "$E1" -a dev -l backend)
d=$(c "Schedule picker in the invoice form" -t task -p 2 --parent "$E1" -l frontend)
e=$(c "Email template for recurring invoices" -t task -p 3 --parent "$E1" -l design)
E2=$(c "Tax and VAT support" -t epic -p 2 -d "Per-country VAT rates, reverse charge and tax lines on invoices.")
f=$(c "VAT rates table" -t task -p 2 --parent "$E2" -a ines -l backend)
g=$(c "Reverse-charge rule for EU B2B" -t task -p 1 --parent "$E2" -l backend)
h=$(c "Tax line breakdown in the PDF" -t task -p 2 --parent "$E2" -l frontend)
i=$(c "PDF export drops the second page footer" -t bug -p 1 -a dev -l bug)
j=$(c "Export customers to CSV" -t feature -p 3)
k=$(c "Rate-limit the public invoice link" -t task -p 2 -l security)
l=$(c "Upgrade to Postgres 17" -t chore -p 4)
m=$(c "Duplicate payment webhook creates two receipts" -t bug -p 0 -a ines -l bug)
bd update "$b" -s in_progress >/dev/null; bd update "$f" -s in_progress >/dev/null
bd update "$i" -s in_progress >/dev/null; bd update "$m" -s in_progress >/dev/null
bd close "$a" -r "Merged in #212" >/dev/null 2>&1 || true
bd dep add "$d" "$a" >/dev/null 2>&1 || true
bd dep add "$g" "$f" >/dev/null 2>&1 || true
bd comments add "$m" "Reproduced: the provider retries after a 504 and we do not dedupe on event id." >/dev/null 2>&1 || true
bd comments add "$m" "Fix plan: store the event id with a unique index and return 200 on repeats." >/dev/null 2>&1 || true
bd close "$l" -r "Deferred to next quarter" >/dev/null 2>&1 || true

# ---------------------------------------------------------------- orbit: mobile app
mk orbit orb
E=$(c "Offline mode" -t epic -p 1 -d "The app should stay usable without a connection and sync when it is back.")
c "Local cache for the feed" -t task -p 1 --parent "$E" -a sam -l mobile >/dev/null
c "Queue writes while offline" -t task -p 1 --parent "$E" -l mobile >/dev/null
c "Conflict resolution rules" -t task -p 2 --parent "$E" -l mobile >/dev/null
c "Offline banner and retry button" -t task -p 3 --parent "$E" -l design >/dev/null
c "Crash on launch on Android 12" -t bug -p 0 -a sam -l bug >/dev/null
c "Dark mode contrast on the settings screen" -t bug -p 2 -l design >/dev/null
c "Push notification deep links" -t feature -p 2 >/dev/null
c "Replace the onboarding illustrations" -t task -p 3 -l design >/dev/null

# ---------------------------------------------------------------- atlas: docs site
mk atlas atl
c "Write the getting-started guide" -t task -p 1 -a maya >/dev/null
c "Add search to the docs" -t feature -p 2 >/dev/null
c "Broken anchor links in the API reference" -t bug -p 2 >/dev/null
c "Versioned docs" -t feature -p 3 >/dev/null

# ---------------------------------------------------------------- bd-board registry
cat > "$HOME/.config/bd-board/projects.json" <<JSON
{"version":1,"projects":[
{"id":"ledger","path":"$BEADS_WORKSPACE_ROOT/ledger/.beads","label":"ledger"},
{"id":"orbit","path":"$BEADS_WORKSPACE_ROOT/orbit/.beads","label":"orbit"},
{"id":"atlas","path":"$BEADS_WORKSPACE_ROOT/atlas/.beads","label":"atlas"}]}
JSON
echo seeded
