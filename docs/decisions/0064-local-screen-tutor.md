# ADR 0064: Local screen perception for the managed Tutor

Status: implemented for #412 and #395.

An enabled Tutor can receive a user-selected window frame or PNG/JPEG screenshot. The browser sends one frame only on Ask, shows the captured frame with guidance, and stops tracks/aborts the request on Stop sharing or navigation. The backend bounds compressed size and decoded dimensions, strips metadata and resizes to 1280 before local Ollama vision inference. `STELLIS_TUTOR_VISION_MODEL` defaults to the installed `qwen3.5:9b`; each request checks vision capability. Settings exposes this separate route and metadata-only `tutor_vision` traces.

The vision model returns a bounded description and optional normalized point. Finite coordinates, a bounded label and confidence of at least .75 are required. The description is saved as a timestamped system observation and supplied as untrusted source evidence to the existing managed agent turn. The Tutor's normal template and custom instructions still run through OpenClaw inside NemoClaw, with existing source-marker validation and an independent job session. The reply cites the saved observation. No automatic computer interaction is added.

Images remain transient in request memory and the current browser preview; they are not written to account storage or traces. Text observations and answers remain in the thread. Local preprocessing calls loopback Ollama, following the deployment profile; the cloud version explicitly declines screen tutoring rather than falling back to a workstation. The local teaching model remains independently switchable in Settings.

The source reference and distinctions are recorded in `docs/research/clicky/README.md`. Real GN100 evidence is in `docs/evidence/412/`.
