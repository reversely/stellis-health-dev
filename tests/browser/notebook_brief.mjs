/** Notebook Brief: timeline strip, course band, coming up and Levels from seeded records. */
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8883';
const {notebook, today} = JSON.parse(await readFile(process.env.STELLIS_BRIEF_FIXTURE));
const evidence = process.env.STELLIS_TEST_SCREENSHOTS;
const browser = await chromium.launch({headless: true, executablePath: process.env.STELLIS_BROWSER});
const page = await browser.newPage({reducedMotion: 'reduce', viewport: {width: 1280, height: 1000}});
const errors = []; page.on('pageerror', error => errors.push(error.message));
const shift = days => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
try {
  await page.goto(`${origin}/notebook/${notebook}`);
  const top = page.locator('#notebook-health');
  await top.locator('.brief-timeline').waitFor();
  const days = top.locator('.brief-day');
  assert.equal(await days.count(), 15);
  assert.equal(await days.nth(3).getAttribute('aria-current'), 'date');
  assert.equal(await days.nth(2).locator('.brief-dot.is-taken').count(), 1);
  assert.equal(await days.nth(4).locator('.brief-dot.is-expected').count(), 1);
  const band = top.locator('.brief-course');
  assert.equal(await band.locator('.brief-course-name strong').textContent(), 'Ferrous sulfate 300 mg');
  assert.match(await band.locator('.brief-course-name span').textContent(), /^Every other day, since /);
  assert.equal(await band.locator('.brief-course-count strong').textContent(), '32');
  assert.equal(await band.locator('.brief-course-count span').textContent(), '9 weeks');
  assert.match(await band.locator('.brief-course-labels').textContent(), /Started .*no end date yet/);
  const rows = top.locator('.brief-coming-row');
  assert.equal(await rows.count(), 3);
  assert.match(await rows.nth(0).textContent(), /fill 1 of 2 runs out.*45 tablets per fill, every other day from .*1 repeat allowed\.Recurrent iron deficiency treatment, page 1Calculated$/);
  assert.match(await rows.nth(1).textContent(), /Repeat CBC and ferritinNo date booked\.Appointment detailsPlanned$/);
  assert.equal(await rows.nth(1).locator('time').getAttribute('datetime'), shift(25));

  await page.getByRole('tab', {name: 'Brief'}).click();
  const levels = page.locator('#notebook-levels');
  await levels.locator('.brief-level-card').first().waitFor();
  assert.deepEqual(await levels.locator('.brief-level-name').allTextContents(), ['Ferritin', 'Hemoglobin']);
  const ferritin = levels.locator('.brief-level-card').first();
  assert.equal(await ferritin.getAttribute('aria-pressed'), 'true');
  assert.match(await ferritin.locator('.brief-level-value').textContent(), /^13ug\/LLow$/);
  assert.match(await levels.locator('.brief-level-card').nth(1).textContent(), /In range/);
  const ranges = levels.locator('.brief-range');
  assert.match(await ranges.first().textContent(), /^\d{4} to \d{4}$/);
  assert.equal(await ranges.first().getAttribute('aria-pressed'), 'true');
  const chartBox = levels.locator('.brief-chart');
  assert.equal(await chartBox.locator('.brief-chart-point').count(), 6);
  assert.equal(await chartBox.locator('.brief-chart-point.is-other').count(), 2);
  assert.match(await levels.locator('.brief-level-legend').textContent(), /Shaded: below 15.*Hollow: from the Pregnancy notebook\./);
  assert.equal(await chartBox.locator('.brief-chart-treatment-label').textContent(), 'Ferrous sulfate');
  const facts = levels.locator('.brief-level-facts');
  assert.match(await facts.textContent(), /Latest13 ug\/L.*Previous42 ug\/L.*Flagged low by the lab3 of 6 results.*Selected13 ug\/L.*Fatigue laboratory investigation, page 1/);
  await chartBox.focus();
  await page.keyboard.press('ArrowLeft');
  assert.match(await levels.locator('.brief-level-facts div').last().textContent(), /Selected42 ug\/L/);
  assert.match(await levels.locator('.brief-chart-tip-text').textContent(), /^42 ug\/L, /);
  await ranges.nth(1).click();
  assert.equal(await levels.locator('.brief-chart-point').count(), 4);
  await ranges.first().click();
  await levels.locator('.brief-level-card').nth(1).click();
  assert.match(await levels.locator('.brief-level-title h3').textContent(), /^Hemoglobin/);
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x &&
      a.y < b.y + b.height && a.y + a.height > b.y;
  for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
    await page.setViewportSize({width, height: 1000});
    await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
    await levels.locator('.brief-level-card').first().click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${theme} ${width} overflow`);
    const currentDay = top.locator('.brief-day[aria-current]');
    assert(!overlaps(await currentDay.locator('.brief-weekday').boundingBox(),
        await currentDay.locator('.brief-capsule').boundingBox()), 'today label clears its capsule');
    assert.equal(await page.locator('#notebook-brief-empty').isVisible(), false,
        'results do not show the empty Brief message');
    const courseName = await band.locator('.brief-course-name').boundingBox();
    const courseCount = await band.locator('.brief-course-count').boundingBox();
    const courseTrack = await band.locator('.brief-course-track').boundingBox();
    assert(!overlaps(courseName, courseCount) && !overlaps(courseCount, courseTrack),
        `${theme} ${width}: course contents do not collide`);
    for (const link of await top.locator('.brief-coming-source').all()) {
      assert(!overlaps(await link.locator('.icon').boundingBox(), await link.locator('span').boundingBox()),
          'source icon has its own space beside wrapping text');
    }
    // The persistent toolbar has an opaque surface when the timeline scrolls underneath.
    if (width > 1000) {
      await top.locator('.brief-today').scrollIntoViewIfNeeded();
      const toolbar = page.locator('#health-capture-toolbar');
      const addBox = await page.locator('#global-add').boundingBox();
      const barBox = await toolbar.boundingBox();
      assert(addBox.y >= barBox.y && addBox.y + addBox.height <= barBox.y + barBox.height);
      assert.notEqual(await toolbar.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    if (evidence) {
      await mkdir(evidence, {recursive: true});
      await page.screenshot({path: `${evidence}/notebook-brief-${width}-${theme}.png`, fullPage: true});
      await page.screenshot({path: `${evidence}/timeline-${width}-${theme}.png`});
    }
  }
  // Long record names exercise wrapping without changing clinical fixtures.
  await page.setViewportSize({width: 1280, height: 1000});
  const name = band.locator('.brief-course-name strong');
  const originalName = await name.textContent();
  await name.evaluate(el => el.textContent = 'Long medicine name with a detailed formulation and a prolonged release description 300 mg');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert(!overlaps(await name.boundingBox(), await band.locator('.brief-course-count').boundingBox()));
  await name.evaluate((el, text) => el.textContent = text, originalName);
  assert.deepEqual(errors, []);
  console.log('PASS notebook Brief: strip, course band, coming up, levels cards, chart, range, keyboard, themes and widths');
} finally { await browser.close(); }
