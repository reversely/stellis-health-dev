/**
 * @fileoverview Coach calls on Home. The morning check-in arrives as an
 * incoming call card at the top of Home; any time, Call Stellis opens a
 * call. A call runs in a panel docked over the page, with its chat log, so
 * the person sees Stellis fill in the page as they talk. A call by text
 * ("Chat instead") uses the same panel without the microphone or speech.
 * The guided tour runs in the same panel: each step opens a page and
 * highlights one control while Stellis describes it.
 */
(function(root) {
'use strict';

const STATUS = {...root.StellisIntakeCall.STATUS, typing:'Chat'};
const TITLES = {
  morning: 'Daily check-in',
  call: 'Call with Stellis',
  tour: 'Tour with Stellis',
};
const TOUR_WAIT_MS = 8000;

function localParams() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    today:
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    now: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    utc_offset: String(-now.getTimezoneOffset()),
  };
}

function icon(glyph) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + glyph);
  svg.append(use);
  return svg;
}

function setGlyph(button, glyph) {
  button.querySelector('use').setAttribute('href', '#i-' + glyph);
}

function avatar(size) {
  return root.StellisAgentAvatar.avatarElement(
      document, {seed: 'stellis', coordinator: true, size});
}

/**
 * Builds a button with an icon and a visible or hidden label.
 * @param {string} glyph
 * @param {string} label
 * @param {string} cls
 * @param {boolean=} iconOnly
 * @return {!HTMLButtonElement}
 */
function button(glyph, label, cls, iconOnly = false) {
  const element = root.StellisDom.el('button', null, cls);
  element.type = 'button';
  element.append(icon(glyph));
  if (iconOnly) {
    element.setAttribute('aria-label', label);
    element.title = label;
  } else {
    element.append(root.StellisDom.el('span', label));
  }
  return /** @type {!HTMLButtonElement} */ (element);
}

/**
 * Builds the morning check-in's incoming call card.
 * @param {{answer: function(), chat: function(), decline: function()}} on
 * @return {!Element}
 */
function incoming(on) {
  const dom = root.StellisDom;
  const card = dom.el('section', null, 'coach-incoming');
  card.setAttribute('aria-labelledby', 'coach-incoming-title');
  const face = dom.el('div', null, 'coach-incoming-face');
  face.append(dom.el('span', null, 'coach-incoming-ring'), avatar(72));
  const text = dom.el('div', null, 'coach-incoming-text');
  const title = dom.el('h2', 'Stellis is calling');
  title.id = 'coach-incoming-title';
  text.append(
      dom.el('p', 'Morning check-in', 'coach-incoming-kind'), title,
      dom.el(
          'p', 'Today’s appointments and reminders, and how you’re doing',
          'coach-incoming-hint'));
  const actions = dom.el('div', null, 'coach-incoming-actions');
  const answer = button('phone', 'Answer', 'coach-button is-primary');
  const chat = button('message-2', 'Chat instead', 'coach-button');
  const later = dom.button('Not now', 'coach-button is-quiet');
  answer.addEventListener('click', on.answer);
  chat.addEventListener('click', on.chat);
  later.addEventListener('click', on.decline);
  actions.append(answer, chat, later);
  card.append(face, text, actions);
  return card;
}

let current = null;
let target = null;
let stepGeneration = 0;

/** Removes the tour's highlight. */
function clearTarget() {
  stepGeneration++;
  target?.classList.remove('tour-target');
  target = null;
}

/**
 * Opens a page in the app, then highlights a control once it shows.
 * @param {string} path
 * @param {string} selector
 */
function showStep(path, selector) {
  clearTarget();
  const generation = stepGeneration;
  if (!path.startsWith('/') || path.startsWith('//')) return Promise.resolve(false);
  if (location.pathname !== path) {
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  const started = Date.now();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return new Promise(resolve => {
    (function find() {
      if (generation !== stepGeneration) {resolve(false); return;}
      const found = document.querySelector(selector);
      if (found?.checkVisibility()) {
        target = found;
        target.classList.add('tour-target');
        target.scrollIntoView({block:'start', behavior:still ? 'instant' : 'smooth'});
        resolve(true);
      } else if (Date.now() - started < TOUR_WAIT_MS) setTimeout(find, 150);
      else resolve(false);
    })();
  });
}

/** Offers the tour in the docked panel, after setup. */
function offerTour() {
  const dom = root.StellisDom;
  const panel = dom.el('section', null, 'coach-call coach-offer');
  panel.setAttribute('aria-labelledby', 'coach-offer-title');
  const head = dom.el('div', null, 'coach-call-head');
  const who = dom.el('div', null, 'coach-call-who');
  const title = dom.el('strong', 'Stellis is ready to show you around');
  title.id = 'coach-offer-title';
  who.append(
      title, dom.el('span', 'Follow Maya’s synthetic records', 'coach-call-line'));
  head.append(avatar(36), who);
  const actions = dom.el('div', null, 'coach-call-ended');
  const start = button('phone', 'Start tour', 'coach-button is-primary');
  const later = dom.button('Not now', 'coach-button is-quiet');
  start.addEventListener('click', () => {
    panel.remove();
    root.StellisMayaGuide.open();
  });
  later.addEventListener('click', () => panel.remove());
  actions.append(start, later);
  panel.append(head, actions);
  document.body.append(panel);
}

/**
 * Opens a call in the docked panel; an open call is ended first.
 * @param {{kind: string, chat: boolean, onAction: function(!Object)}} options
 *     ``kind`` is "morning" or "call"; ``chat`` runs the call by text;
 *     ``onAction`` receives each action Stellis takes on the page.
 * @return {{end: function()}}
 */
function open({kind, chat, onAction}) {
  current?.close();
  const dom = root.StellisDom;
  const panel = dom.el('section', null, 'coach-call');
  panel.setAttribute('aria-label', TITLES[kind]);
  panel.dataset.state = 'connecting';
  panel.dataset.kind = kind;

  const head = dom.el('div', null, 'coach-call-head');
  const face = dom.el('span', null, 'coach-call-face');
  face.append(avatar(36));
  const who = dom.el('div', null, 'coach-call-who');
  const status = dom.el('span', STATUS.connecting, 'coach-call-status');
  status.setAttribute('role', 'status');
  const timer = dom.el('span', '', 'coach-call-timer');
  const line = dom.el('span', null, 'coach-call-line');
  line.append(status, timer);
  who.append(dom.el('strong', TITLES[kind]), line);
  const shrink = button(
      'arrows-diagonal-minimize-2', 'Minimise call', 'coach-call-icon', true);
  const hangUp =
      button('phone-off', 'End call', 'coach-call-icon is-end', true);
  head.append(face, who, shrink, hangUp);

  const stepCard = dom.el('section', null, 'coach-tour-step');
  const stepTitle = dom.el('h3');
  const stepNarration = dom.el('p');
  stepCard.append(stepTitle, stepNarration);
  stepCard.hidden = true;
  const log = dom.el('ol', null, 'coach-call-log');
  log.setAttribute('aria-live', 'polite');
  const callBody = dom.el('div', null, 'coach-call-body');
  callBody.tabIndex = 0;
  callBody.setAttribute('role', 'region');
  callBody.setAttribute('aria-label', 'Conversation');
  callBody.append(stepCard, log);

  const foot = dom.el('form', null, 'coach-call-foot');
  const input = /** @type {!HTMLInputElement} */ (dom.el('input'));
  input.maxLength = 2000;
  input.placeholder = 'Type a message';
  input.setAttribute('aria-label', 'Message');
  const send = dom.button('Send', 'coach-button');
  send.type = 'submit';
  const mute = button('microphone', 'Mute', 'coach-call-icon', true);
  const sound = button('volume', 'Speaker off', 'coach-call-icon', true);
  mute.hidden = sound.hidden = chat;
  foot.append(mute, sound, input, send);
  let next = null;
  let stepReady = false;
  if (kind === 'tour') {
    next = dom.button('Next', 'coach-button is-primary');
    next.disabled = true;
    next.addEventListener('click', () => {next.disabled = true; stepReady = false; call.sendText('Next');});
    foot.append(next);
    input.placeholder = 'Ask a question';
  }

  const ended = dom.el('div', null, 'coach-call-ended');
  const close = dom.button('Close', 'coach-button');
  const again = button('phone', 'Call again', 'coach-button');
  const destination = dom.button('Go to My Health', 'coach-button is-primary');
  destination.hidden = !['tour','morning'].includes(kind);
  destination.addEventListener('click', () => {remove(); history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate'));});
  if(kind === 'tour') again.lastChild.textContent = 'Restart tour';
  ended.append(destination, again, close);
  ended.hidden = true;

  const heard = dom.el('p', null, 'coach-call-heard');
  heard.append(
      chat ? 'Stellis can make mistakes. ' :
             'Speech recognition can mishear words. ',
      dom.accuracyNote(chat ? 'summaries' : 'speech', 'About accuracy'));
  const recovery = dom.el('div', null, 'coach-call-recovery');
  const failure = dom.el('p'); failure.role = 'alert';
  const retry = dom.button('Retry reply', 'coach-button'); retry.hidden = true;
  const doneSpeaking = dom.button('Done speaking', 'coach-button'); doneSpeaking.hidden = true;
  retry.addEventListener('click', () => call.retryReply());
  doneSpeaking.addEventListener('click', () => call.finishAnswer());
  recovery.append(failure, retry, doneSpeaking); recovery.hidden = true;
  panel.append(head, callBody, recovery, foot, ended, heard);
  document.body.append(panel);

  let started = 0;
  let clock = 0;
  let muted = false;
  let speaker = !chat;
  let finished = false;

  function setStatus(key) {
    if (finished && key !== 'ended' && key !== 'lost') return;
    if (panel.dataset.state === 'ending' && !['ended','lost'].includes(key)) return;
    panel.dataset.state = key;
    status.textContent = STATUS[key];
    if (next) next.disabled = !stepReady || !['listening','typing','hearing'].includes(key);
    doneSpeaking.hidden = chat || mute.hidden || key !== 'hearing';
    recovery.hidden = !failure.textContent && retry.hidden && doneSpeaking.hidden;
  }

  /** Adds a line to the chat log; pieces of one reply join one bubble. */
  function addLine(role, text, turn) {
    const selector = role === 'agent' ? 'agentTurn' : 'turn';
    const existing = turn != null ?
        [...log.children].find(
            (item) => item.dataset[selector] === String(turn)) :
        null;
    if (existing && role === 'agent') {
      existing.lastChild.textContent += ' ' + text;
    } else {
      const item = existing || dom.el('li', null, 'is-' + role);
      item.replaceChildren(
          dom.el(
              'span', role === 'agent' ? 'Stellis' : 'You', 'coach-call-said'),
          dom.el('p', text));
      if (turn != null) item.dataset[selector] = String(turn);
      if (!existing) log.append(item);
    }
    callBody.scrollTop = callBody.scrollHeight;
  }

  function addAction(text) {
    log.append(dom.el('li', text, 'is-action'));
    callBody.scrollTop = callBody.scrollHeight;
  }

  function onEvent(message) {
    switch (message.type) {
      case 'ready':
        started = Date.now();
        // A tour shows its step in place of the call's length.
        if (kind !== 'tour')
          clock = setInterval(() => {
            const seconds = Math.floor((Date.now() - started) / 1000);
            timer.textContent = `${Math.floor(seconds / 60)}:${
                String(seconds % 60).padStart(2, '0')}`;
          }, 1000);
        setStatus(message.voice && !chat ? 'listening' : 'typing');
        if (!message.voice) mute.hidden = sound.hidden = true;
        input.focus({preventScroll: true});
        break;
      case 'mic':
        if (!message.ok) {
          mute.hidden = true;
          setStatus('typing');
        }
        break;
      case 'state':
        setStatus(
            message.state === 'listening' && (chat || mute.hidden) ?
                'typing' :
                message.state);
        break;
      case 'caption':
        if (message.text) {
          if (message.audio) setStatus('speaking');
          if (kind !== 'tour' || !stepNarration.textContent || !message.text.endsWith(stepNarration.textContent)) addLine('agent', message.text, message.turn);
        }
        break;
      case 'heard':
        failure.textContent = ''; retry.hidden = true;
        // The Next button's own word needs no bubble.
        if (kind === 'tour' && message.text === 'Next') break;
        [...log.children]
            .find((item) => item.dataset.agentTurn === String(message.turn))
            ?.remove();
        addLine('person', message.text, message.turn);
        break;
      case 'action':
        if (message.action === 'show_step') {
          timer.textContent = `Step ${message.position} of ${message.total}`;
          stepCard.hidden = false;
          stepTitle.textContent = message.title || 'Tour';
          stepNarration.textContent = message.message || '';
          callBody.scrollTop = 0;
          const step = message.step;
          panel.dataset.step = step;
          stepReady = false;
          if (next) {next.disabled = true; next.textContent = message.position === message.total ? 'Finish tour' : 'Next';}
          showStep(message.path, message.selector).then(found => {
            if (!panel.isConnected || panel.dataset.step !== step) return;
            stepReady = true;
            if (!found) failure.textContent = 'This page is unavailable';
            setStatus(panel.dataset.state);
          });
        } else if (message.action === 'fill_goal') {
          addAction(`Filled in: ${message.values.title}`);
        } else if (message.action === 'logged') {
          addAction('Logged for today');
        }
        onAction(message);
        break;
      case 'retrying':
        failure.textContent = ''; retry.hidden = true;
        [...log.children].find(item => item.dataset.agentTurn === String(message.turn))?.remove();
        break;
      case 'ending':
        setStatus('ending');
        foot.hidden = true;
        recovery.hidden = true;
        break;
      case 'error':
        failure.textContent = message.message;
        retry.hidden = !message.retryable;
        recovery.hidden = false;
        break;
      case 'ended':
        finish('ended', true);
        break;
      case 'closed':
        finish('lost');
        break;
    }
  }

  const call = root.StellisIntakeCall.start(onEvent, {
    path: kind === 'tour' ?
        '/api/v1/tour/call' :
        `/api/v1/coach/call?${new URLSearchParams({kind, ...localParams()})}`,
    listen: !chat,
  });
  call.setSpeaker(speaker);

  function finish(key, completed = false) {
    if (finished) return;
    finished = true;
    call.end();
    clearInterval(clock);
    clearTarget();
    setStatus(key);
    foot.hidden = true;
    recovery.hidden = true;
    ended.hidden = false;
    if (completed && kind === 'tour') status.textContent = 'Tour complete';
    if (completed && kind === 'morning') status.textContent = 'Check-in complete';
    panel.classList.remove('is-minimised');
    shrink.setAttribute('aria-label', 'Minimise call');
    shrink.title = 'Minimise call';
    setGlyph(shrink, 'arrows-diagonal-minimize-2');
    (destination.hidden ? close : destination).focus({preventScroll: true});
  }

  function remove() {
    finish('ended');
    panel.remove();
    if (current === controls) current = null;
  }

  foot.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    call.sendText(text);
    input.value = '';
  });
  mute.addEventListener('click', () => {
    muted = !muted;
    call.setMuted(muted);
    mute.setAttribute('aria-pressed', String(muted));
    setGlyph(mute, muted ? 'microphone-off' : 'microphone');
  });
  sound.addEventListener('click', () => {
    speaker = !speaker;
    call.setSpeaker(speaker);
    sound.setAttribute('aria-pressed', String(!speaker));
    setGlyph(sound, speaker ? 'volume' : 'volume-off');
  });
  hangUp.addEventListener('click', () => finish('ended'));
  close.addEventListener('click', remove);
  again.addEventListener('click', () => open({kind, chat, onAction}));
  shrink.addEventListener('click', () => {
    const small = panel.classList.toggle('is-minimised');
    shrink.setAttribute('aria-label', small ? 'Expand call' : 'Minimise call');
    shrink.title = shrink.getAttribute('aria-label');
    setGlyph(shrink, small ? 'arrows-diagonal' : 'arrows-diagonal-minimize-2');
  });

  const controls = {end: () => finish('ended'), close: remove};
  current = controls;
  return controls;
}

root.StellisCoachCall = {
  incoming,
  open,
  offerTour,
  localParams
};
})(window);
