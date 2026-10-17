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

The **desktop home left rail** is a WebGL fill (`static/rail-shader.js`) of five soft blobs in the user's palette `#495575`, `#56465C`, `#594F4F`, `#547980`, and `#45ADA8` over the dark core. The bright teal blob is smaller than the others. The blobs drift slowly, travel about a quarter of the rail, and lean only slightly toward the pointer. `--rail-blur` on `#rail-shader` sets edge softness from 0 to 1; the default is 0.55 so neighbouring colours blend. Static grain sits in the shader and in an SVG overlay at 30% opacity with an overlay blend. Reduced-motion preferences get one still frame. Without WebGL the rail falls back to the centered radial gradient. Its transparent header is continuous with the rail, with no separate top bar or divider. The recording rail, buttons, cards, notebook, and auth screen use solid fills. Do not spread the gradient across controls or other pages.

## Type and shape

- Use the existing Piazzolla display face for the brand and major page headings; use Inter for controls, labels, and body text. Keep a clear size and weight difference between page title, section title, and supporting text.
- Do not place an eyebrow or overline above a heading. Avoid decorative taglines and explanations that do not help someone act.
- The conversation document is square and attaches cleanly to its notebook tabs. Primary tabs use the established outward curved file-tab silhouette, dark fill, light text, and a staggered selected state. Keep My Notes and Enhanced Notes quieter than the primary tabs.
- Use small corners for cards and controls: roughly 6px for cards and 8px for ordinary inputs and buttons. Do not apply a large radius to every surface.

## Controls and states

- Style every interactive element explicitly. A primary button has a filled surface, clear text, at least a 44px touch target, and a visible hover, keyboard focus, and disabled state. The auth submit button is 48px tall. A secondary button is visibly quieter but still reads as a control. Never leave a browser default button in a finished screen.
- An **inverted** control fills with the theme's text colour and draws its glyph in the colour of the surface behind it, in both themes; it is not a flat accent fill. Summary regenerate is a 44px inverted icon button with no text button beside it.
- The theme switch is a bare 44px sun or moon icon in the header with no border, fill, or text. Take new UI icons from Tabler Icons (MIT, outline, 2px stroke) and record each in `static/icons.NOTICES.txt`.
- Keep Record, Import, Pause, and Stop visually related within the solid recording rail. Use the wine fill for Stop. Do not give Record a competing bright accent.
- Label inputs directly. Use a semantic `button` with an explicit type when it sits in a form. Icon-only buttons need an accessible name. Errors appear close to the action and describe what the user can do next.
- Show live recording and transcription where the user is working; make interruption and recovery states explicit. Match the status text to the actual recording state.
- Use short, familiar UI labels. Do not use interpuncts or middle dots (`·`) anywhere in user-facing copy, including metadata. Never mention Otter in the product UI. Show an unnamed speaker as `Speaker N` with no appended prompt.

## Screen hierarchy

- **Home:** The left rail holds **Recent conversations** newest first by capture time, then **Account settings** pinned at its foot as a light glass button with a gear. Each rail row shows a notebook colour dot and the full title, then the short date leading the first Summary topic. Titles, topics, meeting names, and progress points on Home wrap in full; they never end in an ellipsis. The main column starts with a rounded search field and the inverted **Import** and **Record** buttons, then **Coming up** when a calendar is connected, then **Notebooks**. A notebook card fills with its own palette colour and shows a notebook icon, the name, a + button, the newest meeting, up to three progress points with check icons, and up to three older meetings. Keep the cards visual and short: icons, colour, and space carry the structure rather than labels. At narrow widths the main column comes first and the recent list follows on a solid dark band. A live recording keeps its card with a clear live state and current text when available. A rail row drags onto a category card to add that category, or onto a notebook card to move the conversation into that notebook; a conversation has many categories and one notebook. The card under the pointer takes a dashed outline in the text colour, and a status line names where the conversation went. More options keeps Categories and Move to notebook for keyboard and touch.
- **Account settings and notebook pages:** Settings groups Profile, Sign-in, Custom vocabulary, Integrations, and Delete account, each under an icon tile. Primary actions are inverted buttons; Delete account uses the wine fill. A notebook page opens with a hero band in the notebook's colour and icon actions to add, edit, and delete.
- **Recording:** Keep capture actions and status in the dark rail; give the light notebook or transcript the wider reading area. Notes and Live transcript are the primary tabs.
- **Saved conversation:** Attach the primary file tabs to the square document. Keep transcript reading, seeking, notes, and related actions in predictable positions.
- **Authentication:** Use a centered paper card on the dark mauve backdrop. Make Sign in and Sign up clear, give the submit button the same deliberate shape and states as other primary actions, and support the light theme.

## Before merging a UI change

1. Inspect each named reference and relevant existing screen state. Recheck earlier feedback for the same workflow in [the reference ledger](otter-ui-reference.md) and [the contrast experiment](contrast-workspace-experiment.md).
2. Compare the rendered result in a browser at desktop and narrow widths, in both themes where available. Check the relevant default, hover, focus, disabled, loading, error, and alternate states. Check for horizontal overflow and page errors.
3. Verify behavior as well as appearance: tab changes, live updates, status transitions, and form submission where touched. Record observed results separately from inference and update this guide if an accepted design decision changes.
