# CODEX_HANDOFF

## Goal and phase
Alpha balance fix: user authorized fixing boss coins and HP calculation, keeping BGM empty, testing and submitting to GitHub. Base: `cc5d408ed6116f1b62990450ce7aef5be397c6ff`. Runtime version: `2026-11-04.2`.

## Latest completed work
- Restored `earn()` in bossDown; it was accidentally inside a line comment. Payout occurs before chapter advancement and uses existing economy multipliers. Existing openPack membership checks prevent duplicate grants.
- Removed the HP floor derived from ordinary-round total damage. Chapter base and early single-shot floor are capped as a whole at previous boss HP x12; chapter1 / missing prior records use chapter base x12.
- First attempt stores a versioned whole-HP snapshot in the existing bossD field. Same-chapter retries, upgrades, equipment changes and reload retain HP. Old saves keep their previously locked single-shot basis, discard the total-output floor, and get the corrected snapshot on the next attempt.
- Normal damage accounting clips overkill. Prestige clears boss snapshots, previous-boss HP and normal-output history to prevent cross-run carryover.
- Card coefficients, chapter mechanics, save key/JZMC1 format, embedded art and SFX are preserved. Background music remains empty.

## Owning files
- `index.html`: combat, boss snapshot, payout, prestige and telemetry version.
- `tests/boss.test.cjs`: 11 tests against production boss/combat entry points.
- `tests/save.test.cjs`: 13 persistence tests, including HP snapshot export/import.
- `README.md`: current boss rules and combined test command.

## Verification
- `node --test tests/save.test.cjs tests/boss.test.cjs`: 24 tests pass. The old game reproduced missing reward, output-inflated HP, incomplete cap, retry drift and prestige carryover before the patch.
- Browser acceptance: 9 groups pass. Actual damage -> half-health cinematic -> boss death -> 540 coins once -> three cards -> chapter2 -> visible settlement. Real reload preserves reward/chapter and same-chapter HP after upgrades. Failure pays nothing; actual retry button preserves HP. Legacy migration, full cap and 390px mobile settlement pass.
- Standard develop-web-game client: two input bursts, shots2->4, normal pack opening and coin increments; no browser error artifacts. Gameplay, phase-transition and desktop/mobile settlement screenshots inspected.
- Seeded production-logic simulation: 132 normal->boss paired cases plus20 three-round new saves, 324 rounds total; all ended before180s and no page errors. Compared with base on matching seeds: no sampled boss HP increases; normal behavior/rewards unchanged apart from correcting effective-damage metrics. Synthetic first-chapter fire wins0->11/12 and gravity0->9/12; chapter3 fire1->4/12 and gravity5->11/12. These are diagnostic bot counts, not human win rates or full-game balance proof.
- Inline JS syntax, diff whitespace, unchanged embedded art/SFX and empty BGM verified. Test uploads blocked/intercepted; no test scores or telemetry sent to production.

## Risks and boundaries
- First-attempt snapshot intentionally retains the existing opportunity to challenge before upgrading; HP no longer rises on retries or after a secret-stage purchase. This makes upgrading effective and is documented.
- Chapter3 still intentionally resists fire and strengthens corrosion. No card tuning in this change.
- Phone checks are browser emulation. Physical-device performance, complete chapter/endless progression and real player balance/retention remain unverified.
- No retroactive compensation for bosses defeated on older versions; old saves have no reliable per-boss payout ledger.
- DEBUG_HANDOFF.md not created: no repeated failed game-fix hypothesis. Targeted regression tests reproduced the causes and passed after the minimal fix.

## Next safest task
Observe first-20-minute real-player boss attempts and income after this version. Tune card coefficients only with per-chapter and acquisition-cost evidence. Revert this commit to roll back; save format remains compatible.
