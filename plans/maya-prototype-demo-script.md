# Maya grows with Stellis: three moments, one continuous history

Status: detailed script written before implementation or recording. Owner brief: preserve the timeline narrative; make it cohesive; show three distinct times/use cases as Maya grows with the app; demonstrate the breadth of the product rather than centering chatbot exchanges; include space to test metrics with live camera inference. Owning ticket: [#183](https://github.com/reversely/stellis-health-dev/issues/183).

## Editorial direction

Maya is the protagonist. The app is useful because her circumstances change, not because another feature needs a turn on screen. Each chapter begins with a first-person need, performs visible work, and ends with the useful state she carries forward. Earlier notebooks, sources and observations remain accessible as new care appears. The transition is a timeline moving forward, not a reset or a second synthetic patient.

Use three chapter anchors, covering the existing five-year canon without giving every year an identical upload/chat routine:

1. **2022 — Make sense of a first concern.** Fatigue, heavy periods and low iron. Use case: build a trustworthy health history and a manageable daily routine.
2. **2024–25 — Coordinate care that keeps changing.** The 2023 fertility work-up leads to IVF, pregnancy and birth. Use case: keep records, treatment schedules and important dates together without losing their status or evidence.
3. **2026 — Find a routine that fits life now.** Postpartum recovery, returned periods and recurrent iron follow-up. Use case: see change over time, handle check-ins efficiently, and try a camera measurement when useful.

The 2023 work-up and 2025 birth are visible events between chapter anchors, not omitted years. Canon: `stellis-synthetic-patient/fixtures/yearly_story.json`, `medications.json`, `observations.json`, `menstrual_cycles.json`, and original source documents. Dates, medicine amounts, counts and clinical wording must come from those sources.

Target main film: approximately **7 minutes**. Aim for roughly 110–125 spoken words per minute with pauses for real actions. Provide readable captions and a separate transcript even if narration is unavailable. Chat/explanation receives **one focused passage, no more than 30 seconds**; most screen time is records, reviewing, tracking, planning, logging and measurements. No repeated staged back-and-forth conversation.

## Detailed running order

| Time | Maya's reason / narration | Visible actions and framing | What must be true before the cut |
| --- | --- | --- | --- |
| 00:00–00:18 | “I'm Maya. My health doesn't arrive as one tidy story. Over a few years, Stellis becomes the place where I keep the pieces together.” | Open the prototype in purple dark mode. Show Maya and a single timeline with 2022, 2024–25 and 2026 anchors. Pause on the three distinct chapter names. A small, persistent sample-data label establishes that this is Maya's fictional history. | Three chapter anchors work; the selected chapter and story date are clear. No artificial loading or unexplained popups. |
| 00:18–00:36 | “In 2022, I'm tired. My periods and blood tests seem connected, but my reports are scattered.” | Select 2022. Begin with the first concern and an initially small library. Show the period dates and the actual primary-care appointment as separate facts. | Period flow is not inferred from a diagnosis. The confirmed appointment is distinguished from a plan. |
| 00:36–01:00 | “I bring in the records I already have, check their dates, and choose where they belong.” | Open the real record-import/review flow. Use the 2022 synthetic package; show a proposed visit/test date and its source, then explicit notebook approval. Zoom the notebook list only after it changes. Do not film eight identical file uploads. | Original source retained; record dates are evidence-backed; notebook proposals require confirmation and do not silently make duplicates. |
| 01:00–01:28 | “Now I can see the original result, the follow-up, and the plan together.” | Open the relevant notebook Brief/Records view. Move between the source report, accepted facts and the timeline/Levels view. Show that normal hemoglobin and low ferritin are different measures; do not collapse them into one ‘iron’ score. | Actual source page is visible at least once; values and dates match the canonical documents. The viewer can see where a number came from. |
| 01:28–01:52 | “I track my period and the things I need to do. The useful part is having a routine I can actually follow.” | Log the documented period days. Show a relevant goal/medicine course from its actual source and its next action. Show editing or undo once, with the resulting state. | No pill pack/device invented for Maya. A logged action is distinct from a recommendation. The state remains when revisited. |
| 01:52–02:10 | “By 2024, we're moving from investigations to IVF. I don't want to start my history over.” | Advance the same timeline through the 2023 fertility work-up to 2024. Keep prior notebooks visible; introduce Fertility/IVF with their existing source links. | This is the same Maya, not a new fixture with a reset library. Years on screen agree with source dates. |
| 02:10–02:40 | “There are medicines, monitoring and appointments. I need to know what is due, what is planned, and what the clinic has confirmed.” | Show the actual treatment record and its medicine schedule. Open the registry-based course view: dose/schedule from the record, next due action, supply/run-out if applicable, and calendar projection. Distinguish Calculated, Planned and Confirmed states. | No invented clinical dose or run-out date. The UI preserves source association; calculated supply is not represented as a booked appointment. |
| 02:40–03:05 | “When several things are due together, I can deal with them together—and check before I save.” | Use multi-item logging with a meaningful selection of Maya's actual items. Review amounts/date/outcome and confirm. Open a check-in agenda, snooze one nonurgent item, and confirm the dated entry for another. | Nothing is logged merely because it was selected, typed or narrated. The confirmed items update; the snoozed item remains pending. |
| 03:05–03:30 | “For one question, I want an explanation I can check: what happened at each stage of the retrieval?” | One short source-backed question or saved explanation, followed immediately by its citation and explanation trace. Use the four canonical retrieval/embryology stages (12 retrieved, 10 mature, 8 normally fertilized, 4 frozen). Show the relevant original report rather than a long assistant transcript. | A saved explanation is labelled as saved; a live reply is called live only if an actual request completed. Source/citation/trace are real. No fabricated model output. |
| 03:30–03:58 | “Then pregnancy changes what matters. I keep the estimate separate from what actually happened.” | Advance through late 2024 pregnancy and 2025 prenatal care. Show Pregnancy's pending-only timeline and an actual prenatal source. Keep the estimated due date, 2025-08-03, separate from confirmed birth, 2025-07-29. | Birth is explicitly confirmed, not auto-inferred. Past events do not remain in Coming up. Postpartum bleeding is not logged as a period. |
| 03:58–04:20 | “In 2026, my periods return and I need another iron follow-up. The earlier history is still here.” | Advance to the third anchor. Show the January 12–16 period, follow-up records and existing notebook reuse. Expand the longer timeline so the 2022 results are visibly still accessible. | No duplicate notebook for each year. The timeline distinguishes tests, treatment and life events. |
| 04:20–04:48 | “I can review the plan and the measurements without asking a chatbot every time.” | Use Brief, coming-up/courses and longitudinal Levels. Show the year/range control. Open a source-backed value, then the Table icon. Search/order the real table, return to the chart and hover a point. | Upper-right table icon, one-date padded tooltip, calculated range bounds only when supported, and coherent source/date labels. No fuchsia sidebar states or black dark-mode surfaces. |
| 04:48–05:12 | “A new record can go straight into the right notebook. A visit note or recording can join the same history.” | Demonstrate the Records drop zone or chat attachment with explicit Save to notebook (not both repetitive paths). Show a short source recording/transcript/notes view where available; a visible edit or replay seek is enough. Then return to the shared history. | Do not claim new transcription, OCR or inference from a precomputed artifact. Saved results remain distinguishable from new processing. Filing retains the original source identity. |
| 05:12–05:30 | “Sometimes I want a fresh reading, not another form.” | Navigate to Measurements > Vital signs. Open a dedicated **Live camera test** area. Give the preview room beside readiness, waveform/progress and eventual results. Show that the camera has not started automatically. | The viewer sees Start, preparation advice and the local-processing explanation. Synthetic Maya history is visibly distinct from the viewer's camera session. |
| 05:30–06:20 | “This is space to try it. Rest for a moment, face the light, and start when you're ready. The camera stays on this device.” | Reserve at least 45 seconds of unhurried screen time. In an interactive presentation, pause here for the presenter to click Start and complete the real capture. In the reproducible recording, show the ready state and clear instruction to pause the video and try the prototype. If there is no physical camera, show the genuine no-camera recovery path once; do not manufacture a face, waveform or successful number. | Start alone requests permission. Real local inference supplies any numbers. Only supported metrics appear; approximate/unavailable states remain honest. Stop/Close stops all camera tracks. No test value is compared against Maya's synthetic baseline. |
| 06:20–06:42 | “When a reading is available, I review it before keeping it. I can retry or clear this test session.” | Demonstrate the available result/review controls with actual camera output only. If the recording has no camera, stay on the test-space explanation and demonstrate Close/ready state instead of cutting to fake success. Leave a clear path to reopen the live test after the film. | Saved live-test readings are local to the viewer/session, labelled camera estimates and separated from Maya's source history. No hidden API stub or accelerated inference clock. |
| 06:42–07:00 | “I haven't replaced my history every time my life changes. I've built on it.” | Return to the three-anchor timeline. Briefly revisit 2022 and then 2026 to demonstrate continuity. End on the current workspace, with the camera test entry still available, not a modal blocking the product. | Chapter navigation, previous data and notebook identities remain intact. The closing frame is usable and uncluttered. |

## Coverage and honest boundaries

| Feature family | Narrative role / scene |
| --- | --- |
| Onboarding/profile and notebook choices | Establish Maya once; reuse the setup and library rather than repeat onboarding each year. |
| Import, dates, fact review and original records | 2022 first concern; 2024 and 2026 bring forward the same record identities. |
| Notebooks, unread/Records drop zone, attachments and explicit filing | Build the first library, grow it for treatment, file a later source. |
| Timeline, Brief, Levels, courses and Coming up | The main navigation/evidence thread through all three anchors. |
| Period tracking and calendar | 2022 dates; IVF appointments; 2025 estimated/actual milestones; 2026 return of periods. |
| Registry medicine courses, supply and multi-item logging | 2024 coordination, with only source-supported medicines and amounts. |
| Goals, agenda, snooze, dated check-in confirmation | Practical coordination and return-to-routine tasks, not chatbot-only interactions. |
| Source-backed explanations, citations and answer traces | One focused 25-second passage anchored to the embryology source. |
| Recording, transcript replay/edit and notes | A supporting visit artifact, without claiming a live recognition run when using saved results. |
| Measurements, chart/table modes, filtering/order, theme and mobile | 2026 self-service review, including the current prototype's real interactions. |
| Camera pulse, breathing and HRV when available | Dedicated user-started live test segment; preserve uncertainty and actual availability. |
| Demo isolation/reset and retained history | A disposable demo; one reset returns it to its initial fixture. Never touch the real account. |

“All features” means the meaningful, currently shipped workflows relevant to this person. It does not justify inventing a pill pack, implanted device or diagnosis, showing every settings field, or claiming stretch/native/encryption features. A compact catalogue/optional-controls view may acknowledge other tracking types without assigning them to Maya.

## Visual and recording treatment

- Desktop master at 1920×1080, readable UI scale, dark-purple default, with one short light/phone comparison where it serves the task. No fuchsia highlights, black panels or decorative severity colors.
- Use the actual prototype, native workflows or clearly labelled saved source artifacts. Do not replace a missing workflow with an imitation chatbot answer, painted success state or canned camera result.
- Keep the timeline visible/available throughout. The chapter transition tells us what changed in Maya's life and why the next task follows.
- Pause 1–2 seconds before consequential clicks and 2–4 seconds after a saved result/source appears. Keep pointer motion direct. Do not edit a pending operation into apparent success.
- Captions describe Maya's need/outcome, not “now click the button.” Keep them short and away from controls; provide a full transcript and WebVTT sidecar.
- The camera preparation/readiness view is spacious, not another cramped chart tile. Do not request camera access on chapter/page load.

## Preflight and acceptance before recording

1. Inventory the real targets and mark each covered feature as available, requiring wiring, or not applicable. Confirm the storyboard against canonical documents/fixtures, including the known iron last-dose boundary: December 18 is the last dose; stopping begins December 19.
2. Verify chapter continuity and actual navigation at desktop and phone widths in both themes, including empty states and return navigation. Tables and overlays must follow the accepted #175–#181 corrections.
3. Reuse the existing local camera inference module. Check real permission/camera errors, Start/Stop/Close cleanup, and the result-review path. Automated controlled-signal tests may validate plumbing but cannot be edited into a live-inference claim in the video.
4. Keep sample source history and a viewer's camera readings separate. Do not persist video frames. Clear only the isolated demo/test data.
5. Record and review the film against this script. Deliver MP4, a transcript/captions, the interactive prototype URL, an evidence checklist and precise limits for any prerecorded/model/camera portions.

## Environment finding recorded during planning

The prior checked-in yearly walkthrough is 46.92 seconds, video-only, at 1280×888. Its quick five-year progression does not give the new source/table/camera interactions enough space. No `/dev/video*` device is present in this recording environment. The replacement must therefore preserve a real user-operated camera test and leave its recorded segment honest, rather than silently replacing live inference with sample numbers.
