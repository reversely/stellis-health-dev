# ADR 0035: Opt-in conversation category decisions on Nebius

Status: accepted, 2026-10-16.

## Context

Ticket #120 asks for Meeting, Event, Interview, and Conversation to be seeded and for CLM-8B classification after processing. The configured Nebius Token Factory account lists no CLM model, and direct lookup of the CLM identifiers returned 404. CLM-8B is an Apache-2.0 contrastive scorer that needs a Qwen3-8B pooling encoder and its separate head/API. A dedicated Nebius GPU endpoint could host that stack, but it would require a custom container and standing GPU capacity. Token Factory's available GLM-5.3-Flash supports one-token typed decisions through raw completions and logprobs. The Nebius cookbook reports low per-decision cost on its own support-ticket dataset; those accuracy figures do not validate Stellis categories.

## Decision

Seed the four category names once. Default automatic categorization off. The user can enable it in Manage categories, beside notice that bounded transcript excerpts and title go to Nebius while audio remains local. After a successful final transcript or accepted replacement generation, run four rotated five-choice GLM-5.3-Flash logprob reads. The fifth choice is Unclear. Short, low-coverage, or low-margin results remain uncategorized. Store the model, prompt version, transcript revision, confidence, state, and any automatic assignment in local SQLite. Never overwrite a manual category change or pre-existing assignment. Failures are retryable without failing transcription. Disabling automation prevents an in-flight result from being applied.

## Consequences

- This route works with the currently configured Nebius Token Factory key, without a CLM deployment or a new hosted provider.
- Four bounded completions cost more than one, but option rotation reduces label-position bias. The numeric score is uncalibrated for Stellis; ambiguous examples may still be overconfident. Unclear and manual correction remain essential.
- A future CLM deployment or local Tacit-4B/AnyJev backend can replace this decision adapter after evaluation on labeled Stellis conversations. No such endpoint is assumed in this implementation.

## Sources

- [CLM README](https://github.com/Contrastive-LM/CLM/blob/main/README.md)
- [Nebius typed-decision cookbook](https://dev.nebius.com/cookbook/jev-style-decision-model-glm)
- [vLLM Nebius deployment guide](https://docs.vllm.ai/en/latest/deployment/frameworks/nebius/)
