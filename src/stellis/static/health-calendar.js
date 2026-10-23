/** One month and agenda surface backed by the shared calendar event endpoint. */
(function(root) {
  'use strict';
  const dates=root.StellisCalendarDates;
  function mount(host,options={}) {
    const createElement=root.StellisDom.el;
    let month=dates.formatDate(new Date()).slice(0,7),selectedDate=dates.formatDate(new Date()),events=[],tracks=[],hasLoaded=false,loadFailed=false,requestId=0,destroyed=false;
    const status=createElement('p',null,'health-calendar-status');status.setAttribute('role','status');
    const layout=createElement('div',null,'health-calendar-layout');
    const monthHost=createElement('div',null,'health-calendar-month');
    const agenda=createElement('div',null,'health-calendar-agenda');layout.append(monthHost,agenda);host.replaceChildren(status,layout);
    function selectDate(selection) {selectedDate=selection.date;renderAgenda();}
    function renderAgenda() {
      const label=dates.parseDate(selectedDate).toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});
      const focusedEventId=agenda.contains(document.activeElement)?document.activeElement.closest('[data-event-id]')?.dataset.eventId:null;
      const heading=createElement('h3',label);agenda.replaceChildren(heading);
      const selectedEvents=events.filter(event=>event.start_date<=selectedDate&&event.end_date>=selectedDate);
      if(!selectedEvents.length)agenda.append(createElement('p',loadFailed?'Calendar events unavailable':hasLoaded?'No events for this date':'Loading events','dashboard-empty'));
      for(const event of selectedEvents) {
        const row=root.StellisDom.button(null,'health-calendar-event');row.dataset.eventId=event.id;
        const title=createElement('strong',event.title);
        const track=tracks.find(track=>track.id===event.track_id);
        const detail=event.all_day?(track?.label || event.kind):new Date(event.start).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
        row.append(title,createElement('span',detail,'dashboard-meta'));
        row.addEventListener('click',()=>options.onSelectEvent?.(event));agenda.append(row);
      }
      if(focusedEventId)[...agenda.querySelectorAll('[data-event-id]')].find(row=>row.dataset.eventId===focusedEventId)?.focus();
    }
    function renderMonth() {
      const activeTracks=tracks.filter(track=>events.some(event=>event.track_id===track.id));
      const calendar=root.StellisCalendarView.createMonth({month,selectedDate,label:'Calendar',tracks:activeTracks,
        events:events.map(event=>({id:event.id,startDate:event.start_date,endDate:event.end_date,trackId:event.track_id,label:event.title})),
        onSelectDate:selectDate,onMonthChange:(value,selection)=>{month=value;selectedDate=selection.focusedDate;load();}});
      const previousControl=monthHost.contains(document.activeElement)?document.activeElement:null;
      const focusedDate=previousControl?.dataset.date;
      const navigationLabel=previousControl?.classList.contains('calendar-month-navigation')?previousControl.getAttribute('aria-label'):null;
      monthHost.replaceChildren(calendar.element);renderAgenda();
      if(focusedDate)monthHost.querySelector(`[data-date="${focusedDate}"]`)?.focus();
      else if(navigationLabel)[...monthHost.querySelectorAll('.calendar-month-navigation')].find(button=>button.getAttribute('aria-label')===navigationLabel)?.focus();
    }
    async function load() {
      const currentRequest=++requestId;
      status.textContent='Loading calendar';
      const range=dates.monthDates(month);
      const query=new URLSearchParams({start:range[0],end:range.at(-1),utc_offset:String(new Date().getTimezoneOffset()),time_zone:Intl.DateTimeFormat().resolvedOptions().timeZone});
      try {
        const result=await root.StellisDom.api('/calendar/events?'+query);
        if(destroyed||currentRequest!==requestId)return;
        hasLoaded=true;loadFailed=false;events=result.events;tracks=(result.tracks||[]).map(track=>({...track,color:`var(--calendar-${track.tone},var(--ink))`}));renderMonth();status.textContent=result.errors?.length?'Some connected calendar events could not load':'';
        if(result.errors?.length){const retry=root.StellisDom.button('Try again','coach-button');retry.onclick=load;status.append(retry);}
      }catch(error){
        if(destroyed||currentRequest!==requestId)return;
        loadFailed=true;renderMonth();const retry=root.StellisDom.button('Try again','coach-button');retry.onclick=load;
        status.replaceChildren(createElement('span',error.message),retry);
      }
    }
    renderMonth();load();
    return {reload:load,getSelectedDate:()=>selectedDate,destroy:()=>{destroyed=true;requestId++;}};
  }
  root.StellisHealthCalendar={mount};
})(window);
