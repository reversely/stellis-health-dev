# ADR 0003: Cross-app and browser architecture

Status: accepted for implementation, 2026-10-16. Supersedes the Flutter-first client choice in the original plan; retains its encrypted sync boundary.

## Decision

Stellis is a local-first product with a **shared, versioned resource contract**. The browser UI is the primary client and will move from the small plain-JavaScript validation shell to a TypeScript web application as the interaction model grows. A packaged desktop app can host that UI and bundle a local speech worker. Mobile apps will reuse the web interface where practical and provide native capture, local processing, and secure key storage through platform bridges. We will assess the packaging framework when the mobile processing spike exists; the contract does not depend on that framework.

The current loopback FastAPI process is a **device service**, not the future hosted sync backend. It owns local media, SQLite records, processing jobs, native model invocation, and a versioned API. Desktop browser and packaged app can connect to it on loopback while it is running. On mobile, a native bridge may implement the same client-facing operations in process if a loopback service is unreliable under OS background rules. The browser must still support reviewing, editing, chatting, and syncing without a local worker; processing controls must explain when no on-device engine is available.

A separate hosted service will own OIDC sessions, vault membership, encrypted change logs, and encrypted media chunks. PostgreSQL and object storage are suitable for that service; they are not introduced into the local device runtime. The hosted sync service receives ciphertext and opaque routing metadata. Nebius is a distinct, explicit inference destination for selected transcript text; its key and request plaintext never pass through the zero-knowledge sync API. Browser key handling, device enrollment, and recovery are designed in #16–#17, before making any E2EE claim.

## Why this fork

| Option | Assessment |
| --- | --- |
| Flutter for every screen (original plan) | Good native reach, but a rewrite of the now validated browser UI and extra web/native bridges for current Python speech tools. Revisit if shared web UI fails mobile accessibility or performance checks. |
| Single hosted backend doing speech and sync | Cannot claim on-device transcription or zero-knowledge sync when it processes uploaded plaintext recordings. It also makes recording dependent on network access. |
| Browser-only processing in WebAssembly | Attractive for a pure PWA, but model size, mobile memory, worker scheduling, and long recordings need device benchmarks before it can be the only processing path. It may become an optional adapter. |
| Shared web UI plus local workers and encrypted sync | Reuses the browser acceptance surface, keeps native speech on the recording device, and lets browser-only sessions review synced results. Requires a capability handshake and explicit states for unavailable local processing. Selected. |

## Contract rules

1. `/api/v1` is the device-service namespace. Existing `/api` routes remain aliases during migration. The UI must not read SQLite or media paths directly.
2. All persistent entities use random UUIDs, UTC timestamps, and millisecond offsets from the start of the **original media timeline**. A pause creates explicit timeline metadata; it never silently compresses timestamps.
3. A transcript is ordered speech segments with stable IDs, word spans where available, revision numbers, and provenance (`on_device_asr`, `user_edit`, or `imported_reference`). Otter export text may be comparison data but cannot masquerade as model output.
4. Speaker clusters are recording-scoped acoustic IDs. Display names and manually confirmed assignments are separate records. Rematch can change an automatic cluster, but must preserve user-confirmed assignments.
5. Jobs are durable resources with states `queued`, `running`, `succeeded`, `failed`, `cancelled`; progress, stage, model versions, input digest, error code, and retryability are visible through the API. Repeated requests with the same input and processing version return the same job/result.
6. Capabilities report installed models and supported languages. A model that only handles English never advertises other languages. Clients may show an unavailable state instead of an inactive control.
7. AI output stores source segment IDs and transcript revision. Regeneration after edits is explicit; stale results are visibly marked.
8. JSON errors include stable `code`, readable `message`, and optional `details`. Evolving schemas add fields; removals require a new API version. Contract fixtures will be tested against each client as it arrives.

## Connection modes

| Client state | Operations |
| --- | --- |
| Desktop browser on the recording device | Connect to the loopback device service. Import, record, process, edit, and replay locally. |
| Packaged desktop app | Same UI and resource contract, with bundled native worker and OS key storage. |
| Mobile app | Capture and process locally through a native bridge; queue work when the OS suspends processing; sync ciphertext when online. |
| Browser without a local worker | Sign in, enroll/decrypt vault, review and edit synced content, run explicitly authorized Nebius requests. Processing remains queued on a capable device; no hidden cloud ASR fallback. |

## Migration and risks

Tickets #12–#15 grow the device API while the current browser UI proves workflows. Before packaging, move UI state and transport into a typed TypeScript client, test against the `/api/v1` schema, and provide a device capability handshake. Ticket #16 adds session separation. Ticket #17 implements encrypted operation/media sync and browser key enrollment, with a threat model and independent review before production E2EE claims. A future mobile spike must benchmark on-device model size, thermals, battery, recording persistence, and background restrictions. The current loopback API has no authentication and must not be exposed on a LAN or hosted as-is.
