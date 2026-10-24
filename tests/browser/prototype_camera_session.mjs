/** Controlled-signal adapter checks, never used by the demo recording. */
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_DASH_PREVIEW_ORIGIN||'http://127.0.0.1:8857';
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER||'/usr/bin/google-chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['camera']});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const productionWrites=[];
page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/v1/readings'))productionWrites.push(r.url())});
try {
 await page.addInitScript(()=>{
  const now=performance.now.bind(performance);window.captureClockOffset=0;performance.now=()=>now()+window.captureClockOffset;
  window.captureStreams=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async (...args)=>{const stream=await original(...args);window.captureStreams.push(stream);return stream};
 });
 await page.route('**/vendor/vitallens/vitallens.browser.js',route=>route.fulfill({contentType:'text/javascript',body:`export class VitalLens {
  listeners={};addEventListener(n,cb){this.listeners[n]=cb;}
  async setVideoStream(stream,video){video.srcObject=stream;await video.play();}
  startVideoStream(){this.timer=setTimeout(()=>{for(let i=0;i<200;i++){window.captureClockOffset+=250;this.listeners.vitals({face:{coordinates:[[100,40,500,440]]},waveforms:{ppg_waveform:{data:[0,1,0]}},vitals:{heart_rate:{value:70}}});}},20);}
  stopVideoStream(){clearTimeout(this.timer);}async close(){}
 }`}));
 await page.goto(origin);await page.locator('.preview-category').filter({hasText:/^Vital signs$/}).click();
 await page.evaluate(()=>{window.StellisVitalsMath.heartRateVariability=()=>({rmssd:42,sure:true});window.StellisVitalsMath.breathingRate=()=>({rate:14,sure:true})});
 await page.getByRole('button',{name:'Open camera test',exact:true}).click();await page.getByRole('button',{name:'Start',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).waitFor();
 assert.equal(await page.locator('.pulse-usual').innerText(),'','no comparison with a fictional baseline');
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('.pulse-dialog').waitFor({state:'detached'});
 const results=page.locator('#preview-live-results');await results.getByText('70 bpm',{exact:true}).waitFor();await results.getByText('14 breaths/min',{exact:true}).waitFor();await results.getByText('42 ms',{exact:true}).waitFor();
 assert.deepEqual(productionWrites,[],'camera testing must not write a real account or fictional source history');
 assert(await page.evaluate(()=>captureStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
 await page.getByRole('button',{name:"Maya's timeline",exact:true}).click();await page.getByRole('button',{name:'Reset Maya demo',exact:true}).click();
 await page.locator('.preview-category').filter({hasText:/^Vital signs$/}).click();await results.getByText('70 bpm',{exact:true}).waitFor();
 await page.reload();await page.locator('.preview-category').filter({hasText:/^Vital signs$/}).click();await results.getByText('70 bpm',{exact:true}).waitFor();
 assert.equal(await page.locator('.preview-card').first().locator('.preview-value').innerText(),'72','Maya source value must not become the camera test value');
 await page.getByRole('button',{name:'Clear camera test results',exact:true}).click();await results.getByText('No camera readings yet',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS controlled camera adapter: review/save, three estimates, no production writes or fictional comparison, track cleanup, separate reset/reload and clear');
}finally{await browser.close()}
