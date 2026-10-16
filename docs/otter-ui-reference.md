# Otter workflow reference and Stellis UI scope

Observed from the user's Otter account and Otter's public [conversation page](https://help.otter.ai/hc/en-us/articles/5093228433687-Conversation-Page-Overview), [AI Chat](https://help.otter.ai/hc/en-us/articles/19682180167575-Otter-AI-Chat-Overview), [speaker rematch](https://help.otter.ai/hc/en-us/articles/40643231903639-Disable-Speaker-Learning), and [language](https://help.otter.ai/hc/en-us/articles/26660468516631-Transcribe-conversations-in-English-Spanish-French-German-Japanese-or-Chinese-Simplified) documentation. This is a behavior reference, not a pixel copy.

| Otter interaction | Stellis destination | Ticket |
| --- | --- | --- |
| Distinct, prominent Import and Record actions | Home header and empty state, consistent hierarchy and button sizing | #11, #14 |
| Conversation list and clear title/duration | Home | #11 |
| Summary and Transcript views | Conversation workspace | #12, #13, #15 |
| Audio replay, scrub, speed, and transcript follow-along | Conversation player and readable timestamped turns; fragment click seeks | #11, #12, #13, #38 |
| Editable transcript words and speaker labels | Transcript controls with save/undo feedback | #13 |
| Speaker rematch that preserves manual labels | Recompute on-device speaker suggestions without overwriting user edits | #12, #13, #29 |
| Speaker and keyword overview | Conversation header/side panel | #13, #15 |
| Custom vocabulary and language choice | Pre-transcription settings and reprocess affordance | #12, #13 |
| Summary, decisions, outline, and action items | Source-linked results from Nemotron | #15 |
| Contextual AI Chat, follow-up questions, generated content | Conversation-side panel with cited transcript spans | #15 |
| Highlights, comments, reactions, labels, sharing, channels | Evaluate after core single-user acceptance; file focused tickets if needed | Later |

Design notes: Preserve a large readable conversation title, compact metadata, clear Summary/Transcript tabs, and a persistent playback control near the transcript. The user's preference is for Otter's import/record button prominence, font sizes, hierarchy, speaker rematch, and labels. Language choice must reflect models actually installed on the device; an English-only whisper model must not claim multilingual support. AI outputs need transcript citations and must reflect edits and corrected speakers when regenerated.

## Transcript navigation and edit mode, observed 2026-10-16

In the signed-in CIFAR interview, Otter displays speaker turns as text bubbles with a speaker label and timestamp. Normal transcript words are individual `transcript-word` spans carrying timing attributes; clicking a bubble/word navigates playback, while a fixed bottom player provides seeking and transport. The transcript header has one **Edit transcript** action. Activating it changes that control to **Done**, exposes undo/redo, and makes the transcript editable. The same page was observed via REA CDP target evidence `ev_6a786392add5fdad9aa4c1d8d8ca7523ecec36aa3c7248853f266d92fbe27238`; the edit-mode screenshot was inspected in the signed-in Chromium session. These are observed browser behaviors, not a claim about Otter’s internal storage model.

Stellis implements the global mode and segment-start seeking in #45. Exact measured word timing and word-level seeking remain #39.

## Speaker rematch, observed 2026-10-16

On the signed-in conversation, **Rematch speakers** is in the conversation's top **More options** menu, beside actions such as language change and text/audio sync. Selecting it immediately submitted a request; no confirmation dialog or speaker-selection form appeared. A toast said the auto-tag request was accepted and to check back in 10–15 minutes. The transcript stayed visible with its normal speaker labels and playback controls. This entry and request state were observed with REA browser target evidence `ev_5f16389173b5d1d26bb4f2f8488d025e27fc41f57b14ba6a3a119880a6afbd85` and screenshot evidence `ev_8512abed128528cd80867f4bdca820c51499b31f80f3d98baa20c2e6fb6bab49`.

Completion, failure, retry, and preservation of manually assigned names have not yet been observed in Otter. Those behaviors must be checked after the requested run completes; do not infer them from the toast.

After more than 25 minutes, a reload still showed the same six anonymous speaker groups and the same initial turn labels. No rematch progress, completion, or failure message was visible. REA screenshot evidence `ev_cb74c6a5296878ba36622720c3c70249bb7c96e363b3f89c49f788638ac54f58` records that later state. The unchanged labels do not show whether Otter finished and made no changes or whether its request was still pending; that result remains unknown. No named speaker was changed in the user's Otter account for this observation.

A later signed-in reload still exposed the interview and its transcript, with no rematch completion state surfaced in the conversation header. The account did not provide enough evidence to classify the prior request as succeeded or failed. Stellis therefore shows its own persisted job state and leaves automatic assignments distinct from confirmed Person names.
