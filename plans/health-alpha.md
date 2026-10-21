# Stellis Health alpha: tickets

The alpha is a hosted version of Stellis Health on Fly.io. It covers the three pillars in the brief: research and education, a records-and-appointments agent, and tracking of the user's own goals. The server can read stored data in the alpha; client-side encryption follows in a later milestone. Each ticket below is sized for one pull request.

Ticket IDs use a prefix per track: H for hosting, C for cleanup, U for interface and copy, R for records, A for assistant and research, T for tracking, S for safety and legal.

## Phases

| Phase | Goal | Tickets | Gate to the next phase |
| --- | --- | --- | --- |
| 0. Running | The app runs on Fly and the owner can sign in | H-01 | Owner signs in at the fly.dev address |
| 1. Safe to host | Remove unused surfaces and harden the server | C-01 to C-05, H-02, H-03, H-05, U-05 | Restore drill passes; no route exposes another account's data or a provider key |
| 2. Health product | Records, assistant, research, tracking, health copy | U-01 to U-04, R-01 to R-03, A-01 to A-04, T-01 | Owner completes each pillar's main flow on the hosted app |
| 3. Invite others | Legal, safety and account recovery | H-04, H-06, H-07, S-01 to S-03, U-06 | Counsel reviews S-03; password reset works on the real domain |

## Hosting

| ID | Ticket | Scope | Done when |
| --- | --- | --- | --- |
| H-01 | First deploy | Create the volume, set secrets, deploy, scale to one machine (see `docs/deploy-fly.md`) | `/api/health` returns ok on fly.dev; owner signs up |
| H-02 | Continuous backups | Litestream in the image, replicating every `*.sqlite3` under `/data` to a Tigris bucket, with directory watching so new accounts replicate. Recordings go to the same bucket. | A deleted test account's data restores from the bucket on a fresh volume |
| H-03 | Hosting hardening | Origin check on every state-changing request; login rate limit; upload limit lowered from 1 GB; access logs without query strings; HSTS and a content security policy | Tests cover each check; a cross-site POST is refused |
| H-04 | Password reset | Domain, transactional email (Postmark or SES), reset link with expiry; add an email field to sign-up | Reset works end to end on the real domain |
| H-05 | Per-user token quota | Record Token Factory usage per account from the usage fields `ai.py` already reads; daily limit from an environment variable; clear message at the limit | An account over the limit gets the message and no provider call is made |
| H-06 | Own domain | Buy the domain, point it at Fly, issue the certificate, move cookies and OAuth redirects | App serves on the domain; fly.dev redirects to it |
| H-07 | Hosted Google Calendar | Web OAuth client with redirects on the hosted domain, replacing the desktop loopback redirect | A test user connects a calendar on the hosted app |
| H-08 | Live transcript worker | Decide whether the Rust live-preview worker ships in the image; it is absent today, so recording shows no provisional transcript | Decision recorded; worker built for linux/amd64 or the UI hides the preview |

## Cleanup

Each removal deletes the module, its routes in `server.py`, its interface, and its tests, then runs the full suite.

| ID | Ticket | Removes | Reason |
| --- | --- | --- | --- |
| C-01 | Remove the MCP server | `mcp_server.py`, `/mcp` routing in `account_gateway.py` | It exposes stored content to local agents |
| C-02 | Remove mail features | `gmail_api.py`, `agent_mail.py`, `mail_runs.py`, `mail_style.py`, the email paths in `delegation.py`, `fixture_mailbox.py` | Mail is outside the product and is a route for health data to leave |
| C-03 | Remove the screen tutor and voice call | `screen_tutor.py`, `voice_call.py`, `static/screen-tutor.js` | Outside the product |
| C-04 | Remove the sample workspace | `samples.py`, `sample_content.py`, `sample_rfi91.py` and their Home entries | Meeting samples; R-03 adds a health sample later |
| C-05 | Remove local agent provisioning from onboarding | NemoClaw setup steps in `local_setup.py` and onboarding | Hosted users have no local runtime; the cloud and local profiles stay available to the owner |

## Interface and copy

The interface keeps its layout and components. Copy changes follow one shared term list, so every screen uses the same words.

| ID | Ticket | Scope | Done when |
| --- | --- | --- | --- |
| U-01 | Term list and copy deck | `docs/copy-deck.md`: every user-visible string grouped by screen, with old and new wording. Build it from `index.html`, `app.js`, `onboarding.*`, `agent-chat.js` and `auth.html`. | Owner approves the term list below and the deck |
| U-02 | Rename the brand | Header, page titles, sign-in page, theme color, README | No user-visible "stellis" without "Health" |
| U-03 | Port copy by screen | Apply the deck in batches: Home, Library, visit view, notes, chat, settings, onboarding. One pull request per batch, each with desktop and narrow screenshots. | Each batch passes the browser check in `docs/ui-style-guide.md` |
| U-04 | Health onboarding | Replace the Gmail and agent setup steps with: consent (S-03), a short health profile (name, birth year, conditions, medications), and a first upload | A new account completes onboarding in under 5 screens |
| U-05 | Hide operator settings | In hosted mode, hide API key fields, model routes and runtime profile panels from users | A hosted account sees no provider or model settings |
| U-06 | Information notices | "Health information, not medical advice" in chat, research and summaries, worded per the brief's product-language rules | Notice shows on each AI surface |

Proposed term list for U-01:

| Current term | Proposed term | Notes |
| --- | --- | --- |
| Conversation | Visit | A recording of an appointment |
| Meeting notes | Visit notes | |
| Library | Records | Visits, documents and notes together |
| Collection | Area | Groups of notebooks, for example "Heart" or "Pregnancy" |
| Notebook | Notebook | Unchanged; one per condition, clinician or topic |
| People | Care team | Named speakers are usually clinicians |
| Custom vocabulary | Medical terms | Drug and condition names improve transcription |
| Daily brief | Today | |
| To-dos | Check-ins | Reminders, goals and follow-ups |
| Agents | Assistants | |

## Records

| ID | Ticket | Scope | Done when |
| --- | --- | --- | --- |
| R-01 | Document upload | PDF and image upload into a notebook; text extraction for digital PDFs; scanned pages stored with a "needs text" status | A lab report PDF shows as a searchable source |
| R-02 | Structured extraction | Token Factory extracts medications, lab results, conditions and allergies with source page, date and verification status; results arrive as reviewable suggestions | Each accepted fact links to its source page; rejected facts are not stored |
| R-03 | Health timeline | A dated view of visits, documents and accepted facts per account | Facts and visits sort by their clinical date, not upload date |

## Assistant and research

| ID | Ticket | Scope | Done when |
| --- | --- | --- | --- |
| A-01 | Query gate | Structured queries from the planner; block terms from the user's profile; cap demographic and rare-condition terms; log each outgoing query in the chat | Tests show identity terms never reach the search client |
| A-02 | Public medical sources | PubMed E-utilities, ClinicalTrials.gov v2, MedlinePlus and openFDA as source providers, called before Tavily | A research question returns cited results from at least one public API |
| A-03 | Visit preparation | From records and recent visits, propose questions for the next appointment as reviewable suggestions | Owner gets cited questions for a test appointment |
| A-04 | Trial matching and consent explainer | Match the profile to ClinicalTrials.gov criteria; explain a pasted consent form and list questions for the study team | Matches cite the trial record; the explainer never states a consent decision |

## Tracking

| ID | Ticket | Scope | Done when |
| --- | --- | --- | --- |
| T-01 | Goals, habits and medications | Recurring check-ins built on to-dos, shown on Today; a simple log per check-in | A daily medication check-in recurs and its log persists |

## Safety and legal

| ID | Ticket | Scope | Done when |
| --- | --- | --- | --- |
| S-01 | Response policy and emergency check | Versioned response policy in the prompts; rules plus a classifier on each user message before retrieval | Emergency test phrases get the urgent-care response |
| S-02 | Content-free safety records | Per response: model, policy version, risk tier, escalation result; no content | Records appear for each AI response and contain no user text |
| S-03 | Privacy policy, terms and consent | Pages on the public site; consent screen in onboarding written to Washington's My Health My Data Act | Counsel reviews the text |

## Known gaps in the scaffolding

- `tests/test_worker_shutdown.py::test_stop_worker_ends_the_whole_process_group` fails in the cloud development container on unmodified stellis-dev, which suggests the container's process handling rather than the code. Run it on a Fly machine during H-01.
- The image runs as root. Move to a non-root user with H-03.
