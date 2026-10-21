---
name: frontend-and-motion
description: >-
  Gives the default motion, colour and surface choices for web UI as don't / use-instead pairs,
  plus a short workflow for prototyping several directions behind a picker. Use when building,
  styling, animating or prototyping any interface, or when choosing an easing, duration, colour,
  border, shadow or hover/press state.
---

# Frontend and motion

The project's own style guide and tokens win over every default here. On pages built with
light-enterprise-ui, its tokens and `references/motion.md` govern; colour roles and budgets come
from colour-theory. Write every fix in the project's existing styling system.

## Should it move

- Used 100+ times a day, or triggered from the keyboard (shortcuts, arrow keys, command menu):
  no animation.
- Occasional (menu, modal, drawer): standard motion below.
- Rare or first-run (onboarding, success): may be more elaborate.
- Motion must answer a question: where did this come from, did my input register, what
  changed. If it answers none, cut it.

## Motion defaults

| Don't | Use instead |
| --- | --- |
| `transition: all` | Name the properties: `transition: opacity 150ms, transform 150ms` |
| Animating `width`, `height`, `top`, `left`, `margin` | `transform` and `opacity`; grid-rows or clip for expansion |
| `ease-in` on UI, or built-in `ease` on a deliberate move | Arriving or leaving: `cubic-bezier(0.22, 1, 0.36, 1)`. Moving on screen: `cubic-bezier(0.645, 0.045, 0.355, 1)`. `linear` only for constant motion (spinners, progress as time) |
| Durations over 300ms in product UI | Hover/press 120–150ms; tooltip, dropdown 150–200ms; modal, drawer, toast 200–300ms; page-level 300–400ms. Exits about 20% faster than entries |
| Entering from `scale(0)` or from off-screen | `scale(0.96)` with `opacity: 0`, settling to 1; travel 16px at most |
| Popovers scaling from centre | `transform-origin` at the trigger |
| Bounce or elastic | No bounce. Gesture-driven motion (drag, swipe-to-dismiss) uses a spring: `{ type: "spring", duration: 0.5, bounce: 0 }` |
| `@keyframes` for open/close or toggles | CSS transitions, which reverse from the current position when interrupted |
| Overlay and panel with different timing | Identical duration and easing for parts that move together |
| Press feedback below `scale(0.95)` | `scale(0.97)` on `:active`, 120ms ease-out; skip it on dense, high-frequency controls |
| Hover motion on touch devices | Wrap hover styles in `@media (hover: hover) and (pointer: fine)` |
| Hover scale on cards that are not clickable | No hover response on non-interactive elements |
| Fade-up on every section as it scrolls in, in app UI | No scroll entrances in product UI. Webpages follow light-enterprise-ui's once-only entrance rule |
| Entrance animation on content already at rest on first paint | Animate only changes the user causes |
| Every tooltip in a row waiting out its delay | Delay the first; siblings open instantly while one is open |
| Colour transitions firing on a theme switch | Disable transitions for the swap, re-enable after two animation frames |
| Font weight change on hover or selection | Constant weight; signal state with colour or background |
| Looping animation running off-screen | Pause it with IntersectionObserver |
| `will-change` added by default | Only on a transform/opacity element that showed a first-frame hitch |

**Reduced motion.** Under `prefers-reduced-motion: reduce`, remove transforms, travel, scrubbing
and autoplay; keep opacity and colour fades; jump counters to their final value.

## Colour defaults

| Don't | Use instead |
| --- | --- |
| New hex, `rgb()` or `hsl()` literals | `oklch()` values behind semantic tokens (`--color-border-subtle`), never raw values in components |
| Indigo, violet or a purple-to-cyan gradient nobody chose | A hue derived from the product, brand or content |
| Several gradients per screen; gradient text | At most one gradient with a job; headlines in a solid colour that passes contrast |
| Dark background with neon glows | Default theme chosen for where the product is used; dark mode built from the same token scale |
| Pure `#808080` or untinted greys | Neutrals tinted toward the brand hue |
| Fixing contrast by raising saturation | Widen the lightness gap (oklch L) and leave C and H alone; verify with WCAG (4.5:1 body, 3:1 large text and UI) or APCA |
| One absolute chroma copied across hues | The same L per step and the same fraction of each hue's own chroma ceiling |
| Hand-picked darker hex for hover | `color-mix(in oklch, var(--color) 85%, black)` or a token step |
| `opacity: 0.4` for disabled | A dedicated disabled colour token |
| High chroma with no gamut check | Clamp C for sRGB; layer P3 chroma inside `@media (color-gamut: p3)` |
| Primary brand colour reused for success | A distinct confirmation colour |
| Colour as the only error signal | Colour plus icon plus message text |

## Surface defaults

| Don't | Use instead |
| --- | --- |
| Child radius copied from the parent | Inner radius = outer radius − padding |
| Solid border to show elevation | Layered translucent shadow; keep real borders for separation (dividers, table cells, inputs) |
| Light-mode shadows left on in dark mode | One 1px low-opacity light ring per elevation token |
| Border, shadow, ring and gradient on one card | One depth cue per surface |
| Fade overlay on scrollable content | No fade; for static content use `mask-image` |
| Glassmorphism over a flat background | Blur only over real content behind it (photo, video, layers) |
| Emoji or Unicode glyphs as icons | One icon set, one stroke width, or no icon |
| `z-index: 9999` | A z-index scale, or `isolation: isolate` for a local stacking context |
| `outline: none` | `:focus-visible` outline 2px in the accent token, `outline-offset: 2px`, 3:1 against its background |
| Inputs under 16px on phones | 16px input text on small viewports (stops iOS zoom) |
| Proportional digits in changing numbers | `font-variant-numeric: tabular-nums` |
| Hit areas smaller than the visual control allows | Pseudo-element expansion to 44px on touch controls; never let two hit areas overlap |

## Prototyping

Use when the user has not decided between directions, or after one round of "closer, but not
quite". If the user already knows what they want, build that one thing.

1. Scope one component or flow. Restate it in one sentence.
2. Build in an isolated route or a single HTML file that nothing in production imports, using the
   project's real fonts, tokens and components.
3. Make 3 variants (5 at most), each named for the axis it changes (layout, density, motion,
   interaction model). Two variants that differ only in colour or copy count as one.
4. Fill them with worst-case content: the longest real name, two-line titles, forty rows, the
   empty state. Every control works.
5. Show one variant at a time at full size, switched instantly by a fixed picker (buttons plus
   keys 1–N, choice kept in a `?v=` URL parameter).
6. Put every undecided number (duration, easing, radius, blur) on a slider that writes a CSS
   variable and shows its value, with a copy-config button.
7. Present a table of variant, axis, when it fits and what it costs, with a recommendation.
8. When the user picks, write the decision with the chosen values and the rejected options,
   integrate the winner, and delete the prototype route.
