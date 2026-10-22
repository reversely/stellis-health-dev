/** Browser regression checks for camera capture deadlines and cleanup. */
import assert from 'node:assert/strict';

const {chromium} = await import(
    process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.STELLIS_BROWSER,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8779';

try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({
      viewport: {width, height: 900}, permissions: ['camera'],
    });
    const page = await context.newPage();
    const exceptions = [];
    page.on('pageerror', error => exceptions.push(error.message));
    await page.addInitScript(() => {
      const timeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => {
        if (delay === 90000) delay = 600;
        if (delay === 20000) delay = 300;
        return timeout(callback, delay, ...args);
      };
      window.captureStreams = [];
      const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
          navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (...args) => {
        const stream = await getUserMedia(...args);
        window.captureStreams.push(stream);
        return stream;
      };
      const now = performance.now.bind(performance);
      window.captureClockOffset = 0;
      performance.now = () => now() + window.captureClockOffset;
      window.captureScenario = 'stall';
      window.captureEvents = 0;
      window.captureStops = 0;
    });
    await page.route('**/vendor/vitallens/vitallens.browser.js', route =>
      route.fulfill({contentType: 'text/javascript', body: `
        export class VitalLens {
          listeners = {};
          addEventListener(name, callback) { this.listeners[name] = callback; }
          async setVideoStream(stream, video) {
            video.srcObject = stream;
            await video.play();
          }
          startVideoStream() {
            if (window.captureScenario === 'silent') return;
            this.timer = setTimeout(() => {
              const count = window.captureScenario === 'success' ? 200 : 1;
              for (let index = 0; index < count; index++) {
                if (count > 1) window.captureClockOffset += 250;
                window.captureEvents++;
                this.listeners.vitals({face: {coordinates: [[100, 40, 500, 440]]},
                  waveforms: {ppg_waveform: {data: [0, 1, 0]}},
                  vitals: {heart_rate: {value: 70}}});
              }
            }, 20);
          }
          stopVideoStream() { clearTimeout(this.timer); window.captureStops++; }
          async close() {}
        }
      `}));
    await page.goto(origin + '/trends');
    await page.getByRole('button', {name: 'Log vital signs', exact: true}).click();
    await page.getByRole('button', {name: 'Start', exact: true}).click();
    await page.getByRole('button', {name: 'Try again', exact: true}).waitFor();
    assert.equal(await page.evaluate(() => window.captureEvents), 1);
    assert.match(await page.locator('.pulse-message').textContent(), /pulse|signal/i);
    assert.equal(await page.evaluate(() => window.captureStops), 1);
    assert.ok(await page.evaluate(() => window.captureStreams.every(
        stream => stream.getTracks().every(track => track.readyState === 'ended'))));

    // A retry with no first event must still use the startup watchdog.
    await page.evaluate(() => { window.captureScenario = 'silent'; });
    await page.getByRole('button', {name: 'Try again', exact: true}).click();
    await page.getByRole('button', {name: 'Try again', exact: true}).waitFor();
    assert.match(await page.locator('.pulse-details').textContent(), /no result/);
    assert.equal(await page.evaluate(() => window.captureStops), 2);

    // Closing an active retry cancels both timers and stops the camera.
    await page.evaluate(() => { window.captureScenario = 'stall'; });
    await page.getByRole('button', {name: 'Try again', exact: true}).click();
    await page.waitForFunction(() => window.captureEvents === 2);
    await page.getByRole('button', {name: 'Close', exact: true}).click();
    await page.waitForTimeout(750);
    assert.equal(await page.locator('.pulse-dialog').count(), 0);
    assert.equal(await page.evaluate(() => window.captureStops), 3);
    assert.ok(await page.evaluate(() => window.captureStreams.every(
        stream => stream.getTracks().every(track => track.readyState === 'ended'))));
    // A successful capture must clear its deadline without replacing its result.
    await page.evaluate(() => { window.captureScenario = 'success'; });
    await page.getByRole('button', {name: 'Log vital signs', exact: true}).click();
    await page.getByRole('button', {name: 'Start', exact: true}).click();
    await page.getByRole('button', {name: 'Save', exact: true}).waitFor();
    await page.waitForTimeout(750);
    assert.equal(await page.locator('.pulse-value').textContent(), '70');
    assert.equal(await page.evaluate(() => window.captureStops), 4);
    assert.equal(await page.getByRole('button', {name: 'Save', exact: true}).count(), 1);
    await page.evaluate(() => { window.captureScenario = 'silent'; });
    await page.getByRole('button', {name: 'Measure again', exact: true}).click();
    await page.getByRole('button', {name: 'Try again', exact: true}).waitFor();
    assert.match(await page.locator('.pulse-details').textContent(), /no result/);
    assert.equal(await page.evaluate(() => window.captureStops), 5);
    await page.getByRole('button', {name: 'Close', exact: true}).click();
    await page.getByRole('dialog').waitFor({state: 'detached'});
    // Controlled derived readings check the complete save and refresh path.
    await page.evaluate(() => {
      window.captureScenario = 'success';
      window.StellisVitalsMath.heartRateVariability = () => ({rmssd: 42, sure: true});
      window.StellisVitalsMath.breathingRate = () => ({rate: 14, sure: true});
    });
    await page.getByRole('button', {name: 'Log vital signs', exact: true}).click();
    await page.getByRole('button', {name: 'Start', exact: true}).click();
    await page.getByRole('button', {name: 'Save', exact: true}).waitFor();
    const responses = ['pulse', 'breathing_rate', 'hrv'].map(measure =>
      page.waitForResponse(response =>
        response.url().endsWith('/api/v1/readings') &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON().measure === measure));
    await page.getByRole('button', {name: 'Save', exact: true}).click();
    const saved = await Promise.all((await Promise.all(responses)).map(
        response => response.json()));
    try {
      await page.getByRole('dialog').waitFor({state: 'detached'});
      for (const value of ['70', '14', '42']) {
        await page.locator('.trend-vitals .trend-value', {hasText: value}).waitFor();
      }
      await page.goto(origin + '/');
      for (const value of ['70', '14', '42']) {
        await page.locator('.overview-vitals .overview-value', {hasText: value}).waitFor();
      }
    } finally {
      for (const point of saved) {
        await context.request.delete(origin + '/api/v1/readings/' + point.id);
      }
    }
    assert.deepEqual(exceptions, []);
    console.log(`PASS ${width}px: capture cleanup, grouped save, Trends refresh and Home reload`);
    await context.close();
  }
} finally {
  await browser.close();
}
