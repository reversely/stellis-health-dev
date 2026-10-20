# Notebook work verification

References: actual wireframe screens 3–4 specify notebook Activity/Brief/Conversations/Files/Tasks, review and work states, agents and notebook instructions. Screen 10 supplies Home recent-progress direction. The existing collection tree, shader, icons and editors are retained.

Implemented: persisted activity derived from pending task suggestions, managed jobs, delegated work and local artifacts; All/Needs you/Working/Done filters; existing approval/dismiss and artifact edit/save/discard actions; actual Stop; contextual notebook composer; instructions with stale-write protection; Home review/work counts and recent result. Brief, Conversations, Files and Tasks use existing notebook content. Production delegation now creates a local draft for review, not an automatic Gmail write; sample-specific compliance and deadline instructions were removed.

GN100 Chromium evidence:
- Real local HTTP account and stored notebook: task approval appears in Tasks, pending count decreases, instructions survive reload and reject a stale revision, reviewed document files as an editable note.
- Actual managed local inference follows the test notebook instruction to include “lantern” and cites its source note. A second actual managed request is stopped from Activity and persisted as interrupted.
- Final layout run uses an explicitly seeded finished reply, not a second inference claim. Desktop and phone screenshots inspected; separate tabs hide Activity, and the existing sidebar remains available. Seven widths (360–1920), both themes: zero layout failures and warnings. No browser page errors.
- Production delegation local-draft behavior is covered by a collected unit test; no new live two-stage delegated run is claimed.

Screenshots: activity-1440-{light,dark}.png and activity-390-{light,dark}.png. Browser scripts and live results accompany this record.

Remaining gaps: cross-agent mentions/dispatch, automatic mail-triggered work (#438), coordinated daily brief, filing Undo/Compare and in-app confirmed sending. Files currently exposes existing notebook pages/notes. Activity is bounded to recent jobs and does not constitute a complete audit archive. Team assignment changes in another tab require reload.

Final checks: 339 Python tests and 25 subtests passed, 1 skipped; 148 JavaScript tests passed. Existing framework deprecation warnings remain.
