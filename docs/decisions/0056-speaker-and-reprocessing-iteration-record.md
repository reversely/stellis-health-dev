# ADR 0056: Iteration record for speakers, tags, and reprocessing

Status: record, 2026-10-17. Covers tickets #180, #181, #37, #206, and #210, with PRs #189 to #216.

## Purpose

This record is for anyone who changes the speech pipeline, speaker names, or reprocessing. It lists each step taken on 2026-10-16 and 2026-10-17: what was tried, what was measured, what the repo owner decided or corrected, and which PR shipped the result. The rules that came out of these steps are in [Working rules](#working-rules), and the work still open is in [Open items](#open-items). Each design has an ADR, linked from its step.

## Measures used

Several steps compare results with the Otter export imported with seven long recordings. The export lists who was talking at each timestamp.

- **Talk time with the right person:** each Stellis speaker is paired one to one with the Otter person it overlaps most. The figure is the share of talk time where the passage's Stellis speaker is the person Otter shows at the passage's midpoint.
- **Matched words:** the count of transcript words that also appear in the Otter text for the same audio.

The Otter export is a weak reference. For Hackathon Project Planning and Ideation it lists three people, and the repo owner confirmed there are two.

## Steps

### 1. Passages with no speaker (#180, PR #189)

The transcript labelled 604 of 2,718 saved passages "Unknown speaker". Each of these passages overlapped no acoustic turn, because Pyannote segmentation had skipped speech that Whisper transcribed. Three fallbacks were scored on 465 such passages. Agreement with Otter was 63% for the most frequent speaker, 80% for the nearest turn or passage, and 87% for the closest TitaNet voice prototype. The prototype method shipped, with every filled passage marked uncertain ([ADR 0050](0050-provisional-speaker-for-uncovered-passages.md)). Pipeline v4.

### 2. Sound tags and voice activity detection (#181, PR #200)

Whisper wrote passages such as `(scissors snipping)` for non-speech audio. Of 2,718 saved passages, 159 held only a tag. Decoding options were compared first on clips. `--suppress-nst` with a vocabulary prompt wrote 964 words in a silent stretch, of which 50 matched Otter. `--max-context 0` also drops the vocabulary prompt, because whisper.cpp builds the prompt only when `n_max_text_ctx > 0`. On an 11-minute clip, Silero VAD v6.2.0 gave the best result: 105 matched words against 58.

The repo owner approved adding the Silero model on the clip results. Full recordings then reversed the result: VAD matched 2.8% to 6.1% fewer words on a 40.9-minute recording and none more on a 57.8-minute one. `whisper-cli --vad` also left token times on its shortened timeline. The repo owner agreed to drop VAD. A filter that removes tag-only passages shipped alone ([ADR 0051](0051-non-speech-passage-filter.md)). Pipeline v5.

### 3. Reprocessing that the app did not show (PR #203)

Older transcripts were reprocessed by queuing jobs from a script. A job queued that way showed nowhere in the app until its conversation was opened. The repo owner asked for every job to be visible in the app and for reprocessing to go through the app's Reprocess action. Each library card now shows "Queued", the step and percentage, or "Processing stopped", and the list refreshes while a job runs.

### 4. Too many speakers (#37, PRs #204 and #205)

The diarizer split two to five people into 11 to 35 speaker groups. Each passage's TitaNet fingerprint was grouped with spectral clustering, which estimates the speaker count from the Laplacian eigengap. The pruning rule follows Park et al., arXiv 2003.02405. The rule was tuned on three recordings and checked unchanged on four. Talk time with the right person rose from a mean of 65% to 87%, and speaker groups fell to two to five ([ADR 0053](0053-passage-speaker-clustering.md)). Pipeline v6.

The first live run gave a one-minute recording with six passages five speakers, because the affinity graph falls apart with that few passages. Clustering now needs 20 embedded passages, and smaller recordings keep turn assignment. Pipeline v7.

### 5. Worker left running after a restart (#206, PR #208)

Restarting the server to install a release left `python -m stellis.worker` and its `whisper-cli` running. The orphan kept writing progress for a stopped job, so two recordings were processed at once. Each worker now runs in a separate process group: the server stops the group on shutdown, and the worker exits when its parent disappears.

### 6. Review screen removed (PR #207)

A reprocess re-cut one confirmed passage in "How it works" into two sentences. The app then showed a "Review new transcription" screen with rows such as "person, 0:00, split" and a "Choose a result" dropdown. The repo owner said "the whole feature is broken. that's not how transcripts should work" and "NEVER hardcode UI to portray the results of a test rather than how the app should function for a user." A reprocess now activates the new transcript and carries user changes over automatically. A passage the user edited is kept as written when it no longer lines up ([ADR 0054](0054-carry-overlays-without-review.md), which supersedes ADR 0017).

### 7. Voice suggestions and name looks (#210, PRs #211 and #212)

The repo owner chose suggestions that the user confirms with one click. Names take three looks:

- **Grey:** filled in automatically.
- **Ink:** carried from the user's label on another passage.
- **Ink with a filled check circle:** the passage the user labelled.

Fingerprints are stored per passage, and a visible "Indexing voices" job fills older transcripts ([ADR 0055](0055-voice-suggestions.md)). Same-name neighbours now share one turn whatever their uncertainty, which revises [ADR 0009](0009-display-only-speaker-turns.md).

A browser check found two display faults before release. In light mode, the more specific `.turn-heading span` rule recoloured the check's tick to `--quiet`, almost the circle's colour, so the tick was invisible. The first grey (`#605465`) also sat too close to the ink (`#2A252F`), so automatic names got a separate `--speaker-auto` token. After release, four recordings with no speech failed indexing ("need at least one array to stack"), and their cards read "Processing stopped" until PR #212.

### 8. Whisper repetition loop (PRs #213 to #216)

The v7 reprocess of Hackathon Project Planning and Ideation saved 17 passages of "I need to get a table," between 3:41 and 10:21. The transcript from before 2026-10-17 had no loop. The same audio decoded alone transcribed normally, because the loop comes from context Whisper carries across a long file. Fixing it took four PRs:

| PR | Change | Effect on the Hackathon recording |
| --- | --- | --- |
| #213 | Re-decode a looping stretch alone; then without context; else keep the first copy | Fresh decode had no loops, but 6 looping passages stayed in the app |
| #214 | Move names by time overlap instead of keeping the old passage | 1 looping passage stayed, at 4:10, where new speech was absent |
| #215 | Drop a name whose time has no new speech; final loop guard | No loops; "I need to get a table" once, where it was said; 644 words in the stretch, against 630 before |
| #216 | Show a speaker group's person on the passages the carry-over missed | Two names for two people instead of three |

The looping passages carried a Shereen Lee person link. The ADR 0054 rule then kept those old passages to hold the name, which is why #213 alone did not clear them. Pipelines v8 to v10.

## Working rules

- **Measure on full recordings.** A clip result reversed on full recordings in step 2. A change to decoding or grouping is compared with current output on whole recordings before it ships.
- **Ask the repo owner when Stellis and Otter disagree.** Otter's three people in the Hackathon recording were wrong, and an early report called the correct two-speaker result a merge.
- **Reprocess through the app.** Jobs are started with each conversation's Reprocess or Retry action, so every job appears on its library card.
- **Keep diagnostics out of the product.** Comparisons, calibration, and migration details go in development documents such as this one. A conversation looks like every other conversation.
- **Check reprocessed transcripts for regressions.** A reprocess changed Whisper output enough to create a loop. After a reprocess, check for looping passages and for a changed speaker count, by recording title.
- **Stop the worker with the server.** A release restart stops the worker's process group before the new version starts.

## Open items

- **Hackathon person link.** Shereen Lee's labelled passages in Hackathon Project Planning and Ideation scored 0.25 against that person's voice profile from other recordings, while the unnamed speaker scored 0.60. The label may sit on the other person. Until the repo owner checks, the voice profile mixes two people and suggestions for that person are unreliable.
- **Suggestion threshold.** The 0.6 similarity and 0.1 lead in `voices.py` are starting values to revise after the label check.
- **Heavier diarization models.** #37 stays open for the benchmark of a larger on-device model, and for the exact NME-SC variant from the paper.
- **Filed during this work:** #190 (diarization thread count), #191 (passage links open Notes), and #192 (concurrent schema setup).
