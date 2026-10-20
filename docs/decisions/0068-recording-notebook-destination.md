# ADR 0068: Persist recording destination before finalization

Status: implemented for #419.

An unfinished recording owns its notebook_id. PUT /recordings/{id}/notebook validates the notebook in the account database and updates the session transactionally; null removes the assignment. Session projections, including title updates, retain the field. Finalization already imports into that stored destination, so interrupted-session recovery uses the same rule.

The UI shows Saving to and Change beside recording transport. Before capture, a selection is the pending destination; during capture it is saved on the session; Review notes loads the unfinished session destination. Failed updates retain the prior saved notebook. Stop waits for an in-flight destination update before finalizing.

Finalization and metadata mutations share a nonblocking process-local guard keyed by account data path and recording ID. Overlapping writes receive a conflict instead of racing a frozen finalization snapshot. The guard releases on failure and does not persist an unrecoverable busy state after a process restart. This matches the single-process local service; a future multi-worker deployment needs a cross-process lease before enabling concurrent recording writes.
