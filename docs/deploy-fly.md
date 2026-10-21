# Deploy to Fly.io

Stellis Health runs on Fly.io as one machine with one volume. The image starts the account gateway on port 8080, and the gateway starts one workspace process per account. SQLite files, recordings and speech models live on the `stellis_data` volume at `/data`.

## Settings

`fly.toml` sets the non-secret settings:

| Variable | Value | Effect |
| --- | --- | --- |
| `STELLIS_HOST` | `0.0.0.0` | Accepts connections from Fly's proxy |
| `STELLIS_FORWARDED_ALLOW_IPS` | `*` | Trusts Fly's `X-Forwarded-Proto`, so the app knows requests arrived over HTTPS and accepts same-site sign-up and form requests |
| `STELLIS_DATA_DIR` | `/data` | Stores all data on the volume |
| `STELLIS_SECURE_COOKIES` | `1` | Marks the session cookie `Secure` |
| `STELLIS_SHARED_PROVIDER_KEYS` | `1` | Gives every account the deployment's Nebius and Tavily keys |
| `STELLIS_RUNTIME_PROFILE` | `direct` | Runs agent turns as Token Factory chat completions, with no NemoClaw sandbox |
| `STELLIS_DAILY_TOKEN_LIMIT` | `200000` | Caps each account's Token Factory tokens per UTC day; the owner (account 1) has no cap. Over the cap, requests stop with "Today's AI allowance is used up and resets at midnight UTC" |

Set these as Fly secrets, never in `fly.toml`:

| Secret | Needed for |
| --- | --- |
| `NEBIUS_API_KEY` | Summaries, chat and agents |
| `STELLIS_INVITE_CODE` | Optional. When set, sign-up requires this code; unset, anyone can sign up |
| `TAVILY_API_KEY` | Web research |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google Calendar, from a web OAuth client (see below) |

```sh
fly secrets list -a stellis-health
```

## First deploy

The app needs exactly one machine, because the volume attaches to one machine.

```sh
fly volumes create stellis_data --region yyz --size 5 -a stellis-health
fly deploy -a stellis-health
fly scale count 1 -a stellis-health
```

Then open `https://stellis-health.fly.dev/api/health`. It returns `{"status":"ok",...}` when the app is up. The first start downloads about 500 MB of speech models to `/data/models`; transcription waits until the download finishes.

## Google Calendar

Calendar connection on the hosted app needs a Google OAuth client of type **Web application** and the app's public origin. Until both exist, Settings and onboarding show "Calendar connection is not available on the web app yet" instead of a Connect button.

1. In Google Cloud Console, open APIs & Services, then Credentials, and create an OAuth client ID of type Web application.
2. Add the authorized redirect URI `https://stellis-health.fly.dev/api/v1/calendar/google/callback`.
3. Enable the Google Calendar API for the project.
4. Set the client and the origin:

```sh
fly secrets set GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... -a stellis-health
fly secrets set STELLIS_PUBLIC_ORIGIN=https://stellis-health.fly.dev -a stellis-health
```

When the app moves to its own domain (ticket H-06), change both the redirect URI and `STELLIS_PUBLIC_ORIGIN` to the new origin.

## Backups

Fly takes a daily snapshot of each volume and keeps it for 5 days by default (`fly volumes snapshots list <volume id>`). Ticket H-02 adds continuous backups with Litestream before outside users join.

## Logs and access

```sh
fly logs -a stellis-health
fly ssh console -a stellis-health
```

Access logs list request paths. They must never contain health content; ticket H-03 removes query strings from them.

## Sample records

The image includes 50 records of one synthetic patient, Denver Lang, from 1997 to 2026. 29 come from his Synthea bundle: visit notes and yearly lab results. 21 come from outside the hospital: a dietitian, a physiotherapist, a personal trainer, scale and blood pressure exports, and his own notes. Three are photos without a text layer. They load only on request and, by default, into no notebook, the way a person would drop all their files in one place before sorting them. Each record keeps the date it describes. Account 1 keeps its data in `/data`, and account N keeps its data in `/data/accounts/N`. Run the loader as the app user so that the new files keep the right owner:

```sh
fly ssh console -a stellis-health -C "setpriv --reuid=stellis --regid=stellis --init-groups python -m stellis.sample_records --data-dir /data"
```

Add `--notebook NAME` to file every record in one notebook instead. A second run adds nothing, because the loader skips files the account already has. `scripts/make_sample_records.py` rebuilds the clinical records from the FHIR bundle, and `scripts/make_narrative_records.py` rebuilds the outside records from `scripts/sample_patients/denver-outside.txt`.
