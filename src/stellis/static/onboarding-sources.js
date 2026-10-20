(() => {
  let stopCurrent=()=>{};
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  function create(api,initial,changed){
    stopCurrent();let stopped=false,timer=null,scan=initial,selected=new Set(),lastId=null,saving=false;
    const root=node('section',null,'setup-source-review');root.append(node('h2','From mail & calendar events'),node('p','Read a recent period, then review what to file. This first pass reads up to 25 email threads and 35 calendar events.','setup-hint'));
    const controls=node('div',null,'setup-actions'),label=node('label','Look back '),period=node('select');period.setAttribute('aria-label','Lookback period');
    for(const days of [7,30,90]){const option=node('option',`Last ${days} days`);option.value=days;period.append(option);}period.value=scan?.days||30;label.append(period);
    const read=node('button','Read sources','quiet'),cancel=node('button','Stop reading','quiet');read.type=cancel.type='button';controls.append(label,read,cancel);root.append(controls);
    const message=node('p','','setup-source-status');message.role='status';message.setAttribute('aria-live','polite');const progress=node('progress');progress.setAttribute('aria-label','Reading sources');const groups=node('div',null,'setup-grid');root.append(message,progress,groups);
    const busy=()=>['reading','planning'].includes(scan?.state);
    function notify(){changed({proposal_id:scan?.state==='ready'?scan.id:null,group_ids:[...selected],groups:(scan?.groups||[]).filter(g=>selected.has(g.id)),busy:busy()||saving});}
    function dateLabel(value){const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}
    function sourceList(sources){const list=node('ul',null,'setup-source-list');for(const s of sources){const item=node('li');item.append(node('strong',s.title),node('p',`${s.kind} · ${dateLabel(s.date)}`,'setup-hint'),node('p',s.kind==='Google Calendar'?s.excerpt.replace(/(Starts: |Ends: )([^\n]+)/g,(_,label,value)=>label+dateLabel(value)):s.excerpt));list.append(item);}return list;}
    function draw(){
      if(stopped)return;read.disabled=busy();period.disabled=busy();cancel.hidden=!busy();progress.hidden=!busy();message.textContent=scan?`${scan.message}${scan.count?` ${scan.count} sources read.`:''}`:'Google must be connected before reading.';
      if(scan?.limited)message.textContent+=' More items are available outside this first pass.';
      groups.replaceChildren();if(scan?.state==='ready'){
        if(lastId!==scan.id){selected=new Set(scan.selected_group_ids??scan.groups.map(g=>g.id));lastId=scan.id;}
        const sources=new Map(scan.sources.map(s=>[s.id,s]));const included=new Set();
        for(const group of scan.groups){const card=node('section',null,'setup-group');const choose=node('label',null,'setup-group-choice');const check=node('input');check.type='checkbox';check.checked=selected.has(group.id);check.setAttribute('aria-label',`Include ${group.name}`);choose.append(check,node('strong',group.name));check.addEventListener('change',async()=>{const previous=new Set(selected);if(check.checked)selected.add(group.id);else selected.delete(group.id);saving=true;root.querySelectorAll('input,button,select').forEach(e=>e.disabled=true);notify();try{scan=await api('/onboarding/sources','PUT',{proposal_id:scan.id,group_ids:[...selected]});}catch(e){selected=previous;check.checked=selected.has(group.id);message.textContent=e.message;}finally{saving=false;root.querySelectorAll('input,button,select').forEach(e=>e.disabled=false);if(!stopped)notify();}});card.append(choose,node('p',group.collection,'setup-hint'));const team=node('div',null,'setup-agents');for(const name of ['Steward','Writing']){const badge=node('span',null,'setup-agent');badge.append(window.StellisAgentAvatar.avatarElement(document,{seed:name.toLowerCase(),coordinator:name==='Steward',size:24}),document.createTextNode(name));team.append(badge);}card.append(team);const details=node('details');details.append(node('summary',`Review ${group.source_ids.length} sources`),sourceList(group.source_ids.map(id=>sources.get(id))));card.append(details);groups.append(card);group.source_ids.forEach(id=>included.add(id));}
        const omitted=scan.sources.filter(s=>!included.has(s.id));if(omitted.length){const details=node('details',null,'setup-not-included');details.append(node('summary',`${omitted.length} sources not included`),sourceList(omitted));groups.append(details);}
        if(!scan.groups.length)groups.append(node('p','No useful notebook groups were found. You can keep your starter choices or try another period.'));
      }
      notify();clearTimeout(timer);if(busy())timer=setTimeout(refresh,1000);
    }
    async function refresh(){try{const data=await api('/onboarding/sources');if(stopped)return;scan=data.scan;draw();}catch(e){if(!stopped){message.textContent=e.message;timer=setTimeout(refresh,2500);}}}
    read.addEventListener('click',async()=>{read.disabled=true;message.textContent='Starting…';try{scan=await api('/onboarding/sources','POST',{days:Number(period.value)});draw();}catch(e){message.textContent=e.message;read.disabled=false;}});
    cancel.addEventListener('click',async()=>{cancel.disabled=true;try{scan=await api('/onboarding/sources','DELETE');draw();}catch(e){message.textContent=e.message;}finally{cancel.disabled=false;}});
    stopCurrent=()=>{stopped=true;clearTimeout(timer);};draw();if(busy())refresh();return root;
  }
  window.StellisOnboardingSources={create,stop:()=>stopCurrent()};window.addEventListener('pagehide',()=>stopCurrent());
})();
