/** Joined logging: choose tiles, review with one date, save, undo, the cap, rollback and proposals. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8860';
const evidence=process.env.STELLIS_TEST_SCREENSHOTS;
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER});
const page=await browser.newPage({reducedMotion:'reduce'});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const api=async(path,data,method='post')=>{
  const response=await page.request[method](origin+'/api/v1'+path,data===undefined?{}:{data});
  assert(response.ok(),path+' '+await response.text());return response.json();
};
const date=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const outcome=async(id,day=date(0))=>(await api('/trackers?today='+date(0),undefined,'get')).records.find(r=>r.id===id).outcomes[day]?.status;
const sheet=page.locator('dialog.log-sheet');
const tile=title=>sheet.locator('.log-tile').filter({hasText:title}).first();
const created=[];
try {
  await api('/health/preferences',{experiences_periods:true},'put');
  const run=Date.now();
  const iron=await api('/trackers/medicine',{name:'Iron '+run,dose_amount:300,dose_unit:'mg',schedule_type:'daily',start:date(-10)});
  created.push(iron.id);
  for (let n=1;n<=9;n++) created.push((await api('/trackers/medicine',{name:`Course ${n} ${run}`,dose_amount:n,dose_unit:'mg',schedule_type:'daily',start:date(-3)})).id);
  const walk=await api('/goals',{activity:'walk',amount:20,times_per_week:3});
  await page.goto(origin);
  await page.locator('.dashboard-reproductive .tracker-log-open').click();
  await sheet.getByRole('heading',{name:'Log',exact:true}).waitFor();
  await tile('Iron '+run).waitFor();
  assert.deepEqual(await sheet.locator('.log-group h3').allTextContents(),['Medicines','Cycle','Goals','Measurements']);
  assert.equal(await sheet.locator('.log-search').count(),1,'search appears with more than twelve items');
  assert.equal(await tile('Iron '+run).locator('.log-tile-state').textContent(),'Due today');
  const review=sheet.getByRole('button',{name:/^Review/});
  assert.equal(await review.isDisabled(),true);

  // Choose three, review with one date, save, then undo.
  await tile('Iron '+run).click();await tile('Walk').click();await tile('Period flow').click();
  assert.equal(await sheet.locator('.log-count').textContent(),'3 selected');
  assert.equal(await tile('Iron '+run).getAttribute('aria-pressed'),'true');
  const blocks=await tile('Iron '+run).evaluate(node=>{const s=getComputedStyle(node);return [s.backgroundColor,s.color];});
  assert.notEqual(blocks[0],blocks[1]);
  await review.click();
  await sheet.getByRole('heading',{name:'Review',exact:true}).waitFor();
  assert.equal(await sheet.getByRole('button',{name:'Today',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await sheet.locator('.log-row').count(),3);
  const ironRow=sheet.locator('.log-row').filter({hasText:'Iron '+run});
  assert.equal(await ironRow.getByRole('button',{name:'Taken',exact:true}).getAttribute('aria-pressed'),'true');
  await sheet.locator('.log-row').filter({hasText:'Period flow'}).getByRole('button',{name:'Light',exact:true}).click();
  await sheet.getByRole('button',{name:'Save 3 entries',exact:true}).click();
  await sheet.waitFor({state:'detached'});
  const toast=page.locator('.log-toast');
  await toast.getByText('Saved 3 entries').waitFor();
  assert.equal(await outcome(iron.id),'taken');
  const flow=(await api('/health/observations',undefined,'get')).observations.find(o=>o.day===date(0));
  assert.equal(flow.value,'Light');
  await toast.getByRole('button',{name:'Undo',exact:true}).click();
  await toast.getByText('Undone',{exact:true}).waitFor();
  assert.equal(await outcome(iron.id),undefined);
  assert.equal((await api('/health/observations',undefined,'get')).observations.some(o=>o.day===date(0)),false);

  // The cap: ten selected, the eleventh refused.
  await page.locator('.dashboard-reproductive .tracker-log-open').click();
  await tile('Iron '+run).waitFor();
  const medicines=sheet.locator('.log-group').filter({has:page.getByRole('heading',{name:'Medicines'})}).locator('.log-tile');
  for (let i=0;i<10;i++) await medicines.nth(i).click();
  await tile('Walk').click();
  assert.equal(await tile('Walk').getAttribute('aria-pressed'),'false');
  await sheet.locator('.log-status',{hasText:'Choose up to 10'}).waitFor();
  assert.equal(await sheet.locator('.log-count').textContent(),'10 selected');
  for (let i=0;i<10;i++) await medicines.nth(i).click();

  // Search filters tiles; keyboard selects one.
  await sheet.locator('.log-search').fill('pulse');
  assert.equal(await sheet.locator('.log-tile').count(),0);
  await sheet.locator('.log-search').fill('');
  await tile('Weight').focus();await page.keyboard.press('Space');
  assert.equal(await tile('Weight').getAttribute('aria-pressed'),'true');
  await tile('Iron '+run).click();

  // One invalid row saves nothing and marks that row.
  await review.click();
  await sheet.getByLabel('Weight',{exact:true}).fill('999');
  await sheet.getByRole('button',{name:'Save 2 entries',exact:true}).click();
  const rowError=sheet.locator('.log-row').filter({hasText:'Weight'}).locator('.log-row-error');
  await rowError.filter({hasText:/./}).waitFor();
  await sheet.locator('.log-status',{hasText:'Nothing was saved'}).waitFor();
  assert.equal(await outcome(iron.id),undefined);
  // Yesterday is checked against each schedule, then saves.
  await sheet.getByRole('button',{name:'Yesterday',exact:true}).click();
  await sheet.getByLabel('Weight',{exact:true}).fill('70.4');
  await sheet.getByRole('button',{name:'Save 2 entries',exact:true}).click();
  await sheet.waitFor({state:'detached'});
  assert.equal(await outcome(iron.id,date(-1)),'taken');

  // A proposal opens on review with its evidence, and saves only on Log selected.
  await page.evaluate(([goal,day])=>window.StellisTrackerLog.open({day,proposals:[{item:'goal:'+goal,value:true,evidence:'I walked twenty minutes last night'}]}),[walk.id,date(-1)]);
  await sheet.getByRole('heading',{name:'Confirm',exact:true}).waitFor();
  await sheet.getByText('From "I walked twenty minutes last night"').waitFor();
  assert.equal(await sheet.getByRole('button',{name:'Yesterday',exact:true}).getAttribute('aria-pressed'),'true');
  const keep=sheet.locator('.log-row input[type=checkbox]');
  await keep.uncheck();
  assert.equal(await sheet.getByRole('button',{name:'Log selected',exact:true}).isDisabled(),true);
  await keep.check();
  if (evidence) {await mkdir(evidence,{recursive:true});await sheet.screenshot({path:`${evidence}/proposal-1280-light.png`});}
  await sheet.getByRole('button',{name:'Log selected',exact:true}).click();
  await sheet.waitFor({state:'detached'});
  const onYesterday=await api(`/goals?today=${date(-1)}&now=12:00`,undefined,'get');
  assert.equal(onYesterday.goals.find(g=>g.id===walk.id).done_today,true);

  // The global Add dialog opens the same sheet.
  await page.locator('#global-add').click();
  await page.getByRole('dialog',{name:'Add',exact:true}).getByRole('button',{name:'Log Items',exact:true}).click();
  await sheet.getByRole('heading',{name:'Log',exact:true}).waitFor();

  for (const theme of ['light','dark']) for (const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    if (await tile('Iron '+run).getAttribute('aria-pressed')!=='true') await tile('Iron '+run).click();
    const box=await sheet.boundingBox();
    assert(box.x>=0 && box.x+box.width<=width+0.5,`${theme} ${width} sheet bounds`);
    assert.equal(await sheet.evaluate(node=>node.scrollWidth>node.clientWidth),false,`${theme} ${width} sheet overflow`);
    const footer=await sheet.locator('.log-footer').boundingBox();
    assert(footer.y+footer.height<=900,`${theme} ${width} footer visible`);
    if (evidence) await page.screenshot({path:`${evidence}/choose-${width}-${theme}.png`});
  }
  await page.setViewportSize({width:390,height:900});
  await sheet.getByRole('button',{name:/^Review/}).click();
  if (evidence) await page.screenshot({path:`${evidence}/review-390-dark.png`});
  assert.deepEqual(errors,[]);
  console.log('PASS joined logging: tiles, cap, search, keyboard, review, one date, rollback, undo, proposals, Add entry, both themes and widths');
} finally {
  for (const id of created) await page.request.delete(origin+'/api/v1/trackers/records/'+id);
  await browser.close();
}
