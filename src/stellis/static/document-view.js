// Document page: an uploaded PDF or image with its text page by page. The notebook's note panel reuses render().
(() => {
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
  const fileUrl = record => `/api/v1/documents/${encodeURIComponent(record.id)}/file`;
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

  // Renders the document into host and scrolls to the requested page; returns the page sections by number.
  function render(host, record, page, {onDelete} = {}) {
    const isPdf = record.media_type === 'application/pdf';
    const head = el('div', null, 'document-head');
    const title = el('h2', record.title, 'document-title');
    const meta = el('p', null, 'document-meta');
    meta.append(el('span', isPdf ? `PDF · ${plural(record.page_count, 'page')}` : 'Image'));
    if (record.status === 'needs_text') meta.append(el('span', 'Needs text', 'document-tag'));
    const actions = el('div', null, 'document-actions');
    const open = el('a', isPdf ? 'Open PDF' : 'Open image'); open.href = fileUrl(record) + (isPdf && page ? `#page=${page}` : '');
    open.target = '_blank'; open.rel = 'noopener';
    actions.append(open);
    if (onDelete) {
      const remove = el('button', 'Delete'); remove.type = 'button';
      remove.addEventListener('click', () => onDelete(record, remove));
      actions.append(remove);
    }
    head.append(title, meta, actions);
    const body = el('div', null, 'document-pages');
    if (!isPdf) { const image = el('img', null, 'document-image'); image.src = fileUrl(record); image.alt = record.title; body.append(image); }
    const sections = new Map();
    for (const item of record.pages) {
      const section = el('section', null, 'document-page'); section.id = `document-page-${item.number}`;
      if (isPdf) section.append(el('h3', `Page ${item.number}`));
      section.append(item.text ? el('p', item.text, 'document-text') : el('p', isPdf ? 'This page has no text yet' : 'Text from images is not read yet', 'document-empty'));
      sections.set(item.number, section); body.append(section);
    }
    host.replaceChildren(head, body);
    const target = sections.get(Number(page));
    if (target && record.page_count > 1) { target.classList.add('is-target'); requestAnimationFrame(() => target.scrollIntoView({block: 'start'})); }
    return sections;
  }
  window.StellisDocumentView = {render, fileUrl};
})();
