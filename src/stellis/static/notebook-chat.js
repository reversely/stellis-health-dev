// Notebook chat: the Sources panel with checkboxes and one chat that answers from the checked sources.
(root => {
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
  const icon = name => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#i-${name}`); svg.append(use); return svg; };
  const ICONS = {recording: 'microphone', audio: 'file', note: 'note', pdf: 'file-text', image: 'file'};
  const STATUS = {processing: 'Transcribing', failed: 'Failed', needs_text: 'Needs text'};
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  async function api(path, method = 'GET', body) {
    const response = await fetch('/api/v1' + path, {method, headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
    const data = await response.json();
    if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Could not reach this notebook');
    return data;
  }

  // Answer text with [[n]] markers becomes paragraphs of text and citations; unknown markers stay as text.
  function answerParts(content, citations) {
    const byNumber = new Map(citations.map(item => [item.n, item]));
    return content.split(/\n{2,}/).map(block => block.split(/(\[\[\d+\]\])/).filter(Boolean).map(part => {
      const match = part.match(/^\[\[(\d+)\]\]$/), citation = match && byNumber.get(Number(match[1]));
      return citation ? {citation} : {text: part};
    }));
  }
  function answerBody(content, citations) {
    const body = el('div', null, 'nb-answer');
    for (const parts of answerParts(content, citations)) {
      const paragraph = el('p');
      for (const {text, citation} of parts) {
        if (!citation) { paragraph.append(text); continue; }
        const link = el('a', String(citation.n), 'nb-cite'); link.href = citation.target;
        const where = citation.page ? `${citation.title}, page ${citation.page}` : citation.title;
        link.setAttribute('aria-label', `Source ${citation.n}: ${where}`); link.title = `${where}: ${citation.excerpt}`;
        paragraph.append(link);
      }
      body.append(paragraph);
    }
    return body;
  }

  let dispose = () => {};
  async function mount(host, book, {onAdd, onNote} = {}) {
    dispose(); host.replaceChildren();
    let stopped = false, timer, sources = [], agents = [];
    dispose = () => { stopped = true; clearTimeout(timer); };
    const wide = window.matchMedia('(min-width: 761px)');
    const layout = el('div', null, 'notebook-chat'); layout.dataset.sources = wide.matches ? 'open' : 'closed';

    const panel = el('aside', null, 'nb-sources'); panel.setAttribute('aria-label', 'Sources');
    const toggle = el('button', null, 'nb-sources-toggle'); toggle.type = 'button';
    const toggleLabel = el('span', 'Sources', 'nb-sources-label'), toggleCount = el('span', '', 'nb-sources-count');
    toggle.append(icon('list'), toggleLabel, toggleCount);
    const panelBody = el('div', null, 'nb-sources-body'); panelBody.id = 'nb-sources-body-' + book.id;
    toggle.setAttribute('aria-controls', panelBody.id);
    const actions = el('div', null, 'nb-sources-actions');
    const add = el('button', null, 'nb-source-add'); add.type = 'button'; add.append(icon('plus'), el('span', 'Add source'));
    const note = el('button', null); note.type = 'button'; note.append(icon('note'), el('span', 'Note'));
    add.addEventListener('click', () => onAdd?.()); note.addEventListener('click', event => onNote?.(event.currentTarget));
    actions.append(add, note);
    const all = el('label', null, 'nb-source-all'), allBox = el('input'); allBox.type = 'checkbox'; all.append(el('span', 'Select all'), allBox);
    const list = el('ul', null, 'nb-source-list'), empty = el('p', 'Add a recording, note or document to ask about it', 'nb-empty');
    panelBody.append(actions, all, list, empty); panel.append(toggle, panelBody);

    const chat = el('section', null, 'nb-chat'); chat.setAttribute('aria-label', 'Chat');
    const log = el('div', null, 'nb-messages'); log.setAttribute('role', 'log');
    const intro = el('p', 'Ask about your sources to get cited answers', 'nb-empty');
    const form = el('form', null, 'nb-composer');
    const answerWith = el('label', null, 'nb-answer-with'), picker = el('select'); answerWith.append(el('span', 'Answer with'), picker); answerWith.hidden = true;
    const box = el('div', null, 'nb-input'), input = el('textarea'), send = el('button', 'Send'); send.type = 'submit';
    input.rows = 2; input.maxLength = 2000; input.setAttribute('aria-label', 'Question');
    box.append(input, send);
    const status = el('p', null, 'nb-status'); status.setAttribute('role', 'status');
    form.append(answerWith, box, status); chat.append(log, form);
    layout.append(panel, chat); host.append(layout);

    const ready = () => sources.filter(item => item.status === 'ready');
    const chosen = () => ready().filter(item => item.selected);
    function paintToggle() {
      const open = layout.dataset.sources === 'open';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} sources, ${chosen().length} of ${sources.length} checked`);
      toggleCount.textContent = `${chosen().length}/${sources.length}`;
    }
    function paintComposer() {
      const count = chosen().length;
      input.placeholder = count ? `Ask about ${plural(count, 'source')}` : 'Check a source to ask about it';
      input.disabled = !count; send.disabled = !count || form.dataset.busy === 'true';
    }
    function paintSources() {
      list.replaceChildren(...sources.map(source => {
        const row = el('li', null, 'nb-source'); row.dataset.status = source.status;
        const title = el('span', source.title, 'nb-source-title');
        if (source.status !== 'ready') { row.append(icon(ICONS[source.type] || 'file'), title, el('span', STATUS[source.status], 'nb-source-status')); return row; }
        const label = el('label'), box = el('input'); box.type = 'checkbox'; box.checked = source.selected;
        box.addEventListener('change', () => { source.selected = box.checked; saveSelection(); });
        label.append(icon(ICONS[source.type] || 'file'), title, box); row.append(label); return row;
      }));
      empty.hidden = sources.length > 0; all.hidden = ready().length < 2;
      allBox.checked = ready().length > 0 && chosen().length === ready().length;
      allBox.indeterminate = chosen().length > 0 && chosen().length < ready().length;
      paintToggle(); paintComposer();
    }
    async function saveSelection() {
      paintSources();
      try { await api(`/notebooks/${book.id}/sources/selection`, 'PUT', {excluded: ready().filter(item => !item.selected).map(item => item.id)}); }
      catch (error) { status.textContent = error.message; }
    }
    allBox.addEventListener('change', () => { for (const source of ready()) source.selected = allBox.checked; saveSelection(); });
    toggle.addEventListener('click', () => { layout.dataset.sources = layout.dataset.sources === 'open' ? 'closed' : 'open'; paintToggle(); });

    function message(item) {
      if (item.role === 'user') { const node = el('div', null, 'nb-msg nb-msg-user'); node.append(el('p', item.content)); return node; }
      const node = el('article', null, 'nb-msg');
      if (item.author) node.append(el('strong', item.author, 'nb-msg-author'));
      node.append(answerBody(item.content, item.citations || []));
      return node;
    }
    function paintAgents() {
      picker.replaceChildren(new Option('Sources', ''), ...agents.map(agent => new Option(agent.name, agent.id)));
      answerWith.hidden = !agents.length;
    }

    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const question = input.value.trim(), ids = chosen().map(item => item.id);
      if (!question || !ids.length || form.dataset.busy === 'true') return;
      form.dataset.busy = 'true'; paintComposer(); intro.remove();
      const pending = message({role: 'user', content: question}); log.append(pending); input.value = '';
      status.textContent = `Reading ${plural(ids.length, 'source')}`;
      try {
        const answer = await api(`/notebooks/${book.id}/ask`, 'POST', {question, source_ids: ids, agent_id: picker.value || null});
        if (stopped) return;
        log.append(message(answer)); status.textContent = '';
      } catch (error) {
        pending.remove(); if (!input.value) input.value = question;
        status.textContent = error.message;
      } finally { form.dataset.busy = 'false'; paintComposer(); }
    });

    async function refreshSources() {
      const data = await api(`/notebooks/${book.id}/sources`);
      if (stopped) return;
      sources = data.sources; paintSources();
      clearTimeout(timer);
      // Transcription finishes in the background; check again until every source has text.
      if (sources.some(item => item.status === 'processing')) timer = setTimeout(() => { if (location.pathname === '/notebook/' + book.id) refreshSources().catch(() => {}); }, 5000);
    }
    try {
      const [, history, team] = await Promise.all([refreshSources(), api(`/notebooks/${book.id}/chat`), api('/agents').catch(() => [])]);
      if (stopped) return;
      agents = team.filter(agent => agent.enabled && agent.notebooks.some(item => item.notebook_id === book.id && item.enabled !== false));
      paintAgents();
      if (history.messages.length) log.append(...history.messages.map(message)); else log.append(intro);
    } catch (error) { status.textContent = error.message; }
  }
  const exported = {mount, stop: () => dispose(), answerParts};
  root.StellisNotebookChat = exported;
  if (typeof module !== 'undefined') module.exports = exported;
})(typeof window !== 'undefined' ? window : globalThis);
