# CLI reference

Global flags: `--json` (machine output), `--root <dir>`, `--actor <id>` (codex | claude-code | human | …), `--session <id>`.
Env: `NORTHSTAR_ACTOR`, `NORTHSTAR_SESSION`.
Exit codes: 0 ok · 2 usage · 3 invalid data/validation errors · 4 rule violation or user approval required · 5 not found / not initialized · 6 conflict.

### `northstar init --name <name> [--idea <text>] [--adopt] [--prefix NS] [--cli <command>] [--harness all|codex|claude|none] [--no-hooks] [--mcp]`

Create .northstar/ and the Codex + Claude Code adapters in this repository.

### `northstar adopt [--name <name>] [--idea <what it appears to be>] [--prefix NS] [--cli <command>] [--harness all|codex|claude|none]`

Bring an existing repository under Northstar (init --adopt) and print its factual inventory.

### `northstar inventory [--json]`

Deterministic facts about the repository (languages, manifests, tests, docs, git history) for adoption.

### `northstar setup [--harness all|codex|claude] [--cli northstar] [--config-dir <claude-account-folder>] [--no-projects] [--no-commit]`

Once per machine (and after upgrading): teach Codex and every Claude Code account (.claude, .claude_max, ...) about Northstar in every folder, and refresh (and commit) the generated files in every registered project (--no-projects to skip, --no-commit to leave them uncommitted).

### `northstar integrate [--harness all|codex|claude] [--no-hooks] [--mcp]`

(Re)generate AGENTS.md / CLAUDE.md blocks, the shared skill, Claude Code hooks and (with --mcp) .mcp.json.

### `northstar status [--json]`

Concise project overview: progress, activity, what needs attention, what is next.

### `northstar validate`

Check schema, references, lifecycle invariants and vision/spec baselines. Exit 3 on errors.

### `northstar reconcile [--against <git-ref>] [--worktrees] [--stale-hours 24]`

Detect stale/unrecorded work and (with --against) concurrent-branch conflicts. Exit 6 on conflicts.

### `northstar plan import --file <plan.json|-> [--change CH-xxx] [--reason <text>] [--dry-run]`

Validate and atomically import a harness-authored plan (vision, requirements, roadmap, tasks, decisions).

### `northstar plan example`

Print a complete example plan.json.

### `northstar vision show`

Print the current vision and its approval state.

### `northstar vision approve --actor human [--note "<the user's words>"]`

Record the user's approval of the proposed vision; snapshots it as immutable v1.

### `northstar spec rebaseline --reason "<why>"`

Accept an edited specification.md as the new baseline (logged; for non-vision refinements).

### `northstar req add --title <t> [--description <d>] [--kind functional|nonfunctional|constraint|exclusion] [--priority must|should|could] [--accept <criterion>]... [--provenance stated|inferred] [--change CH-xxx]`

Add a requirement (after vision approval it must ride on a change proposal).

### `northstar req list`

List requirements.

### `northstar req update <REQ-id> [--title ..] [--description ..] [--priority ..] [--accept <criterion>]... | [--add-accept <criterion>]... [--remove-accept <criterion>]... [--drop] [--reason "<why>"] [--change CH-xxx]`

Edit or drop a requirement. --accept replaces all acceptance criteria; --add-accept/--remove-accept change them one by one. Approved requirements need an approved change and a --reason.

### `northstar milestone add --title <t> [--goal <g>] [--exit-criteria <c>]... [--depends-on MS-001,..] [--reason <why>]`

Add a milestone (a reason is required once the vision is approved).

### `northstar milestone list`

List milestones with progress.

### `northstar milestone move <MS-id> --to <position 1..n> --reason "<why>"`

Reorder a milestone; the reason is recorded in the roadmap history.

### `northstar milestone edit <MS-id> --exit-criterion <X-id> --text "<new text>" --reason "<why>" [--change CH-xxx]`

Reword an exit criterion. Keeps its ID and met/unmet state; recorded in roadmap history. After approval it needs an approved change.

### `northstar feature add --title <t> --milestone MS-xxx [--description <d>] [--requirements REQ-001,..] [--depends-on F-001,..] [--reason <why>]`

Add a feature to a milestone.

### `northstar feature list`

List features with status.

### `northstar task add --title <t> (--feature F-xxx | --milestone MS-xxx) [--description <d>] [--requirements REQ-001,..] [--depends-on NS-001,..] [--priority critical|high|medium|low] [--accept <criterion>]... [--human-approval] [--unplanned --classification minor|technical|extension|new_feature|direction_change] [--change CH-xxx] [--start]`

Create a task. Unplanned work must be classified.

### `northstar task list [--status <s>] [--milestone MS-xxx] [--feature F-xxx]`

List tasks (status may be ready, planned, in_progress, blocked, implemented, verification_pending, verified, released, cancelled).

### `northstar task next`

Recommended next tasks (ready, by milestone order then priority).

### `northstar task show <id>`

Show one task with its acceptance criteria, evidence and verification verdict.

### `northstar task start <id> [--takeover]`

Register that work has begun (requires an approved vision, satisfied dependencies, approved scope).

### `northstar task block <id> --reason "<what is blocking>"`

Mark a task blocked.

### `northstar task unblock <id> [--note <text>]`

Resolve a blocker and restore the previous status.

### `northstar task complete <id> --summary "<what was done>" [--commit <sha>]... [--file <path>]...`

Report implementation finished. This is a CLAIM: the task becomes 'implemented', not 'verified'.

### `northstar task verify <id> [--run "<command>" | --result pass|fail] [--method <name>] [--kind automated|human|agent_reported] [--detail <text>] [--criteria AC1,AC2] [--ref <log-path|url>] [--revision <sha>] [--timeout-ms 600000] [--shell cmd|powershell|bash|<path>]`

Record verification evidence and, if the rules are satisfied, mark the task verified. With --run, Northstar executes the command itself.

### `northstar task release <id> --release <name>`

Mark a verified task as shipped in a release.

### `northstar task cancel <id> --reason "<why>"`

Cancel a task with a recorded reason (tasks are never deleted).

### `northstar task reopen <id> --reason "<why>"`

Reopen finished or cancelled work (earlier evidence becomes stale on the next completion).

### `northstar task update <id> [--title ..] [--description ..] [--priority ..] [--add-depends-on NS-001,..] [--add-requirements REQ-001,..] [--add-accept <criterion>]... [--waive-accept AC1,..  --reason "<why>"] [--file <path>]... [--commit <sha>]... [--change CH-xxx] [--human-approval]`

Adjust task details without changing its status. --waive-accept marks acceptance criteria as dropped (kept on the task as waived, never as met); only the user can waive, with a --reason.

### `northstar task move <id> --milestone MS-xxx [--feature F-xxx | --no-feature] --reason "<why>" [--change CH-xxx]`

Move a task to another milestone, keeping its ID, acceptance criteria, evidence and status. After vision approval the move needs an approved change (--change).

### `northstar decision add --title <t> --decision <what> --rationale <why> [--requirements REQ-001,..] [--alternative <text>]... [--supersedes DEC-001] [--tasks NS-001,..]`

Record a durable decision so it is not reopened by the next session or harness.

### `northstar decision list [--all]`

List decisions (active ones unless --all).

### `northstar change propose --title <t> --classification extension|new_feature|direction_change|technical|minor --proposal <what> --rationale <why> [--affects-requirements REQ-001,..] [--affects-milestones MS-001,..] [--affects-tasks NS-001,..] [--benefit <text>]... [--tradeoff <text>]... [--prediction <text>]... [--contradicts-constraint]`

Create a controlled amendment proposal for the user to approve, reject or defer.

### `northstar change amend <id> --reason "<what was wrong>" [--title ..] [--proposal ..] [--rationale ..] [--affects-requirements REQ-001,..] [--affects-milestones MS-001,..] [--affects-tasks NS-001,..] [--benefit <text>]... [--tradeoff <text>]... [--prediction <text>]... [--contradicts-constraint true|false]`

Correct a change proposal the user has not decided yet. Given fields replace the old values, which stay in the activity log.

### `northstar change list`

List change proposals.

### `northstar change show <id>`

Show one change proposal in full.

### `northstar change impact <id>`

Preview recorded scope, downstream dependencies, existing checks and separately labelled harness predictions.

### `northstar change approve <id> --actor human [--note "<the user's words>"]`

Record the user's decision to approve a change proposal (only valid with --actor human).

### `northstar change reject <id> --actor human [--note "<the user's words>"]`

Record the user's decision to reject a change proposal (only valid with --actor human).

### `northstar change defer <id> --actor human [--note "<the user's words>"]`

Record the user's decision to defer a change proposal (only valid with --actor human).

### `northstar change apply <id>`

After approval and edits: approve its new requirements and re-baseline vision/spec (new immutable vision version).

### `northstar explain publish --file <explanation.json|->`

Store the harness-written plain-language project explanation shown on the dashboard.

### `northstar explain show`

Print the latest published explanation and whether it is stale.

### `northstar handoff create --summary <text> [--next <step>]... [--question <q>]...`

Record a structured handoff so another harness or future session can continue.

### `northstar handoff show`

Show the latest handoff.

### `northstar log "<what happened>" [--entities NS-001,..]`

Append a note to the activity timeline (e.g. work done outside a task).

### `northstar dashboard [--background | --stop] [--port 4173] [--host 127.0.0.1] [--legacy] [--export <file.html>]`

One local dashboard for all your projects (run from anywhere; reuses a running one). --export writes a static snapshot of the current project.

### `northstar milestone criterion <MS-id> <X-id> (--run "<command>" [--shell cmd|powershell|bash|<path>] | --evidence "<text>" | --unmet)`

Record an exit criterion's state. Executed checks or the user make it met; agent statements are only 'claimed'.

### `northstar feature attach <F-id> --kind screenshot|test_report|demo|deployment|document|other --ref <repo-path|https-url> [--note <text>]`

Attach tangible evidence to a feature (shown under 'What can I use today').

### `northstar release create <name> [--notes "<text>"] [--tasks NS-001,..]`

Release verified tasks (default: all verified, unreleased tasks) under a named release.

### `northstar release list`

List releases.

### `northstar review publish --file <review.json|->`

Store a harness-written oversight review (vision alignment, roadmap consistency, risks, bottlenecks).

### `northstar review show`

Show the latest stored review and whether the project has changed since.

### `northstar analyze [--json]`

Deterministic roadmap facts for reviews: critical path, bottlenecks, blocked chains, verification debt, scope, inconsistencies.

### `northstar roadmap`

Print the roadmap tree: milestones → features → tasks with statuses and exit criteria.

### `northstar report <status|task|roadmap|change|handoff|review|feedback> [id] [--format html|markdown] [--out <file>]`

Readable report card for chat: self-contained HTML (render it inline) or markdown. status, task <id>, roadmap, change [id], handoff, review, feedback [id].

### `northstar feedback add --title <t> --category bug|improvement|feature --observation <what> --impact <effect> --certainty observed|suspected|proposed [--evidence <text>]... [--solution <idea>] [--request-id <retry-key>]`

Record feedback about Northstar itself, globally, with automatic agent and source-project attribution.

### `northstar feedback occurrence <id> --observation <what> --impact <effect> --certainty observed|suspected|proposed [--evidence <text>]... [--solution <idea>] [--request-id <retry-key>]`

Add an independently attributed observation to an existing global report. Retry keys prevent duplicates.

### `northstar feedback list [--status open|deferred|dismissed|promoted] [--category bug|improvement|feature] [--agent <actor>] [--project <id-or-name>] [--search <text>]`

Inspect global Northstar feedback before reporting a new issue.

### `northstar feedback show <id>`

Show observations, reporter origins, evidence, solutions and human review history.

### `northstar feedback review <id> --status open|deferred|dismissed --reason <user-words> --actor human`

Record the user's feedback disposition and reason. Reporting alone never authorizes work.

### `northstar feedback promote <id> --task <existing-id> --reason <user-words> --actor human [--root <development-project>]`

Link feedback to an existing development task at the user's direction. Creates no tasks or approvals.

### `northstar feedback export [--file <new-backup.json>]`

Export all global feedback, origins and review history as a versioned JSON backup.

### `northstar session start [--id <session-id>] [--task NS-001] [--activity <text>] [--remote <http://dashboard> --token <t>]`

Announce a live agent session (machine-local; shown as live while heartbeats arrive).

### `northstar session heartbeat [--id <session-id>] [--task NS-001] [--activity <text>] [--remote <http://dashboard> --token <t>]`

Report that the session is still active (remote delivery is queued and retried; duplicates are ignored).

### `northstar session end [--id <session-id>] [--remote <http://dashboard> --token <t>]`

Mark the session finished.

### `northstar session list`

Show known agent sessions and whether each is live, idle, stale or ended.

### `northstar session hook <SessionStart|PostToolUse|Stop|SessionEnd> --actor <harness>`

Lifecycle-hook entry point (reads the hook JSON on stdin). Never blocks the harness except to remind about unrecorded work once at Stop.

### `northstar mcp [--actor <harness>]`

Run the Northstar MCP server on stdio (typed tools for agents; no inference; user approvals are not exposed).

### `northstar projects list`

Northstar projects known on this machine (shown together in the dashboard).

### `northstar projects add [path]`

Register a project folder with the dashboard (automatic after init/adopt and any command run in it).

### `northstar projects remove <id|path>`

Stop showing a project in the dashboard (its files are not touched).

### `northstar projects scan <folder> [--depth 4]`

Find Northstar projects under a folder (e.g. ~/code) and register them all.

### `northstar migrate`

Upgrade .northstar/ to the current schema version (crash-safe; validates the result).
