# ADR 0018: Secondary conversation actions use a three-dot menu

Status: accepted, 2026-10-16. Ticket: #65.

## Decision

The conversation header keeps Record and Import recording visible. A labeled three-dot **More options** menu holds Delete, Rematch speakers, Sync text to audio, Reprocess transcript, and Regenerate summary when each action is available. Transcript editing stays beside the transcript, and the first Generate summary action stays in the AI view. Menu items use the same existing API routes; the menu closes on selection, outside click, or Escape.

Delete is the visible action name. Its confirmation says the conversation can be restored from Recently Deleted for 30 days. The irreversible **Delete permanently** action remains in Recently Deleted with typed confirmation. Page subtitles, decorative header copy, and repeated how-to messages were removed. Short status messages report results or actionable problems. A global `ui` skill at `~/.agents/skills/ui/SKILL.md` captures these copy rules for later interface work.

Regenerate summary sends `force: true` to the versioned AI-run route. This creates a new summary run for the current transcript revision even if a successful run exists. A queued or running summary for that revision is returned instead of starting another provider request. Ordinary Generate summary remains idempotent. Earlier source-linked summaries remain in local history.

## Why this choice

The signed-in Otter conversation reference groups Regenerate summary, Rematch speakers, and Delete under its top-right More options menu. Moving these secondary actions out of the transcript toolbar leaves its edit control easy to find. A native `details` disclosure supplies keyboard behavior without an additional menu library. The user-facing label names the action; the recovery rule appears at the deletion decision and in Recently Deleted.

## Verification

The summary regeneration API test checks a new run after success and reuse of an active run. Chromium checked the real interview menu at desktop and 390-pixel width, Escape, a canceled Delete confirmation, and the `force: true` request without sending a provider call. Both layouts stayed within the viewport.
