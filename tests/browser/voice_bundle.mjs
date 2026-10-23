/** Owner call-completion and tour flows against the synthetic speech fixture. */
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8784';
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER});
try {
 for(const width of [390,1280]) for(const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.addInitScript(theme=>{localStorage.setItem('stellis-theme',theme);navigator.mediaDevices.getUserMedia=async()=>new AudioContext().createMediaStreamDestination().stream;},theme);
  const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  assert.ok((await page.request.post(origin+'/api/v1/auth/login',{data:{username:process.env.STELLIS_TEST_USERNAME,password:process.env.STELLIS_TEST_PASSWORD}})).ok());
  const counts=async()=> (await page.request.get(origin+'/fixture/counts')).json();
  async function visibleControls() {
   assert.deepEqual(await page.locator('.coach-call').evaluate(panel => [...panel.querySelectorAll('button,input')].filter(el=>el.checkVisibility()).filter(el=>{const r=el.getBoundingClientRect();return r.top<0 || r.bottom>innerHeight+1 || r.left<0 || r.right>innerWidth+1;}).map(el=>el.textContent||el.getAttribute('aria-label'))),[]);
  }
  await page.goto(origin);await page.getByRole('button',{name:'Daily check-in',exact:true}).click();
  let panel=page.locator('.coach-call');await panel.locator('.coach-call-status').getByText('Listening',{exact:true}).waitFor();
  await panel.getByRole('textbox',{name:'Message',exact:true}).fill('Nothing else');await panel.getByRole('button',{name:'Send',exact:true}).click();
  await panel.getByText('Check-in complete',{exact:true}).waitFor();
  await visibleControls();
  const saved=await (await page.request.get(origin+'/api/v1/coach?today=2026-10-23&now=14:00')).json();assert.ok(saved.latest.ended_at);
  await panel.getByRole('button',{name:'Go to My Health',exact:true}).click();
  await page.getByRole('button',{name:'Call Stellis',exact:true}).click();panel=page.locator('.coach-call');
  await panel.locator('.coach-call-status').getByText('Listening',{exact:true}).waitFor();
  await panel.getByRole('textbox',{name:'Message',exact:true}).fill("That's all");await panel.getByRole('button',{name:'Send',exact:true}).click();
  await panel.getByText('Call ended',{exact:true}).waitFor();await panel.getByRole('button',{name:'Close',exact:true}).click();
  const baseline=await counts();
  await page.locator('#library-more summary').click();await page.locator('#take-tour').click();panel=page.locator('.coach-call');
  const steps=['overview','goals','notebooks','record','summary','timeline','recording'];
  for(const [index,step] of steps.entries()) {
   await page.waitForFunction(step=>document.querySelector('.coach-call')?.dataset.step===step,step);
   assert.ok((await panel.locator('.coach-tour-step p').textContent()).length>15);
   const next=panel.getByRole('button',{name:index===6?'Finish tour':'Next',exact:true});
   await next.waitFor();await page.waitForFunction(()=>!document.querySelector('.coach-call-foot button.is-primary')?.disabled);
   assert.equal(await page.locator('.tour-target').count(),1,step+' target');
   await visibleControls();
   if(index===0){
    await panel.getByRole('textbox',{name:'Message',exact:true}).fill('What belongs in a notebook?');await panel.getByRole('button',{name:'Send',exact:true}).click();
    await panel.getByText('You can keep relevant records in a notebook.',{exact:false}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('.coach-call-foot button.is-primary')?.disabled);
   }
   await next.click();
  }
  await panel.getByText('Tour complete',{exact:true}).first().waitFor();await panel.getByRole('button',{name:'Go to My Health',exact:true}).waitFor();
  assert.equal(await page.locator('.tour-target').count(),0);
  const after=await counts();assert.equal(after.model_calls,baseline.model_calls+1,'only the question uses inference');
  await panel.getByRole('button',{name:'Restart tour',exact:true}).click();panel=page.locator('.coach-call');
  await page.waitForFunction(()=>document.querySelector('.coach-call')?.dataset.step==='overview' && !document.querySelector('.coach-call-foot button.is-primary')?.disabled);
  assert.equal((await counts()).synthesis_calls,after.synthesis_calls,'opening narration reuses cached audio');
  await panel.getByRole('button',{name:'End call',exact:true}).click();await panel.getByRole('button',{name:'Close',exact:true}).click();
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: check-in and general-call completion, seven narrated tour stages, question-only inference and cached narration at 390/1280 in both themes');
}finally{await browser.close();}
