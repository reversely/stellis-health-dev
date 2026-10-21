/**
 * @fileoverview Notebook chat: the Sources panel with checkboxes and one chat
 * history that answers from the checked sources with numbered citations.
 */
(function(root) {
'use strict';

/** Icon names by source type. */
const ICONS = {
  recording: 'microphone',
  audio: 'file',
  note: 'note',
  pdf: 'file-text',
  image: 'file',
};

/** Labels for sources that cannot be checked yet. */
const STATUS_LABELS = {
  processing: 'Transcribing',
  failed: 'Failed',
  needs_text: 'Needs text',
};

/** How often to re-read sources while one is still transcribing. */
const REFRESH_MS = 5000;

/**
 * @typedef {{n: number, source_id: string, title: string, target: string,
 *     start_ms: ?number, page: ?number, excerpt: string}}
 */
let Citation;

/** @typedef {{text: string}|{citation: !Citation}} */
let AnswerPart;

/**
 * Splits answer text into paragraphs of text and citations.
 * @param {string} content Answer text with [[n]] markers.
 * @param {!Array<!Citation>} citations
 * @return {!Array<!Array<!AnswerPart>>} One list of parts per paragraph.
 *     A marker without a matching citation stays as text.
 */
function answerParts(content, citations) {
  const byNumber = new Map(citations.map((item) => [item.n, item]));
  return content.split(/\n{2,}/).map(
      (block) => block.split(/(\[\[\d+\]\])/).filter(Boolean).map((part) => {
        const match = part.match(/^\[\[(\d+)\]\]$/);
        const citation = match && byNumber.get(Number(match[1]));
        return citation ? {citation} : {text: part};
      }));
}

/**
 * Formats a saved answer as Markdown with its sources listed as links.
 * @param {string} content Answer text with [[n]] markers.
 * @param {!Array<!Citation>} citations
 * @return {string}
 */
function answerMarkdown(content, citations) {
  const text = content.replace(/\[\[(\d+)\]\]/g, '[$1]');
  if (!citations.length) {
    return text;
  }
  const links = citations.map((item) => {
    const where = item.page ? `${item.title}, page ${item.page}` : item.title;
    return `- ${item.n}. [${where.replace(/[[\]]/g, '')}](${item.target})`;
  });
  return `${text}\n\n## Sources\n\n${links.join('\n')}`;
}

/**
 * Returns the app link that opens a source.
 * @param {string} sourceId A typed source ID such as "document:abc".
 * @return {string}
 */
function sourceTarget(sourceId) {
  const [kind, id] = sourceId.split(':');
  return `/${kind}/${encodeURIComponent(id)}`;
}

/** The chat, its Sources panel and its source viewer for one notebook. */
class NotebookChat {
  /**
   * @param {!Element} host
   * @param {{id: string}} book
   * @param {{onRecord: (function()|undefined),
   *     onNote: (function(!Element)|undefined)}} options
   */
  constructor(host, book, options) {
    const dom = root.StellisDom;
    this.dom = dom;
    this.book = book;
    this.options = options;
    this.sources = [];
    this.agents = [];
    this.limit = 50;
    this.lastQuestion = '';
    this.stopped = false;
    this.timer = 0;

    this.layout = dom.el('div', null, 'notebook-chat');
    const wide = window.matchMedia('(min-width: 761px)').matches;
    this.layout.dataset.sources = wide ? 'open' : 'closed';
    this.viewer = root.StellisNotebookViewer.create();
    this.viewer.element.addEventListener('vieweropen', () => {
      this.layout.dataset.viewer = 'open';
    });
    this.viewer.element.addEventListener('viewerclose', () => {
      delete this.layout.dataset.viewer;
    });
    this.layout.append(
        this.buildSourcesPanel(), this.buildChat(), this.viewer.element);
    host.replaceChildren(this.layout);
  }

  /** @return {!Element} The Sources panel. */
  buildSourcesPanel() {
    const dom = this.dom;
    const panel = dom.el('aside', null, 'nb-sources');
    panel.setAttribute('aria-label', 'Sources');

    this.toggle = dom.button(null, 'nb-sources-toggle');
    this.toggleCount = dom.el('span', '', 'nb-sources-count');
    this.toggle.append(
        dom.icon('list'), dom.el('span', 'Sources', 'nb-sources-label'),
        this.toggleCount);
    this.toggle.addEventListener('click', () => this.toggleSources());

    const body = dom.el('div', null, 'nb-sources-body');
    body.id = `nb-sources-body-${this.book.id}`;
    this.toggle.setAttribute('aria-controls', body.id);

    this.addButton = dom.button(null, 'nb-source-add');
    this.addButton.append(dom.icon('plus'), dom.el('span', 'Add source'));
    this.addButton.addEventListener('click', () => this.openAddSource());
    const note = dom.button();
    note.append(dom.icon('note'), dom.el('span', 'Note'));
    note.addEventListener('click', () => this.options.onNote?.(note));
    const actions = dom.el('div', null, 'nb-sources-actions');
    actions.append(this.addButton, note);

    this.selectAll = dom.el('label', null, 'nb-source-all');
    this.selectAllBox = /** @type {!HTMLInputElement} */ (dom.el('input'));
    this.selectAllBox.type = 'checkbox';
    this.selectAllBox.addEventListener('change', () => {
      for (const source of this.readySources()) {
        source.selected = this.selectAllBox.checked;
      }
      this.saveSelection();
    });
    this.selectAll.append(dom.el('span', 'Select all'), this.selectAllBox);

    this.list = dom.el('ul', null, 'nb-source-list');
    this.empty = dom.el(
        'p', 'Add a recording, note or document to ask about it', 'nb-empty');
    body.append(actions, this.selectAll, this.list, this.empty);
    panel.append(this.toggle, body);
    return panel;
  }

  /** @return {!Element} The chat log and composer. */
  buildChat() {
    const dom = this.dom;
    const chat = dom.el('section', null, 'nb-chat');
    chat.setAttribute('aria-label', 'Chat');

    this.log = dom.el('div', null, 'nb-messages');
    this.log.setAttribute('role', 'log');
    this.log.addEventListener('click', (event) => this.openCitation(event));
    this.intro =
        dom.el('p', 'Ask about your sources to get cited answers', 'nb-empty');

    this.form = dom.el('form', null, 'nb-composer');
    this.answerWith = dom.el('label', null, 'nb-answer-with');
    this.picker = /** @type {!HTMLSelectElement} */ (dom.el('select'));
    this.answerWith.append(dom.el('span', 'Answer with'), this.picker);
    this.answerWith.hidden = true;

    this.input = /** @type {!HTMLTextAreaElement} */ (dom.el('textarea'));
    this.input.rows = 2;
    this.input.maxLength = 2000;
    this.input.setAttribute('aria-label', 'Question');
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.form.requestSubmit();
      }
    });
    this.send = dom.el('button', 'Send');
    this.send.type = 'submit';
    const box = dom.el('div', null, 'nb-input');
    box.append(this.input, this.send);

    this.status = dom.el('p', null, 'nb-status');
    this.status.setAttribute('role', 'status');
    this.form.append(this.answerWith, box, this.status);
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.submit();
    });
    chat.append(this.log, this.form);
    return chat;
  }

  /** @return {!Array<!Object>} Sources that have text. */
  readySources() {
    return this.sources.filter((source) => source.status === 'ready');
  }

  /** @return {!Array<!Object>} Checked sources. */
  checkedSources() {
    return this.readySources().filter((source) => source.selected);
  }

  toggleSources() {
    const open = this.layout.dataset.sources === 'open';
    this.layout.dataset.sources = open ? 'closed' : 'open';
    this.paintToggle();
  }

  paintToggle() {
    const open = this.layout.dataset.sources === 'open';
    const checked = this.checkedSources().length;
    const total = this.sources.length;
    this.toggle.setAttribute('aria-expanded', String(open));
    this.toggle.setAttribute(
        'aria-label',
        `${open ? 'Hide' : 'Show'} sources, ${checked} of ${total} checked`);
    this.toggleCount.textContent = `${checked}/${total}`;
  }

  paintComposer() {
    const count = this.checkedSources().length;
    this.input.placeholder = count ?
        `Ask about ${this.dom.plural(count, 'source')}` :
        'Check a source to ask about it';
    this.input.disabled = !count;
    this.send.disabled = !count || this.form.dataset.busy === 'true';
  }

  paintSources() {
    this.list.replaceChildren(
        ...this.sources.map((source) => this.sourceRow(source)));
    const ready = this.readySources().length;
    const checked = this.checkedSources().length;
    this.empty.hidden = this.sources.length > 0;
    this.selectAll.hidden = ready < 2;
    this.selectAllBox.checked = ready > 0 && checked === ready;
    this.selectAllBox.indeterminate = checked > 0 && checked < ready;
    this.paintToggle();
    this.paintComposer();
  }

  /**
   * @param {!Object} source
   * @return {!Element}
   */
  sourceRow(source) {
    const dom = this.dom;
    const row = dom.el('li', null, 'nb-source');
    row.dataset.status = source.status;
    const open = dom.button(null, 'nb-source-open');
    open.append(
        dom.icon(ICONS[source.type] || 'file'),
        dom.el('span', source.title, 'nb-source-title'));
    open.addEventListener(
        'click', () => this.viewer.show(sourceTarget(source.id), open));
    row.append(open);
    if (source.status !== 'ready') {
      row.append(
          dom.el('span', STATUS_LABELS[source.status], 'nb-source-status'));
      return row;
    }
    const box = /** @type {!HTMLInputElement} */ (dom.el('input'));
    box.type = 'checkbox';
    box.checked = source.selected;
    box.setAttribute('aria-label', `Use ${source.title}`);
    box.addEventListener('change', () => {
      source.selected = box.checked;
      this.saveSelection();
    });
    const check = dom.el('label', null, 'nb-source-check');
    check.append(box);
    row.append(check);
    return row;
  }

  async saveSelection() {
    this.paintSources();
    const excluded = this.readySources()
                         .filter((source) => !source.selected)
                         .map((source) => source.id);
    try {
      await this.dom.api(
          `/notebooks/${this.book.id}/sources/selection`,
          {method: 'PUT', json: {excluded}});
    } catch (error) {
      this.status.textContent = error.message;
    }
  }

  openAddSource() {
    root.StellisAddSource.open({
      book: this.book,
      count: this.sources.length,
      limit: this.limit,
      trigger: this.addButton,
      onRecord: this.options.onRecord,
      onChanged: () => this.refreshSources().catch(() => {}),
    });
  }

  /** @param {!MouseEvent} event */
  openCitation(event) {
    const link = event.target.closest('a.nb-cite');
    if (!link || !this.dom.isPlainClick(event)) {
      return;
    }
    event.preventDefault();
    this.viewer.show(link.getAttribute('href'), link);
  }

  /**
   * @param {string} content
   * @param {!Array<!Citation>} citations
   * @return {!Element}
   */
  answerBody(content, citations) {
    const body = this.dom.el('div', null, 'nb-answer');
    for (const parts of answerParts(content, citations)) {
      const paragraph = this.dom.el('p');
      for (const part of parts) {
        paragraph.append(
            part.citation ? this.citationLink(part.citation) : part.text);
      }
      body.append(paragraph);
    }
    return body;
  }

  /**
   * @param {!Citation} citation
   * @return {!Element}
   */
  citationLink(citation) {
    const link = this.dom.el('a', String(citation.n), 'nb-cite');
    link.href = citation.target;
    const where = citation.page ? `${citation.title}, page ${citation.page}` :
                                  citation.title;
    link.setAttribute('aria-label', `Source ${citation.n}: ${where}`);
    link.title = `${where}: ${citation.excerpt}`;
    return link;
  }

  /**
   * @param {!Object} item A stored chat message.
   * @return {!Element}
   */
  message(item) {
    const dom = this.dom;
    if (item.role === 'user') {
      this.lastQuestion = item.content;
      const node = dom.el('div', null, 'nb-msg nb-msg-user');
      node.append(dom.el('p', item.content));
      return node;
    }
    const node = dom.el('article', null, 'nb-msg');
    if (item.author) {
      node.append(dom.el('strong', item.author, 'nb-msg-author'));
    }
    const citations = item.citations || [];
    node.append(
        this.answerBody(item.content, citations),
        this.saveButton(item.content, citations));
    return node;
  }

  /**
   * Creates the button that files an answer as a notebook note.
   * @param {string} content
   * @param {!Array<!Citation>} citations
   * @return {!Element}
   */
  saveButton(content, citations) {
    const save = this.dom.button('Save as note', 'nb-msg-save');
    const title = (this.lastQuestion || 'Saved answer').slice(0, 120);
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await this.dom.api('/pages', {
          method: 'POST',
          json: {
            title,
            notebook_id: this.book.id,
            markdown: answerMarkdown(content, citations),
          },
        });
        save.textContent = 'Saved as a note';
        await this.refreshSources();
      } catch (error) {
        this.status.textContent = error.message;
        save.disabled = false;
      }
    });
    return save;
  }

  paintAgents() {
    this.picker.replaceChildren(
        new Option('Sources', ''),
        ...this.agents.map((agent) => new Option(agent.name, agent.id)));
    this.answerWith.hidden = !this.agents.length;
  }

  async submit() {
    const question = this.input.value.trim();
    const sourceIds = this.checkedSources().map((source) => source.id);
    if (!question || !sourceIds.length || this.form.dataset.busy === 'true') {
      return;
    }
    this.form.dataset.busy = 'true';
    this.paintComposer();
    this.intro.remove();
    const previousQuestion = this.lastQuestion;
    const pending = this.message({role: 'user', content: question});
    this.log.append(pending);
    this.input.value = '';
    this.status.textContent =
        `Reading ${this.dom.plural(sourceIds.length, 'source')}`;
    try {
      const answer = await this.dom.api(`/notebooks/${this.book.id}/ask`, {
        method: 'POST',
        json: {
          question,
          source_ids: sourceIds,
          agent_id: this.picker.value || null,
        },
      });
      if (!this.stopped) {
        this.log.append(this.message(answer));
        this.status.textContent = '';
      }
    } catch (error) {
      pending.remove();
      this.lastQuestion = previousQuestion;
      if (!this.input.value) {
        this.input.value = question;
      }
      this.status.textContent = error.message;
    } finally {
      this.form.dataset.busy = 'false';
      this.paintComposer();
    }
  }

  async refreshSources() {
    const data = await this.dom.api(`/notebooks/${this.book.id}/sources`);
    if (this.stopped) {
      return;
    }
    this.sources = data.sources;
    this.limit = data.limit;
    this.paintSources();
    clearTimeout(this.timer);
    if (this.sources.some((source) => source.status === 'processing')) {
      this.timer = setTimeout(() => {
        if (location.pathname === `/notebook/${this.book.id}`) {
          this.refreshSources().catch(() => {});
        }
      }, REFRESH_MS);
    }
  }

  /**
   * Whether an agent answers in this notebook.
   * @param {!Object} agent
   * @return {boolean}
   */
  answersHere(agent) {
    return agent.enabled &&
        agent.notebooks.some(
            (item) =>
                item.notebook_id === this.book.id && item.enabled !== false);
  }

  /** Loads sources, chat history and the notebook's agents. */
  async start() {
    try {
      const [, history, team] = await Promise.all([
        this.refreshSources(),
        this.dom.api(`/notebooks/${this.book.id}/chat`),
        this.dom.api('/agents').catch(() => []),
      ]);
      if (this.stopped) {
        return;
      }
      this.agents = team.filter((agent) => this.answersHere(agent));
      this.paintAgents();
      if (history.messages.length) {
        this.log.append(...history.messages.map((item) => this.message(item)));
      } else {
        this.log.append(this.intro);
      }
    } catch (error) {
      this.status.textContent = error.message;
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}

/** @type {?NotebookChat} */
let current = null;

/**
 * Shows a notebook's chat in host, replacing any chat shown before.
 * @param {!Element} host
 * @param {{id: string}} book
 * @param {{onRecord: (function()|undefined),
 *     onNote: (function(!Element)|undefined)}=} options
 * @return {!Promise<void>}
 */
function mount(host, book, options = {}) {
  current?.stop();
  current = new NotebookChat(host, book, options);
  return current.start();
}

const exported = {
  mount,
  stop: () => current?.stop(),
  answerParts,
  answerMarkdown,
  sourceTarget,
};
root.StellisNotebookChat = exported;
if (typeof module !== 'undefined') {
  module.exports = exported;
}
})(typeof window !== 'undefined' ? window : globalThis);
