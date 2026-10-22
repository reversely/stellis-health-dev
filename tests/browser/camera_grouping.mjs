/** Checks camera reading groups before and after saved readings exist. */
import assert from 'node:assert/strict';

const {chromium} = await import(
    process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8779';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.STELLIS_BROWSER,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const saved = [];

try {
  const context = await browser.newContext({reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const stage of ['empty', 'pulse', 'complete']) {
    if (stage !== 'empty') {
      const values = stage === 'pulse' ? [['pulse', 68]] :
          [['breathing_rate', 14], ['hrv', 42]];
      for (const [measure, value] of values) {
        const response = await context.request.post(origin + '/api/v1/readings', {
          data: {measure, value, source: 'camera', quality: 0.8},
        });
        assert.equal(response.status(), 200);
        saved.push((await response.json()).id);
      }
    }
    for (const width of [390, 1280]) {
      await page.setViewportSize({width, height: 900});
      for (const theme of ['light', 'dark']) {
        await page.goto(origin);
        await page.evaluate(theme => localStorage.setItem('stellis-theme', theme), theme);
        for (const route of ['/', '/trends']) {
          await page.goto(origin + route);
          const group = page.locator(route === '/' ? '.overview-vitals' : '.trend-vitals');
          await group.getByRole('heading', {name: 'Vital signs', exact: true}).waitFor();
          for (const label of ['Breathing rate', 'Heart rate variability']) {
            await group.getByText(label, {exact: true}).waitFor();
          }
          const log = group.getByRole('button', {name: 'Log vital signs', exact: true});
          assert.equal(await log.count(), 1);
          assert.equal(await page.getByRole('button', {name: /Measure with camera|Measure pulse/}).count(), 0);
          if (stage === 'complete') {
            const values = await group.innerText();
            for (const value of ['68', '14', '42']) assert(values.includes(value));
          }
          await log.click();
          await page.getByRole('dialog', {name: 'Log vital signs', exact: true}).waitFor();
          assert.equal(await page.getByRole('dialog').count(), 1);
          await page.getByRole('button', {name: 'Start', exact: true}).waitFor();
          await page.getByRole('button', {name: 'Close', exact: true}).click();
          await page.getByRole('dialog').waitFor({state: 'detached'});
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
      }
    }
    console.log(`PASS ${stage}: Home and Trends group one capture at phone and desktop widths in both themes`);
  }
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  for (const id of saved) {
    await fetch(origin + '/api/v1/readings/' + id, {method: 'DELETE'});
  }
  await browser.close();
}
