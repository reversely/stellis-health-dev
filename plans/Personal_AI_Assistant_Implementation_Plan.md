# Personal AI Memory Assistant: Detailed Implementation Plan

Date: October 15, 2026
Status: Proposed implementation architecture, grounded in published documentation.
Product reference: Otter. In the request, “Evry” was clarified to mean “every workflow.”
Target: Android, iOS, macOS, Windows, and a persistent web interface.
AI provider: Nebius Token Factory, using a verified Nemotron model.

## 1. Outcome and implementation decisions

Build a personal assistant that records conversations, remembers labeled speakers across recordings, organizes recordings and files in notebooks, answers questions about the user's history with evidence, and maintains useful tasks and dashboards.

Use Otter's observable product workflows as the reference. This plan does not claim knowledge of Otter's internal architecture or propose changing its closed source clients. The proposed system owns the clients, data, and orchestration; Nebius supplies hosted language-model inference.

The architecture below is an engineering recommendation. All performance thresholds, sprint estimates, and interface contracts are proposed targets, not measured results.

#### App framework

**Proposed implementation:** Flutter for Android, iOS, macOS, Windows, and web

**Reason:** Share domain logic, state, and most UI while keeping audio capture native.

#### Local storage

**Proposed implementation:** Drift over SQLite on native clients; encrypted media files

**Reason:** Local operation and transactions remain independent of account availability.

#### Browser storage

**Proposed implementation:** Encrypted record cache in IndexedDB; decrypted search index in memory initially

**Reason:** Avoid assuming that native database encryption automatically works in browsers.

#### Hosted language model

**Proposed implementation:** Nebius Token Factory through a provider adapter

**Reason:** Summaries, task proposals, grounded answers, and optional query interpretation.

#### Initial ASR

**Proposed implementation:** whisper.cpp native adapter; benchmark multilingual small/base candidates

**Reason:** A Nebius text key alone should not require another cloud speech service.

#### Speaker pipeline

**Proposed implementation:** sherpa-onnx segmentation, clustering, and speaker embeddings

**Reason:** Keep within-recording diarization distinct from cross-recording identification.

#### Search

**Proposed implementation:** Local lexical index first, local semantic embeddings second

**Reason:** Useful retrieval remains available without sending the entire archive to inference.

#### Sync backend

**Proposed implementation:** FastAPI, PostgreSQL, S3-compatible object storage, OIDC authentication

**Reason:** The application syncs encrypted records and media independently of inference.

#### Encryption

**Proposed implementation:** Established libsodium primitives; per-vault keys and device key wrapping

**Reason:** Servers should not need content keys to store or synchronize the archive.

#### Initial credentials

**Proposed implementation:** User supplies a Nebius key on each native device

**Reason:** Avoid a shared production secret inside distributed applications.

#### Web inference

**Proposed implementation:** Explicit inference relay using an ephemeral user-supplied key

**Reason:** Browser CORS support is an implementation check; relay processing is disclosed.

#### First release collaboration

**Proposed implementation:** One user's devices

**Reason:** Keep identity sync and content privacy tractable before adding team sharing.

#### External actions

**Proposed implementation:** Export and task proposals first

**Reason:** Connected email, calendar writes, and ticket creation become separate capabilities.


Flutter officially supports mobile, desktop, and web, and exposes native integration mechanisms [S10]. This is a shared application, not an expectation that audio or model binaries are identical across platforms.

Default privacy mode: audio processing and voice matching on the recording device; selected text goes to Nebius; archive sync is end-to-end encrypted. “Local-first with optional hosted inference” is the accurate description. Entirely on-device language-model generation is a later adapter, not a promise made for Token Factory mode.

## 2. What Otter actually does, and what to reproduce

Sources were inspected on October 15, 2026. Some Otter help pages are older, while the AI Chat documentation describes an active rollout. Published workflows are evidence of product behavior; availability can vary by account, platform, and plan. No signed-in Otter session or hands-on comparative accuracy test was performed.

#### Desktop capture

**Documented Otter behavior:** Botless capture supports computer audio while wearing headphones, plus microphone capture and recording controls [S1].

**Implementation response:** Native microphone and loopback adapters, independent tracks, visible controls.

#### Meeting entry and exit

**Documented Otter behavior:** Desktop can detect meetings and offer or automate recording [S1].

**Implementation response:** Manual capture first; reminders and detection added after capture reliability.

#### Meeting bot

**Documented Otter behavior:** Notetaker can join Zoom, Google Meet, or Teams as a participant [S2].

**Implementation response:** Separate future service. Native capture is sufficient for the initial personal product.

#### Conversation review

**Documented Otter behavior:** Transcript/audio review, summary, outline, action items, highlights, comments, and images are grouped around a conversation [S3].

**Implementation response:** A conversation is the canonical record with linked derived views.

#### Speaker labeling

**Documented Otter behavior:** Unknown speakers receive numbered labels; manual tags help later recognition; Otter documents automatic identification and rematching [S4].

**Implementation response:** Local speaker instances plus persistent person profiles and reversible assignments.

#### Organizing

**Documented Otter behavior:** Folders hold conversations; channels also support shared conversation context [S5, S6].

**Implementation response:** Notebooks and saved views are separate from people and recording types.

#### Memory chat

**Documented Otter behavior:** Chat can work across meetings and selected context. New Chat/Work experiences include connected-app actions, with platform rollout differences [S6].

**Implementation response:** Scope-aware retrieval and answers first; external actions separately versioned.

#### Tasks

**Documented Otter behavior:** Action items can be assigned, edited, completed, and collected in a global personal list [S7].

**Implementation response:** Source-backed proposals become persistent task records after confirmation.

#### Import/export

**Documented Otter behavior:** Existing recordings can be transcribed; exports include transcript formats and audio, subject to plan/permissions [S8].

**Implementation response:** Explicit imports and open exports; migration does not depend on private Otter endpoints.

#### Personal people pages

**Documented Otter behavior:** Speaker recognition is documented; the reviewed sources do not establish the exact personal-memory page proposed here.

**Implementation response:** Treat person timelines, shared commitments, and evolving topics as our own feature requirements.

#### Custom life dashboard

**Documented Otter behavior:** The reviewed documentation does not establish the full customizable dashboard described in this project.

**Implementation response:** Build dashboard views over our records rather than claiming Otter parity for this layer.


Do not copy Otter's UI assets or assume every paid enterprise capability belongs in the initial release.

## 3. Scope and release boundaries

### Release A: usable recording and recall

Deliver microphone recording on iOS and Android; microphone plus system audio on Mac and Windows; file import; playback; editable transcripts; people labels; notebooks; Nemotron summaries; local search; scoped AI chat; structured task proposals; Markdown/JSON/SRT/audio export.

Speaker recognition is included as an explicitly evaluated feature. It starts with suggestions, then earns automatic matching through validation. One label can create a profile, but one noisy sample is not enough to guarantee recognition.

Local history works without an account. Hosted summary/chat requires a network and a valid Nebius credential. The recording device runs its processing jobs while active.

### Release B: encrypted cross-device memory

Add optional account creation, device enrollment, encrypted record/media sync, recovery, conflict handling, encrypted backup, and a web interface for history, tasks, search, and chat.

A phone can record, transcribe while active, and sync results to a browser without a desktop remaining online. Processing that was never completed on the phone remains visibly queued. The sync server cannot run ASR on encrypted audio.

### Release C: richer assistant and automation

Add live transcription improvements, local semantic retrieval, dashboard customization, calendar reminders, meeting detection, task-update suggestions across recordings, and optional authenticated local-model endpoints.

Shared notebooks, bot attendance, cloud ASR, email/ticket actions, and a local-only LLM are separate increments. They have integration, privacy, and operating-cost requirements beyond replacing Otter's text model.

## 4. Components and exact ownership

#### Application UI

**Executes where:** Native client / browser

**Owns:** Recording controls, timeline, editor, people, notebooks, chat, tasks, dashboard.

#### Domain core

**Executes where:** Client

**Owns:** IDs, schema validation, relationships, task rules, source references, conflict materialization.

#### Capture adapter

**Executes where:** Native platform

**Owns:** Permissions, audio tracks, timestamps, interruption handling, durable capture.

#### Speech worker

**Executes where:** Native client

**Owns:** Decode, resample, VAD, transcription, diarization, speaker embeddings.

#### Search worker

**Executes where:** Client

**Owns:** Text extraction, indexing, ranking, scope filters, evidence selection.

#### Provider adapter

**Executes where:** Native client / web relay

**Owns:** Model requests, streaming, usage, timeouts, capability checks.

#### Vault module

**Executes where:** Client

**Owns:** Keys, encryption/decryption, record envelopes, local locking.

#### Sync service

**Executes where:** Backend

**Owns:** Authentication, device membership, encrypted change log, object references, quotas.

#### Object store

**Executes where:** Backend

**Owns:** Encrypted audio and attachments, chunk availability.

#### Web inference relay

**Executes where:** Backend, when enabled

**Owns:** Forward the specific inference request; never retrieve/decrypt the archive.


The sync server receives ciphertext. A web inference relay receives request plaintext by design. Keep their logging policies and permissions separate; do not describe the whole backend as blind to every request.

## 5. Repository and dependency boundaries

Use a monorepo with these logical modules:

    apps/client/                 Flutter application and responsive routes
    packages/domain/             Entity types, events, validation, state reducers
    packages/storage/            Drift schema, migrations, encrypted file access
    packages/capture/            Federated native capture interfaces
    packages/speech/             whisper.cpp and sherpa-onnx adapters
    packages/retrieval/          Chunking, lexical/semantic search, citations
    packages/providers/          Nebius and future local inference adapters
    packages/vault/              Key handling and record encryption
    packages/sync/               Outbox, cursor, conflict handling, media transfer
    packages/ui/                 Design tokens and shared components
    services/sync_api/           FastAPI and PostgreSQL
    services/inference_relay/    Optional browser relay
    contracts/                   JSON schemas and cross-language fixtures
    evaluations/                 Consented audio/text fixtures and scored results
    docs/                        Markdown architecture and operating procedures

Native capture modules depend on domain interfaces, not on Nebius. The provider adapter accepts already prepared text. Search, tasks, and people features must not depend on a model vendor's response object.

Pin framework, native library, and model versions in a lockfile/manifest after compatibility checks. Record weight checksums, licenses, languages, embedding dimensions, sample rates, and supported execution targets. Open source runtime licensing does not automatically establish model-weight licensing.

## 6. Data model

Use random UUIDs generated on the device. Store UTC timestamps plus source timezone/offset where meaning depends on local time. Every object belongs to a vault. Names, titles, tags, and object relationships are inside encrypted payloads when synced.

#### Vault

**Important fields:** id, schema_version, key_epoch, created_at

#### Device

**Important fields:** id, public_key, enrolled_at, revoked_at, capabilities

#### Conversation

**Important fields:** id, title, started_at, timezone, kind, capture_status, processing_status

#### RecordingAsset

**Important fields:** id, conversation_id, codec, duration_ms, tracks, encrypted_blob_refs

#### AudioChunk

**Important fields:** asset_id, sequence, track_id, source_sample_start, duration_ms, checksum

#### TranscriptRevision

**Important fields:** id, conversation_id, parent_revision_id, ASR model/version, created_at

#### Segment

**Important fields:** id, revision_id, start_ms, end_ms, text, speaker_instance_id, provenance

#### Person

**Important fields:** id, display_name, aliases, optional metadata

#### SpeakerInstance

**Important fields:** id, conversation_id, local_label, selected_person_id, assignment_origin

#### VoiceProfile

**Important fields:** id, person_id, model_version, sample_refs, encrypted_embeddings

#### SpeakerAssignment

**Important fields:** segment_or_instance_id, person_id, evidence, status, supersedes

#### Notebook

**Important fields:** id, title, description, default_template

#### NotebookItem

**Important fields:** notebook_id, item_type, item_id, position

#### Note

**Important fields:** id, title, body, revision, attachment_refs

#### Document

**Important fields:** id, asset_ref, mime_type, extraction_status, extracted_revision

#### Annotation

**Important fields:** id, target_revision, segment/page anchor, comment_or_highlight

#### DerivedArtifact

**Important fields:** id, type, content, input_revision_ids, model_id, prompt_version

#### Task

**Important fields:** id, title, owner_person_id, due_at, timezone, status, proposal_status

#### TaskEvidence

**Important fields:** task_id, conversation_or_document_id, revision_id, source_anchor

#### TaskEvent

**Important fields:** id, task_id, event_type, payload, base_version

#### ChatThread

**Important fields:** id, explicit_scope, title, created_at

#### ChatMessage

**Important fields:** id, thread_id, role, content, evidence_refs, model_id, request_id

#### SavedView

**Important fields:** id, entity_type, filters, sort, visible_fields, layout

#### DashboardWidget

**Important fields:** id, view_id, configuration, position

#### ProcessingJob

**Important fields:** id, stage, input_hash, version_bundle, status, attempts

#### SyncOperation

**Important fields:** id, device_id, device_sequence, object_id, base_version, encrypted_payload


Key relationships:

- One conversation can reference multiple people and multiple notebooks.
- “Lecture” is a recording type, not a folder location.
- A person mentioned in speech is distinct from a person confirmed as a speaker.
- A task may have evidence from multiple recordings; it is not copied into a new task each time.
- Audio, transcript revisions, and edited notes remain distinct.
- Derived artifacts are reproducible projections, not the only copy of the source.
- Chat answers are not indexed as independent factual evidence by default. Search the underlying sources to avoid answers reinforcing previous generated mistakes.
- Deleting a notebook removes membership by default, not its recordings.
- Deleting a source invalidates related evidence and search chunks.

## 7. Workflow: onboarding and credentials

1. Open the app into a local vault without registration.
2. Choose microphone input and test recording/playback.
3. Explain the two processing destinations concisely: audio stays on-device by default; selected text is processed by Nebius.
4. Download the selected ASR and speaker-model bundle. Verify checksum and available disk space.
5. Add a Nebius API key. Store it in OS secure storage, never in the synced content vault or source control by default.
6. Validate the configured base URL and model using a small non-personal request.
7. Display a useful connection result: authenticated, model accessible, streaming supported, JSON mode supported or fallback required.
8. Offer optional encrypted sync setup after the local workflow works.

An app account and a Nebius account are separate identities. Signing into the app does not grant Token Factory access. Each device initially receives its own manually entered Nebius key; encrypted key transfer can be a later explicit option.

Browser sessions hold provider keys in memory by default and clear them on logout. Never embed a shared Nebius key in Flutter web output.

Acceptance: invalid credentials do not block recording, playback, notebooks, or local search.

## 8. Workflow: reliable recording

### Platform adapters

#### iOS

**Initial capture path:** AVAudioEngine/AVAudioSession microphone capture; configure recording background mode and interruptions

**Boundary:** In-person audio and voice memos. Do not promise generic capture of other apps' calls.

#### Android

**Initial capture path:** AudioRecord plus a microphone foreground service and persistent recording notification

**Boundary:** Handle permission, process lifecycle, input contention, Bluetooth changes, and OEM behavior.

#### macOS

**Initial capture path:** Microphone plus Core Audio process taps on compatible OS versions

**Boundary:** Ask for required permissions; select capture source; test supported OS baseline.

#### Windows

**Initial capture path:** WASAPI microphone and loopback capture

**Boundary:** Track output-device changes; endpoint loopback can contain the entire system mix.

#### Web

**Initial capture path:** Review/search/chat first; optional foreground microphone recording later

**Boundary:** Browser microphone access is not equivalent to desktop system-audio capture.


Apple documents Core Audio taps [S11]; Android documents microphone-service requirements and restricted playback capture [S12]; Microsoft documents WASAPI loopback [S13]. Android playback capture generally applies to eligible media/game/unknown usages and capture policy, not an unrestricted VoIP-call recorder. These constraints are why capture stays platform-specific.

### Capture implementation

1. Create Conversation and RecordingAsset in one transaction before capture starts.
2. Capture device-native PCM into a bounded ring buffer. Write durable chunks independently of transcription.
3. Keep microphone and loopback tracks separate. Associate them with one monotonic timeline; account for differing rates and clock drift.
4. Produce compressed archival chunks, initially targeting approximately five seconds each. Commit complete chunks atomically.
5. Encrypt committed chunks before long-term persistence. Any temporary cleartext buffers/files are bounded and cleaned on normal completion and recovery.
6. Resample worker input to the selected model's required format, commonly 16 kHz mono. Preserve source-sample offsets for timestamp reconstruction.
7. Pause/resume writes explicit timeline events. Avoid inventing speech timestamps across a pause.
8. Show recording duration, input level, selected source, and pause/stop controls.
9. Recover after a crash by validating the manifest, retaining committed chunks, and marking the recording interrupted.
10. A network failure must not interrupt audio capture.

Do not blindly mix both tracks: remote voices leaking into the microphone can duplicate speech. Prefer separate processing with cross-track duplicate detection or tested echo handling. A microphone track does not prove every utterance belongs to the device owner.

Acceptance: for a forced termination, lose no more than the uncommitted chunk under the defined test harness; preserve earlier audio and make recovery visible. Test headphones, speakers, Bluetooth reconnects, sleep, and disk-full conditions.

## 9. Workflow: transcription and speaker recognition

### Speech pipeline

    audio chunks
      -> decoding/resampling
      -> speech activity detection
      -> ASR segments
      -> segmentation and speaker clustering
      -> alignment of words/segments with speaker turns
      -> speaker embeddings and identity matching
      -> versioned transcript

These stages can share decoded audio, but should expose distinct contracts.

whisper.cpp provides native deployment examples and runtimes [S14]. sherpa-onnx documents diarization and speaker identification, including Dart examples [S15]. Those examples establish an implementation starting point, not accuracy or battery guarantees on the user's phone.

### Practical execution policy

- Desktop: incremental ASR may run during recording; finalize after stop.
- Mobile: prioritize uninterrupted capture. Default to post-recording ASR while the app is active; incremental mode is enabled only for benchmarked devices.
- If the OS suspends processing, save the job state and resume when allowed. Background recording permission is not permission for unlimited background inference.
- A device without enough resources can keep the recording and queue processing. A future paired worker or explicitly enabled cloud speech endpoint can process it.
- Web: display finalized synced transcripts. Do not silently decrypt audio on the server for processing.

Initial ASR candidates: multilingual Whisper base/small, with a device-specific choice after measuring. Use the same transcript schema for later NVIDIA speech adapters. Nemotron Speech deployed on a GPU would be a separate service and cost center unless the selected provider explicitly exposes the required speech API.

### Stable transcript contract

    {
      "conversation_id": "uuid",
      "revision_id": "uuid",
      "segments": [{
        "id": "uuid",
        "start_ms": 18400,
        "end_ms": 22500,
        "text": "I will send the revised drawing on Friday.",
        "speaker_instance_id": "uuid",
        "origin": "asr",
        "timing_quality": "segment"
      }]
    }

Word timings are optional. If the selected ASR path only supplies segment timing, show segment-level citations rather than pretending to have word alignment.

### Label once, recognize later

1. Diarization creates a conversation-local speaker instance.
2. The user labels it as an existing or new Person.
3. Show the scope of the change: this segment, this speaker cluster, or this conversation.
4. Build the voice profile only from explicitly confirmed, high-quality, non-overlapping samples.
5. Initial enrollment target: accumulate roughly 15-30 seconds across clean turns where available. Shorter data creates a provisional profile.
6. Generate normalized embeddings using a pinned speaker model. Retain several prototypes to represent different microphones or conditions.
7. On a future recording, compare the candidate speaker embedding against that user's profiles.
8. Require both a calibrated similarity threshold and sufficient separation from the second-best match. Scores are not probabilities unless explicitly calibrated.
9. Return confirmed, suggested, or unknown. Start with suggestions; allow automatic assignment only after the evaluation gate.
10. Keep manual corrections authoritative. Never add an automatic prediction to the training/profile set without confirmation.
11. Encrypt profile embeddings and source references. Offer delete, merge, split, and rematch.
12. When the embedding model changes, re-enroll or recompute from retained samples; embeddings from incompatible model versions cannot be compared directly.

Do not infer identity from a name mentioned in a transcript. Do not use a language model as the acoustic identity matcher. A “Person” does not need an account or an invitation.

Acceptance: test cross-recording identity separately from diarization. Include unknown speakers, similar voices, phone versus laptop microphones, accents, overlap, and noisy rooms. Optimize for avoiding false identification even if more people remain unknown.

## 10. Workflow: transcript review, notes, and reprocessing

Conversation page on desktop:

- Header: title, date, people, recording type, notebook memberships, processing status.
- Main area: Summary / Transcript / Notes / Tasks.
- Side panel: Ask this conversation, sources, or speaker correction.
- Persistent audio player with timestamp navigation.

On phones, use the same objects with tabs and a bottom player rather than squeezing the desktop layout into one screen.

Editing a transcript creates a revision and marks dependent artifacts stale. Relabeling a person updates identity projections and invalidates affected task ownership and summaries. Reprocessing creates a new result; it must not overwrite manually edited notes.

Store manual edits separately or record clear revision ancestry. The user can compare or restore derived output. ASR reruns preserve old anchors through a mapping where possible and label unresolved references otherwise.

Example: “Speaker 2” becomes Maya. Her person page updates immediately. A task generated before the correction is marked for ownership review; the app does not silently retain the old owner in an apparently current summary.

## 11. Workflow: Nemotron summaries and extraction

### Provider contract

    complete(messages, model_id, response_schema?, output_limit, cancellation)
    stream(messages, model_id, output_limit, cancellation)
    capabilities() -> JSON mode, schema mode, streaming, token limits
    usage() -> reported tokens, latency, request identifier

Nebius's official quickstart uses an OpenAI-compatible client with a base URL ending in /v1/ and chat.completions.create [S9]. Its structured-output examples use response_format with JSON objects or JSON schemas and emphasize model-specific support [S16].

Use one base URL convention: configuration stores the versioned API root; the adapter appends chat/completions exactly once. Do not mix roots containing /v1/ with routes that add another /v1/.

### Model selection

Nebius's current official cookbook lists Nemotron models and an example using nvidia/Nemotron-3_5-Lightning [S17]. Treat that as an initial candidate, not a hardcoded availability promise.

At implementation time, resolve the exact model available to the account/region, verify structured output and streaming on that model, run the evaluation set, and pin the chosen model ID. A missing model must produce a recoverable configuration error, not an unannounced switch to another provider.

### Request path

1. Load finalized transcript revision, verified speaker map, recording type, and user notes.
2. Build a task-specific prompt with source IDs and an output schema.
3. Mark transcript/document content as untrusted evidence, not instructions.
4. Request structured output if verified on the selected model.
5. Validate schema, source IDs, ownership, timestamps, and date interpretation locally.
6. Permit one bounded repair retry for malformed output. Preserve valid partial results or show a retry action if still invalid.
7. Save a DerivedArtifact with input revision IDs, model ID, prompt version, usage, and request ID.
8. Generate proposed tasks in a separate transaction after validation.

Suggested output:

    {
      "title": "Drawing review",
      "summary_blocks": [{
        "text": "Maya will revise the drawing.",
        "source_segment_ids": ["segment-uuid"]
      }],
      "decisions": [],
      "topics": [],
      "task_proposals": [{
        "title": "Send the revised drawing",
        "owner_person_id": "person-uuid",
        "due_date_text": "Friday",
        "resolved_due_at": null,
        "source_segment_ids": ["segment-uuid"]
      }],
      "memory_candidates": []
    }

Resolve “Friday” with recording date/timezone and explicit interpretation rules. Ambiguous dates remain unset or proposed for review. Preserve the original phrase. Do not let a model invent an exact deadline.

### Long recordings and cost control

Begin with a bounded chunking policy, for example 1,500-2,500 tokens per analysis chunk with overlapping turns. Extract source-backed facts per chunk, then synthesize a conversation summary while preserving source IDs.

Do not summarize the entire recording every few seconds. Live output, if enabled, runs at a bounded cadence and is labeled provisional. Final summary runs once on the final revision.

Cache by input revision hash + model ID + prompt version + schema version. Cap retries and concurrent requests. After an ambiguous network timeout, warn about potential duplicate provider billing before an explicit rerun; local job deduplication cannot guarantee upstream billing idempotency.

Never print full prompts, transcripts, or provider keys in production logs.

## 12. Workflow: people, notebooks, and imported files

### People

A person's page queries confirmed speaker assignments, linked conversations, explicitly attributed memory facts, tasks involving that person, and source references.

Display a timeline, shared topics, outstanding commitments, and linked notebooks. Keep “said by Maya,” “about Maya,” and “the assistant inferred this” distinct.

Memory facts have valid-from dates, provenance, and optional supersession. A past statement such as “I work at Company A” is not automatically a permanent current fact.

### Notebooks and files

Notebooks contain recordings, typed notes, PDFs, images, text/Markdown, and supported audio/video imports. A membership table supports the same item in multiple notebooks.

Import processing:

1. Validate type, size, and available storage.
2. Compute a local hash for duplicate detection. Do not expose a global plaintext hash in sync metadata.
3. Save/encrypt the original asset.
4. Extract text locally: text/Markdown directly; PDF text layer first; OCR for scanned pages as a later capability.
5. Store page and block coordinates, extraction version, and source anchors.
6. Index only successfully extracted content; show unsupported or pending assets explicitly.
7. Preserve original files regardless of extraction success.

Video import extracts audio with platform decoders; review codec and library licensing before bundling an external decoder.

Accept Otter transcript exports and optional audio, with an import preview. Preserve names/timestamps actually present. A text-only export cannot restore voiceprints or missing audio; speaker names become imported labels, not enrolled acoustic profiles.

Default notebook templates: Meeting, Lecture, Lesson, Personal Conversation, Voice Memo. Templates control summary schema and displayed sections, not storage location.

## 13. Workflow: search and questions about the past

### Retrieval

1. Interpret scope locally: this recording, a person, a notebook, a recording type, date range, or the whole archive.
2. Apply authorization and selected scope before ranking.
3. Search transcript turns, notes, extracted document text, and confirmed structured records.
4. Start with lexical FTS and entity/date filters. Add local semantic embeddings through a separately versioned adapter.
5. Merge lexical and semantic rankings with deterministic rank fusion; an initial candidate pool of 40 and evidence budget of 8-12 passages are tunable starting points.
6. Include nearby turns for pronouns and conversation context.
7. Prepare evidence packets with object ID, revision ID, timestamps/page anchors, speaker assignment status, and text.
8. Send the question and selected packets to Nemotron.
9. Validate citations against the evidence set and render jump links.
10. Save the chat thread and citations as encrypted records.

A browser builds its index from decrypted synced records. For the initial web release, keep the search index in memory and load source text on demand. Large archives require incremental indexing and a measured cache policy; do not promise instant whole-archive semantic search on a newly enrolled browser.

### Answer behavior

- “Who recommended the book?” returns the passage and speaker identity confidence.
- “What changed in my thinking?” compares dated statements and labels the synthesis.
- “When did we discuss the pump?” returns candidate conversations even without a model call.
- “What did Maya promise?” includes confirmed tasks and source passages, not merely task titles.
- If sources are missing, ambiguous, deleted, or not synced, state the coverage limit.
- A model response cannot broaden the selected scope or execute an action.

Do not use summaries as the sole evidence for precise quotations. Recover the transcript passage. Do not claim to have searched recordings whose transcripts are still pending.

## 14. Workflow: persistent tasks and analytics

Task states: proposed, open, in_progress, waiting, completed, cancelled. Keep review state separate from execution state.

1. Extract a task proposal with evidence, possible owner, possible deadline, and explicit versus inferred attribution.
2. Show it in the conversation review and global proposal inbox.
3. The user confirms or edits it, producing a canonical task.
4. New recordings can suggest an update to an existing task. Compare likely duplicates by owner, notebook, text, and evidence; do not merge solely on embedding similarity.
5. A possible completion statement generates a proposed state change. Manual state remains authoritative.
6. Every accepted change appends a TaskEvent.
7. Project notebook, person page, and dashboard display the same task object.

Analytics are deterministic queries over confirmed task states and events:

#### Overdue

**Definition:** Open/in-progress/waiting tasks with a confirmed due time earlier than now.

#### Waiting on a person

**Definition:** Tasks with waiting status and that person as the responsible party.

#### Completion time

**Definition:** Time from accepted creation to accepted completion.

#### Unresolved decisions

**Definition:** Explicit decision-needed records without a confirmed resolution.

#### Follow-up burden

**Definition:** Open accepted commitments by person or notebook.

#### Recording coverage

**Definition:** Recorded minutes, processed minutes, and pending recordings separately.


Exclude unreviewed model proposals from commitment totals. Show the metric's time range and drill-down records. Avoid presenting talk time or recording volume as a productivity score.

The dashboard starts with six selectable widgets: recent recordings, pending processing, open tasks, overdue tasks, people to follow up with, and notebook activity. Saved views specify filters, grouping, sort, and columns. A later assistant can propose a view configuration, but only validated queries enter the dashboard.

## 15. Workflow: accounts, encrypted sync, web access, and recovery

### Authentication and enrollment

Use an OIDC provider with native authorization-code + PKCE and a backend-managed web session. Keep authentication separate from encryption.

1. First device generates a random vault key locally and a device encryption/signing key pair.
2. Protect native private keys using platform secure storage. Verify the chosen plugin's actual guarantees on each OS.
3. Create a high-entropy recovery secret and wrap the vault key under a derived recovery wrapping key.
4. Upload only wrapped keys, public device keys, and ciphertext.
5. A new device signs in and requests enrollment.
6. An existing device approves it after a verified pairing step; encrypt the vault key to the new device's public key. Recovery is the alternative.
7. The new device decrypts the archive locally.
8. Password reset restores account authentication but cannot magically recover encryption keys.

Use established key-derivation and authenticated-encryption libraries. libsodium documents appropriate message/file primitives [S18]. Have the key protocol independently reviewed before claiming production-grade E2EE.

### Record and media sync

Do not synchronize one live SQLite database file between devices.

- Local mutations write an encrypted outbox operation in the same transaction.
- POST /sync/push accepts encrypted operations with unique operation IDs and per-device sequence numbers.
- GET /sync/pull?cursor= returns the authenticated vault's ordered encrypted operations.
- The server assigns cursors and enforces vault membership, size limits, and device revocation.
- The client verifies envelopes, decrypts operations, and materializes its own local database.
- Duplicate operations are harmless.
- Missing sequence numbers are detected and retried; cursors advance only after durable application.
- WebSocket/push notifications carry only “changes available,” not conversation text.

Record envelope example:

    {
      "vault_id": "uuid",
      "object_id": "random-uuid",
      "operation_id": "random-uuid",
      "device_id": "uuid",
      "device_sequence": 42,
      "key_epoch": 1,
      "nonce": "encoded-random-bytes",
      "ciphertext": "encoded-bytes",
      "signature": "encoded-bytes"
    }

Authenticate immutable routing fields as associated data. Keep entity type, titles, speaker names, notebooks, and timestamps inside the payload where practical. The service still sees account identity, devices, traffic timing, object sizes, and opaque IDs. E2EE does not erase metadata.

Media uses authenticated encrypted chunks plus an encrypted manifest. Each chunk uses safe unique nonces and authenticated identity/order information. Download chunks needed for playback; do not make “sync all audio” mandatory.

### Conflict policy

- Conversation memberships and tags: observed add/remove operations with stable element IDs.
- Transcript edits and notes: immutable revisions with base revision; concurrent edits become explicit branches until reconciled.
- Person names: retain conflicting versions and request resolution when necessary.
- Speaker assignments: manual beats automatic; two conflicting manual assignments require review.
- Task state: detect concurrent incompatible transitions; preserve both events and resolve explicitly.
- Generated artifacts: retain versions; select current output by input revision and processing generation.
- Delete: tombstone wins over ordinary late updates. Restore is an explicit operation.
- Concurrent processing: one preferred device per recording initially; input-hash deduplication on sync convergence.

Do not use wall-clock last-write-wins for every field. Device clock differences and old offline edits would corrupt meaningful history.

### Browser privacy

A web login can decrypt history locally after key enrollment. Default to an encrypted persistent cache with unlocked content in memory. Native SQLite encryption does not transfer automatically to web; Drift documents web and encryption as separate integration paths [S19].

The delivered JavaScript/WASM has access to decrypted data while unlocked. E2EE protects server storage, but a compromised web build could steal keys. Use a strict CSP, first-party assets, audited releases, minimal dependencies, and no third-party analytics on unlocked pages. Native clients reduce this particular dependence on freshly delivered web code.

Device revocation stops future synchronization and triggers a new key epoch for future content where appropriate. It cannot erase plaintext or keys already copied by a revoked device.

### Web inference relay

If browser-to-Nebius calls are not supported by the selected endpoint's CORS policy, use:

    POST /inference/chat
      session authorization
      temporary Nebius credential
      prepared messages and selected model
      -> allowlisted Token Factory endpoint
      -> streamed response

Do not accept arbitrary destination URLs. Disable request/response body logging at the app, proxy, and error-reporting layers. Keep credentials only for the request lifetime. The relay sees selected plaintext; archive storage remains encrypted.

Do not make a direct-browser credential design a release dependency without verifying CORS. Do not claim that TLS makes inference end-to-end encrypted against the inference processor.

## 16. Background work, errors, and job state

Processing state is per stage, not a single “done” flag:

    captured -> transcribing -> assigning_speakers -> summarizing -> indexed

Each stage may also be queued, running, suspended, failed, cancelled, or stale.

Job identity is input hash + stage + model bundle + prompt/schema versions. Store checkpoints, attempt counts, and lease ownership locally. ASR, summary, indexing, and sync can retry independently.

#### Network absent

**Behavior:** Capture continues; hosted generation and sync queue.

#### Nebius key invalid

**Behavior:** Show provider error; retain transcript and search.

#### Rate limited

**Behavior:** Bounded backoff with jitter and Retry-After support.

#### Model unavailable

**Behavior:** Ask to select an accessible model; preserve jobs.

#### Invalid generated JSON

**Behavior:** One bounded repair; then show retry/review.

#### ASR too slow/hot

**Behavior:** Pause processing, keep audio, offer lower-resource model.

#### Voice match uncertain

**Behavior:** Keep unknown/suggested; do not force a name.

#### Audio route changes

**Behavior:** Reinitialize capture and record a visible gap if needed.

#### File extraction fails

**Behavior:** Preserve original and show unsupported/pending extraction.

#### Sync conflict

**Behavior:** Retain both revisions and display resolution where needed.

#### Device revoked

**Behavior:** Stop remote access; keep locally held content subject to local controls.

#### Disk full

**Behavior:** Stop safely, finalize committed chunks, explain remaining capture.


A backend cannot deliver zero-knowledge encrypted sync and also continuously analyze all synced content without a client granting a processing path. Account-wide overnight AI work requires an active authorized client, a trusted paired worker, or an explicitly enabled server-processing mode.

## 17. Interfaces to implement

#### Capture.start/pause/resume/stop

**Input:** Device IDs and recording configuration

**Output:** Audio chunks, timeline events, health events

#### Speech.transcribe

**Input:** Audio manifest and ASR model version

**Output:** Versioned transcript segments

#### Speakers.diarize

**Input:** Audio with stable timeline

**Output:** Local speaker intervals/clusters

#### Speakers.enroll/match

**Input:** Confirmed sample refs / candidate embeddings

**Output:** Profile / scored identity suggestions

#### Artifacts.generate

**Input:** Transcript revision, template, notes

**Output:** Validated source-backed artifact

#### Retrieval.search

**Input:** Scope, query, date/person filters

**Output:** Ranked anchored chunks

#### Assistant.answer

**Input:** Question, scope, selected evidence

**Output:** Streamed answer and validated citations

#### Tasks.propose/accept/update

**Input:** Source-backed proposal or task event

**Output:** Persistent task and history

#### Vault.encrypt/decrypt

**Input:** Versioned object and key context

**Output:** Authenticated envelope / plaintext object

#### Sync.push/pull

**Input:** Encrypted operations and cursor

**Output:** Acknowledgements and encrypted changes

#### Export.bundle

**Input:** Selected entities and export options

**Output:** Markdown/JSON/SRT/media bundle


Backend API groups:

- /devices/enrollment and /devices/{id}/revoke
- /sync/push and /sync/pull
- /blobs/upload-init, /blobs/upload-complete, /blobs/{id}
- /vaults/recovery-envelope
- /inference/chat for optional web relay
- /account/export-metadata and /account/delete

Authentication middleware enforces ownership on every endpoint. Blob access uses short-lived authorization and cannot be guessed from object IDs. The sync backend never receives native local filesystem paths.

### Concrete Nebius request wiring

The following is an illustrative Python integration probe, adapted from the official quickstart pattern [S9]. It is not an executed connectivity test. Set NEBIUS_MODEL_ID to the exact accessible Nemotron ID confirmed for the account; do not copy an unverified model name into production.

    import os
    from openai import OpenAI

    client = OpenAI(
        base_url=os.environ.get(
            "NEBIUS_BASE_URL",
            "https://api.tokenfactory.nebius.com/v1/",
        ),
        api_key=os.environ["NEBIUS_API_KEY"],
        timeout=60.0,
        max_retries=0,
    )
    result = client.chat.completions.create(
        model=os.environ["NEBIUS_MODEL_ID"],
        messages=[
            {"role": "system", "content": "Answer only from the supplied evidence."},
            {"role": "user", "content": "Evidence: [s1] Maya will send the drawing. Who will send it?"},
        ],
    )
    answer = result.choices[0].message.content

The native Flutter adapter implements the equivalent HTTP request. This probe does not imply that the shipped app needs a Python runtime. Disable SDK retries here because the application job layer owns retry accounting. For extraction, add the schema format only after the selected model passes a structured-output probe.

#### Summary

**Sent to Nebius:** Selected transcript revision, necessary speaker labels, user notes, output schema

**Remains local:** Audio, voice embeddings, unrelated notebooks

**Trigger:** Finalization or user regeneration

#### Task extraction

**Sent to Nebius:** Evidence turns and constrained person-ID mapping

**Remains local:** Canonical task state until proposals are accepted

**Trigger:** Summary/extraction job

#### Memory question

**Sent to Nebius:** Question, selected recent chat context, retrieved source passages

**Remains local:** Full archive and search index

**Trigger:** User sends a question

#### View configuration

**Sent to Nebius:** User instruction and schema for available views

**Remains local:** Recording contents unless needed and selected

**Trigger:** User asks to configure a view

#### Speaker recognition

**Sent to Nebius:** Nothing in the default architecture

**Remains local:** Audio samples, profiles, embedding comparisons

**Trigger:** Local speech processing

#### Sync

**Sent to Nebius:** Nothing

**Remains local:** Client encrypts before sending to the separate sync service

**Trigger:** Outbox changes


Separate request construction from transport so the exact same prompt/evidence bundle can later use a local model endpoint. Provider interchangeability requires validating capabilities and behavior; sharing an API shape does not guarantee equivalent models or structured outputs.

## 18. Build sequence and acceptance gates

Estimates below are planning estimates for roughly two experienced engineers plus part-time design/QA. Platform signing, store review, E2EE review, and model performance can add time. A solo implementation should budget materially longer. None of these estimates imply all Otter enterprise features are included.

#### 0. Integration and source audit

**Approximate duration:** 1 week

**Deliverables:** Verify Nebius model/API, native audio spikes, ASR/voice-model samples; evaluate existing open source code

**Exit gate:** No fundamental capture/provider blocker on target hardware

#### 1. Local foundation

**Approximate duration:** 1-2 weeks

**Deliverables:** Schema, repositories, vault skeleton, navigation, notebook/person/task fixtures

**Exit gate:** Objects survive restart and migrations; interfaces have contract fixtures

#### 2. Capture and import

**Approximate duration:** 2-3 weeks

**Deliverables:** Four native capture adapters, chunk storage, playback, import, interruption recovery

**Exit gate:** 60-minute test recordings and forced-restart recovery on real devices

#### 3. Speech and people

**Approximate duration:** 2-3 weeks

**Deliverables:** ASR, diarization, correction UI, enrollment, identity suggestions

**Exit gate:** Scored unknown-speaker and cross-device evaluation; no forced identity

#### 4. Nebius intelligence

**Approximate duration:** 1-2 weeks

**Deliverables:** Provider adapter, summaries, task proposals, citation-aware chat, local lexical search

**Exit gate:** Golden workflow set passes with valid sources and bounded retries

#### 5. Encrypted sync and web

**Approximate duration:** 3-4 weeks

**Deliverables:** Enrollment, key wrapping, encrypted operations/media, conflicts, web history/chat

**Exit gate:** Two devices and browser converge; restore/revocation/deletion tested

#### 6. Views, analytics, hardening

**Approximate duration:** 2-3 weeks

**Deliverables:** People pages, templates, saved views, widgets, task events, export, accessibility

**Exit gate:** End-to-end scenarios pass and privacy/recovery review completed


Sequential total: approximately 12-18 engineer-calendar weeks for the described scope at that team size. Some work overlaps, but shared contracts and the audio/privacy gates should be resolved before spreading implementation across UI surfaces.

### Phase 0 decision on reusing an existing app

Otter is a reference, not an open source base. Spend a bounded audit on Omi and Anarlog rather than assuming a model dropdown solves the project.

For each candidate, inspect license boundaries, desktop/mobile client coverage, capture code, server dependencies, transcript schema, speaker-profile persistence, provider hooks, and local accountless operation. Run a small recorded fixture through the candidate.

Reuse only if it demonstrably reduces capture and UI work without forcing a cloud-readable archive or incompatible identity model. Omi is a relevant source candidate because it publishes mobile/desktop/backend code [S20]; this plan has not completed that code audit.

If a candidate passes, map its modules onto the interfaces above and rewrite the estimates around retained code. Otherwise implement the Flutter architecture. Do not maintain two full clients in parallel or call a major rewrite an adapter change.

## 19. Evaluation plan

Build a consented evaluation set before tuning. Keep a development subset separate from a held-out acceptance subset.

Initial set: at least 20 recordings totaling about 8-10 hours, covering clean one-to-one conversations, small group meetings, lectures, noise, overlapping speech, phone/laptop microphones, and repeated speakers across days. Include at least ten recurring voices plus genuinely unseen voices; enlarge the unknown-speaker set before making statistical reliability claims.

These are proposed release gates:

#### Capture durability

**Evaluation:** 60-minute recordings on each supported native platform; interruption, route-change, disk-full, and forced-close cases.

#### ASR quality

**Evaluation:** Report word error rate separately by language/noise condition; initial clean-English target around 15% or better. Publish actual results rather than one aggregate.

#### Processing speed

**Evaluation:** Target ASR real-time factor at or below 1 on declared baseline devices; slower devices visibly queue or use a smaller model.

#### Diarization

**Evaluation:** Report diarization error rate with the evaluation convention stated; inspect overlap separately.

#### Identity

**Evaluation:** Measure false identification, missed match, and unknown rejection separately. Target under 1% false assignment on held-out trials before enabling automatic names, with sample counts and uncertainty.

#### Speaker corrections

**Evaluation:** Correct one segment, cluster, and person merge without losing transcript provenance.

#### Extraction

**Evaluation:** Every emitted task/fact has valid evidence IDs; manually score ownership, deadlines, and unsupported claims.

#### Retrieval

**Evaluation:** Hand-label roughly 50 memory questions; initial target that a supporting source appears in the top ten for at least 90%.

#### Answers

**Evaluation:** All citation links resolve to supplied sources; test factual support separately from citation syntax.

#### Task lifecycle

**Evaluation:** Repeated mention does not duplicate accepted tasks; proposed completion cannot silently override manual state.

#### E2EE

**Evaluation:** Server/database/object-store inspection exposes no test titles, transcript text, names, or keys; tampering fails authentication.

#### Sync

**Evaluation:** Concurrent offline edits, duplicate pushes, interrupted transfers, tombstones, replay, device clock skew, and old-client reconnection.

#### Recovery

**Evaluation:** Fresh device restores with recovery secret; account-password reset alone cannot decrypt a vault.

#### Web

**Evaluation:** Search/chat on a representative archive after enrollment; measure initial load, memory use, cache clearing, and browser eviction.

#### Accessibility

**Evaluation:** Screen-reader navigation, large text, keyboard access, contrast, and non-color-only processing indicators.


These thresholds are not current claims about the selected models. Failed gates change rollout policy, model choice, or supported hardware, not the recorded test result.

## 20. Development, staging, and production

- Local development: synthetic or explicitly consented fixtures; mocked provider for most UI work; isolated local backend and object store.
- CI: schema fixtures, migrations, reducers, retry behavior, adapter contracts, retrieval/citation checks, crypto interoperability vectors.
- Staging: separate account namespace, object bucket, signing credentials, OIDC client, and Nebius project/credential where available.
- Production: signed native builds, store distribution, staged rollout, narrowly scoped telemetry, reversible database migrations where practical.
- Content telemetry is off by default. Operational events include stage duration, failure category, model version, bytes, and token counts without private text.
- Keep native and server schema compatibility windows explicit. Older clients must not overwrite fields they do not understand.
- CI on hosted machines does not replace microphone, Bluetooth, screen-lock, and permission tests on physical phones and desktops.

## 21. Cost and operating model

Track cost per processed recording and per question. Do not quote a fixed subscription or model price until the selected model and usage are measured.

    monthly cost =
      text input tokens * current input price
      + text output tokens * current output price
      + encrypted storage and transfer
      + backend/auth hosting
      + optional hosted speech compute

Local ASR adds device compute, model downloads, and battery use rather than Token Factory text charges. Hosted NVIDIA speech would add separate GPU/service costs.

A single five-second audio track at 32 kbit/s is roughly 20 KB; one hour is roughly 14.4 MB before container and encryption overhead. Multiple tracks increase that proportionally. Long-term retained audio can dominate storage; expose separate controls for transcript sync, audio sync, retention, and downloaded cache.

Bound generation size, retry counts, live-summary cadence, and chat retrieval. Do not resend the entire archive with each message. Token counts and dollars belong in usage settings; the main conversation interface should show useful processing outcomes.

## 22. Exact first end-to-end implementation ticket

Before building a complete dashboard, complete this one vertical slice:

1. Record a two-person conversation on a phone.
2. Save encrypted audio chunks and recover them after an intentional interruption.
3. Transcribe and diarize locally.
4. Label both speakers; enroll confirmed samples.
5. Generate a source-backed summary and task proposal through a real Nebius Nemotron endpoint.
6. Accept one task and file the conversation in a notebook.
7. Record the same people again; show identity suggestions with a correction path.
8. Ask what one person committed to across both recordings and open the cited timestamp.
9. Enroll a second device and sync the encrypted records.
10. Open the same history in a browser, decrypt locally, and search it.
11. Ask a question through the explicit web relay and record which plaintext crossed that boundary.
12. Export the notebook as Markdown plus JSON and optional audio.
13. Delete one recording; verify search removal and synced tombstone behavior.

This demonstrates the intended assistant, the difficult audio/identity work, the Nebius integration, and the privacy model in one reviewable path.

## Sources

Primary documentation reviewed October 15, 2026. URLs are included for implementation follow-through. Statements about the proposed architecture are our design choices, not claims that these sources describe the complete proposed system.

- [S1: Otter desktop recording and controls](https://help.otter.ai/hc/en-us/articles/35973988280215-Otter-Desktop-App-Mac-Windows)
- [S2: Otter Notetaker overview](https://help.otter.ai/hc/en-us/articles/4425393298327-Otter-Notetaker-Overview)
- [S3: Otter conversation page](https://help.otter.ai/hc/en-us/articles/5093228433687-Conversation-Page-Overview)
- [S4: Otter speaker identification](https://help.otter.ai/hc/en-us/articles/21665587209367-Speaker-Identification-Overview)
- [S5: Otter folders](https://help.otter.ai/hc/en-us/articles/360047740154-Organize-your-conversations-in-folders)
- [S6: Otter AI Chat overview](https://help.otter.ai/hc/en-us/articles/19682180167575-Otter-AI-Chat-Overview)
- [S7: Otter action items](https://help.otter.ai/hc/en-us/articles/25983095114519-Action-Items-Overview)
- [S8: Otter exports and linked import documentation](https://help.otter.ai/hc/en-us/articles/360047733634-Export-conversations)
- [S9: Nebius quickstart, including Python, JavaScript, and cURL examples](https://docs.tokenfactory.nebius.com/quickstart)
- [S10: Flutter platforms and native integration](https://docs.flutter.dev/resources/faq)
- [S11: Apple Core Audio taps](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps)
- [S12: Android microphone services](https://developer.android.com/develop/background-work/services/fgs/service-types) and [playback-capture restrictions](https://developer.android.com/media/platform/av-capture)
- [S13: Microsoft WASAPI loopback](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)
- [S14: whisper.cpp and deployment examples](https://github.com/ggml-org/whisper.cpp)
- [S15: sherpa-onnx diarization](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/index.html), [Dart example](https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/dart.html), and [speaker identification](https://k2-fsa.github.io/sherpa/onnx/speaker-identification/index.html)
- [S16: Nebius structured output and concrete schema examples](https://docs.tokenfactory.nebius.com/ai-models-inference/json)
- [S17: Official Nebius Nemotron cookbook](https://github.com/nebius/token-factory-cookbook/tree/main/models/nemotron)
- [S18: Libsodium file encryption](https://doc.libsodium.org/secret-key_cryptography/secretstream) and [authenticated message encryption](https://doc.libsodium.org/secret-key_cryptography/encrypted-messages)
- [S19: Drift web storage](https://drift.simonbinder.eu/platforms/web/) and [native encryption](https://drift.simonbinder.eu/platforms/encryption/)
- [S20: Omi open source repository](https://github.com/BasedHardware/omi)
