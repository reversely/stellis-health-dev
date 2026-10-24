/** Notebook chat answers open their own request trace. Model supplied by report_context_server.py. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8797';
const evidence = process.env.STELLIS_TEST_SCREENSHOTS;
const browser = await chromium.launch({headless: true, executablePath: process.env.STELLIS_BROWSER});
const page = await browser.newPage({reducedMotion: 'reduce'});
const errors = []; page.on('pageerror', error => errors.push(error.message));
const api = async (path, data) => {
  const response = await page.request.post(origin + '/api/v1' + path, {data});
  assert(response.ok(), path + ' ' + await response.text()); return response.json();
};
try {
  const book = await api('/notebooks', {name: 'Trace audit ' + Date.now()});
  await api('/pages', {title: 'Potassium note', notebook_id: book.id, markdown: 'Potassium was 5.4 mmol/L on April 2.'});
  for (const [theme, width] of [['light', 1280], ['dark', 390]]) {
    await page.setViewportSize({width, height: 900});
    await page.goto(`${origin}/notebook/${book.id}`);
    await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
    const input = page.locator('.nb-input textarea');
    await input.waitFor();
    const source = page.getByLabel('Use Potassium note', {exact: true});
    await source.waitFor({state: 'attached'});
    if (!await source.isChecked()) await source.check({force: true});
    await input.fill('What was the potassium result?');
    await page.locator('.nb-input button[type=submit]').click();
    const link = page.locator('.nb-msg').last().getByRole('button', {name: 'How Stellis answered', exact: true});
    await link.waitFor();
    await link.click();
    const trace = page.getByRole('dialog', {name: 'How Stellis answered', exact: true});
    await trace.locator('.trace-step').first().waitFor();
    assert.deepEqual(await trace.locator('.trace-step-text strong').allTextContents(), ['Sources selected', 'Citations checked', 'Saved']);
    assert.match(await trace.locator('.trace-subtitle').textContent(), /chat answer/);
    assert.match(await trace.locator('.trace-sublist').textContent(), /Potassium note.*Rank 1/s);
    assert.match(await trace.locator('.trace-tile').last().textContent(), /1 of 1/);
    const box = await trace.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width + .5);
    if (evidence) {
      await mkdir(evidence, {recursive: true});
      await trace.evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
      await page.screenshot({path: `${evidence}/notebook-trace-${width}-${theme}.png`});
    }
    await page.keyboard.press('Escape');
    await trace.waitFor({state: 'detached'});
  }
  assert.deepEqual(errors, []);
  console.log('PASS notebook answer trace: link, steps, cited sources, citation count, light desktop and dark phone');
} finally { await browser.close(); }
