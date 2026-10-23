# Maya onboarding validation

Maya starts as a synthetic new patient in January 2022. Her name, birthday, period preference and goals come from the locked scenario. Iron treatment, fertility treatment and pregnancy outcomes enter through subsequent dated records rather than being supplied during the opening interview.

## Conversation fixes

Baseline setup had editable fields but no agent text composer. Text Stellis now starts an authenticated text-only profile call. The conversation retains earlier turns while each answer fills its editable field. The person confirms before saving. Clarification and pause requests retain the current question. Unsent drafts remain in the composer and manual field edits take priority over delayed candidates. Confirmation says Thank you before its action so the call layer receives a speakable reply; the next question waits for the client listening state after playback drains. Explicit exit gives a saved-progress explanation, return action and goodbye.

Validation rejected early runs rather than treating visible field advancement as success. Confirmation initially emitted a spurious No reply arrived error. Another test waited for a disabled composer to re-enable after completion. The final test explicitly checks server error events and completed-state behavior. A separate real Chatterbox test verifies that opening speech, candidate confirmation and acknowledgement finish playback before listening resumes. The text videos are silent; physical microphone quality is outside this run.

## Evidence

[Onboarding transcript](onboarding-transcript.md) retains Maya's misspelled name and correction, condition and medicine questions, four goal clarifications, pause and notebook handoff. [Story transcript](story-transcript.md) retains all eight real configured-agent replies with their citations. [Checks](checks.json) separate passing onboarding behavior from [four open clinical-answer findings](answer-review.json), tracked in [#135](https://github.com/reversely/stellis-health-dev/issues/135).

The browser confirmed all 70 uploaded PDFs against their locked SHA-256 values, clinical dates and notebook associations. Notebook creation required explicit review. The transcript and video preserve incorrect model answers; citation presence is not asserted as clinical correctness. Fixing those answers requires temporal claim support and explicit evidence for pending investigations, rather than date rewriting tied to this fixture.

Artifacts live under `.agents/artifacts/maya-onboarding/`: `maya-validation.mp4`, raw WebM recordings, `transcript.json` in `validated-onboarding`, `story-transcript.json`, `record-verification.json`, `voice-confirmation.json`, `iterations.json` and this answer review. The MP4 combines actual browser captures: onboarding at 0:00, the first record segment at 1:15 and continuation at 2:27. A recorder interruption occurred after D042; the browser resumed using real guide checks for existing records and uploaded D043–D070 without duplicating earlier records. This is a combined recording rather than an uninterrupted session. Video duration is about 3 minutes 29 seconds.

The text composer and expanded medicine-library conversation passed geometry audit at 360, 390, 768, 1024, 1280, 1440 and 1920 pixels in both themes with zero failures, warnings or console errors. Reports live at `/tmp/stellis-maya-chat-{light,dark}/report.md` and `/tmp/stellis-maya-chat-library-{light,dark}/report.md`. Real transcript, authentication and completion checks passed 72 Python tests with one model-dependent skip and seven subtests. The direct profile transport regression also passes.

`tests/browser/maya_onboarding.mjs` reproduces typed setup with a real server. `tests/browser/maya_guide.mjs` accepts restricted `STELLIS_TEST_STORAGE` for the same account and `STELLIS_MAYA_START` to resume through saved-record checks. Session cookies remain outside the shareable artifacts. The full run used the validation app on loopback 8842 with the existing local Chatterbox service on 8841.
