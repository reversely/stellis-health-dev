/** Source-backed story continuity and actual camera-permission boundary. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_DASH_PREVIEW_ORIGIN||'http://127.0.0.1:8857';
const out=process.env.STELLIS_UI_EVIDENCE;
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER||'/usr/bin/google-chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',permissions:['camera']});
const page=await context.newPage();const errors=[];const consoleErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
await page.addInitScript(()=>{window.demoCameraRequests=0;const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(...args)=>{window.demoCameraRequests++;return get(...args)}});
const shot=async name=>{if(out){await mkdir(out,{recursive:true});await page.screenshot({path:`${out}/${name}.png`})}};
const choose=async year=>{await page.locator('.maya-chapters label').filter({hasText:new RegExp('^'+year)}).click();await page.getByRole('tab',{name:'Overview',exact:true}).waitFor()};
const tool=async name=>{await page.getByRole('tab',{name,exact:true}).click()};
const notebook=async name=>{await page.getByRole('textbox',{name:'Notebooks',exact:true}).click();await page.getByRole('option',{name,exact:true}).click();await page.keyboard.press('Escape')};
try {
 await page.goto(origin);await page.getByText('Maya grows with Stellis',{exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('#maya-chapter-content .js-plotly-plot'));
 assert.equal(await page.locator('#maya-feedback').innerText(),'','no confirmation on mounting controls');
 assert.equal(await page.evaluate(()=>window.demoCameraRequests),0);
 await shot('2022-overview');await tool('Records');
 await page.getByLabel('Visit or test date',{exact:true}).fill('');await page.getByRole('button',{name:'Confirm and file',exact:true}).click();await page.locator('#maya-feedback').filter({hasText:'Choose a valid date'}).waitFor();await page.getByLabel('Visit or test date',{exact:true}).fill('2022-01-21');
 assert.match(await page.locator('#maya-record-body').innerText(),/124/);assert.match(await page.locator('#maya-record-body').innerText(),/Ferritin/);
 await page.locator('#maya-upload input[type=file]').setInputFiles('stellis-synthetic-patient/documents/2022/D002_2022-01-21_cbc-ferritin-and-thyroid-results.pdf');
 await page.locator('#maya-feedback').filter({hasText:'Added'}).waitFor();
 await notebook('Preventive Care');await notebook('Menstrual Health');await page.getByRole('button',{name:'Confirm and file',exact:true}).click();
 await page.locator('#maya-feedback').filter({hasText:'filed to 2'}).waitFor();await shot('2022-record-review');
 await tool('Care');
 assert(await page.getByRole('button',{name:'Confirm entries',exact:true}).isDisabled());
 await page.getByRole('checkbox',{name:'Ferrous sulfate',exact:true}).check();await page.getByRole('button',{name:'Review entries',exact:true}).click();
 await page.getByRole('button',{name:'Confirm entries',exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('#maya-log-confirm').disabled);
 await page.getByRole('button',{name:'Confirm entries',exact:true}).click();await page.locator('#maya-feedback').filter({hasText:'Confirmed 1 entries'}).waitFor();
 await page.getByRole('checkbox',{name:'2022-01-08',exact:true}).check();await page.getByRole('checkbox',{name:'2022-01-09',exact:true}).check();
 await page.getByRole('button',{name:'Confirm period dates',exact:true}).click();await page.locator('#maya-feedback').filter({hasText:'Confirmed flow on 2'}).waitFor();
 await tool('Notes');await page.getByRole('textbox',{name:'Notes for this part of the story'}).fill('Review the iron follow-up and keep the dated source.');await page.getByRole('button',{name:'Save notes',exact:true}).click();await page.locator('#maya-feedback').filter({hasText:'Notes saved'}).waitFor();
 await choose('2024');await tool('Records');await notebook('Fertility');await notebook('IVF');await page.getByRole('button',{name:'Confirm and file',exact:true}).click();await page.locator('#maya-feedback').filter({hasText:'Confirmed D027'}).waitFor();
 await tool('Care');await page.getByRole('checkbox',{name:'Follitropin alfa',exact:true}).check();await page.getByRole('checkbox',{name:'Menotropins',exact:true}).check();
 await page.getByRole('button',{name:'Review entries',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#maya-log-confirm').disabled);await page.getByRole('button',{name:'Confirm entries',exact:true}).click();await page.locator('#maya-feedback').filter({hasText:'Confirmed 2 entries'}).waitFor();
 await page.getByRole('button',{name:'Snooze until tomorrow',exact:true}).click();await page.locator('#maya-feedback').filter({hasText:'2024-06-08'}).waitFor();
 await page.getByRole('textbox',{name:'Appointment',exact:true}).fill('Egg retrieval');await page.getByLabel('Appointment date',{exact:true}).fill('2024-06-13');await page.getByRole('checkbox',{name:'The provider has confirmed this appointment'}).check();await page.getByRole('button',{name:'Save appointment',exact:true}).click();await page.locator('#maya-feedback').filter({hasText:'saved as Confirmed'}).waitFor();
 await shot('2024-care');await tool('Explanation');assert.match(await page.getByRole('tabpanel',{name:'Explanation'}).innerText(),/12 oocytes retrieved/);await shot('2024-saved-explanation');
 await choose('2026');await tool('Care');assert.match(await page.getByRole('tabpanel',{name:'Care'}).innerText(),/2026-09-15/);
 await page.getByRole('textbox',{name:'Personal goal',exact:true}).fill('Walk after lunch');await page.getByRole('button',{name:'Add goal',exact:true}).click();await page.locator('#maya-feedback').filter({hasText:'Personal goal added'}).waitFor();
 await shot('2026-routine');await choose('2022');await tool('Notes');assert.equal(await page.getByRole('textbox',{name:'Notes for this part of the story'}).inputValue(),'Review the iron follow-up and keep the dated source.');
 await page.reload();await page.getByText('Maya grows with Stellis',{exact:true}).waitFor();await tool('Notes');assert.equal(await page.getByRole('textbox',{name:'Notes for this part of the story'}).inputValue(),'Review the iron follow-up and keep the dated source.');
 await choose('2026');await page.locator('.preview-category').filter({hasText:/^Vital signs$/}).click();await page.locator('#preview-measurement-space').waitFor({state:'visible'});
 await page.getByRole('button',{name:'Open camera test',exact:true}).click();await page.getByRole('dialog',{name:'Log vital signs'}).waitFor();assert.equal(await page.evaluate(()=>window.demoCameraRequests),0,'opening camera space must not request a stream');await shot('camera-ready');
 await page.getByRole('button',{name:'Start',exact:true}).click();await page.getByText('No reading yet',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.demoCameraRequests),1);await shot('camera-no-device');
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.locator('.pulse-dialog').waitFor({state:'detached'});
 assert.match(await page.locator('#preview-live-results').innerText(),/No camera readings yet/);
 // Geometry of the story and camera space remains usable in both themes.
 const layouts=[];const contrast=[];
 for(const theme of ['dark','light']) {
  if(theme==='light')await page.getByRole('button',{name:'Switch to light mode'}).click();
  await page.locator(`[data-story-theme=${theme}]`).waitFor({state:'attached'});
  const primary=await page.locator('#maya-file,#maya-log-review,#maya-notes-save').evaluateAll(nodes=>nodes.map(n=>{
   const probe=document.createElement('span');probe.style.color='var(--surface)';probe.style.background='var(--ink)';n.append(probe);
   const result={id:n.id,fill:getComputedStyle(n).backgroundColor,ink:getComputedStyle(n.querySelector('.mantine-Button-label')).color,expectedFill:getComputedStyle(probe).backgroundColor,expectedInk:getComputedStyle(probe).color};probe.remove();return result;
  }));
  contrast.push({theme,buttons:primary});
  for(const button of primary){assert(button.fill&&button.ink,'controls must be attached when checking contrast');assert.equal(button.fill,button.expectedFill);assert.equal(button.ink,button.expectedInk,`${theme}: ${button.id} text must contrast with its fill`);}
  for(const width of [390,768,1440,1920]) {
   await page.setViewportSize({width,height:1000});await page.getByRole('button',{name:"Maya's timeline",exact:true}).click();
   await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
   await page.waitForTimeout(700);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))console.log(JSON.stringify({theme,width,overflow:await page.evaluate(()=>[...document.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).map(n=>({tag:n.tagName,cls:n.className,w:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right})).slice(0,20))}));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);layouts.push({theme,width});
   if(width===390||width===1440)await shot(`story-${width}-${theme}`);
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 if(out)await writeFile(out+'/workflow-checks.json',JSON.stringify({passed:true,layouts,contrast,camera:'Actual getUserMedia failure with no physical device; no simulated camera values',errors,consoleErrors},null,2));
 console.log('PASS three-stage Maya journey: original upload, explicit filing, reviewed logs, periods, notes persistence, treatment, goals, actual camera boundary and eight layouts');
}finally{await browser.close()}
