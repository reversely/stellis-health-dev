# Website Reverse Engineering: Exploration Protocol

Target: otter.ai, currently open on a Chromium browser on this machine.

Use Reverse Engineer Anything (REA) and browser automation to investigate the reference application in sufficient detail to reproduce its observable behavior in an independent codebase.

**Your current task is exploration only. Do not implement the application, create UI components, or scaffold the replacement codebase.**

## 1. Surface discovery

Begin with breadth-first exploration of the application.

- Enumerate all navigable routes and significant UI states reachable within the authorized scope.
- Inspect the global navigation, sidebars, toolbars, menus, contextual controls, footer links, and nested navigation.
- Identify dynamically revealed interfaces such as dropdowns, modals, drawers, tooltips, command palettes, and context menus.
- Explore conditional views caused by user selections, filters, permissions, or application state.
- Inspect responsive behavior at desktop, tablet, and mobile viewport widths.
- Build a route/state graph recording how each screen is reached.

Do not assume that the initial visible page represents the application's full functionality.

## 2. Systematic interaction testing

For every meaningful interactive component, investigate:

- Default appearance and state
- Hover, focus, click, and keyboard behavior
- Inputs and validation constraints
- Resulting UI changes
- State persistence after navigation and reload
- Loading, empty, success, and error states
- Undo, reset, cancel, and dismissal behavior
- Dependencies on other components

Where applicable, test multi-step workflows from beginning to end.

For editors, canvases, or complex interactive tools, test their actual operations rather than treating their toolbar controls as independent decorative components.

Use safe test data. Do not submit payments, destructive actions, or irreversible changes.

## 3. Behavioral and technical evidence

Use REA to collect evidence rather than relying on visual interpretation alone.

For each substantial feature:

1. Capture the initial DOM and accessibility structure.
2. Capture browser screenshots at representative states.
3. Observe network requests and response schemas during interactions.
4. Inspect relevant JavaScript resources and module relationships.
5. Identify client-side state transitions and persistence mechanisms.
6. Record observable data transformations, calculations, and business rules.
7. Distinguish directly observed facts, source-derived findings, hypotheses, and unknowns.

Use `capture_browser_scenario` for repeatable browser actions, `inspect_web_page` and `observe_web_session` for observation, and `analyze_web_bundle` for relevant JavaScript analysis.

Remember that passive REA inspection does not replay past activity. Start capture before triggering the interaction.

Do not infer that an API or behavior is absent simply because it was not observed during a capture.

## 4. Functional decomposition

Organize findings by functional subsystem, not merely page.

For each subsystem document:

- Purpose and user-facing capabilities
- Entry points
- UI structure and visual properties
- All observed controls and interactions
- State transitions and dependencies
- Inputs, outputs, and data contracts
- Observed client-side logic
- Backend dependencies
- Error handling and edge cases
- Representative screenshots and traces
- Remaining unknowns

Identify shared components and cross-feature dependencies.

## 5. Coverage ledger

Maintain `analysis/coverage.md` containing a table with:

| Feature | Entry point | States discovered | Interactions tested | Evidence | Status |
|---|---|---|---|---|---|

Statuses:
- VERIFIED: Observed and reproducibly tested
- PARTIAL: Tested, with identifiable remaining gaps
- BLOCKED: Cannot investigate, with documented reason
- UNEXPLORED: Discovered but not yet investigated

Every discovered feature must appear in this ledger.

Maintain `analysis/unknowns.md` separately. For each unknown, record what was attempted, why it remains unresolved, and what evidence would resolve it.

## 6. Exploration iterations

Perform repeated exploration passes:

**Pass A: Discovery**
Map the complete reachable interface and compile the feature inventory.

**Pass B: Interaction**
Exercise every identified feature and interaction.

**Pass C: Technical investigation**
Use REA to investigate implementation details, network contracts, and state behavior for discovered features.

**Pass D: Gap closure**
Revisit partially explored features, investigate untested branches, and resolve conflicting observations.

**Pass E: Independent verification**
Re-run representative workflows from clean application states to confirm reproducibility.

After each pass, update the coverage ledger and identify remaining gaps.

Do not proceed merely because one pass has finished.

## 7. Deliverables

Produce:

- `analysis/site-map.md`: routes, screens, navigation, and state graph
- `analysis/feature-inventory.md`: complete discovered feature list
- `analysis/behavior-spec.md`: observed feature behavior and interaction contracts
- `analysis/architecture-inference.md`: technical findings, with confidence and evidence
- `analysis/coverage.md`: coverage ledger
- `analysis/unknowns.md`: unresolved behavior and investigation blockers
- `analysis/reconstruction-plan.md`: proposed implementation sequence
- `analysis/evidence/`: screenshots, scenario captures, and relevant redacted technical evidence

## 8. Completion gate

Do not declare exploration complete unless:

- Every discovered feature has a coverage entry.
- All accessible, in-scope features have been investigated.
- Every major workflow has an end-to-end trace.
- Every major interactive control has a recorded outcome.
- Relevant state persistence, validation, errors, and data behavior have been examined.
- All remaining gaps are explicitly classified as blocked, inaccessible, or unresolved.
- An independent verification pass has been performed.

Coverage is measured against discovered behavior, not against an arbitrary number of browser actions or pages visited.

If exploration remains incomplete, report the remaining gaps and continue investigating within the authorized scope.



# Website Reverse Engineering: Implementation Protocol

Your next task is to reconstruct the reference application's observable functionality in a new, independent codebase, using the evidence collected during the exploration phase.

**The objective is a working application with high functional and visual fidelity, not a static imitation or a collection of disconnected mockups.**

Use REA and Playwright to revisit the original application when evidence is insufficient. Do not substitute assumptions for observed behavior.

## 1. Exploration handoff and evidence review

Before writing implementation code, read all exploration deliverables:

- `analysis/site-map.md`
- `analysis/feature-inventory.md`
- `analysis/behavior-spec.md`
- `analysis/architecture-inference.md`
- `analysis/coverage.md`
- `analysis/unknowns.md`
- `analysis/reconstruction-plan.md`
- `analysis/evidence/`

Inspect the existing repository, if one exists, to identify established conventions, dependencies, reusable components, and infrastructure.

Build a requirements-to-implementation matrix covering:

| Feature | Evidence | Components | State/data dependencies | Tests | Status |
|---|---|---|---|---|---|

Every discovered feature must have an implementation disposition.

Preserve the distinction between verified behavior, inferred behavior, and unresolved behavior.

Do not silently omit features because their implementation is difficult.

## 2. Architecture and technical design

Design a maintainable application architecture based on the target stack.

Define:

- Application routes and layout hierarchy
- Shared UI components and design tokens
- Feature-specific components and modules
- Client-side state ownership and transitions
- Persistent storage and data models
- API interfaces and server responsibilities
- Authentication and authorization, where required
- Asynchronous operations and error handling
- External service integrations
- Testing and development infrastructure

Separate presentation, business logic, data access, and external integrations where doing so improves maintainability.

Preserve observable behavior without assuming that the original application's internal architecture must be replicated.

### Backend reconstruction

For each feature that requires server-side functionality:

1. Identify observed request and response contracts.
2. Identify required data entities and relationships.
3. Determine persistence requirements.
4. Define validation and authorization rules.
5. Implement corresponding APIs or server functions.
6. Test their behavior independently of the frontend.

Do not replace functional backend requirements with hardcoded frontend responses.

When a reference dependency is unavailable, implement an explicit substitute with equivalent observable behavior where feasible, and document differences.

Mocks may be used during development but must not be mistaken for completed functionality.

### Architecture deliverable

Maintain `implementation/architecture.md` with component boundaries, state ownership, API contracts, persistence models, and major design decisions.

Do not begin broad implementation until the architecture supports the identified feature set.

## 3. Visual system reconstruction

Reconstruct the reference application's visual language systematically.

Derive reusable design tokens for:

- Typography, font weights, line heights, and letter spacing
- Colors, opacity, backgrounds, and surfaces
- Spacing, sizing, and layout constraints
- Borders, radii, and shadows
- Icons and graphical elements
- Responsive breakpoints
- Animation, transitions, and interaction feedback

Use browser measurements, computed styles, screenshots, and inspected assets where authorized.

Create a shared component library for recurring interface elements.

Do not approximate each screen independently using arbitrary styles.

### Visual fidelity requirements

Reproduce:

- Overall page structure and proportions
- Element placement and alignment
- Component dimensions
- Typography and text wrapping
- Navigation and overlay appearance
- Hover, focus, selected, and disabled states
- Loading and empty states
- Responsive layout transitions

Validate at consistent viewport dimensions.

Do not prioritize minor cosmetic adjustments over missing functional behavior, but do not defer all visual validation until the end.

## 4. Incremental implementation

Implement the application in vertical feature slices rather than constructing all pages first and adding functionality later.

Each slice must include:

1. Required data models and backend functionality
2. Application state and business logic
3. UI components and interactions

Notes from the user

Please preserve API call routing; for AI calls please route to Nemotron-3.5-Lightning using Nebius Token Factory. Nebius keys are the .env. Minimize token-intensive calls.

Start with machine transcription of audio on whisper.cpp.
