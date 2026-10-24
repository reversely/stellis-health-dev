/** Original-report selection and source-anchored explanations. */
(function(root) {
'use strict';
function mount(host, record, initialPage) {
  const dom = root.StellisDom;
  const base = `/documents/${encodeURIComponent(record.id)}`;
  const workspace = dom.el('section', null, 'report-workspace');
  workspace.setAttribute('aria-label', 'Understand this report');
  const viewer = dom.el('div', null, 'report-viewer');
  const tools = dom.el('div', null, 'document-actions');
  const pageSelect = dom.el('select'); pageSelect.setAttribute('aria-label', 'Report page');
  for (const p of record.pages) pageSelect.append(new Option(`Page ${p.number}`, p.number));
  pageSelect.value = String(initialPage || 1);
  const zoomOut = dom.button('−'); zoomOut.setAttribute('aria-label', 'Zoom out');
  const zoomIn = dom.button('+'); zoomIn.setAttribute('aria-label', 'Zoom in');
  const rotate = dom.button('Rotate');
  const retry = dom.button('Retry page'); retry.hidden = true;
  tools.append(pageSelect, zoomOut, zoomIn, rotate, retry);
  const hint = dom.el('p', 'Select a line in the report to understand it.', 'document-empty');
  const status = dom.el('p', '', 'report-status'); status.setAttribute('role', 'status');
  const scroll = dom.el('div', null, 'report-scroll');
  const stage = dom.el('div', null, 'report-stage');
  const image = dom.el('img'); image.alt = record.title;
  const overlay = dom.el('div', null, 'report-regions');
  const paper = dom.el('div', null, 'report-paper');
  paper.append(image, overlay); stage.append(paper); scroll.append(stage); viewer.append(tools, hint, status, scroll);
  const aside = dom.el('aside', null, 'report-explanation');
  aside.setAttribute('aria-label', 'Report explanation');
  const selected = dom.el('blockquote', 'Select part of your report.');
  const messages = dom.el('div', null, 'report-messages');
  messages.setAttribute('aria-live', 'polite');
  const form = dom.el('form', null, 'report-question');
  const label = dom.el('label', 'Ask about this part');
  const input = dom.el('textarea'); input.id = 'report-question-'+record.id;
  label.htmlFor = input.id; input.rows = 2; input.maxLength = 2000;
  input.placeholder = 'What does this mean for me?';
  const send = dom.button('Explain', 'invert-button'); send.type = 'submit'; send.disabled = true;
  const explainStatus = dom.el('p', '', 'report-status'); explainStatus.setAttribute('role', 'status');
  form.append(label, input, send, explainStatus);
  aside.append(dom.el('h3', 'Understand this report'), selected, messages, form);
  workspace.append(viewer, aside); host.append(workspace);
  let map = null, region = null, exchanges = [], serial = 0, scale = 1, rotation = 0, busy = false;
  let configured = false;
  const buttons = new Map();
  function size() {
    stage.style.width = `${scale*100}%`;
    const ratio = image.naturalWidth / image.naturalHeight || 1;
    stage.style.aspectRatio = String(rotation % 180 ? 1/ratio : ratio);
    paper.style.width = `${rotation % 180 ? ratio*100 : 100}%`;
    paper.style.transformOrigin = '0 0';
    paper.style.transform = ({0: 'none', 90: 'rotate(90deg) translateY(-100%)',
      180: 'rotate(180deg) translate(-100%, -100%)',
      270: 'rotate(270deg) translateX(-100%)'})[rotation];
  }
  function select(item, focus = false) {
    region = item;
    selected.textContent = item.text;
    buttons.forEach((button, id) => {
      button.classList.toggle('is-selected', id === item.id);
      button.setAttribute('aria-pressed', String(id === item.id));
    });
    send.disabled = busy || !configured;
    renderHistory();
    if (focus) buttons.get(item.id)?.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }
  function showAnswer(item) {
    const block = dom.el('article', null, 'report-exchange');
    block.append(dom.el('p', item.question, 'report-user-question'));
    if (item.stale) block.append(dom.el('p', 'Saved explanation, source text has changed.', 'document-empty'));
    const answer = dom.el('p');
    for (const token of item.answer.split(/(\[\[\d+\]\])/)) {
      const match = /^\[\[(\d+)\]\]$/.exec(token);
      const citation = match && item.citations.find(c => c.n === Number(match[1]));
      if (!citation) { answer.append(document.createTextNode(token)); continue; }
      const link = dom.el('a', `[${citation.n}]`);
      link.href = citation.target; link.title = citation.title+'\n'+citation.excerpt;
      link.setAttribute('aria-label', `Source ${citation.n}: ${citation.title}`);
      const url = new URL(citation.target, location.origin);
      if (url.pathname === `/document/${record.id}` && url.searchParams.has('map')) {
        link.addEventListener('click', async event => {
          event.preventDefault();
          pageSelect.value = url.searchParams.get('page') || '1';
          await load(url.searchParams.get('map'), url.searchParams.get('region'));
        });
      }
      answer.append(link);
    }
    block.append(answer);
    const trace = root.StellisAnswerTrace?.link({traceId: item.trace_id});
    if (trace) block.append(trace);
    messages.append(block);
  }
  function renderHistory() {
    messages.replaceChildren();
    if (!map || !region) return;
    exchanges.filter(e => e.map_id === map.id && e.region_id === region.id).forEach(showAnswer);
  }
  async function load(wantedMap = null, wantedRegion = null) {
    const current = ++serial;
    overlay.inert = true;
    map = null; region = null; buttons.clear(); overlay.replaceChildren(); messages.replaceChildren();
    selected.textContent = 'Select part of your report.'; send.disabled = true;
    status.textContent = 'Opening report…'; retry.hidden = true;
    const number = Number(pageSelect.value);
    image.removeAttribute('src');
    image.onerror = () => { if (current === serial) { status.textContent = 'The original page could not be opened.'; retry.hidden = false; } };
    try {
      const result = await dom.api(`${base}/pages/${number}/map`);
      if (current !== serial || !workspace.isConnected) return;
      map = result;
      image.src = `/api/v1${base}/pages/${number}/original`;
      for (const item of map.regions) {
        const button = dom.button(item.text, 'report-region');
        button.title = item.text; button.setAttribute('aria-label', `Explain: ${item.text}`);
        button.setAttribute('aria-pressed', 'false');
        const [x,y,w,h] = item.box;
        Object.assign(button.style, {left: `${x*100}%`, top: `${y*100}%`, width: `${w*100}%`, height: `${h*100}%`});
        button.addEventListener('click', () => {
          select(item);
          if (configured && !busy && !exchanges.some(e => e.map_id === map.id && e.region_id === item.id)) {
            form.requestSubmit();
          }
        });
        buttons.set(item.id, button); overlay.append(button);
      }
      status.textContent = map.regions.length ? '' : 'No readable regions found on this page.';
      if (wantedMap && wantedMap !== map.id) {
        status.textContent = 'The source text changed. Select a region for a new explanation.';
      } else if (wantedRegion !== null) {
        const found = map.regions.find(r => r.id === wantedRegion);
        if (found) select(found, true);
      }
    } catch (error) {
      if (current === serial) { image.src = `/api/v1${base}/pages/${number}/original`; status.textContent = error.message; retry.hidden = false; }
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!map || !region || busy || !configured) return;
    const anchor = {map_id: map.id, region_id: region.id};
    const draft = input.value;
    const question = draft.trim() || 'Help me understand this part of my report in context.';
    busy = true; send.disabled = true; explainStatus.textContent = 'Reading the report and related records…';
    try {
      const result = await dom.api(`${base}/explanations`, {method: 'POST', json: {...anchor, question}});
      if (!workspace.isConnected) return;
      exchanges.push(result);
      if (input.value === draft) input.value = '';
      renderHistory();
      explainStatus.textContent = (map?.id === anchor.map_id && region?.id === anchor.region_id) ? '' :
          'Explanation saved for the previous selection.';
    } catch (error) { explainStatus.textContent = error.message; }
    finally { busy = false; send.disabled = !region || !configured; }
  });
  image.addEventListener('load', () => { size(); overlay.inert = false; });
  pageSelect.addEventListener('change', () => {scale = 1; rotation = 0; size(); load();});
  retry.addEventListener('click', () => load());
  zoomOut.addEventListener('click', () => {scale = Math.max(1, scale-0.25); size();});
  zoomIn.addEventListener('click', () => {scale = Math.min(3, scale+0.25); size();});
  rotate.addEventListener('click', () => {rotation = (rotation+90)%360; size();});
  async function init() {
    try {
      const [saved, capabilities] = await Promise.all([dom.api(`${base}/explanations`), dom.api('/capabilities')]);
      if (!workspace.isConnected) return;
      exchanges = saved.exchanges; configured = Boolean(capabilities.ai?.configured);
      if (!configured) explainStatus.textContent = 'Set up AI in Settings to ask about this report.';
      const params = new URLSearchParams(location.search);
      const requested = params.get('map');
      const latest = requested ? exchanges.filter(e => e.map_id === requested &&
          (!params.has('region') || e.region_id === params.get('region'))).at(-1) : exchanges.at(-1);
      const targetMap = params.get('map') || latest?.map_id;
      const targetRegion = params.get('region') ?? latest?.region_id ?? null;
      if (!initialPage && latest) pageSelect.value = String(latest.page);
      await load(targetMap, targetRegion);
      // Historical answers remain readable when the original page text has changed.
      if (latest && !region) {
        selected.textContent = latest.selection.text;
        showAnswer(latest);
      }
    } catch (error) { status.textContent = error.message; retry.hidden = false; }
  }
  init();
}
root.StellisReportContext = {mount};
})(window);
