/** Confirmed answers inside the shared call and live-notepad interface. */
(function(root) {
'use strict';
function render(scene, kit) {
  const {node, api, button} = kit;
  scene.classList.add('setup-personalize');
  let state, call, voice = false, field, editor, selected = new Set(), busy = false, typing = 0, candidate = null, motion, textMode = false, epoch = 0, confirmRequested = false, fieldEdited = false;
  scene.classList.add('setup-call');
  const {panel, shrink, ring, status:callStatus, timer, caption, startButton:voiceButton,
    typeForm, doneSpeaking, retryReply, mute, sound, hangUp, controls} = root.StellisOnboardingCall.createPanel(kit);
  typeForm.remove();
  let muted=false, speaker=true, clock=0, started=0;
  const head=node('div',null,'setup-call-head');head.append(node('h1','Onboarding call'));
  const back = button('Back', () => previous(), 'profile-back');
  voiceButton.addEventListener('click',()=>{voice=true;textMode=false;chat.hidden=true;startCall();});
  const textButton = button('Text Stellis', () => {
    textMode=true;voice=false;chat.hidden=false;selectTab('transcript');startCall();messageInput.focus();
  },'call-text');
  textButton.setAttribute('aria-expanded','false');
  const body = node('div', null, 'profile-body');
  const status = node('p', '', 'profile-status');status.setAttribute('role', 'status');
  const savedNotes=node('section',null,'profile-saved-notes');savedNotes.setAttribute('aria-label','Confirmed notes');
  const actions = node('div', null, 'setup-actions');
  const next = button('Continue', () => confirm(), 'primary');
  const skip = button('Skip', () => confirm(true));actions.append(next, skip, back);
  for(const control of [voiceButton,textButton,next,skip,back])control.disabled=true;
  const chat = node('section', null, 'profile-chat');chat.hidden=true;chat.setAttribute('aria-label','Conversation with Stellis');
  const transcript = node('div', null, 'call-transcript profile-transcript');transcript.hidden=true;
  transcript.setAttribute('role','tabpanel');transcript.setAttribute('aria-live','polite');
  const composer = node('form', null, 'profile-composer');
  const messageInput = node('input');messageInput.maxLength = 2000;
  messageInput.setAttribute('aria-label','Message Stellis');messageInput.placeholder = 'Your answer or question';
  const send = node('button', 'Send');send.type = 'submit';send.disabled = true;
  composer.append(messageInput, send);chat.append(composer);panel.append(textButton,chat);
  const pad=node('section',null,'call-notepad');pad.setAttribute('aria-label','Notepad');
  const tabs=node('div',null,'call-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Call notes');
  const notesTab=button('Notes',()=>selectTab('notes'),'call-tab');
  const transcriptTab=button('Transcript',()=>selectTab('transcript'),'call-tab');
  const notes=node('div',null,'call-notes');notes.setAttribute('role','tabpanel');notes.append(body,status,savedNotes);
  for(const [tab,id,target] of [[notesTab,'notes',notes],[transcriptTab,'transcript',transcript]]){
    tab.setAttribute('role','tab');tab.id='profile-'+id+'-tab';target.id='profile-'+id;
    tab.setAttribute('aria-controls',target.id);target.setAttribute('aria-labelledby',tab.id);
    tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'notes':event.key==='End'?'transcript':notes.hidden?'notes':'transcript';selectTab(next);(next==='notes'?notesTab:transcriptTab).focus();}});
  }
  tabs.append(notesTab,transcriptTab);pad.append(tabs,notes,transcript);selectTab('notes');
  const layout=node('div',null,'call-layout');layout.append(panel,pad);scene.append(head,layout,actions);
  composer.addEventListener('submit', e => {
    e.preventDefault();const text = messageInput.value.trim();
    if (!text || !call || send.disabled || busy) return;
    fieldEdited = false;call.sendText(text);messageInput.value = '';send.disabled = true;
  });
  shrink.addEventListener('click',()=>{const minimized=scene.classList.toggle('is-minimised');shrink.setAttribute('aria-label',minimized?'Expand call':'Minimise call');shrink.title=shrink.getAttribute('aria-label');setGlyph(shrink,minimized?'arrows-diagonal':'arrows-diagonal-minimize-2');});
  mute.addEventListener('click',()=>{muted=!muted;call?.setMuted(muted);mute.setAttribute('aria-pressed',String(muted));setGlyph(mute,muted?'microphone-off':'microphone');});
  sound.addEventListener('click',()=>{speaker=!speaker;call?.setSpeaker(speaker);sound.setAttribute('aria-pressed',String(!speaker));setGlyph(sound,speaker?'volume':'volume-off');});
  mute.setAttribute('aria-pressed','false');sound.setAttribute('aria-pressed','false');
  hangUp.setAttribute('aria-label','End call');hangUp.addEventListener('click',()=>endSession('ended'));
  doneSpeaking.addEventListener('click',()=>call?.finishAnswer());retryReply.addEventListener('click',()=>{retryReply.hidden=true;call?.retryReply();});
  function setGlyph(control,glyph){control.querySelector('use')?.setAttribute('href','#i-'+glyph);}
  function selectTab(id){notes.hidden=id!=='notes';transcript.hidden=id!=='transcript';for(const [tab,name] of [[notesTab,'notes'],[transcriptTab,'transcript']]){tab.setAttribute('aria-selected',String(id===name));tab.tabIndex=id===name?0:-1;}}
  function setCallStatus(key){panel.dataset.state=key;callStatus.textContent=root.StellisIntakeCall.STATUS[key]||key;doneSpeaking.hidden=key!=='hearing'||!voice||muted;}
  function endSession(key){stopCall();voice=false;textMode=false;clearInterval(clock);clock=0;started=0;controls.hidden=true;chat.hidden=true;doneSpeaking.hidden=retryReply.hidden=true;voiceButton.hidden=false;voiceButton.querySelector('span').textContent='Call again';textButton.hidden=false;caption.textContent='';ring.style.setProperty('--level','0');setCallStatus(key);}
  function paintSavedNotes(){
    savedNotes.replaceChildren();
    const labels={name:'Name',gender:'Gender',period:'Periods',birth_date:'Date of birth',conditions:'Conditions',medicines:'Medicines',goals:'Goals',interests:'Interests',cycle_tracking:'Cycle tracking'};
    for(const item of state.fields){const value=state.answers[item.id];if(value==null||value===''||Array.isArray(value)&&!value.length)continue;
      const block=node('section',null,'call-note');block.append(node('h3',labels[item.id]));
      const text=Array.isArray(value)?value.map(id=>item.choices.find(choice=>choice.id===id)?.label||id).join(' / '):value;
      const edit=button(text,()=>{if(!busy){selectTab('notes');show(item.id);}},'profile-note-edit');edit.setAttribute('aria-label',`Edit ${labels[item.id]}: ${text}`);block.append(edit);savedNotes.append(block);
    }
  }
  function line(role, text) {
    const row = node('p', null, 'profile-message');
    row.append(node('strong', role === 'person' ? 'You' : 'Stellis'), node('span',text));
    transcript.append(row); transcript.scrollTop = transcript.scrollHeight;
  }
  function lockReply(locked) {
    next.disabled = skip.disabled = locked || busy;
    send.disabled = locked || busy || !field || !call;
  }

  function stopCall() { ++epoch; if (call) call.end(); call = null; send.disabled = true; confirmRequested = false; lockReply(false); }
  function startCall() {
    stopCall();
    const active = epoch;lockReply(true);setCallStatus('connecting');voiceButton.hidden=true;textButton.hidden=true;controls.hidden=false;chat.hidden=false;mute.disabled=!voice;sound.disabled=!voice;textButton.setAttribute('aria-expanded',String(textMode));
    call = root.StellisIntakeCall.start(message => {if (active === epoch) event(message);}, {
      listen:voice,
      path:'/api/v1/onboarding/profile/call?field=' + encodeURIComponent(field?.id || 'complete')
    });
    call.setMuted(muted);call.setSpeaker(speaker);
  }
  function event(message) {
    if(message.type==='ready'){
      if(!message.voice){voice=false;textMode=true;chat.hidden=false;}
      if(!clock){started=Date.now();timer.textContent='0:00';timer.hidden=false;clock=setInterval(()=>{const seconds=Math.floor((Date.now()-started)/1000);timer.textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');},1000);}
      mute.disabled=!message.voice;sound.disabled=!message.voice;setCallStatus(message.voice?'listening':'typing');
    }else if(message.type==='caption'){caption.textContent=message.text;if(message.audio&&message.text)setCallStatus('speaking');}
    else if(message.type==='level'){ring.style.setProperty('--level',String(Math.min(1,(message.speaking?message.agent:message.person)*6)));}
    else if (message.type === 'say') {line('agent',message.text); lockReply(true);}
    else if (message.type === 'heard') line('person',message.text);
    else if (message.type === 'state') {
      setCallStatus(message.state==='listening'&&!voice?'typing':message.state);
      if(!['listening','hearing'].includes(message.state))return;
      lockReply(false);
      if (confirmRequested) {confirmRequested = false; confirm();}
    }
    if (message.type === 'action' && message.action === 'profile_answer' && message.field === field?.id) {
      if (!fieldEdited) fill(message.value);
      status.textContent = fieldEdited ? 'Check your edited answer' : message.value ? 'Is that right?' : 'Enter or choose your answer';
      next.textContent = 'Yes, continue';
    } else if (message.type === 'action' && message.action === 'profile_confirm' && message.field === field?.id) {
      confirmRequested = true;
    } else if (message.type === 'mic' && !message.ok) {
      status.textContent = 'Microphone unavailable';voice=false;textMode=true;chat.hidden=false;mute.disabled=true;setCallStatus('typing');
    } else if (message.type === 'error') {
      status.textContent = message.message;retryReply.hidden=!message.retryable;
    } else if (message.type === 'ended') {
      endSession('ended');
    } else if (message.type === 'closed') {
      endSession('lost');status.textContent='Connection lost';
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
    ++typing; candidate = null; fieldEdited = false; stopCall(); body.replaceChildren(); status.textContent = ''; choices = null;
    motion?.cancel();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) motion = body.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'cubic-bezier(0.22, 1, 0.36, 1)'});
    field = state.fields.find(item => item.id === id);
    next.textContent = field ? 'Continue' : 'Review notebooks';
    skip.hidden = !field;
    back.disabled = false;
    paintSavedNotes();
    if (!field) {
      body.append(node('h2', "You're all set"), node('p', 'Review the notebooks suggested from your interests'));
      if ((voice || textMode) && speak) startCall();
      return;
    }
    body.append(node('h2', field.question));
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
      editor.addEventListener('input', () => {++typing; candidate = null; fieldEdited = true; next.textContent = 'Continue'; paintChoices();});
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
          ++typing; candidate = null; fieldEdited = true;
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
        ++typing; candidate = null; fieldEdited = true;
        const text = field.id === 'goals' ? item.detail : item.label;
        if (!editor.value.includes(text)) editor.value = [editor.value,text].filter(Boolean).join('\n');
        editor.focus();
      }}));
      body.append(details);
    }
    if (editor && field.kind !== 'multiple') editor.focus({preventScroll:true});
    if ((voice || textMode) && speak) startCall();
  }
  async function confirm(skipped = false) {
    if (busy || !state) return;
    if (!field) {stopCall(); await kit.next(); return;}
    if (field.kind === 'date' && !skipped && !editor.checkValidity()) {editor.reportValidity(); return;}
    busy = true; next.disabled = skip.disabled = voiceButton.disabled = textButton.disabled = true; send.disabled = true;
    body.inert = true;
    status.textContent = 'Saving';
    try {
      state = await api('/onboarding/profile', 'PUT', {field:field.id, value:skipped ? null : value()});
      await show(state.step);
    } catch(e) {status.textContent = e.message;}
    finally {
      busy = false; body.inert = false; voiceButton.disabled = textButton.disabled = false;
      if (!call) lockReply(false);
      if (textMode) messageInput.focus({preventScroll:true});
      else if (field) (field.kind === 'multiple' ? choices?.firstElementChild : editor)?.focus({preventScroll:true});
    }
  }
  function previous() {
    if (busy || !state) return;
    const index = state.fields.findIndex(item => item.id === field?.id);
    const previous = state.fields[index < 0 ? state.fields.length-1 : index-1];
    if (previous) show(previous.id); else kit.back();
  }
  api('/onboarding/profile').then(async loaded => {state = loaded;await show(state.complete ? 'name' : state.step,false);voiceButton.disabled=textButton.disabled=false;lockReply(false);}).catch(e=>kit.error(e.message));
  return {leave() {++typing;stopCall();clearInterval(clock);}};
}
root.StellisOnboardingPersonalize = {render};
})(window);
