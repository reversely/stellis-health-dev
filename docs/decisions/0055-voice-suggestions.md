# ADR 0055: Suggest known people by voice; show where each speaker name came from

Status: accepted for development, 2026-10-17 (#210). Revises the turn rule in [ADR 0009](0009-display-only-speaker-turns.md).

## Decisions from the repo owner

- A voice match is a suggestion. One click confirms it, and nothing is confirmed automatically.
- Speaker names have three looks:
  - **Grey:** filled in automatically, either "Speaker N" or a suggested person.
  - **Ink:** carried over from the user's label on another part of the transcript.
  - **Ink with a small filled check circle:** the passage the user labelled. The circle is plum `#4E4357` with a white tick in light mode, and `#fff8ff` with a plum tick in dark mode.

## Decision

- Each passage's TitaNet fingerprint is stored in `passage_voices`. The speech job writes it, and a `voice_index` job fills in older transcripts, shown on the card as "Indexing voices". Fingerprints stay on the device and are deleted with their conversation.
- A person's profile is the mean fingerprint of their confirmed passages in other conversations, with at least three passages. An unnamed speaker group in the current conversation gets a suggestion when its mean fingerprint has cosine similarity of at least 0.6 with one profile, and leads the next profile by at least 0.1. Each person is suggested for at most one group per conversation.
- `person_links.origin` records `manual` for the passage the user acted on and `propagated` for the passages a speaker-wide choice filled in. Older links have no record of which passage was clicked. A link confirmed alone is classified `manual`; links written together in one batch are classified `propagated`. A passage-scope speaker label counts as manual, and a speaker-wide label as propagated.
- Clicking a grey suggested name confirms that person for the whole speaker group, with the clicked passage marked manual.
- Back-to-back passages under the same name, within 1.5 seconds, now share one turn whether or not their assignment is uncertain. The name's colour shows whether it is automatic. Each passage keeps a separate speaker control.

## Calibration and open question

Fingerprints were indexed for all 14 saved conversations on a copy of the data, in 99 seconds. Each speaker group was compared with profiles built only from other conversations.

- **Jay Matlock** (confirmed only in CIFAR Aerospace Research Overview) scored at most 0.42 against any group elsewhere, so no suggestion names Jay Matlock outside that recording.
- **Before the relabel, the groups labelled Shereen Lee** scored low against the Shereen Lee profile from other recordings: 0.25 in Hackathon Project Planning and Ideation, 0.24 in "How it works". Meanwhile the unnamed "Speaker 2" in the Hackathon recording scored 0.60.

The repo owner confirmed on 2026-10-17 that the Hackathon "Shereen Lee" label was on the other person, and relabelled it in the app. With that fixed, each group labelled Shereen Lee scored 0.51 to 0.59 against the profile from the other recordings: 0.59 in Hackathon, 0.55 in "How it works", 0.51 in CIFAR. The other Hackathon person scored 0.24, and Jay Matlock's groups scored 0.02 to 0.08.

At 0.6 and 0.1, four unnamed groups get a Shereen Lee suggestion:

| Recording | Speaker | Talk time | Similarity |
| --- | --- | --- | --- |
| Part Number Analysis and Data Mapping | Speaker 4 | 2.4 min | 0.77 |
| 40k Inspection Parts and Span Time Analysis | Speaker 2 | 1.6 min | 0.74 |
| Service Center Capacity and Span Time Analysis | Speaker 2 | 3.2 min | 0.69 |
| Food, Technology, and Power Narratives | Speaker 2 | 4.8 min | 0.62 |

Two groups scored just under the threshold without a suggestion: "New recording" Speaker 1 (0.56) and DMS Data Cleaning and Upload Tasks Speaker 3 (0.55). The confirmed groups' 0.51 to 0.59 overlaps that range, so 0.6 can miss a true match. The threshold is revised when the repo owner confirms or rejects these six groups.

## Tradeoffs

A different microphone or room, short passages, and similar voices lower similarity. A suggestion is only shown and is never confirmed for the user, so a wrong suggestion costs a glance. Fingerprints are voice data and must not enter any hosted search or sync index.
