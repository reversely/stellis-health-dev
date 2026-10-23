/** Read-only notebook views of shared clinical facts and dated sources. */
(function(root) {
  const el = (tag,text) => {const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
  async function mount(host, notebookId) {
    host.replaceChildren();
    const response = await fetch('/api/v1/notebooks/'+encodeURIComponent(notebookId)+'/health');
    if (!response.ok || location.pathname !== '/notebook/'+notebookId) return;
    const context = await response.json();
    if (context.facts.length) {
      const details=el('details'); details.append(el('summary','Health facts'));
      const list=el('ul');
      for(const fact of context.facts) {
        const row=el('li');const link=el('a',[fact.name,fact.value,fact.unit,fact.date].filter(Boolean).join(' '));
        link.href=fact.target;row.append(link);list.append(row);
      }
      details.append(list);host.append(details);
    }
    if(context.active_features.includes('timeline')) {
      const details=el('details');details.append(el('summary','Timeline'));
      const list=el('ul');
      for(const item of context.timeline) {const row=el('li');const a=el('a',item.date+' '+item.title);a.href=item.target;row.append(a);list.append(row);}
      details.append(list);host.append(details);
    }
    if(context.active_features.includes('intervention_history')) {
      const details=el('details');details.append(el('summary','Intervention history'));
      const list=el('ul');
      for(const fact of context.facts.filter(f=>['medication','procedure','treatment'].includes(f.kind))) {
        const row=el('li');const a=el('a',[fact.date,fact.name,fact.value,fact.unit].filter(Boolean).join(' '));a.href=fact.target;row.append(a);list.append(row);
      }
      details.append(list);host.append(details);
    }
    if(context.active_features.includes('trends')) {
      const details=el('details');details.append(el('summary','Measurements'));
      const list=el('ul');
      for(const point of context.measurements) list.append(el('li',[point.time,point.measure,point.value,point.value2,point.unit].filter(x=>x!=null).join(' ')));
      details.append(list);host.append(details);
    }
  }
  root.StellisNotebookHealth={mount};
})(window);
