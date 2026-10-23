import assert from 'node:assert/strict';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN||'http://127.0.0.1:8860';
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER});
const page=await browser.newPage({reducedMotion:'reduce'});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const today=new Date().toLocaleDateString('en-CA');
const api='/api/v1';
const original=await (await page.request.get(origin+api+'/health/preferences')).json();
const observations=await (await page.request.get(origin+api+'/health/observations')).json();
assert.equal(observations.observations.length,0,'Use an isolated workspace');
let pack;
try {
  await page.request.put(origin+api+'/health/preferences',{data:{experiences_periods:true}});
  pack=await (await page.request.post(origin+api+'/reproductive/pill',{data:{name:'Daily prescribed pill',start:today,active:21,break_days:7,time:'09:00'}})).json();
  await page.goto(origin);
  const daily=page.locator('.tracker-daily');await daily.waitFor();
  const circles=daily.locator('[data-log-day]');
  const selectedDays=await circles.evaluateAll(nodes=>nodes.slice(0,3).map(node=>node.dataset.logDay));
  // Separate days remain tappable while earlier writes are in flight.
  await circles.nth(0).click();await circles.nth(1).click();await circles.nth(2).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-log-day][aria-pressed="true"][aria-busy="false"]').length===3);
  await page.reload();await daily.waitFor();
  await daily.locator('[data-log-day][aria-pressed="true"]').nth(2).waitFor();
  assert.equal(await daily.locator('[data-log-day][aria-pressed="true"]').count(),3);
  await daily.screenshot({path:'/tmp/stellis-period-selected.png'});
  for(const day of selectedDays){
    const circle=daily.locator(`[data-log-day="${day}"]`);await circle.click();
    await page.waitForFunction(day=>document.querySelector(`[data-log-day="${day}"]`)?.getAttribute('aria-busy')==='false',day);
  }
  assert.equal(await daily.locator('[data-log-day][aria-pressed="true"]').count(),0);
  await page.route('**/api/v1/health/observations',route=>route.request().method()==='PUT'
    ?route.fulfill({status:503,json:{detail:'Try again'}}):route.continue());
  await circles.nth(0).click();
  await page.getByRole('status').filter({hasText:'Try again'}).waitFor();
  assert.equal(await circles.nth(0).getAttribute('aria-pressed'),'false');
  await page.unroute('**/api/v1/health/observations');
  await daily.getByRole('button',{name:'Light',exact:true}).click();
  await daily.locator('.tracker-daily-logged').getByText('Light',{exact:true}).waitFor();
  await daily.getByRole('button',{name:'Taken',exact:true}).click();
  await daily.getByText('All logged for this day').waitFor();
  await page.reload();await daily.getByText('Logged (2)',{exact:true}).waitFor();
  await daily.locator('summary').click();
  await daily.locator('article').filter({hasText:'Period flow'}).getByRole('button',{name:'Undo'}).click();
  await daily.getByRole('button',{name:'Light',exact:true}).waitFor();
  for(const theme of ['light','dark'])for(const width of [360,768,1024,1280,1920]){
    await page.setViewportSize({width,height:1000});
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await daily.scrollIntoViewIfNeeded();await page.waitForTimeout(500);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(process.env.STELLIS_TEST_LAYOUT_AUDIT){
    const {audit}=await import(process.env.STELLIS_TEST_LAYOUT_AUDIT);
    const findings=await page.evaluate(audit,{centerSelectors:[],ignoreSelectors:['#compact-nav','#rail-shader'],isNarrow:width<768});
    assert.equal(findings.findings.filter(item=>item.level==='fail').length,0,JSON.stringify(findings));
    }
    await daily.screenshot({path:`/tmp/stellis-today-${theme}-${width}.png`});
  }
  assert.deepEqual(errors,[]);
  console.log('Daily logging, pill confirmation, persistence, undo and ten responsive theme checks passed');
}finally{
  for(let offset=0;offset<7;offset++){
    const day=new Date();day.setDate(day.getDate()-offset);
    await page.request.put(origin+api+'/health/observations',{data:{day:day.toLocaleDateString('en-CA'),track_id:'periods',value:null}});
  }
  if(pack?.id)await page.request.delete(origin+api+'/reproductive/'+pack.id);
  await page.request.put(origin+api+'/health/preferences',{data:original});
  await browser.close();
}
