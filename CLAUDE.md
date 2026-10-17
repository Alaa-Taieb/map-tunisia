<!-- northstar:begin -->

## Northstar project management

This repository is managed by Northstar. Project state lives in `.northstar/` (committed to Git), not in chat history.

- Before planning or starting significant work, run `northstar status` and follow the `northstar` skill (.claude/skills/northstar/SKILL.md).
- Tie work to roadmap tasks: `northstar task start <ID>` before coding, `northstar task complete <ID> --summary "..."` after.
- Completion is a claim; verification needs evidence (`northstar task verify <ID> --run "<test command>" --method <name>`).
- Never hand-edit `.northstar/*.json`, and never change `.northstar/vision.md` after approval; propose changes with `northstar change propose`.
- When a step needs the user's hands (account login, payment, device, manual test), file an ask with a tutorial page (`northstar ask add`) after trying, and show it with `northstar report ask <ID>`.
- Only the user approves the vision, scope changes and acceptance. Ask first; use `--actor human` only after they confirm.
- End a session or switch agents with `northstar handoff create --summary "..."`.

<!-- northstar:end -->
