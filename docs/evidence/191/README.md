# #191 citation navigation and legibility

The app invoked route() twice at startup, allowing competing conversation loads to reselect tabs. It now starts once, after widget initialization. Source navigation clears an old highlights-only filter and does not auto-start an unrelated summary. Existing segment/timestamp bounds checks remain unchanged.

A real local Whisper transcript of the public JFK fixture supplied the passages. Browser checks at 1440px and 390px covered direct ?at= links, an out-of-range t clamped to the cited passage, search-result links, no existing summary, a real locally generated Nemotron summary and its Sources buttons, and a valid timestamp-only link. The transcript stayed selected after settling. Exactly one initial conversation request occurred. No provider or transcript API was mocked.

A separate fresh-account live recording used real PipeWire/Chromium capture, Rust Parakeet and a NemoClaw-managed local reply. The visible inline citation and timestamp control each opened the live transcript at desktop/phone widths in both themes. Live passage focus follows the citation, links inherit readable foreground colour, timestamp controls are at least 44px, and focus remains visible. Phone inspection found an empty workspace minimum-height above AI Chat; that hidden-panel space is removed when Chat is open.

158 JavaScript tests passed. Screenshots and runtime metadata record actual outputs; provisional ASR is not claimed to be verbatim. This changes citation navigation and presentation without loosening source validation.

A final inspection caught the tab's foreground/background transition passing through a low-contrast midpoint during source navigation. Per Emil's guidance for frequent tab/keyboard actions, tabs now switch immediately. A focused browser check verified zero transition duration on desktop/phone in both themes; screenshots are under tabs/.
