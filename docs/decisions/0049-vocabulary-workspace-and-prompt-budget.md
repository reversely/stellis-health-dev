# ADR 0049: Dedicated vocabulary workspace and bounded speech hints

Status: accepted, 2026-10-16. Ticket #177.

## Context

The existing expandable Vocabulary card below the library adds one term at a time and renders every term as a chip. The user's scalability feedback names Otter's separate vocabulary page. In the signed-in Otter account, Account Settings → General → Manage Vocabulary opens an overview with Names of people and Other vocabulary. Each section has comma- or line-separated entry, alphabetized letter groups, letter jumps, select-all, and bulk Delete/Move controls. A saved phrase was selected and deleted through a confirmation dialog; the Move action was visible but not exercised. The account had no other saved phrases.

Stellis stores vocabulary as global hints for the local Whisper prompt. The existing 400-character prompt limit prevented saving a larger library even when most saved terms would not fit in one processing job.

## Decision

Provide `/vocabulary`, `/vocabulary/names`, and `/vocabulary/other` in the browser shell. The library links to the overview; term pages support multiline batch add, alphabet grouping and jump, selection, bulk move/delete, and the existing single-term edit. The SQLite vocabulary table gets a `kind` column. Existing rows migrate to `other` without changing IDs or spelling. A name hint does not create or relabel a confirmed Person.

Add atomic batch, move, and delete API operations. Keep one case-insensitive uniqueness constraint across both sections so moving a term does not create a second copy. The stored library may exceed the model prompt. New speech jobs snapshot the most recently changed terms, across both sections, that fit the existing 400-character prompt budget. The page states this limit. Prior jobs keep their stored snapshots; changing vocabulary affects only a new job generation.

## Consequences

Vocabulary management scales independently of the conversation list while the speech adapter stays bounded. Older terms remain saved and editable even when they do not fit a particular new job. If precise per-recording term choice becomes necessary, it needs a separate selection interface and job snapshot rule. This implementation has personal/device-wide terms only; it does not add Otter's team vocabulary or imply its subscription limits.
