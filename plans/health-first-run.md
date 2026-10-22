# Proposal: health first run and the three pillars

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

Proposed instructions for the intake agent:

- **Caring.** Opens by asking what brought the person here and acknowledges what they say before moving on.
- **Direct.** Asks one question at a time, in plain words, and says why it is asking when the reason is not obvious.
- **Curious.** Follows up on vague answers ("You said your knee is bad. What can't you do now that you could a year ago?").
- **Covers, in the person's order:** current concerns, conditions and medicines, the clinicians they see, what they want to change, what has worked or failed before, and how they want reminders.
- **Ends** by reading back what it heard in five lines or fewer and naming the notebooks and check-ins it will propose. The person corrects anything before step 4.
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

## Today: goals, habits and reminders

Today is the third pillar's home and the first page after onboarding. It shows:
- the check-ins due now,
- the latest readings against the person's plan,
- the agent's suggestions waiting for a yes or no.

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
| Weight outside the plan's range for 2 weeks | A summary of food and activity logs for those weeks, plus a question |
| A dose missed | A note to follow the label or the pharmacist's instructions. The agent never suggests a double dose. |
| Readings that S-01 marks as a risk, for example Denver's systolic pressure below 90 with dizziness | Advice to contact his clinician, with the readings attached. The plan stays unchanged. |

## Tracking features in depth

| Feature | Proposed design | Feasibility and limits |
| --- | --- | --- |
| Food photos | See "Food photos" below. | See below. |
| Diet plan | See "Diet plans" below. | See below. |
| Daily vitals by camera (rPPG) | See "Daily vitals by camera" below. | See below. |
| Smart scale | Withings first: OAuth connection, then each new weigh-in arrives as a log | The Withings public API needs no contract. The legacy Fitbit API switches off on 30 Oct 2026, and its replacement, the Google Health API, takes no new projects. Apple Health needs a native app, which the brief defers, so an Apple Health export file import covers it for now. |
| Medicines | The medicine list comes from accepted record facts (R-02) and from a photo of the bottle label. Each medicine gets a dose check-in and a refill reminder computed from quantity and dose. | Interaction checks wait for validated references (A-02, openFDA), as the brief requires. |
| Reminders | In-app on Today first. Phone notifications through web push. Email once H-04 adds an email provider. | On iPhone, web push works only after the person adds the app to the home screen (iOS 16.4 or later). Onboarding needs a step that shows how. |

## Food photos

### Open-source work and benchmarks

| Project | What it is | Licence | Published result |
| --- | --- | --- | --- |
| Nutrition5k (Google) | 5,000 real cafeteria dishes with weighed ingredients, photos and depth video, plus baseline models | Data CC BY 4.0 | Photo only: calorie error 26.1% (70.6 kcal), macronutrients 31.9%. With depth: 18.8%. With volume: 16.5%. |
| FoodSAM | Food segmentation built on Segment Anything, which outlines each food on the plate | Apache-2.0 | 46.4 mIoU on FoodSeg103 (third-party leaderboard) |
| OpenNutriTracker | Flutter calorie tracker with barcode lookup against Open Food Facts and USDA FoodData Central | GPL-3.0 | No photo recognition |
| ai-calorie-tracker (tahaygun) | Self-hosted web app that sends meal photos to an OpenAI model | No licence file found | None published |
| Student ResNet-50 on Nutrition5k (Hashim-sawan) | Fine-tuned image model predicting calories and macros from one overhead photo | Not checked | 56.6 kcal error on a trimmed test set, so not comparable with the paper |
| Open Food Facts | Open database of packaged foods with barcodes | Open data | Exact label values for packaged foods |

Large multimodal models on meal photos, from published studies:

| Study | Result |
| --- | --- |
| 52 standardised photos, ChatGPT and Claude (2025) | About 35.8% calorie error for each |
| Mu, Sun and He, ACM BCB 2025: seven models including open-weight Llama, on Nutrition5k and phone photos | With the true food weight supplied, error fell to 20.2% (Gemini 2.5 Flash) and 26.8% (GPT-4.1). The Llama figures are in the open-access paper and not yet extracted. |
| Open-KNEAD (2026) | Matching each food to a USDA FNDDS code, versus asking the model directly. It reports that a current model's direct estimate matches or beats the retrieval pipeline. |
| Macronutrients across studies | Errors are higher than for calories, roughly 40% to over 100% in secondary summaries |

### What the evidence says for the design

1. **Portion weight causes most of the error.** Supplying the weight cut error to about 20 to 27%. The person's quick portion answer ("about a cup of rice") is worth more than a better model.
2. **Packaged food should not be estimated from photos.** A barcode lookup in Open Food Facts gives the label's exact values.
3. **Repeated meals should be logged once.** Denver cooks fish twice a week. A saved "usual meal" makes the next log a single tap with known values.
4. **The open-weight model needs measuring before launch.** Token Factory's vision models have no published food benchmark.

### Proposed pipeline

| Step | Proposed design |
| --- | --- |
| 1. Capture | Photo from above, or a barcode scan, or a saved usual meal |
| 2. Identify | An open-weight vision model on Token Factory lists the foods and suggests portion sizes in household units |
| 3. Confirm | The person adjusts portions with a slider or chooses "about right". This step targets the largest error source. |
| 4. Nutrients | Values come from USDA FoodData Central, or Open Food Facts for barcodes, using the confirmed foods and grams. The model does no arithmetic. |
| 5. Show | Calories as a range, and the plan's own measures first. For Denver: protein toward 90 g, the plate method share of vegetables, beer evenings this week. |

### Proposed evaluation (T-07a)

Run each Token Factory vision model on the Nutrition5k test split (CC BY 4.0), with and without the true weight, and record calorie and macronutrient error. Pick the model on that result. Publish the table in `docs/validation/`.

## Diet plans

### Order of sources

| Order | Source | Example for Denver |
| --- | --- | --- |
| 1 | A clinician's plan in the person's records. The app tracks against it and cites it, and changes it only when the person says the clinician changed it. | Dietitian review, 17 Nov 2025: plate method, protein 90 g a day, beer up to 3 evenings a week, weigh weekly, book a visit above 89 kg |
| 2 | Established general guidance, labelled as general, when no clinician plan exists | See the methods below |
| 3 | The person's own preferences and goals from the intake | "Walk 45 minutes with the grandchildren" (his physiotherapy goal) |

### Established methods for the general plan

| Measure | Method | Evidence and limits |
| --- | --- | --- |
| Resting energy | Mifflin-St Jeor equation from weight, height, age and sex | The most accurate of the common equations in comparison studies, including older people. It underestimates older men by about 5%, has little evidence past age 85, and does worse in obesity. |
| Daily energy (TDEE) | Resting energy times an activity factor, 1.2 to 1.725 | Overstated activity is the largest error source, so the app starts from the low end |
| Personal TDEE | After 2 to 3 weeks, the app recalculates from the person's own logged intake and scale trend, using about 7,700 kcal per kg of weight change | Replaces the equation with the person's own measurement. Needs regular weigh-ins and food logs. |
| Weight loss target | 5 to 7% of body weight, the ADA's figure for people at high risk of type 2 diabetes, at about 0.5 kg a week | Denver's dietitian used 0.5 kg a week, and he lost 8.8% |
| Protein | 1.0 to 1.2 g per kg a day for people over 65, and 1.2 g or more when exercising (PROT-AGE, ESPEN) | People with severe kidney disease (eGFR below 30) may need less. The app defers to the clinician when the records show this. |
| Eating pattern | Dietary Guidelines for Americans 2025 to 2030: whole foods, protein by body weight, fewer ultra-processed foods and added sugars. For diabetes, the ADA 2026 Standards list Mediterranean-style and low-carbohydrate patterns. | Meal plans follow one named pattern and say which |

Denver's numbers as a check: in April 2024 (95.0 kg, 176.8 cm, age 76), Mifflin-St Jeor gives 1,680 kcal at rest and 2,016 kcal at a sedentary activity factor. His dietitian estimated his need at 2,000 kcal. At maintenance in November 2025 (86.6 kg, age 78), the equation gives 2,181 kcal at a light activity factor.

### Proposed meal plans

1. A solver chooses foods and portions from USDA FoodData Central to meet the plan's targets. Open-source examples use linear programming: usda-mcp, aedobbyn/menu-builder, and tommyod's OR-Tools planner. Their licences need checking before reuse.
2. The model turns the solver's choices into meals the person would cook, using their stated likes, such as Denver's fish twice a week.
3. The app recomputes each meal's numbers from FoodData Central and rejects any plan that misses a target.

### Safety rules (proposed)

- **Floors:** no calorie target below 1,500 kcal a day for men or 1,200 for women without a clinician's plan.
- **Low blood sugar risk:** when the records list insulin or a sulfonylurea, a new calorie target asks the person to confirm it with their clinician first. Metformin alone, as in Denver's records, has a low risk of low blood sugar.
- **Older adults losing weight:** protein and strength exercise stay in every plan to protect muscle.
- **Low body weight:** no weight loss plan when BMI is under 18.5, or under 22 for people over 65.

## Daily vitals by camera (rPPG)

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
| Food log | A plan with food targets, or the person mentions eating in Ask or the intake |
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

### Food photos and food log (T-07a, T-07)

| Use | Package or service | Version, date | Licence | Why this one | Caveats |
| --- | --- | --- | --- | --- | --- |
| Name the foods and portions | An open-weight vision model on Token Factory, called through the existing `agent_gateway` path | | Model's own licence, commonly Apache-2.0 for Qwen-VL | Keeps one inference provider, as the brief requires | The model list is unconfirmed, because Token Factory's site is blocked from the development container. T-07a picks the model. |
| Nutrient values | USDA FoodData Central bulk download (FNDDS and Foundation Foods CSV), loaded into the account database | Released twice a year | Public domain (CC0) | Lookups stay on the server with no third-party call per meal. No client library needed. | The full download is large. The import keeps only FNDDS and Foundation Foods, and only the columns the app uses. |
| Packaged food by barcode | `openfoodfacts` (PyPI) | 5.4.1, 20 Oct 2026 | MIT (SDK), ODbL (data) | Official SDK for the Open Food Facts API and data dumps | Data quality varies by product. The app shows the product photo so the person can confirm the match. |
| Barcode scanning in the browser | `barcode-detector` (npm) | 3.2.3, 19 Oct 2026 | MIT | Uses the browser's native BarcodeDetector where it exists and falls back to `zxing-wasm` elsewhere, including iPhone Safari | Adds a WASM file, loaded only when scanning. Its size needs measuring in the build. |
| Calorie app exports | Python `csv` module | | | MyFitnessPal and Cronometer exports are CSV | No library needed |
| Avoid | `ultralytics` (YOLO) | 8.4.183 | AGPL-3.0 | | AGPL would require releasing the hosted app's source |

An in-browser Food-101 classifier through `@huggingface/transformers` (4.3.1, Apache-2.0) was considered. Food-101 has 101 single-dish classes, which does not cover a mixed plate, so the plan leaves it out.

### Diet plans (T-10)

| Use | Package | Version, date | Licence | Why this one | Caveats |
| --- | --- | --- | --- | --- | --- |
| Energy and protein targets | No package. Mifflin-St Jeor, activity factors, adaptive TDEE and PROT-AGE ranges as a small Python module. | | | Each formula is a few lines and needs no dependency. Tests check them against published worked examples. | |
| Meal plan solver | `scipy` (`scipy.optimize.milp`, which runs the HiGHS solver) | 1.18.1, 21 Aug 2026 | BSD-3-Clause | Mixed-integer solver for portions that meet nutrient targets, built on numpy, which the app already uses | Adds tens of megabytes to the image. `highspy` (MIT) is the lighter option if image size matters. |
| The person's own recipes | `recipe-scrapers` (PyPI) | 15.13.0, 18 Oct 2026 | MIT | Imports ingredients from recipe sites the person already cooks from, so plans use meals they know | Optional |

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
| T-07a | Vision model evaluation on Nutrition5k | Console access to Token Factory |
| T-07 | Food log: photo, barcode, usual meals, FoodData Central nutrients, CSV import | T-01, T-07a |
| T-10 | Diet plans: clinician plan first, general targets, solver meal plans | T-03, T-07 |
| T-08 | Daily vitals by camera (rPPG), processed in the browser with POS or CHROM | T-01, T-09, patent search |
| T-09 | rPPG validation against a pulse oximeter across skin tones and lighting | |

## Open questions for the owner

1. Intake voice: option A (push to talk) for the alpha, or B (full voice call) now?
2. Order of tracking work after T-01 and T-02: medicines, food, scale, or rPPG first?
3. Reminder channels: web push only for the alpha, or also email (which needs H-04 first)?
4. Privacy line: the alpha server can read stored data, and zero data retention is not yet verified. Is "Your records are not used to train models" plus the Token Factory name acceptable until encryption ships?
5. rPPG in the alpha: pulse only, or pulse and breathing rate once T-09 passes?
6. Should progress photos (body or skin) stay in scope as a separate feature, or does rPPG replace the photo-a-day idea?
