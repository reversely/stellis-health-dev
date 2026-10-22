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
| Plan | A goal with targets and a routine. The agent drafts it from the intake and the records, and the person approves or edits it. | "Keep weight between 85 and 88 kg. About 1,800 kcal and 100 g protein a day. Walk 30 minutes, 5 days a week." Drafted from his dietitian review of 17 Nov 2025. |
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
| Weight outside the plan's range for 2 weeks | A summary of food and activity logs for those weeks, plus a question |
| A dose missed | A note to follow the label or the pharmacist's instructions. The agent never suggests a double dose. |
| Readings that S-01 marks as a risk, for example Denver's systolic pressure below 90 with dizziness | Advice to contact his clinician, with the readings attached. The plan stays unchanged. |

## Tracking features in depth

| Feature | Proposed design | Feasibility and limits |
| --- | --- | --- |
| Food photos | The person photographs a meal. A vision model names each food and estimates the portion in grams. Calories and macronutrients come from USDA FoodData Central for those foods and grams, not from the model's guess. The person confirms or fixes the items in two taps. | Published studies put photo-based calorie estimates at roughly 15 to 40% error, and macronutrients higher. The interface shows a range and weekly trends rather than one exact number per meal. Token Factory's current vision models need checking in the console, because the public list found is from an older post (Qwen2-VL). |
| Calorie apps | Import of CSV exports from MyFitnessPal or Cronometer | Cronometer has no public API, and no official MyFitnessPal API was found. Import of exports works today. |
| Diet plan | The agent drafts targets from the person's records and goals. When a dietitian's plan exists in the records, the draft follows that plan and cites it. Meals are logged against the targets. | Diabetes medicines plus a calorie cut can cause low blood sugar with some drugs. The plan screen tells the person to confirm a new plan with their clinician when the records list such a medicine. |
| Photo a day or video a day | A short guided capture at the same framing each day, such as a front photo for body change, a photo of a wound or skin spot, or a 10-step walking video for knee gait. The agent describes changes against earlier captures in neutral words. | Describing change, not diagnosing, keeps it a journal. Diagnosis from images would raise the regulatory question in the brief's open decisions. Daily images are the most sensitive data in the app, so they need their own consent and retention setting. |
| Smart scale | Withings first: OAuth connection, then each new weigh-in arrives as a log | The Withings public API needs no contract. The legacy Fitbit API switches off on 30 Oct 2026, and its replacement, the Google Health API, takes no new projects. Apple Health needs a native app, which the brief defers, so an Apple Health export file import covers it for now. |
| Medicines | The medicine list comes from accepted record facts (R-02) and from a photo of the bottle label. Each medicine gets a dose check-in and a refill reminder computed from quantity and dose. | Interaction checks wait for validated references (A-02, openFDA), as the brief requires. |
| Reminders | In-app on Today first. Phone notifications through web push. Email once H-04 adds an email provider. | On iPhone, web push works only after the person adds the app to the home screen (iOS 16.4 or later). Onboarding needs a step that shows how. |

## Reveal order after onboarding

Home opens on Today. The rail starts with Today, Records and Ask. Each other feature appears when its trigger first happens, with a one-time card that names the person's own data.

| Feature | Trigger |
| --- | --- |
| Timeline | 10 or more records, or records that span more than a year |
| Food log | A plan with food targets, or the person mentions eating in Ask or the intake |
| Photo or video check-ins | The person names a goal that a daily capture can track |
| Smart scale connection | Three typed weigh-ins, or the person mentions a scale |
| Conversations and meeting notes | An upcoming appointment appears in a record or a question. The speech model download starts then. |
| People | The same clinician or service appears in 2 or more records |
| Agents | After the third question, or on request |
| Collections | 4 or more notebooks |
| Terms | After the first recording |

The 8-step tour leaves first run and stays available in Settings.

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
| T-07 | Food log: photo, FoodData Central nutrients, CSV import | T-01, vision model check |
| T-08 | Photo or video a day, with its own consent and retention setting | T-01, S-03 |

## Open questions for the owner

1. Intake voice: option A (push to talk) for the alpha, or B (full voice call) now?
2. Order of tracking work after T-01 and T-02: medicines, food, scale, or daily photos first?
3. Reminder channels: web push only for the alpha, or also email (which needs H-04 first)?
4. Privacy line: the alpha server can read stored data, and zero data retention is not yet verified. Is "Your records are not used to train models" plus the Token Factory name acceptable until encryption ships?
5. Should daily photos and videos stay out of model calls unless the person asks for a comparison?
