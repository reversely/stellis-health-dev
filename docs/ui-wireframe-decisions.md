# UI wireframe decisions: onboarding, agents on Home, agent settings

Status: decision ledger from the owner's review of the low-fidelity wireframes, 2026-10-20 (UTC timestamps from the canvas comments and the session transcript). The wireframes live in the private design canvas "Stellis UI wireframes" (https://claude.ai/artifact/YS7fPHsMfGyBGUhDktdc6T).

The wireframes are low fidelity. Only the rows in section 1 record a decision, and each one quotes the owner. Section 2 checks each row against shipped decisions. Section 3 lists what the canvas shows that nobody decided. As in the [scoping register](stellis-scoping-register.md), a blank is open, not permission to choose silently. A spec or ticket cites ledger IDs; a requirement without one is an open question.

The owner put it this way: "this is low fidelity so i don't want some of the existing decisions to be overwritten by filler" (chat, 03:26).

## Current implementation direction (2026-10-20 continuation)

The owner's later instructions supersede P1 and Q7's deferral: two deployment versions are required, and the current UI/onboarding adopts fully local inference on GN100. Cloud remains a separate Nebius Cloud + Token Factory option. The owner explicitly requested Settings traces/routing/local model switching (merged #409), functional tutor and template management, then PDF-aligned onboarding and live setup from a fresh state on GN100. Existing sidebar backgrounds, icons and richer controls must be preserved, not replaced with low-fidelity mockup styling. Emil's design-foundations and animations skills in `Repos/skills-sandbox` inform hierarchy and purposeful motion with reduced-motion support. This grants implementation judgment for routine open design details; external account connections still use their real authorization flows.

Observed directly in the PDF: pages 7–8 welcome and uses/connections; page 9 reviewed collection/notebook proposals with agent choices; page 10 grouped agent row and Home; page 11 agent management with function, run mode, approval and memory information. These are static references, not proof of live interactions. Counts, schedules and project examples remain illustrative, never fabricated live data.

Implementation order: template/deployment controls (#410 and ADR 0063), functional local screen tutor (#395 follow-up), welcome/uses/local setup (#391), reviewed notebook setup (#393), updated contextual tour (#392), then cross-flow browser verification and newly discovered gaps. Existing unrelated platform/stretch tickets are not prerequisites.

## 1. Decision ledger

"Board" names the canvas board the comment was left on. Chat rows come from the session transcript. The "Settles" column states only what the quote says; where the quote leaves a choice open, the row says so.

### Agents

| ID | Owner's words | Source | Settles |
| --- | --- | --- | --- |
| A1 | "The agents themselves on a engineering level will typically be one of a few basic templates of agents." Examples given: one "fine-tuned on your voice in A format, slash B format, slash C format", one that understands "your schedule", one with "context on the rules and regulations that you've ingested". "So most of these agents will be working across projects" | Chat 00:44 | Agents are instances of a few functional templates, mostly cross-project |
| A2 | "I am not particularly convinced that default naming them like people is going to help the user interface make sense. Users should obviously be able to name their own agents" | Chat 00:44 | No person names by default; users can rename |
| A3 | "there can be one agent steward per notebook, but that is more of a set of deployments of one more, for example, RAG aware agent template being deployed across multiple notebooks" | Chat 00:44 | A notebook steward is one template deployed per notebook |
| A4 | "an agent only gets a new name if they need a persistent memory that is applicable to that one use case" | Chat 00:44 | A separate named agent exists only for use-case-specific memory |
| A5 | "Each person has multiple projects; each of those projects have several agents. It wouldn't make sense for all of these to be mixed without some sense of differentiation / boxing out of different notebooks and the activities from agents within them." | Comment, board 1 Today, 00:36 | Agent activity is grouped by notebook, not mixed |
| A6 | "you are able to build out a "fleet" of agents over time as they get expposed to your daily tasks and workflows" | Chat 01:05 | The set of agents grows over time; when and how it grows is open |
| A7 | "agents should have pixellated identicon-like generated profile pics with different colours [...] coordinator agents should have inverted backgrounds while acting agents have this" (reference image: white disc, coloured pixel sprite) | Chat 02:14 | Generated pixel avatars; coordinators on a filled disc, acting agents on white |
| A8 | "makes sense to call it a SME for persistent context on your project's meetings + records" | Comment, O3, 02:38 | The per-notebook steward on project notebooks is named SME |
| A9 | "the less corporate version of SME; same thing, different context so different name" | Comment, O3 Home collection, 02:39 | The same template takes a different name in personal contexts; the name is open |
| A10 | "chief of staff" (02:28), "Chief of Staff" (02:48), "deep research" (02:29), "Deep research with Tavily" (02:39), "Slide Deck Designer" (02:30), "in your voice" (02:39, on the writing agent) | Comments, O1 to O3 | Names: Chief of Staff, Deep research (through Tavily), Slide Deck Designer; the writing agent works in the user's voice |
| A11 | "Replace this with Education  or self learning; this is the clicky use case" (02:49); "clicky use case 2; so we need to make a clicky type agent for the tutelage, and this should be on o3" (02:50); "education bot needs to be seeded with a "learning onshape" project" (chat 03:03) | Comments, O2; chat | A tutor agent of the Clicky type, shown on the notebook proposal screen, seeded with a Learning Onshape notebook |
| A12 | "oh clicky is just something we can adapt as a  browser use connector; it makes sense" | Chat 01:25 | Clicky is a candidate browser-use connector; see Q3 |
| A13 | "it's not well signposted what these are or what their functions are in advance, so this needs to be reinforced with more smooth ui" | Chat 02:15 | Each agent's function is visible before the user turns it on |
| A14 | "the meta screenshot with the short depiction of whether the agent is returning an artifact or a cron job is a something close to a start" | Chat 02:16 | Each agent shows whether it returns an artifact or runs on a schedule |
| A15 | "this needs to be sorted into collections, now you see why" | Comment, O4 agent row, 03:01 | The agent row on Home is grouped by collection |
| A16 | "the last screen is essentially a settings page; it's not an interface you check on regularly" (chat 01:55); "this whole page needs a revamp based on the situation" (comment, Settings board, 02:58) | Chat; comment | The agent list is a settings page, not a destination; its layout is open |

### Onboarding

| ID | Owner's words | Source | Settles |
| --- | --- | --- | --- |
| O1 | "you start from connectors - calendar and email are two important ones - and you go through kind of an extended onboarding process" | Chat 01:05 | Onboarding starts from calendar and email connectors |
| O2 | "this feels much more like an interrogation/interview than a consumer app" | Chat 01:24 | Onboarding does not proceed by questions |
| O3 | "i think the email reading page -> agents to launch pipeline was good" | Chat 01:26 | Reading mail leads to a screen of agents to launch |
| O4 | "the great thing about the last edit was the way it took emails/recordings and grouped them into potential collections and notebooks, from which you can deploy agents. what wasn't good about the previously created agents was the idea that you had to click through 30 options to get a minimal setup going." | Chat 01:41 | Mail and recordings become proposed collections and notebooks; agents deploy from them; minimal setup takes few steps |
| O5 | "push the scaffolding perspective of doing things in notebooks and collections because this is (aside from the open source point) the most important for me" | Chat 01:26 | Notebooks and collections are the frame for onboarding and agents |
| O6 | "lean more on what exists and don't forget the recording / real world emphasis" | Chat 01:55 | Reuse shipped screens; recording stays prominent |
| O7 | "a quick selection of how you'll be using this tool with multiselect icons would be nice in addition to the connectors, since everything on this page would be optional and it's a good way to prime use cases" | Comment, O1, 02:13 | A multiselect of uses, with icons, next to the connectors |
| O8 | "this would be a separate screen after the first" | Comment, O1, 02:28 | Uses and connectors are a second screen after the welcome |
| O9 | "neither of the very first screens have exactly this bar bc it doesn't have any use case yet" | Comment, O1 rail, 02:28 | No Library rail on the welcome and uses screens |
| O10 | "too many "optionals"" | Comment, O1, 02:31 | Do not label each item optional |
| O11 | "these tokens are kind of vague; like, what's drafts, what's daily, for someone with no context" (02:31); "instead of this which is redundant, something that does the clicky personal tutor thing" (02:30) | Comments, O1 use tiles | Use tiles carry no vague tokens; a tutor-style guide replaces them |
| O12 | "emails" | Comment, O1 use tile, 02:30 | The mail tile reads Emails |
| O13 | "Space for Tavily and Nebius Token Factory keys" | Comment, O2 connections, 02:49 | The uses screen has fields for Tavily and Nebius Token Factory keys |
| O14 | "why 2 months" then "like yeah, there can be a flow about reading your past 2 months of emails running as a loader (like the Claude "wibbling...." and whatnot" | Comment, O3, 01:57 | Reading past mail shows as a progress loader; the range is open (Q6) |
| O15 | "how do you import recordings? where do you mport them from? this feature doesn't exist" | Comment, O3, 01:57 | Onboarding does not offer importing recordings from a source |
| O16 | "?" on "11 items did not fit a notebook" (01:56); "so "11 emails couldn't be sorted into a notebook"? that cant be right" (02:40) | Comments, O3 | The unsorted-items framing is rejected; the replacement is open |
| O17 | "in the second screen keep up the playful but professional vibe of the first" (02:31); "language: bright + expressive + professional" (02:40); "mail & calendar events" (02:40); "this needs to be a bit more enthusiastic/proactive" (03:00) | Comments, O1 to O3 | Tone for onboarding screens after the welcome; the term is "mail & calendar events" |
| O18 | "we still need a proper sentence or two in the case of "the first memo the user sees about what this is"" (chat 02:19); "needs to be clearer & more concise. local inference possible + nebius token factory's model of zero data retention emphasized bc this is really the main use case" (comment, 02:27) | Chat; comment, O1 | The welcome screen has a short explanatory memo; see O19 for its text |
| O19 | Owner-written welcome copy, entered in the canvas: "Stellis is a private AI team for your entire life." "Stellis learns from everything you do, see, and say, building a continuous understanding of your world. It organizes that knowledge into collections, and assigns each part of your life to a fleet of persistent AI agents." "Watch your agents research, write, coordinate, and follow through on your behalf. Built with NVIDIA NemoClaw for sandboxed agent execution, and Nebius on Nemotron for opt-in zero-retention AI inference." | Canvas edit to O1 | Welcome text, as written by the owner |
| O20 | "i would love for the screens to feel a bit more delightful" (chat 02:22, Luma reference); "can you fix this first slide  with more diverse icons that represent the full promise here? + no backdrop" (chat 03:45); "this is good" (chat 03:50) | Chat | The welcome shows floating icons and agent avatars covering the promise, with no card backdrops |

### Copy and visual

| ID | Owner's words | Source | Settles |
| --- | --- | --- | --- |
| C1 | "refrain from using memory context excessively, jargon, complete sentences, parentheses, and over corrections. UI should be like highway signs: say exactly what you need to say, big enough so the reader can read it, in as few words as possible." | Chat 02:12 | Interface copy rule; the welcome memo (O18) is the exception |
| C2 | "the copy should still be minimal and friendly, with interfaces instead of sentences" | Comment, O3, 01:56 | Prefer controls over explanatory sentences |
| C3 | "normal exclamation points in place of emojis" (comment 03:00); "no emojis" (chat 03:03) | Comment; chat | No emojis |
| C4 | "we have a new logo btw, it's in assets, and not a fan of italics logos" (00:52); "single colour logo please, invert as needed for clarity to white or 80% opacity white" (02:26); "i have a v2 logo in assets/, please drop it in" (chat 03:45) | Comments; chat | Logo is `assets/stellis_logo_v2.png`, one colour, white or 80% white on dark; no italic logo |
| C5 | "general future qol, need to add some different colour palettes" | Comment, board 1 Today, 00:52 | Later work: more colour palettes |
| C6 | "what is "tap more to add them"?" | Chat 03:03 | Hint copy must say what it means; the hint was removed |
| C7 | Owner's own edit: the welcome heading set to Manrope, 40px, weight 400 | Canvas edit to O1 | Observed edit only; whether Manrope replaces Piazzolla is open (Q8) |

### Home and recording

| ID | Owner's words | Source | Settles |
| --- | --- | --- | --- |
| H1 | "a feature here that would be important is making widgets configurable. rn it's very wall of text; wondering if by default we can get some contrast in this block of stuff, for example a colour block, or the notebook agents up top as well as profile pictures you can chat with." | Comment, Home board, 02:12 | Configurable widgets; agents with avatars at the top of Home, which open Chat; a colour block is offered as an example, not decided |
| H2 | "is this imported from the google calendar, task blocking they gave you, or what? i don't think it makes a ton of sense to be scheduling stuff that isn't meetings in here proactively" | Comment, board 1 Today, 00:54 | Home does not schedule non-meeting work proactively |
| H3 | "I need much more convincing mockups for the workflow.... can you look up if there's something we can take a look at that will mock up the full scope of the tasks on a person's plate; perhaps not even just on a work level but also personal?" | Comment, Recording board, 00:37 | Mockups must cover work and personal tasks |
| R1 | "we need a feature here that allows you to choose microphone + speakers both; currently this isn't part of the interface" | Comment, Recording board, 00:51 | Recording has microphone and speaker selection |
| R2 | "Yes this is fine." on the recording notebook "Change" control | Comment, Recording board, 00:37 | Keep the Change control |

### Order of work

| ID | Owner's words | Source | Settles |
| --- | --- | --- | --- |
| P1 | "i think we should build out the local inference later because it's fairly plug and chug if nemoclaw exists. theserver issue is a whole different mess tbh. but the user interface is more of an immediate mess and i would really like to fix that first" | Chat, after the ledger review | Interface first; local inference is deferred and the welcome copy does not claim it |
| P2 | Asked how the first-run tour fits: "redo the tour as well with the new actual features" | Chat, question answers | The first-run tour is rewritten for the new onboarding and features |
| P3 | Asked where agent settings live: chose "In Chat" | Chat, question answers | Agent settings are a view in Chat, grouped by collection and notebook |
| P4 | Asked about the per-notebook agent's name: "i kind of like steward but sme gives idk" | Chat, question answers | Superseded by P6 |
| P5 | Asked about Manrope against Piazzolla: "there's something stodgy about the bold piazzola, maybe the light version would work better and the occasional italic, but only for long phrases like subheads  and not for headers or to italicize one word" | Chat, question answers | Direction: lighter Piazzolla weights; italic only on long phrases such as subheads, never on headings or single words; heading weight still to be tried (Q8) |
| P6 | After a recommendation of Steward: "Ok, sure. Steward it is." | Chat | The per-notebook agent is Steward in every notebook; users can rename it (A2) |

## 2. Against shipped decisions

| Ledger | Shipped decision | Status | Source |
| --- | --- | --- | --- |
| A1 to A4 | "Each named agent has a persistent identity, role, instructions, and one durable Chat thread"; the `agents` table holds name, role, instructions, slug and is_default; `agent_notebooks.is_steward` marks a steward | Conflicts. Templates, per-notebook deployments and named copies need an ADR amending ADR 0060 before tickets | [ADR 0060](decisions/0060-agent-boundary-routing-and-chat.md); [current architecture](current-architecture.md) |
| A2 | The direction brief's example: "Make Mira my project coordinator" | Conflicts with no person names by default; the brief needs a revision | [Direction brief](stellis-project-direction.md) |
| A8, A9 | Shipped names: notebook "steward", "General", "Transcript Agent" | Conflicts in naming; the names need a decision (Q4) | ADR 0060; [style guide](ui-style-guide.md) Suggestions |
| A7 | Suggestion cards show "a 24px round avatar with the agent name" | Extends; the style guide needs the avatar rule | Style guide |
| A10 | "Tavily research uses its remote MCP server through NemoClaw's managed OpenShell tool boundary" | Matches | ADR 0060 |
| A11, A12 | Clicky is not a dependency; no browser-use connector exists | Open. A public repository needs the owner's vendor decision (Q3) | Global instructions |
| A15, H1 | Home rail pins Meetings, To-dos and Chat; "The Chat tab is the place to find and speak with agents"; Edit widgets already shows or hides each widget | Extends: an agent row on Home linking to Chat is new; configurable widgets exist in part | Style guide Home; ADR 0060 |
| A16 | Named agents are managed in Chat (#338) | Open: where agent settings live (Q5) | #338 |
| O1, O13 | First-run tour of eight steps, including "Connect Nebius Token Factory" with a key field and "Add the sample workspace or start empty" | Conflicts. The new onboarding has to replace or absorb the tour (Q1) | Style guide First-run tour |
| O13 | ADR 0060 says "OpenShell holds the Tavily credential"; shipped code reads a Tavily key saved in Settings (`delegation.py`: "Add a Tavily API key in Settings") | Open. The ADR and the code differ on where the Tavily key lives (Q2) | ADR 0060; `src/stellis/delegation.py` |
| O1 | Gmail through the user's OAuth grant; calendars read-only | Matches | ADR 0060; [ADR 0050](decisions/0050-local-read-only-calendars.md) |
| O4, O5 | A conversation belongs to at most one notebook; collections group notebooks and do not nest | Matches for structure. Proposing notebooks and collections in bulk is new | [ADR 0052](decisions/0052-notebooks-capture-time-and-account-deletion.md); [ADR 0058](decisions/0058-pages-collections-markdown-dialect.md) |
| O4 | Register C7: "Ambiguous filing [...] require[s] a review decision"; strategy: a conversation "can belong to more than one space" | Proposal screen as a review step matches C7. The strategy's multi-membership conflicts with ADR 0052; ADR 0052 is the shipped rule | [Scoping register](stellis-scoping-register.md); [strategy](stellis-implementation-strategy.md) |
| O5 | The strategy uses "space" for notebooks | Conflicts in terms; the owner's term is notebooks and collections | Strategy |
| O15 | Import accepts MP3 only | Matches: onboarding offers no recording import | Current architecture |
| O18, O19 | Agent inference runs on Nemotron on Nebius Token Factory through NemoClaw; no on-device language model is shipped | The comment asks to emphasise "local inference possible"; nothing shipped supports it, and the owner's copy (O19) does not claim it (Q7) | ADR 0060; [ADR 0007](decisions/0007-nebius-source-backed-ai.md) |
| O19 | Nebius ZDR "applies at the organization level"; Speculative Decoding "is enabled by default" and ZDR opts out | The copy's "opt-in zero-retention" matches the source. Stellis does not check ZDR (Q7) | `docs/research/nebius/sources/tf-docs/legal__legal-quick-guide.md` |
| C1, C2 | "Keep explanatory copy brief" | Matches | AGENTS.md |
| C3 | No rule on emojis | Extends; add to the style guide | Style guide |
| C4 | "Use the existing Piazzolla display face for the brand" | Extends: a logo mark beside the wordmark is new | Style guide |
| C7 | Piazzolla for "the brand and major page headings" | Open (Q8) | Style guide |
| H2 | Calendars are read-only | Matches | ADR 0050 |
| R1 | #344 records microphone and system audio as two streams | Extends: #344 covers capture, not a device picker | #344 |

## 3. Wireframe only, not decided

Everything below appears on the canvas without an owner decision. A spec does not carry it as a requirement.

- **The word "helpers."** The owner says "agents"; "helpers" is canvas wording.
- **Names and data.** Only Water Treatment, RFI 91, the Oct 22 date and C316 come from the fixture (`docs/fixtures/rfi91-answer-key.md`). Transit Depot, Harbor Retrofit, Solar Yard, Health and admin, Home renovation, Family, every item count, "640 of 1,240", "212 newsletters & receipts", quote B "+$2,400", "Lesson 3: sketch constraints", and every meeting time are filler.
- **Agent colours and sprites.** The colour per template and the avatar seeds are arbitrary; A7 settles only the style.
- **O1 welcome.** Which 16 icons float, their positions, labels and drift animation; the 22px pill button.
- **O2 uses and connections.** The tiles other than Emails and Learning (Meetings, Projects, Home projects, Family, Deep research, Slide decks) and their icons; the Chief of Staff speech bubble and every tip line; the three-row connections card, key placeholders, "Zero Data Retention" caption and "Run on this device instead" link; "Skip any of this".
- **O3 notebook proposal.** "6 notebooks, ready to go!", "Sorted from your mail & calendar events", "First up: your RFI 91 reply draft!"; the range options (2 weeks, month, 3 months); the "Skipped" row that replaced the unsorted row; each agent's one-line function ("Remembers meetings & records", "Checks specs", "Guards your time", "Guides you on screen", "With Tavily", "Drafts in your voice"); which agents are ticked in which notebook; the Consulting, Home and Learning collections; "Set up 6 notebooks" and "Drafts only".
- **O4 Home.** The dark next-meeting strip; the teal Coming up block; the "Everywhere" group; the name "Expert"; the role captions under avatars ("Daily brief", "Your voice", "Specs", "Tavily", "Calendar", "Onshape"); all to-dos and notebook points.
- **Agent settings board.** Its whole structure: a Helpers rail entry above Account settings, cards per collection and rows per notebook, the Does, Runs, Asks first and Remembers fields and their values, the On switch, Rename and Remove, "+ Add", and "Add to [notebook]".
- **Top-row boards** (User flows, 1 Today, 2 Work notebook, 3 Home notebook, 4 Chat, 5 Recording). They predate A1 to A4 and show person-named agents, "RFI desk", "Notebook assistant" and "5 h 30 min planned". Only R1 and R2 from these boards are decisions.

## 4. Open questions before tickets

| ID | Question | Blocks |
| --- | --- | --- |
| Q1 | Settled by P2: the tour is rewritten | None |
| Q2 | Where does the Tavily key live: Stellis Settings, as shipped, or OpenShell, as ADR 0060 says? | Uses and keys screen |
| Q3 | Which browser-use connector backs the tutor: Clicky, or another candidate? The owner decides the vendor. | Tutor agent |
| Q4 | Settled by P6: Steward. Open: whether the shipped General agent becomes Chief of Staff | Agent naming in Chat |
| Q5 | Settled by P3: in Chat | None |
| Q6 | How far back does onboarding read mail by default, and can the user change it? | Notebook proposal |
| Q7 | Local inference is deferred (P1). Does Stellis require or check Nebius ZDR before sending? | Privacy, after the interface work |
| Q8 | Which Piazzolla weight for headings (P5)? Google Fonts serves Piazzolla at 100 to 900 with italics. Does Manrope stay anywhere? | Style guide |
| Q9 | What replaces the unsorted-items row (O16)? | Notebook proposal |
| Q10 | When and how does a new agent join the fleet after onboarding (A6)? | Agent growth tickets |
| Q11 | ADR amending ADR 0060 for templates, per-notebook deployments and named copies (A1 to A4) | Every agent ticket |
| Q12 | What does each use tile chosen at onboarding change afterwards, and which tiles are offered besides Emails and the learning tile? | Onboarding uses screen |
