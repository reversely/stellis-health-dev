# ADR 0044: Local sharing of selected transcript snippets

Status: accepted, 2026-10-16.

## Context

Otter's signed-in selected-text toolbar has exposed Share in the physical selection check. Its [sharing help](https://help.otter.ai/hc/en-us/articles/360048338793-Share-a-conversation) describes a Share submenu that can create a public snippet URL with the selected text, speaker, and playable audio; the page warns that a snippet URL cannot be restricted or revoked after creation. A later live programmatic selection exposed Highlight, Comment, and Add Image but not Share, so the current control's alternate permission or product state is unconfirmed. Stellis stores the original interview audio and transcript on the local device; it has no authenticated public media route or revocable sharing service.

## Decision

The browser selection toolbar includes Share after Copy. Its menu offers **Copy snippet** and **Download text**. Both build the same text locally from the exact current selected range: quoted words, effective speaker name, original word start time when valid timing still matches the displayed text (otherwise passage start), and a source URL labeled **Source on this device**. The URL uses the current origin and carries the source passage ID and original audio time. Opening it seeks to that selected time when the passage and time still agree; if the passage is absent, the time fallback remains available.

No transcript, audio, snippet, or access token is uploaded. Copy requires a successful browser clipboard write; on denial, the menu stays open and offers Download text. Download creates a local text Blob and revokes its object URL. Edited or reprocessed transcript text is read from the current display on each selection, so a new snippet never silently reuses an earlier quote. The UI does not create a public or externally reachable link. Remote sharing requires a separate permission, revocation, and encrypted-media design.

## Verification

Chromium copied a real-interview selected word with Jay Matlock, its measured 5.32-second source time, and a device-local URL. A 390-pixel viewport had no horizontal overflow. In an isolated fixture, clipboard denial kept the menu and Download text produced the expected quote, speaker, source URL, and exact 500-ms time. After a transcript edit and reload, a fresh selection exported the edited word. Opening the 500-ms source link sought the player to 0.5 seconds. No real-interview content was sent to a remote share service.
