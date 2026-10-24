/** Audit actual routes plus contextual control states against shared design roles. */
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
const {chromium} = await import(process.env.STELLIS_PLAYWRIGHT_MODULE || 'playwright-core');
const origin = process.env.STELLIS_TEST_ORIGIN || 'http://127.0.0.1:8798';
const browser = await chromium.launch({headless:true, executablePath:process.env.STELLIS_BROWSER || '/usr/bin/google-chrome'});
const context = await browser.newContext({storageState:process.env.STELLIS_UI_STORAGE, reducedMotion:'reduce'});
let ids;
if (process.env.STELLIS_UI_ROUTES) {
  ids=JSON.parse(await readFile(process.env.STELLIS_UI_ROUTES));
} else {
  const api=async(path,data,method='post')=>{
    const response=await context.request[method](origin+'/api/v1'+path,{data});
    assert(response.ok(),path+' '+response.status());return response.json();
  };
  await api('/auth/register',{username:'ui-consistency',password:'correct horse battery staple'});
  await api('/onboarding',{uses:[],step:'review',agent_choices:{}},'put');
  await api('/onboarding/complete');
  const notebook=await api('/notebooks',{name:'Style audit',color:'#547980'});
  const note=await api('/pages',{title:'UI audit note',markdown:'Source text for interface checks',notebook_id:notebook.id});
  const response=await context.request.post(origin+'/api/v1/documents',{multipart:{file:{name:'audit.pdf',
    mimeType:'application/pdf',buffer:await readFile('src/stellis/sample_records/2026-04-02-lab-results.pdf')}}});
  assert(response.ok());ids={notebook:notebook.id,note:note.id,document:(await response.json()).document.id};
  for (let offset=0;offset<6;offset++) {
    const date=new Date();date.setUTCDate(date.getUTCDate()-offset);date.setUTCHours(0,0,0,0);
    for (const [measure,value] of [['weight',70+offset*.2],['pulse',72+offset]]) {
      await api('/readings',{measure,value,taken_at:date.toISOString(),notebook_id:notebook.id});
    }
  }
  const goal=await api('/goals',{activity:'walk',amount:20,times_per_week:3});
  await api(`/goals/${goal.id}/days/${new Date().toISOString().slice(0,10)}`,{done:true},'put');
}
const page = await context.newPage();
const errors = []; page.on('pageerror', error=>errors.push(error.message));
const results = [];
const style = locator => locator.evaluate(node=>{
  node.getAnimations().forEach(a=>a.finish());
  const s=getComputedStyle(node), r=node.getBoundingClientRect();
  return {fill:s.backgroundColor, ink:s.color, radius:s.borderRadius, padding:s.padding,
    font:s.fontFamily, fontSize:s.fontSize, height:r.height, width:r.width,
    outlineStyle:s.outlineStyle, outlineWidth:s.outlineWidth};
});
const routes = ['/', '/records', '/trends', '/summary', '/timeline', '/todos', '/settings', '/recording', '/chat', '/page/'+ids.note, '/notebook/'+ids.notebook, '/document/'+ids.document];
try {
  for (const theme of ['light','dark']) for (const width of [1280,390]) for (const route of routes) {
    await page.setViewportSize({width,height:900});
    await page.goto(origin+route);
    await page.evaluate(t=>{document.documentElement.classList.add('theme-swapping');localStorage.setItem('stellis-theme',t);document.documentElement.dataset.theme=t;},theme);
    const active = route==='/' ? '#list-view' : route.startsWith('/document/') ? '#document-view' : route.startsWith('/notebook/') ? '#notebook-view' : route.startsWith('/page/') ? '#page-view' : null;
    if (active) await page.locator(active).waitFor();
    if (route==='/') {
      await page.locator('#health-dashboard .dashboard-section-head h2').first().waitFor();
      await page.locator('#health-dashboard').getByRole('button',{name:'Log vital signs',exact:true}).waitFor();
      await page.locator('.coach-goal').first().waitFor({state:'attached'});
      await page.locator('#dashboard-tools').evaluate(n=>n.open=true);
    } else if (route==='/trends') await page.locator('.trend-card').first().waitFor();
    else if (route==='/records') await page.locator('.records-row').first().waitFor();
    else if (route==='/summary') await page.locator('.summary-body > *').first().waitFor();
    else if (route==='/timeline') await page.waitForFunction(()=>document.querySelector('.timeline-years')?.children.length || document.querySelector('.timeline-status')?.textContent.length);
    else if (route==='/todos') await page.locator('#todos-view .todo-empty, #todos-view .list-widget-rows').first().waitFor();
    else if (route==='/settings') await page.locator('.inference-route-editor').first().waitFor();
    else if (route==='/recording' || route.startsWith('/page/')) await page.locator('.notes-toolbar button:visible').first().waitFor();
    else if (route==='/chat') await page.locator('.agent-ask-form').first().waitFor();
    else if (route.startsWith('/notebook/')) await page.locator('.nb-input button[type=submit]').first().waitFor();
    await page.evaluate(()=>document.fonts.ready);
    if (route.startsWith('/document/')) await page.waitForFunction(()=>document.querySelector('.report-paper img')?.naturalWidth>0);
    await page.evaluate(()=>{for (const animation of document.getAnimations()) {
      if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
    }});
    const controls = await page.locator('button,input:not([type=hidden]),select,textarea,summary').evaluateAll(nodes=>nodes.filter(n=>n.checkVisibility() && !n.closest('.visually-hidden')).map(n=>{
      const s=getComputedStyle(n),r=n.getBoundingClientRect();
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const rgba=colour=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=colour;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data).map((x,i)=>i===3?x/255:x);};
      const over=(front,back)=>front.slice(0,3).map((x,i)=>x*front[3]+back[i]*(1-front[3]));
      const ancestors=[];for(let p=n;p;p=p.parentElement)ancestors.unshift(p);
      let background=[255,255,255];
      for(const parent of ancestors) {
        background=over(rgba(getComputedStyle(parent).backgroundColor),background);
        // Recording's solid rail is painted by a positioned pseudo-element.
        // Include it when it actually contains this control's rectangle.
        const pseudo=getComputedStyle(parent,'::before');
        const parentRect=parent.getBoundingClientRect();
        const top=parentRect.top+parseFloat(pseudo.top);
        if(pseudo.content!=='none' && pseudo.position==='absolute' &&
            r.top>=top && r.bottom<=top+parseFloat(pseudo.height)) {
          background=over(rgba(pseudo.backgroundColor),background);
        }
      }
      const foreground=over(rgba(s.color),background);
      const luminance=rgb=>rgb.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
      const values=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);
      const header=n.closest('header');
      // The shader/gradient rail has no solid CSS background to composite. Its
      // contrast is inspected in screenshots; do not report a fabricated ratio.
      const onRail=Boolean(n.closest('.home-rail')) || Boolean(header && header.getBoundingClientRect().width<innerWidth/2);
      const contrast=onRail?null:(values[0]+.05)/(values[1]+.05);
      return {contrast,disabled:Boolean(n.disabled),hasText:Boolean(n.textContent.trim()),label:(n.getAttribute('aria-label')||n.textContent||n.id).trim().slice(0,80),
        class:n.className,tag:n.tagName,type:n.type, fill:s.backgroundColor, ink:s.color,
        radius:s.borderRadius,padding:s.padding,height:r.height,width:r.width,font:s.fontFamily,fontSize:s.fontSize};
    }));
    for (const control of controls) {
      // These rectangles encode source coordinates, not ordinary UI targets. Native
      // checkboxes/radios have their label's touch target and retain their own size.
      if (control.class==='report-region' || ['checkbox','radio'].includes(control.type)) continue;
      if (!control.disabled && control.contrast!==null) assert(control.contrast >= ((control.hasText || ['INPUT','SELECT','TEXTAREA','SUMMARY'].includes(control.tag))?4.5:3)-.05, `${route} ${theme}: ${control.label} contrast ${control.contrast.toFixed(2)}`);
      assert(control.height>=43.9, `${route} ${width} ${theme}: ${control.label} is ${control.height}px tall`);
      if (['INPUT','TEXTAREA','SELECT'].includes(control.tag) && width===390) {
        assert(parseFloat(control.fontSize)>=16, `${route}: phone field ${control.label} is ${control.fontSize}`);
      }
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} ${width} ${theme}`);
    if (route==='/trends') {
      const manual=await style(page.locator('.trend-manual[data-log=pulse]'));
      const table=await style(page.getByRole('button',{name:'Show table',exact:true}).first());
      for (const key of ['fill','ink','radius','padding']) assert.equal(table[key],manual[key],`trend secondary ${key}`);
    }
    results.push({theme,width,route,controls});
    if (process.env.STELLIS_UI_EVIDENCE && (route==='/' || (route==='/trends' && width===390))) {
      await mkdir(process.env.STELLIS_UI_EVIDENCE,{recursive:true});
      await page.screenshot({path:`${process.env.STELLIS_UI_EVIDENCE}/${route==='/'?'home':'trends'}-${width}-${theme}.png`,fullPage:route!=='/trends'});
    }
    await page.evaluate(()=>document.documentElement.classList.remove('theme-swapping'));
  }
  // Colour blocks keep inverted ink: dark on light pages, light on dark pages.
  for (const theme of ['light','dark']) {
    await page.goto(origin);
    // Apply the theme without its colour transition so surfaces are final.
    await page.evaluate(t=>{document.documentElement.classList.add('theme-swapping');localStorage.setItem('stellis-theme',t);document.documentElement.dataset.theme=t;},theme);
    const blocks=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const rgb=colour=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=colour;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3);};
      const luminance=c=>c.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
      // Probe on the page and inside a dialog, whose dark-mode glass is a light surface.
      const dialog=document.createElement('dialog');document.body.append(dialog);
      const result=[];
      for (const [context,host] of [['page',document.body],['dialog',dialog]]) {
        // The first painted background up the tree is the surface behind the block.
        let surfaceColour='rgb(255, 255, 255)';
        for (let node=host;node;node=node.parentElement) {
          const colour=getComputedStyle(node).backgroundColor;
          if (colour!=='rgba(0, 0, 0, 0)' && colour!=='transparent') {surfaceColour=colour;break;}
        }
        const surface=luminance(rgb(surfaceColour));
        for (const [name,role] of [['',''],['alert','-alert'],['ok','-ok'],['calculated','-calculated'],['planned','-planned'],['muted','']]) {
          const probe=document.createElement('span');
          probe.style.background=`var(--block${role}-fill)`;
          probe.style.color=name==='muted'?'var(--block-muted)':`var(--block${role}-ink)`;
          host.append(probe);
          const s=getComputedStyle(probe);const fill=luminance(rgb(s.backgroundColor)), ink=luminance(rgb(s.color));
          probe.remove();
          const [hi,lo]=[fill,ink].sort((a,b)=>b-a);
          result.push({context,name:name||'block',contrast:(hi+.05)/(lo+.05),inkLighterThanFill:ink>fill,lightSurface:surface>.18});
        }
      }
      dialog.remove();
      return result;
    });
    for (const block of blocks) {
      assert(block.contrast>=4.5, `${theme} ${block.context} ${block.name} block contrast ${block.contrast.toFixed(2)}`);
      // Light surfaces carry dark blocks with light ink; dark surfaces flip both.
      assert.equal(block.inkLighterThanFill, block.lightSurface, `${theme} ${block.context} ${block.name} block ink is not inverted`);
    }
    results.push({theme,blocks});
  }
  // Check the form state that is hidden once an account has a saved goal.
  for (const theme of ['light','dark']) for (const width of [1280,390]) {
    await page.setViewportSize({width,height:900});await page.goto(origin);
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    await page.locator('.coach-goal').first().waitFor({state:'attached'});
    await page.locator('#dashboard-tools').evaluate(n=>n.open=true);
    await page.getByRole('button',{name:'Add a goal',exact:true}).click();
    const form=page.locator('.coach-form');await form.waitFor();
    const fields=await form.locator('input:not([type=checkbox]),select').evaluateAll(nodes=>
      nodes.filter(n=>n.checkVisibility()).map(n=>({height:n.getBoundingClientRect().height,size:parseFloat(getComputedStyle(n).fontSize)})));
    assert(fields.length>0);assert(fields.every(f=>f.height>=44 && (width>390 || f.size>=16)));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if (process.env.STELLIS_UI_EVIDENCE && width===390) await form.screenshot({path:`${process.env.STELLIS_UI_EVIDENCE}/goal-form-${theme}.png`});
    await form.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  // Real report controls exercise secondary, primary, disabled and focus roles.
  for (const theme of ['light','dark']) {
    await page.setViewportSize({width:1280,height:900});
    await page.goto(origin+'/document/'+ids.document);
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    const rotate=page.getByRole('button',{name:'Rotate',exact:true});
    await rotate.waitFor();
    const reference=await style(rotate);
    const open=page.getByRole('link',{name:'Open PDF',exact:true});
    for (const control of [open,page.getByRole('button',{name:'Zoom in',exact:true})]) {
      const actual=await style(control);
      assert.equal(actual.fill,reference.fill); assert.equal(actual.ink,reference.ink);
      assert.equal(actual.radius,reference.radius); assert.equal(actual.padding,reference.padding);
    }
    await rotate.hover(); const hovered=await style(rotate);
    assert.notEqual(hovered.fill,reference.fill);
    await page.mouse.move(0,0); await rotate.focus();
    assert.equal((await style(rotate)).outlineStyle,'solid');
    await rotate.evaluate(n=>n.disabled=true);const disabled=await style(rotate);
    assert.notEqual(disabled.fill,reference.fill);assert.notEqual(disabled.ink,reference.ink);
    await rotate.evaluate(n=>n.disabled=false);
    // Use a real capture dialog at both sizes to check geometry and focus return.
    for (const width of [1280,390]) {
      await page.setViewportSize({width,height:900});
      await page.locator('#global-add').click();
      const dialog=page.getByRole('dialog',{name:'Add',exact:true});
      await dialog.waitFor();
      const choices=await dialog.locator('.capture-choices button').evaluateAll(nodes=>
        nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
      assert.equal(choices.length,7);
      assert(Math.max(...choices.map(c=>c.width))-Math.min(...choices.map(c=>c.width))<1);
      assert(choices.every(c=>c.height>=56));
      const bounds=await dialog.boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=width);
      const screenshotDir=process.env.STELLIS_UI_EVIDENCE;
      if (screenshotDir) {
        await mkdir(screenshotDir,{recursive:true});
        await page.screenshot({path:`${screenshotDir}/capture-${width}-${theme}.png`,fullPage:true});
      }
      await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>document.activeElement.id),'global-add');
      if (screenshotDir) await page.screenshot({path:`${screenshotDir}/report-${width}-${theme}.png`,fullPage:true});
    }
  }
  assert.deepEqual(errors,[]);
  if (process.env.STELLIS_UI_EVIDENCE) await writeFile(process.env.STELLIS_UI_EVIDENCE+'/computed-styles.json',JSON.stringify({results,errors},null,2));
  console.log(`PASS ${results.length} route/theme/viewport checks; control targets, phone fields, secondary states, four goal-form states, focus, dialogs and overflow.`);
} finally {await context.close();await browser.close();}
