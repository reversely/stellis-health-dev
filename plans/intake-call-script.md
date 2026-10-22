# Intake call script: Denver Lang

This script is the acceptance script for O-01. The call follows a fixed plan: Stellis states the purpose of the call and asks three questions, one each about the person's goal, their conditions and medicines, and reminders. Stellis asks no follow-up questions: any answer completes its topic. After the third answer, Stellis sums up in one sentence, asks the person to press Continue, and ends the call. The person corrects anything in the notepad. The simulated call test (`tests/test_intake.py`) speaks Denver's lines through the real speech pipeline and checks the transcript, the notepad and the proposed notebooks against this script. The source is `tests/fixtures/intake_denver.json`.

## Turn 1

**Stellis:** Hi, I'm Stellis. I'll ask three quick questions, about your goal, your health and reminders, and take notes you can edit. First, what's the main health goal you'd like help with?

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

**Stellis:** Thanks, Denver. You want to keep the weight off and ease your knees, you manage diabetes and blood pressure, and you'd like a Monday weigh-in reminder. You can edit your notes, then press Continue to add your records.

The call ends after this turn.

## Proposed notebooks

| Notebook | Goal | Records |
| --- | --- | --- |
| Weight maintenance | Keep the weight off | Titles containing "Dietitian" |
| Diabetes | None | Titles containing "Lab results" |
