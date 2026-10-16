/* Encrypt a selected device transcript before sending it to the separate sync origin. */
(() => {
  const button = document.querySelector('#sync-transcript');
  const dialog = document.querySelector('#sync-dialog');
  const form = document.querySelector('#sync-form');
  const field = document.querySelector('#sync-passphrase');
  const status = document.querySelector('#sync-status');
  const link = document.querySelector('#sync-account-link');
  const submit = document.querySelector('#sync-submit');
  const cryptoBox = window.StellisCrypto;
  let origin = null;

  fetch('/api/v1/sync-config').then(response => response.json()).then(config => {
    if (config.origin) { origin=config.origin; button.hidden=false; link.href=origin+'/'; }
  }).catch(() => {});
  button.addEventListener('click', () => { if (!activeConversationId) return; status.textContent='';link.hidden=true;field.value='';dialog.showModal();field.focus(); });
  document.querySelector('#sync-cancel').addEventListener('click', () => dialog.close());
  async function remote(path, options={}) {
    const response = await fetch(`${origin}/sync/v1${path}`,{credentials:'include',...options});
    const value = await response.json();
    if (!response.ok) { const error=new Error(value.detail||'Sync failed');error.code=response.status;throw error; }
    return value;
  }
  async function send(user,key,itemId,payload) {
    const {b64,random,aad,seal}=cryptoBox;
    const entry={id:crypto.randomUUID(),item_id:itemId,iv:b64(random(12))};
    entry.ciphertext=await seal(key,JSON.stringify(payload),cryptoBox.bytes(entry.iv),aad(user.id,entry.item_id,entry.id));
    await remote('/entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)});
  }
  form.addEventListener('submit',async event => {
    event.preventDefault();if(!origin || !activeConversationId)return;
    submit.disabled=true;link.hidden=true;status.textContent='Connecting…';
    const passphrase=field.value;field.value='';
    try {
      const user=await remote('/me');
      let vault;
      try { vault=await remote('/vault'); }
      catch(error){if(error.code===404){link.hidden=false;throw Error('Create a vault in your account first')}throw error}
      const key=await cryptoBox.derive(passphrase,cryptoBox.bytes(vault.salt));
      try {
        const check=await cryptoBox.open(key,vault.check_ciphertext,cryptoBox.bytes(vault.check_iv),cryptoBox.aad(user.id,'vault-check-v1'));
        if(check!=='stellis-vault-v1')throw Error();
      }catch{throw Error('Wrong vault passphrase')}
      const id=activeConversationId;
      const [conversation,transcript]=await Promise.all([
        fetch(`${API}/conversations/${encodeURIComponent(id)}`).then(json),
        fetch(`${API}/conversations/${encodeURIComponent(id)}/transcript`).then(json),
      ]);
      if (!transcript.segments?.length) throw Error('Transcribe before syncing');
      const snapshot=crypto.randomUUID();
      const parts=window.StellisSnapshot.partsFor(snapshot,transcript.segments,transcript.highlights||[]);
      const partIds=parts.map(()=>crypto.randomUUID());
      for(let index=0;index<parts.length;index++){
        status.textContent=`Syncing ${index+1} of ${parts.length}…`;
        await send(user,key,partIds[index],parts[index]);
      }
      await send(user,key,crypto.randomUUID(),{kind:'conversation_manifest',snapshot_id:snapshot,
        source_conversation_id:id,title:conversation.title,duration_ms:conversation.duration_ms,
        source_revision:transcript.revision,generation_version:transcript.generation_version,
        segment_count:transcript.segments.length,part_ids:partIds,created_at:new Date().toISOString()});
      status.textContent='Transcript synced. Audio stays on this device.';
    }catch(error){
      if(error.code===401){status.textContent='Sign in to sync';link.hidden=false;}
      else status.textContent=error.message||'Sync failed';
    }finally{submit.disabled=false;}
  });
})();
