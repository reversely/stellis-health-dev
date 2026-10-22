// Copy that Home's health overview and goals show.
const test = require('node:test');
const assert = require('node:assert/strict');
const goals = require('../src/stellis/static/goals.js');
const trends = require('../src/stellis/static/trends.js');

const walk = {times_per_week: 4, this_week: 2, done_today: false, noun: ['walk', 'walks']};

test('encouragement names what reaches a weekly goal', () => {
  assert.equal(goals.encouragement(walk, 4), "Two more walks reach this week's goal.");
  assert.equal(goals.encouragement({...walk, this_week: 3}, 4), "One more walk reaches this week's goal.");
  assert.equal(goals.encouragement({...walk, this_week: 3, done_today: true}, 4),
               "Logged today. One more walk reaches this week's goal.");
  assert.equal(goals.encouragement({...walk, this_week: 4}, 4), 'Goal reached for this week. Well done.');
  assert.equal(goals.encouragement({...walk, this_week: 1}, 2), 'One so far this week. Every one counts.');
  assert.equal(goals.encouragement({...walk, this_week: 0}, 2), 'Start this week with a walk today.');
});

test('frequency, reminder times and overview context read as plain sentences', () => {
  assert.equal(goals.frequencyText(7), 'Every day');
  assert.equal(goals.frequencyText(1), 'Once a week');
  assert.equal(goals.frequencyText(3), '3 times a week');
  assert.equal(goals.clockText('20:00'), '8:00 pm');
  assert.equal(goals.clockText('07:30'), '7:30 am');
  assert.equal(goals.clockText('00:15'), '12:15 am');
  assert.equal(goals.contextText({status: 'usual', points: []}), 'Within your usual range');
  assert.equal(goals.contextText({status: 'unknown', points: [{}, {}, {}, {}]}),
               'Two more readings show your usual range');
  assert.equal(goals.contextText({status: 'unknown', points: [{}, {}, {}, {}, {}]}),
               'One more reading shows your usual range');
});

test('Trends charts a sleep total per day and keeps the entries', () => {
  const sleep = {daily: 'sum', points: [
    {id: 'a', time: '2026-10-21T06:00:00+00:00', value: 6, source: 'self'},
    {id: 'b', time: '2026-10-21T15:00:00+00:00', value: 1, source: 'self'},
  ]};
  const charted = trends.dailyTotals(sleep);
  assert.deepEqual(charted.points.map((p) => [p.value, p.id]), [[7, null]]);
  assert.equal(charted.entries.length, 2);
});
