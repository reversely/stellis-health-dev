# ADR 0063: Agent templates and notebook deployments

Status: implemented under the owner's 2026-10-20 request to configure agent harnesses, build management from the PDF, and continue autonomously. Amends ADR 0060. Tickets: #394 and #410.

## Decision

Keep one persistent identity, thread and memory store per `agents` row. Add `template_id` and `enabled`, preserving existing IDs, slugs, names, assignments, memories and threads. A versioned Python catalog supplies shared behavioral instructions separately from editable deployment instructions. The combined instructions reach OpenClaw inside NemoClaw through chat, delegation, mail drafting and voice's chat path. No separate process or model is created for every template.

Steward is deployed once per notebook. Repeating Add reuses its assigned Steward. A template Steward cannot be assigned to a second notebook. Acting templates (Writing, Deep research, Regulations and Tutor) can share an identity across notebooks. Add reuses the base template's identity; Create a copy requires an explicit name and creates independent memory and chat. Existing custom agents remain supported. Functional names replace person-name examples in creation controls.

The shipped General identity remains the default fallback, preserving users' existing names and data. Chief of Staff is the onboarding-facing direction, not a claim of a shipped scheduler. Onboarding may name a fresh default identity during setup. Existing users are not silently renamed. Templates run when asked: no catalog card claims a cron schedule or unattended work.

Turning an agent off blocks new explicit execution and removes it from automatic Steward resolution. It does not discard history or cancel an already-running request. The default fallback stays on. Management can edit instructions, rename, assign notebooks, edit or remove memory, and delete a non-default agent after active work finishes. Deletion removes its stored thread and memories and requires confirmation in the UI.

## Consequences

The catalog makes functions visible before activation while retaining the existing account-local storage and source-validation boundaries. Template guidance is not a replacement for runtime enforcement: sending mail still requires the existing confirmation flow; a tutor does not gain screen access just because its instructions mention teaching. Screen-sharing tutor capability is separate work under #395 and its implementation ticket.

The backend currently uses globally unique agent names. Auto-created Stewards therefore use `<notebook> Steward`; their cards retain the Steward template and notebook grouping. A shared acting agent's enabled flag applies across its assigned notebooks, stated next to the control.

## Verification

See `docs/evidence/410/`: real GN100 local inference obeyed a Tutor's custom instructions and cited notebook evidence. Browser creation, memory reload and disabled execution passed. The new tests check template reuse, per-notebook Steward identity, named-copy isolation, combined instructions and deletion guards.
