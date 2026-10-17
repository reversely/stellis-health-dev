# ADR 0050: Provisional speaker for passages outside every acoustic turn

Status: accepted for development, 2026-10-16 (#180).

## Context

Whisper transcribes speech that Pyannote segmentation does not mark as speech. Such a passage overlaps no acoustic turn, so `align_segments` gave it no cluster, and the transcript labelled it "Unknown speaker". The product rule is that an unnamed speaker is shown as `Speaker N`.

Across the 14 saved local conversations, 604 of 2,718 passages had no cluster. All of them came from first processing; none came from Rematch. Diarization marked 21% to 85% of each long recording as speech. The skipped regions were as loud as the diarized speech. Changing the clustering threshold or forcing the speaker count left coverage unchanged, so the gap comes from segmentation. Improving segmentation belongs to #37.

## Evaluation

Three fallbacks were scored on the 465 non-tag passages without a cluster in seven long recordings that have an Otter export. The Otter speaker active at a passage's midpoint was the reference. Each Stellis cluster was mapped to the Otter speaker it overlaps most. The export is a weak reference and the mapping is lenient, so these figures compare methods; they do not measure accuracy.

| Method | Agreement |
| --- | --- |
| Most frequent speaker | 293/465 (63%) |
| Nearest acoustic turn in time | 370/465 (80%) |
| Nearest assigned passage | 372/465 (80%) |
| Closest TitaNet voice prototype | 406/465 (87%) |

The embedding method agreed most often overall. It also held up in the two recordings where the time-based methods failed: 85% vs 64%, and 59% vs 24%.

When the shipped code ran read-only over all 14 saved generations, 602 uncovered passages became 0. Of these, 591 came from embeddings, 10 from the nearest turn, and 4 from a single speaker. Agreement remained 406/465. The extra on-device embedding work took 11.6 seconds for the 57.8-minute recording and at most 10 seconds for each of the others (Apple silicon, two TitaNet threads).

## Decision

- After overlap assignment, each passage without a cluster takes the cluster of the closest voice prototype. A prototype is the mean TitaNet embedding of a cluster's confidently assigned passages: not uncertain, at least 75% turn coverage, and at least two seconds long. Only the prototype and uncovered passages are embedded.
- A passage under one second, or one in a conversation without prototypes, takes the nearest acoustic turn in time. With no turns, it takes the nearest assigned passage. With no assigned passages, every passage belongs to `speaker-1`.
- Each filled passage stays `speaker_uncertain` and records `speaker_match_source` (`embedding_fallback`, `nearest_turn`, `nearest_passage`, or `single_speaker`). It never joins an adjacent turn automatically, and the browser invites confirmation.
- Rematch keeps the first-pass cluster for a passage it cannot resolve, so its unresolved state no longer removes a speaker.
- The display projection applies the time-based fallback to older generations that still hold empty clusters. Manual labels and confirmed people keep their precedence.
- The speech pipeline version moves to `…-titanet-words-v4`. Reprocessing a conversation changes clusters, so the existing generation review stages the result when overlays depend on it.

## Tradeoffs

A filled passage can name the wrong speaker; the old label claimed nothing. The uncertain state, the confirmation title, and unchanged precedence for user labels keep the guess reviewable. Embedding adds on-device work proportional to the uncovered and prototype speech. The live recording chat still labels its provisional evidence "Unknown speaker" because capture has no diarization, and a numbered label would wrongly imply one speaker. Bracketed non-speech tags such as `(scissors snipping)` now receive a speaker too, until #181 removes them.
