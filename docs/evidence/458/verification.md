# Onboarding task policy (#458)

Review now includes Suggest tasks for starter and source-proposed notebooks. Explicit choices persist across Back/reload and become notebook On/Off policies on completion. Existing and inherited policies remain unchanged without an explicit choice. Reopening clears stale setup choices and displays current effective policy.

## Verification

- Full Python suite: 353 passed, 25 subtests passed, 1 skipped. JavaScript: 148 passed. Focused onboarding/source tests: 12 passed.
- Fresh-account browser: opted Projects in and Learning out, navigated Back, reloaded, completed, and checked persisted policies. Reopened setup preserved the enabled policy without another choice.
- Actual GN100 local inference: each new notebook produced a draft from its source. Only the enabled notebook published a follow-up suggestion. This uses a fresh account on the existing GN100 runtime, not a freshly installed machine.
- Stored source-review fixture: checkbox persisted through reload; completion enabled suggestions and filed its selected source once. This is not a live Google scan.
- Final UI rerun after CSS correction: fourteen width/theme states, zero geometry findings. Desktop dark and phone light screenshots visually inspected; checkbox and helper occupy the notebook width without the earlier narrow-column wrapping. Both theme captures retained.
- Unit coverage also verifies untouched inherited On stays inherited, explicit reopened Off, and rejection of non-boolean choices.

## Reference and limits

Actual HTML screen 9 shows collection-grouped notebooks, selectable agents, source review and Set up N notebooks / Drafts only. This control makes the existing task policy actionable within that review; it does not copy illustrative project names, source counts or promised actions. Screenshots preserve the richer sidebar and current controls.

This ticket does not prove the entire prototype. Confirmed sending, coordinated daily brief, filing Undo/Compare, native capture, cloud execution and the user-specific integration retry remain separately tracked gaps.
