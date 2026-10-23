/** Restored call controls retain confirmed answers and the notes/transcript layout. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {PAGE_AUDIT} from './maya_layout_geometry.mjs';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN||'http://127.0.0.1:8984';
assert.equal(process.env.STELLIS_TEST_DISPOSABLE,'1');
const out=process.env.STELLIS_CALL_EVIDENCE||'/tmp/restored-onboarding-call';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.STELLIS_BROWSER,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});const page=await context.newPage();page.setDefaultTimeout(15000);
const errors=[],layouts=[];page.on('pageerror',e=>errors.push(e.message));
try{
 const registered=await context.request.post(origin+'/api/v1/auth/register',{data:{username:'restored-call-'+Date.now(),password:'restored-call-synthetic-password'}});assert(registered.ok());
 const profile=await (await context.request.get(origin+'/api/v1/onboarding/profile')).json();
 for(const field of profile.fields)await context.request.put(origin+'/api/v1/onboarding/profile',{data:{field:field.id,value:null}});
 await context.request.put(origin+'/api/v1/onboarding',{data:{uses:[],step:'welcome'}});
 await page.goto(origin+'/onboarding');await page.getByRole('button',{name:'Get started',exact:true}).click();await page.getByRole('button',{name:'Start call',exact:true}).waitFor();
 await page.evaluate(()=>{
  window.callProbe={starts:[],commands:[],callback:null};
  StellisIntakeCall.start=(callback,options)=>{callProbe.starts.push(options);callProbe.callback=callback;return Object.fromEntries(['setMuted','setSpeaker','finishAnswer','retryReply','sendText','end'].map(name=>[name,(...args)=>callProbe.commands.push({name,args})]));};
 });
 await page.getByRole('button',{name:'Start call',exact:true}).click();assert.equal(await page.evaluate(()=>callProbe.starts[0].listen),true);
 await page.evaluate(()=>{callProbe.callback({type:'ready',voice:true});callProbe.callback({type:'state',state:'listening'});});
 await page.locator('.call-timer').waitFor();await page.getByRole('button',{name:'Mute',exact:true}).click();await page.getByRole('button',{name:'Speaker',exact:true}).click();
 await page.evaluate(()=>callProbe.callback({type:'state',state:'hearing'}));await page.getByRole('button',{name:'Mute',exact:true}).click();await page.evaluate(()=>callProbe.callback({type:'state',state:'hearing'}));await page.getByRole('button',{name:'Done speaking',exact:true}).click();
 await page.evaluate(()=>{callProbe.callback({type:'say',text:'First, what should I call you?'});callProbe.callback({type:'heard',text:'Maya'});callProbe.callback({type:'action',action:'profile_answer',field:'name',value:'Maya'});callProbe.callback({type:'state',state:'listening'});});
 assert.equal(await page.getByLabel('First, what should I call you?',{exact:true}).inputValue(),'Maya');
 let state=await (await context.request.get(origin+'/api/v1/onboarding/profile')).json();assert(!state.answers.name);
 await page.getByRole('button',{name:'Minimise call',exact:true}).click();assert(await page.locator('.setup-call').evaluate(n=>n.classList.contains('is-minimised')));await page.getByRole('button',{name:'Expand call',exact:true}).click();
 await page.getByRole('tab',{name:'Transcript',exact:true}).click();assert(await page.getByRole('tabpanel',{name:'Transcript',exact:true}).getByText('Maya',{exact:true}).isVisible());
 await page.getByRole('tab',{name:'Notes',exact:true}).click();await page.getByRole('button',{name:'Yes, continue',exact:true}).click();await page.getByRole('heading',{name:'How do you describe your gender?',exact:true}).waitFor();
 state=await (await context.request.get(origin+'/api/v1/onboarding/profile')).json();assert.equal(state.answers.name,'Maya');assert(await page.getByRole('region',{name:'Confirmed notes',exact:true}).getByRole('button',{name:'Edit Name: Maya',exact:true}).isVisible());assert.equal(await page.evaluate(()=>callProbe.starts.at(-1).listen),true);
 await page.getByRole('button',{name:'End call',exact:true}).click();await page.getByRole('button',{name:'Call again',exact:true}).waitFor();assert(await page.getByText('Call ended',{exact:true}).isVisible());
 await page.getByRole('button',{name:'Call again',exact:true}).click();await page.evaluate(()=>{callProbe.callback({type:'ready',voice:true});callProbe.callback({type:'caption',text:'Your confirmed answers stay in the notes while we talk',audio:true});callProbe.callback({type:'state',state:'hearing'});});
 const commands=await page.evaluate(()=>callProbe.commands);for(const name of ['setMuted','setSpeaker','finishAnswer','end'])assert(commands.some(c=>c.name===name));
 for(const theme of ['light','dark'])for(const width of [360,390,768,1024,1280,1440,1920]){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.setViewportSize({width,height:1000});
  for(const state of ['expanded','compact']){
   if(state==='compact')await page.getByRole('button',{name:'Minimise call',exact:true}).click();
   const result=await page.evaluate(PAGE_AUDIT,{centerSelectors:[],ignoreSelectors:[],isNarrow:width<768});layouts.push({theme,width,state,...result});await page.screenshot({path:`${out}/${theme}-${width}-${state}.png`});
   if(state==='compact')await page.getByRole('button',{name:'Expand call',exact:true}).click();
  }
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/layout.json',JSON.stringify(layouts,null,2));assert(!layouts.some(x=>x.findings.some(f=>f.level==='fail')),JSON.stringify(layouts.filter(x=>x.findings.length)));
 await writeFile(out+'/controls.json',JSON.stringify({passed:true,scope:'UI control wiring uses a transport probe; confirmation persists through real authenticated APIs',commands,confirmed_profile:state,errors},null,2));console.log('PASS call controls, confirmed notes, transcript, minimization and 28 layout states');
}finally{await context.close();await browser.close();}
