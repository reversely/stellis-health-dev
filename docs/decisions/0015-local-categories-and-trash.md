# ADR 0015: Local categories and two-stage conversation deletion

Status: accepted, 2026-10-16. Ticket: #43.

## Decision

Categories live in a local `categories` table with a many-to-many `conversation_categories` table. Category names are unique after Unicode case folding. Removing a category removes its assignments and never removes a conversation. Library list and device-local search use the current assignment table; import deduplication retains assignments.

Moving a conversation to Recently Deleted sets `conversations.trashed_at`. The internal API route remains `/trash` for compatibility. Active library, search, conversation, and audio routes exclude it immediately. Transcript generations, edits, AI results, category assignments, and media remain in place for Restore. Importing the same audio while it is there returns a clear restore instruction instead of creating a duplicate. The retention period is 30 days from the latest move into Recently Deleted. Restore clears the timestamp, and a later move starts a new 30-day period. The list API returns the exact UTC expiry timestamp for display in local time.

Permanent deletion is a separate confirmed action on a trashed item. It returns a conflict while any speech, AI, or cleanup run is queued or running. Once settled, it stages the private media file, deletes dependent records in a single database transaction in foreign-key order, removes the conversation row, then removes staged media, recording session directories, and job locks. A failed database transaction restores the staged media. Startup recovery resolves staged media left by a crash according to whether the conversation record still exists. The browser stops playback and releases its audio URL when moving the open conversation to Trash.

The device also sweeps expired items at startup and every hour while running. An expired item uses the same permanent deletion path. The expiry condition is checked again inside the deletion transaction, so a concurrent Restore or new move cannot delete a renewed item. A busy job defers that item to the next sweep. A device that is off at expiry deletes eligible items when it next starts. No remote scheduler exists in the current device-only architecture.

## Why this choice

The current database has explicit foreign keys without delete cascades. Deleting its parent row alone fails and would not define media cleanup. A reversible Trash state prevents accidental loss and allows in-flight work to finish or fail without making a hidden conversation reappear. Blocking permanent deletion until work settles avoids a worker writing into deleted records. The two actions have separate UI controls and confirmations.

## Future encrypted sync

Sync must carry an encrypted deletion tombstone with a conversation ID, device identity, logical revision, and deletion time. Trash and Restore are versioned events; another device must not re-upload an older active copy after seeing a newer tombstone. Permanent deletion needs an acknowledgement policy for offline devices and encrypted blob garbage collection after the retention window. A newly enrolled device must receive tombstones before older conversation snapshots. Local deletion remains authoritative for this device today; no hosted sync path is implemented.

## Verification and limits

API tests cover two categories on one conversation, filtered search, rename, import deduplication, Trash search exclusion, restore with an edited transcript and assignments, category deletion without conversation loss, dependent-record and media deletion, and a queued job blocking permanent deletion. Chromium exercised the category workflow on the supplied interview and temporarily moved it to Trash, then restored its transcript and category. A second recording was hidden during playback and restored. Disposable browser imports were removed permanently; a queued speech job reached a failed terminal state after Trash and left no job or media orphan after deletion.

Confirmed cross-conversation Person links are removed with the conversation; shared Person profiles and vocabulary remain. Permanent deletion is unavailable while any associated run is still queued or running. The 30-day cleanup test covers a busy job retry, Restore resetting retention, shared Person cleanup, and media deletion.
