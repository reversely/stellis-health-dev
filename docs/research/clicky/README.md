# Clicky screen tutor reference

Inspected source: [farzaa/clicky](https://github.com/farzaa/clicky), MIT, commit `a80fa80721a8aebe51a170a7780705024ebc6e46`. Files: README, CompanionScreenCaptureUtility.swift and CompanionManager.swift. Source was cloned and inspected on GN100; no Clicky app was installed or run.

## Observed in source

The native macOS app captures displays with ScreenCaptureKit, excludes its overlays and resizes JPEGs to 1280. Screenshot and question reach a cloud Claude turn. The client parses `[POINT:x,y:label:screenN]`, bounds coordinates and scales them into a visual overlay. Voice paths use AssemblyAI and ElevenLabs, with Cloudflare proxying. This is code evidence, not a claim of observed live app behavior.

## Stellis adaptation

The useful behavior is seeing the learner's current screen, giving one achievable next step and indicating the relevant control. Browser window sharing or an explicitly chosen screenshot supplies a frame only when asked. A local Ollama vision pass provides an observation and optional normalized point; the managed Tutor gives cited guidance. The pointer is on the captured preview, not an OS overlay, and never clicks or types. The exact frame remains visible so guidance cannot drift as the live window changes.

No Clicky vendor dependency was adopted. Both inference stages run on GN100. Existing installed `qwen3.5:9b` reports vision capability through Ollama `/api/show`. API details were checked against [Ollama vision](https://docs.ollama.com/capabilities/vision) and [Chat API](https://docs.ollama.com/api/chat). NemoClaw's inspected agent CLI does not expose an image attachment argument; this implementation uses local perception as preprocessing and retains OpenClaw inside NemoClaw for the agent turn.

Limitations: model confidence is not a guarantee of correct grounding; uncertain/invalid points are omitted. Screen text is untrusted evidence. Raw images are transient, but the textual observation and answer persist in chat. Cloud screen tutoring remains unavailable, with no local fallback. Headless GN100 verification covers actual rendered screenshots; the interactive browser's OS window chooser still requires a human-authorized display session.
