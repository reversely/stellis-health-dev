# Stellis

Stellis records and imports conversations, transcribes them on your Mac, and keeps them searchable with speakers, notes, and summaries. Recordings, audio, and transcription stay on your computer. Summaries, chat, and automatic categories use the Nebius API with a key you provide, and only the transcript text those features need is sent.

Stellis runs as a small local web app: a service on your computer, opened in your browser at `http://127.0.0.1:8765`.

## What you can do

- **Capture:** record from the microphone, or import MP3 files up to 1 GB. A live provisional transcript appears while you record.
- **Transcribe:** English transcription with word timings, and speakers grouped by voice. Stellis suggests a known person when a speaker sounds like someone you have named before; one click confirms it.
- **Review:** play from any word, search inside a conversation, highlight, comment, edit the transcript, and name speakers. Skip Silence shortens playback.
- **Organise:** conversations are grouped by type (Meetings, Interviews, Workshops, Briefings, Calls) on the home page, and you can collect them into notebooks for each project. Search covers every conversation.
- **Notes and AI:** write notes while recording or after. With a Nebius key, Stellis writes a summary with links back to the transcript, answers questions about a conversation, and can sort conversations into types automatically.
- **Calendar:** connect a Google or Outlook calendar to see upcoming meetings on the home page and start a recording from one.

## Requirements

- macOS on Apple silicon, and [uv](https://docs.astral.sh/uv/getting-started/installation/)
- About 1.5 GB of free disk space for the app and its speech models
- Optional: a [Nebius](https://nebius.com) API key for summaries, chat, and categories

uv installs Python 3.12, FFmpeg, and whisper.cpp for Stellis, so nothing else needs installing.

## Run

```sh
git clone https://github.com/reversely/stellis.git
cd stellis
uv run stellis
```

Open <http://127.0.0.1:8765/>. The first start downloads the speech models (about 500 MB) and checks each file's SHA-256 digest; the home page shows the progress, and recordings transcribe as soon as it finishes. `uv run stellis setup` downloads them in advance, and `uv run stellis doctor` reports what is installed.

The first visit asks you to **Sign up**: this creates the one account for this computer's Stellis data. Later visits use **Sign in**, and a sign-in lasts seven days. Passwords need at least 12 characters, and there is no password reset, so keep yours safe.

To use AI features, open **Account settings → AI features** and paste your Nebius API key. Stellis saves it in its private data folder, readable only by your user account, and never shows it again.

### Sample workspace

To try Stellis before using any recordings of yours, click **Add sample workspace** on the home page (or in **Account settings**). It adds two collections, four notebooks, notes, to-dos, tags, and suggestions to review, all invented, and downloads three meetings from the [AMI Meeting Corpus](https://groups.inf.ed.ac.uk/ami/corpus/), about 110 MB, checking each file and filing them in notebooks. The notes work without an internet connection or an AI key; the meetings need the download. Each meeting card shows its transcription progress. The AMI corpus is licensed under CC BY 4.0; each sample meeting's notes credit it. **Remove sample workspace** in **Account settings** deletes only what the sample added.

## Everyday use

- **Record** or **Import** from the home page. Transcription starts by itself once the recording is saved.
- Open a conversation for its **Notes** (your notes and the summary) and **Transcript**. Click a speaker name to name that speaker or confirm a suggestion. **Edit transcript** saves wording changes.
- The **⋯** menu in a conversation reprocesses the recording, rematches speakers, moves it to a notebook, or deletes it. Reprocessing keeps your names, edits, highlights, and comments.
- **Account settings** manages your profile and password, custom vocabulary (names and terms that help transcription), AI features, calendars, and account deletion.
- Deleted conversations stay in **Recently Deleted** for 30 days.

## Calendars

Stellis reads the next 14 days from one Google or Outlook calendar. It never writes events or sends calendar details anywhere. Connecting needs an OAuth client that you create:

- **Google:** create a [Desktop OAuth client](https://developers.google.com/identity/protocols/oauth2/native-app) with the Calendar API enabled, then start Stellis with `GOOGLE_OAUTH_CLIENT_ID` (and `GOOGLE_OAUTH_CLIENT_SECRET` if the client has one) set in the environment.
- **Outlook:** register a [Microsoft desktop public client](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration) with the redirect `http://localhost/api/v1/calendar/microsoft/callback`, then set `STELLIS_MICROSOFT_CALENDAR_CLIENT_ID`.

Calendar tokens are stored in the private data folder. **Disconnect** deletes them; revoke access in your Google or Microsoft account to remove the grant too.

## Your data

Everything lives in `~/Library/Application Support/Stellis`. Set `STELLIS_DATA_DIR` to use another folder, and keep it the same across restarts. The service listens only on `127.0.0.1`, so other computers cannot reach it.

| Data | Where it goes |
| --- | --- |
| Audio, recordings, transcripts, notes, speaker voices | Stays on this computer |
| Transcript and note text for summaries, chat, and categories | Sent to Nebius with your key, when you use those features |
| Calendar events | Read from your calendar provider; stays on this computer |

## Limits

- Transcription and speaker models are English only.
- Speaker groups and suggestions are automatic and can be wrong; names you confirm stay fixed.
- AI summaries can be wrong. Use their links to check the transcript and audio before you rely on them.

## More

- [How Stellis works](docs/architecture.md)
- Run the tests with `uv run python -m unittest discover -s tests`.
- Licensed under the [Apache License 2.0](LICENSE). Third-party models, tools, and sample data are listed in [NOTICE](NOTICE).
