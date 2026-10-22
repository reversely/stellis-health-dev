/**
 * @fileoverview First-run setup as four steps in order: a welcome, an intake
 * call about the person's health (onboarding-call.js), adding records, and
 * reviewing the notebooks proposed from the call and the records, each with
 * its goal. Nothing is filed until the person finishes the review.
 */
(() => {
  const main = document.querySelector('#setup-main');
  const error = document.querySelector('#setup-error');
  /** Proposed notebooks from records; more would overwhelm a first run. */
  const MAX_NOTEBOOKS = 5;
  let state;
  let taskChoices = {};
  let saves = Promise.resolve();
  /** The call step, while it is on screen. */
  let callStep = null;
  /** Records added during this setup, newest last. */
  const added = [];

  const node = (tag, text, cls) => {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  };
  const icon = (name) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svg.namespaceURI, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
  };
  const avatar = (name, coordinator = false, size = 40) =>
      window.StellisAgentAvatar.avatarElement(
          document, {seed: name, coordinator, size});
  const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

  async function api(path, method = 'GET', body) {
    const response = await fetch('/api/v1' + path, {
      method,
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) {
      throw Error(
          typeof data.detail === 'string' ?
              data.detail :
              'Setup could not finish. Try again.');
    }
    return data;
  }

  function button(text, action, cls = 'quiet') {
    const result = node('button', text, cls);
    result.type = 'button';
    result.addEventListener('click', async () => {
      result.disabled = true;
      error.textContent = '';
      try {
        await action();
      } catch (e) {
        error.textContent = e.message;
        error.scrollIntoView({block: 'nearest'});
      } finally {
        if (result.isConnected) result.disabled = false;
      }
    });
    return result;
  }

  function save(step) {
    const payload = {
      uses: [],
      step,
      task_choices: structuredClone(taskChoices),
    };
    saves = saves.catch(() => {}).then(async () => {
      state = await api('/onboarding', 'PUT', payload);
    });
    return saves;
  }

  /** Saves the step and shows it. */
  async function go(step) {
    await save(step);
    render();
  }

  function render(focus = true) {
    callStep?.leave();
    callStep = null;
    error.textContent = '';
    main.replaceChildren();
    const review = state.step === 'review';
    document.body.classList.toggle('onboarding-review', review);
    document.querySelector('#setup-rail').hidden = !review;
    const scene = node('section', null, 'setup-scene');
    main.append(scene);
    if (state.step === 'welcome') {
      welcome(scene);
    } else if (state.step === 'call') {
      callStep = window.StellisOnboardingCall.render(scene, {
        api,
        node,
        icon,
        avatar,
        button,
        error: (text) => {
          error.textContent = text;
        },
        next: () => go('records'),
        back: () => go('welcome'),
      });
    } else if (review) {
      reviewScreen(scene);
    } else {
      recordsScreen(scene);
    }
    if (focus) {
      main.focus();
      window.scrollTo(0, 0);
    }
  }

  /** Step 1: what the product does and who works in it. */
  function welcome(scene) {
    scene.classList.add('setup-welcome');
    const copy = node('div', null, 'welcome-copy');
    copy.append(
        node('span', null, 'brand-mark'),
        node('h1', 'Welcome to Stellis Health'),
        node(
            'strong',
            'Stellis Health keeps your records and appointments in one place.'),
        node(
            'p',
            'Stellis answers health questions from your records and helps ' +
                'with the goals you set. Start with a short call with ' +
                'Stellis about your health.'),
        node(
            'p',
            state.runtime.local_inference ?
                'AI responses run on your connected computer.' :
                'Agents run on Nebius Cloud with Token Factory inference.',
            'setup-hint'),
        button('Get started', () => go('call'), 'primary'));
    scene.append(copy);
    // What Stellis helps with, around the three goals.
    const orbit = [
      ['Records', 'file-text'],
      ['Appointments', 'calendar'],
      ['Notes', 'notes'],
      ['Questions', 'message-2'],
      ['Research', 'search'],
      ['Goals', 'target'],
      ['Check-ins', 'circle-check'],
      ['Trends', 'activity'],
      ['Reminders', 'clock'],
      ['Notebooks', 'notebook'],
    ];
    const perSide = Math.ceil(orbit.length / 2);
    orbit.forEach(([name, glyph], index) => {
      const item = node('div', null, 'setup-orbit');
      item.style.setProperty('--orbit-index', index % perSide);
      item.dataset.side = index < perSide ? 'left' : 'right';
      item.append(icon(glyph), node('span', name));
      scene.append(item);
    });
  }

  /** Step 2: the person drops their files; each upload is listed. */
  function recordsScreen(scene) {
    scene.append(
        node('h1', 'Add your records'),
        node(
            'p',
            'Letters, lab results, scans and recordings all work, and ' +
                'Stellis files them with the notebooks from your call.',
            'setup-hint'));
    const drop = node('div', null, 'setup-drop');
    drop.tabIndex = 0;
    drop.setAttribute('role', 'button');
    drop.append(
        icon('upload'), node('strong', 'Drop your health files here'),
        node('span', 'PDF, PNG, JPEG or MP3'));
    const picker = node('input');
    picker.type = 'file';
    picker.multiple = true;
    picker.accept = window.StellisRecordUpload.ACCEPT;
    picker.hidden = true;
    const list = node('ul', null, 'setup-uploads');
    list.setAttribute('aria-live', 'polite');
    const paintList = () => list.replaceChildren(
        ...added.map((item) => node('li', `${item.name}: ${item.status}`)));
    paintList();
    const next = button('Continue', () => go('review'), 'primary');
    next.disabled = !added.some((item) => item.ok);
    async function upload(files) {
      for (const file of files) {
        const item = {name: file.name, status: 'uploading', ok: false};
        added.push(item);
        paintList();
        const result = await window.StellisRecordUpload.uploadFile(file, null);
        item.ok = result.outcome === 'added' || result.outcome === 'duplicate';
        item.status = result.message;
        paintList();
      }
      next.disabled = !added.some((item) => item.ok);
    }
    drop.addEventListener('click', () => picker.click());
    drop.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        picker.click();
      }
    });
    picker.addEventListener('change', () => upload([...picker.files]));
    drop.addEventListener('dragover', (event) => {
      event.preventDefault();
      drop.classList.add('is-over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('is-over');
      upload([...event.dataTransfer.files]);
    });
    scene.append(drop, picker, list);
    if (!state.managed) scene.append(connections(), runtimePanel());
    const actions = node('div', null, 'setup-actions');
    actions.append(
        next, button('Add later', () => go('review')),
        button('Back', () => go('call')));
    scene.append(actions);
  }

  function runtimePanel() {
    const panel = node('section', null, 'setup-runtime');
    panel.append(
        node('h2', state.runtime.local_inference ? 'Local AI' : 'Cloud AI'),
        node(
            'p',
            state.runtime.local_inference ?
                'AI responses run on your connected computer without a ' +
                    'cloud AI service' :
                'Connect your cloud agent deployment and Token Factory key'));
    const result = node(
        'p', state.ready ? 'AI is ready' : 'Test that Stellis can respond',
        'setup-hint');
    result.role = 'status';
    panel.append(result, button('Check setup', async () => {
                   result.textContent = 'Checking AI responses';
                   try {
                     const checked = await api('/onboarding/check', 'POST');
                     state.ready = checked.ready;
                     result.textContent = 'AI is ready';
                   } catch (e) {
                     result.textContent = e.message;
                     throw e;
                   }
                 }));
    return panel;
  }

  function keyRow(label, kind, description) {
    const row = node('div', null, 'setup-connection');
    const heading = node('div');
    heading.append(node('h3', label), node('p', description));
    const form = node('form');
    const input = node('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.maxLength = 512;
    input.required = true;
    input.placeholder = kind === 'tavily' ? 'tvly-…' : 'API key';
    input.setAttribute('aria-label', label + ' API key');
    const submit = node('button', 'Save');
    submit.type = 'submit';
    form.append(input, submit);
    const status = node('p', '', 'connection-status');
    status.role = 'status';
    row.append(heading, form, status);
    api('/settings/' + kind + '-key')
        .then((data) => {
          status.textContent = data.configured ? 'Connected' : '';
        })
        .catch((e) => {
          status.textContent = e.message;
        });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      status.textContent = 'Saving';
      try {
        const data =
            await api('/settings/' + kind + '-key', 'PUT', {key: input.value});
        input.value = '';
        status.textContent = data.message || 'Connected';
      } catch (e) {
        status.textContent = e.message;
      } finally {
        submit.disabled = false;
      }
    });
    return row;
  }

  /** Keys a self-hosted deployment needs before Stellis can respond. */
  function connections() {
    const panel = node('section', null, 'setup-connections');
    panel.setAttribute('aria-label', 'Connections');
    panel.append(keyRow('Tavily', 'tavily', 'For deep research'));
    if (!state.runtime.local_inference) {
      panel.append(
          keyRow('Nebius Token Factory', 'nebius', 'For cloud inference'));
    }
    return panel;
  }

  function taskChoice(key) {
    const label = node('label', null, 'setup-task-choice');
    const input = node('input');
    input.type = 'checkbox';
    input.checked = taskChoices[key] ?? true;
    taskChoices[key] = input.checked;
    input.setAttribute('aria-label', 'Suggest tasks');
    const text = node('span', 'Suggest tasks');
    text.append(
        node('small', 'You approve each suggestion before it is added'));
    label.append(input, text);
    input.addEventListener('change', () => {
      taskChoices[key] = input.checked;
    });
    return label;
  }

  /**
   * One proposed notebook: whether to include it, its name, goal, records
   * and whether it suggests check-ins.
   * @param {!Object} group A group from POST /intake/notebooks.
   * @param {number} index
   * @param {function()} onChange
   * @return {{card: !Element, read: function(): ?Object}} read returns the
   *     reviewed group, or null when the person left it out.
   */
  function notebookCard(group, index, onChange) {
    const key = 'records-' + index;
    const card = node('article', null, 'setup-book setup-record-book');
    const include = node('input');
    include.type = 'checkbox';
    include.checked = true;
    include.setAttribute('aria-label', 'Include this notebook');
    const name = node('input', null, 'setup-book-input');
    name.value = group.notebook_name;
    name.maxLength = 80;
    name.setAttribute('aria-label', 'Notebook name');
    const choose = node('div', null, 'setup-group-choice');
    choose.append(include, name);
    const head = node('div', null, 'setup-book-name');
    head.append(choose);
    if (group.reason) head.append(node('p', group.reason, 'setup-hint'));
    const goalLabel = node('label', null, 'setup-goal');
    goalLabel.append(icon('target'), node('span', 'Goal'));
    const goal = node('input', null, 'setup-goal-input');
    goal.value = group.goal || '';
    goal.maxLength = 200;
    goal.placeholder = 'No goal yet';
    goalLabel.append(goal);
    card.append(head, goalLabel);
    if (group.items.length) {
      const records = node('details');
      records.append(node('summary', plural(group.items.length, 'record')));
      const list = node('ul', null, 'setup-source-list');
      for (const item of group.items) list.append(node('li', item.title));
      records.append(list);
      card.append(records);
    }
    card.append(taskChoice(key));
    include.addEventListener('change', () => {
      card.classList.toggle('is-left-out', !include.checked);
      onChange();
    });
    name.addEventListener('input', onChange);
    const read = () => {
      if (!include.checked || !name.value.trim()) return null;
      const renamed = name.value.trim() !== group.notebook_name;
      return {
        notebook_name: name.value.trim(),
        notebook_id: renamed ? null : group.notebook_id,
        items: group.items.map((item) => ({kind: item.kind, id: item.id})),
        agents: [],
        suggest_tasks: taskChoices[key],
        goal: goal.value.trim(),
      };
    };
    return {card, read};
  }

  /** Step 4: notebooks proposed from the call and the records. */
  function reviewScreen(scene) {
    const title = node('h1', 'Review your notebooks');
    const subtitle = node('p', 'Reading your notes and records', 'setup-hint');
    subtitle.role = 'status';
    const head = node('div', null, 'setup-review-head');
    head.append(title, subtitle);
    const grid = node('div', null, 'setup-grid setup-plan');
    const tree = document.querySelector('#setup-tree');
    let cards = [];
    const reviewed = () => cards.map((entry) => entry.read()).filter(Boolean);
    const finish = button('Open workspace', async () => {
      await saves;
      await save('review');
      await api('/onboarding/complete', 'POST', {record_groups: reviewed()});
      location.assign(state.editing ? '/' : '/?guide=workspace');
    }, 'primary');
    finish.disabled = true;
    const paint = () => {
      const groups = reviewed();
      title.textContent =
          groups.length ? 'Review your notebooks' : 'No notebooks yet';
      finish.textContent = groups.length ?
          `Set up ${plural(groups.length, 'notebook')}` :
          'Open workspace';
      tree.replaceChildren();
      if (groups.length) {
        const branch = node('div', null, 'setup-tree-group');
        branch.append(node('strong', 'Health'));
        for (const group of groups) {
          branch.append(node('div', group.notebook_name));
        }
        tree.append(branch);
      }
    };
    const actions = node('div', null, 'setup-actions');
    actions.append(finish, button('Back', () => go('records')));
    scene.append(head, grid, actions);
    api('/intake/notebooks', 'POST')
        .then((result) => {
          const groups = result.groups.slice(0, MAX_NOTEBOOKS);
          cards =
              groups.map((group, index) => notebookCard(group, index, paint));
          grid.replaceChildren(...cards.map((entry) => entry.card));
          subtitle.textContent = groups.length ?
              'Check each goal before anything is filed' :
              'Stellis sorts records you add later from Records';
        })
        .catch((e) => {
          subtitle.textContent = e.message;
        })
        .finally(() => {
          finish.disabled = false;
          paint();
        });
  }

  document.querySelector('#setup-theme').addEventListener('click', () => {
    const root = document.documentElement;
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    // Colours change at once; transitions return two frames later.
    root.classList.add('theme-swapping');
    root.dataset.theme = theme;
    requestAnimationFrame(
        () => requestAnimationFrame(
            () => root.classList.remove('theme-swapping')));
    try {
      localStorage.setItem('stellis-theme', theme);
    } catch {
      // Without storage the theme lasts for this page only.
    }
  });

  (async () => {
    try {
      state = await api('/onboarding');
      taskChoices = state.task_choices || {};
      if (!state.required) {
        location.replace('/');
        return;
      }
      // Setups saved by the earlier flow resume at the call.
      if (state.step === 'uses') state.step = 'call';
      render(false);
    } catch (e) {
      error.textContent = e.message;
      main.replaceChildren(
          node('h1', 'Setup could not load'),
          button('Try again', async () => location.reload(), 'primary'));
    }
  })();
})();
