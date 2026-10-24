/**
 * @fileoverview Joined logging: choose up to ten tracked items, review them
 * with one shared date, and save them together. The same review list shows
 * entries Stellis proposes, which save only through "Log selected".
 * Items, controls and limits come from GET /trackers/log/items. See ADR 0086.
 */
(function(root) {
'use strict';
const dom = () => root.StellisDom;
const el = (tag, text, cls) => dom().el(tag, text, cls);
const calendarDates = () => root.StellisCalendarDates;
const today = () => root.StellisDemoDate || calendarDates().formatDate(new Date());
const dateLabel = date => new Date(date + 'T12:00:00').toLocaleDateString([], {weekday: 'long', month: 'short', day: 'numeric'});
// Search appears once a person tracks more items than fit on one screen.
const SEARCH_AFTER = 12;
let nextId = 0;
let open = null;

function button(label, onClick, cls = 'coach-button') {
  const node = dom().button(label, cls);
  node.addEventListener('click', onClick);
  return node;
}

function iconButton(label, icon, onClick) {
  const node = button(null, onClick, 'coach-button tracker-icon-button');
  node.setAttribute('aria-label', label);
  node.append(dom().icon(icon));
  return node;
}

/** One line describing an item's state today. */
function stateText(item) {
  const state = item.state;
  if (item.control.type === 'status') {
    if (state.status) return state.status === 'taken' ? 'Taken today' : 'Skipped today';
    if (state.expected) return 'Due today';
    if (state.loggable) return 'As needed';
    return state.next ? 'Next dose ' + dateLabel(state.next) : 'No dose due';
  }
  if (item.control.type === 'done') return state.status === 'done' ? 'Done today' : item.detail;
  if (item.control.type === 'choice') return state.status ? `${state.status} today` : 'Not logged today';
  return item.detail;
}

/** A short-lived message with an optional action, on the inverted block role. */
function toast(text, action) {
  document.querySelector('.log-toast')?.remove();
  const region = el('div', null, 'log-toast');
  region.setAttribute('role', 'status');
  region.append(el('span', text));
  if (action) region.append(button(action.label, action.run, 'log-toast-action'));
  document.body.append(region);
  const timer = setTimeout(() => region.remove(), 8000);
  region.addEventListener('focusin', () => clearTimeout(timer), {once: true});
  return region;
}

/** The control for one row in the review list; returns a reader for its value. */
function rowControl(item, entry, rowId) {
  const control = item.control;
  const wrap = el('div', null, 'log-row-control');
  if (control.type === 'status' || control.type === 'choice') {
    const group = el('div', null, 'log-choices');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', rowId);
    let value = entry.value ?? control.default;
    const buttons = control.choices.map(([key, label]) => {
      const choice = button(label, () => {
        value = key;
        for (const other of buttons) other.setAttribute('aria-pressed', String(other === choice));
      }, 'log-choice');
      choice.setAttribute('aria-pressed', String(key === value));
      return choice;
    });
    group.append(...buttons);
    wrap.append(group);
    return {wrap, read: () => ({value})};
  }
  if (control.type === 'done') {
    wrap.append(el('span', 'Done', 'log-done'));
    return {wrap, read: () => ({value: true})};
  }
  const number = (label, value) => {
    const field = el('label', null, 'log-number');
    const input = el('input');
    input.type = 'number'; input.inputMode = 'decimal'; input.required = true;
    input.min = String(control.min); input.max = String(control.max);
    input.step = control.decimals ? String(10 ** -control.decimals) : '1';
    input.value = value ?? '';
    input.setAttribute('aria-label', label);
    field.append(input);
    return {field, input};
  };
  const first = number(control.paired ? `${item.title}, first number` : item.title, entry.value);
  wrap.append(first.field);
  let second = null;
  if (control.paired) {
    wrap.append(el('span', '/', 'log-number-separator'));
    second = number(`${item.title}, second number`, entry.value2);
    wrap.append(second.field);
  }
  wrap.append(el('span', control.unit, 'log-unit'));
  return {wrap, read: () => ({value: first.input.value === '' ? null : Number(first.input.value),
    ...(second ? {value2: second.input.value === '' ? null : Number(second.input.value)} : {})})};
}

/**
 * Opens the log sheet.
 * @param {{proposals: (!Array<!Object>|undefined), day: (string|undefined),
 *     title: (string|undefined), notebookId: (?string|undefined),
 *     onSaved: (function()|undefined)}=} options
 *     With `proposals` (entries with item, value and evidence), the sheet
 *     opens on the review step with each proposal checked.
 */
async function openSheet(options = {}) {
  open?.close();
  const opener = document.activeElement;
  const dialog = el('dialog', null, 'dashboard-dialog log-sheet');
  open = dialog;
  const head = el('div', null, 'drawer-head');
  const heading = el('h2', options.title || 'Log');
  heading.id = `log-sheet-${++nextId}`;
  dialog.setAttribute('aria-labelledby', heading.id);
  head.append(heading, button('Close', () => dialog.close(), 'coach-button is-quiet'));
  const body = el('div', null, 'log-body');
  const footer = el('div', null, 'log-footer');
  const status = el('p', null, 'log-status');
  status.setAttribute('role', 'status');
  dialog.append(head, body, status, footer);
  document.body.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (open === dialog) open = null;
    if (opener?.isConnected) opener.focus();
  }, {once: true});
  dialog.showModal();
  status.textContent = 'Loading';
  let items, max;
  try {
    ({items, max} = await dom().api('/trackers/log/items?today=' + today()));
  } catch (error) {
    status.textContent = error.message;
    return dialog;
  }
  status.textContent = '';
  if (options.notebookId) {
    // Items from this notebook lead; everything else stays available.
    items = [...items.filter(item => item.notebook_id === options.notebookId),
             ...items.filter(item => item.notebook_id !== options.notebookId)];
  }
  const byId = new Map(items.map(item => [item.id, item]));
  const selected = new Map();  // item id -> entry draft
  const proposals = options.proposals || [];
  for (const proposal of proposals) if (byId.has(proposal.item)) selected.set(proposal.item, {...proposal, checked: true});

  function choose() {
    heading.textContent = options.title || 'Log';
    body.replaceChildren(); footer.replaceChildren(); status.textContent = '';
    if (!items.length) {
      body.append(el('p', 'Add a medicine, goal or measurement to log it here.', 'log-empty'));
      footer.append(button('Close', () => dialog.close()));
      return;
    }
    const count = el('p', null, 'log-count');
    count.setAttribute('aria-live', 'polite');
    const review = button('', () => reviewStep(), 'coach-button is-primary');
    const refresh = () => {
      count.textContent = selected.size ? `${selected.size} selected` : `Choose up to ${max}`;
      review.textContent = selected.size ? `Review ${selected.size}` : 'Review';
      review.disabled = !selected.size;
    };
    let filter = '';
    const groups = el('div', null, 'log-groups');
    const paint = () => {
      groups.replaceChildren();
      const shown = items.filter(item => !filter || `${item.title} ${item.area}`.toLowerCase().includes(filter));
      for (const area of [...new Set(shown.map(item => item.area))]) {
        const section = el('section', null, 'log-group');
        const title = el('h3', area); title.id = `log-area-${++nextId}`;
        section.setAttribute('aria-labelledby', title.id);
        const grid = el('div', null, 'log-tiles');
        for (const item of shown.filter(candidate => candidate.area === area)) {
          const tile = button(null, () => {
            if (selected.has(item.id)) selected.delete(item.id);
            else if (selected.size >= max) { status.textContent = `Choose up to ${max}`; return; }
            else selected.set(item.id, {item: item.id});
            status.textContent = '';
            tile.setAttribute('aria-pressed', String(selected.has(item.id)));
            refresh();
          }, 'log-tile');
          tile.dataset.item = item.id;
          tile.setAttribute('aria-pressed', String(selected.has(item.id)));
          const mark = el('span', null, 'log-tile-icon'); mark.append(dom().icon(item.icon));
          const text = el('span', null, 'log-tile-text');
          text.append(el('strong', item.title), el('span', stateText(item), 'log-tile-state'));
          const check = el('span', null, 'log-tile-check'); check.append(dom().icon('check'));
          tile.append(mark, text, check);
          grid.append(tile);
        }
        section.append(title, grid);
        groups.append(section);
      }
      if (!shown.length) groups.append(el('p', 'No items match', 'log-empty'));
    };
    if (items.length > SEARCH_AFTER) {
      const search = el('input', null, 'log-search');
      search.type = 'search'; search.placeholder = 'Search'; search.setAttribute('aria-label', 'Search items');
      search.addEventListener('input', () => { filter = search.value.trim().toLowerCase(); paint(); });
      body.append(search);
    }
    body.append(count, groups);
    paint(); refresh();
    footer.append(button('Cancel', () => dialog.close()), review);
    body.querySelector('.log-tile, .log-search')?.focus();
  }

  function reviewStep() {
    const proposing = proposals.length > 0;
    heading.textContent = options.title || (proposing ? 'Confirm' : 'Review');
    body.replaceChildren(); footer.replaceChildren(); status.textContent = '';
    // One date for every row; schedules are checked against it on save.
    const when = el('fieldset', null, 'log-when');
    when.append(el('legend', 'When'));
    let day = options.day || today();
    const yesterday = calendarDates().shiftDate(today(), -1);
    const other = el('input'); other.type = 'date'; other.max = today(); other.setAttribute('aria-label', 'Date');
    const time = el('input'); time.type = 'time'; time.setAttribute('aria-label', 'Time, optional');
    const dayButtons = [['Today', today()], ['Yesterday', yesterday]].map(([label, value]) => {
      const choice = button(label, () => { day = value; other.value = ''; sync(); }, 'log-choice');
      choice.dataset.day = value;
      return choice;
    });
    const sync = () => {
      for (const choice of dayButtons) choice.setAttribute('aria-pressed', String(choice.dataset.day === day && !other.value));
      if (![today(), yesterday].includes(day)) other.value = day;
      dayLine.textContent = dateLabel(day);
    };
    other.addEventListener('change', () => { if (other.value) { day = other.value; sync(); } });
    const dayLine = el('p', null, 'log-when-day');
    const controls = el('div', null, 'log-when-controls');
    controls.append(...dayButtons, other, time);
    when.append(controls, dayLine);
    sync();
    const list = el('ul', null, 'log-rows');
    const readers = new Map();
    for (const [id, entry] of selected) {
      const item = byId.get(id);
      const row = el('li', null, 'log-row');
      row.dataset.item = id;
      const rowId = `log-row-${++nextId}`;
      const label = el('div', null, 'log-row-label');
      const mark = el('span', null, 'log-tile-icon'); mark.append(dom().icon(item.icon));
      const title = el('strong', item.title); title.id = rowId;
      label.append(mark, title);
      if (item.detail && item.control.type !== 'number') label.append(el('span', item.detail, 'log-row-detail'));
      const built = rowControl(item, entry, rowId);
      const error = el('p', null, 'log-row-error'); error.setAttribute('role', 'alert');
      if (proposing) {
        const keep = el('input'); keep.type = 'checkbox'; keep.checked = entry.checked !== false;
        keep.setAttribute('aria-labelledby', rowId);
        keep.addEventListener('change', () => { entry.checked = keep.checked; refresh(); });
        row.append(keep);
      }
      row.append(label, built.wrap);
      if (!proposing) {
        row.append(iconButton(`Remove ${item.title}`, 'x', () => {
          selected.delete(id); readers.delete(id); row.remove(); refresh();
          if (!selected.size) choose();
        }));
      }
      if (entry.evidence) row.append(el('p', `From "${entry.evidence}"`, 'log-row-evidence'));
      row.append(error);
      readers.set(id, {read: built.read, error, entry});
      list.append(row);
    }
    const save = button('', submit, 'coach-button is-primary');
    const refresh = () => {
      const count = [...readers.values()].filter(reader => !proposing || reader.entry.checked !== false).length;
      save.textContent = proposing ? 'Log selected' : `Save ${count} ${count === 1 ? 'entry' : 'entries'}`;
      save.disabled = !count;
    };
    async function submit() {
      const chosen = [...readers.entries()].filter(([, reader]) => !proposing || reader.entry.checked !== false);
      for (const [, reader] of chosen) reader.error.textContent = '';
      save.disabled = true; status.textContent = 'Saving';
      const entries = chosen.map(([id, reader]) => ({item: id, ...reader.read(),
        ...(reader.entry.evidence ? {evidence: reader.entry.evidence} : {})}));
      try {
        const result = await dom().api('/trackers/entries', {method: 'POST', json: {day, time: time.value || null, entries}});
        dialog.close();
        options.onSaved?.();
        root.dispatchEvent(new Event('health-capture-saved'));
        const message = toast(`Saved ${result.saved} ${result.saved === 1 ? 'entry' : 'entries'}`, {label: 'Undo', run: async () => {
          try {
            const undone = await dom().api('/trackers/entries/' + result.batch_id, {method: 'DELETE'});
            message.firstChild.textContent = undone.kept ? `Undone, ${undone.kept} changed since and kept` : 'Undone';
            message.querySelector('button')?.remove();
            options.onSaved?.();
            root.dispatchEvent(new Event('health-capture-saved'));
          } catch (error) { message.firstChild.textContent = error.message; }
        }});
      } catch (error) {
        status.textContent = error.message;
        for (const [index, text] of Object.entries(error.data?.detail?.errors || {})) {
          const reader = readers.get(chosen[Number(index)]?.[0]);
          if (reader) reader.error.textContent = text;
        }
        save.disabled = false;
        list.querySelector('.log-row-error:not(:empty)')?.closest('.log-row')?.querySelector('button,input')?.focus();
      }
    }
    body.append(when, list);
    footer.append(proposing ? button('Cancel', () => dialog.close()) : button('Back', choose), save);
    refresh();
    list.querySelector('button,input')?.focus();
  }

  if (proposals.length) {
    if (!selected.size) { status.textContent = 'These items are no longer available to log'; return dialog; }
    reviewStep();
  } else choose();
  return dialog;
}

root.StellisTrackerLog = {open: openSheet};
})(window);
