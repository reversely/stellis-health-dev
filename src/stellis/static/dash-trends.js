/** App-owned Dash component inside the existing navigation and capture shell. */
(() => {
 let frame=null,host=null,measures=[],demo=null,themeWatch=null,lastPayload='',ready=false;
 const theme=()=>document.documentElement.dataset.theme==='light'?'light':'dark';
 const cameraKey=()=>`stellis-camera-test:${demo?.generation||'ordinary'}`;
 const cameraResults=()=>{try{return JSON.parse(sessionStorage.getItem(cameraKey())||'[]')}catch{return []}};
 function paintCamera(){
  const node=host?.querySelector('.dash-camera-results');if(!node)return;
  node.replaceChildren();if(!demo?.active)return;
  const points=cameraResults();if(!points.length)return;
  const title=document.createElement('h3');title.textContent='Your camera test';node.append(title);
  for(const p of points.slice(-3)){const row=document.createElement('p');const m=measures.find(m=>m.key===p.measure);row.textContent=`${m?.label||p.measure}: ${p.value} ${m?.unit||''} — Camera estimate`;node.append(row);}
  const clear=window.StellisDom.button('Clear camera test','trend-manual');clear.onclick=()=>{sessionStorage.removeItem(cameraKey());paintCamera()};node.append(clear);
 }
 function publish(category){
  if(!frame?.contentWindow)return;
  const payload={stellisMeasurements:true,measures,theme:theme(),demo:Boolean(demo?.active),today:window.StellisDemoDate||window.StellisCalendarDates.formatDate(new Date()),category};
  const key=JSON.stringify(payload);if(key===lastPayload&&category==null)return;lastPayload=key;
  frame.contentWindow.postMessage(payload,location.origin);
 }
 async function refresh(){
  const data=await window.StellisDom.api('/readings');measures=data.measures.map(window.StellisTrends.dailyTotals);
  demo=await window.StellisDom.api('/demo/status');publish();paintCamera();
 }
 async function manual(key){
  const dom=window.StellisDom,dialog=dom.el('dialog',null,'capture-dialog'),title=dom.el('h2','Enter Reading');
  title.id='dash-entry-title';dialog.setAttribute('aria-labelledby',title.id);
  const close=dom.button('Close','coach-button is-quiet');close.onclick=()=>dialog.close();
  const body=dom.el('div');dialog.append(title,close,body);document.body.append(dialog);
  dialog.addEventListener('close',()=>{dialog.remove();frame?.focus()},{once:true});
  await window.StellisTrends.entryForm(body,null,async()=>{dialog.close();await refresh()},key);
  dialog.showModal();body.querySelector('input')?.focus();
 }
 async function camera(){
  if(!demo)await refresh();
  if(!demo?.active){window.StellisCameraPulse.open(refresh,measures.find(m=>m.key==='pulse'));return;}
  const pending=[];
  window.StellisCameraPulse.open(async()=>{sessionStorage.setItem(cameraKey(),JSON.stringify([...cameraResults(),...pending]));paintCamera()},null,{showComparison:false,saveReading:async point=>{pending.push(point);return point}});
 }
 window.addEventListener('message',async event=>{
  if(event.origin!==location.origin||event.source!==frame?.contentWindow||!event.data?.stellisMeasurements)return;
  const {action,height,path,measure}=event.data;
  try{
   if(action==='ready'){if(!ready){ready=true;lastPayload='';publish()}}
   else if(action==='resize'&&Number.isFinite(height))frame.style.height=`${Math.max(480,Math.min(height+8,30000))}px`;
   else if(action==='manual')await manual(measure);
   else if(action==='camera')await camera();
   else if(action==='delete'){if(measures.some(m=>(m.entries||m.points).some(p=>p.id===event.data.id&&p.source!=='record'))){await window.StellisDom.api('/readings/'+encodeURIComponent(event.data.id),{method:'DELETE'});await refresh()}}
   else if(action==='navigate'&&/^\/(document|page|notebook|conversation)\/[\w%.-]+(?:[?#].*)?$/.test(path)){history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'))}
  }catch(error){host.querySelector('[role=status]').textContent=error.message}
 });
 window.addEventListener('stellis-demo-date',()=>publish());
 window.StellisDashTrends={async mount(container){
  host=container;
  if(!frame||!frame.isConnected){
   ready=false;lastPayload='';frame=document.createElement('iframe');frame.title='Measurements';frame.src='/components/measurements/';frame.className='dash-measurements-frame';
   const status=document.createElement('p');status.setAttribute('role','status');
   const results=document.createElement('section');results.className='dash-camera-results';results.setAttribute('aria-label','Your camera test');
   host.replaceChildren(status,frame,results);
  }
  if(!themeWatch){themeWatch=new MutationObserver(()=>publish());themeWatch.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']})}
  await refresh();
 },refresh,openCamera:camera};
})();
