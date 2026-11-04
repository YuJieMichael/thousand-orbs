# CODEX_HANDOFF

## Goal and phase
Alpha polish: implement the four user-approved improvements, keep background music empty, test, and submit to GitHub.

## Scope
- Mobile: two columns, readable complete descriptions, separate details, larger targets; preserve tap-to-equip and the current view.
- Saves: detached validation, unchanged JZMC1 format and save key, one previous valid backup, explicit recovery, export/retry on failure.
- Leaderboard: display success only after a successful response; retain nickname and retry controls on failure; guard duplicate submissions.
- Onboarding: short intro, contextual tips, first affordable upgrade guidance; full rules remain available in settings.

## Owning files
- `index.html`: game, UI, persistence and client service calls.
- `tests/save.test.cjs`: Node built-in regression tests against the actual single-file save boundary.
- `README.md`: current controls, recovery and test instructions.

## Verification
- `node --test tests/save.test.cjs`: 12 tests pass.
- Inline JavaScript syntax, unchanged embedded art/SFX, save key and JZMC1 compatibility checks pass. Background music is empty.
- Browser acceptance: 13 scenario groups pass, including corrupt-save recovery, failed-import rollback, export/retry, read-denied temporary play, nickname offline/rejected/success responses and duplicate Enter protection.
- Mobile emulation: 320x568, 360x640 DPR2, 360x800 DPR3, 390x844. Two columns, 14px complete descriptions, 44px detail/filter targets, zero clipped descriptions or document overflow. Details do not equip; mouse/touch/keyboard equipment retains the card anchor and panel.
- New-player intro, first upgrade, old-tree migration and star-map view preservation pass. Gameplay Space does not fire from menu controls and still works immediately after Start.
- Synced upstream base `b6e0415`: preserved keystone switches and the boss output-floor cap; tested toggle persistence, immediate bar refresh after purchase/respec, and capped boss HP. Save validation preserves these new fields.
- Standard develop-web-game smoke passes. Gameplay, card/detail, recovery and upgrade screenshots were visually inspected; no unexpected browser console/runtime errors in acceptance.
- Tutorial messages were checked at 320/360/390/1366 widths: all fit the banner without truncation; mobile canvas-scaled tutorial text is approximately 15-16 CSS px.
- All browser-test uploads are intercepted; no test scores or telemetry are sent to production.

## Remaining boundary
Phone checks are browser emulation. Physical-device performance, whole-game balance and player retention are outside this change.

## Next task
Observe these flows on physical phones and conduct the first-20-minute player test. Whole-game balance and retention remain unverified.
