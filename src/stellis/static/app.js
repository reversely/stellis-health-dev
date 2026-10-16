const fileInput = document.querySelector('#audio-file');
const status = document.querySelector('#status');
const list = document.querySelector('#conversation-list');
const dropZone = document.querySelector('#drop-zone');
const listView = document.querySelector('#list-view');
const detailView = document.querySelector('#detail-view');
const player = document.querySelector('#audio-player');
const API = '/api/v1';
const processButton = document.querySelector('#process-button');
const rematchButton = document.querySelector('#rematch-button');
const alignWordsButton = document.querySelector('#align-words-button');
const editTranscriptButton = document.querySelector('#edit-transcript-button');
const discardEditsButton = document.querySelector('#discard-edits-button');
const restorePassageButton = document.querySelector('#restore-passage-button');
const editStatus = document.querySelector('#edit-status');
const processingStatus = document.querySelector('#processing-status');
const transcriptView = document.querySelector('#transcript');
let activeConversationId = null;
let jobTimer = null;
let aiRunTimer = null;
let cleanRunTimer = null;
let cleanRuns = [];
let currentCleanRun = null;
let awaitingCleanRun = false;
let cleanEditMode = false;
let cleanEditError = null;
const pendingCleanEdits = new Map();
let transcriptSegments = [];
let currentTranscript = null;
let highlightsOnly = false;
let rematchChangesOnly = false;
let transcriptEditMode = false;
let focusedEditSegmentId = null;
let savingTranscriptEdits = false;
let transcriptEditError = null;
const pendingTranscriptEdits = new Map();
let selectedExcerpt = null;
let activeWordElement = null;
let lastIntentionalScroll = 0;
let lastAutoFollow = 0;
for (const name of ['wheel', 'touchstart', 'keydown']) window.addEventListener(name, () => { lastIntentionalScroll = Date.now(); }, {passive:true});
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
  clearTimeout(aiRunTimer);
  clearTimeout(cleanRunTimer);
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
  clearTimeout(aiRunTimer);
  clearTimeout(cleanRunTimer);
  cleanRuns = [];
  currentCleanRun = null;
  awaitingCleanRun = false;
  cleanEditMode = false;
  cleanEditError = null;
  pendingCleanEdits.clear();
  document.querySelector('#edited-tab').hidden = true;
  document.querySelector('#edited-transcript').replaceChildren();
  activeConversationId = id;
  rematchChangesOnly = false;
  transcriptEditMode = false;
  pendingTranscriptEdits.clear();
  focusedEditSegmentId = null;
  transcriptEditError = null;
  transcriptSegments = [];
  currentTranscript = null;
  syncTranscriptEditControls();
  transcriptView.replaceChildren();
  processingStatus.textContent = 'Checking local speech models…';
  processButton.hidden = true;
  rematchButton.hidden = true;
  const item = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}`));
  listView.hidden = true;
  detailView.hidden = false;
  document.querySelector('#page-title').textContent = item.title;
  document.querySelector('#page-subtitle').textContent = 'Replay and scrub through your recording.';
  document.querySelector('#audio-duration').textContent = time(item.duration_ms / 1000);
  player.src = `${API}/conversations/${encodeURIComponent(id)}/audio`;
  player.load();
  await loadSpeech(id);
  showConversationTab('transcript');
  await loadAIRuns(id);
  await loadCleanRuns(id);
}
function showConversationTab(tab) {
  const summary = tab === 'summary';
  const edited = tab === 'edited';
  document.querySelector('#ai-card').hidden = !summary;
  document.querySelector('#transcript-card').hidden = summary || edited;
  document.querySelector('#edited-card').hidden = !edited;
  document.querySelector('#summary-tab').setAttribute('aria-selected', String(summary));
  document.querySelector('#transcript-tab').setAttribute('aria-selected', String(!summary && !edited));
  document.querySelector('#edited-tab').setAttribute('aria-selected', String(edited));
}
function sourceButtons(ids) {
  const holder = document.createElement('span'); holder.className = 'ai-sources';
  for (const id of ids) {
    const segment = transcriptSegments.find(item => item.id === id);
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = segment ? `${time(segment.start_ms / 1000)} · ${segment.speaker_display_name}` : 'Source unavailable';
    button.disabled = !segment;
    button.addEventListener('click', async () => {
      if (!segment) return;
      highlightsOnly = false; showConversationTab('transcript');
      await showTranscript(activeConversationId);
      player.currentTime = segment.start_ms / 1000;
      player.play().catch(() => {});
      transcriptView.querySelector(`[data-segment-id="${id}"]`)?.scrollIntoView({block:'center'});
    });
    holder.append(button);
  }
  return holder;
}
function renderAIItems(title, items, container) {
  if (!items?.length) return;
  const section = document.createElement('section'); section.className = 'ai-result-section';
  const heading = document.createElement('h3'); heading.textContent = title; section.append(heading);
  const list = document.createElement('ul');
  for (const item of items) {
    const row = document.createElement('li');
    const text = document.createElement('p'); text.textContent = item.text;
    row.append(text, sourceButtons(item.source_segment_ids)); list.append(row);
  }
  section.append(list); container.append(section);
}
function renderAIRuns(runs) {
  const summaries = runs.filter(run => run.kind === 'summary');
  const latest = summaries[0];
  const summaryResults = document.querySelector('#summary-results'); summaryResults.replaceChildren();
  const button = document.querySelector('#generate-summary');
  button.disabled = latest?.state === 'running' || latest?.state === 'queued';
  button.textContent = latest?.state === 'failed' ? 'Retry summary' : latest?.stale ? 'Regenerate summary' : latest?.state === 'succeeded' ? 'Summary current' : 'Generate summary';
  if (latest?.state === 'succeeded') {
    if (latest.stale) {const stale = document.createElement('p'); stale.className = 'ai-stale'; stale.textContent = 'Transcript changed since this result. Regenerate to include corrections.'; summaryResults.append(stale);}
    for (const [field, title] of [['overview','Overview'],['topics','Topics'],['decisions','Decisions'],['action_items','Action proposals']])
      renderAIItems(title, latest.result[field], summaryResults);
  }
  const status = document.querySelector('#ai-status');
  status.textContent = latest?.state === 'failed' ? `Summary stopped: ${latest.error_message}` :
    latest?.state === 'running' || latest?.state === 'queued' ? `Generating summary · ${latest.stage}` :
    latest?.state === 'succeeded' ? `Source-backed summary · ${latest.model_id} · ${latest.usage.total_tokens || 0} tokens` :
    'Generate a summary after the on-device transcript is ready.';
  const answers = document.querySelector('#ai-answers'); answers.replaceChildren();
  for (const run of runs.filter(item => item.kind === 'answer')) {
    const card = document.createElement('article'); card.className = 'ai-answer';
    const q = document.createElement('h4'); q.textContent = run.question; card.append(q);
    const body = document.createElement('p');
    body.textContent = run.state === 'succeeded' ? run.result.answer :
      run.state === 'failed' ? `Could not answer: ${run.error_message}` : `Answering · ${run.stage}`;
    card.append(body);
    if (run.stale) {const badge = document.createElement('small'); badge.textContent = 'Transcript changed since this answer'; card.append(badge);}
    if (run.state === 'succeeded') card.append(sourceButtons(run.result.source_segment_ids));
    if (run.state === 'failed') {
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry answer';
      retry.addEventListener('click', () => startAIRun('answer', run.question)); card.append(retry);
    }
    answers.append(card);
  }
}
async function loadAIRuns(id) {
  clearTimeout(aiRunTimer);
  const runs = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/ai-runs`));
  if (id !== activeConversationId) return;
  renderAIRuns(runs);
  if (runs.some(run => run.state === 'queued' || run.state === 'running'))
    aiRunTimer = setTimeout(() => loadAIRuns(id).catch(error => document.querySelector('#ai-status').textContent = error.message), 2000);
}
async function startAIRun(kind, question = null) {
  const id = activeConversationId;
  const status = document.querySelector('#ai-status'); status.textContent = 'Starting Nemotron request…';
  try {
    await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/ai-runs`, {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({kind,question})}));
    await loadAIRuns(id);
  } catch (error) { status.textContent = error.message; }
}
document.querySelector('#summary-tab').addEventListener('click', () => {
  showConversationTab('summary');
  if (activeConversationId) loadAIRuns(activeConversationId).catch(error => document.querySelector('#ai-status').textContent = error.message);
});
document.querySelector('#transcript-tab').addEventListener('click', () => showConversationTab('transcript'));
document.querySelector('#edited-tab').addEventListener('click', () => showConversationTab('edited'));
document.querySelector('#generate-summary').addEventListener('click', () => startAIRun('summary'));
document.querySelector('#clean-button').addEventListener('click', async () => {
  const id = activeConversationId;
  const status = document.querySelector('#clean-status');
  status.textContent = 'Starting transcript cleanup…';
  awaitingCleanRun = true;
  try {
    await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/clean-runs`, {method:'POST'}));
    await loadCleanRuns(id);
  } catch (error) { awaitingCleanRun = false; status.textContent = error.message; }
});
document.querySelector('#clean-version').addEventListener('change', event => {
  if (pendingCleanEdits.size && !window.confirm('Discard unsaved edited transcript changes and switch versions?')) {
    event.target.value = currentCleanRun.id; return;
  }
  pendingCleanEdits.clear(); cleanEditMode = false; cleanEditError = null;
  currentCleanRun = cleanRuns.find(run => run.id === event.target.value) || null;
  renderCleanRun();
});
async function loadCleanRuns(id) {
  clearTimeout(cleanRunTimer);
  const runs = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/clean-runs`));
  if (id !== activeConversationId) return;
  cleanRuns = runs;
  if (cleanEditMode && pendingCleanEdits.size) return;
  const previous = currentCleanRun?.id;
  currentCleanRun = runs.find(run => run.id === previous) || runs.find(run => run.state === 'succeeded') || runs[0] || null;
  const button = document.querySelector('#clean-button');
  const latest = runs[0];
  button.disabled = latest?.state === 'queued' || latest?.state === 'running' || !currentTranscript;
  button.textContent = latest?.state === 'failed' ? 'Retry cleanup' : latest?.state === 'succeeded' && !latest.stale ? 'Transcript cleaned' : 'Clean transcript';
  document.querySelector('#edited-tab').hidden = !runs.some(run => run.state === 'succeeded');
  const version = document.querySelector('#clean-version');
  version.replaceChildren();
  for (const run of runs.filter(item => item.state === 'succeeded')) {
    const option = document.createElement('option');
    option.value = run.id;
    option.textContent = `${new Date(run.created_at).toLocaleString()}${run.stale ? ' · source changed' : ''}`;
    version.append(option);
  }
  if (currentCleanRun?.state === 'succeeded') version.value = currentCleanRun.id;
  renderCleanRun();
  if (awaitingCleanRun && latest?.state === 'succeeded') {
    awaitingCleanRun = false; currentCleanRun = latest; version.value = latest.id; renderCleanRun(); showConversationTab('edited');
  }
  if (awaitingCleanRun && latest?.state === 'failed') awaitingCleanRun = false;
  if ((latest?.state === 'running' || latest?.state === 'queued') && currentCleanRun?.id !== latest.id)
    document.querySelector('#clean-status').textContent = `Cleaning new version · ${latest.stage}. An earlier version remains available.`;
  if (runs.some(run => run.state === 'queued' || run.state === 'running'))
    cleanRunTimer = setTimeout(() => loadCleanRuns(id).catch(error => document.querySelector('#clean-status').textContent = error.message), 2000);
}
function syncCleanEditControls() {
  document.querySelector('#clean-edit-button').textContent = cleanEditMode ? 'Done' : 'Edit transcript';
  document.querySelector('#clean-discard-button').hidden = !cleanEditMode;
  if (cleanEditMode) document.querySelector('#clean-status').textContent = cleanEditError ||
    (pendingCleanEdits.size ? `${pendingCleanEdits.size} passage${pendingCleanEdits.size === 1 ? '' : 's'} pending · Press Done to save` : 'Edit wording in place. Press Done to finish.');
}
function setCleanEditMode(enabled) {
  cleanEditMode = enabled; cleanEditError = null;
  const segments = new Map((currentCleanRun?.result?.segments || []).map(item => [item.id, item]));
  for (const turn of document.querySelectorAll('#edited-transcript .clean-turn')) turn.classList.toggle('editing', enabled);
  for (const row of document.querySelectorAll('#edited-transcript .clean-segment')) {
    const words = row.querySelector('.segment-text');
    if (enabled) {
      words.contentEditable = 'true'; words.spellcheck = true;
      words.setAttribute('role', 'textbox'); words.setAttribute('aria-label', `Edit cleaned passage at ${time(segments.get(row.dataset.segmentId).start_ms / 1000)}`);
    } else { words.contentEditable = 'false'; words.removeAttribute('role'); }
  }
  document.querySelector('#clean-compare').hidden = true;
  syncCleanEditControls();
}
async function finishCleanEdit() {
  if (!pendingCleanEdits.size) { setCleanEditMode(false); renderCleanRun(); return; }
  const edits = [...pendingCleanEdits].map(([segment_id,text]) => ({segment_id,text:text.trim()}));
  if (edits.some(item => !item.text)) { cleanEditError = 'A passage is empty. Restore or enter words before saving.'; syncCleanEditControls(); return; }
  const button = document.querySelector('#clean-edit-button'); button.disabled = true;
  document.querySelector('#clean-status').textContent = `Saving ${edits.length} passages…`;
  try {
    await json(await fetch(`${API}/clean-runs/${encodeURIComponent(currentCleanRun.id)}/segments`, {
      method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({edits,expected_revision:currentCleanRun.edit_revision}),
    }));
    pendingCleanEdits.clear(); cleanEditMode = false;
    await loadCleanRuns(activeConversationId);
    document.querySelector('#clean-status').textContent = `${edits.length} edited passage${edits.length === 1 ? '' : 's'} saved.`;
  } catch (error) { cleanEditError = `${error.message}. Your unsaved wording remains here.`; syncCleanEditControls(); }
  finally { button.disabled = false; }
}
document.querySelector('#clean-edit-button').addEventListener('click', () => {
  if (cleanEditMode) finishCleanEdit(); else setCleanEditMode(true);
});
document.querySelector('#clean-discard-button').addEventListener('click', async () => {
  if (pendingCleanEdits.size && !window.confirm('Discard unsaved edited transcript changes?')) return;
  pendingCleanEdits.clear(); cleanEditMode = false; cleanEditError = null; renderCleanRun();
});
function renderCleanRun() {
  const run = currentCleanRun;
  const status = document.querySelector('#clean-status');
  const view = document.querySelector('#edited-transcript');
  view.replaceChildren();
  if (!run) { status.textContent = 'Use Clean transcript in Summary & AI to create an edited version.'; return; }
  if (run.state !== 'succeeded') { status.textContent = run.state === 'failed' ? `Cleanup stopped: ${run.error_message}` : `Cleaning transcript · ${run.stage}`; return; }
  const segments = run.result.segments;
  const review = segments.filter(segment => segment.needs_review && !segment.reviewed).length;
  status.textContent = `${segments.length} passages · ${review} awaiting audio review${run.stale ? ' · Source transcript has changed' : ''}`;
  for (const group of groupTranscriptSegments(segments)) {
    const turn = document.createElement('article'); turn.className = 'speaker-turn clean-turn';
    const heading = document.createElement('div'); heading.className = 'turn-heading';
    const speaker = document.createElement('strong'); speaker.textContent = group[0].speaker_display_name;
    const range = document.createElement('span');
    range.textContent = `${time(group[0].start_ms / 1000)}${group.length > 1 ? `–${time(group.at(-1).end_ms / 1000)}` : ''}`;
    heading.append(speaker, range); turn.append(heading);
    const body = document.createElement('div'); body.className = 'turn-body';
    for (const segment of group) {
      const row = document.createElement('span'); row.className = 'segment clean-segment'; row.dataset.segmentId = segment.id;
      row.title = `Play from ${time(segment.start_ms / 1000)}${segment.needs_review ? ' · Check wording against audio' : ''}`;
      const words = document.createElement('span'); words.className = 'segment-text'; words.textContent = segment.text;
      row.append(words);
      if (segment.needs_review) { const reviewBadge = document.createElement('span'); reviewBadge.className = 'clean-review'; reviewBadge.textContent = segment.reviewed ? 'Reviewed' : 'Review'; row.append(reviewBadge); }
      const compare = document.createElement('button'); compare.type = 'button'; compare.className = 'clean-compare-button'; compare.textContent = 'Compare';
      compare.setAttribute('aria-label', `Compare edited and original passage at ${time(segment.start_ms / 1000)}`);
      compare.addEventListener('click', () => showCleanCompare(segment)); row.append(compare);
      words.addEventListener('input', () => {
        if (!cleanEditMode) return;
        const value = words.innerText.replace(/\u00a0/g, ' ');
        if (value === segment.text) pendingCleanEdits.delete(segment.id);
        else pendingCleanEdits.set(segment.id, value);
        cleanEditError = null; syncCleanEditControls();
      });
      row.addEventListener('click', event => {
        if (cleanEditMode || event.target.closest('button,textarea') || window.getSelection()?.toString().trim()) return;
        player.currentTime = segment.start_ms / 1000;
        player.play().catch(() => {});
      });
      body.append(row);
    }
    turn.append(body); view.append(turn);
  }
  if (cleanEditMode) setCleanEditMode(true);
  else syncCleanEditControls();
}
function showCleanCompare(segment) {
  const panel = document.querySelector('#clean-compare'); panel.replaceChildren(); panel.hidden = false;
  const title = document.createElement('h3'); title.textContent = `Passage at ${time(segment.start_ms / 1000)} · ${segment.speaker_display_name}`;
  const source = document.createElement('p'); source.textContent = `Original: ${segment.source_text}`;
  const edited = document.createElement('p'); edited.textContent = `Edited: ${segment.text}`;
  const actions = document.createElement('div'); actions.className = 'editor-actions';
  const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Play source';
  play.addEventListener('click', () => { player.currentTime = segment.start_ms / 1000; player.play().catch(() => {}); });
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy edited';
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(segment.text); document.querySelector('#clean-status').textContent = `Copied passage at ${time(segment.start_ms / 1000)}. Check it against audio before quoting.`; }
    catch { document.querySelector('#clean-status').textContent = 'Clipboard is unavailable in this browser.'; }
  });
  const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = 'Use exact source';
  restore.addEventListener('click', () => {
    setCleanEditMode(true);
    const words = document.querySelector(`#edited-transcript [data-segment-id="${segment.id}"] .segment-text`);
    words.textContent = segment.source_text; words.dispatchEvent(new Event('input', {bubbles:true}));
    words.scrollIntoView({block:'center'}); words.focus();
  });
  actions.append(play, copy, restore);
  if (segment.user_edited) {
    const generated = document.createElement('button'); generated.type = 'button'; generated.textContent = 'Use generated wording';
    generated.addEventListener('click', () => {
      setCleanEditMode(true);
      const words = document.querySelector(`#edited-transcript [data-segment-id="${segment.id}"] .segment-text`);
      words.textContent = segment.model_text; words.dispatchEvent(new Event('input', {bubbles:true}));
      words.scrollIntoView({block:'center'}); words.focus();
    }); actions.append(generated);
  }
  if (segment.needs_review && !segment.reviewed) {
    const checked = document.createElement('button'); checked.type = 'button'; checked.textContent = 'Mark checked';
    checked.addEventListener('click', async () => {
      checked.disabled = true;
      try {
        await json(await fetch(`${API}/clean-runs/${encodeURIComponent(currentCleanRun.id)}/segments/${encodeURIComponent(segment.id)}/review`, {
          method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_revision:currentCleanRun.edit_revision})}));
        panel.hidden = true; await loadCleanRuns(activeConversationId);
      } catch (error) { checked.disabled = false; document.querySelector('#clean-status').textContent = error.message; }
    }); actions.append(checked);
  }
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close'; close.addEventListener('click', () => { panel.hidden = true; }); actions.append(close);
  panel.append(title, source, edited, actions); panel.scrollIntoView({block:'start'});
}
document.querySelector('#ai-question-form').addEventListener('submit', event => {
  event.preventDefault(); const input = document.querySelector('#ai-question-input');
  const question = input.value.trim(); if (!question) return;
  input.value = ''; startAIRun('answer', question);
});
async function loadSpeech(id) {
  const [capabilities, existing] = await Promise.all([
    json(await fetch(`${API}/capabilities`)),
    json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/processing-job`)),
  ]);
  if (id !== activeConversationId) return;
  if (existing?.state === 'succeeded') { await showTranscript(id);
    if (existing.kind !== 'rematch' && existing.pipeline_version !== capabilities.pipeline_version) { processButton.hidden = false; processButton.textContent = 'Reprocess with vocabulary'; }
    return; }
  if (existing?.state === 'queued' || existing?.state === 'running') {
    if (existing.kind === 'word_alignment') await showTranscript(id);
    watchJob(existing); return;
  }
  if (!capabilities.features.transcribe || !capabilities.features.diarize) {
    processingStatus.textContent = 'Local speech models are unavailable. Install them to transcribe this recording on this device.';
    return;
  }
  if (existing?.state === 'failed') {
    if (existing.kind === 'rematch') { await showTranscript(id); rematchButton.hidden = false; rematchButton.textContent = 'Retry speaker rematch'; }
    else if (existing.kind === 'word_alignment') { await showTranscript(id); alignWordsButton.hidden = false; alignWordsButton.textContent = 'Retry word timing'; }
    else { processButton.hidden = false; processButton.textContent = 'Retry processing'; }
    processingStatus.textContent = `${existing.kind === 'rematch' ? 'Speaker rematch' : existing.kind === 'word_alignment' ? 'Word timing' : 'Processing'} stopped: ${existing.error || 'Unknown error'}`;
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
    processingStatus.textContent = `${job.kind === 'rematch' ? 'Speaker rematch' : job.kind === 'word_alignment' ? 'Word timing' : 'Processing'} stopped: ${job.error || 'Unknown error'}`;
    if (job.kind === 'rematch') { rematchButton.hidden = false; rematchButton.disabled = false; rematchButton.textContent = 'Retry speaker rematch'; }
    else if (job.kind === 'word_alignment') { alignWordsButton.hidden = false; alignWordsButton.disabled = false; alignWordsButton.textContent = 'Retry word timing'; }
    else { processButton.hidden = false; processButton.textContent = 'Retry processing'; }
    return;
  }
  processingStatus.textContent = `${job.stage.charAt(0).toUpperCase() + job.stage.slice(1)} on this device · ${Math.round(job.progress * 100)}%`;
  jobTimer = setTimeout(async () => {
    try { watchJob(await json(await fetch(`${API}/jobs/${encodeURIComponent(job.id)}`))); }
    catch (error) { processingStatus.textContent = error.message; }
  }, 1500);
}
function groupTranscriptSegments(segments) {
  const turns = [];
  for (const segment of segments) {
    const current = turns.at(-1);
    const previous = current?.at(-1);
    const resolved = item => item.speaker_label_source?.startsWith('manual') || (item.speaker_cluster_id && !item.speaker_uncertain);
    const sameTurn = previous && resolved(previous) && resolved(segment) &&
      previous.speaker_display_name === segment.speaker_display_name &&
      segment.start_ms - previous.end_ms <= 1500;
    if (sameTurn) current.push(segment);
    else turns.push([segment]);
  }
  return turns;
}
function syncTranscriptEditControls() {
  editTranscriptButton.hidden = !currentTranscript;
  editTranscriptButton.disabled = savingTranscriptEdits;
  editTranscriptButton.textContent = transcriptEditMode ? 'Done' : 'Edit transcript';
  discardEditsButton.hidden = !transcriptEditMode;
  discardEditsButton.disabled = savingTranscriptEdits;
  restorePassageButton.hidden = !transcriptEditMode || !focusedEditSegmentId;
  editStatus.hidden = !transcriptEditMode;
  if (transcriptEditMode && !savingTranscriptEdits)
    editStatus.textContent = transcriptEditError || (pendingTranscriptEdits.size ? `${pendingTranscriptEdits.size} passage${pendingTranscriptEdits.size === 1 ? '' : 's'} pending · Press Done to save` : 'Edit words in place. Press Done to finish.');
}
function setTranscriptEditMode(enabled) {
  transcriptEditMode = enabled;
  transcriptEditError = null;
  focusedEditSegmentId = null;
  for (const turn of transcriptView.querySelectorAll('.speaker-turn')) turn.classList.toggle('editing', enabled);
  for (const row of transcriptView.querySelectorAll('.segment')) {
    const words = row.querySelector('.segment-text');
    const segment = transcriptSegments.find(item => item.id === row.dataset.segmentId);
    if (!words || !segment) continue;
    if (enabled) {
      words.replaceChildren(document.createTextNode(segment.text));
      words.contentEditable = 'true'; words.spellcheck = true;
      words.setAttribute('role', 'textbox'); words.setAttribute('aria-multiline', 'true');
      words.setAttribute('aria-label', `Edit transcript at ${time(segment.start_ms / 1000)}`);
    } else {
      words.contentEditable = 'false'; words.removeAttribute('role'); words.removeAttribute('aria-multiline');
    }
  }
  syncTranscriptEditControls();
}
async function finishTranscriptEdit() {
  if (savingTranscriptEdits) return;
  if (!pendingTranscriptEdits.size) { setTranscriptEditMode(false); await showTranscript(activeConversationId); return; }
  const edits = [...pendingTranscriptEdits].map(([segment_id,text]) => ({segment_id,text:text.trim()}));
  if (edits.some(item => !item.text)) { editStatus.textContent = 'A passage is empty. Restore or enter words before saving.'; return; }
  savingTranscriptEdits = true; syncTranscriptEditControls(); editStatus.textContent = `Saving ${edits.length} passages…`;
  try {
    await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/transcript/segments`, {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({edits,expected_revision:currentTranscript.revision}),
    }));
    pendingTranscriptEdits.clear();
    transcriptEditMode = false;
    await showTranscript(activeConversationId);
    processingStatus.textContent = `${edits.length} transcript passage${edits.length === 1 ? '' : 's'} saved.`;
  } catch (error) { transcriptEditError = `${error.message} Your unsaved wording remains here.`; }
  finally { savingTranscriptEdits = false; syncTranscriptEditControls(); }
}
editTranscriptButton.addEventListener('click', () => {
  if (transcriptEditMode) finishTranscriptEdit();
  else setTranscriptEditMode(true);
});
discardEditsButton.addEventListener('click', async () => {
  if (pendingTranscriptEdits.size && !window.confirm('Discard unsaved transcript changes?')) return;
  pendingTranscriptEdits.clear(); setTranscriptEditMode(false); await showTranscript(activeConversationId);
});
restorePassageButton.addEventListener('click', () => {
  const segment = transcriptSegments.find(item => item.id === focusedEditSegmentId);
  const words = transcriptView.querySelector(`[data-segment-id="${focusedEditSegmentId}"] .segment-text`);
  if (!segment || !words) return;
  words.textContent = segment.original_text || segment.text;
  words.dispatchEvent(new Event('input', {bubbles:true})); words.focus();
});
window.addEventListener('beforeunload', event => {
  if (!pendingTranscriptEdits.size && !pendingCleanEdits.size) return;
  event.preventDefault(); event.returnValue = '';
});
async function showTranscript(id) {
  if (transcriptEditMode && pendingTranscriptEdits.size) {
    editStatus.textContent = 'Unsaved wording remains here. Press Done before refreshing the transcript.';
    return;
  }
  const data = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/transcript`));
  if (id !== activeConversationId) return;
  const previousScroll = window.scrollY;
  currentTranscript = data;
  syncTranscriptEditControls();
  document.querySelector('#clean-button').disabled = cleanRuns[0]?.state === 'queued' || cleanRuns[0]?.state === 'running';
  rematchButton.hidden = false;
  alignWordsButton.hidden = data.segments.some(segment => segment.words?.length);
  alignWordsButton.disabled = false;
  rematchButton.disabled = data.generation_version.includes('-speaker-embedding-v1');
  rematchButton.textContent = rematchButton.disabled ? 'Speakers rematched' : 'Rematch speakers';
  transcriptSegments = data.segments;
  transcriptView.replaceChildren();
  hideSelectionToolbar();
  document.querySelector('#highlight-count').textContent = `${data.highlights.length} highlights`;
  document.querySelector('#show-highlights').setAttribute('aria-pressed', String(highlightsOnly));
  const changed = data.segments.filter(segment => segment.raw_speaker_cluster_id !== undefined && segment.raw_speaker_cluster_id !== segment.speaker_cluster_id).length;
  const changesButton = document.querySelector('#show-rematch-changes');
  changesButton.hidden = !data.generation_version.includes('-speaker-embedding-v1');
  if (changesButton.hidden) rematchChangesOnly = false;
  changesButton.setAttribute('aria-pressed', String(rematchChangesOnly));
  document.querySelector('#rematch-change-count').textContent = changesButton.hidden ? '' : `${changed} changed`;
  const counts = new Map();
  for (const segment of data.segments) if (segment.speaker_cluster_id) counts.set(segment.speaker_cluster_id, (counts.get(segment.speaker_cluster_id) || 0) + 1);
  const clusterRank = new Map([...new Set(data.segments.map(segment => segment.speaker_cluster_id).filter(Boolean))].map((id, index) => [id, index + 1]));
  const summary = document.createElement('div');
  summary.className = 'speaker-summary';
  for (const [cluster, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    const pill = document.createElement('span');
    pill.className = 'speaker-pill';
    const manual = data.speaker_labels.find(label => label.scope === 'cluster' && label.target_id === cluster);
    pill.textContent = `${manual ? manual.name : `Speaker ${clusterRank.get(cluster)}`} · ${count}`;
    summary.append(pill);
  }
  transcriptView.append(summary);
  const turns = groupTranscriptSegments(data.segments);
  for (const group of turns) {
    const visible = group.filter(segment =>
      (!highlightsOnly || data.highlights.some(item => item.segment_id === segment.id)) &&
      (!rematchChangesOnly || segment.raw_speaker_cluster_id !== segment.speaker_cluster_id));
    if (!visible.length) continue;
    const turn = document.createElement('article');
    turn.className = 'speaker-turn';
    turn.classList.toggle('editing', transcriptEditMode);
    const heading = document.createElement('div'); heading.className = 'turn-heading';
    const turnSpeaker = document.createElement('button'); turnSpeaker.type = 'button';
    turnSpeaker.textContent = visible[0].speaker_display_name;
    turnSpeaker.setAttribute('aria-label', `Edit speaker label for turn at ${time(visible[0].start_ms / 1000)}`);
    const firstSegment = visible[0];
    turnSpeaker.addEventListener('click', () => {
      if (pendingTranscriptEdits.size) { editStatus.textContent = 'Press Done to save word changes before changing a speaker.'; return; }
      if (!transcriptEditMode) setTranscriptEditMode(true);
      showSpeakerEditor(turn.querySelector('.segment'), firstSegment);
    });
    const range = document.createElement('span'); range.textContent = `${time(visible[0].start_ms / 1000)}${visible.length > 1 ? `–${time(visible.at(-1).end_ms / 1000)}` : ''}`;
    heading.append(turnSpeaker, range);
    turn.append(heading);
    const body = document.createElement('div'); body.className = 'turn-body';
    for (const segment of visible) {
    const highlights = data.highlights.filter(item => item.segment_id === segment.id);
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
    speaker.className = 'segment-speaker';
    speaker.textContent = '⋯';
    speaker.setAttribute('aria-label', `Edit speaker label for ${segment.speaker_display_name} at ${time(segment.start_ms / 1000)}`);
    if (segment.speaker_match_source === 'embedding_suggestion') speaker.title = 'Suggested from this passage’s voice; click to confirm or edit';
    if (segment.speaker_match_source === 'unresolved') speaker.title = 'Speaker unresolved; click to assign';
    speaker.addEventListener('click', () => showSpeakerEditor(row, segment));
    const words = document.createElement('div');
    words.className = 'segment-text';
    words.setAttribute('aria-label', `Transcript at ${time(segment.start_ms / 1000)}: ${segment.text}. Select text to highlight or click to play.`);
    renderHighlightedText(words, segment.text, highlights, segment.words || []);
    words.addEventListener('input', () => {
      if (!transcriptEditMode) return;
      const value = words.innerText.replace(/\u00a0/g, ' ');
      if (value === segment.text) pendingTranscriptEdits.delete(segment.id);
      else pendingTranscriptEdits.set(segment.id, value);
      transcriptEditError = null;
      syncTranscriptEditControls();
    });
    words.addEventListener('focus', () => { focusedEditSegmentId = segment.id; syncTranscriptEditControls(); });
    row.addEventListener('click', event => {
      if (transcriptEditMode) return;
      if (event.target.closest('button,input,textarea,select') || window.getSelection()?.toString().trim()) return;
      const timed = event.target.closest('.timed-word');
      if (timed && row.contains(timed)) { player.currentTime = Number(timed.dataset.startMs) / 1000; player.play().catch(() => {}); }
      else seek();
    });
    row.append(stamp, speaker, words);
    body.append(row);
    }
    turn.append(body);
    transcriptView.append(turn);
  }
  const unresolved = data.segments.filter(segment => !segment.speaker_cluster_id).length;
  processingStatus.textContent = `${data.segments.length} on-device segments in ${turns.length} turns · ${counts.size} acoustic speaker groups${unresolved ? ` · ${unresolved} unresolved` : ''}. Click a word or passage to play; drag across words to highlight.`;
  if (transcriptEditMode) setTranscriptEditMode(true);
  if (cleanRuns.length) loadCleanRuns(id).catch(error => document.querySelector('#clean-status').textContent = error.message);
  window.scrollTo(0, previousScroll);
}
function renderHighlightedText(container, value, highlights, timedWords = []) {
  const valid = highlights.filter(item => value.slice(item.start_offset, item.end_offset) === item.quote);
  const measured = timedWords.map((word, index) => ({...word, index})).filter(word => value.slice(word.start_offset, word.end_offset) === word.text && word.end_ms > word.start_ms);
  const edges = [...new Set([0, value.length, ...valid.flatMap(item => [item.start_offset, item.end_offset]),
    ...measured.flatMap(word => [word.start_offset, word.end_offset])])].sort((a, b) => a - b);
  let currentWord = null;
  let currentWordIndex = -1;
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i], end = edges[i + 1];
    const content = value.slice(start, end);
    const marked = valid.some(item => item.start_offset <= start && item.end_offset >= end);
    const wordIndex = measured.findIndex(word => word.start_offset <= start && word.end_offset >= end);
    if (wordIndex !== currentWordIndex) {
      currentWordIndex = wordIndex; currentWord = null;
      if (wordIndex >= 0) {
        const word = measured[wordIndex]; currentWord = document.createElement('span');
        currentWord.className = 'timed-word'; currentWord.dataset.wordIndex = String(word.index);
        currentWord.dataset.startMs = String(word.start_ms); currentWord.dataset.endMs = String(word.end_ms);
        currentWord.title = `Play from ${time(word.start_ms / 1000)} · measured on this device`;
        container.append(currentWord);
      }
    }
    const node = marked ? document.createElement('mark') : document.createTextNode(content);
    if (marked) { node.textContent = content; node.title = 'Highlighted excerpt'; }
    (currentWord || container).append(node);
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
  if (transcriptEditMode) return;
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
  if ((pendingTranscriptEdits.size || pendingCleanEdits.size) && (!match || decodeURIComponent(match[1]) !== activeConversationId)) {
    if (!window.confirm('Discard unsaved transcript changes and leave this conversation?')) {
      history.pushState({}, '', `/conversation/${encodeURIComponent(activeConversationId)}`);
      return;
    }
  }
  if (match) await showDetail(decodeURIComponent(match[1]));
  else await showList();
}
async function importFile(file) {
  if (!file) return;
  if ((pendingTranscriptEdits.size || pendingCleanEdits.size) && !window.confirm('Discard unsaved transcript changes and import another recording?')) return;
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
  activeWordElement?.classList.remove('active-word'); activeWordElement = null;
  const activeWord = active?.words?.find(word => word.start_ms <= ms && ms < word.end_ms);
  if (activeWord) {
    const index = active.words.indexOf(activeWord);
    activeWordElement = transcriptView.querySelector(`[data-segment-id="${active.id}"] [data-word-index="${index}"]`);
    activeWordElement?.classList.add('active-word');
    if (activeWordElement && !document.querySelector('#transcript-card').hidden && !player.paused &&
        Date.now() - lastIntentionalScroll > 2500 && Date.now() - lastAutoFollow > 700) {
      const rect = activeWordElement.getBoundingClientRect();
      if (rect.top < 90 || rect.bottom > window.innerHeight - 130) {
        lastAutoFollow = Date.now(); activeWordElement.scrollIntoView({block:'center',behavior:'smooth'});
      }
    }
  }
  const edited = document.querySelector('#edited-transcript');
  for (const row of edited.querySelectorAll('.segment.active')) row.classList.remove('active');
  if (active) edited.querySelector(`[data-segment-id="${active.id}"]`)?.classList.add('active');
});
processButton.addEventListener('click', () => beginProcessing(activeConversationId));
alignWordsButton.addEventListener('click', async () => {
  if (!activeConversationId) return;
  alignWordsButton.disabled = true;
  processingStatus.textContent = 'Starting on-device word timing…';
  try {
    const job = await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/word-alignment`, {method:'POST'}));
    watchJob(job);
  } catch (error) { processingStatus.textContent = error.message; alignWordsButton.disabled = false; }
});
rematchButton.addEventListener('click', async () => {
  if (!activeConversationId) return;
  rematchButton.disabled = true;
  processingStatus.textContent = 'Starting on-device speaker rematch…';
  try {
    const job = await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/speaker-rematch`, {method:'POST'}));
    watchJob(job);
  } catch (error) {
    processingStatus.textContent = error.message;
    rematchButton.disabled = false;
  }
});
transcriptView.addEventListener('mouseup', () => setTimeout(inspectSelection, 0));
transcriptView.addEventListener('keyup', event => { if (event.key === 'Shift' || event.key.startsWith('Arrow')) inspectSelection(); });
document.querySelector('#show-highlights').addEventListener('click', () => {
  highlightsOnly = !highlightsOnly;
  if (activeConversationId && currentTranscript) showTranscript(activeConversationId).catch(error => processingStatus.textContent = error.message);
});
document.querySelector('#show-rematch-changes').addEventListener('click', () => {
  rematchChangesOnly = !rematchChangesOnly;
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
