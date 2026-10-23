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
 * Describes a document in one line, such as "PDF, 3 pages, 2026-04-02".
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
  return parts.join(', ');
}

/**
 * Renders the document's image, if any, and one section per page.
 * @param {!Element} host
 * @param {!Object} record A document with its pages.
 * @param {?function(!Object): !Promise<void>=} onChanged Refreshes the page after a save.
 * @param {boolean=} editable Enables recognition and text corrections.
 * @return {!Map<number, !Element>} The page sections by page number.
 */
function renderPages(host, record, onChanged = null, editable = false) {
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
      const empty = page.ocr_status === 'failed' ? 'Read this page again' :
          page.ocr_status === 'empty' ? 'No text found on this page' :
          'Read text from this page';
      section.append(dom.el('p', empty, 'document-empty'));
    }
    if (editable) pageControls(section, host, record, page, onChanged);
    sections.set(page.number, section);
    pages.append(section);
  }
  host.replaceChildren(pages);
  return sections;
}

/** Adds recognition and revision-checked text editing to one page. */
function pageControls(section, host, record, page, onChanged) {
  const dom = root.StellisDom;
  const actions = dom.el('div', null, 'document-actions');
  const status = dom.el('p', null, 'document-empty');
  status.setAttribute('role', 'status');
  const path = `/documents/${encodeURIComponent(record.id)}/pages/${page.number}`;
  const refresh = async (updated) => {
    Object.assign(record, updated);
    if (onChanged) {
      await onChanged(updated);
    } else {
      renderPages(host, record, null, true);
    }
  };
  if (!page.text) {
    const read = dom.button('Read text', 'invert-button');
    read.addEventListener('click', async () => {
      read.disabled = true;
      status.textContent = 'Reading this page';
      try {
        await refresh(await dom.api(path + '/read', {method: 'POST'}));
      } catch (error) {
        status.textContent = error.message;
        read.disabled = false;
      }
    });
    actions.append(read);
  }
  if (page.text_source === 'ocr' || page.text_source === 'manual' || !page.text) {
    const edit = dom.button('Edit text');
    edit.addEventListener('click', () => {
      edit.disabled = true;
      const form = dom.el('div', null, 'document-text-editor');
      const label = dom.el('label', 'Page text');
      const input = dom.el('textarea');
      input.id = `document-edit-${record.id}-${page.number}`;
      label.htmlFor = input.id;
      input.value = page.text;
      input.maxLength = 100000;
      input.rows = 10;
      const save = dom.button('Save text', 'invert-button');
      const cancel = dom.button('Cancel');
      const buttons = dom.el('div', null, 'document-actions');
      buttons.append(save, cancel);
      form.append(label, input,
          dom.el('p', 'Saving text clears facts from this page', 'document-empty'),
          buttons);
      section.append(form);
      input.focus();
      cancel.addEventListener('click', () => {
        form.remove();
        edit.disabled = false;
        edit.focus();
      });
      save.addEventListener('click', async () => {
        save.disabled = true;
        cancel.disabled = true;
        try {
          await refresh(await dom.api(path, {
            method: 'PATCH', json: {text: input.value, revision: page.revision},
          }));
        } catch (error) {
          status.textContent = error.message;
          save.disabled = false;
          cancel.disabled = false;
        }
      });
    });
    actions.append(edit);
  }
  if (page.text_source === 'ocr') {
    section.append(dom.el('p', 'Machine-read text', 'document-empty'));
  } else if (page.text_source === 'manual') {
    section.append(dom.el('p', 'Edited text', 'document-empty'));
  }
  if (actions.childElementCount) section.append(actions, status);
}

/**
 * Renders the full document page and scrolls to the requested page.
 * @param {!Element} host
 * @param {!Object} record A document with its pages.
 * @param {?number} page
 * @param {function(!Object, !HTMLButtonElement)} onDelete
 * @param {?function(!Object): !Promise<void>=} onChanged Refreshes the saved document.
 * @return {!Element} An empty slot between the header and the pages.
 */
function render(host, record, page, onDelete, onChanged = null) {
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

  const slot = dom.el('div', null, 'document-slot');
  const body = dom.el('div');
  const sections = renderPages(body, record, onChanged, true);
  host.replaceChildren(head, slot, body);
  const target = page ? sections.get(page) : null;
  if (target && record.page_count > 1) {
    target.classList.add('is-target');
    requestAnimationFrame(() => target.scrollIntoView({block: 'start'}));
  }
  return slot;
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
