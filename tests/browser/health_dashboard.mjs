/** Checks dashboard choices and source links through an isolated account gateway. */
import assert from 'node:assert/strict';
import {readFile, chmod, writeFile} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8836';
const browser = await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER});
const context = await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
const password='correct horse battery staple';
const api = async (path,data,method='post') => {
 const response=await context.request[method](origin+'/api/v1'+path,{data});
 assert(response.ok(),path+' '+response.status());return response.json();
};
let registered=false;
try {
 await api('/auth/register',{username:'dashboard'+Date.now(),password});registered=true;
 await api('/onboarding',{uses:[],step:'review',agent_choices:{}},'put');await api('/onboarding/complete');
 const page=await context.newPage(); const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/static/trends.js',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.continue();});
 await page.goto(origin);
 const root=page.locator('#health-dashboard');
 await root.getByText('Add your records to see your health overview',{exact:true}).waitFor();
 assert.deepEqual(await root.locator('.dashboard-section-head h2').allTextContents(),['Health Overview','Upcoming','My Notebooks','Measurements','Health History']);
 await page.unroute('**/static/trends.js');
 assert.equal(await root.locator('.dashboard-measure').count(),3);
 assert.equal(await root.locator('.dashboard-measure time').count(),0);
 assert.equal(await page.getByRole('button',{name:'Log vital signs',exact:true}).count(),1);
 await api('/health-catalogue/activate',{selections:[{template_id:'nutrition--nutrition'}]});
 const books=(await api('/notebooks',undefined,'get')).notebooks;
 const book=books[0];assert(book);
 const note=await api('/pages',{title:'Care plan',markdown:'- [ ] Plan a follow-up',notebook_id:book.id});
 const upload=await context.request.post(origin+'/api/v1/documents',{multipart:{file:{name:'care-letter.png',mimeType:'image/png',buffer:await readFile('src/stellis/sample_records/2025-03-23-lab-results-photo.png')}}});
 assert(upload.ok());const document=(await upload.json()).document;
 await api('/documents/'+document.id,{title:'Care letter',record_date:'2026-10-21',notebook_id:book.id,move:true},'patch');
 await api('/readings',{measure:'weight',value:70,taken_at:'2026-10-20T08:00:00'});
 await api('/readings',{measure:'weight',value:71,taken_at:'2026-10-21T08:00:00'});
 await api('/dashboard/preferences',{notebooks:[book.id],measurements:['weight','sleep'],care_contexts:[book.id]},'put');
 await page.route('**/api/v1/calendar/meetings',route=>route.fulfill({json:{meetings:[{id:'fixture',provider:'google',title:'Scheduled consultation',start:'2099-01-04T10:00:00Z',end:'2099-01-04T11:00:00Z',notebook_id:book.id}],errors:[]}}));
 const target='/document/'+document.id+'?page=1';
 await page.route('**/api/v1/summary',route=>route.fulfill({json:{summary:{content:'## Overview\nA summary from the care letter [[1]]',citations:[{n:1,title:'Care letter',page:1,target,excerpt:'Fixture source'}]},document_count:1}}));
 await page.route('**/api/v1/facts',route=>route.fulfill({json:{facts:[{id:'fixture',kind:'allergy',name:'Fixture allergy <img src=x>',value:'',unit:'',date:'2026-10-21',target}]}}));
 await page.goto(origin);
 await root.getByText('Fixture allergy <img src=x>',{exact:true}).waitFor();
 assert.equal(await root.locator('img').count(),0);
 assert.equal(await root.getByRole('link',{name:'Source 1: Care letter',exact:true}).getAttribute('href'),target);
 assert.equal(await root.getByRole('link',{name:'Fixture allergy <img src=x>',exact:true}).getAttribute('href'),target);
 assert.equal(await root.locator('.dashboard-context').textContent(),book.name+(book.description||''));
 assert.equal(await root.locator('.dashboard-measure').count(),2);
 assert.equal(await root.locator('.dashboard-sparkline').count(),1);
 assert.equal(await root.locator('.dashboard-notebooks .dashboard-book .dashboard-meta').textContent(),'Nutrition');
 await root.getByRole('link',{name:'Scheduled consultation',exact:true}).waitFor();
 assert.match(await root.locator('.dashboard-upcoming').textContent(),/Scheduled/);
 await api('/documents/'+document.id,{record_date:'2099-01-05'},'patch');
 await page.reload();await root.locator('.dashboard-upcoming').getByText('Dated record — Care letter',{exact:true}).waitFor();
 assert.equal(await root.locator('.dashboard-upcoming').getByRole('link',{name:'Care letter',exact:true}).getAttribute('href'),'/document/'+document.id);
 await api('/documents/'+document.id,{record_date:'2026-10-21'},'patch');
 await page.locator('#library-more summary').click();await page.getByRole('button',{name:'Customize dashboard',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('group',{name:'Measurements',exact:true}).getByLabel('Pulse',{exact:true}).check();
 await dialog.getByRole('group',{name:'Measurements',exact:true}).getByLabel('Blood pressure',{exact:true}).check();
 await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await dialog.getByText('Choose up to three items in each section',{exact:true}).waitFor();
 assert.deepEqual((await api('/dashboard/preferences',undefined,'get')).measurements,['weight','sleep']);
 await dialog.getByRole('group',{name:'Measurements',exact:true}).getByLabel('Blood pressure',{exact:true}).uncheck();
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'detached'});
 await page.reload();await root.getByRole('link',{name:'Pulse',exact:true}).waitFor();
 assert.deepEqual((await api('/dashboard/preferences',undefined,'get')).measurements,['weight','pulse','sleep']);
 await root.getByRole('link',{name:'Log weight',exact:true}).click();
 await page.locator('.trend-form').waitFor();assert.match(page.url(),/log=weight/);
 await page.goBack();await root.locator('.dashboard-sparkline').waitFor();
 for (const theme of ['light','dark']) {
  await page.evaluate(theme=>localStorage.setItem('stellis-theme',theme),theme);
  for (const width of [360,390,768,1024,1280,1920]) {
   await page.setViewportSize({width,height:900});await page.reload();
   await root.getByRole('link',{name:'Pulse',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,theme+' '+width);
  }
 }
 assert.deepEqual(errors,[]);
 if(process.env.STELLIS_DASHBOARD_STORAGE) {
  await context.storageState({path:process.env.STELLIS_DASHBOARD_STORAGE});await chmod(process.env.STELLIS_DASHBOARD_STORAGE,0o600);
  await writeFile(process.env.STELLIS_DASHBOARD_STORAGE+'.fixture.json',JSON.stringify({book:book.id,note:note.id,document:document.id}));
 }
 console.log('PASS dashboard: empty state, source links, saved choices, chart/log deep links and both themes at six widths');
} finally {
 if(registered&&!process.env.STELLIS_DASHBOARD_STORAGE)await context.request.delete(origin+'/api/v1/account',{data:{password,confirm:'DELETE'}});
 await browser.close();
}
