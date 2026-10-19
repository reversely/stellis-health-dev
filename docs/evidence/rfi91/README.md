# RFI 91 isolated walkthrough evidence

Captured on GN100 on 2026-10-19 by `scripts/rfi91_walkthrough.py` against a temporary Stellis data directory and a temporary Firefox profile. The temporary account and browser profile were removed after the run.

Observed pass: idempotent sample seed; four project notebooks; Water Treatment pages; saved RFI 91 transcript and notes; source audio retrieval; library search; highlight and comment create/update/delete; page trash/restore; Home, notebook, transcript, and agent screens in Firefox. The script asserted that the saved fixture transcript actually rendered after discovering and fixing the unavailable-model state bug.

Files:
- `rfi91-walkthrough.mp4`: 10-second Xvfb capture of browser navigation through Home, notebook, conversation Notes/Transcript, agent Chat, and back to Home.
- `home.png`, `notebook.png`, `conversation.png`, `transcript.png`, `agent.png`, `agent-thread.png`: screenshots at the named states.
- `home-final.png`: Home after navigation.

The isolated pass did not send email, connect Google, call the live agent, run a live delegated job, or test the connected account's email style. Those are separate acceptance steps in [the walkthrough](../../fixtures/rfi91-walkthrough.md). The synthetic emails have not yet been sent. The current Google grant lacks `calendar.app.created`, so the calendar has not yet been created in the connected account.
