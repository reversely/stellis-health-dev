# R-04 Notebook sources and source-grounded chat

Issue: [#42](https://github.com/reversely/stellis-health-dev/issues/42). Depends on R-01 ([#17](https://github.com/reversely/stellis-health-dev/issues/17)) for PDF and image sources only.

## What the code has today

| Area | Current code | Consequence for R-04 |
| --- | --- | --- |
| Sources in a notebook | `conversations.notebook_id` (recordings and imported audio) and `pages.notebook_id` (written notes). A conversation also has a My Notes text. | Recordings, imported audio and notes can be listed now. PDFs and images wait for R-01. |
| Filing into a notebook | `POST /api/v1/conversations/import` takes `notebook_id` (`server.py:1625`). Recording sessions have `notebook_id`. `pages.create` takes `notebook_id`. | The Add source dialog needs no new upload or recording endpoint. |
| Processing state | `processing_jobs` has one row per transcription job. | The sources endpoint reads each conversation's latest job to show "Transcribing" or "Failed". |
| Retrieval | `source_search.search_sources` deletes and refills one FTS5 table with every passage, My Notes text and page in the account, then runs one query. The query joins all words with AND. | A question such as "what did the doctor say about my blood pressure" matches only passages that contain every word. `agent_runtime._sources` works around this with up to 8 single-word searches, and each search refills the table. |
| Source identity | Search results key a transcript hit by passage id, with no conversation id. | Filtering by checked source needs a parent id on each indexed row. |
| Citations | `agent_runtime` asks the model for `[[source:N]]` markers and `_trusted_citations` replaces each marker with a link built from the retrieved target. The model never writes a URL. | R-04 can use the same marker check. The UI needs the marker list as data to draw numbered chips. |
| Timestamp links | Transcript targets are `/conversation/{id}?at={passage}&t={ms}`. `app.js:1356` opens the transcript tab and seeks the player to `t`. | "Open the transcript at the cited timestamp" works for links today. The right panel needs the same seek inside the notebook view. |
| Notebook view | Six tabs: Activity, Brief, Conversations, Files, Tasks and All items (`index.html:229`). Activity mounts `notebook-work.js`, whose composer is disabled until the notebook has an agent. | A notebook with no agent has no chat today. |
| Quota | H-05 caps each ordinary account at 200,000 tokens per day. | A question that sends 6,000 tokens of source text costs about 7,000 tokens with the answer, so an account gets about 28 such questions per day. |

## Proposed design

### Source ids

Proposal: every source has a typed id: `conversation:<id>`, `page:<id>` and, after R-01, `document:<id>`. The API, the stored selection and the citations all use this form.

### Endpoints

Proposal:

1. `GET /api/v1/notebooks/{id}/sources` returns `{sources, limit}`. Each source has `id`, `type` (`recording`, `audio`, `note`, later `pdf` and `image`), `title`, `created_at`, `status` (`ready`, `processing`, `failed`) and `selected`. A source with `status` other than `ready` has `selected: false` and cannot be selected.
2. `PUT /api/v1/notebooks/{id}/sources/selection` with `{excluded: [source ids]}`. The server stores the unchecked sources, so a source added later arrives checked.
3. `POST /api/v1/notebooks/{id}/ask` with `{question, source_ids}`. The server intersects `source_ids` with the notebook's ready sources, retrieves passages from that set only, calls Token Factory through `agent_gateway.turn`, and stores both messages. The reply has `answer` (text with `[[source:N]]` markers) and `citations` (`n`, `source_id`, `title`, `excerpt`, `target`, `start_ms`).
4. `GET /api/v1/notebooks/{id}/chat` returns the stored messages, newest last.

### Retrieval

Proposal:

- The server builds passages only from the requested sources. An unchecked source never enters the candidate set, so a test can assert this without inspecting ranking.
- When the selected sources have at most 24,000 characters of text in total (about 6,000 tokens), the prompt includes all of it. Short notebooks then need no ranking.
- Above that size, the server ranks passages with one FTS5 query that joins the question's words with OR, after removing stopwords, and sends the top 12. Twelve matches the current agent limit.
- The FTS table for a question holds only the selected sources, so its size grows with the notebook and stays independent of the account.

### Chat storage

Proposal: a `notebook_messages` table with `id`, `notebook_id`, `role`, `content`, `citations_json` and `created_at`. The chat runs without an agent row or job, so it has no Stop button in the first version. Each answer makes one model call.

### Safety

S-01 ([#28](https://github.com/reversely/stellis-health-dev/issues/28)) and S-02 ([#29](https://github.com/reversely/stellis-health-dev/issues/29)) are unbuilt. Proposal: the ask endpoint calls one `notebook_chat.check(question)` function before retrieval that returns nothing today, so S-01 adds its rules in one place. Phase 3 already requires S-01 before other people get accounts.

### Layout

Proposal, desktop (1024 px and wider): three columns.

- **Sources**, 280 px, collapsible to a 48 px icon strip. Add source and Note buttons, a Select all checkbox, then one row per source with a type icon, title and checkbox, or a status label while it processes.
- **Chat**, flexible width. Messages with numbered citation chips. The input placeholder reads "Ask about your records (4 sources)".
- **Note panel**, 360 px. It shows the opened source: a transcript with an audio player, or a note in the existing editor. With nothing open, it shows the notebook Brief and To-dos, which today have their own tabs.

Proposal, tablet (640 to 1023 px): Sources and Chat as columns, and the note panel opens over the chat.

Proposal, phone (below 640 px): three tabs named Sources, Chat and Note. Opening a source switches to the Note tab.

The Activity feed and the agent instructions move to an Activity tab in the notebook's ⋯ menu. The Conversations, Files and All items tabs leave, because the Sources panel lists the same items.

### Add source dialog

Proposal: Upload files (audio now, PDF and images after R-01), Record and Paste text. Paste text creates a note with the pasted text. The dialog accepts dropped files and shows "12 of 50 sources". Proposal: 50 sources per notebook, which matches NotebookLM's default.

## Checkpoints

Each checkpoint is one pull request with tests and, for UI work, screenshots at 390 px and 1280 px.

| Step | Scope | Done when |
| --- | --- | --- |
| R-04a | `notebook_sources.py`: typed ids, sources endpoint, processing status, stored selection | Tests list a recording, an imported audio file and a note in one notebook, show a processing source without a checkbox, and show a new source arriving checked |
| R-04b | `notebook_chat.py`: scoped retrieval, ask and chat endpoints, citations as data, quota check | A test with two sources checked and one unchecked shows that no passage from the unchecked source reaches the prompt, and that each citation points to a checked source |
| R-04c | Three-pane notebook view with Sources and Chat; citation chips; phone tabs | A notebook with no agent answers a question with chips that open the transcript at the cited time |
| R-04d | Note panel: transcript with audio, note editor, Save answer as note | A saved answer appears in the Sources list as a note |
| R-04e | Add source dialog: upload audio, record, paste text, drop files, source count | A recording made from the dialog lands in the notebook and appears as processing, then ready |
| R-04f | PDF and image sources, after R-01; page citations open the PDF at that page | Issue #42's four "Done when" steps pass on the hosted app |

## Open questions for the owner

1. Proposal: the limit is 50 sources per notebook. NotebookLM's default is also 50.
2. Proposal: agents leave the notebook chat input. A user picks an agent from the Activity tab or the agent chat. The issue keeps an agent choice in the chat, which needs a second control beside the input.
3. Proposal: chat history stays per notebook with no separate threads. NotebookLM also keeps one chat per notebook.
