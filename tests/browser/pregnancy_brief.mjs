/** Pregnancy notebook: pending-only timeline, weeks and due date, and a booked birth that ends the timeline. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8860';
const evidence = process.env.STELLIS_TEST_SCREENSHOTS;
const browser = await chromium.launch({headless: true, executablePath: process.env.STELLIS_BROWSER});
const page = await browser.newPage({reducedMotion: 'reduce', viewport: {width: 1280, height: 1000}});
const errors = []; page.on('pageerror', error => errors.push(error.message));
const api = async (path, data, method = 'post') => {
  const response = await page.request[method](origin + '/api/v1' + path, data === undefined ? {} : {data});
  assert(response.ok(), path + ' ' + await response.text()); return response.json();
};
const pad = n => String(n).padStart(2, '0');
const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const created = [];
try {
  const book = await api('/notebooks', {name: 'Pregnancy ' + Date.now()});
  // 38 weeks and 5 days today: the gestational start was 271 days ago; a day-5 transfer 19 days after it.
  const record = await api('/trackers/pregnancy', {dating_basis: 'transfer', basis_date: day(-252), embryo_day: 5, notebook_id: book.id});
  created.push(record.id);
  await api('/care-events', {title: 'Review if the baby has not arrived', starts_at: `${day(6)}T09:00:00Z`, status: 'scheduled', notebook_id: book.id});
  await page.goto(`${origin}/notebook/${book.id}`);
  const top = page.locator('#notebook-health');
  await top.locator('.brief-gestation').waitFor();
  assert.equal(await top.locator('.brief-gestation').textContent(), '38 weeks, 5 days');
  const days = top.locator('.brief-day');
  assert.equal(await days.nth(9).locator('.brief-dot.is-event.is-scheduled').count(), 1);
  assert.equal(await days.nth(12).locator('.brief-dot.is-event.is-due').count(), 1);
  const band = top.locator('.brief-pregnancy');
  assert.match(await band.textContent(), /^38 weeks, 5 daysThird trimester.*Due date.*Start: .*Due: /);
  const rows = top.locator('.brief-coming-row');
  assert.deepEqual(await rows.locator('strong').allTextContents(), ['Review if the baby has not arrived', 'Due date']);
  assert.match(await rows.nth(1).textContent(), /Dated from the day-5 embryo transfer on .*Due$/);
  assert.equal(await rows.nth(1).locator('.status-block').getAttribute('class'), 'status-block is-alert');
  if (evidence) { await mkdir(evidence, {recursive: true}); await top.screenshot({path: `${evidence}/pregnancy-1280-light.png`}); }
  // A booked birth ends the timeline there; the due date stays.
  const booked = top.getByLabel('Booked date', {exact: true});
  await booked.fill(day(4));
  await booked.dispatchEvent('change');
  await top.locator('.brief-coming-row strong', {hasText: 'Booked birth'}).waitFor();
  assert.deepEqual(await top.locator('.brief-coming-row strong').allTextContents(), ['Booked birth', 'Due date']);
  assert.match(await top.locator('.brief-pregnancy .brief-course-labels').textContent(), /Booked: /);
  await top.getByLabel('Booked date', {exact: true}).fill('');
  await top.getByLabel('Booked date', {exact: true}).dispatchEvent('change');
  await top.locator('.brief-coming-row strong', {hasText: 'Review if the baby'}).waitFor();
  for (const width of [390]) {
    await page.setViewportSize({width, height: 1000});
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (evidence) await top.screenshot({path: `${evidence}/pregnancy-390-dark.png`});
  }
  // Tracking on My Health shows the same dating.
  await page.setViewportSize({width: 1280, height: 1000});
  await page.goto(origin);
  const tracking = page.locator('.dashboard-reproductive');
  await tracking.getByRole('tab', {name: 'Pregnancy'}).click();
  await tracking.locator(`.tracker-course[data-record="${record.id}"]`).getByText('38 weeks, 5 days').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS pregnancy: pending timeline, event dots, weeks and trimester, due date source, booked birth ends the timeline');
} finally {
  for (const id of created) await page.request.delete(origin + '/api/v1/trackers/records/' + id);
  await browser.close();
}
