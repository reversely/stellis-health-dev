/** Record the actual prototype; no network, camera, inference or clock replacements. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_DASH_PREVIEW_ORIGIN||'http://127.0.0.1:8857';
const out=process.env.STELLIS_UI_EVIDENCE||'docs/evidence/183';
const pace=Number(process.env.STELLIS_DEMO_PACE||1);
assert(pace>0);
const scenes=JSON.parse(await readFile('scripts/maya-demo-scenes.json','utf8'));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER||'/usr/bin/google-chrome'});
const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:out+'/raw',size:{width:1920,height:1080}},reducedMotion:'reduce',permissions:['camera']});
const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];const consoleErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
const timings=[];let epoch=Date.now();
const pause=ms=>page.waitForTimeout(ms*pace);
const tab=async name=>{await page.getByRole('tab',{name,exact:true}).click();await pause(500)};
const chapter=async prefix=>{await page.locator('.maya-chapters label').filter({hasText:new RegExp('^'+prefix)}).click();await page.getByRole('tab',{name:'Overview',exact:true}).waitFor();await page.evaluate(()=>scrollTo(0,0));await pause(700)};
const notebook=async name=>{await page.getByRole('textbox',{name:'Notebooks',exact:true}).click();await page.getByRole('option',{name,exact:true}).click();await page.keyboard.press('Escape');await pause(300)};
const feedback=async text=>page.locator('#maya-feedback').filter({hasText:text}).waitFor();
const reviewAndConfirm=async names=>{
 for(const name of names)await page.getByRole('checkbox',{name,exact:true}).check();
 await page.getByRole('button',{name:'Review entries',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#maya-log-confirm').disabled);await pause(1600);
 await page.getByRole('button',{name:'Confirm entries',exact:true}).click();await feedback(`Confirmed ${names.length} entries`);
};
const actions={
 opening:async()=>{await page.evaluate(()=>scrollTo(0,0))},
 'first-record':async()=>{await tab('Records');await page.locator('#maya-record-body').getByText('Ferritin',{exact:true}).waitFor()},
 upload:async()=>{await page.locator('#maya-upload input[type=file]').setInputFiles('stellis-synthetic-patient/documents/2022/D002_2022-01-21_cbc-ferritin-and-thyroid-results.pdf');await feedback('Added');await pause(1000)},
 file:async()=>{await notebook('Preventive Care');await notebook('Menstrual Health');await page.getByRole('button',{name:'Confirm and file',exact:true}).click();await feedback('filed to 2');await page.getByRole('button',{name:'Inspect original source',exact:true}).click();await page.locator('.maya-pdf:visible').first().waitFor();await pause(1500)},
 'first-routine':async()=>{await tab('Care');await reviewAndConfirm(['Ferrous sulfate']);await page.getByRole('checkbox',{name:'2022-01-08',exact:true}).check();await page.getByRole('checkbox',{name:'2022-01-09',exact:true}).check();await page.getByRole('button',{name:'Confirm period dates',exact:true}).click();await feedback('Confirmed flow')},
 'visit-notes':async()=>{await tab('Notes');await page.locator('#maya-visit-audio').evaluate(a=>a.play());await pause(5000);await page.locator('#maya-visit-audio').evaluate(a=>a.pause());await page.getByRole('textbox',{name:'Notes for this part of the story'}).fill('Check the iron follow-up against the dated report.');await page.getByRole('button',{name:'Save notes',exact:true}).click();await feedback('Notes saved')},
 'changing-care':async()=>{await chapter('2024')},
 'treatment-records':async()=>{await tab('Records');await notebook('Fertility');await notebook('IVF');await page.getByRole('button',{name:'Confirm and file',exact:true}).click();await feedback('Confirmed D027')},
 'treatment-plan':async()=>{await tab('Care');await page.getByText('150 IU',{exact:true}).waitFor();await page.evaluate(()=>scrollTo(0,0))},
 'log-together':async()=>{await reviewAndConfirm(['Follitropin alfa','Menotropins'])},
 'checkin-calendar':async()=>{await page.getByRole('button',{name:'Snooze until tomorrow',exact:true}).click();await feedback('2024-06-08');await page.getByRole('textbox',{name:'Appointment',exact:true}).fill('Egg retrieval');await page.getByLabel('Appointment date',{exact:true}).fill('2024-06-13');await page.getByRole('checkbox',{name:'The provider has confirmed this appointment'}).check();await page.getByRole('button',{name:'Save appointment',exact:true}).click();await feedback('saved as Confirmed')},
 'one-explanation':async()=>{await tab('Explanation');await page.getByRole('button',{name:'How the explanation is grounded',exact:true}).click();await pause(6000);await tab('Records');await page.getByRole('button',{name:'Inspect original source',exact:true}).click();await page.locator('.maya-pdf:visible').first().waitFor()},
 'pregnancy-birth':async()=>{await page.getByRole('textbox',{name:'Source record',exact:true}).click();await page.getByRole('option').filter({hasText:'Maternal hospital discharge summary'}).click();await notebook('Pregnancy');await notebook('Postpartum Recovery');await page.getByRole('button',{name:'Confirm and file',exact:true}).click();await feedback('Confirmed D054');await tab('Care');await page.getByText('Confirmed birth',{exact:true}).scrollIntoViewIfNeeded()},
 'new-routine':async()=>{await chapter('2026')},
 'latest-record':async()=>{await tab('Records');await notebook('Blood Health');await page.getByRole('button',{name:'Confirm and file',exact:true}).click();await feedback('Confirmed D070')},
 'goals-course':async()=>{await tab('Care');await page.getByText('Course supply and end date',{exact:true}).waitFor();await pause(6000);await page.getByRole('textbox',{name:'Personal goal',exact:true}).fill('Walk after lunch');await page.getByRole('button',{name:'Add goal',exact:true}).click();await feedback('Personal goal added')},
 measurements:async()=>{await page.locator('#preview-open-story').scrollIntoViewIfNeeded();await page.locator('.preview-category').filter({hasText:/^Vital signs$/}).click();await page.locator('#preview-measurement-space').waitFor({state:'visible'});const pulse=page.locator('.preview-card').first();await pulse.getByRole('button',{name:'Table view',exact:true}).click();await pulse.locator('table').waitFor();await pause(5000);await pulse.getByRole('button',{name:'Table view',exact:true}).click();await pulse.locator('.scatterlayer .point').last().scrollIntoViewIfNeeded();const point=await pulse.locator('.scatterlayer .point').last().boundingBox();await page.mouse.move(point.x+point.width/2,point.y+point.height/2);await page.locator('.preview-reading-tooltip:visible').waitFor();await pause(4000);await page.mouse.move(0,0)},
 'camera-intro':async()=>{await page.locator('#preview-live-test').scrollIntoViewIfNeeded()},
 'camera-space':async()=>{await page.getByRole('button',{name:'Open camera test',exact:true}).click();await page.getByRole('dialog',{name:'Log vital signs'}).waitFor()},
 'camera-attempt':async()=>{await page.getByRole('button',{name:'Start',exact:true}).click();await page.getByText('No reading yet',{exact:true}).waitFor()},
 'camera-return':async()=>{await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.pulse-dialog').waitFor({state:'detached'});assert.match(await page.locator('#preview-live-results').innerText(),/No camera readings yet/)},
 continuity:async()=>{await page.getByRole('button',{name:"Maya's timeline",exact:true}).click();await chapter('2022');await pause(5000);await chapter('2026')},
};
let video;
try {
 await page.goto(origin);await page.getByText('Maya grows with Stellis',{exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('#maya-feedback').innerText(),'');
 epoch=Date.now();
 for(const scene of scenes){
  const start=(Date.now()-epoch)/1000;console.log('SCENE',scene.id,start.toFixed(1));
  await actions[scene.id]();const elapsed=(Date.now()-epoch)/1000-start;
  await page.waitForTimeout(Math.max(0,scene.seconds*pace*1000-elapsed*1000));
  timings.push({...scene,start,end:(Date.now()-epoch)/1000});
  await page.screenshot({path:`${out}/scene-${scene.id}.png`});
 }
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 video=page.video();
} catch(error){await page.screenshot({path:`${out}/recording-failure.png`});throw error}
finally{await context.close();await browser.close()}
const source=await video.path();
const stamp=value=>{const ms=Math.round(value*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`};
// The actual recorder starts at page creation; preserve the initial browser-load offset.
const rawDuration=Number(spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',source],{encoding:'utf8'}).stdout.trim());
const timelineDuration=timings.at(-1).end;const lead=Math.max(0,rawDuration-timelineDuration);
const vtt='WEBVTT\n\n'+timings.map((s,i)=>`${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.caption}\n`).join('\n');
await writeFile(out+'/maya-prototype-demo.vtt',vtt);
await writeFile(out+'/transcript.md','# Maya grows with Stellis\n\n'+timings.map(s=>`${stamp(s.start)} — **${s.id}**\n\n${s.caption}\n`).join('\n'));
await writeFile(out+'/recording.json',JSON.stringify({source,rawDuration,trimmedLoadingSeconds:lead,duration:timelineDuration,timings,pace,mode:'Actual prototype interactions, fictional source data and saved scripted visit; no substituted camera or inference APIs',camera:'Real no-device result; live testing remains available in the prototype',audio:'Silent film with burned captions and a WebVTT sidecar; saved visit audio can be heard in the interactive prototype',errors,consoleErrors},null,2));
const result=spawnSync('ffmpeg',['-y','-ss',String(lead),'-i',source,'-vf',`subtitles=${out}/maya-prototype-demo.vtt:force_style='FontName=DejaVu Sans,FontSize=10,PrimaryColour=&H00FFFFFF,OutlineColour=&H00382630,BorderStyle=3,Outline=5,Shadow=0,MarginV=16'`,'-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',out+'/maya-prototype-demo.mp4'],{encoding:'utf8'});
assert.equal(result.status,0,result.stderr?.slice(-3000));
console.log('RECORDED',out+'/maya-prototype-demo.mp4',rawDuration.toFixed(1)+'s');
