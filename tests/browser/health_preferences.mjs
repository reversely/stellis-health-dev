/** Verify onboarding and Settings control tracking while preserving the one calendar. */
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8860';
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER});
const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce',...(process.env.STELLIS_TEST_STORAGE?{storageState:process.env.STELLIS_TEST_STORAGE}:{})});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const request=page.request;
const preferenceUrl=origin+'/api/v1/health/preferences';
const original=(await (await request.get(preferenceUrl)).json()).experiences_periods;
const date=offset=>{const value=new Date();value.setDate(value.getDate()+offset);return value.toISOString().slice(0,10);};
const calendarQuery='?start='+date(-7)+'&end='+date(7);
const created=await request.post(origin+'/api/v1/reproductive/period',{data:{start:date(-3),end:date(-1),flow:'Light'}});
assert(created.ok());const fixture=await created.json();
const artifact=process.env.STELLIS_TEST_SCREENSHOTS;
const layoutAudit=process.env.STELLIS_TEST_LAYOUT_AUDIT?(await import(process.env.STELLIS_TEST_LAYOUT_AUDIT)).audit:null;
const results=[];
async function capture(state,selector) {
 if(!artifact)return;
 for(const theme of ['light','dark'])for(const width of [360,390,768,1024,1280,1440,1920]) {
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});await page.locator(selector).evaluate(element=>element.scrollIntoView({block:'start'}));await page.waitForTimeout(500);
  if(layoutAudit)results.push({state,theme,width,...await page.evaluate(layoutAudit,{centerSelectors:[],ignoreSelectors:['#compact-nav','#rail-shader'],isNarrow:width<768})});
  await page.locator(selector).screenshot({path:`${artifact}/${state}-${theme}-${width}.png`});
 }
}
async function settingsChoice(value) {
 await page.goto(origin+'/settings');await page.getByLabel('Do you experience periods?',{exact:true}).waitFor();
 await page.getByLabel('Do you experience periods?',{exact:true}).selectOption(value);
 await page.getByRole('button',{name:'Save health preferences',exact:true}).click();
 await page.getByText('Health preferences saved',{exact:true}).waitFor();
 assert(await page.getByText('Health preferences saved',{exact:true}).evaluate(element=>element.classList.contains('success')));
}
try {
 await request.put(preferenceUrl,{data:{experiences_periods:null}});
 await page.route('**/api/v1/calendar/events?*',async route=>{
  const response=await route.fetch();const result=await response.json();
  result.events.push({id:'appointment:fixture',kind:'appointment',track_id:'appointments',title:'Example appointment',start_date:date(0),end_date:date(0),all_day:true,appointment:{id:'fixture',provider:'google',title:'Example appointment',start:date(0),end:date(1),all_day:true}});
  result.tracks=[...(result.tracks||[]),{id:'appointments',label:'Appointments',tone:'default'}];await route.fulfill({json:result});
 });
 await page.goto(origin);await page.locator('.health-calendar-month .calendar-month').waitFor();
 await page.locator('.dashboard-reproductive .tracker-panel').waitFor();
 assert.equal(await page.locator('.dashboard-reproductive [role=tab]').filter({hasText:'Cycle'}).count(),0);
 assert.equal(await page.locator('.calendar-month:visible').count(),1);
 await settingsChoice('yes');
 await capture('health-settings','section[aria-labelledby="settings-health-title"]');
 await page.goto(origin);await page.locator('.dashboard-reproductive .tracker-tab').first().waitFor();await page.locator('.health-calendar-month .calendar-month').waitFor();
 assert.equal(await page.locator('.calendar-month:visible').count(),1);
 await page.getByRole('button',{name:'Log period',exact:true}).waitFor();
 const enabledFeed=await (await request.get(origin+'/api/v1/calendar/events'+calendarQuery)).json();
 assert(enabledFeed.events.some(event=>event.source_id===fixture.id&&event.source_type==='reproductive'));
 await page.locator(`.dashboard-calendar [data-date="${date(-3)}"]`).click();
 await page.locator('.health-calendar-event').filter({hasText:'Light flow'}).click();
 await page.getByRole('dialog',{name:'Edit period',exact:true}).waitFor();
 assert.equal(await page.getByRole('dialog').getByLabel('Period start',{exact:true}).inputValue(),date(-3));
 await page.keyboard.press('Escape');

 await settingsChoice('no');await page.reload();
 assert.equal(await page.getByLabel('Do you experience periods?',{exact:true}).inputValue(),'no');
 await page.goto(origin);await page.locator('.health-calendar-month .calendar-month').waitFor();
 await page.locator('.dashboard-reproductive .tracker-panel').waitFor();
 assert.equal(await page.locator('.dashboard-reproductive [role=tab]').filter({hasText:'Cycle'}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Log period',exact:true}).count(),0);
 assert.equal(await page.locator('.calendar-month:visible').count(),1);
 await page.locator('.health-calendar-event').filter({hasText:'Example appointment'}).waitFor();
 await page.getByRole('button',{name:'Next month',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.health-calendar-status')?.textContent==='');
 assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Next month');
 await page.getByRole('button',{name:'Previous month',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.health-calendar-status')?.textContent==='');
 await page.locator(`.dashboard-calendar [data-date="${date(0)}"]`).click();
 await capture('calendar-no-periods','.dashboard-calendar');
 const saved=(await (await request.get(origin+'/api/v1/reproductive')).json()).records;
 assert(saved.some(record=>record.id===fixture.id));
 // Read appointment and period projections from the same backend date-range API.
 const calendar=await request.get(origin+'/api/v1/calendar/events'+calendarQuery);
 assert.equal((await calendar.json()).events.some(event=>event.kind==='period'),false);
 await request.post(origin+'/api/v1/onboarding/reopen');
 await request.put(origin+'/api/v1/onboarding/profile',{data:{field:'name',value:null}});
 await request.put(origin+'/api/v1/onboarding',{data:{uses:[],step:'welcome'}});
 await page.goto(origin+'/onboarding');await page.getByRole('button',{name:'Get started',exact:true}).click();
 await page.getByRole('heading',{name:'How do you describe your gender?',exact:true}).waitFor();
 await page.getByRole('button',{name:'Skip',exact:true}).click();
 await page.getByRole('heading',{name:'Do you have a period?',exact:true}).waitFor();
 assert.equal(await page.locator('.profile-answer').inputValue(),'No');
 await capture('onboarding-health-preferences','#setup-main');
 await page.getByRole('button',{name:'Yes',exact:true}).click();
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('heading',{name:'When is your birth date?',exact:true}).waitFor();
 assert.equal((await (await request.get(preferenceUrl)).json()).experiences_periods,true);
 await page.goto(origin);await page.locator('.dashboard-reproductive .tracker-tab').first().waitFor();await page.locator('.health-calendar-month .calendar-month').waitFor();
 assert.equal(await page.locator('.calendar-month:visible').count(),1);
 await capture('calendar-with-periods','.dashboard-calendar');
 assert.deepEqual(errors,[]);
 if(artifact&&layoutAudit) {
  const {writeFile}=await import('node:fs/promises');await writeFile(artifact+'/health-preferences-layout.json',JSON.stringify(results,null,2));
  assert.deepEqual(results.flatMap(result=>result.findings.filter(finding=>finding.level==='fail').map(finding=>({state:result.state,width:result.width,...finding}))),[]);
 }
 console.log('Settings and onboarding persistence, one calendar with tracking enabled or disabled, and record retention passed');
}finally {
 await request.delete(origin+'/api/v1/reproductive/'+fixture.id);
 await request.put(preferenceUrl,{data:{experiences_periods:original}});
 await browser.close();
}
