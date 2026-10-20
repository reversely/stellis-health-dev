# Automatic Writing runs

Reference: screen 11 specifies Writing / Runs / New thread that needs a reply and review before saving to Gmail or sending. The new opt-in notebook mail rule implements this behavior with an explicit search and persisted enablement. Existing notebook agent management, memories and instructions are retained.

Evidence on GN100:
- Real Gmail API check completed through the UI with an empty, explicit verification search. Rule and enablement survive reload; notebook Off pauses work; disabling persists. Desktop/phone and both themes verified. Seven-width audits have zero failures and warnings.
- A bounded read and replay of one existing Gmail thread used the actual local model. It declined a reply; repeating the thread did not create another request. No provider writes occurred. Further bounded searches did not find a qualifying positive example; these are not claimed as successful draft runs.
- An explicitly supplied local verification message exercised the same production classification and preparation functions using actual local inference. It was classified as needing a reply and produced one 30-word local email artifact. This was sample input, not a received Gmail message. Automatic request attribution was checked. No external draft was created or sent.
- Unit checks cover grant/assignment requirements, Off, cancellation, account isolation, restart recovery, durable duplicate suppression, and skipping old/sent/bulk messages without starting provider or inference work.

No live newly-arriving positive Gmail message was used in verification. This does not claim a fresh inbound-mail end-to-end production event. Rule enablement is opt-in; no monitoring rule was enabled in the user's workspace. Monitoring runs while the account workspace process is active, not when the service is stopped.

Final regression checks: 343 Python tests and 25 subtests passed, 1 skipped; 148 JavaScript tests passed. Existing framework deprecation warnings remain. The final browser audit reports 0 failures and 0 warnings in each theme.
