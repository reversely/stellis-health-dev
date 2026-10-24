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
  await pulse.getByRole('button',{name:'Table view',exact:true}).click();
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
  await pulse.getByRole('button',{name:'Table view',exact:true}).click();await pulse.locator('.js-plotly-plot').waitFor();
  await page.locator('.mantine-SegmentedControl-label').filter({hasText:/^All$/}).click();
 }
 // Every measurement navigation item opens the matching content and tracks state.
 await page.setViewportSize({width:1440,height:1000});
 const categories=['Vital signs','Body measurements','Blood sugar','Sleep','Symptoms'];
 for (const name of categories) {
  const link=page.locator('.mantine-AppShell-navbar').getByRole('button',{name,exact:true});
  if(name==='Body measurements') {await link.focus();await link.press('Enter');} else await link.click();
  await page.locator('.preview-section:visible').getByRole('heading',{name,exact:true}).waitFor();
  assert.equal(await link.getAttribute('aria-pressed'),'true');
  if(out)await page.screenshot({path:`${out}/category-${name.toLowerCase().replaceAll(' ','-')}.png`});
 }
 await page.locator('.mantine-AppShell-navbar').getByRole('button',{name:'Vital signs',exact:true}).click();
 await page.setViewportSize({width:390,height:1000});
 await page.getByRole('textbox',{name:'Measurements',exact:true}).click();
 await page.getByRole('option',{name:'Blood sugar',exact:true}).click();
 await page.locator('.preview-section:visible').getByRole('heading',{name:'Blood sugar',exact:true}).waitFor();
 await page.getByRole('textbox',{name:'Measurements',exact:true}).click();
 await page.getByRole('option',{name:'Vital signs',exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});
 const plot=page.locator('.preview-card').first().locator('.js-plotly-plot');
 // Exercise actual pointer hover, with a single date and a padded coloured overlay.
 const marker=await plot.locator('.scatterlayer .point').nth(4).boundingBox();
 await page.mouse.move(marker.x+marker.width/2,marker.y+marker.height/2);
 const tooltip=page.locator('.preview-reading-tooltip:visible');
 await tooltip.waitFor();
 assert.equal(await tooltip.locator('time').count(),1);
 assert.equal(await tooltip.locator('.preview-tooltip-reading').count(),1);
 assert.match(await tooltip.innerText(),/bpm/);
 const tipStyle=await tooltip.evaluate(n=>({padding:getComputedStyle(n).padding,color:getComputedStyle(n).color,fill:getComputedStyle(n).backgroundColor}));
 assert.equal(tipStyle.padding,'12px 16px');
 if(out)await page.screenshot({path:`${out}/tooltip-light.png`});
 await page.mouse.move(0,0);await tooltip.waitFor({state:'hidden'});
 assert.equal(await page.locator('.preview-card').first().getByText('Usual range',{exact:true}).count(),0);
 assert.match(await page.locator('.preview-range-legend').first().innerText(),/Usual range [\d.]+–[\d.]+ bpm/);
 for (const theme of ['light','dark']) {
  if(theme==='dark')await page.getByRole('button',{name:'Switch to dark mode'}).click();
  await page.waitForFunction(t=>document.documentElement.dataset.mantineColorScheme===t,theme);
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000});
   await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
   for(const index of [0,8]) {
    const point=page.locator('.preview-card').first().locator('.scatterlayer .point').nth(index);
    const rect=await point.boundingBox();
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
    const overlay=page.locator('.preview-reading-tooltip:visible');await overlay.waitFor();
    const bounds=await overlay.boundingBox();
    assert(bounds.x>=0 && bounds.x+bounds.width<=width,'edge tooltip must stay within viewport');
    assert.equal(await overlay.locator('time').count(),1);
    assert.equal(await overlay.locator('.preview-tooltip-marker').count(),1);
    if(out&&index===8)await page.screenshot({path:`${out}/tooltip-${width}-${theme}.png`});
    await page.mouse.move(0,0);await overlay.waitFor({state:'hidden'});
   }
  }
 }
 // Prove ranges follow supplied data and disappear completely without a baseline.
 let customBounds=false;
 await page.route('**/_dash-layout',async route=>{
  const response=await route.fetch();const data=await response.json();
  const visit=node=>{
   if(!node||typeof node!=='object')return;
   if(node.props?.id==='preview-data') {
    for(const measure of Object.values(node.props.data))measure.usual=null;
    if(customBounds)node.props.data.pulse.usual={low:65,high:68};
   }
   for(const child of Object.values(node))if(Array.isArray(child))child.forEach(visit);else if(child&&typeof child==='object')visit(child);
  };visit(data);await route.fulfill({json:data});
 });
 await page.reload();await page.locator('.js-plotly-plot').first().waitFor();
 assert.equal(await page.locator('.preview-range-legend').count(),0);
 assert.equal(await page.locator('.js-plotly-plot').first().evaluate(n=>n.layout.shapes.length),0);
 customBounds=true;await page.reload();await page.getByText('Usual range 65–68 bpm',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 assert(requests.every(url=>new URL(url).origin===origin),'all assets and callbacks must be local');
 if(out)await writeFile(out+'/checks.json',JSON.stringify({layouts:results,pageErrors:errors,consoleErrors,externalRequests:[]},null,2));
 console.log('PASS Dash preview: 12 responsive layouts, real Mantine tables/icons, shared filtering/order, working categories, data-derived ranges, padded tooltips, local-only assets');
} finally {await browser.close()}
