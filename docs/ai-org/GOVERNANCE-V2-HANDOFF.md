# Migration to Governance V2 — activation checklist (PROPOSAL)
This page is a handoff for the new AI CEO and Delivery deputy when Owner authorizes changing the org. **Nothing here reopens ROYAL-01 or assigns gameplay work.**

## Adopt a single charter
1. Review and approve [appointment-CEO governance Draft PR #2](https://github.com/tanawutmalirum29-ux/appointment-CEO/pull/2) **before** activating V2 roles. Review companion game-repo org-chart Draft PR. Legacy fixed 17-AI `ACTIVATION_CHAIN.md` is historical, not an alternative active chain.
2. CEO defines only required domains/deputy counts and budget per Round; appoints Delivery via its individual template. Delivery appoints domain deputies inside slots; each successive supervisor appoints its own direct reports; never CEO→VIS-E.
3. Delivery and its roster steward initialize `TEAM-REGISTRY.json` only with **real chat ACKs**. Each appointment: Role ID, parent, Issue, scope, budget slot, ACK permalink, status. Issue alone ≠ spawned AI. Publish updated `ACTIVE_TEAM.md` tree.
4. Configure automatic CI: fast change-level smoke, full integrated risk-appropriate QA, then separately automated Release-signature structure verifier. **No Owner GitHub clicks**.
5. For every feature/task request, route one edge per message. For cross-team work requests, go up to the common ancestor and down. For all-level Assistant requests, go up to CEO staffing/capacity decision **without DCEO-QA gameplay inspection**, then authorize direct-parent appointment.
6. Domain deputies sign actual candidate SHA after personal QA, independent QA may HOLD; Delivery signs **last**, CEO only checks receipt/ready status and merges main. The same 40-character SHA must appear in final required signatures.
7. If final PR has no required verifier/QA controls installed, label `GATE_NOT_CONFIGURED` and keep hold; do not claim green based solely on a Markdown signature list. Source/CI checks and Issue signoff remain required until automation is installed.

No gameplay files or current released `main` are affected by this proposal; no V2 staff are ACTIVE until actual Owner/CEO transition.
