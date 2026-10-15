# UI RENOVATION V1 — GitHub Issue-first Relay

**Only Issues and Pull Requests are required.** No M00000, Receipt, Ledger or lengthy repeated appointment script. Governance: https://github.com/tanawutmalirum29-ux/appointment-CEO/blob/main/RULES.md

## OWNER's complete relay format

First appointment in a separate chat:
- ENGINEER-A: AP-ROLE #139 https://github.com/tanawutmalirum29-ux/ant-project/issues/139
- ENGINEER-B: AP-ROLE #140 https://github.com/tanawutmalirum29-ux/ant-project/issues/140
- ENGINEER-C: AP-ROLE #142 https://github.com/tanawutmalirum29-ux/ant-project/issues/142
- QA REVIEWER: AP-ROLE #145 https://github.com/tanawutmalirum29-ux/ant-project/issues/145

Every later update: just **MN #139**, **MN #140**, **MN #142** or **MN #145** to the relevant existing chat. The AI must read Issue description/latest comments and write its real acknowledgement/report/question to that Issue when it has permission. An Issue comment never automatically summons another ChatGPT chat.

## Responsibilities and issue pairs

| Role | First task | Second task | Shared constraints |
|---|---|---|---|
| Coordinator | #138 shell / overlay / adapters | PR #146 integration / QA | Only Coordinator modifies app.js, index.html, legacy CSS and common shell |
| ENGINEER-A | #139 HUD / one-button layer toggle | #144 Settings / Seed | Exclusive home.js/home.css/settings.js/settings.css and focused tests |
| ENGINEER-B | #140 Military Squad A/B | #141 Ant roster | Exclusive military.js/military.css/ants.js/ants.css and focused tests |
| ENGINEER-C | #142 Nursery / eggs | #143 Rooms / dig | Exclusive nursery.js/nursery.css/rooms.js/rooms.css and focused tests |
| QA Reviewer | #145 independent matrix and visual test | independent final release review | No false hardware-certification, no self-approval |

Technical materials: [Master Plan](UI_RENOVATION_V1_MASTER_PLAN.md) · [G1 Contract](UI_RENOVATION_V1_CONTRACT.md) · [Wireframes](UI_RENOVATION_V1_WIREFRAMES.md) · [QA Matrix](UI_RENOVATION_V1_QA.md).

## Engineer response pattern — a comment in their Issue

**Design review:** ROLE / DESIGN_REVIEW_COMPLETE / risks / API requests / evidence / no code yet.

**Implementation:** ROLE / PR URL / full tested SHA / modified files / native+browser QA / remaining failures / RESULT or BLOCKED.

**Coordinator answer:** FROM COORDINATOR / TO ROLE / action+API+scope / target branch / START or HOLD / exact G1_FROZEN SHA.

## Status and safety

- The A/B/C design reports are relayed in Issues #139, #140, #141, #142, #143, #144. These are sourced from OWNER-supplied reports; Coordinator does not impersonate another agent.
- **Currently:** G1_PENDING / DESIGN_COMPLETE / ALL ENGINEER IMPLEMENTATION_HOLD. Existing integration SHA is a design reference, NOT G1_FROZEN.
- Start requires real tested shell, frozen adapter signatures, tested SHA and explicit START comment in Issue #138 and each worker Issue. No new feature code/branch/PR before that authorization.
- Engineer code PRs target **feat/ui-renovation-v1-integration**. Only after complete independent QA may PR #146 be merged into main.
