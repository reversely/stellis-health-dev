/** Checks shared action styles, keyboard access and overlay motion. */
import assert from 'node:assert/strict';
import {readFile, writeFile, chmod} from 'node:fs/promises';

const {chromium} = await import(
    process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8779';
const browser = await chromium.launch({
  headless: true, executablePath: process.env.STELLIS_BROWSER,
});
const context = await browser.newContext({reducedMotion: 'reduce'});
const password = 'correct horse battery staple';
const errors = [];
const style = locator => locator.evaluate(element => {
  element.getAnimations().forEach(animation => animation.finish());
  const css = getComputedStyle(element);
  return {fill: css.backgroundColor, ink: css.color, radius: css.borderRadius,
    height: element.getBoundingClientRect().height, disabled: element.disabled};
});
const api = async (path, data, method = 'post') => {
  const response = await context.request[method](origin + '/api/v1' + path, {data});
  assert(response.ok(), path + ' ' + response.status());
  return response.json();
};
let registered = false;
try {
  await api('/auth/register', {username: 'stylesweep' + Date.now(), password});
  registered = true;
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const onboarding = {};
  for (const theme of ['light', 'dark']) {
    await page.goto(origin + '/onboarding');
    await page.evaluate(theme => localStorage.setItem('stellis-theme', theme), theme);
    await page.reload();
    const start = page.getByRole('button', {name: 'Get started', exact: true});
    await start.waitFor();
    const welcome = await style(start);
    await start.click();
    await page.getByRole('button', {name: 'Continue', exact: true}).click();
    const call = page.getByRole('button', {name: 'Start call', exact: true});
    await call.waitFor();
    onboarding[theme] = [welcome, await style(call)];
    await page.getByRole('button', {name: 'Back', exact: true}).click();
    await page.getByRole('button', {name: 'Back', exact: true}).click();
    await page.getByRole('heading', {name: 'Welcome to Stellis Health', exact: true}).waitFor();
  }
  await api('/onboarding', {uses: [], step: 'review', agent_choices: {}}, 'put');
  await api('/onboarding/complete');
  const notebook = await api('/notebooks', {name: 'Style review', color: '#547980'});
  const note = await api('/pages', {
    title: 'Control review', markdown: 'A note for checking the editor',
    notebook_id: notebook.id,
  });
  const uploaded = await context.request.post(origin + '/api/v1/documents', {
    multipart: {file: {name: 'review.png', mimeType: 'image/png',
      buffer: await readFile('src/stellis/sample_records/2025-03-23-lab-results-photo.png')}},
  });
  assert(uploaded.ok());
  const document = (await uploaded.json()).document;
  const routes = ['/', '/trends', '/records', '/summary', '/timeline', '/todos',
    '/settings', '/recording', '/chat', '/page/' + note.id,
    '/notebook/' + notebook.id, '/document/' + document.id];
  const manifest = {routes, notebook: notebook.id, note: note.id, document: document.id};
  if (process.env.STELLIS_STYLE_STORAGE) {
    await context.storageState({path: process.env.STELLIS_STYLE_STORAGE});
    await chmod(process.env.STELLIS_STYLE_STORAGE, 0o600);
    await writeFile(process.env.STELLIS_STYLE_STORAGE + '.routes.json', JSON.stringify(manifest));
  }
  for (const theme of ['light', 'dark']) {
    await page.goto(origin);
    await page.evaluate(theme => localStorage.setItem('stellis-theme', theme), theme);
    await page.reload();
    const record = page.locator('#home-record');
    const vitalSigns = page.locator('#health-dashboard').getByRole('button', {name: 'Log vital signs', exact: true});
    try {
      await vitalSigns.waitFor();
    } catch (error) {
      await page.screenshot({path: '/tmp/stellis-style-failure.png', fullPage: true});
      console.error('Home errors:', errors);
      throw error;
    }
    await page.locator('#dashboard-tools').evaluate(node => {node.open = true;});
    await record.hover();
    const hoverReference = await style(record);
    await page.mouse.move(0, 0);
    const reference = await style(record);
    await record.evaluate(element => { element.disabled = true; });
    const disabledReference = await style(record);
    await record.evaluate(element => { element.disabled = false; });
    const check = async locator => {
      await locator.waitFor();
      const actual = await style(locator);
      const expected = actual.disabled ? disabledReference : reference;
      assert.equal(actual.fill, expected.fill);
      assert.equal(actual.ink, expected.ink);
      assert.equal(actual.radius, reference.radius);
      assert(actual.height >= 44);
    };
    for (const entry of onboarding[theme]) {
      assert.equal(entry.fill, reference.fill);
      assert.equal(entry.ink, reference.ink);
      assert.equal(entry.radius, reference.radius);
    }
    for (const width of [390, 1280]) {
      await page.setViewportSize({width, height: 900});
      for (const route of routes) {
        await page.goto(origin + route);
        if (route === '/') {
          await check(page.locator('#health-dashboard').getByRole('button', {name: 'Log vital signs', exact: true}));
          const camera = page.locator('#health-dashboard').getByRole('button', {name: 'Log vital signs', exact: true});
          await camera.hover();
          assert.equal((await style(camera)).fill, hoverReference.fill);
          await page.mouse.move(0, 0);
          await page.locator('#dashboard-tools').evaluate(node => {node.open = true;});
          await check(page.getByRole('button', {name: 'Add goal', exact: true}));
          await check(page.getByRole('button', {name: 'Start setup', exact: true}));
        } else if (route === '/trends') {
          await check(page.getByRole('button', {name: 'Log vital signs', exact: true}));
          await page.getByRole('button', {name: 'Log pulse manually', exact: true}).click();
          await check(page.locator('.trend-form').getByRole('button', {name: 'Save', exact: true}));
          await page.locator('.trend-form').getByRole('button', {name: 'Cancel', exact: true}).click();
        } else if (route === '/records') {
          await check(page.getByRole('button', {name: 'Sort into notebooks', exact: true}));
        } else if (route === '/summary') {
          await check(page.locator('.summary-update'));
        } else if (route === '/settings') {
          await check(page.getByRole('button', {name: 'Save profile', exact: true}));
        } else if (route === '/recording') {
          await check(page.getByRole('button', {name: 'Start recording', exact: true}));
        } else if (route === '/chat') {
          await check(page.locator('.agent-ask-form button[type=submit]').first());
        } else if (route.startsWith('/notebook/')) {
          await check(page.getByRole('button', {name: 'New note', exact: true}));
          if (width < 768) {
            assert(await page.locator('.nb-chat').evaluate(chat =>
              chat.querySelector('.nb-messages').getBoundingClientRect().bottom <=
              chat.querySelector('.nb-composer').getBoundingClientRect().top));
          }
        } else if (route.startsWith('/document/')) {
          await check(page.getByRole('button', {name: 'Read text', exact: true}));
          await page.getByRole('button', {name: 'Edit text', exact: true}).click();
          await check(page.getByRole('button', {name: 'Save text', exact: true}));
          await page.locator('.document-text-editor').getByRole('button', {name: 'Cancel', exact: true}).click();
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
                     false, route + ' ' + width + ' ' + theme);
      }
    }
    const anonymous = await browser.newContext();
    await anonymous.addInitScript(theme => localStorage.setItem('stellis-theme', theme), theme);
    const auth = await anonymous.newPage();
    await auth.goto(origin + '/auth');
    await auth.locator('.auth-card form button[type=submit]').waitFor();
    const submit = await style(auth.locator('.auth-card form button[type=submit]'));
    assert.equal(submit.fill, reference.fill);
    assert.equal(submit.ink, reference.ink);
    assert(submit.height >= 48);
    if (theme === 'dark') {
      assert.equal(reference.fill, 'rgb(255, 255, 255)');
      assert.equal(reference.radius, '999px');
      assert.match((await style(auth.locator('.auth-card'))).fill, /0\.8\)/);
    }
    await anonymous.close();
    console.log(`PASS ${theme}: shared primary styles across 14 screens at phone and desktop widths`);
  }

  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.goto(origin);
  const log = page.getByRole('button', {name: 'Log vital signs', exact: true});
  await log.click();
  let dialog = page.getByRole('dialog', {name: 'Log vital signs', exact: true});
  assert.equal(await dialog.evaluate(element => getComputedStyle(element).transitionDuration.split(',')[0].trim()), '0.22s');
  assert.equal(await dialog.evaluate(element => getComputedStyle(element, '::backdrop').transitionDuration.split(',')[0].trim()), '0.22s');
  await dialog.getByRole('button', {name: 'Close', exact: true}).click();
  assert.equal(await dialog.evaluate(element => getComputedStyle(element).transitionDuration.split(',')[0].trim()), '0.18s');
  await dialog.waitFor({state: 'detached'});

  await page.keyboard.press('Tab');
  await log.focus();
  await page.keyboard.press('Enter');
  dialog = page.getByRole('dialog', {name: 'Log vital signs', exact: true});
  assert.equal(await dialog.evaluate(element => getComputedStyle(element).transitionDuration.split(',')[0].trim()), '0s');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state: 'detached'});
  await page.emulateMedia({reducedMotion: 'reduce'});
  await log.click();
  dialog = page.getByRole('dialog', {name: 'Log vital signs', exact: true});
  assert.equal(await dialog.evaluate(element => getComputedStyle(element).scale), '1');
  await dialog.getByRole('button', {name: 'Close', exact: true}).click();
  await dialog.waitFor({state: 'detached'});
  assert.deepEqual(errors, []);
  console.log('PASS motion: matched dialog/backdrop timing, immediate keyboard opening and reduced-motion scale');
} finally {
  if (registered && !process.env.STELLIS_STYLE_STORAGE) {
    await context.request.delete(origin + '/api/v1/account', {
      data: {password, confirm: 'DELETE'},
    });
  }
  await browser.close();
}
