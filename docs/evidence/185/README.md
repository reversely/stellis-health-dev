# Maya’s demo inside the actual interface

Owning ticket: [#185](https://github.com/reversely/stellis-health-dev/issues/185). Owner correction: the demo and Dash/Mantine must be **part of the actual interface**, with Maya growing through three coherent stages and broad use cases rather than a chatbot-led tour. The [separate #183 interface](../183/README.md) is explicitly superseded and retained only as historical evidence.

## Delivered interface and recording

Open **Maya’s demo** in the existing sidebar, or visit `/demo` on the normal app. Start enters the existing isolated Maya workspace. Its ZIP imports, confirmed source dates, notebook filing, notes, medicine courses and entries use the real services and database. The three chapter anchors open actual sources, notebooks, My Health and Measurements.

- [Integrated narrated walkthrough](maya-integrated-demo.mp4), approximately 7m55s; actual app frame at 1920×1080 with a separate purple caption footer.
- [Detailed script planned before recording](../../../plans/maya-integrated-demo.md), first committed as `c296e1d`; [authored scene timings](../../../scripts/maya-integrated-scenes.json).
- [Transcript](transcript.md), [WebVTT](maya-integrated-demo.vtt), [narration](maya-integrated-demo-narration.mp3), [actual timing and recording provenance](recording.json).
- [Opening](video-poster.png), [camera interval](video-camera-window.png), and `scene-*.png` actual browser checkpoints.

| Approximate time | Stage | Actual app workflows |
| --- | --- | --- |
| 00:00–02:33 | 2022: first concerns | Enter the demo from the app; save actual period dates and an appointment; import eight original PDFs; review dates and shared notebook filing; open a report; save personal notes in the native editor. |
| 02:33–03:59 | 2024–25: changing care | Bring the 2023 investigation and 2024/25 treatment packages into the same library; inspect original stimulation and maternal discharge sources. |
| 03:59–06:20 | 2026: a new routine | Import current follow-up; create a source-linked medicine course with real registry controls; review and save a dated entry; inspect the notebook Brief; open recording’s real ready state; enter documented measurements and use the integrated Mantine table. |
| 06:20–07:32 | Camera interval | A separate viewer test, with 45 seconds to pause and try the real camera; explicit Start; actual no-device recovery on this host. |
| 07:32–07:52 | Continuity | Return to the earlier source and saved personal note, then the current native workspace. |

The source-inspection scenes support the broader journey. No fabricated chatbot answer, fact extraction, summary, transcription or execution trace is substituted for a real workflow. The recording driver uses actual controls without network, camera, inference or clock replacements. Short rehearsals accelerate only idle scene pauses; the delivered film uses full pacing.

## Dash is part of Measurements

`/trends` remains in the app’s original shell, with its sidebar, header and mobile navigation. An app-owned same-origin component body at `/components/measurements/` supplies Mantine layout/table/filter controls and Plotly charts. It has no second sidebar, fixture reading store or alternate patient dashboard. The parent reads the real readings API; manual entry, deletion and ordinary camera saves use existing services. Source links return to native routes.

The component frame contains Mantine/Plotly’s dynamic style policy, preserving the parent page’s CSP. HTTP routes use the existing session/account gate. The runtime socket has account/origin checks and an exact gateway relay path. The pinned backend’s root catch-all is disabled so it cannot replace native API/404 semantics. See [ADR 0087](../../decisions/0087-integrated-dash-measurements.md).

## Validation

- [Integrated browser checks](integration-checks.json): actual API write → reload → card/table; native manual form; search, ordering and delete; time windows relative to the current/story date; individual sleep entries behind the daily total; all categories; eight viewport/theme combinations; padded one-date purple tooltip in both themes; ordinary/demo isolation; three chapter controls; native camera no-device recovery; no page/console errors.
- [Column/paired-table checks](columns-checks.json) verify actual native content widths at 390/768/1280/1440/1920 in both themes: one column on phones/tablets and side-by-side cards at desktop widths. [Ordering checks](checks/sorting.txt) match oldest/highest rows to actual API data.
- [Chapter checks](checks/chapters.txt): real route selection, data-driven scene options, hidden details, six layouts, no dock outside Maya’s workspace.
- [Native capture checks](checks/native-camera.txt): controlled signal, real native API save/refresh, startup and capture watchdogs, retries and stopped tracks at 390/1280; Home and integrated Trends show the saved values. [Demo adapter checks](checks/camera-adapter.txt) cover result review/save, no account/Maya reading writes, native reload and independent clear. Controlled signals are used only in tests, never in the film.
- [Transport/account checks](checks/transports.txt): login gates, authenticated component access, rejected unauthorized/cross-origin sockets, native unknown-route behavior and existing account gateway separation. The [additional component relay check](checks/gateway-component.txt) verifies authenticated HTTP layout and bidirectional runtime socket traffic through the actual account gateway.
- [Native helper/auth tests](checks/native-unit.txt), [eight demo tests](checks/demo-unit.txt) and [34 JavaScript helper tests](checks/js-unit.txt) pass. [Style audit](checks/styles.txt) covers 36 stylesheets including the new component assets, with zero embedded component palette/corner literals.
- The fast actual-interface rehearsal completes every scene before the full-paced capture. Final media is inspected for narration, readable button contrast, source/care/table states, caption placement and real recovery states. [Media metadata](checks/media.json).

Native issues fixed during this work: await real navigation/tracker readiness, retain the selected tracking category during refresh, attach dialogs outside replaceable dashboard widgets, use a requested notebook tab without a timer race, preserve Table view across data refresh, display empty categories after loading, and apply the proper ink to chapter detail controls. Synthetic imports retain original files and use their human-readable source titles. Scene navigation updates the visible story date; reduced motion uses the native static rail gradient to avoid a GPU still-frame artifact.

## Truthful data and inference boundaries

Maya is fictional. The original source ZIPs are hash-checked by the existing importer. The film uses manually confirmed values from D001 (pulse 72 bpm, blood pressure 112/70 mmHg, weight 60.8 kg, January 18 2022) and D061 (weight 61.8 kg, January 16 2026); the table labels them Manual entry. No unsupported breathing, HRV, glucose or other values are invented to populate empty categories.

The medicine form records the D066 prescription: 300 mg ferrous sulfate tablet, 60 mg elemental iron, every other day, 45 tablets and one repeat. The dated D070 plan supplies the December 18 last-dose boundary, with stopping from December 19. A historical entry is explicitly reviewed and saved; calculated supply dates remain calculations rather than booked care.

A separate preflight attempt at real local fact extraction returned “Agent reply was too long.” It is not represented as a successful extraction in the recording. The film claims no new ASR, OCR-derived clinical facts or LLM explanation. The recording page demonstrates its real ready controls without claiming a completed visit recording.

No physical camera exists on this host. Start shows the genuine no-device result; physiological accuracy is not established. In the interactive app a viewer can run the existing local pipeline with their own camera. Reviewed numeric estimates in Maya’s demo stay in a separate generation-specific browser test session and are never compared with Maya’s fictional baseline. Frames are not stored. Ordinary workspace capture keeps its native API persistence.

Narration uses the already-installed local Apache-2.0 Kitten TTS model, synthetic voice sid 1, from the authored script. No cloned person or external speech service is used. Dash/Mantine’s pinned dependencies and FOSS license review build on [#176](../176/README.md); no replacement editor is introduced.

## Reproduce

```sh
uv sync --frozen
uv run stellis serve --port 8840
```

Use the normal app’s `/demo` entry. Authentication/account routing remains in place. For browser tests and recording, use a separately configured disposable `STELLIS_DATA_DIR` and `STELLIS_TEST_DISPOSABLE=1`; never point reset/fixture tests at a personal workspace. `scripts/record_maya_integrated_demo.mjs` records the real app and stores raw WebM locally. `scripts/narrate_maya_prototype_demo.py --scenes scripts/maya-integrated-scenes.json --stem maya-integrated-demo --output docs/evidence/185 --model-dir <installed-kitten-model>` adds the local narration and caption footer. Raw captures are working artifacts, excluded from the delivered commit.
