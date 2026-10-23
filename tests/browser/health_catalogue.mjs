/** Catalogue selection, custom identity and shared sources in a disposable account. */
import assert from 'node:assert/strict';
import {chmod,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8782';
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER});
const context=await browser.newContext();const page=await context.newPage();
page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function api(path,method='GET',data) {const r=await page.request.fetch(origin+'/api/v1'+path,{method,data});assert.ok(r.ok(),await r.text());return r.json();}
try {
  await api('/auth/login','POST',{username:process.env.STELLIS_TEST_USERNAME,password:process.env.STELLIS_TEST_PASSWORD});
  const forbidden=await page.request.post(origin+'/api/v1/health-catalogue/activate',{headers:{Origin:'https://unrelated.invalid'},data:{selections:[{template_id:'fitness--fitness'}]}});
  assert.equal(forbidden.status(),403);
  const intake=await api('/intake');
  await api('/intake/notes','PUT',{revision:intake.notes_revision,sections:[{heading:'Goals',items:['Manage migraine and prepare for pregnancy','Improve nutrition']},{heading:'Conditions',items:['History of asthma']}]});
  const recommendations=await api('/health-catalogue/recommendations');
  assert.ok(recommendations.groups.some(g=>g.template_id==='pregnancy-postpartum--pregnancy'));
  assert.ok(!recommendations.groups.some(g=>g.notebook_name.includes('Asthma')));
  // Reset only notebooks created by this regression in its disposable account.
  for(const book of (await api('/notebooks')).notebooks) await api('/notebooks/'+book.id,'DELETE');
  for(const book of (await api('/health-catalogue')).archived) await api('/notebooks/'+book.id,'DELETE');
  await page.setViewportSize({width:390,height:844});await page.goto(origin+'/');
  await page.locator('#new-collection').click();
  const dialog=page.getByRole('dialog',{name:'Add Notebook',exact:true});await dialog.waitFor();
  await dialog.getByLabel('Search notebooks',{exact:true}).fill('Pregnancy');
  await dialog.locator('label.catalogue-option').filter({has:page.getByText('Pregnancy',{exact:true})}).getByRole('checkbox').check();
  await dialog.getByLabel('Search notebooks',{exact:true}).fill('nutrition');
  await dialog.locator('label.catalogue-option').filter({has:page.getByText('Nutrition',{exact:true})}).getByRole('checkbox').check();
  assert.equal((await api('/notebooks')).notebooks.length,0);
  await dialog.getByRole('button',{name:'Add notebooks',exact:true}).click();await dialog.waitFor({state:'detached'});
  await page.waitForFunction(()=>document.querySelector('#conversation-list')?.textContent.includes('Pregnancy'));
  let books=(await api('/notebooks')).notebooks;assert.equal(books.length,2);
  assert.ok(books.every(b=>b.collection_id));
  await page.locator('#new-collection').click();
  await dialog.getByText('Custom notebook',{exact:true}).click();
  const literal='My <script>window.__catalogueInjected=true</script>';
  await dialog.getByLabel('Name',{exact:true}).fill(literal);
  await dialog.getByLabel('Description',{exact:true}).fill('My care notes');
  await dialog.getByLabel('Collection',{exact:true}).selectOption('chronic-illness-complex-care');
  await dialog.getByRole('button',{name:'Select custom notebook',exact:true}).click();
  await dialog.getByRole('button',{name:'Add notebooks',exact:true}).click();await dialog.waitFor({state:'detached'});
  books=(await api('/notebooks')).notebooks;
  const custom=books.find(b=>b.name===literal);assert.ok(custom);
  const pregnancy=books.find(b=>b.name==='Pregnancy');const nutrition=books.find(b=>b.name==='Nutrition');
  const note=await api('/pages','POST',{title:'Shared source',notebook_id:pregnancy.id,markdown:'Nutrition plan and ferritin monitoring'});
  await page.goto(origin+'/notebook/'+nutrition.id);
  await page.locator('.nb-sources-toggle').click();
  await page.getByRole('button',{name:'Add source',exact:true}).click();
  await page.locator('.nb-add-row').filter({hasText:'In Pregnancy'}).getByRole('button',{name:'Add Shared source',exact:true}).click();
  await page.getByRole('dialog',{name:'Add source',exact:true}).getByText('Added Shared source',{exact:true}).waitFor();
  await page.getByRole('dialog',{name:'Add source',exact:true}).press('Escape');
  for(const book of [pregnancy,nutrition]) {
    await page.goto(origin+'/notebook/'+book.id);
    await page.locator('.nb-sources-toggle').click();
    await page.locator('.nb-source-title').filter({hasText:'Shared source'}).waitFor();
    const sources=await api('/notebooks/'+book.id+'/sources');assert.ok(sources.sources.some(s=>s.id==='page:'+note.id));
  }
  for(const width of [390,1280]) {
    await page.setViewportSize({width,height:900});await page.goto(origin+'/notebook/'+custom.id);
    await page.locator('#notebook-name').filter({hasText:width===390 ? literal : 'My care 390'}).waitFor();
    assert.equal(await page.evaluate(()=>window.__catalogueInjected),undefined);
    await page.locator('#notebook-more summary').click();
    await page.locator('#notebook-edit').click();
    await page.locator('#notebook-settings-name').fill('My care '+width);
    await page.locator('#notebook-settings-description').fill('Updated care description');
    await page.locator('#notebook-settings-collection').selectOption('pain-management');
    await page.locator('#notebook-settings-save').click();
    await page.locator('#notebook-settings-dialog').waitFor({state:'hidden'});await page.reload();
    await page.locator('#notebook-name').filter({hasText:'My care '+width}).waitFor();
  }
  await api('/notebooks/'+custom.id,'PATCH',{archived:true});await page.goto(origin+'/');
  assert.ok(!(await api('/notebooks')).notebooks.some(b=>b.id===custom.id));
  await page.locator('#new-collection').click();await dialog.getByText('Archived notebooks',{exact:true}).click();
  await dialog.getByRole('button',{name:'Restore',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog.health-catalogue'));
  assert.ok((await api('/notebooks')).notebooks.some(b=>b.id===custom.id));
  if(process.env.STELLIS_TEST_STORAGE) {await context.storageState({path:process.env.STELLIS_TEST_STORAGE});await chmod(process.env.STELLIS_TEST_STORAGE,0o600);}
  await writeFile('.agents/catalogue-runtime/browser-records.json',JSON.stringify({custom:custom.id,pregnancy:pregnancy.id,nutrition:nutrition.id}));
  assert.deepEqual(errors,[]);console.log('PASS: catalogue approval, multi-selection, custom identity, shared sources, settings and archive restore at 390 and 1280px');
} finally {await browser.close();}
