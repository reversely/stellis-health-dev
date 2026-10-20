// Contextual feature tour after onboarding (#392). Each step points at a real control: a spotlight over it and a small card with
// Back / Next / Skip. Tour progress is kept per account in localStorage; first-run setup is stored separately on the server.
// The pure helpers at the top are covered by tests/test_tour.cjs; the DOM controller below only runs in a browser.
(function (root) {
  const STORAGE_PREFIX = 'stellis-tour:';

  // `dock` is the side the card takes when the target is too large to sit beside. `available(ctx)` false skips the step. `needsTarget` skips it when no target appears. `route(ctx)` is the path to show.
  // `targets(ctx)` lists selectors in order of preference; the first visible one is spotlit.
  const STEPS = [
    {id: 'sidebar', needsTarget: true, icon: 'list', title: 'Your library in the sidebar',
      body: 'Meetings and To-dos are pinned at the top. Below them, collections hold notebooks, and notebooks hold meetings and notes. Drag a row onto a notebook to move it, or use its Move to button.',
      route: () => '/', targets: () => ['#home-rail']},
    {id: 'home', needsTarget: true, icon: 'layout-dashboard', title: 'Home',
      body: 'Home lists your to-dos on the left. On the right are Coming up when a calendar is connected, your notebooks, and recent conversations. New note starts a note, and Record or Import recording starts a meeting.',
      route: () => '/', targets: () => ['.home-actions']},
    {id: 'agents', icon: 'users', title: 'Your agents', needsTarget: true,
      body: 'Agents are grouped with their notebooks. Open one to ask a question; replies link back to their sources.',
      route: () => '/', targets: () => ['#home-agent-groups']},
    {id: 'chat', icon: 'users', title: 'Talk to your team', needsTarget: true,
      body: 'Each agent keeps its own thread and memory. A Tutor can guide you through a screenshot or window you choose to share.',
      route: () => '/chat', targets: () => ['#agent-detail']},
    {id: 'agent-settings', icon: 'settings', title: 'Shape how agents work', needsTarget: true,
      body: 'Choose a template, edit instructions, assign notebooks and manage memory. Turn an agent off to stop new work.',
      route: () => '/chat/settings', targets: () => ['.agent-settings-group']},
    {id: 'note', needsTarget: true, icon: 'note', title: 'Write a note with shortcuts',
      body: ctx => ctx.page
        ? 'Type / for the block menu: headings, lists, callouts, tables, link cards, and more. Type # and a space for a heading or - and a space for a bullet. Type [ ] and a space for a to-do, and add a date in words such as "Send the draft tomorrow at 3pm"; the date shows at the right of the line.'
        : 'Press New note to open a blank note. In it, type / for the block menu with callouts, tables, and link cards, type # and a space for a heading, or type [ ] and a space for a to-do with a date in words such as "tomorrow at 3pm".',
      dock: 'left',
      route: ctx => ctx.page ? `/page/${encodeURIComponent(ctx.page)}` : '/',
      targets: ctx => ctx.page ? ['#page-notes-toolbar', '#note-title'] : ['#home-new-note']},
    {id: 'meeting', icon: 'microphone', title: 'A meeting',
      body: 'Notes holds your own notes and the Summary. Transcript holds the words as spoken; click a word to play the audio from there. When a meeting mentions a to-do, a suggestion card appears beside your notes, and the check button accepts it.',
      needsTarget: true, dock: 'left',
      available: ctx => Boolean(ctx.meeting),
      route: ctx => `/conversation/${encodeURIComponent(ctx.meeting)}`, targets: () => ['.conversation-tabs']},
    {id: 'done', icon: 'check', title: 'You are ready', last: true,
      body: 'You can run this tour again from the ⋯ menu on Home. The user guide lists every feature and keyboard shortcut.',
      route: () => '/', targets: () => ['#library-more', '#home-title']},
  ];

  const stepIndex = (steps, id) => steps.findIndex(step => step.id === id);

  // The next step in `direction` (1 or -1) from `from` (exclusive) that is available; -1 when there is none.
  function nextIndex(steps, from, direction, isAvailable) {
    for (let i = from + direction; i >= 0 && i < steps.length; i += direction) if (isAvailable(steps[i])) return i;
    return -1;
  }

  const progressKey = username => STORAGE_PREFIX + (username || 'local');
  function loadProgress(storage, username) {
    try {
      const value = JSON.parse(storage.getItem(progressKey(username)));
      if (value && ['active', 'done', 'skipped'].includes(value.status) && typeof value.step === 'string') return value;
    } catch {}
    return null;
  }
  function saveProgress(storage, username, progress) {
    try { storage.setItem(progressKey(username), JSON.stringify({status: progress.status, step: progress.step})); } catch {}
  }
  // Called when reviewed onboarding completes.
  function markSignup(storage, username) { saveProgress(storage, username, {status: 'active', step: STEPS[0].id}); }

  const BODY = step => typeof step.body === 'function' ? step.body : () => step.body;
  const stepBody = (step, ctx) => BODY(step)(ctx);

  // Where the card goes: beside the target when it fits, else below, above, or docked to a corner.
  function placeCard(target, card, view, dockSide = 'right') {
    const gap = 16, edge = 16;
    const dock = {left: dockSide === 'left' ? 24 : Math.max(edge, view.width - card.width - 24), top: Math.max(edge, view.height - card.height - 24)};
    if (!target || view.width < 640 || target.height > view.height * 0.6 || target.width > view.width * 0.7) return dock;
    const clampTop = top => Math.min(Math.max(edge, top), view.height - card.height - edge);
    const clampLeft = left => Math.min(Math.max(edge, left), view.width - card.width - edge);
    if (target.right + gap + card.width <= view.width - edge) return {left: target.right + gap, top: clampTop(target.top)};
    if (target.left - gap - card.width >= edge) return {left: target.left - gap - card.width, top: clampTop(target.top)};
    if (target.bottom + gap + card.height <= view.height - edge) return {left: clampLeft(target.left), top: target.bottom + gap};
    if (target.top - gap - card.height >= edge) return {left: clampLeft(target.left), top: target.top - gap - card.height};
    return dock;
  }

  const api = {STEPS, nextIndex, stepIndex, progressKey, loadProgress, saveProgress, markSignup, placeCard, stepBody};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StellisTour = api;
  if (typeof document === 'undefined' || !document.querySelector('#library-more')) return;

  // ---- Browser controller ----
  const safeStorage = () => { try { return localStorage; } catch { return {getItem() { return null; }, setItem() {}}; } };
  const $ = selector => document.querySelector(selector);
  const visible = element => Boolean(element) && element.getClientRects().length > 0 && !element.closest('[hidden]');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const SVG = 'http://www.w3.org/2000/svg';

  function icon(name) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG, 'use'); use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }
  function button(className, label, iconName, iconAfter = false) {
    const element = document.createElement('button');
    element.type = 'button'; element.className = className;
    const text = document.createElement('span'); text.textContent = label;
    element.append(...(iconName ? (iconAfter ? [text, icon(iconName)] : [icon(iconName), text]) : [text]));
    element.setLabel = value => { text.textContent = value; };
    return element;
  }
  async function getJson(path) {
    const response = await fetch(`/api/v1${path}`);
    if (!response.ok) throw new Error('The request failed.');
    return response.json();
  }
  let layer, spot, card, titleEl, bodyEl, extraEl, counterEl, backButton, nextButton, skipButton;
  let username = null, current = -1, ctx = {}, token = 0, opener = null, tracked = null, timer = null;

  function build() {
    layer = document.createElement('div'); layer.className = 'tour-layer'; layer.hidden = true;
    spot = document.createElement('div'); spot.className = 'tour-spot'; spot.setAttribute('aria-hidden', 'true');
    card = document.createElement('div'); card.className = 'tour-card'; card.setAttribute('role', 'dialog');
    card.setAttribute('aria-labelledby', 'tour-title'); card.setAttribute('aria-describedby', 'tour-body'); card.tabIndex = -1;
    const head = document.createElement('div'); head.className = 'tour-head';
    titleEl = document.createElement('h2'); titleEl.id = 'tour-title';
    counterEl = document.createElement('span'); counterEl.className = 'tour-counter';
    head.append(titleEl, counterEl);
    bodyEl = document.createElement('p'); bodyEl.id = 'tour-body'; bodyEl.className = 'tour-body';
    extraEl = document.createElement('div'); extraEl.className = 'tour-extra';
    const foot = document.createElement('div'); foot.className = 'tour-foot';
    backButton = button('tour-back', 'Back', 'chevron-left');
    nextButton = button('invert-button tour-next', 'Next', 'chevron-right', true);
    skipButton = button('tour-skip', 'Skip tour');
    const actions = document.createElement('div'); actions.className = 'tour-actions';
    actions.append(backButton, nextButton);
    foot.append(skipButton, actions);
    card.append(head, bodyEl, extraEl, foot);
    layer.append(spot, card);
    document.body.append(layer);
    backButton.addEventListener('click', () => go(-1));
    nextButton.addEventListener('click', () => go(1));
    skipButton.addEventListener('click', () => close('skipped'));
  }

  function findTarget() {
    const step = STEPS[current];
    for (const selector of step ? step.targets(ctx) : []) { const element = $(selector); if (visible(element)) return element; }
    return null;
  }

  // Keep the spotlight and card aligned with the live layout (the page re-renders while the tour is open).
  function place() {
    if (layer.hidden) return;
    let element = findTarget();
    if (element !== tracked) {
      tracked = element;
      if (element) {
        const rect = element.getBoundingClientRect();
        const inView = rect.top >= 0 && rect.bottom <= innerHeight;
        if (!inView) element.scrollIntoView({block: innerWidth < 640 ? 'start' : 'center'});
      }
    }
    element = tracked && visible(tracked) ? tracked : null;
    const rect = element ? element.getBoundingClientRect() : null;
    layer.classList.toggle('tour-no-target', !rect);
    if (rect) {
      const pad = 6;
      Object.assign(spot.style, {left: `${rect.left - pad}px`, top: `${rect.top - pad}px`,
        width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px`});
    }
    const box = card.getBoundingClientRect();
    const spec = placeCard(rect, {width: box.width, height: box.height}, {width: innerWidth, height: innerHeight}, STEPS[current].dock);
    card.style.left = `${spec.left}px`; card.style.top = `${spec.top}px`;
  }

  // The meeting to show: the newest one with a pending suggestion (checked for the ten newest), else the newest.
  async function loadContext() {
    const [conversations, pages] = await Promise.all([getJson('/conversations').catch(() => []), getJson('/pages').catch(() => [])]);
    const recent = conversations.slice(0, 10);
    const pending = await Promise.all(recent.map(item =>
      getJson(`/suggestions?target_kind=conversation&target_id=${encodeURIComponent(item.id)}`)
        .then(data => data.suggestions.length > 0).catch(() => false)));
    const withSuggestion = recent.find((item, index) => pending[index]);
    return {page: (pages.find(item => item.title !== 'To-dos') || {}).id || null,
      meeting: (withSuggestion || conversations[0] || {}).id || null};
  }

  function navigate(path) {
    if (location.pathname === path) return;
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  async function waitForTarget(step, run) {
    for (let attempt = 0; attempt < 30 && run === token; attempt++) {
      if (step.targets(ctx).some(selector => visible($(selector)))) return true;
      await sleep(150);
    }
    return false;
  }

  async function go(direction) {
    const run = ++token;
    let from = current;
    ctx = await loadContext().catch(() => ctx);
    if (run !== token) return;
    const skipped = new Set();
    for (;;) {
      const index = nextIndex(STEPS, from, direction, step => !skipped.has(step.id) && (!step.available || step.available(ctx)));
      if (index < 0) { if (direction > 0) close('done'); return; }
      const step = STEPS[index];
      current = index;
      saveProgress(safeStorage(), username, {status: 'active', step: step.id});
      navigate(step.route(ctx));
      const found = await waitForTarget(step, run);
      if (run !== token) return;
      if (!found && step.needsTarget) { skipped.add(step.id); from = index; continue; }
      render(step);
      return;
    }
  }

  function render(step) {
    layer.hidden = false;
    titleEl.replaceChildren(icon(step.icon), document.createTextNode(step.title));
    bodyEl.textContent = stepBody(step, ctx);
    extraEl.replaceChildren();
    counterEl.textContent = `${current + 1} of ${STEPS.length}`;
    backButton.hidden = nextIndex(STEPS, current, -1, candidate => !candidate.available || candidate.available(ctx)) < 0;
    nextButton.setLabel(step.last ? 'Done' : 'Next');
    nextButton.lastChild.remove();
    nextButton.append(icon(step.last ? 'check' : 'chevron-right'));
    skipButton.hidden = Boolean(step.last);
    tracked = null;
    place();
    card.focus({preventScroll: true});
  }

  function open(startId) {
    if (!layer) build();
    opener = document.activeElement;
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    timer = setInterval(place, 300);
    // Start one before the wanted step so go(1) lands on it.
    current = (startId ? stepIndex(STEPS, startId) : 0) - 1;
    go(1);
  }
  function close(status) {
    token++;
    saveProgress(safeStorage(), username, {status, step: STEPS[Math.max(current, 0)].id});
    clearInterval(timer);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    document.removeEventListener('scroll', place, true);
    layer.hidden = true;
    if (location.pathname !== '/') navigate('/');
    if (opener && opener.focus && document.contains(opener)) opener.focus({preventScroll: true});
  }
  function onKey(event) {
    if (layer.hidden) return;
    const typing = event.target.matches && event.target.matches('input, textarea, select');
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close('skipped'); }
    else if (!typing && event.key === 'ArrowRight' && !nextButton.disabled) { event.preventDefault(); go(1); }
    else if (!typing && event.key === 'ArrowLeft' && !backButton.hidden) { event.preventDefault(); go(-1); }
    else if (event.key === 'Tab') {
      const items = [...card.querySelectorAll('a[href], button:not([disabled]):not([hidden]), input:not([disabled])')].filter(visible);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (!card.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === card)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }

  async function init() {
    try {
      const status = await getJson('/auth/status');
      username = status.username || null;
    } catch {}
    const menu = $('#take-tour');
    if (menu) menu.addEventListener('click', () => {
      $('#library-more').open = false;
      $('#library-more summary').focus({preventScroll: true});
      saveProgress(safeStorage(), username, {status: 'active', step: STEPS[0].id});
      open(null);
    });
    const saved = loadProgress(safeStorage(), username);
    if (saved && saved.status === 'active') open(stepIndex(STEPS, saved.step) >= 0 ? saved.step : null);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
