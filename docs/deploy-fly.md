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

Set these as Fly secrets, never in `fly.toml`:

| Secret | Needed for |
| --- | --- |
| `NEBIUS_API_KEY` | Summaries, chat and agents |
| `STELLIS_INVITE_CODE` | Optional. When set, sign-up requires this code; unset, anyone can sign up |
| `TAVILY_API_KEY` | Web research |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google Calendar; hosted redirects need ticket H-07 first |

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

## Backups

Fly takes a daily snapshot of each volume and keeps it for 5 days by default (`fly volumes snapshots list <volume id>`). Ticket H-02 adds continuous backups with Litestream before outside users join.

## Logs and access

```sh
fly logs -a stellis-health
fly ssh console -a stellis-health
```

Access logs list request paths. They must never contain health content; ticket H-03 removes query strings from them.
