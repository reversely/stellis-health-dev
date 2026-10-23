# Call speech backends

Calls use Kitten on CPU by default. Operators can switch generated replies to a local Chatterbox server or a future Nebius endpoint. Speech recognition and activity detection keep their existing on-device models. The selection applies to intake, coach and tour calls after restarting the app and account processes. There is no automatic provider fallback.

| `STELLIS_TTS_BACKEND` | Speech location | Required configuration |
| --- | --- | --- |
| `cpu` | Kitten in the app process | Existing call models |
| `local` | Separate Chatterbox service | `STELLIS_CHATTERBOX_LOCAL_URL`, default `http://127.0.0.1:8010`; optional `STELLIS_CHATTERBOX_LOCAL_TOKEN` |
| `nebius` | Nebius Chatterbox endpoint | `STELLIS_CHATTERBOX_NEBIUS_URL` and `STELLIS_CHATTERBOX_NEBIUS_TOKEN` |

`STELLIS_CHATTERBOX_VOICE` defaults to `default`, the built-in Chatterbox speaker. Use that for both endpoints when comparing them. The cookbook image also supports its bundled `Emily.wav`; the local reference server intentionally supports only the built-in voice. Choosing a different voice is separate from choosing a backend. The simulated patient's explicit Kitten voice remains CPU-based for intake regression fixtures.

## Local reference

The local server uses the original English Chatterbox model, matching the cookbook's `ChatterboxTTS` class, `cfg_weight=0.5` and `exaggeration=0.5`. It runs in an isolated environment so PyTorch and model dependencies do not enter the Fly image or application environment. `CHATTERBOX_DEVICE=cuda` is the default; `cpu` runs Chatterbox itself on CPU for an optional comparison. This differs from the application's lightweight Kitten `cpu` backend.

The tested dependency snapshot is `scripts/chatterbox-requirements.txt`. On ARM64 GB10, install CUDA 13 PyTorch wheels first, then the remaining snapshot without dependency resolution: upstream Chatterbox pins an older PyTorch that does not suit this GPU. The snapshot records the actual installed versions, including the intentional upstream-pin override.

```bash
uv venv ~/.local/share/stellis-chatterbox/venv --python 3.12
uv pip install --python ~/.local/share/stellis-chatterbox/venv/bin/python \
  torch==2.14.1+cu130 torchaudio==2.11.0+cu130 \
  --index-url https://download.pytorch.org/whl/cu130
uv pip install --python ~/.local/share/stellis-chatterbox/venv/bin/python \
  --no-deps -r scripts/chatterbox-requirements.txt
~/.local/share/stellis-chatterbox/venv/bin/python scripts/chatterbox_server.py
```

Model weights download into the Hugging Face cache on first start. The server binds to loopback only. `GET /v1/models` becomes available after model loading; `POST /v1/audio/speech` returns mono WAV. A busy server rejects overlapping requests with 429. The optional `CHATTERBOX_TOKEN` protects both endpoints when the service is accessed through a private proxy. The API caps input at 2,000 characters and accepts only the tested model, voice and WAV format.

On the reference machine, `systemctl --user start stellis-chatterbox` starts the installed service, and `systemctl --user stop stellis-chatterbox` releases its model memory. It is started for this reference session and is not enabled at boot. The installed server is a copy under `~/.local/share/stellis-chatterbox/server.py`; copy script changes there before restarting. The private `server.env` in the same directory defines `CHATTERBOX_TOKEN`. Set the development application's `STELLIS_CHATTERBOX_LOCAL_TOKEN` to that value without committing it. The service performs a startup synthesis before accepting traffic to avoid charging the first call for kernel warm-up.

Set `STELLIS_TTS_BACKEND=local` when starting the development app. The application keeps existing call models for recognition and CPU fixture voices. A speech failure reports an error and preserves the text reply. Requests have timeouts, reject redirects, cap returned bytes and decoded duration, and require HTTPS except on local loopback. Operator configuration never comes from a browser request.

## Fly and Nebius

Create no paid endpoint until the local voice and performance meet the desired reference. The cookbook endpoint uses `/v1/audio/speech`, model `tts-1`, and bearer authentication. Put the endpoint origin, without `/v1/audio/speech`, in `STELLIS_CHATTERBOX_NEBIUS_URL`. Set the token as the Fly secret `STELLIS_CHATTERBOX_NEBIUS_TOKEN`. Set `STELLIS_TTS_BACKEND=nebius` explicitly to activate it. Restore `cpu` to return to Kitten. Local and Nebius credentials have separate names and are sent only in the Authorization header.

These are deployment-wide operator settings inherited by account processes. The selected speech service receives generated reply text, which can include health information. Microphone audio still goes through the app's existing recognition pipeline. No speech text, token or returned audio is added to adapter logs.

Fly cannot reach this machine through `127.0.0.1`: that address means the Fly machine itself. Reaching this local service from Fly requires a private network or authenticated HTTPS tunnel and an explicit local URL and token. That network setup is a separate deployment decision.

## Sources and licences

- [Nebius endpoint contract](https://github.com/nebius/serverless-ai-cookbook/tree/main/templates/endpoint-chatterbox)
- [Chatterbox source and MIT licence](https://github.com/resemble-ai/chatterbox), pinned source revision `5de7a54aa4e5e2baadb0182dde554908b48b85c2`
- [Perth watermarking source](https://github.com/resemble-ai/Perth), pinned source revision `ff1c8ac55a976971245cdd53c18d6131ca00d993`

The local runtime is an optional development installation. No new dependency or voice clip is bundled with Stellis. The reference uses the upstream built-in voice; no community voice pack or uploaded voice cloning is involved. The upstream watermarking implementation remains enabled. A distributable Chatterbox image would need its own complete dependency and model licence inventory.

## Call deadlines and narration cache

Calls bound each synthesis operation to 15 seconds and retain the reply as text when speech fails. Registered public tour narration reuses validated WAV audio inside each account's data directory. Personal questions and goals stay outside that cache. Set `STELLIS_TTS_CACHE_REVISION` to a new value when changing the model behind an unchanged endpoint or voice name. See [voice calls](voice-calls.md).
