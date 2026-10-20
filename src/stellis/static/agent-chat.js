(() => {
  const base = '/api/v1';
  let agents = [];
  let notebooks = [];
  let selectedId = null;
  let runtimeConfigured = false;
  let delegationTimer = null;
  let activeCall = null;
  let callTimer = null;
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
  }
  async function reloadAgent() {
    const agent = await request(`/agents/${encodeURIComponent(selectedId)}`);
    agents = agents.map(item => item.id === agent.id ? agent : item);
    renderList();
    await renderDetail(agent);
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
          status('Notebook assignment saved'); await reloadAgent();
        } catch (error) { input.checked = !input.checked; status(error.message); }
      });
      steward.addEventListener('click', async () => {
        try {
          await request(`/agents/${encodeURIComponent(agent.id)}/notebooks/${encodeURIComponent(notebook.id)}`,
            {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({steward:true})});
          status('Steward saved'); await reloadAgent();
        } catch (error) { status(error.message); }
      });
      row.append(label, steward); section.append(row);
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
      const label = el('label', '', memory.kind === 'email_convention' ? 'Email convention' : 'Memory');
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
          status('Memory deleted'); await reloadAgent();
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
        status('Memory added'); await reloadAgent();
      } catch (error) { status(error.message); button.disabled = false; }
    });
    section.append(add);
    return section;
  }
  async function threadSection(agent) {
    const section = el('section', 'agent-detail-section agent-thread');
    section.append(el('h3', '', 'Thread'));
    const [messages, jobs] = await Promise.all([
      request(`/agents/${encodeURIComponent(agent.id)}/messages`),
      request(`/agents/${encodeURIComponent(agent.id)}/jobs`),
    ]);
    const jobsById = new Map(jobs.map(job => [job.id, job]));
    if (!messages.length) section.append(el('p', 'agent-empty', 'No messages yet'));
    for (const message of messages) {
      const item = el('article', `agent-message agent-message-${message.role}`);
      const author = el('strong', 'agent-message-author', message.role === 'user' ? 'You' : message.role === 'system' ? 'Task update' : agent.name);
      if (message.role === 'agent') author.prepend(agentAvatar(agent, 24));
      item.append(author, messageBody(message.content));
      if (message.notebook_id) {
        const book = notebooks.find(entry => entry.id === message.notebook_id);
        if (book) item.append(el('small', '', book.name));
      }
      if (message.role === 'user' && message.job_id) {
        const job = jobsById.get(message.job_id);
        if (job?.state === 'running') item.append(el('small', 'agent-job-state', 'Replying…'));
        if (job?.state === 'failed' || job?.state === 'interrupted') {
          item.append(el('small', 'agent-job-state', job.error || 'Reply failed. Send again.'));
        }
      }
      section.append(item);
    }
    if (!runtimeConfigured) {
      section.append(el('p', 'agent-empty', 'Agent replies are unavailable on this device.'));
      return section;
    }
    const callStatus = await request('/agents/voice/availability');
    const callControls = el('div', 'agent-call-controls');
    const callButton = el('button', '', activeCall?.agentId === agent.id ? 'End call' : 'Call');
    callButton.type = 'button';
    const stopReply = el('button', 'agent-quiet', 'Stop reply');
    stopReply.type = 'button'; stopReply.hidden = activeCall?.agentId !== agent.id;
    if (!callStatus.ready && activeCall?.agentId !== agent.id) {
      callButton.disabled = true;
      callControls.append(el('small', '', callStatus.reason));
    }
    callButton.addEventListener('click', async () => {
      callButton.disabled = true;
      try {
        if (activeCall?.agentId === agent.id) {
          await endCall();
          status('Call saved in Conversations.');
        } else {
          await startCall(agent.id, callStatus.ice_servers);
          status('Call connected');
        }
        await reloadAgent();
      } catch (error) { status(error.message); callButton.disabled = false; }
    });
    stopReply.addEventListener('click', async () => {
      if (!activeCall) return;
      try {
        await request(`/agents/${encodeURIComponent(agent.id)}/call/${encodeURIComponent(activeCall.id)}/stop-reply`, {method:'POST'});
        activeCall.audio.pause();
        const remote = activeCall.audio.srcObject;
        activeCall.audio.srcObject = null;
        activeCall.audio.srcObject = remote;
        activeCall.audio.play().catch(() => {});
        status('Reply stopped. Call continues.');
      } catch (error) { status(error.message); }
    });
    callControls.prepend(callButton, stopReply);
    section.append(callControls);
    const form = el('form', 'agent-ask-form');
    const label = el('label', '', 'Message');
    const input = el('textarea'); input.maxLength = 2000; input.required = true;
    label.append(input); form.append(label);
    if (agent.notebooks.length) {
      const bookLabel = el('label', '', 'Notebook');
      const select = el('select'); select.name = 'notebook_id';
      const any = el('option', '', 'No notebook'); any.value = ''; select.append(any);
      for (const book of agent.notebooks) {
        const option = el('option', '', book.notebook_name);
        option.value = book.notebook_id; select.append(option);
      }
      bookLabel.append(select); form.append(bookLabel);
    }
    const send = el('button', '', 'Send'); send.type = 'submit'; form.append(send);
    form.addEventListener('submit', async event => {
      event.preventDefault(); send.disabled = true; status('Replying…');
      try {
        await request(`/agents/${encodeURIComponent(agent.id)}/ask`,
          {method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({question:input.value, notebook_id:form.elements.notebook_id?.value || null})});
        status(''); await reloadAgent();
      } catch (error) { status(error.message); send.disabled = false; }
    });
    section.append(form);
    return section;
  }
  async function beginCallCapture(agentId, stream, remoteStream) {
    const mediaType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      .find(candidate => MediaRecorder.isTypeSupported(candidate));
    if (!mediaType) throw Error('Call recording is unavailable in this browser.');
    const context = new AudioContext();
    const output = context.createMediaStreamDestination();
    context.createMediaStreamSource(stream).connect(output);
    let remoteSource = null;
    const addRemote = remote => {
      if (remote && !remoteSource) {
        remoteSource = context.createMediaStreamSource(remote);
        remoteSource.connect(output);
      }
    };
    addRemote(remoteStream);
    let session;
    try {
      await context.resume();
      const agent = agents.find(item => item.id === agentId);
      session = await request('/recordings', {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title:`Voice call with ${agent?.name || 'agent'}`, media_type:mediaType.split(';')[0]})});
      const recorder = new MediaRecorder(output.stream, {mimeType:mediaType});
      const capture = {context, recorder, session, addRemote, sequence:0, pending:Promise.resolve(), failure:null};
      capture.stopped = new Promise(resolve => recorder.addEventListener('stop', resolve, {once:true}));
      recorder.addEventListener('dataavailable', event => {
        if (!event.data.size) return;
        const sequence = capture.sequence++;
        capture.pending = capture.pending.then(async () => {
          if (capture.failure) return;
          await request(`/recordings/${encodeURIComponent(session.id)}/chunks/${sequence}`,
            {method:'PUT', headers:{'Content-Type':session.media_type}, body:event.data});
        }).catch(error => {
          capture.failure = error;
          if (recorder.state !== 'inactive') recorder.stop();
        });
      });
      recorder.addEventListener('error', event => { capture.failure = event.error || Error('Call recording stopped.'); });
      recorder.start(1000);
      return capture;
    } catch (error) {
      await context.close();
      if (session) await request(`/recordings/${encodeURIComponent(session.id)}`, {method:'DELETE'}).catch(() => {});
      throw error;
    }
  }
  async function finishCallCapture(capture, agentId) {
    if (capture.recorder.state !== 'inactive') capture.recorder.stop();
    try {
      await capture.stopped;
      await capture.pending;
      if (capture.failure) throw capture.failure;
      const saved = await request(`/recordings/${encodeURIComponent(capture.session.id)}/finalize`, {method:'POST'});
      try {
        await request(`/agents/${encodeURIComponent(agentId)}/call-recordings`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({conversation_id:saved.conversation.id}),
        });
      } catch (error) {
        throw Error(`Call saved in Conversations, but its Chat link failed. ${error.message}`);
      }
      return saved.conversation;
    } catch (error) {
      if (error.message.startsWith('Call saved in Conversations')) throw error;
      throw Error(`Call audio could not be saved. Recover it from Home. ${error.message}`);
    } finally {
      await capture.context.close();
    }
  }
  async function startCall(agentId, iceServers) {
    if (activeCall) await endCall();
    status('Connecting call…');
    const stream = await navigator.mediaDevices.getUserMedia({audio:true, video:false});
    const peer = new RTCPeerConnection({iceServers:iceServers || []});
    peer.createDataChannel('chat');
    const audio = new Audio(); audio.autoplay = true;
    let capture = null;
    let remoteStream = null;
    peer.ontrack = event => {
      remoteStream = event.streams[0] || new MediaStream([event.track]);
      audio.srcObject = remoteStream;
      capture?.addRemote(remoteStream);
      audio.play().catch(() => status('Tap Call to hear the reply.'));
    };
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
    let answer = null;
    try {
      await peer.setLocalDescription(await peer.createOffer());
      if (peer.iceGatheringState !== 'complete') {
        await Promise.race([
          new Promise(resolve => peer.addEventListener('icegatheringstatechange', () => {
            if (peer.iceGatheringState === 'complete') resolve();
          })),
          new Promise(resolve => setTimeout(resolve, 5000)),
        ]);
      }
      answer = await request(`/agents/${encodeURIComponent(agentId)}/call`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({sdp:peer.localDescription.sdp, type:'offer'}),
      });
      await peer.setRemoteDescription({sdp:answer.sdp, type:answer.type});
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => finish(Error('Call could not connect. Try again.')), 15000);
        function finish(error) {
          clearTimeout(timeout);
          peer.removeEventListener('connectionstatechange', changed);
          if (error) reject(error); else resolve();
        }
        function changed() {
          if (peer.connectionState === 'connected') finish();
          else if (['failed', 'closed'].includes(peer.connectionState))
            finish(Error('Call could not connect. Try again.'));
        }
        peer.addEventListener('connectionstatechange', changed);
        changed();
      });
      capture = await beginCallCapture(agentId, stream, remoteStream);
      activeCall = {id:answer.pc_id, agentId, peer, stream, audio, capture};
      status('Call connected');
      clearInterval(callTimer);
      callTimer = setInterval(() => {
        const editor = document.querySelector('.agent-thread textarea');
        if (selectedId === agentId && !document.querySelector('#agent-chat-view').hidden &&
            document.activeElement !== editor && !editor?.value)
          reloadAgent().catch(error => status(error.message));
      }, 4000);
      peer.addEventListener('connectionstatechange', () => {
        if (['closed','failed'].includes(peer.connectionState) && activeCall?.peer === peer)
          endCall().then(() => reloadAgent()).catch(error => status(error.message));
      });
    } catch (error) {
      if (capture) {
        if (capture.recorder.state !== 'inactive') capture.recorder.stop();
        await capture.context.close();
      }
      if (answer?.pc_id) {
        await request(`/agents/${encodeURIComponent(agentId)}/call/${encodeURIComponent(answer.pc_id)}`, {method:'DELETE'}).catch(() => {});
      }
      peer.close(); stream.getTracks().forEach(track => track.stop());
      throw error;
    }
  }
  async function endCall() {
    const call = activeCall; if (!call) return;
    activeCall = null; clearInterval(callTimer); callTimer = null;
    if (call.capture.recorder.state !== 'inactive') call.capture.recorder.stop();
    try {
      await request(`/agents/${encodeURIComponent(call.agentId)}/call/${encodeURIComponent(call.id)}`, {method:'DELETE'}).catch(() => {});
    } finally {
      call.audio.pause(); call.audio.srcObject = null;
      call.stream.getTracks().forEach(track => track.stop()); call.peer.close();
    }
    return finishCallCapture(call.capture, call.agentId);
  }
  async function draftSection(agent) {
    const section = el('section', 'agent-detail-section agent-drafts');
    section.append(el('h3', '', 'Email drafts'));
    const style = await request('/mail-style');
    if (!runtimeConfigured) {
      section.append(el('p', 'agent-empty', 'Email drafting is unavailable on this device.'));
      return section;
    }
    if (!style.groups.some(group => !group.excluded && group.example_count)) {
      const note = el('p', 'agent-empty', 'Import sent examples in Settings to create drafts in your style.');
      section.append(note); return section;
    }
    const form = el('form', 'agent-ask-form');
    const recipients = el('input'); recipients.type = 'email'; recipients.required = true;
    const to = el('label', '', 'To'); to.append(recipients);
    const subjectInput = el('input'); subjectInput.required = true; subjectInput.maxLength = 200;
    const subject = el('label', '', 'Subject'); subject.append(subjectInput);
    const briefInput = el('textarea'); briefInput.required = true; briefInput.maxLength = 2000;
    const brief = el('label', '', 'What should the draft say?'); brief.append(briefInput);
    const create = el('button', '', 'Create Gmail draft'); create.type = 'submit';
    const result = el('div', 'mail-style-draft-result');
    form.append(to, subject, brief, create);
    form.addEventListener('submit', async event => {
      event.preventDefault(); create.disabled = true; status('Creating draft…');
      try {
        const draft = await request(`/agents/${encodeURIComponent(agent.id)}/style-draft`,
          {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
            recipients:[recipients.value], subject:subjectInput.value, brief:briefInput.value})});
        const link = el('a', '', 'Open Gmail draft');
        link.href = `https://mail.google.com/mail/u/0/#drafts/${encodeURIComponent(draft.gmail_draft_id)}`;
        link.target = '_blank'; link.rel = 'noopener noreferrer';
        result.replaceChildren(el('p', '', draft.body), link, el('strong', '', 'Examples used'));
        for (const example of draft.examples) {
          const source = el('a', '', `${example.subject || 'Untitled email'} · ${example.group_name}`);
          source.href = example.url; source.target = '_blank'; source.rel = 'noopener noreferrer';
          result.append(source);
        }
        status('Draft created. Review it in Gmail before sending.');
      } catch (error) { status(error.message); }
      finally { create.disabled = false; }
    });
    section.append(form, result);
    const previous = style.drafts.filter(draft => draft.agent_id === agent.id);
    if (previous.length) section.append(el('h4', '', 'Recent drafts'));
    for (const draft of previous) {
      const item = el('div', 'mail-style-previous-draft');
      const link = el('a', '', draft.subject);
      link.href = `https://mail.google.com/mail/u/0/#drafts/${encodeURIComponent(draft.gmail_draft_id)}`;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      item.append(link, el('small', '', draft.recipients.join(', ')), el('span', '', 'Examples used'));
      for (const example of draft.examples) {
        const source = el('a', '', example.subject || 'Untitled email');
        source.href = example.url; source.target = '_blank'; source.rel = 'noopener noreferrer';
        item.append(source);
      }
      section.append(item);
    }
    return section;
  }
  async function delegationSection(agent) {
    const books = agent.notebooks.filter(item => item.is_steward);
    if (!books.length) return el('div');
    const section = el('section', 'agent-detail-section agent-delegation');
    section.append(el('h3', '', 'Delegate research'));
    const specialists = agents.filter(item => item.id !== agent.id && !item.is_default);
    if (!runtimeConfigured || !specialists.length) {
      section.append(el('p', 'agent-empty', 'Add another agent and connect the managed agent runtime to delegate.'));
    }
    const [sampleCase, researchRuntime] = await Promise.all([
      request('/samples/rfi91'), request('/agents/delegations/runtime')]);
    const sampleAvailable = sampleCase.installed &&
      books.some(book => book.notebook_id === sampleCase.projects[0].notebook_id);
    if (!researchRuntime.live_ready) {
      section.append(el('p', 'agent-empty', researchRuntime.key_configured ?
        'The managed agent is unavailable on this device.' : 'Add a Tavily API key in Account settings for live research.'));
    }
    const form = el('form', 'agent-ask-form');
    form.hidden = !runtimeConfigured || !specialists.length ||
      (!researchRuntime.live_ready && !sampleAvailable);
    const choice = (title, values) => {
      const label = el('label', '', title); const select = el('select');
      for (const [value, text] of values) { const option = el('option', '', text); option.value = value; select.append(option); }
      label.append(select); form.append(label); return select;
    };
    const specialist = choice('Specialist', specialists.map(item => [item.id, `${item.name} · ${item.role}`]));
    const notebook = choice('Notebook', books.map(item => [item.notebook_id, item.notebook_name]));
    const input = (title, type, maxLength) => {
      const label = el('label', '', title); const control = el(type); control.required = true;
      control.maxLength = maxLength; label.append(control); form.append(label); return control;
    };
    const question = input('Research question', 'textarea', 1000);
    form.append(el('p', 'settings-note', 'Live research sends your question to Tavily.'));
    const recipient = input('Draft to', 'input', 254); recipient.type = 'email';
    const subject = input('Draft subject', 'input', 200);
    const sampleLabel = el('label', 'agent-inline-check');
    const sample = el('input'); sample.type = 'checkbox';
    if (sampleAvailable) {
      sample.checked = !researchRuntime.live_ready;
      sample.disabled = !researchRuntime.live_ready;
      sampleLabel.append(sample, document.createTextNode('Use RFI 91 sample mailbox')); form.append(sampleLabel);
    }
    const submit = el('button', '', 'Start delegated job'); submit.type = 'submit'; form.append(submit);
    const list = el('div', 'agent-delegation-jobs');
    const refresh = async () => {
      const jobs = await request(`/agents/${encodeURIComponent(agent.id)}/delegations`);
      list.replaceChildren();
      for (const job of jobs) {
        const item = el('article', 'agent-delegation-job');
        const name = agents.find(candidate => candidate.id === job.specialist_id)?.name || 'Specialist';
        item.append(el('strong', '', `${name}: ${job.subject}`), el('small', '', `${job.state} · ${job.stage}`));
        if (job.error) item.append(el('p', '', job.error));
        if (job.tools_used.length) item.append(el('small', '', `Tools: ${job.tools_used.join(', ')}`));
        if (job.research) item.append(el('h4', '', 'Research notes'), messageBody(job.research));
        if (job.draft_body) {
          item.append(el('h4', '', 'Draft'), messageBody(job.draft_body));
          if (job.gmail_draft_id && !job.fixture) {
            const link = el('a', '', 'Open Gmail draft');
            link.href = `https://mail.google.com/mail/u/0/#drafts/${encodeURIComponent(job.gmail_draft_id)}`;
            link.target = '_blank'; link.rel = 'noopener noreferrer'; item.append(link);
          }
        }
        if (job.sources.length) {
          const sources = el('div', 'agent-delegation-sources');
          sources.append(el('span', '', 'Sources'));
          for (const source of job.sources) {
            if ((!source.target.startsWith('/') || source.target.startsWith('//')) &&
                !source.target.startsWith('https://')) continue;
            const link = el('a', '', source.title); link.href = source.target;
            if (source.target.startsWith('https://')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
            sources.append(link);
          }
          item.append(sources);
        }
        if (['queued', 'running'].includes(job.state)) {
          const stop = el('button', 'agent-quiet', 'Stop job'); stop.type = 'button';
          stop.addEventListener('click', async () => {
            try { await request(`/agents/${encodeURIComponent(agent.id)}/delegations/${encodeURIComponent(job.id)}`, {method:'DELETE'}); await refresh(); }
            catch (error) { status(error.message); }
          });
          item.append(stop);
        }
        list.append(item);
      }
      clearTimeout(delegationTimer);
      if (selectedId === agent.id && !document.querySelector('#agent-chat-view').hidden &&
          jobs.some(job => ['queued', 'running'].includes(job.state))) {
        delegationTimer = setTimeout(() => refresh().catch(error => status(error.message)), 2000);
      }
    };
    form.addEventListener('submit', async event => {
      event.preventDefault(); submit.disabled = true;
      try {
        await request(`/agents/${encodeURIComponent(agent.id)}/delegations`, {method:'POST',
          headers:{'Content-Type':'application/json'}, body:JSON.stringify({
            specialist_id:specialist.value, notebook_id:notebook.value, question:question.value,
            recipient:recipient.value, subject:subject.value, fixture:sample.checked})});
        form.reset(); status('Delegated job started'); await refresh();
      } catch (error) { status(error.message); }
      finally { submit.disabled = false; }
    });
    section.append(form, list);
    await refresh();
    return section;
  }
  async function renderDetail(agent) {
    const target = document.querySelector('#agent-detail');
    const head = el('div', 'agent-detail-head');
    head.append(el('h3', '', agent.name), el('p', '', agent.role));
    const identity = el('form', 'agent-identity-form');
    identity.append(field('Name', agent.name, 'name'), field('Role', agent.role, 'role'),
      field('Instructions', agent.instructions, 'instructions'));
    const save = el('button', '', 'Save agent'); save.type = 'submit'; identity.append(save);
    identity.addEventListener('submit', async event => {
      event.preventDefault(); save.disabled = true;
      try {
        const data = Object.fromEntries(new FormData(identity));
        await request(`/agents/${encodeURIComponent(agent.id)}`,
          {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
        status('Agent saved'); await reloadAgent();
      } catch (error) { status(error.message); save.disabled = false; }
    });
    clearTimeout(delegationTimer);
    const [memory, thread, drafts, delegation] = await Promise.all([
      memorySection(agent), threadSection(agent), draftSection(agent), delegationSection(agent)]);
    if (selectedId !== agent.id) return;
    target.replaceChildren(head, identity, notebookSection(agent), memory, thread, drafts, delegation);
  }
  async function select(id, navigate) {
    selectedId = id;
    renderList();
    if (navigate) history.pushState({}, '', `/chat/${encodeURIComponent(id)}`);
    const agent = agents.find(item => item.id === id);
    if (agent) await renderDetail(agent);
  }
  async function show(requestedId) {
    status('');
    const [items, books, runtime] = await Promise.all([request('/agents'), request('/notebooks'), request('/agents/runtime')]);
    agents = items; notebooks = books.notebooks || []; runtimeConfigured = runtime.configured;
    const id = agents.some(agent => agent.id === requestedId) ? requestedId : agents[0]?.id;
    if (id) await select(id, false);
  }
  document.querySelector('#agent-new-toggle').addEventListener('click', () => {
    document.querySelector('#agent-new-form').hidden = false;
    document.querySelector('#agent-new-prompt').focus();
  });
  document.querySelector('#agent-new-cancel').addEventListener('click', () => {
    document.querySelector('#agent-new-form').hidden = true;
  });
  document.querySelector('#agent-new-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const created = await request('/agents', {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt:document.querySelector('#agent-new-prompt').value})});
      form.reset(); form.hidden = true;
      await show(created.id); history.replaceState({}, '', `/chat/${encodeURIComponent(created.id)}`);
      status('Agent created');
    } catch (error) { status(error.message); }
    finally { button.disabled = false; }
  });
  window.StellisAgentChat = {show};
})();
