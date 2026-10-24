/** Morning check-in: agenda from records, snooze, checklist progress and a dated entry confirmed before logging. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8881';
const evidence = process.env.STELLIS_TEST_SCREENSHOTS;
const browser = await chromium.launch({headless: true, executablePath: process.env.STELLIS_BROWSER});
const context = await browser.newContext({reducedMotion: 'reduce'});
const page = await context.newPage();
const errors = []; page.on('pageerror', error => errors.push(error.message));
const pad = n => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const today = local(now);
const yesterday = local(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
const at = (hour, minute) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
const api = async (path, data, method = 'post') => {
  const response = await context.request[method](origin + '/api/v1' + path, data === undefined ? {} : {data});
  assert(response.ok(), path + ' ' + await response.text()); return response.json();
};
try {
  const walk = await api('/goals', {activity: 'walk', amount: 20, times_per_week: 3});
  const start = local(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 71));
  await api('/trackers/medicine', {name: 'Ferrous sulfate', dose_amount: 300, dose_unit: 'mg', schedule_type: 'every',
    every_days: 2, start, units_per_fill: 45});
  const planned = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 20, 9).toISOString();
  await api('/care-events', {title: 'Repeat CBC and ferritin', starts_at: planned, status: 'planned'});

  await page.clock.setFixedTime(at(7, 40));
  await page.goto(origin);
  const card = page.locator('.coach-incoming');
  await card.waitFor();
  assert.match(await card.locator('.coach-incoming-kind').textContent(), /^Morning check-in, 7:40/);
  const rows = card.locator('.coach-incoming-agenda li');
  assert.equal(await rows.count(), 3);
  assert.match(await rows.nth(0).textContent(), /Ferrous sulfate fill 1 of 1 runs out around .*Medicine$/);
  assert.match(await rows.nth(1).textContent(), /Repeat CBC and ferritin, no date booked.*Visit plan$/);
  assert.match(await rows.nth(2).textContent(), /Walk 20 minutes, 0 of 3 this week.*Goal$/);
  if (evidence) { await mkdir(evidence, {recursive: true}); await card.screenshot({path: `${evidence}/card-1280-light.png`}); }

  // Snooze holds the call for its length, then it rings again.
  const snoozed = page.waitForResponse(response => response.url().endsWith('/coach/morning'));
  await card.getByRole('button', {name: 'In 30 minutes', exact: true}).click();
  await card.waitFor({state: 'detached'});
  await snoozed;
  assert.equal((await api(`/coach?today=${today}&now=08:05`, undefined, 'get')).morning_due, false);
  assert.equal((await api(`/coach?today=${today}&now=08:10`, undefined, 'get')).morning_due, true);

  await page.clock.setFixedTime(at(8, 15));
  await page.evaluate(theme => localStorage.setItem('stellis-theme', theme), 'dark');
  await page.setViewportSize({width: 390, height: 900});
  await page.goto(origin);
  await card.waitFor();
  await card.getByRole('button', {name: 'Chat instead', exact: true}).click();
  const panel = page.locator('.coach-call');
  await panel.locator('.coach-call-source').waitFor();
  assert.equal(await panel.locator('.coach-agenda-progress').textContent(), '0 of 3');
  assert.match(await panel.locator('.coach-call-log li.is-agent').first().textContent(), /Repeat CBC and ferritin is planned for/);
  await panel.getByLabel('Message', {exact: true}).fill('Still a bit tired. I walked twenty minutes last night.');
  await panel.getByRole('button', {name: 'Send', exact: true}).click();
  const review = panel.locator('.log-inline');
  await review.waitFor();
  assert.match(await panel.locator('.coach-call-log li.is-action').first().textContent(),
      /The model chose log_entry from "Still a bit tired\. I walked twenty minutes last night\."/);
  assert.equal(await panel.locator('.coach-agenda-progress').textContent(), '1 of 3');
  assert.equal(await panel.locator(`.coach-agenda li[data-key="goal:${walk.id}"]`).getAttribute('data-covered'), 'true');
  assert.match(await review.locator('h3').textContent(), /^Confirm for /);
  assert.equal(await review.getByRole('button', {name: 'Yesterday', exact: true}).getAttribute('aria-pressed'), 'true');
  // Nothing is logged before the person confirms.
  assert.equal((await api(`/goals?today=${yesterday}&now=12:00`, undefined, 'get')).goals[0].done_today, false);
  // Review controls must retain their layout inside the message list.
  for (const width of [390, 1280]) for (const theme of ['dark', 'light']) {
    await page.setViewportSize({width, height: 900});
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    const geometry = await review.locator('.log-row').first().evaluate(row => {
      const box = selector => row.querySelector(selector).getBoundingClientRect();
      const check = box('input[type="checkbox"]');
      const icon = box('.log-tile-icon');
      const label = box('.log-row-label');
      return {delta: Math.abs(check.y + check.height / 2 - icon.y - icon.height / 2),
        width: row.getBoundingClientRect().width, available: row.parentElement.getBoundingClientRect().width,
        iconLeft: icon.right <= label.right};
    });
    assert(geometry.delta < 1, JSON.stringify(geometry));
    assert(Math.abs(geometry.width - geometry.available) < 1, JSON.stringify(geometry));
    assert(geometry.iconLeft);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (evidence) await page.screenshot({path: `${evidence}/panel-${width}-${theme}.png`});
  }
  await review.getByRole('button', {name: 'Log selected', exact: true}).click();
  await panel.locator('.coach-call-log li.is-action', {hasText: /^Logged for /}).waitFor();
  assert.equal(await review.count(), 0);
  assert.equal((await api(`/goals?today=${yesterday}&now=12:00`, undefined, 'get')).goals[0].done_today, true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log('PASS check-in: agenda from records, snooze, checklist progress, model choice shown, confirm before logging');
} finally { await browser.close(); }
