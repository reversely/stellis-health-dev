/** Verify shared calendar use across overlapping cycles and the appointment agenda. */
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8860';
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER});
const page=await browser.newPage({viewport:{width:1280,height:1000},...(process.env.STELLIS_TEST_STORAGE?{storageState:process.env.STELLIS_TEST_STORAGE}:{})});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
try {
  await page.route('**/api/v1/health/preferences',route=>route.fulfill({json:{experiences_periods:false}}));
  await page.goto(origin);
  await page.locator('.health-calendar-month .calendar-month').waitFor();
  await page.waitForFunction(()=>document.querySelector('.health-calendar-status')?.textContent==='');
  assert.equal(await page.locator('.calendar-month:visible').count(),1);
  assert.equal(await page.locator('#calendar-card').isVisible(),false);
  assert.equal(await page.locator('.dashboard-reproductive').isVisible(),false);
  await page.evaluate(()=>{
    document.querySelector('#dashboard-tools').open=false;
    const records=[
      {id:'treatment',trackId:'treatment-cycle',startDate:'2026-01-20',endDate:'2026-01-25',label:'Treatment course'},
      {id:'recovery',trackId:'recovery-cycle',startDate:'2026-01-23',endDate:'2026-01-28',label:'Recovery observations'},
      {id:'visit',trackId:'appointments',startDate:'2026-01-24',label:'Follow-up appointment'},
    ];
    const calendar=window.StellisCalendarView.createMonth({month:'2026-01',today:'2026-01-24',label:'Shared calendar fixture',
      tracks:[{id:'treatment-cycle',label:'Treatment',color:'var(--ink)'},{id:'recovery-cycle',label:'Recovery',color:'var(--muted)'},{id:'appointments',label:'Appointments',color:'var(--focus)'}],events:records,
      onSelectDate:selection=>{window.calendarTestSelection=selection;}});
    window.calendarTestView=calendar;
    document.querySelector('.health-calendar-month').replaceChildren(calendar.element);
  });
  const calendar=page.getByRole('region',{name:'Shared calendar fixture',exact:true});
  const overlap=calendar.locator('[data-date="2026-01-24"]');
  assert.equal(await overlap.locator('.calendar-month-markers > span').count(),3);
  const label=await overlap.getAttribute('aria-label');
  assert(label.includes('Treatment course')&&label.includes('Recovery observations')&&label.includes('Follow-up appointment'));
  await overlap.click();
  assert.deepEqual(await page.evaluate(()=>window.calendarTestSelection.events.map(event=>event.id)),['treatment','recovery','visit']);
  await overlap.focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2026-01-25');
  await page.evaluate(()=>window.calendarTestView.updateEvents([{id:'updated',trackId:'recovery-cycle',startDate:'2026-01-25',label:'Updated recovery entry'}]));
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2026-01-25');
  assert((await calendar.locator('[data-date="2026-01-25"]').getAttribute('aria-label')).includes('Updated recovery entry'));
  await page.keyboard.press('PageDown');
  assert.equal(await calendar.locator('h4').innerText(),'February 2026');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.date),'2026-02-01');
  for(const width of [360,768,1024,1280,1920]) {
    await page.setViewportSize({width,height:1000});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  assert.deepEqual(errors,[]);
  console.log('Unified calendar visibility, overlapping cycle tracks, event selection and calendar keyboard navigation passed');
}finally {await browser.close();}
