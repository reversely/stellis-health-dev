/**
 * @fileoverview Measures the pulse from the front camera with vitallens'
 * local POS method. The video never leaves the browser: vitallens runs face
 * detection and the pulse signal method on the device, and only the final
 * number and a quality score are saved as a camera reading.
 */
(function(root) {
'use strict';

const LIBRARY = '/static/vendor/vitallens/vitallens.browser.js';
/** How long to measure once a face is found. */
const DURATION_MS = 45000;
/** The reading comes from estimates in this final stretch. */
const WINDOW_MS = 20000;
const MIN_ESTIMATES = 10;
/** The share of results that must contain a face. */
const MIN_FACE_SHARE = 0.9;
/** The largest spread (10th to 90th percentile) of a steady reading. */
const MAX_SPREAD_BPM = 8;
const BPM_BOUNDS = [40, 180];

/**
 * Sums up a capture's estimates into one reading.
 * @param {!Array<{t: number, bpm: ?number, face: boolean}>} samples Every
 *     vitals event of the capture, oldest first; t is in milliseconds.
 * @return {{ok: boolean, bpm: ?number, quality: number, reason: string}}
 *     reason is "", "face", "short" or "steady".
 */
function summarize(samples) {
  if (!samples.length) {
    return {ok: false, bpm: null, quality: 0, reason: 'short'};
  }
  const faceShare =
      samples.filter((sample) => sample.face).length / samples.length;
  const end = samples[samples.length - 1].t;
  const recent = samples
                     .filter(
                         (sample) => sample.t >= end - WINDOW_MS &&
                             sample.bpm != null && sample.face)
                     .map((sample) => sample.bpm)
                     .sort((a, b) => a - b);
  if (recent.length < MIN_ESTIMATES) {
    return {
      ok: false,
      bpm: null,
      quality: 0,
      reason: faceShare < MIN_FACE_SHARE ? 'face' : 'short',
    };
  }
  const at = (fraction) => recent[Math.round((recent.length - 1) * fraction)];
  const bpm = Math.round(at(0.5));
  const spread = at(0.9) - at(0.1);
  const quality = Math.max(
      0, Math.min(1, faceShare * (1 - spread / (MAX_SPREAD_BPM * 2.5))));
  let reason = '';
  if (faceShare < MIN_FACE_SHARE) {
    reason = 'face';
  } else if (
      spread > MAX_SPREAD_BPM || bpm < BPM_BOUNDS[0] || bpm > BPM_BOUNDS[1]) {
    reason = 'steady';
  }
  return {
    ok: !reason,
    bpm,
    quality: Math.round(quality * 100) / 100,
    reason,
  };
}

const FAILURE_TEXT = {
  face: 'Your face left the oval too often. Keep it inside the oval and ' +
      'try again.',
  short: 'The camera did not see your face long enough. Try again in ' +
      'brighter light.',
  steady: 'The reading kept changing. Sit still, face a window or lamp, ' +
      'and try again.',
};

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

/** The measuring dialog. */
class PulseDialog {
  /**
   * @param {function(): !Promise<void>} onSaved Runs after a reading is saved.
   */
  constructor(onSaved) {
    const dom = root.StellisDom;
    this.dom = dom;
    this.onSaved = onSaved;
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
             of ['Sit still and face a window or lamp',
                 'Keep your face inside the oval for about 45 seconds',
                 'The video stays on this device. Only the number is saved.',
    ]) {
      tips.append(dom.el('li', text));
    }
    const start = dom.button('Start', 'pulse-primary');
    start.addEventListener('click', () => this.measure());
    this.body.replaceChildren(
        tips, start,
        dom.el(
            'p', 'A wellness estimate, not a medical measurement.',
            'pulse-note'));
    start.focus();
  }

  async measure() {
    const dom = this.dom;
    const video =
        /** @type {!HTMLVideoElement} */ (dom.el('video', null, 'pulse-video'));
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    const frame = dom.el('div', null, 'pulse-frame');
    frame.append(video, dom.el('div', null, 'pulse-oval'));
    this.status = dom.el('p', 'Starting the camera', 'pulse-status');
    this.status.setAttribute('role', 'status');
    this.bar = dom.el('div', null, 'pulse-bar');
    const track = dom.el('div', null, 'pulse-track');
    track.append(this.bar);
    const cancel = dom.button('Cancel');
    cancel.addEventListener('click', () => this.dialog.close());
    this.body.replaceChildren(frame, this.status, track, cancel);

    this.samples = [];
    this.firstFace = null;
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
      await this.lens.setVideoStream(this.stream, video);
      this.lens.startVideoStream();
      this.status.textContent = 'Looking for your face';
    } catch (error) {
      this.stop();
      this.failed(cameraError(error));
    }
  }

  /** @param {*} result A vitallens vitals event. */
  onVitals(result) {
    if (!this.lens) {
      return;
    }
    const now = performance.now();
    const face =
        Boolean(result && result.face && Object.keys(result.face).length);
    const heart = result && result.vitals && result.vitals.heart_rate;
    if (face && this.firstFace === null) {
      this.firstFace = now;
    }
    if (this.firstFace === null) {
      return;
    }
    this.samples.push({
      t: now - this.firstFace,
      bpm: heart && Number.isFinite(heart.value) ? heart.value : null,
      face,
    });
    const elapsed = now - this.firstFace;
    const left = Math.max(0, Math.ceil((DURATION_MS - elapsed) / 1000));
    this.status.textContent =
        face ? `Hold still · ${left} s left` : 'Move your face into the oval';
    this.bar.style.transform = `scaleX(${Math.min(elapsed / DURATION_MS, 1)})`;
    if (elapsed >= DURATION_MS) {
      const summary = summarize(this.samples);
      this.stop();
      if (summary.ok) {
        this.result(summary);
      } else {
        this.failed(FAILURE_TEXT[summary.reason]);
      }
    }
  }

  /** @param {{bpm: number, quality: number}} summary */
  result(summary) {
    const dom = this.dom;
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
        dom.el('p', 'Your pulse', 'pulse-label'), figure, error, buttons);
    save.focus();
  }

  /** @param {string} message */
  failed(message) {
    const dom = this.dom;
    const retry = dom.button('Try again', 'pulse-primary');
    retry.addEventListener('click', () => this.measure());
    this.body.replaceChildren(
        dom.el('p', 'No steady reading', 'pulse-label'),
        dom.el('p', message, 'pulse-message'), retry);
    retry.focus();
  }

  /** Stops the camera and releases vitallens. */
  stop() {
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
 */
function open(onSaved) {
  new PulseDialog(onSaved).open();
}

/** @return {boolean} Whether this browser can open a camera. */
function supported() {
  return Boolean(
      root.navigator && navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia);
}

const exported = {
  DURATION_MS,
  open,
  summarize,
  supported,
};
root.StellisCameraPulse = exported;
if (typeof module !== 'undefined') {
  module.exports = exported;
}
})(typeof window !== 'undefined' ? window : globalThis);
