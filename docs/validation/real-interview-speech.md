# Real interview speech validation (ticket #12)

Date: 2026-10-16. Source: the user's private Otter export in `data/`, which is excluded from Git. Only aggregate metrics are recorded here. The Otter transcript is used as a weak reference for evaluation and is never supplied to the local ASR or diarization pipeline.

| Measure | Result |
| --- | ---: |
| Audio duration | 57:49.104 |
| Device processing wall time | 515.12 s (about 6.7× real-time throughput) |
| whisper.cpp English small segments | 789 |
| Generated words / Otter reference words | 8,981 / 8,927 |
| Approximate first-150-second word error rate | 10.7% (419 reference words, 406 generated words; boundary may cross a turn) |
| Acoustic turns | 565 |
| Active acoustic clusters / Otter speaker labels | 19 / 6 |
| Transcript segments with confident overlap assignment | 53.7% |
| Transcript segments with no acoustic cluster | 228 of 789 |
| Cluster-majority agreement over diarized time | 97%; optimistic because 19 clusters can fragment six voices |

The transcript came from the audio through the local whisper.cpp model. Speaker turns came from local sherpa-onnx inference. The browser displayed all 789 segments and 19 groups; selecting a transcript segment sought the original audio to 1:29.92, played it, and highlighted the active segment. Audio and transcript persisted across app restart.

## Speaker rematch validation (#29)

The browser invoked a separate on-device TitaNet embedding job against the saved ASR segments and audio, without Otter data in inference. It completed and survived reload. The untouched machine generation remains available; edits and segment IDs are preserved.

| Measure | Result |
| --- | ---: |
| Supported acoustic prototypes shown | 5 |
| Segments with an acoustic suggestion | 681 of 789 (86.3%) |
| Unresolved segments | 108 of 789 |
| Segments whose displayed suggestion changed from the initial pass | 292 of 789 |
| Previously unassigned segments now suggested | 191 of 228 (83.8%) |
| Disagreement with timestamp-mapped weak Otter labels | 13 of 681 (1.9%) |
| Disagreements in one Otter passage containing two voices | 8 of 13 |
| TitaNet / alternative WeSpeaker extraction time | 17.2 s / 46.1 s |
| TitaNet / WeSpeaker coverage at cosine 0.55, margin 0.05 | 86.3% / 70.1% |

The Otter passage with a single label contains two successive voice introductions; its segments match two existing acoustic groups. Five other disagreements include brief or boundary passages. The 1.9% figure measures reference disagreement, not a calibrated false-assignment probability. Additional diverse recordings are needed before treating the thresholds as universal.

**Decision:** Ticket #12 established the local pipeline. Ticket #29 raised measured suggestion coverage above 85% while keeping uncertain passages visible. The Otter labels are anonymous and imperfect; no aggregate above proves identity recognition or truth of all spoken words.
