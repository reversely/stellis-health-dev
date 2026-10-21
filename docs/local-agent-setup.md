# Set up local agents on GN100

Run setup from the GN100 SSH session. The Mac remains a browser client. This command creates a separate gateway, sandbox and workspace; it does not change the cloud profile or point a new service at existing workspace data.

Install the supported NemoClaw CLI on the host first, using NVIDIA's installation instructions. The wrapper does not silently replace Docker, drivers or a shared host runtime. NemoClaw manages its supported Ollama installation/download path. The model choice is explicit and the resulting route must match it.

Preview the plan before applying it. Choose unused ports and an empty directory:

```sh
python3 scripts/setup_local_agents.py \
  --root "$HOME/stellis-new-local" \
  --name stellis-new-local \
  --model nemotron-3-nano:latest \
  --gateway-port 8991 --control-port 18891
```

Add `--apply` to provision. The command writes `local.env`, a private installer log and a sanitized progress receipt in that directory. The receipt tracks software checks, sandbox/model setup, route verification and a live response check. It marks ready only after the selected local agent returns the expected response. An error preserves the directory and marks the failed stage. Repeat the same arguments with `--apply --resume` to resume; changing the recorded configuration is rejected.

The model above is an example, not a required application model. Choose another supported Ollama tag when needed. The default sandbox image is pinned to the verified NVIDIA publisher digest; `--image` accepts another explicit digest.

Start Stellis against the generated configuration in a separate process on an unused port:

```sh
set -a
. "$HOME/stellis-new-local/local.env"
set +a
~/.local/bin/uv run --locked stellis --port 8825
```

The first account is the deployment owner. Onboarding displays setup progress and refreshes it while open. **Local setup finished** records installation completion; **Check setup** performs the current account's live AI check. Choose uses, review notebooks and finish setup normally. Other accounts do not receive unrestricted host administration from this flow.

Speech assets are a separate capability. Configure installed speech paths with `scripts/configure_local_speech.py`, or use the speech installation path before recording. A text-agent setup is not proof of voice, screen-reading or mailbox readiness.

NemoClaw gateways share the host's authenticated Ollama proxy. A new gateway can restart that proxy even though its sandbox and gateway state are separate. Run provisioning when other local inference is idle. Do not reconnect Tailscale as a setup step. Keep `setup.log` private; it is not exposed to the browser or included in evidence bundles.

Verification distinguishes a fresh gateway/sandbox/account on an existing GN100 from a wiped-host installation. The latter remains unverified. Local inference makes AI requests local; separately enabled mail, calendar and research integrations can still contact external services.

References: installed NemoClaw `docs/inference/set-up-ollama.mdx`, `docs/reference/architecture.mdx`, and `nemoclaw onboard --help`. These document non-interactive Ollama selection and independent gateway ports.
