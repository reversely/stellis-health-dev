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
