# Interface style sweep

Request: [issue #114](https://github.com/reversely/stellis-health-dev/issues/114)

The owner requested consistent action colours across screens, a durable frontend-and-motion rule and restrained interaction motion. The dark-mode follow-up replaces beige actions with white pills and white glass surfaces. The owner clarified **80% opacity**.

## Changes

Primary actions share fill, text, hover, disabled and corner roles across Home, goals, Trends, records, documents, summaries, notebooks, chat, settings, recording, onboarding and authentication. Dark primary actions use white pills. Secondary goal controls, account surfaces, dropdowns and overlays use 80% opaque white with dark text. Overlays blur the content behind them. The writing canvas retains its dark surface.

Stop and End call use the wine danger role. Selected tabs and entity colours retain their separate roles. The frontend-and-motion skill now requires reuse of existing components and semantic colour roles, with checks in both themes. The project style guide records the dark-mode palette and motion choices.

Menus use 160ms entry, dialogs use matched 220ms entry and 180ms exit, and the call panel uses a 200ms entry. Primary pointer presses use scale 0.97 over 120ms. Keyboard interaction is immediate; reduced motion removes scale and travel. Broad page entrances and decorative onboarding loops were removed. Native picker transitions follow the browser’s supported top-layer approach described in [Chrome’s customizable-select guide](https://developer.chrome.com/blog/a-customizable-select).

The layout sweep also fixes a sticky notebook composer that covered the empty chat text on phones, plus small note-back and record-title link targets.

## Verification

- `tests/browser/style_sweep.mjs`: shared primary fills, text, corners and targets across 14 screens at 390px and 1280px in both themes; hover and disabled states; real onboarding navigation; white primary pills and 80% opaque account glass; phone composer separation; pointer, keyboard and reduced-motion dialog behaviour
- Authenticated call regression: greeting, connection loss, apology and retry pass at all six widths in both themes; panel layout checks pass
- Goals, Trends and vital-sign math: 34 tests passed
- Frontend-and-motion skill validation passed for the tracked skill and active local copy
- [Layout results](layout-audit.md): 14 routes at six widths in both themes; final results have no failures or warnings
- Visual checks include the camera dialog and open activity picker in both themes, Home, Trends, chat, authentication and onboarding

Dark glass text uses dark ink with at least 5.26:1 contrast for supporting text over the darkest 80% white composite; primary white pills use dark text.

No dependencies, external services or HTML insertion were added. Browser fixtures use isolated local data and do not download speech models or request provider replies. This validation does not measure live camera accuracy or provider voice quality.
