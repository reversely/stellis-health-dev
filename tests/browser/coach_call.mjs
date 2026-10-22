/** Checks general calls through the real authenticated account gateway. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

const {chromium} = await import(
    process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8779';
const browser = await chromium.launch({
  headless: true, executablePath: process.env.STELLIS_BROWSER,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const password = 'correct horse battery staple';
const audit = process.env.STELLIS_LAYOUT_AUDIT_MODULE ?
    await import(process.env.STELLIS_LAYOUT_AUDIT_MODULE) : null;
const widths = audit ? [360, 390, 768, 1024, 1280, 1920] : [390, 1280];
let context;
try {
  context = await browser.newContext({
    viewport: {width: 1280, height: 900}, permissions: ['microphone'],
    reducedMotion: 'reduce',
  });
  const registered = await context.request.post(origin + '/api/v1/auth/register', {
    data: {username: 'callcheck' + Date.now(), password},
  });
  assert.equal(registered.status(), 200);
  const chosen = await context.request.put(origin + '/api/v1/onboarding', {
    data: {uses: [], step: 'review', agent_choices: {}},
  });
  assert.equal(chosen.status(), 200);
  const completed = await context.request.post(origin + '/api/v1/onboarding/complete');
  assert.equal(completed.status(), 200);

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.callSockets = [];
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = class extends OriginalWebSocket {
      constructor(...args) {
        super(...args);
        window.callSockets.push(this);
      }
    };
  });
  await page.goto(origin);
  for (const {width, theme} of widths.flatMap(width =>
    ['light', 'dark'].map(theme => ({width, theme})))) {
    await page.evaluate(theme => localStorage.setItem('stellis-theme', theme), theme);
    await page.setViewportSize({width, height: 900});
    await page.goto(origin);
    await page.getByRole('button', {name: 'Call Stellis', exact: true}).click();
    const panel = page.locator('.coach-call');
    await panel.getByText(/What can I help you with/).waitFor();
    assert.equal(await panel.getByText("Sorry we couldn't reach the agent").count(), 0);
    const address = new URL(await page.evaluate(() => window.callSockets.at(-1).url));
    assert.equal(address.pathname, '/api/v1/coach/call');
    for (const key of ['kind', 'today', 'now', 'utc_offset']) {
      assert(address.searchParams.has(key));
    }
    await panel.getByRole('button', {name: 'Minimise call', exact: true}).click();
    await page.evaluate(() => window.callSockets.at(-1).close());
    await panel.getByText("Sorry we couldn't reach the agent").waitFor();
    assert.equal(await panel.locator('.coach-call-ended').isVisible(), true);
    assert.equal(await panel.getByRole('button', {name: 'Call again', exact: true}).isVisible(), true);
    if (audit) {
      const report = await page.evaluate(audit.PAGE_AUDIT, {
        centerSelectors: [], ignoreSelectors: ['header', 'main', '#rail-shader'],
        isNarrow: width < 768,
      });
      await writeFile(`/tmp/stellis-call-panel-${theme}-${width}.json`, JSON.stringify(report));
      await page.screenshot({path: `/tmp/stellis-call-panel-${theme}-${width}.png`});
      assert.deepEqual(report.findings.filter(finding => finding.level === 'fail'), []);
    }
    await panel.getByRole('button', {name: 'Call again', exact: true}).click();
    await panel.getByText(/What can I help you with/).waitFor();
    await panel.getByRole('button', {name: 'End call', exact: true}).click();
    await panel.getByRole('button', {name: 'Close', exact: true}).click();
    assert.equal(await panel.count(), 0);
    console.log(`PASS ${width}px ${theme}: general call greeting, query parameters, connection loss and retry`);
  }
  assert.deepEqual(errors, []);
} finally {
  if (context) {
    await context.request.delete(origin + '/api/v1/account', {
      data: {password, confirm: 'DELETE'},
    });
  }
  await browser.close();
}
