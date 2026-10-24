/** Chat answers cite records by name; a citation or attachment opens the document panel with facts to check. */
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8885';
const {agent, document} = JSON.parse(await readFile(process.env.STELLIS_CHAT_FIXTURE));
const evidence = process.env.STELLIS_TEST_SCREENSHOTS;
const browser = await chromium.launch({headless: true, executablePath: process.env.STELLIS_BROWSER});
const page = await browser.newPage({reducedMotion: 'reduce', viewport: {width: 1440, height: 1000}});
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${origin}/chat/${agent}`);
  const reply = page.locator('.agent-message-agent').last();
  await reply.locator('a.chat-cite').first().waitFor();
  assert.deepEqual(await reply.locator('a.chat-cite').allTextContents(), [
    'Fatigue laboratory investigation, p. 1', 'Postpartum iron follow-up, p. 1', 'Fatigue laboratory investigation, p. 1']);
  const user = page.locator('.agent-message-user').last();
  assert.match(await user.locator('.chat-file-saved').textContent(), /^Saved to Blood Health$/);
  assert.equal(await user.locator('.chat-file-dot').count(), 1);

  // A citation opens the panel and becomes the selected chip.
  const first = reply.locator('a.chat-cite').first();
  await first.click();
  const panel = page.locator('.chat-doc-panel');
  await panel.locator('h2', {hasText: 'Fatigue laboratory investigation'}).waitFor();
  assert.equal(await first.getAttribute('aria-current'), 'true');
  assert.equal(new URL(page.url()).pathname, `/chat/${agent}`);
  assert.equal(await panel.locator('.chat-doc-notebook').textContent(), 'Blood Health');
  assert.match(await panel.locator('.chat-doc-date').textContent(), /Visit or test dateJun 15, 2026From page 1: .*2026-06-15/);
  const facts = panel.locator('.facts.is-compact');
  await facts.locator('.fact').first().waitFor();
  assert.equal(await facts.locator('.facts-count').textContent(), '4 to check');
  const statuses = Object.fromEntries(await facts.locator('.fact').evaluateAll(rows => rows.map(row =>
      [row.querySelector('strong').textContent, row.querySelector('.status-block').textContent])));
  assert.deepEqual(statuses, {Hemoglobin: 'In range', MCV: 'In range', Ferritin: 'Low', TSH: 'In range'});
  assert.equal(await facts.locator('.fact.is-flagged strong').textContent(), 'Ferritin');
  await panel.locator('.chat-doc-mark').first().waitFor();
  await page.waitForFunction(() => document.querySelector('.chat-doc-stage img')?.naturalWidth > 0);
  assert.equal(await panel.locator('.chat-doc-caption').textContent(), 'Highlighted: the ferritin line.');
  if (evidence) { await mkdir(evidence, {recursive: true}); await page.screenshot({path: `${evidence}/chat-panel-1440-light.png`}); await user.locator('.chat-file').screenshot({path: `${evidence}/attachment-row.png`}); }

  // Accepting a value updates the count; closing clears the selected chip.
  await facts.getByRole('button', {name: 'Accept Hemoglobin', exact: true}).click();
  await facts.locator('.facts-count', {hasText: '3 to check'}).waitFor();
  await panel.getByRole('button', {name: 'Close document', exact: true}).click();
  await panel.waitFor({state: 'detached'});
  assert.equal(await first.getAttribute('aria-current'), null);
  // The attachment link opens the same panel; another source's chip opens that record.
  await user.locator('a[data-document]').click();
  await panel.locator('h2', {hasText: 'Fatigue laboratory investigation'}).waitFor();
  await reply.locator('a.chat-cite').nth(1).click();
  await panel.locator('h2', {hasText: 'Postpartum iron follow-up'}).waitFor();
  assert.equal(await reply.locator('a.chat-cite[aria-current]').count(), 1);
  for (const [theme, width] of [['dark', 1440], ['dark', 390]]) {
    await page.setViewportSize({width, height: 1000});
    await page.evaluate(t => document.documentElement.dataset.theme = t, theme);
    // On a phone the panel is a full-height sheet over the chat, so close it first.
    if (await panel.count()) { await panel.getByRole('button', {name: 'Close document', exact: true}).click(); await panel.waitFor({state: 'detached'}); }
    await reply.locator('a.chat-cite').first().click();
    await panel.locator('.facts.is-compact .fact').first().waitFor();
    const box = await panel.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width + .5, `${theme} ${width} panel bounds`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${theme} ${width} overflow`);
    if (evidence) await page.screenshot({path: `${evidence}/chat-panel-${width}-${theme}.png`});
  }
  await page.keyboard.press('Escape');
  await panel.waitFor({state: 'detached'});
  assert.deepEqual(errors, []);
  console.log('PASS chat document: named citation chips, saved notebook chip, panel with date evidence, facts to check, highlight, accept, close, themes and widths');
} finally { await browser.close(); }
