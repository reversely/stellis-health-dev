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

## Browser rematch after ASR generation review (#46, 2026-10-16)

After the real interview's new 777-passage ASR generation was activated through the browser review, Chromium opened **More options → Rematch speakers** and reloaded while the local job ran. The persisted job completed in about 21 seconds. It kept all 777 passage IDs and times, the opening user text correction and its highlight, and the manually confirmed Shireen Person on the 16-second passage. Clicking that passage sought and played audio at 16.112 seconds. The rematched generation reported five supported groups, 672 suggestions (86.5%), and 105 unresolved passages. A second API request returned the same completed job ID. At 390 pixels, the transcript and open menu fit the viewport; the completed action appeared disabled as **Speakers rematched**.

Otter's earlier auto-tag request still has no observable completion or failure outcome in the signed-in UI. Its effect on a manually named speaker remains unverified there, so ticket #46 stays open. The new Stellis result tests preservation through this generation; it does not establish speaker identity accuracy.

## Word-aligned speaker boundary check (#123, 2026-10-16)

The saved 777-passage real-interview ASR output and acoustic turns were passed through the new alignment rule. One passage split at 8.600 seconds, producing 778 passages; the two pieces aligned to the two adjacent acoustic clusters. Three other apparent split candidates were rejected after their resulting parts failed the dominant-cluster guard. The split scan took 0.019 seconds on this machine. The signed-in Otter page and private export place a speaker change at about eight seconds. Neither reference entered the inference path.

An isolated loopback browser service imported the real interview audio. For this alignment-only check, its processing worker reused the saved local ASR and diarization outputs instead of running the native models again. The browser displayed separate turns at 0:00–0:08 and 0:08 onward. Clicking a timed word on each part started audio near 5.5 and 9.0 seconds respectively. An inline edit on the second part survived reload, and the speaker picker assigned different confirmed names to the two acoustic groups without changing one another. At 390 pixels, the transcript had no horizontal overflow and the split was visible in separate speaker turns. The isolated test data was removed afterward. This checks alignment, browser replay, editing, and speaker controls; it does not measure a new full model run or overall diarization accuracy.
