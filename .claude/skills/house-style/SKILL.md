---
name: house-style
description: >-
  Writes and audits human-facing text so a reader without prior context can follow it: chat
  replies, status notes, commit messages, code comments, docs, tickets, product writing and UI
  copy. Use when drafting or reviewing any of these.
---

# House style

## Procedure

1. Read the full piece and state its central argument in one sentence.
2. Check every rule group below and rewrite each violation; finding it is not enough.
3. Re-read the whole piece for contradictions and repetition.
4. Run the final verification at the end of this file.
5. Reviewing someone else's draft: report each finding as `line: problem: rewrite`.

Keep any document structure a project's CLAUDE.md or another skill requires.

## Coherence

- Reads start to finish without prior context, dangling references or contradicted definitions.
- Order claims by dependency and name what each step depends on.
- Check every addition against the whole piece, especially a drop-in replacement for an existing
  tool, concept or process. Reconcile contradictions across sections (one section generating
  fields from confirmed mappings while another hardcodes the frontend field list).
- Each recurring theme, fact and quote has one home section; cut repeats elsewhere.
- No restatement pairs: drop a sentence that repeats the previous one in broader terms.
- Introduce a referent before "the", "this" or "that". Make repetition explicit when a singular
  noun would hide it.
- Replace figurative or evaluative phrases with the facts they stand for; if none exists, delete.
- No history the reader does not need to act now (past tickets, earlier attempts, how the state
  was reached). It belongs in the log.
- A closing paragraph carries the argument to its end. If the point is unclear, ask first.

## Positive scope

- PRDs, specs, frameworks, scope statements and pitches define a product by what it is and does.
- Every "not" is a cue to sharpen the positive claim: "This is not a data-entry tool" becomes
  "The model drafts each value from the report, and a pathologist confirms it."
- If an exclusion holds scope you cannot state positively, ask the scope owner what the product
  does at that boundary, and write the answer as a positive sentence before continuing.
- Architecture and component descriptions open with who the part serves and what it does for
  them, then how it works.
- When condensing the user's own copy, keep every sentence that states a user or purpose; trim
  only mechanics and repetition.

## Punctuation

- No em dashes, en dashes or double hyphens between clauses: split the sentence or use a colon.
- No `·` interpunct. Leave empty slots empty; separate metadata with layout or commas.

## Headings and labels

- Headings, titles, table lead-ins, list labels and on-screen signposts are never sentences and
  take no period: "The top bar, login" becomes "Login".
- None starts with "The": "The demo" becomes "Demo".
- A heading states the section's point, not its category.

## Banned words

- "the thing", "that thing".
- "genuinely", "honestly", "quietly".
- Intensifiers: "deeply", "profoundly", "incredibly", "remarkably", "strangely", "oddly",
  "surprisingly".
- Corporate filler: "leverage", "unlock", "optimize", "streamline", "empower", "transform", "drive
  impact", "at scale", "seamless".
- "flag" and "call out" where dispensable; otherwise "raise" or "bring up", naming who receives the
  report or where it is marked.
- Invented compounds: use only compounds a dictionary lists.
- Metaphorical "spine": name the referent (thesis, left border, colour strip).
- "beat" as a unit of a demo, story or process: use "step".
- "stale", in prose or code (identifiers, fields, tests, API paths). State the condition: "a
  citation whose line moved", "a doc that no longer matches the code".
  `checklist_needs_recompute`, not `checklist_staleness`.
- "substrate", except a physical one or a concrete artifact's proper name; otherwise name the
  store or table.
- "X's own Y": "the branch's own tests" becomes "the branch's tests". Grep drafts for " own ".
- "lands" for an arriving change: the commit merges, the fix reaches main, the release ships.

## Banned phrases

- Importance summaries: "plainly stated", "the whole game", "the whole point", "the entire point",
  "the whole story", "the real story", "the name of the game", "everything", "all that matters",
  "what it all comes down to", "the thing that matters", "the only thing that matters". State the
  mechanism, dependency, consequence or constraint.
- Contrast scaffolds: "but here's the thing", "the truth is", "what no one tells you", "you might
  think", "it sounds simple", "that's where things get interesting".
- Vague profundity: "at the end of the day", "in a world where", "more than just", "isn't just",
  "speaks to", "reveals something about", "says something about".
- "points to" only with a concrete referent ("the stack trace points to line 42").
- Closers: "Turns out...", a clause ending ", really", "That's the whole...".

## Verbs and causality

- Plain verbs: "use", "make", "show", "need", "build", "cost", "move", "change".
- No melodramatic causality ("forces", "demands", "compels", "confronts", "reveals", "exposes",
  "haunts", "reckons with", "grapples with", "interrogates"). Say what happens: "raises", "asks",
  "shows", "sets up", "leads to", "introduces", "points to", "depends on", "requires".
- No passive voice that hides the actor or the cause.
- No copula standing in for a mechanism, action or consequence, and never a chained copula ("X is
  Y, and it is Z"): "The bottleneck is the write path, and it is the reason queries stall" becomes
  "The write path serializes every request, so queries stall behind it."
- No human identity or capacities for non-agents (systems, designs, buildings, walls, markets).
- No causal chain compressed into an aphorism: name the agent, the choice and the consequence.

## Sentences and rhythm

- No antithesis: "not X, but Y", "it's not X, it's Y", "X, not Y".
- No tricolon of parallel clauses, and no three-item list that sounds balanced but adds nothing.
- No comma-tail ("the answer, in real time", "the draft, tightened"): integrate or remove it.
- No fragment-plus-tail splice (a verbless noun phrase then ", and it's..."): write one clause.
- No inversion or postposed modifiers for effect unless that line is approved.
- Attach an ornamental fragment to the sentence before it, or delete it.
- Every line punctuated as a sentence has an independent clause: "What the skill fixes." needs a
  verb or loses its period.
- Answer a rhetorical question in the next sentence, or remove it.
- At most one controlling metaphor, only when it clarifies and stays consistent.
- No stacked abstractions ("systems of meaning", "the architecture of trust"): name the object or
  measurement.
- No paragraph where every sentence opens the same way; at most two consecutive sentences of the
  same shape.

## People

- Never assume the gender of any audience, reader or end user. No "she", "her", "he" or "his" for
  a person in prose or UI unless explicitly instructed. Check with `\b(she|her|hers|he|him|his)\b`.
- No "we" claims about what we do, feel, forget, believe or need unless the audience is defined.

## Specificity and evidence

- Replace vague nouns ("thing", "stuff", "part", "way", "process", "journey", "space", "world")
  with specific ones.
- No vague agency ("it became clear", "it turns out", "things changed", "the system decided"):
  name the actor and action.
- No unsourced universals or superlatives ("everyone", "no one", "always", "never", "the most",
  "the best", "the only"): cite the basis or cut.
- Any opinion, promotional or aggressive claim, or subjective characterization is a direct quote
  from a named source, or it is cut. Never in the writer's own voice.
- No time or effort estimates (durations, day counts, schedules, "fits in N days") in plans,
  reviews, tickets or replies, and no dates (deadlines, creation, push or release dates) unless
  the user asks. Size work by what it contains.
- Every line carries a concrete noun, named actor, visible action or checkable claim where
  possible. Follow an abstract sentence with an example, number or consequence.
- Every line advances the argument, sets up a contrast, explains a mechanism or sets up a visual;
  otherwise cut it.

## UI and design

- No fabricated data shown as real: no invented identities, telemetry, versions or metrics. Leave
  unavailable content empty.
- Tabulate every filler item missing a database link and report them to the user in a dedicated
  file.
- Delete filler labels and decorative-only text: any string whose removal loses no information.
- Conventional labels for conventional actions; no themed rewrites unless the wording adds
  information. No whimsical or theatrical microcopy, and no sci-fi status strips on business
  screens.
- No Unicode glyphs as icons: use a real icon set or none.
- Monospace only where a governing skill names the role, at small sizes. Serif and sans-serif
  pairings stay open.
- A UI change clarifies the screen's point, cuts task clicks, or improves readability and
  hierarchy. A colour, font or chrome swap that does none of these fails.
- No ornamental "seam" or "joinery" elements that imitate structure without providing it.
- Never undo a decision the user already confirmed without asking.

## Tickets

- Quote the full request the ticket comes from; acceptance covers every part of it.
- Headings are noun phrases: Current behaviour, Required behaviour, Acceptance.
- Every sentence names its actor.
- Acceptance always carries three checks: security and injection hardening; layout at every width
  with no overlap, no overflow and centring (run with the `layout-audit` skill); load and
  execution time within budget.
- Write descriptions out in full each time; no abbreviation or shorthand label stands in for one.

## Final verification

- [ ] Grep every banned word and phrase; apply the stated exceptions.
- [ ] Read every heading, table lead-in and list label on its own.
- [ ] Re-read the whole draft for dangling references, contradictions, repetition and unsupported
  claims.
- [ ] Every rule group checked and every violation rewritten.
