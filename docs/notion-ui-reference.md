# Notion notes and database reference

Observed 2026-10-17 in the user's signed-in Chromium session at `app.notion.com`. All interaction happened inside one new private page, "Stellis research scratch". This document keeps live browser observations, Notion's published guidance, and the proposed Stellis shape in separate sections. Account content outside that page is excluded.

## Method

- REA (`~/rea`, CLI 6.5.0) recorded passive evidence: target discovery `ev_67b53eae793499150455ea1ca2dc1773bc8df0772e4eb53116ceee1a521c21b8`, and the full-page board with accessibility text `ev_918b74d73177870a69661da6e1c1c924edfbfed19a883499bd1ffa73b075f675`.
- A page-level Chrome DevTools Protocol script performed the clicks and keystrokes and captured screenshots and accessibility trees. Playwright's `connectOverCDP` timed out while attaching to every target in this browser, so the script attached to the Notion tab alone.
- Notion's published help pages were downloaded and read in full: [Keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts), [Views, filters, sorts & groups](https://www.notion.com/help/views-filters-and-sorts), and [Intro to databases](https://www.notion.com/help/intro-to-databases).

## Observed: creating a page

- The compose button in the sidebar header opens a menu with four choices: Page, Chat, AI Meeting Notes, Database.
- Page creates an untitled page at the top of the sidebar's Private section and puts the cursor in the title. The URL gains `showMoveTo=true&saveParent=true`.
- An empty page shows a large grey "New page" title placeholder, Add icon and Add cover buttons on hover, and a bottom row labelled "Get started with": Ask AI, AI Meeting Notes, Database, Form, Templates, and a more menu.
- Typing the title updates the sidebar entry and the breadcrumb at once. Enter moves the cursor into the body.
- Each body line shows the placeholder "Press 'space' for AI or '/' for commands".
- A heading outline appears at the right edge of the page once headings exist.

## Observed: Markdown while typing

Each shortcut converts the moment its trailing space is typed. The raw characters are not kept.

| Typed | Result |
| --- | --- |
| `# `, `## `, `### ` | Heading 1, 2, 3 (the slash menu also lists Heading 4, `####`) |
| `- ` | Bulleted list |
| `1. ` | Numbered list |
| `[] ` | To-do checkbox |
| `> ` | Toggle list (not a quote) |
| `**text**`, `*text*`, `` `text` `` | Bold, italic, inline code |

- Enter inside a list continues the same list type. Enter on an empty item leaves the list.
- Backspace at the start of a block merges it into the block above.
- The published shortcut page adds `" ` for a quote, `---` for a divider, `~text~` for strikethrough, `a.` and `i.` for numbered lists, Tab and Shift+Tab to nest and un-nest blocks, `/turn` to change a block's type, and `/color` to colour text.

## Observed: the slash menu

- Typing `/` at the start of an empty block opens a menu anchored to the cursor. Typing after the slash filters the menu, for example `/database inline`. Each row shows its Markdown shortcut on the right, such as `#` or `[]`. Hovering a row shows a preview card with a one-line description. "Close menu (esc)" is pinned to the bottom.
- The menu's section order: Suggested; Basic blocks (Text, Heading 1 to 4, Bulleted list, Numbered list, To-do list, Toggle list, Page, Callout, Quote, Table, Divider, Link to page); Media (Image, Video, Audio, Code, File, Web bookmark); Database (Table, Board, Gallery, List, Feed, Dashboard, Calendar, Timeline and Map views; bar, line, donut and number charts; Form; Database inline; Database full page; Linked view of data source); Advanced blocks (Table of contents, Block equation, Button, Breadcrumb, Tabs, Synced block, Toggle heading 1 to 3, 2 to 5 columns, Mermaid code, AI Block); Inline (Mention a person, Mention a page or data source, Date or reminder, Emoji, Inline equation); Embed (about 50 third-party services); Synced Databases; Import (CSV, Text and Markdown, Confluence, Google Docs, Dropbox Paper).

## Observed: databases

- An inline database opens as a table with a grey "New database" title placeholder, one `Aa Name` column, a `+ Add property` header, and a `+ New page` row. Its controls are Open as full page, Settings, and a blue New button with a dropdown.
- An inline database becomes a child of its page in the sidebar tree.
- `+ Add property` opens a menu with a name field, an AI Autofill section (Summarize, Translate), and a "Select type" grid: Text, Number, Select, Multi-select, Status, Date, Person, Files & media, Checkbox, URL, Phone, Email, Relation, Rollup, Formula, Button, ID, Place, Created time, Last edited time, Created by, Last edited by, and four integration types.
- After the first property is added, the header button shrinks to `+`, and a toolbar appears: Filter, Sort, Automations, AI Autofill, Search, Open as full page, Settings.
- A new row's Status defaults to "Not started". The Status picker groups its options under To-do (Not started), In progress (In progress), and Complete (Done), and ends with Edit property.
- Selecting a row shows a floating bar: "1 selected", bulk-edit buttons for each property, Delete, and a more menu.
- The table widens into the page margin once its columns outgrow the text width.

## Observed: views

- The `+` beside the database title opens "Add a new view": Table, Board, Gallery, List, Chart, Dashboard, Timeline, Feed, Map, Calendar, Form, and New data source.
- Each view becomes a tab above the same rows. When the database is narrow, as beside an open side peek, the tabs collapse into one dropdown such as "Board ▾".
- A new Board groups by Status straight away. Each column shows the option's colour chip, a count, its cards, and its own `+ New page`.
- Creating a view opens a settings panel on the right: a View name field; a layout grid that converts the view in place; toggles for Show data source titles, Show page icon, Wrap all content and Color columns; and Group by (Status), Open pages in (Side peek), Load limit (25), Card preview (None), Card size (Medium), Card layout (Compact or List), Source (the database), and Done.
- The Settings menu is split into View settings (Layout, Property visibility, Filter, Sort, Group, Sub-group, Conditional color, Copy link to view) and Data source settings (Source, Edit properties, Automations, AI Autofill, Turn into, More settings, Manage data sources, Lock database, Manage in Calendar).
- The Filter button opens a searchable list of properties plus "Add advanced filter".
- A full-page database URL carries the view ID as `?v=<id>`, and its breadcrumb shows the parent page.
- The help page states that every view has its own settings, that filters and sorts can be saved for everyone or kept personal, that advanced filters nest AND and OR groups up to three levels, and that a full-page database lists its views as nested sidebar items marked with a dot.

## Observed: a row is a page

- Clicking a card opens it in a side peek, and the URL gains `?p=<row id>&pm=s`. The board stays usable on the left.
- The row page shows its title, then each property with "Empty" for unset values, then `+ Add a property`, then a Comments section, then an empty body with the prompt "Press 'enter' to continue with an empty page, or create a template".
- After content is added to a row's body, its card shows a page icon.
- The help page lists three ways to open rows: Side peek, Center peek, and Full page. Table, Board, List and Timeline default to side peek; Gallery and Calendar default to center peek.

## Observed: AI Meeting Notes

- AI Meeting Notes is a block that can be placed in any page. Inside the scratch database row it rendered a header reading "Meeting @Today" with a date control and an add-attendees control. Below the header were a Notes tab, an idea button, a settings button, and a split "Start transcribing" button. The body placeholder read "Notion AI will summarize the notes and transcript", and the footer had "Instructions: Auto" and a recording-consent line. Transcription was not started.
- The sidebar's Meetings tab lists New meeting note, Upcoming events (Connect your calendar), and an AI Meeting Notes index. The index included the block placed inside the database row, so meeting notes are gathered in one list wherever they are stored.

## Observed: embeds

Observed in a second pass on 2026-10-17, in the same scratch page. URLs were pasted with a real Cmd+V paste.

- **Pasting a URL** inserts it as an inline link first, then opens a "Paste as" menu next to it. A YouTube URL offers Mention, Embed video, Bookmark and URL. An ordinary web page offers Mention, URL, Bookmark and Embed. An image URL offers Mention, URL, Embed image and Bookmark. Escape keeps the plain link.
- **Embed video** replaces the link with a playable YouTube player, the full width of the text column, with the video title and channel over the poster frame.
- **Bookmark** renders a card the width of the text column: page title, description, favicon and URL on the left, and the page's preview image on the right.
- **Embed image** produces an image block the width of the text column. When the host refused the request (upload.wikimedia.org returned HTTP 429), the block stayed in place with "This image couldn't be loaded", a Learn more link, and the host name and error code.
- **Hovering an image** shows a toolbar in the block's top-right corner: Add a new comment, Set block alignment, Add a caption, Open block in full screen, Download file, and Open block actions menu. That menu lists Replace, Copy image, Download, Caption (⌘⌥M), Add link to image (⌘K), and More options.
- **`/table`** inserts a simple table, separate from a database, with 3 columns and 3 rows of empty cells. Gridlines are 1px light grey with generous cell padding, and there is no outer frame heavier than the gridlines. Clicking a cell edits it, with a blue cell outline; Tab selects the whole table. Unlabelled controls appear on the right and bottom edges on hover.
- **The table's block handle** (`⋮⋮`, left of the block) opens a menu with a "Search actions…" field and these items: Turn into database, Fit to width, Header row (toggle), Header column (toggle), Copy link to block (⌘⌃L), Duplicate (⌘D), Move to (⌘⇧P), Delete, Comment (⌘⇧M), Suggest edits (⌘⇧⌥X), and Ask AI (⌘J). The menu ends with the last editor, the edit time, and a word and character count.
- Each block has the same pair of hover handles on its left: `+` ("Click to add below. Option-click to add a block above") and `⋮⋮` ("Drag to move, click to open menu").

## Notion's storage format

Notion does not store pages as Markdown. Its API represents a page as a tree of block objects: JSON records with an `id`, a `parent`, a `type`, `has_children`, and type-specific content ([Block reference](https://developers.notion.com/reference/block)). Markdown is used at two edges:

- **Typing.** The shortcuts above convert text into blocks as it is typed, and the raw characters are discarded.
- **Exchange.** The API's markdown endpoints read and write whole pages as Markdown. The default dialect, [enhanced markdown](https://developers.notion.com/guides/data-apis/enhanced-markdown) (`markdown_version: "v1"`), adds XML-like tags for blocks that CommonMark cannot express: `<details><summary>` for toggles, `<callout icon color>`, `<columns><column>`, `<video src>`, `<audio>`, `<file>`, `<pdf>`, `<page>`, `<database>`, `<table_of_contents/>`, `{color="..."}` attributes, and tab-indented children. The preview dialect, [Notion-flavored Markdown](https://developers.notion.com/guides/data-apis/notion-flavored-markdown) (`v2`), is CommonMark plus GFM tables, task lists and strikethrough, with tags such as `<callout>`, `<toggle>`, `<columns>`, `<image>`, `<video>`, `<bookmark>`, `<embed>`, `<table>` and `<meeting-notes>`. The page says v2 "comes from the same source as the Notion MCP server's Markdown spec" and "is written for AI agents".

The toggle and callout question therefore exists for Notion too. Notion answers it with tags in its exchange format, not in its stored data.

## Stellis today

- Notes are Markdown in `meeting_notes`, one document per conversation or recording. Notes written ahead of a calendar meeting are kept in `event_notes`, keyed by provider and event ID, and become the recording's notes when Record starts from that meeting ([ADR 0057](decisions/0057-notes-before-a-meeting.md)). Both are edited in a Lexical rich-text editor with a toolbar (`src/stellis/static/notes-editor.js`). Tables, check lists, H2, lists, links and images are supported. The toolbar offers only H2; the Markdown heading shortcut also accepts `### ` and deeper, which makes a heading with no style in the editor theme (`theme.css:246-247` style H1 and H2 only). There is no slash menu, quote, toggle, callout, code block, divider, video embed or link card.
- Tables draw a 1px border on every cell, size to their content (`width: max-content`), and shade the header row (`theme.css:236-239`). Images sit in a padded, bordered card up to 580px wide with the image capped at 310px tall (`theme.css:240-243`). Notion draws tables as a light grid and images at full column width with no frame.
- Organisation consists of notebooks (at most one per conversation) and many-to-many categories, which Home shows as tags. The Home rail groups recent conversations by notebook, filters them by tag pills, and drags them onto tag and notebook cards. Stellis has no custom properties, saved views, or a standalone note that belongs to neither a recording nor a calendar meeting.

## Proposed Stellis shape

These are design inferences from the observations above, shaped by the user's direction of 2026-10-17. Nothing in this section is built.

### Direction from the user

- The focus is pretty Markdown pages, notebook logic, embeds, and basic views. Databases come later, as task trackers that agents co-author from meeting notes. Organising the conversation archive as a database remains under consideration.
- Notes exist without recordings. The sidebar carries Home, Chat and Meetings.
- Notebooks form a file structure. A notebook holds raw notes, raw transcripts, and derivatives (progress tracking, boards). Collections may group notebooks one level above.

### Structure

1. **Collection → Notebook → items.** A notebook lists three kinds of item: a **Note** (a page with no recording), a **Meeting** (a recording, with its transcript and the notes taken during it), and a **Derivative** (a summary, progress tracker or board produced from other items). Collections are optional folders of notebooks.
2. **Every item opens as the same kind of page:** title, a property line (date, kind, speakers for meetings, source items for derivatives), then the Markdown body. A meeting page keeps its transcript and notes tabs.
3. **Sidebar:** Home (collections and notebooks as a tree, with `+` to add a page inside), Chat, and Meetings (every meeting, wherever it is filed, as Notion's Meetings tab gathers every meeting-notes block).

### Pages and embeds, first

4. **Typing grammar:** the shortcut table above, a filterable slash menu showing each block's shortcut, Heading 3, Quote (`" `), Toggle (`> `), Callout, Code (```` ``` ````), Divider (`---`), Tab nesting, and the `+` and `⋮⋮` block handles with a searchable block menu.
5. **Paste-to-embed:** a pasted URL becomes a link first, with a "Paste as" menu offering Link, Bookmark, and Embed (video or image when the URL is one).
6. **Media blocks:** images at full column width with no frame, a caption, alignment and resize; video embeds for YouTube, Vimeo and Loom URLs and for local video files; bookmark cards with title, description, favicon and preview image.
7. **Tables:** a light grid, Header row and Header column toggles, Fit to width, and row and column add controls on the edges.

### Views, second

8. **Notebook views, List and Gallery first.** List shows each item's title, kind icon, date and first line. Gallery shows cards with a body or Summary preview, matching the card style Home already uses. Both sort by date and filter by kind.
9. **Calendar second.** Meetings already have dates, so a month view needs no new data.
10. **Board and Table wait for task databases,** since grouping needs a status property that only the agent-authored task databases will carry.

### Storage

11. **Markdown files stay the source of truth.** CommonMark plus GFM covers headings, lists, task lists, tables, quotes, code, dividers, links and images. The other blocks use syntax that GitHub or Obsidian already render, and Notion-flavored Markdown tags only where neither has one (decided 2026-10-17):

| Block | Stored as | Renders natively in |
| --- | --- | --- |
| Callout | `> [!note] Title` followed by `>` lines; any type word, as Obsidian allows | GitHub (NOTE, TIP, IMPORTANT, WARNING, CAUTION), Obsidian |
| Toggle | `<details><summary>Title</summary>` … `</details>` | GitHub, VS Code, browsers |
| Video | `![caption](https://www.youtube.com/watch?v=…)`; the same image syntax for Vimeo, Loom and local video files | Obsidian (YouTube) |
| Link card | `<bookmark url="…">caption</bookmark>` | none; Notion-flavored Markdown tag |
| Columns | `<columns><column>` … `</column></columns>` | none; Notion-flavored Markdown tag |

Anywhere these are not rendered, callouts fall back to block quotes and videos to links, so no content is lost. Stellis documents the exact subset it reads and writes in its own docs; import from and export to Notion go through a translator.

## Decided

- 2026-10-17: Bookmark cards and video embeds may contact the linked site. The user notes that Stellis already depends on Nebius; a fully offline version is a possible later roadmap item and is out of scope.
- 2026-10-17: Collections ship with the first notebook work.
- 2026-10-17: Blocks beyond GFM use GitHub and Obsidian syntax (callouts, toggles, videos), and Notion-flavored Markdown tags for link cards and columns. The table under Storage is the reference.

## Open decisions

- Whether any feature needs a library that is not already a dependency, such as a board drag-and-drop or calendar component. Each such library goes to the user for a decision before it is used.
