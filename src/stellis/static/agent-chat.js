(() => {
  const base = '/api/v1';
  let agents = [];
  let notebooks = [];
  let selectedId = null;
  let runtimeConfigured = false;
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
    button.append(el('strong', '', agent.name), el('small', '', agent.role));
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
      item.append(el('strong', '', message.role === 'user' ? 'You' : agent.name), messageBody(message.content));
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
    const [memory, thread, drafts] = await Promise.all([memorySection(agent), threadSection(agent), draftSection(agent)]);
    if (selectedId !== agent.id) return;
    target.replaceChildren(head, identity, notebookSection(agent), memory, thread, drafts);
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
