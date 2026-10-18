# Privacy

Stellis runs as a service on your computer and listens only on `127.0.0.1`, so other computers on your network cannot reach it.

## What stays on your computer

- Audio, recordings, transcripts, notes, to-dos, and speaker voices.
- Transcription and speaker grouping. Both run on this computer.
- Calendar events. Stellis reads the next 14 days from one Google or Outlook calendar, never writes events, and keeps calendar tokens in its private data folder.
- Your Nebius API key, stored in the private data folder.

All of it lives in `~/Library/Application Support/Stellis`, or in the folder named by `STELLIS_DATA_DIR`.

## What goes to Nebius

When you use an AI feature, Stellis sends Nebius the transcript or note text that feature needs, with your API key. The features are summaries, questions about a conversation, transcript cleanup, automatic tags, and to-do suggestions. Audio stays on this device. Without a key, Stellis sends no text.

## What contacts other sites

- A link card makes the Stellis service fetch the linked page's title, description, and preview image, and your browser loads that preview image from the linked site.
- A video embed loads the video player from the video site in your browser.
- An image embedded from a web address loads from that address, without a referrer.


## Syncing

Stellis does not sync anything to another device or service. **Export Markdown** and **Export for Stellis** write a ZIP file that your browser downloads.
