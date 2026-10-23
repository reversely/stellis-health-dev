# Maya yearly story verification

The browser started from an empty demo workspace and completed all five years through the visible interface: native period logging and appointment saves, five separate ZIP uploads, page-evidenced encounter-date confirmation, explicit notebook approval and reuse, exact report sources from the timeline, real source-linked assistant replies, an estimated due date and a separately confirmed birth date. All 70 PDFs were present before the final one-action clear. The recording contains actual interactions and replies. Scripted narrative is explicitly labelled in the interface.

Seventy layout states pass without findings: overview, year story, native cycle form, date review and notebook suggestions at 360, 390, 768, 1024, 1280, 1440 and 1920 pixels in both themes. Desktop and phone screenshots accompany the machine-readable report. The phone header retains Maya’s icon/profile beside Close. Full browser interaction and layout geometry checks are separate.

The rebased Python suite passed 600 tests with four skips and 127 subtests. Twenty focused tests subsequently passed for demo isolation and provider/model configuration, including the newly added saved-model case. All 199 JavaScript tests pass. The canonical corpus retains 543 passing checks. Backend tests verify ordinary sentinel records and notebooks survive demo clearing; a separate browser check verifies both local and session demo drafts are removed while ordinary drafts remain.

## Clinical answer limitations

Workflow and citation success are not comprehensive clinical-answer validation. An earlier D070 reply incorrectly described December 19 as the last iron dose; the canonical PDF specifies December 18, with stopping from December 19. That reply is preserved in prior_workflow_results.json. The repeated run in workflow_results.json correctly gives December 18. This is an intermittent model temporal-reasoning issue, not a ledger change or an assertion of a model fix. The earlier 2023 answer lists investigations pending at intake without clearly separating later completed tests; the 2022 answer compresses January-to-May improvement into the August review. The IVF answer correctly gives 12 retrieved / 10 mature / 8 normally fertilized / 4 frozen. The delivery answer preserves 39+2, 3320 g and 350 mL.

A final server-log review identified a reset race after the original workflow passed. Response coordination now drains file/database reads before deletion and cancels pending inference before waiting for the response lock. Regression tests hold an actual HTTP read open while clearing, interrupt a blocked inference request, and send stale demo cookies after clear. Stale requests cannot recreate the cleared generation. The repeated complete browser run produced no server-log errors.

This run used embedded PDF text. No new OCR accuracy, physical microphone or hosted deployment claim is made. Ordinary rebuilds require no network; source verification remains in the research inventory. Earlier individual-PDF evidence under validation/browser is historical and superseded for UI behavior.

## Reproduction

Run tests/browser/maya_yearly_story.mjs and tests/browser/maya_yearly_layout.mjs from the repository root against a disposable app with configured inference. Set STELLIS_TEST_DISPOSABLE=1, STELLIS_TEST_ORIGIN, STELLIS_PLAYWRIGHT_MODULE, STELLIS_BROWSER and STELLIS_MAYA_EVIDENCE. Set STELLIS_MAYA_PACE_MS=400 for a paced recording. The story script records WebM; FFmpeg converts it to the included MP4. The script fails when a real cited reply is unavailable.
