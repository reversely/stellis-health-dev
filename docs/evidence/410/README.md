# Agent template verification

Reference: `assets/Stellis UI wireframes.pdf`, pages 7–11, inspected directly; decision ledger and ADR 0063 retain the distinction between observed mockup behavior and implementation decisions. Existing Chat surfaces, icons and avatars are retained.

- Real local GN100 inference: browser-created Tutor followed custom instructions (Calibration prefix), gave one learning step, asked a follow-up and cited the notebook's 17 psi source. See `real-runtime.json`.
- Browser: create named template copy; memory write and reload; off/on persisted and disabled request rejected before inference; rename projected into the list; notebook removal and reassignment survived reload; keyboard disclosure and focus restoration; narrow creation form; reduced-motion environment; desktop and phone in both themes. See screenshots and `browser.json`.
- Layout audit: zero failures across seven widths in both passes. Existing 20px-high Home back link remains a phone tap-target warning. No new geometry failures. Audit screenshots are temporary; reports are retained.
- Full Python suite: 305 passed, 1 skipped, 25 subtests. JavaScript: 159 passed. Final guard tests: 22 passed. Existing account endpoint returns 404 in the isolated open-auth browser test; no uncaught page errors occurred.

This proves template instructions and management, not screen observation. The screen-sharing tutor is the next implementation slice. Catalog entries truthfully say When you ask; scheduling and slide generation are not advertised as working.
