(() => {
  const main = document.querySelector('#setup-main');
  const error = document.querySelector('#setup-error');
  let state, templates = [], selected = new Set(), choices = {}, taskChoices = {};
  let saves = Promise.resolve();
  const outcome = new URLSearchParams(location.search);
  const connectionMessage = outcome.get('calendar') === 'connected' ? 'Mail and calendar connected' : outcome.has('calendar') ? (outcome.get('connection_error') || 'Connection expired. Connect again to continue setup.') : '';
  if (outcome.has('calendar')) history.replaceState(history.state, '', location.pathname);
  const node = (tag, text, cls) => {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  };
  const icon = name => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svg.namespaceURI, 'use');
    use.setAttribute('href', '#i-' + name); svg.append(use); return svg;
  };
  const avatar = (name, coordinator = false, size = 40) => window.StellisAgentAvatar.avatarElement(document, {seed:name, coordinator, size});
  async function api(path, method = 'GET', body) {
    const response = await fetch('/api/v1' + path, {method, headers:body ? {'Content-Type':'application/json'} : {}, body:body ? JSON.stringify(body) : undefined});
    const data = await response.json();
    if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : 'Could not complete setup. Try again.');
    return data;
  }
  function button(text, action, primary = false) {
    const result = node('button', text, primary ? 'primary' : 'quiet'); result.type = 'button';
    result.addEventListener('click', async () => {
      result.disabled = true; error.textContent = '';
      try { await action(); } catch (e) { error.textContent = e.message; error.scrollIntoView({block:'nearest'}); }
      finally { if (result.isConnected) result.disabled = false; }
    }); return result;
  }
  function save(step) {
    const payload = {uses:[...selected], step, agent_choices:structuredClone(choices), task_choices:structuredClone(taskChoices)};
    const result = saves.catch(() => {}).then(async () => { state = await api('/onboarding', 'PUT', payload); });
    saves = result;
    return saves;
  }
  function render(focus = true) {
    window.StellisOnboardingSources?.stop(); error.textContent = ''; main.replaceChildren();
    const review = state.step === 'review';
    document.body.classList.toggle('onboarding-review', review);
    document.querySelector('#setup-rail').hidden = !review;
    const scene = node('section', null, 'setup-scene'); main.append(scene);
    if (state.step === 'welcome') welcome(scene); else if (review) reviewScreen(scene); else usesScreen(scene);
    if (connectionMessage) error.textContent = connectionMessage;
    if (focus) { main.focus(); window.scrollTo(0, 0); }
  }
  function welcome(scene) {
    scene.classList.add('setup-welcome');
    const copy = node('div', null, 'welcome-copy');
    copy.append(node('span', null, 'brand-mark'), node('h1', 'Welcome to Stellis'), node('strong', 'Stellis is a private AI team for your entire life.'));
    copy.append(node('p', 'Bring what you do, see and say into one workspace. Organize your knowledge into collections, and give each part of your life persistent AI agents.'));
    copy.append(node('p', 'Research, write, coordinate and learn with agents that work from your notebooks. Review their work before it changes your plans or leaves your workspace.'));
    copy.append(node('p', state.runtime.local_inference ? 'AI responses run on your connected computer.' : 'Agents run on Nebius Cloud with Token Factory inference.', 'setup-hint'));
    copy.append(button('Get started', async () => { await save('uses'); render(); }, true)); scene.append(copy);
    const orbit = [['Meetings','microphone'],['Chief of Staff',null],['Deep research',null],['Writing',null],['Home','folder'],['Collections','folder-plus'],['Calendar','calendar'],['Slide Deck Designer',null],['Work','folder'],['Tutor',null],['Learning','notebook'],['Schedule',null],['Family','users'],['Private','key']];
    const perSide = Math.ceil(orbit.length / 2);
    orbit.forEach(([name, glyph], index) => {
      const item = node('div', null, 'setup-orbit'); item.style.setProperty('--orbit-index', index % perSide); item.dataset.side = index < perSide ? 'left' : 'right';
      item.append(glyph ? icon(glyph) : avatar(name, name === 'Chief of Staff', 36), node('span', name)); scene.append(item);
    });
  }
  function runtimePanel() {
    const panel = node('section', null, 'setup-runtime');
    panel.append(node('h2', state.runtime.local_inference ? 'Local AI' : 'Cloud AI'));
    panel.append(node('p', state.runtime.local_inference ? 'AI responses run on your connected computer, without a cloud AI service.' : 'Connect your cloud agent deployment and Token Factory key.'));
    const result = node('p', state.ready ? 'AI is ready.' : 'Test that your AI team can respond.', 'setup-hint'); result.role = 'status';
    panel.append(result, button('Check setup', async () => {
      result.textContent = 'Checking AI responses…';
      try { const checked = await api('/onboarding/check', 'POST'); state.ready = checked.ready; result.textContent = 'AI is ready.'; }
      catch (e) { result.textContent = e.message; throw e; }
    }));
    const details = node('details', null, 'setup-runtime-details'); details.append(node('summary', 'Models and speech'));
    details.append(node('p', `AI model: ${state.runtime.agent_model}`, 'setup-hint'));
    const speech = state.runtime.speech || {};
    details.append(node('p', `Live speech: ${speech.live_installed ? 'Installed' : 'Not configured'}. Saved speech: ${speech.transcribe && speech.diarize ? 'Installed' : 'Not configured'}.`, 'setup-hint'));
    panel.append(details); return panel;
  }
  function keyRow(label, kind, description) {
    const row = node('div', null, 'setup-connection'), heading = node('div');
    heading.append(node('h3', label), node('p', description));
    const form = node('form'), input = node('input'); input.type = 'password'; input.autocomplete = 'off'; input.maxLength = 512; input.required = true; input.placeholder = kind === 'tavily' ? 'tvly-…' : 'API key'; input.setAttribute('aria-label', label + ' API key');
    const submit = node('button', 'Save'); submit.type = 'submit'; form.append(input, submit);
    const status = node('p', '', 'connection-status'); status.role = 'status'; row.append(heading, form, status);
    api('/settings/' + kind + '-key').then(data => { status.textContent = data.configured ? 'Connected' : ''; }).catch(e => status.textContent = e.message);
    form.addEventListener('submit', async e => { e.preventDefault(); submit.disabled = true; status.textContent = 'Saving…'; try { const data = await api('/settings/' + kind + '-key', 'PUT', {key:input.value}); input.value = ''; status.textContent = data.message || 'Connected'; } catch (e) { status.textContent = e.message; } finally { submit.disabled = false; } });
    return row;
  }
  function connections() {
    const panel = node('section', null, 'setup-connections'); panel.setAttribute('aria-label', 'Connections');
    const row = node('div', null, 'setup-connection'), heading = node('div'); heading.append(node('h3', 'Google'), node('p', 'Calendar'));
    const status = node('p', '', 'connection-status'); status.role = 'status';
    const connect = button('Connect', async () => { await save('uses'); const data = await api('/calendar/google/authorize?return_to=/onboarding'); location.assign(data.url); }, true);
    row.append(heading, connect, status); panel.append(row);
    api('/calendar/connections').then(data => { const google = data.find(c => c.provider === 'google'); status.textContent = google?.connected ? 'Calendar connected' : ''; if (google?.connected) connect.textContent = 'Reconnect'; }).catch(e => status.textContent = e.message);
    if (state.managed) return panel;
    panel.append(keyRow('Tavily', 'tavily', 'For deep research'));
    if (!state.runtime.local_inference) panel.append(keyRow('Nebius Token Factory', 'nebius', 'For cloud inference'));
    return panel;
  }
  function usesScreen(scene) {
    scene.append(node('h1', 'What will you use Stellis for?'));
    const columns = node('div', null, 'setup-columns'), left = node('div'), right = node('div'), tiles = node('div', null, 'setup-uses');
    tiles.setAttribute('role', 'group'); tiles.setAttribute('aria-label', 'Uses');
    const guide = node('div', null, 'setup-guide'), explanation = node('div', null, 'setup-guide-bubble');
    const identity = node('div', null, 'setup-guide-identity'); identity.append(avatar('Chief of Staff', true, 64), node('span', 'Chief of Staff'));
    const tips = {meetings:'I record your meetings and turn them into notes and to-dos.', learning:'A Tutor helps you learn a topic or skill you choose.', projects:'Keep a project’s notes and sources together, with agents to help.', home:'Keep your home projects and their information together.', family:'Keep shared information and plans together.', research:'Research a question on the web and bring back sources.', slides:'Turn a notebook into a first slide deck.'};
    function explain(item) { explanation.replaceChildren(node('h3', item.name), node('p', tips[item.id] || item.description)); }
    explain(state.catalog.find(item => selected.has(item.id)) || state.catalog[0]); guide.append(identity, explanation);
    for (const item of state.catalog) {
      const tile = node('button'); tile.type = 'button'; tile.setAttribute('aria-label', item.name); tile.setAttribute('aria-pressed', String(selected.has(item.id))); tile.append(icon(item.icon), node('span', item.name));
      tile.addEventListener('click', () => { if (selected.has(item.id)) selected.delete(item.id); else selected.add(item.id); tile.setAttribute('aria-pressed', String(selected.has(item.id))); explain(item); save('uses').catch(e => error.textContent = e.message); }); tiles.append(tile);
    }
    left.append(tiles, connections()); if (!state.managed) left.append(runtimePanel()); right.append(guide); columns.append(left, right); scene.append(columns);
    const actions = node('div', null, 'setup-actions'); actions.append(button('Continue', async () => { await save('review'); render(); }, true), button('Skip any of this', async () => { selected.clear(); await save('review'); render(); })); scene.append(actions);
  }
  function teamChoice(key, defaults) {
    const team = node('div', null, 'setup-agents'); team.setAttribute('role', 'group'); team.setAttribute('aria-label', 'Agents for ' + key);
    const checked = new Set(choices[key] ?? defaults);
    const more = node('details', null, 'setup-more-agents'); more.append(node('summary', 'More agents'));
    for (const template of templates) {
      const label = node('label', null, 'setup-agent'), input = node('input'); input.type = 'checkbox'; input.checked = checked.has(template.id); input.setAttribute('aria-label', template.name);
      const text = node('span', template.name); text.append(node('small', template.does));
      label.append(input, avatar(template.id, template.id === 'steward', 24), text); label.classList.toggle('selected', input.checked);
      input.addEventListener('change', async () => {
        const before = choices[key]; if (input.checked) checked.add(template.id); else checked.delete(template.id);
        choices[key] = [...checked]; label.classList.toggle('selected', input.checked); input.disabled = true;
        try { await save('review'); } catch (e) { choices[key] = before; input.checked = !input.checked; label.classList.toggle('selected', input.checked); if (input.checked) checked.add(template.id); else checked.delete(template.id); error.textContent = e.message; } finally { input.disabled = false; }
      });
      if (defaults.includes(template.id) || checked.has(template.id) || template.id === 'writing') team.append(label); else more.append(label);
    }
    if (more.childElementCount > 1) team.append(more);
    return team;
  }
  function taskChoice(key,name,collection) {
    const label=node('label',null,'setup-task-choice'),input=node('input');input.type='checkbox';
    input.checked=taskChoices[key] ?? state.task_defaults?.[name.toLowerCase()] ?? state.collection_task_defaults?.[collection.toLowerCase()] ?? false;
    input.setAttribute('aria-label','Suggest tasks for '+name);
    const text=node('span','Suggest tasks');text.append(node('small','Review each suggestion before adding it.'));
    label.append(input,text);
    input.addEventListener('change',async()=>{
      const before=taskChoices[key];taskChoices[key]=input.checked;input.disabled=true;
      try{await save('review');}catch(e){if(before===undefined)delete taskChoices[key];else taskChoices[key]=before;input.checked=!input.checked;error.textContent=e.message;}
      finally{input.disabled=false;}
    });
    return label;
  }
  function reviewScreen(scene) {
    const title = node('h1', 'Review your notebooks'), subtitle = node('p', 'Choose the agents you want in each notebook. Nothing is filed until you finish.', 'setup-hint');
    const head = node('div', null, 'setup-review-head'); head.append(title, subtitle); scene.append(head);
    const tree = document.querySelector('#setup-tree'); tree.replaceChildren();
    const grid = node('div', null, 'setup-grid setup-plan');
    for (const [name, items] of Map.groupBy(state.proposals, p => p.collection)) {
      const card = node('section', null, 'setup-group'), heading = node('h2'); heading.append(icon('folder'), document.createTextNode(name)); card.append(heading);
      const branch = node('div', null, 'setup-tree-group'); branch.append(node('strong', name));
      for (const item of items) {
        branch.append(node('div', item.notebook)); const book = node('div', null, 'setup-book');
        const name = node('div', null, 'setup-book-name'); name.append(node('h3', item.notebook), node('p', 'Starter notebook', 'setup-hint'));
        book.append(name, teamChoice(item.id, item.agents),taskChoice(item.id,item.notebook,item.collection)); card.append(book);
      }
      grid.append(card); tree.append(branch);
    }
    let importChoice = {proposal_id:null, group_ids:[], groups:[], busy:false};
    const importedTree = node('div'); tree.append(importedTree);
    const importedGrid = node('div', null, 'setup-grid setup-plan');
    const actions = node('div', null, 'setup-actions');
    const finish = button('Set up workspace', async () => {
      await saves; await save('review');
      await api('/onboarding/complete', 'POST', {proposal_id:importChoice.proposal_id, group_ids:importChoice.group_ids});
      location.assign(state.editing ? '/' : '/?guide=workspace');
    }, true);
    const sourceReview = window.StellisOnboardingSources.create(api, state.scan, value => {
      importChoice = value; finish.disabled = value.busy;
      const count = new Set([...state.proposals.map(p => p.notebook.toLowerCase()), ...value.groups.map(g => g.name.toLowerCase())]).size;
      title.textContent = count ? `${count} notebook${count===1?'':'s'}, ready to set up` : 'Start with your Chief of Staff';
      finish.textContent = count ? `Set up ${count} notebook${count===1?'':'s'}` : 'Open workspace';
      subtitle.textContent = value.groups.length ? 'From your calendar events. Review the sources and choose each notebook’s agents.' : 'Based on your choices. Choose the agents you want in each notebook.';
      importedTree.replaceChildren();
      for (const group of value.groups) { const branch = node('div', null, 'setup-tree-group'); branch.append(node('strong', group.collection), node('div', `${group.name} (${group.source_ids.length})`)); importedTree.append(branch); }
    }, {groupTarget:importedGrid, teamChoice, taskChoice});
    scene.append(sourceReview, importedGrid, grid);
    if (!state.proposals.length) scene.append(node('p', 'Connect sources to propose notebooks, or open an empty workspace.', 'setup-hint'));
    actions.append(finish, node('span', 'Drafts only', 'setup-hint'), button('Back', async () => { await save('uses'); render(); })); scene.append(actions);
  }
  document.querySelector('#setup-theme').addEventListener('click', () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; try { localStorage.setItem('stellis-theme', theme); } catch {} });
  (async () => {
    try {
      const [setup, account, catalog] = await Promise.all([api('/onboarding'), api('/auth/status'), api('/agents/templates')]);
      state = setup; templates = catalog; selected = new Set(state.uses); choices = state.agent_choices || {}; taskChoices = state.task_choices || {};
      if (!state.required) { location.replace('/'); return; } render(false);
    } catch (e) { error.textContent = e.message; main.replaceChildren(node('h1', 'Setup could not load'), button('Try again', () => location.reload())); }
  })();
})();
