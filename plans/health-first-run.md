# Proposal: health first run and gradual reveal

Status: proposal for owner review. It covers U-04 (health onboarding) and replaces the workspace tour. It uses the approved U-01 term list.

## The current first run

The current flow comes from the meeting app.

| Step | What the person sees |
| --- | --- |
| Welcome | An orbit of 14 icons (Meetings, Chief of Staff, Slide Deck Designer, Tutor and others) and "a private AI team for your entire life" |
| Uses | Seven tiles (Meetings, Learning, Projects, Home projects, Family, Deep research, Slide decks), a Google Calendar row that reports "not available on the web app yet", Tavily and Token Factory key fields, and a Cloud AI check |
| Review | Starter notebooks inside a "Work" collection, agent checkboxes per notebook, and "Suggest tasks" |
| Home and tour | Every feature at once: daily brief, agents, a 500 MB speech model download, to-dos, notebooks, five meeting tags. The tour then walks 8 steps through workspace, notebook, chat, instructions, agents, models, traces and recording. |

A person who signs up to understand their health sees no health content until they find the Records page on their own. The tour explains model routing and request traces before it explains their records.

## Proposed principle

The person sees their own health records within the first two minutes. Each other feature appears when the person's records or actions give it something to show, with a one-line card that says what it does with their data.

## Proposed onboarding

Four screens, inside the U-04 limit of five.

| Screen | Proposed content | Replaces |
| --- | --- | --- |
| 1. Welcome | "Keep your health records in one place and ask about them." The orbit shows things people already have: a lab result, a letter from a physio, a food diary, a scale reading, a prescription, a recording of a visit. One line on privacy that states only verified facts (see open questions). | The orbit of meeting and agent icons |
| 2. What's going on | "What would you like help with?" Tiles in everyday words: Managing a long-term condition, Losing weight or getting fitter, Pain or recovery, Understanding test results, Getting ready for appointments, Keeping my records together. Each tile proposes a starter notebook. The guide explains each tile in one sentence, for example "Your dietitian notes, food diary and scale readings stay together, so you can see how far you've come." | The seven work tiles, the Calendar row, the key fields and the Cloud AI check. Owner settings move to Settings. |
| 3. Your records | A drop area for files, as on the Records page. As each file uploads it appears on a small dated strip, so the person sees their history take shape. "Try it with sample records" loads Denver's 50 files for people who have none to hand. "Add later" continues. | New |
| 4. Here's what we found | Notebooks proposed from the uploaded records, merged with the notebooks from screen 2, each listing its records. The person renames, unticks or skips each one, then chooses "Set up". Agents stay on by default and appear as one line per notebook ("An agent keeps this notebook tidy"), with the choice under "Change". | The Review screen with agent checkboxes per notebook |

Consent (S-03) goes between screens 1 and 2 when counsel approves the text. Until then the alpha shows the current account terms.

## Proposed first Home

After setup, Home shows three things:

1. **Your health so far.** A short summary in plain second person (see the summary section below).
2. **Your records.** The count, the five newest records, and "Add records".
3. **Ask.** One question box that answers from the person's records, with sources.

The rail shows Home, Records and Ask. The daily brief is off by default (owner decision, U-01).

## Proposed reveal order

Each feature appears when its trigger first happens. A card on Home introduces it once, and the person can dismiss the card. The rail entry stays after that.

| Feature | Trigger | Introduction card |
| --- | --- | --- |
| Timeline | 10 or more records, or records that span more than a year | "Timeline: your 50 records in date order, from 1997 to 2026." |
| Notebooks | The first notebook is set up | Shown as part of Home from then on |
| Check-ins | The person sets a goal, or a record mentions a follow-up date | "Check-ins: your dietitian review on 17 Nov 2025 asks you to weigh in weekly. Want a check-in?" |
| Conversations and meeting notes | A record or question mentions an upcoming appointment, or the person chooses "Record a visit" | "Record your next appointment and get notes you can read afterwards." The speech model download starts here, not at sign-up. |
| People | Records name the same clinician or service at least twice | "People: your physiotherapist appears in 4 records." |
| Agents | After the person's third question, or on request | "Agents keep notebooks tidy and answer from your records. You have 2." |
| Terms | After the first recording | "Terms: add drug or place names so recordings spell them right." |
| Collections | 4 or more notebooks | "Collections group notebooks, for example everything about your heart." |

The 8-step tour is retired from first run and stays available in Settings.

## Proposed summary for the person

The current summary uses chart headings (Conditions, Medications, Care team) and reads like a note for a clinician. The proposed version answers the questions a person asks about themselves.

| Section | What it says, in Denver's case |
| --- | --- |
| How you're doing | "Your blood sugar has stayed in a healthy range for three years. You've lost about 8 kg since April 2024." |
| What's changed | "Your doctor stopped one blood pressure tablet in September 2024 after you felt dizzy standing up." |
| What your numbers mean | One line per recent test: what it measures and how it compares with the person's own earlier results. |
| Worth asking about | Questions for the next appointment, built from the records (A-03), for example "You asked whether you still need lisinopril. Your home readings are 88 to 95." |

Sources stay attached to each sentence, shown by record name and date ("Dietitian review, 17 Nov 2025") rather than a number. The page opens with the first two sections and keeps the others behind "More".

## Open questions for the owner

1. Are the six tiles on screen 2 the right starting set?
2. Should a reveal happen on its own, or should the card offer it ("Show Timeline") first?
3. Should onboarding offer Denver's sample records to new accounts, or keep them for demos only?
4. The privacy line on screen 1 can state that Nebius Token Factory runs the model. The brief's zero data retention and client-side encryption are not verified or built in the alpha, so the line leaves them out until they are. Is that wording acceptable?
