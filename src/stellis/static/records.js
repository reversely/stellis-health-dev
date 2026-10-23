/**
 * @fileoverview Records page: drop every health file in one place, then sort
 * the unsorted ones into notebooks from a reviewed proposal or one by one.
 */
(function(root) {
'use strict';

const ICONS = {
  document: 'file-text',
  recording: 'microphone'
};

/**
 * Returns the app link that opens a record.
 * @param {{kind: string, id: string}} item
 * @return {string}
 */
function recordLink(item) {
  const path = item.kind === 'recording' ? 'conversation' : 'document';
  return `/${path}/${encodeURIComponent(item.id)}`;
}

/**
 * Lists the records of a group the person kept checked.
 * @param {!Array<{kind: string, id: string}>} items
 * @param {!Set<string>} unchecked Keys of the form "kind:id".
 * @return {!Array<{kind: string, id: string}>}
 */
function keptItems(items, unchecked) {
  return items.filter((item) => !unchecked.has(`${item.kind}:${item.id}`))
      .map((item) => ({kind: item.kind, id: item.id}));
}

/** The Records page. */
class RecordsPage {
  /**
   * @param {!Element} host
   * @param {function(): !Promise<void>} onChanged Refreshes the rail.
   */
  constructor(host, onChanged) {
    const dom = root.StellisDom;
    this.dom = dom;
    this.onChanged = onChanged;
    /** @type {!Array<{id: string, name: string}>} */
    this.notebooks = [];
    this.items = [];
    /** Keys ("kind:id") of records shown in an open proposal. */
    this.proposed = new Set();

    const head = dom.el('div', null, 'records-head');
    head.append(dom.el('h2', 'Records'));
    this.summary = dom.el('p', null, 'records-summary');

    this.drop = dom.el('div', null, 'records-drop');
    this.drop.tabIndex = 0;
    this.drop.setAttribute('role', 'button');
    this.drop.append(
        dom.icon('upload'), dom.el('strong', 'Drop all your health files here'),
        dom.el('span', 'Choose files'));
    this.picker = /** @type {!HTMLInputElement} */ (dom.el('input'));
    this.picker.type = 'file';
    this.picker.multiple = true;
    this.picker.accept = root.StellisRecordUpload.ACCEPT;
    this.picker.hidden = true;
    this.progress = dom.el('ul', null, 'records-progress');
    this.wireDrop();

    this.sort = dom.button('Sort into notebooks', 'records-sort');
    this.sort.addEventListener('click', () => this.suggest());
    this.status = dom.el('p', null, 'records-status');
    this.status.setAttribute('role', 'status');
    this.proposal = dom.el('div', null, 'records-proposal');

    const listHead = dom.el('h3', 'Not sorted');
    listHead.id = 'records-unsorted-title';
    this.list = dom.el('ul', null, 'records-list');
    this.list.setAttribute('aria-labelledby', listHead.id);
    const actions = dom.el('div', null, 'records-actions');
    actions.append(this.summary, this.sort);
    host.replaceChildren(
        head, this.drop, this.picker, this.progress, actions, this.status,
        this.proposal, listHead, this.list);
  }

  wireDrop() {
    const open = () => this.picker.click();
    this.drop.addEventListener('click', open);
    this.drop.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    this.picker.addEventListener('change', () => {
      this.upload([...this.picker.files]);
      this.picker.value = '';
    });
    for (const name of ['dragenter', 'dragover']) {
      this.drop.addEventListener(name, (event) => {
        event.preventDefault();
        this.drop.classList.add('is-over');
      });
    }
    for (const name of ['dragleave', 'drop']) {
      this.drop.addEventListener(name, (event) => {
        event.preventDefault();
        this.drop.classList.remove('is-over');
      });
    }
    this.drop.addEventListener(
        'drop', (event) => this.upload([...event.dataTransfer.files]));
  }

  /**
   * Uploads files into no notebook, one at a time.
   * @param {!Array<!File>} files
   * @return {!Promise<void>}
   */
  async upload(files) {
    this.progress.replaceChildren();
    let added = 0;
    for (const file of files) {
      const line = this.dom.el('li', `${file.name}: uploading`);
      this.progress.append(line);
      const result = await root.StellisRecordUpload.uploadFile(file, null);
      line.textContent = `${file.name}: ${result.message}`;
      added += result.outcome === 'added' ? 1 : 0;
    }
    this.status.textContent =
        `${this.dom.plural(added, 'record')} added from ${files.length}`;
    await this.load();
  }

  /** Asks for a sorting proposal and shows it for review. */
  async suggest() {
    this.sort.disabled = true;
    this.status.textContent =
        `Reading ${this.dom.plural(this.items.length, 'record')}`;
    try {
      const result =
          await this.dom.api('/records/sort/suggest', {method: 'POST'});
      this.proposed = new Set(result.groups.flatMap(
          (group) => group.items.map((item) => `${item.kind}:${item.id}`)));
      this.proposal.replaceChildren(
          ...result.groups.map((group) => this.groupCard(group)));
      this.paintList();
      this.status.textContent = result.groups.length ?
          `${this.dom.plural(result.groups.length, 'notebook')} proposed` :
          'No notebooks proposed';
    } catch (error) {
      this.status.textContent = error.message;
    } finally {
      this.sort.disabled = false;
    }
  }

  /**
   * Renders one proposed notebook with its records for review.
   * @param {!Object} group
   * @return {!Element}
   */
  groupCard(group) {
    const dom = this.dom;
    const card = dom.el('section', null, 'records-group');
    const name = /** @type {!HTMLInputElement} */ (dom.el('input'));
    name.value = group.notebook_name;
    name.maxLength = 80;
    name.readOnly = true;
    name.setAttribute('aria-label', 'Notebook name');
    const tag = dom.el(
        'span', group.notebook_id ? 'Existing notebook' : 'New notebook',
        'records-tag');
    const head = dom.el('div', null, 'records-group-head');
    head.append(name, tag);
    const unchecked = new Set();
    const file = dom.button(
        `File ${dom.plural(group.items.length, 'record')}`, 'records-file');
    const list = dom.el('ul', null, 'records-group-list');
    for (const item of group.items) {
      const box = /** @type {!HTMLInputElement} */ (dom.el('input'));
      box.type = 'checkbox';
      box.checked = true;
      box.addEventListener('change', () => {
        const key = `${item.kind}:${item.id}`;
        if (box.checked) {
          unchecked.delete(key);
        } else {
          unchecked.add(key);
        }
        file.textContent =
            `File ${dom.plural(group.items.length - unchecked.size, 'record')}`;
      });
      const label = dom.el('label', null, 'records-group-item');
      label.append(
          box, dom.icon(ICONS[item.kind]), dom.el('span', item.title),
          dom.el('time', item.date));
      const row = dom.el('li');
      row.append(label);
      list.append(row);
    }
    const skip = dom.button('Skip');
    skip.addEventListener('click', () => {
      for (const item of group.items) {
        this.proposed.delete(`${item.kind}:${item.id}`);
      }
      card.remove();
      this.paintList();
    });
    file.addEventListener('click', () => {
      const items = keptItems(group.items, unchecked);
      const renamed = name.value.trim() !== group.notebook_name;
      this.applyGroup(card, file, {
        notebook_name: name.value.trim(),
        notebook_id: renamed ? null : group.notebook_id,
        items,
      });
    });
    const actions = dom.el('div', null, 'records-group-actions');
    actions.append(file, skip);
    card.append(head);
    if (group.reason) {
      card.append(dom.el('p', group.reason, 'records-reason'));
    }
    card.append(list, actions);
    return card;
  }

  /**
   * Files one reviewed group and reports the result in its card.
   * @param {!Element} card
   * @param {!HTMLButtonElement} control
   * @param {!Object} request
   * @return {!Promise<void>}
   */
  async applyGroup(card, control, request) {
    control.disabled = true;
    try {
      const result = await this.dom.api(
          '/records/sort/apply', {method: 'POST', json: request});
      const note = result.failed.length ?
          `${result.failed.length} could not move: ${result.failed[0].error}` :
          '';
      const done = `Filed ${this.dom.plural(result.moved, 'record')} in ${
          request.notebook_name}`;
      card.replaceChildren(
          this.dom.el('p', note ? `${done}. ${note}` : done, 'records-done'));
      await this.load();
      await this.onChanged();
    } catch (error) {
      this.status.textContent = error.message;
      control.disabled = false;
    }
  }

  /**
   * Renders one unsorted record with a menu to move it.
   * @param {!Object} item
   * @return {!Element}
   */
  row(item) {
    const dom = this.dom;
    const link = /** @type {!HTMLAnchorElement} */ (
        dom.el('a', item.title, 'records-title'));
    link.href = recordLink(item);
    const move = /** @type {!HTMLSelectElement} */ (dom.el('select'));
    move.setAttribute('aria-label', `Move ${item.title} to a notebook`);
    move.append(
        new Option('Move to', ''),
        ...this.notebooks.map((book) => new Option(book.name, book.id)));
    move.addEventListener('change', async () => {
      if (!move.value) {
        return;
      }
      move.disabled = true;
      try {
        await this.dom.api(
            `/records/${item.kind}/${encodeURIComponent(item.id)}/notebook`,
            {method: 'PUT', json: {notebook_id: move.value}});
        await this.load();
        await this.onChanged();
      } catch (error) {
        this.status.textContent = error.message;
        move.disabled = false;
        move.value = '';
      }
    });
    const row = dom.el('li', null, 'records-row');
    row.append(
        dom.icon(ICONS[item.kind]), link,
        dom.el('time', item.date, 'records-date'), move);
    return row;
  }

  /** Lists unsorted records that no open proposal shows. */
  paintList() {
    const left = this.items.filter(
        (item) => !this.proposed.has(`${item.kind}:${item.id}`));
    this.list.replaceChildren(...left.map((item) => this.row(item)));
    if (!left.length) {
      const empty = this.items.length ? 'Every record is in a proposal' :
                                        'Every record is in a notebook';
      this.list.append(this.dom.el('li', empty, 'records-empty'));
    }
  }

  /** Reloads the unsorted records and the notebook list. */
  async load() {
    const [unsorted, books] = await Promise.all(
        [this.dom.api('/records/unsorted'), this.dom.api('/notebooks')]);
    this.items = unsorted.items.slice().reverse();
    this.notebooks = books.notebooks;
    this.paintList();
    this.summary.textContent =
        `${this.dom.plural(this.items.length, 'record')} not sorted`;
    this.sort.hidden = !this.items.length;
  }
}

/**
 * Shows the Records page in host.
 * @param {!Element} host
 * @param {function(): !Promise<void>} onChanged
 * @return {!Promise<void>}
 */
function mount(host, onChanged) {
  return new RecordsPage(host, onChanged).load();
}

const exported = {
  mount,
  recordLink,
  keptItems
};
root.StellisRecords = exported;
if (typeof module !== 'undefined') {
  module.exports = exported;
}
})(typeof window !== 'undefined' ? window : globalThis);
