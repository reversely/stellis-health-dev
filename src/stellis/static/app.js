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
let currentTranscript = null;
let highlightsOnly = false;
let selectedExcerpt = null;
const recordingPanel = document.querySelector('#recording-panel');
const recordingState = document.querySelector('#recording-state');
const recordingDetail = document.querySelector('#recording-detail');
const recordingTimer = document.querySelector('#recording-timer');
let capture = null;

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
  if (existing?.state === 'succeeded') { await showTranscript(id);
    if (existing.pipeline_version !== capabilities.pipeline_version) { processButton.hidden = false; processButton.textContent = 'Reprocess with vocabulary'; }
    return; }
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
  const previousScroll = window.scrollY;
  currentTranscript = data;
  transcriptSegments = data.segments;
  transcriptView.replaceChildren();
  hideSelectionToolbar();
  document.querySelector('#highlight-count').textContent = `${data.highlights.length} highlights`;
  document.querySelector('#show-highlights').setAttribute('aria-pressed', String(highlightsOnly));
  const counts = new Map();
  for (const segment of data.segments) if (segment.speaker_cluster_id) counts.set(segment.speaker_cluster_id, (counts.get(segment.speaker_cluster_id) || 0) + 1);
  const summary = document.createElement('div');
  summary.className = 'speaker-summary';
  for (const [cluster, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    const pill = document.createElement('span');
    pill.className = 'speaker-pill';
    const manual = data.speaker_labels.find(label => label.scope === 'cluster' && label.target_id === cluster);
    pill.textContent = `${manual ? manual.name : cluster.replace('speaker-', 'Speaker ')} · ${count}`;
    summary.append(pill);
  }
  transcriptView.append(summary);
  for (const segment of data.segments) {
    const highlights = data.highlights.filter(item => item.segment_id === segment.id);
    if (highlightsOnly && !highlights.length) continue;
    const row = document.createElement('div');
    row.className = 'segment';
    row.dataset.segmentId = segment.id;
    const stamp = document.createElement('button');
    stamp.type = 'button';
    stamp.className = 'segment-time';
    stamp.textContent = time(segment.start_ms / 1000);
    stamp.setAttribute('aria-label', `Play from ${time(segment.start_ms / 1000)}`);
    const seek = () => { player.currentTime = segment.start_ms / 1000; player.play(); };
    stamp.addEventListener('click', seek);
    const speaker = document.createElement('button');
    speaker.type = 'button';
    speaker.className = `segment-speaker${segment.speaker_uncertain ? ' uncertain' : ''}`;
    speaker.textContent = segment.speaker_display_name + (segment.speaker_uncertain ? ' · check' : '');
    speaker.setAttribute('aria-label', `Edit speaker label for ${segment.speaker_display_name} at ${time(segment.start_ms / 1000)}`);
    speaker.addEventListener('click', () => showSpeakerEditor(row, segment));
    const words = document.createElement('div');
    words.className = 'segment-text';
    words.setAttribute('aria-label', `Transcript at ${time(segment.start_ms / 1000)}: ${segment.text}. Select text to highlight, or click to play.`);
    renderHighlightedText(words, segment.text, highlights);
    words.addEventListener('click', () => { if (!window.getSelection()?.toString().trim()) seek(); });
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'segment-action';
    edit.textContent = segment.text_provenance === 'user_edit' ? 'Edit · changed' : 'Edit words';
    edit.setAttribute('aria-label', `Edit words at ${time(segment.start_ms / 1000)}`);
    edit.addEventListener('click', () => showWordEditor(row, segment));
    row.append(stamp, speaker, words, edit);
    transcriptView.append(row);
  }
  processingStatus.textContent = `${data.segments.length} on-device segments · ${counts.size} acoustic speaker groups. Click text to play; drag across words to highlight.`;
  window.scrollTo(0, previousScroll);
}
function renderHighlightedText(container, value, highlights) {
  const valid = highlights.filter(item => value.slice(item.start_offset, item.end_offset) === item.quote);
  const edges = [...new Set([0, value.length, ...valid.flatMap(item => [item.start_offset, item.end_offset])])].sort((a, b) => a - b);
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i], end = edges[i + 1];
    const content = value.slice(start, end);
    const marked = valid.some(item => item.start_offset <= start && item.end_offset >= end);
    const node = marked ? document.createElement('mark') : document.createTextNode(content);
    if (marked) { node.textContent = content; node.title = 'Highlighted excerpt'; }
    container.append(node);
  }
  if (highlights.length) {
    const list = document.createElement('div'); list.className = 'segment-highlights';
    for (const item of highlights) {
      const chip = document.createElement('button'); chip.type = 'button';
      chip.textContent = `${value.slice(item.start_offset, item.end_offset) === item.quote ? 'Remove highlight' : 'Remove outdated highlight'}: “${item.quote.slice(0, 45)}”`;
      chip.addEventListener('click', event => { event.stopPropagation(); removeHighlight(item.id); });
      list.append(chip);
    }
    container.append(list);
  }
}
function hideSelectionToolbar() {
  document.querySelector('#selection-toolbar')?.remove();
  selectedExcerpt = null;
}
function inspectSelection() {
  hideSelectionToolbar();
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
  const range = selection.getRangeAt(0);
  const start = range.startContainer.parentElement?.closest('.segment-text');
  const end = range.endContainer.parentElement?.closest('.segment-text');
  if (!start || start !== end || !transcriptView.contains(start) || start.closest('.segment-highlights')) return;
  const row = start.closest('.segment');
  const segment = transcriptSegments.find(item => item.id === row?.dataset.segmentId);
  if (!segment) return;
  const pre = range.cloneRange(); pre.selectNodeContents(start); pre.setEnd(range.startContainer, range.startOffset);
  const startOffset = pre.toString().length;
  const endOffset = startOffset + range.toString().length;
  if (segment.text.slice(startOffset, endOffset) !== range.toString()) return;
  selectedExcerpt = {segment_id:segment.id, start_offset:startOffset, end_offset:endOffset,
    expected_revision:currentTranscript.revision};
  const toolbar = document.createElement('div'); toolbar.id = 'selection-toolbar'; toolbar.setAttribute('role','toolbar');
  const highlight = document.createElement('button'); highlight.type = 'button'; highlight.textContent = 'Highlight';
  highlight.addEventListener('mousedown', event => event.preventDefault());
  highlight.addEventListener('click', async () => {
    const excerpt = selectedExcerpt;
    if (!excerpt) return;
    try {
      await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/highlights`, {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(excerpt)}));
      selection.removeAllRanges();
      await showTranscript(activeConversationId);
      processingStatus.textContent = 'Highlight saved. Use Show only highlights to review excerpts.';
    } catch (error) { processingStatus.textContent = error.message; }
  });
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy';
  copy.addEventListener('mousedown', event => event.preventDefault());
  copy.addEventListener('click', async () => { await navigator.clipboard.writeText(selection.toString()); hideSelectionToolbar(); });
  toolbar.append(highlight, copy); document.body.append(toolbar);
  const rect = range.getBoundingClientRect();
  toolbar.style.left = `${Math.max(8, Math.min(window.innerWidth - toolbar.offsetWidth - 8, rect.left + rect.width / 2 - toolbar.offsetWidth / 2))}px`;
  toolbar.style.top = `${Math.max(8, rect.top - toolbar.offsetHeight - 8)}px`;
}
async function removeHighlight(id) {
  try {
    await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/highlights/${encodeURIComponent(id)}`, {method:'DELETE'}));
    await showTranscript(activeConversationId);
  } catch (error) { processingStatus.textContent = error.message; }
}
function closeRowEditor(row) { row.querySelector('.segment-editor')?.remove(); }
function showWordEditor(row, segment) {
  closeRowEditor(row);
  const form = document.createElement('form');
  form.className = 'segment-editor';
  const label = document.createElement('label');
  label.textContent = 'Edit transcript words';
  const input = document.createElement('textarea');
  input.value = segment.text;
  input.rows = 3;
  input.maxLength = 4000;
  input.required = true;
  label.append(input);
  const actions = document.createElement('div');
  actions.className = 'editor-actions';
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save words';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => form.remove());
  actions.append(save, cancel);
  if (segment.original_text !== undefined) {
    const revert = document.createElement('button');
    revert.type = 'button'; revert.textContent = 'Restore model text';
    revert.addEventListener('click', () => { input.value = segment.original_text; input.focus(); });
    actions.append(revert);
  }
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  form.append(label, actions, message);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/transcript/segments/${encodeURIComponent(segment.id)}`, {
        method: 'PATCH', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({text:input.value, expected_revision:currentTranscript.revision}),
      }));
      await showTranscript(activeConversationId);
      processingStatus.textContent = 'Transcript words saved. The original model text is available to restore.';
    } catch (error) { message.textContent = error.message; save.disabled = false; }
  });
  row.append(form); form.scrollIntoView({block:'start'}); input.focus(); input.select();
}
function showSpeakerEditor(row, segment) {
  closeRowEditor(row);
  const form = document.createElement('form'); form.className = 'segment-editor';
  const nameLabel = document.createElement('label'); nameLabel.textContent = 'Speaker name';
  const name = document.createElement('input'); name.type = 'text'; name.maxLength = 100;
  name.placeholder = 'Name this speaker';
  name.value = segment.speaker_label_source === 'automatic' ? '' : segment.speaker_display_name;
  nameLabel.append(name);
  const scopeLabel = document.createElement('label'); scopeLabel.textContent = 'Apply to';
  const scope = document.createElement('select');
  for (const [value, caption] of [['cluster','All matching speaker turns'],['segment','This passage only']]) {
    if (value === 'cluster' && !segment.speaker_cluster_id) continue;
    const option = document.createElement('option'); option.value = value; option.textContent = caption; scope.append(option);
  }
  scope.value = segment.speaker_label_source === 'manual_segment' ? 'segment' : (segment.speaker_cluster_id ? 'cluster' : 'segment');
  scopeLabel.append(scope);
  const actions = document.createElement('div'); actions.className = 'editor-actions';
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save speaker';
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Clear manual label';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => form.remove());
  actions.append(save, clear, cancel);
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  async function submitLabel(value) {
    const targetId = scope.value === 'cluster' ? segment.speaker_cluster_id : segment.id;
    try {
      await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/speakers/label`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({scope:scope.value,target_id:targetId,name:value,expected_revision:currentTranscript.revision}),
      }));
      await showTranscript(activeConversationId);
      processingStatus.textContent = value ? `Speaker label saved for ${scope.value === 'cluster' ? 'all matching turns' : 'this passage'}.` : 'Manual speaker label cleared.';
    } catch (error) { message.textContent = error.message; }
  }
  form.addEventListener('submit', event => {event.preventDefault(); submitLabel(name.value.trim() || null);});
  clear.addEventListener('click', () => submitLabel(null));
  form.append(nameLabel, scopeLabel, actions, message);
  row.append(form); form.scrollIntoView({block:'start'}); name.focus();
}
async function loadVocabulary() {
  const terms = await json(await fetch(`${API}/vocabulary`));
  const container = document.querySelector('#vocabulary-list');
  container.replaceChildren();
  for (const term of terms) {
    const row = document.createElement('div'); row.className = 'vocabulary-term';
    const name = document.createElement('span'); name.textContent = term.term;
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit';
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove';
    edit.addEventListener('click', () => {
      row.replaceChildren();
      const form = document.createElement('form'); form.className = 'vocabulary-edit';
      const input = document.createElement('input'); input.value = term.term; input.maxLength = 100; input.required = true;
      const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => loadVocabulary());
      form.append(input, save, cancel); row.append(form); input.focus();
      form.addEventListener('submit', async event => {
        event.preventDefault();
        try { await json(await fetch(`${API}/vocabulary/${encodeURIComponent(term.id)}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({term:input.value})})); await loadVocabulary(); }
        catch (error) { document.querySelector('#vocabulary-status').textContent = error.message; }
      });
    });
    remove.addEventListener('click', async () => {
      try { await json(await fetch(`${API}/vocabulary/${encodeURIComponent(term.id)}`, {method:'DELETE'})); await loadVocabulary(); }
      catch (error) { document.querySelector('#vocabulary-status').textContent = error.message; }
    });
    row.append(name, edit, remove); container.append(row);
  }
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
function captureElapsedMs() {
  if (!capture) return 0;
  const paused = capture.pausedAt ? Date.now() - capture.pausedAt : 0;
  return Math.max(0, Date.now() - capture.startedAt - capture.totalPausedMs - paused);
}
function captureControls() {
  const active = Boolean(capture?.recorder && capture.recorder.state !== 'inactive');
  document.querySelector('#start-recording').hidden = active;
  document.querySelector('#stop-recording').hidden = !active;
  document.querySelector('#pause-recording').hidden = !active || !capture.recorder.pause;
  document.querySelector('#pause-recording').textContent = capture?.recorder?.state === 'paused' ? 'Resume' : 'Pause';
  document.querySelector('#recording-title').disabled = active;
  recordingTimer.textContent = time(captureElapsedMs() / 1000);
}
async function loadRecoveries() {
  const sessions = await json(await fetch(`${API}/recordings`));
  const container = document.querySelector('#recover-recordings'); container.replaceChildren();
  for (const session of sessions) {
    if (capture?.session.id === session.id) continue;
    const row = document.createElement('div'); row.className = 'recovery-row';
    const message = document.createElement('span');
    message.textContent = `${session.title} · ${session.chunk_count} saved chunks · interrupted recording`;
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Recover and save';
    button.disabled = session.chunk_count === 0;
    button.addEventListener('click', async () => {
      button.disabled = true; message.textContent = 'Checking and importing saved audio…';
      try {
        const result = await json(await fetch(`${API}/recordings/${encodeURIComponent(session.id)}/finalize`, {method:'POST'}));
        await loadRecoveries(); history.pushState({}, '', `/conversation/${encodeURIComponent(result.conversation.id)}`);
        await showDetail(result.conversation.id); setStatus('Recovered recording saved.', true);
      } catch (error) {message.textContent = `Recovery failed: ${error.message}`; button.disabled = false;}
    });
    const discard = document.createElement('button'); discard.type = 'button'; discard.textContent = 'Discard';
    discard.setAttribute('aria-label', `Discard unfinished recording ${session.title}`);
    discard.addEventListener('click', async () => {
      if (!window.confirm(`Discard unfinished recording “${session.title}”? Saved audio chunks will be deleted.`)) return;
      try {await json(await fetch(`${API}/recordings/${encodeURIComponent(session.id)}`, {method:'DELETE'})); await loadRecoveries();}
      catch (error) {message.textContent = `Could not discard recording: ${error.message}`;}
    });
    const actions = document.createElement('div'); actions.className = 'recovery-actions'; actions.append(button, discard);
    row.append(message, actions); container.append(row);
  }
}
function captureErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') return 'Microphone access was denied. Allow this site to use the microphone, then try again.';
  if (error?.name === 'NotFoundError') return 'No microphone was found. Connect one and try again.';
  if (error?.name === 'NotReadableError') return 'The microphone is busy or disconnected. Check the device and try again.';
  return error?.message || 'Recording could not start.';
}
async function startCapture() {
  if (capture) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    recordingState.textContent = 'Recording unavailable';
    recordingDetail.textContent = 'This browser does not provide microphone recording.';
    return;
  }
  const mediaType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find(candidate => MediaRecorder.isTypeSupported(candidate));
  if (!mediaType) { recordingDetail.textContent = 'This browser has no supported recording format.'; return; }
  recordingState.textContent = 'Requesting microphone access…';
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
    const recorder = new MediaRecorder(stream, {mimeType:mediaType});
    const session = await json(await fetch(`${API}/recordings`, {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title:document.querySelector('#recording-title').value.trim() || 'New recording',media_type:mediaType.split(';')[0]})}));
    capture = {recorder, stream, session, sequence:0, pending:Promise.resolve(), uploadError:null,
      startedAt:Date.now(), pausedAt:null, totalPausedMs:0, timer:null, stopping:false};
    recorder.addEventListener('dataavailable', event => {
      if (!event.data.size) return;
      const current = capture;
      const sequence = current.sequence++;
      current.pending = current.pending.then(async () => {
        if (current.uploadError) return;
        const response = await fetch(`${API}/recordings/${encodeURIComponent(session.id)}/chunks/${sequence}`,
          {method:'PUT',headers:{'Content-Type':session.media_type},body:event.data});
        await json(response);
        recordingDetail.textContent = `${sequence + 1} audio chunks saved on this device.`;
      }).catch(error => {
        current.uploadError = error;
        recordingState.textContent = 'Saving stopped';
        recordingDetail.textContent = `Local storage failed: ${error.message}. Stop recording, then recover saved chunks.`;
        if (recorder.state !== 'inactive') recorder.stop();
      });
    });
    recorder.addEventListener('stop', () => finishCapture());
    stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => {
      if (capture?.recorder === recorder && recorder.state !== 'inactive') {
        recordingState.textContent = 'Microphone disconnected';
        recordingDetail.textContent = 'Saving audio captured before the device stopped.';
        fetch(`${API}/recordings/${encodeURIComponent(session.id)}/events`, {method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({kind:'device_ended',media_position_ms:Math.round(captureElapsedMs())})}).catch(()=>{});
        recorder.stop();
      }
    }));
    recorder.start(1000);
    capture.timer = setInterval(captureControls, 250);
    recordingState.textContent = 'Recording'; recordingDetail.textContent = 'Microphone audio is saved locally every second.';
    captureControls(); await loadRecoveries();
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    if (capture?.recorder?.state === 'inactive') capture = null;
    captureControls();
    recordingState.textContent = 'Could not start recording';
    recordingDetail.textContent = captureErrorMessage(error);
    loadRecoveries().catch(() => {});
  }
}
async function finishCapture() {
  const current = capture;
  if (!current || current.stopping) return;
  current.stopping = true;
  clearInterval(current.timer);
  current.stream.getTracks().forEach(track => track.stop());
  recordingState.textContent = 'Saving recording…';
  await current.pending;
  capture = null; captureControls();
  if (current.uploadError) {
    recordingState.textContent = 'Recording interrupted';
    recordingDetail.textContent = 'Some audio could not be stored. Recover the chunks that were saved below.';
    await loadRecoveries(); return;
  }
  try {
    const result = await json(await fetch(`${API}/recordings/${encodeURIComponent(current.session.id)}/finalize`, {method:'POST'}));
    recordingState.textContent = 'Recording saved'; recordingDetail.textContent = 'Ready for on-device transcription.';
    await loadRecoveries();
    history.pushState({}, '', `/conversation/${encodeURIComponent(result.conversation.id)}`);
    await showDetail(result.conversation.id); setStatus('Recording saved.', true);
  } catch (error) {
    recordingState.textContent = 'Recording needs recovery'; recordingDetail.textContent = error.message;
    await loadRecoveries();
  }
}
document.querySelector('#record-button').addEventListener('click', () => {
  recordingPanel.hidden = !recordingPanel.hidden;
  if (!recordingPanel.hidden) recordingPanel.scrollIntoView({block:'start'});
});
document.querySelector('#start-recording').addEventListener('click', startCapture);
document.querySelector('#stop-recording').addEventListener('click', () => {
  if (capture?.recorder.state !== 'inactive') capture.recorder.stop();
});
document.querySelector('#pause-recording').addEventListener('click', async () => {
  if (!capture) return;
  const current = capture;
  const kind = current.recorder.state === 'paused' ? 'resume' : 'pause';
  const position = Math.round(captureElapsedMs());
  if (kind === 'pause') {current.recorder.pause(); current.pausedAt = Date.now(); recordingState.textContent = 'Paused';}
  else {current.totalPausedMs += Date.now() - current.pausedAt; current.pausedAt = null; current.recorder.resume(); recordingState.textContent = 'Recording';}
  captureControls();
  try {await json(await fetch(`${API}/recordings/${encodeURIComponent(current.session.id)}/events`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,media_position_ms:position})}));}
  catch (error) {recordingDetail.textContent = `Pause status could not be saved: ${error.message}`;}
});
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
transcriptView.addEventListener('mouseup', () => setTimeout(inspectSelection, 0));
transcriptView.addEventListener('keyup', event => { if (event.key === 'Shift' || event.key.startsWith('Arrow')) inspectSelection(); });
document.querySelector('#show-highlights').addEventListener('click', () => {
  highlightsOnly = !highlightsOnly;
  if (activeConversationId && currentTranscript) showTranscript(activeConversationId).catch(error => processingStatus.textContent = error.message);
});
window.addEventListener('popstate', () => route().catch(error => setStatus(error.message)));
document.querySelector('#vocabulary-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#vocabulary-input');
  try { await json(await fetch(`${API}/vocabulary`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({term:input.value})}));
    input.value = ''; document.querySelector('#vocabulary-status').textContent = 'Term saved for future on-device processing.'; await loadVocabulary();
    if (activeConversationId && currentTranscript) {processButton.hidden = false; processButton.textContent = 'Reprocess with vocabulary';}
  } catch (error) { document.querySelector('#vocabulary-status').textContent = error.message; }
});
document.querySelector('#vocabulary-panel').addEventListener('toggle', event => {
  if (event.target.open) event.target.scrollIntoView({block:'start'});
});
loadVocabulary().catch(error => document.querySelector('#vocabulary-status').textContent = error.message);
loadRecoveries().catch(error => setStatus(error.message));
route().catch(error => setStatus(error.message));
