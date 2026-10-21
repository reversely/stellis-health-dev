# Follow-up task review

Verified on GN100 against wireframe screen 1 (draft and proposed task) and screens 3-4 (review before task changes). The actual HTML text was reread before implementation. No illustrative project names or sample actions are inserted into product copy.

## Actual local inference

The isolated browser account had a notebook with task suggestions enabled, Writing, a notebook steward and a reviewer, and one source note recording measurements but no signed approval. The real local planner and supporting agents ran through NemoClaw/OpenClaw. Final drafting generated a quoted follow-up beside the artifact. Editing the task, reloading, opening notebook Activity and accepting there worked. Repeating acceptance through the API still left exactly one task; the originating thread showed Task added.

Visual inspection caught a generated suggestion to locate or create a missing approval record. Stronger prompting alone did not remove it. Validation now rejects that contradiction and supplies a concrete correction to the existing bounded response retry. The final actual run passed and proposed locating the missing record without creating a substitute. Exact-quote validation establishes which retrieved excerpt was used; it is not a general proof of semantic correctness. Proposals remain reviewable and editable.

## Persistence and UI checks

Focused tests reject invalid source indexes, unmatched quotes and the observed missing-authorization contradiction. Successful completion publishes one suggestion atomically; repeated completion/acceptance produces one task. Failed/interrupted jobs, disabled agent assignments and notebooks with task suggestions Off publish none.

A separate UI-only fixture verified editor text survives polling on both chat and notebook Activity, dismissal survives reload in both surfaces and creates no task. It also audited seven widths in both themes for both surfaces. Source-link tap-target warnings were fixed by making those controls 44px tall. Final review controls use the existing artifact action/input styling. These fixture checks establish UI behavior, not inference; live-browser.py covers actual inference separately.

Full Python suite: 350 passed, 25 subtests passed, 1 skipped. JavaScript: 148 passed. Final affected Python tests: 27 passed. Layout evidence and screenshots are retained alongside this note; desktop and narrow views were inspected.

New onboarding notebooks currently inherit task suggestions Off. #458 tracks an explicit opt-in during setup review without changing existing notebook policies. Sending, daily brief, filing Undo/Compare, native capture and cloud deployment verification remain separate full-workflow gaps.
