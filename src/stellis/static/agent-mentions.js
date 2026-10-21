(() => {
  let sequence=0;
  function attach(input,{candidates,initial=null,onChange=()=>{}}){
    const root=document.createElement('div');root.className='agent-mentions';
    const chip=document.createElement('button');chip.type='button';chip.className='agent-mention-chip';
    const open=document.createElement('button');open.type='button';open.textContent='@';open.setAttribute('aria-label','Mention an agent');
    const list=document.createElement('div');list.id='agent-mentions-'+(++sequence);list.className='agent-mention-list';list.role='listbox';list.setAttribute('aria-label','Notebook agents');list.hidden=true;
    root.append(chip,open,list);input.after(root);
    input.setAttribute('aria-controls',list.id);input.setAttribute('aria-autocomplete','list');
    let selected=initial&&typeof initial.id==='string'&&typeof initial.name==='string'?initial:null,index=0,options=[],range=null;
    function showChip(){chip.hidden=!selected;chip.textContent=selected?'@'+selected.name+' ×':'';chip.setAttribute('aria-label',selected?'Remove mention of '+selected.name:'Remove mention');}
    function close(){list.hidden=true;input.removeAttribute('aria-activedescendant');open.setAttribute('aria-expanded','false');range=null;}
    function mark(){for(let i=0;i<options.length;i++)options[i].setAttribute('aria-selected',String(i===index));if(options[index])input.setAttribute('aria-activedescendant',options[index].id);}
    function choose(agent){
      if(range){input.setRangeText('',range.start,range.end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));}
      selected={id:agent.id,name:agent.name};showChip();close();onChange(selected);input.focus();
    }
    function render(query=''){
      list.replaceChildren();options=[];index=0;
      for(const agent of candidates().filter(a=>a.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))){
        const option=document.createElement('button');option.type='button';option.role='option';option.id=list.id+'-'+options.length;option.textContent=agent.name;
        option.addEventListener('click',()=>choose(agent));options.push(option);list.append(option);
      }
      if(!options.length){const empty=document.createElement('p');empty.textContent='No enabled agents in this notebook.';list.append(empty);}
      list.hidden=false;open.setAttribute('aria-expanded','true');mark();list.scrollIntoView({block:'nearest'});
    }
    input.addEventListener('input',()=>{
      const before=input.value.slice(0,input.selectionStart),match=before.match(/(?:^|\s)@([^@\n]{0,60})$/);
      if(match){range={start:before.lastIndexOf('@'),end:input.selectionStart};render(match[1]);}else close();
    });
    input.addEventListener('keydown',event=>{
      if(list.hidden)return;
      if(event.key==='Escape'){event.preventDefault();close();}
      else if(['ArrowDown','ArrowUp'].includes(event.key)&&options.length){event.preventDefault();index=(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;mark();}
      else if(event.key==='Enter'&&!event.shiftKey&&options[index]){event.preventDefault();options[index].click();}
    });
    open.addEventListener('click',()=>{if(input.disabled)return;if(!list.hidden){close();return;}range=null;render();input.focus();});
    chip.addEventListener('click',()=>{selected=null;showChip();onChange(null);input.focus();});
    root.addEventListener('focusout',()=>setTimeout(()=>{if(document.activeElement!==input&&!root.contains(document.activeElement))close();},0));
    input.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==input&&!root.contains(document.activeElement))close();},0));
    showChip();
    return {get selected(){return selected;},resolve(){if(/(?:^|\s)@\S/.test(input.value))throw Error('Choose an agent from the mention list or remove the @ mention.');if(!selected)return null;const found=candidates().find(a=>a.id===selected.id);if(!found)throw Error('The mentioned agent is unavailable in this notebook. Choose another agent or remove the mention.');return found.id;},clear(){selected=null;showChip();close();onChange(null);}};
  }
  window.StellisAgentMentions={attach};
})();
