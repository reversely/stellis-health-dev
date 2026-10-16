/* Optional read-only calendars. Event data stays in this device browser and service. */
window.StellisCalendar = (() => {
  const card = document.querySelector('#calendar-card');
  const connections = document.querySelector('#calendar-connections');
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
  function connectionRow(item) {
    const row = document.createElement('div'); row.className = 'calendar-connection';
    const label = document.createElement('span');
    label.textContent = `${labels[item.provider]}: ${item.connected ? 'Connected' : item.configured ? 'Not connected' : 'Unavailable'}`;
    row.append(label);
    if (item.configured || item.connected) {
      const action = document.createElement('button'); action.type = 'button';
      action.textContent = item.connected ? 'Disconnect' : 'Connect';
      action.addEventListener('click', async () => {
        action.disabled = true; status.textContent = '';
        try {
          if (item.connected) {
            await request(`/${item.provider}/disconnect`, {method:'POST'});
            await refresh();
          } else {
            const result = await request(`/${item.provider}/authorize`);
            location.assign(result.url);
          }
        } catch (error) { status.textContent = error.message; action.disabled = false; }
      });
      row.append(action);
    }
    return row;
  }
  function meetingRow(item) {
    const row = document.createElement('div'); row.className = 'calendar-meeting';
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = item.title;
    const meta = document.createElement('span');
    const start = item.all_day ? item.start.slice(0, 10) : new Date(item.start).toLocaleString([], {dateStyle:'medium',timeStyle:'short'});
    meta.textContent = `${start}${item.all_day ? ', all day' : ''}, ${labels[item.provider]}`;
    info.append(title, meta);
    const record = document.createElement('button'); record.type = 'button'; record.textContent = 'Record';
    record.addEventListener('click', () => {
      if (document.querySelector('#record-button .button-label').textContent === 'Record')
        document.querySelector('#recording-title').value = item.title;
      document.querySelector('#record-button').click();
    });
    row.append(info, record);
    return row;
  }
  async function refresh() {
    if (loading || card.closest('[hidden]')) return;
    loading = true; refreshButton.disabled = true; status.textContent = 'Loading meetings…';
    try {
      const rows = await request('/connections');
      card.hidden = !rows.some(row => row.configured || row.connected);
      if (card.hidden) return;
      connections.replaceChildren(...rows.map(connectionRow));
      const connected = rows.some(row => row.connected);
      refreshButton.hidden = !connected;
      if (!connected) {
        meetings.replaceChildren();
        status.textContent = 'Connect a calendar to see meetings.';
        return;
      }
      const result = await request('/meetings');
      meetings.replaceChildren(...result.meetings.map(meetingRow));
      status.textContent = result.errors.length ? result.errors.map(error => error.message).join(' ') :
        result.meetings.length ? '' : 'No meetings in the next 14 days.';
    } catch (error) { status.textContent = error.message; }
    finally { loading = false; refreshButton.disabled = false; }
  }
  refreshButton.addEventListener('click', refresh);
  const outcome = new URLSearchParams(location.search).get('calendar');
  if (outcome) {
    history.replaceState(history.state, '', location.pathname);
    status.textContent = outcome === 'connected' ? 'Calendar connected.' : 'Calendar connection failed. Try again.';
  }
  refresh();
  return {refresh};
})();
