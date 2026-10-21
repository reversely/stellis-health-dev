// Add source dialog: upload or drop files, record, paste text, or bring in recordings, notes and documents from other notebooks.
(root => {
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
  const icon = name => { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#i-${name}`); svg.append(use); return svg; };
  const ACCEPT = '.mp3,audio/mpeg,.pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg';

  // Which endpoint takes a file, from its name; null when the dialog cannot add it.
  function uploadKind(name) {
    if (/\.mp3$/i.test(name)) return 'audio';
    if (/\.(pdf|png|jpe?g)$/i.test(name)) return 'document';
    return null;
  }
  // Records outside this notebook that match the filter, newest first, at most 30.
  function candidates(items, notebookId, filter) {
    const needle = filter.trim().toLocaleLowerCase();
    return items.filter(item => item.notebook_id !== notebookId && (!needle || item.title.toLocaleLowerCase().includes(needle)))
      .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30);
  }

  async function request(path, options = {}) {
    const response = await fetch('/api/v1' + path, options);
    const data = await response.json();
    if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Could not add this source');
    return data;
  }
  const json = (method, body) => ({method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});

  let dialog = null;
  function open({book, count, limit, onRecord, onChanged, trigger}) {
    dialog?.remove();
    dialog = el('dialog', null, 'nb-add'); dialog.setAttribute('aria-labelledby', 'nb-add-title');
    let total = count, names = new Map(), loaded = Promise.resolve();
    const head = el('div', null, 'nb-add-head'), title = el('h2', 'Add source'); title.id = 'nb-add-title';
    const counter = el('span', null, 'nb-add-count'), close = el('button', '×', 'nb-add-close'); close.type = 'button'; close.setAttribute('aria-label', 'Close');
    head.append(title, counter, close);
    const drop = el('div', null, 'nb-add-drop'); drop.tabIndex = 0; drop.setAttribute('role', 'button');
    drop.append(icon('upload'), el('strong', 'Drop audio, PDF or image files here'), el('span', 'Choose files'));
    const picker = el('input'); picker.type = 'file'; picker.multiple = true; picker.accept = ACCEPT; picker.hidden = true;
    const progress = el('ul', null, 'nb-add-progress');
    const actions = el('div', null, 'nb-add-actions');
    const record = el('button', null); record.type = 'button'; record.append(icon('microphone'), el('span', 'Record'));
    const pasteButton = el('button', null); pasteButton.type = 'button'; pasteButton.append(icon('file-text'), el('span', 'Paste text'));
    pasteButton.setAttribute('aria-expanded', 'false');
    actions.append(record, pasteButton);
    const paste = el('form', null, 'nb-add-paste'); paste.hidden = true;
    const pasteTitle = el('input'), pasteText = el('textarea'), pasteSave = el('button', 'Add text'); pasteSave.type = 'submit';
    pasteTitle.maxLength = 180; pasteTitle.required = true; pasteText.required = true; pasteText.rows = 6; pasteText.maxLength = 200000;
    const titleLabel = el('label', null), textLabel = el('label', null);
    titleLabel.append(el('span', 'Title'), pasteTitle); textLabel.append(el('span', 'Text'), pasteText);
    paste.append(titleLabel, textLabel, pasteSave);
    const records = el('section', null, 'nb-add-records'), recordsTitle = el('h3', 'From your records'); recordsTitle.id = 'nb-add-records-title';
    records.setAttribute('aria-labelledby', recordsTitle.id);
    const filter = el('input'); filter.type = 'search'; filter.placeholder = 'Filter by title'; filter.setAttribute('aria-label', 'Filter records by title');
    const list = el('ul', null, 'nb-add-list');
    records.append(recordsTitle, filter, list);
    const status = el('p', null, 'nb-status'); status.setAttribute('role', 'status');
    dialog.append(head, drop, picker, progress, actions, paste, records, status);
    document.body.append(dialog);

    const full = () => total >= limit;
    function paintCount() {
      counter.textContent = `${total} of ${limit} sources`;
      for (const control of [drop, record, pasteSave, ...list.querySelectorAll('button')]) control.toggleAttribute('disabled', full());
      drop.setAttribute('aria-disabled', String(full()));
      if (full()) status.textContent = `This notebook is full at ${limit} sources`;
    }
    async function changed() { total += 1; paintCount(); await onChanged?.(); }

    async function upload(files) {
      await loaded;
      for (const file of files) {
        const line = el('li', `${file.name}: uploading`); progress.append(line);
        const kind = uploadKind(file.name);
        if (!kind) { line.textContent = `${file.name}: choose an MP3, PDF or image`; continue; }
        if (full()) { line.textContent = `${file.name}: this notebook is full`; continue; }
        const body = new FormData(); body.append('file', file); body.append('notebook_id', book.id);
        if (kind === 'audio' && file.lastModified) body.append('recorded_at', new Date(file.lastModified).toISOString());
        try {
          const result = await request(kind === 'audio' ? '/conversations/import' : '/documents', {method: 'POST', body});
          const record = result.document || result.conversation;
          if (!result.duplicate) {
            line.textContent = `${file.name}: ${kind === 'audio' ? 'added and transcribing' : 'added'}`; await changed();
          } else if (record.notebook_id === book.id) line.textContent = `${file.name}: already in this notebook`;
          else if (record.notebook_id) line.textContent = `${file.name}: already in ${names.get(record.notebook_id) || 'another notebook'}`;
          else {
            // A file the account already has without a notebook moves here, since nothing else holds it.
            if (kind === 'audio') await request(`/conversations/${encodeURIComponent(record.id)}/notebook`, json('PUT', {notebook_id: book.id}));
            else await request(`/documents/${encodeURIComponent(record.id)}`, json('PATCH', {notebook_id: book.id, move: true}));
            line.textContent = `${file.name}: added`; await changed();
          }
        } catch (error) { line.textContent = `${file.name}: ${error.message}`; }
      }
    }
    drop.addEventListener('click', () => { if (!full()) picker.click(); });
    drop.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && !full()) { event.preventDefault(); picker.click(); } });
    picker.addEventListener('change', () => { upload([...picker.files]); picker.value = ''; });
    for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.add('is-over'); });
    for (const name of ['dragleave', 'drop']) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove('is-over'); });
    drop.addEventListener('drop', event => upload([...event.dataTransfer.files]));

    record.addEventListener('click', () => { dialog.close(); onRecord?.(); });
    pasteButton.addEventListener('click', () => {
      paste.hidden = !paste.hidden; pasteButton.setAttribute('aria-expanded', String(!paste.hidden));
      if (!paste.hidden) pasteTitle.focus();
    });
    paste.addEventListener('submit', async event => {
      event.preventDefault(); pasteSave.disabled = true;
      try {
        await request('/pages', json('POST', {title: pasteTitle.value.trim(), notebook_id: book.id, markdown: pasteText.value}));
        status.textContent = `Added ${pasteTitle.value.trim()}`; paste.reset(); paste.hidden = true; pasteButton.setAttribute('aria-expanded', 'false');
        await changed();
      } catch (error) { status.textContent = error.message; }
      finally { pasteSave.disabled = full(); }
    });

    let items = [];
    const PATHS = {recording: id => `/conversations/${encodeURIComponent(id)}/notebook`, note: id => `/pages/${encodeURIComponent(id)}/notebook`};
    function paintList() {
      const rows = candidates(items, book.id, filter.value);
      list.replaceChildren(...rows.map(item => {
        const row = el('li', null, 'nb-add-row'), text = el('span', null, 'nb-add-row-text');
        text.append(el('span', item.title, 'nb-add-row-title'), el('small', item.notebook_id ? `In ${names.get(item.notebook_id) || 'another notebook'}` : 'No notebook'));
        const add = el('button', 'Add'); add.type = 'button'; add.setAttribute('aria-label', `Add ${item.title}`); add.disabled = full();
        add.addEventListener('click', async () => {
          add.disabled = true;
          try {
            if (item.kind === 'document') await request(`/documents/${encodeURIComponent(item.id)}`, json('PATCH', {notebook_id: book.id, move: true}));
            else await request(PATHS[item.kind](item.id), json('PUT', {notebook_id: book.id}));
            item.notebook_id = book.id; row.remove(); status.textContent = `Added ${item.title}`; await changed();
          } catch (error) { status.textContent = error.message; add.disabled = full(); }
        });
        row.append(icon({recording: 'microphone', note: 'note', document: 'file-text'}[item.kind]), text, add); return row;
      }));
      if (!rows.length) list.append(el('li', filter.value ? 'No records match this filter' : 'Every record is already here', 'nb-empty'));
    }
    filter.addEventListener('input', paintList);
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); if (trigger?.isConnected) trigger.focus(); });
    paintCount();
    dialog.showModal();
    loaded = Promise.all([request('/conversations'), request('/pages'), request('/documents'), request('/notebooks')]).then(([conversations, notes, documents, books]) => {
      names = new Map(books.notebooks.map(item => [item.id, item.name]));
      items = [...conversations.map(item => ({kind: 'recording', id: item.id, title: item.title, notebook_id: item.notebook_id, at: item.recorded_at || item.created_at})),
        ...notes.map(item => ({kind: 'note', id: item.id, title: item.title, notebook_id: item.notebook_id, at: item.updated_at})),
        ...documents.map(item => ({kind: 'document', id: item.id, title: item.title, notebook_id: item.notebook_id, at: item.created_at}))];
      paintList(); paintCount();
    }).catch(error => { status.textContent = error.message; });
  }
  const exported = {open, uploadKind, candidates};
  root.StellisAddSource = exported;
  if (typeof module !== 'undefined') module.exports = exported;
})(typeof window !== 'undefined' ? window : globalThis);
