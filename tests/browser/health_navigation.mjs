/** Checks primary navigation, selected collections and the mobile notebook modal. */
import assert from 'node:assert/strict';
import {chmod} from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN||'http://127.0.0.1:8837';
const browser=await chromium.launch({executablePath:process.env.STELLIS_BROWSER,headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
const password='correct horse battery staple';
const api=async(path,data,method='post')=>{const r=await context.request[method](origin+'/api/v1'+path,{data});assert(r.ok(),path+' '+r.status());return r.json();};
let registered=false;
try {
 await api('/auth/register',{username:'navigation'+Date.now(),password});registered=true;
 await api('/onboarding',{uses:[],step:'review',agent_choices:{}},'put');await api('/onboarding/complete');
 const result=await api('/health-catalogue/activate',{selections:[{template_id:'nutrition--nutrition'},{template_id:'fitness--fitness'}]});
 const books=result.notebooks; const book=books[0];assert(book);
 await api('/notebooks/'+book.id,{name:'My nutrition notes'},'patch');
 await api('/notebooks/'+books[1].id,{archived:true},'patch');
 await api('/collections',{name:'Unused collection'});
 const note=await api('/pages',{title:'Saved note',markdown:'My saved content',notebook_id:book.id});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);
 const rail=page.locator('#home-rail');
 await rail.getByRole('link',{name:'My nutrition notes',exact:true}).waitFor();
 assert.deepEqual(await rail.locator('.rail-pinned a').allTextContents(),['My Health','Ask Stellis']);
 assert.equal(await rail.getByText('Unused collection',{exact:true}).count(),0);
 assert.equal(await rail.getByRole('link',{name:'Fitness',exact:true}).count(),0);
 assert.equal(await rail.getByText('Saved note',{exact:true}).count(),0);
 const toggle=rail.getByRole('button',{name:'Collapse Nutrition',exact:true});await toggle.click();
 assert.equal(await rail.getByRole('link',{name:'My nutrition notes',exact:true}).isVisible(),false);
 await rail.getByRole('button',{name:'Expand Nutrition',exact:true}).click();
 await rail.getByRole('link',{name:'My nutrition notes',exact:true}).click();assert.match(page.url(),new RegExp('/notebook/'+book.id));
 await page.goBack();await page.locator('#health-dashboard .dashboard-measure').first().waitFor();
 await page.getByRole('link',{name:'Full summary',exact:true}).click();
 await page.locator('#summary-view:not([hidden])').waitFor();
 await rail.locator('#rail-meetings[aria-current=page]').waitFor();
 for(const route of ['/summary','/trends','/records','/timeline','/todos','/page/'+note.id]) {
  await page.goto(origin+route);assert.equal(new URL(page.url()).pathname,route);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route);
 }
 for(const theme of ['light','dark']) {
  await page.evaluate(t=>localStorage.setItem('stellis-theme',t),theme);
  for(const width of [360,390,768,1024,1280,1920]) {
   await page.setViewportSize({width,height:900});await page.goto(origin);
   await page.locator('#health-dashboard .dashboard-measure').first().waitFor();
   if(width<=1000) {
    const open=page.getByRole('button',{name:'Notebooks',exact:true});await open.focus();await page.keyboard.press('Enter');
    const drawer=page.getByRole('dialog',{name:'Notebooks',exact:true});await drawer.waitFor();
    await drawer.getByRole('link',{name:'My nutrition notes',exact:true}).waitFor();
    await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});
    assert.equal(await open.evaluate(e=>e===document.activeElement),true);
    await open.click();await drawer.getByRole('button',{name:'Add Notebook',exact:true}).click();
    await page.getByRole('dialog',{name:'Add Notebook',exact:true}).waitFor();
    await page.keyboard.press('Escape');
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,theme+' '+width);
  }
 }
 if(process.env.STELLIS_NAVIGATION_STORAGE){await context.storageState({path:process.env.STELLIS_NAVIGATION_STORAGE});await chmod(process.env.STELLIS_NAVIGATION_STORAGE,0o600);}
 assert.deepEqual(errors,[]);
 console.log('PASS navigation: selected tree, collapse, notebooks, deep links, browser Back and mobile keyboard/modal flow in both themes');
} finally {
 if(registered&&!process.env.STELLIS_NAVIGATION_STORAGE)await context.request.delete(origin+'/api/v1/account',{data:{password,confirm:'DELETE'}});
 await browser.close();
}
