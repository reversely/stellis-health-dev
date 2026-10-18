// Link cards round-trip through the notes Markdown dialect (#281).
const test = require('node:test');
const assert = require('node:assert/strict');

async function load(markdown) {
  const lexical = await import('lexical');
  const {$convertFromMarkdownString, $convertToMarkdownString} = await import('@lexical/markdown');
  const {NOTES_NODES, NOTES_THEME, notesTransformers} = await import('../src/stellis/static/notes-editor.js');
  const embeds = await import('../src/stellis/static/notes-embeds.js');
  const transformers = notesTransformers();
  const editor = lexical.createEditor({namespace:'Embeds', nodes:NOTES_NODES, theme:NOTES_THEME, onError(error) {throw error;}});
  editor.update(() => $convertFromMarkdownString(markdown, transformers), {discrete:true});
  const read = fn => {let value; editor.getEditorState().read(() => {value = fn();}); return value;};
  const types = () => read(() => lexical.$getRoot().getChildren().map(node => node.getType()));
  return {editor, embeds, read, types, markdown: () => read(() => $convertToMarkdownString(transformers))};
}
const same = async markdown => assert.equal((await load(markdown)).markdown(), markdown);

test('a link card with and without a caption', async () => {
  await same('<bookmark url="https://example.com/a?x=1&y=2">Example page</bookmark>');
  await same('<bookmark url="https://example.com/"></bookmark>');
  assert.deepEqual((await load('<bookmark url="https://example.com/a">x</bookmark>')).types(), ['bookmark']);
});
test('link card captions are escaped on export and read back', async () => {
  const {editor, embeds, markdown} = await load('before');
  const {$getRoot} = await import('lexical');
  editor.update(() => $getRoot().append(new embeds.BookmarkNode('https://example.com/a', 'A <b> & "c"')), {discrete:true});
  assert.equal(markdown(), 'before\n\n<bookmark url="https://example.com/a">A &lt;b&gt; &amp; "c"</bookmark>');
  await same('<bookmark url="https://example.com/a">A &lt;b&gt; &amp; "c"</bookmark>');
});
test('a link card needs an http or https address', async () => {
  for (const line of ['<bookmark url="javascript:alert(1)">x</bookmark>', '<bookmark url="ftp://example.com/">x</bookmark>',
    '<bookmark url="">x</bookmark>']) {
    const {types, markdown} = await load(line);
    assert.deepEqual(types(), ['paragraph'], line);
    assert.ok(markdown().includes('bookmark'), line);
  }
});
test('an address with quotes or angle brackets is exported percent-encoded', async () => {
  const {editor, embeds, markdown} = await load('x');
  const {$getRoot} = await import('lexical');
  editor.update(() => $getRoot().append(new embeds.BookmarkNode('https://example.com/a"b?c=<d>', '')), {discrete:true});
  assert.match(markdown(), /<bookmark url="https:\/\/example\.com\/a%22b\?c=%3Cd%3E"><\/bookmark>$/);
});
test('a link card inside a callout keeps its place', () => same('> [!note] Read\n> <bookmark url="https://example.com/a">A</bookmark>'));
test('blocks sit between other content and survive JSON for copy and paste', async () => {
  const markdown = 'Intro\n\n<bookmark url="https://example.com/a">A</bookmark>\n\nOutro';
  const {editor, markdown: out} = await load(markdown);
  assert.equal(out(), markdown);
  editor.setEditorState(editor.parseEditorState(JSON.stringify(editor.getEditorState().toJSON())));
  assert.equal(out(), markdown);
});
test('a link card inside a callout keeps its place', () => same('> [!note] Read\n> <bookmark url="https://example.com/a">A</bookmark>'));
