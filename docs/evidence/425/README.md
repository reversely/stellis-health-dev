# Typography consistency (#425)

Reference: wireframe page 12 type board, previously inspected for #397. This change preserves the existing Piazzolla 400 selection; it does not resolve the open weight choice.

Actual Chromium on GN100: fresh isolated account, recording screen at 1440 and 390 px in light and dark themes. Entered Learning Onshape, switched the live transcript tab and phone chat panel. Screenshots show the consistent title face. Browser confirmed loaded fonts, Piazzolla 400 at both widths, no horizontal overflow, no JavaScript errors, and immediate legible tab states. The short Suggested status rule is upright; user-authored italics and its toolbar control are unchanged.

This CSS-only change uses focused browser checks; no new model calls or backend tests were needed.
