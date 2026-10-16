const fileInput = document.querySelector('#audio-file');
const status = document.querySelector('#status');
const list = document.querySelector('#conversation-list');
const dropZone = document.querySelector('#drop-zone');
const listView = document.querySelector('#list-view');
const detailView = document.querySelector('#detail-view');
const player = document.querySelector('#audio-player');
const API = '/api/v1';
const processButton = document.querySelector('#process-button');
const processingStatus = document.querySelector('#processing-status');
const transcriptView = document.querySelector('#transcript');
let activeConversationId = null;
let jobTimer = null;
let transcriptSegments = [];

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
  clearTimeout(jobTimer);
  activeConversationId = null;
  listView.hidden = false;
  detailView.hidden = true;
  document.querySelector('#page-title').textContent = 'Your conversations';
  document.querySelector('#page-subtitle').textContent = 'Listen, review, and return to what matters.';
  const conversations = await json(await fetch(`${API}/conversations`));
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
  clearTimeout(jobTimer);
  activeConversationId = id;
  transcriptSegments = [];
  transcriptView.replaceChildren();
  processingStatus.textContent = 'Checking local speech models…';
  processButton.hidden = true;
  const item = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}`));
  listView.hidden = true;
  detailView.hidden = false;
  document.querySelector('#page-title').textContent = item.title;
  document.querySelector('#page-subtitle').textContent = 'Replay and scrub through your recording.';
  document.querySelector('#audio-duration').textContent = time(item.duration_ms / 1000);
  player.src = `${API}/conversations/${encodeURIComponent(id)}/audio`;
  player.load();
  await loadSpeech(id);
}
async function loadSpeech(id) {
  const [capabilities, existing] = await Promise.all([
    json(await fetch(`${API}/capabilities`)),
    json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/processing-job`)),
  ]);
  if (id !== activeConversationId) return;
  if (existing?.state === 'succeeded') { await showTranscript(id); return; }
  if (existing?.state === 'queued' || existing?.state === 'running') { watchJob(existing); return; }
  if (!capabilities.features.transcribe || !capabilities.features.diarize) {
    processingStatus.textContent = 'Local speech models are unavailable. Install them to transcribe this recording on this device.';
    return;
  }
  if (existing?.state === 'failed') {
    processingStatus.textContent = `Processing stopped: ${existing.error || 'Unknown error'}`;
    processButton.hidden = false;
    processButton.textContent = 'Retry processing';
    return;
  }
  await beginProcessing(id);
}
async function beginProcessing(id) {
  processButton.hidden = true;
  processingStatus.textContent = 'Starting on-device transcription…';
  try {
    const job = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/processing-jobs`, {method:'POST'}));
    watchJob(job);
  } catch (error) {
    processingStatus.textContent = error.message;
    processButton.hidden = false;
    processButton.textContent = 'Retry processing';
  }
}
function watchJob(job) {
  if (job.conversation_id !== activeConversationId) return;
  clearTimeout(jobTimer);
  if (job.state === 'succeeded') { showTranscript(job.conversation_id).catch(error => processingStatus.textContent = error.message); return; }
  if (job.state === 'failed') {
    processingStatus.textContent = `Processing stopped: ${job.error || 'Unknown error'}`;
    processButton.hidden = false;
    processButton.textContent = 'Retry processing';
    return;
  }
  processingStatus.textContent = `${job.stage.charAt(0).toUpperCase() + job.stage.slice(1)} on this device · ${Math.round(job.progress * 100)}%`;
  jobTimer = setTimeout(async () => {
    try { watchJob(await json(await fetch(`${API}/jobs/${encodeURIComponent(job.id)}`))); }
    catch (error) { processingStatus.textContent = error.message; }
  }, 1500);
}
async function showTranscript(id) {
  const data = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/transcript`));
  if (id !== activeConversationId) return;
  transcriptSegments = data.segments;
  transcriptView.replaceChildren();
  const clusters = [...new Set(data.turns.map(turn => turn.speaker_cluster_id))].sort();
  const summary = document.createElement('div');
  summary.className = 'speaker-summary';
  for (const cluster of clusters) {
    const pill = document.createElement('span');
    pill.className = 'speaker-pill';
    pill.textContent = cluster.replace('speaker-', 'Speaker ');
    summary.append(pill);
  }
  transcriptView.append(summary);
  for (const segment of data.segments) {
    const row = document.createElement('div');
    row.className = 'segment';
    row.dataset.segmentId = segment.id;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Play from ${time(segment.start_ms / 1000)}`);
    const stamp = document.createElement('span');
    stamp.className = 'segment-time';
    stamp.textContent = time(segment.start_ms / 1000);
    const speaker = document.createElement('span');
    speaker.className = `segment-speaker${segment.speaker_uncertain ? ' uncertain' : ''}`;
    speaker.textContent = segment.speaker_cluster_id ? segment.speaker_cluster_id.replace('speaker-', 'Speaker ') : 'Unknown speaker';
    if (segment.speaker_uncertain) speaker.textContent += ' · check';
    const words = document.createElement('span');
    words.className = 'segment-text';
    words.textContent = segment.text;
    row.append(stamp, speaker, words);
    row.addEventListener('click', () => { player.currentTime = segment.start_ms / 1000; player.play(); });
    row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); row.click();} });
    transcriptView.append(row);
  }
  processingStatus.textContent = `${data.segments.length} on-device segments · ${clusters.length} acoustic speaker groups. Select a segment to play it.`;
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
    const result = await json(await fetch(`${API}/conversations/import`, {method: 'POST', body}));
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
player.addEventListener('timeupdate', () => {
  const ms = player.currentTime * 1000;
  const active = transcriptSegments.find(segment => segment.start_ms <= ms && ms < segment.end_ms);
  for (const row of transcriptView.querySelectorAll('.segment.active')) row.classList.remove('active');
  if (active) transcriptView.querySelector(`[data-segment-id="${active.id}"]`)?.classList.add('active');
});
processButton.addEventListener('click', () => beginProcessing(activeConversationId));
window.addEventListener('popstate', () => route().catch(error => setStatus(error.message)));
route().catch(error => setStatus(error.message));
