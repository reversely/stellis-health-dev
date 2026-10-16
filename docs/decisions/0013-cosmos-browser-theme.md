# ADR 0013: Local cosmos theme for the browser workspace

Status: accepted, 2026-10-16. Ticket: #23.

## Decision

The browser workspace starts in a dark night-sky theme. A header control switches to a light theme and stores that choice in browser `localStorage`. An inline script reads the choice before the stylesheets render to avoid a light-to-dark flash. Both palettes use shared semantic CSS tokens in `theme.css`; the existing layout and interaction stylesheet loads first.

Inter is the body and control font. Piazzolla is reserved for the brand and major headings so dense transcripts, timestamps, and buttons remain easy to scan. Both WOFF2 files and their Open Font License notices are copied from the local Penguin dashboard into the Stellis static tree and served by the device service. The browser makes no request to Penguin or Granola. Granola's calm note hierarchy informed spacing and typography, while the recording controls and transcript mechanics remain Stellis controls.

The dark background uses low-contrast radial light and four fixed decorative points. Surface, text, accent, status, selection, and focus colors use tokens so the light theme and future clients can map the same roles. `prefers-reduced-motion` removes transitions and animated scroll behavior. The browser's native audio control keeps its own operating-system styling inside a themed player surface.

## Why this choice

Local font assets work while offline and do not send usage data to a font host. A small additive stylesheet keeps the current browser product available during the native Flutter work. A persisted light option supports readers who prefer it without changing the dark default. Static HTML/CSS/JavaScript requires no new build pipeline.

## Verification

Chromium screenshots at 1440 and 390 pixels covered home, transcript, Edited Transcript, AI, and light mobile states. Browser checks covered import and record entry, vocabulary, transcript editing, speaker editor, summary and question view, seeking, theme persistence, reduced motion, local-only resource origins, and no mobile horizontal overflow. Measured contrast ratios for dark body, muted, quiet, accent button, and warning text on their surfaces are 15.93, 9.15, 6.97, 9.94, and 9.20 respectively; light body, muted, quiet, and accent button are 16.37, 6.89, 5.25, and 7.59.

## Boundaries

This design applies to the browser client. Flutter will need its own theme implementation based on the same semantic roles. Native audio controls vary by browser and operating system.
