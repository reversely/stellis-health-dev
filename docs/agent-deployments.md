# Agent deployment versions

Use [Launch local or cloud](launch.md) for the supported launch commands and configuration checks. The two managed versions are explicit: `local` runs NemoClaw/OpenClaw and Ollama on GN100; `cloud` runs NemoClaw/OpenClaw on Nebius Cloud with Token Factory inference. Speech currently runs on the Stellis host in both versions. [Serverless speech integration](../plans/nebius-cloud-integration.md) is the next workstream.

`direct` is a separate legacy Token Factory mode with no agent sandbox. The current Fly configuration still selects it. Launching a managed version does not migrate or deploy that service. An unset profile preserves the legacy GN100-agent/Token-Factory configuration; use explicit profiles for new processes. Demo completions bypass managed agent execution and cannot verify the sandbox.

The historical evidence below records earlier local sandbox checks and the cloud provisioning gaps. It is not a fresh readiness check of either service.

## Local version

The independent `stellis-local` sandbox is installed on GN100. NemoClaw's port-scoped gateway is `8990`, its control UI port is `18890`, and its provider is `ollama-local` with `nemotron-3-nano:latest`. The original gateway on `8080` and `stellis-claw` retain their Token Factory route.

Initialize and edit `.private/local.env`, then use `uv run --locked stellis launch local`. The default app port is 8821. Retain the independent gateway port 8990 and choose a separate data directory. Configure paths to existing speech assets if reusing them. Do not point the new process at `~/stellis-data`.

`STELLIS_LOCAL_INFERENCE_URL` must be a loopback URL, defaulting to `http://127.0.0.1:11434/v1`. `STELLIS_LOCAL_INFERENCE_MODEL` defaults to the installed Nemotron Nano. Saved Nebius credentials are not sent to Ollama. Summaries, transcript questions, cleanup, enhanced notes and to-do extraction use the local model; category scoring uses Ollama's native `/api/generate` token probabilities. An uncertain category remains Unclear. Model IDs are saved with results and included in cache identities.

Local inference does not mean offline: separately enabled Gmail, Calendar, search and other tools may contact their services. The new local sandbox has no copied live mailbox or Tavily credentials. Register its tools separately before enabling research readiness. Application Settings retains local MCP management only for the local runtime, and saving a Nebius key cannot replace an explicitly local inference route.

## Cloud version

Initialize `.private/cloud.env` with `stellis launch cloud --init`; `deploy/profiles/cloud.env.example` is the checked-in reference. Inject the HTTPS gateway origin and bearer token from a secret store, and bind both `STELLIS_ACCOUNT_ID` and `STELLIS_AGENT_GATEWAY_ACCOUNT_ID` to the deployment's account. Owner gateway credentials are removed from other account processes. Tokens and gateway URLs never enter browser responses.

The cloud VM must host the real NemoClaw/OpenShell runtime, with persisted gateway and sandbox state. A CPU VM is sufficient when model inference is entirely on Token Factory; a GPU model server is not part of this version. Provisioning remains pending the owner's Nebius project and a reviewed resource/cost plan. Do not deploy an unreviewed mutable third-party container or assume a serverless container supports OpenShell's isolation requirements.

Enable the documented OpenClaw gateway endpoint on the cloud sandbox:

```json
{"gateway":{"http":{"endpoints":{"responses":{"enabled":true}}}}}
```

Preserve the rest of the gateway configuration. Put an authenticated TLS ingress in front of it; do not publish the operator gateway token to a browser. Configure the sandbox's OpenShell inference provider to `https://api.tokenfactory.nebius.com/v1`, with its own protected Token Factory credential. The client's saved transcript-inference key and the cloud runtime's provider credential are separate. Client key rotation does not silently mutate the cloud deployment.

Chat, recording questions, delegated research and writing-style drafts call `POST /v1/responses`, using `openclaw/main` and a unique `x-openclaw-session-key` per Stellis job. The client rejects redirects, incomplete replies, oversized output and untrusted citation links. Closing the HTTP request on cancellation propagates cancellation to OpenClaw. There is no local CLI fallback. Cloud MCP tools are administered on the cloud host; set `STELLIS_AGENT_GATEWAY_TAVILY_READY=1` only after verifying registration and an actual tool call.

## Evidence and remaining work

- GN100: NemoClaw 0.0.135, OpenShell 0.0.116, OpenClaw 2026.9.2, Ollama 0.33.2.
- Official installed OpenClaw sandbox image: `ghcr.io/nvidia/nemoclaw/openclaw-sandbox@sha256:d9756531bc346aa956ed127d7dab577f29cc66273408e617081b7bc1a616049e`.
- Real local transcript-inference request returned valid structured JSON using Nemotron Nano.
- Real local agent turn returned the correct 17 psi answer, a validated notebook-source citation and a succeeded durable job.
- Real local categorization completed and abstained as Unclear for the short test excerpt; this is not a quality-parity claim.
- Read-only Token Factory `/v1/models` returned HTTP 200 and 28 models. Nebius Cloud SDK tenant listing succeeded with zero visible tenants for that credential.
- Cloud deployment, real cloud agent/tool calls, cancellation and restart persistence still need validation after the project is available. Issue #406 stays open until then.
- Tutor interaction and agent-management requirements remain tracked in #395 and #394. This deployment split does not complete those features.

References: [OpenClaw Responses API](https://docs.openclaw.ai/gateway/openresponses-http-api), [NVIDIA remote deployment](https://docs.nvidia.com/nemoclaw/user-guide/openclaw/deployment/deploy-to-remote-gpu), [Ollama native API schema](https://github.com/ollama/ollama/blob/main/docs/openapi.yaml). Installed NemoClaw `docs/reference/architecture.mdx` documents independent port-scoped gateways; CLI help and live inference reports were inspected before creating the separate local sandbox.
