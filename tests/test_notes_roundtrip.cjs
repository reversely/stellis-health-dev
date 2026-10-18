// Loads Markdown into a headless Lexical editor and exports it unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');

const FIXTURE = [
  '# Title', '', '## Section', '', '### Detail', '',
  'A paragraph with **bold**, *italic*, ~~struck~~, `code`, and a [link](https://example.com/a).', '',
  '> A quoted line', '', '```', 'const x = 1;', 'return x;', '```', '', '---', '',
  '- one', '- two', '', '1. first', '2. second', '',
  '- [ ] open task', '- [x] done task', '',
  '![shot](stellis-image:123e4567-e89b-12d3-a456-426614174000)', '',
  '| Name | Role |', '| --- | --- |', '| Ada | Lead |', '| Sam | Support |',
].join('\n');

async function roundTrip(markdown) {
  const {createEditor} = await import('lexical');
  const {$convertFromMarkdownString, $convertToMarkdownString} = await import('@lexical/markdown');
  const {NOTES_NODES, NOTES_THEME, notesTransformers} = await import('../src/stellis/static/notes-editor.js');
  const transformers = notesTransformers();
  const editor = createEditor({namespace: 'RoundTrip', nodes: NOTES_NODES, theme: NOTES_THEME, onError(error) {throw error;}});
  editor.update(() => $convertFromMarkdownString(markdown, transformers), {discrete: true});
  let output = '';
  editor.getEditorState().read(() => {output = $convertToMarkdownString(transformers);});
  return output;
}

test('the full fixture exports unchanged', async () => {
  assert.equal(await roundTrip(FIXTURE), FIXTURE);
});

for (const [name, markdown] of Object.entries({
  headings: '# One\n\n## Two\n\n### Three',
  'task lists': '- [ ] open\n- [x] done',
  quote: '> quoted words',
  'code fence': '```\nconst a = 1;\n\nconst b = 2;\n```',
  divider: 'Above\n\n---\n\nBelow',
  strikethrough: 'Some ~~struck~~ text',
  'inline code': 'Run `npm test` now',
  links: 'See [docs](https://example.com/docs) now.',
  images: '![](stellis-image:123e4567-e89b-12d3-a456-426614174000)',
  'pipe table': '| A | B |\n| --- | --- |\n| 1 | 2 |',
})) test(`${name} round-trip`, async () => assert.equal(await roundTrip(markdown), markdown));
