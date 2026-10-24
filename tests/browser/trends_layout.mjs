/** Trends category stability, persisted readings and navigation geometry. */
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8854';
const evidence = process.env.STELLIS_UI_EVIDENCE;
const browser = await chromium.launch({headless:true, executablePath:process.env.STELLIS_BROWSER || '/usr/bin/google-chrome'});
const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const password='correct horse battery staple';
const api = async(path,data,method='post') => {
 const r=await context.request[method](origin+'/api/v1'+path,{data});
 assert(r.ok(),path+' '+r.status());return r.json();
};
const results=[];
try {
 await api('/auth/register',{username:'trends-layout-'+Date.now(),password});
 await api('/onboarding',{uses:[],step:'review',agent_choices:{}},'put');await api('/onboarding/complete');
 for(let offset=0;offset<6;offset++) {
  const date=new Date();date.setDate(date.getDate()-offset);date.setHours(8,0,0,0);
  for(const [measure,value] of [['pulse',72+offset],['breathing_rate',14+offset*.1],['hrv',42+offset],['weight',70+offset*.2]]) await api('/readings',{measure,value,taken_at:date.toISOString()});
 }
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(evidence)await mkdir(evidence,{recursive:true});
 for(const theme of ['light','dark']) for(const width of [360,390,768,1024,1280,1920]) {
  await page.setViewportSize({width,height:844});await page.goto(origin+'/trends');
  await page.evaluate(t=>{localStorage.setItem('stellis-theme',t);document.documentElement.dataset.theme=t;document.documentElement.classList.add('theme-swapping');},theme);
  await page.locator('.trend-group[data-group=symptoms]').waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.deepEqual(await page.locator('.trend-group > .vital-signs-head h3').allTextContents(),['Vital signs','Body measurements','Blood sugar','Sleep','Symptoms']);
  assert.equal(await page.getByText('Start tracking',{exact:true}).count(),0);
  assert.equal(await page.getByText(/You logged/).count(),0);
  assert.equal(await page.locator('.trend-when time').count(),4);
  assert.equal(await page.locator('.trend-source').first().textContent(),'Manual entry');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme} ${width} overflow`);
  assert.equal(await page.getByText(/your usual/i).count(),0);
  const pulseCard=page.locator('.trend-card[data-measure=pulse]');
  const breathingCard=page.locator('.trend-card[data-measure=breathing_rate]');
  const p=await pulseCard.boundingBox(), b=await breathingCard.boundingBox();
  if(width>1000) {
   assert(Math.abs(p.y-b.y)<1 && b.x>p.x+p.width,'desktop cards must share a row');
   assert(Math.abs(p.y+p.height-b.y-b.height)<1,'desktop card bottoms must align');
  }
  else assert(b.y>=p.y+p.height,'phone cards must stack');
  const switchBox=await pulseCard.locator('.trend-table-control').boundingBox();
  assert(switchBox.x+switchBox.width>p.x+p.width-30,'Table belongs at upper right');
  await pulseCard.getByRole('button',{name:'Table view',exact:true}).click();
  await pulseCard.locator('.trend-table').waitFor({state:'visible'});
  assert.equal(await pulseCard.locator('.trend-plot').isVisible(),false);
  await pulseCard.getByRole('button',{name:'Table view',exact:true}).click();
  await pulseCard.locator('.trend-plot').waitFor({state:'visible'});
  const colours=await page.evaluate(()=>Object.fromEntries(['field','surface','rail-surface','raised'].map(k=>[k,getComputedStyle(document.documentElement).getPropertyValue('--'+k).trim()])));
  if(theme==='dark')assert.equal(colours.field,'#302638');
  if(width<=1000) {
   for(const position of ['top','middle','bottom']) {
    await page.evaluate(position=>scrollTo(0,position==='top'?0:position==='middle'?document.documentElement.scrollHeight/2:document.documentElement.scrollHeight),position);
    const nav=await page.locator('#compact-nav').boundingBox();assert(Math.abs(nav.y+nav.height-844)<1,'navigation must stay on viewport bottom');
    for(const button of await page.locator('#compact-nav > *').all()){const box=await button.boundingBox();assert(box.height>=44);}
    if(evidence&&width===390)await page.screenshot({path:`${evidence}/trends-${width}-${theme}-${position}.png`});
   }
   const last=await page.locator('[data-group=symptoms] .trend-start-row').boundingBox();const nav=await page.locator('#compact-nav').boundingBox();assert(last.y+last.height<=nav.y,'last action must scroll above navigation');
  }
  await page.evaluate(()=>scrollTo(0,0));
  if(evidence&&[1280,1920].includes(width))await page.screenshot({path:`${evidence}/trends-${width}-${theme}.png`});
  if(width===390) {
   await page.locator('[data-group=symptoms] [data-log=pain]').click();
   const form=page.locator('[data-group=symptoms] .trend-form');
   const save=form.getByRole('button',{name:'Save',exact:true});
   const saveBox=await save.boundingBox();
   assert(saveBox.height>=44);
   const navBox=await page.locator('#compact-nav').boundingBox();
   assert(saveBox.y+saveBox.height<=navBox.y,'Save must be above mobile navigation when form opens');
   const styles=await save.evaluate(n=>({fill:getComputedStyle(n).backgroundColor,expected:getComputedStyle(n).getPropertyValue('--action-fill').trim()}));
   assert(styles.fill!=='rgba(0, 0, 0, 0)');
   if(evidence)await page.screenshot({path:`${evidence}/reading-form-${theme}.png`});
   await form.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  results.push({theme,width,colours});
 }
 // Save from an empty category, then verify its placement and value after reload.
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-group=symptoms] [data-log=pain]').click();
 const form=page.locator('[data-group=symptoms] .trend-form');
 await form.locator('input[type=number]').fill('3');await form.getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('[data-group=symptoms] .trend-value').waitFor();await page.reload();
 assert.equal(await page.locator('[data-group=symptoms] .trend-value').textContent(),'3');
 await page.locator('[data-group=symptoms]').getByRole('button',{name:'Table view',exact:true}).click();await page.locator('[data-group=symptoms] .trend-table').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);
 if(evidence)await writeFile(evidence+'/checks.json',JSON.stringify(results,null,2));
 console.log('PASS Trends: 12 layouts, categories, purple surfaces, navigation at three scroll positions, save/reload and table');
} finally {
 await context.request.delete(origin+'/api/v1/account',{data:{password,confirm:'DELETE'}});
 await browser.close();
}
