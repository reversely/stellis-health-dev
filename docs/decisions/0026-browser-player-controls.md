# ADR 0026: Browser player transport and transcript seek timeline

Status: accepted for the development browser workflow, 2026-10-16.

## Context

The observed Otter interview keeps a compact player fixed below the transcript. It exposes a segmented seek bar, five-second back/forward buttons, Play/Pause, elapsed/total time, and a speed menu from 0.5x through 3x. A timed-word click sought to its word start; the focused seek slider advanced ten seconds on ArrowRight. Stellis already used a native `<audio>` element and HTTP byte-range media route, but browser-native controls varied by platform and hid speed and timeline structure.

## Decision

Keep the HTML audio element as the sole playback engine and byte-range client. Replace only its visible controls with an accessible range slider and compact transport. The browser draws speech intervals from the effective transcript as display-only marks; they do not change the recording, timing, or stored transcript. Slider pointer input seeks continuously; ArrowLeft/ArrowRight move ten seconds; transport buttons move five seconds. The speed menu uses the native `playbackRate` property. Word and passage clicks still seek the same audio element, so transcript follow-along and source links share one clock. Metadata and time events update labels, ARIA value text, and the active transcript word.

## Limits

Speech interval marks reflect current transcript boundaries, not waveform amplitude or verified silence. A segment can be inaccurate or unresolved. Skip Silence shown in Otter's playback menu is not implemented; it would require a measured silence map and explicit seek policy. The backend media and range routes stay unchanged.
