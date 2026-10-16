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

**Decision:** Ticket #12 establishes a working local pipeline and makes uncertainty visible. It does **not** satisfy final autonomous speaker labeling. [#29](https://github.com/reversely/stellis/issues/29) tracks acoustic coverage, cluster fragmentation, and rematch against this baseline. The Otter labels are anonymous and imperfect; no aggregate above proves identity recognition or truth of all spoken words.
