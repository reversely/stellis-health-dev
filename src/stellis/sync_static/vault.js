/* Browser-owned text vault prototype. Keys and plaintext stay in this page's memory. */
const VaultUI = (() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const status = document.querySelector('#vault-status');
  const openPanel = document.querySelector('#vault-open');
  const notes = document.querySelector('#notes');
  let user = null;
  let key = null;
  let cursor = 0;
  let records = new Map();

  const b64 = bytes => btoa(String.fromCharCode(...bytes));
  const bytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
  const random = count => crypto.getRandomValues(new Uint8Array(count));
  const aad = (...parts) => encoder.encode(parts.join('|'));

  async function derive(passphrase, salt) {
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'}, material,
      {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
  }
  async function seal(value, iv, binding) {
    return b64(new Uint8Array(await crypto.subtle.encrypt(
      {name:'AES-GCM',iv,additionalData:binding,tagLength:128}, key, encoder.encode(value))));
  }
  async function open(value, iv, binding) {
    return decoder.decode(await crypto.subtle.decrypt(
      {name:'AES-GCM',iv,additionalData:binding,tagLength:128}, key, bytes(value)));
  }
  async function call(path, options={}) {
    const response = await fetch(`/sync/v1${path}`, options);
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.detail || 'Sync failed'); error.code = response.status; throw error; }
    return data;
  }
  function render() {
    notes.replaceChildren();
    for (const value of records.values()) { const row = document.createElement('li'); row.textContent = value; notes.append(row); }
  }
  function database() {
    return new Promise((resolve,reject) => {
      const request = indexedDB.open('stellis-encrypted-queue-v1',1);
      request.onupgradeneeded = () => request.result.createObjectStore('entries',{keyPath:'id'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function queued() {
    const db = await database();
    return new Promise((resolve,reject) => {
      const request = db.transaction('entries').objectStore('entries').getAll();
      request.onsuccess = () => { db.close(); resolve(request.result.filter(item => item.user_id === user.id)); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }
  async function queue(entry) {
    const db = await database();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('entries','readwrite'); tx.objectStore('entries').put({...entry,user_id:user.id});
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async function unqueue(id) {
    const db = await database();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('entries','readwrite'); tx.objectStore('entries').delete(id);
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async function sync() {
    if (!key || !user) return;
    const pending = await queued();
    for (const entry of pending) {
      const {user_id,...wire} = entry;
      await call('/entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(wire)});
      await unqueue(entry.id);
    }
    if (pending.length) { records.clear(); cursor=0; }
    while (true) {
      const page = await call(`/entries?after=${cursor}&limit=100`);
      for (const entry of page.entries) {
        let text;
        try { text = await open(entry.ciphertext, bytes(entry.iv), aad(user.id,entry.item_id,entry.id)); }
        catch { throw Error('Encrypted entry failed authentication'); }
        records.set(entry.item_id,text);
      }
      cursor = page.cursor;
      if (page.entries.length < 100) break;
    }
    render(); status.textContent = 'Synced';
  }
  async function unlock(passphrase) {
    if (passphrase.length < 12) throw Error('Use at least 12 characters');
    let vault;
    try { vault = await call('/vault'); }
    catch (error) {
      if (error.code !== 404) throw error;
      const salt = random(16); key = await derive(passphrase,salt);
      const iv = random(12);
      vault = await call('/vault',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({salt:b64(salt),check_iv:b64(iv),
          check_ciphertext:await seal('stellis-vault-v1',iv,aad(user.id,'vault-check-v1'))})});
    }
    key = await derive(passphrase,bytes(vault.salt));
    try {
      if (await open(vault.check_ciphertext,bytes(vault.check_iv),aad(user.id,'vault-check-v1')) !== 'stellis-vault-v1')
        throw Error('Vault check failed');
    } catch { key=null; throw Error('Wrong passphrase or vault data changed'); }
    cursor=0;records.clear();openPanel.hidden=false;
    try { await sync(); }
    catch (error) { status.textContent = error.message; }
  }
  document.querySelector('#vault-form').onsubmit = async event => {
    event.preventDefault(); const input=document.querySelector('#vault-passphrase');
    const passphrase=input.value; input.value=''; status.textContent='Unlocking…';
    try { await unlock(passphrase); } catch (error) { status.textContent=error.message; }
  };
  document.querySelector('#note-form').onsubmit = async event => {
    event.preventDefault(); const input=document.querySelector('#note-text'); const value=input.value.trim();
    if (!value || !key) return;
    const entry={id:crypto.randomUUID(),item_id:crypto.randomUUID(),iv:b64(random(12))};
    entry.ciphertext=await seal(value,bytes(entry.iv),aad(user.id,entry.item_id,entry.id));
    await queue(entry); records.set(entry.item_id,value); render(); input.value='';
    try { await sync(); } catch { status.textContent='Saved on this browser. Sync when online.'; }
  };
  document.querySelector('#vault-sync').onclick = () => sync().catch(error => { status.textContent=error.message; });
  return {
    mount(current) { if (user?.id === current.id) return; user=current;key=null;cursor=0;records.clear();render();openPanel.hidden=true;status.textContent=''; },
    lock() { user=null;key=null;cursor=0;records.clear();render();openPanel.hidden=true;status.textContent=''; },
  };
})();
window.VaultUI=VaultUI;
