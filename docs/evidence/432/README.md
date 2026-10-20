# Persistent agent conversation workspace

Reference: PDF screen 5, with existing richer library rail, icons, avatars and Piazzolla 300 preserved. The HTML is an observation reference, not an implementation dependency.

Browser verification on GN100 uses the real local NemoClaw/OpenClaw runtime. Writing answers from the actual onboarding learning plan and cites its local page. The submitted turn appears immediately. Notebook scope and unsent text survive switching, reload and tabs; switching away during inference and back retains the next draft. Control+Enter submits. Home navigation restores the existing library node and returning to Chat retains the draft. Setup edits persist; Name a copy preselects the correct template and creates an independently stored agent with empty memory. A real stale-assignment API rejection retains the request and permits retry. The sidebar and thread use real account data. Screenshots include desktop and phone, both themes.

Seven-width layout checks cover 360, 390, 768, 1024, 1280, 1440 and 1920. The audit's overlap algorithm was corrected to intersect content rectangles with scroll-container clipping bounds; otherwise intentionally scrolled-out messages were incorrectly counted as overlapping the header. The supplied broken fixture still reports six failures at each of 360 and 1280; the clean fixture reports none. No thread subtree was excluded. Final summaries are alongside the screenshots.

Python: 322 passed, 25 subtests passed, one skipped. JavaScript: 148 passed using the shared cache with `--preserve-symlinks`.

This change does not complete automatic multi-agent mentions, reviewable draft artifacts, event-triggered agent execution, notebook activity or the full prototype. #437 and #438 preserve the artifact and management requirements. Existing voice-call controls are retained; this test does not claim live voice calling.
