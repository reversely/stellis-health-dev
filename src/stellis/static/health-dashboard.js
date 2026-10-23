/** Composes source-linked health previews without generating clinical claims. */
(function(root) {
'use strict';
const dom = () => root.StellisDom;
const el = (tag, text, cls) => dom().el(tag, text, cls);
const button = (text, action, cls = 'coach-button is-quiet') => {
  const node = dom().button(text, cls);
  node.addEventListener('click', action);
  return node;
};
const link = (text, href, cls = '') => {
  const node = el('a', text, cls); node.href = href; return node;
};
const day = value => {
  if (!value) return '';
  const date = new Date(String(value).length === 10 ? value + 'T12:00:00' : value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString([], {month:'short', day:'numeric', year:'numeric'}) : '';
};
let dialogId = 0;
const dateKey = date => date?root.StellisCalendarDates.formatDate(date):(root.StellisDemoDate||root.StellisCalendarDates.formatDate(new Date()));

/** Uses the current data order unless the person saved an explicit selection. */
function selected(items, keys, field = 'id') {
  const index = new Map(items.map(item => [item[field], item]));
  return keys.map(key => index.get(key)).filter(Boolean).slice(0,3);
}

function sparkline(points) {
  const values = points.slice(-20).map(point => point.value).filter(Number.isFinite);
  if (values.length < 2) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 200 40'); svg.setAttribute('class','dashboard-sparkline');
  svg.setAttribute('aria-hidden','true');
  const min = Math.min(...values), span = Math.max(...values) - min || 1;
  const path = document.createElementNS(svg.namespaceURI,'polyline');
  path.setAttribute('points',values.map((value,i) => `${4+i*192/(values.length-1)},${36-(value-min)*32/span}`).join(' '));
  svg.append(path); return svg;
}

class Dashboard {
  constructor(host, library) {
    this.host = host; this.books = library.books; this.collections = library.collections;
    this.sections = new Map(); this.data = {}; this.destroyed = false;
    const grid = el('div',null,'dashboard-grid');
    for (const [key,title,action] of [
      ['overview','Health Overview',link('Full summary','/summary')],
      ['upcoming','Calendar',link('Calendar settings','/settings')],
      ['notebooks','My Notebooks',button('View all',()=>this.notebooks())],
      ['measurements','Measurements',link('View all','/trends')],
      ['reproductive','Cycle and contraception',el('span')],
      ['history','Health History',link('Explore','/timeline')],
    ]) {
      const section = el('section',null,'dashboard-section dashboard-'+key+(key==='upcoming'?' dashboard-calendar':''));
      if(key==='reproductive')section.hidden=true;
      const head = el('div',null,'dashboard-section-head');
      const titleNode = el('h2',title); titleNode.id = 'dashboard-'+key+'-title';
      section.setAttribute('aria-labelledby',titleNode.id); head.append(titleNode,action);
      const body = el('div',null,'dashboard-body'); body.append(el('p','Loading','dashboard-empty'));
      section.append(head,body); grid.append(section); this.sections.set(key,body);
    }
    this.status = el('p',null,'dashboard-status'); this.status.setAttribute('role','status');
    host.replaceChildren(this.status,grid);
  }

  async load() {
    const paths = {preferences:'/dashboard/preferences', summary:'/summary', facts:'/facts',
      readings:'/readings', timeline:'/timeline', healthPreferences:'/health/preferences'};
    const request = (this.request || 0) + 1; this.request = request;
    const results = await Promise.allSettled(Object.values(paths).map(path => dom().api(path)));
    if (this.destroyed || this.request !== request) return;
    Object.keys(paths).forEach((key,i) => {this.data[key] = results[i].status === 'fulfilled' ? results[i].value : null;});
    this.preferences = this.data.preferences;
    this.entries = this.data.timeline?.entries || [];
    this.measures = (this.data.readings?.measures || []).map(root.StellisTrends.dailyTotals);
    this.paint();

  }

  empty(body, text, label, href) {
    body.append(el('p',text,'dashboard-empty'),link(label,href,'dashboard-link'));
  }

  paint() {
    this.calendarView?.destroy();this.tracker?.destroy();
    for (const body of this.sections.values()) body.replaceChildren();
    const prefs = this.preferences || {notebooks:[],measurements:[],care_contexts:[]};
    this.overview();
    const periodsEnabled=this.data.healthPreferences?.experiences_periods===true;
    const trackerHost=this.sections.get('reproductive');trackerHost.closest('section').hidden=!periodsEnabled;
    this.tracker=periodsEnabled?root.StellisReproductive.mount(trackerHost,{onChange:()=>this.calendarView?.reload()}):null;
    const calendarHost=this.sections.get('upcoming');
    this.calendarView=root.StellisHealthCalendar.mount(calendarHost,{onSelectEvent:event=>{
      if(event.source_type==='reproductive'&&this.tracker)this.tracker.openRecord(event.source_id);
      else if(event.target)location.href=event.target;
      else this.eventDetail({title:event.title,date:event.start||event.start_date,status:'Scheduled',source:event.kind,meeting:event.appointment});
    }});
    const calendarHeader=calendarHost.previousElementSibling;
    calendarHeader.querySelector('[data-calendar-log]')?.remove();
    if(periodsEnabled){const log=button('Log period',()=>this.tracker.createPeriod(this.calendarView.getSelectedDate()),'coach-button is-primary');log.dataset.calendarLog='';calendarHeader.append(log);}
    this.bookList(this.sections.get('notebooks'),selected(this.books,prefs.notebooks));
    this.measurements(selected(this.measures,prefs.measurements,'key'));
    const history = this.sections.get('history');
    const past = this.entries.filter(item => item.date <= dateKey()).slice(0,5);
    const tabs = el('nav',null,'dashboard-history-links'); tabs.setAttribute('aria-label','Health history views');
    tabs.append(link('Timeline','/timeline'),link('Records','/records')); history.append(tabs);
    if (!this.data.timeline) this.empty(history,'Health history could not load','Open records','/records');
    else if (!past.length) this.empty(history,'Add records to build your health history','Add a record','/records');
    else {
      const list = el('ul',null,'dashboard-list');
      for (const item of past) {
        const row = el('li'); const a = link(item.title,item.target);
        row.append(el('time',day(item.date)),a,el('span',item.kind === 'fact' ? item.fact_kind.replaceAll('_',' ') : item.detail || item.kind,'dashboard-meta'));
        if (item.source) row.append(el('span',item.source,'dashboard-meta'));
        list.append(row);
      }
      history.append(list);
    }
    this.status.replaceChildren();
    if (!this.preferences) {
      this.status.append('Dashboard choices could not load ',button('Try again',()=>this.load()));
    }
  }

  overview() {
    const body = this.sections.get('overview');
    const summary = this.data.summary?.summary;
    if (summary) {
      const preview = root.StellisSummary.sections(summary.content,summary.citations).find(section=>section.heading==='Overview');
      const paragraph = el('p',null,'dashboard-summary');
      for (const part of preview?.paragraphs[0] || []) {
        if (part.citation) {
          const cite = link(String(part.citation.n),part.citation.target,'nb-cite');
          cite.setAttribute('aria-label','Source '+part.citation.n+': '+part.citation.title); paragraph.append(cite);
        } else paragraph.append(part.text);
      }
      if (paragraph.childNodes.length) body.append(paragraph,dom().accuracyNote('summaries','Written by a model'));
    }
    const facts = this.data.facts?.facts || [];
    const groups = el('div',null,'dashboard-fact-groups');
    for (const [kind,title] of [['condition','Conditions'],['medication','Medications'],['allergy','Allergies']]) {
      const items = facts.filter(fact=>fact.kind===kind).slice(0,3);
      if (!items.length) continue;
      const group = el('div'); group.append(el('h3',title));
      const list = el('ul');
      for (const fact of items) {
        const row = el('li'); row.append(link([fact.name,fact.value,fact.unit].filter(Boolean).join(' '),fact.target));
        if (fact.date) row.append(el('small',day(fact.date))); list.append(row);
      }
      group.append(list); groups.append(group);
    }
    if (groups.childElementCount) body.append(groups);
    if (!body.childElementCount) this.empty(body,
      !this.data.summary || !this.data.facts ? 'Your health overview could not load' : 'Add your records to see your health overview',
      'Add a record','/records');
    const contexts = selected(this.books,this.preferences?.care_contexts || []);
    if (contexts.length) {
      const active = el('div',null,'dashboard-contexts'); active.append(el('h3','Active care'));
      for (const book of contexts) {
        const a = link(book.name,'/notebook/'+encodeURIComponent(book.id),'dashboard-context');
        if (book.description) a.append(el('small',book.description)); active.append(a);
      }
      body.append(active);
    }
  }

  bookList(body, books) {
    if (!books.length) {
      body.append(el('p','Choose notebooks for your dashboard','dashboard-empty'),button('Choose notebooks',()=>{body.closest('dialog')?.close();this.customize();})); return;
    }
    const grid = el('div',null,'dashboard-book-grid');
    for (const book of books) {
      const a = link(book.name,'/notebook/'+encodeURIComponent(book.id),'dashboard-book');
      a.prepend(dom().icon('notebook'));
      const parent = this.collections.find(item=>item.id===book.collection_id);
      if (parent) a.append(el('span',parent.name,'dashboard-meta'));
      const recent = this.entries.find(item=>item.notebook_id===book.id);
      a.append(el('small',recent ? recent.title : book.description || 'Open notebook'));
      grid.append(a);
    }
    body.append(grid);
  }

  measurements(measures) {
    const body = this.sections.get('measurements');
    if (!this.data.readings) {this.empty(body,'Measurements could not load','Open trends','/trends');return;}
    const head = el('div',null,'dashboard-measure-actions');
    head.append(button('Choose measurements',()=>this.customize()));
    if (root.StellisCameraPulse) head.append(root.StellisCameraPulse.logButton(()=>this.load(),this.measures,'dashboard-camera'));
    body.append(head);
    if (!measures.length) {body.append(el('p','Choose up to three measurements','dashboard-empty'));return;}
    const grid = el('div',null,'dashboard-measure-grid');
    for (const measure of measures) {
      const card = el('article',null,'dashboard-measure');
      const detail = link(measure.label,'/trends?measure='+encodeURIComponent(measure.key));
      card.append(detail);
      const point = measure.points.at(-1);
      if (point) {
        card.append(el('strong',root.StellisTrendChart.formatValue(point,measure.decimals)+' '+measure.unit),el('time',day(point.time)));
        const graphic = sparkline(measure.points); if (graphic) card.append(graphic);
      } else card.append(el('p','No readings yet','dashboard-empty'));
      card.append(link('Log '+measure.label.toLowerCase(),'/trends?log='+encodeURIComponent(measure.key),'dashboard-link'));
      grid.append(card);
    }
    body.append(grid);
  }

  dialog(title) {
    const node = el('dialog',null,'dashboard-dialog');
    const opener = document.activeElement;
    const head = el('div',null,'dashboard-section-head');
    const heading = el('h2',title); heading.id = 'dashboard-dialog-'+(++dialogId);
    node.setAttribute('aria-labelledby',heading.id);
    const close = button('Close',()=>node.close()); head.append(heading,close); node.append(head);
    node.addEventListener('close',()=>{
      node.remove();
      const target = opener?.isConnected && opener.getClientRects().length ? opener : document.querySelector('#library-more > summary');
      target?.focus();
    },{once:true}); document.body.append(node); node.showModal();
    return node;
  }
  notebooks() {this.bookList(this.dialog('My Notebooks'),this.books);}
  eventDetail(event) {
    const dialog = this.dialog(event.title); dialog.append(el('p',day(event.date)),el('p',event.status+' — '+event.source));
    if (event.meeting?.location) dialog.append(el('p',event.meeting.location));
    if(event.meeting)for(const [label,method] of [['Notes','openNotes'],['Notebook','openNotebook'],['Record','recordMeeting']])dialog.append(button(label,()=>{dialog.close();root.StellisCalendar[method](event.meeting);}));
    dialog.append(link('Calendar settings','/settings'));
  }

  customize() {
    if (!this.preferences) {this.load();return;}
    const dialog = this.dialog('Dashboard'); const form = el('form');
    const choices = {};
    for (const [key,title,items] of [
      ['notebooks','My Notebooks',this.books.map(book=>[book.id,book.name])],
      ['measurements','Measurements',this.measures.map(measure=>[measure.key,measure.label])],
      ['care_contexts','Active care',this.books.map(book=>[book.id,book.name])],
    ]) {
      const group = el('fieldset'); group.append(el('legend',title),el('p','Choose up to three','dashboard-meta')); choices[key] = [];
      for (const [value,label] of items) {
        const box = el('input'); box.type='checkbox'; box.value=value; box.checked=this.preferences[key].includes(value);
        choices[key].push(box); const row = el('label',null,'dashboard-choice'); row.append(box,document.createTextNode(label)); group.append(row);
      }
      if (!items.length) group.append(button('Add a notebook',()=>{dialog.close();document.getElementById('new-notebook').click();}));
      form.append(group);
    }
    const status = el('p'); status.setAttribute('role','status');
    const save = dom().button('Save','invert-button'); save.type='submit'; form.append(status,save);
    form.addEventListener('submit',async event=>{
      event.preventDefault(); const values = Object.fromEntries(Object.entries(choices).map(([key,boxes])=>[key,boxes.filter(box=>box.checked).map(box=>box.value)]));
      if (Object.values(values).some(items=>items.length>3)) {status.textContent='Choose up to three items in each section';return;}
      save.disabled=true;
      try {this.preferences=await dom().api('/dashboard/preferences',{method:'PUT',json:values});dialog.close();this.paint();}
      catch(error) {status.textContent=error.message;save.disabled=false;}
    });
    dialog.append(form);
  }
}
let current;
async function mount(host, library) {
  if (current) {current.destroyed=true;current.calendarView?.destroy();current.tracker?.destroy();}
  current = new Dashboard(host,library); await current.load();
}
root.addEventListener?.('stellis:health-preferences-changed',()=>{if(current&&!current.destroyed)current.load();});
root.StellisHealthDashboard = {mount,reload:()=>current?.load(),focusCycle:day=>current?.tracker?.openRecord('day:'+day),focusCalendar:day=>current?.calendarView?.focusDate(day),customize:()=>current?.customize(),selected};
if (typeof module !== 'undefined') module.exports = {selected};
})(typeof window !== 'undefined' ? window : globalThis);
