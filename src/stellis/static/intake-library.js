/** Local reference search that prepares an answer for explicit review and sending. */
(function(root) {
'use strict';
function render({node, api, onSelect, category: initialCategory = 'goals'}) {
  const panel = node('section', null, 'intake-library');
  panel.setAttribute('aria-label', 'Health library');
  const categories = node('div', null, 'intake-library-categories');
  categories.setAttribute('role', 'group');
  categories.setAttribute('aria-label', 'Library categories');
  let category = initialCategory, request = 0, timer;
  const input = node('input');
  input.type = 'search';
  input.placeholder = 'Search the library';
  input.setAttribute('aria-label', 'Search health library');
  input.maxLength = 100;
  const status = node('p', '', 'intake-library-status');
  status.setAttribute('role', 'status');
  const results = node('div', null, 'intake-library-results');
  const attribution = node('details', null, 'intake-library-source');
  attribution.append(node('summary', 'Library source'));
  const sourceText = node('p');
  attribution.append(sourceText);
  for (const [id, label] of [['goals','Goals'],['health','Health topics'],['medicines','Medicines and supplements']]) {
    const button = node('button', label, 'coach-button');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(id === category));
    button.addEventListener('click', () => {
      category = id; input.value = '';
      for (const child of categories.children) child.setAttribute('aria-pressed', String(child === button));
      load(); input.focus();
    });
    categories.append(button);
  }
  async function load() {
    const current = ++request;
    status.textContent = 'Searching';
    try {
      const data = await api('/intake/library?category=' + category + '&q=' + encodeURIComponent(input.value));
      if (current !== request) return;
      results.replaceChildren();
      for (const item of data.items) {
        const button = node('button', null, 'intake-library-item');
        button.type = 'button';
        button.append(node('strong', item.label), node('span', item.detail));
        button.addEventListener('click', () => onSelect(item));
        results.append(button);
      }
      status.textContent = !input.value && category === 'medicines' ? 'Search a generic or brand name' :
        data.total ? (data.total > data.items.length ? 'Showing ' + data.items.length + ' of ' + data.total : data.total + ' results') :
        'No matches';
      sourceText.textContent = data.attribution;
    } catch {
      if (current !== request) return;
      status.textContent = 'Search unavailable';
      results.replaceChildren();
    }
  }
  input.addEventListener('input', () => {++request; clearTimeout(timer); timer = setTimeout(load, 180);});
  panel.append(categories, input, status, results, attribution);
  load();
  return panel;
}
root.StellisIntakeLibrary = {render};
})(window);
