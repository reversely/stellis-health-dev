# Camera vitals: live capture design

Status: the design for the live pulse capture on Trends (T-08). It replaces the first version merged in #61, which showed only a camera preview, an oval and a countdown. Items marked "proposal" need the owner's decision before they ship.

## Who it is for

Denver is 79. He has type 2 diabetes, low blood pressure that has made him dizzy on standing, and knee arthritis. He is likely to measure in the morning, sitting at the kitchen table with a phone propped against something, before coffee. The capture design assumes that:

- he looks at the camera, not the screen, for most of the 30 seconds;
- he may wear reading glasses and may not see small text from arm's length;
- he may sit with a bright window behind him, which darkens his face;
- he wants one clear number and to know whether it is normal for him.

## Principles

| Principle | What it means on screen |
| --- | --- |
| The video stays on the device | Face detection, brightness and the pulse method all run in the browser. Only the final number and a quality score are saved. The screen says this before the camera starts. |
| Fix the setup before measuring | Four checks (face, light, stillness, signal) must pass before the countdown runs. The countdown pauses, without resetting, when a check fails. |
| One instruction at a time | The status line names the single most important fix ("Move closer", then "Turn toward the light"), never a list of problems. |
| No jumping numbers | The live screen shows the pulse wave, which reassures without inviting reaction. The number appears once, at the end. |
| Compare with himself | The result compares the reading with his usual range from Trends, not with population norms. |
| A wellness trend, not a diagnosis | The result never says "normal" or "abnormal". A reading far from his usual range asks for a retake first. Repeated readings far from it, together with a symptom he reports, lead to the S-01 advice to contact his clinician. |

## The four checks

Each check runs on every vitals event, about 30 times a second. The values are proposals to tune in T-09.

| Check | How it is measured | Passes when | Fix shown |
| --- | --- | --- | --- |
| Face | vitallens face box (x0, y0, x1, y1) in video pixels | A face is found, its centre is within 15% of the frame width and height from the oval's centre, and its width is 28% to 60% of the frame width | "Move your face into the oval", "Move closer", "Move back a little" |
| Light | The mean brightness of the face box, from a 48 by 48 pixel canvas sample of the video every 400 ms | Mean luma between 70 and 215 (0 to 255), and the face is no more than 45 levels darker than the whole frame | "Find more light", "Turn toward the light" (backlit), "Too bright, step out of direct sun" |
| Still | Movement of the face box centre | Under 4% of the frame width over the last second | "Hold still" |
| Signal | vitallens PPG waveform samples | Samples are arriving and their spread over the last 3 seconds is above zero | "Getting your pulse" (shown while the signal builds) |

The fix shown is the first failing check in the order Face, Light, Still, Signal.

## Timing

| Rule | Value |
| --- | --- |
| Good signal needed | 30 seconds in total. The countdown runs only while all four checks pass. |
| Longest attempt | 90 seconds. After that the capture stops and explains the check that failed most often. |
| Reading | The median heart rate over the last 20 seconds of good signal |
| Kept when | Estimates vary by 8 bpm or less (10th to 90th percentile) |

## Screen states and copy

| State | Phone | Desktop | Copy |
| --- | --- | --- | --- |
| Before | Sheet with three tips and Start | Same, centred | "Sit down and rest for a minute first." "Face a window or lamp." "Keep your face in the oval for about 30 seconds." "The video stays on this device. Only the number is saved." |
| Starting | Camera fills the screen, oval guide | Camera on the left, checks panel on the right | "Starting the camera" |
| Setting up | Oval outline white; check chips show which pass | Same, plus the fix in large type | The first failing fix, such as "Move closer" |
| Measuring | Oval outline turns teal; a progress ring fills around it; the pulse wave runs along the bottom | Pulse wave in the panel | "Hold still · 18 s" |
| Paused | Ring stops, oval turns white | Same | The fix, such as "Hold still" |
| Result | The number, his usual range, one sentence | Same | "64 bpm" · "About your usual (60 to 70)" |
| No reading | Reason and Try again | Same | "The light kept changing. Face a window or lamp and try again." |

## Spoken guidance (proposal)

Denver looks at the camera, not the screen. Short spoken cues, such as "Move closer", "Hold still" and "Done, 64 beats per minute", would let him follow along without reading.

- **Voices:** the browser's speech synthesis, using only voices marked as local to the device, so no text leaves the device. A browser with no local voice shows the toggle disabled.
- **Default:** off. A speaker toggle in the capture screen turns it on, and the choice is remembered on the device.
- **Pace:** one cue at a time, at most one every 3 seconds, so the speech does not chatter.

## Instructions for assistant text about readings (proposal)

The capture's own words are fixed copy and use no model. When the person asks the assistant about their readings, for example "Why is my pulse higher today?", the assistant answers under these instructions:

```
You help a person understand their own vital sign readings. Speak to them
as "you", in plain words, in at most four sentences.

Ground every statement in the readings and records in this context. Each
camera reading is a wellness estimate from a phone camera, with a quality
score from 0 to 1. Readings from records and from a cuff or scale are more
reliable than camera readings; say so when a camera reading disagrees with
them.

Compare a reading with the person's own usual range first. Name ordinary
causes that the context supports, such as a recent walk, caffeine, a new
medicine in the records, or a reading taken standing up.

Do not diagnose. Do not suggest starting, stopping or changing a medicine.
If the readings are repeatedly far outside the usual range and the person
reports a symptom such as dizziness, chest pain or shortness of breath,
tell them to contact their clinician, and for chest pain or fainting to
seek urgent care.
```

## What is measured about the capture itself (proposal)

These are counted for each attempt, with no video and no reading stored. They guide the tuning in T-09.

| Measure | Why |
| --- | --- |
| Seconds from Start to the first face | Camera and model load time |
| Seconds from the first face to measuring | How long setup takes |
| Time each check failed | Which instruction people need most |
| Outcome: saved, retaken or abandoned | Whether the flow works |
