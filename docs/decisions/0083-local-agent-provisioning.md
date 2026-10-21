# 0083: Operator-owned local agent setup

The browser must guide onboarding without granting an ordinary account shell access to its host. A GN100 operator runs `scripts/setup_local_agents.py` from the existing SSH session. The command accepts an explicit model and isolated gateway/control ports, refuses unowned nonempty directories and existing gateway state, and records an immutable deployment configuration.

NemoClaw's documented non-interactive Ollama/OpenClaw path provisions the agent. The sandbox image is digest-pinned. A private receipt and log survive failure; only allowlisted stage/state messages reach onboarding. The app polls that status without resetting choices or claiming that installation completion is a current connection check.

Resume checks the gateway's authoritative sandbox inventory. It refuses another sandbox, resumes incomplete onboarding, or rechecks a completed deployment without rerunning provisioning. Route validation requires the requested local model/provider; an exact nonce reply proves an actual agent response. Operator interruption terminates and reaps the installer process group. Host runtime installation remains an operator prerequisite, separate from ordinary account permissions.

The actual GN100 proof starts with a new directory, gateway and sandbox, reuses the installed host tools/model cache, and completes fresh-account onboarding. It is not evidence of installing drivers, Docker or NemoClaw onto a wiped host. Shared Ollama proxy behavior is documented; independent gateway ports do not imply an independent proxy.
