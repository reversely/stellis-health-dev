const fileInput = document.querySelector('#audio-file');
const status = document.querySelector('#status');
const list = document.querySelector('#conversation-list');
const dropZone = document.querySelector('#drop-zone');
const listView = document.querySelector('#list-view');
const detailView = document.querySelector('#detail-view');
const player = document.querySelector('#audio-player');

function time(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
function setStatus(message, success = false) {
  status.textContent = message;
  status.classList.toggle('success', success);
}
async function json(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'The request failed.');
  return data;
}
async function showList() {
  listView.hidden = false;
  detailView.hidden = true;
  document.querySelector('#page-title').textContent = 'Your conversations';
  document.querySelector('#page-subtitle').textContent = 'Listen, review, and return to what matters.';
  const conversations = await json(await fetch('/api/conversations'));
  list.replaceChildren();
  for (const item of conversations) {
    const row = document.createElement('a');
    row.className = 'conversation-row';
    row.href = `/conversation/${encodeURIComponent(item.id)}`;
    const summary = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.title;
    const meta = document.createElement('small');
    meta.textContent = `${time(item.duration_ms / 1000)} · ${new Date(item.created_at).toLocaleDateString()}`;
    summary.append(title, meta);
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    row.append(summary, arrow);
    list.append(row);
  }
}
async function showDetail(id) {
  const item = await json(await fetch(`/api/conversations/${encodeURIComponent(id)}`));
  listView.hidden = true;
  detailView.hidden = false;
  document.querySelector('#page-title').textContent = item.title;
  document.querySelector('#page-subtitle').textContent = 'Replay and scrub through your recording.';
  document.querySelector('#audio-duration').textContent = time(item.duration_ms / 1000);
  player.src = `/api/conversations/${encodeURIComponent(id)}/audio`;
  player.load();
}
async function route() {
  const match = location.pathname.match(/^\/conversation\/([^/]+)$/);
  if (match) await showDetail(decodeURIComponent(match[1]));
  else await showList();
}
async function importFile(file) {
  if (!file) return;
  setStatus(`Importing ${file.name}…`);
  fileInput.disabled = true;
  const body = new FormData();
  body.append('file', file);
  try {
    const result = await json(await fetch('/api/conversations/import', {method: 'POST', body}));
    history.pushState({}, '', `/conversation/${encodeURIComponent(result.conversation.id)}`);
    await showDetail(result.conversation.id);
    setStatus(result.duplicate ? 'Already imported. Opening your recording.' : 'Recording imported.', true);
  } catch (error) {
    setStatus(error.message);
  } finally {
    fileInput.disabled = false;
    fileInput.value = '';
  }
}
fileInput.addEventListener('change', () => importFile(fileInput.files[0]));
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
});
for (const name of ['dragenter', 'dragover']) dropZone.addEventListener(name, event => {
  event.preventDefault(); dropZone.classList.add('drag-over');
});
for (const name of ['dragleave', 'drop']) dropZone.addEventListener(name, event => {
  event.preventDefault(); dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', event => importFile(event.dataTransfer.files[0]));
document.querySelector('#back-ten').addEventListener('click', () => { player.currentTime = Math.max(0, player.currentTime - 10); });
document.querySelector('#forward-ten').addEventListener('click', () => { player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 10); });
player.addEventListener('timeupdate', () => { document.querySelector('#current-time').textContent = time(player.currentTime); });
window.addEventListener('popstate', () => route().catch(error => setStatus(error.message)));
route().catch(error => setStatus(error.message));
