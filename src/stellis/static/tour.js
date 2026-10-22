// The workspace guide uses live account objects. Retired spotlight progress is ignored.
(() => {
  const query = new URLSearchParams(location.search);
  const names = ['workspace','notebook','chat','instructions','models','traces','recording'];
  const node = (tag, text, cls) => { const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n; };
  let panel, observer, target, timeout;
  async function api(path, method='GET') {
    const response=await fetch('/api/v1'+path,{method});const data=await response.json();
    if(!response.ok)throw Error(data.detail||'Could not load your workspace. Try again.');return data;
  }
  async function openSetup(event) {
    const button=event.currentTarget;button.disabled=true;
    try {await api('/onboarding/reopen','POST');location.assign('/onboarding');}
    catch(error){button.disabled=false;const status=panel?.querySelector('.guide-status')||document.querySelector('#status');status.textContent=error.message;status.setAttribute('role','alert');}
  }
  document.getElementById('workspace-setup')?.addEventListener('click',openSetup);
  document.getElementById('take-tour')?.addEventListener('click',()=>location.assign('/?guide=workspace'));
  if(!names.includes(query.get('guide')))return;
  const index=names.indexOf(query.get('guide'));
  const motion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
  function stopWatching(){observer?.disconnect();clearTimeout(timeout);target?.classList.remove('guide-target');}
  function close(){stopWatching();resize.disconnect();panel?.remove();document.documentElement.style.removeProperty('--guide-height');const url=new URL(location.href);url.searchParams.delete('guide');history.replaceState(history.state,'',url);const title=document.querySelector('#page-title');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}}
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))close();});
  async function context(){const [books,agents]=await Promise.all([api('/notebooks'),api('/agents')]);const book=books.notebooks[0];return {book,agent:agents.find(a=>a.is_default)||agents[0]};}
  function route(name,data){if(name==='notebook')return data.book?'/notebook/'+encodeURIComponent(data.book.id):'/';if(['chat','instructions'].includes(name))return data.agent?'/chat/'+encodeURIComponent(data.agent.id):'/chat';if(['models','traces'].includes(name))return '/settings';if(name==='recording')return '/recording';return '/';}
  async function go(step){
    if(document.querySelector('#stop-recording')?.checkVisibility()&&!document.querySelector('#stop-recording').disabled){notice.textContent='Stop and save your recording before changing guide pages.';return;}
    try{const data=await context();location.assign(route(names[step],data)+'?guide='+names[step]);}catch(error){notice.textContent=error.message;}
  }
  panel=node('section',null,'workspace-guide');panel.setAttribute('aria-label','Workspace guide');
  const heading=node('h2','Loading your workspace…');heading.tabIndex=-1;
  const description=node('p');const notice=node('p',null,'guide-status');notice.setAttribute('role','status');
  const actions=node('div',null,'guide-actions');const position=node('span',`${index+1} of ${names.length}`);
  function button(text,action){const b=node('button',text);b.type='button';b.addEventListener('click',action);actions.append(b);return b;}
  const show=button('Show controls',()=>{if(target){target.scrollIntoView({block:'center',behavior:motion()});if(!target.hasAttribute('tabindex')&&!target.matches('input,button,select,textarea,a'))target.tabIndex=-1;target.focus({preventScroll:true});}});show.disabled=true;
  if(index>0)button('Back',()=>go(index-1));
  button(index===names.length-1?'Finish tour':'Next',()=>index===names.length-1?close():go(index+1));
  button('Close tour',close);actions.append(position);panel.append(heading,description,notice,actions);(document.querySelector(location.pathname.startsWith('/chat')?'#agent-chat-view':location.pathname.startsWith('/notebook/')?'#notebook-view':location.pathname==='/settings'?'#settings-view':location.pathname==='/recording'?'.recording-workspace-main':'.home-main')||document.querySelector('main')).prepend(panel);heading.focus({preventScroll:true});
  const resize=new ResizeObserver(()=>document.documentElement.style.setProperty('--guide-height',panel.offsetHeight+'px'));resize.observe(panel);
  window.addEventListener('pagehide',()=>{stopWatching();resize.disconnect();},{once:true});
  function watch(selector,activate){
    let activated=false;
    const check=()=>{if(activate&&!activated){const tab=document.querySelector(activate);if(tab?.checkVisibility()){tab.click();activated=true;}}
      const next=document.querySelector(selector);if(!next?.checkVisibility())return false;
      if(target!==next){target?.classList.remove('guide-target');target=next;target.classList.add('guide-target');}show.disabled=false;if(notice.textContent)notice.textContent='';return true;};
    observer=new MutationObserver(()=>check());observer.observe(document.querySelector('main'),{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
    check();timeout=setTimeout(()=>{if(!target){notice.textContent='These controls have not loaded. You can retry or continue the tour.';button('Retry',()=>location.reload());}},12000);
  }
  (async()=>{try{
    const data=await context();
    const steps={
      workspace:['Your workspace','Collections group your notebooks. Use search to find notes, meetings and sources across them.','#notebooks-section'],
      notebook:['Inside a notebook',data.book?`“${data.book.name}” holds its notes, meetings and tasks. Add a note or record here to keep new material in context.`:'You have no notebooks yet. Create one here, or use Set up workspace to choose uses and connect sources.',data.book?'#notebook-hero':'#new-notebook'],
      chat:['Ask Stellis','Choose a notebook in the composer, then ask a question. Replies and drafts stay in this thread.','.agent-composer'],
      instructions:['Give Stellis instructions','Use Setup to edit what Stellis should know and how it answers.','#agent-panel-setup'],
      models:['Choose your models','Check connections to load installed models. Each role has its own model selection and Save action. Your active inference mode is shown here.','#inference-routes'],
      traces:['Inspect a request','Recent requests show execution steps, model routing and reported token counts. Ask Stellis something, then refresh to inspect it. Prompts and reply text are not stored here.','#inference-traces'],
      recording:['Record in context','Choose your microphone and notebook, then start when ready. Notes and live transcript stay alongside the recording. Stop saves it for review.','#start-recording']
    };
    const [title,copy,selector]=steps[names[index]];heading.textContent=title;description.textContent=copy;
    if(['notebook','chat','instructions'].includes(names[index])&&(!data.book||!data.agent))button('Set up workspace',openSetup);
    watch(selector,names[index]==='instructions'&&data.agent?'#agent-tab-setup':null);
  }catch(error){heading.textContent='Workspace guide';notice.textContent=error.message;button('Retry',()=>location.reload());}})();
})();
