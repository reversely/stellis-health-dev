/** Exercise calendar logging, pack selection and device forms in a fresh workspace. */
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8860';
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER});
const page=await browser.newPage({reducedMotion:'reduce',...(process.env.STELLIS_TEST_STORAGE?{storageState:process.env.STELLIS_TEST_STORAGE}:{})});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const request=page.request;
const createdRecordIds=new Set();
const pendingRecordResponses=[];
page.on('response',response=>{
  if(response.request().method()!=='POST'||!response.ok()||!/\/api\/v1\/reproductive\/(period|pill|larc)(?:\?|$)/.test(response.url()))return;
  pendingRecordResponses.push(response.json().then(record=>{if(record.id)createdRecordIds.add(record.id);}));
});
const api=async(path,data,method='post')=>{
  const response=await request[method](origin+'/api/v1/reproductive'+path,{data});
  assert(response.ok(),await response.text());
  const result=await response.json();
  if(method==='post'&&result.id)createdRecordIds.add(result.id);
  return result;
};
const date=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const artifact=process.env.STELLIS_TEST_SCREENSHOTS;
const geometry=process.env.STELLIS_TEST_LAYOUT_AUDIT ? (await import(process.env.STELLIS_TEST_LAYOUT_AUDIT)).audit : null;
const auditResults=[];
const dialog=page.getByRole('dialog');
const tracker=page.locator('.dashboard-reproductive');
const calendarSurface=page.locator('.dashboard-calendar');
let originalHealthPreference;
let changedHealthPreference=false;
const tab=name=>tracker.getByRole('tab',{name,exact:true});
async function screenshots(state) {
  if(!artifact)return;
  for(const theme of ['light','dark']) {
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    for(const width of [360,768,1024,1280,1920]) {
      await page.setViewportSize({width,height:1000});
      await tracker.scrollIntoViewIfNeeded();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${state} overflow at ${width}`);
      if(geometry) {
        const result=await page.evaluate(geometry,{centerSelectors:[],ignoreSelectors:['#compact-nav','#rail-shader','html:has(dialog[open]) body :not(dialog, dialog *, :has(dialog))'],isNarrow:width<768});
        auditResults.push({state,theme,width,...result});
      }
      await (await dialog.count()?dialog:tracker).screenshot({path:`${artifact}/${state}-${theme}-${width}.png`});
    }
  }
}
try {
  assert.equal((await api('',undefined,'get')).records.length,0,'Use a fresh isolated workspace');
  originalHealthPreference=(await (await request.get(origin+'/api/v1/health/preferences')).json()).experiences_periods;
  assert((await request.put(origin+'/api/v1/health/preferences',{data:{experiences_periods:true}})).ok());changedHealthPreference=true;
  await page.goto(origin);
  await tracker.getByText('Log a period to start your history',{exact:true}).waitFor();
  await screenshots('empty');
  await calendarSurface.getByRole('button',{name:'Log period',exact:true}).first().click();
  await dialog.getByLabel('Period start',{exact:true}).fill(date(-31));
  await dialog.getByLabel('Period end',{exact:true}).fill(date(-27));
  await dialog.getByRole('button',{name:'Heavy',exact:true}).click();
  await screenshots('period-form');
  await dialog.getByLabel('Symptoms and notes',{exact:true}).fill('Cramps');
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await dialog.waitFor({state:'detached'});
  await calendarSurface.getByRole('button',{name:'Log period',exact:true}).click();
  await dialog.getByLabel('Period start',{exact:true}).fill(date(-31));
  await dialog.getByLabel('Period end',{exact:true}).fill(date(-27));
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await dialog.getByRole('alert').filter({hasText:'overlap'}).waitFor();
  assert.equal(await dialog.getByLabel('Period start',{exact:true}).inputValue(),date(-31));
  await screenshots('period-error');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  await api('/period',{start:date(-3),end:date(-1),flow:'Light'});
  await page.reload();
  await tracker.getByText('Average cycle',{exact:true}).waitFor();
  assert.equal(await tracker.locator('.tracker-metric').filter({hasText:'Average cycle'}).innerText(),'Average cycle\n28 days');
  await tracker.getByRole('img',{name:/Day 4 of menstrual cycle/}).waitFor();
  assert.equal(await tracker.locator('.tracker-ring').count(),0);
  assert.equal(await calendarSurface.locator('.dashboard-section-head').getByRole('button',{name:'Log period',exact:true}).count(),1);
  assert(Number(await tracker.locator('.health-cycle-day-number').evaluate(element=>parseFloat(getComputedStyle(element).fontSize)))>=100);
  await screenshots('cycle');
  await calendarSurface.getByRole('button',{name:'Previous month',exact:true}).click();
  await calendarSurface.getByRole('button',{name:'Next month',exact:true}).click();
  await tab('Pills').click();
  await tracker.getByRole('button',{name:'Add pill pack',exact:true}).first().click();
  await dialog.getByLabel('Pill name',{exact:true}).fill('Example pack');
  await dialog.getByLabel('Pack start',{exact:true}).fill(date(-7));
  await screenshots('pill-form');
  await dialog.getByRole('button',{name:'24 active and 4 break days',exact:true}).click();
  assert.equal(await dialog.getByLabel('Active pills',{exact:true}).inputValue(),'24');
  await dialog.getByRole('button',{name:'21 active and 7 break days',exact:true}).click();
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await dialog.waitFor({state:'detached'});
  await tracker.getByRole('button',{name:'Mark taken',exact:true}).click();
  await tracker.getByRole('button',{name:'Undo dose',exact:true}).waitFor();
  await page.reload();await tab('Pills').click();
  await tracker.getByRole('button',{name:'Undo dose',exact:true}).click();
  await tracker.getByRole('button',{name:'Mark taken',exact:true}).waitFor();
  // Select the previous date and verify the write retains its calendar date.
  await tracker.locator(`[data-day="${date(-1)}"]`).click();
  await tracker.getByRole('button',{name:'Mark taken',exact:true}).click();
  const pack=(await api('',undefined,'get')).records.find(record=>record.kind==='pill');
  assert.deepEqual(pack.doses,[date(-1)]);
  assert.equal(await tracker.locator('.tracker-pill').count(),28);
  assert.equal(await tracker.locator('.tracker-pill.is-break').count(),7);
  await tracker.getByRole('button',{name:'Edit pack',exact:true}).click();
  await dialog.getByLabel('Pill name',{exact:true}).fill('Pack <img src=x>');
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'detached'});
  await tracker.getByText('Pack <img src=x>',{exact:true}).waitFor();
  assert.equal(await tracker.locator('img').count(),0);
  await tracker.getByRole('button',{name:'Edit pack',exact:true}).click();
  await dialog.getByLabel('Pill name',{exact:true}).fill('Example pack');
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'detached'});
  await tracker.locator(`[data-day="${date(0)}"]`).click();
  await tracker.getByRole('button',{name:'Skip',exact:true}).click();
  await tracker.getByRole('button',{name:'Undo dose',exact:true}).waitFor();
  assert.deepEqual((await api('',undefined,'get')).records.find(record=>record.kind==='pill').skipped,[date(0)]);
  await screenshots('pills');
  await tracker.getByRole('button',{name:'Edit pack',exact:true}).click();
  await dialog.getByLabel('Pill name',{exact:true}).focus();
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Edit pack');
  await tab('Devices').click();
  await tracker.getByRole('button',{name:'Add device',exact:true}).first().click();
  await dialog.getByLabel('Device name',{exact:true}).fill('Example implant');
  await dialog.getByLabel('Device type',{exact:true}).selectOption('Implant');
  await dialog.getByLabel('Renewal date',{exact:true}).fill(date(365));
  await screenshots('device-form');
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'detached'});
  await tracker.getByText('Example implant',{exact:true}).waitFor();
  await page.reload();await tab('Devices').click();await tracker.getByText('Example implant',{exact:true}).waitFor();
  await screenshots('devices');
  await tracker.getByRole('button',{name:'Edit device',exact:true}).click();
  await dialog.getByLabel('Removal date',{exact:true}).fill(date(0));
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'detached'});
  await tracker.getByRole('heading',{name:'Device history',exact:true}).waitFor();
  await tab('Cycle').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await tab('Pills').getAttribute('aria-selected'),'true');
  const future=await api('/pill',{name:'Future pack',start:date(3),active:21,break_days:7});
  const breakPack=await api('/pill',{name:'Break pack',start:date(-21),active:21,break_days:7});
  await page.reload();await tab('Pills').click();
  const futureView=tracker.locator(`[data-record="${future.id}"]`);
  const breakView=tracker.locator(`[data-record="${breakPack.id}"]`);
  await futureView.getByRole('heading',{name:'Future pack',exact:true}).waitFor();
  assert.equal(await futureView.locator('.tracker-dose-action').count(),0);
  assert.equal(await futureView.locator('.tracker-pill:not(:disabled)').count(),0);
  assert.equal(await breakView.locator('.tracker-dose-action').count(),0);
  await breakView.getByText('Today / Break day',{exact:true}).waitFor();
  if(artifact&&geometry) {
    const {writeFile}=await import('node:fs/promises');
    await writeFile(artifact+'/layout-report.json',JSON.stringify(auditResults,null,2));
    const fails=auditResults.flatMap(result=>result.findings.filter(finding=>finding.level==='fail').map(finding=>({state:result.state,width:result.width,theme:result.theme,...finding})));
    assert.deepEqual(fails,[],'Layout audit failures');
  }
  assert.deepEqual(errors,[]);
  console.log('Cycle logging, pack presets, dated doses, undo, reload, device removal, keyboard and screenshots passed');
} finally {
  try {
    await Promise.all(pendingRecordResponses);
    for(const recordId of createdRecordIds)await api('/'+recordId,undefined,'delete');
    if(changedHealthPreference)await request.put(origin+'/api/v1/health/preferences',{data:{experiences_periods:originalHealthPreference}});
  }finally {await browser.close();}
}
