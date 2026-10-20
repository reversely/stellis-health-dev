# Guided workspace verification

The previous Take the tour entry merely reopened onboarding. It has been replaced with a guide through the real workspace, with a separate Set up workspace entry retained. First-time onboarding now hands off to this guide; reopening and completing setup in an existing workspace returns Home normally.

The eight guide steps use live account notebooks/agents: workspace, an actual notebook, contextual chat, the agent's Setup tab, assignment management, model routing, recent request traces, and recording. Buttons bring the relevant live controls into view and keyboard focus; they do not fabricate content or automatically start recording, send a message, or change model settings. Missing notebooks expose the normal create/setup actions. Errors provide Retry. Unknown/retired tour progress is ignored. Guide position is part of the URL and survives reload; Close/Escape removes it without changing user content.

Browser checks use an isolated account on GN100 and the actual application server. Fresh onboarding through Learning and review reached the guide. Home → Take the tour traversed all eight screens at 1440 and 390 pixels; notebook URLs were checked, not inferred from the heading. Setup tab selection survived reload. The empty notebook branch opened the real creation dialog using keyboard. Deliberately aborted notebook reads tested Retry recovery. Capture is inspected without claiming an actual microphone or speech session in this test.

Screenshots were inspected, including the existing shader/sidebar and phone recording controls. Live model and Gmail action verification remains in evidence/437; this guide links those real features but does not claim those actions were rerun here.

Layout audits of guided chat and recording across 360, 390, 768, 1024, 1280, 1440 and 1920 pixels in both themes report no failures or warnings. Existing informational findings remain in the raw reports. All 148 JavaScript tests pass. The browser verification script is included for repeatability.
