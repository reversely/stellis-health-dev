# Existing demos and current product baseline

Maya's guide must extend the existing Stellis tour and health capture flows. The first standalone guide draft is superseded. This review establishes the implementation baseline before further flow changes.

## Evidence boundary

Reviewed the checked-out source and Git history, historical RFI walkthrough source and video, Denver sample manifests and screenshots, current tour tests and evidence, and GitHub's latest merged main. The checkout was at `3066771` while remote main had advanced to `f7733fe375d9825ef2c0201080f3883b1201ac86` through PR #127 at the initial browser inspection. A subsequent GitHub review verified PR #128 merged at `a676161adf2bd6d351dbf8b191be1febdc800c3b`; its runtime documentation and browser-test boundaries were inspected separately. The latter was downloaded to a temporary directory and run with a disposable data directory for browser inspection. No production account, calendar or mailbox was changed.

The current UI was inspected at desktop and phone widths. Browser observations include My Health, Records, Timeline, Ask Stellis, Trends, the Add dialog, Upload Record, Take Photo types, the searchable notebook catalogue and the original narrated tour in text mode. Original tour startup actually created its four Denver records in the disposable workspace. Screenshots from this investigation are in `ui_baseline/`.

Merged status is verified from GitHub. Deployment of that exact commit to the hosted service was not verified. Local uncommitted cycle and calendar work is recorded separately.

## Demo generations

| Demo | Actual contents | Current status |
| --- | --- | --- |
| RFI 91 | Four project notebooks, named agents, specification/status pages, meeting transcript/audio, annotations, speaker identity, source-backed answers, delegated research/drafts, voice call, calendar and planned mail pass | Historical, retired from the health product |
| Guided workspace | Eight stages covering a real notebook, contextual chat, agent Setup, assignments, model routing, request traces and recording; URL-based guide progress | Historical pre-health guide, verified in `docs/evidence/435/verification.md`; superseded by the health tour |
| Denver synthetic patient | 50 records: 29 clinical Synthea-derived documents and 21 original personal/allied-health records; PDF and image examples | Existing regression corpus and explicit operator loader remain |
| Health guided tour | Seven narrated stages: overview, goals, sample notebook, annual examination, summary, timeline, recording | Current baseline to replace with Maya's story |

RFI evidence is a 33.5-second recorded walkthrough refreshed in commit `0389bef`. The historical acceptance script has explicit boundaries: the isolated run succeeded, while the connected email acceptance pass remained open. Its old fixture source, setup and mail workflow were subsequently removed. The recording is evidence of that earlier product, not an acceptance script for the current health app.

The Denver tour inserts only four selected records into `Sample: Denver Lang`: September 2024 home blood pressure, November 2025 dietitian review, March 2026 annual examination and April 2026 lab results. It starts through the My Health menu or an offer after setup. The backend uses a fixed step catalogue and `show_step` actions. The existing docked call panel renders title, narration, chat, Next and completion. Navigation uses fixed narration; questions use inference. Public narration has a speech cache. Completion and voice recovery use shared call transport.

## Two relevant change baselines

The original health tour shipped in [PR #89](https://github.com/reversely/stellis-health-dev/pull/89). Its most recent recorded verification and transport improvements are [PR #124](https://github.com/reversely/stellis-health-dev/pull/124), documented in `docs/evidence/118-120/README.md`.

Therefore “since the last demo” has two useful meanings. The full feature delta below is since the original health tour. Since its latest verification, the subsequent merged changes are the unified dashboard, consolidated navigation, global capture and the integrated local voice reference.

| Merged change | Existing behavior relevant to Maya |
| --- | --- |
| #90, #91 onboarding | Three-question intake, editable notes, subject-based notebook naming and reviewed filing |
| [#101](https://github.com/reversely/stellis-health-dev/pull/101) facts | Validates measured values, units and clinical dates on reviewable facts |
| [#102](https://github.com/reversely/stellis-health-dev/pull/102) summary | Preserves historical topic evidence, limits long-source domination and reports actual document coverage |
| #103, #109 camera | Bounded capture recovery and one Log vital signs action for pulse, breathing rate and HRV |
| [#108](https://github.com/reversely/stellis-health-dev/pull/108) OCR | Local bounded recognition, per-page provenance/revisions, edit-and-save, original-file retention and content-free request timing |
| #106, [#116](https://github.com/reversely/stellis-health-dev/pull/116) interface | Shared form controls, action roles, white primary pills and white glass in dark mode, focus and motion conventions |
| #111, #113, #119 | Speech setup progress/retry, corrected hosted general calls and selectable speech backends |
| [#117](https://github.com/reversely/stellis-health-dev/pull/117) catalogue | 32 health collections, curated notebook templates, explicit approval, shared record links and notebook health projections |
| [#124](https://github.com/reversely/stellis-health-dev/pull/124) tour maintenance | Visible narration, target readiness, Finish tour, cached narration, text fallback and shared call completion/retry |
| [#125](https://github.com/reversely/stellis-health-dev/pull/125) dashboard | Health Overview, Upcoming, My Notebooks, Measurements and Health History with saved account choices and source links |
| [#126](https://github.com/reversely/stellis-health-dev/pull/126) navigation | My Health and Ask Stellis, active notebooks under collections, compact mobile navigation and notebook modal |
| [#127](https://github.com/reversely/stellis-health-dev/pull/127) global capture | One persistent Add entry for Take Photo, Enter Reading, Upload Record, Record Visit, Add Appointment and Check-in |

| [#128](https://github.com/reversely/stellis-health-dev/pull/128) integrated voice reference | Isolated loopback Health app on 8840 and Chatterbox on 8841; actual Moonshine recognition, Nebius assistant reply and local synthesized playback verified with a generated microphone fixture |

## Capture and recognition

Global capture is already implemented in `static/health-capture.js`. It uses native labelled dialogs and the shared `dashboard-dialog`, `drawer-head`, `capture-field` and `coach-button` classes. The Add menu renders six actions before fetching action-specific data. Notebook context comes from the current notebook or Chat composer. Mobile navigation has a labelled Add slot.

Upload Record reuses `StellisRecordUpload.uploadFile`. Take Photo distinguishes Medical document from Scale, Blood pressure monitor, Glucose meter and Temperature display. Device photo recognition reuses the existing bounded OCR service, returns conservative candidates, offers correction when recognition fails, retains the original and requires confirmation before saving a reading. Confirmed readings and entered appointments project into My Health, Timeline and associated notebooks. Scheduled and Planned remain separate statuses.

This is the correct interaction precedent for date extraction: machine proposal, visible evidence, correction and confirmation. The previous draft's mandatory blank date entry transferred avoidable work to the person and is not the implementation requirement.

## Exact clinical-date gap

Three different dates and mechanisms already exist:

1. PDF embedded text or OCR text is stored on document pages with its source and revision.
2. Health-fact extraction can return a `date` on each proposed fact. Accepted facts enter the timeline under their clinical date.
3. The document itself has a separate `record_date`. Upload currently leaves that field empty unless a caller supplies it. Document timeline rows then fall back to upload time.

The newest device-photo review has a When field, but it currently defaults to the current local time. Its candidate parser extracts values and units, not an encounter date. No inspected code establishes that OCR-derived encounter dates are already populated automatically.

The requested change must reuse stored embedded/OCR text to propose the document's encounter date and prefill the existing review flow. The person should normally confirm a proposal. Multiple plausible dates, including birth date, specimen date, report date and historical dates, require evidence-aware review. User-confirmed values must survive reload and later extraction. Existing accepted fact dates and document dates must remain distinct.

## Notebook and agent behavior

The catalogue already contains Menstrual Health, Fertility, Pregnancy and Postpartum Recovery templates in the relevant reproductive and pregnancy collections. A custom notebook remains available. Maya's ground-truth labels must map to real catalogue IDs and user-selected notebook names rather than blindly create a parallel taxonomy.

Shared record links allow one original PDF to participate in several notebooks. Notebook source selection controls which sources are used by cited notebook chat. Source clicks open the original page. The current product presents one assistant, Stellis; historical named-agent teams and mail delegation are not the current demo model.

The summary has bounded document/passage coverage. A successful ingestion of seventy PDFs does not establish that a particular summary or answer considered every PDF. The demo must inspect citations and reported coverage. Confirmation and uncertainty states matter: suspected iron deficiency, established laboratory findings, provisional infertility, confirmed assessment, biochemical pregnancy, live intrauterine pregnancy and low-risk screening are separate facts.

## Current UI conventions

Observed shared interface: the existing library rail and compact navigation, Piazzolla screen headings, Inter controls/body, theme tokens, standard primary/quiet actions, native dialogs, existing file chooser, source viewer and Chat composer. The shipped style sweep specifies primary action roles and 80% white glass overlays in dark mode. A new standalone branded walkthrough shell would duplicate these surfaces and is superseded.

The docked tour already includes the controls needed for sequential guidance. Maya's authored narrative and references are data for that guide; they do not require replacing the application's navigation or introducing a separate control system.

The original overview selector still points at `#home-goals .overview` rather than the new `#health-dashboard`. In the observed default dashboard the old overview and goals targets were absent. Running the original tour on current merged main in text mode confirmed that its first step settles on “This page is unavailable” with zero highlighted targets. The replacement must revalidate every step against the current UI and wait for an actual visible target; the older test evidence does not establish compatibility with the later dashboard.

## Local work and execution limits

The shared checkout also contains uncommitted Cycle and contraception controls and calendar-view work. Cycle has period dates, flow/symptoms and calendar/history; Pills and Devices are separate use cases. Maya uses condoms and has no pill-pack or implanted-device history, so her story must not fabricate these merely to demonstrate the controls. Pregnancy, treatment withdrawal bleeding and postpartum lochia must not be logged as ordinary periods. These local features are not labelled shipped in this review.

The disposable development instance used in the initial UI inspection had unconfigured inference and no Tesseract. This does not describe every installed runtime: PR #128 documents a separate configured reference on ports 8840/8841 with isolated accounts and real model evidence. Speech processing runs locally there; assistant inference uses Nebius. The generated-microphone check establishes browser transport and actual model operation, while physical microphone quality remains unverified by that test. The hosted image includes Tesseract, and earlier OCR evidence exercised real recognition elsewhere. This investigation did not claim a live model reply or a new optical-recognition benchmark. The original tour was observed in text mode. Browser mocks, retained-text fixtures, actual recognition and real model responses need separate evidence labels.

## Implementation implications

Before further implementation, integrate against the newer merged main without overwriting the user's uncommitted cycle/calendar work. Withdraw the standalone guide entry and manual-date draft. Extend the existing tour with Maya's sequential document data, use global Add and existing upload/review surfaces, preserve notebook context, and derive date proposals from extracted text. Guide instructions should name visible controls and let the person act.

Playwright should drive those same visible controls. It must check upload bytes, recognized text, proposed and confirmed date, selected notebooks, persisted timeline position, source exclusions, answer citations, reload and back navigation. Record a video from that run. Keep model-free interaction checks separate from live clinical-answer checks and distinguish local-only features from merged main.

This file is a research baseline, not a claim that the Maya UI draft or demo video has passed validation.

## Documentation conflicts to resolve before a new guide

`docs/ui-style-guide.md` still contains pre-health workspace setup and agent-team descriptions alongside newer health navigation rules. `docs/current-architecture.md` retains an RFI sample row whose modules were subsequently removed. These historical passages cannot establish current feature availability. The current implementation, merge history and matching browser evidence take precedence. The shared checkout also contains superseded Maya drafts, so its modified tour narration is not evidence of the shipped tour. The shipped baseline was checked with `git show origin/main:...` and GitHub PR metadata.

No new guide, flow, component or application behavior was created during this follow-up audit. The next design must account for the four distinct demo generations, the two health-tour comparison baselines, shared capture/OCR review, the current single assistant, and the separately configured voice runtime.
