# Proposal: health first run and the three pillars

Scope decision, 22 Oct 2026: the owner chose vitals over time and self tracking, with consumer-facing graphs, as the next build. Food tracking and diet plans are deferred. The research for them is in this file's history at commit 0a4db26. The owner confirmed vitallens for camera vitals.

Status: proposal for owner review. It replaces the onboarding tiles, U-04's scope and T-01's scope. It uses the approved U-01 term list.

## The three pillars

The brief names three pillars. This proposal gives each one a home in the interface.

| Pillar | Where the person meets it | State today |
| --- | --- | --- |
| Records and appointments | Records, Timeline, notebooks, summary, recorded conversations | Built: upload, sorting, citations, facts, timeline, summary |
| Research and education | Ask, with answers from the person's records and public medical sources | Partly built: notebook chat with citations. Public sources are A-02. |
| Goals, habits and reminders | Today: check-ins, logs, plans and the agent's suggestions | Not built for the person. Check-ins have a due date and time only. |

The third pillar gets most of the new work below, because the existing workflow offers the person almost nothing for it.

## Onboarding

### The current flow

The meeting app's flow has four parts:
- **Welcome:** an orbit of meeting and agent icons.
- **Use tiles:** seven work tiles (Meetings, Learning, Projects and so on).
- **Review:** starter notebooks with agent checkboxes.
- **Workspace:** an 8-step tour of models and request traces.

The flow has two inputs: a demo (sample meetings) and a sync (a Google mail and calendar scan).

### Proposed flow

The demo becomes a recorded intake conversation about the person's health. The sync becomes dropping medical files. The tiles go.

| Step | Proposed content |
| --- | --- |
| 1. Welcome | One sentence on what the app does: "Talk through your health, add your records, and get help with the goals you set." One line on privacy (see open question 4). Consent (S-03) goes here once counsel approves the text. |
| 2. Intake conversation | The agent talks with the person about their health, like a phone consult. The conversation is recorded and saved as the person's first conversation, with a transcript. |
| 3. Your files | The person drops medical files. Each file appears on a dated strip as it uploads. "Add later" continues. |
| 4. Your notebooks | The agent proposes up to 5 notebooks from the conversation and the files, each prefilled with its documents and with any goal the person named. The person renames, unticks or skips each one, then chooses "Set up". |

Steps 2 and 3 can run in either order. A person who drops files first gets questions that refer to them, such as "I see a dietitian review from November. How is the weight goal going?"

### How the intake agent behaves

Instructions for the intake agent:

- **Caring.** Acknowledges what the person says in a few words before moving on.
- **Direct.** Asks three questions, one each about the goal, conditions and medicines, and reminders, in plain words.
- **No follow-ups.** Any answer, however short, completes its topic. The agent never asks for more detail, a dose or a date, and never asks the person to confirm a misheard word: the notepad lists names to check under To confirm.
- **Ends** after the third answer: it sums up in one sentence, asks the person to press Continue, and hangs up. The person corrects anything in the notepad.
- **Safety.** Runs the S-01 emergency check on every turn. It never diagnoses and never suggests a medicine change.
- **Length.** Aims for 5 to 10 minutes. The person can stop at any point and keep what was said.

Example opening for Denver:

> Agent: Hi Denver. What would you most like help with right now?
> Denver: Keeping the weight off, and my knees.
> Agent: You've been working on your weight for a while, then. How much have you lost, and what's helped most?

### Voice options

The intake is meant to feel like a call. Three ways to build it, as a proposal:

| Option | How it works | Cost |
| --- | --- | --- |
| A. Push to talk | The person taps to speak, the existing transcription turns speech into text, and the agent replies in text on screen | Uses existing parts. On the hosted app, transcription waits for the 500 MB speech model download. |
| B. Full voice call | The agent speaks its replies aloud and listens continuously | Restores the voice call removed in C-03 and adds text-to-speech. Largest build. |
| C. Typed chat with an optional microphone | Typing by default, with speaking as an option | Smallest build. Feels least like a call. |

Recommendation: A for the alpha, with B as a later ticket.

### Intake call (O-01): status, 22 Oct 2026

Setup now runs Welcome, the intake call, Your files, and Your notebooks in that order.

The call works like this:
- **Screen:** a dark call panel sits beside a notepad. The panel has the agent, a timer, Mute, Speaker and End, and a field for typed answers. Minimise shrinks the call to a floating card so the notes fill the screen.
- **Notepad:** short notes fill in under fixed headings after each answer. The person can edit any line, and the transcript sits behind a second tab.
- **After the call:** the notes and transcript are saved as the note "Intake call". The model proposes up to 5 notebooks from the notes and any files, each with a goal. A goal becomes a to-do on that notebook's Goals page.

The call runs speech on the app's own machine through sherpa-onnx, already a dependency:

| Stage | Model | Measured on 2 CPUs |
| --- | --- | --- |
| End of speech | Silero VAD, 0.7 s of silence ends an answer, with 0.3 s of audio kept before detected speech | 0.7 s by design |
| Speech to text | Moonshine base, int8, 275 MB | 0.13 to 0.22 s for a 2 to 4 s answer |
| Text to speech | Kitten nano 0.2, 42 MB | 0.19 s of compute per second of speech |
| Agent reply | Token Factory agent model, streamed | Not measured here: this container has no model key |

The build differs from the ticket in three places:
- **Kitten replaces Kokoro.** Kokoro int8 needed 1.0 to 1.2 s of compute per second of speech on 2 CPUs, which alone exceeds the 1.2 s target. Kokoro returns once the machine has faster CPUs.
- **A WebSocket replaces WebRTC.** Fly's HTTP proxy forwards TCP only, and WebRTC audio needs UDP. The browser streams 16 kHz audio over a WebSocket that the account gateway relays to the account's own process.
- **Moonshine replaces Whisper for the call.** Whisper small takes seconds per answer on this machine. Moonshine misheard "lisinopril" in 4 of 4 synthetic tests, so the agent asks to confirm medicine names, and unconfirmed names go under "To confirm".

Each turn logs, without content, the time from the end of speech to speech-to-text done, model first token, first audio ready, and audio playing. In the simulated Denver call with a scripted model, first audio was ready 1.2 to 1.5 s after Denver stopped speaking. An answer that Denver continued after a pause took 2.6 s, because the agent dropped its first reply and started again. Speech that starts within 1.5 s of an answer ending, or before the agent's reply starts playing, joins that answer, so the agent replies once.

Recognition turns noise and the agent's own voice from the speakers into words, such as "Pause an active one, mayhem." The call drops recognised text in two cases: text faster than 6 words a second, and speech that overlapped the agent's audio for 1.2 s without a barge-in check finding the person's words in it. The microphone worklet low-pass filters at 7.2 kHz before converting to 16 kHz. In a test with background noise at 10 dB, the filter lowered Moonshine's word errors from 15.3% to 12.8% from 44.1 kHz input, and from 14.8% to 12.8% from 48 kHz input.

The agent follows a call plan: it states the call's purpose, then asks one question each about the goal, conditions and medicines, and reminders. A topic is covered after one answer, or when the notes already have lines under its headings. The next uncovered topic goes into the agent's context on every turn.

During a call the speech models add about 440 MB of memory to the account's process.

Not built yet:
- The S-01 emergency rules. The call runs the same empty `notebook_chat.check` hook as notebook chat, and the agent's instructions tell it to send a possible emergency to the local emergency number.
- The latency report over 20 runs on the hosted app. `tests/test_intake.py` has the simulated two-sided call, and it needs the hosted model to measure model time.

## Today: goals, habits and reminders

Today is the third pillar's home and the first page after onboarding. It shows:
- the check-ins due now,
- the latest readings against the person's plan,
- the agent's suggestions waiting for a yes or no.

### Goals and reminders: status, 22 Oct 2026

Home opens with a health overview and goals (`goals.py`, `goals.js`), as #82 describes:

- **Reminder banners:** a reminder due now asks "Did you ... yet?" with Yes and Not yet. Yes logs the day. Not yet keeps a banner up until the person logs it that day.
- **Health overview:** one card shows resting pulse, blood pressure, sleep and weight. Each reading has a trend line of up to 12 readings, the usual range as a band, one line of context and its source.
- **Goals:** a person builds each goal from selectors: activity, amount, 1 to 7 times a week, and an optional reminder time. Each goal card shows this week's count, a 6-week bar chart with a dashed goal line, one sentence of encouragement and one log button.
- **Readings count:** a blood pressure reading, a camera pulse reading or a night of sleep at or above the goal counts toward the matching goal on its local day.
- **Steps:** Stellis tracks no steps until it reads them from a device or an export.
- **Goals filled in by Stellis:** a person describes goals in their own words, or names them on a call. The model calls `fill_goal`, the server checks each value against the selectors, and Home fills in Add a goal for the person to confirm (`coach.py`).
- **Coach calls:** each morning from 5 am to noon, Home shows an incoming call card. The check-in opens with today's appointments and reminders, written from the person's data, then asks how they are doing. Call Stellis starts a call at any time. Both run in a panel docked over the page. The model can fill in a goal, log a goal for today, or hang up after the person says they have nothing else. Stellis asks no follow-up questions; its only question after a request is whether there is anything else, and it wraps up after 6 answers (`coach_call.py`, `coach-call.js`).

### Onboarding call and tour: status, 22 Oct 2026

- **Onboarding call:** the intake model hangs up with an `end_call` tool at the goodbye step, after asking the person to press Continue.
- **Tour:** finishing setup opens Home with an offer of a two-minute tour. The tour runs on a call docked over the app. Each of its seven steps opens a page, highlights one control and speaks one pre-written line: health overview, goals, a sample notebook, a sample record, the summary, the timeline and recording. The person says "next" or presses Next, or asks a question, which the model answers from the step. The tour closes by naming the features and the goals from the onboarding call (`tour.py`).
- **Notebook names:** the model names each notebook after one subject of one kind: a condition, a treatment, a goal the person stated, a symptom under investigation, or a recovery. A suspected diagnosis becomes a symptom or an investigation. The person's word wins when it is accurate and specific ("Blood sugar"); the medical term replaces a vague word ("Diabetes" for "sugar problems"). Two conditions share a notebook only when the person described them as one subject. When the model cannot name a subject without inventing a diagnosis or a link, its records stay in Not filed and the model asks about them in one sentence. A revision keeps every name and placement the request does not mention. `intake.name_problem` rejects catch-alls ("Medical issues"), record types ("Lab results") and joined subjects ("Weight and knees"), and sends a rejected name back to the model once. A name the person typed is kept as typed.
- **Review loop:** Review your notebooks lays the notebooks out as folders with their records. The person renames, unticks or adds a notebook, moves a record with its select, or types a change in Ask for changes, such as "Rename Diabetes to Blood sugar". Stellis revises the layout, says what it changed, and offers Undo. Nothing is filed until the person presses Set up.
- **Sample notebook:** the tour adds four of Denver Lang's records to a notebook named "Sample: Denver Lang", which the person can delete.

### Proposed building blocks

| Block | What it does | Example for Denver |
| --- | --- | --- |
| Plan | A goal with targets and a routine. The agent drafts it from the intake and the records, and the person approves or edits it. | From his dietitian review of 17 Nov 2025: "Plate method, protein 90 g a day, beer up to 3 evenings a week, weigh weekly. If weight rises above 89 kg, book a visit." |
| Check-in | A repeating prompt with a schedule, one of: medicine dose, measurement, meal, photo or video, habit, symptom score | "Metformin 500 mg, 8 am daily." "Weigh in, Monday 7 am." "Knee pain 0 to 10, Friday." |
| Log | Each answer to a check-in, with its time and source (typed, photo, scale, import) | 86.6 kg from the scale on 17 Nov 2025 |
| Reminder | Delivery of a due check-in | A phone notification at 8 am, a second one at 9 am if not answered, with a quiet period at night |
| Suggestion | A proposed change, built from logs drifting from the plan, that waits for the person's answer | "You've walked twice in two weeks. Want to move walks to the morning, when you logged most of them?" |

### Interventions and safety

The agent proposes and the person decides. The existing suggestions mechanism already works this way for tasks.

Each rule type below is a proposal.

| Pattern in the logs | Proposed response |
| --- | --- |
| A habit missed 3 times in a row | A suggestion to change the time or the target |
| A threshold the clinician wrote into the plan, for example Denver's weight above 89 kg | A suggestion to book the visit the plan asks for, citing the dietitian's note |
| Weight outside the plan's range for 2 weeks | A summary of the readings and check-ins for those weeks, plus a question |
| A dose missed | A note to follow the label or the pharmacist's instructions. The agent never suggests a double dose. |
| Readings that S-01 marks as a risk, for example Denver's systolic pressure below 90 with dizziness | Advice to contact his clinician, with the readings attached. The plan stays unchanged. |

## Tracking features in depth

| Feature | Proposed design | Feasibility and limits |
| --- | --- | --- |
| Daily vitals by camera (rPPG) | See "Daily vitals by camera" below. | See below. |
| Smart scale | Withings first: OAuth connection, then each new weigh-in arrives as a log | The Withings public API needs no contract. The legacy Fitbit API switches off on 30 Oct 2026, and its replacement, the Google Health API, takes no new projects. Apple Health needs a native app, which the brief defers, so an Apple Health export file import covers it for now. |
| Medicines | The medicine list comes from accepted record facts (R-02) and from a photo of the bottle label. Each medicine gets a dose check-in and a refill reminder computed from quantity and dose. | Interaction checks wait for validated references (A-02, openFDA), as the brief requires. |
| Reminders | In-app on Today first. Phone notifications through web push. Email once H-04 adds an email provider. | On iPhone, web push works only after the person adds the app to the home screen (iOS 16.4 or later). Onboarding needs a step that shows how. |

## Trends: vitals over time

Trends is the page where a person sees how their body is changing. It joins three sources on one timeline:
- readings from their records,
- readings they log themselves,
- camera readings.

### Readings

| Measure | Unit | Sources in Denver's data |
| --- | --- | --- |
| Weight | kg | Clinic visits since 2016, the smart scale report (2024), dietitian visits, his own weigh-ins |
| Blood pressure | mmHg, systolic over diastolic | Clinic visits, the home blood pressure log (Sep 2024), his own readings |
| Pulse | beats per minute | Clinic visits, the home log, camera readings |
| Breathing rate | breaths per minute | Clinic visits, camera readings once T-09 passes |
| Blood sugar (HbA1c) | % | Lab results |

Each reading stores its measure, value, unit, time and source. Readings from records also store the document and page, so a point on a graph opens the page it came from.

### Graph design (proposed)

Each measure gets one card, built to the dataviz rules: one series per chart, no second axis, and a table view for every chart.

| Part | Design |
| --- | --- |
| Headline | The latest value in large type, with its date and one plain sentence: "About your usual", "Higher than your usual" or "Lower than your usual" |
| Usual range | A soft band behind the line showing the middle 80% of the person's own readings over the past 90 days. The page compares the person with themselves, not with population norms. |
| Line | 2px line through the readings, with a marker per reading. The marker shape shows the source (circle for self-logged, ring for camera, square for records), and a legend names the shapes. |
| Blood pressure | One vertical bar per reading from diastolic to systolic, which shows both numbers on one scale |
| Hover and focus | A crosshair snaps to the nearest reading. The tooltip shows the value first, then the date and source, with a link to the record page. Keyboard arrows move between readings. |
| Time range | One row above all cards: 1 month, 3 months, 1 year, All. Every card follows it. |
| Table view | A toggle per card shows the same readings as a table |
| Empty state | "No readings yet" with "Add a reading" and, for pulse, "Measure with your camera" |

### Rendering

The charts are a small SVG module in the app's own JavaScript, with no chart library. The reasons:

| Library | Licence, size unpacked | Reason not chosen |
| --- | --- | --- |
| Chart.js 4.5.1 | MIT, 6 MB | Canvas rendering. Keyboard focus and the table view would need separate DOM work. |
| uPlot 1.6.32 | MIT, 0.5 MB | Canvas rendering. Last release Mar 2025. |
| Observable Plot 0.6.17 | ISC, 1.5 MB plus d3 | SVG, but needs a bundler step the static pages lack today. Last release Feb 2025. |
| ECharts 6.1.0 | Apache-2.0, 59 MB | Size |
| ApexCharts, Highcharts | Custom licences | Licence terms |

Every trend chart has one or two series on a time axis, so the module stays small. It also uses the app's colour tokens for light and dark themes.

## Daily vitals by camera (rPPG)

Status, 22 Oct 2026: T-08 is built for pulse.
- The Trends pulse card opens a 45-second capture that runs vitallens 0.4.8's POS method in the browser.
- The capture is accepted only if a face is found in 90% of frames and the estimates stay within 8 bpm (10th to 90th percentile). The reading is the median of the last 20 seconds.
- On Rouast's sample video 1, looped as a fake camera in headless Chromium, the app read 75 bpm. The clip's ECG heart rate ranges from 75 to 87 bpm, with a mean of 78.1.
- The page made no requests beyond its own origin.

The live capture design (checks, copy, spoken guidance and assistant instructions) is in `plans/camera-vitals-capture.md`.

That is one clip, so it shows the pipeline works but not its accuracy. Accuracy is T-09's job, and breathing rate waits for T-09. The local POS method returns heart rate only.

Remote photoplethysmography (rPPG) reads the pulse from small colour changes in facial skin on video. A daily 45-second front-camera video gives a passive health reading with no device beyond the phone.

### Proposed capture

| Step | Proposed design |
| --- | --- |
| When | Once a day, at a time the person picks, ideally soon after waking and before coffee. A reminder comes from T-02. |
| How | The person sits still, faces a window or lamp, and holds the phone at arm's length. An outline shows where the face goes. A countdown of about 45 seconds runs while the browser measures. |
| Quality gate | The browser scores the signal. Movement, low light or a lost face produces "Let's try that again" and stores nothing. |
| Result | Today shows the reading against the person's own 14-day baseline, for example "Resting pulse 64, about your usual." A trend line sits on the Timeline. |

### Open-source work and benchmarks

| Project | What it is | Licence | Published result |
| --- | --- | --- | --- |
| rPPG-Toolbox (UW ubicomplab, NeurIPS 2023) | Training and evaluation for supervised models (DeepPhys, TS-CAN, PhysNet, EfficientPhys, PhysFormer) and unsupervised methods (CHROM, POS) on 7 datasets | Responsible AI Source Code License 1.1 | Benchmarks on UBFC-rPPG, PURE, UBFC-Phys and MMPD |
| pyVHR | Python framework of classic and deep rPPG methods | GPL-3.0 | Method comparisons in the PeerJ paper |
| MMPD (dataset) | 11 hours of phone video from 33 people, with 4 skin tones, 4 motion and 4 lighting conditions | Research licence (check) | The hardest public benchmark for phone use |
| Google PHRM (research, no code found) | Smartphone model validated on 205 people | None | Under 10% error against ECG for each skin-tone group |
| VitalLens (Rouast) | Commercial API with a published report | Proprietary API | Vendor report: 0.71 bpm pulse and 0.76 breaths per minute error on its own data set |

Error in beats per minute on public benchmarks, trained and tested on the same dataset (arXiv 2507.07795):

| Model | PURE | UBFC-rPPG | MMPD (phone video) |
| --- | --- | --- | --- |
| PhysNet | 2.10 | 2.95 | 4.80 |
| PhysFormer | 1.10 | 0.50 | 11.99 |
| EfficientPhys | not reported | 1.14 | 13.47 |
| TS-CAN | not reported | not reported | 9.71 |

Models also degrade when tested on a different dataset from their training data. PhysNet trained on synthetic SCAMPS video scores 13.30 bpm on PURE, against 0.98 when trained on PURE.

### What the benchmarks mean for the design

1. **Phone video is the hard case.** Errors on MMPD are several times those on the lab datasets. The T-09 validation has to use phones in homes, not a lab camera.
2. **A resting, still, well-lit capture reduces the gap.** Every design step in "Proposed capture" targets the motion and lighting conditions where MMPD shows the largest errors.
3. **The licences shape the build.**
   - **rPPG-Toolbox:** its licence forbids diagnosing a medical condition without human oversight, and inferring health conditions in its surveillance clause. A wellness pulse trend may fall outside both, but counsel should confirm before the toolbox's models or code are used.
   - **pyVHR:** GPL-3.0 would require releasing linked code under the same licence.
   - **Proposed route:** use vitallens.js, which ships the published POS, CHROM and G methods for the browser under the MIT licence (see "Libraries").
   - **Patents:** the authors of both methods were at Philips Research, so a patent search comes first.

### What it measures

The alpha shows only the readings that published validation supports.

| Reading | Alpha | Evidence found |
| --- | --- | --- |
| Pulse (resting heart rate) | Shown | Google's study of 205 people kept error under 10% against ECG across light, medium and dark skin tones, and daily resting pulse within 5 bpm of a wearable. The same paper says many other rPPG methods lose accuracy on the darkest skin. |
| Breathing rate | Shown after T-09 validation | One assessment reports error below 3 breaths per minute, with lower signal quality than contact sensors. |
| Heart rate variability | Hidden | Support comes from small, older studies. |
| Blood pressure | Not offered | No validated camera method was found. Denver's records already have cuff readings. |

### Privacy design

The video is processed in the browser and never uploaded. Only the numbers and a quality score reach the server.

This matches the brief's direction of keeping raw personal data under the person's control. It also removes the need for a vision model call per video. Face detection uses a browser face-landmark model. The pulse comes from the POS or CHROM method in vitallens.js (see "Libraries"). The licence findings are in "What the benchmarks mean for the design".

### Why it matters for Denver

His resting pulse should fall as his fitness improves, and it gives his trainer and doctor a trend between visits. His records show low blood pressure with dizziness in September 2024. A pulse change on a dizzy day is something he can bring to his doctor, with the readings attached.

### Safety and regulation

- **Claims:** the app presents readings as a wellness trend, not a diagnosis. Companies that make medical claims for camera pulse and breathing readings have FDA 510(k) clearance (FaceHeart, PanopticAI), so any medical claim waits for the regulatory review listed in the brief's open decisions.
- **Out-of-range readings:** a reading far from the person's baseline first prompts a retake. A repeated high or low reading plus a symptom the person reports goes through S-01 and suggests contacting a clinician.
- **Medicines:** the app never suggests a medicine change from a camera reading.

### Validation before showing numbers (proposed T-09)

Run the browser method against a finger pulse oximeter on a small group that spans skin tones and lighting, and publish the error by group. If any group's error exceeds 10%, that group sees a trend arrow instead of a number until the method improves.

## Reveal order after onboarding

Home opens on Today. The rail starts with Today, Records and Ask. Each other feature appears when its trigger first happens, with a one-time card that names the person's own data.

| Feature | Trigger |
| --- | --- |
| Timeline | 10 or more records, or records that span more than a year |
| Daily vitals by camera | The person names a fitness, heart or blood pressure goal, or asks about pulse |
| Smart scale connection | Three typed weigh-ins, or the person mentions a scale |
| Conversations and meeting notes | An upcoming appointment appears in a record or a question. The speech model download starts then. |
| People | The same clinician or service appears in 2 or more records |
| Agents | After the third question, or on request |
| Collections | 4 or more notebooks |
| Terms | After the first recording |

The 8-step tour leaves first run and stays available in Settings.

## Libraries

Each row names the package proposed for the build. Versions, dates and licences were read from the npm and PyPI registries and the repositories' licence files on 22 Oct 2026.

### Daily vitals by camera (T-08, T-09)

| Use | Package | Version, date | Licence | Why this one | Caveats |
| --- | --- | --- | --- | --- | --- |
| Pulse in the browser | `vitallens` (npm, Rouast Labs) | 0.4.8, 19 Oct 2026 | MIT | Runs POS, CHROM and G locally with built-in face detection and webcam support, with no API key. Video stays on the device. | Its own model (`method: 'vitallens'`) sends video to Rouast's paid API, so the app sets `pos` or `chrom` only. The engine `vitallens-core` 0.3.4 states MIT in its README but has no licence field in package.json. The package unpacks to 7 MB, including ffmpeg.wasm for file input, so the app loads it only on the capture page. The publisher calls the local methods less accurate than its API model. |
| Offline validation (T-09) | `open-rppg` (PyPI) | 0.1.1, 23 Dec 2025 | MIT code | One interface to 8 published models (PhysMamba, RhythmMamba, PhysFormer, the ME models, FacePhys), with a signal quality index, HRV and breathing rate. Runs on recorded validation videos to compare against the browser result. | The pretrained weights are under each paper's own terms, so they stay in validation, not production. Needs JAX and OpenCV. |
| Benchmark reference | `rPPG-Toolbox` (GitHub) | NeurIPS 2023 | Responsible AI Source Code License 1.1 | Standard benchmark configs for MMPD and PURE | Use restrictions on health inference. Counsel review before use. |
| Avoid | `pyVHR` (PyPI) | 2.0, 15 Jan 2023 | PyPI says BSD, repository LICENSE says GPL-3.0 | | Conflicting licence and no release since 2023 |

The patent search on POS and CHROM applies whichever package implements them.

### Scale, Apple Health and medicines (T-05, T-06)

| Use | Package or service | Version, date | Licence | Why this one | Caveats |
| --- | --- | --- | --- | --- | --- |
| Withings scale | Withings Public API, called with `httpx` (already a dependency) | | Withings developer terms | Estimated at a few hundred lines of OAuth and measure calls. The Python client `withings-api` last released in Feb 2022. | Withings' non-standard OAuth needs care. Their push notifications need a public callback URL. |
| Apple Health export | `apple-health-parser` (PyPI) | 2.0.4, 23 Sep 2026 | MIT | Parses the export.zip that iPhone users can produce today | Large exports can take minutes to parse, so the import runs as a background job. `healthkit-to-sqlite` has had no release since 2021. |
| Medicine names | NLM RxNav REST API, called with `httpx` | | Public NLM service | Normalises a name from a label or record to an RxNorm code | |
| Medicine label facts | openFDA drug label API, called with `httpx` | | Public FDA service | Official label text for the A-02 sources | |
| Read a bottle label in the browser | `tesseract.js` (npm) | 7.0.0, 15 Dec 2025 | Apache-2.0 | OCR on the device, so the label photo can stay local. The vision model is the fallback when the person agrees. | OCR on curved labels misses text. The person confirms each field. |

### Reminders (T-02)

| Use | Package | Version, date | Licence | Why this one | Caveats |
| --- | --- | --- | --- | --- | --- |
| Phone notifications | `pywebpush` with `py-vapid` (PyPI) | 2.5.0, 30 Aug 2026; 1.9.6, 14 Oct 2026 | MPL-2.0 | The standard Python Web Push sender | MPL-2.0 applies to changes made to those files. Using the packages unchanged has no effect on the app's licence. |
| Schedule due check-ins | `APScheduler` (PyPI) | 3.11.3, 28 Jun 2026 | MIT | Cron-style schedules per check-in, in the existing worker process | The worker's existing hourly sweep could poll instead. That suits one machine, but per-minute precision needs the scheduler. |

## Proposed tickets

| ID | Ticket | Depends on |
| --- | --- | --- |
| O-01 | Intake conversation (option A), saved as the first conversation | S-01 |
| O-02 | Up to 5 notebooks from the intake and files, prefilled | O-01, sorting |
| T-01 | Check-ins with schedules and logs, and the Today page | |
| T-02 | Reminders: in-app and web push, with the home-screen install step | T-01 |
| T-03 | Plans drafted from records and intake, approved by the person | T-01 |
| T-04 | Suggestions from logs that drift from a plan, under S-01 | T-03, S-01 |
| T-05 | Medicines: list, dose check-ins, label photo, refills | T-01, R-02 |
| T-06 | Measurements: Withings, Apple Health export, CSV | T-01 |
| V-01 | Readings store, vitals from records, self logging, and the Trends page with graphs | R-02 |
| T-08 | Daily vitals by camera (rPPG) with vitallens, processed in the browser with POS or CHROM | V-01, T-09, patent search |
| T-09 | rPPG validation against a pulse oximeter across skin tones and lighting | |

## Deferred

Food photos, calorie app imports, diet plans and meal planning. Their research and library choices are at commit 0a4db26.

## Open questions for the owner

1. Intake voice: option A (push to talk) for the alpha, or B (full voice call) now?
2. Order of tracking work after the Trends page: medicines, scale, or reminders first?
3. Reminder channels: web push only for the alpha, or also email (which needs H-04 first)?
4. Privacy line: the alpha server can read stored data, and zero data retention is not yet verified. Is "Your records are not used to train models" plus the Token Factory name acceptable until encryption ships?
5. rPPG in the alpha: pulse only, or pulse and breathing rate once T-09 passes?
6. Should progress photos (body or skin) stay in scope as a separate feature, or does rPPG replace the photo-a-day idea?
