# Plan format (`northstar plan import --file plan.json`)

One JSON document. Everything is validated first; on any error nothing is written. `ref` values are local names
you invent to link items; Northstar assigns real ids (REQ-001, MS-001, F-001, NS-001). Links may use refs
or existing ids. Run `northstar plan example` to print a complete example.

```json
{
  "vision": "# Product — Vision\n…markdown…",
  "specification": "# Product — Specification\n…markdown…",
  "requirements": [
    {
      "ref": "auth",
      "title": "Users can sign in",
      "kind": "functional",
      "priority": "must",
      "description": "…",
      "acceptance": ["Valid login opens a session", "Bad login is rejected"]
    }
  ],
  "milestones": [
    {
      "ref": "m1",
      "title": "Foundation",
      "goal": "Runnable skeleton with persistence",
      "exitCriteria": ["App boots", "CI green"]
    },
    { "ref": "m2", "title": "Core", "goal": "…", "dependsOn": ["m1"] }
  ],
  "features": [
    {
      "ref": "f-auth",
      "title": "Authentication",
      "milestone": "m2",
      "requirements": ["auth"]
    }
  ],
  "tasks": [
    {
      "ref": "t1",
      "title": "Project scaffold",
      "milestone": "m1",
      "priority": "high",
      "acceptance": ["`npm test` passes on a clean checkout"]
    },
    {
      "ref": "t2",
      "title": "Login endpoint",
      "feature": "f-auth",
      "requirements": ["auth"],
      "dependsOn": ["t1"],
      "acceptance": ["Valid login returns a session", "Bad login gets 401"]
    }
  ],
  "decisions": [
    {
      "title": "Use SQLite",
      "decision": "Local SQLite for persistence",
      "rationale": "Offline-first requirement",
      "requirements": ["auth"],
      "alternatives": ["Postgres"]
    }
  ]
}
```

Fields

- requirement `kind`: functional | nonfunctional | constraint | exclusion. `priority`: must | should | could.
- task `priority`: critical | high | medium | low. A task needs `feature` (preferred) or `milestone`.
- task `acceptance`: concrete, checkable statements; evidence is later attached per criterion (AC1, AC2, …).
- task `requiresHumanApproval: true` for anything the user must judge themselves (look & feel, product feel).
- `provenance: "inferred"` for anything you assumed rather than were told.
- `existing: true` (adopted projects only) marks functionality that already exists; it is recorded as reported, never verified.
- After the vision is approved: `vision`/`specification` are rejected (use a change), `requirements` need
  `--change CH-xxx`, and milestones/features need `--reason "..."`.
