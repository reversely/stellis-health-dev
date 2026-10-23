/** Record Maya's first setup through real text transport and confirmed UI writes. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8842';
const out=process.env.STELLIS_MAYA_EVIDENCE || '/tmp/stellis-maya-onboarding';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER});
const context=await browser.newContext({viewport:{width:1280,height:1000},recordVideo:{dir:out,size:{width:1280,height:1000}}});
const page=await context.newPage(),errors=[],checks=[];
page.setDefaultTimeout(20000);
const password='maya-synthetic-validation-only'; let registered=false;
const pace=Number(process.env.STELLIS_MAYA_PACE_MS || 450);
await page.addInitScript(()=>{
 window.mayaEvents=[]; window.mayaAudioContexts=[]; const Audio=window.AudioContext;
 window.AudioContext=class extends Audio {constructor(...args){super(...args);window.mayaAudioContexts.push(this);}};
 const WS=window.WebSocket;
 window.WebSocket=class extends WS {
  constructor(...args){super(...args);const path=String(args[0]);this.addEventListener('message',event=>{if(typeof event.data==='string'){try{window.mayaEvents.push({at:Date.now(),path,direction:'received',...JSON.parse(event.data)})}catch{}}});}
  send(data){if(typeof data==='string'){try{const item=JSON.parse(data);if(item.type==='text')window.mayaEvents.push({at:Date.now(),path:this.url,direction:'sent',...item});}catch{}}return super.send(data);}
 };
});
const received=[];
page.on('websocket',socket=>socket.on('framereceived',frame=>{if(typeof frame.payload==='string'){try{received.push({at:new Date().toISOString(),path:new URL(socket.url()).pathname,...JSON.parse(frame.payload)})}catch{}}}));
page.on('pageerror',e=>errors.push(e.message));
async function pause(){await page.waitForTimeout(pace);}
async function profile(){return (await context.request.get(origin+'/api/v1/onboarding/profile')).json();}
async function heading(name){await page.getByRole('heading',{name,exact:true}).waitFor();await page.getByRole('button',{name:'Send',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.profile-composer button')?.disabled);}
async function send(text){
 const input=page.getByRole('textbox',{name:'Message Stellis',exact:true});
 await input.scrollIntoViewIfNeeded();await input.pressSequentially(text,{delay:12});await pause();
 const before=await page.locator('.profile-message').count();
 await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.waitForFunction(count=>document.querySelectorAll('.profile-message').length>=count+2,before);
 await page.waitForFunction(()=>!document.querySelector('.profile-composer button')?.disabled || document.querySelector('.profile-body h1')?.textContent === "You're all set");
 const latest=await page.locator('.profile-message').last().innerText();
 await page.waitForTimeout(Math.min(5000,Math.max(pace,latest.length*18)));
}
async function answer(field,text,nextQuestion){
 await send(text);let state=await profile();checks.push({check:field+' stays unconfirmed',pass:state.answers[field]==null});assert(state.answers[field]==null);
 await send('Yes');await heading(nextQuestion);
}
try {
 const r=await context.request.post(origin+'/api/v1/auth/register',{data:{username:'maya-story-'+Date.now(),password}});assert(r.ok());registered=true;
 await page.goto(origin+'/onboarding');await pause();
 await page.getByRole('button',{name:'Get started',exact:true}).click();
 await page.getByRole('heading',{name:'First, what should I call you?',exact:true}).waitFor();
 await page.getByRole('button',{name:'Text Stellis',exact:true}).click();await heading('First, what should I call you?');
 await send("Hi, I'm Maia");assert.equal(await page.locator('.profile-answer').inputValue(),'Maia');
 await send('No');await send('My name is Maya');await send('Yes');await heading('How do you describe your gender?');
 assert.equal((await profile()).answers.name,'Maya');checks.push({check:'Corrected name only saved after Yes',pass:true});
 await answer('gender',"I'm a woman",'Do you have a period?');
 await answer('period','Yes','When is your birth date?');
 await answer('birth_date','March 14, 1993','Do you have any preexisting health conditions?');
 await send("I'm not sure what counts?");assert.equal((await profile()).step,'conditions');
 await answer('conditions','None that I know of','Do you take any medicines or supplements?');
 await send('What counts as medicine?');assert.equal((await profile()).step,'medicines');
 await page.locator('.profile-library > summary').click();await page.getByLabel('Search health library',{exact:true}).fill('ferrous');
 await page.locator('.intake-library-item').first().waitFor();await pause();
 // At Maya's January 2022 intake, treatment has not yet been prescribed.
 await page.locator('.profile-library > summary').click();
 await answer('medicines',"I'm not taking any medicines right now",'What health goals would you like help navigating?');
 for(const text of ['What do you usually offer?','Can you give examples?','Give me a moment','What options are there?']){await send(text);assert.equal((await profile()).step,'goals');}
 const draft=page.getByRole('textbox',{name:'Message Stellis',exact:true});
 await draft.fill('I am still thinking about my goals'); await page.waitForTimeout(1200);
 assert.equal(await draft.inputValue(),'I am still thinking about my goals'); assert.equal((await profile()).step,'goals');
 await draft.fill('');
 checks.push({check:'Four clarifications and an unsent draft pause do not advance or end setup',pass:true});
 await send('I want to track my periods, understand fatigue, and improve my nutrition and movement');
 await page.locator('.profile-answer').fill('Track menstrual health\nUnderstand fatigue and preventive care\nImprove nutrition and movement');
 await page.getByRole('button',{name:'Continue',exact:true}).click();await heading('Which other areas interest you?');
 await answer('interests','Nutrition, general wellness and movement','Are you interested in cycle tracking?');
 await send('Yes');await send('Yes');
 await page.getByRole('heading',{name:"You're all set",exact:true}).waitFor();
 await page.getByRole('button',{name:'Review notebooks',exact:true}).waitFor();
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(button=>button.textContent==='Review notebooks')?.disabled);
 assert(received.some(event=>event.type==='say'&&event.text.includes('Goodbye')&&event.text.includes('Review notebooks')));
 assert(received.some(event=>event.type==='ended'));
 await page.waitForFunction(()=>window.mayaAudioContexts.length>0&&window.mayaAudioContexts.every(context=>context.state==='closed')); 
 checks.push({check:'Reason and next action with goodbye before completion',pass:true});
 await pause();const saved=await profile();
 const prefs=await(await context.request.get(origin+'/api/v1/health/preferences')).json();assert.equal(prefs.experiences_periods,true);
 assert.equal((await(await context.request.get(origin+'/api/v1/reproductive')).json()).records.length,0);
 assert.equal((await(await context.request.get(origin+'/api/v1/notebooks')).json()).notebooks.length,0);
 await page.getByRole('button',{name:'Review notebooks',exact:true}).click();
 await page.getByRole('heading',{name:'Review your notebooks',exact:true}).waitFor();
 const finish=page.getByRole('button',{name:/Set up \d+ notebooks?/});await finish.waitFor();
 await pause();await page.screenshot({path:out+'/notebook-review.png',fullPage:true});
 await finish.scrollIntoViewIfNeeded();await pause();await finish.click();await page.waitForURL(url=>url.pathname==='/');
 await page.waitForTimeout(1200);
 const books=(await(await context.request.get(origin+'/api/v1/notebooks')).json()).notebooks;
 assert(books.some(book=>book.name==='Nutrition'));assert(books.some(book=>book.name==='Menstrual Health'));
 await page.reload();await page.waitForTimeout(1200);
 assert.equal((await(await context.request.get(origin+'/api/v1/notebooks')).json()).notebooks.length,books.length);
 checks.push({check:'Explicit notebook creation and reload preserve selection',pass:true});
 assert.deepEqual(errors,[]);
 assert.deepEqual(received.filter(event=>event.type==='error'),[]);
 await writeFile(out+'/onboarding-results.json',JSON.stringify({scope:'Synthetic Maya at January 2022 intake, before iron treatment or later fertility/pregnancy outcomes',origin,profile:saved,preferences:prefs,notebooks:books,checks,errors},null,2));
 await writeFile(out+'/transcript.json',JSON.stringify(received,null,2));
 await writeFile(out+'/transcript.md','# Maya onboarding transcript\n\n'+received.filter(event=>['say','heard'].includes(event.type)).map(event=>`**${event.type==='say'?'Stellis':'Maya'}:** ${event.text}\n`).join('\n'));
 // Optional session file is restricted and kept outside the shareable evidence folder.
 if(process.env.STELLIS_TEST_STORAGE){await context.storageState({path:process.env.STELLIS_TEST_STORAGE});const{chmod}=await import('node:fs/promises');await chmod(process.env.STELLIS_TEST_STORAGE,0o600);}
 console.log('PASS Maya text onboarding, corrections, clarifications, pause, handoff and notebook persistence');
}catch(error){await page.screenshot({path:out+'/failure.png',fullPage:true});await writeFile(out+'/failure.json',JSON.stringify({message:error.message,events:received,errors},null,2));throw error;}
finally {
 if(registered&&!process.env.STELLIS_TEST_KEEP_ACCOUNT)await context.request.delete(origin+'/api/v1/account',{data:{password,confirm:'DELETE'}});
 const video=page.video();await context.close();await video.saveAs(out+'/onboarding.webm');await browser.close();
}
