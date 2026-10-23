/** One confirmed profile field at a time, with optional real call recognition. */
(function(root) {
'use strict';
function render(scene, kit) {
  const {node, api, button} = kit;
  scene.classList.add('setup-personalize');
  let state, call, voice = false, field, editor, selected = new Set(), busy = false, typing = 0, candidate = null, motion;
  const header = node('div', null, 'profile-header');
  const back = button('Back', () => previous(), 'profile-back');
  const voiceButton = button('Use microphone', () => {
    voice = !voice;
    voiceButton.textContent = voice ? 'Microphone on' : 'Use microphone';
    voiceButton.setAttribute('aria-pressed', String(voice));
    if (voice) startVoice(); else stopVoice();
  });
  voiceButton.setAttribute('aria-pressed', 'false');
  header.append(back, voiceButton);
  const body = node('div', null, 'profile-body');
  const status = node('p', '', 'profile-status');
  status.setAttribute('role', 'status');
  const actions = node('div', null, 'setup-actions');
  const next = button('Continue', () => confirm(), 'primary');
  const skip = button('Skip', () => confirm(true));
  actions.append(next, skip);
  scene.append(header, body, status, actions);

  function stopVoice() { if (call) call.end(); call = null; }
  function startVoice() {
    stopVoice();
    call = root.StellisIntakeCall.start(event, {
      path:'/api/v1/onboarding/profile/call?field=' + encodeURIComponent(field?.id || 'complete')
    });
  }
  function event(message) {
    if (message.type === 'action' && message.action === 'profile_answer' && message.field === field?.id) {
      fill(message.value);
      status.textContent = message.value ? 'Is that right?' : 'Enter or choose your answer';
      next.textContent = 'Yes, continue';
    } else if (message.type === 'action' && message.action === 'profile_confirm' && message.field === field?.id) {
      confirm();
    } else if (message.type === 'mic' && !message.ok) {
      status.textContent = 'Microphone unavailable';
    } else if (message.type === 'error') {
      status.textContent = message.message;
    } else if (message.type === 'ended') {
      call = null; voice = false; voiceButton.textContent = 'Use microphone'; voiceButton.setAttribute('aria-pressed','false');
    } else if (message.type === 'closed') {
      status.textContent = 'Connection lost';
    }
  }
  function value() { return field.kind === 'multiple' ? [...selected] : candidate ?? editor.value.trim(); }
  function fill(answer) {
    if (field.kind === 'multiple') {
      selected = new Set(Array.isArray(answer) ? answer : []); paintChoices(); return;
    }
    const text = String(answer || '');
    candidate = text;
    if (field.kind === 'date' || matchMedia('(prefers-reduced-motion: reduce)').matches) { editor.value = text; return; }
    const generation = ++typing;
    editor.value = '';
    let position = 0;
    const write = () => {
      if (generation !== typing || !editor?.isConnected) return;
      editor.value = text.slice(0, ++position);
      if (position < text.length) setTimeout(write, Math.min(18, 650 / Math.max(1, text.length)));
    };
    write();
  }
  let choices;
  function paintChoices() {
    if (!choices) return;
    for (const item of choices.children) {
      const checked = field.kind === 'multiple' ? selected.has(item.dataset.value) : editor.value === item.dataset.value;
      item.setAttribute('aria-pressed', String(checked));
    }
  }
  async function show(id, speak = true) {
    ++typing; candidate = null; stopVoice(); body.replaceChildren(); status.textContent = ''; choices = null;
    motion?.cancel();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) motion = body.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(0.22, 1, 0.36, 1)'});
    field = state.fields.find(item => item.id === id);
    next.textContent = field ? 'Continue' : 'Review notebooks';
    skip.hidden = !field;
    back.disabled = field?.id === 'name';
    if (!field) {
      body.append(node('h1', "You're all set"), node('p', 'Review the notebooks suggested from your interests'));
      if (voice && speak) startVoice();
      return;
    }
    body.append(node('h1', field.question));
    const saved = state.answers[field.id];
    selected = new Set(Array.isArray(saved) ? saved : []);
    if (field.kind !== 'multiple') {
      editor = node(field.kind === 'long' ? 'textarea' : 'input', null, 'profile-answer');
      if (field.kind === 'date') {
        editor.type = 'date'; editor.required = true; editor.min = '1900-01-01'; editor.max = new Date().toISOString().slice(0,10);
      }
      editor.value = typeof saved === 'string' ? saved : '';
      editor.maxLength = field.kind === 'long' ? 2000 : 100;
      editor.setAttribute('aria-label', field.question);
      if (field.id === 'name') editor.autocomplete = 'given-name';
      if (field.id === 'birth_date') editor.autocomplete = 'bday';
      editor.addEventListener('input', () => {++typing; candidate = null; next.textContent = 'Continue'; paintChoices();});
      editor.addEventListener('keydown', e => {if (e.key === 'Enter' && field.kind !== 'long') {e.preventDefault();confirm();}});
      body.append(editor);
    }
    if (field.choices) {
      choices = node('div', null, 'profile-choices');
      choices.setAttribute('role','group'); choices.setAttribute('aria-label',field.question);
      for (const choice of field.choices) {
        const id = typeof choice === 'string' ? choice : choice.id;
        const label = typeof choice === 'string' ? choice : choice.label;
        const option = button(label, () => {
          ++typing; candidate = null;
          if (field.kind === 'multiple') {if (selected.has(id)) selected.delete(id); else selected.add(id);}
          else editor.value = id;
          paintChoices();
        }, 'profile-choice');
        option.dataset.value = id;
        choices.append(option);
      }
      body.append(choices); paintChoices();
    }
    if (field.library) {
      const details = node('details', null, 'profile-library');
      details.append(node('summary', 'Search health library'));
      details.append(root.StellisIntakeLibrary.render({node,api,category:field.library,onSelect(item) {
        ++typing; candidate = null;
        const text = field.id === 'goals' ? item.detail : item.label;
        if (!editor.value.includes(text)) editor.value = [editor.value,text].filter(Boolean).join('\n');
        editor.focus();
      }}));
      body.append(details);
    }
    if (editor && field.kind !== 'multiple') editor.focus({preventScroll:true});
    if (voice && speak) startVoice();
  }
  async function confirm(skipped = false) {
    if (busy) return;
    if (!field) {stopVoice(); await kit.next(); return;}
    if (field.kind === 'date' && !skipped && !editor.checkValidity()) {editor.reportValidity(); return;}
    busy = true; next.disabled = skip.disabled = voiceButton.disabled = true;
    body.inert = true;
    status.textContent = 'Saving';
    try {
      state = await api('/onboarding/profile', 'PUT', {field:field.id, value:skipped ? null : value()});
      await show(state.step);
    } catch(e) {status.textContent = e.message;}
    finally {
      busy = false; body.inert = false; next.disabled = skip.disabled = voiceButton.disabled = false;
      if (field) (field.kind === 'multiple' ? choices?.firstElementChild : editor)?.focus({preventScroll:true});
    }
  }
  function previous() {
    if (busy) return;
    const index = state.fields.findIndex(item => item.id === field?.id);
    const previous = state.fields[index < 0 ? state.fields.length-1 : index-1];
    if (previous) show(previous.id); else kit.back();
  }
  api('/onboarding/profile').then(loaded => {state = loaded;show(state.complete ? 'name' : state.step,false);}).catch(e=>kit.error(e.message));
  return {leave() {++typing; stopVoice();}};
}
root.StellisOnboardingPersonalize = {render};
})(window);
