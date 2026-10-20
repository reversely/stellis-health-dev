# Privacy

## Where the workspace lives

Your recordings, transcripts, notes, to-dos, speaker data, agent memory, and saved replies live on the machine running the Stellis service. In the configured local deployment, that machine is GN100, even when you use a browser on your Mac. Browser recordings and shared screen frames travel to that service through your connection.

The service normally listens on loopback. The GN100 deployment uses an SSH tunnel for browser access. Data lives under the configured `STELLIS_DATA_DIR`; the separate local deployment uses `~/stellis-local-data` on GN100. Account data and connection credentials are kept in private service storage. Access through a tunnel is not end-to-end encrypted workspace synchronization.

## Completely local inference

With the explicit local profile, speech processing, agent replies, transcript AI, and Tutor screen reading run on GN100. Local language-model requests use the configured loopback endpoint; agent work runs through the local NemoClaw-managed OpenClaw runtime. A Token Factory key is not required, and inference does not fall back to Nebius if a local model is unavailable.

A Tutor processes the screenshot or window frame you choose to share locally, then saves a source-backed text observation for its teaching reply. Stopping sharing stops further capture; it does not delete observations or replies already saved in the workspace.

Local inference does not mean every feature is offline. Optional connections and embedded content can still contact external services as described below.

## Nebius Cloud + Token Factory

The separate cloud profile sends the text needed for an AI task to its configured cloud agent runtime or Token Factory endpoint. Relevant content may include transcript passages, notes, selected connected sources, and agent context. Speech processing remains on the Stellis service host. Cloud mode does not use a local NemoClaw installation as a fallback.

**Account settings → AI features** identifies the profile. **Models and routing → Check connections** distinguishes configured routes from observed runtime responses. The new cloud deployment remains unverified until its project and credentials are configured.

## Optional external connections

- Google connections read authorized mail and calendar data. Onboarding analyzes selected source windows and files only the groups you accept. These reads contact Google even with local inference. Explicit mail or demo-calendar actions can write to Google; local mode is not a read-only guarantee for connected services.
- Configured web research can send search and extraction requests to Tavily through the managed agent runtime. Connecting a service and selecting local inference are separate choices.
- A link card fetches the linked page's metadata through Stellis; its preview image can load from the linked site in your browser.
- Video embeds load the external site's player. Images embedded from a web address load from that address without a referrer.
- Installing models or the sample recordings requires downloading their files. Existing installed speech assets can be reused without downloading them again.

## Request history and saved content

**Recent requests** stores bounded execution metadata: steps, model identity, status, duration, and numeric usage when reported. It excludes prompts, answers, and reasoning text. The UI shows the latest 50 traces; storage retains up to 500 finished traces. **Clear history** clears these traces, not saved chats, notes, source observations, or agent memory. Manage those through their own controls.

## Export and synchronization

**Export Markdown** and **Export for Stellis** create a ZIP file for your browser to download. Automatic encrypted cross-device workspace synchronization is not implemented. Opening the same GN100 service from another browser accesses that service's workspace rather than syncing a separate local copy.
