/** Real profile transport plus local voice playback in the restored call screen. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN||'http://127.0.0.1:8985';
const out=process.env.STELLIS_CALL_EVIDENCE||'/tmp/restored-onboarding-real';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.STELLIS_BROWSER,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({permissions:['microphone'],viewport:{width:1440,height:1000},reducedMotion:'reduce',recordVideo:{dir:out,size:{width:1440,height:1000}}});
const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[],events=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.playback={started:0,pending:0};const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){playback.started++;playback.pending++;this.addEventListener('ended',()=>playback.pending--);return start.apply(this,args);};});
page.on('websocket',socket=>socket.on('framereceived',frame=>{if(typeof frame.payload==='string'){try{events.push(JSON.parse(frame.payload));}catch{}}}));
async function profile(){return (await context.request.get(origin+'/api/v1/onboarding/profile')).json();}
async function send(text){await page.getByRole('button',{name:'Send',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.profile-composer button').disabled);const count=await page.locator('.profile-message').count();await page.getByLabel('Message Stellis',{exact:true}).fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();await page.waitForFunction(count=>document.querySelectorAll('.profile-message').length>=count+2,count);await page.waitForFunction(()=>!document.querySelector('.profile-composer button').disabled);}
try{
 const response=await context.request.post(origin+'/api/v1/auth/register',{data:{username:'real-call-'+Date.now(),password:'restored-call-real-synthetic-password'}});assert(response.ok());
 await context.request.put(origin+'/api/v1/onboarding',{data:{uses:[],step:'welcome'}});
 await page.goto(origin+'/onboarding');await page.getByRole('button',{name:'Get started',exact:true}).click();await page.getByRole('button',{name:'Text Stellis',exact:true}).click();
 await send("My name is Maya");assert(!(await profile()).answers.name);
 await send('Yes');assert.equal((await profile()).answers.name,'Maya');
 await page.getByRole('tab',{name:'Notes',exact:true}).click();await page.getByRole('heading',{name:'How do you describe your gender?',exact:true}).waitFor();await page.getByRole('region',{name:'Confirmed notes',exact:true}).getByRole('button',{name:'Edit Name: Maya',exact:true}).waitFor();
 await page.getByRole('button',{name:'End call',exact:true}).click();await page.getByRole('button',{name:'Call again',exact:true}).click();await page.getByRole('button',{name:'Mute',exact:true}).click();
 await page.waitForFunction(()=>window.playback.started>0&&window.playback.pending===0&&document.querySelector('.call-panel').dataset.state==='listening',null,{timeout:90000});
 assert(events.some(event=>event.type==='ready'&&event.voice===true));await page.screenshot({path:out+'/voice-connected.png'});
 await page.getByRole('button',{name:'Minimise call',exact:true}).click();await page.screenshot({path:out+'/voice-compact.png'});await page.getByRole('button',{name:'Expand call',exact:true}).click();await page.getByRole('tab',{name:'Transcript',exact:true}).click();await page.screenshot({path:out+'/transcript.png'});
 await page.getByRole('button',{name:'End call',exact:true}).click();await page.getByText('Call ended',{exact:true}).waitFor();assert.deepEqual(errors,[]);
 await writeFile(out+'/results.json',JSON.stringify({passed:true,real_text_reply:true,confirmation_required:true,confirmed_notes:true,real_voice_ready:true,playback:await page.evaluate(()=>playback),events,errors,limitation:'Microphone capture used Chromium synthetic media; physical microphone and recognition quality are not claimed'},null,2));console.log('PASS real text reply, confirmed notes and drained local voice playback');
}catch(error){await page.screenshot({path:out+'/failure.png'});await writeFile(out+'/failure.json',JSON.stringify({message:error.message,events,errors},null,2));throw error;}
finally{await context.close();await browser.close();}
