# Local Chatterbox reference

The optional server ran on ARM64 NVIDIA GB10 with CUDA 13 PyTorch in an isolated Python 3.12 environment. Source revisions and installed packages are recorded in `scripts/chatterbox-requirements.txt`. The application environment and Fly image retain their existing dependencies. No Nebius endpoint was created or billed.

## Speech measurements

The reference text was “Hello. I am Stellis. What would you like to focus on today?” Original English Chatterbox used the built-in voice, CFG 0.5 and exaggeration 0.5. One initial HTTP request took 7.811 seconds for 3.16 seconds of audio. After a service restart, successive HTTP requests took 2.853, 1.550 and 1.686 seconds for 3.48, 3.08 and 3.40 seconds of audio. These are synthesis completion times, not first streamed audio or complete voice-turn latency. The endpoint returns a complete WAV before the browser can play it.

The controlled profile in [profile.json](profile.json) resets the Torch seed to 42 for each request and synchronizes CUDA at stage boundaries. Every request generated 3.6 seconds of audio. Warm synthesis took about 1.72 seconds: token generation about 1.35 seconds, audio decoding about 0.335 seconds, and watermarking about 0.02 to 0.04 seconds. CPU thread counts of 20, 4 and 1 produced no material improvement. CUDA reported the GB10 device and Blackwell kernels. GPU utilization was idle between requests; the measurements do not establish performance under concurrent GPU workloads.

The reference service now generates a warm-up phrase before accepting traffic. The model remains loaded across calls in a user systemd service, `stellis-chatterbox`. Its API listens only on `127.0.0.1:8010`. A generated bearer token lives in a mode-0600 environment file outside the repository. Audio samples live outside the repository in `~/.local/share/stellis-chatterbox/samples/`. No listening-quality or clinical-pronunciation rating is claimed from these timing checks.

## Validation

Targeted Python checks cover backend selection, HTTPS and credential requirements, WAV conversion, response-size limits, channel validation, provider errors and redirects, assistant-voice routing, text preservation on speech failure, existing call handling and account-gateway isolation. There are no interface layout changes. The adapter introduces no new provider call in CPU mode; Chatterbox makes one request per spoken chunk when explicitly selected.

The local server was exercised with real synthesis through the application's adapter. Nebius compatibility was checked against the cookbook contract and a mock HTTP endpoint; a real Nebius deployment remains unverified. Tailscale Funnel configuration was denied for the current user, and passwordless sudo was unavailable. External Fly-to-local access therefore requires the administrator to enable the prepared HTTPS tunnel and a subsequent authenticated connection check. The local service is usable independently of that route.

After adding startup warm-up, the first authenticated request completed in 1.689 seconds for 3.4 seconds of audio. The live local API returned 401 without a token, 200 for authenticated model discovery, and 400 for an invalid voice. The final targeted suite ran 36 tests successfully with one model-dependent test skipped.

## Further performance work

Original Chatterbox's serial speech-token generation dominates the measured warm cost. The cookbook uses that model and buffers complete WAV responses. Resemble's [Turbo model](https://github.com/resemble-ai/chatterbox#readme) has a different architecture and decoder intended for lower-latency English agents. Testing Turbo would be a separate model comparison; the current implementation preserves original Chatterbox as the requested reference. These measurements do not establish the size of any Turbo improvement or the speed of an H100 endpoint.
