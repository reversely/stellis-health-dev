/** Cycle calendars and date-based pill packs using saved workspace records. */
(function(root) {
'use strict';
const getDomHelpers = () => root.StellisDom;
const createElement = (tag, text, className) => getDomHelpers().el(tag, text, className);
const requestTracker = (path, options) => getDomHelpers().api('/reproductive' + path, options);
const calendarDates=root.StellisCalendarDates;
const formatCalendarDate=calendarDates.formatDate;
const currentDate=()=>formatCalendarDate(new Date());
const daysBetween=calendarDates.daysBetween;
const shiftCalendarDate=calendarDates.shiftDate;
const formatDateLabel = date => new Date(date+'T12:00:00').toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});
const createButton = (label, onActivate, className='coach-button') => {
  const button=getDomHelpers().button(label,className);button.addEventListener('click',onActivate);return button;
};
const createIconButton = (label, icon, onActivate) => {
  const button=createButton(null,onActivate,'coach-button tracker-icon-button');
  button.setAttribute('aria-label',label);button.append(getDomHelpers().icon(icon));return button;
};
const trackerViews = {
  period: {label:'Cycle', add:'Log period', title:'Period'},
  pill: {label:'Pills', add:'Add pill pack', title:'Pill pack'},
  larc: {label:'Devices', add:'Add device', title:'Device'},
};
let nextId=0;
const mounted=new WeakMap();

function mount(host,options={}) {
  mounted.get(host)?.();
  const instance=++nextId;
  let records=[], current='period', busy=false;
  let selectedDose=new Map();
  const tabs=new Map();
  const status=createElement('p',null,'tracker-status');status.setAttribute('role','status');
  const reminders=createElement('div',null,'tracker-reminders');reminders.setAttribute('aria-live','polite');
  const navigation=createElement('div',null,'tracker-navigation');
  const tablist=createElement('div',null,'tracker-tabs');tablist.setAttribute('role','tablist');tablist.setAttribute('aria-label','Cycle and contraception');
  const add=createButton(trackerViews[current].add,()=>openForm(current));
  add.prepend(getDomHelpers().icon('plus'));
  const panel=createElement('section',null,'tracker-panel');panel.id=`tracker-panel-${instance}`;
  panel.setAttribute('role','tabpanel');panel.tabIndex=-1;
  for(const [kind,config] of Object.entries(trackerViews)) {
    const tab=createButton(config.label,()=>selectTab(kind),'tracker-tab');
    tab.id=`tracker-tab-${instance}-${kind}`;
    tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panel.id);
    tab.addEventListener('keydown',event=>{
      const keys=Object.keys(trackerViews), index=keys.indexOf(kind);
      const target=event.key==='ArrowRight'?keys[(index+1)%3]:event.key==='ArrowLeft'?keys[(index+2)%3]:event.key==='Home'?keys[0]:event.key==='End'?keys[2]:null;
      if(target){event.preventDefault();selectTab(target);tabs.get(target).focus();}
    });
    tabs.set(kind,tab);tablist.append(tab);
  }
  navigation.append(tablist);
  const sectionHead=host.closest('.dashboard-reproductive')?.querySelector('.dashboard-section-head');
  if(sectionHead)sectionHead.lastElementChild.replaceWith(add);else navigation.append(add);
  const footnote=createElement('p','Reminders appear while My Health is open','tracker-footnote');
  host.replaceChildren(navigation,status,reminders,panel,footnote);

  function selectTab(kind) {
    current=kind;
    for(const [key,tab] of tabs) {tab.setAttribute('aria-selected',String(key===kind));tab.tabIndex=key===kind?0:-1;}
    panel.setAttribute('aria-labelledby',tabs.get(kind).id);
    add.replaceChildren(getDomHelpers().icon('plus'),document.createTextNode(trackerViews[kind].add));
    paint();
  }
  async function load() {
    const result=await requestTracker('');
    if(!host.isConnected)return;
    records=result.records;paint();checkReminders();
  }
  async function mutate(operation) {
    if(busy)return false;
    busy=true;panel.setAttribute('aria-busy','true');
    try {await operation();await load();options.onChange?.();status.textContent='';return true;}
    catch(error){status.textContent=error.message;return false;}
    finally {busy=false;panel.removeAttribute('aria-busy');}
  }
  const entries = kind => records.filter(record=>record.kind===kind).sort((a,b)=>b.start.localeCompare(a.start));
  function heading(title, subtitle) {
    const block=createElement('div',null,'tracker-heading');block.append(createElement('h3',title));
    if(subtitle)block.append(createElement('p',subtitle,'tracker-muted'));return block;
  }
  function empty(title, description, kind) {
    const block=createElement('div',null,'tracker-empty');
    const symbol=createElement('div',null,'tracker-empty-icon');symbol.append(getDomHelpers().icon(kind==='period'?'calendar':kind==='pill'?'circle-check':'clock'));
    block.append(symbol,heading(title,description),createButton(trackerViews[kind].add,()=>openForm(kind),'coach-button is-primary'));
    return block;
  }
  function metric(label, value) {
    const block=createElement('div',null,'tracker-metric');block.append(createElement('dt',label),createElement('dd',value));return block;
  }
  function createPackProgress(value,label,progress) {
    const figure=createElement('div',null,'tracker-ring');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 160 160');svg.setAttribute('aria-hidden','true');
    for(const [className,length] of [['tracker-ring-track',1],['tracker-ring-value',Math.min(1,Math.max(0,progress||0))]]) {
      const circle=document.createElementNS(svg.namespaceURI,'circle');
      for(const [key,val] of Object.entries({cx:80,cy:80,r:68,fill:'none',pathLength:1}))circle.setAttribute(key,String(val));
      circle.setAttribute('class',className);circle.setAttribute('stroke-dasharray',`${length} 1`);
      if(length===0)circle.setAttribute('visibility','hidden');
      svg.append(circle);
    }
    const text=createElement('div',null,'tracker-ring-text');
    const number=createElement('strong',String(value));
    const caption=createElement('span',label);
    text.append(number,caption);
    figure.setAttribute('role','img');
    figure.setAttribute('aria-label',`${value} ${label}`);
    figure.append(svg,text);return figure;
  }
  function paint() {
    add.hidden=current==='period'||!entries(current).length;
    add.classList.toggle('is-primary',current==='period');
    panel.replaceChildren();
    if(current==='period')paintCycle();else if(current==='pill')paintPills();else paintDevices();
  }
  function paintCycle() {
    const periodRecords=entries('period');
    const overview=createElement('div',null,'tracker-overview tracker-cycle-overview tracker-cycle-summary');
    if(!periodRecords.length) {
      overview.append(heading('Cycle tracking','Log a period to start your history'));
    }else {
      const cycleSummary=root.StellisHealthCycles.summarizeCycle({id:'menstrual-cycle',label:'menstrual cycle',
        episodes:periodRecords.map(period=>({id:period.id,startDate:period.start,endDate:period.end}))},currentDate());
      const latestPeriod=periodRecords[0], averageCycleLength=cycleSummary.averageLength;
      const periodIsOngoing=!latestPeriod.end;
      overview.append(root.StellisHealthCycles.createDayFigure({day:cycleSummary.day,label:cycleSummary.label,startDate:latestPeriod.start}));
      const metrics=createElement('dl',null,'tracker-metrics');
      if(averageCycleLength) {
        metrics.append(metric('Estimated next period',formatDateLabel(cycleSummary.estimatedNextStart)),metric('Average cycle',`${averageCycleLength} days`));
      }else metrics.append(metric('Last period',formatDateLabel(latestPeriod.start)));
      overview.append(metrics);
      if(!averageCycleLength)overview.append(createElement('p','Log two periods for a cycle estimate','tracker-muted'));
      if(periodIsOngoing)overview.append(createButton('End period',()=>openForm('period',latestPeriod,{end:currentDate()})));
      if(averageCycleLength)overview.append(createElement('p','Estimates cannot determine fertile days','tracker-footnote'));
    }
    panel.append(overview);
    if(periodRecords.length) {
      const history=createElement('div',null,'tracker-history');history.append(createElement('h4','Period history'));
      for(const period of periodRecords) {
        const row=createButton(null,()=>openForm('period',period),'tracker-history-row');
        const text=createElement('span');text.append(createElement('strong',formatDateLabel(period.start)),createElement('span',`${period.flow} flow${period.end?' / '+(daysBetween(period.end,period.start)+1)+' days':' / Ongoing'}`,'tracker-muted'));
        if(period.note)text.append(createElement('span',period.note,'tracker-muted'));
        row.append(text,getDomHelpers().icon('chevron-right'));history.append(row);
      }
      panel.append(history);
    }
  }
  function paintPills() {
    const packs=entries('pill');
    if(!packs.length){panel.append(empty('Pill tracking','Add your prescribed pack schedule','pill'));return;}
    for(const pack of packs) {
      const total=pack.active+pack.break_days, elapsed=daysBetween(currentDate(),pack.start);
      const index=elapsed<0?0:elapsed%total, packStart=elapsed<0?pack.start:shiftCalendarDate(currentDate(),-index);
      const selected=selectedDose.get(pack.id)||currentDate();
      const chosen=selected>=packStart&&selected<shiftCalendarDate(packStart,total)?selected:currentDate();
      const chosenIndex=daysBetween(chosen,packStart), taken=new Set(pack.doses), skipped=new Set(pack.skipped||[]), isTaken=taken.has(chosen), isSkipped=skipped.has(chosen);
      const layout=createElement('article',null,'tracker-workspace tracker-pack');layout.dataset.record=pack.id;
      const overview=createElement('div',null,'tracker-overview');
      overview.append(heading(pack.name,`${pack.active} active / ${pack.break_days} break days`));
      overview.append(createPackProgress(elapsed<0?0:index+1,`of ${total} days`,elapsed<0?0:(index+1)/total));
      const selectedLabel=chosen===currentDate()?'Today':formatDateLabel(chosen);
      overview.append(createElement('p',elapsed<0?'Starts '+formatDateLabel(pack.start):`${selectedLabel} / ${chosenIndex>=pack.active?'Break day':isTaken?'Taken':isSkipped?'Skipped':'Not logged'}`,'tracker-dose-status'));
      if(elapsed>=0&&chosen<=currentDate()&&chosenIndex>=0&&chosenIndex<pack.active) {
        const log=createButton(isTaken||isSkipped?'Undo dose':'Mark taken',async()=>{
          log.disabled=true;
          await mutate(()=>requestTracker('/'+pack.id+'/dose',{method:'PUT',json:{day:chosen,taken:!isTaken&&!isSkipped}}));
          const target=panel.querySelector(`[data-record="${pack.id}"] .tracker-dose-action`);
          if(target)target.focus();else log.disabled=false;
        },'coach-button is-primary tracker-dose-action');
        if(!isTaken&&!isSkipped)log.prepend(getDomHelpers().icon('check'));
        const actions=createElement('div',null,'tracker-dose-actions');actions.append(log);
        if(!isTaken&&!isSkipped)actions.append(createButton('Skip',async()=>{
          if(await mutate(()=>requestTracker('/'+pack.id+'/dose',{method:'PUT',json:{day:chosen,status:'skipped'}})))panel.querySelector(`[data-record="${pack.id}"] .tracker-dose-action`)?.focus();
        }));
        overview.append(actions);
      }
      overview.append(createElement('p',pack.reminder?'Reminder '+pack.time:'Reminders off','tracker-muted'),createButton('Edit pack',()=>openForm('pill',pack),'coach-button is-quiet'));
      const visual=createElement('div',null,'tracker-pack-visual');
      const head=heading('Pill pack',formatDateLabel(packStart)+' to '+formatDateLabel(shiftCalendarDate(packStart,total-1)));
      const grid=createElement('div',null,'tracker-pill-grid');grid.setAttribute('aria-label','Pill pack days');
      for(let i=0;i<total;i++) {
        const date=shiftCalendarDate(packStart,i), breakDay=i>=pack.active, logged=taken.has(date), wasSkipped=skipped.has(date);
        const label=`Day ${i+1} / ${formatDateLabel(date)} / ${breakDay?'Break':logged?'Taken':wasSkipped?'Skipped':date>currentDate()?'Upcoming':'Not logged'}`;
        const cell=createButton(null,()=>{selectedDose.set(pack.id,date);paint();panel.querySelector(`[data-record="${pack.id}"] [data-day="${date}"]`)?.focus();},'tracker-pill');
        cell.disabled=date>currentDate()||elapsed<0;cell.dataset.day=date;cell.setAttribute('aria-label',label);cell.setAttribute('aria-pressed',String(date===chosen));
        cell.append(createElement('span',String(i+1),'tracker-pill-number'));
        if(logged||wasSkipped)cell.append(getDomHelpers().icon(logged?'check':'x'));
        if(breakDay)cell.classList.add('is-break');
        if(logged)cell.classList.add('is-taken');
        if(wasSkipped)cell.classList.add('is-skipped');
        if(date===currentDate())cell.setAttribute('aria-current','date');
        grid.append(cell);
      }
      const legend=createElement('div',null,'tracker-legend');
      legend.append(createElement('span','Taken','tracker-key is-taken'),createElement('span','Skipped','tracker-key is-skipped'),createElement('span','Active','tracker-key is-active'),createElement('span','Break','tracker-key is-break'));
      const history=createElement('details',null,'tracker-dose-history');const summary=createElement('summary','Dose history');summary.append(getDomHelpers().icon('chevron-down'));history.append(summary);
      if(!pack.doses.length&&!(pack.skipped||[]).length)history.append(createElement('p','No doses logged','tracker-muted'));
      else {const list=createElement('ul');for(const dose of [...pack.doses,...(pack.skipped||[])].sort().reverse())list.append(createElement('li',formatDateLabel(dose)+' / '+(skipped.has(dose)?'Skipped':'Taken')));history.append(list);}
      visual.append(head,grid,legend,history);layout.append(overview,visual);panel.append(layout);
    }
  }
  function paintDevices() {
    const devices=entries('larc');
    if(!devices.length){panel.append(empty('Long-acting contraception','Track an IUD or implant renewal','larc'));return;}
    for(const [title,items] of [['Active devices',devices.filter(record=>!record.end)],['Device history',devices.filter(record=>record.end)]]) {
      if(!items.length)continue;
      const section=createElement('div',null,'tracker-device-group');section.append(createElement('h3',title));
      for(const device of items) {
        const row=createElement('article',null,'tracker-device');
        const info=heading(device.name,device.type);
        const remaining=daysBetween(device.renewal,currentDate());
        const dates=createElement('dl',null,'tracker-device-dates');
        dates.append(metric('Inserted',formatDateLabel(device.start)),metric(device.end?'Removed':'Renewal date',formatDateLabel(device.end||device.renewal)));
        const due=createElement('div',null,'tracker-device-due');
        if(!device.end) {due.append(createElement('strong',remaining<0?'Renewal date passed':remaining===0?'Due today':remaining+' days'),createElement('span',remaining>0?'until renewal':'Review your renewal date','tracker-muted'));}
        else due.append(createElement('span','Removed','tracker-muted'));
        const edit=createButton('Edit device',()=>openForm('larc',device));
        row.append(info,dates,due,edit);section.append(row);
      }
      panel.append(section);
    }
  }

  function openForm(kind, existing=null, overrides={}) {
    const trigger=document.activeElement;
    const dialog=createElement('dialog',null,'tracker-dialog');
    const title=createElement('h2',(existing?'Edit ':'Add ')+trackerViews[kind].title.toLowerCase());title.id=`tracker-dialog-${++nextId}`;
    dialog.setAttribute('aria-labelledby',title.id);
    const header=createElement('div',null,'tracker-dialog-head');header.append(title,createIconButton('Close','x',()=>dialog.close()));
    const form=createElement('form',null,'tracker-editor');
    const fields=createElement('div',null,'tracker-fields');
    const controls={};
    const defaults={flow:'Moderate',type:'Hormonal IUD',start:currentDate(),active:21,break_days:7,time:'09:00',notice:30,...existing,...overrides};
    function field(key,label,type='text',options=null,wide=false) {
      const wrapper=createElement('label',label,'tracker-field'+(wide?' is-wide':''));
      const input=createElement(options?'select':key==='note'?'textarea':'input');
      input.id=`tracker-input-${++nextId}`;wrapper.htmlFor=input.id;wrapper.dataset.field=key;input.name=key;
      input.setAttribute('aria-label',label);
      if(options)for(const option of options){const node=createElement('option',option);node.value=option;input.append(node);}
      else if(key!=='note')input.type=type;
      if(type==='checkbox'){input.checked=!!defaults[key];wrapper.classList.add('is-checkbox');}
      else input.value=defaults[key]??'';
      if(type==='number'){input.min=key==='active'?'1':'0';input.max='365';}
      if(type==='text'&&!options)input.maxLength=key==='note'?500:120;
      if(type==='date'&&(key==='end'||(key==='start'&&kind!=='pill')))input.max=currentDate();
      input.required=!['end','note','reminder'].includes(key);
      if(key==='note')input.rows=3;
      wrapper.append(input);fields.append(wrapper);controls[key]=input;return input;
    }
    if(kind!=='period')field('name',kind==='pill'?'Pill name':'Device name','text',null,true);
    field('start',kind==='period'?'Period start':kind==='pill'?'Pack start':'Insertion date','date');
    if(kind==='period') {
      field('end','Period end','date');
      const group=createElement('fieldset',null,'tracker-choices is-wide');group.append(createElement('legend','Flow'));
      const choiceButtons=[];
      controls.flow={value:defaults.flow,type:'text'};
      for(const flow of ['Spotting','Light','Moderate','Heavy']) {
        const choice=createButton(flow,()=>{controls.flow.value=flow;for(const button of choiceButtons)button.setAttribute('aria-pressed',String(button===choice));},'coach-button tracker-choice');
        choice.setAttribute('aria-pressed',String(flow===defaults.flow));choiceButtons.push(choice);group.append(choice);
      }
      fields.append(group);field('note','Symptoms and notes','text',null,true);
    }
    if(kind==='pill') {
      const presets=createElement('fieldset',null,'tracker-choices is-wide');presets.append(createElement('legend','Pack schedule'));
      const buttons=[];
      for(const [label,active,breakDays] of [['21 + 7',21,7],['24 + 4',24,4],['Continuous',28,0]]) {
        const choice=createButton(label,()=>{controls.active.value=active;controls.break_days.value=breakDays;refreshPresets();},'coach-button tracker-choice');
        choice.setAttribute('aria-label',label==='Continuous'?'Continuous schedule':`${active} active and ${breakDays} break days`);
        presets.append(choice);buttons.push({choice,active,breakDays});
      }
      fields.append(presets);
      field('active','Active pills','number');field('break_days','Break days','number');
      function refreshPresets(){for(const {choice,active,breakDays} of buttons)choice.setAttribute('aria-pressed',String(Number(controls.active.value)===active&&Number(controls.break_days.value)===breakDays));}
      controls.active.oninput=refreshPresets;controls.break_days.oninput=refreshPresets;refreshPresets();
      field('time','Reminder time','time');
    }
    if(kind==='larc') {
      field('type','Device type','text',['Hormonal IUD','Copper IUD','Implant']);
      field('renewal','Renewal date','date');field('notice','Reminder notice in days','number');
      if(existing)field('end','Removal date','date');
      fields.append(createElement('p','Use the renewal date agreed with your clinician','tracker-muted is-wide'));
    }
    if(kind!=='period') {
      field('reminder','In-app reminders','checkbox',null,true);
      fields.append(createElement('p','Reminders appear while My Health is open','tracker-footnote is-wide'));
    }
    const error=createElement('p',null,'tracker-form-error');error.setAttribute('role','alert');
    const footer=createElement('div',null,'tracker-dialog-actions');
    const save=createElement('button','Save','coach-button is-primary');save.type='submit';
    const cancel=createButton('Cancel',()=>dialog.close());
    if(existing) {
      const remove=createButton('Delete',async()=>{
        if(!root.confirm('Delete this tracker entry?'))return;
        remove.disabled=true;
        if(await mutate(()=>requestTracker('/'+existing.id,{method:'DELETE'})))dialog.close();
        else {error.textContent=status.textContent;remove.disabled=false;}
      },'coach-button is-danger');footer.append(remove);
    }
    footer.append(cancel,save);form.append(fields,error,footer);dialog.append(header,form);host.append(dialog);
    dialog.addEventListener('close',()=>{dialog.remove();if(trigger?.isConnected)trigger.focus();else tabs.get(current).focus();},{once:true});
    form.onsubmit=async event=>{
      event.preventDefault();save.disabled=true;error.textContent='';
      const data={...existing};delete data.id;delete data.kind;delete data.doses;delete data.skipped;
      for(const [key,input] of Object.entries(controls))data[key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
      try {
        await requestTracker('/'+kind+(existing?'?record_id='+encodeURIComponent(existing.id):''),{method:'POST',json:data});
        await load();options.onChange?.();dialog.close();status.textContent='';
      }catch(err){error.textContent=err.message;save.disabled=false;}
    };
    dialog.showModal();
  }
  function checkReminders() {
    if(!host.isConnected)return;
    const time=new Date().toTimeString().slice(0,5);
    const due=records.filter(record=>record.reminder&&!record.end&&(record.kind==='pill'
      ?daysBetween(currentDate(),record.start)>=0&&daysBetween(currentDate(),record.start)%(record.active+record.break_days)<record.active&&!record.doses.includes(currentDate())&&!(record.skipped||[]).includes(currentDate())&&time>=record.time
      :record.kind==='larc'&&daysBetween(record.renewal,currentDate())<=record.notice));
    reminders.replaceChildren();
    for(const record of due) {
      const banner=createElement('div',null,'tracker-reminder');
      const text=createElement('span',record.name+(record.kind==='pill'?' is due':' renewal is due'));
      const view=createButton('View',()=>{selectTab(record.kind);panel.focus();},'coach-button');banner.append(getDomHelpers().icon('clock'),text,view);reminders.append(banner);
    }
  }
  selectTab(current);
  status.textContent='Loading tracking records';
  load().then(()=>{status.textContent='';}).catch(error=>status.replaceChildren(createElement('span',error.message),createButton('Try again',()=>load().then(()=>{status.textContent='';}).catch(err=>{status.textContent=err.message;}))));
  let day=currentDate();
  const timer=setInterval(()=>{
    if(!host.isConnected){clearInterval(timer);return;}
    if(day!==currentDate()){day=currentDate();paint();}checkReminders();
  },30000);
  mounted.set(host,()=>clearInterval(timer));
  return {
    createPeriod:date=>{selectTab('period');openForm('period',null,{start:date&&date<=currentDate()?date:currentDate()});},
    openRecord:async recordId=>{await load();const record=records.find(record=>record.id===recordId);if(record){selectTab(record.kind);openForm(record.kind,record);}},
    destroy:()=>{clearInterval(timer);host.replaceChildren();},
  };
}
root.StellisReproductive={mount};
})(window);
