# Maya grows with Stellis — prototype demo

Owning ticket: [#183](https://github.com/reversely/stellis-health-dev/issues/183). Brief: keep and improve Maya’s timeline, show three timings/use cases and the breadth of features, avoid fixating on chatbot interactions, plan the script first, and provide space to try live camera inference.

## Deliverables

- [Narrated walkthrough](maya-prototype-demo.mp4), approximately 6 minutes 52 seconds. The full 1920×1080 app frame sits above a dedicated purple caption footer (final 1920×1224).
- [Detailed pre-recording script](../../../plans/maya-prototype-demo-script.md), committed as `e2eb7e5` before implementation. [Executable scene list](../../../scripts/maya-demo-scenes.json).
- [Transcript](transcript.md), [WebVTT captions](maya-prototype-demo.vtt), [narration audio](maya-prototype-narration.mp3), and [actual recording timing/provenance](recording.json).
- [Opening frame](video-poster.png), [camera window](video-camera-window.png), and `scene-*.png` actual browser checkpoints.
- Earlier reference retained: [yearly walkthrough](../../../stellis-synthetic-patient/validation/yearly_story/maya-yearly-walkthrough.mp4). The earlier film is 46.92 seconds, video-only.

## Narrative and coverage

| Approximate time | Maya’s stage | Demonstrated use cases |
| --- | --- | --- |
| 00:00–01:40 | 2022: first concern | Inspect and upload an original PDF; confirm date/notebooks; retain shared history; review medicine/period entries; replay a saved scripted visit; save personal notes. |
| 01:40–03:52 | 2024–25: changing care | Grow the existing library; inspect treatment source and adjusted dose; review/confirm several entries; snooze a check-in; distinguish confirmed appointment; inspect one saved explanation; separate estimated due date and birth. |
| 03:52–06:52 | 2026: a new routine | Revisit sources and retained history; calculated course supply/end; personal activity goal; source-backed measurement chart/table; dedicated camera preparation and test; return to earlier notes and the continuous story. |

The short explanation segment is 22 seconds, one of 22 scenes. The camera-ready scene reserves 45 seconds to pause the video and try the interactive prototype. The film drives real browser controls, without replacing camera, network, inference APIs or the clock.

## Validated states

- [Journey and computed contrast checks](workflow-checks.json): PDF upload/original inspection; explicit date/notebook approval; invalid date recovery; reviewed multi-item confirmation; period dates; notes across reload; treatment, goal and appointment state; actual user-started no-device camera recovery; eight responsive story layouts (390/768/1440/1920, dark/light). Dark and light primary fill/label pairs match the shared inverted roles.
- [Measurement browser checks](checks/measurements.txt): twelve responsive layouts, actual categories, chart/table icons, shared search/order/ranges, padded one-date overlays, local assets and no browser errors.
- [Separate controlled-signal camera adapter checks](checks/camera-adapter.txt): supported result review/save, three numeric estimates, track cleanup, separate Maya reset/reload/clear and no account writes or fictional baseline comparisons. These tests replace the signal and device only in the test process; their values are not used in the film.
- [Native capture regression](checks/native-camera.txt): default account API persistence, grouped save, cleanup and Home/Trends reload at 390/1280. Runs against an isolated local test data directory.
- [34 helper tests](checks/unit.txt) pass. Shared style audit: 35 stylesheets, zero component palette/corner literals.
- Scene completion assertions verify no page or console errors. Recording metadata retains actual timing. Full-paced film was reviewed for primary-button contrast, caption placement, source/table scenes and genuine camera recovery.

## Truthful boundaries

Maya and all clinical sources are fictional. Canonical source records and fixtures supply dates, dose adjustments, appointments, laboratory values and objective measurements. No unsupported readings are invented to fill empty categories. Counts refer to the available sample package, not successful production ingestion of every source. Browser-demo choices and PDF uploads persist only in the session; they do not implement account ingestion, OCR, database filing or synchronization. Use synthetic files only.

The saved explanation is authored and source-backed, not a new LLM reply or runtime execution trace. Proposed dates use fixture metadata, not a new OCR result. The visit audio is synthetic speech from the canonical scripted dialogue, not a newly recognized recording. Narration is generated locally with the already-installed Apache-2.0 Kitten model (synthetic sid 1); no cloned individual or external speech service is used.

The recording host has no physical camera (`/dev/video*` absent). The film presses Start and shows the real no-device recovery state. It does not claim a completed physiological capture or validated clinical accuracy. Interactive camera testing reuses the existing on-device pipeline, requires explicit Start, offers result review, stores numeric estimates in a separate browser session and does not retain frames. Maya reset never clears the viewer’s camera session; Clear camera session does.

This is the standalone optional Dash/Mantine prototype. The production frontend and account services remain in place; [production routing/isolation/migration gates](../../../plans/dash-trends-evaluation.md) remain open.

## Run and reproduce

Use the project virtual environment with the optional pinned dependencies in `scripts/dash-trends-requirements.txt`. The verified local dependency overlay is `/tmp/stellis-dash-preview-deps`:

```sh
PYTHONPATH=/tmp/stellis-dash-preview-deps:src .venv/bin/python scripts/dash_trends_preview.py --port 8856
```

Open `http://127.0.0.1:8856/`. localhost is a secure camera context; a remote presentation needs HTTPS and the device’s camera permission.

The recorder uses Playwright Core, Google Chrome and ffmpeg. Set `STELLIS_PLAYWRIGHT_MODULE` to the installed Playwright Core module and `STELLIS_DASH_PREVIEW_ORIGIN` to the running prototype; run `node scripts/record_maya_prototype_demo.mjs`, then `scripts/narrate_maya_prototype_demo.py --model-dir <installed-kitten-model>` with the environment containing sherpa-onnx/numpy/soundfile. The scene script is authored before recording. Raw WebM captures are local working artifacts, excluded from delivery; the final MP4, timing metadata and sidecars are committed.
