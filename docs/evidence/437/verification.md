# Reviewable agent artifacts

Screen 5 calls for a local draft with recipient, subject, body, sources and Not sent state, followed by separate Edit, Discard and Save to Gmail drafts actions. The existing immediate Gmail-writing form did not meet that requirement.

The implemented artifact is persisted beside its generating thread message. Edits use revisions, preserve paragraphs and survive reload. Discard persists and removes external actions. Email generation cannot invent recipients absent from the request or supplied source excerpts. Complete draft requests use a longer structured response contract through the existing managed local inference path.

Provider verification: an explicit browser click created one temporary Gmail draft in the authorized account. A repeated save returned its same ID. Reload retained the saved state. After deliberately replacing local saved status with uncertain status, exact custom-header lookup recovered the same provider draft. Only that verification draft was deleted. No message was sent. The earlier Message-ID lookup failed against Gmail and was replaced, not counted as passing evidence. Gmail draft API IDs are not treated as browser permalinks.

Local browser proof uses an explicitly supplied practice-notes source in an otherwise generic Learning notebook; product setup does not seed a topic or plan. Separate browser evidence covers generation with citations, revision rejection, edits/reload, discard and seven viewport widths in both themes.

Latest local inference produced a 221-word email with source links and the explicitly requested recipient. Browser edits/reload and stale-edit rejection passed. A separate browser check saved a document into its notebook, reloaded the thread, opened the resulting note and verified its text; a persistence test proves repeated filing creates only one note.

Final checks: 336 Python tests and 25 subtests pass, one skip; 148 JavaScript tests pass. Seven widths in both themes report zero layout failures or warnings. No in-app sending action is implemented; saved email remains a Gmail draft for the user to review and send in Gmail.
