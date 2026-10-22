/**
 * @fileoverview Measures the pulse from the front camera with vitallens'
 * local POS method. The video never leaves the browser: vitallens runs face
 * detection and the pulse method on the device, brightness is sampled from a
 * small canvas, and only the final number and a quality score are saved.
 *
 * The design is in plans/camera-vitals-capture.md. Four checks (face, light,
 * stillness, signal) must pass for the countdown to run; it pauses, without
 * resetting, while one fails.
 */
(function(root) {
'use strict';

const LIBRARY = '/static/vendor/vitallens/vitallens.browser.js';
/** Milliseconds of good signal a reading needs. */
const GOOD_MS = 30000;
/** The longest attempt before the capture gives up. */
const MAX_MS = 90000;
/** The reading comes from estimates in this final stretch of good signal. */
const WINDOW_MS = 20000;
const MIN_ESTIMATES = 10;
/** The largest spread (10th to 90th percentile) of a steady reading. */
const MAX_SPREAD_BPM = 8;
const BPM_BOUNDS = [40, 180];
/** The oval guide's centre, as fractions of the frame. */
const OVAL_CENTRE = [0.5, 0.46];
const CENTRE_TOLERANCE = 0.15;
/** Face box height as a fraction of the frame height. */
const FACE_HEIGHT = [0.3, 0.85];
const LUMA = {
  dark: 70,
  bright: 215,
  backlit: 45
};
/** Largest movement of the face centre over a second, as a frame fraction. */
const MAX_MOVEMENT = 0.04;
/** Waveform samples must have arrived within this time for a signal. */
const SIGNAL_MS = 3000;
const SAMPLE_MS = 400;
/** Gaps between events longer than this count as this long. */
const MAX_STEP_MS = 250;
const SPEAK_GAP_MS = 3000;
const SPEAK_KEY = 'stellis-pulse-speak';
const WAVE_SAMPLES = 150;

/** The instruction for each issue. */
const ISSUES = {
  none: 'Move your face into the oval',
  off: 'Move your face into the oval',
  far: 'Move closer',
  close: 'Move back a little',
  dark: 'Find more light',
  backlit: 'Turn toward the light',
  bright: 'Too bright, step out of direct sun',
  moving: 'Hold still',
  signal: 'Getting your pulse',
};
/** The check each issue belongs to. */
const CHECK_OF = {
  none: 'face',
  off: 'face',
  far: 'face',
  close: 'face',
  dark: 'light',
  backlit: 'light',
  bright: 'light',
  moving: 'still',
  signal: 'signal',
};
/** The checks in the order they are fixed. */
const CHECKS = [
  ['face', 'Face'],
  ['light', 'Light'],
  ['still', 'Still'],
  ['signal', 'Pulse'],
];
const FAILURE_TEXT = {
  face: 'Your face kept leaving the oval. Prop the phone up and keep your ' +
      'face inside the oval.',
  light: 'The light was not good enough. Face a window or lamp, with no ' +
      'bright light behind you.',
  still: 'There was too much movement. Rest your arms and hold still.',
  signal: 'The camera could not pick up your pulse. Try brighter, even light.',
  steady: 'The reading kept changing. Sit still for a minute, then try again.',
};

/**
 * Checks where the face is in the frame.
 * @param {?Array<number>} box [x0, y0, x1, y1] in video pixels, or null.
 * @param {number} width The video's width in pixels.
 * @param {number} height The video's height in pixels.
 * @return {string} '' when it fits, else 'none', 'off', 'far' or 'close'.
 */
function faceCheck(box, width, height) {
  if (!box || !width || !height) {
    return 'none';
  }
  const [x0, y0, x1, y1] = box;
  const centreX = (x0 + x1) / 2 / width;
  const centreY = (y0 + y1) / 2 / height;
  if (Math.abs(centreX - OVAL_CENTRE[0]) > CENTRE_TOLERANCE ||
      Math.abs(centreY - OVAL_CENTRE[1]) > CENTRE_TOLERANCE) {
    return 'off';
  }
  const size = (y1 - y0) / height;
  if (size < FACE_HEIGHT[0]) {
    return 'far';
  }
  if (size > FACE_HEIGHT[1]) {
    return 'close';
  }
  return '';
}

/**
 * Checks the light on the face.
 * @param {?number} face Mean luma of the face, 0 to 255.
 * @param {?number} frame Mean luma of the whole frame, 0 to 255.
 * @return {string} '' when good or not yet sampled, else 'dark', 'backlit'
 *     or 'bright'.
 */
function lightCheck(face, frame) {
  if (face == null) {
    return '';
  }
  if (face > LUMA.bright) {
    return 'bright';
  }
  if (frame != null && frame - face > LUMA.backlit) {
    return 'backlit';
  }
  if (face < LUMA.dark) {
    return 'dark';
  }
  return '';
}

/**
 * Checks that the face stayed still over the last second.
 * @param {!Array<{t: number, x: number, y: number}>} centres Face centres as
 *     frame fractions, oldest first.
 * @return {string} '' when still, else 'moving'.
 */
function stillCheck(centres) {
  if (centres.length < 2) {
    return '';
  }
  const end = centres[centres.length - 1].t;
  const recent = centres.filter((centre) => centre.t >= end - 1000);
  const xs = recent.map((centre) => centre.x);
  const ys = recent.map((centre) => centre.y);
  const spread = Math.max(
      Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return spread > MAX_MOVEMENT ? 'moving' : '';
}

/**
 * Sums up a capture's estimates into one reading.
 * @param {!Array<{t: number, bpm: ?number}>} samples Estimates taken while
 *     every check passed; t is milliseconds of good signal.
 * @return {{ok: boolean, bpm: ?number, quality: number, reason: string}}
 *     reason is '' or 'steady'.
 */
function summarize(samples) {
  const end = samples.length ? samples[samples.length - 1].t : 0;
  const recent =
      samples
          .filter((sample) => sample.t >= end - WINDOW_MS && sample.bpm != null)
          .map((sample) => sample.bpm)
          .sort((a, b) => a - b);
  if (recent.length < MIN_ESTIMATES) {
    return {ok: false, bpm: null, quality: 0, reason: 'steady'};
  }
  const at = (fraction) => recent[Math.round((recent.length - 1) * fraction)];
  const bpm = Math.round(at(0.5));
  const spread = at(0.9) - at(0.1);
  const quality = Math.max(0, Math.min(1, 1 - spread / (MAX_SPREAD_BPM * 2.5)));
  const ok =
      spread <= MAX_SPREAD_BPM && bpm >= BPM_BOUNDS[0] && bpm <= BPM_BOUNDS[1];
  return {
    ok,
    bpm,
    quality: Math.round(quality * 100) / 100,
    reason: ok ? '' : 'steady',
  };
}

/**
 * Follows one capture attempt: the checks, the paused countdown and the
 * estimates taken while every check passed. Holds no DOM, so tests drive it
 * directly.
 */
class CaptureState {
  /** @param {number} start When the attempt began, in milliseconds. */
  constructor(start) {
    this.start = start;
    this.last = start;
    this.goodMs = 0;
    this.centres = [];
    this.waveAt = -Infinity;
    this.samples = [];
    /** Milliseconds each check spent failing. */
    this.failing = {face: 0, light: 0, still: 0, signal: 0};
  }

  /**
   * Takes one vitals event.
   * @param {{now: number, box: ?Array<number>, width: number,
   *     height: number, wave: number, bpm: ?number, faceLuma: ?number,
   *     frameLuma: ?number}} event wave is how many waveform samples
   *     arrived with the event.
   * @return {{issue: string, goodMs: number, done: boolean,
   *     result: ?Object}} result is set once done.
   */
  update(event) {
    const step = Math.min(event.now - this.last, MAX_STEP_MS);
    this.last = event.now;
    if (event.wave > 0) {
      this.waveAt = event.now;
    }
    let issue = faceCheck(event.box, event.width, event.height);
    if (issue) {
      this.centres = [];
    } else {
      const [x0, y0, x1, y1] = event.box;
      this.centres.push({
        t: event.now,
        x: (x0 + x1) / 2 / event.width,
        y: (y0 + y1) / 2 / event.height,
      });
      this.centres =
          this.centres.filter((centre) => centre.t >= event.now - 1000);
      issue = lightCheck(event.faceLuma, event.frameLuma) ||
          stillCheck(this.centres) ||
          (event.now - this.waveAt > SIGNAL_MS ? 'signal' : '');
    }
    if (issue) {
      this.failing[CHECK_OF[issue]] += step;
    } else {
      this.goodMs += step;
      this.samples.push({t: this.goodMs, bpm: event.bpm});
    }
    if (this.goodMs >= GOOD_MS) {
      return this.finish(summarize(this.samples));
    }
    if (event.now - this.start >= MAX_MS) {
      const worst =
          Object.entries(this.failing).sort((a, b) => b[1] - a[1])[0][0];
      return this.finish({ok: false, bpm: null, quality: 0, reason: worst});
    }
    return {issue, goodMs: this.goodMs, done: false, result: null};
  }

  /**
   * @param {!Object} result
   * @return {{issue: string, goodMs: number, done: boolean, result: !Object}}
   */
  finish(result) {
    return {issue: '', goodMs: this.goodMs, done: true, result};
  }
}

/**
 * Gives each check chip its state for an issue: checks before the failing
 * one pass, the failing one fails, later ones wait.
 * @param {string} issue A key of ISSUES, or '' when all pass.
 * @return {!Object<string, string>} 'pass', 'fail' or 'wait' by check.
 */
function checkStates(issue) {
  const failing = issue ? CHECK_OF[issue] : '';
  const states = {};
  let seen = false;
  for (const [key] of CHECKS) {
    if (key === failing) {
      states[key] = 'fail';
      seen = true;
    } else {
      states[key] = seen ? 'wait' : 'pass';
    }
  }
  return states;
}

/**
 * Describes a pulse against the person's usual range.
 * @param {number} bpm
 * @param {?Object} usual {low, high} from GET /readings, or null.
 * @return {string}
 */
function usualText(bpm, usual) {
  if (!usual) {
    return 'Your usual range appears after a few more readings';
  }
  const range = `${Math.round(usual.low)} to ${Math.round(usual.high)}`;
  if (bpm > usual.high) {
    return `Higher than your usual (${range})`;
  }
  if (bpm < usual.low) {
    return `Lower than your usual (${range})`;
  }
  return `About your usual (${range})`;
}

/**
 * Explains why the camera could not start.
 * @param {*} error
 * @return {string}
 */
function cameraError(error) {
  const name = error && error.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access is blocked. Allow the camera for this site, ' +
        'then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device.';
  }
  return 'The camera reading could not start. Try again.';
}

/** @return {?SpeechSynthesisVoice} An on-device English voice, if any. */
function localVoice() {
  const speech = root.speechSynthesis;
  if (!speech) {
    return null;
  }
  const voices = speech.getVoices().filter((voice) => voice.localService);
  return voices.find((voice) => voice.lang.startsWith('en')) || voices[0] ||
      null;
}

/**
 * Spoken guidance is on unless the person turned it off on this device.
 * @return {boolean}
 */
function speakChosen() {
  try {
    return root.localStorage.getItem(SPEAK_KEY) !== 'off';
  } catch (error) {
    return true;
  }
}

const SVG = 'http://www.w3.org/2000/svg';
/** The oval's centre and radii as fractions of the stage. */
const OVAL = {
  cx: 0.5,
  cy: 0.46,
  rx: 0.32,
  ry: 0.36
};

/**
 * Draws the oval from its top point, so the progress ring starts there.
 * @param {number} width The stage's width in pixels.
 * @param {number} height The stage's height in pixels.
 * @return {string} An SVG path.
 */
function ovalPath(width, height) {
  const round = (value) => Math.round(value * 100) / 100;
  const cx = round(OVAL.cx * width);
  const top = round((OVAL.cy - OVAL.ry) * height);
  const rx = round(OVAL.rx * width);
  const ry = round(OVAL.ry * height);
  return `M${cx} ${top}A${rx} ${ry} 0 1 1 ${round(cx - 0.01)} ${top}Z`;
}

/**
 * Builds the camera overlay: a dimmed surround, the oval and its progress
 * ring, drawn in the stage's pixel space so the ring's stroke stays even.
 * @param {!Element} stage
 * @return {{svg: !Element, ring: !Element, observer: !ResizeObserver}}
 */
function overlay(stage) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'pulse-overlay');
  svg.setAttribute('aria-hidden', 'true');
  const path = (className) => {
    const element = document.createElementNS(SVG, 'path');
    element.setAttribute('class', className);
    return element;
  };
  const shade = path('pulse-shade');
  shade.setAttribute('fill-rule', 'evenodd');
  shade.setAttribute('fill', 'rgb(0 0 0 / 0.55)');
  const oval = path('pulse-oval');
  const ring = path('pulse-ring');
  ring.setAttribute('pathLength', '100');
  ring.setAttribute('stroke-dasharray', '0 100');
  svg.append(shade, oval, ring);
  const fit = () => {
    const width = stage.clientWidth || 300;
    const height = stage.clientHeight || 400;
    const d = ovalPath(width, height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    shade.setAttribute('d', `M0 0H${width}V${height}H0Z ${d}`);
    oval.setAttribute('d', d);
    ring.setAttribute('d', d);
  };
  const observer = new ResizeObserver(fit);
  observer.observe(stage);
  fit();
  return {svg, ring, observer};
}

/** The measuring dialog. */
class PulseDialog {
  /**
   * @param {function(): !Promise<void>} onSaved Runs after a reading is saved.
   * @param {?Object} measure The pulse measure from GET /readings.
   */
  constructor(onSaved, measure) {
    const dom = root.StellisDom;
    this.dom = dom;
    this.onSaved = onSaved;
    this.usual = measure ? measure.usual : null;
    this.speak = speakChosen();
    this.spokenAt = -Infinity;
    this.spoken = '';
    this.dialog = /** @type {!HTMLDialogElement} */ (
        dom.el('dialog', null, 'pulse-dialog'));
    this.dialog.setAttribute('aria-labelledby', 'pulse-title');
    const title = dom.el('h2', 'Measure your pulse');
    title.id = 'pulse-title';
    const close = dom.button(null, 'pulse-close');
    close.append(dom.icon('x'));
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.dialog.close());
    const head = dom.el('div', null, 'pulse-head');
    head.append(title, close);
    this.body = dom.el('div', null, 'pulse-body');
    this.dialog.append(head, this.body);
    this.dialog.addEventListener('close', () => {
      this.stop();
      root.speechSynthesis?.cancel();
      root.speechSynthesis?.removeEventListener(
          'voiceschanged', this.paintVoice);
      this.dialog.remove();
    });
    document.body.append(this.dialog);
  }

  open() {
    this.dialog.showModal();
    this.intro();
  }

  intro() {
    const dom = this.dom;
    const tips = dom.el('ul', null, 'pulse-tips');
    for (const text
             of ['Sit down and rest for a minute first',
                 'Face a window or lamp',
                 'Keep your face in the oval for about 30 seconds',
                 'The video stays on this device. Only the number is saved.',
    ]) {
      tips.append(dom.el('li', text));
    }
    const start = dom.button('Start', 'pulse-primary');
    start.addEventListener('click', () => this.measure());
    this.setStage('intro');
    this.body.replaceChildren(
        tips, start,
        dom.el(
            'p', 'A wellness estimate, not a medical measurement.',
            'pulse-note'));
    start.focus();
  }

  /**
   * Marks which screen shows, which sets the dialog's layout.
   * @param {string} stage 'intro', 'live' or 'done'.
   */
  setStage(stage) {
    this.dialog.dataset.stage = stage;
    if (stage !== 'live') {
      this.dialog.classList.remove('is-measuring');
    }
  }

  /** Builds the live screen: the camera stage beside a checks panel. */
  live() {
    const dom = this.dom;
    this.setStage('live');
    this.video =
        /** @type {!HTMLVideoElement} */ (dom.el('video', null, 'pulse-video'));
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute('aria-hidden', 'true');
    const stage = dom.el('div', null, 'pulse-stage');
    const {svg, ring, observer} = overlay(stage);
    this.ring = ring;
    this.observer = observer;
    // Desktop shows each cue as a caption on the video, next to the camera
    // the person is looking at; the status line already sits there on phones.
    this.caption = dom.el('p', null, 'pulse-caption');
    this.caption.setAttribute('aria-hidden', 'true');
    stage.append(this.video, svg, this.caption);

    this.status = dom.el('p', 'Starting the camera', 'pulse-status');
    this.status.setAttribute('role', 'status');
    const checks = dom.el('ul', null, 'pulse-checks');
    checks.setAttribute('aria-label', 'Checks');
    this.chips = {};
    for (const [key, label] of CHECKS) {
      const chip = dom.el('li', null, 'pulse-check');
      chip.dataset.state = 'wait';
      chip.append(
          dom.el('span', null, 'pulse-check-dot'), dom.el('span', label));
      this.chips[key] = chip;
      checks.append(chip);
    }
    this.wave =
        /** @type {!HTMLCanvasElement} */ (
            dom.el('canvas', null, 'pulse-wave'));
    this.wave.setAttribute('aria-hidden', 'true');
    this.waveData = [];

    const buttons = dom.el('div', null, 'pulse-buttons');
    buttons.append(this.voiceButton());
    const cancel = dom.button('Cancel');
    cancel.addEventListener('click', () => this.dialog.close());
    buttons.append(cancel);
    const panel = dom.el('div', null, 'pulse-panel');
    panel.append(this.status, checks, this.wave, buttons);
    const layout = dom.el('div', null, 'pulse-live');
    layout.append(stage, panel);
    this.body.replaceChildren(layout);
  }

  /** @return {!Element} The spoken-guidance toggle. */
  voiceButton() {
    const dom = this.dom;
    const button = dom.button(null, 'pulse-voice');
    const paint = () => {
      const available = Boolean(localVoice());
      const on = this.speak && available;
      button.replaceChildren(
          dom.icon(on ? 'volume' : 'volume-off'), dom.el('span', 'Voice'));
      button.setAttribute('aria-pressed', String(on));
      button.disabled = !available;
      button.title = available ? '' : 'No voice on this device';
    };
    button.addEventListener('click', () => {
      this.speak = !this.speak;
      try {
        root.localStorage.setItem(SPEAK_KEY, this.speak ? 'on' : 'off');
      } catch (error) {
        // Without storage the choice lasts for this capture only.
      }
      if (!this.speak) {
        root.speechSynthesis?.cancel();
      }
      paint();
    });
    // Chrome lists its voices only after the page asks for them once.
    root.speechSynthesis?.addEventListener('voiceschanged', paint);
    this.paintVoice = paint;
    paint();
    return button;
  }

  async measure() {
    this.live();
    // Safari speaks only after a tap, so the first cue runs inside the Start
    // tap, before anything waits.
    this.cue('Starting the camera', true);
    this.state = null;
    this.box = null;
    this.luma = {face: null, frame: null};
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(
          {video: {facingMode: 'user', width: {ideal: 640}}, audio: false});
      const {VitalLens} = await import(LIBRARY);
      if (!this.dialog.open) {
        this.stop();
        return;
      }
      // POS runs on the device; the API method would upload video.
      this.lens = new VitalLens({method: 'pos'});
      this.lens.addEventListener('vitals', (result) => this.onVitals(result));
      await this.lens.setVideoStream(this.stream, this.video);
      this.lens.startVideoStream();
      this.state = new CaptureState(performance.now());
      this.sampler = setInterval(() => this.sampleLight(), SAMPLE_MS);
    } catch (error) {
      this.stop();
      this.failed(cameraError(error));
    }
  }

  /** Samples brightness from a small canvas; nothing leaves the device. */
  sampleLight() {
    const video = this.video;
    if (!video || !video.videoWidth) {
      return;
    }
    const size = 48;
    this.canvas = this.canvas || document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    const context = this.canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(video, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    const luma = (x0, y0, x1, y1) => {
      let total = 0;
      let count = 0;
      for (let y = Math.max(0, y0); y < Math.min(size, y1); y++) {
        for (let x = Math.max(0, x0); x < Math.min(size, x1); x++) {
          const i = (y * size + x) * 4;
          total +=
              0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
          count++;
        }
      }
      return count ? total / count : null;
    };
    this.luma.frame = luma(0, 0, size, size);
    if (this.box) {
      const scaleX = size / video.videoWidth;
      const scaleY = size / video.videoHeight;
      this.luma.face = luma(
          Math.floor(this.box[0] * scaleX), Math.floor(this.box[1] * scaleY),
          Math.ceil(this.box[2] * scaleX), Math.ceil(this.box[3] * scaleY));
    }
  }

  /** @param {*} result A vitallens vitals event. */
  onVitals(result) {
    if (!this.lens || !this.state) {
      return;
    }
    const coordinates = result?.face?.coordinates;
    this.box = coordinates && coordinates.length ?
        coordinates[coordinates.length - 1] :
        null;
    const waveData = result?.waveforms?.ppg_waveform?.data;
    const samples = Array.isArray(waveData) ? waveData : [];
    const heart = result?.vitals?.heart_rate;
    const update = this.state.update({
      now: performance.now(),
      box: this.box,
      width: this.video.videoWidth,
      height: this.video.videoHeight,
      wave: samples.length,
      bpm: heart && Number.isFinite(heart.value) ? heart.value : null,
      faceLuma: this.luma.face,
      frameLuma: this.luma.frame,
    });
    if (!update.done) {
      this.paintLive(update, samples);
      return;
    }
    this.stop();
    if (update.result.ok) {
      this.result(update.result);
    } else {
      this.failed(FAILURE_TEXT[update.result.reason]);
    }
  }

  /**
   * @param {{issue: string, goodMs: number}} update
   * @param {!Array<number>} samples New waveform samples.
   */
  paintLive(update, samples) {
    const measuring = !update.issue;
    const left = Math.ceil((GOOD_MS - update.goodMs) / 1000);
    const text = measuring ? `Hold still · ${left} s` : ISSUES[update.issue];
    if (this.status.textContent !== text) {
      this.status.textContent = text;
    }
    this.cue(measuring ? 'Hold still' : ISSUES[update.issue]);
    this.dialog.classList.toggle('is-measuring', measuring);
    const progress = Math.min(update.goodMs / GOOD_MS, 1) * 100;
    this.ring.setAttribute('stroke-dasharray', `${progress.toFixed(1)} 100`);
    const states = checkStates(update.issue);
    for (const [key] of CHECKS) {
      this.chips[key].dataset.state = states[key];
    }
    this.drawWave(samples);
  }

  /** @param {!Array<number>} samples New waveform samples. */
  drawWave(samples) {
    this.waveData.push(...samples.filter(Number.isFinite));
    this.waveData = this.waveData.slice(-WAVE_SAMPLES);
    const canvas = this.wave;
    const ratio = root.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (!width || !height) {
      return;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, width, height);
    const values = this.waveData;
    if (values.length < 2) {
      return;
    }
    const min = Math.min(...values);
    const span = Math.max(...values) - min || 1;
    const pad = 3 * ratio;
    context.strokeStyle =
        getComputedStyle(this.dialog).getPropertyValue('--chart-series');
    context.lineWidth = 2 * ratio;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.beginPath();
    values.forEach((value, index) => {
      const x = (index / (WAVE_SAMPLES - 1)) * width;
      const y = height - pad - ((value - min) / span) * (height - 2 * pad);
      if (index) {
        context.lineTo(x, y);
      } else {
        context.moveTo(x, y);
      }
    });
    context.stroke();
  }

  /**
   * Captions a short cue and speaks it with an on-device voice, unless the
   * person turned the voice off.
   * @param {string} text
   * @param {boolean=} force Ignore the quiet gap between cues.
   */
  cue(text, force = false) {
    const now = performance.now();
    if (text === this.spoken ||
        (!force && now - this.spokenAt < SPEAK_GAP_MS)) {
      return;
    }
    this.spoken = text;
    this.spokenAt = now;
    if (this.caption) {
      this.caption.textContent = text;
    }
    const voice = this.speak ? localVoice() : null;
    if (!voice) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.rate = 0.95;
    root.speechSynthesis.cancel();
    root.speechSynthesis.speak(utterance);
  }

  /** @param {{bpm: number, quality: number}} summary */
  result(summary) {
    const dom = this.dom;
    this.setStage('done');
    this.cue(`Done. ${summary.bpm} beats per minute.`, true);
    const figure = dom.el('p', null, 'pulse-figure');
    figure.append(
        dom.el('span', String(summary.bpm), 'pulse-value'),
        dom.el('span', 'bpm', 'pulse-unit'));
    const error = dom.el('p', null, 'pulse-error');
    error.setAttribute('role', 'alert');
    const save = dom.button('Save', 'pulse-primary');
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await dom.api('/readings', {
          method: 'POST',
          json: {
            measure: 'pulse',
            value: summary.bpm,
            source: 'camera',
            quality: summary.quality,
          },
        });
        this.dialog.close();
        await this.onSaved();
      } catch (failure) {
        error.textContent = failure.message;
        save.disabled = false;
      }
    });
    const again = dom.button('Measure again');
    again.addEventListener('click', () => this.measure());
    const buttons = dom.el('div', null, 'pulse-buttons');
    buttons.append(save, again);
    this.body.replaceChildren(
        dom.el('p', 'Your pulse', 'pulse-label'), figure,
        dom.el('p', usualText(summary.bpm, this.usual), 'pulse-usual'), error,
        buttons);
    save.focus();
  }

  /** @param {string} message */
  failed(message) {
    const dom = this.dom;
    this.setStage('done');
    const retry = dom.button('Try again', 'pulse-primary');
    retry.addEventListener('click', () => this.measure());
    this.body.replaceChildren(
        dom.el('p', 'No steady reading', 'pulse-label'),
        dom.el('p', message, 'pulse-message'), retry);
    retry.focus();
  }

  /** Stops the camera, the light sampler and vitallens. */
  stop() {
    clearInterval(this.sampler);
    this.observer?.disconnect();
    if (this.lens) {
      const lens = this.lens;
      this.lens = null;
      lens.stopVideoStream();
      lens.close().catch(() => {});
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }
}

/**
 * Opens the measuring dialog.
 * @param {function(): !Promise<void>} onSaved
 * @param {?Object=} measure The pulse measure, for its usual range.
 */
function open(onSaved, measure = null) {
  new PulseDialog(onSaved, measure).open();
}

/** @return {boolean} Whether this browser can open a camera. */
function supported() {
  return Boolean(
      root.navigator && navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia);
}

const exported = {
  CaptureState,
  GOOD_MS,
  MAX_MS,
  checkStates,
  faceCheck,
  lightCheck,
  open,
  ovalPath,
  speakChosen,
  stillCheck,
  summarize,
  supported,
  usualText,
};
root.StellisCameraPulse = exported;
if (typeof module !== 'undefined') {
  module.exports = exported;
}
})(typeof window !== 'undefined' ? window : globalThis);
