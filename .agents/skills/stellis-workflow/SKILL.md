---
name: stellis-workflow
description: Work on the Stellis repository and its browser-first interview product, Otter workflow references, architecture decisions, scoped GitHub tickets, and native Flutter direction.
---

# Stellis workflow

Apply this skill only to `/Users/slee/Repos/stellis` or `reversely/stellis`. Read the repository's `AGENTS.md`, `plans/`, `docs/otter-ui-reference.md`, and `docs/current-architecture.md` as relevant. The user may replace the implementation plan when a significant reason is documented.

## Product requirements

- The browser interface must support reliable import and recording, real on-device machine transcription, speaker diarization and rematching, transcript replay and scrubbing, click-to-seek turns, word editing, vocabulary, speaker assignment, and source-backed Nebius Nemotron summaries and AI features. Validate end-to-end on the real interview data in `data/` where appropriate.
- Preserve Otter's core transcript navigation and audio mechanics as the workflow reference. Inspect the live Otter account and each named screenshot, page, or video before changing corresponding UI. In particular inspect highlights, word selection, scrubbing, speaker labels, and the conversation three-dot menu. Do not claim parity from a static screenshot.
- Speaker tagging should be compact and consistent for named and unnamed speakers; use `docs/refs/labelspeaker.png` and `docs/refs/labelspeaker2.png` alongside the live flow. Keep rematch, summary regeneration, and deletion in the conversation three-dot menu. Combine adjacent fragments from one speaker where the evidence supports it.
- Keep UI copy minimal, with familiar labels. Do not name Otter in product UI or add eyebrow text above headings. Show an unnamed speaker as `Speaker N` without a review prompt. A recoverable action is **Delete**; show items in Recently Deleted and remove them after 30 days. Follow the repository's UI instructions and the global `ui` skill.
- Read `docs/ui-style-guide.md` before interface work; use its color, shape, control-state, copy, and browser-check rules. Update it when an accepted interface decision changes.
- Preserve distinct Import and Record actions, the requested type scale and hierarchy, and a cosmos dark default direction informed by Granola and Penguin. Edited Transcript is a separate tab for a quotable cleanup of exact spoken words, filler, artifacts, and misspeaks.
- Optional login and end-to-end encryption are stretch work to be delivered through scoped tickets. Flutter remains required for the eventual iOS app and cross-platform native direction; the browser acceptance target comes first. Keep a durable cross-app backend and connection architecture.
- Use only FOSS dependencies and integrations in the delivered product, with Nebius as the sole permitted non-FOSS external integration. Audit shipped and transitive licenses before adopting an editor or service. Do not adopt Tiptap for the notes editor.
- **Inverted** means the control's fill takes the theme's text colour and its glyph or label takes the colour of the surface behind it: a light fill with a dark glyph in dark mode, a dark fill with a light glyph in light mode. It never means a flat accent-coloured button. The Summary regenerate icon is the reference.
- Notes and Live transcript are the visually distinct primary conversation tabs; use a filled selected tab with inverted colors. Within Notes, My Notes and Enhanced Notes are a quieter secondary choice. Generate Enhanced Notes on first visit when a transcript is ready and let users refresh it without changing My Notes.

## Delivery and evidence

- File scoped GitHub issues, implement and browser-test complete workflows, close tickets through merged PRs to `main`, and continue while authorized work remains.
- As soon as a feature passes its required validation, rebase its branch onto current `main`, rerun checks affected by the rebase, and merge its PR immediately. Do not leave validated work waiting in a draft PR. Clear any concrete merge gate before considering the feature delivered.
- Keep `docs/current-architecture.md` exact once the product is live. Include a Mermaid diagram and commit every architecture-document change in its own commit. Record consequential architecture forks in ADRs.
- Maintain `docs/otter-ui-reference.md` as an observation ledger. Record every distinct user feedback item and the actual states inspected, then file focused tickets for gaps. Separate observations, inferences, and unknowns.
- Persist each feedback item in project documentation or a focused issue with its status (open, implemented, verified). Recheck earlier feedback affecting the same workflow before editing and before delivery; only mark UI feedback verified after checking the relevant desktop and narrow browser states against its actual reference. Keep project-specific rules here rather than in global skills.
- For speaker labels and other UI derived from saved entities, test the full write → database projection → reload → visible index path, including removal or rename. Treat a visible turn label and its index entry as one consistency requirement.
- A visible speaker name is not proof of a saved Person. For every Tag flow, assert a single Person row, the expected passage links, and the picker and Manage Speakers options after reload. Repeated tags of the same normalized name must reuse that identity; legacy passage labels with that name must be promoted together without changing other confirmed people.
- Check every UI path that can name a speaker, including Manage Speakers and its detailed passage editor. A UI name write must create or reuse a Person through the canonical Tag API; the manual-label API remains for clearing legacy labels and technical overlays, not for a second naming workflow.
- Reuse one Otter tab and one Stellis tab when possible; close agent-created duplicate tabs and test profiles. Preserve unrelated user browser tabs.
