(() => {
  const base = '/api/v1';
  let leavingPage = false;
  window.addEventListener('beforeunload', () => { leavingPage = true; });
  window.addEventListener('pageshow', () => { leavingPage = false; });
  let agents = [];
  let templates = [];
  let notebooks = [];
  let collections = [];
  let view = 'thread';
  let accountScope = '';
  let workspaceTab = 'thread';
  let threadTimer = null;
  const pendingTurns = new Map();
  function draftKey(id) { return `stellis-compose:${accountScope}:${id}`; }
  function readDraft(id) { try { return JSON.parse(sessionStorage.getItem(draftKey(id))) || {}; } catch { return {}; } }
  function writeDraft(id, value) { try { sessionStorage.setItem(draftKey(id), JSON.stringify(value)); } catch {} }
  let managementSelection = null;
  let selectedId = null;
  let runtimeConfigured = false;
  let detailRevision = 0;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  async function request(path, options) {
    const response = await fetch(`${base}${path}`, options);
    const result = await response.json();
    if (!response.ok) throw Error(result.detail || 'Could not save. Try again.');
    return result;
  }
  function status(message) { document.querySelector('#agent-chat-status').textContent = message; }
  function agentAvatar(agent, size) {
    return window.StellisAgentAvatar.avatarElement(document, {seed: agent.id, coordinator: window.StellisAgentAvatar.isCoordinator(agent), size});
  }
  function messageBody(content) {
    const body = el('p');
    const links = /\[([^\]\n]{1,120})\]\((\/(?!\/)[^\s)]+|https:\/\/[^\s)]+)\)/g;
    let offset = 0;
    for (const match of content.matchAll(links)) {
      body.append(document.createTextNode(content.slice(offset, match.index)));
      const link = el('a', '', match[1]);
      link.href = match[2];
      if (match[2].startsWith('https://')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
      body.append(link);
      offset = match.index + match[0].length;
    }
    body.append(document.createTextNode(content.slice(offset)));
    return body;
  }
  function field(labelText, value, name, multiline = false) {
    const label = el('label', '', labelText);
    const input = el(multiline ? 'textarea' : 'input');
    input.name = name; input.value = value || '';
    input.maxLength = name === 'instructions' ? 4000 : name === 'role' ? 160 : 80;
    input.required = name !== 'instructions';
    label.append(input);
    return label;
  }
  function agentButton(agent) {
    const button = el('button', 'agent-list-item');
    button.type = 'button';
    const text = el('span', 'agent-list-text');
    text.append(el('strong', '', agent.name), el('small', '', agent.role));
    button.append(agentAvatar(agent, 32), text);
    if (agent.id === selectedId) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => select(agent.id, true).catch(error => status(error.message)));
    return button;
  }
  function renderList() {
    document.querySelector('#agent-list').replaceChildren(...agents.map(agentButton));
    let picker=document.querySelector('#agent-picker');
    if(!picker){picker=el('select','agent-picker');picker.id='agent-picker';picker.setAttribute('aria-label','Choose agent');picker.addEventListener('change',()=>select(picker.value,true).catch(error=>status(error.message)));document.querySelector('.agent-chat-heading').prepend(picker);}
    picker.replaceChildren(...agents.map(agent=>{const option=el('option','',agent.name);option.value=agent.id;return option;}));picker.value=selectedId||agents[0]?.id||'';
  }
  // Settings sections pass their agent; thread actions reload the selected one.
  async function reloadAgent(id = selectedId) {
    const agent = await request(`/agents/${encodeURIComponent(id)}`);
    agents = agents.map(item => item.id === agent.id ? agent : item);
    renderList();
    if (view === 'settings') await renderSettings(); else await renderDetail(agent);
  }
  function notebookSection(agent) {
    const section = el('section', 'agent-detail-section');
    section.append(el('h3', '', 'Notebooks'));
    if (!notebooks.length) {
      section.append(el('p', 'agent-empty', 'Create a notebook to assign this agent.'));
      return section;
    }
    const assigned = new Map(agent.notebooks.map(item => [item.notebook_id, item]));
    for (const notebook of notebooks) {
      const row = el('div', 'agent-notebook-row');
      const label = el('label');
      const input = el('input'); input.type = 'checkbox'; input.checked = assigned.has(notebook.id);
      label.append(input, el('span', '', notebook.name));
      const steward = el('button', 'agent-quiet', assigned.get(notebook.id)?.is_steward ? 'Steward' : 'Make steward');
      steward.type = 'button'; steward.disabled = !input.checked;
      if (assigned.get(notebook.id)?.is_steward) steward.setAttribute('aria-pressed', 'true');
      input.addEventListener('change', async () => {
        try {
          const path = `/agents/${encodeURIComponent(agent.id)}/notebooks/${encodeURIComponent(notebook.id)}`;
          await request(path, input.checked ? {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({steward:false})} : {method:'DELETE'});
          status('Notebook assignment saved'); await reloadAgent(agent.id);
        } catch (error) { input.checked = !input.checked; status(error.message); }
      });
      steward.addEventListener('click', async () => {
        try {
          await request(`/agents/${encodeURIComponent(agent.id)}/notebooks/${encodeURIComponent(notebook.id)}`,
            {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({steward:true})});
          status('Steward saved'); await reloadAgent(agent.id);
        } catch (error) { status(error.message); }
      });
      row.append(label);
      if (!agent.template_id || agent.template_id === 'steward') row.append(steward);
      section.append(row);
    }
    return section;
  }
  async function memorySection(agent) {
    const section = el('section', 'agent-detail-section');
    section.append(el('h3', '', 'Memory'));
    const memories = await request(`/agents/${encodeURIComponent(agent.id)}/memories`);
    const list = el('div', 'agent-memory-list');
    if (!memories.length) list.append(el('p', 'agent-empty', 'No saved memory'));
    for (const memory of memories) {
      const form = el('form', 'agent-memory-row');
      const label = el('label', '', 'Memory');
      const input = el('textarea'); input.value = memory.fact; input.maxLength = 2000; input.required = true;
      label.append(input);
      const buttons = el('div', 'agent-inline-actions');
      const save = el('button', '', 'Save'); save.type = 'submit';
      const remove = el('button', 'agent-quiet', 'Delete'); remove.type = 'button';
      form.addEventListener('submit', async event => {
        event.preventDefault(); save.disabled = true;
        try {
          await request(`/agents/${encodeURIComponent(agent.id)}/memories/${encodeURIComponent(memory.id)}`,
            {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fact:input.value, kind:memory.kind, notebook_id:memory.notebook_id, source_id:memory.source_id})});
          status('Memory saved');
        } catch (error) { status(error.message); }
        finally { save.disabled = false; }
      });
      remove.addEventListener('click', async () => {
        try {
          await request(`/agents/${encodeURIComponent(agent.id)}/memories/${encodeURIComponent(memory.id)}`, {method:'DELETE'});
          status('Memory deleted'); await reloadAgent(agent.id);
        } catch (error) { status(error.message); }
      });
      buttons.append(save, remove); form.append(label, buttons); list.append(form);
    }
    section.append(list);
    const add = el('form', 'agent-memory-add');
    const label = el('label', '', 'Add memory');
    const input = el('input'); input.maxLength = 2000; input.required = true; label.append(input);
    const button = el('button', '', 'Add'); button.type = 'submit';
    add.append(label, button);
    add.addEventListener('submit', async event => {
      event.preventDefault(); button.disabled = true;
      try {
        await request(`/agents/${encodeURIComponent(agent.id)}/memories`,
          {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fact:input.value, kind:'general'})});
        status('Memory added'); await reloadAgent(agent.id);
      } catch (error) { status(error.message); button.disabled = false; }
    });
    section.append(add);
    return section;
  }
  function contextChip(id) {
    const book = notebooks.find(item => item.id === id);
    if (!book) return null;
    const chip = el('a', 'agent-context-chip', book.name); chip.href = `/notebook/${encodeURIComponent(id)}`;
    return chip;
  }
  const artifactEdits=new Map();
  const followupEdits = new Map();
  function suggestionCard(suggestion,onChange) {
    const card=el('section','agent-followup');card.dataset.suggestionId=suggestion.id;
    card.append(el('h4','','Suggested task'),el('p','',suggestion.values.text));
    for(const evidence of suggestion.evidence||[])card.append(el('blockquote','',evidence.quote));
    const target=suggestion.source_target || (suggestion.source_id ? (suggestion.source_kind==='page'?'/page/':'/conversation/')+suggestion.source_id : null);
    if(target){const source=el('a','',suggestion.source_title||'Open source');source.href=target;card.append(source);}
    const notice=el('p','agent-status');notice.role='status';
    if(suggestion.state!=='pending'){
      card.append(el('p','agent-job-state',suggestion.state==='accepted'?'Task added':suggestion.state==='rejected'?'Dismissed':'No longer pending'));
      return card;
    }
    const actions=el('div','agent-followup-actions artifact-actions');
    const send=async(path,body,method='POST')=>request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const button=(text,run,refresh=true)=>{const b=el('button','',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await run();if(refresh)await onChange();}catch(error){notice.textContent=error.message;}finally{b.disabled=false;}};actions.append(b);};
    const editor=el('form','agent-followup-editor artifact-editor'),input=el('input');input.setAttribute('aria-label','Task');input.required=true;input.maxLength=500;
    input.value=followupEdits.get(suggestion.id)??suggestion.values.text;
    editor.hidden=!followupEdits.has(suggestion.id);input.oninput=()=>followupEdits.set(suggestion.id,input.value);
    const save=el('button','','Save task');save.type='submit';editor.append(input,save);
    editor.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{await send('/suggestions/'+suggestion.id,{values:{...suggestion.values,text:input.value}},'PATCH');followupEdits.delete(suggestion.id);await onChange();}catch(error){notice.textContent=error.message;}finally{save.disabled=false;}};
    button('Add task',()=>send('/suggestions/accept',{ids:[suggestion.id]}));
    button('Edit task',async()=>{editor.hidden=false;followupEdits.set(suggestion.id,input.value);input.focus();},false);
    button('Dismiss',()=>send('/suggestions/reject',{ids:[suggestion.id]}));
    card.append(actions,editor,notice);return card;
  }
  function artifactCard(draft,onChange,showFollowup=true) {
    const card=el('section','agent-artifact');card.dataset.artifactId=draft.id;
    const state={draft:'Draft',filed:draft.notebook_id?'Saved to notebook':'Saved as note',discarded:'Discarded'}[draft.state]||draft.state;
    card.append(el('h4','',draft.title),el('p','artifact-meta',state));
    if(draft.state==='discarded')return card;
    card.append(messageBody(draft.body));
    if(draft.sources.length){const evidence=el('details','artifact-sources');evidence.append(el('summary','','Draft sources'));for(const source of draft.sources){const link=el('a','',source.title||'Source');link.href=source.target;if(source.target.startsWith('https://')){link.target='_blank';link.rel='noopener noreferrer';}evidence.append(link);}card.append(evidence);}
    const actions=el('div','artifact-actions'),notice=el('p','artifact-notice');notice.setAttribute('role','status');notice.textContent=draft.error||'';
    const button=(label,action)=>{const control=el('button','agent-quiet',label);control.type='button';control.addEventListener('click',async()=>{actions.querySelectorAll('button').forEach(b=>b.disabled=true);try{const updated=await action();if(updated){artifactEdits.delete(draft.id);await onChange(updated);}}catch(error){notice.textContent=error.message;}finally{actions.querySelectorAll('button').forEach(b=>b.disabled=false);}});actions.append(control);return control;};
    const send=(suffix,data)=>request(`/artifacts/${draft.id}${suffix}`,{method:suffix?'POST':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(draft.state==='draft'){
      button(draft.notebook_id?'Save to notebook':'Save as note',()=>{if(artifactEdits.has(draft.id))throw Error('Save your edits first.');return send('/note',{revision:draft.revision});});button('Copy draft',async()=>{await navigator.clipboard.writeText(draft.body);notice.textContent='Copied';});
      const editor=el('form','artifact-editor');editor.hidden=!artifactEdits.has(draft.id);
      const values=artifactEdits.get(draft.id)||{title:draft.title,body:draft.body};
      function input(label,name,multiline=false){const wrap=el('label','',label),control=el(multiline?'textarea':'input');control.name=name;control.value=values[name];control.required=true;control.maxLength=name==='body'?20000:200;wrap.append(control);editor.append(wrap);control.addEventListener('input',()=>artifactEdits.set(draft.id,Object.fromEntries(new FormData(editor))));return control;}
      input('Title','title');input('Draft','body',true);
      const save=el('button','','Save changes');save.type='submit';const cancel=el('button','agent-quiet','Cancel');cancel.type='button';cancel.addEventListener('click',()=>{artifactEdits.delete(draft.id);for(const control of editor.querySelectorAll('input,textarea'))control.value=draft[control.name];editor.hidden=true;});editor.append(save,cancel);
      editor.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{const values=Object.fromEntries(new FormData(editor));const updated=await send('',{revision:draft.revision,title:values.title,body:values.body});artifactEdits.delete(draft.id);await onChange(updated);}catch(error){notice.textContent=error.message;}finally{save.disabled=false;}});
      button('Edit',async()=>{editor.hidden=false;artifactEdits.set(draft.id,Object.fromEntries(new FormData(editor)));editor.querySelector('input').focus();});
      button('Discard',()=>send('/discard',{revision:draft.revision}));card.append(editor);
    }
    if(draft.state==='filed'){const link=el('a','agent-link-button','Open note');link.href='/page/'+encodeURIComponent(draft.id);actions.append(link);}
    card.append(actions,notice);if(showFollowup && draft.follow_up)card.append(suggestionCard(draft.follow_up,onChange));return card;
  }
  async function refreshThread(section, agent) {
    const [messages, jobs, artifacts] = await Promise.all([
      request(`/agents/${encodeURIComponent(agent.id)}/messages`),
      request(`/agents/${encodeURIComponent(agent.id)}/jobs`),
      request(`/agents/${encodeURIComponent(agent.id)}/artifacts`),
    ]);
    if (selectedId !== agent.id) return;
    const feed = section.querySelector('.agent-thread-feed');
    const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
    const openSteps = new Set([...feed.querySelectorAll('.agent-step-result[open]')].map(item=>item.dataset.stepId));
    const byJob = new Map(jobs.map(job => [job.id, job]));
    const nodes = [];
    for (const message of messages) {
      const item = el('article', `agent-message agent-message-${message.role}`); item.id = 'message-' + message.id;
      const author = el('strong', 'agent-message-author', message.role === 'user' ? 'You' : message.role === 'system' ? 'Task update' : message.addressed_agent_name || agent.name);
      if (message.role === 'agent') author.prepend(agentAvatar(agents.find(a=>a.id===message.addressed_agent_id)||agent, 24));
      item.append(author);
      if(message.role==='user' && message.addressed_agent_id && message.addressed_agent_id!==agent.id)item.append(el('small','agent-job-state','To '+message.addressed_agent_name));
      const draft=message.routed_artifact || artifacts.find(item=>item.message_id===message.id);
      if(draft)item.append(artifactCard(draft,()=>refreshThread(section,agent)));else item.append(messageBody(message.content));
      const chip = contextChip(message.notebook_id); if (chip) item.append(chip);
      const job = byJob.get(message.job_id);
      if (message.role === 'user' && job && job.state !== 'succeeded')
        item.append(el('small', 'agent-job-state', job.state === 'running' ? (message.addressed_agent_name?'Asking '+message.addressed_agent_name+'…':'Working on your request…') : job.error || 'Reply interrupted. Try again.'));
      if(message.role==='user' && job?.steps?.length){
        const work=el('ol','agent-work-steps');work.setAttribute('aria-label','Work steps');
        for(const step of job.steps){
          const row=el('li','agent-work-step');row.dataset.state=step.state;
          row.append(el('strong','',step.agent_name),el('span','',step.task));
          const states={queued:'Waiting',running:'Working…',succeeded:'Done',failed:'Failed',interrupted:'Stopped',skipped:'Not run'};
          row.append(el('small','agent-job-state',states[step.state]||step.state));
          if(step.sources?.length)row.append(el('small','agent-job-state',`${step.sources.length} source${step.sources.length===1?'':'s'}`));
          if(step.result){const detail=el('details','agent-step-result');detail.dataset.stepId=step.id;detail.open=openSteps.has(step.id);detail.append(el('summary','','View result'),messageBody(step.result));row.append(detail);}
          if(step.error)row.append(el('p','agent-status',step.error));
          work.append(row);
        }
        item.append(work);
      }
      if(message.role==='user' && job?.state==='running'){
        const stop=el('button','agent-job-stop','Stop reply');stop.type='button';
        stop.addEventListener('click',async()=>{stop.disabled=true;try{
          await request(`/agents/${agent.id}/jobs/${job.id}/stop`,{method:'POST'});
          await refreshThread(section,agent);
        }catch(error){status(error.message);stop.disabled=false;}});
        item.append(stop);
      }
      nodes.push(item);
    }
    const pending = pendingTurns.get(agent.id);
    section.running = Boolean(pending) || jobs.some(job => job.state === 'running');
    const send = section.querySelector('button[type=submit]');
    if (send) send.disabled = !runtimeConfigured || !agent.enabled || section.running;
    if (pending && !messages.some(message => message.role === 'user' && message.content === pending.question.replace(/\s+/g, ' ').trim() && Date.parse(message.created_at) >= Date.parse(pending.started) - 1000)) {
      const item = el('article', 'agent-message agent-message-user');
      item.append(el('strong', 'agent-message-author', 'You'), messageBody(pending.question), el('small', 'agent-job-state', 'Submitting…'));
      const chip = contextChip(pending.notebook); if (chip) item.append(chip); nodes.push(item);
    }
    if (!nodes.length) nodes.push(el('p', 'agent-empty', `Ask ${agent.name} a question or choose a notebook to work from.`));
    const signature = JSON.stringify([messages,jobs,artifacts,pending?.question]);
    if (feed.dataset.signature !== signature) {feed.replaceChildren(...nodes);feed.dataset.signature = signature;}
    if (nearBottom || pending) feed.scrollTop = feed.scrollHeight;
    clearTimeout(threadTimer);
    if (pending || jobs.some(job => job.state === 'running')) threadTimer = setTimeout(() => {
      if (selectedId === agent.id && section.isConnected) refreshThread(section, agent).catch(error => status(error.message));
    }, 1800);
  }
  async function threadSection(agent) {
    const section = el('section', 'agent-detail-section agent-thread');
    const feed = el('div', 'agent-thread-feed'); feed.setAttribute('role', 'log'); feed.setAttribute('aria-label', `Conversation with ${agent.name}`); feed.setAttribute('aria-live', 'polite');
    section.append(feed);
    await refreshThread(section, agent);
    const form = el('form', 'agent-ask-form agent-composer');
    const draft = readDraft(agent.id);
    const context = el('div', 'agent-composer-context');
    const select = el('select'); select.name = 'notebook_id'; select.setAttribute('aria-label', 'Notebook context');
    const any = el('option', '', 'No notebook'); any.value = ''; select.append(any);
    for (const book of (agent.is_default?notebooks.map(n=>({notebook_id:n.id,notebook_name:n.name,enabled:true})):agent.notebooks)) {
      const option = el('option', '', book.notebook_name + (book.enabled===false?' (Off)':'')); option.value = book.notebook_id; option.disabled=book.enabled===false;select.append(option);
    }
    select.value = draft.notebook || ''; context.append(glyph('notebook'), select); form.append(context);
    const input = el('textarea'); input.name = 'question'; input.maxLength = 2000; input.required = true; input.value = draft.question || '';
    input.placeholder = `Message ${agent.name}`; input.setAttribute('aria-label', `Message ${agent.name}`); form.append(input);
    let mention;
    const remember = () => writeDraft(agent.id, {question:input.value, notebook:select.value, mention:mention?.selected||null});
    mention=window.StellisAgentMentions.attach(input,{initial:draft.mention||null,onChange:remember,
      candidates:()=>select.value?agents.filter(a=>a.enabled&&(a.is_default||a.notebooks.some(b=>b.notebook_id===select.value&&b.enabled!==false))):[]});
    input.addEventListener('input', remember); select.addEventListener('change', remember);
    const actions = el('div', 'agent-composer-actions');
    const state = el('span', 'agent-composer-state'); state.role = 'status';
    const send = el('button', '', 'Send'); send.type = 'submit';
    send.disabled = !runtimeConfigured || !agent.enabled || section.running;
    if (!agent.enabled) state.textContent = 'Turn on this agent in Setup.';
    else if (!runtimeConfigured) state.textContent = 'Configure inference in Settings to reply.';
    actions.append(state, send); form.append(actions);
    input.addEventListener('keydown', event => { if (!event.defaultPrevented && (event.metaKey || event.ctrlKey) && event.key === 'Enter' && !send.disabled) {event.preventDefault(); form.requestSubmit();} });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (send.disabled || !input.value.trim()) return;
      let target;try{target=mention.resolve();}catch(error){state.textContent=error.message;return;}
      const submitted = {question:input.value.trim(), notebook:select.value, mention:mention.selected, target, started:new Date().toISOString()};
      pendingTurns.set(agent.id, submitted); send.disabled = true; input.value = ''; remember(); state.textContent = 'Working…';
      const optimistic = el('article', 'agent-message agent-message-user'); optimistic.append(el('strong', 'agent-message-author', 'You'), messageBody(submitted.question), el('small', 'agent-job-state', 'Submitting…')); feed.querySelector('.agent-empty')?.remove(); feed.append(optimistic); feed.scrollTop = feed.scrollHeight;
      clearTimeout(threadTimer); threadTimer = setTimeout(() => refreshThread(section, agent).catch(error => status(error.message)), 700);
      try {
        await request(`/agents/${encodeURIComponent(agent.id)}/ask`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question:submitted.question, notebook_id:submitted.notebook || null,target_agent_id:submitted.target})});
        state.textContent = '';
      } catch (error) {
        state.textContent = error.message;
        if (!leavingPage && !readDraft(agent.id).question) {
          writeDraft(agent.id, {question:submitted.question, notebook:submitted.notebook,mention:submitted.mention});
          const current = selectedId === agent.id ? document.querySelector('.agent-composer textarea') : null;
          if (current && !current.value) current.value = submitted.question;
        }
      } finally {
        pendingTurns.delete(agent.id); send.disabled = !runtimeConfigured || !agent.enabled;
        if (selectedId === agent.id && section.isConnected) await refreshThread(section, agent).catch(error => status(error.message));
      }
    });
    section.append(form); return section;
  }
  function identityForm(agent) {
    const identity = el('form', 'agent-identity-form');
    identity.append(field('Name', agent.name, 'name'), field('Role', agent.role, 'role'),
      field('Instructions', agent.instructions, 'instructions', true));
    const save = el('button', '', 'Save agent'); save.type = 'submit'; identity.append(save);
    identity.addEventListener('submit', async event => {
      event.preventDefault(); save.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(identity));
        await request(`/agents/${encodeURIComponent(agent.id)}`,
          {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
        status('Agent saved'); await reloadAgent(agent.id);
      } catch (error) { status(error.message); save.disabled = false; }
    });
    return identity;
  }
  async function contextPanel(agent) {
    const panel = el('aside', 'agent-context-panel'); panel.setAttribute('aria-label', 'Agent context');
    const group = (title, text) => { const section = el('section'); section.append(el('h4', '', title)); if (text) section.append(el('p', '', text)); panel.append(section); return section; };
    group('Formats', agent.behavior?.returns || 'Answers and source-backed notes');
    const scope = group('Works in');
    if (!agent.notebooks.length) scope.append(el('p', '', 'No notebooks assigned'));
    for (const book of agent.notebooks) {const chip = contextChip(book.notebook_id); if (chip) scope.append(chip);}
    const memories = await request(`/agents/${encodeURIComponent(agent.id)}/memories`);
    const memory = group('Memory');
    if (!memories.length) memory.append(el('p', '', 'No saved memory yet.'));
    for (const item of memories.slice(-4)) memory.append(el('p', '', item.fact));
    if (!agent.template_id || agent.template_id === 'steward') return panel;
    const copies = group('Named copies');
    const related = agents.filter(item => item.id !== agent.id && item.template_id && item.template_id === agent.template_id);
    for (const copy of related) {const link=el('a', 'agent-copy-link', copy.name);link.href=`/chat/${encodeURIComponent(copy.id)}`;copies.append(link);}
    if (!related.length) copies.append(el('p', '', 'Give a specific use its own instructions and memory.'));
    const create = el('button', 'agent-quiet', 'Name a copy'); create.type='button';
    create.addEventListener('click', () => {
      openCreate();const form=document.querySelector('#agent-new-form'),template=form.elements.template_id;
      if (agent.template_id) {template.value=agent.template_id;template.dispatchEvent(new Event('change'));}
      form.querySelector('input[type=checkbox]').click();form.scrollIntoView({block:'nearest'});
    });copies.append(create);return panel;
  }
  async function renderDetail(agent) {
    const revision = ++detailRevision;
    const target = document.querySelector('#agent-detail');
    clearTimeout(threadTimer);
    const head = el('div', 'agent-detail-head'); const identity=el('div','agent-workspace-identity'),text=el('div');
    text.append(el('h3', '', agent.name), el('p', '', agent.behavior?.does || agent.role));identity.append(agentAvatar(agent,44),text);head.append(identity);
    const tabs=el('div','agent-workspace-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Agent workspace');
    const thread=await threadSection(agent);
    if (selectedId !== agent.id || view !== 'thread' || revision !== detailRevision) return;
    const shell=el('div','agent-workspace'),center=el('div','agent-workspace-center');
    const threadPanel=el('div','agent-workspace-panel'),setupPanel=el('div','agent-workspace-panel');
    const panels={thread:threadPanel,setup:setupPanel}; let setupLoaded=false;
    threadPanel.append(thread);
    async function activate(name) {
      workspaceTab=name;
      for (const [key,panel] of Object.entries(panels)) {panel.hidden=key!==name;tabs.querySelector(`[data-tab="${key}"]`).setAttribute('aria-selected',String(key===name));}
      try {
        if(name==='setup'&&!setupLoaded){setupLoaded=true;setupPanel.append(behaviorCard(agent),agentControls(agent),identityForm(agent),notebookSection(agent),await memorySection(agent));}
      } catch(error) {setupLoaded=false;status(error.message);}
    }
    for(const [name,label] of [['thread','Thread'],['setup','Setup']]) {
      const button=el('button','',label);button.type='button';button.dataset.tab=name;button.id=`agent-tab-${name}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',`agent-panel-${name}`);
      const panel=panels[name];panel.id=`agent-panel-${name}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
      button.addEventListener('click',()=>activate(name));button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...tabs.children],index=buttons.indexOf(button),next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();buttons[next].click();});tabs.append(button);
    }
    center.append(tabs,threadPanel,setupPanel);shell.append(center,await contextPanel(agent));
    if (selectedId !== agent.id || view !== 'thread' || revision !== detailRevision) return;
    target.replaceChildren(head,shell);await activate(workspaceTab);
    if (location.hash.startsWith('#message-')) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    else thread.querySelector('.agent-thread-feed').scrollTop=thread.querySelector('.agent-thread-feed').scrollHeight;
  }
  function glyph(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#i-${name}`);
    svg.append(use); return svg;
  }
  function managementChip(agent, bookId) {
    const button=el('button','deployment-chip');button.type='button';button.dataset.agentId=agent.id;
    const assignment=agent.notebooks.find(item=>item.notebook_id===bookId);
    button.append(agentAvatar(agent,24),el('span','',assignment?.is_steward?'Steward':agent.name));
    if(!agent.enabled || assignment?.enabled===false)button.append(el('small','deployment-off','Off'));
    button.setAttribute('aria-pressed',String(managementSelection?.agentId===agent.id && managementSelection?.bookId===bookId));
    button.addEventListener('click',()=>{managementSelection={agentId:agent.id,bookId};renderSettings(true).catch(error=>status(error.message));});
    return button;
  }
  function managementAdd(bookId, templateId) {
    managementSelection={bookId};openCreate();
    const form=document.querySelector('#agent-new-form');form.elements.notebook_id.value=bookId;
    if(templateId){form.elements.template_id.value=templateId;form.elements.template_id.dispatchEvent(new Event('change'));}
    form.scrollIntoView({block:'nearest'});
  }
  async function managementPanel(selection) {
    const panel=el('aside','deployment-detail');panel.setAttribute('aria-label','Selected agent');panel.tabIndex=-1;
    const agent=agents.find(item=>item.id===selection?.agentId),book=notebooks.find(item=>item.id===selection?.bookId);
    if(!agent){panel.append(el('h4','','Choose an agent'),el('p','agent-empty','Select an agent to manage its work and memory.'));return panel;}
    const identity=el('div','deployment-identity'),text=el('div');text.append(el('h4','',agent.name),el('p','',book?.name || (agent.is_default?'All notebooks':'No notebook assigned')));identity.append(agentAvatar(agent,38),text);panel.append(identity);
    const assignment=agent.notebooks.find(item=>item.notebook_id===book?.id);
    const toggleLabel=el('label','deployment-toggle'),toggle=el('input');toggle.type='checkbox';toggle.setAttribute('role','switch');toggle.checked=agent.enabled && assignment?.enabled!==false;toggle.disabled=agent.is_default;
    toggleLabel.append(toggle,el('span','',book?'On in this notebook':'On'));panel.append(toggleLabel);
    if(assignment && !agent.enabled)panel.append(el('p','agent-empty','This agent is off everywhere. Turning it on also enables this notebook.'));
    toggle.addEventListener('change',async()=>{toggle.disabled=true;try{
      if(assignment){
        if(toggle.checked&&!agent.enabled)await request(`/agents/${agent.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:true})});
        await request(`/agents/${agent.id}/notebooks/${book.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:toggle.checked})});
      }else await request(`/agents/${agent.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:toggle.checked})});
      await reloadAgent(agent.id);status(toggle.checked?'Agent turned on':'Agent turned off in this notebook');
    }catch(error){toggle.checked=!toggle.checked;toggle.disabled=false;status(error.message);}});
    const facts=el('dl','deployment-facts');for(const [key,label] of [['does','Does'],['runs','Runs'],['asks_first','Asks first']])facts.append(el('dt','',label),el('dd','',agent.behavior?.[key]||'Not specified'));
    const memories=await request(`/agents/${agent.id}/memories`);facts.append(el('dt','','Remembers'));
    const remembered=memories.filter(item=>!book || !item.notebook_id || item.notebook_id===book.id);
    facts.append(el('dd','',remembered.length?remembered.map(item=>item.fact).join('\n'):'No saved memory yet.'));panel.append(facts);
    const actions=el('div','deployment-actions'),chat=el('a','agent-link-button','Chat');chat.href=`/chat/${agent.id}`;actions.append(chat);
    if(book){chat.addEventListener('click',()=>writeDraft(agent.id,{...readDraft(agent.id),notebook:book.id}));}
    const edit=el('button','agent-quiet','Rename');edit.type='button';actions.append(edit);
    const editor=el('div','deployment-editor');editor.hidden=true;editor.append(identityForm(agent));
    edit.addEventListener('click',()=>{editor.hidden=!editor.hidden;if(!editor.hidden)editor.querySelector('input').focus();});
    if(assignment){const remove=el('button','agent-quiet','Remove');remove.type='button';actions.append(remove);remove.addEventListener('click',async()=>{
      remove.disabled=true;try{await request(`/agents/${agent.id}/notebooks/${book.id}`,{method:'DELETE'});managementSelection={bookId:book.id};await reloadAgent(agent.id);status('Removed from '+book.name+'. Chat and memory kept.');}catch(error){remove.disabled=false;status(error.message);}
    });}
    panel.append(actions,editor);
    const customize=el('details','deployment-customize');customize.append(el('summary','','Instructions and memory'),el('p','agent-template-text',templates.find(item=>item.id===agent.template_id)?.instructions||agent.role),await memorySection(agent));
    const instructions=identityForm(agent);instructions.querySelector('input[name=name]').closest('label').hidden=true;instructions.querySelector('input[name=role]').closest('label').hidden=true;customize.append(instructions);panel.append(customize);
    if(book){const suggestions=el('section','deployment-suggestions');suggestions.append(el('h4','','Add to '+book.name));
      for(const template of templates.filter(item=>!agents.some(a=>a.template_id===item.id&&a.notebooks.some(n=>n.notebook_id===book.id)))){const add=el('button','agent-quiet',template.name);add.type='button';add.addEventListener('click',()=>managementAdd(book.id,template.id));suggestions.append(add);}panel.append(suggestions);}
    return panel;
  }
  async function renderSettings(focus=false) {
    const revision=++detailRevision;clearTimeout(threadTimer);
    const head=el('div','agent-detail-head');head.append(el('h3','','Agents'));
    const layout=el('div','deployment-layout'),list=el('div','deployment-list');
    function group(name,books){if(!books.length)return;const section=el('section','deployment-group');section.append(el('h4','notebook-group-head',name));
      for(const book of books){const row=el('div','deployment-row');row.dataset.notebookId=book.id;const title=el('a','deployment-book',book.name);title.href=`/notebook/${book.id}`;row.append(title);const chips=el('div','deployment-chips');for(const agent of agents.filter(item=>item.notebooks.some(n=>n.notebook_id===book.id)))chips.append(managementChip(agent,book.id));
        const add=el('button','deployment-add','+ Add');add.type='button';add.setAttribute('aria-label','Add agent to '+book.name);add.addEventListener('click',()=>managementAdd(book.id));chips.append(add);row.append(chips);section.append(row);}list.append(section);}
    const everywhere=el('section','deployment-group');everywhere.append(el('h4','notebook-group-head','Everywhere'));const globalRow=el('div','deployment-row');globalRow.append(el('span','deployment-book','All notebooks'));const defaults=el('div','deployment-chips');for(const agent of agents.filter(item=>item.is_default))defaults.append(managementChip(agent,null));globalRow.append(defaults);everywhere.append(globalRow);list.append(everywhere);
    for(const collection of collections)group(collection.name,notebooks.filter(book=>collection.notebook_ids.includes(book.id)));
    group('Notebooks',notebooks.filter(book=>!collections.some(group=>group.notebook_ids.includes(book.id))));
    const unassigned=agents.filter(agent=>!agent.is_default&&!agent.notebooks.length);if(unassigned.length){const section=el('section','deployment-group');section.append(el('h4','notebook-group-head','Not assigned'));const chips=el('div','deployment-chips');for(const agent of unassigned)chips.append(managementChip(agent,null));section.append(chips);list.append(section);}
    if(!managementSelection) {const agent=agents.find(item=>!item.is_default&&item.notebooks.length)||agents[0];if(agent)managementSelection={agentId:agent.id,bookId:agent.notebooks[0]?.notebook_id||null};}
    const panel=await managementPanel(managementSelection);layout.append(list,panel);
    if(view==='settings'&&revision===detailRevision){document.querySelector('#agent-detail').replaceChildren(head,layout);if(focus){panel.focus({preventScroll:true});if(innerWidth<1100)panel.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}
  }
  function setView(next) {
    view = next;
    document.querySelector('#agent-chat-view').classList.toggle('agent-management-view',next==='settings');
    const link = document.querySelector('#agent-settings-link');
    if (next === 'settings') link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  async function select(id, navigate) {
    clearTimeout(threadTimer);
    setView('thread');
    if (selectedId !== id) workspaceTab = 'thread';
    selectedId = id;
    renderList();
    if (navigate) history.pushState({}, '', `/chat/${encodeURIComponent(id)}`);
    const agent = agents.find(item => item.id === id);
    if (agent) await renderDetail(agent);
  }
  async function show(requestedId) {
    status('');
    const [items, books, groups, runtime, catalog] = await Promise.all([request('/agents'), request('/notebooks'), request('/collections'), request('/agents/runtime'), request('/agents/templates')]);
    accountScope = (await request('/auth/status')).username || 'local';
    templates = catalog;
    agents = items; notebooks = books.notebooks || []; collections = groups.collections || []; runtimeConfigured = runtime.configured;
    if (requestedId === 'settings') { setView('settings'); selectedId = null; renderList(); await renderSettings(); return; }
    const id = agents.some(agent => agent.id === requestedId) ? requestedId : agents[0]?.id;
    if (id) await select(id, false);
  }
  function behaviorCard(agent) {
    const card = el('dl', 'agent-behavior');
    const behavior = agent.behavior || {};
    for (const [key, label] of [['does', 'Does'], ['runs', 'Runs'], ['returns', 'Returns'], ['asks_first', 'Asks first']]) {
      card.append(el('dt', '', label), el('dd', '', behavior[key] || 'Not specified'));
    }
    return card;
  }
  function agentControls(agent) {
    const controls = el('div', 'agent-controls');
    const label = el('label', 'agent-enabled');
    const toggle = el('input'); toggle.type = 'checkbox'; toggle.checked = agent.enabled; toggle.disabled = agent.is_default;
    label.append(toggle, el('span', '', 'On in assigned notebooks'));
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      try {
        await request(`/agents/${encodeURIComponent(agent.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({enabled:toggle.checked})});
        await reloadAgent(agent.id); status(toggle.checked ? 'Agent turned on' : 'Agent turned off');
      } catch (error) { toggle.checked = !toggle.checked; toggle.disabled = false; status(error.message); }
    });
    controls.append(label);
    const template = templates.find(item => item.id === agent.template_id);
    if (template) {
      const baseline = el('details', 'agent-template-instructions');
      baseline.append(el('summary', '', template.name + ' instructions'), el('p', '', template.instructions));
      controls.append(baseline);
    }
    if (!agent.is_default) {
      const remove = el('button', 'agent-quiet', 'Delete agent'); remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete ${agent.name}, its chat and saved memory?`)) return;
        remove.disabled = true;
        try { await request(`/agents/${encodeURIComponent(agent.id)}`, {method:'DELETE'}); await show('settings'); status('Agent deleted'); }
        catch (error) { remove.disabled = false; status(error.message); }
      });
      controls.append(remove);
    }
    return controls;
  }
  function openCreate() {
    status('');
    const form = document.querySelector('#agent-new-form'); form.replaceChildren(); form.hidden = false;
    const templateLabel = el('label', '', 'Agent template');
    const select = el('select'); select.name = 'template_id'; select.required = true;
    for (const item of templates) { const option = el('option', '', item.name); option.value = item.id; select.append(option); }
    templateLabel.append(select);
    const preview = el('div', 'agent-template-preview');
    const notebookLabel = el('label', '', 'Notebook');
    const notebook = el('select'); notebook.name = 'notebook_id'; notebook.required = true;
    const empty = el('option', '', 'Choose notebook'); empty.value = ''; notebook.append(empty);
    for (const item of notebooks) { const option = el('option', '', item.name); option.value = item.id; notebook.append(option); }
    notebookLabel.append(notebook);
    const copyLabel = el('label', 'agent-enabled'); const copy = el('input'); copy.type = 'checkbox';
    copyLabel.append(copy, el('span', '', 'Create a copy with separate memory'));
    const name = field('Copy name', '', 'name'); name.hidden = true; name.querySelector('input').disabled = true;
    copy.addEventListener('change', () => { name.hidden = !copy.checked; name.querySelector('input').disabled = !copy.checked; if (copy.checked) name.querySelector('input').focus(); });
    const instructions = field('Instructions for this agent', '', 'instructions', true);
    const actions = el('div', 'agent-form-actions'); const add = el('button', '', 'Add agent'); add.type = 'submit';
    const cancel = el('button', 'agent-quiet', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', () => {form.hidden = true;document.querySelector('#agent-new-toggle').focus();});
    actions.append(add, cancel);
    function update() {
      const template = templates.find(item => item.id === select.value);
      preview.replaceChildren(behaviorCard({behavior:template}));
      const steward = select.value === 'steward'; copyLabel.hidden = steward;
      if (steward) {copy.checked = false; name.hidden = true; name.querySelector('input').disabled = true;}
    }
    select.addEventListener('change', update);
    form.append(templateLabel, preview, notebookLabel, copyLabel, name, instructions, actions);
    if (!notebooks.length) { add.disabled = true; form.append(el('p', 'agent-empty', 'Create a notebook in the Library first.')); }
    update(); select.focus();
  }
  document.querySelector('#agent-new-toggle').addEventListener('click', openCreate);
  document.querySelector('#agent-new-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      const created = await request('/agents', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      form.hidden = true; managementSelection={agentId:created.id,bookId:form.elements.notebook_id.value};await show('settings'); history.replaceState({}, '', '/chat/settings');
      status(created.name + ' added');
    } catch (error) { status(error.message); }
    finally { button.disabled = false; }
  });
  window.StellisAgentChat = {show, artifactCard, suggestionCard, messageBody};
})();
