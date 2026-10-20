# 0069: Persist independent inference-role model routes

Accepted, 2026-10-20. Issue #433.

The previous local-model preference coupled managed agents, transcript AI, categories and notebook planning; Tutor vision was an environment-only choice. Settings now saves each of those five roles independently. Atomic account-data files separate explicit local, cloud and legacy profiles. Existing defaults and the older coupled local preference remain readable until a role is overridden.

Local saves require installed models and the appropriate Ollama capability (tools, completion or vision). Managed-agent changes remain owner-only and use NemoClaw inference set with provider/model readback and rollback before committing preferences. A process-wide active-request guard also covers other account contexts. Direct inference reads its role at request time. Model availability is not proof that a particular model can produce the required structured response; failures remain visible in traces.

Cloud direct roles use Token Factory. A saved managed-agent route uses OpenClaw's documented `x-openclaw-model` override, prefixed with `STELLIS_CLOUD_MODEL_PROVIDER` (default `nebius`). The gateway identity needs operator.admin for that override. The original agent selector in the Responses body remains unchanged. Missing credentials allow configuration but are never reported as verified. No cloud path falls back to local inference. See [OpenResponses HTTP API](https://docs.openclaw.ai/gateway/openresponses-http-api).

Tutor screenshot requests now have an explicit cloud adapter and mode-specific privacy copy. Local requests use a structured observation schema. Cloud categories retain the GLM-specific completion adapter for its original model; other selections use chat completion log probabilities and retain the same conservative abstention rules. The GLM behavior follows the [Nebius typed-decision example](https://dev.nebius.com/cookbook/jev-style-decision-model-glm). Actual cloud inference remains unverified pending project credentials.

GN100 verification: independent Settings saves and reload; text-only vision rejection; live Granite transcript, notebook-plan and category requests; Qwen2.5-VL screenshot observation; unchanged managed Nemotron route. Installed Qwen3-VL returned an empty final answer in this test and was rejected, not substituted silently. These are bounded compatibility observations, not claims that every installed model works for every role.
