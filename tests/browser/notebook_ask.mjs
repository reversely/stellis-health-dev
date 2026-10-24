/** Notebook Ask: unread notebook notice and include, citation check, viewer header, and the Records drop zone. */
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8797';
const evidence = process.env.STELLIS_TEST_SCREENSHOTS;
const browser = await chromium.launch({headless: true, executablePath: process.env.STELLIS_BROWSER});
const page = await browser.newPage({reducedMotion: 'reduce', viewport: {width: 1440, height: 1000}});
const errors = []; page.on('pageerror', error => errors.push(error.message));
const api = async (path, data) => {
  const response = await page.request.post(origin + '/api/v1' + path, {data});
  assert(response.ok(), path + ' ' + await response.text()); return response.json();
};
try {
  const stamp = Date.now();
  const blood = await api('/notebooks', {name: 'Blood ' + stamp});
  const pregnancy = await api('/notebooks', {name: 'Pregnancy ' + stamp});
  await api('/pages', {title: 'Potassium note', notebook_id: blood.id, markdown: 'Potassium was 5.4 mmol/L on April 2.'});
  await api('/pages', {title: 'Pregnancy bloods', notebook_id: pregnancy.id, markdown: 'Potassium was 4.1 mmol/L at 12 weeks.'});
  await page.goto(`${origin}/notebook/${blood.id}`);
  const chat = page.locator('#notebook-chat');
  const source = chat.getByLabel('Use Potassium note', {exact: true});
  await source.waitFor({state: 'attached'});
  if (!await source.isChecked()) await source.check({force: true});
  await chat.locator('.nb-input textarea').fill('What was the potassium result?');
  await chat.locator('.nb-input button[type=submit]').click();
  const answer = chat.locator('.nb-msg').last();
  await answer.locator('.nb-unread').waitFor();
  assert.equal(await answer.locator('.nb-unread').textContent(),
      `Related records are in the Pregnancy ${stamp} notebook, which this answer did not read.`);
  assert.equal(await answer.locator('.nb-check').textContent(), '1 of 1 citations found on their page');
  assert.deepEqual(await answer.locator('.nb-follow-chip').allTextContents(), [`Include Pregnancy ${stamp} and ask again`]);
  const addFrom = chat.locator('.nb-add-from-button');
  assert.equal(await addFrom.textContent(), `Add from Pregnancy ${stamp}`);

  // The viewer names the citation and its source.
  await answer.locator('a.nb-cite').first().click();
  const viewer = chat.locator('.nb-viewer');
  await viewer.locator('.nb-viewer-title', {hasText: 'Potassium note'}).waitFor();
  assert.equal(await viewer.locator('.nb-viewer-badge').textContent(), '1');
  assert.match(await viewer.locator('.nb-viewer-meta').textContent(), /^Note, /);
  assert.equal(await viewer.locator('.nb-viewer-open').textContent(), 'Open the whole record');
  if (evidence) { await mkdir(evidence, {recursive: true}); await page.screenshot({path: `${evidence}/notebook-ask-1440-light.png`}); }
  await viewer.getByRole('button', {name: 'Close source'}).click();

  // Including the other notebook reads it for one question; that answer names nothing unread.
  await answer.locator('.nb-follow-chip').click();
  await page.waitForFunction(() => document.querySelectorAll('#notebook-chat .nb-msg:not(.nb-msg-user)').length === 2);
  assert.equal(await chat.locator('.nb-msg').last().locator('.nb-unread').count(), 0);
  assert.equal(await chat.locator('.nb-add-from-button').count(), 0);
  // A plain question names the other notebook again; Add from links its matching source here.
  await chat.locator('.nb-input textarea').fill('What was the potassium result?');
  await chat.locator('.nb-input button[type=submit]').click();
  await page.waitForFunction(() => document.querySelectorAll('#notebook-chat .nb-msg:not(.nb-msg-user)').length === 3);
  await chat.locator('.nb-add-from-button').click();
  await chat.getByLabel('Use Pregnancy bloods', {exact: true}).waitFor({state: 'attached'});
  await chat.locator('.nb-status', {hasText: `Added 1 source from Pregnancy ${stamp}`}).waitFor();
  assert.equal(await chat.locator('.nb-add-from-button').count(), 0);

  // Records: the drop zone files a report into this notebook.
  await page.getByRole('tab', {name: 'Records'}).click();
  const zone = page.locator('.record-drop');
  await zone.waitFor();
  assert.equal(await zone.locator('h3').textContent(), 'Drop a report here');
  const chooser = page.waitForEvent('filechooser');
  await zone.getByRole('button', {name: 'Upload a report'}).click();
  const pdf = await readFile('src/stellis/sample_records/2026-04-02-lab-results.pdf');
  await (await chooser).setFiles({name: 'drop-test.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([pdf, Buffer.from('\n% ' + stamp)])});
  await zone.locator('.record-drop-results li', {hasText: 'drop-test.pdf: added'}).waitFor();
  assert.match(await zone.locator('.record-drop-review').getAttribute('href'), /^\/document\//);
  await page.locator('#notebook-items-table').getByText('drop-test', {exact: false}).first().waitFor();
  for (const [theme, width] of [['dark', 390]]) {
    await page.setViewportSize({width, height: 1000});
    await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (evidence) await zone.screenshot({path: `${evidence}/drop-${width}-${theme}.png`});
  }
  assert.deepEqual(errors, []);
  console.log('PASS notebook Ask: unread notice, citation check, include and ask again, Add from, viewer header, Records drop zone');
} finally { await browser.close(); }
