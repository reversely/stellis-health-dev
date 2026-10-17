# ADR 0053: Group speakers by clustering per-passage voice embeddings

Status: accepted for development, 2026-10-17 (#37).

## Context

The sherpa-onnx diarizer clusters short pyannote speech slices with fast clustering at threshold 0.8. On the seven saved recordings that have an Otter export, it produced 11 to 35 speaker groups where the export lists 2 to 5 people who each talk for at least 5% of the recording. Passages were then assigned by turn overlap, and many were marked uncertain. ADR 0009 keeps uncertain passages as separate turns, so a single person's speech appeared under repeated headings.

## Evaluation

Each recording's saved passages were embedded with the installed TitaNet small model (`rematch.extract_embeddings`, passages of at least one second). Groups were scored against the Otter export, which was used only for scoring. Each Stellis speaker was paired one to one with the Otter person it overlaps most, and the measure is the share of talk time whose passage speaker matches the person Otter shows talking at the passage midpoint. The method was tuned on three recordings and checked unchanged on four.

| Recording | People in Otter | Speakers, current → new | Talk time with the right person, current → new |
| --- | --- | --- | --- |
| 40k Inspection Parts and Span Time Analysis (tune) | 2 | 13 → 2 | 86% → 96% |
| Part Number Analysis and Data Mapping (tune) | 3 | 35 → 3 | 30% → 79% |
| Hackathon Project Planning and Ideation (tune) | 3 (2 per the repo owner) | 20 → 3 | 55% → 84% |
| CIFAR Aerospace Research Overview (check) | 5 | 13 → 4 | 68% → 88% |
| Food, Technology, and Power Narratives (check) | 3 | 21 → 3 | 84% → 90% |
| Service Center Capacity and Span Time Analysis (check) | 2 | 20 → 2 | 78% → 91% |
| DMS Data Cleaning and Upload Tasks (check) | 2 | 11 → 3 | 58% → 79% |

With a fixed speaker count, the embeddings separated the people on every recording, so the remaining error comes mainly from estimating the count.

## Decision

- After turn alignment, `src/stellis/speaker_clustering.py` embeds every passage, then groups the passages with spectral clustering. It prunes the cosine-affinity matrix to each row's strongest 10% to 30%, and estimates the speaker count, up to 8, from the largest Laplacian eigengap. The pruning ratio is chosen by the normalized maximum eigengap criterion of Park et al., "Auto-Tuning Spectral Clustering for Speaker Diarization Using Normalized Maximum Eigengap" (arXiv 2003.02405). Unlike the paper, affinities keep their values rather than being binarized, the Laplacian is normalized, and five ratios are searched. The speaker count is never supplied.
- Groups are numbered by first appearance. A passage is uncertain when its similarity to its own group's centroid exceeds the next group's by less than 0.10. A passage too short to embed takes its nearest passage's group and stays uncertain (`speaker_match_source = nearest_passage`).
- With fewer than 20 embedded passages, the turn-overlap assignment and the ADR 0050 fallback stay in use. In the first live run, a one-minute recording with six passages from one voice came out as five speakers, because the pruned affinity graph split into pieces. The pipeline version moves to `…-words-v7` (v6 used a three-passage minimum); job metrics record `speaker_grouping` and `passage_speaker_count`.

## Tradeoffs

Fewer groups means two similar voices can share one speaker. In CIFAR Aerospace Research Overview, two people with about 4.5 minutes each shared a group. A full v6 run of Hackathon Project Planning and Ideation gave two speakers. The repo owner confirmed the recording has two people, so that result is correct; the Otter export's third person is an Otter error, which also lowers that recording's score in the table. Turn-overlap assignment almost never merged people, because it split everyone into many groups. Users correct merges with the existing speaker labels.

Embedding every passage took 9 to 34 seconds per recording on an Apple A18 Pro (6 cores, 8 GB, two TitaNet threads), and clustering took under half a second. The paper's exact variant (binarized affinities, every pruning value) was not finished before this decision and remains a follow-up.
