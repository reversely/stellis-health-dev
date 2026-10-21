# Notebook collaboration verification

Reference: actual wireframe screens 1 and 5 describe gathering notebook sources, asking another assistant to check them, showing each step with Stop, and returning a reviewable draft in the original thread. Explicit mentions alone do not establish this behavior.

Verified on GN100 using isolated accounts. The isolated browser fixture uses three notebook deployments with distinct roles, one source note containing recorded measurements and a missing approval record, and notebook instructions prohibiting an unsupported approval claim. Inference uses the existing local NemoClaw/OpenClaw route; no web-search key or cloud inference is used.

Observed:

- Actual local planning selected the notebook steward and reviewer, both completed source-backed turns, and the originating agent produced a canonical document artifact.
- Step state and the artifact survived reload. A later run additionally reloaded during planning and retained the active work.
- Stop during a new plan prevented a second artifact.
- Turning the active supporting agent Off interrupted its child job and parent request, skipped subsequent steps and produced no final artifact.
- One initial draft incorrectly described already-completed checks as future work. Final synthesis instructions were corrected and a browser assertion added for that regression.
- A subsequent run failed at final inference after both supporting steps succeeded. The failure was retained visibly; diagnostic trace events now distinguish rejected envelopes, process failures and response-processing errors. This failure is not counted as a successful end-to-end proof.

Before the final diagnostic additions: 347 Python tests passed, 25 subtests passed, 1 skipped; 148 JavaScript tests passed. After the additions: 27 focused Python tests passed. Prior completed browser run geometry: seven widths in both themes, zero findings across 14 states. The final retry passed actual local planning, both reviews, final artifact, reload and Stop. Its traces report nemotron-3-nano:latest for the planner, both reviewers and final response. Its fourteen geometry states have zero findings. Desktop dark and phone light step lists were visually inspected; the final draft text was read and retains the missing approval without deferring completed checks.

Remaining full-wireframe work includes follow-up task proposals, confirmed sending, daily brief, filing Undo/Compare and native capture. Cloud deployment execution remains separately unverified.

A reload review also found the browser restoring an in-flight question as though it failed. The composer now avoids that restoration when leaving the page. The separate Off check asserts the composer stays empty after reload while the work continues. Screenshots of the completed step list predate this final composer recovery correction.
