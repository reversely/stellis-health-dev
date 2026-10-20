# Agent deployment versions

The owner requested two versions on 2026-10-20. Select one explicitly with `STELLIS_RUNTIME_PROFILE`. Both retain Stellis agents, editable instructions, notebook scope, memory, durable jobs, source validation and cancellation. They never automatically fall back to one another.

| Version | Agent execution | Model inference | Settings label |
| --- | --- | --- | --- |
| `cloud` | OpenClaw inside NemoClaw/OpenShell on Nebius Cloud | Nebius Token Factory | Nebius Cloud + Token Factory |
| `local` | OpenClaw inside NemoClaw/OpenShell on GN100 | GN100 Ollama | GN100 + local inference |

The Mac is a browser/SSH client. Development, dependencies and local models stay on GN100. The existing live service was not redeployed. An unset profile preserves its previous configuration during migration and Settings labels it **GN100 + Token Factory (existing configuration)**; it is not evidence of local inference.

## Local version

The independent `stellis-local` sandbox is installed on GN100. NemoClaw's port-scoped gateway is `8990`, its control UI port is `18890`, and its provider is `ollama-local` with `nemotron-3-nano:latest`. The original gateway on `8080` and `stellis-claw` retain their Token Factory route.

Start a separate Stellis process from a checkout containing this change, using `deploy/profiles/local.env.example` as an environment file. Give it a separate data directory, link the existing speech models, and choose an unused port. Do not point it at `~/stellis-data`. The example sets `NEMOCLAW_GATEWAY_PORT=8990`; omitting that variable selects the original gateway.

```sh
set -a
. deploy/profiles/local.env.example
set +a
mkdir -p "$STELLIS_DATA_DIR"
ln -sfn /home/springbuilt/stellis-data/models "$STELLIS_DATA_DIR/models"
/home/springbuilt/.local/bin/uv run --locked stellis --port 8821
```

`STELLIS_LOCAL_INFERENCE_URL` must be a loopback URL, defaulting to `http://127.0.0.1:11434/v1`. `STELLIS_LOCAL_INFERENCE_MODEL` defaults to the installed Nemotron Nano. Saved Nebius credentials are not sent to Ollama. Summaries, transcript questions, cleanup, enhanced notes and to-do extraction use the local model; category scoring uses Ollama's native `/api/generate` token probabilities. An uncertain category remains Unclear. Model IDs are saved with results and included in cache identities.

Local inference does not mean offline: separately enabled Gmail, Calendar, search and other tools may contact their services. The new local sandbox has no copied live mailbox or Tavily credentials. Register its tools separately before enabling research readiness. Application Settings retains local MCP management only for the local runtime, and saving a Nebius key cannot replace an explicitly local inference route.

## Cloud version

Use `deploy/profiles/cloud.env.example` for the Stellis server. Inject the HTTPS gateway origin and bearer token from a secret store, and bind both `STELLIS_ACCOUNT_ID` and `STELLIS_AGENT_GATEWAY_ACCOUNT_ID` to the deployment's account. Owner gateway credentials are removed from other account processes. Tokens and gateway URLs never enter browser responses.

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
