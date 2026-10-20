const test = require('node:test');
const assert = require('node:assert/strict');
const {STEPS, nextIndex, stepIndex, loadProgress, saveProgress, markSignup, progressKey, placeCard, stepBody} =
  require('../src/stellis/static/tour.js');

const all = () => true;
const ids = list => list.map(step => step.id);

test('the tour has the eight steps in order', () => {
  assert.deepEqual(ids(STEPS), ['sidebar', 'home', 'agents', 'chat', 'agent-settings', 'note', 'meeting', 'done']);
  assert.equal(STEPS.filter(step => step.last).length, 1);
});
test('next and back move one step', () => {
  assert.equal(nextIndex(STEPS, -1, 1, all), 0);
  assert.equal(nextIndex(STEPS, 2, 1, all), 3);
  assert.equal(nextIndex(STEPS, 2, -1, all), 1);
});
test('unavailable steps are skipped in both directions', () => {
  const noMeeting = step => step.id !== 'meeting';
  assert.equal(STEPS[nextIndex(STEPS, stepIndex(STEPS, 'note'), 1, noMeeting)].id, 'done');
  assert.equal(STEPS[nextIndex(STEPS, stepIndex(STEPS, 'done'), -1, noMeeting)].id, 'note');
});
test('moving past either end returns -1', () => {
  assert.equal(nextIndex(STEPS, STEPS.length - 1, 1, all), -1);
  assert.equal(nextIndex(STEPS, 0, -1, all), -1);
  assert.equal(nextIndex(STEPS, 0, 1, () => false), -1);
});
test('the meeting step needs a meeting and routes to it', () => {
  const meeting = STEPS[stepIndex(STEPS, 'meeting')];
  assert.equal(meeting.available({meeting: null}), false);
  assert.equal(meeting.route({meeting: 'a/b'}), '/conversation/a%2Fb');
});
test('the note step falls back to New note when no note exists', () => {
  const note = STEPS[stepIndex(STEPS, 'note')];
  assert.deepEqual(note.targets({page: null}), ['#home-new-note']);
  assert.equal(note.route({page: 'p1'}), '/page/p1');
  assert.match(stepBody(note, {page: null}), /Press New note/);
});

function memory() {
  const data = new Map();
  return {getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value), data};
}
test('progress is stored per account', () => {
  const storage = memory();
  saveProgress(storage, 'ada', {status: 'active', step: 'sidebar'});
  assert.deepEqual(loadProgress(storage, 'ada'), {status: 'active', step: 'sidebar'});
  assert.equal(loadProgress(storage, 'grace'), null);
  assert.notEqual(progressKey('ada'), progressKey('grace'));
  assert.equal(progressKey(null), progressKey(undefined));
});
test('sign-up marks the tour active at the first step, replacing old progress', () => {
  const storage = memory();
  saveProgress(storage, 'ada', {status: 'done', step: 'done'});
  markSignup(storage, 'ada');
  assert.deepEqual(loadProgress(storage, 'ada'), {status: 'active', step: 'sidebar'});
});
test('corrupt or unavailable storage never throws', () => {
  const storage = memory();
  storage.setItem(progressKey('ada'), '{not json');
  assert.equal(loadProgress(storage, 'ada'), null);
  storage.setItem(progressKey('ada'), JSON.stringify({status: 'weird', step: 'x'}));
  assert.equal(loadProgress(storage, 'ada'), null);
  const broken = {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }};
  assert.equal(loadProgress(broken, 'ada'), null);
  assert.doesNotThrow(() => saveProgress(broken, 'ada', {status: 'done', step: 'done'}));
});

test('the card sits beside a small target and docks for a large one or a phone', () => {
  const card = {width: 380, height: 200}, view = {width: 1440, height: 900};
  const small = {left: 100, top: 100, right: 300, bottom: 140, width: 200, height: 40};
  assert.deepEqual(placeCard(small, card, view), {left: 316, top: 100});
  const wide = {left: 700, top: 100, right: 1400, bottom: 140, width: 700, height: 40};
  assert.deepEqual(placeCard(wide, card, view), {left: 700 - 16 - 380, top: 100});
  const tall = {left: 0, top: 0, right: 300, bottom: 800, width: 300, height: 800};
  assert.deepEqual(placeCard(tall, card, view), {left: 1036, top: 676});
  assert.deepEqual(placeCard(tall, card, view, 'left'), {left: 24, top: 676});
  assert.deepEqual(placeCard(small, {width: 358, height: 200}, {width: 390, height: 800}), {left: 16, top: 576});
});
