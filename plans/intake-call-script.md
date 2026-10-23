# Intake call script: Denver Lang

This synthetic script is one acceptance example for O-01. Stellis invites health goals and covers goals, health context and reminders through conversation. Topics complete only after sufficient information or an explicit skip. Questions and ambiguous replies can lead to useful clarification. The model completes topics explicitly and requests a closing handoff with a reason, the Add records action and a goodbye. A larger bounded turn budget triggers the same spoken handoff. The source is `tests/fixtures/intake_denver.json`.

Guided setup starts with a confirmed name and personal preferences before suggesting notebooks. The optional health library offers goal categories, health topics and a local RxTerms medicine search. Selecting a term prepares an editable answer and does not confirm a diagnosis, medicine use or dose.

## Turn 1

**Stellis:** Hi, I'm Stellis. Let's talk about your health goals. I'll take notes you can edit. What would you like help with?

**Denver:** Keeping the weight off. I've lost about eight kilos since April last year, and I'd like my knees to stop hurting on the stairs.

Notepad after this turn:

- **Goals:** Keep the weight off, after losing about 8 kg since April 2024; Less knee pain on stairs

## Turn 2

**Stellis:** Eight kilos is real progress. Next, your health: which conditions do you have, and which medicines do you take?

**Denver:** Type two diabetes and high blood pressure, since the eighties. Metformin five hundred in the morning, lisinopril, and simvastatin at night.

Notepad after this turn:

- **Goals:** Keep the weight off, after losing about 8 kg since April 2024; Less knee pain on stairs
- **Conditions:** Type 2 diabetes since the 1980s; High blood pressure since the 1980s
- **Medicines:** Metformin 500 mg in the morning; Simvastatin at night
- **To confirm:** Lisinopril

## Turn 3

**Stellis:** Thank you. Last one: would any reminders help, and when?

**Denver:** A reminder to weigh in on Monday mornings would help.

Notepad after this turn:

- **Goals:** Keep the weight off, after losing about 8 kg since April 2024; Less knee pain on stairs
- **Conditions:** Type 2 diabetes since the 1980s; High blood pressure since the 1980s
- **Medicines:** Metformin 500 mg in the morning; Simvastatin at night
- **Reminders:** Weigh in on Monday mornings
- **To confirm:** Lisinopril

## Turn 4

**Stellis:** We've covered your goals, health context and reminders. You can review your notes, then choose Add records to continue setup. Thanks for talking with me. Goodbye.

The call ends after this turn.

## Proposed notebooks

| Notebook | Goal | Records |
| --- | --- | --- |
| Weight maintenance | Keep the weight off | Titles containing "Dietitian" |
| Diabetes | None | Titles containing "Lab results" |
