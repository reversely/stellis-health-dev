/** Real browser/database/geometry flow; model supplied by report_context_server.py. */
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8797';
const {record} = JSON.parse(await readFile(process.env.STELLIS_REPORT_FIXTURE || '/tmp/stellis-report-fixture.json'));
const browser = await chromium.launch({headless: true, executablePath: process.env.STELLIS_BROWSER || '/usr/bin/google-chrome', args: ['--no-sandbox']});
const errors = [];
const context = await browser.newContext();
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
try {
  for (const width of [1280, 390]) {
    await page.setViewportSize({width, height: 1000});
    await page.goto(`${origin}/document/${record.id}`);
    const region = page.getByRole('button', {name: /Explain: Potassium/});
    await region.waitFor();
    await page.waitForFunction(() => document.querySelector('.report-stage img')?.naturalWidth > 0);
    await region.click();
    assert.match(await page.locator('.report-explanation blockquote').textContent(), /Potassium.*5.4/);
    await page.locator('.report-exchange').first().waitFor();
    assert.match(await page.locator('.report-exchange').first().textContent(), /reference interval/);
    const before = await page.locator('.report-exchange').count();
    await page.getByLabel('Ask about this part').fill('How has this changed?');
    await page.getByRole('button', {name: 'Explain', exact: true}).click();
    await page.getByRole('link', {name: /Source 2: earlier/}).last().waitFor();
    await page.waitForFunction(n => document.querySelectorAll('.report-exchange').length === n + 1, before);
    const historyCount = await page.locator('.report-exchange').count();
    await page.reload();
    await page.waitForFunction(n => document.querySelectorAll('.report-exchange').length === n, historyCount);
    assert.equal(await page.locator('.report-region.is-selected').count(), 1);
    await page.getByRole('button', {name: 'Zoom in', exact: true}).click();
    await page.getByRole('button', {name: 'Rotate', exact: true}).click();
    await region.click();
    assert.match(await page.locator('.report-explanation blockquote').textContent(), /Potassium/);
    await page.getByRole('link', {name: /Source 1: current/}).first().click();
    await page.waitForFunction(() => document.querySelector('.report-stage img')?.naturalWidth > 0);
    assert.equal(await page.locator('.report-region.is-selected').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
      const evidence = process.env.STELLIS_REPORT_EVIDENCE;
      if (evidence) { await mkdir(evidence, {recursive: true}); await page.screenshot({path: `${evidence}/report-${width}-${theme}.png`, fullPage: true}); }
    }
  }
  // Failure retains the selected source and the question; retry uses the real endpoint.
  const postPattern = '**/documents/*/explanations';
  await page.route(postPattern, async route => {
    if (route.request().method() === 'POST') await route.fulfill({status: 503,
      contentType: 'application/json', body: JSON.stringify({detail: 'Explanation unavailable. Try again.'})});
    else await route.continue();
  });
  await page.getByLabel('Ask about this part').fill('Explain the reference interval');
  await page.getByRole('button', {name: 'Explain', exact: true}).click();
  await page.getByText('Explanation unavailable. Try again.', {exact: true}).waitFor();
  assert.equal(await page.getByLabel('Ask about this part').inputValue(), 'Explain the reference interval');
  assert.equal(await page.locator('.report-region.is-selected').count(), 1);
  await page.unroute(postPattern);
  const beforeRetry = await page.locator('.report-exchange').count();
  await page.getByRole('button', {name: 'Explain', exact: true}).click();
  await page.waitForFunction(n => document.querySelectorAll('.report-exchange').length === n+1, beforeRetry);
  // Saved answers remain readable with inference unconfigured.
  await page.route('**/api/v1/capabilities', route => route.fulfill({contentType: 'application/json',
    body: JSON.stringify({ai: {configured: false}})}));
  await page.reload();
  await page.locator('.report-exchange').first().waitFor();
  assert.equal(await page.getByRole('button', {name: 'Explain', exact: true}).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log('PASS: original selection, cited explanation, historical comparison, reload, zoom, rotation, desktop and phone.');
} finally {await context.close(); await browser.close();}
