# Keyboard and Markdown shortcuts

On Windows and Linux, press Ctrl where the table shows ⌘. A typed Markdown shortcut starts a line unless the table says it works inside a line. A slash menu for inserting blocks is planned.

| Shortcut | Where | Result |
| --- | --- | --- |
| `#` to `######` and a space | Notes | Heading, level 1 to 6 |
| `> ` | Notes | Block quote |
| ```` ``` ```` and a space, with an optional language such as `js` | Notes | Code block |
| `- `, `* `, or `+ ` | Notes | Bullet list |
| `1. ` | Notes | Numbered list |
| `[] ` or `[ ] ` | Notes | Open to-do |
| `[x] ` | Notes | Completed to-do. At the start of an existing to-do line, it completes that line. |
| `[-] ` | Notes | Canceled to-do. At the start of an existing to-do line, it cancels that line. |
| `---`, `***`, or `___` and a space | Notes | Divider |
| `> [!tip] Title`, then Enter | Notes | Callout. The word in brackets sets the kind: note, tip, important, warning, or caution. |
| `**text**` | Notes, inside a line | Bold |
| `*text*` | Notes, inside a line | Italic |
| `***text***` | Notes, inside a line | Bold and italic |
| `~~text~~` | Notes, inside a line | Strikethrough |
| `` `text` `` | Notes, inside a line | Inline code |
| `[text](address)` | Notes, inside a line | Link |
| ⌘B | Notes | Bold the selection |
| ⌘I | Notes | Italic the selection |
| ⌘Z | Notes | Undo |
| ⌘⇧Z | Notes | Redo |
| ⌘D | To-do lines in Notes | Complete the selected to-dos. Pressed again when all are completed, reopens them. |
| ⌘⇧D | To-do lines in Notes | Cancel the selected to-dos. Pressed again when all are canceled, reopens them. |
| Enter | Title of a note | Move to the text of the note |
| Enter | Title line of a callout | Move to the callout body |
| Enter on an empty last line | Callout body | Leave the callout |
| Esc | Notes | Leave the editor |
| Paste a web address (`http` or `https`) | Notes | Insert a link and open the **Paste as** menu |
| ↑ and ↓, then Enter | **Paste as** menu | Choose **Link**, **Embed video** for a video address, **Embed image** for an image address, or **Bookmark** |
| Esc | **Paste as** menu | Close the menu and keep the link |
| ← and → | Seek slider in a meeting, with focus on the slider | Go back or forward 10 seconds |
| Enter | **Find in transcript** field | Go to the next match |
| ⇧Enter | **Find in transcript** field | Go to the previous match |
| → and ← | Tour, when no text field has focus | Next step and previous step |
| Esc | Tour | Skip the tour |
| Esc | Open menus and pickers | Close the menu |

Copying or cutting text in a note puts plain Markdown on the clipboard, without to-do IDs.
