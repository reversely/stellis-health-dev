# ADR 0003: Cross-app and browser architecture

Status: corrected 2026-10-16 by ticket #27. Browser workflows are the primary acceptance surface; Flutter is required for the native iOS app and the shared iOS/Android/desktop stretch.

## Decision

Stellis is a local-first product with a **shared, versioned resource contract**. The browser app is the primary product surface and must pass the real interview workflows. Its current plain-JavaScript UI may evolve as complexity warrants; deploying the browser app does not require Flutter. Flutter is the required implementation for the iOS app and the preferred shared repository for the iOS, Android, and desktop stretch. Native Flutter targets can use platform channels/FFI for capture, local processing, and secure key storage where a loopback service is unsuitable. Flutter web remains optional. The versioned API contract allows the browser and native clients to share resource semantics without sharing a rendering framework.

The current loopback FastAPI process is a **device service**, not the future hosted sync backend. It owns local media, SQLite records, processing jobs, native model invocation, and a versioned API. Desktop browser and packaged app can connect to it on loopback while it is running. On mobile, a native bridge may implement the same client-facing operations in process if a loopback service is unreliable under OS background rules. The browser must still support reviewing, editing, chatting, and syncing without a local worker; processing controls must explain when no on-device engine is available.

A separate hosted service will own OIDC sessions, vault membership, encrypted change logs, and encrypted media chunks. PostgreSQL and object storage are suitable for that service; they are not introduced into the local device runtime. The hosted sync service receives ciphertext and opaque routing metadata. Nebius is a distinct, explicit inference destination for selected transcript text; its key and request plaintext never pass through the zero-knowledge sync API. Browser key handling, device enrollment, and recovery are designed in #16–#17, before making any E2EE claim.

## Why this fork

| Option | Assessment |
| --- | --- |
| Browser app for core acceptance | Directly exercises import, recording, playback, transcript, speakers, and AI in Chromium. The current HTML/JS implementation is valid for development; a later web framework choice is driven by maintainability. Selected for core delivery. |
| Single hosted backend doing speech and sync | Cannot claim on-device transcription or zero-knowledge sync when it processes uploaded plaintext recordings. It also makes recording dependent on network access. |
| Browser-only processing in WebAssembly | Attractive for a pure PWA, but model size, mobile memory, worker scheduling, and long recordings need device benchmarks before it can be the only processing path. It may become an optional adapter. |
| Flutter native apps plus local workers and encrypted sync | One Flutter repository can target iOS, Android, and desktop while preserving on-device speech. Requires platform-specific processing bridges and capability reporting. Selected for the native stretch. |

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
| Browser on the recording device | Connect to the loopback device service. Import, record, process, edit, and replay locally. This is the primary acceptance path. |
| Flutter desktop app | Same UI and resource contract, with bundled local worker and OS key storage. |
| Flutter mobile app | Capture and process locally through platform channels/FFI; queue work when the OS suspends processing; sync ciphertext when online. |
| Browser without a local worker | Sign in, enroll/decrypt vault, review and edit synced content, run explicitly authorized Nebius requests. Processing remains queued on a capable device; no hidden cloud ASR fallback. |

## Migration and risks

Tickets #12–#15 grow the device API while the browser app proves workflows. Browser UI/design ticket #23 and final acceptance #18 do not depend on Flutter. Ticket #25 builds the Flutter iOS/Android/desktop app as a stretch from the same repository after the browser-first acceptance, using the shared resource contract and platform bridges. Ticket #16 adds session separation. Ticket #17 implements encrypted operation/media sync and browser key enrollment, with a threat model and independent review before production E2EE claims. A future mobile spike must benchmark on-device model size, thermals, battery, recording persistence, and background restrictions. The current loopback API has no authentication and must not be exposed on a LAN or hosted as-is.
