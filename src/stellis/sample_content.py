"""Invented, non-personal content for the sample workspace (#300).

Each page and meeting note is stored Markdown in the ADR 0058 dialect with ADR 0059 task lines.
`due` maps a task's text to (days from the day the sample is added, "HH:MM" or None).
"""

from __future__ import annotations

TAGS = ("Design review", "Planning", "Reference")
COLLECTIONS = (("work", "Work", "on"), ("personal", "Personal", "off"))
# key, name, collection key, to-do suggestions setting
NOTEBOOKS = (
    ("product", "Product design", "work", "on"),
    ("planning", "Team planning", "work", "inherit"),
    ("reading", "Reading and travel", "personal", "inherit"),
    ("ideas", "Ideas", None, "inherit"),
)

BRIEF = """# Remote control design brief

Notes from the sample kickoff, written for this workspace.

> [!info] Target
> Sell at 25 Euro and keep the production cost at or under 12.50 Euro.

## Requirements

| Area | Goal |
| --- | --- |
| Look | Original and trendy |
| Use | Friendly for first-time users |
| Cost | At most 12.50 Euro to produce |

<details>
<summary>Why these goals</summary>

The brief asks for a remote control that is original, trendy, and easy to use. Cost is half of the selling price.

</details>

<bookmark url="https://groups.inf.ed.ac.uk/ami/corpus/">AMI Meeting Corpus</bookmark>

## To-dos

- [ ] Sketch three casing shapes for review
- [ ] Ask the marketing lead which markets come first
- [x] Read the project brief
"""

PLAN = """# Quarterly planning

## Milestones

| Milestone | Owner | Week |
| --- | --- | --- |
| Prototype review | Design | 4 |
| Cost check | Finance | 6 |
| Launch decision | Leads | 9 |

> [!warning] Dependency
> The launch decision waits on the cost check.

## To-dos

- [ ] Book the prototype review room
- [-] Print the old roadmap
- [x] Share the milestone table with the team
"""

READING = """# Reading and viewing list

## Watch

![Big Buck Bunny, an open Blender Foundation short film](https://www.youtube.com/watch?v=aqz-KE-bpKQ)

## Look

![The Earth seen from Apollo 17, 1972 (NASA, public domain)](https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg)

<details>
<summary>Why these two</summary>

An open film and a public-domain photograph, so the page can show a video embed and an external image.

</details>

## To-dos

- [ ] Watch the short film this weekend
- [x] Pick a photograph for the wall
"""

IDEAS = """# Ideas to try

> [!tip] Keep it small
> One idea per line. Turn the good ones into to-dos.

- A weekly review of open to-dos
- A reading list that links to notes

## To-dos

- [ ] Draft a one-page weekly review template
- [-] Build a bookmark manager
"""

WELCOME = """# Welcome to the sample workspace

This workspace is sample content: two collections, four notebooks, notes, to-dos, tags, and three recorded design meetings from the AMI Meeting Corpus (CC BY 4.0, University of Edinburgh). The participants are actors in a design scenario.

> [!note] Remove it any time
> Choose **Remove sample workspace** in Account settings. Only the items added here are deleted.

<bookmark url="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0</bookmark>
"""

TODOS = """# To-dos

- [ ] Water the plants
- [ ] Renew the library card
- [x] Order printer paper
- [-] Call the old landline provider
"""

# key, title, notebook key (None = No notebook), tag names, Markdown, due dates
PAGES = (
    ("brief", "Remote control design brief", "product", ("Design review", "Reference"), BRIEF,
     {"Sketch three casing shapes for review": (3, "10:00"), "Ask the marketing lead which markets come first": (6, None)}),
    ("plan", "Quarterly planning", "planning", ("Planning",), PLAN, {"Book the prototype review room": (2, None)}),
    ("reading", "Reading and viewing list", "reading", ("Reference",), READING, {"Watch the short film this weekend": (5, None)}),
    ("ideas", "Ideas to try", "ideas", (), IDEAS, {"Draft a one-page weekly review template": (7, None)}),
    ("welcome", "Welcome to the sample workspace", None, ("Reference",), WELCOME, {}),
    ("todos", "To-dos", None, (), TODOS, {"Water the plants": (1, None), "Renew the library card": (4, None)}),
)

# meeting id: notebook key, tag names, to-do lines under "## To-dos", due dates
MEETINGS = {
    "ES2002a": ("product", ("Design review", "Planning"),
                ("- [ ] Record who attended the kickoff", "- [ ] Draft the three-stage work plan",
                 "- [x] Read the project announcement", "- [-] Book a second meeting room"),
                {"Draft the three-stage work plan": (2, "09:30"), "Record who attended the kickoff": (1, None)}),
    "IS1008a": ("planning", ("Planning",), ("- [ ] Write down each person's goals for the project",),
                {"Write down each person's goals for the project": (3, None)}),
    "TS3003a": ("product", ("Planning",), ("- [ ] Compare the planning scenarios", "- [x] Agree the next meeting date"),
                {"Compare the planning scenarios": (5, None)}),
}

# Quotes are words spoken in ES2002a (AMI manual annotations); segment ids exist only after transcription,
# so each evidence entry names the meeting and the second it starts.
SUGGESTIONS = {
    "ES2002a": (
        ("add_todo", {"text": "Confirm whether the 25 Euro selling price is wholesale or retail"},
         ("ES2002a@509", "selling price is is that wholesale or retail ? Like on the shelf .")),
        ("set_todo_status", {"status": "done"},
         ("ES2002a@92", "Oh I have to record who's here actually . So that's David , Andrew and Craig , isn't it ?")),
    ),
}
SUGGESTED_DONE = "Record who attended the kickoff"
