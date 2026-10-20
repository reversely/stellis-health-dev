# ADR 0066: Bounded source proposals and reviewed local filing

Status: implemented for #393.

First-run review can explicitly read 7, 30 or 90 days of an authorized Google connection. A pass reads at most 25 Gmail threads and 35 calendar events. Gmail detail reads are paced with four concurrent requests to respect per-user quotas. No mail or calendar content is changed externally.

Account-local setup state stores the scan, exact source excerpts, validated proposal and selected groups. Reading and planning report real stages and counts; cancellation closes the asynchronous inference request. Restarted scans are marked interrupted. Active tasks and cancellation are scoped to the current account's scan.

The selected deployment profile proposes ongoing projects from bounded excerpts. Known bulk, promotional and social mail is excluded before inference. JSON validation rejects invented IDs, repeated sources, duplicate notebook names and unbounded groups. Local Ollama uses explicit low reasoning with a bounded 6,000-token response; Token Factory keeps its own thinking control. Neither source instructions nor model-generated external actions are executed.

Review exposes each proposed notebook's exact sources and an expandable list of sources not included. Deselection persists on reload. A separate final action creates selected notebooks and agents, then files local excerpt pages with provenance. Stale proposals fail before any creation. Source identity and a recovery marker prevent duplicate pages after retries. Account completion is written only after filing succeeds.

This extends ADR 0065 without changing the empty/starter setup path. Local inference remains the adopted GN100 mode; the cloud profile retains its independent Token Factory route. Imported pages are evidence, not claims that the original mail or calendar was moved.
