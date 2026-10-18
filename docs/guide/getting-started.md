# Getting started

## Start Stellis

Stellis needs [uv](https://docs.astral.sh/uv/getting-started/installation/), which installs Python 3.12 and every other dependency. From the repository folder, run:

```sh
uv run stellis
```

Open <http://127.0.0.1:8765/>. The first start downloads the speech models, about 500 MB. The home page shows the progress, and recordings transcribe as soon as the download finishes.

## Create your account

The first visit shows **Sign up**. Enter a username and a password of at least 12 characters. This creates the one account for this computer's Stellis data. Later visits show **Sign in**, and a sign-in lasts seven days. Stellis has no password reset.

## Add a Nebius Token Factory key

Summaries, questions about a conversation, transcript cleanup, automatic tags, and to-do suggestions need a Nebius Token Factory API key. Recording, importing, transcribing, notes, and to-dos work without one.

1. Open the [API keys page](https://tokenfactory.nebius.com/project/api-keys) in the Token Factory console.
2. Create a project-based key. Keys created before Nebius introduced projects no longer work.
3. Copy the key at once, because Nebius shows it only once.
4. In Stellis, open **Account settings**, find **AI features**, paste the key into **Nebius API key**, and select **Save key**.

Stellis saves the key in its private data folder, readable only by your user account, and never shows it again. The tour offers the same field on its second step.

## Load the sample workspace

The sample workspace gives you something to look at before you record anything. Select **Add sample workspace** on Home, in the tour, or in **Account settings**. It adds:

- Collections, notebooks, notes, to-dos, tags, and suggestions to review, all invented.
- Three recorded design meetings from the [AMI Meeting Corpus](https://groups.inf.ed.ac.uk/ami/corpus/), about 110 MB in total, licensed under CC BY 4.0. Each meeting's notes credit the corpus.

The notes and to-dos appear at once and need no internet connection or key. The meetings download first and then transcribe on your computer, and each meeting card shows its progress. **Remove sample workspace** in **Account settings** deletes only what the sample added.

## Take the tour

A new account opens a tour with eight steps: welcome, the Nebius key, the sample workspace, the sidebar, Home, writing a note, a meeting, and a closing step. The sample workspace step is skipped once the sample exists, and the meeting step appears only when the workspace has a meeting.

- Select **Next** and **Back**, or press the right and left arrow keys when no text field has focus.
- Select **Skip tour** or press Esc to close it.
- To run it again, open the **⋯** menu on Home and select **Take the tour**.

Continue with the [interface](interface.md).
