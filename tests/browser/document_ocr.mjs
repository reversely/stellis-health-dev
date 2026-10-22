/** Browser checks for real recognition, text correction and timed traces. */
import assert from 'node:assert/strict';
import {readFile, chmod} from 'node:fs/promises';

const {chromium} = await import(
    process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8781';
const browser = await chromium.launch({headless: true,
  executablePath: process.env.STELLIS_BROWSER});
const context = await browser.newContext();
const page = await context.newPage();
const exceptions = [];
page.on('pageerror', error => exceptions.push(error.message));
try {
  if (process.env.STELLIS_TEST_USERNAME) {
    const login = await page.request.post(origin + '/api/v1/auth/login', {
      data: {username: process.env.STELLIS_TEST_USERNAME,
        password: process.env.STELLIS_TEST_PASSWORD},
    });
    assert.equal(login.status(), 200);
  }
  if (process.env.STELLIS_TEST_STORAGE) {
    await context.storageState({path: process.env.STELLIS_TEST_STORAGE});
    await chmod(process.env.STELLIS_TEST_STORAGE, 0o600);
  }
  const bytes = await readFile('src/stellis/sample_records/2025-03-23-lab-results-photo.png');
  const uploaded = await page.request.post(origin + '/api/v1/documents', {
    multipart: {file: {name: 'browser-lab.png', mimeType: 'image/png', buffer: bytes}},
  });
  assert.equal(uploaded.status(), 200);
  const record = (await uploaded.json()).document;
  if (record.pages[0].text_source === 'manual') {
    const reset = await page.request.patch(origin + '/api/v1/documents/' + record.id + '/pages/1', {
      data: {text: '', revision: record.pages[0].revision},
    });
    assert.equal(reset.status(), 200);
  }
  for (const width of [390, 1280]) {
    await page.setViewportSize({width, height: 900});
    await page.goto(origin + '/document/' + record.id);
    await page.waitForSelector('.document-image');
    if (width === 390 && await page.getByRole('button', {name: 'Read text', exact: true}).count()) {
      await page.getByRole('button', {name: 'Read text', exact: true}).click();
      await page.getByText('Machine-read text', {exact: true}).waitFor();
      assert.match(await page.locator('.document-text').textContent(), /67\.8 mg\/dL/);
      assert.ok(await page.getByRole('button', {name: 'Find health facts', exact: true}).isVisible());
    }
    await page.getByRole('button', {name: 'Edit text', exact: true}).click();
    const input = page.getByLabel('Page text', {exact: true});
    const correction = 'Glucose 67.9 mg/dL\n<script>window.__ocrInjected=true</script>';
    await input.fill(correction);
    await page.getByRole('button', {name: 'Save text', exact: true}).click();
    await page.getByText('Edited text', {exact: true}).waitFor();
    await page.reload();
    await page.getByText('Edited text', {exact: true}).waitFor();
    assert.equal(await page.locator('.document-text').textContent(), correction);
    assert.equal(await page.evaluate(() => window.__ocrInjected), undefined);
    const saved = await page.request.get(origin + '/api/v1/documents/' + record.id);
    assert.equal((await saved.json()).pages[0].text_source, 'manual');
    const original = await page.request.get(origin + '/api/v1/documents/' + record.id + '/file');
    assert.deepEqual(await original.body(), bytes);
    await page.goto(origin + '/settings');
    await page.getByRole('heading', {name: 'Recent requests', exact: true}).waitFor();
    await page.waitForFunction(() => document.querySelector('#inference-traces')?.textContent.includes('Text recognition'));
    assert.ok(await page.locator('#inference-traces').getByText('Text recognition', {exact: true}).count());
    assert.match(await page.locator('#inference-traces .trace-duration').first().textContent(), /\d+\.\d+ s/);
    await page.locator('#inference-traces details').first().locator('summary').click();
    assert.ok(await page.locator('#inference-traces details').first().locator('.trace-events').isVisible());
    assert.ok(await page.locator('[data-operator-only]').evaluateAll(
        nodes => nodes.every(node => node.hidden)));
    console.log(`PASS ${width}px: correction persistence, original file, literal text and timed traces`);
  }
  assert.deepEqual(exceptions, []);
} finally {
  await context.close();
  await browser.close();
}
