# Interface

## Sidebar

The sidebar on the left holds the whole library.

- **Meetings** and **To-dos** stay pinned at the top. Meetings opens Home, and To-dos opens the full to-do list.
- Below the pinned rows, tag pills filter the sidebar and the Recent conversations list by tag.
- **Library** shows collections, which hold notebooks, and notebooks, which hold meetings and notes. A notebook that belongs to no collection sits under **Notebooks**, and items that belong to no notebook sit under **No notebook**. Each row shows a count.
- Drag a row onto a notebook to move it, or use the row's **Move to** button.
- **New collection** at the bottom creates a collection. **Account settings** opens your profile, password, custom vocabulary, AI features, date format, sample workspace, calendars, and account deletion.

## Home

Home has a search box, **New note**, and **Record**. The arrow beside Record offers **Import recording**. Below them, widgets show:

- **To-dos**: tabs for Open, Completed, and Canceled, a field to add a to-do, and every to-do grouped by notebook with its due date.
- **Coming up**: upcoming meetings from a connected calendar.
- **Notebooks**: one card per notebook, grouped by collection, with its latest notes and meetings and a **+** button to add a note.
- **Recent conversations**: the latest conversations.
- **Tags**: conversations grouped by tag. Drag a conversation onto a tag to apply it.

The **⋯** menu on Home holds:

- **Edit widgets**: choose which widgets Home shows. The choice is saved in this browser.
- **Custom vocabulary**: names and terms that help transcription.
- **Tags**, **People**, and **Recently deleted**.
- **Take the tour**.

## Collections and notebooks

A collection groups notebooks. A notebook groups meetings and notes for one project. A notebook has one colour, one collection or none, and one setting for to-do suggestions.

- Create a notebook with **+** beside Notebooks on Home. Choose a name and a colour.
- Open a notebook from the sidebar or its card. The notebook page has **New note**, **Record**, and a **⋯** menu with **Add a conversation**, **Settings**, **Export Markdown**, **Export for Stellis**, and **Delete**. The **Overview** tab shows the latest summary and a table of notes and meetings with their tags and to-do counts. The **List** tab lists the same items.
- **Settings** sets the name, the colour, the collection, and **Suggest to-dos from meetings**. The colour is one of the preset swatches or a custom `#RRGGBB` value, entered as text or picked on the colour wheel.

## Notes

A note is a titled page of Markdown with no audio. **New note** on Home or on a notebook page creates one. The title is above the text, and Enter in the title moves to the text.

The toolbar above a note offers heading, paragraph, bullets, numbers, to-do list, bold, italic, **Link**, **Image**, **Table**, **Link card**, **Toggle**, **2 columns**, and **Callout** with five kinds: Note, Tip, Important, Warning, and Caution. While the cursor is in a table, **Edit table** adds or removes rows and columns or deletes the table. Typing `/` on an empty line or after a space opens the slash menu with the same blocks and more. The editor also reads typed Markdown; see [shortcuts](shortcuts.md).

Notes save as you type. Copying text from a note puts plain Markdown on the clipboard without to-do IDs.

## Meetings

A meeting is a recording or an imported audio file with a transcript. Open one from Home, the sidebar, or a notebook. A player at the top has back 5 seconds, play, forward 5 seconds, playback speed, and **Skip Silence**.

The meeting has three tabs.

- **Notes** has two views. **My Notes** holds your notes, with the same toolbar as a note and the meeting's to-dos beneath. **Summary** holds the AI summary, with links back to the transcript. A summary needs a Nebius key.
- **Transcript** holds the words with speakers. Click a word to play from there. **Find in transcript** searches within the meeting. **Edit transcript** changes wording, and clicking a speaker name names the speaker or confirms a suggestion. You can highlight passages, comment, and add an image.
- **Edited Transcript** holds a cleaned copy. Select **Clean transcript** under **Conversation insights** to create it. The original transcript stays unchanged, and **Use exact source** restores the original wording for one passage. Check the audio before quoting an edited passage.

**Ask about this conversation** answers a question from the meeting's transcript. The **⋯** menu on a meeting reprocesses the recording, rematches speakers, moves it to a notebook, or deletes it.

## To-dos

A to-do is a line in a note that starts with a check box. Type `[] ` at the start of a line to make one.

- Type a date in words anywhere in the line, such as "Send the draft tomorrow at 3pm". The date and time show at the right of the line, and the to-do appears on Home and on the To-dos page with that date. A date such as "tomorrow" keeps the day on which you typed it.
- A to-do is open, completed, or canceled. Press ⌘D to complete it, ⌘⇧D to cancel it, or use the **⋯** button that appears beside the line to choose **Complete**, **Cancel**, or **Reopen**. A canceled to-do shows struck through and appears under Canceled.
- The To-dos widget on Home and the To-dos page list the to-dos of every note. Add one with **New to-do** or **Add a to-do**; it goes into a note named To-dos.
- The date format of lists is set in **Account settings** under **Date format**, in this browser.

## Suggestions and the Transcript Agent

When a summary succeeds for a meeting, the Transcript Agent reads the meeting and suggests to-do changes for its notes. A line reading "Transcript Agent is reading this meeting" shows while it works.

- A suggestion either adds a to-do or marks an existing to-do done, canceled, or open. It shows as a card beside the notes, with a link to the point in the transcript that prompted it.
- The check button accepts the suggestion and the x button rejects it. A suggested new to-do can be edited before you accept it.
- Suggestions appear only for notebooks where **Suggest to-dos from meetings** is **On**. In a notebook that belongs to a collection, the options are **Like** followed by the collection's name, **On**, and **Off**. In a notebook with no collection, they are **Off** and **On**.
- The agent needs a Nebius key.

## Recently Deleted

Deleting a meeting or a note moves it to **Recently Deleted**, in the **⋯** menu on Home. Items stay there for 30 days and are then deleted. **Restore** puts an item back. **Delete permanently** removes it at once.

## Export

The **⋯** menu on a notebook page has two exports. Each downloads a ZIP file of the notebook's notes and meetings as Markdown files, with their images.

- **Export Markdown** writes plain Markdown for other tools. To-do IDs are removed and link cards become links.
- **Export for Stellis** keeps to-do IDs and Stellis block tags so the files can be imported into Stellis later.

A meeting exports with its notes and its latest summary. Transcripts and audio are not exported.

## Search

The search box on Home needs at least two characters. It searches people, meeting titles, notes, summaries, speakers, transcript passages, and note pages. A menu limits the results to All results, Conversations, Passages, Speakers, or People. Inside a meeting, **Find in transcript** searches that meeting only.
