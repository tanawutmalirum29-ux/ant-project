> **ARCHIVAL / SUPERSEDED ON V2 ACTIVATION:** คำสั่งสาย 17 AI เดิมในไฟล์นี้เป็นประวัติ ไม่ใช่ผังใช้งานในรอบใหม่. ให้ดู [ผัง V2 ปัจจุบัน](ACTIVE_TEAM.md), [ทะเบียนตำแหน่ง](TEAM-REGISTRY.json), [คู่มือเปลี่ยนผ่าน](GOVERNANCE-V2-HANDOFF.md) และ [Governance V2 proposal](https://github.com/tanawutmalirum29-ux/appointment-CEO/pull/2). เมื่อ V2 ได้รับอนุมัติ คำสั่ง CEO→Engineer หรือ QA→CEO ตรงที่ข้ามสายจะใช้เป็นคำสั่งปฏิบัติไม่ได้. ไฟล์เดิมด้านล่างเก็บเป็นหลักฐานประวัติเท่านั้น.

> **ขั้นตอนสำคัญก่อนเริ่มงานใหม่:** [คู่มือแต่งตั้งต่อเป็นทอด ๆ 17 แชท](ACTIVATION_CHAIN.md) — เริ่มจาก CEO ออกคำสั่ง CTO, CTO ออกคำสั่งหัวหน้า 5 คน, หัวหน้าออกคำสั่งลูกน้องอีก 10 คน; ทุกคนต้องส่ง READY กลับก่อน CEO เปิด ONE ROUND. **เจ้าของเพียงส่งต่อข้อความ ไม่ต้องคิดคำสั่งเอง.**

# Ant Kingdom — CEO Handoff / Start a new chat

**This is the handoff from the final AI-HEAD to the new CEO; 13 October 2026 (Asia/Bangkok).**

## Live gameplay checkpoint prior to governance-only appointment
Repo: https://github.com/tanawutmalirum29-ux/ant-project
Last game/source main SHA: `36a799ff7db9bee58fc20f9b192ca51488796291`.
At the closing checkpoint: **0 open Issues, 0 open PRs**, Round 2 fully completed. The subsequent 17-role documentation commit should not modify gameplay, but it does change the main SHA. New CEO MUST fetch latest SHA itself.

**Verified real QA proof:** [Actions #38365132882](https://github.com/tanawutmalirum29-ux/ant-project/actions/runs/38365132882) SUCCESS on GitHub PR #39 tested synthetic merge SHA `3ee87f4661c00850b6e99cafd7cda3815584d6f3` (do not confuse with main SHA). **60/60 Chromium cases PASS** across actual 320×568,390×844,768×1024,844×390,1440×900; **152/152 unit tests PASS**, build exit 0, legacy browser scripts 3/3 Exit 0; no JS page/console errors. Final PR #39 merged, browser QA Issue #33 and others closed.

**Completed source work:** AI-1 in-flight miner/path PATH-01 B3 and 10 tests (PR #29); AI-2 unique bounded combat rally formation FORM-01 C4 + 14 tests (PR #30); real GitHub-hosted Chromium audit CI (PR #31); mobile tactical dock hit-target CSS (PR #34); final camera/roster/modal harness corrections (PR #39).

**Not yet implemented:** R4 conservation-safe ecology design in `docs/development/R4_ECOLOGY_DESIGN.md` (PR #36 **docs only**, no renewable production); R5 simulation profiling plan in `docs/development/R5_PERFORMANCE_PROFILING_PLAN.md` (PR #38 **docs only**, no benchmarks/optimizations); versioned Save/Load and AWS production deployment have not been proven. Existing README may still refer to historically resolved tasks: treat them as historical until reviewed live.

## CEO MUST DO first, in its newly opened dedicated ChatGPT chat
1. Accept the CEO appointment from `docs/ai-org/roles/CEO.md`. Read [Operating Protocol](OPERATING_PROTOCOL.md), [Role Index](README.md), `docs/GAME_SYSTEMS.md`, R4 ecology and R5 performance plans. Use connected GitHub repository tools. If GitHub is unavailable, report BLOCKED and a one-line courier resolution; don't fabricate source or CI inspection.
2. Independently inspect current latest main SHA, open Issues, PRs, last Actions and overall game source/architecture. Preserve previously passed browser/units and versioned evidence.
3. Understand user has approved **17 separate role-specific ChatGPT conversations**: CEO 1, CTO 1, 5 leads, 10 engineers. Separate chats do NOT talk to each other. Owner's ONLY job is to paste clear `📨 ส่งต่อถึง [specific role ID]` messages at the end of each AI response into that role's chat. Do not make owner choose engineering details or read git patches.
4. Choose ONE meaningful next player-facing development mission and open its master GitHub Issue with IN/OUT, acceptance tests and base SHA, then send CTO a complete courier order to decompose and dispatch. Do not open several simultaneous big missions or start implementing every roadmap item automatically.
5. Oversee through CTO and leads; QA-LEAD sends veto-eligible PASS/HOLD independently to CEO. Each of 5 heads must confirm FINAL VERIFIED or N/A on identical tested Integration SHA, CTO verifies integrated full suite, QA tests exact SHA, CEO reviews final diff and only CEO approves/merges `integration/Rxx → main`.
6. At round closure, tell owner game progress and unresolved verified blockers; deployment, paid services and public release require separate authorization. Maintain this organization until owner changes it.

## How to appoint
The owner first pastes the whole [CEO role command](roles/CEO.md) into a new CEO ChatGPT conversation, then appoints the other 16 by pasting each [role index](README.md) command into its own fresh conversation. The old AI-HEAD conversation retires after publication of this charter; it must not also act as the new CEO.
