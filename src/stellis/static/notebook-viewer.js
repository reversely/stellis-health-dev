// Source viewer beside the notebook chat: a transcript with audio, a note, or a document, opened at the cited place.
(root => {
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
  const clock = ms => { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };

  // Reads an app link such as /conversation/a?at=s1&t=4200 or /document/d?page=2 into what the viewer opens.
  function parseTarget(target) {
    const base = 'http://stellis.invalid', url = new URL(target, base);
    const [, kind, id, extra] = url.pathname.split('/');
    if (url.origin !== base || !['conversation', 'document', 'page'].includes(kind) || !id || extra !== undefined) return null;
    const time = Number(url.searchParams.get('t')), page = Number(url.searchParams.get('page'));
    return {kind, id: decodeURIComponent(id), segment: url.searchParams.get('at'), ms: Number.isFinite(time) && url.searchParams.has('t') ? time : null,
            page: Number.isInteger(page) && page > 0 ? page : null, href: url.pathname + url.search};
  }

  async function get(path) {
    const response = await fetch('/api/v1' + path);
    const data = await response.json();
    if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Could not open this source');
    return data;
  }

  async function conversation(body, place) {
    const [record, transcript] = await Promise.all([get(`/conversations/${encodeURIComponent(place.id)}`),
      get(`/conversations/${encodeURIComponent(place.id)}/transcript`)]);
    const audio = el('audio', null, 'nb-viewer-audio'); audio.controls = true; audio.preload = 'metadata';
    audio.src = `/api/v1/conversations/${encodeURIComponent(place.id)}/audio`;
    const list = el('ol', null, 'nb-viewer-transcript');
    let target = null;
    for (const segment of transcript.segments) {
      const item = el('li'), button = el('button', null, 'nb-viewer-segment'); button.type = 'button';
      button.append(el('span', `${clock(segment.start_ms)} ${segment.speaker_display_name || ''}`.trim(), 'nb-viewer-time'), el('span', segment.text));
      button.addEventListener('click', () => { audio.currentTime = segment.start_ms / 1000; audio.play().catch(() => {}); });
      if (segment.id === place.segment) { target = item; item.classList.add('is-target'); }
      item.append(button); list.append(item);
    }
    const seek = () => { audio.currentTime = (place.ms ?? 0) / 1000; };
    if (place.ms != null) audio.addEventListener('loadedmetadata', seek, {once: true});
    body.append(audio, list);
    return {title: record.title, focus: target};
  }

  async function note(body, place) {
    const page = await get(`/pages/${encodeURIComponent(place.id)}`);
    body.append(page.markdown.trim() ? el('p', page.markdown, 'nb-viewer-note') : el('p', 'This note is empty', 'nb-empty'));
    return {title: page.title, focus: null};
  }

  async function documentSource(body, place) {
    const record = await get(`/documents/${encodeURIComponent(place.id)}`);
    const host = el('div', null, 'nb-viewer-document'); body.append(host);
    const sections = root.StellisDocumentView.render(host, record, place.page);
    host.querySelector('.document-head')?.remove();
    return {title: record.title, focus: sections.get(place.page) || null, file: root.StellisDocumentView.fileUrl(record) + (place.page ? `#page=${place.page}` : '')};
  }

  function create() {
    const panel = el('aside', null, 'nb-viewer'); panel.hidden = true; panel.setAttribute('aria-labelledby', 'nb-viewer-title');
    const head = el('div', null, 'nb-viewer-head'), title = el('h2', null, 'nb-viewer-title'); title.id = 'nb-viewer-title'; title.tabIndex = -1;
    const open = el('a', 'Open', 'nb-viewer-open'), close = el('button', null, 'nb-viewer-close'); close.type = 'button';
    close.setAttribute('aria-label', 'Close source'); close.textContent = '×';
    head.append(title, open, close);
    const body = el('div', null, 'nb-viewer-body'), status = el('p', null, 'nb-status'); status.setAttribute('role', 'status');
    panel.append(head, status, body);
    let trigger = null, request = 0;
    function hide() {
      if (panel.hidden) return;
      panel.hidden = true; body.querySelector('audio')?.pause(); panel.dispatchEvent(new Event('viewerclose'));
      if (trigger?.isConnected) trigger.focus();
    }
    close.addEventListener('click', hide);
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); hide(); } });
    async function show(target, from) {
      const place = parseTarget(target); if (!place) return false;
      const current = ++request; trigger = from || null;
      body.querySelector('audio')?.pause();
      body.replaceChildren(); status.textContent = 'Opening'; title.textContent = ''; open.href = place.href;
      panel.hidden = false; panel.dispatchEvent(new Event('vieweropen'));
      try {
        const view = await ({conversation, page: note, document: documentSource})[place.kind](body, place);
        if (current !== request) return true;
        title.textContent = view.title; status.textContent = '';
        if (view.file) { open.href = view.file; open.target = '_blank'; open.rel = 'noopener'; } else { open.removeAttribute('target'); }
        title.focus({preventScroll: true});
        view.focus?.scrollIntoView({block: 'center'});
      } catch (error) { if (current === request) status.textContent = error.message; }
      return true;
    }
    return {element: panel, show, hide};
  }
  const exported = {create, parseTarget};
  root.StellisNotebookViewer = exported;
  if (typeof module !== 'undefined') module.exports = exported;
})(typeof window !== 'undefined' ? window : globalThis);
