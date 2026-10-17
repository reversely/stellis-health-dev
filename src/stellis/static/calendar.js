/* Optional read-only calendars. Event data stays in this device browser and service.
   Home shows upcoming meetings once a calendar is connected; Account settings manages connections. */
window.StellisCalendar = (() => {
  const card = document.querySelector('#calendar-card');
  const meetings = document.querySelector('#calendar-meetings');
  const status = document.querySelector('#calendar-status');
  const refreshButton = document.querySelector('#calendar-refresh');
  const labels = {google:'Google Calendar', microsoft:'Outlook'};
  let loading = false;

  async function request(path, options) {
    const response = await fetch(`/api/v1/calendar${path}`, options);
    const value = await response.json();
    if (!response.ok) throw Error(value.detail || 'Calendar request failed');
    return value;
  }
  function meetingRow(item) {
    const row = document.createElement('div'); row.className = 'calendar-meeting';
    const when = document.createElement('time'); when.dateTime = item.start;
    when.textContent = item.all_day ? 'All day' :
      new Date(item.start).toLocaleString([], {weekday:'short', hour:'numeric', minute:'2-digit'});
    const title = document.createElement('strong'); title.textContent = item.title;
    const record = document.createElement('button'); record.type = 'button'; record.className = 'icon-button';
    record.setAttribute('aria-label', `Record ${item.title}`); record.title = 'Record this meeting';
    record.append(icon('microphone'));
    record.addEventListener('click', () => {
      if (document.querySelector('#record-button .button-label').textContent === 'Record')
        document.querySelector('#recording-title').value = item.title;
      document.querySelector('#record-button').click();
    });
    row.append(when, title, record);
    return row;
  }
  async function refresh() {
    if (loading || card.parentElement.closest('[hidden]')) return;
    loading = true; refreshButton.disabled = true;
    try {
      const rows = await request('/connections');
      card.hidden = !rows.some(row => row.connected);
      if (card.hidden) return;
      const result = await request('/meetings');
      meetings.replaceChildren(...result.meetings.slice(0, 5).map(meetingRow));
      status.textContent = result.errors.length ? result.errors.map(error => error.message).join(' ') :
        result.meetings.length ? '' : 'No meetings in the next 14 days';
    } catch (error) { status.textContent = error.message; }
    finally { loading = false; refreshButton.disabled = false; }
  }
  refreshButton.addEventListener('click', refresh);
  // app.js renders home before this script loads, so refresh once now.
  refresh();
  return {refresh, request, labels};
})();
