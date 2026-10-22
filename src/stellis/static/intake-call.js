/**
 * @fileoverview The intake call's connection: microphone audio to the
 * server, the agent's speech back, and call events for the call screen.
 * Speech pieces play in order; the server's "stop" cuts them off when the
 * person talks over the agent.
 */
(function(root) {
'use strict';

/**
 * Starts a call.
 * @param {function(!Object)} onEvent Receives the server's messages, plus
 *     {type: 'caption', text}, {type: 'level', person, agent},
 *     {type: 'mic', ok}, {type: 'closed'} and, once the goodbye has
 *     played, {type: 'ended'}.
 * @return {!Object} Controls: setMuted, setSpeaker, sendText, end.
 */
function start(onEvent) {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket =
      new WebSocket(`${scheme}://${location.host}/api/v1/intake/call`);
  socket.binaryType = 'arraybuffer';
  const context = new AudioContext();
  const output = context.createGain();
  const meter = context.createAnalyser();
  meter.fftSize = 512;
  output.connect(meter);
  meter.connect(context.destination);
  let playhead = 0;
  let sources = [];
  let pending = null;
  let muted = false;
  let stream = null;
  let worklet = null;
  let personLevel = 0;
  let closed = false;
  const timers = new Set();

  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, Math.max(0, ms));
    timers.add(id);
  };
  const send = (data) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
  };

  async function listen() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        },
      });
      await context.audioWorklet.addModule('/static/intake-mic.worklet.js');
      worklet = new AudioWorkletNode(context, 'stellis-mic');
      worklet.port.onmessage = ({data}) => {
        personLevel = muted ? 0 : data.level;
        if (!muted && socket.readyState === WebSocket.OPEN)
          socket.send(data.pcm);
      };
      context.createMediaStreamSource(stream).connect(worklet);
      onEvent({type: 'mic', ok: true});
    } catch {
      onEvent({type: 'mic', ok: false});
    }
  }

  /** Queues one piece of the agent's speech. */
  function play(bytes, piece) {
    const samples = new Int16Array(bytes);
    const buffer = context.createBuffer(1, samples.length, piece.rate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    const at = Math.max(context.currentTime + 0.02, playhead);
    source.start(at);
    playhead = at + buffer.duration;
    sources.push(source);
    source.onended = () => {
      sources = sources.filter((item) => item !== source);
      if (!sources.length) send({type: 'played'});
    };
    const wait = (at - context.currentTime) * 1000;
    later(() => {
      onEvent({type: 'caption', text: piece.text});
      if (piece.first) send({type: 'playing', turn: piece.turn});
    }, wait);
  }

  function stopSpeech() {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // A source that already ended needs no stop.
      }
    }
    sources = [];
    playhead = 0;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    onEvent({type: 'caption', text: ''});
  }

  let lastTurn = -1;
  socket.onmessage = ({data}) => {
    if (data instanceof ArrayBuffer) {
      if (pending) play(data, pending);
      pending = null;
      return;
    }
    const message = JSON.parse(data);
    if (message.type === 'say') {
      const first = message.turn !== lastTurn;
      lastTurn = message.turn;
      if (message.audio) {
        pending = {...message, first};
      } else {
        onEvent({type: 'caption', text: message.text});
      }
    } else if (message.type === 'stop') {
      stopSpeech();
    } else if (message.type === 'ended') {
      const left = Math.max(0, playhead - context.currentTime) * 1000;
      later(() => onEvent({type: 'ended'}), left + 400);
      return;
    }
    onEvent(message);
  };
  socket.onopen = () => listen();
  socket.onclose = () => {
    if (!closed) onEvent({type: 'closed'});
  };

  const levels = new Uint8Array(meter.fftSize);
  (function measure() {
    if (closed) return;
    meter.getByteTimeDomainData(levels);
    let sum = 0;
    for (const value of levels) sum += ((value - 128) / 128) ** 2;
    onEvent({
      type: 'level',
      person: personLevel,
      agent: Math.sqrt(sum / levels.length),
      speaking: playhead > context.currentTime
    });
    requestAnimationFrame(measure);
  })();

  return {
    /** @param {boolean} value */
    setMuted(value) {
      muted = value;
      for (const track of stream?.getAudioTracks() || [])
        track.enabled = !value;
    },
    /** @param {boolean} value */
    setSpeaker(value) {
      output.gain.value = value ? 1 : 0;
      send({type: 'speaker', on: value});
    },
    /** @param {string} text */
    sendText(text) {
      send({type: 'text', text});
    },
    end() {
      closed = true;
      send({type: 'end'});
      stopSpeech();
      socket.close();
      for (const track of stream?.getTracks() || []) track.stop();
      context.close();
    },
  };
}

root.StellisIntakeCall = {start};
})(window);
