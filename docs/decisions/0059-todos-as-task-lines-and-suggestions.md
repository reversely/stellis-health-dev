# ADR 0059: To-dos as task lines, and suggestions

Status: accepted for development, 2026-10-18.

## Context

The user asked for to-dos that agents can add from meeting notes, with tentative completion of earlier items, and pointed to Twos as the model. In Twos a to-do is a line with a checkbox inside any list or day, and a To-dos view gathers them; completing and canceling are recorded separately ([Twos docs: thing types](https://www.twosapp.com/docs/things/types), [complete and cancel](https://www.twosapp.com/docs/things/complete-cancel)). The user asked for agent changes to behave like Google Docs suggestions: shown tentatively, editable before approval, and accepted or rejected singly or all at once with a preview. Stellis is a single-person interface. [ADR 0058](0058-pages-collections-markdown-dialect.md) keeps Markdown in SQLite as the source of truth.

## Decision

- **A to-do is a Markdown task line** in conversation notes or a page: `- [ ]` open, `- [x]` done, `- [-]` canceled (the Obsidian Tasks convention). There is no to-do table that people edit and no owner field. The user chose this over a to-do database.
- **Each task line carries a hidden ID** at its end, `^t` followed by six base-36 characters, in Obsidian block-ID form. An index table rebuilt on every save stores each line's status, due date, and created, completed, and canceled times. The editor hides the ID; copying and exporting produce plain Markdown without it, and a bookmark copies as a Markdown link.
- **Due dates come from natural language in the editor** through chrono-node (MIT, no dependencies), chosen by the user over a server-side parser. The editor sends each line's resolved date with the save; the server stores it and parses nothing.
- **To-dos is a widget** for a notebook's homepage or the main Home, backed by one endpoint that gathers task lines by notebook and status.
- **Agents change notes only through suggestions.** A suggestion adds a to-do under a `## To-dos` heading at the end of a meeting's notes, or changes an existing line's status. The user can amend a pending suggestion; accepting applies the amended version, and the agent's original is kept. Suggestions are accepted, rejected, or previewed singly or in bulk. A user's own edit to the same line supersedes a pending change. Agents suggest to-dos only where the notebook's setting, inherited from its collection unless set, is on.

## Consequences

Task lines carry IDs in stored Markdown, so other tools that open an unconverted copy show them as text. Relative due dates resolve when typed, so a future native client needs its own parser. Suggestions on general note text, the chat agent, and structured databases are later decisions.
