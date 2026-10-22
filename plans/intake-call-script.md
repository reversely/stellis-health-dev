# Intake call script: Denver Lang

This script is the acceptance script for O-01. The call follows a fixed plan: the agent states the purpose of the call, asks for the person's main goal, then covers conditions, medicines, care team, what has helped and reminders, one topic at a time. Each topic fills the notepad heading of the same name. The simulated call test (`tests/test_intake.py`) speaks Denver's lines through the real speech pipeline and checks the transcript, the notepad and the proposed notebooks against this script. The source is `tests/fixtures/intake_denver.json`.

## Turn 1

**Stellis:** Hi, I'm Stellis. In the next five minutes I'll learn what you want help with, your conditions, medicines and care team, and what reminders would help. I'll take notes as we go, and you can edit them. First, what's the main health goal you'd like help with?

**Denver:** Keeping the weight off. I've lost about eight kilos since April last year, and I'd like my knees to stop hurting on the stairs.

Notepad after this turn:

- **Goals:** Keep the weight off, after losing about 8 kg since April 2024; Less knee pain on stairs

## Turn 2

**Stellis:** Eight kilos is real progress. Which knee is it, and how bad is the pain on the stairs now?

**Denver:** The right one. Physio got it from a six to about a three out of ten.

Notepad after this turn:

- **Goals:** Keep the weight off, after losing about 8 kg since April 2024; Less pain in the right knee on stairs, now about 3 out of 10, down from 6
- **Care team:** Physiotherapist
- **What has helped:** Physiotherapy for the right knee

## Turn 3

**Stellis:** That's a big drop. Next, your conditions. Do you have any ongoing conditions I should know about?

**Denver:** Type two diabetes and high blood pressure, since the eighties. And I had bypass surgery in ninety seven.

Notepad after this turn:

- **Goals:** Keep the weight off, after losing about 8 kg since April 2024; Less pain in the right knee on stairs, now about 3 out of 10, down from 6
- **Conditions:** Type 2 diabetes since the 1980s; High blood pressure since the 1980s; Heart bypass surgery in 1997
- **Care team:** Physiotherapist
- **What has helped:** Physiotherapy for the right knee

## Turn 4

**Stellis:** Thank you. What medicines do you take, with the dose and time of day?

**Denver:** Metformin five hundred in the morning, lisinopril, and simvastatin at night.

Notepad after this turn:

- **Goals:** Keep the weight off, after losing about 8 kg since April 2024; Less pain in the right knee on stairs, now about 3 out of 10, down from 6
- **Conditions:** Type 2 diabetes since the 1980s; High blood pressure since the 1980s; Heart bypass surgery in 1997
- **Medicines:** Metformin 500 mg in the morning; Simvastatin at night
- **Care team:** Physiotherapist
- **What has helped:** Physiotherapy for the right knee
- **To confirm:** Lisinopril

## Turn 5

**Stellis:** Did you say lisinopril, the blood pressure medicine?

**Denver:** Yes, lisinopril. They stopped my water pill last year because I got dizzy standing up.

Notepad after this turn:

- **Goals:** Keep the weight off, after losing about 8 kg since April 2024; Less pain in the right knee on stairs, now about 3 out of 10, down from 6
- **Conditions:** Type 2 diabetes since the 1980s; High blood pressure since the 1980s; Heart bypass surgery in 1997
- **Medicines:** Metformin 500 mg in the morning; Simvastatin at night; Lisinopril; Water pill stopped in 2024 after dizziness on standing
- **Care team:** Physiotherapist
- **What has helped:** Physiotherapy for the right knee

## Turn 6

**Stellis:** Got it. Who do you see for your care?

**Denver:** My family doctor, Doctor Patel, a dietitian, and a personal trainer.

Notepad after this turn:

- **Goals:** Keep the weight off, after losing about 8 kg since April 2024; Less pain in the right knee on stairs, now about 3 out of 10, down from 6
- **Conditions:** Type 2 diabetes since the 1980s; High blood pressure since the 1980s; Heart bypass surgery in 1997
- **Medicines:** Metformin 500 mg in the morning; Simvastatin at night; Lisinopril; Water pill stopped in 2024 after dizziness on standing
- **Care team:** Dr. Patel, family doctor; Dietitian; Personal trainer; Physiotherapist
- **What has helped:** Physiotherapy for the right knee

## Turn 7

**Stellis:** What has helped most with your weight and your knee so far?

**Denver:** The dietitian's plate method, and walking with my trainer.

Notepad after this turn:

- **Goals:** Keep the weight off, after losing about 8 kg since April 2024; Less pain in the right knee on stairs, now about 3 out of 10, down from 6
- **Conditions:** Type 2 diabetes since the 1980s; High blood pressure since the 1980s; Heart bypass surgery in 1997
- **Medicines:** Metformin 500 mg in the morning; Simvastatin at night; Lisinopril; Water pill stopped in 2024 after dizziness on standing
- **Care team:** Dr. Patel, family doctor; Dietitian; Personal trainer; Physiotherapist
- **What has helped:** The dietitian's plate method; Walking with his trainer; Physiotherapy for the right knee

## Turn 8

**Stellis:** Last one. Would any reminders help, and when?

**Denver:** A reminder to weigh in on Monday mornings would help.

Notepad after this turn:

- **Goals:** Keep the weight off, after losing about 8 kg since April 2024; Less pain in the right knee on stairs, now about 3 out of 10, down from 6
- **Conditions:** Type 2 diabetes since the 1980s; High blood pressure since the 1980s; Heart bypass surgery in 1997
- **Medicines:** Metformin 500 mg in the morning; Simvastatin at night; Lisinopril; Water pill stopped in 2024 after dizziness on standing
- **Care team:** Dr. Patel, family doctor; Dietitian; Personal trainer; Physiotherapist
- **What has helped:** The dietitian's plate method; Walking with his trainer; Physiotherapy for the right knee
- **Reminders:** Weigh in on Monday mornings

## Turn 9

**Stellis:** Here is what I heard. You want to keep the weight off and ease your right knee on the stairs. You manage diabetes and blood pressure with metformin, lisinopril and simvastatin. You see Dr. Patel, a dietitian, a physiotherapist and a trainer, and you'd like a Monday weigh-in reminder. I'll suggest notebooks for weight and knees, and for diabetes and heart care. Is anything wrong?

**Denver:** No, that's right.

Notepad after this turn: unchanged.

## Turn 10

**Stellis:** Thank you, Denver. Your notes are ready to review.

The call ends after this turn.

## Proposed notebooks

| Notebook | Goal | Records |
| --- | --- | --- |
| Weight maintenance | Keep the weight off | Titles containing "Dietitian" |
| Diabetes | None | Titles containing "Lab results" |
