/** Onboarding selection persistence and approval in a disposable account. */
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8782';
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER});
const context=await browser.newContext({storageState:process.env.STELLIS_TEST_STORAGE});const page=await context.newPage();page.setDefaultTimeout(10000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function api(path,method='GET',data){const r=await page.request.fetch(origin+'/api/v1'+path,{method,data});assert.ok(r.ok(),await r.text());return r.json();}
try {
 for(const book of (await api('/notebooks')).notebooks) if(book.template_id === 'fitness--mobility') await api('/notebooks/'+book.id,'DELETE');
 await api('/onboarding/reopen','POST');await api('/onboarding','PUT',{uses:[],step:'review',notebook_choices:[]});
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/onboarding');
 await page.getByRole('button',{name:'Add Notebook',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Add Notebook'});await dialog.getByLabel('Search notebooks').fill('Mobility');
 await dialog.locator('.catalogue-option').filter({has:page.getByText('Mobility',{exact:true})}).getByRole('checkbox').check();
 await dialog.getByRole('button',{name:'Add notebooks',exact:true}).click();await dialog.waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelector('#setup-main')?.textContent.includes('Fitness'));
 for (let attempt = 0; attempt < 100; attempt++) {
   if ((await api('/onboarding')).notebook_choices?.some(g => g.notebook_name === 'Mobility')) break;
   await new Promise(resolve => setTimeout(resolve, 50));
 }
 assert.ok((await api('/onboarding')).notebook_choices?.some(g => g.notebook_name === 'Mobility'));
 await page.reload();
 await page.waitForFunction(()=>[...document.querySelectorAll('.setup-book-input')].some(n=>n.value==='Mobility')); 
 const names=await page.getByRole('textbox',{name:'Notebook name'}).evaluateAll(nodes=>nodes.map(n=>n.value));assert.ok(names.includes('Mobility'));
 assert.equal((await api('/notebooks')).notebooks.some(b=>b.name==='Mobility'),false);
 await page.getByRole('button',{name:/Set up .*notebook/}).click();await page.waitForURL(url => url.pathname === '/');
 assert.ok((await api('/notebooks')).notebooks.some(b=>b.name==='Mobility'));
 assert.deepEqual(errors,[]);console.log('PASS: onboarding catalogue choices persist before approval and create only on completion');
 // Leave an isolated review state for layout checks.
 await api('/onboarding/reopen','POST');const notes=await api('/intake');await api('/intake/notes','PUT',{revision:notes.notes_revision,sections:[{heading:'Goals',items:['Manage migraine and prepare for pregnancy','Improve nutrition']},{heading:'Conditions',items:['History of asthma']}]});const recommended=await api('/health-catalogue/recommendations');await api('/onboarding','PUT',{uses:[],step:'review',notebook_choices:recommended.groups.map(g=>({...g,include:true,proposed_name:g.notebook_name,suggest_tasks:false}))});
} finally {await browser.close();}
