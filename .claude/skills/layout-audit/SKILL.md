---
name: layout-audit
description: >-
  Reviews UI changes and audits running pages for layout defects at every width: a ranked review
  of interaction, accessibility, stability and motion, plus a bundled Playwright script that
  reports overflow, clipped text, overlaps, off-centre containers, small tap targets and small
  phone text with a screenshot per width. Use to review a UI diff, PR or agent-built screen, as
  the gate before landing a UI ticket, or when a screen breaks on a phone, tablet or wide monitor.
---

# UI review and layout audit

## Review

Read the whole diff, run the audit below, then judge in this order; the order is the triage
order, so a broken interaction outranks a soft shadow:

1. **Interaction:** every control works with mouse, keyboard and touch. Tab reaches it,
   Enter/Space activates it, Escape closes overlays, focus returns to the trigger.
2. **Accessibility floor:** visible focus, labelled icon buttons, inputs with labels, contrast
   in both themes, reduced motion honoured, nothing reachable only by hover.
3. **Layout:** zero `fail` findings from the audit at every width; no shift from async content,
   ticking numbers or hover weight changes.
4. **Motion, colour and surfaces:** checked against the frontend-and-motion tables.
5. **Hierarchy and type:** one primary action per view, sizes from the scale, capped measure.

Flag on sight, without deliberating: `transition: all`; animating width, height, top, left or
margin; `ease-in` on UI; animation on keyboard or 100+/day actions; an icon button with no
accessible name; `outline: none` with no replacement; hover-only access to an action; inputs
under 16px on phones; `z-index: 9999`; font weight changing on hover; no reduced-motion path on
anything that moves.

Report in this shape, most severe first:

- **Verdict:** Blocked (an interaction or accessibility-floor failure), Approve with changes, or
  Ship it.
- **Blocking**, **Should fix**, **Nits:** each finding gives what is wrong, `file:line` or the
  audit's element and position, why it matters, and the fix with the exact value
  ("`500ms ease-in-out` on the drawer; use 250ms `cubic-bezier(0.22, 1, 0.36, 1)`").

When nothing is wrong, say Ship it. Never add nits to look thorough.

## Layout audit

### Run

```
node ~/.claude/skills/layout-audit/scripts/layout-audit.mjs <url> [<url> ...] \
  [--widths 360,768,1024,1280,1920] [--center "<selector>"] [--ignore "<selector>"] \
  [--wait "<selector>"] [--settle 500] [--dark] [--out <dir>]
```

- The app must already be running; the skill does not start it. The project's own run instructions
  or the `run` skill start it.
- Default widths: 360, 768, 1024, 1280, 1920. Add 390 or 1440 when the project names them.
- `--center` marks containers that must sit centred in their parent. Elements carrying
  `data-audit-center` in the markup are checked without a flag.
- `--ignore` excludes a subtree from every check: a third-party widget, a canvas the page cannot
  control, a dev-only toolbar.
- `--wait` blocks until a selector exists, for pages that render after data arrives.
- `--dark` repeats the run with the dark colour scheme. Run both when the project supports both.
- `--out` defaults to `layout-audit/` in the current directory. Point it at the project's progress
  directory when the screenshots should stay with the ticket, and keep the directory out of git.
- Exit code 1 means at least one `fail` finding; warnings never fail the run.

### Checks and levels

| Check | Level | Meaning |
| --- | --- | --- |
| page-overflow-x | fail | The document scrolls sideways at this width. |
| element-outside-viewport | fail | A visible element extends past the left or right edge with no clipping ancestor. |
| text-clipped-x | fail | Nowrap text under overflow hidden without an ellipsis loses characters. |
| text-clipped-y | warn | Text under overflow hidden loses lines and no line clamp is declared. |
| text-escapes-box | fail | An unbroken string is wider than its container and no wrap rule breaks it. |
| overlap | fail | Two text or interactive elements share more than 10% of the smaller one's area. |
| overlap | warn | Same, where one side is a positioned overlay with a z-index, such as a menu or toast. |
| off-centre | fail | A flagged container's horizontal centre is more than 1px from its parent's centre. |
| tap-target | warn | Under 768px, an interactive element is smaller than 24 by 24 CSS pixels. |
| small-text | warn | Under 768px, a text element runs under 12px. |
| load | fail | The page did not load or the wait selector never appeared. |

Every finding names the element by tag, id, first classes, and its visible text, plus its position
and size in page pixels, so the fix starts at the element rather than at the screenshot.

### Procedure

1. Start the app and confirm the URL responds.
2. Run the audit on every route the change touches, at the default widths, light and dark when the
   project has both.
3. Open each screenshot and read it against the findings. The script measures geometry; a reviewer
   still judges hierarchy, alignment between siblings, and whether a wrapped row still reads.
4. Fix each `fail` in the source, re-run, and keep the run at zero fails before the change merges.
   A `warn` needs a stated reason in the commit body or the ticket if it stays.
5. Record the final `report.md` path in the ticket or the worklog.

### Reading a finding

- page-overflow-x almost always traces to one `element-outside-viewport` finding in the same run: a
  fixed width, an unwrapped flex row, a wide table without an `overflow-x: auto` wrapper, or an
  image without `max-width: 100%`.
- text-escapes-box comes from a URL, a hash, or a file name inside prose. Set `overflow-wrap:
  anywhere` on that element, not on `body`.
- An overlap between two absolutely positioned children at one width only means the parent shrank
  under them; switch the children to flow or grid layout.
- off-centre by half the viewport means the element measures against the wrong container. Check
  which ancestor is its offset parent.
- An overlap at `warn` between a dropdown and the content beneath it is the intended state when the
  dropdown is open; add `--ignore` for that overlay or capture the page with it closed.

### Self-test

`tests/broken.html` plants one instance of each fail-level defect plus one tap-target warning, and
`tests/clean.html` has none. After editing the script, run both:

```
cd ~/.claude/skills/layout-audit
node scripts/layout-audit.mjs "file://$PWD/tests/broken.html" --widths 360,1280 --out /tmp/la-broken
node scripts/layout-audit.mjs "file://$PWD/tests/clean.html" --widths 360,1280 --out /tmp/la-clean
```

The first exits 1 with six fails per width; the second exits 0 with none.

### Setup

The script depends on `playwright-core` (installed in this skill directory by `npm install`) and a
Chrome or Chromium binary. It looks in `--browser`, `LAYOUT_AUDIT_BROWSER`, `/Applications/Google
Chrome.app`, then Playwright's own browser cache.