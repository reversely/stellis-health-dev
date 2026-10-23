/** Audits the yearly story and native cycle form at seven widths in both themes. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {PAGE_AUDIT} from './maya_layout_geometry.mjs';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN||'http://127.0.0.1:8980';
const out=process.env.STELLIS_MAYA_EVIDENCE||'/tmp/maya-yearly-layout';
assert.equal(process.env.STELLIS_TEST_DISPOSABLE,'1');
const browser=await chromium.launch({executablePath:process.env.STELLIS_BROWSER,args:['--no-sandbox','--disable-gpu']});const results=[];await mkdir(out,{recursive:true});
const setup=await browser.newContext();await setup.request.delete(origin+'/api/v1/demo/history');await setup.request.post(origin+'/api/v1/demo/enter');const imported=await setup.request.post(origin+'/api/v1/demo/upload',{multipart:{file:{name:'maya-2022.zip',mimeType:'application/zip',buffer:await readFile('src/stellis/static/maya/years/maya-2022.zip')}}});assert(imported.ok());await setup.close();
try{for(const theme of ['light','dark'])for(const width of [360,390,768,1024,1280,1440,1920]){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});await context.request.post(origin+'/api/v1/demo/enter');const status=await (await context.request.get(origin+'/api/v1/demo/status')).json();
 await context.addInitScript(({theme,generation})=>{localStorage.setItem('stellis-theme',theme);if(!localStorage.getItem('stellis-maya-story:'+generation))localStorage.setItem('stellis-maya-story:'+generation,JSON.stringify({year:0,turn:0,open:true,mode:'year',completed:[]}));},{theme,generation:status.generation});const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(origin+'/');const story=page.getByRole('dialog',{name:'Maya’s story',exact:true});await story.getByRole('button',{name:'Open Cycle',exact:true}).waitFor();
 const audit=async state=>{const report=await page.evaluate(PAGE_AUDIT,{centerSelectors:[],ignoreSelectors:['body > :not(dialog)'],isNarrow:width<768});results.push({theme,width,state,...report});await page.screenshot({path:`${out}/${theme}-${width}-${state}.png`});console.log(theme,width,state,JSON.stringify(report.findings));};
 await audit('year');await story.getByRole('button',{name:'Five-year timeline',exact:true}).click();await audit('overview');await story.getByRole('button',{name:'Continue as Maya',exact:true}).click();await story.getByRole('button',{name:'Open Cycle',exact:true}).click();await page.getByLabel('Period start',{exact:true}).waitFor();await audit('cycle');await page.keyboard.press('Escape');
 for(const [turn,state] of [[3,'dates'],[4,'notebooks']]){await page.evaluate(({generation,turn})=>localStorage.setItem('stellis-maya-story:'+generation,JSON.stringify({year:0,turn,open:true,mode:'year',completed:[]})),{generation:status.generation,turn});await page.reload();await story.getByRole('region',{name:'Current action',exact:true}).waitFor();await audit(state);}
 await context.close();
}}finally{await browser.close();await writeFile(out+'/report.json',JSON.stringify(results,null,2));assert(!results.some(result=>result.findings.some(f=>f.level==='fail')),'Layout failures must be corrected');}
