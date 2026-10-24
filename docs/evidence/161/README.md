# Demo scene dock

Issue: [#161](https://github.com/reversely/stellis-health-dev/issues/161). Date: 2026-10-24. Reference: [demo scene dock](../../refs/stellis-demo/demo-scene-dock.png).

## Change

- `story.json` gains `scenes`: Report, Trace, Check-in and Levels from the Maya v2 script, each with a date, title, description, tags, a target described as data and a focus selector.
- `maya-scenes.js`: in the demo workspace only, a bottom dock (back, numbered scene buttons, next; arrow keys move between scenes) and a scene card with inverted ink and a *Hide* button. Choosing a scene resolves its target against the live demo (a corpus document, a notebook by name and tab, or My Health), opens the real view and highlights the focus element. Missing targets say what to do (*Import Maya's 2026 records first*, *Add the Blood Health notebook in Maya's story first*).
- The card is a colour block: dark with light text on light pages, light with dark text on dark pages.

## Evidence

- `tests/browser/maya_scenes.mjs`: no dock outside the demo; button labels, card title and tags taken from `story.json`; the first button current and Previous disabled; guidance for unimported records; the Check-in scene opening My Health; arrow keys moving focus and the current scene; the Levels scene giving guidance until the notebook exists and then opening its Brief tab; Hide and reshow; the dark phone layout within bounds without overflow; an extra scene added to the data (by intercepting `story.json`) adding a button; leaving the demo removing the dock.
- `pytest`: 709 passed, 2 skipped; all JS unit tests pass.
