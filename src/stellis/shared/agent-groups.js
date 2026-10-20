// Groups agents the way Home groups notebooks (#389, #390): each collection, then notebooks outside one, then agents
// with no notebook. An agent with notebooks in several collections appears under each, with the notebooks of that
// group. Coordinators (the default agent and stewards of a notebook in the group) lead, then names in order.
(function (root) {
  function groupAgents(agents, collections) {
    const inCollection = new Map((collections || []).flatMap(collection => collection.notebook_ids.map(id => [id, collection.id])));
    const groups = new Map([
      ...(collections || []).map(collection => [collection.id, {key: collection.id, name: collection.name, color: collection.color, kind: 'folder', items: new Map()}]),
      ['loose', {key: 'loose', name: 'Notebooks', kind: 'notebook', items: new Map()}],
      ['none', {key: 'none', name: 'No notebook', kind: 'inbox', items: new Map()}]]);
    const place = (key, agent, book) => {
      const group = groups.get(key);
      if (!group.items.has(agent.id)) group.items.set(agent.id, {agent, books: []});
      if (book) group.items.get(agent.id).books.push(book);
    };
    for (const agent of agents || []) {
      if (!(agent.notebooks || []).length) place('none', agent);
      for (const book of agent.notebooks || []) place(inCollection.get(book.notebook_id) || 'loose', agent, book);
    }
    const leads = item => Number(Boolean(item.agent.is_default || item.books.some(book => book.is_steward)));
    return [...groups.values()].filter(group => group.items.size).map(group => ({...group,
      items: [...group.items.values()].sort((a, b) => leads(b) - leads(a) || a.agent.name.localeCompare(b.agent.name))}));
  }

  const api = {groupAgents};
  root.StellisAgentGroups = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
