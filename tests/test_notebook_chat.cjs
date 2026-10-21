const test = require('node:test');
const assert = require('node:assert/strict');
const {answerParts} = require('../src/stellis/static/notebook-chat.js');

test('answerParts splits paragraphs and turns known markers into citations', () => {
  const visit = {n: 1, title: 'Clinic visit', target: '/conversation/a?at=s&t=42000', excerpt: 'Keep the dose'};
  const parts = answerParts('The dose stays. [[1]]\n\nAsk again. [[2]]', [visit]);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[0], [{text: 'The dose stays. '}, {citation: visit}]);
  assert.deepEqual(parts[1], [{text: 'Ask again. '}, {text: '[[2]]'}]);
});

const {answerMarkdown} = require('../src/stellis/static/notebook-chat.js');
const {parseTarget} = require('../src/stellis/static/notebook-viewer.js');

test('answerMarkdown keeps the numbers and lists each cited source as a link', () => {
  const citations = [{n: 1, title: 'Prostate report', page: 2, target: '/document/d?page=2'}, {n: 2, title: 'Voice [note]', target: '/conversation/c?at=s&t=0'}];
  assert.equal(answerMarkdown('Gleason 9. [[1]] PSA soon. [[2]]', citations),
    'Gleason 9. [1] PSA soon. [2]\n\n## Sources\n\n- 1. [Prostate report, page 2](/document/d?page=2)\n- 2. [Voice note](/conversation/c?at=s&t=0)');
  assert.equal(answerMarkdown('No sources cover this', []), 'No sources cover this');
});

test('parseTarget reads conversation, document and note links and rejects others', () => {
  assert.deepEqual(parseTarget('/conversation/abc?at=seg-1&t=42000'),
    {kind: 'conversation', id: 'abc', segment: 'seg-1', ms: 42000, page: null, href: '/conversation/abc?at=seg-1&t=42000'});
  assert.equal(parseTarget('/document/d1?page=3').page, 3);
  assert.equal(parseTarget('/page/p1').kind, 'page');
  assert.equal(parseTarget('/conversation/abc').ms, null);
  assert.equal(parseTarget('/settings'), null);
  assert.equal(parseTarget('https://example.com/page/x'), null);
  assert.equal(parseTarget('/page/x/extra'), null);
});
