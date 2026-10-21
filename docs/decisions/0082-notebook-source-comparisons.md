# 0082: Reviewable notebook source comparisons

## Decision

Store comparison proposals alongside canonical review artifacts. Each proposal binds two distinct saved notebook sources to exact excerpts and content hashes. Publish only after the parent job succeeds. A source pair/version has one proposal per notebook.

Compare claims a persisted job transactionally and executes through the configured agent runtime using only the selected sources. Recheck source versions and agent availability before publication. Require citations to both sources. Existing Stop interrupts execution; failed/interrupted proposals can be retried or dismissed. Failed final validation discards its draft artifact. Completion produces a reviewable document, with no external send or task change.

Activity projects pending, working, retry, completed and dismissed states. It suppresses the separate job row for comparison jobs, so Working counts one operation. Source links open canonical notes or conversations.

Review sources is an explicit notebook action. It considers up to twelve recent distinct documents, with 2,500 characters per document for discovery. Execution uses both selected documents, rejecting a source exceeding 16,000 characters rather than silently truncating it. These are current limits, not proof of continuous review or arbitrary-length comparison.

## Consequences

Source edits and moves invalidate a proposal until sources are reviewed again. Exact quotes and version checks establish provenance; they do not prove all model interpretations are correct. Output remains a draft requiring user review. Continuous source monitoring and longer-document comparison remain separate requirements.
