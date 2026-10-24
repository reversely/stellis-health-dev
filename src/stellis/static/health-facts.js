/**
 * @fileoverview Health facts panel on the document page: find facts in the
 * document, then accept or reject each suggestion. A compact form serves the
 * chat document panel, with the count to check in its heading.
 */
(function(root) {
'use strict';

const KIND_LABELS = {
  medication: 'Medication',
  lab_result: 'Lab result',
  vital_sign: 'Vital sign',
  condition: 'Condition',
  allergy: 'Allergy',
};

/**
 * Formats a fact's measured value, such as "3.4 mg/dL".
 * @param {{value: string, unit: string}} fact
 * @return {string}
 */
function measurement(fact) {
  return [fact.value, fact.unit].filter(Boolean).join(' ');
}

/**
 * Splits facts into suggestions and accepted facts.
 * @param {!Array<!Object>} facts
 * @return {{suggested: !Array<!Object>, accepted: !Array<!Object>}}
 */
function partition(facts) {
  return {
    suggested: facts.filter((fact) => fact.status === 'suggested'),
    accepted: facts.filter((fact) => fact.status === 'accepted'),
  };
}

/** The panel for one document. */
class FactsPanel {
  /**
   * @param {!Element} host
   * @param {!Object} record A document as the API returns it.
   * @param {{compact: (boolean|undefined), onChange: (function()|undefined)}=} options
   */
  constructor(host, record, options = {}) {
    const dom = root.StellisDom;
    this.dom = dom;
    this.record = record;
    this.compact = Boolean(options.compact);
    this.onChange = options.onChange || (() => {});
    this.facts = [];
    this.find = dom.button('Find health facts', 'facts-find');
    this.find.addEventListener('click', () => this.extract());
    this.status = dom.el('p', null, 'facts-status');
    this.status.setAttribute('role', 'status');
    this.suggested = dom.el('ul', null, 'facts-list');
    this.accepted = dom.el('ul', null, 'facts-list');
    this.suggestedTitle = dom.el('h4', 'To review');
    this.acceptAll = dom.button('Accept all', 'facts-accept-all');
    this.acceptAll.addEventListener('click', () => this.acceptEvery());
    const reviewHead = dom.el('div', null, 'facts-review-head');
    reviewHead.append(this.suggestedTitle, this.acceptAll);
    this.acceptedTitle = dom.el('h4', 'Accepted');
    const head = dom.el('div', null, 'facts-head');
    const title = dom.el('h3', 'Health facts');
    this.count = dom.el('span', null, 'facts-count');
    title.append(' ', this.count);
    const section = dom.el('section', null, this.compact ? 'facts is-compact' : 'facts');
    if (this.compact) {
      // The panel leads with what is left to check; Accept all sits beside it.
      head.append(title, this.acceptAll);
      reviewHead.hidden = true;
      section.append(head, this.status, this.suggested, this.acceptedTitle, this.accepted,
          dom.accuracyNote('summaries', 'Found by a model'), this.find);
    } else {
      head.append(title, dom.accuracyNote('summaries', 'Found by a model'), this.find);
      section.append(head, this.status, reviewHead, this.suggested, this.acceptedTitle, this.accepted);
    }
    host.replaceChildren(section);
    if (record.status !== 'ready') {
      this.find.hidden = true;
      this.status.textContent = 'Facts need text from this document';
    }
  }

  paint() {
    const {suggested, accepted} = partition(this.facts);
    this.suggested.replaceChildren(...suggested.map((fact) => this.row(fact)));
    this.accepted.replaceChildren(...accepted.map((fact) => this.row(fact)));
    this.suggestedTitle.hidden = !suggested.length;
    this.acceptAll.hidden = suggested.length < 2;
    this.acceptedTitle.hidden = !accepted.length;
    this.find.textContent =
        this.facts.length ? 'Find health facts again' : 'Find health facts';
    this.count.textContent = suggested.length ? `${suggested.length} to check` : '';
    if (this.compact) this.acceptAll.hidden = !suggested.length;
  }

  /**
   * @param {!Object} fact
   * @return {!Element}
   */
  row(fact) {
    const dom = this.dom;
    const item = dom.el('li', null, 'fact');
    item.dataset.status = fact.status;
    const range = fact.range_status;
    // A value outside its stated range is tinted so it is checked first.
    if (range?.tone === 'alert') item.classList.add('is-flagged');
    const head = dom.el('div', null, 'fact-head');
    if (!this.compact) head.append(dom.el('span', KIND_LABELS[fact.kind], 'fact-kind'));
    head.append(dom.el('strong', fact.name), dom.el('span', measurement(fact), 'fact-value'));
    if (range) head.append(dom.el('span', range.label, `status-block ${range.tone === 'ok' ? 'is-ok' : 'is-alert'}`));
    if (!this.compact) head.append(dom.el('time', fact.date));
    const page = dom.button(`Page ${fact.page}`, 'fact-page');
    page.addEventListener('click', () => {
      document.querySelector(`#document-page-${fact.page}`)?.scrollIntoView({
        block: 'start'
      });
    });
    const quote = dom.el('blockquote', fact.quote, 'fact-quote');
    item.append(head, quote);
    if (!this.compact) item.append(page);
    if (fact.status === 'accepted') {
      head.append(dom.el('span', 'Accepted', 'fact-tag'));
      return item;
    }
    const choice = (label, glyph) => {
      const control = dom.button(this.compact ? null : label, this.compact ? 'fact-icon' : '');
      if (this.compact) control.append(dom.icon(glyph));
      control.setAttribute('aria-label', `${label} ${fact.name}`);
      return control;
    };
    const accept = choice('Accept', 'check');
    accept.addEventListener('click', () => this.review(fact, true, accept));
    const reject = choice('Reject', 'x');
    reject.addEventListener('click', () => this.review(fact, false, reject));
    const actions = dom.el('div', null, 'fact-actions');
    actions.append(accept, reject);
    item.append(actions);
    return item;
  }

  /** Accepts every suggestion of the document at once. */
  async acceptEvery() {
    this.acceptAll.disabled = true;
    try {
      const result = await this.dom.api(
          `/documents/${encodeURIComponent(this.record.id)}/facts/accept`,
          {method: 'POST'});
      this.facts = this.facts.map(
          (fact) => fact.status === 'suggested' ?
              {...fact, status: 'accepted'} :
              fact);
      this.status.textContent =
          `${this.dom.plural(result.accepted, 'fact')} accepted`;
      this.paint();
      this.onChange();
    } catch (error) {
      this.status.textContent = error.message;
    } finally {
      this.acceptAll.disabled = false;
    }
  }

  /**
   * Accepts or rejects one suggestion.
   * @param {!Object} fact
   * @param {boolean} keep
   * @param {!HTMLButtonElement} control
   * @return {!Promise<void>}
   */
  async review(fact, keep, control) {
    control.disabled = true;
    try {
      if (keep) {
        const saved =
            await this.dom.api(`/facts/${fact.id}/accept`, {method: 'POST'});
        this.facts =
            this.facts.map((item) => item.id === fact.id ? saved : item);
      } else {
        await this.dom.api(`/facts/${fact.id}`, {method: 'DELETE'});
        this.facts = this.facts.filter((item) => item.id !== fact.id);
      }
      this.status.textContent = '';
      this.paint();
      this.onChange();
    } catch (error) {
      this.status.textContent = error.message;
      control.disabled = false;
    }
  }

  async extract() {
    this.find.disabled = true;
    this.status.textContent = 'Reading this document';
    try {
      const result = await this.dom.api(
          `/documents/${encodeURIComponent(this.record.id)}/facts/extract`,
          {method: 'POST'});
      this.facts = result.facts;
      const found = partition(this.facts).suggested.length;
      this.status.textContent = found ?
          `${this.dom.plural(found, 'fact')} to review` :
          'No new facts found';
      this.paint();
    } catch (error) {
      this.status.textContent = error.message;
    } finally {
      this.find.disabled = false;
    }
  }

  async load() {
    try {
      const result = await this.dom.api(
          `/documents/${encodeURIComponent(this.record.id)}/facts`);
      this.facts = result.facts;
      this.paint();
    } catch (error) {
      this.status.textContent = error.message;
    }
  }
}

/**
 * Shows a document's health facts in host.
 * @param {!Element} host
 * @param {!Object} record
 * @return {!Promise<void>}
 */
function mount(host, record, options = {}) {
  return new FactsPanel(host, record, options).load();
}

const exported = {
  mount,
  measurement,
  partition
};
root.StellisHealthFacts = exported;
if (typeof module !== 'undefined') {
  module.exports = exported;
}
})(typeof window !== 'undefined' ? window : globalThis);
