/** Check the approved palette on rendered controls, not just token references. */
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:18995';
const {notebook} = JSON.parse(await readFile(process.env.STELLIS_BRIEF_FIXTURE));
const evidence = process.env.STELLIS_TEST_SCREENSHOTS;
const browser = await chromium.launch({headless: true, executablePath: process.env.STELLIS_BROWSER});
const page = await browser.newPage({reducedMotion: 'reduce'});
const errors = []; page.on('pageerror', error => errors.push(error.message));
const report = [];
const rgb = hex => `rgb(${hex.match(/\w\w/g).map(value => parseInt(value, 16)).join(', ')})`;
async function colour(selector, property, expected) {
  const actual = await page.locator(selector).first().evaluate((el, key) => getComputedStyle(el)[key], property);
  assert.equal(actual, expected, `${selector} ${property}`);
  return actual;
}
try {
  for (const theme of ['light', 'dark']) for (const width of [1280, 390]) {
    await page.setViewportSize({width, height: 1000});
    await page.goto(`${origin}/notebook/${notebook}`);
    await page.locator('.brief-course').waitFor();
    await page.evaluate(t => {
      document.documentElement.classList.add('theme-swapping');
      document.documentElement.dataset.theme = t;
      localStorage.setItem('stellis-theme', t);
    }, theme);
    const light = theme === 'light';
    await colour('body', 'backgroundColor', rgb(light ? 'F7F5F6' : '302638'));
    await colour('#global-add', 'backgroundColor', rgb(light ? '413A48' : 'FFFFFF'));
    await colour('#global-add', 'color', rgb(light ? 'FFFFFF' : '2C2234'));
    await colour('#global-add .icon', 'color', rgb(light ? 'FFFFFF' : '2C2234'));
    await colour('#notebook-tab-chat', 'backgroundColor', rgb(light ? '2A252F' : 'F7F5F6'));
    await colour('#notebook-tab-chat', 'color', rgb(light ? 'F7F5F6' : '382C42'));
    await colour('.nb-chat', 'backgroundColor', rgb(light ? 'F7F5F6' : '382C42'));
    if (await page.locator('.nb-sources-toggle').getAttribute('aria-expanded') === 'false') {
      await page.locator('.nb-sources-toggle').click();
    }
    const secondary = page.locator('.nb-source-add');
    const fill = await secondary.evaluate(el => getComputedStyle(el).backgroundColor);
    if (light) assert.equal(fill, rgb('F7F5F6'));
    else assert.match(fill, /(?:oklch\(1 0 0 \/ 0\.8\)|rgba\(255, 255, 255, 0\.8\))/);
    await colour('.nb-source-add', 'color', rgb('2A252F'));
    await page.keyboard.press('Tab');
    await secondary.focus();
    await colour('.nb-source-add', 'outlineColor', rgb(light ? '335C63' : 'FFFFFF'));
    await page.getByRole('tab', {name: 'Brief', exact: true}).click();
    await colour('.brief-level-card', 'backgroundColor', rgb(light ? 'F7F5F6' : '382C42'));
    await colour('.brief-chart-line', 'stroke', rgb(light ? '335C63' : '45ADA8'));
    await colour('.brief-course-done', 'backgroundColor', rgb(light ? '335C63' : '45ADA8'));
    await colour('.brief-coming-source', 'color', rgb(light ? '335C63' : '45ADA8'));
    if (width === 390) {
      await colour('#compact-nav', 'backgroundColor', rgb(light ? 'F7F5F6' : '2C2234'));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    if (evidence) {
      await mkdir(evidence, {recursive: true});
      await page.screenshot({path: `${evidence}/palette-${width}-${theme}.png`, fullPage: true});
    }
    report.push({theme, width, result: 'passed'});
  }
  // This fixture runs in open mode; retain the real auth form for visual checks.
  await page.route('**/api/v1/auth/status', route => route.fulfill({json: {required: true, registration_open: false}}));
  for (const theme of ['light', 'dark']) {
    await page.goto(`${origin}/auth`);
    await page.locator('#auth-submit').waitFor();
    await page.evaluate(t => {
      document.documentElement.classList.add('theme-swapping');
      document.documentElement.dataset.theme = t;
    }, theme);
    await colour('#auth-submit', 'backgroundColor', rgb('413A48'));
    await colour('#auth-submit', 'color', rgb('FFFFFF'));
    if (evidence) await page.screenshot({path: `${evidence}/auth-${theme}.png`});
    report.push({theme, surface: 'auth', result: 'passed'});
  }
  assert.deepEqual(errors, []);
  if (evidence) await writeFile(`${evidence}/palette-results.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS approved palette: paper/purple surfaces, mauve/white actions, inverted tabs, glass, icon ink, focus, charts, dose, links and navigation');
} finally { await browser.close(); }
