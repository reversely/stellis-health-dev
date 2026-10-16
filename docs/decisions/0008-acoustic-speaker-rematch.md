# ADR 0008: Conservative on-device speaker rematch

Status: accepted, 2026-10-16 (#29).

## Context

The initial Pyannote segmentation and TitaNet diarization found 19 acoustic clusters in the 57:49 interview, but assigned only 53.7% of ASR segments confidently. Many unmatched segments still contain clear speech. Small clusters crowded the speaker list, while the Otter export's six anonymous labels provide only a weak comparison: one labeled passage contains two successive voices.

## Decision

- Keep the existing on-device segmentation turns and ASR text as immutable source data. **Rematch speakers** starts a separate persisted device job that decodes the original audio and computes a TitaNet vector for each speech segment of at least one second. The job does not rerun ASR or send voice data to a service.
- Build speaker prototypes only from acoustic clusters with at least 12 segments that are each at least two seconds long and have at least 75% turn overlap. This leaves sparse clusters unresolved instead of silently treating a short speaker as a dominant voice.
- Suggest the nearest prototype only when cosine similarity is at least 0.55 and exceeds the second-best score by at least 0.05. Otherwise, leave the passage unresolved. These are empirical thresholds from the private interview, not a calibrated probability. The public segment includes the original cluster, match score, margin, and source; the UI shows unresolved counts. Manual labels remain distinct from automatic suggestions.
- Preserve segment IDs, timing, words, text, original turns, manual text and speaker edits, and highlights. Save rematched output as another transcript generation and increment the revision, so earlier AI results become stale. Number unnamed supported groups densely by first appearance in the browser; internal cluster IDs stay stable for corrections.
- The device worker runs rematch in a child process under the existing job lock. A browser reload finds the persisted job. A failed job can retry; a completed job is idempotent for its source generation and algorithm version.

## Alternatives and consequences

| Option | Assessment |
| --- | --- |
| Assign from nearest diarization turn in time | Gives apparent coverage without voice evidence and risks speaker changes. Rejected. |
| Force six clusters from the Otter labels | One reference label spans two voices. Reference text and labels are never inference inputs. Rejected. |
| Replace the segmentation model first | The five major existing acoustic groups already had strong weak-reference purity; missing segment assignment was the larger measured problem. Deferred. |
| WeSpeaker English VoxCeleb ResNet34 embeddings | On the same 789 segments, extraction took 46.1 seconds versus 17.2 for TitaNet. At cosine 0.55 and margin 0.05, it suggested 70.1% versus TitaNet's 86.3%, with about 2% weak-reference disagreement for both. TitaNet remains the runtime model. |

The algorithm needs at least two well-supported prototypes. A short interview or a real low-frequency speaker may remain unresolved; it should not receive a fabricated confident identity. Cosine thresholds may need calibration on more recordings. The manual speaker-name overlay continues to take precedence over automatic suggestions.

## Verification

The real interview browser job completed with 681 of 789 segments suggested (86.3%), 108 unresolved, and five supported groups. The browser's change filter showed 292 passages with a changed suggestion. The 228 initially unassigned segments gained 191 suggestions in the isolated probe. Against timestamp-mapped Otter labels, 13 of 681 suggestions disagree (1.9%); eight belong to the reference passage that spans two voices, and several others are short boundary fragments. This is a disagreement proxy, not a true false-assignment rate. A mobile browser view showed the five groups and unresolved count; job state and transcript persisted across reload. Tests verify conservative assignment, idempotent job creation, and preservation of edits, labels, highlights, text, timing, and IDs.

The embedding API follows the [official sherpa-onnx Python example](https://github.com/k2-fsa/sherpa-onnx/blob/master/python-api-examples/speaker-identification-with-vad.py). Model files remain private and are excluded from Git.
