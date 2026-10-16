# Stellis UI style guide

Use this guide for new screens and when revising existing controls. It records the accepted interface decisions; the [contrast workspace experiment](contrast-workspace-experiment.md) keeps the reference observations and revision history. Inspect any new user supplied reference before changing the related screen, and record what the reference shows separately from design inference.

## Visual foundation

| Role | Color | Use |
| --- | --- | --- |
| Dark core | `#27222B` | Home rail edge, recording rail, auth backdrop |
| Light paper | `#F7F5F6` | Default writing canvas and light card surfaces |
| White | `#FFFFFF` | Inputs and the light theme auth card |
| Dark ink | `#2A252F` | Text on paper |
| Muted mauve | `#413A48` | Dark primary controls and the home rail highlight |
| Dark control | `#37303D` | Secondary controls on the rail |
| Teal | `#335C63` | Home rail focal color, waveform, and light theme focus |
| Wine | `#654654` | Recording Stop action |

Use the roles already defined in `src/stellis/static/theme.css` before adding a color. Check text and icon contrast in both themes. The dark core has a red undertone and is never pure black. Keep the light document surface flat. Dark mode uses a flat mauve document surface.

The **desktop home left rail** has one centered radial gradient, subtle grain, and slow vertical motion. Freeze that motion for reduced-motion preferences. Its transparent header is continuous with the rail, with no separate top bar or divider. The recording rail, buttons, cards, notebook, and auth screen use solid fills. At narrow widths the home layout has a solid top section because there is no left sidebar. Do not spread the gradient across controls or other pages.

## Type and shape

- Use the existing Piazzolla display face for the brand and major page headings; use Inter for controls, labels, and body text. Keep a clear size and weight difference between page title, section title, and supporting text.
- Do not place an eyebrow or overline above a heading. Avoid decorative taglines and explanations that do not help someone act.
- The conversation document is square and attaches cleanly to its notebook tabs. Primary tabs use the established outward curved file-tab silhouette, dark fill, light text, and a staggered selected state. Keep My Notes and Enhanced Notes quieter than the primary tabs.
- Use small corners for cards and controls: roughly 6px for cards and 8px for ordinary inputs and buttons. Do not apply a large radius to every surface.

## Controls and states

- Style every interactive element explicitly. A primary button has a filled surface, clear text, at least a 44px touch target, and a visible hover, keyboard focus, and disabled state. The auth submit button is 48px tall. A secondary button is visibly quieter but still reads as a control. Never leave a browser default button in a finished screen.
- Keep Record, Import, Pause, and Stop visually related within the solid recording rail. Use the wine fill for Stop. Do not give Record a competing bright accent.
- Label inputs directly. Use a semantic `button` with an explicit type when it sits in a form. Icon-only buttons need an accessible name. Errors appear close to the action and describe what the user can do next.
- Show live recording and transcription where the user is working; make interruption and recovery states explicit. Match the status text to the actual recording state.
- Use short, familiar UI labels. Do not use interpuncts or middle dots (`·`) anywhere in user-facing copy, including metadata. Never mention Otter in the product UI. Show an unnamed speaker as `Speaker N` with no appended prompt.

## Screen hierarchy

- **Home:** Keep library navigation and Record and Import in the left rail. Make the conversation list easy to scan. A live recording belongs in the list with a clear live state and current text when available.
- **Recording:** Keep capture actions and status in the dark rail; give the light notebook or transcript the wider reading area. Notes and Live transcript are the primary tabs.
- **Saved conversation:** Attach the primary file tabs to the square document. Keep transcript reading, seeking, notes, and related actions in predictable positions.
- **Authentication:** Use a centered paper card on the dark mauve backdrop. Make Sign in and Sign up clear, give the submit button the same deliberate shape and states as other primary actions, and support the light theme.

## Before merging a UI change

1. Inspect each named reference and relevant existing screen state. Recheck earlier feedback for the same workflow in [the reference ledger](otter-ui-reference.md) and [the contrast experiment](contrast-workspace-experiment.md).
2. Compare the rendered result in a browser at desktop and narrow widths, in both themes where available. Check the relevant default, hover, focus, disabled, loading, error, and alternate states. Check for horizontal overflow and page errors.
3. Verify behavior as well as appearance: tab changes, live updates, status transitions, and form submission where touched. Record observed results separately from inference and update this guide if an accepted design decision changes.
