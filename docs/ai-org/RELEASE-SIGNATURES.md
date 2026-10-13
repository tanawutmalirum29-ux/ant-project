# Ant Kingdom — Release signature ledger (V2 template)
**No new release candidate is pending. No V2 signatures have been collected.** ROYAL-01's earlier CI/acceptance history is archived, not a signature for the next source SHA.

Read [governance protocol](https://github.com/tanawutmalirum29-ux/appointment-CEO/blob/proposal/governance-v2-hierarchical-signoff/docs/RELEASE-SIGNATURES.md) and [Team Registry](TEAM-REGISTRY.json). When CEO authorizes a new Round, Delivery freezes a unique candidate source HEAD, names relevant domain signers in the parent Issue and starts its receipt board.

| Gate | Role | Required | Current state | Exact candidate SHA | Evidence |
| --- | --- | --- | --- | --- | --- |
| Domain simulation/AI | DCEO-SYS | Per-round if affected | N/A — no round | — | — |
| Domain appearance | DCEO-EXP | Per-round if affected | N/A — no round | — | — |
| Domain platform | DCEO-PLAT | Per-round if affected | N/A — no round | — | — |
| Independent QA | DCEO-QA | Every Release | NOT_STARTED | — | — |
| **Final signer** | **DCEO-DELIVERY** | Every Release; LAST | NOT_STARTED | — | — |
| CEO main merge | CEO | Only if SIGNATURE_READY | HOLD — no round | — | — |

**Signature requirements:** actual Issue/PR permalink per signer's authorized Role ID, direct manager, full 40-character SHA, source and GitHub Run/Artifact links, limitations and verdict. Relevant domain and Independent QA receipts MUST refer to the **same integrated SHA**. Delivery signs last only if all required signers present with no `QA_HOLD`. Changed HEAD revokes release-ready status. Shared GitHub login is NOT cryptographically independent identity.

**Future improvement:** Platform/Delivery shall implement an automatically triggered machine-readable `SIGNATURE_READY` verifier that validates roster roles, SHA, each receipt URL and actual CI conclusion. The V2 proposal has not installed the verifier: CEO must not mistake this sample board for an enforced signature gate.
