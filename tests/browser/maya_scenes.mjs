/** Demo scene dock: scenes from story data, card content, keyboard, real views, and hidden outside the demo. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8860';
const evidence = process.env.STELLIS_TEST_SCREENSHOTS;
const browser = await chromium.launch({headless: true, executablePath: process.env.STELLIS_BROWSER});
const page = await browser.newPage({reducedMotion: 'reduce', viewport: {width: 1440, height: 1000}});
const errors = []; page.on('pageerror', error => errors.push(error.message));
const post = async (path, data) => {
  const response = await page.request.post(origin + '/api/v1' + path, data ? {data} : {});
  assert(response.ok(), path + ' ' + await response.text()); return response.json();
};
try {
  await page.goto(origin);
  await page.locator('#health-dashboard').waitFor();
  assert.equal(await page.locator('.maya-scene-dock').count(), 0, 'no dock outside the demo');
  await post('/demo/enter');
  const story = await (await page.request.get(origin + '/static/maya/story.json')).json();
  await page.goto(origin);
  const dock = page.locator('.maya-scene-dock');
  await dock.waitFor();
  const buttons = dock.locator('.maya-scene-button');
  assert.deepEqual(await buttons.allTextContents(), story.scenes.map((scene, i) => `${i + 1}${scene.label}`));
  const card = page.locator('.maya-scene-card');
  assert.equal(await card.locator('h2').textContent(), story.scenes[0].title);
  assert.deepEqual(await card.locator('.maya-scene-tags li').allTextContents(), story.scenes[0].tags);
  assert.equal(await buttons.first().getAttribute('aria-current'), 'step');
  assert.equal(await dock.getByRole('button', {name: 'Previous scene'}).isDisabled(), true);
  if (evidence) { await mkdir(evidence, {recursive: true}); await page.screenshot({path: `${evidence}/scenes-1440-light.png`}); }

  // A scene whose records are not imported says what to do, instead of failing silently.
  await buttons.first().click();
  await card.locator('.maya-scene-status', {hasText: /Import Maya’s 2026 records first/}).waitFor();
  // The check-in scene opens My Health; keyboard arrows move between scenes.
  await buttons.nth(2).click();
  await page.waitForFunction(() => location.pathname === '/');
  assert.equal(await card.locator('h2').textContent(), story.scenes[2].title);
  await buttons.nth(2).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await buttons.nth(3).getAttribute('aria-current'), 'step');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), `4${story.scenes[3].label}`);
  // The Levels scene opens the named notebook's Brief once it exists.
  await card.locator('.maya-scene-status', {hasText: /Add the Blood Health notebook/}).waitFor();
  const book = await post('/notebooks', {name: 'Blood Health'});
  await buttons.nth(3).click();
  await page.waitForFunction(id => location.pathname === `/notebook/${id}`, book.id);
  await page.locator('#notebook-tab-overview[aria-selected="true"]').waitFor();
  // Hide steps the card aside; choosing a scene brings it back.
  await card.getByRole('button', {name: 'Hide'}).click();
  assert.equal(await card.isVisible(), false);
  await buttons.nth(2).click();
  await card.waitFor();
  for (const [theme, width] of [['dark', 390]]) {
    await page.setViewportSize({width, height: 900});
    await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
    const box = await dock.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width + .5);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (evidence) await page.screenshot({path: `${evidence}/scenes-${width}-${theme}.png`});
  }
  // Adding a scene to the data adds a button, with no code change.
  await page.setViewportSize({width: 1440, height: 1000});
  await page.route('**/static/maya/story.json', async route => {
    const data = await (await route.fetch()).json();
    data.scenes.push({...data.scenes[2], key: 'extra', label: 'Extra', title: 'An added scene'});
    await route.fulfill({json: data});
  });
  await page.goto(origin);
  await dock.waitFor();
  assert.equal(await buttons.count(), story.scenes.length + 1);
  assert.equal(await buttons.last().textContent(), `${story.scenes.length + 1}Extra`);
  await post('/demo/leave');
  await page.unroute('**/static/maya/story.json');
  await page.goto(origin);
  await page.locator('#health-dashboard').waitFor();
  assert.equal(await page.locator('.maya-scene-dock').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS demo scenes: data-driven buttons and card, guidance, real views, keyboard, hide, phone, hidden outside the demo');
} finally { await browser.close(); }
