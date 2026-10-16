# ADR 0007: Source-backed Nemotron runs through the device service

Status: accepted, 2026-10-16 (#15).

## Context

The browser needs summaries and questions about a locally transcribed interview. A 57-minute sample has 789 speech segments, so a single model request would be too large and would leave failures difficult to resume. Transcript edits also change what the user sees without changing the original machine output.

## Decision

- The browser explicitly starts a summary or answer run against the displayed transcript revision. The loopback device service sends bounded excerpts and displayed speaker labels to Nebius Token Factory using `nvidia/Nemotron-3_5-Lightning`. The API key comes from `NEBIUS_API_KEY` or ignored `.env` and is never returned to the browser or written to a run.
- Requests disable model thinking and require a strict JSON schema. This model used its full response budget on reasoning in an initial probe with thinking enabled. Low temperature and output limits reduce variance and cost. The service records model ID, prompt version, request IDs, token usage, and retry count. It does not persist raw prompts or provider responses.
- Each excerpt uses short local labels such as `s1`. The service checks every returned label against the evidence supplied in that request, then maps it to the stable segment ID. It rejects invented labels and malformed outputs. A source link seeks the browser player to its segment. This verifies citation identity, not the truth of every generated claim; review remains necessary.
- Summaries split on segment boundaries with two-turn overlap, at most 24 chunks. Validated chunk results are checkpointed after each request. A final request groups topics, decisions, and action proposals. One chronological overview item from every chunk ensures the full recording is represented when global synthesis favors early material. A failed run can retry from its checkpoint.
- Answers select lexical matches and neighboring segments within a bounded window. The prompt asks the model to distinguish similarly named events and to report insufficient or contradictory evidence. Empty decisions or actions remain empty instead of being inferred.
- Runs are persisted in SQLite and polled by the browser. After a transcript edit, an older result is marked stale. Provider authentication, unavailable model, rate limit, network, timeout, output limit, malformed JSON, and invalid source errors have visible states. An interrupted run is marked failed on restart and may be retried.

## Alternatives and consequences

| Option | Assessment |
| --- | --- |
| Browser calls Nebius directly | Would expose the API key and complicate durable retries. Rejected. |
| One full-transcript request | Exceeds a practical bounded context and cannot resume partial work. Rejected. |
| Free-form or JSON-object output | Initial probes required repair and allowed source labels outside the supplied evidence. Strict schema plus local validation is used. |
| Generate citations from timestamps | The model could invent times. Stable segment IDs are validated and resolved to stored timing. |

The current lexical answer retrieval can miss semantically related passages. Citations can point to a relevant passage while a claim still conflates events, so the UI presents results as source-backed suggestions. The service is local and unauthenticated until the login and encrypted sync tickets. A Nebius AI request sends transcript text off-device only when the user invokes that feature.

## Verification

The real Nebius model returned strict-schema JSON for a browser-recorded sample and the supplied 789-segment interview. The long summary completed 12 checkpointed chunk analyses and a final synthesis, producing 12 chronological overview points and six grouped topics with valid source links. A browser question returned an answer and navigable citations; a broad launch question exposed ambiguity between two events, prompting the explicit distinction rule. Automated tests cover citation rejection, persistence, revision staleness, and answer validation. No private interview text is committed.
