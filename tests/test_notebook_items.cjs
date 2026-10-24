const test = require('node:test');
const assert = require('node:assert/strict');
const {isHexColour, inkFor, countTodos, buildItems, filterItems, latestSummary} = require('../src/stellis/static/notebook-items.js');

test('isHexColour accepts only #RRGGBB', () => {
  assert.ok(isHexColour('#45ADA8')); assert.ok(isHexColour('#abcdef'));
  for (const bad of ['45ADA8', '#45ADA', '#45ADA8F', '#GGGGGG', '', null]) assert.equal(isHexColour(bad), false);
});

test('inkFor picks the higher-contrast house ink', () => {
  assert.equal(inkFor('#495575'), '#F7F5F6');
  assert.equal(inkFor('#45ADA8'), '#27222B');
  assert.equal(inkFor('#FFFF00'), '#27222B');
  assert.equal(inkFor('nonsense'), '#F7F5F6');
});

test('countTodos sums open and done per source', () => {
  const group = (id, n) => ({source: {id}, items: Array.from({length: n}, () => ({}))});
  const counts = countTodos([group('a', 2), group('b', 1)], [group('a', 3)]);
  assert.deepEqual(counts.get('a'), {open: 2, done: 3});
  assert.deepEqual(counts.get('b'), {open: 1, done: 0});
  assert.equal(counts.get('c'), undefined);
});

test('buildItems merges meetings and notes newest first with tags and counts', () => {
  const items = buildItems({
    conversations: [{id: 'c1', title: 'Kickoff', created_at: '2026-10-01T10:00:00Z', recorded_at: '2026-10-03T10:00:00Z'}],
    pages: [{id: 'p1', title: 'Plan', updated_at: '2026-10-05T10:00:00Z', category_ids: ['t1']},
            {id: 'p2', title: 'Old', updated_at: '2026-09-01T10:00:00Z'}],
    tagsByConversation: new Map([['c1', ['t2']]]),
    counts: new Map([['p1', {open: 1, done: 2}]]),
  });
  assert.deepEqual(items.map(item => item.id), ['p1', 'c1', 'p2']);
  assert.deepEqual(items[0].todos, {open: 1, done: 2});
  assert.deepEqual(items[1].categoryIds, ['t2']);
  assert.deepEqual(items[2].todos, {open: 0, done: 0});
  assert.deepEqual(filterItems(items, 'page').map(item => item.id), ['p1', 'p2']);
  assert.deepEqual(filterItems(items, 'conversation').map(item => item.id), ['c1']);
  assert.equal(filterItems(items, 'all').length, 3);
});

test('latestSummary takes the newest meeting with an overview, unmodified', () => {
  const meetings = [{id: 'a', title: 'New', created_at: '2026-10-02T00:00:00Z'}, {id: 'b', title: 'Old', created_at: '2026-10-01T00:00:00Z'}];
  const text = '  We chose the **teal** design.  ';
  assert.deepEqual(latestSummary(meetings, new Map([['b', text]])), {id: 'b', title: 'Old', date: '2026-10-01T00:00:00Z', text});
  assert.equal(latestSummary(meetings, new Map()), null);
  assert.equal(latestSummary([], new Map()), null);
});

test('document entries appear in Records and retain their recorded dates', () => {
  const items = buildItems({documents:[{id:'scan',title:'Lab attachment',record_date:'2026-01-03',created_at:'2026-01-05'}]});
  assert.equal(items[0].kind,'document');
  assert.equal(items[0].date,'2026-01-03');
  assert.equal(filterItems(items,'document')[0].id,'scan');
});
