# Launch local or cloud

Choose one version explicitly. Both use the same Stellis app and account features.

| Version | Agent execution | Model inference | Speech today | Default app port |
| --- | --- | --- | --- | --- |
| `local` | OpenClaw inside NemoClaw/OpenShell on GN100 | GN100 Ollama | Workers on the Stellis host | 8821 |
| `cloud` | OpenClaw inside NemoClaw/OpenShell on Nebius Cloud | Nebius Token Factory | Workers on the Stellis host | 8822 |

**NemoClaw with Token Factory** means that NemoClaw manages the agent runtime and routes its model requests to Token Factory. Token Factory provides model inference; it does not host the NemoClaw sandbox. Nebius Serverless AI speech is the next integration, described in [the cloud integration plan](../plans/nebius-cloud-integration.md).

## Local

Run on GN100 with the installed NemoClaw runtime and local Ollama models:

```sh
uv run --locked stellis launch local --init
```

Edit `.private/local.env` to match the installed sandbox, gateway port and model. Set the optional speech model paths from your existing installation to reuse its files. Then:

```sh
uv run --locked stellis launch local --check
uv run --locked stellis launch local
```

Open <http://127.0.0.1:8821>. Data defaults to `~/.local/share/stellis/local`. Missing speech assets download through the existing setup flow. `--init` creates configuration; it does not provision NemoClaw or download an Ollama model. Inspect `nemoclaw --help` and `nemoclaw onboard --help` for the installed runtime when provisioning a new sandbox. This health checkout does not contain the historical local provisioning script described in ADR 0083; initialization here only writes the launch configuration.

## Cloud

On the machine running the Stellis backend:

```sh
uv run --locked stellis launch cloud --init
```

Edit `.private/cloud.env` and provide:

- `STELLIS_AGENT_GATEWAY_URL`: the authenticated HTTPS origin of the cloud OpenClaw gateway managed by NemoClaw.
- `STELLIS_AGENT_GATEWAY_TOKEN`: that gateway's protected credential.
- `NEBIUS_API_KEY`: the Token Factory key for Stellis's direct non-agent inference, such as summaries.
- Matching `STELLIS_ACCOUNT_ID` and `STELLIS_AGENT_GATEWAY_ACCOUNT_ID`: the account allowed to use this operator gateway.

Configure the cloud sandbox's own Token Factory provider credential separately. The Stellis key does not configure or rotate the sandbox provider. Secrets may instead be injected into the launcher environment; a nonempty value in the private file takes precedence. Never put secrets in the checked-in examples.

```sh
uv run --locked stellis launch cloud --check
uv run --locked stellis launch cloud
```

Open <http://127.0.0.1:8822>. Data defaults to `~/.local/share/stellis/cloud`. The launch command starts the Stellis app, not cloud infrastructure. A working cloud NemoClaw gateway is a prerequisite. Its operator credential is restricted to its bound account; this is not a claim that multi-account cloud tool execution has been provisioned.

## Configuration checks

`--check` validates configuration without starting services, downloading models, contacting providers or charging for inference. Use Settings → Check connections to test the configured routes. A successful configuration check does not establish gateway readiness, model quality or tool access.

Each version reads only its explicit private configuration and permitted injected cloud secrets. Inherited Stellis, NemoClaw and inference settings are discarded. Configuration files must contain literal `NAME=value` assignments; quote spaces. They are parsed as data and never executed as shell scripts. Local and cloud files in the same directory cannot point at the same data root.

For another file or port:

```sh
uv run --locked stellis launch cloud --env-file /secure/stellis-cloud.env --port 8830
```

The default host is loopback. Set `STELLIS_HOST` and the existing proxy/TLS settings in the version's configuration for a hosted backend. Do not expose a raw development HTTP listener as production ingress.

## Legacy direct mode and demo

`STELLIS_RUNTIME_PROFILE=direct` is the existing direct Token Factory mode. It runs no NemoClaw/OpenClaw agent sandbox. It remains available through the existing `serve` command for compatibility, and `fly.toml` still selects it. It is not either managed launch version, and these commands do not change or deploy the Fly service.

The isolated Maya demo currently uses direct source-backed completions: Ollama in the local profile, Token Factory in cloud/direct profiles. Its traces label that exception explicitly. A successful demo reply does not verify the NemoClaw gateway or managed tool execution.
