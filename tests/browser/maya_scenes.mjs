/** Three data-driven chapters resolve real native views, with narrow-screen controls. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN||'http://127.0.0.1:8861';
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER||'/usr/bin/google-chrome'});const context=await browser.newContext({reducedMotion:'reduce',viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await context.request.post(origin+'/api/v1/demo/leave');await page.goto(origin);assert.equal(await page.locator('.maya-scene-dock').count(),0);
 await context.request.post(origin+'/api/v1/demo/enter');await page.reload();const dock=page.getByRole('navigation',{name:'Demo scenes'});await dock.waitFor();assert.equal(await dock.locator('.maya-chapter-button').count(),3);assert.equal(await page.locator('.maya-scene-card').isVisible(),false);
 const story=await (await context.request.get(origin+'/static/maya/story.json')).json();
 for(const chapter of story.chapters){await dock.getByRole('button',{name:chapter.label,exact:true}).click();assert.equal(await dock.locator('[aria-pressed=true]').textContent(),chapter.label);assert.equal(await dock.getByLabel('Demo scene').locator('option').count(),story.scenes.filter(s=>s.chapter===chapter.key).length);const card=page.locator('.maya-scene-card');if(await card.isVisible())await card.getByRole('button',{name:'Hide'}).click()}
 await dock.getByLabel('Demo scene').selectOption(String(story.scenes.findIndex(s=>s.key==='measurements')));await page.waitForURL('**/trends');await page.frameLocator('.dash-measurements-frame').getByText('Measurements',{exact:true}).first().waitFor();
 for(const theme of ['light','dark'])for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(500);const box=await dock.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(process.env.STELLIS_TEST_SCREENSHOTS){await mkdir(process.env.STELLIS_TEST_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.STELLIS_TEST_SCREENSHOTS}/chapters-${width}-${theme}.png`})}}
 await context.request.post(origin+'/api/v1/demo/leave');await page.reload();assert.equal(await dock.count(),0);assert.deepEqual(errors,[]);console.log('PASS three chapter dock: real measurement route, data-driven scenes, usable native select, hidden details, six layouts and no dock outside demo');
}finally{await context.close();await browser.close()}
