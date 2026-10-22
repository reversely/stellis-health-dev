/**
 * @fileoverview Microphone capture for the intake call. Resamples the input
 * to 16 kHz mono 16-bit PCM by averaging, and posts 20 ms frames with their
 * loudness, which the call screen shows as a ring around the speaker.
 */
const TARGET_RATE = 16000;
const FRAME = 320;

class StellisMic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.squares = 0;
    this.frame = new Int16Array(FRAME);
    this.filled = 0;
  }

  /** @override */
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count++;
      this.phase++;
      if (this.phase < this.ratio) continue;
      this.phase -= this.ratio;
      const value = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0;
      this.count = 0;
      this.squares += value * value;
      this.frame[this.filled++] = value * 32767;
      if (this.filled === FRAME) {
        const level = Math.sqrt(this.squares / FRAME);
        this.port.postMessage(
            {pcm: this.frame.buffer, level}, [this.frame.buffer]);
        this.frame = new Int16Array(FRAME);
        this.filled = 0;
        this.squares = 0;
      }
    }
    return true;
  }
}

registerProcessor('stellis-mic', StellisMic);
