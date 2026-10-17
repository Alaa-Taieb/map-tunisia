# Northstar workflows

All commands: `northstar ...`. Always pass `--actor codex` when writing.

## initialize

Goal: turn the user's idea into an approved vision, specification, roadmap and first task.

1. Understand the idea. Ask **only** questions whose answers change the product (max ~5, each with your
   recommended default). Don't interrogate.
2. Run `northstar init --name "<Product>" --idea "<the user's idea in their words>"` yourself, in the project folder
   (create the folder and `git init` first if it's a brand-new project). It creates `.northstar/` and the agent adapters.
3. Write the **vision** (see `vision-template.md`) and a **specification** (requirements, architecture, data model,
   interfaces, acceptance criteria). Draft them inside a plan file, not directly into `.northstar/`.
4. Build one plan JSON (see `plan-format.md`): requirements → milestones → features → tasks (with `dependsOn`
   and acceptance criteria). Make it dependency-aware: foundation first, a usable vertical slice early,
   stabilisation and release last. Keep tasks small enough to finish in one sitting.
5. `northstar plan import --file plan.json --dry-run --actor codex`, fix any errors, then re-run without `--dry-run`.
6. **Present the proposal to the user concisely** (what it is, the 3–5 pillars, milestones in one line each,
   the first task, any assumptions). Do not paste the spec. Ask them to approve or change direction.
   Revise by re-editing `.northstar/vision.md` / `specification.md` and adding requirements/tasks via the CLI —
   this is allowed freely until approval.
7. Only after an explicit yes: `northstar vision approve --actor human --note "<their words>"`.
8. Publish the human-friendly explanation (see `#explain`), propose the first task, and start it.

## adopt

Goal: bring an existing repository under Northstar **without inventing history**.

1. `northstar adopt --idea "<what the project appears to be>"` — initializes in adopted mode and prints a factual
   inventory (languages, manifests, tests, docs, git history). `northstar inventory --json` re-prints it.
2. Inspect the repository further (README, structure, tests, git log). Distinguish evidence from inference.
3. Build a plan where every item inferred rather than stated has `"provenance": "inferred"`; existing
   capabilities become tasks with `"existing": true` (recorded as _reported, unverified_ — never verified).
   State unknowns explicitly in the specification ("Unknown: …"). Do not fabricate milestones, dates or tests.
4. `plan import --dry-run`, then import, then show the user the proposed vision + feature inventory and ask
   for corrections. Approve with `vision approve --actor human` only after they confirm.
5. Offer to verify existing features: run real checks with `task verify <ID> --run "<cmd>" --method ...`.

## review

Northstar supplies facts; you supply judgement; the result is stored so the next agent and the dashboard see it.

1. Gather facts: `northstar status --json`, `northstar analyze --json` (critical path, bottlenecks, blocked chains,
   verification debt, scope mix, roadmap inconsistencies), `northstar validate`, `northstar reconcile`, and read
   `.northstar/vision.md` plus the code that was actually built.
2. Judge, by kind:
   - `vision_alignment` — does what was built (and what is planned) still serve the approved vision? Compare with
     the original version (`vision-history/v1.md`). Name deviations and unplanned work that shifts direction.
   - `roadmap_consistency` — dependency order, milestones whose tasks no longer add up to their goal, missing work
     for must-have requirements, tasks that should be split or merged.
   - `risk` / `bottleneck` — what is most likely to stall or fail, and what unblocks the most work.
3. Store it (`review.json`, then `northstar review publish --file review.json`):
   ```json
   {
     "kind": "vision_alignment",
     "summary": "2–3 sentences",
     "findings": [
       {
         "severity": "high|medium|low|info",
         "title": "…",
         "detail": "…",
         "entityIds": ["NS-012", "REQ-004"],
         "recommendation": "…"
       }
     ],
     "recommendations": ["…"]
   }
   ```
   High-severity findings appear in the dashboard's "Needs your attention".
4. Tell the user the gist in plain language. Fix bookkeeping yourself (record missing completions, run missing
   verifications); escalate scope questions as change proposals.

## release

1. `northstar status` — only verified tasks can ship. Verify anything reported-but-unverified first, or leave it out.
2. Check the release milestone's exit criteria (`northstar roadmap`) and record them with `milestone criterion --run`.
3. `northstar release create v0.1.0 --notes "what's in it"` (defaults to all verified, unreleased tasks; `--tasks` to choose).

## propose-change

Use when a request is a new feature or changes product direction, constraints or architecture commitments.

1. `northstar change propose --title "..." --classification new_feature|direction_change|extension --proposal "..." --rationale "..." --affects-requirements REQ-001,REQ-004 --affects-milestones MS-002 --benefit "..." --tradeoff "..." [--contradicts-constraint]`
2. Show the change card (`northstar report change <CH-id>`, rendered inline; see the skill's _Showing reports in chat_),
   then tell the user in 3–5 lines: what, why, what it affects, trade-offs, and your recommendation.
   Before approval, run `northstar change impact <CH-id>` and explain the recorded downstream work and checks to revisit.
   Link affected requirements, tasks or milestones when proposing; missing links mean unknown impact. Record semantic
   predictions with repeated `--prediction "..."` flags; these remain attributed harness statements, never verification.
   If a proposal the user has not decided yet is wrong or incomplete, correct it with `northstar change amend <CH-id> --reason "..." --affects-requirements ...`
   (given fields replace old values; history is kept) and tell the user what changed.
3. On approval: `northstar change approve CH-001 --actor human --note "<their words>"` (or `reject` / `defer`).
4. Make the edits: new requirements (`req add --change CH-001`), roadmap/tasks (`plan import --change CH-001 --reason ...`),
   and, if the vision/specification text changes, edit `.northstar/vision.md` / `specification.md`.
   Change existing approved items in place, each with `--change CH-001` and a `--reason` (both land in the history):
   `northstar milestone edit MS-001 --exit-criterion X1 --text "..." --reason "..." --change CH-001` rewords an exit criterion and keeps its ID and met/unmet state;
   `northstar req update REQ-001 --accept "..." --reason "..." --change CH-001` replaces the acceptance list (`--add-accept` / `--remove-accept` change one item).
   `northstar task move NS-001 --milestone MS-003 [--feature F-004 | --no-feature] --reason "..." --change CH-001` moves a task
   and keeps its ID, acceptance criteria, evidence and status; never cancel and recreate a task to move it.
   `plan import` only creates items; it never updates existing ones.
5. `northstar change apply CH-001` — re-baselines the vision (new immutable version, original preserved) and
   approves the new requirements.

## handoff

Before stopping or switching harnesses (if you used `session start`, finish with `northstar session end`):
`northstar handoff create --summary "where things stand" --next "first thing to do" --next "then this" --question "open question for the user"`.
Make sure in-progress tasks are accurate (complete, block, or leave in progress honestly) and **commit and push**
`.northstar/` along with the code so the next agent (and the dashboard) sees it.

## explain

Write for a non-expert reading in 30 seconds. Save JSON and publish:

```json
{
  "headline": "One sentence: what this is and where it stands",
  "overview": "2–4 sentence plain-language description of the product.",
  "pillars": [{ "title": "Pillar", "body": "one line" }],
  "sections": [
    { "title": "What works today", "body": "verified features only" },
    { "title": "Reported but not yet verified", "body": "…" },
    { "title": "Challenges", "body": "…" },
    { "title": "Recent changes", "body": "…" },
    { "title": "Next up", "body": "…" }
  ]
}
```

`northstar explain publish --file explanation.json --actor codex`. The dashboard shows when it was written and
flags it stale when project state moves on.
