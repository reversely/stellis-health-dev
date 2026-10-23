/** Exercise the real call socket against the documented synthetic speech fixture. */
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8784';
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER});
try {
 for(const width of [390,1280]) for(const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.addInitScript(theme=>{
   localStorage.setItem('stellis-theme',theme);
   const NativeSocket=WebSocket;
   window.WebSocket=class extends NativeSocket {constructor(url,...args){super(url,...args);if(String(url).endsWith('/intake/call'))window.testCallSocket=this;}};
   navigator.mediaDevices.getUserMedia=async()=>{const stream=new AudioContext().createMediaStreamDestination().stream;window.testMicTrack=stream.getAudioTracks()[0];return stream;};
  },theme);
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const login=await page.request.post(origin+'/api/v1/auth/login',{data:{username:process.env.STELLIS_TEST_USERNAME,password:process.env.STELLIS_TEST_PASSWORD}});assert.ok(login.ok());
  await page.goto(origin+'/onboarding');await page.getByRole('button',{name:/^(Start|Continue) call$/}).click();
  const status=page.locator('.call-status');await page.waitForFunction(()=>document.querySelector('.call-status')?.textContent==='Listening');
  const before=(await (await page.request.get(origin+'/api/v1/intake')).json()).turns.filter(t=>t.role==='person').length;
  async function speak(level){await page.evaluate(level=>testCallSocket.send(new Int16Array(16000).fill(level).buffer),level);await page.waitForFunction(()=>document.querySelector('.call-status')?.textContent==='Hearing you');await page.getByRole('button',{name:'Done speaking',exact:true}).click();}
  await speak(256);await page.getByText('Please repeat your answer or type it below',{exact:true}).waitFor();
  assert.equal((await (await page.request.get(origin+'/api/v1/intake')).json()).turns.filter(t=>t.role==='person').length,before);
  await speak(1024);await page.waitForFunction(()=>document.querySelector('.call-status')?.textContent==='Listening');
  assert.equal((await (await page.request.get(origin+'/api/v1/intake')).json()).turns.filter(t=>t.role==='person').at(-1).text,'Manage my appointments');
  assert.equal(await page.getByText('Please repeat your answer or type it below',{exact:true}).count(),0);
  await speak(4096);await page.getByText('Type your answer below to continue this call',{exact:true}).waitFor();
  assert.equal(await status.textContent(),'Type your answers below');
  assert.equal(await page.evaluate(()=>testMicTrack.readyState),'ended');
  assert.equal(await page.getByRole('button',{name:'Done speaking',exact:true}).isVisible(),false);
  await page.getByRole('textbox',{name:'Your answer'}).fill('Track <img src=x onerror=alert(1)> appointments');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.call-status')?.textContent==='Type your answers below');
  const deadline=Date.now()+5000;let turns;
  do{turns=(await (await page.request.get(origin+'/api/v1/intake')).json()).turns;if(turns.some(t=>t.text==='Track <img src=x onerror=alert(1)> appointments'))break;await new Promise(r=>setTimeout(r,30));}while(Date.now()<deadline);
  assert.ok(turns.some(t=>t.text==='Track <img src=x onerror=alert(1)> appointments'));
  assert.equal(await page.locator('.call-transcript img').count(),0);
  await page.getByRole('button',{name:'End',exact:true}).click();await page.getByText('Call ended. Press Continue to add your records.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: unclear speech, manual endpoint, recovered voice answer, text fallback and End at 390/1280 in both themes');
}finally{await browser.close();}
