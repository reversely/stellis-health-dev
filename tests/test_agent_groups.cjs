const test = require('node:test');
const assert = require('node:assert/strict');
const {groupAgents} = require('../src/stellis/shared/agent-groups.js');

const collections = [{id: 'work', name: 'Work', color: '#495575', notebook_ids: ['water', 'rfi']}, {id: 'empty', name: 'Empty', notebook_ids: []}];
const book = (id, steward = false) => ({notebook_id: id, notebook_name: id, is_steward: steward});
const agents = [
  {id: 'g', name: 'General', is_default: true, notebooks: []},
  {id: 'w', name: 'Writing', notebooks: [book('water'), book('rfi'), book('garden')]},
  {id: 's', name: 'Water Steward', notebooks: [book('water', true)]},
  {id: 'r', name: 'Research', notebooks: []},
];

test('groups follow collections, then loose notebooks, then no notebook', () => {
  const groups = groupAgents(agents, collections);
  assert.deepEqual(groups.map(group => group.name), ['Work', 'Notebooks', 'No notebook']);
});

test('an agent appears once per group with that group\'s notebooks', () => {
  const [work, loose] = groupAgents(agents, collections);
  const writing = work.items.find(item => item.agent.id === 'w');
  assert.deepEqual(writing.books.map(item => item.notebook_id), ['water', 'rfi']);
  assert.equal(work.items.filter(item => item.agent.id === 'w').length, 1);
  assert.deepEqual(loose.items.map(item => item.agent.id), ['w']);
});

test('coordinators lead each group, then names in order', () => {
  const groups = groupAgents(agents, collections);
  assert.deepEqual(groups[0].items.map(item => item.agent.id), ['s', 'w']);
  assert.deepEqual(groups[2].items.map(item => item.agent.id), ['g', 'r']);
});

test('no agents gives no groups', () => {
  assert.deepEqual(groupAgents([], collections), []);
});
