/** Evaluate the actual Dash/Mantine runtime with synthetic measurements. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_DASH_PREVIEW_ORIGIN||'http://127.0.0.1:8856';
const out=process.env.STELLIS_UI_EVIDENCE;
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER||'/usr/bin/google-chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const consoleErrors=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
const requests=[];page.on('request',r=>requests.push(r.url()));
const results=[];
try {
 if(out)await mkdir(out,{recursive:true});
 await page.goto(origin);await page.locator('.js-plotly-plot').first().waitFor();await page.evaluate(()=>document.fonts.ready);
 for(const theme of ['dark','light']) {
  if(theme==='light')await page.getByRole('button',{name:'Switch to light mode'}).click();
  await page.waitForFunction(t=>document.documentElement.dataset.mantineColorScheme===t,theme);
  for(const width of [360,390,768,1280,1440,1920]) {
   await page.setViewportSize({width,height:1000});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,{},{timeout:5000});
   const cards=await page.locator('.preview-card').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}));
   assert.equal(cards.length,6);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme} ${width}: overflow`);
   if(width>=1280)assert(Math.abs(cards[0].y-cards[1].y)<2 && cards[1].x>cards[0].x+cards[0].width,'desktop columns');
   if(width<=390)assert(cards[1].y>=cards[0].y+cards[0].height,'mobile stack');
   results.push({theme,width,cards});
   if(out&&[390,1440].includes(width))await page.screenshot({path:`${out}/dash-${width}-${theme}-charts.png`});
  }
  await page.setViewportSize({width:1440,height:1000});
  const pulse=page.locator('.preview-card').first();
  await pulse.getByRole('switch',{name:'Table',exact:true}).check();
  await pulse.locator('.mantine-Table-table').waitFor();
  assert.equal(await pulse.locator('tbody tr').count(),9);
  // Date ordering and text filtering are shared table behavior, not per-measure markup.
  const newest=await pulse.locator('tbody tr').first().innerText();
  await pulse.getByLabel('Order',{exact:true}).click();await page.getByRole('option',{name:'Oldest first',exact:true}).click();
  await page.waitForFunction(newest=>document.querySelector('.preview-card tbody tr')?.innerText!==newest,newest);
  await pulse.getByLabel('Search readings',{exact:true}).fill('77');
  await page.waitForFunction(()=>document.querySelectorAll('.preview-card:first-child tbody tr').length===1);
  assert.match(await pulse.locator('tbody tr').innerText(),/77/);
  await pulse.getByLabel('Search readings',{exact:true}).fill('');
  await page.waitForFunction(()=>document.querySelectorAll('.preview-card:first-child tbody tr').length===9);
  await page.locator('.mantine-SegmentedControl-label').filter({hasText:/^1 week$/}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.preview-card:first-child tbody tr').length===7);
  if(out)await page.screenshot({path:`${out}/dash-1440-${theme}-table.png`});
  await page.setViewportSize({width:390,height:1000});
  await pulse.locator('table').waitFor();
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,{},{timeout:5000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile table overflow');
  if(out)await page.screenshot({path:`${out}/dash-390-${theme}-table.png`});
  await pulse.getByRole('switch',{name:'Table',exact:true}).uncheck();await pulse.locator('.js-plotly-plot').waitFor();
  await page.locator('.mantine-SegmentedControl-label').filter({hasText:/^All$/}).click();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 assert(requests.every(url=>new URL(url).origin===origin),'all assets and callbacks must be local');
 if(out)await writeFile(out+'/checks.json',JSON.stringify({layouts:results,pageErrors:errors,consoleErrors,externalRequests:[]},null,2));
 console.log('PASS Dash preview: 12 responsive layouts, real Mantine tables/switches, shared filtering/order, range and theme callbacks, local-only assets');
} finally {await browser.close()}
