# RFI 91 walkthrough and acceptance script

All project data in this walkthrough is fictional. Run against the GN100 Stellis service. Use a clean browser profile for the repeatable automated pass; keep the connected account for the final Gmail and Calendar pass. Evidence files belong under `docs/evidence/rfi91/`.

## Case boundary

RFI 91 opened September 28. The revised isolation valve schedule and a material certificate traceable to the proposed valve are required. C316 compliance with WT-04 revision B remains unverified. The October 10 coordination meeting changed the response target from October 11 to October 22. October 22 is a response target, not a closure promise. Engineering sign-off is required before closing the RFI.

The fixture answer key is [rfi91-answer-key.md](rfi91-answer-key.md). The sendable synthetic Gmail pack is [rfi91-demo-emails.md](rfi91-demo-emails.md). The event plan is [rfi91-demo-calendar.json](rfi91-demo-calendar.json).

## Automated pass without live email

Run `STELLIS_PYTHON=/home/springbuilt/stellis-runtime/bin/python PYTHONPATH=src /home/springbuilt/stellis-runtime/bin/python scripts/rfi91_walkthrough.py` in a disposable data environment. The script must fail on any unmet assertion and save screenshots only to the explicit evidence directory.

| Step | Action | Required assertion | Evidence |
| --- | --- | --- | --- |
| 1 | Add the RFI 91 sample case. | Four distinct project notebooks, four named agents, one Water Treatment conversation, specification/status pages, and fixture transcript exist. Repeating seed is idempotent. | Home and sample status |
| 2 | Open Home and Water Treatment notebook. | RFI 91 conversation and project pages are visible in the right notebook; other project notebooks stay distinct. | Home, notebook |
| 3 | Open the RFI 91 conversation. | Audio responds, transcript segments render, the October 10 target change is visible, and Notes contains the unresolved C316 point. | Conversation |
| 4 | Search for “RFI 91” and “C316”. | Results link back to the right conversation and source text. | Search |
| 5 | Create, edit, then remove a note/comment/highlight on an RFI passage. | Every change survives reload; removal clears only the selected item. | Conversation |
| 6 | Tag a speaker and inspect Manage Speakers. | One Person row and passage links survive reload; renaming updates both transcript and speaker index. | Speaker view |
| 7 | Run source-backed AI on “What keeps RFI 91 open?” | Answer cites the revised schedule and traceable certificate; it must preserve C316 uncertainty and never claim closure. | AI answer |
| 8 | Ask the Water Treatment agent, then delegate research to another named agent using the sample mailbox. | Steward owns the job, specialist returns source-linked findings, and the draft says engineering review is open. | Agent thread |
| 9 | Start and end an agent voice call. | Mic/WebRTC connects, reply can be stopped without ending call, and a playable conversation is linked from the thread after ending. | Call controls and library |
| 10 | Import or record a short sample, pause/resume, then finish. | One saved conversation appears; transcript and playback persist after reload. | Recording |
| 11 | Move only the throwaway import to Recently Deleted and restore it. | It disappears from active library, appears in trash, and returns after restore. The RFI fixture remains. | Trash |
| 12 | Check small viewport and reload. | Main navigation, call controls, transcript, and notebook content remain usable without lost state. | Narrow viewport |

Use the exact source passage and expected revision for transcript edits, highlights, and comments. Keep generated test data inside the disposable account; do not mutate the connected user's real projects during this pass.

## Connected account pass after synthetic emails are sent

1. Reconnect Google with `calendar.app.created` scope, then create the dedicated RFI 91 demo calendar using `scripts/create_rfi91_calendar.py`. Refresh Home. Assert upcoming sample events appear in the Calendar area and can be assigned to Water Treatment.
2. Send the five messages in `rfi91-demo-emails.md` to the connected inbox. Refresh Gmail and verify the thread is searchable and each source opens from the agent result. The actual From address will be the sender account; the role is in the body.
3. Ask the Water Treatment agent for the opening date, missing evidence, changed target, and safe response. Verify source links resolve to the synthetic email, specification page, and meeting. Check that the answer distinguishes the target response from closure.
4. Run the live delegated job with a specialist and Gmail search. Verify state progression, cited findings, and a Gmail draft. Open the draft in Gmail; do not send it as a real project response.
5. Import sent examples, classify email style groups, exclude an unsuitable group, then create a style draft. Verify that the draft uses only included examples and can be edited in Gmail.
6. Repeat the screen capture with the connected account. Attach screenshots of Home calendar, RFI conversation, agent evidence, delegation, and Gmail draft to issue #366. Keep account identifiers and tokens out of images.

## Evidence status

The isolated pass, including managed agent, sample delegation, voice call, speaker rename, and narrow Firefox viewport, passed on GN100 on 2026-10-19; see [the evidence record](../evidence/rfi91/README.md). The Google grant now includes `calendar.app.created`, and the dedicated RFI 91 calendar and seven synthetic events were created on 2026-10-19. The Stellis Calendar API returned four events in its current view window. Home browser verification and the connected email pass remain open until the synthetic messages are sent. Record each observed result, failure, and screenshot path in the issue comment; do not mark an unrun step passed.
