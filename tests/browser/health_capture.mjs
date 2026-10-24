/** Exercises saved capture context and review flows against an isolated account. */
import assert from 'node:assert/strict';
import {chmod} from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN||'http://127.0.0.1:8838';
const browser=await chromium.launch({executablePath:process.env.STELLIS_BROWSER,headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce',permissions:['microphone']});
const password='correct horse battery staple';
const api=async(path,data,method='post')=>{const r=await context.request[method](origin+'/api/v1'+path,{data});assert(r.ok(),path+' '+r.status()+' '+await r.text());return r.json();};
let registered=false;let page;
try {
 await api('/auth/register',{username:'capture'+Date.now(),password});registered=true;
 await api('/onboarding',{uses:[],step:'review',agent_choices:{}},'put');await api('/onboarding/complete');
 if(process.env.STELLIS_CAPTURE_STORAGE)await context.storageState({path:process.env.STELLIS_CAPTURE_STORAGE});
 const book=(await api('/health-catalogue/activate',{selections:[{template_id:'nutrition--nutrition'}]})).notebooks[0];
 page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const open=async(action)=>{await page.locator('#global-add').click();const menu=page.getByRole('dialog',{name:'Add',exact:true});await menu.getByRole('button',{name:action,exact:true}).click();return page.getByRole('dialog',{name:action,exact:true});};
 await page.goto(origin+'/notebook/'+book.id);await page.locator('#notebook-health').waitFor({state:'attached'});
 let dialog=await open('Enter Reading');await dialog.getByLabel('Measurement',{exact:true}).waitFor();
 assert.equal(await dialog.getByLabel('Notebook',{exact:true}).inputValue(),book.id);
 await dialog.getByLabel('Measurement',{exact:true}).selectOption('weight');await dialog.getByLabel('Weight (kg)',{exact:true}).fill('72.3');await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.getByText('Reading saved',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.reload();await page.locator('#notebook-health').getByText('Measurements',{exact:true}).waitFor();
 dialog=await open('Add Appointment');await dialog.getByLabel('Title',{exact:true}).fill('Capture follow-up');await dialog.getByLabel('When',{exact:true}).fill('2027-01-02T10:00');await dialog.getByLabel('Status',{exact:true}).selectOption('planned');await dialog.getByRole('button',{name:'Save appointment'}).click();await dialog.getByText('Appointment saved',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.goto(origin);await page.locator('.dashboard-upcoming').getByRole('link',{name:'Capture follow-up'}).click();dialog=page.getByRole('dialog',{name:'Appointment',exact:true});await dialog.getByText('Planned',{exact:true}).waitFor();await page.keyboard.press('Escape');
 dialog=await open('Check-in');await dialog.getByLabel('Notebook',{exact:true}).selectOption(book.id);await dialog.getByLabel('New check-in',{exact:true}).fill('Bring home readings');await dialog.locator('form').getByRole('button').click();await dialog.getByText('Bring home readings',{exact:true}).waitFor();await page.keyboard.press('Escape');
 // Use retained page text to exercise candidate extraction independently of local OCR installation.
 dialog=await open('Take Photo');await dialog.getByLabel('Notebook',{exact:true}).selectOption(book.id);await dialog.getByLabel('Photo type').selectOption('weight');await dialog.getByLabel('Photo',{exact:true}).setInputFiles(process.env.STELLIS_CAPTURE_IMAGE||'/tmp/stellis-device.png');
 const uploadResponse=page.waitForResponse(r=>r.url().endsWith('/api/v1/documents')&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Read photo',exact:true}).click();const upload=await (await uploadResponse).json();
 await dialog.getByLabel('Value',{exact:true}).waitFor();
 let data=await api('/readings',undefined,'get');assert.equal(data.measures.find(m=>m.key==='weight').points.length,1);
 await dialog.getByLabel('Value',{exact:true}).fill('180');await dialog.getByLabel('Unit',{exact:true}).selectOption('lb');await dialog.getByRole('button',{name:'Save reading',exact:true}).click();await dialog.getByText('Reading saved',{exact:true}).waitFor();await page.keyboard.press('Escape');
 data=await api('/readings',undefined,'get');const photo=data.measures.find(m=>m.key==='weight').points.find(p=>p.document_id);assert.equal(photo.value,81.6);assert.equal(photo.notebook_id,book.id);assert.equal(photo.document_id,upload.document.id);
 const doc=await api('/documents/'+upload.document.id,undefined,'get');await api('/documents/'+doc.id+'/pages/1',{text:'180 lb',revision:doc.pages[0].revision},'patch');
 const extracted=await api('/photo-readings/'+doc.id+'/extract?measure=weight');assert.equal(extracted.candidates[0].value,180);
 dialog=await open('Take Photo');await dialog.getByLabel('Notebook',{exact:true}).selectOption(book.id);await dialog.getByLabel('Photo type').selectOption('weight');await dialog.getByLabel('Photo',{exact:true}).setInputFiles(process.env.STELLIS_CAPTURE_IMAGE||'/tmp/stellis-device.png');await dialog.getByRole('button',{name:'Read photo',exact:true}).click();await dialog.getByText('Review the reading before saving',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('Value',{exact:true}).inputValue(),'180');await dialog.getByLabel('Value',{exact:true}).fill('181');await dialog.getByRole('button',{name:'Save reading',exact:true}).click();await dialog.getByText('Reading saved',{exact:true}).waitFor();await page.keyboard.press('Escape');
 // An unsupported file stays recoverable; uploaded medical photos use the document service.
 dialog=await open('Upload Record');await dialog.getByLabel('Record',{exact:true}).setInputFiles(process.env.STELLIS_CAPTURE_IMAGE||'/tmp/stellis-device.png');await dialog.getByRole('button',{name:'Upload record',exact:true}).click();await dialog.getByText(/Record (saved|already uploaded)/).waitFor();await page.keyboard.press('Escape');
 await page.goto(origin+'/chat');await page.locator('.agent-composer-context select').selectOption(book.id);
 const chatAdd=page.locator('.agent-composer-actions').getByRole('button',{name:'Add',exact:true});await chatAdd.click();
 await page.getByRole('dialog',{name:'Add',exact:true}).getByRole('button',{name:'Enter Reading',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Enter Reading',exact:true});await dialog.getByLabel('Notebook',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('Notebook',{exact:true}).inputValue(),book.id);
 await page.keyboard.press('Escape');assert.equal(await chatAdd.evaluate(e=>e===document.activeElement),true);
 for(const theme of ['light','dark']) {
  await page.evaluate(t=>localStorage.setItem('stellis-theme',t),theme);
  for(const width of [360,390,768,1024,1280,1920]) {
   await page.setViewportSize({width,height:900});await page.goto(origin+'/notebook/'+book.id);
   await page.locator('#global-add').focus();await page.keyboard.press('Enter');
   dialog=page.getByRole('dialog',{name:'Add',exact:true});await dialog.waitFor();
   assert.deepEqual(await dialog.locator('.capture-choices button').allTextContents(),['Log Items','Take Photo','Enter Reading','Upload Record','Record Visit','Add Appointment','Check-in']);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#global-add').evaluate(e=>e===document.activeElement),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,theme+' '+width);
   for(const action of ['Take Photo','Enter Reading','Upload Record','Add Appointment','Check-in']){dialog=await open(action);await dialog.getByLabel('Notebook',{exact:true}).waitFor();await page.screenshot({path:`/tmp/stellis-capture-${theme}-${width}-${action.replaceAll(' ','-')}.png`});await page.keyboard.press('Escape');}
  }
 }
 await page.goto(origin+'/notebook/'+book.id);dialog=await open('Record Visit');await page.locator('#stop-recording:enabled').waitFor({timeout:20000});
 await page.waitForFunction(name=>document.querySelector('#recording-notebook-name').textContent===name,book.name);await page.waitForFunction(()=>document.querySelector('#recording-timer').textContent!=='0:00');
 const finalize=page.waitForResponse(r=>r.url().includes('/finalize')&&r.request().method()==='POST');
 await page.locator('#stop-recording').click();const finished=await finalize;assert(finished.ok(),await finished.text());
 const recording=(await finished.json()).conversation;assert.equal(recording.notebook_id,book.id);
 await page.waitForURL('**/conversation/'+recording.id);
 if(process.env.STELLIS_CAPTURE_STORAGE){await context.storageState({path:process.env.STELLIS_CAPTURE_STORAGE});await chmod(process.env.STELLIS_CAPTURE_STORAGE,0o600);}
 assert.deepEqual(errors,[]);console.log('PASS global capture: manual/photo review, source retention, notebook context, appointments, check-ins, upload, chat, recording and responsive keyboard flows');
} catch(error) {if(page){await page.screenshot({path:'/tmp/stellis-capture-failure.png'});console.error(await page.locator('body').innerText());}throw error;
} finally {
 if(registered&&!process.env.STELLIS_CAPTURE_STORAGE)await context.request.delete(origin+'/api/v1/account',{data:{password,confirm:'DELETE'}});
 await browser.close();
}
