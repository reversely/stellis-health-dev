/** Medicine courses on My Health: registry form, course card, logging, calculated dates. */
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
const tracker=page.locator('.dashboard-reproductive');
const created=[];
try {
  await api('/health/preferences',{experiences_periods:false},'put');
  const notebook=await api('/notebooks',{name:'Course audit '+Date.now()});
  // Started 64 days ago every other day: today is a dose day, so it can be logged.
  const course=await api('/trackers/medicine',{name:'Ferrous sulfate',dose_amount:300,dose_unit:'mg',
    schedule_type:'every',every_days:2,start:date(-64),units_per_fill:45,units_per_dose:1,repeats:1,notebook_id:notebook.id});
  created.push(course.id);
  await page.goto(origin);
  const card=tracker.locator(`.tracker-course[data-record="${course.id}"]`);
  await card.waitFor();
  // Only one kind is visible with periods off, so the tab row is hidden.
  assert.equal(await tracker.locator('.tracker-tabs').isVisible(),false);
  assert.match(await card.locator('.tracker-heading p').textContent(),/^300 mg, every other day$/);
  assert.equal(await card.locator('.tracker-dose-status').textContent(),'Due today');
  const expected=await api('/trackers?today='+date(0),undefined,'get');
  const derived=expected.records.find(r=>r.id===course.id).summary.derived;
  const upcoming=card.locator('.tracker-course-upcoming li');
  assert.equal(await upcoming.count(),derived.filter(item=>item.date>=date(0)).length);
  assert.equal(await upcoming.first().locator('.status-block').textContent(),'Calculated');
  await card.getByRole('button',{name:'Mark taken',exact:true}).click();
  await card.locator('.tracker-dose-status',{hasText:'Taken today'}).waitFor();
  assert.equal(await card.locator('.tracker-metric dd').first().textContent(),'1');
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Undo');
  await card.getByRole('button',{name:'Undo',exact:true}).click();
  await card.locator('.tracker-dose-status',{hasText:'Due today'}).waitFor();

  // The form comes from the registry schema, including the conditional field.
  await tracker.getByRole('button',{name:'Add medicine course',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Add medicine course',exact:true});await dialog.waitFor();
  await dialog.getByLabel('Medicine',{exact:true}).fill('Vitamin D');
  await dialog.getByLabel('Dose',{exact:true}).fill('1000');
  await dialog.getByLabel('Unit',{exact:true}).selectOption('units');
  assert.equal(await dialog.getByLabel('Days between doses',{exact:true}).isVisible(),false);
  await dialog.getByLabel('Schedule',{exact:true}).selectOption('weekdays');
  await dialog.getByText('Mon',{exact:true}).click();
  await dialog.getByText('Thu',{exact:true}).click();
  await dialog.getByLabel('Start date',{exact:true}).fill(date(-10));
  await dialog.getByLabel('Notebook',{exact:true}).selectOption(notebook.id);
  await dialog.getByRole('button',{name:'Save',exact:true}).click();
  await dialog.waitFor({state:'detached'});
  const vitamin=tracker.locator('.tracker-course').filter({hasText:'Vitamin D'});
  await vitamin.waitFor();
  assert.match(await vitamin.locator('.tracker-heading p').textContent(),/^1,?000 units, on Mon and Thu$/);
  const saved=(await api('/trackers?today='+date(0),undefined,'get')).records.find(r=>r.name==='Vitamin D');
  created.push(saved.id);
  assert.deepEqual(saved.weekdays,[0,3]);assert.equal(saved.notebook_id,notebook.id);

  // Validation errors stay in the form.
  await vitamin.getByRole('button',{name:'Edit',exact:true}).click();
  const edit=page.getByRole('dialog',{name:'Edit medicine course',exact:true});await edit.waitFor();
  await edit.getByLabel('End date',{exact:true}).fill(date(-20));
  await edit.getByRole('button',{name:'Save',exact:true}).click();
  await edit.locator('.tracker-form-error',{hasText:'End date must follow the start date'}).waitFor();
  await page.keyboard.press('Escape');await edit.waitFor({state:'detached'});

  // The calculated run-out date reaches the shared calendar.
  const calendar=await api(`/calendar/events?start=${date(-1)}&end=${date(180)}&utc_offset=0`,undefined,'get');
  assert(calendar.events.some(event=>event.source_id===course.id&&event.date_status==='Calculated'));

  for (const theme of ['light','dark']) for (const width of [1280,390]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await card.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme} ${width} overflow`);
    if (evidence) {await mkdir(evidence,{recursive:true});await tracker.screenshot({path:`${evidence}/courses-${width}-${theme}.png`});}
  }
  assert.deepEqual(errors,[]);
  console.log('PASS medicine courses: registry form, conditional fields, card state, log and undo, calendar, both themes and widths');
} finally {
  for (const id of created) await page.request.delete(origin+'/api/v1/trackers/records/'+id);
  await browser.close();
}
