/**
 * @fileoverview Setup step 2: the intake call. The call panel shows the
 * agent, a timer and the call controls; the notepad beside it fills in as
 * the person talks and stays editable, with the transcript behind it. The
 * call can shrink to a floating card so the notes take the screen.
 */
(function(root) {
'use strict';

const STATUS = {
  ready: 'Ready when you are',
  connecting: 'Connecting',
  listening: 'Listening',
  hearing: 'Hearing you',
  transcribing: 'Processing your answer',
  thinking: 'Thinking',
  speaking: 'Speaking',
  typing: 'Type your answers below',
  ended: 'Call ended. Press Continue to add your records.',
  lost: "Sorry we couldn't reach the agent",
};

/**
 * Renders the call step.
 * @param {!Element} scene
 * @param {!Object} kit Helpers from onboarding.js: api, node, icon, avatar,
 *     button, and next and back, which move between steps.
 */
function render(scene, kit) {
  const {api, node, icon, avatar} = kit;
  scene.classList.add('setup-call');
  let call = null;
  let state = null;
  let started = 0;
  let clock = 0;
  let revision = 0;
  let deferred = null;
  let muted = false;
  let speaker = true;

  const head = node('div', null, 'setup-call-head');
  head.append(
      node('h1', 'Onboarding call'),
      node(
          'p', 'Stellis learns what you need, then shows you around',
          'setup-hint'));

  // The call panel.
  const panel = node('section', null, 'call-panel');
  panel.setAttribute('aria-label', 'Call');
  const shrink =
      iconButton('arrows-diagonal-minimize-2', 'Minimise call', 'call-shrink');
  const face = node('div', null, 'call-face');
  const ring = node('span', null, 'call-ring');
  face.append(ring, avatar('stellis', true, 96));
  const name = node('strong', 'Stellis', 'call-name');
  const status = node('p', STATUS.ready, 'call-status');
  status.role = 'status';
  const timer = node('span', '0:00', 'call-timer');
  timer.hidden = true;
  const caption = node('p', '', 'call-caption');
  caption.setAttribute('aria-hidden', 'true');
  const startButton = node('button', null, 'call-start');
  startButton.type = 'button';
  startButton.append(icon('phone'), node('span', 'Start call'));
  const typeForm = node('form', null, 'call-type');
  const typeInput = node('input');
  typeInput.placeholder = 'Type an answer';
  typeInput.maxLength = 2000;
  typeInput.setAttribute('aria-label', 'Your answer');
  const typeSend = node('button', 'Send');
  typeSend.type = 'submit';
  typeForm.append(typeInput, typeSend);
  typeForm.hidden = true;
  const doneSpeaking = node('button', 'Done speaking', 'call-finish');
  doneSpeaking.type = 'button';
  doneSpeaking.hidden = true;
  doneSpeaking.addEventListener('click', () => call?.finishAnswer());
  const mute = control('microphone', 'Mute');
  const sound = control('volume', 'Speaker');
  const hangUp = control('phone-off', 'End');
  hangUp.classList.add('call-end');
  const controls = node('div', null, 'call-controls');
  controls.append(mute, sound, hangUp);
  controls.hidden = true;
  panel.append(
      shrink, face, name, status, timer, caption, startButton, doneSpeaking, typeForm,
      controls);

  // The notepad, with the transcript behind it.
  const pad = node('section', null, 'call-notepad');
  pad.setAttribute('aria-label', 'Notepad');
  const tabs = node('div', null, 'call-tabs');
  tabs.role = 'tablist';
  const notesTab = tab('Notes', true);
  const transcriptTab = tab('Transcript', false);
  tabs.append(notesTab, transcriptTab);
  const notes = node('div', null, 'call-notes');
  notes.role = 'tabpanel';
  const transcript = node('ol', null, 'call-transcript');
  transcript.role = 'tabpanel';
  transcript.hidden = true;
  const heard =
      node('p', 'Speech recognition can mishear words. ', 'call-heard');
  heard.append(root.StellisDom.accuracyNote('speech', 'About accuracy'));
  pad.append(tabs, notes, transcript, heard);

  const actions = node('div', null, 'setup-actions');
  const next = kit.button('Continue', finish, 'primary');
  actions.append(next, kit.button('Back', async () => {
    hangUpCall();
    await kit.back();
  }));
  const layout = node('div', null, 'call-layout');
  layout.append(panel, pad);
  scene.append(head, layout, actions);

  function iconButton(glyph, label, cls) {
    const element = node('button', null, cls);
    element.type = 'button';
    element.setAttribute('aria-label', label);
    element.title = label;
    element.append(icon(glyph));
    return element;
  }

  function control(glyph, label) {
    const element = node('button', null, 'call-control');
    element.type = 'button';
    element.append(icon(glyph), node('span', label));
    return element;
  }

  function setGlyph(element, glyph) {
    element.querySelector('use').setAttribute('href', '#i-' + glyph);
  }

  function tab(label, selected) {
    const element = node('button', label, 'call-tab');
    element.type = 'button';
    element.role = 'tab';
    element.setAttribute('aria-selected', String(selected));
    element.addEventListener('click', () => {
      for (const item of tabs.children) {
        item.setAttribute('aria-selected', String(item === element));
      }
      notes.hidden = element !== notesTab;
      transcript.hidden = element !== transcriptTab;
    });
    return element;
  }

  function setStatus(key) {
    status.textContent = STATUS[key];
    panel.dataset.state = key;
    doneSpeaking.hidden = mute.disabled || !['listening', 'hearing'].includes(key);
  }

  function tick() {
    const seconds = Math.floor((Date.now() - started) / 1000);
    timer.textContent =
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  /** Paints the current notes while preserving an active edit. */
  function paintNotes(sections) {
    if (notes.contains(document.activeElement)) {
      deferred = sections;
      return;
    }
    notes.replaceChildren();
    if (!sections.length) {
      notes.append(node(
          'p', 'Notes appear here as you talk', 'setup-hint call-notes-empty'));
      return;
    }
    for (const section of sections) {
      const block = node('section', null, 'call-note');
      const list = node('ul');
      for (const item of section.items) {
        const line = node('li', item);
        line.contentEditable = 'plaintext-only';
        line.spellcheck = true;
        list.append(line);
      }
      block.append(node('h3', section.heading), list);
      block.dataset.heading = section.heading;
      notes.append(block);
    }
  }

  function readNotes() {
    return [...notes.querySelectorAll('.call-note')].map(
        (block) => ({
          heading: block.dataset.heading,
          items: [...block.querySelectorAll('li')]
                     .map((li) => li.textContent.trim())
                     .filter(Boolean),
        }));
  }

  async function saveNotes() {
    try {
      const saved =
          await api('/intake/notes', 'PUT', {sections: readNotes(), revision});
      revision = saved.notes_revision;
    } catch {
      const fresh = await api('/intake');
      revision = fresh.notes_revision;
      paintNotes(fresh.notes);
    }
  }

  notes.addEventListener('focusout', (event) => {
    if (notes.contains(event.relatedTarget)) return;
    saveNotes().then(() => {
      if (deferred) {
        const latest = deferred;
        deferred = null;
        paintNotes(latest);
      }
    });
  });
  notes.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches('li')) {
      event.preventDefault();
      event.target.blur();
    }
  });

  /**
   * Shows a turn in the transcript. The agent speaks a reply in pieces, so
   * pieces of the same turn join one line, and an answer the person
   * continued after a pause replaces its earlier line.
   */
  function addLine(role, text, turn) {
    const key = role === 'agent' ? 'agentTurn' : 'turn';
    const selector = role === 'agent' ? 'data-agent-turn' : 'data-turn';
    const existing = turn != null ?
        transcript.querySelector(`[${selector}="${turn}"]`) :
        null;
    if (existing && role === 'agent') {
      existing.querySelector('span').textContent += ' ' + text;
      existing.scrollIntoView({block: 'nearest'});
      return;
    }
    const line = existing || node('li', null, 'is-' + role);
    line.replaceChildren(
        node('strong', role === 'agent' ? 'Stellis' : 'You'),
        node('span', text));
    if (turn != null) line.dataset[key] = turn;
    if (!existing) transcript.append(line);
    line.scrollIntoView({block: 'nearest'});
  }

  function onEvent(message) {
    switch (message.type) {
      case 'ready':
        started = Date.now();
        timer.hidden = false;
        clock = setInterval(tick, 1000);
        controls.hidden = false;
        typeForm.hidden = false;
        revision = message.revision;
        paintNotes(message.notes);
        setStatus(message.voice ? 'listening' : 'typing');
        break;
      case 'mic':
        if (!message.ok) {
          mute.disabled = true;
          doneSpeaking.hidden = true;
          setStatus('typing');
        }
        break;
      case 'state':
        if (panel.dataset.state !== 'ended') {
          setStatus(
              message.state === 'listening' && mute.disabled ? 'typing' :
                                                               message.state);
        }
        break;
      case 'caption':
        // A line joins the transcript when it starts playing, so speech cut
        // off by the person never appears there.
        caption.textContent = message.text;
        if (message.text) {
          setStatus('speaking');
          addLine('agent', message.text, message.turn);
        }
        break;
      case 'heard':
        kit.error('');
        // A continued answer drops the reply the agent had started to it.
        transcript.querySelector(`[data-agent-turn="${message.turn}"]`)
            ?.remove();
        addLine('person', message.text, message.turn);
        break;
      case 'notes':
        revision = message.revision;
        paintNotes(message.notes);
        break;
      case 'level': {
        const level = Math.min(
            1, (message.speaking ? message.agent : message.person) * 6);
        ring.style.setProperty('--level', level.toFixed(3));
        if (!message.speaking && panel.dataset.state === 'speaking')
          setStatus('listening');
        break;
      }
      case 'error':
        kit.error(message.message);
        break;
      case 'ended':
        endCall('ended');
        break;
      case 'closed':
        endCall('lost');
        break;
    }
  }

  function hangUpCall() {
    if (call) {
      call.end();
      call = null;
    }
    clearInterval(clock);
  }

  async function endCall(key) {
    hangUpCall();
    setStatus(key);
    caption.textContent = '';
    controls.hidden = true;
    doneSpeaking.hidden = true;
    typeForm.hidden = true;
    startButton.hidden = key === 'ended';
    startButton.querySelector('span').textContent = 'Call again';
    ring.style.setProperty('--level', '0');
    next.classList.toggle('is-next', key === 'ended');
    await api('/intake/end', 'POST');
  }

  startButton.addEventListener('click', () => {
    kit.error('');
    startButton.hidden = true;
    setStatus('connecting');
    call = root.StellisIntakeCall.start(onEvent);
    call.setSpeaker(speaker);
  });
  mute.addEventListener('click', () => {
    muted = !muted;
    call?.setMuted(muted);
    mute.setAttribute('aria-pressed', String(muted));
    setGlyph(mute, muted ? 'microphone-off' : 'microphone');
  });
  sound.addEventListener('click', () => {
    speaker = !speaker;
    call?.setSpeaker(speaker);
    sound.setAttribute('aria-pressed', String(!speaker));
    setGlyph(sound, speaker ? 'volume' : 'volume-off');
  });
  hangUp.addEventListener('click', () => endCall('ended'));
  typeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = typeInput.value.trim();
    if (!text || !call) return;
    call.sendText(text);
    typeInput.value = '';
  });

  /** Swaps between the full call and the floating card. */
  function setMinimised(value) {
    const apply = () => {
      scene.classList.toggle('is-minimised', value);
      shrink.setAttribute(
          'aria-label', value ? 'Expand call' : 'Minimise call');
      shrink.title = shrink.getAttribute('aria-label');
      setGlyph(
          shrink, value ? 'arrows-diagonal' : 'arrows-diagonal-minimize-2');
    };
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !still) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }
  shrink.addEventListener(
      'click', () => setMinimised(!scene.classList.contains('is-minimised')));

  async function finish() {
    if (call) await endCall('ended');
    if (notes.contains(document.activeElement)) document.activeElement.blur();
    await saveNotes();
    await kit.next();
  }

  // Resume: the notes and transcript so far.
  api('/intake')
      .then((loaded) => {
        state = loaded;
        revision = state.notes_revision;
        paintNotes(state.notes);
        for (const turn of state.turns) addLine(turn.role, turn.text);
        if (state.turns.length)
          startButton.querySelector('span').textContent = 'Continue call';
        if (state.ended_at) setStatus('ended');
        if (!root.WebSocket || !root.AudioWorkletNode) {
          setStatus('typing');
        }
      })
      .catch((e) => kit.error(e.message));

  return {leave: hangUpCall};
}

root.StellisOnboardingCall = {render};
})(window);
