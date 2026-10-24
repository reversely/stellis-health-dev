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
  const MAX_NOTEBOOKS = 100;
  let state;
  let taskChoices = {};
  let saves = Promise.resolve();
  let reviewLayout = null;
  let reviewSaveTimer = null;
  function scheduleReviewSave() {
    clearTimeout(reviewSaveTimer);
    reviewSaveTimer = setTimeout(() => save('review').catch(e => {error.textContent=e.message;}),300);
  }
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
    clearTimeout(reviewSaveTimer);
    const payload = {
      uses: [],
      step,
      task_choices: structuredClone(taskChoices),
      notebook_choices: reviewLayout ? structuredClone(reviewLayout.groups) : undefined,
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
    } else if ((state.step === 'call' || state.step === 'health')) {
      callStep = window.StellisOnboardingPersonalize.render(scene, {
        api,
        node,
        icon,
        avatar,
        button,
        error: (text) => {
          error.textContent = text;
        },
        next: () => go('review'),
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
                'with the goals you set. Answer a few questions by typing or speaking.'),
        node(
            'p',
            state.runtime.local_inference ?
                'AI responses run on your connected computer.' :
                'AI responses use Nebius Token Factory.',
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
                state.runtime.profile === 'cloud' ?
                    'Connect your NemoClaw gateway and Token Factory key' :
                    'Connect your Token Factory key'));
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

  /** Labels for the kind of subject each notebook covers. */
  const KIND_LABELS = {
    condition: 'Condition',
    treatment: 'Treatment',
    objective: 'Goal',
    symptom: 'Symptom',
    recovery: 'Recovery',
  };
  /** The select value for records left out of every notebook. */
  const NOT_FILED = 'not-filed';

  /**
   * Turns a reply from POST /intake/notebooks into the layout the review
   * screen edits, keeping task choices for notebooks that keep their name.
   * @param {!Object} result
   * @param {?Object} before The layout the reply revises, or null.
   * @return {!Object} {groups, unsorted}
   */
  function layoutFrom(result, before) {
    const tasks = new Map(
        (before?.groups || [])
            .map(
                (group) =>
                    [group.notebook_name.toLowerCase(), group.suggest_tasks]));
    const groups =
        result.groups.slice(0, MAX_NOTEBOOKS)
            .map(
                (group, index) => ({
                  ...group,
                  proposed_name: group.notebook_name,
                  include: true,
                  suggest_tasks: tasks.get(group.notebook_name.toLowerCase()) ??
                      taskChoices['records-' + index] ?? true,
                }));
    return {groups, unsorted: result.unsorted || []};
  }

  /**
   * One record in the layout, with a select that moves it to another
   * notebook or out of every notebook.
   */
  function recordRow(item, here, layout, move) {
    const row = node('li', null, 'setup-layout-record');
    const text = node('span', null, 'setup-layout-record-title');
    text.append(icon('file-text'), node('span', item.title));
    if (item.date) text.append(node('small', item.date));
    const where = node('select', null, 'setup-layout-move');
    where.setAttribute('aria-label', `Notebook for ${item.title}`);
    layout.groups.forEach((group, index) => {
      if (!group.include) return;
      const option = node('option', group.notebook_name || 'New notebook');
      option.value = String(index);
      where.append(option);
    });
    const loose = node('option', 'Not filed');
    loose.value = NOT_FILED;
    where.append(loose);
    where.value = here;
    where.addEventListener('change', () => move(item, here, where.value));
    row.append(text, where);
    return row;
  }

  /**
   * One proposed notebook: whether to include it, its name, kind, goal,
   * records and whether it suggests check-ins.
   */
  function notebookCard(group, index, layout, {move, changed}) {
    const card = node('article', null, 'setup-book setup-record-book');
    card.classList.toggle('is-left-out', !group.include);
    const include = node('input');
    include.type = 'checkbox';
    include.checked = group.include;
    include.setAttribute('aria-label', 'Include this notebook');
    const name = node('input', null, 'setup-book-input');
    name.value = group.notebook_name;
    name.maxLength = 80;
    name.placeholder = 'Name this notebook';
    name.setAttribute('aria-label', 'Notebook name');
    const choose = node('div', null, 'setup-group-choice');
    choose.append(include, name);
    if (KIND_LABELS[group.kind]) {
      choose.append(node('span', KIND_LABELS[group.kind], 'setup-kind'));
    }
    const head = node('div', null, 'setup-book-name');
    head.append(choose);
    const problem = node('p', group.problem || '', 'setup-problem');
    problem.hidden = !group.problem;
    const collectionLabel = node('label', 'Collection');
    const collectionSelect = node('select');
    for (const entry of state.health_catalogue?.collections || []) {
      collectionSelect.add(new Option(entry.display_name, entry.collection_id));
    }
    if (group.collection_id && ![...collectionSelect.options].some(o=>o.value===group.collection_id)) collectionSelect.add(new Option(group.collection_name || 'Current collection',group.collection_id));
    collectionSelect.value = group.collection_id || 'fitness';
    group.collection_id = collectionSelect.value;
    collectionLabel.append(collectionSelect);
    collectionSelect.addEventListener('change', () => {
      group.collection_id = collectionSelect.value;
      group.collection_changed = true;
      group.template_id = null;
      group.named_by_person = true;
      changed(true);
    });
    head.append(problem, collectionLabel);
    if (group.reason) head.append(node('p', group.reason, 'setup-hint'));
    const goalLabel = node('label', null, 'setup-goal');
    goalLabel.append(icon('target'), node('span', 'Goal'));
    const goal = node('input', null, 'setup-goal-input');
    goal.value = group.goal || '';
    goal.maxLength = 200;
    goal.placeholder = 'No goal yet';
    goalLabel.append(goal);
    const records = node('ul', null, 'setup-layout-records');
    for (const item of group.items) {
      records.append(recordRow(item, String(index), layout, move));
    }
    if (!group.items.length) {
      records.append(node('li', 'No records yet', 'setup-layout-empty'));
    }
    const tasks = node('label', null, 'setup-task-choice');
    const tasksInput = node('input');
    tasksInput.type = 'checkbox';
    tasksInput.checked = group.suggest_tasks;
    tasksInput.setAttribute('aria-label', 'Suggest tasks');
    const tasksText = node('span', 'Suggest tasks');
    tasksText.append(
        node('small', 'You approve each suggestion before it is added'));
    tasks.append(tasksInput, tasksText);
    card.append(head, goalLabel, records, tasks);
    include.addEventListener('change', () => {
      group.include = include.checked;
      changed(true);
    });
    name.addEventListener('input', () => {
      group.notebook_name = name.value.trim();
      group.named_by_person = group.notebook_name !== group.proposed_name;
      if (group.named_by_person) group.template_id = null;
      // A name the person chose replaces Stellis's check of the old name.
      problem.hidden = true;
      changed(false);
    });
    goal.addEventListener('input', () => {
      group.goal = goal.value.trim();
      changed(false);
    });
    tasksInput.addEventListener('change', () => {
      group.suggest_tasks = tasksInput.checked;
      changed(false);
    });
    return {card, name};
  }

  /** Records in no notebook, each with a select to file it. */
  function notFiledCard(layout, move) {
    const card = node('article', null, 'setup-book setup-record-book is-loose');
    card.append(node('h2', 'Not filed', 'setup-layout-title'));
    const records = node('ul', null, 'setup-layout-records');
    for (const item of layout.unsorted) {
      records.append(recordRow(item, NOT_FILED, layout, move));
    }
    card.append(records);
    return card;
  }

  /** Shows catalogue recommendations for the person to review and edit. */
  function reviewScreen(scene) {
    const title = node('h1', 'Review your notebooks');
    const subtitle = node('p', 'Reading your notes and records', 'setup-hint');
    subtitle.role = 'status';
    const head = node('div', null, 'setup-review-head');
    head.append(title, subtitle);
    const grid = node('div', null, 'setup-grid setup-plan');
    const tree = document.querySelector('#setup-tree');
    let layout = {groups: [], unsorted: []};
    const reviewed = () =>
        layout.groups.filter((group) => group.include && group.notebook_name);
    const finish = button('Open workspace', async () => {
      await saves;
      await save('review');
      await api('/onboarding/complete', 'POST', {
        record_groups: reviewed().map(
            (group) => ({
              notebook_name: group.notebook_name,
              template_id: group.template_id || null,
              collection_id: group.collection_id,
              collection_changed: Boolean(group.collection_changed),
              description: group.description || "",
              notebook_id: group.notebook_name === group.proposed_name ?
                  group.notebook_id :
                  null,
              items:
                  group.items.map((item) => ({kind: item.kind, id: item.id})),
              suggest_tasks: group.suggest_tasks,
              goal: group.goal || '',
            })),
      });
      location.assign(state.editing ? '/' : '/?tour=1');
    }, 'primary');
    finish.disabled = true;
    const add = button('Add Notebook', async () => {
      await window.StellisHealthCatalogue.open({
        selected:layout.groups.map(g => g.template_id),
        onSelect(selections) {
          for (const selection of selections) layout.groups.push({
            ...selection, notebook_name:selection.name, proposed_name:selection.name,
            kind:'', reason:'', goal:selection.goal || '', items:selection.items || [], include:true,
            named_by_person:!selection.template_id, suggest_tasks:false
          });
          paint();
        }
      });
    });
    add.disabled = true;
    add.prepend(icon('folder-plus'));
    add.classList.add('setup-add-book');
    /** Lists the notebooks and their record counts in the side rail. */
    function paintTree() {
      const groups = reviewed();
      title.textContent =
          groups.length ? 'Review your notebooks' : 'No notebooks yet';
      finish.textContent = groups.length ?
          `Set up ${plural(groups.length, 'notebook')}` :
          'Open workspace';
      tree.replaceChildren();
      if (!groups.length) return;
      const branch = node('div', null, 'setup-tree-group');
      branch.append(node('strong', 'Notebooks'));
      for (const group of groups) {
        const leaf = node('div', null, 'setup-tree-leaf');
        leaf.append(
            icon('folder'), node('span', (state.health_catalogue?.collections.find(c => c.collection_id === group.collection_id)?.display_name || '') + ' / ' + group.notebook_name),
            node('small', String(group.items.length)));
        branch.append(leaf);
      }
      tree.append(branch);
    }

    /** Moves a record from one notebook, or Not filed, to another. */
    function move(item, from, to) {
      const take = (list) => list.splice(
          list.findIndex(
              (other) => other.kind === item.kind && other.id === item.id),
          1);
      take(
          from === NOT_FILED ? layout.unsorted :
                               layout.groups[Number(from)].items);
      (to === NOT_FILED ? layout.unsorted : layout.groups[Number(to)].items)
          .push(item);
      paint();
    }

    function paint() {
      const cards = layout.groups.map(
          (group, index) => notebookCard(group, index, layout, {
            move,
            changed(structural) {
              if (structural) {
                paint();
                return;
              }
              // Record selects name each notebook, so they follow a rename.
              for (const option of grid.querySelectorAll(
                       `option[value="${index}"]`)) {
                option.textContent = group.notebook_name || 'New notebook';
              }
              paintTree();
              reviewLayout = layout; scheduleReviewSave();
            },
          }));
      grid.replaceChildren();
      for (const collection of state.health_catalogue?.collections || []) {
        const indexes = layout.groups.map((g,i) => g.collection_id === collection.collection_id ? i : -1).filter(i => i >= 0);
        if (!indexes.length) continue;
        const section = node('section', null, 'setup-collection');
        section.append(node('h2', collection.display_name));
        for (const index of indexes) section.append(cards[index].card);
        grid.append(section);
      }
      if (layout.unsorted.length) grid.append(notFiledCard(layout, move));
      add.hidden = layout.groups.length >= MAX_NOTEBOOKS;
      paintTree();
      reviewLayout = layout;
      scheduleReviewSave();
    }

    const actions = node('div', null, 'setup-actions');
    actions.append(finish, button('Back', () => go('call')));
    scene.append(head, grid, add, actions);
    api('/intake/notebooks', 'POST')
        .then((result) => {
          layout = layoutFrom(result, null);
          if (state.notebook_choices) layout.groups = state.notebook_choices;
          reviewLayout = layout;
          subtitle.textContent = layout.groups.length ?
              'Check each name, goal and record before anything is filed' :
              'Stellis sorts records you add later from Records';
        })
        .catch((e) => {
          subtitle.textContent = e.message;
        })
        .finally(() => {
          finish.disabled = false;
          add.disabled = false;
          paint();
        });
  }

  const themeButton = document.querySelector('#setup-theme');
  function syncThemeButton() {
    const light = document.documentElement.dataset.theme === 'light';
    const label = `Switch to ${light ? 'dark' : 'light'} mode`;
    themeButton.setAttribute('aria-label', label);
    themeButton.title = label;
  }
  syncThemeButton();
  themeButton.addEventListener('click', () => {
    const root = document.documentElement;
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    // Colours change at once; transitions return two frames later.
    root.classList.add('theme-swapping');
    root.dataset.theme = theme;
    syncThemeButton();
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
