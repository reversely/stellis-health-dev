/**
 * @fileoverview Health timeline page: documents, recordings and accepted
 * facts grouped by year, newest first, with kind and notebook filters.
 */
(function(root) {
'use strict';

const FILTERS = [
  {id: '', label: 'All'},
  {id: 'document', label: 'Documents'},
  {id: 'recording', label: 'Recordings'},
  {id: 'fact', label: 'Facts'},
];
const ICONS = {
  document: 'file-text',
  recording: 'microphone',
  fact: 'check'
};
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov',
  'Dec'
];

/**
 * Groups entries by year, keeping their order.
 * @param {!Array<{date: string}>} entries Entries sorted newest first.
 * @return {!Array<{year: string, entries: !Array<!Object>}>}
 */
function groupByYear(entries) {
  const groups = [];
  for (const entry of entries) {
    const year = entry.date.slice(0, 4);
    if (!groups.length || groups[groups.length - 1].year !== year) {
      groups.push({year, entries: []});
    }
    groups[groups.length - 1].entries.push(entry);
  }
  return groups;
}

/**
 * Formats YYYY-MM-DD as a short day, such as "Apr 2".
 * @param {string} date
 * @return {string}
 */
function shortDate(date) {
  const [, month, day] = date.split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

/** The timeline page. */
class Timeline {
  /** @param {!Element} host */
  constructor(host) {
    const dom = root.StellisDom;
    this.dom = dom;
    this.kind = '';
    this.request = 0;
    const head = dom.el('div', null, 'timeline-head');
    head.append(dom.el('h2', 'Timeline'));
    this.filters = dom.el('div', null, 'timeline-filters');
    this.filters.setAttribute('role', 'group');
    this.filters.setAttribute('aria-label', 'Show');
    for (const filter of FILTERS) {
      const control = dom.button(filter.label);
      control.dataset.kind = filter.id;
      control.addEventListener('click', () => {
        this.kind = filter.id;
        this.load();
      });
      this.filters.append(control);
    }
    this.notebook = /** @type {!HTMLSelectElement} */ (dom.el('select'));
    this.notebook.setAttribute('aria-label', 'Notebook');
    this.notebook.addEventListener('change', () => this.load());
    const controls = dom.el('div', null, 'timeline-controls');
    controls.append(this.filters, this.notebook);
    this.status = dom.el('p', null, 'timeline-status');
    this.status.setAttribute('role', 'status');
    this.list = dom.el('div', null, 'timeline-years');
    host.replaceChildren(head, controls, this.status, this.list);
  }

  /** @param {!Array<{id: string, name: string}>} notebooks */
  setNotebooks(notebooks) {
    this.notebook.replaceChildren(
        new Option('All notebooks', ''),
        ...notebooks.map((book) => new Option(book.name, book.id)));
  }

  paintFilters() {
    for (const control of this.filters.querySelectorAll('button')) {
      control.setAttribute(
          'aria-pressed', String(control.dataset.kind === this.kind));
    }
  }

  /**
   * @param {!Object} entry
   * @return {!Element}
   */
  row(entry) {
    const dom = this.dom;
    const item = dom.el('li', null, 'timeline-entry');
    item.dataset.kind = entry.kind;
    const time = dom.el('time', shortDate(entry.date), 'timeline-date');
    time.setAttribute('datetime', entry.date);
    const link = /** @type {!HTMLAnchorElement} */ (
        dom.el('a', entry.title, 'timeline-title'));
    link.href = entry.target;
    const text = dom.el('div', null, 'timeline-text');
    text.append(link);
    const detail =
        entry.source ? `${entry.detail} · ${entry.source}` : entry.detail;
    if (detail) {
      text.append(dom.el('span', detail, 'timeline-detail'));
    }
    item.append(time, dom.icon(ICONS[entry.kind]), text);
    return item;
  }

  /** @param {!Array<!Object>} entries */
  paint(entries) {
    const dom = this.dom;
    this.paintFilters();
    this.list.replaceChildren(...groupByYear(entries).map((group) => {
      const section = dom.el('section', null, 'timeline-year');
      const heading = dom.el('h3', group.year);
      heading.id = `timeline-${group.year}`;
      section.setAttribute('aria-labelledby', heading.id);
      const list = dom.el('ol', null, 'timeline-list');
      list.append(...group.entries.map((entry) => this.row(entry)));
      section.append(heading, list);
      return section;
    }));
    this.status.textContent = entries.length ?
        '' :
        'Upload a document or record a visit to start your timeline';
  }

  async load() {
    const request = ++this.request;
    const query = new URLSearchParams();
    if (this.kind) {
      query.set('kinds', this.kind);
    }
    if (this.notebook.value) {
      query.set('notebook_id', this.notebook.value);
    }
    try {
      const data = await this.dom.api(`/timeline?${query}`);
      if (request === this.request) {
        this.paint(data.entries);
      }
    } catch (error) {
      this.status.textContent = error.message;
    }
  }
}

/**
 * Shows the timeline in host.
 * @param {!Element} host
 * @param {!Array<{id: string, name: string}>} notebooks
 * @return {!Promise<void>}
 */
function mount(host, notebooks) {
  const timeline = new Timeline(host);
  timeline.setNotebooks(notebooks);
  return timeline.load();
}

const exported = {
  mount,
  groupByYear,
  shortDate
};
root.StellisTimeline = exported;
if (typeof module !== 'undefined') {
  module.exports = exported;
}
})(typeof window !== 'undefined' ? window : globalThis);
