/**
 * @fileoverview Document page: an uploaded PDF or image with its text page by
 * page. The notebook source viewer reuses renderPages.
 */
(function(root) {
'use strict';

const PDF = 'application/pdf';

/**
 * Returns the link that serves a document's file.
 * @param {{id: string, media_type: string}} record
 * @param {?number=} page Opens a PDF at this page when given.
 * @return {string}
 */
function fileUrl(record, page = null) {
  const url = `/api/v1/documents/${encodeURIComponent(record.id)}/file`;
  return record.media_type === PDF && page ? `${url}#page=${page}` : url;
}

/**
 * Describes a document in one line, such as "PDF · 3 pages · 2026-04-02".
 * @param {{media_type: string, page_count: number,
 *     record_date: ?string}} record
 * @return {string}
 */
function describe(record) {
  const parts = record.media_type === PDF ?
      ['PDF', root.StellisDom.plural(record.page_count, 'page')] :
      ['Image'];
  if (record.record_date) {
    parts.push(record.record_date);
  }
  return parts.join(' · ');
}

/**
 * Renders the document's image, if any, and one section per page.
 * @param {!Element} host
 * @param {!Object} record A document with its pages.
 * @return {!Map<number, !Element>} The page sections by page number.
 */
function renderPages(host, record) {
  const dom = root.StellisDom;
  const isPdf = record.media_type === PDF;
  const pages = dom.el('div', null, 'document-pages');
  if (!isPdf) {
    const image = /** @type {!HTMLImageElement} */ (
        dom.el('img', null, 'document-image'));
    image.src = fileUrl(record);
    image.alt = record.title;
    pages.append(image);
  }
  const sections = new Map();
  for (const page of record.pages) {
    const section = dom.el('section', null, 'document-page');
    section.id = `document-page-${page.number}`;
    if (isPdf) {
      section.append(dom.el('h3', `Page ${page.number}`));
    }
    if (page.text) {
      section.append(dom.el('p', page.text, 'document-text'));
    } else {
      const empty = isPdf ? 'This page has no text yet' :
                            'Text from images is not read yet';
      section.append(dom.el('p', empty, 'document-empty'));
    }
    sections.set(page.number, section);
    pages.append(section);
  }
  host.replaceChildren(pages);
  return sections;
}

/**
 * Renders the full document page and scrolls to the requested page.
 * @param {!Element} host
 * @param {!Object} record A document with its pages.
 * @param {?number} page
 * @param {function(!Object, !HTMLButtonElement)} onDelete
 */
function render(host, record, page, onDelete) {
  const dom = root.StellisDom;
  const head = dom.el('div', null, 'document-head');
  const meta = dom.el('p', null, 'document-meta');
  meta.append(dom.el('span', describe(record)));
  if (record.status === 'needs_text') {
    meta.append(dom.el('span', 'Needs text', 'document-tag'));
  }
  const open = /** @type {!HTMLAnchorElement} */ (
      dom.el('a', record.media_type === PDF ? 'Open PDF' : 'Open image'));
  open.href = fileUrl(record, page);
  open.target = '_blank';
  open.rel = 'noopener';
  const remove = dom.button('Delete');
  remove.addEventListener('click', () => onDelete(record, remove));
  const actions = dom.el('div', null, 'document-actions');
  actions.append(open, remove);
  head.append(dom.el('h2', record.title, 'document-title'), meta, actions);

  const body = dom.el('div');
  const sections = renderPages(body, record);
  host.replaceChildren(head, body);
  const target = page ? sections.get(page) : null;
  if (target && record.page_count > 1) {
    target.classList.add('is-target');
    requestAnimationFrame(() => target.scrollIntoView({block: 'start'}));
  }
}

const exported = {
  render,
  renderPages,
  fileUrl,
  describe
};
root.StellisDocumentView = exported;
if (typeof module !== 'undefined') {
  module.exports = exported;
}
})(typeof window !== 'undefined' ? window : globalThis);
