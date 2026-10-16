# Otter workflow reference and Stellis UI scope

Observed from the user's Otter account and Otter's public [conversation page](https://help.otter.ai/hc/en-us/articles/5093228433687-Conversation-Page-Overview), [AI Chat](https://help.otter.ai/hc/en-us/articles/19682180167575-Otter-AI-Chat-Overview), [speaker rematch](https://help.otter.ai/hc/en-us/articles/40643231903639-Disable-Speaker-Learning), and [language](https://help.otter.ai/hc/en-us/articles/26660468516631-Transcribe-conversations-in-English-Spanish-French-German-Japanese-or-Chinese-Simplified) documentation. This is a behavior reference, not a pixel copy.

| Otter interaction | Stellis destination | Ticket |
| --- | --- | --- |
| Distinct, prominent Import and Record actions | Home header and empty state, consistent hierarchy and button sizing | #11, #14 |
| Conversation list and clear title/duration | Home | #11 |
| Summary and Transcript views | Conversation workspace | #12, #13, #15 |
| Audio replay, scrub, speed, and transcript follow-along | Conversation player and timestamped turns; word click seeks | #11, #12, #13 |
| Editable transcript words and speaker labels | Transcript controls with save/undo feedback | #13 |
| Speaker rematch that preserves manual labels | Reprocess acoustic clusters without overwriting user edits | #12, #13 |
| Speaker and keyword overview | Conversation header/side panel | #13, #15 |
| Custom vocabulary and language choice | Pre-transcription settings and reprocess affordance | #12, #13 |
| Summary, decisions, outline, and action items | Source-linked results from Nemotron | #15 |
| Contextual AI Chat, follow-up questions, generated content | Conversation-side panel with cited transcript spans | #15 |
| Highlights, comments, reactions, labels, sharing, channels | Evaluate after core single-user acceptance; file focused tickets if needed | Later |

Design notes: Preserve a large readable conversation title, compact metadata, clear Summary/Transcript tabs, and a persistent playback control near the transcript. The user's preference is for Otter's import/record button prominence, font sizes, hierarchy, speaker rematch, and labels. Language choice must reflect models actually installed on the device; an English-only whisper model must not claim multilingual support. AI outputs need transcript citations and must reflect edits and corrected speakers when regenerated.
