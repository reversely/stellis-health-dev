# Voice calls and recovery

Onboarding, general calls, daily check-ins and the guided tour use the same speech transport and completion handling. My Health offers Call Stellis and Daily check-in. The scheduled morning invitation remains available during its existing morning window.

## Reply recovery

The model stream finishes at its `[DONE]` marker. It releases pending text and tool calls immediately instead of waiting for the HTTP connection to close. Reply generation allows 20 seconds for the next speakable segment and 90 seconds overall. A timeout exposes Retry reply. Retry retains the person's accepted answer and replaces the failed agent reply.

Recognition and synthesis each have a 15-second deadline. Recognition runs in a background task with space for two queued answers so the socket can receive call controls. Hearing you indicates active detection. Done speaking flushes that answer manually. Unclear speech offers a repeat-or-type action. A recognition failure switches that call to text and stops microphone capture. A synthesis failure keeps the reply visible; a CPU synthesis timeout also switches to text because its native worker can still hold the shared engine lock. Other synthesis failures disable speech output for that call while preserving recognition.

Cancelling an async wait does not terminate native inference. The deadline protects the call interface; an engine worker may continue until its native operation returns. Timeout logs include elapsed time without adding transcript content.

## Completion

An explicit whole-message request such as “That's all” or “End the call” finishes intake and continuing calls deterministically. Health statements such as “I want to stop smoking” remain ordinary answers. The intake's final topic and the tour's last step also finish through the shared completion path.

The server marks the call as ending and stops accepting microphone interruptions. The browser stops capture and waits for every queued audio source to finish before emitting one completion event. A socket close during the goodbye preserves that queued audio. Text-only calls finish immediately and skip voice-engine acquisition.

Onboarding offers Add records after completion. The tour and daily check-in offer Go to My Health. Manual hang-up remains available. The server saves the script's end state on completion or disconnect. Concurrent socket and compatibility HTTP completion requests reuse one saved intake note.

## Tour narration

Every registered tour stage supplies its title and fixed narration alongside its target. Next waits for the page target and narration playback; the last stage offers Finish tour. Questions use the existing language-model route. Stage navigation uses the registered text.

Only registered public narration can reuse synthesized audio. The server stores validated mono WAV files in the account's `tour-audio` directory. Cache identity includes narration, speech backend, endpoint, voice and `STELLIS_TTS_CACHE_REVISION`. A miss uses the selected backend. Personal questions, answers and goals stay outside this cache. Changing the endpoint or voice creates a new identity; increment `STELLIS_TTS_CACHE_REVISION` after changing a model behind the same endpoint.

The tour panel uses the selected surface colour with a separate narration card. Its conversation region scrolls while call controls stay visible. The compact onboarding panel stays beside the notes on wide screens and above them on narrower screens.

## Validation

See [the verification record](evidence/118-120/README.md) for the synthetic call fixture, regression coverage and layout checks. The fixture verifies protocol behaviour and recovery; it does not measure recognition accuracy or generated voice quality.
