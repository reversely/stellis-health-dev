/**
 * @fileoverview Health facts panel on the document page: find facts in the
 * document, then accept or reject each suggestion.
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
   */
  constructor(host, record) {
    const dom = root.StellisDom;
    this.dom = dom;
    this.record = record;
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
    head.append(dom.el('h3', 'Health facts'), this.find);
    const section = dom.el('section', null, 'facts');
    section.append(
        head, this.status, reviewHead, this.suggested, this.acceptedTitle,
        this.accepted);
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
  }

  /**
   * @param {!Object} fact
   * @return {!Element}
   */
  row(fact) {
    const dom = this.dom;
    const item = dom.el('li', null, 'fact');
    item.dataset.status = fact.status;
    const head = dom.el('div', null, 'fact-head');
    head.append(
        dom.el('span', KIND_LABELS[fact.kind], 'fact-kind'),
        dom.el('strong', fact.name), dom.el('span', measurement(fact)),
        dom.el('time', fact.date));
    const page = dom.button(`Page ${fact.page}`, 'fact-page');
    page.addEventListener('click', () => {
      document.querySelector(`#document-page-${fact.page}`)?.scrollIntoView({
        block: 'start'
      });
    });
    const quote = dom.el('blockquote', fact.quote, 'fact-quote');
    item.append(head, quote, page);
    if (fact.status === 'accepted') {
      head.append(dom.el('span', 'Accepted', 'fact-tag'));
      return item;
    }
    const accept = dom.button('Accept');
    accept.setAttribute('aria-label', `Accept ${fact.name}`);
    accept.addEventListener('click', () => this.review(fact, true, accept));
    const reject = dom.button('Reject');
    reject.setAttribute('aria-label', `Reject ${fact.name}`);
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
function mount(host, record) {
  return new FactsPanel(host, record).load();
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
