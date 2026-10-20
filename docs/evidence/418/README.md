# #418 recording input verification

PDF page 6 was inspected directly: microphone and Speakers selectors are grouped with transport, with Saving to / Change below. This slice implements the microphone path. System audio honestly displays Not captured while #344 and #396 remain open. The missing notebook destination control is tracked separately as #419.

Two temporary PipeWire loopback source nodes on GN100 exposed actual named input devices to full Chromium. A generated tone played through the real audio server. No fake-media-device flag, overridden getUserMedia, or provider double was used. The headless-shell browser returned NotSupportedError; retrying with the installed full Chromium successfully captured both devices.

Browser checks proved selection before start, switching while recording on the same session and MediaRecorder track, switching while paused, resume, failure to select a nonexistent device while retaining capture, Stop/finalize, and remembered selection after reload. A Web Audio analyser measured a nonzero peak, and ffmpeg decoded the finalized saved audio to non-silent PCM. Browser errors: none.

Desktop and phone screenshots were inspected in both themes. The initial direct-grid placement was visually wrong and corrected by grouping controls inside the existing recording rail. Seven-width audits in both themes now report zero failures and warnings, including a corrected phone back-button target. Existing icons, waveform, Notes/Live transcript and AI Chat remain intact. No gratuitous picker animation was added, following Emil's keyboard/rapid-control guidance.

158 JavaScript regression tests passed. Real device switching was tested on Linux virtual audio devices; physical macOS and Windows hardware and native system-audio identity remain unverified, so this does not close #396 or #344.

An actual denied Chromium microphone permission also produced the visible access-denied state and created no recording session; permission was set through the browser permission controller, not by replacing media APIs.
