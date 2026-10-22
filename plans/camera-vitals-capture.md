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
| Show progress, then advise | Progress steps (Camera on, Face found, Measuring) show that the capture started and how far it is. Measuring pauses only when the face is lost. Distance, light and movement lower the quality and show advice after 3 seconds, in smaller type under the status line. |
| Advice, not orders | Advice says what helps ("More light on your face gives a better reading"). The voice speaks progress and the result, never instructions. |
| No jumping numbers | The live screen shows the pulse wave, which reassures without inviting reaction. The number appears once, at the end. |
| Compare with himself | The result compares the reading with his usual range from Trends, not with population norms. |
| A wellness trend, not a diagnosis | The result never says "normal" or "abnormal". A reading far from his usual range asks for a retake first. Repeated readings far from it, together with a symptom he reports, lead to the S-01 advice to contact his clinician. |

## Checks

Each check runs on every vitals event, 20 to 30 times a second. The values are first settings to tune in T-09.

| Check | How it is measured | Effect | Advice shown after 3 seconds |
| --- | --- | --- | --- |
| Face found | vitallens face box | Measuring pauses while no face is found | None; the status reads "Looking for your face" |
| Signal | vitallens waveform samples arriving within 3 seconds | Measuring pauses | None; the status reads "Finding your pulse" |
| Face position | Box centre within 15% of the frame from the oval's centre; box height 20% to 85% of the frame height | Quality only | "Keeping your face in the oval gives a better reading", "Sitting a little closer gives a better reading", "Sitting a little farther back gives a better reading" |
| Light | Mean face brightness from a 48 by 48 pixel sample every 400 ms: 70 to 215 of 255, and no more than 45 below the whole frame | Quality only | "More light on your face gives a better reading", "Facing the light gives a better reading", "Softer light gives a better reading" |
| Stillness | Face centre movement under 6% of the frame over the last second | Quality only | "Staying still gives a better reading" |

## Reading and timing

| Rule | Value |
| --- | --- |
| Good signal needed | 30 seconds with a face and a signal |
| Reading | The strongest rhythm between 40 and 180 bpm in the last 20 seconds of waveform, found with a Fourier transform that uses each sample's own time. The frame rate varies (about 26 samples a second against a reported 30 in testing), so a fixed rate overstates the pulse. |
| Quality | The share of waveform power within 6 bpm of the peak |
| Sure reading | Share of 0.3 or more. Below that, measuring runs up to 15 seconds longer, then gives the reading with "Measure again sitting still for a closer reading". |
| Longest attempt | 90 seconds. 15 seconds or more of good signal still gives a reading. Less gives "No reading yet" with advice for the face or the light. |

## Screen states and copy

| State | Status line | Progress steps |
| --- | --- | --- |
| Before | Tips: "Rest for a minute before you start", "Sit facing a window or lamp", "Hold still for about 30 seconds", "The video stays on this device". Note: "A home estimate for following your trends". | None |
| Camera starting | "Turning on the camera", with "Choose Allow if your browser asks" under it | Camera on is current |
| Loading | "Getting ready" | Camera on is current |
| No face | "Looking for your face" | Face found is current |
| Measuring | "About 18 seconds left", then "Almost done"; the ring fills | Measuring is current |
| Result | "Your pulse", the number, "Within your usual range of 60 to 70" | None |
| No reading | "No reading yet" and one line of advice | None |
| Start failure | "No reading yet", "Try again in Chrome or Safari", and a small details line with the technical reason for bug reports | None |

## Spoken guidance and captions

Denver looks at the camera, not the screen. The voice speaks three cues: "Turning on the camera", "Measuring your pulse" and "Your pulse is 64 beats per minute".

- **Voices:** the browser's speech synthesis, using only voices marked as local to the device, so no text leaves the device. A browser with no local voice shows the Voice toggle disabled. Chrome lists its voices after the page first asks, so the toggle repaints when the list arrives.
- **Default:** on. The Voice toggle turns it off, and the choice is remembered on the device.
- **First cue:** "Turning on the camera" plays inside the Start tap, because Safari speaks only after a tap.
- **Captions:** on desktop, each cue also appears as a caption at the bottom of the video, next to the camera he is looking at. Captions show even with the voice off. Phones show no caption, because the status line sits directly under the video.

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

## Testing on the deployment

The capture needs HTTPS, which Fly provides. Before a test session:

1. Deploy main with `fly deploy -a stellis-health`.
2. On a phone and a laptop, open Trends, choose Measure with camera, and allow the camera.
3. Check that the voice speaks "Starting the camera" and then one cue at a time, and that desktop shows the same cue as a caption.
4. Compare the reading with a pulse oximeter or a cuff taken at the same time, and note the device, browser, lighting and the difference in bpm.

Verified in this repo's Docker image, with Chromium and a recorded sample video as the camera: the capture read 75 bpm (ECG 75 to 87), saved a camera reading, and made no requests outside the app. Not yet verified: Safari on iPhone, Firefox, low-end Android phones, and real voices (headless Chromium has none).
