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
  const days = document.querySelector('#calendar-days');
  const DAY_COUNT = 3;
  const HOUR_PX = 44;
  let upcoming = [];
  let errors = [];
  let view = 'list';
  try { if (localStorage.getItem('stellis-calendar-view') === 'days') view = 'days'; } catch {}

  // All-day events carry a calendar date; timed events carry an instant.
  function localDate(value) {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  function startOf(item) { return item.all_day ? localDate(item.start) : new Date(item.start); }
  function endOf(item) { return item.all_day ? localDate(item.end) : new Date(item.end); }
  function addDays(date, count) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count); }
  function windowDates() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({length:DAY_COUNT}, (_, index) => addDays(today, index));
  }
  function inWindow(item) {
    const [first] = windowDates();
    return startOf(item) < addDays(first, DAY_COUNT) && endOf(item) > first;
  }
  function dayName(date) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const offset = Math.round((day - windowDates()[0]) / 86400000);
    return offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : date.toLocaleDateString([], {weekday:'long'});
  }
  function clock(date) { return date.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); }
  function happeningNow(item) { const now = new Date(); return !item.all_day && startOf(item) <= now && endOf(item) > now; }

  function recordMeeting(item) {
    if (document.querySelector('#record-button .button-label').textContent === 'Record') {
      document.querySelector('#recording-title').value = item.title;
      pendingCalendarEvent = {provider:item.provider, id:item.id};
    }
    document.querySelector('#record-button').click();
  }
  function actions(item) {
    const notes = document.createElement('button'); notes.type = 'button'; notes.className = 'meeting-action';
    notes.setAttribute('aria-label', `Notes for ${item.title}`);
    notes.title = item.has_notes ? 'Open notes' : 'Add notes';
    notes.classList.toggle('has-notes', Boolean(item.has_notes));
    notes.append(icon(item.has_notes ? 'file-text' : 'file'));
    notes.addEventListener('click', () => openNotes(item));
    const record = document.createElement('button'); record.type = 'button'; record.className = 'meeting-action meeting-record';
    record.setAttribute('aria-label', `Record ${item.title}`); record.title = 'Record';
    const dot = document.createElement('span'); dot.className = 'record-dot'; dot.setAttribute('aria-hidden', 'true');
    record.append(dot);
    record.addEventListener('click', () => recordMeeting(item));
    const group = document.createElement('div'); group.className = 'meeting-actions';
    group.append(notes, record);
    return group;
  }

  function meetingRow(item) {
    const row = document.createElement('div'); row.className = 'calendar-meeting';
    row.classList.toggle('is-now', happeningNow(item));
    const when = document.createElement('time'); when.dateTime = item.start;
    when.textContent = `${dayName(startOf(item))} ${item.all_day ? 'all day' : clock(startOf(item))}`;
    const title = document.createElement('strong'); title.textContent = item.title;
    row.append(when, title, actions(item));
    return row;
  }

  // Overlapping meetings in a day share its width side by side.
  function lanes(items) {
    const placed = []; let cluster = []; let clusterEnd = 0;
    const close = () => { for (const entry of cluster) entry.count = Math.max(...cluster.map(other => other.lane)) + 1; };
    for (const item of [...items].sort((a, b) => a.start - b.start || b.end - a.end)) {
      if (cluster.length && item.start >= clusterEnd) { close(); cluster = []; }
      const ends = [];
      for (const entry of cluster) ends[entry.lane] = Math.max(ends[entry.lane] || 0, entry.end);
      let lane = ends.findIndex(end => end <= item.start); if (lane < 0) lane = ends.length;
      const entry = {...item, lane}; cluster.push(entry); placed.push(entry);
      clusterEnd = Math.max(clusterEnd, item.end);
    }
    close();
    return placed;
  }
  function hourRange(timed) {
    const now = new Date();
    let first = Math.min(8, now.getHours()); let last = Math.max(20, now.getHours() + 1);
    for (const {start, end, day} of timed) {
      first = Math.min(first, Math.floor((start - day) / 3600000));
      last = Math.max(last, Math.ceil((end - day) / 3600000));
    }
    return [Math.max(0, first), Math.min(24, last)];
  }
  function renderDays() {
    const dates = windowDates();
    const items = upcoming.filter(inWindow);
    const timed = []; const allDay = dates.map(() => []);
    dates.forEach((day, index) => {
      const next = addDays(day, 1);
      for (const item of items) {
        if (startOf(item) >= next || endOf(item) <= day) continue;
        if (item.all_day) { allDay[index].push(item); continue; }
        timed.push({item, day, index, start:Math.max(startOf(item), day), end:Math.min(endOf(item), next)});
      }
    });
    const [firstHour, lastHour] = hourRange(timed);
    days.style.setProperty('--hour', `${HOUR_PX}px`);
    days.style.setProperty('--hours', lastHour - firstHour);
    const head = document.createElement('div'); head.className = 'days-head';
    head.append(document.createElement('span'), ...dates.map(date => {
      const label = document.createElement('div'); label.className = 'days-label';
      const name = document.createElement('strong'); name.textContent = dayName(date);
      const number = document.createElement('span'); number.textContent = date.toLocaleDateString([], {month:'short', day:'numeric'});
      label.append(name, number);
      return label;
    }));
    const parts = [head];
    if (allDay.some(list => list.length)) {
      const row = document.createElement('div'); row.className = 'days-all-day';
      row.append(document.createElement('span'), ...allDay.map(list => {
        const cell = document.createElement('div');
        cell.append(...list.map(item => {
          const chip = document.createElement('div'); chip.className = 'days-chip';
          const title = document.createElement('strong'); title.textContent = item.title;
          chip.append(title, actions(item));
          return chip;
        }));
        return cell;
      }));
      parts.push(row);
    }
    const grid = document.createElement('div'); grid.className = 'days-grid';
    const hours = document.createElement('div'); hours.className = 'days-hours'; hours.setAttribute('aria-hidden', 'true');
    for (let hour = firstHour; hour < lastHour; hour++) {
      const label = document.createElement('span');
      label.textContent = new Date(2000, 0, 1, hour).toLocaleTimeString([], {hour:'numeric'});
      hours.append(label);
    }
    grid.append(hours);
    dates.forEach((day, index) => {
      const column = document.createElement('div'); column.className = 'days-column';
      column.setAttribute('aria-label', dayName(day));
      for (const entry of lanes(timed.filter(slot => slot.index === index))) {
        const block = document.createElement('div'); block.className = 'days-event';
        const top = ((entry.start - day) / 3600000 - firstHour) * HOUR_PX;
        const height = Math.max(((entry.end - entry.start) / 3600000) * HOUR_PX, 26);
        block.style.top = `${top}px`; block.style.height = `${height - 2}px`;
        block.style.left = `calc(${(entry.lane / entry.count) * 100}% + 2px)`;
        block.style.width = `calc(${100 / entry.count}% - 4px)`;
        block.classList.toggle('is-short', height < 54); block.title = entry.item.title;
        block.classList.toggle('is-now', happeningNow(entry.item));
        const text = document.createElement('div'); text.className = 'days-event-text';
        const title = document.createElement('strong'); title.textContent = entry.item.title;
        const when = document.createElement('time'); when.dateTime = entry.item.start;
        when.textContent = `${clock(startOf(entry.item))} to ${clock(endOf(entry.item))}`;
        text.append(title, when);
        block.append(text, actions(entry.item));
        column.append(block);
      }
      if (index === 0) {
        const now = document.createElement('div'); now.className = 'days-now'; now.setAttribute('aria-hidden', 'true');
        column.append(now);
      }
      grid.append(column);
    });
    parts.push(grid);
    days.replaceChildren(...parts);
    days.dataset.firstHour = firstHour;
    placeNow();
  }
  // The now bar marks where today stands and moves each minute.
  function placeNow() {
    const bar = days.querySelector('.days-now');
    if (!bar) return;
    const now = new Date(); const firstHour = Number(days.dataset.firstHour);
    const hours = now.getHours() + now.getMinutes() / 60 - firstHour;
    bar.hidden = hours < 0 || hours > Number(days.style.getPropertyValue('--hours'));
    bar.style.top = `${hours * HOUR_PX}px`;
  }
  setInterval(() => { if (!days.hidden) placeNow(); }, 60000);

  function render() {
    const inRange = upcoming.filter(inWindow);
    meetings.hidden = view !== 'list'; days.hidden = view !== 'days';
    document.querySelector('#calendar-view-list').setAttribute('aria-pressed', String(view === 'list'));
    document.querySelector('#calendar-view-days').setAttribute('aria-pressed', String(view === 'days'));
    if (view === 'list') meetings.replaceChildren(...inRange.map(meetingRow));
    else renderDays();
    status.textContent = errors.length ? errors.map(error => error.message).join(' ') :
      inRange.length ? '' : 'No meetings in the next 3 days';
  }
  for (const [id, value] of [['#calendar-view-list', 'list'], ['#calendar-view-days', 'days']]) {
    document.querySelector(id).addEventListener('click', () => {
      view = value;
      try { localStorage.setItem('stellis-calendar-view', value); } catch {}
      render();
    });
  }

  // Notes written ahead of a meeting become the recording's My Notes when it is recorded.
  const notesDialog = document.querySelector('#event-notes-dialog');
  const notesStatus = document.querySelector('#event-notes-status');
  let notesEditor = null;
  let note = null;
  async function openNotes(item) {
    note = {item, revision:0, saved:'', pending:null, timer:null, chain:Promise.resolve()};
    document.querySelector('#event-notes-title').textContent = item.title;
    const when = document.querySelector('#event-notes-when'); when.dateTime = item.start;
    when.textContent = `${dayName(startOf(item))} ${item.all_day ? 'all day' : `${clock(startOf(item))} to ${clock(endOf(item))}`}`;
    notesStatus.textContent = '';
    try {
      if (!notesEditor) {
        notesModulePromise ||= import('/static/notes-editor.bundle.js');
        const {createNotesEditor} = await notesModulePromise;
        notesEditor = createNotesEditor(document.querySelector('#event-notes-editor'),
          document.querySelector('#event-notes-toolbar'), markdown => {
            if (!note) return;
            note.pending = markdown; notesStatus.textContent = 'Unsaved';
            clearTimeout(note.timer); note.timer = setTimeout(saveNotes, 600);
          }, error => { notesStatus.textContent = error.message; });
      }
      const remote = await request(`/notes?${new URLSearchParams({provider:item.provider, event_id:item.id})}`);
      note.revision = remote.revision; note.saved = remote.markdown;
      notesEditor.setMarkdown(remote.markdown);
    } catch (error) { notesStatus.textContent = error.message; }
    notesDialog.showModal();
    document.querySelector('#event-notes-editor').focus();
  }
  function saveNotes() {
    const current = note;
    if (!current) return Promise.resolve();
    clearTimeout(current.timer);
    current.chain = current.chain.then(async () => {
      const markdown = current.pending;
      if (markdown === null || markdown === current.saved) return;
      notesStatus.textContent = 'Saving';
      try {
        const result = await request('/notes', {method:'PUT', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({provider:current.item.provider, event_id:current.item.id, markdown,
            expected_revision:current.revision})});
        current.revision = result.revision; current.saved = markdown;
        current.item.has_notes = Boolean(markdown.trim());
        if (note === current) notesStatus.textContent = 'Saved';
      } catch (error) { notesStatus.textContent = error.message; throw error; }
    });
    return current.chain;
  }
  async function closeNotes() {
    try { await saveNotes(); } catch { return false; }
    note = null;
    if (notesDialog.open) notesDialog.close();
    render();
    return true;
  }
  document.querySelector('#event-notes-done').addEventListener('click', closeNotes);
  notesDialog.addEventListener('cancel', event => { event.preventDefault(); closeNotes(); });
  document.querySelector('#event-notes-record').addEventListener('click', async () => {
    const item = note?.item;
    if (item && await closeNotes()) recordMeeting(item);
  });

  async function refresh() {
    if (loading || card.parentElement.closest('[hidden]')) return;
    loading = true; refreshButton.disabled = true;
    try {
      const rows = await request('/connections');
      card.hidden = !rows.some(row => row.connected);
      if (card.hidden) return;
      const result = await request('/meetings');
      upcoming = result.meetings; errors = result.errors;
      render();
    } catch (error) { status.textContent = error.message; }
    finally { loading = false; refreshButton.disabled = false; }
  }
  refreshButton.addEventListener('click', refresh);
  // app.js renders home before this script loads, so refresh once now.
  refresh();
  return {refresh, request, labels};
})();
