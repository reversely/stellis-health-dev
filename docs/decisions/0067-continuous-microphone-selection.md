# ADR 0067: Continuous browser microphone selection

Status: implemented for #418, partial delivery toward #396.

Each browser remembers its microphone choice. getUserMedia applies an exact device constraint for an explicit selection; unavailable devices fail visibly instead of silently switching to another microphone. Labels and choices refresh after permission and on devicechange.

A Web Audio destination provides one stable stream to MediaRecorder. Switching acquires and connects the new microphone before disconnecting and stopping the old input. Failed acquisition retains the old input. Closing during an in-flight request stops the newly acquired stream instead of leaking it. Pause/resume and durable chunk sequencing remain on the same recorder. Stop releases both physical input and audio graph. The active physical track's ended event retains the existing interruption/recovery behavior.

The picker lives beside the recording transport in the existing rail. Speakers reads Not captured because native two-stream capture is not connected to durable recording (#344); selecting an audio output would not solve capture. No OS-wide default device is changed. GN100 verification uses real PipeWire source nodes, actual Chromium capture, and decoded saved audio. Cross-platform physical device verification remains open.

API references inspected: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination and https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices .
