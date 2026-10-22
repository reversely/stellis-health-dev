/**
 * @fileoverview Tests for the pure helpers behind the Trends page and its
 * charts.
 */
const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.StellisDom = require('../src/stellis/static/notebook-dom.js');
const chart = require('../src/stellis/static/trend-chart.js');
const {localInputValue, rangeSpan, summaryText} =
    require('../src/stellis/static/trends.js');

const WEIGHT = {
  key: 'weight',
  unit: 'kg',
  decimals: 1,
  paired: false
};
const PULSE = {
  key: 'pulse',
  unit: 'bpm',
  decimals: 0,
  paired: false
};
const PRESSURE = {
  key: 'blood_pressure',
  unit: 'mmHg',
  decimals: 0,
  paired: true
};

test('a bare date parses as local midnight', () => {
  const time = chart.parseTime('2024-03-14');
  const date = new Date(time);
  assert.deepEqual(
      [date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()],
      [2024, 2, 14, 0]);
  assert.equal(
      chart.parseTime('2024-03-14T07:30:00+00:00'),
      Date.UTC(2024, 2, 14, 7, 30));
  assert.equal(chart.longDate(time), '14 Mar 2024');
});

test('values format with their decimals, pairs with a slash', () => {
  assert.equal(chart.formatValue({value: 95.2, value2: null}, 1), '95.2');
  assert.equal(chart.formatValue({value: 88, value2: 64}, 0), '88/64');
  assert.equal(chart.formatValue({value: 66.4, value2: null}, 0), '66');
});

test('nice ticks land on round steps', () => {
  assert.deepEqual(chart.niceTicks(83.2, 96.7, 4), [85, 90, 95]);
  assert.deepEqual(chart.niceTicks(0, 1, 3), [0, 0.5, 1]);
  assert.deepEqual(chart.niceTicks(5, 5, 4), [5]);
});

test('the y scale keeps the usual band and a minimum span', () => {
  const flat = [{value: 14, value2: null}, {value: 15, value2: null}];
  const scale = chart.yScale(flat, null, chart.MIN_SPAN.breathing_rate);
  assert.ok(scale.max - scale.min >= 8);
  const banded = chart.yScale(flat, {low: 10, high: 20}, 0);
  assert.ok(banded.min <= 10 && banded.max >= 20);
  const pairs = chart.yScale([{value: 120, value2: 80}], null, 0);
  assert.ok(pairs.min < 80 && pairs.max > 120);
});

test('time ticks pick years, months or days to fit', () => {
  const years = chart.timeTicks(
      new Date(2016, 6, 1).getTime(), new Date(2026, 9, 22).getTime(), 6);
  assert.deepEqual(
      years.map((tick) => tick.label),
      ['2018', '2020', '2022', '2024', '2026']);
  const months = chart.timeTicks(
      new Date(2026, 6, 22).getTime(), new Date(2026, 9, 22).getTime(), 4);
  assert.deepEqual(
      months.map((tick) => tick.label), ['Aug 2026', 'Sep', 'Oct']);
  const days = chart.timeTicks(
      new Date(2026, 9, 1).getTime(), new Date(2026, 9, 31).getTime(), 6);
  assert.deepEqual(
      days.map((tick) => tick.label).slice(0, 2), ['2 Oct', '9 Oct']);
});

test('the nearest reading is found by time', () => {
  const times = [10, 20, 40];
  assert.equal(chart.nearestIndex(times, 0), 0);
  assert.equal(chart.nearestIndex(times, 14), 0);
  assert.equal(chart.nearestIndex(times, 16), 1);
  assert.equal(chart.nearestIndex(times, 31), 2);
  assert.equal(chart.nearestIndex(times, 99), 2);
  assert.equal(chart.nearestIndex([], 5), -1);
});

test('ranges end now; All starts just before the first reading', () => {
  const now = Date.UTC(2026, 9, 22);
  const day = 24 * 60 * 60 * 1000;
  assert.deepEqual(rangeSpan('1m', [], now), {start: now - 31 * day, end: now});
  const span = rangeSpan('all', [{points: [{time: '2017-02-02'}]}], now);
  assert.ok(span.start < chart.parseTime('2017-02-02'));
  assert.equal(span.end, now);
});

test('summaries show change, average or the highest reading', () => {
  const weights = [
    {time: '2024-03-14', value: 95.2, value2: null},
    {time: '2025-11-17', value: 86.6, value2: null},
  ];
  assert.equal(
      summaryText(weights, WEIGHT, '1y'), 'Down 8.6 kg in this period');
  assert.equal(
      summaryText(weights, WEIGHT, 'all'), 'Highest 95.2 kg in Mar 2024');
  assert.equal(summaryText(weights.slice(0, 1), WEIGHT, '1y'), '');
  assert.equal(
      summaryText([{value: 64}, {value: 68}], PULSE, '3m'), 'Average 66 bpm');
  assert.equal(
      summaryText(
          [{value: 100, value2: 60}, {value: 110, value2: 70}], PRESSURE, '3m'),
      'Average 105/65 mmHg');
});

test('a date becomes a datetime-local value in local time', () => {
  const value = localInputValue(new Date(2026, 9, 22, 7, 5));
  assert.equal(value, '2026-10-22T07:05');
});

const pulse = require('../src/stellis/static/camera-pulse.js');

test('the face check wants a centred face of the right size', () => {
  assert.equal(pulse.faceCheck(null, 480, 640), 'none');
  assert.equal(pulse.faceCheck([160, 140, 320, 450], 480, 640), '');
  assert.equal(pulse.faceCheck([10, 140, 120, 450], 480, 640), 'off');
  assert.equal(pulse.faceCheck([215, 250, 265, 330], 480, 640), 'far');
  assert.equal(pulse.faceCheck([60, 10, 420, 600], 480, 640), 'close');
});

test('the light check finds dark, backlit and glaring faces', () => {
  assert.equal(pulse.lightCheck(null, 120), '');
  assert.equal(pulse.lightCheck(130, 140), '');
  assert.equal(pulse.lightCheck(50, 55), 'dark');
  assert.equal(pulse.lightCheck(80, 170), 'backlit');
  assert.equal(pulse.lightCheck(230, 230), 'bright');
});

test('the still check measures the last second of movement', () => {
  const steady = [0, 300, 600, 900].map((t) => ({t, x: 0.5, y: 0.46}));
  assert.equal(pulse.stillCheck(steady), '');
  const moving = steady.map((centre, i) => ({...centre, x: 0.5 + i * 0.03}));
  assert.equal(pulse.stillCheck(moving), 'moving');
  const old = [
    {t: 0, x: 0.2, y: 0.46},
    ...steady.map((centre) => ({...centre, t: centre.t + 1200}))
  ];
  assert.equal(pulse.stillCheck(old), '');
});

test('chips pass before the failing check and wait after it', () => {
  assert.deepEqual(
      pulse.checkStates(''),
      {face: 'pass', light: 'pass', still: 'pass', signal: 'pass'});
  assert.deepEqual(
      pulse.checkStates('backlit'),
      {face: 'pass', light: 'fail', still: 'wait', signal: 'wait'});
});

test('a reading is described against the usual range', () => {
  const usual = {low: 60.2, high: 70.4};
  assert.equal(pulse.usualText(64, usual), 'About your usual (60 to 70)');
  assert.equal(pulse.usualText(76, usual), 'Higher than your usual (60 to 70)');
  assert.equal(pulse.usualText(55, usual), 'Lower than your usual (60 to 70)');
  assert.match(pulse.usualText(64, null), /few more readings/);
});

test('the summary takes the median of the last 20 s of good signal', () => {
  const samples = [];
  for (let t = 0; t <= 30000; t += 100) {
    samples.push({t, bpm: t < 5000 ? 90 : 64 + (t % 3)});
  }
  const result = pulse.summarize(samples);
  assert.deepEqual([result.ok, result.bpm], [true, 65]);
  assert.ok(result.quality > 0.8);
  const jumpy = samples.map((s) => ({...s, bpm: 60 + (s.t % 2000) / 100}));
  assert.deepEqual(
      [pulse.summarize(jumpy).ok, pulse.summarize(jumpy).reason],
      [false, 'steady']);
  assert.equal(pulse.summarize([]).reason, 'steady');
});

/**
 * Feeds events to a capture until it finishes or time runs out.
 * @param {function(number): !Object} eventAt Event fields by time.
 * @return {!Object} The last update.
 */
function run(eventAt) {
  const state = new pulse.CaptureState(0);
  let update;
  for (let now = 33; now <= pulse.MAX_MS + 100; now += 33) {
    update = state.update({
      now,
      width: 480,
      height: 640,
      box: [160, 140, 320, 450],
      wave: 1,
      bpm: 66,
      faceLuma: 130,
      frameLuma: 140,
      ...eventAt(now),
    });
    if (update.done) {
      break;
    }
  }
  return update;
}

test('the countdown pauses while a check fails and then finishes', () => {
  const update = run((now) => now > 5000 && now < 15000 ? {box: null} : {});
  assert.equal(update.done, true);
  assert.deepEqual([update.result.ok, update.result.bpm], [true, 66]);
  assert.ok(update.goodMs >= pulse.GOOD_MS);
});

test('a capture that never gets good light names the light', () => {
  const update = run(() => ({faceLuma: 40, frameLuma: 45}));
  assert.deepEqual(
      [update.done, update.result.ok, update.result.reason],
      [true, false, 'light']);
});

test('no waveform for three seconds is a missing signal', () => {
  const update = run(() => ({wave: 0}));
  assert.equal(update.result.reason, 'signal');
});

test('the oval path starts at the top of the oval', () => {
  assert.equal(pulse.ovalPath(300, 400), 'M150 40A96 144 0 1 1 149.99 40Z');
});
