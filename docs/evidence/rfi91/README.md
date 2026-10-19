# RFI 91 isolated walkthrough evidence

Captured on GN100 on 2026-10-19 by \`scripts/rfi91_walkthrough.py\` against a temporary Stellis data directory and Firefox profile. The test account and browser profile were removed after the run. The managed Gmail bridge was preserved by disabling credential sync in this isolated service.

Observed pass: idempotent sample seed; four project notebooks; Water Treatment pages; saved RFI 91 transcript and notes; source audio retrieval; library search; highlight and comment create/update/delete; speaker confirmation and rename with a linked Person profile; page trash/restore; a source-linked managed agent answer; delegated specialist research and sample draft; a Firefox WebRTC call with saved audio and a conversation link in the agent thread; and Home, notebook, conversation, agent, and narrow viewport screens in Firefox. The walkthrough asserts the saved transcript renders and the narrow viewport has no horizontal overflow.

Files:
- \`rfi91-walkthrough.mp4\`: Xvfb/Firefox screen capture of Home, notebook, conversation, agent thread, delegation, voice call, saved call, and narrow viewport.
- \`home.png\`, \`notebook.png\`, \`conversation.png\`, \`transcript.png\`, \`agent.png\`, \`agent-thread.png\`, \`delegation.png\`: screenshots at the named states.
- \`call-connected.png\`, \`call-saved.png\`: connected voice call and saved conversation link.
- \`mobile-conversation.png\`, \`home-final.png\`: narrow Firefox viewport and final Home.

The isolated pass did not connect Google, send email, create the live demo calendar, run a live Tavily job, or test the connected account's email style. Those are separate acceptance steps in [the walkthrough](../../fixtures/rfi91-walkthrough.md). The synthetic emails have not yet been sent. The current Google grant lacks \`calendar.app.created\`, so the calendar has not yet been created in the connected account.
