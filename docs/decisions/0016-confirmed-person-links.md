# ADR 0016: Confirmed Person links are user actions on source passages

Status: accepted, 2026-10-16. Ticket: #42.

## Decision

A local `persons` row has a durable UUID and editable name. `person_links` records a user's explicit confirmation on one source passage ID and its timestamp. Confirming an acoustic group expands that choice into links for its current passage IDs. The acoustic cluster ID is never used as a durable identity key. A passage may have one confirmed Person; a Person may appear in many conversations. The Person name takes display priority over a manual speaker label for linked passages, while the underlying edit and label remain intact if the link is removed.

Rematch retains passage IDs, so confirmed links remain on the same passages even if their acoustic group changes. A new ASR generation with new passage IDs does not inherit confirmations by inference. The profile retains the historical conversation and timestamp as evidence, marks that representative link as from a prior generation, and seeks by time if its ID is absent from the current transcript. The user can confirm current passages after reviewing them. A transcript text edit does not change the Person link.

Profiles and Person-name search include only active conversations. Trash hides a conversation's membership; Restore reveals it. Permanent deletion removes that conversation's links and leaves shared Person rows. A Person with no links can be deleted. Mistaken associations can be removed by passage/group or by conversation. Explicit merge moves links from a duplicate Person; separation moves one conversation's links to a newly created Person without touching audio or transcript edits.

## Why this choice

The real interview's acoustic groups are provisional and can contain short uncertain turns. Automatically mapping a guessed cluster or a spoken introduction to a stable identity would overstate evidence. Source passage IDs survive the current rematch implementation and give an auditable confirmation boundary. Keeping old-generation links after retranscription preserves the user's history without claiming a new model's segmentation is equivalent.

## Later encrypted sync

Person records and links must be encrypted client-side before sync. The hosted service can index opaque IDs and revisions to transport ciphertext, but must not hold names, voiceprints, transcript snippets, or a plaintext Person search index. Merges and separations need versioned link events so offline devices do not resurrect an incorrect association. The current implementation has no sync adapter or stored voiceprint.

## Verification and limits

API tests cover two conversations, an unconfirmed anonymous passage, name search, rename, rematch with stable IDs, reprocessing with changed IDs, merge, separation, Trash/Restore, and permanent deletion. Chromium confirmed one Person in the supplied interview and a second recording, opened the profile from a transcript, sought the confirmed turn with playback paused, and checked search, rename, merge, separation, removal, and 390-pixel layout. A disposable browser import was also confirmed, trashed, permanently deleted, and checked for missing conversation and Person links. Test Person records and links were removed afterward.

Cluster-wide confirmation trusts the user's selection of all current passages in that provisional group. The browser makes that scope explicit. Links to old generations remain historical and require a new user confirmation before the current transcript displays the Person name.
