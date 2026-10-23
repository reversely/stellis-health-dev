/** Runs the actual corpus through the visible upload and date-review controls. */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile, stat} from 'node:fs/promises';
import path from 'node:path';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8976';
const out = process.env.STELLIS_MAYA_EVIDENCE || '/tmp/stellis-maya-browser';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({executablePath:process.env.STELLIS_BROWSER, args:['--no-sandbox','--disable-gpu']});
const context = await browser.newContext({viewport:{width:1280,height:900}, reducedMotion:'reduce', recordVideo:{dir:out,size:{width:1280,height:900}}});
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const manifest = JSON.parse(await readFile('stellis-synthetic-patient/manifest.json','utf8'));
const results = [];
const workflow = process.env.STELLIS_MAYA_WORKFLOW === '1';
const guideData = JSON.parse(await readFile('src/stellis/static/maya/guide.json','utf8'));
const milestones = [];
const books = new Map();
try {
  if (workflow) {const response = await context.request.get(origin+'/api/v1/notebooks'); for (const book of (await response.json()).notebooks) if (book.template_id) books.set(book.template_id,book);}
  await page.goto(origin);
  await page.locator('#library-more summary').click();
  await page.locator('#take-tour').click();
  const guide = page.getByRole('region',{name:'Maya’s story'});
  // The section is labelled without a role override and exposes a region.
  await guide.getByRole('button',{name:'Upload Record',exact:true}).waitFor();
  for (const entry of manifest.slice(0, Number(process.env.STELLIS_MAYA_LIMIT || manifest.length))) {
    await guide.getByText(new RegExp(`${entry.document_id === 'D001' ? '1' : Number(entry.document_id.slice(1))} of 70:`)).waitFor();
    const step = guideData.steps.find(item => item.document_id === entry.document_id);
    const suggested = step.notebooks[0];
    if (workflow && !books.has(suggested.template_id)) {
      await guide.getByRole('button',{name:'Add Notebook',exact:true}).click();
      const picker = page.getByRole('dialog',{name:'Add Notebook',exact:true});
      await picker.getByLabel('Search notebooks',{exact:true}).fill(suggested.name);
      await picker.locator('label.catalogue-option').filter({has:page.getByText(suggested.name,{exact:true})}).getByRole('checkbox').check();
      await picker.getByRole('button',{name:'Add notebooks',exact:true}).click();
      await picker.waitFor({state:'detached'});
      const response = await context.request.get(origin+'/api/v1/notebooks');
      const notebook = (await response.json()).notebooks.find(book => book.template_id === suggested.template_id);
      assert(notebook, suggested.name); books.set(suggested.template_id,notebook);
    }
    await guide.getByRole('button',{name:'Upload Record',exact:true}).click();
    const dialog = page.getByRole('dialog',{name:'Upload Record',exact:true});
    if (workflow) await dialog.getByLabel('Notebook',{exact:true}).selectOption(books.get(suggested.template_id).id);
    await dialog.getByLabel('Record',{exact:true}).setInputFiles(path.resolve('stellis-synthetic-patient', entry.path));
    await dialog.getByRole('button',{name:'Upload record',exact:true}).click();
    const date = dialog.getByLabel('Encounter date',{exact:true});
    await date.waitFor();
    assert.equal(await date.inputValue(),entry.clinical_date,entry.document_id+' proposed date');
    await dialog.getByRole('button',{name:/^(Confirm|Save) date$/}).click();
    await dialog.getByText('Date confirmed',{exact:true}).waitFor();
    await page.keyboard.press('Escape');
    await guide.getByRole('button',{name:'Check upload',exact:true}).click();
    const next = guide.getByRole('button',{name:entry.document_id === 'D070' ? 'Finish guide':'Next record',exact:true});
    await next.waitFor(); await page.waitForFunction(()=>!document.querySelector('[aria-label="Maya’s story"] .coach-call-ended .is-primary')?.disabled);
    results.push({document_id:entry.document_id,proposed_date:entry.clinical_date,confirmed:true});
    if (entry.document_id === 'D001') await page.screenshot({path:out+'/first-upload.png'});
    if (workflow && step.milestone) {
      await guide.getByRole('button',{name:'Timeline',exact:true}).click();
      await page.locator('#timeline-view').getByRole('button',{name:'Documents',exact:true}).click();
      await page.locator('#timeline-view').getByLabel('Notebook',{exact:true}).selectOption(books.get(suggested.template_id).id);
      const row = page.locator('.timeline-entry').filter({has:page.getByRole('link',{name:entry.filename.replace(/\.pdf$/,'').replaceAll('_',' '),exact:true})});
      await row.waitFor(); assert.equal(await row.locator('time').getAttribute('datetime'),entry.clinical_date);
      await row.locator('a').click(); await page.getByLabel('Encounter date',{exact:true}).waitFor();
      assert.equal(await page.getByLabel('Encounter date',{exact:true}).inputValue(),entry.clinical_date);
      await guide.getByRole('button',{name:'Expand',exact:true}).click();
      await guide.getByRole('button',{name:'Ask Stellis',exact:true}).click();
      await page.getByLabel('Notebook context',{exact:true}).selectOption(books.get(suggested.template_id).id);
      await page.getByLabel('Message Stellis',{exact:true}).fill(step.question);
      const send = page.locator('.agent-composer').getByRole('button',{name:'Send',exact:true});
      const before = await page.locator('.agent-message-agent').count();
      await send.click({timeout:20000});
      const reply = page.locator('.agent-message-agent').last();
      await page.waitForFunction(count => document.querySelectorAll('.agent-message-agent').length > count,before,{timeout:180000});
      await reply.locator('a[href*="/document/"]').first().waitFor({timeout:10000});
      const answer = await reply.innerText();
      if (entry.document_id === 'D027') for (const count of ['12|twelve','10|ten','8|eight','4|four']) assert(new RegExp('\\b('+count+')\\b','i').test(answer),'Missing IVF count '+count);
      if (entry.document_id === 'D035') assert(/August 3|Aug 3|2025-08-03|3 August/.test(answer),'Missing ART due date');
      const citations = await reply.locator('a[href*="/document/"]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
      milestones.push({document_id:entry.document_id,question:step.question,answer,citations,notebook_id:books.get(suggested.template_id).id,timeline_date:entry.clinical_date});
      await page.screenshot({path:out+'/'+entry.document_id+'-chat.png'});
      if (Number(process.env.STELLIS_MAYA_PACE_MS)) await page.waitForTimeout(Number(process.env.STELLIS_MAYA_PACE_MS) * 5);
      await guide.getByRole('button',{name:'Expand',exact:true}).click();
    }
    if (Number(process.env.STELLIS_MAYA_PACE_MS)) await page.waitForTimeout(Number(process.env.STELLIS_MAYA_PACE_MS));
    await next.click();
  }
  assert.deepEqual(errors,[]);
  await writeFile(out+'/results.json', JSON.stringify({scope:workflow ? 'Actual PDF ingestion, catalogue selection, timeline source navigation and real configured assistant replies' : 'Actual embedded PDF text and visible upload/date confirmation; no model or optical recognition claim',results,milestones,errors},null,2));
  console.log(`PASS ${results.length} sequential PDF uploads and proposed/confirmed dates`);
} catch(error) {await page.screenshot({path:out+'/failure.png'});throw error;}
finally {const video = page.video(); await context.close(); if (video) {await video.saveAs(out+'/upload-dates.webm'); assert((await stat(out+'/upload-dates.webm')).size > 1000,'Video recording is empty');} await browser.close();}
