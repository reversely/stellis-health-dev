/** Audits guide, date review and chat controls across the project viewport set. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {PAGE_AUDIT} from './maya_layout_geometry.mjs';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8977';
const out=process.env.STELLIS_MAYA_EVIDENCE || '/tmp/stellis-maya-layout';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.STELLIS_BROWSER,args:['--no-sandbox','--disable-gpu']});
const report=[];
try {
 for(const theme of ['light','dark']) for(const width of [360,390,768,1024,1280,1440,1920]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.addInitScript(({theme})=>{
   localStorage.setItem('stellis-theme',theme);
   if (!localStorage.getItem('stellis-maya:local:maya-v1')) localStorage.setItem('stellis-maya:local:maya-v1',JSON.stringify({active:true,index:26}));
  },{theme});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/chat');
  const guide=page.getByRole('region',{name:'Maya’s story'});
  await guide.getByRole('button',{name:'Upload Record',exact:true}).waitFor();
  const audit=async(state,ignore)=>{
   const result=await page.evaluate(PAGE_AUDIT,{centerSelectors:[],ignoreSelectors:ignore,isNarrow:width<768});
   await page.screenshot({path:`${out}/${theme}-${width}-${state}.png`});
   report.push({theme,width,state,findings:result.findings,errors:[...errors]});
  };
  await audit('guide',['body > :not(.coach-call)']);
  await guide.getByRole('button',{name:'Minimise',exact:true}).click();
  await page.locator('.agent-composer textarea').waitFor();
  const send=page.locator('.agent-composer button[type=submit]');
  await send.evaluate(node => node.scrollIntoView({block:'center'}));
  await page.screenshot({path:`${out}/${theme}-${width}-send.png`});
  assert(await send.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),`${theme} ${width} Send is covered`);
  await audit('chat',['#rail-shader','canvas','.agent-context-panel']);
  await guide.getByRole('button',{name:'Expand',exact:true}).click();
  await guide.getByRole('button',{name:'Upload Record',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Upload Record',exact:true});
  await dialog.getByLabel('Record',{exact:true}).setInputFiles('stellis-synthetic-patient/documents/2022/D001_2022-01-18_routine-primary-care-consultation.pdf');
  await dialog.getByRole('button',{name:'Upload record',exact:true}).click();
  await dialog.getByLabel('Encounter date',{exact:true}).waitFor();
  await audit('date-review',['body > :not(dialog)']);
  await page.keyboard.press('Escape');
  await guide.getByRole('button',{name:'Close',exact:true}).click();
  await page.reload();await page.locator('.agent-composer textarea').waitFor();assert.equal(await guide.count(),0);
  await context.close();
 }
} finally {await browser.close();await writeFile(out+'/report.json',JSON.stringify(report,null,2));}
const failures=report.flatMap(row=>row.findings.filter(item=>item.level==='fail').map(item=>({...row,...item,findings:undefined})));
await writeFile(out+'/failures.json',JSON.stringify(failures,null,2));
assert.equal(failures.length,0,JSON.stringify(failures.slice(0,5),null,2));
assert(report.every(row=>!row.errors.length));
console.log(`PASS ${report.length} layout states`);
