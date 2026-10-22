# Intake call script: Denver Lang

This script is the acceptance script for O-01. The simulated call test (`tests/test_intake.py`) speaks Denver's lines through the real speech pipeline and checks the transcript, the notepad and the proposed notebooks against it. The source is `tests/fixtures/intake_denver.json`.

## Turn 1

**Stellis:** Hi, I'm Stellis. I'll ask about your health and take notes while we talk. What would you most like help with right now?

**Denver:** Keeping the weight off, and my knees.

Notepad after this turn:

- **What brought you here:** Keeping the weight off; Knees

## Turn 2

**Stellis:** Weight and knees, got it. How much have you lost so far, and what has helped most?

**Denver:** About eight kilos since April last year. The dietitian's plate method, and walking with my trainer.

Notepad after this turn:

- **What brought you here:** Keeping the weight off; Knees
- **Care team:** Dietitian; Personal trainer
- **Goals:** Keep the weight off, after losing about 8 kg since April 2024
- **What has helped:** The dietitian's plate method; Walking with his trainer

## Turn 3

**Stellis:** That's real progress. Which knee bothers you, and what can't you do now that you could a year ago?

**Denver:** The right one. Stairs mostly. Physio got it from a six to about a three.

Notepad after this turn:

- **What brought you here:** Keeping the weight off; Knees
- **Conditions:** Right knee pain on stairs, about 3 out of 10, down from 6
- **Care team:** Dietitian; Personal trainer; Physiotherapist
- **Goals:** Keep the weight off, after losing about 8 kg since April 2024
- **What has helped:** The dietitian's plate method; Walking with his trainer; Physiotherapy for the right knee

## Turn 4

**Stellis:** Stairs with the right knee, down from six to three. Do you have any ongoing conditions I should know about?

**Denver:** Type two diabetes and blood pressure, since the eighties. And I had bypass surgery in ninety seven.

Notepad after this turn:

- **What brought you here:** Keeping the weight off; Knees
- **Conditions:** Right knee pain on stairs, about 3 out of 10, down from 6; Type 2 diabetes since the 1980s; High blood pressure since the 1980s; Heart bypass surgery in 1997
- **Care team:** Dietitian; Personal trainer; Physiotherapist
- **Goals:** Keep the weight off, after losing about 8 kg since April 2024
- **What has helped:** The dietitian's plate method; Walking with his trainer; Physiotherapy for the right knee

## Turn 5

**Stellis:** Thank you. What medicines do you take for those?

**Denver:** Metformin five hundred in the morning, lisinopril, and simvastatin at night.

Notepad after this turn:

- **What brought you here:** Keeping the weight off; Knees
- **Conditions:** Right knee pain on stairs, about 3 out of 10, down from 6; Type 2 diabetes since the 1980s; High blood pressure since the 1980s; Heart bypass surgery in 1997
- **Medicines:** Metformin 500 mg in the morning; Simvastatin at night
- **Care team:** Dietitian; Personal trainer; Physiotherapist
- **Goals:** Keep the weight off, after losing about 8 kg since April 2024
- **What has helped:** The dietitian's plate method; Walking with his trainer; Physiotherapy for the right knee
- **To confirm:** Lisinopril

## Turn 6

**Stellis:** Did you say lisinopril, the blood pressure medicine?

**Denver:** Yes, lisinopril. They stopped my water pill last year because I got dizzy standing up.

Notepad after this turn:

- **What brought you here:** Keeping the weight off; Knees
- **Conditions:** Right knee pain on stairs, about 3 out of 10, down from 6; Type 2 diabetes since the 1980s; High blood pressure since the 1980s; Heart bypass surgery in 1997
- **Medicines:** Metformin 500 mg in the morning; Simvastatin at night; Lisinopril; Water pill stopped in 2024 after dizziness on standing
- **Care team:** Dietitian; Personal trainer; Physiotherapist
- **Goals:** Keep the weight off, after losing about 8 kg since April 2024
- **What has helped:** The dietitian's plate method; Walking with his trainer; Physiotherapy for the right knee

## Turn 7

**Stellis:** Lisinopril, thanks. Who is your main doctor, and would reminders help with anything?

**Denver:** My family doctor, Doctor Patel. A reminder to weigh in on Monday mornings would help.

Notepad after this turn:

- **What brought you here:** Keeping the weight off; Knees
- **Conditions:** Right knee pain on stairs, about 3 out of 10, down from 6; Type 2 diabetes since the 1980s; High blood pressure since the 1980s; Heart bypass surgery in 1997
- **Medicines:** Metformin 500 mg in the morning; Simvastatin at night; Lisinopril; Water pill stopped in 2024 after dizziness on standing
- **Care team:** Dietitian; Personal trainer; Physiotherapist; Dr. Patel, family doctor
- **Goals:** Keep the weight off, after losing about 8 kg since April 2024
- **What has helped:** The dietitian's plate method; Walking with his trainer; Physiotherapy for the right knee
- **Reminders:** Weigh in on Monday mornings

## Turn 8

**Stellis:** Here is what I heard. You want to keep the weight off and look after your right knee. You manage diabetes and blood pressure with metformin, lisinopril and simvastatin. You see Dr. Patel, a dietitian, a physiotherapist and a trainer, and you'd like a Monday weigh-in reminder. I'll suggest notebooks for weight and knees, and for diabetes and heart care. Is anything wrong?

**Denver:** No, that's right.

Notepad after this turn: unchanged.

## Turn 9

**Stellis:** Thank you, Denver. Your notes are ready to review.

The call ends after this turn.

## Proposed notebooks

| Notebook | Goal | Records |
| --- | --- | --- |
| Weight and knees | Keep the weight off | Titles containing "Dietitian" |
| Diabetes and heart care | None | Titles containing "Lab results" |
