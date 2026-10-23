/** Exercise real microphone ASR, configured assistant inference, TTS and browser playback. */
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
import assert from 'node:assert/strict';
import fs from 'node:fs';
(async()=>{
 const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8840';
 const microphone=process.env.STELLIS_TEST_MICROPHONE_WAV;
 assert(microphone,'Set STELLIS_TEST_MICROPHONE_WAV to a fixture saying I would like to walk more often.');
 const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+microphone,'--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:900}});
 const password='local-voice-validation-password';let registered=false;
 try {
  let r=await context.request.post(origin+'/api/v1/auth/register',{data:{username:'voice-check-'+Date.now(),password}});assert(r.ok(),await r.text());registered=true;
  r=await context.request.put(origin+'/api/v1/onboarding',{data:{uses:[],step:'review',agent_choices:{}}});assert(r.ok(),await r.text());
  r=await context.request.post(origin+'/api/v1/onboarding/complete');assert(r.ok(),await r.text());
  const page=await context.newPage();
  await page.addInitScript(()=>{
   window.voiceProof={messages:[],binary:0,playback:0,microphoneFrames:0};
   const WS=window.WebSocket;
   window.WebSocket=class extends WS{
    constructor(...args){super(...args);this.addEventListener('message',e=>{
     if(typeof e.data==='string'){try{window.voiceProof.messages.push(JSON.parse(e.data));}catch{}}
     else window.voiceProof.binary++;
    });}
    send(data){if(typeof data!=='string')window.voiceProof.microphoneFrames++;return super.send(data);}
   };
   const start=AudioBufferSourceNode.prototype.start;
   AudioBufferSourceNode.prototype.start=function(...args){window.voiceProof.playback++;return start.apply(this,args);};
  });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  await page.getByRole('button',{name:'Call Stellis',exact:true}).waitFor({timeout:20000});
  const tour=page.locator('.coach-call');
  if(await tour.count()) await page.getByRole('button',{name:'End call',exact:true}).click();
  await page.getByRole('button',{name:'Call Stellis',exact:true}).click();
  await page.waitForFunction(()=>window.voiceProof.messages.some(m=>m.type==='ready'&&m.voice===true),{},{timeout:30000});
  await page.waitForFunction(()=>window.voiceProof.messages.some(m=>m.type==='heard'),{},{timeout:50000});
  console.log('Recognition',await page.evaluate(()=>window.voiceProof.messages.find(m=>m.type==='heard').text));
  await page.waitForFunction(()=>window.voiceProof.messages.some(m=>m.type==='say'&&m.turn>=1&&m.audio),{},{timeout:90000});
  await page.waitForFunction(()=>window.voiceProof.playback>=2,{},{timeout:15000});
  const proof=await page.evaluate(()=>({microphoneFrames:voiceProof.microphoneFrames,binary:voiceProof.binary,playback:voiceProof.playback,messages:voiceProof.messages.filter(m=>['ready','heard','say','error'].includes(m.type))}));
  console.log(JSON.stringify(proof,null,2));assert(proof.microphoneFrames>0);assert(proof.binary>=2);assert(proof.playback>=2);assert(!proof.messages.some(m=>m.type==='error'));
  await page.screenshot({path:(process.env.STELLIS_VOICE_PROOF_PREFIX || '/tmp/stellis-voice-proof')+'.png',fullPage:true});
  fs.writeFileSync((process.env.STELLIS_VOICE_PROOF_PREFIX || '/tmp/stellis-voice-proof')+'.json',JSON.stringify(proof,null,2));
  await page.getByRole('button',{name:'End call',exact:true}).click();
  console.log('PASS browser microphone -> real Moonshine ASR -> real assistant -> Chatterbox -> browser audio playback');
 }finally{
  if(registered)await context.request.delete(origin+'/api/v1/account',{data:{password,confirm:'DELETE'}});
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});
