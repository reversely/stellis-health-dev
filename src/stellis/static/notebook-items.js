// Pure helpers for the notebook page: the items table, its filters, the latest summary, and colour checks.
(function (root) {
  const HEX = /^#[0-9A-Fa-f]{6}$/;
  const DARK_INK = '#27222B';
  const LIGHT_INK = '#F7F5F6';
  const FILTERS = [
    {id: 'all', label: 'All', icon: 'list', empty: 'No notes or meetings yet'},
    {id: 'conversation', label: 'Meetings', icon: 'microphone', empty: 'No meetings yet'},
    {id: 'page', label: 'Notes', icon: 'file-text', empty: 'No notes yet'},
  ];

  const isHexColour = value => typeof value === 'string' && HEX.test(value);

  function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map(at => {
      const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Text on a notebook colour: whichever of the two house inks has the higher contrast.
  function inkFor(hex) {
    if (!isHexColour(hex)) return LIGHT_INK;
    const level = luminance(hex);
    const contrast = ink => { const other = luminance(ink); return (Math.max(level, other) + 0.05) / (Math.min(level, other) + 0.05); };
    return contrast(DARK_INK) > contrast(LIGHT_INK) ? DARK_INK : LIGHT_INK;
  }

  // Open and completed to-do counts per source ID, from the two GET /todos responses.
  function countTodos(openGroups, doneGroups) {
    const counts = new Map();
    const add = (groups, key) => {
      for (const {source, items} of groups) {
        const entry = counts.get(source.id) || {open: 0, done: 0};
        entry[key] += items.length; counts.set(source.id, entry);
      }
    };
    add(openGroups, 'open'); add(doneGroups, 'done');
    return counts;
  }

  // One row per meeting and note in the notebook, newest first.
  function buildItems({conversations = [], pages = [], tagsByConversation = new Map(), counts = new Map()}) {
    const none = {open: 0, done: 0};
    return [
      ...conversations.map(item => ({kind: 'conversation', id: item.id, title: item.title, date: item.recorded_at || item.created_at,
        categoryIds: tagsByConversation.get(item.id) || [], todos: counts.get(item.id) || none})),
      ...pages.map(item => ({kind: 'page', id: item.id, title: item.title, date: item.updated_at,
        categoryIds: item.category_ids || [], todos: counts.get(item.id) || none})),
    ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  const filterItems = (items, filter) => filter === 'all' ? items : items.filter(item => item.kind === filter);

  // The newest meeting that has a Summary overview; its text is passed through unmodified.
  function latestSummary(conversations, lines) {
    for (const item of conversations) {
      const text = lines.get(item.id);
      if (text) return {id: item.id, title: item.title, date: item.recorded_at || item.created_at, text};
    }
    return null;
  }

  const api = {FILTERS, isHexColour, inkFor, countTodos, buildItems, filterItems, latestSummary};
  root.StellisNotebookItems = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
