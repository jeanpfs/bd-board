/* Sample dataset shaped exactly like src/lib/types.ts (Bead, Project).
   Content mirrors bd-board's own roadmap (README + PROGRESS.md) so the
   redesign is judged against realistic titles, not lorem. */

const PROJECTS = [
  {
    name: 'bd-board',
    dir: '~/Code/bd-board',
    database: 'bdb',
    counts: {
      open: 12,
      in_progress: 4,
      blocked: 3,
      closed: 12,
      deferred: 1,
      total: 32,
    },
  },
  {
    name: 'ravo',
    dir: '~/Code/ravo',
    database: 'ravo',
    counts: {
      open: 24,
      in_progress: 3,
      blocked: 2,
      closed: 41,
      deferred: 4,
      total: 74,
    },
  },
  {
    name: 'jjhub',
    dir: '~/Code/jjhub',
    database: 'jjh',
    counts: {
      open: 9,
      in_progress: 1,
      blocked: 0,
      closed: 63,
      deferred: 0,
      total: 73,
    },
  },
  {
    name: 'kolek-php',
    dir: '~/Code/KOLEK/kolek-php',
    database: 'kolek',
    counts: {
      open: 6,
      in_progress: 0,
      blocked: 4,
      closed: 18,
      deferred: 2,
      total: 30,
    },
  },
  {
    name: 'example-project',
    dir: '~/Code/example-project',
    database: 'exp',
    counts: {
      open: 3,
      in_progress: 2,
      blocked: 0,
      closed: 27,
      deferred: 0,
      total: 32,
    },
  },
  {
    name: 'curriculo',
    dir: '~/Code/curriculo',
    database: 'cv',
    counts: {
      open: 5,
      in_progress: 0,
      blocked: 1,
      closed: 8,
      deferred: 1,
      total: 15,
    },
  },
]

const BEADS = [
  /* ---- epics ---- */
  {
    id: 'bdb-e0f',
    title: 'Tauri desktop shell',
    status: 'in_progress',
    priority: 1,
    issue_type: 'epic',
    assignee: 'jean.pfs2@gmail.com',
    labels: ['desktop'],
    updated_at: '2h',
    comment_count: 4,
  },
  {
    id: 'bdb-w2c',
    title: 'Write mode and the bd CLI contract',
    status: 'in_progress',
    priority: 0,
    issue_type: 'epic',
    assignee: 'jean.pfs2@gmail.com',
    labels: ['safety'],
    updated_at: '1d',
    comment_count: 7,
  },
  {
    id: 'bdb-b7a',
    title: 'Board views, filters and URL state',
    status: 'open',
    priority: 1,
    issue_type: 'epic',
    assignee: 'claude-agent',
    labels: ['ui'],
    updated_at: '5h',
    comment_count: 2,
  },
  {
    id: 'bdb-r4d',
    title: 'Public release readiness',
    status: 'open',
    priority: 2,
    issue_type: 'epic',
    labels: ['release'],
    updated_at: '3d',
    comment_count: 1,
  },

  /* ---- bdb-e0f · Tauri desktop shell ---- */
  {
    id: 'bdb-3k1',
    title: 'Bridge bd CLI calls through Tauri commands',
    status: 'in_progress',
    priority: 0,
    issue_type: 'task',
    assignee: 'claude-agent',
    labels: ['desktop', 'rust'],
    parent: 'bdb-e0f',
    updated_at: '2h',
    comment_count: 3,
    links: [
      { id: 'bdb-7hs', type: 'blocks', direction: 'incoming' },
      { id: 'bdb-2qw', type: 'blocks', direction: 'incoming' },
      { id: 'bdb-c1r', type: 'related', direction: 'outgoing' },
    ],
    description:
      'The web build reaches `bd` through a TanStack server function. The desktop build has no Node process, so every read and write has to go through a Rust command that spawns the local binary and returns the same JSON the server functions return today.\n\nKeep the shape identical on both sides — `src/lib/desktop.ts` decides which transport to use, and nothing above it should know which one is active.\n\nWrites stay behind the same `BD_BOARD_ALLOW_WRITE` check. The desktop shell must not become a way around the read-only default.',
    acceptance_criteria:
      '- `list`, `show`, `create`, `comment` and `update` all resolve through Tauri commands with no Node fallback.\n- The returned payloads validate against the same zod contract as the web transport.\n- Write commands refuse to run when the flag is unset, and the UI shows the read-only badge.',
    comments: [
      {
        id: 'c1',
        author: 'jean',
        created_at: '2 days ago',
        text: 'Spawning bd per call is fine for now. If it gets slow we cache the project list, not the beads — stale beads are worse than a slow board.',
      },
      {
        id: 'c2',
        author: 'claude-agent',
        created_at: '6 hours ago',
        text: 'list/show are done and typed. create/comment still go through the Node path, so the desktop build silently falls back on those two.',
      },
      {
        id: 'c3',
        author: 'jean',
        created_at: '2 hours ago',
        text: 'Silent fallback is the actual bug here. Make it throw in desktop mode instead — I would rather see the error than ship a build where writes quietly do nothing.',
      },
    ],
  },
  {
    id: 'bdb-2qw',
    title: 'Resolve the bundled bd binary as a Tauri sidecar',
    status: 'open',
    priority: 0,
    issue_type: 'task',
    labels: ['desktop', 'build'],
    parent: 'bdb-e0f',
    updated_at: '1d',
    comment_count: 1,
    links: [{ id: 'bdb-3k1', type: 'blocks', direction: 'outgoing' }],
  },
  {
    id: 'bdb-7hs',
    title: 'Sign and notarize the macOS build',
    status: 'blocked',
    priority: 1,
    issue_type: 'chore',
    assignee: 'jean.pfs2@gmail.com',
    labels: ['desktop', 'ci'],
    parent: 'bdb-e0f',
    updated_at: '4d',
    comment_count: 2,
    links: [{ id: 'bdb-3k1', type: 'blocks', direction: 'outgoing' }],
  },
  {
    id: 'bdb-9vd',
    title: 'Desktop probe card behind a capability check',
    status: 'closed',
    priority: 1,
    issue_type: 'task',
    assignee: 'claude-agent',
    labels: ['desktop'],
    parent: 'bdb-e0f',
    updated_at: '6d',
    comment_count: 0,
  },
  {
    id: 'bdb-4tz',
    title: 'prepare-desktop-build script emits CI artifacts',
    status: 'closed',
    priority: 2,
    issue_type: 'chore',
    labels: ['build', 'ci'],
    parent: 'bdb-e0f',
    updated_at: '8d',
    comment_count: 0,
  },
  {
    id: 'bdb-8mx',
    title: 'Persist window size and position across launches',
    status: 'open',
    priority: 3,
    issue_type: 'feature',
    labels: ['desktop'],
    parent: 'bdb-e0f',
    updated_at: '9d',
    comment_count: 0,
  },

  /* ---- bdb-w2c · write mode ---- */
  {
    id: 'bdb-k8p',
    title: 'Delete bead flow with typed confirmation',
    status: 'in_progress',
    priority: 1,
    issue_type: 'feature',
    assignee: 'jean.pfs2@gmail.com',
    labels: ['write-mode', 'ui'],
    parent: 'bdb-w2c',
    updated_at: '3h',
    comment_count: 5,
    links: [{ id: 'bdb-c1r', type: 'related', direction: 'outgoing' }],
  },
  {
    id: 'bdb-m5j',
    title: 'Pin the supported bd CLI version range',
    status: 'blocked',
    priority: 1,
    issue_type: 'chore',
    labels: ['write-mode'],
    parent: 'bdb-w2c',
    updated_at: '2d',
    comment_count: 3,
    links: [
      { id: 'bdb-c1r', type: 'blocks', direction: 'outgoing' },
      { id: 'bdb-j3d', type: 'blocks', direction: 'incoming' },
    ],
  },
  {
    id: 'bdb-q9b',
    title: 'Comment mutation must invalidate the detail query',
    status: 'hooked',
    priority: 2,
    issue_type: 'bug',
    assignee: 'codex-cli',
    labels: ['write-mode', 'query'],
    parent: 'bdb-w2c',
    updated_at: '7h',
    comment_count: 1,
  },
  {
    id: 'bdb-c1r',
    title: 'Validate every write payload before shelling out to bd',
    status: 'closed',
    priority: 0,
    issue_type: 'task',
    assignee: 'jean.pfs2@gmail.com',
    labels: ['write-mode', 'safety'],
    parent: 'bdb-w2c',
    updated_at: '5d',
    comment_count: 6,
    links: [
      { id: 'bdb-m5j', type: 'blocks', direction: 'incoming' },
      { id: 'bdb-k8p', type: 'related', direction: 'incoming' },
    ],
  },
  {
    id: 'bdb-f6n',
    title: 'Optimistic status drop with rollback on failure',
    status: 'closed',
    priority: 0,
    issue_type: 'feature',
    assignee: 'claude-agent',
    labels: ['write-mode', 'dnd'],
    parent: 'bdb-w2c',
    updated_at: '6d',
    comment_count: 2,
  },
  {
    id: 'bdb-d3v',
    title: 'Show read-only mode when BD_BOARD_ALLOW_WRITE is unset',
    status: 'closed',
    priority: 1,
    issue_type: 'task',
    labels: ['write-mode', 'ui'],
    parent: 'bdb-w2c',
    updated_at: '7d',
    comment_count: 0,
  },

  /* ---- bdb-b7a · board views ---- */
  {
    id: 'bdb-a2h',
    title: 'Group the board by priority swimlanes',
    status: 'in_progress',
    priority: 1,
    issue_type: 'feature',
    assignee: 'claude-agent',
    labels: ['ui', 'board'],
    parent: 'bdb-b7a',
    updated_at: '1h',
    comment_count: 2,
  },
  {
    id: 'bdb-v4e',
    title: 'Virtualize lane cells above 300 beads',
    status: 'pinned',
    priority: 1,
    issue_type: 'task',
    labels: ['perf', 'board'],
    parent: 'bdb-b7a',
    updated_at: '2d',
    comment_count: 4,
    links: [{ id: 'bdb-h4w', type: 'related', direction: 'outgoing' }],
  },
  {
    id: 'bdb-h4w',
    title: 'Debounce the search input against the URL',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    assignee: 'codex-cli',
    labels: ['ui', 'router'],
    parent: 'bdb-b7a',
    updated_at: '3d',
    comment_count: 0,
    links: [{ id: 'bdb-v4e', type: 'related', direction: 'incoming' }],
  },
  {
    id: 'bdb-n6y',
    title: 'Persist collapsed lanes in localStorage',
    status: 'open',
    priority: 3,
    issue_type: 'feature',
    labels: ['ui'],
    parent: 'bdb-b7a',
    updated_at: '4d',
    comment_count: 0,
  },
  {
    id: 'bdb-x8k',
    title: 'Empty-state copy per filter combination',
    status: 'deferred',
    priority: 4,
    issue_type: 'task',
    labels: ['copy'],
    parent: 'bdb-b7a',
    updated_at: '11d',
    comment_count: 1,
  },
  {
    id: 'bdb-s7u',
    title: 'Keyboard sensor for drag and drop',
    status: 'closed',
    priority: 2,
    issue_type: 'feature',
    assignee: 'claude-agent',
    labels: ['a11y', 'dnd'],
    parent: 'bdb-b7a',
    updated_at: '9d',
    comment_count: 3,
  },
  {
    id: 'bdb-z1c',
    title: 'Sticky status header row over swimlanes',
    status: 'closed',
    priority: 2,
    issue_type: 'task',
    labels: ['ui', 'board'],
    parent: 'bdb-b7a',
    updated_at: '10d',
    comment_count: 0,
  },

  /* ---- bdb-r4d · release ---- */
  {
    id: 'bdb-j3d',
    title: 'Audit production dependencies before tagging 0.1.0',
    status: 'open',
    priority: 1,
    issue_type: 'chore',
    assignee: 'jean.pfs2@gmail.com',
    labels: ['release', 'security'],
    parent: 'bdb-r4d',
    updated_at: '1d',
    comment_count: 2,
    links: [{ id: 'bdb-m5j', type: 'blocks', direction: 'outgoing' }],
  },
  {
    id: 'bdb-p2m',
    title: 'Replace the scaffold icons with project artwork',
    status: 'open',
    priority: 3,
    issue_type: 'task',
    labels: ['release', 'brand'],
    parent: 'bdb-r4d',
    updated_at: '5d',
    comment_count: 1,
  },
  {
    id: 'bdb-t9a',
    title: 'Screenshot set for the repo README',
    status: 'open',
    priority: 4,
    issue_type: 'chore',
    labels: ['docs'],
    parent: 'bdb-r4d',
    updated_at: '6d',
    comment_count: 0,
  },
  {
    id: 'bdb-g5t',
    title: 'pnpm validate gate in CI',
    status: 'closed',
    priority: 1,
    issue_type: 'chore',
    assignee: 'jean.pfs2@gmail.com',
    labels: ['ci'],
    parent: 'bdb-r4d',
    updated_at: '12d',
    comment_count: 0,
  },
  {
    id: 'bdb-y7s',
    title: 'Document the safety model in README',
    status: 'closed',
    priority: 2,
    issue_type: 'docs',
    labels: ['docs', 'safety'],
    parent: 'bdb-r4d',
    updated_at: '12d',
    comment_count: 1,
  },

  /* ---- no epic ---- */
  {
    id: 'bdb-u1n',
    title: 'Board throws when a bead points at a missing parent',
    status: 'blocked',
    priority: 0,
    issue_type: 'bug',
    assignee: 'jean.pfs2@gmail.com',
    labels: ['bug', 'board'],
    updated_at: '40m',
    comment_count: 4,
    links: [
      { id: 'bdb-3k1', type: 'blocks', direction: 'outgoing' },
      { id: 'bdb-e8s', type: 'related', direction: 'outgoing' },
    ],
    description:
      'Deleting an epic through the `bd` CLI while the board is open leaves its children with a `parent` that no longer resolves. `BoardSwimlanes` drops those beads from every lane instead of falling back to the "No epic" lane, so the work disappears from the board without any error.\n\nReproduced on a 74-bead project: two beads vanished until a full reload.',
    acceptance_criteria:
      '- A bead whose `parent` does not resolve renders in the "No epic" lane.\n- Lane totals match the unfiltered bead count.\n- A regression test covers the orphaned-parent case in `sort.test.ts`.',
    comments: [
      {
        id: 'c1',
        author: 'jean',
        created_at: '3 hours ago',
        text: 'Found it while cleaning up ravo epics. Nothing crashed visibly — the beads were just gone, which is worse.',
      },
      {
        id: 'c2',
        author: 'claude-agent',
        created_at: '1 hour ago',
        text: 'The filter in board-swimlanes.tsx only keeps orphans when `!b.parent`. A bead with a dangling parent id passes neither branch.',
      },
    ],
  },
  {
    id: 'bdb-r3x',
    title: 'Flaky test: sort.test.ts ordering by recent',
    status: 'in_progress',
    priority: 1,
    issue_type: 'bug',
    assignee: 'codex-cli',
    labels: ['test'],
    updated_at: '4h',
    comment_count: 2,
  },
  {
    id: 'bdb-e8s',
    title: 'Toast stack overlaps New bead on narrow windows',
    status: 'open',
    priority: 2,
    issue_type: 'bug',
    labels: ['ui'],
    updated_at: '2d',
    comment_count: 0,
    links: [{ id: 'bdb-u1n', type: 'related', direction: 'incoming' }],
  },
  {
    id: 'bdb-l6q',
    title: 'Move the remaining raw hex values onto tokens',
    status: 'open',
    priority: 3,
    issue_type: 'chore',
    labels: ['ui', 'tokens'],
    updated_at: '7d',
    comment_count: 0,
  },
]

/* ---- helpers mirrored from src/lib/types.ts ---- */

const COLUMN_KEYS = ['open', 'in_progress', 'blocked', 'closed']

const COLUMN_LABEL = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  closed: 'Closed',
}

function mapStatus(raw) {
  switch (raw) {
    case 'in_progress':
      return { column: 'in_progress' }
    case 'blocked':
      return { column: 'blocked' }
    case 'closed':
      return { column: 'closed' }
    case 'deferred':
      return { column: 'open', badge: { label: 'Deferred', tone: 'deferred' } }
    case 'hooked':
      return {
        column: 'in_progress',
        badge: { label: 'Hooked', tone: 'hooked' },
      }
    case 'pinned':
      return { column: 'open', badge: { label: 'Pinned', tone: 'pinned' } }
    default:
      return { column: 'open' }
  }
}

const isEpic = (b) => b.issue_type === 'epic'

function groupBeadLinks(links = []) {
  const blockedBy = []
  const blocking = []
  const related = []
  for (const link of links) {
    if (link.type === 'parent-child') continue
    if (link.type === 'blocks') {
      if (link.direction === 'outgoing') blockedBy.push(link.id)
      else blocking.push(link.id)
      continue
    }
    related.push(link)
  }
  return { blockedBy, blocking, related }
}

function initials(name) {
  const parts = String(name)
    .trim()
    .split(/[\s_@.-]+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function childrenOf(id) {
  return BEADS.filter((b) => b.parent === id)
}

function beadById(id) {
  return BEADS.find((b) => b.id === id)
}

function beadMatches(bead, query, priorities) {
  if (priorities.length > 0 && !priorities.includes(bead.priority)) return false
  if (!query) return true
  const q = query.toLowerCase()
  return (
    bead.id.toLowerCase().includes(q) ||
    bead.title.toLowerCase().includes(q) ||
    (bead.labels ?? []).some((l) => l.toLowerCase().includes(q)) ||
    (bead.assignee ?? '').toLowerCase().includes(q)
  )
}

const SORTS = {
  priority: (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  recent: (a, b) => ageMinutes(a.updated_at) - ageMinutes(b.updated_at),
  title: (a, b) => a.title.localeCompare(b.title),
}

function ageMinutes(rel = '') {
  const m = /^(\d+)([mhd])$/.exec(rel)
  if (!m) return Number.MAX_SAFE_INTEGER
  const n = Number(m[1])
  return m[2] === 'm' ? n : m[2] === 'h' ? n * 60 : n * 1440
}

/* ---- knowledge ----
   Not a bd entity: a knowledge entry IS a bead comment whose text starts with
   one of the 7 prefixes parsed by src/lib/knowledge.ts. `raw` is what is stored
   in bd; `type` + `content` are what the parser derives from it. */

const KNOWLEDGE_TYPES = [
  'learned',
  'decision',
  'fact',
  'pattern',
  'investigation',
  'must-check',
  'deviation',
]

const KNOWLEDGE_TYPE_LABEL = {
  learned: 'Learned',
  decision: 'Decision',
  fact: 'Fact',
  pattern: 'Pattern',
  investigation: 'Investigation',
  'must-check': 'Must-check',
  deviation: 'Deviation',
}

const KNOWLEDGE_TYPE_HINT = {
  learned: 'Something the work taught us that was not obvious going in.',
  decision: 'A choice that was made, so it is not re-litigated later.',
  fact: 'A verifiable property of the system or its tooling.',
  pattern: 'A convention that should hold across the codebase.',
  investigation: 'A finding from a diagnosis, still open-ended.',
  'must-check': 'A trap someone will fall into unless they check first.',
  deviation: 'Where reality departed from the documented process.',
}

const KNOWLEDGE = [
  {
    id: 'bdb-3k1#k4',
    bead_id: 'bdb-3k1',
    type: 'must-check',
    author: 'jean.pfs2@gmail.com',
    created_at: '2h',
    content:
      'Desktop writes must fail loudly when the Tauri command is missing. Falling back to the Node transport inside a packaged build means the user gets a success toast for a write that never reached bd.',
  },
  {
    id: 'bdb-3k1#k2',
    bead_id: 'bdb-3k1',
    type: 'learned',
    author: 'claude-agent',
    created_at: '1d',
    content:
      'Spawning bd once per call costs ~40ms on a warm cache, which is invisible next to the render. Caching the process is not worth the staleness risk.',
  },
  {
    id: 'bdb-c1r#k1',
    bead_id: 'bdb-c1r',
    type: 'decision',
    author: 'jean.pfs2@gmail.com',
    created_at: '5d',
    content:
      'Every mutation is validated server-side before the bd process is spawned. The UI is never the only gate — a hand-crafted request has to fail exactly like a broken form does.',
  },
  {
    id: 'bdb-c1r#k3',
    bead_id: 'bdb-c1r',
    type: 'fact',
    author: 'jean.pfs2@gmail.com',
    created_at: '5d',
    content:
      'bd exits with code 2 on validation failure and writes the reason to stderr, not stdout. Reading only stdout turns a rejected write into a silent no-op.',
  },
  {
    id: 'bdb-m5j#k1',
    bead_id: 'bdb-m5j',
    type: 'fact',
    author: 'jean.pfs2@gmail.com',
    created_at: '2d',
    content:
      'bd 1.2.x changed the JSON envelope on `show`: dependencies moved from a flat array to `{ dependencies, dependents }`. Anything below 1.2 needs the legacy reader.',
  },
  {
    id: 'bdb-u1n#k2',
    bead_id: 'bdb-u1n',
    type: 'investigation',
    author: 'claude-agent',
    created_at: '1h',
    content:
      'Orphaned beads are dropped by the swimlane grouper instead of falling through to the "No epic" lane. The filter only keeps a bead when `!b.parent`, so a bead with a dangling parent id passes neither branch.',
  },
  {
    id: 'bdb-b7a#k1',
    bead_id: 'bdb-b7a',
    type: 'pattern',
    author: 'claude-agent',
    created_at: '5h',
    content:
      'All board state lives in the URL (`?q`, `?p`, `?view`, `?sort`, `?bead`). A shared board link reproduces the exact view and the back button behaves.',
  },
  {
    id: 'bdb-7hs#k1',
    bead_id: 'bdb-7hs',
    type: 'deviation',
    author: 'jean.pfs2@gmail.com',
    created_at: '4d',
    content:
      'Notarization ran manually from a local machine for this build instead of through CI, because the signing identity is not in the CI secret store yet. Do not treat the release as reproducible until it moves.',
  },
  {
    id: 'bdb-k8p#k2',
    bead_id: 'bdb-k8p',
    type: 'decision',
    author: 'jean.pfs2@gmail.com',
    created_at: '3h',
    content:
      'Deleting a bead requires typing its id, not a plain confirm. Deletion drops dependency edges that no undo can rebuild, so the friction is deliberate.',
  },
  {
    id: 'bdb-f6n#k1',
    bead_id: 'bdb-f6n',
    type: 'learned',
    author: 'claude-agent',
    created_at: '6d',
    content:
      'Optimistic updates need the previous cache snapshot captured before setQueryData, not re-read inside the catch — by then the optimistic value is already the "previous" one.',
  },
  {
    id: 'bdb-v4e#k1',
    bead_id: 'bdb-v4e',
    type: 'must-check',
    author: 'jean.pfs2@gmail.com',
    created_at: '2d',
    content:
      'Measure before virtualizing. The largest real project here is 74 beads and renders in 11ms; virtualization would add drag-and-drop edge cases for a problem nobody has yet.',
  },
  {
    id: 'bdb-s7u#k1',
    bead_id: 'bdb-s7u',
    type: 'learned',
    author: 'claude-agent',
    created_at: '9d',
    content:
      'dnd-kit needs an explicit coordinate getter for the keyboard sensor. Without it the sensor registers, keyboard drag appears to work, and nothing ever drops.',
  },
  {
    id: 'bdb-j3d#k1',
    bead_id: 'bdb-j3d',
    type: 'deviation',
    author: 'jean.pfs2@gmail.com',
    created_at: '1d',
    content:
      'One transitive dependency has an open advisory with no fixed version published. Shipping 0.1.0 with it recorded here rather than silently ignoring the audit output.',
  },
  {
    id: 'bdb-q9b#k1',
    bead_id: 'bdb-q9b',
    type: 'investigation',
    author: 'codex-cli',
    created_at: '7h',
    content:
      'Repro: post a comment, close the sheet, reopen the same bead. The comment is missing until the 8s refetch lands, because the mutation invalidates the board query but not the detail query.',
  },
  {
    id: 'bdb-d3v#k1',
    bead_id: 'bdb-d3v',
    type: 'decision',
    author: 'jean.pfs2@gmail.com',
    created_at: '7d',
    content:
      'Read-only is the default and write mode is opt-in through BD_BOARD_ALLOW_WRITE. A dashboard pointed at someone’s real repositories should not be able to mutate them by accident.',
  },
  {
    id: 'bdb-r3x#k1',
    bead_id: 'bdb-r3x',
    type: 'pattern',
    author: 'codex-cli',
    created_at: '4h',
    content:
      'A flaky test gets a bead before it gets a fix, and the bead carries the seed and the failing ordering. Re-running until green is not triage.',
  },
]

for (const entry of KNOWLEDGE) {
  entry.prefix = entry.type.toUpperCase()
  entry.raw = `${entry.prefix}: ${entry.content}`
  entry.bead_title = beadById(entry.bead_id)?.title
}

const knowledgeById = (id) => KNOWLEDGE.find((k) => k.id === id)

const knowledgeForBead = (beadId) =>
  KNOWLEDGE.filter((k) => k.bead_id === beadId)

function knowledgeTypeCounts() {
  const counts = {}
  for (const k of KNOWLEDGE) counts[k.type] = (counts[k.type] ?? 0) + 1
  return counts
}

/* The reason this screen exists: knowledge is attached to a bead, so it travels
   the dependency graph. Anyone picking up a bead should see what was recorded
   on the beads it blocks or waits on. */
function linkedKnowledge(entry) {
  const bead = beadById(entry.bead_id)
  if (!bead) return []
  const { blockedBy, blocking, related } = groupBeadLinks(bead.links)
  const relation = new Map()
  for (const id of blockedBy) relation.set(id, 'blocked by')
  for (const id of blocking) relation.set(id, 'blocking')
  for (const l of related) relation.set(l.id, l.type)

  const siblings = bead.parent
    ? BEADS.filter((b) => b.parent === bead.parent && b.id !== bead.id)
    : []
  for (const s of siblings) if (!relation.has(s.id)) relation.set(s.id, 'same epic')

  return KNOWLEDGE.filter((k) => relation.has(k.bead_id)).map((k) => ({
    entry: k,
    relation: relation.get(k.bead_id),
  }))
}

/* ---- inline icon set (monoline, currentColor) ---- */

const ICON = {
  chevron: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  chevronLeft: '<path d="M15 18l-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.2-3.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  layers:
    '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5"/>',
  columns:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 016.5 2H20v18H6.5A2.5 2.5 0 004 22z"/><path d="M4 17.5A2.5 2.5 0 016.5 15H20"/>',
  folder:
    '<path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/>',
  sort: '<path d="M7 4v16m0 0l-3-3m3 3l3-3"/><path d="M17 20V4m0 0l-3 3m3-3l3 3"/>',
  tree: '<path d="M4 4v11a3 3 0 003 3h10"/><path d="M14 15l3 3-3 3"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  waypoints:
    '<circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="6" r="2.5"/><path d="M7.5 16L16.5 8"/>',
  link: '<path d="M10 13a4 4 0 006 .5l2-2a4 4 0 00-5.7-5.7L11 7"/><path d="M14 11a4 4 0 00-6-.5l-2 2a4 4 0 005.7 5.7L13 17"/>',
  comment: '<path d="M21 12a7 7 0 01-7 7H8l-5 3 1.5-4.4A7 7 0 0110 5h4a7 7 0 017 7z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  pencil: '<path d="M4 20h4L20 8a2.8 2.8 0 00-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  corner: '<path d="M9 10L5 14l4 4"/><path d="M5 14h9a5 5 0 005-5V5"/>',
  align: '<path d="M4 6h16M4 11h11M4 16h16M4 21h8"/>',
  circleCheck: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
}

function icon(name, size = 14, cls = '') {
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] ?? ''}</svg>`
}
