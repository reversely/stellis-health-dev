# ADR 0046: Conversation organization controls

Status: accepted, 2026-10-16. Ticket #163.

## Context

Stellis currently allows multiple categories per conversation and opt-in automatic category decisions. A full-width Vocabulary card and Categories disclosure sit before the selected conversation document. The user's crop and browser comparison show these utilities displacing Notes and Transcript. Granola's tutorial puts a folder control by note metadata and Spaces in navigation. In the signed-in Otter account, Move lives in the conversation More options menu and opens a folder dialog. Otter has single-folder movement semantics; Stellis categories are independent labels.

## Decision

Keep the SQLite category model and its manual override/automatic decision rules. Open per-conversation category checkboxes and retry state from **More options → Categories** in a small modal; do not label it Move. Keep the global Vocabulary editor on the library surface and hide it on conversation and profile routes. Preserve the existing Record and Import actions. Add familiar icons alongside text on the relevant Record, Save, and Download controls.

## Consequences

The selected document starts closer to the conversation title. Categories remain reachable in one menu action and are still persisted through the same API. A dialog with focus return and Escape close keeps keyboard access. This changes presentation only; it does not implement folders or Spaces.
