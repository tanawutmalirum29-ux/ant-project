# Ant Kingdom — AI Agent Reports

This is the **active GitHub reporting area** starting Round 02 (2026-10-13). Reports are per-agent and per-round. Each agent updates their own Markdown file in their **own branch and Draft PR**, and also posts milestones immediately as comments in their dedicated GitHub Issue so the incoming AI-HEAD can follow progress before merging.

| Owner | Per-round report | Live Issue inbox |
|---|---|---|
| AI-1 Simulation | [AI-1/ROUND_02.md](AI-1/ROUND_02.md) | [Issue #23](https://github.com/tanawutmalirum29-ux/ant-project/issues/23) |
| AI-2 Combat | [AI-2/ROUND_02.md](AI-2/ROUND_02.md) | [Issue #24](https://github.com/tanawutmalirum29-ux/ant-project/issues/24) |
| AI-3 UI QA | [AI-3/ROUND_02.md](AI-3/ROUND_02.md) | [Issue #25](https://github.com/tanawutmalirum29-ux/ant-project/issues/25) |
| New AI-HEAD | [Handoff and decision log](../development/NEXT_HEAD_HANDOFF.md) | [Issue #26](https://github.com/tanawutmalirum29-ux/ant-project/issues/26) |

Required sections in EVERY report update:
- Task/stage/date (Asia/Bangkok), pinned original base SHA, actual main SHA when reviewed, branch HEAD SHA and PR/Issue URLs.
- Exact changed-file list and work completed versus pending.
- Command, environment/version, actual exit code, PASS/FAIL/NOT_RUN counts and baseline-known versus introduced failures.
- CI links, artifact paths, screenshots for real browser tests and console/JS error status, or explicit NONE/UNKNOWN.
- Risk/blocker, action requested of AI-HEAD, next step. Do not invent QA passes or hide failing tests.

Publish updates to your Issue immediately, and commit updated Markdown to your own branch before review. The new AI-HEAD reads all Issue comments and the branch's report file before PR approval. **Never push directly to main, edit another agent's report or overwrite a past round's report.** Next work round gets `ROUND_03.md` in each agent's folder.

Current task board: [Round 2 Work Board](../development/ROUND_02_WORK_BOARD.md).