/** Checks notebook review layout and report dates without creating appointments. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN||'http://127.0.0.1:8983';
const out=process.env.STELLIS_MAYA_EVIDENCE||'/tmp/maya-notebook-review-actions';
assert.equal(process.env.STELLIS_TEST_DISPOSABLE,'1');await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.STELLIS_BROWSER,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function api(path,method='GET',data){const response=await context.request.fetch(origin+'/api/v1'+path,{method,data});assert(response.ok(),await response.text());return response.json();}
async function upload(year){const response=await context.request.post(origin+'/api/v1/demo/upload',{multipart:{file:{name:`maya-${year}.zip`,mimeType:'application/zip',buffer:await readFile(`src/stellis/static/maya/years/maya-${year}.zip`)}}});assert(response.ok(),await response.text());return response.json();}
try{
 await api('/demo/history','DELETE');await api('/demo/enter','POST');const review=await upload(2022);const status=await api('/demo/status');
 await context.addInitScript(generation=>{if(!localStorage.getItem('stellis-maya-story:'+generation))localStorage.setItem('stellis-maya-story:'+generation,JSON.stringify({year:0,turn:3,mode:'year',open:true,completed:[]}));},status.generation);
 await page.goto(origin);const story=page.getByRole('dialog',{name:'Maya’s story',exact:true});await story.getByRole('button',{name:'Confirm dates',exact:true}).waitFor();
 assert.equal(await story.getByLabel('D001 visit or test date',{exact:true}).inputValue(),'2022-01-18');assert(await story.getByRole('button',{name:'Continue as Maya',exact:true}).isDisabled());
 assert(await story.getByText('From page 1: Clinical date 2022-01-18',{exact:true}).isVisible());
 await story.getByRole('button',{name:'Confirm dates',exact:true}).click();await story.getByText('Dates confirmed',{exact:true}).waitFor();assert.equal((await api('/care-events')).events.length,0);
 await story.getByRole('button',{name:'Continue as Maya',exact:true}).click();await story.getByRole('heading',{name:'Suggested notebooks',exact:true}).waitFor();
 const choices=story.locator('.maya-notebook-options .catalogue-option');assert.equal(await choices.count(),3);
 for(const choice of await choices.all())assert(await choice.evaluate(label=>{const box=label.querySelector('input').getBoundingClientRect(),text=label.querySelector('span').getBoundingClientRect();return getComputedStyle(label).display==='flex'&&text.left-box.right>=12&&label.getBoundingClientRect().height>=44;}));
 await choices.first().click();assert.equal(await choices.first().getByRole('checkbox').isChecked(),false);
 for(const checkbox of await choices.getByRole('checkbox').all())await checkbox.uncheck();assert(await story.getByRole('button',{name:'Add notebooks and file records',exact:true}).isDisabled());
 for(const checkbox of await choices.getByRole('checkbox').all())await checkbox.check();await page.screenshot({path:out+'/desktop.png'});
 await story.getByRole('button',{name:'Add notebooks and file records',exact:true}).click();await story.getByText('8 records filed / 3 notebooks',{exact:true}).waitFor();assert.equal((await api('/notebooks')).notebooks.length,3);assert.equal((await api('/care-events')).events.length,0);
 const next=await upload(2023);await api('/demo/years/2023/dates','POST',{dates:Object.fromEntries(next.documents.map(record=>[record.id,record.date_suggestion.date]))});
 await page.evaluate(generation=>localStorage.setItem('stellis-maya-story:'+generation,JSON.stringify({year:1,turn:4,mode:'year',open:true,completed:[]})),status.generation);await page.reload();await story.getByRole('heading',{name:'Suggested notebooks',exact:true}).waitFor();assert(await story.getByText(/Existing notebook/).count());assert(await story.getByText(/New notebook/).count());await page.setViewportSize({width:390,height:844});await story.locator('.maya-notebook-review').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/phone-existing.png'});
 await story.getByRole('button',{name:'Close',exact:true}).click();await page.goto(origin+'/document/'+review.documents[0].id);await page.getByLabel('Visit or test date',{exact:true}).waitFor();assert.equal(await page.getByLabel('Visit or test date',{exact:true}).inputValue(),'2022-01-18');await page.getByRole('button',{name:'Save date',exact:true}).click();await page.locator('.document-date-review').getByText('Date confirmed',{exact:true}).first().waitFor();assert.equal((await api('/care-events')).events.length,0);
 assert(!/encounter/i.test(await page.locator('.document-date-review').innerText()));
 await page.setViewportSize({width:1440,height:1000});await page.goto(origin);await page.locator('#new-collection').click();
 const catalogue=page.getByRole('dialog',{name:'Add Notebook',exact:true});await catalogue.getByLabel('Search notebooks',{exact:true}).fill('Nutrition');
 const standardRow=catalogue.locator('label.catalogue-option').filter({has:page.getByText('Nutrition',{exact:true})});await standardRow.waitFor();
 assert(await standardRow.evaluate(label=>{const box=label.querySelector('input').getBoundingClientRect(),text=label.querySelector('span').getBoundingClientRect();return getComputedStyle(label).display==='flex'&&text.left-box.right>=12;}));
 await catalogue.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({passed:true,plain_date_labels:true,prefilled_dates:true,appointments_created:0,notebook_rows_aligned:true,whole_row_selection:true,empty_selection_disabled:true,new_and_existing_notebooks:true,errors},null,2));
 console.log('PASS prefilled report dates create no appointments; notebook review aligns and saves selections');
}finally{await context.close();await browser.close();}
