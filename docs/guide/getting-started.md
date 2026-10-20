# Getting started

## Open Stellis

For the configured GN100 local deployment, open <http://localhost:8821> through the existing SSH tunnel. The browser is on your Mac; the service, workspace data, agents, and inference run on GN100. Reuse the tunnel rather than reconnecting Tailscale for each request.

For another installation, follow [the deployment setup](../gn100.md). The operator selects the local or cloud profile; this is not a browser toggle. A bare `uv run stellis` does not by itself configure the managed agent runtime or prove local inference.

## Create your account

Select **Sign up** and enter a username and password of at least 12 characters. Each account has its own workspace. Later visits use **Sign in**. Stellis has no password-reset flow.

## Set up your workspace

1. Continue from Welcome and choose what you will use Stellis for, or choose **Start empty**.
2. Check the inference mode. **Completely local inference** means models run on GN100 and no cloud inference key is needed. Select **Check setup** to ask the managed agent for a real reply. Installed speech models are reported separately; an installed label is not a transcription benchmark.
3. Connections are optional. Connecting Google allows the authorized mail and calendar reads; those requests still contact Google even when inference is local. Cloud mode offers a **Nebius Token Factory** key field. You can continue without AI and finish configuring it later.
4. **Review your notebooks** before creating anything. Starter notebooks come from your selected uses. If you review connected sources, choose the proposed groups to file; source analysis and filing are separate steps. Bulk mail can be excluded, and the scan shows progress.
5. Select **Set up … notebooks** or **Open workspace**. The contextual tour then points to the actual workspace controls. Setup choices and completion are saved for your account, so reopening setup does not create the same notebooks again.

The Learning choice includes an Onshape learning plan and a Tutor. In Chat, choose the Tutor and share a screenshot or window when you want visual guidance. Screen reading and the teaching reply use separate local model routes. Stop sharing when finished.

## Check models and agent requests

Open **Account settings**:

- **AI features** identifies the runtime profile. The configured GN100 deployment uses completely local inference. The separate cloud profile uses Nebius Cloud agents and Token Factory inference; its live deployment awaits the owner's cloud project.
- **Models and routing** shows configured routes. Select **Check connections** for observed availability and model identities. In local mode, the runtime owner can select an installed tool-capable **Local model**, then **Use model**. This changes the agent and transcript model after runtime confirmation; it does not change the speech or screen-reading models. Wait for active requests to finish before switching.
- **Recent requests** shows execution steps, outcome, duration, and token counts when reported. These traces do not store prompt or response text. **Clear history** clears traces, not your conversations or agent memory.

For cloud inference, paste a project key from the [Token Factory console](https://tokenfactory.nebius.com/project/api-keys) into **Nebius API key** and select **Save key**. Saving a key is separate from successfully checking the configured agent deployment. Local mode needs no Token Factory key and does not fall back to cloud inference.

Open agent settings from Chat to choose templates, edit instructions, assign notebooks, manage memory, or turn an agent off. Copies keep their own identity, thread, and memory.

## Load the sample workspace

**Add sample workspace** on Home or in **Account settings** adds invented notebooks, notes, to-dos, tags, and suggestions, plus three recordings from the [AMI Meeting Corpus](https://groups.inf.ed.ac.uk/ami/corpus/). The recordings download before local transcription; their notes credit the corpus. **Remove sample workspace** removes what the sample added. Samples are separate from first-run notebook setup.

## Take the tour

The tour covers the sidebar, Home, agents, Chat, agent settings, writing a note, and a meeting when one is available. It skips controls that are absent.

- Use **Next** and **Back**, or the right and left arrow keys outside a text field.
- Select **Skip tour** or press Esc to close it.
- Open Home's **⋯** menu and select **Take the tour** to run it again.

Tour progress is saved per account in this browser. This is separate from the account's durable first-run setup.

Continue with the [interface](interface.md).
