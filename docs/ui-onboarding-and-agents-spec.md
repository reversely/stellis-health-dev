# Interface spec: onboarding, agents on Home, agent settings

Status: draft for tickets, 2026-10-20. Every requirement cites an ID from the [decision ledger](ui-wireframe-decisions.md). A requirement with no ledger ID is not in this spec; it goes to the open questions in that ledger. Wireframe details listed in the ledger's section 3 are not requirements.

The owner’s later 2026-10-20 instructions supersede P1: fully local inference on GN100 is now adopted for this workflow, alongside the separate cloud deployment. Build functioning agent templates and the tutor before completing PDF-aligned onboarding. Use real fresh-account setup and local inference for acceptance. See the current direction in the decision ledger and ADR 0063.

## Shipped pieces the slices reuse

| Need | Shipped | Where |
| --- | --- | --- |
| Agents with notebook assignments and the steward flag | `GET /api/v1/agents` returns each agent with `notebooks` (`notebook_id`, `notebook_name`, `is_steward`) and `is_default` | `src/stellis/agents.py`, `server.py` |
| Notebooks and collections | `GET /api/v1/notebooks`, `GET /api/v1/collections` | `server.py` |
| Google mail and calendar | `GET /api/v1/calendar/google/authorize`; the grant includes the Gmail compose scope | `src/stellis/calendar.py` |
| Keys | `GET/PUT/DELETE /api/v1/settings/nebius-key` and `/settings/tavily-key` | `server.py` |
| First-run tour | `static/tour.js`, eight steps, progress in localStorage | Style guide, First-run tour |
| Home rail and widgets | `static/index.html`, `static/app.js`, Edit widgets dialog | Style guide, Home |
| Chat | `/chat`, `static/agent-chat.js` | ADR 0060 |

## Slice 1: pixel avatars for agents (#387)

Ledger: A7, A13, P6.

- Each agent gets a generated pixel avatar: a 7 by 7 mirrored sprite seeded from the agent ID, drawn as one SVG path (A7).
- A coordinator draws a white sprite on a filled disc in its colour; an acting agent draws a coloured sprite on a white disc with a hairline ring (A7). Coordinators are the default agent and any agent that stewards a notebook (`is_default`, `is_steward`); every other agent is acting.
- One shared module draws the avatar everywhere an agent appears: the Chat list and thread, suggestion cards, and the recording AI Chat panel.
- Acceptance: the same agent shows the same avatar on every surface and after reload; coordinator and acting styles match A7 in both themes; the avatar has no text alternative of its own when the name sits beside it.
- Style guide: replace the suggestion card's "24px round avatar" wording with the avatar rule.

## Slice 2: v2 logo mark (#388)

Ledger: C4.

- The mark from `assets/stellis_logo_v2.png` sits beside the wordmark in the header, the Home rail and the sign-in card.
- One colour only: white at 80% opacity on the dark rail and backdrops, dark ink on light surfaces. No italic logo.
- Acceptance: the mark is crisp at 1x and 2x, has empty alt text beside the wordmark, and keeps contrast in both themes.

## Slice 3: agents at the top of Home, grouped by collection (#389)

Ledger: A5, A15, H1, P6.

- A row at the top of Home shows the user's agents with their avatars (H1). Choosing one opens its Chat thread (H1, ADR 0060).
- The row is grouped by collection, then notebooks outside a collection (A15). An agent with several notebooks appears under each of their collections. Agents with no notebook form their own group.
- A steward is labelled Steward under its notebook's name (P6).
- The row is a Home widget that Edit widgets can hide (H1).
- Acceptance: grouping follows `GET /agents` and `GET /notebooks`; the row wraps without horizontal scroll at 390px; keyboard focus reaches each avatar; hiding it persists per browser like other widgets.

## Slice 4: agent settings as a view in Chat (#390)

Ledger: P3, A13, A14, A16, A5.

- Chat gets a settings view listing every agent grouped by collection and notebook (P3, A5). It is reached from Chat, not from the rail or Account settings (P3, A16).
- Each agent's entry shows what it does before the user turns it on or opens it (A13), and whether it returns an artifact or runs on a schedule (A14). The view shows only fields the API already holds: name, role, instructions, notebooks and steward flag, and memories. New fields need slice 8.
- Rename uses `PATCH /agents/{id}` (A2). Assigning and removing a notebook uses the existing notebook routes.
- Acceptance: every agent from `GET /agents` appears once per group it belongs to; rename and assignment changes show without a reload; the view works at 390px.

## Slice 5: first-run onboarding before the app (#391)

Ledger: O1, O2, O6 to O13, O17 to O20, C1 to C3, C6.

- **Screen 1, welcome:** the owner's welcome text (O19), the logo, and Get started. Floating icons and agent avatars cover the promise, with no card backdrops (O20). No Library rail (O9).
- **Screen 2, uses and connections** (O8): a multiselect of uses with icons (O7). Tiles carry plain names with no vague tokens (O11); the mail tile is Emails (O12); a learning tile stands for the tutor use (A11). Beside it, connections: Google for mail and calendar (O1) through the shipped authorize route, and key fields for Tavily and Nebius Token Factory (O13) through the shipped key routes. No "optional" labels (O10). No Library rail (O9).
- Copy follows C1 to C3: highway-sign labels, no emojis, a playful but professional tone after the welcome (O17).
- Onboarding runs once after the first sign-up and leads into slice 7 when it ships; until then it leads to Home.
- Acceptance: a new account sees both screens before Home; a returning account never does; connecting Google and saving keys show the server's own success or error text; every step works with the keyboard and at 390px; skipping a connection leaves recording and search working (ADR 0060).
- Open before build: Q12, what each use tile changes afterwards and which tiles are offered.

## Slice 6: rewrite the first-run tour (#392)

Ledger: P2, O6.

- The tour drops its Welcome, Nebius key and sample-workspace steps, which onboarding now covers, and walks the features that exist after this work: the library rail, Home with the agent row, Chat and agent settings, a note, and a meeting (P2, O6).
- Acceptance: the tour runs after onboarding on first use and from Take the tour; steps whose target is missing skip themselves as today.

## Slice 7: notebook proposal from mail and calendar events (#393)

Ledger: O3, O4, O5, O14, O16, O17, A3, A8, A11, P6.

- After connecting Google, Stellis reads past mail and calendar events with a progress loader (O14) and proposes collections and notebooks with items already filed (O4, O5).
- Each proposed notebook comes with agents to launch (O3), its Steward first (A3, P6), and setup takes one action instead of many options (O4).
- A Learning collection with a Learning Onshape notebook is seeded for the tutor (A11).
- Copy is bright, expressive and professional, and says "mail & calendar events" (O17).
- Blocked by: Q6 (how far back to read), Q9 (what replaces the unsorted row), Q11 (templates and deployments), and the review rule for bulk filing (scoping register C7).

## Slice 8: ADR amending ADR 0060 (#394)

Ledger: A1 to A4, Q11.

- Record templates, per-notebook deployments, and named copies that carry their own memory, against ADR 0060's one identity and one thread per agent.
- Decide whether the shipped General agent becomes Chief of Staff (Q4).

## Slice 9: tutor agent and browser-use connector (#395)

Ledger: A11, A12, Q3.

- Research the candidates, starting with Clicky, and bring costs and ties to the owner. Nothing is built until the owner picks one (global vendor rule).

## Slice 10: microphone and speaker selection while recording (#396)

Ledger: R1, R2.

- Recording offers a microphone choice and a speaker (system audio) choice. Capture of system audio is #344; this slice is the picker. The notebook Change control stays (R2).

## Slice 11: heading type (#397)

Ledger: P5, C7, Q8.

- After the owner picks a Piazzolla weight from the canvas type board, apply it to page headings and add the italic rule to the style guide: italic only on long phrases such as subheads, never on headings or single words.
