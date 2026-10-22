/** Checks honest speech setup states and recovery actions. */
import assert from 'node:assert/strict';

const {chromium} = await import(
    process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({
  headless: true, executablePath: process.env.STELLIS_BROWSER,
});
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8779';

try {
  for (const width of [390, 1280]) {
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: {width, height: 900}, reducedMotion: 'reduce',
      });
      await context.addInitScript(theme => localStorage.setItem('stellis-theme', theme), theme);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      let state = {state: 'idle', progress: 0};
      let posts = 0;
      let unavailable = false;
      await page.route('**/api/v1/setup', route => {
        if (unavailable) return route.abort();
        if (route.request().method() === 'POST') {
          posts++;
          state = {state: 'downloading', stage: 'receiving', progress: 0.2 / 3,
                   downloaded_bytes: 100e6, total_bytes: 500e6};
        }
        return route.fulfill({json: state});
      });
      await page.goto(origin);
      const card = page.locator('#setup-card');
      const status = page.locator('#setup-status');
      const progress = page.getByRole('progressbar', {name: 'Speech model download'});
      await page.getByRole('button', {name: 'Start setup', exact: true}).waitFor();
      assert.equal(await progress.isVisible(), false);
      assert(!(await status.textContent()).includes('0%'));
      await page.getByRole('button', {name: 'Start setup', exact: true}).click();
      assert.equal(posts, 1);
      assert.equal(await progress.getAttribute('value'), '0.2');
      assert.match(await status.textContent(), /100 MB of 500 MB/);
      state = {...state, progress: 0.4 / 3, downloaded_bytes: 200e6};
      await page.evaluate(() => watchSetup());
      assert.equal(await progress.getAttribute('value'), '0.4');
      assert.match(await status.textContent(), /200 MB/);

      state = {state: 'downloading', stage: 'receiving', progress: null,
               downloaded_bytes: 12e6, total_bytes: null};
      await page.evaluate(() => watchSetup());
      assert.equal(await progress.getAttribute('value'), null);
      assert.match(await status.textContent(), /Downloaded 12 MB/);
      state = {state: 'downloading', stage: 'verifying', progress: 0.4};
      await page.evaluate(() => watchSetup());
      assert.match(await status.textContent(), /Checking/);
      assert.equal(await progress.getAttribute('value'), null);

      state = {state: 'failed', error: '<script>untrusted error</script>'};
      await page.evaluate(() => watchSetup());
      await page.getByRole('button', {name: 'Try again', exact: true}).waitFor();
      assert.equal(await progress.isVisible(), false);
      assert(!(await card.innerText()).includes('<script>'));
      await page.getByRole('button', {name: 'Try again', exact: true}).click();
      assert.equal(posts, 2);

      unavailable = true;
      await page.evaluate(() => watchSetup());
      await page.getByRole('button', {name: 'Check again', exact: true}).waitFor();
      unavailable = false;
      await page.getByRole('button', {name: 'Check again', exact: true}).click();
      assert.equal(posts, 2);
      state = {state: 'ready', progress: 1};
      await page.evaluate(() => watchSetup());
      assert.equal(await card.isVisible(), false);
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px ${theme}: idle, progress, unknown size, verification, retry and completion`);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
