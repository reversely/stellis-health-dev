/** Exercises all five yearly ZIPs and native tools with real source-linked inference. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const out=process.env.STELLIS_MAYA_EVIDENCE||'/tmp/stellis-maya-yearly';await fs.mkdir(out,{recursive:true});
const results=[];
const browser=await chromium.launch({executablePath:process.env.STELLIS_BROWSER,args:['--no-sandbox','--disable-gpu']});
const context=await browser.newContext({viewport:{width:Number(process.env.STELLIS_MAYA_WIDTH||1440),height:1000},recordVideo:{dir:out,size:{width:1440,height:1000}},reducedMotion:'reduce',timezoneId:'America/Toronto'});const page=await context.newPage();page.setDefaultTimeout(30000);
const base=process.env.STELLIS_TEST_ORIGIN||'http://127.0.0.1:8980';const story=page.getByRole('dialog',{name:'Maya’s story',exact:true});const dock=page.getByRole('region',{name:'Maya’s story',exact:true});
const data=JSON.parse(await fs.readFile('src/stellis/static/maya/story.json','utf8'));
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 assert.equal(process.env.STELLIS_TEST_DISPOSABLE,'1','Run only against an explicitly disposable test app');await context.request.delete(base+'/api/v1/demo/history');await page.goto(base);await page.locator('#library-more summary').click();await page.locator('#take-tour').click();await story.getByRole('button',{name:'Start Maya’s demo',exact:true}).click();
 for(const year of data.years){for(const [i,turn] of year.turns.entries()){
  console.log(year.year,i,turn.kind);await new Promise(resolve=>setTimeout(resolve,Number(process.env.STELLIS_MAYA_PACE_MS||0)));await story.getByText(`Situation ${i+1} of ${year.turns.length}`,{exact:true}).waitFor();
  if(turn.kind==='upload'){
   await story.getByLabel(`${year.year} demo ZIP`,{exact:true}).setInputFiles(`src/stellis/static/maya/years/maya-${year.year}.zip`);await story.getByText(`${year.record_count} demo records added /`,{exact:false}).waitFor();
  }else if(turn.kind==='dates'){
   const values=await story.locator('input[type=date]').evaluateAll(nodes=>nodes.map(n=>n.value));assert(values.every(Boolean));await story.getByRole('button',{name:'Confirm encounter dates',exact:true}).click();await story.getByText('Encounter dates confirmed',{exact:true}).waitFor();
  }else if(turn.kind==='notebooks'){
   await story.getByRole('button',{name:'Add notebooks and file records',exact:true}).click();await story.getByText(/records filed/).waitFor();
  }else{
   const names={cycle:'Open Cycle',appointment:'Add appointment',timeline:'Open timeline',chat:'Ask Stellis',milestone:'Add due-date milestone',birth:'Update birth milestone',overview:'Open My Health'};
   await story.getByRole('button',{name:names[turn.kind],exact:true}).click();
   if(turn.kind==='cycle'){
    const form=page.getByRole('dialog',{name:'Add period',exact:true});await form.getByLabel('Period start',{exact:true}).waitFor();assert.equal(await form.getByLabel('Period start',{exact:true}).inputValue(),turn.start);await form.getByRole('button',{name:'Save',exact:true}).click();await form.waitFor({state:'hidden'});
   }else if(turn.kind==='appointment'){
    const form=page.getByRole('dialog',{name:'Add Appointment',exact:true});await form.getByLabel('Title',{exact:true}).waitFor();assert.equal(await form.getByLabel('Title',{exact:true}).inputValue(),turn.title);await form.getByRole('button',{name:'Save appointment',exact:true}).click();await form.getByText('Appointment saved',{exact:true}).waitFor();await page.keyboard.press('Escape');
   }else if(turn.kind==='timeline'){
    await page.locator('#document-view').waitFor({state:'visible'});await page.locator('#document-body').getByText(turn.document_id,{exact:false}).first().waitFor();
   }else if(turn.kind==='milestone'||turn.kind==='birth'){
    const form=page.getByRole('dialog',{name:turn.kind==='birth'?'Edit milestone':'Add milestone',exact:true});await page.waitForFunction(turn=>document.querySelector(turn.kind==='birth'?'dialog input[aria-label="Confirmed date"]':'dialog input[aria-label="Milestone name"]')?.value===(turn.actual_date||turn.title),turn);await form.getByRole('button',{name:'Save',exact:true}).click();await form.waitFor({state:'hidden'});
   }else if(turn.kind==='chat'){
    await page.waitForFunction(question=>document.querySelector('.agent-composer textarea')?.value===question,turn.maya);await page.locator('.agent-composer button[type=submit]').click();
    const deadline=Date.now()+180000;let replied=false;
    while(Date.now()<deadline&&!replied){
     const agents=await (await context.request.get(base+'/api/v1/agents')).json();
     for(const agent of agents){const messages=await (await context.request.get(base+`/api/v1/agents/${agent.id}/messages`)).json();const q=messages.filter(m=>m.role==='user'&&m.content===turn.maya).at(-1);if(q&&messages.some(m=>m.job_id===q.job_id&&m.role==='agent'&&m.content.includes('/document/')))replied=true;}
     if(!replied)await new Promise(resolve=>setTimeout(resolve,500));
    }
    assert(replied,'A real cited reply must arrive');
    results.push({year:year.year,question:turn.maya,threads:await Promise.all((await (await context.request.get(base+'/api/v1/agents')).json()).map(async a=>({agent:a.name,messages:await (await context.request.get(base+`/api/v1/agents/${a.id}/messages`)).json()})))});
   }else await page.locator('#health-dashboard .dashboard-calendar').waitFor();
   await dock.getByRole('button',{name:'Open story',exact:true}).click();
  }
  const next=story.getByRole('button',{name:i===year.turns.length-1?'Next year':'Continue as Maya',exact:true});await next.waitFor();await page.screenshot({path:`${out}/${year.year}-${i}-${turn.kind}.png`});await next.click();
 }}
 assert.deepEqual(errors,[]);assert.equal((await (await context.request.get(base+'/api/v1/documents')).json()).length,70);await page.screenshot({path:out+'/complete.png'});await fs.writeFile(out+'/workflow_results.json',JSON.stringify({passed:true,errors,results},null,2));const generation=(await (await context.request.get(base+'/api/v1/demo/status')).json()).generation;
 await page.evaluate(generation=>{for(const storage of [localStorage,sessionStorage]){storage.setItem('stellis-compose:local:ordinary-sentinel','ordinary draft');storage.setItem('stellis-compose:local:demo-'+generation+':demo-sentinel','demo draft');}},generation);
 await story.getByRole('button',{name:'Clear demo history',exact:true}).click();await page.locator('#maya-demo-banner').waitFor({state:'hidden'});assert.equal((await (await context.request.get(base+'/api/v1/demo/status')).json()).documents,0);
 assert(await page.evaluate(generation=>[localStorage,sessionStorage].every(storage=>storage.getItem('stellis-compose:local:ordinary-sentinel')==='ordinary draft'&&!Object.keys(storage).some(key=>key.includes(':demo-'+generation+':'))),generation));console.log('PASS all five years with actual saves, report sources and live inference');
}catch(e){await page.screenshot({path:out+'/failure.png'});console.log((await page.locator('body').innerText()).slice(-5000));throw e;}finally{await context.close();await browser.close();}
