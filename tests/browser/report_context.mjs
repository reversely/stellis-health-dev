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
    // Each saved explanation opens its own request trace.
    const traceLink = page.locator('.report-exchange').last().getByRole('button', {name: 'How Stellis answered', exact: true});
    await traceLink.click();
    const trace = page.getByRole('dialog', {name: 'How Stellis answered', exact: true});
    await trace.locator('.trace-step').first().waitFor();
    assert.deepEqual(await trace.locator('.trace-step-text strong').allTextContents(),
        ['Line selected', 'Related pages selected', 'Citations checked', 'Sources checked', 'Saved to this line']);
    assert.match(await trace.locator('.trace-sublist').first().textContent(), /earlier.*4\.8.*Rank 1/s);
    assert.equal(await trace.locator('.trace-tile').count(), 4);
    assert.match(await trace.locator('.trace-tile').nth(3).textContent(), /2 of 2/);
    assert.deepEqual([...new Set(await trace.locator('.status-block').allTextContents())].filter(s => !/of/.test(s)), ['Unchanged']);
    assert.equal(await trace.getByRole('link', {name: 'All requests in Settings'}).getAttribute('href'), '/settings#inference-traces');
    assert.equal(await trace.evaluate(node => node.scrollWidth > node.clientWidth), false);
    if (process.env.STELLIS_REPORT_EVIDENCE) {
      await mkdir(process.env.STELLIS_REPORT_EVIDENCE, {recursive: true});
      await trace.evaluate(node => node.getAnimations().forEach(animation => animation.finish()));
      await page.screenshot({path: `${process.env.STELLIS_REPORT_EVIDENCE}/trace-${width}.png`});
    }
    await page.keyboard.press('Escape');
    await trace.waitFor({state: 'detached'});
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'How Stellis answered');
    await page.getByRole('button', {name: 'Zoom in', exact: true}).click();
    await page.getByRole('button', {name: 'Rotate', exact: true}).click();
    await region.click();
    assert.match(await page.locator('.report-explanation blockquote').textContent(), /Potassium/);
    await page.getByRole('link', {name: /Source 1: current/}).first().click();
    await page.waitForFunction(() => document.querySelector('.report-stage img')?.naturalWidth > 0);
    assert.equal(await page.locator('.report-region.is-selected').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (let i = 0; i < 3; i++) await page.getByRole('button', {name: 'Rotate', exact: true}).click();
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
