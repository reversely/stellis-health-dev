/** Sequential synthetic records in the existing docked tour surface. */
(() => {
'use strict';
const dom = window.StellisDom;
let active;
function navigate(path) {
  if (location.pathname !== path) {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}
async function digest(record) {
  const response = await fetch(`/api/v1/documents/${encodeURIComponent(record.id)}/file`);
  if (!response.ok) throw Error('Could not check the uploaded file');
  const bytes = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
async function open() {
  active?.close();
  const opener = document.activeElement;
  const panel = dom.el('section', null, 'coach-call');
  panel.dataset.kind = 'tour'; panel.dataset.guide = 'maya'; panel.setAttribute('aria-label', 'Maya’s story');
  const head = dom.el('div', null, 'coach-call-head');
  const who = dom.el('div', null, 'coach-call-who');
  who.append(dom.el('strong', 'Maya’s story'), dom.el('span', 'Synthetic test patient', 'coach-call-line'));
  const button = (label, run, primary = false) => {
    const b = dom.button(label, `coach-button ${primary ? 'is-primary' : 'is-quiet'}`);
    b.addEventListener('click', run); return b;
  };
  const body = dom.el('div', null, 'coach-call-body'); body.tabIndex = 0;
  const foot = dom.el('div', null, 'coach-call-ended');
  const close = () => {if (state && key) {state.active = false; save();} panel.remove(); window.removeEventListener('health-capture-saved', changed); if (active?.panel === panel) active = null; (opener?.isConnected && opener.getClientRects().length ? opener : document.querySelector('#global-add'))?.focus();};
  const minimise = button('Minimise', () => {
    const small = panel.classList.toggle('is-minimised');
    minimise.textContent = small ? 'Expand' : 'Minimise';
    if (state) {state.minimised = small; save();}
  });
  panel.addEventListener('keydown', event => {if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {event.preventDefault(); close();}});
  head.append(who, minimise, button('Close', close)); panel.append(head, body, foot);
  document.body.append(panel); active = {panel, close};
  let data, state, key, record, busy = false;
  const changed = () => {record = null; if (data && state) paint();};
  window.addEventListener('health-capture-saved', changed);
  const message = dom.el('p'); message.role = 'status';
  function save() {localStorage.setItem(key, JSON.stringify(state));}
  function move(delta) {state.index = Math.max(0, Math.min(data.steps.length - 1, state.index + delta)); record = null; message.textContent = ''; save(); paint();}
  function paint() {
    const step = data.steps[state.index];
    body.replaceChildren(); foot.replaceChildren();
    const section = dom.el('div', null, 'coach-tour-step');
    section.append(dom.el('h3', `${step.year}: ${step.chapter}`),
      dom.el('p', `${state.index + 1} of ${data.steps.length}: ${step.title}`),
      dom.el('p', step.story));
    const download = dom.el('a', 'Download this record', 'coach-button');
    download.href = step.download; download.download = step.filename;
    section.append(download, dom.el('p', 'Upload the downloaded PDF through Add'),
      dom.el('p', 'Confirm the encounter date proposed from its text'));
    section.append(dom.el('p', 'Suggested notebooks: ' + step.notebooks.map(book => book.name).join(' / ')));
    const actions = dom.el('div', null, 'document-actions');
    actions.append(button('Add Notebook', () => window.StellisHealthCatalogue.open({onSelect: async selections => {
        await dom.api('/health-catalogue/activate', {method:'POST', json:{selections}});
        await window.reloadLibrary?.();
      }})),
      button('Upload Record', () => window.StellisCapture.open('upload')),
      button('Check upload', check, true));
    section.append(actions, message);
    if (record) {
      section.append(button('Review record', () => navigate(`/document/${encodeURIComponent(record.id)}`)));
    }
    if (step.milestone) {
      section.append(dom.el('p', 'Review the timeline and ask Stellis about the records uploaded so far'),
        dom.el('p', step.question));
      const tools = dom.el('div', null, 'document-actions');
      tools.append(button('Timeline', () => {state.minimised = true; save(); panel.classList.add('is-minimised'); minimise.textContent = 'Expand'; navigate('/timeline');}),
        button('Ask Stellis', () => {state.minimised = true; save(); panel.classList.add('is-minimised'); minimise.textContent = 'Expand'; navigate('/chat');}));
      section.append(tools);
    }
    body.append(section);
    const next = button(state.index === data.steps.length - 1 ? 'Finish guide' : 'Next record', () => {
      if (state.index === data.steps.length - 1) {state.finished = true; save(); close();}
      else move(1);
    }, true);
    next.disabled = !record || record.record_date !== step.date || !record.pages.some(page => page.text.trim());
    if (record?.notebook_id) section.append(dom.el('p', 'Filed in a notebook'));
    if (state.index) foot.append(button('Previous', () => move(-1)));
    foot.append(next);
  }
  async function check() {
    if (busy) return;
    busy = true; message.textContent = 'Checking the saved record';
    try {
      const step = data.steps[state.index];
      const records = await dom.api('/documents');
      record = null;
      // Filename narrows candidates; the file digest establishes corpus identity.
      for (const summary of records.filter(item => item.filename === step.filename)) {
        const candidate = await dom.api(`/documents/${encodeURIComponent(summary.id)}`);
        if (candidate.filename === step.filename && await digest(candidate) === step.sha256) {record = candidate; break;}
      }
      if (!record) message.textContent = 'Upload this PDF to continue';
      else if (!record.pages.some(page => page.text.trim())) message.textContent = 'Open the record and read its page text';
      else if (record.record_date !== step.date) message.textContent = 'Review and confirm the encounter date';
      else if (!record.notebook_id) message.textContent = 'Date confirmed with general health history';
      else message.textContent = 'Record and encounter date verified';
      paint();
    } catch (error) {message.textContent = error.message;}
    finally {busy = false;}
  }
  try {
    const response = await fetch('/static/maya/guide.json');
    if (!response.ok) throw Error('Maya’s records could not load');
    data = await response.json();
    const account = await dom.api('/auth/status');
    key = `stellis-maya:${account.username || 'local'}:${data.version}`;
    try {state = JSON.parse(localStorage.getItem(key));} catch (_) {state = null;}
    if (!state || !Number.isInteger(state.index) || state.index < 0 || state.index >= data.steps.length) state = {index: 0};
    state.active = true; save();
    panel.classList.toggle('is-minimised', Boolean(state.minimised));
    minimise.textContent = state.minimised ? 'Expand' : 'Minimise';
    paint(); await check();
  } catch (error) {body.replaceChildren(dom.el('p', error.message), button('Try again', open));}
}
window.StellisMayaGuide = {open};
(async () => {
  try {
    const account = await dom.api('/auth/status');
    const saved = JSON.parse(localStorage.getItem(`stellis-maya:${account.username || 'local'}:maya-v1`));
    if (saved?.active && !active) await open();
  } catch (_) { /* A closed guide does not interrupt normal app startup. */ }
})();
})();
