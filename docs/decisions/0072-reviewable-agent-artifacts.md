# Reviewable agent artifacts

Requested drafts are account-local records linked to the generating agent turn and notebook. Subject/title, body, evidenced recipients and trusted source links remain editable until discarded or explicitly saved externally. Revision checks reject stale edits; discarded records retain an audit trail. Normal chat remains concise while draft requests receive a complete structured output contract.

Gmail saves use a persisted state transition before the external call. Repeated completed saves return the existing draft; interrupted saves stay uncertain and cannot create another copy. Recovery checks the connected account and an exact X-Stellis-Draft-ID MIME header. Live verification showed Gmail rewriting Message-ID but preserving this custom header. Bounded paginated metadata inspection can recover a matching draft; absent or incomplete results never authorize a repeat write. Gmail actions here create drafts only; no sending endpoint exists.

Source: https://developers.google.com/workspace/gmail/api/guides/drafts and live provider verification in docs/evidence/437. Provider draft IDs are API identifiers; the UI opens the connected account's drafts folder without inventing a message permalink.

Reviewed document drafts can be filed as local notes. Note insertion, task indexing and artifact state update share a single transaction; the artifact ID is the stable note ID. Repeated filing returns the same artifact. The note then uses the normal notebook editor and source system.
