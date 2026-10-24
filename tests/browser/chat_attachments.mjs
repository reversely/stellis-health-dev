/** Chat uploads, message persistence and notebook filing in an isolated test workspace. */
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE||'playwright-core');
const origin=process.env.STELLIS_TEST_ORIGIN||'http://127.0.0.1:8879';
const browser=await chromium.launch({headless:true,...(process.env.STELLIS_BROWSER?{executablePath:process.env.STELLIS_BROWSER}:{})});
const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const api=async(path,method='get',data)=>{
  const response=await page.request[method](origin+'/api/v1'+path,{data});assert(response.ok(),path+' '+await response.text());return response.json();
};
const fixture=Buffer.concat([await readFile(process.env.STELLIS_ATTACHMENT_FIXTURE||'src/stellis/sample_records/2017-02-09-lab-results.pdf'),Buffer.from('\n% '+Date.now())]);
const filename='chat-review-'+Date.now()+'.pdf';
const book=await api('/notebooks','post',{name:'Chat attachment '+Date.now()});
const agent=(await api('/agents'))[0];
const out=process.env.STELLIS_TEST_SCREENSHOTS;
if(out)await mkdir(out,{recursive:true});
try {
  await page.goto(origin+'/chat/'+agent.id);
  const composer=page.locator('.agent-composer');await composer.getByRole('button',{name:'Attach',exact:true}).waitFor();
  await composer.locator('input[type=file]').setInputFiles({name:filename,mimeType:'application/pdf',buffer:fixture});
  await composer.locator('.chat-file').getByRole('link',{name:filename,exact:true}).waitFor();
  await page.reload();await composer.locator('.chat-file').getByRole('link',{name:filename,exact:true}).waitFor();
  await composer.getByLabel('Notebook for '+filename).selectOption(book.id);
  await composer.getByRole('button',{name:'Save to notebook',exact:true}).click();
  await composer.getByRole('link',{name:'Saved to notebook',exact:true}).waitFor();
  await composer.locator('textarea').fill('What does this attachment say?');
  await composer.getByRole('button',{name:'Send',exact:true}).click();
  const saved=page.locator('.agent-thread-feed .chat-file').getByRole('link',{name:filename,exact:true});
  await saved.waitFor({timeout:30000});await page.reload();await saved.waitFor();
  for(const theme of ['light','dark'])for(const width of [360,390,768,1280,1920]) {
    await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'agent overflow '+width);
    if(out)await page.screenshot({path:`${out}/agent-${theme}-${width}.png`});
  }
  await page.goto(origin+'/notebook/'+book.id);
  await page.getByRole('tab',{name:'Records',exact:true}).click();
  await page.locator('#notebook-items-table a[href^="/document/"]').waitFor();
  await page.getByRole('tab',{name:'Ask',exact:true}).click();
  const notebook=page.locator('.nb-composer');
  const second='second-'+filename;
  await notebook.locator('input[type=file]').setInputFiles({name:second,mimeType:'application/pdf',buffer:fixture});
  await notebook.locator('.chat-file').getByRole('link',{name:filename,exact:true}).waitFor();
  // Duplicate files retain their canonical filename and notebook association.
  await notebook.locator('textarea').fill('Summarize the attachment');
  const reply=page.waitForResponse(response=>response.url().endsWith('/notebooks/'+book.id+'/ask'));
  await notebook.getByRole('button',{name:'Send',exact:true}).click();
  const answered=await reply;assert(answered.ok(),await answered.text());
  await page.locator('.nb-messages .chat-file').getByRole('link',{name:filename,exact:true}).waitFor({timeout:30000});
  await page.reload();await page.locator('.nb-messages .chat-file').getByRole('link',{name:filename,exact:true}).waitFor();
  for(const theme of ['light','dark'])for(const width of [360,390,768,1280,1920]) {
    await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'notebook overflow '+width);
    await page.locator('.nb-messages .chat-file').last().scrollIntoViewIfNeeded();
    const bounds=await page.locator('.nb-messages .chat-file').last().boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width,'attachment bounds '+width);
    if(out)await page.screenshot({path:`${out}/notebook-${theme}-${width}.png`});
  }
  assert.deepEqual(errors,[]);console.log('Chat attachment upload, filing, send, reload and 20 layout checks passed');
}finally{await browser.close();}
