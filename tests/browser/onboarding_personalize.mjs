const {chromium}=await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
import assert from 'node:assert/strict';
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.STELLIS_BROWSER,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+process.env.STELLIS_TEST_MICROPHONE_WAV,'--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({permissions:['microphone'],viewport:{width:1280,height:900}});
const origin=process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8840',password='personalization-proof-password';let registered=false;
try {
let r=await context.request.post(origin+'/api/v1/auth/register',{data:{username:'personal-'+Date.now(),password}});assert(r.ok());registered=true;
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin+'/onboarding');await page.getByRole('button',{name:'Get started',exact:true}).click();
await page.getByRole('heading',{name:'First, what should I call you?',exact:true}).waitFor();
await page.getByRole('button',{name:'Use microphone',exact:true}).click();
await page.getByText('Is that right?',{exact:true}).waitFor({timeout:40000});
const name=page.getByRole('textbox',{name:'First, what should I call you?',exact:true});
await page.waitForFunction(()=>document.querySelector('.profile-answer').value.toLowerCase().includes('alex'),{},{timeout:5000});
let state=await (await context.request.get(origin+'/api/v1/onboarding/profile')).json();assert(!state.answers.name);
await page.getByRole('button',{name:'Microphone on',exact:true}).click();
await name.fill('Alexandria');await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('heading',{name:'How do you describe your gender?',exact:true}).waitFor();
state=await (await context.request.get(origin+'/api/v1/onboarding/profile')).json();assert.equal(state.answers.name,'Alexandria');
await page.getByRole('button',{name:'Woman',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('heading',{name:'Do you have a period?',exact:true}).waitFor();await page.getByRole('button',{name:'Yes',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByLabel('When is your birth date?',{exact:true}).fill('1990-06-12');await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('button',{name:'None that I know of',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('heading',{name:'Do you take any medicines or supplements?',exact:true}).waitFor();await page.getByText('Search health library',{exact:true}).click();await page.getByLabel('Search health library',{exact:true}).fill('Tylenol');
await page.locator('.intake-library-item').first().waitFor({timeout:10000});await page.locator('.intake-library-item').first().click();
assert((await page.locator('.profile-answer').inputValue()).includes('Tylenol'));
await page.getByRole('button',{name:"I'll add them later",exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByLabel('What health goals would you like help navigating?',{exact:true}).fill('Navigate pregnancy\nSleep better');await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('button',{name:'Nutrition',exact:true}).click();await page.getByRole('button',{name:'General wellness',exact:true}).click();await page.getByRole('button',{name:'Sleep',exact:true}).click();
await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Are you interested in cycle tracking?',exact:true}).waitFor();
await page.getByRole('button',{name:'Yes',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
await page.getByRole('heading',{name:"You're all set",exact:true}).waitFor();
state=await (await context.request.get(origin+'/api/v1/onboarding/profile')).json();assert(state.complete);assert.deepEqual(state.answers.interests,['nutrition','wellness','sleep']);
assert.equal((await (await context.request.get(origin+'/api/v1/health/preferences')).json()).experiences_periods,true);
assert.equal((await (await context.request.get(origin+'/api/v1/reproductive')).json()).records.length,0);
assert.equal((await (await context.request.get(origin+'/api/v1/notebooks')).json()).notebooks.length,0);
await page.evaluate(() => {
  window.profileClosing = {pending:0, played:0, events:[]};
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function(...args) {
    window.profileClosing.pending++; window.profileClosing.played++;
    this.addEventListener('ended', () => window.profileClosing.pending--);
    return start.apply(this,args);
  };
  window.profileClosingCall = window.StellisIntakeCall.start(message => {
    window.profileClosing.events.push(message);
    if (message.type === 'ended') window.profileClosing.pendingAtEnd = window.profileClosing.pending;
  }, {path:'/api/v1/onboarding/profile/call?field=complete'});
});
await page.waitForFunction(() => window.profileClosing.events.some(event=>event.type==='ended'), {}, {timeout:60000});
const closing = await page.evaluate(() => window.profileClosing);
assert(closing.played > 0); assert.equal(closing.pendingAtEnd, 0);
assert(closing.events.some(event=>event.type==='say' && event.text.includes('Review notebooks') && event.text.includes('Goodbye')));
await page.evaluate(() => window.profileClosingCall.end());
await page.getByRole('button',{name:'Review notebooks',exact:true}).click();
await page.getByRole('heading',{name:'Review your notebooks',exact:true}).waitFor();
await page.getByRole('button',{name:/Set up \d+ notebooks?/}).click();
await page.waitForURL(url=>url.pathname==='/');
let books=(await (await context.request.get(origin+'/api/v1/notebooks')).json()).notebooks;
assert(books.some(book=>book.name==='Nutrition'));assert(books.some(book=>book.name==='Sleep'));
await context.request.post(origin+'/api/v1/onboarding/reopen');
await page.goto(origin+'/onboarding');await page.getByRole('button',{name:'Get started',exact:true}).click();
await page.reload();await page.getByRole('heading',{name:'First, what should I call you?',exact:true}).waitFor();assert.equal(await page.locator('.profile-answer').inputValue(),'Alexandria');
for(const theme of ['light','dark'])for(const width of [360,390,768,1024,1280,1440,1920]){
await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;localStorage.setItem('stellis-theme',theme)},theme);await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,theme+' '+width);
}
assert.deepEqual(errors,[]);
console.log('PASS spoken candidate correction, personal fields, library search, goals, interests, cycle preference and reload');
}finally{
if(registered)await context.request.delete(origin+'/api/v1/account',{data:{password,confirm:'DELETE'}});
await browser.close();
}
})().catch(e=>{console.error(e);process.exit(1)});
