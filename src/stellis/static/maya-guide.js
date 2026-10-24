/** Maya's yearly story uses isolated demo files and the existing health controls. */
(() => {
'use strict';
const dom=window.StellisDom, el=dom.el, api=dom.api;
let view, data, status, progress, key, activeReview;
const avatar=(maya,size=36)=>{const icon=window.StellisAgentAvatar.avatarElement(document,{seed:maya?'maya-chen-synthetic':'stellis',coordinator:!maya,size});if(maya)icon.style.setProperty('--avatar-color','var(--demo-frame)');return icon;};
const button=(label,run,primary=false)=>{const node=dom.button(label,`coach-button ${primary?'is-primary':'is-quiet'}`);node.addEventListener('click',async()=>{node.disabled=true;try{await run();}catch(error){notice(error.message);}finally{node.disabled=false;}});return node;};
const currentYear=()=>data.years[progress.year];
const currentTurn=()=>currentYear().turns[progress.turn];
function save(){if(key)localStorage.setItem(key,JSON.stringify(progress));}
function storyClock(){
 const year=currentYear(),turn=currentTurn();
 const day=turn.end||turn.start||turn.starts_at?.slice(0,10)||data.care_dates.filter(d=>d.startsWith(String(year.year))).at(-1);
 const changed=window.StellisDemoDate!==day;window.StellisDemoDate=status.active?day:null;
 if(changed&&status.active)window.dispatchEvent(new Event('stellis:health-preferences-changed'));
}
function notice(text){const node=view?.querySelector('[data-story-status]');if(node)node.textContent=text;}
async function navigate(path){await window.StellisNavigate(path);}
async function waitFor(selector){for(let i=0;i<80;i++){const node=document.querySelector(selector);if(node?.checkVisibility())return node;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('The health view could not open');}
function profile(year,large=false){
 const row=el('div',null,'maya-profile');row.append(avatar(true,large?64:36));
 const text=el('div');text.append(el('strong','Maya Chen'),el('span',`${year.year} / Toronto / Born 1993`));row.append(text);return row;
}
function closeView(){view?.remove();view=null;}
function banner(){
 document.getElementById('maya-demo-banner')?.remove();document.body.classList.toggle('is-maya-demo',Boolean(status?.active));
 if(!status?.active)return;
 const bar=el('aside',null,'maya-demo-banner');bar.id='maya-demo-banner';bar.setAttribute('aria-label','Demo workspace');
 bar.append(el('strong','Demo / Maya'),el('span','Story date '+window.StellisDemoDate),button('Maya’s story',()=>showYear()),button('My records',leave),button('Clear demo',clear));document.body.append(bar);
}
async function clear(){const generation=status.generation;await api('/demo/history',{method:'DELETE'});for(const store of [localStorage,sessionStorage])for(const name of Object.keys(store))if(name===key||name.includes(':demo-'+generation+':'))store.removeItem(name);location.reload();}
async function leave(){await api('/demo/leave',{method:'POST'});location.reload();}
async function refresh(){status=await api('/demo/status');if(status.active && status.years[String(currentYear().year)])activeReview=await api(`/demo/years/${currentYear().year}`);else activeReview=null;banner();}
function heading(title,year){
 const head=el('div',null,'maya-story-head');const identity=profile(year,true);const text=el('div',null,'maya-story-title');text.append(el('h2',title),el('p','Maya’s story / Scripted synthetic demo'));head.append(identity,text,button('Close',()=>{progress.open=false;save();closeView();}));return head;
}
function dialog(title){
 closeView();const node=el('dialog',null,'dashboard-dialog maya-story');node.setAttribute('aria-label',title);view=node;
 node.addEventListener('cancel',()=>{progress.open=false;save();});node.addEventListener('close',()=>{if(!node.open)node.remove();});document.body.append(node);node.showModal();return node;
}
function graphic(){
 const figure=el('figure',null,'maya-story-timelines');figure.setAttribute('aria-label','Maya’s life, care and period timelines');
 for(const [label,dates] of [['Life',data.life_events.map(e=>e.date)],['Records',data.care_dates],['Periods',data.cycle_dates]]){
  const row=el('div',null,'maya-timeline-track');row.append(el('span',label));const line=el('div',null,'maya-timeline-line');
  for(const date of dates){const marker=el('span',null,'maya-timeline-mark');marker.style.left=`${(Date.parse(date)-Date.parse('2022-01-01'))/(Date.parse('2027-01-01')-Date.parse('2022-01-01'))*100}%`;marker.title=label==='Life'?data.life_events.find(event=>event.date===date).label+' / '+date:date;if(label==='Life')marker.classList.add('is-life');if(label==='Periods')marker.classList.add('is-period');line.append(marker);}row.append(line);figure.append(row);
 }
 const years=el('div',null,'maya-timeline-years');years.append(el('span'));for(const y of data.years)years.append(el('span',String(y.year)));figure.append(years);return figure;
}
function showOverview(){
 progress.mode='overview';progress.open=true;save();const node=dialog('Maya’s story');node.append(heading('Meet Maya',currentYear()));
 const body=el('div',null,'maya-story-body');
 body.append(el('p','Maya is a fictional Toronto resident. Meet her at 28 as she starts tracking her health, then follow her through fertility care, IVF, pregnancy and life after birth.','maya-introduction'),
  el('p','Each year has its own demo ZIP and a set of situations to work through. Demo records, notebooks, tracking and conversations stay separate from your records.'),graphic());
 const years=el('div',null,'maya-year-list');
 for(const [index,year] of data.years.entries()){
  const chapter={2022:'2022 First concerns',2023:'2024–25 Changing care',2026:'2026 A new routine'}[year.year];if(chapter)years.append(el('h3',chapter));
  const row=button(`${year.year} / ${year.title}`,async()=>{progress.year=index;progress.turn=progress.completed?.includes(year.year)?year.turns.length-1:0;save();await refresh();showYear();});
  row.disabled=!status.active||index>progress.year&&!progress.completed?.includes(data.years[index-1]?.year);row.setAttribute('aria-current',index===progress.year?'step':'false');years.append(row);
 }
 body.append(years);node.append(body);const foot=el('div',null,'maya-story-actions');
 foot.append(button(status.active?'Continue as Maya':'Start Maya’s demo',async()=>{
  if(!status.active){await api('/demo/enter',{method:'POST'});sessionStorage.setItem('stellis-open-maya','1');location.reload();return;}
  showYear();
 },true));if(status.active)foot.append(button('Clear demo history',clear));node.append(foot);
}
function message(maya,text){const article=el('article',null,`agent-message ${maya?'agent-message-user':'agent-message-agent'} maya-story-message`);const who=el('strong',null,'agent-message-author');who.append(avatar(maya,28),document.createTextNode(maya?'Maya':'Stellis'));article.append(who,el('p',text));return article;}
function collapse(){
 progress.mode='dock';progress.open=true;save();closeView();const dock=el('section',null,'coach-call maya-story-dock');dock.setAttribute('aria-label','Maya’s story');
 const head=el('div',null,'maya-story-head');head.append(profile(currentYear()),button('Open story',showYear));const hint=el('p',currentTurn().stellis);const error=el('p');error.dataset.storyStatus='';error.role='status';dock.append(head,hint,error);view=dock;document.body.append(dock);
}
async function showYear(){
 if(!status.active){showOverview();return;}
 progress.mode='year';progress.open=true;save();storyClock();await refresh();const year=currentYear(), turn=currentTurn();const node=dialog('Maya’s story');
 node.append(heading(`${year.year} / ${year.title}`,year));const nav=el('div',null,'maya-story-year-nav');nav.append(button('Maya’s timeline',showOverview),el('span',`Situation ${progress.turn+1} of ${year.turns.length}`),button('Use health interface',()=>{collapse();navigate('/');}));node.append(nav);
 const body=el('div',null,'maya-story-body');const log=el('div',null,'maya-story-log');log.setAttribute('role','log');log.setAttribute('aria-label',`Maya’s ${year.year} story`);
 if(progress.turn){const earlier=el('details',null,'maya-earlier-turns');earlier.append(el('summary','Earlier situations'));for(const item of year.turns.slice(0,progress.turn)){earlier.append(message(true,item.maya),message(false,item.stellis));}log.append(earlier);}
 log.append(message(true,turn.maya),message(false,turn.stellis));body.append(log);
 const tool=el('section',null,'maya-story-tool');tool.setAttribute('aria-label','Current action');body.append(tool);await renderTool(tool,turn,year);const error=el('p');error.dataset.storyStatus='';error.role='status';body.append(error);node.append(body);
 const actions=el('div',null,'maya-story-actions');
 if(!['upload','dates','notebooks'].includes(turn.kind))actions.append(button('Check my action',async()=>{await refresh();if(await completed(turn)){progress.checked=true;save();showYear();}else notice('Complete the current action in the health interface');}));
 const next=button(progress.turn===year.turns.length-1?'Next year':'Continue as Maya',async()=>{
  if(!await completed(turn)){notice('Complete the current action first');return;}
  progress.checked=false;
  if(progress.turn<year.turns.length-1)progress.turn++;
  else{progress.completed=[...new Set([...(progress.completed||[]),year.year])];if(progress.year<4){progress.year++;progress.turn=0;}else{save();showOverview();return;}}
  save();await showYear();
 },true);
 next.disabled=['upload','dates','notebooks'].includes(turn.kind)&&!await completed(turn);actions.append(next);if(progress.turn)actions.append(button('Previous situation',()=>{progress.turn--;save();showYear();}));node.append(actions);
}
async function renderTool(host,turn,year){
 const controls=el('div',null,'document-actions');host.append(controls);
 if(turn.kind==='upload'){
  const link=el('a',`Download ${year.year} demo ZIP`,'coach-button');link.href=`/static/maya/years/maya-${year.year}.zip`;link.download=`maya-${year.year}.zip`;host.append(link);
  const box=el('label',null,'records-drop maya-demo-drop');box.append(dom.icon('upload'),el('strong',`Upload ${year.year} demo ZIP`),el('span','Demo files only'));
  const picker=el('input');picker.type='file';picker.accept='.zip,application/zip';picker.setAttribute('aria-label',`${year.year} demo ZIP`);box.append(picker);
  const upload=async file=>{if(!file)return;notice('Checking and importing demo records');const form=new FormData();form.append('file',file);try{await api('/demo/upload',{method:'POST',body:form});await window.reloadLibrary?.();await showYear();}catch(error){notice(error.message);}};
  picker.addEventListener('change',()=>upload(picker.files[0]));box.addEventListener('dragover',e=>e.preventDefault());box.addEventListener('drop',e=>{e.preventDefault();upload(e.dataTransfer.files[0]);});host.append(box);
  if(activeReview)host.append(el('p',`${activeReview.documents.length} demo records added / ${status.notebooks.length} notebooks`));
 }else if(turn.kind==='dates'){
  if(!activeReview){host.append(el('p','Upload this year’s ZIP first'));return;}
  host.append(el('h3','Report dates'),el('p','These dates place your reports on the health timeline','dashboard-meta'));
  const form=el('form',null,'capture-form maya-date-review');const inputs=new Map();
  for(const record of activeReview.documents){const label=el('label',null,'capture-field');label.append(el('strong',record.title),el('span','Visit or test date'));const field=el('input');field.type='date';field.required=true;field.setAttribute('aria-label',record.corpus_id+' visit or test date');field.value=record.record_date||record.date_suggestion.date||'';label.append(field);form.append(label);const quote=record.date_suggestion.candidates.find(c=>c.date===field.value);if(quote)form.append(el('small',`From page ${quote.page}: ${quote.quote}`));inputs.set(record.id,field);}
  if(activeReview.dates_confirmed)host.append(el('p','Dates confirmed'));
  const save=button('Confirm dates',()=>{},true);save.type='submit';form.append(save);form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{await api(`/demo/years/${year.year}/dates`,{method:'POST',json:{dates:Object.fromEntries([...inputs].map(([id,input])=>[id,input.value]))}});await showYear();}catch(error){notice(error.message);save.disabled=false;}});host.append(form);
 }else if(turn.kind==='notebooks'){
  if(!activeReview)return;
  const review=el('section',null,'list-widget maya-notebook-review');
  const heading=el('div',null,'list-widget-head');heading.append(el('h3','Suggested notebooks'),el('span',`${status.notebooks.length} in your library`,'dashboard-meta'));review.append(heading);
  const choices=el('fieldset',null,'list-widget-rows maya-notebook-options');
  choices.append(el('legend','Suggested notebooks','visually-hidden'));
  const selected=[];
  for(const suggestion of activeReview.suggestions){
   const label=el('label',null,'catalogue-option list-widget-row');
   const checkbox=el('input');checkbox.type='checkbox';checkbox.checked=true;checkbox.value=suggestion.template_id;selected.push(checkbox);
   const description=el('span',null,'list-widget-text');description.append(el('strong',suggestion.name),el('small',`${suggestion.record_count} records / ${suggestion.existing?'Existing notebook':'New notebook'}`));
   label.append(checkbox,description);choices.append(label);
  }
  review.append(choices);
  const actions=el('div',null,'maya-notebook-actions');const count=el('span',null,'dashboard-meta');
  const approve=button('Add notebooks and file records',async()=>{await api(`/demo/years/${year.year}/notebooks`,{method:'POST',json:{templates:selected.filter(c=>c.checked).map(c=>c.value)}});await window.reloadLibrary?.();await showYear();},true);
  const selectionChanged=()=>{const total=selected.filter(input=>input.checked).length;count.textContent=`${total} selected`;approve.disabled=!total;};
  for(const checkbox of selected)checkbox.addEventListener('change',selectionChanged);selectionChanged();
  actions.append(approve,count);review.append(actions);host.append(review);
  if(activeReview.filed)host.append(el('p',`${activeReview.documents.filter(r=>r.notebook_id).length} records filed / ${status.notebooks.length} notebooks`,'dashboard-meta'));

 }else controls.append(button(actionLabel(turn.kind),()=>useTool(turn),true));
}
function actionLabel(kind){return {cycle:'Open Cycle',appointment:'Add appointment',timeline:'Open timeline',chat:'Ask Stellis',milestone:'Add due-date milestone',birth:'Update birth milestone',overview:'Open My Health'}[kind]||'Open health interface';}
function localInput(value){const d=new Date(value);const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;}
async function useTool(turn){
 collapse();
 if(turn.kind==='appointment'){
  await window.StellisCapture.open('appointment');const title=await waitFor('dialog.health-capture input[aria-label="Title"]');title.value=turn.title;
  document.querySelector('dialog.health-capture input[aria-label="When"]').value=localInput(turn.starts_at);return;
 }
 if(turn.kind==='chat'){
  await navigate('/chat');const input=await waitFor('.agent-composer textarea');const books=(await api('/notebooks')).notebooks;const book=books.find(b=>b.template_id===turn.template_id);const select=document.querySelector('.agent-composer-context select');if(book){select.value=book.id;select.dispatchEvent(new Event('change'));}input.value=turn.maya;input.dispatchEvent(new Event('input'));input.focus();return;
 }
 if(turn.kind==='timeline'){
  await navigate('/timeline');await waitFor('#timeline-view .timeline-filters');document.querySelector('#timeline-view button[data-kind="document"]').click();
  const review=await api(`/demo/years/${currentYear().year}`);const record=review.documents.find(item=>item.corpus_id===turn.document_id);
  if(!record)throw Error('This report has not been imported');
  const source=await waitFor(`#timeline-view a[href="/document/${record.id}"]`);source.scrollIntoView({block:'center'});source.focus();
  progress.visited=progress.visited||[];progress.visited.push(currentYear().year+':'+progress.turn);save();source.click();await waitFor('#document-view');return;
 }
 await navigate('/');await waitFor('#health-dashboard .dashboard-calendar');
 if(turn.kind==='cycle'){
  await api('/health/preferences',{method:'PUT',json:{experiences_periods:true}});await window.StellisHealthDashboard.reload();
  await window.StellisHealthDashboard.focusCycle(turn.start);await waitFor('.dashboard-reproductive .tracker-daily');
  const button=[...document.querySelectorAll('.dashboard-reproductive button')].find(node=>node.textContent==='Edit period history');button.click();
  const start=await waitFor('dialog input[aria-label="Period start"]');start.value=turn.start;document.querySelector('dialog input[aria-label="Period end"]').value=turn.end;const note=document.querySelector('dialog textarea');if(note)note.value=turn.note;const gap=document.querySelector('dialog input[aria-label="Tracking resumed after a gap"]');if(gap)gap.checked=currentYear().year!==2022;return;
 }
 if(turn.kind==='milestone'||turn.kind==='birth'){
  await window.StellisHealthDashboard.reload();await waitFor('.health-calendar-milestones button');
  if(turn.kind==='milestone'){document.querySelector('.health-calendar-milestones button').click();const title=await waitFor('dialog input[aria-label="Milestone name"]');title.value=turn.title;const target=document.querySelector('dialog input[aria-label="Target date"]');if(target)target.value=turn.target_date;const kind=document.querySelector('dialog.health-milestone-dialog select[name="date_kind"]');if(kind)kind.value='estimated';}
  else{(await waitFor('.health-milestone-card button')).click();const actual=await waitFor('dialog input[aria-label="Confirmed date"]');actual.value=turn.actual_date;}
  return;
 }
 progress.visited=progress.visited||[];progress.visited.push(currentYear().year+':'+progress.turn);save();
}
async function completed(turn){
 if(!status?.active)return false;
 const entry=status.years[String(currentYear().year)];
 if(turn.kind==='upload')return Boolean(entry);
 if(turn.kind==='dates')return Boolean(entry?.dates_confirmed);
 if(turn.kind==='notebooks')return Boolean(entry?.filed);
 if(turn.kind==='cycle')return (await api('/reproductive')).records.some(r=>r.kind==='period'&&r.start===turn.start&&r.end===turn.end);
 if(turn.kind==='appointment')return (await api('/care-events')).events.some(e=>e.title===turn.title&&Date.parse(e.starts_at)===Date.parse(turn.starts_at));
 if(turn.kind==='milestone'||turn.kind==='birth')return (await api('/calendar/milestones')).milestones.some(m=>turn.kind==='milestone'?m.title===turn.title&&m.target_date===turn.target_date&&m.date_kind==='estimated':m.actual_date===turn.actual_date);
 if(turn.kind==='chat'){
  for(const agent of await api('/agents')){const messages=await api(`/agents/${agent.id}/messages`);const question=messages.filter(m=>m.role==='user'&&m.content===turn.maya).at(-1);if(question&&messages.some(m=>m.job_id===question.job_id&&m.role==='agent'&&m.content.includes('/document/')))return true;}return false;
 }
 return Boolean(progress.visited?.includes(currentYear().year+':'+progress.turn));
}
async function initialize(){
 data=await (await fetch('/static/maya/story.json')).json();status=await api('/demo/status');key='stellis-maya-story:'+(status.generation||'intro');
 try{progress=JSON.parse(localStorage.getItem(key));}catch(_){progress=null;}if(!progress||!data.years[progress.year]?.turns[progress.turn])progress={year:0,turn:0,completed:[],open:false};storyClock();banner();
}
async function open(){await initialize();await showOverview();}
async function openChapter(chapter){
 await initialize();
 const years=chapter==='2022'?[2022]:chapter==='2024-25'?[2023,2024,2025]:[2026];
 const year=years.find(y=>!status.years[String(y)]?.filed)||years[0];
 progress.year=data.years.findIndex(y=>y.year===year);
 const entry=status.years[String(year)];const kind=!entry?'upload':!entry.dates_confirmed?'dates':!entry.filed?'notebooks':'overview';
 progress.turn=Math.max(0,currentYear().turns.findIndex(t=>t.kind===kind));progress.open=true;save();await showYear();
}
window.StellisMayaGuide={open,openChapter};
window.addEventListener('stellis-demo-date',()=>{if(status?.active)banner();});
(async()=>{try{await initialize();if(sessionStorage.getItem('stellis-open-maya')){sessionStorage.removeItem('stellis-open-maya');progress.open=true;save();await showYear();}else if(location.pathname==='/demo'){await showOverview();}else if(status.active&&progress.open){if(progress.mode==='dock')collapse();else await showYear();}}catch(_){/* Demo availability does not block the real workspace. */}})();
})();
