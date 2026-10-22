// The text and progress the Today section and Trends show for goals.
const test = require('node:test');
const assert = require('node:assert/strict');
const goals = require('../src/stellis/static/goals.js');
const trends = require('../src/stellis/static/trends.js');

const daily = {kind: 'daily', label: 'Steps', unit: 'steps', decimals: 0, target: 7000, direction: 'at_least',
               today: 4210, met_today: false, streak: 3, streak_unit: 'day'};

test('each tracker kind has a one-line summary', () => {
  assert.equal(goals.summary(daily), '4,210 of 7,000 steps today');
  assert.equal(goals.summary({...daily, label: 'Drinks', unit: 'drinks', target: 2, today: 1, direction: 'at_most'}),
               '1 today, at most 2 drinks');
  assert.equal(goals.summary({kind: 'weekly', target: 1, this_week: 1}), '1 of 1 day this week');
  assert.equal(goals.summary({kind: 'weekly', target: 3, this_week: 2}), '2 of 3 days this week');
  assert.equal(goals.summary({kind: 'timer', target: 840, today: 560}), '9 h 20 min of 14 h today');
  assert.equal(goals.summary({kind: 'without', label: 'Smoking', streak: 1}), '1 day without smoking');
  assert.equal(goals.summary({kind: 'target', unit: 'kg', decimals: 1, latest: 88.4, target: 85}),
               '88.4 kg now, target 85 kg');
  assert.equal(goals.summary({kind: 'target', latest: null}), 'Log a reading to start');
});

test('streaks name their unit and progress stays between 0 and 1', () => {
  assert.equal(goals.streakText(daily), '3-day streak');
  assert.equal(goals.streakText({...daily, streak: 0}), '');
  assert.equal(goals.streakText({kind: 'weekly', streak: 2, streak_unit: 'week'}), '2-week streak');
  assert.equal(goals.fraction({...daily, today: 9000}), 1);
  assert.equal(goals.fraction({kind: 'daily', direction: 'at_most', met_today: true}), 1);
  assert.equal(goals.fraction({kind: 'weekly', target: 4, this_week: 1}), 0.25);
  assert.equal(goals.clock(3 * 3600e3 + 12 * 60e3 + 5e3), '3:12:05');
});

test('Trends charts counted measures as one total per day and keeps the entries', () => {
  const water = {daily: 'sum', points: [
    {id: 'a', time: '2026-10-21T08:00:00+00:00', value: 1, source: 'self'},
    {id: 'b', time: '2026-10-21T09:00:00+00:00', value: 2, source: 'self'},
    {id: 'c', time: '2026-10-22T09:00:00+00:00', value: 1, source: 'self'},
  ]};
  const charted = trends.dailyTotals(water);
  assert.deepEqual(charted.points.map((p) => [p.value, p.id]), [[3, null], [1, null]]);
  assert.equal(charted.entries.length, 3);
  const weight = {daily: 'last', points: water.points};
  assert.equal(trends.dailyTotals(weight), weight);
});
