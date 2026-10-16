const fileInput = document.querySelector('#audio-file');
const status = document.querySelector('#status');
const list = document.querySelector('#conversation-list');
const dropZone = document.querySelector('#drop-zone');
const importDialog = document.querySelector('#import-dialog');
const importStatus = document.querySelector('#import-status');
const listView = document.querySelector('#list-view');
const detailView = document.querySelector('#detail-view');
const player = document.querySelector('#audio-player');
const seekSlider = document.querySelector('#seek-slider');
const playPauseButton = document.querySelector('#play-pause');
const skipSilenceCheckbox = document.querySelector('#skip-silence');
const skipSilenceStatus = document.querySelector('#skip-silence-status');
let silenceSpans = [];
let silenceScanTimer = null;
let manualSeekUntil = 0;
const API = '/api/v1';
const conversationMore = document.querySelector('#conversation-more');
conversationMore.addEventListener('click', event => { if (event.target.closest('button')) conversationMore.open = false; });
document.addEventListener('pointerdown', event => { if (!conversationMore.contains(event.target)) conversationMore.open = false; });
conversationMore.addEventListener('keydown', event => {
  if (event.key === 'Escape') { conversationMore.open = false; conversationMore.querySelector('summary').focus(); }
});
const themeButton = document.querySelector('#theme-toggle');
function syncThemeButton() {
  const light = document.documentElement.dataset.theme === 'light';
  themeButton.textContent = light ? 'Dark mode' : 'Light mode';
  themeButton.setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} mode`);
  document.querySelector('meta[name="theme-color"]').content = light ? '#f7f8fb' : '#0a1020';
}
syncThemeButton();
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('stellis-theme', theme); } catch {}
  syncThemeButton();
});
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
let generationReview = null;
let highlightsOnly = false;
let rematchChangesOnly = false;
let transcriptEditMode = false;
let focusedEditSegmentId = null;
let savingTranscriptEdits = false;
let transcriptEditError = null;
const pendingTranscriptEdits = new Map();
let selectedExcerpt = null;
let commentsOpen = false;
let activeWordElement = null;
let lastIntentionalScroll = 0;
let lastAutoFollow = 0;
for (const name of ['wheel', 'touchstart', 'keydown']) window.addEventListener(name, () => { lastIntentionalScroll = Date.now(); }, {passive:true});
const recordingPanel = document.querySelector('#recording-panel');
const recordingState = document.querySelector('#recording-state');
const recordingDetail = document.querySelector('#recording-detail');
const recordingTimer = document.querySelector('#recording-timer');
let capture = null;
let captureRequesting = false;
let captureFinalizing = false;
let captureHeartbeatId = null;
let captureHeartbeatAt = 0;
// A fresh local heartbeat keeps another tab from offering recovery during capture.
const recordingHeartbeatKey = id => `stellis-recording-live-${id}`;
function clearCaptureHeartbeat(id) {
  if (captureHeartbeatId !== id) return;
  try { localStorage.removeItem(recordingHeartbeatKey(id)); } catch {}
  captureHeartbeatId = null;
}
let recordingChatTimer = null;
let recordingPrimaryView = 'notes';
let librarySearchResults = [];
let librarySearchTotal = 0;
let librarySearchLimited = false;
let libraryCategories = [];
let libraryConversations = [];
let activePersonId = null;
let transcriptSearchMatches = [];
let transcriptSearchIndex = -1;

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
  if (response.status === 401) { location.replace('/auth'); throw new Error('Login required'); }
  if (!response.ok) throw new Error(data.detail || 'The request failed.');
  return data;
}
const notesStates = {recording:null, conversation:null};
const notesEditors = {recording:null, conversation:null};
let notesModulePromise = null;
function notesEndpoint(scope, id) {
  return `${API}/${scope === 'recording' ? 'recordings' : 'conversations'}/${encodeURIComponent(id)}/notes`;
}
let conversationImages = [];
let recordingImages = [];
let imageDialogOwner = null;
let pendingImageFile = null;
let imagePreviewUrl = null;
let selectedImageSegmentId = null;
const imageDialog = document.querySelector('#image-dialog');
const imageStatus = document.querySelector('#image-status');

function imageEndpoint(scope, id) {
  return `${API}/${scope === 'recording' ? 'recordings' : 'conversations'}/${encodeURIComponent(id)}/images`;
}
function imageFileUrl(scope, id, imageId, download = false) {
  return `${imageEndpoint(scope, id)}/${encodeURIComponent(imageId)}/file${download ? '?download=true' : ''}`;
}
async function removeImageFromNotes(scope, ownerId, imageId) {
  const state = notesStates[scope];
  if (state?.id !== ownerId) return true;
  const previous = state.pendingMarkdown;
  const next = previous.replace(new RegExp(`!\\[[^\\]\\n]*\\]\\(stellis-image:${imageId}\\)`, 'g'), '')
    .replace(/\n{3,}/g, '\n\n');
  if (next === previous) return true;
  state.pendingMarkdown = next;
  if (!await flushNotes(state)) {state.pendingMarkdown = previous; return false;}
  notesEditors[scope]?.setMarkdown(next);
  return true;
}
function imageSegmentFromSelection() {
  const selection = window.getSelection();
  if (!selection?.toString().trim()) return null;
  const node = selection.anchorNode;
  const row = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest?.('.segment');
  return row && transcriptView.contains(row) ? row.dataset.segmentId : null;
}
function makeImageCard(item, scope, ownerId) {
  const card = document.createElement('figure'); card.className = 'image-card'; card.dataset.imageId = item.id;
  const thumb = document.createElement('button'); thumb.type = 'button'; thumb.className = 'image-thumb';
  thumb.setAttribute('aria-label', `Expand image at ${time(item.media_position_ms / 1000)}`);
  const img = document.createElement('img'); img.src = imageFileUrl(scope, ownerId, item.id);
  img.alt = item.caption || `Meeting image at ${time(item.media_position_ms / 1000)}`; img.loading = 'lazy';
  thumb.append(img);
  thumb.addEventListener('click', () => {
    const viewer = document.querySelector('#image-viewer');
    const expanded = document.querySelector('#expanded-image');
    expanded.src = img.src; expanded.alt = img.alt; viewer.showModal();
  });
  const info = document.createElement('figcaption'); info.className = 'image-card-info';
  const position = document.createElement('button'); position.type = 'button';
  position.textContent = time(item.media_position_ms / 1000);
  position.setAttribute('aria-label', `Go to image time ${time(item.media_position_ms / 1000)}`);
  position.addEventListener('click', () => {
    if (scope === 'conversation') { player.pause(); player.currentTime = item.media_position_ms / 1000; showConversationTab('transcript'); }
  });
  const caption = document.createElement('p'); caption.textContent = item.caption || 'Meeting image';
  const actions = document.createElement('div'); actions.className = 'image-card-actions';
  const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit caption';
  edit.addEventListener('click', async () => {
    const next = window.prompt('Image caption', item.caption || '');
    if (next === null || next.trim() === item.caption) return;
    try {
      await json(await fetch(`${imageEndpoint(scope, ownerId)}/${encodeURIComponent(item.id)}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({caption:next.trim()})}));
      await loadImages(scope, ownerId);
    } catch (error) {setStatus(error.message);}
  });
  const download = document.createElement('a'); download.href = imageFileUrl(scope, ownerId, item.id, true);
  download.textContent = 'Download'; download.setAttribute('download', `meeting-image-${item.id}.webp`);
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete';
  remove.addEventListener('click', async () => {
    if (!window.confirm('Delete this image permanently?')) return;
    try {
      if (!await removeImageFromNotes(scope, ownerId, item.id)) return;
      await json(await fetch(`${imageEndpoint(scope, ownerId)}/${encodeURIComponent(item.id)}`, {method:'DELETE'}));
      await loadImages(scope, ownerId);
    } catch (error) {setStatus(error.message);}
  });
  actions.append(edit, download, remove);
  info.append(position, caption, actions); card.append(thumb, info);
  return card;
}
function renderConversationImages() {
  transcriptView.querySelectorAll('.image-card').forEach(card => card.remove());
  const unplaced = document.querySelector('#conversation-image-list'); unplaced.replaceChildren();
  if (!activeConversationId) return;
  const lastByRow = new Map();
  for (const item of conversationImages) {
    let segment = transcriptSegments.find(value => value.id === item.segment_id);
    if (!segment && transcriptSegments.length) {
      segment = transcriptSegments[0];
      for (const candidate of transcriptSegments) {
        if (candidate.start_ms > item.media_position_ms) break;
        segment = candidate;
      }
    }
    const row = segment && transcriptView.querySelector(`[data-segment-id="${CSS.escape(segment.id)}"]`);
    const card = makeImageCard(item, 'conversation', activeConversationId);
    if (!row) {unplaced.append(card); continue;}
    const predecessor = lastByRow.get(row) || row;
    predecessor.after(card); lastByRow.set(row, card);
  }
}
function renderRecordingImages() {
  const list = document.querySelector('#recording-image-list'); list.replaceChildren();
  const recordingId = capture?.session.id || notesStates.recording?.id;
  const markdown = notesStates.recording?.pendingMarkdown || '';
  if (recordingId) for (const item of recordingImages) {
    if (!markdown.includes(`stellis-image:${item.id}`)) list.append(makeImageCard(item, 'recording', recordingId));
  }
}
async function loadImages(scope, id) {
  const items = await json(await fetch(imageEndpoint(scope, id)));
  if (scope === 'recording') {
    if (capture?.session.id !== id && notesStates.recording?.id !== id) return;
    recordingImages = items; renderRecordingImages();
  } else if (activeConversationId === id) {
    conversationImages = items; renderConversationImages();
  }
}
function chooseImageFile(file) {
  if (!file) return;
  pendingImageFile = null;
  document.querySelector('#save-image').disabled = true;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    imageStatus.textContent = 'Use a PNG, JPEG, or WebP image.'; return;
  }
  if (file.size > 12_000_000) {imageStatus.textContent = 'Image must be smaller than 12 MB.'; return;}
  if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  pendingImageFile = file; imagePreviewUrl = URL.createObjectURL(file);
  const preview = document.querySelector('#image-preview'); preview.src = imagePreviewUrl; preview.hidden = false;
  imageStatus.textContent = ''; document.querySelector('#save-image').disabled = false;
}
function openImageDialog(scope, id, file = null, segmentId = null) {
  if (!id) return;
  const segment = scope === 'conversation' ? transcriptSegments.find(item => item.id === segmentId) : null;
  const position = segment ? segment.start_ms : scope === 'recording' ? Math.round(captureElapsedMs()) : Math.round(player.currentTime * 1000);
  imageDialogOwner = {scope, id, position, segmentId:segment?.id || null};
  pendingImageFile = null; imageStatus.textContent = '';
  document.querySelector('#image-caption').value = '';
  document.querySelector('#image-anchor-label').textContent = `At ${time(position / 1000)}`;
  document.querySelector('#image-preview').hidden = true;
  document.querySelector('#save-image').disabled = true;
  document.querySelector('#image-file').value = '';
  imageDialog.showModal();
  if (file) chooseImageFile(file);
  document.querySelector('#image-paste-target').focus();
}
function clipboardImage(event) {
  return [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'))?.getAsFile() || null;
}
let notesImageChoice = null;
function chooseNotesImage(scope, selection) {
  const state = notesStates[scope];
  if (!state) return;
  notesImageChoice = {scope, id:state.id, selection};
  const input = document.querySelector('#notes-image-file');
  input.value = ''; input.click();
}
async function saveNotesImage(scope, id, file, selection) {
  if (!file || notesStates[scope]?.id !== id) return;
  const status = notesElements(scope).status;
  const form = new FormData();
  form.append('file', file, file.name || 'screenshot.png');
  form.append('media_position_ms', String(scope === 'recording' ? Math.round(captureElapsedMs()) :
    Math.round(player.currentTime * 1000)));
  status.textContent = 'Adding image…';
  try {
    const image = await json(await fetch(imageEndpoint(scope, id), {method:'POST', body:form}));
    if (notesStates[scope]?.id !== id) return;
    const editor = await ensureNotesEditor(scope);
    editor.insertImage(image.id, image.caption, selection);
    await loadImages(scope, id);
  } catch (error) {status.textContent = error.message;}
}
function pasteNotesImage(event, scope) {
  const file = clipboardImage(event);
  const state = notesStates[scope];
  if (!file || !state) return;
  event.preventDefault(); event.stopPropagation();
  saveNotesImage(scope, state.id, file, notesEditors[scope]?.captureSelection());
}
function pasteImage(event, scope) {
  const file = clipboardImage(event);
  if (!file) return;
  event.preventDefault(); event.stopPropagation();
  if (!imageDialog.open) {
    const id = scope === 'recording' ? capture?.session.id : activeConversationId;
    openImageDialog(scope, id, file, scope === 'conversation' ? imageSegmentFromSelection() : null);
  } else chooseImageFile(file);
}
document.querySelector('#recording-notes-editor').addEventListener('paste', event => {
  pasteNotesImage(event, 'recording');
}, true);
document.querySelector('#conversation-notes-editor').addEventListener('paste', event => {
  pasteNotesImage(event, 'conversation');
}, true);
document.querySelector('#notes-image-file').addEventListener('change', event => {
  if (!notesImageChoice) return;
  const {scope, id, selection} = notesImageChoice;
  notesImageChoice = null;
  saveNotesImage(scope, id, event.target.files?.[0], selection);
});
transcriptView.addEventListener('paste', event => {
  if (activeConversationId) pasteImage(event, 'conversation');
}, true);
document.querySelector('#image-paste-target').addEventListener('paste', event => pasteImage(event, imageDialogOwner?.scope));
document.querySelector('#image-paste-target').addEventListener('click', () => document.querySelector('#image-file').click());
document.querySelector('#image-paste-target').addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); document.querySelector('#image-file').click();}
});
document.querySelector('#image-paste-target').addEventListener('dragover', event => event.preventDefault());
document.querySelector('#image-paste-target').addEventListener('drop', event => {
  event.preventDefault(); chooseImageFile(event.dataTransfer?.files?.[0]);
});
document.querySelector('#choose-image').addEventListener('click', () => document.querySelector('#image-file').click());
document.querySelector('#image-file').addEventListener('change', event => chooseImageFile(event.target.files?.[0]));
document.querySelector('#add-recording-image').addEventListener('click', () =>
  chooseNotesImage('recording', notesEditors.recording?.captureSelection()));
document.querySelector('#add-conversation-image').addEventListener('pointerdown', () => {
  selectedImageSegmentId = imageSegmentFromSelection();
});
document.querySelector('#add-conversation-image').addEventListener('click', () => {
  openImageDialog('conversation', activeConversationId, null, selectedImageSegmentId || imageSegmentFromSelection());
  selectedImageSegmentId = null;
});
document.querySelector('#cancel-image').addEventListener('click', () => imageDialog.close());
imageDialog.addEventListener('close', () => {
  if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  imagePreviewUrl = null; pendingImageFile = null; imageDialogOwner = null;
});
document.querySelector('#image-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!pendingImageFile || !imageDialogOwner) return;
  const {scope, id, position, segmentId} = imageDialogOwner;
  const form = new FormData();
  form.append('file', pendingImageFile, pendingImageFile.name || 'screenshot.png');
  form.append('media_position_ms', String(position));
  form.append('caption', document.querySelector('#image-caption').value.trim());
  if (segmentId) form.append('segment_id', segmentId);
  const save = document.querySelector('#save-image'); save.disabled = true; imageStatus.textContent = 'Saving image…';
  try {
    await json(await fetch(imageEndpoint(scope, id), {method:'POST', body:form}));
    imageDialog.close(); await loadImages(scope, id); setStatus('Image saved.', true);
  } catch (error) {imageStatus.textContent = error.message; save.disabled = false;}
});
document.querySelector('#close-image-viewer').addEventListener('click', () => document.querySelector('#image-viewer').close());
function notesDraftKey(scope, id) { return `stellis-notes-${scope}-${id}`; }
function notesElements(scope) {
  return {root:document.querySelector(`#${scope}-notes-editor`),
    toolbar:document.querySelector(`#${scope}-notes-toolbar`),
    status:document.querySelector(`#${scope}-notes-status`),
    retry:document.querySelector(`#${scope}-notes-retry`)};
}
async function ensureNotesEditor(scope) {
  if (notesEditors[scope]) return notesEditors[scope];
  notesModulePromise ||= import('/static/notes-editor.bundle.js');
  const {createNotesEditor} = await notesModulePromise;
  const elements = notesElements(scope);
  const editor = createNotesEditor(elements.root, elements.toolbar, markdown => {
    const state = notesStates[scope];
    if (!state) return;
    state.pendingMarkdown = markdown;
    if (scope === 'recording') renderRecordingImages();
    try { localStorage.setItem(notesDraftKey(scope, state.id), JSON.stringify({markdown, revision:state.revision})); } catch {}
    elements.status.textContent = 'Unsaved'; elements.retry.hidden = true;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => flushNotes(state), 600);
  }, error => {elements.status.textContent = error.message;}, {
    imageUrlForId:imageId => imageFileUrl(scope, notesStates[scope]?.id, imageId),
    onOpenImage:(src, alt) => {
      const viewer = document.querySelector('#image-viewer');
      const expanded = document.querySelector('#expanded-image');
      expanded.src = src; expanded.alt = alt; viewer.showModal();
    },
    onPickImage:selection => chooseNotesImage(scope, selection),
  });
  notesEditors[scope] = editor;
  elements.retry.addEventListener('click', () => retryNotes(scope));
  return editor;
}
async function loadNotes(scope, id) {
  const editor = await ensureNotesEditor(scope);
  const remote = await json(await fetch(notesEndpoint(scope, id)));
  let markdown = remote.markdown;
  let recovered = false;
  try {
    const draft = JSON.parse(localStorage.getItem(notesDraftKey(scope, id)) || 'null');
    if (draft?.markdown !== undefined && draft.markdown !== remote.markdown) {
      markdown = draft.revision === remote.revision || draft.markdown.includes(remote.markdown) ? draft.markdown :
        `${remote.markdown}\n\n---\n\n${draft.markdown}`;
      recovered = true;
    }
  } catch {}
  const state = {scope,id,revision:remote.revision,savedMarkdown:remote.markdown,
    pendingMarkdown:markdown,timer:null,savePromise:null};
  notesStates[scope] = state;
  editor.setMarkdown(markdown);
  if (scope === 'recording') renderRecordingImages();
  const elements = notesElements(scope);
  elements.status.textContent = recovered ? 'Recovered draft' : '';
  elements.retry.hidden = true;
  if (recovered) state.timer = setTimeout(() => flushNotes(state), 500);
  return state;
}
async function flushNotes(state) {
  if (!state || state.savePromise) return state?.savePromise || true;
  clearTimeout(state.timer);
  if (state.pendingMarkdown === state.savedMarkdown) return true;
  const elements = notesElements(state.scope);
  state.savePromise = (async () => {
    while (state.pendingMarkdown !== state.savedMarkdown) {
      const markdown = state.pendingMarkdown;
      elements.status.textContent = 'Saving…';
      try {
        const saved = await json(await fetch(notesEndpoint(state.scope, state.id), {
          method:'PUT',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({markdown,expected_revision:state.revision}),
        }));
        state.revision = saved.revision; state.savedMarkdown = saved.markdown;
        if (state.pendingMarkdown === state.savedMarkdown) {
          try {localStorage.removeItem(notesDraftKey(state.scope, state.id));} catch {}
          elements.status.textContent = 'Saved'; elements.retry.hidden = true;
        }
      } catch (error) {
        elements.status.textContent = error.message; elements.retry.hidden = false;
        return false;
      }
    }
    return true;
  })().finally(() => {state.savePromise = null;});
  return state.savePromise;
}
async function retryNotes(scope) {
  const state = notesStates[scope];
  if (!state) return;
  try {
    const remote = await json(await fetch(notesEndpoint(scope, state.id)));
    if (remote.revision !== state.revision) {
      const local = state.pendingMarkdown;
      state.pendingMarkdown = local.includes(remote.markdown) ? local : `${remote.markdown}\n\n---\n\n${local}`;
      notesEditors[scope].setMarkdown(state.pendingMarkdown);
      state.revision = remote.revision; state.savedMarkdown = remote.markdown;
    }
    await flushNotes(state);
  } catch (error) {notesElements(scope).status.textContent = error.message;}
}
async function recoverNotesDraft(recordingId) {
  const key = notesDraftKey('recording', recordingId);
  let draft;
  try {draft = JSON.parse(localStorage.getItem(key) || 'null');} catch {return;}
  if (typeof draft?.markdown !== 'string') return;
  const remote = await json(await fetch(notesEndpoint('recording', recordingId)));
  if (remote.markdown === draft.markdown) {localStorage.removeItem(key); return;}
  const markdown = draft.markdown.includes(remote.markdown) ? draft.markdown :
    `${remote.markdown}\n\n---\n\n${draft.markdown}`;
  await json(await fetch(notesEndpoint('recording', recordingId), {method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({markdown,expected_revision:remote.revision})}));
  localStorage.removeItem(key);
}
const enhancedFields = [['overview','Overview'],['topics','Topics'],['decisions','Decisions'],['action_items','Action proposals']];
let enhancedRuns = [];
let enhancedSelectedId = null;
let enhancedEditor = null;
let enhancedState = null;
let enhancedSaveTimer = null;
let enhancedPollTimer = null;
function enhancedMarkdown(result) {
  return enhancedFields.filter(([field]) => result[field]?.length)
    .map(([field,title]) => `## ${title}\n\n${result[field].map(item => `- ${item.text}`).join('\n')}`)
    .join('\n\n');
}
async function ensureEnhancedEditor() {
  if (enhancedEditor) return enhancedEditor;
  notesModulePromise ||= import('/static/notes-editor.bundle.js');
  document.querySelector('#enhanced-notes-toolbar').innerHTML = document.querySelector('#conversation-notes-toolbar').innerHTML;
  document.querySelector('#enhanced-notes-toolbar [data-note-action="image"]').remove();
  const {createNotesEditor} = await notesModulePromise;
  enhancedEditor = createNotesEditor(document.querySelector('#enhanced-notes-editor'),
    document.querySelector('#enhanced-notes-toolbar'), markdown => {
      if (!enhancedState) return;
      enhancedState.pending = markdown;
      try {localStorage.setItem(`stellis-enhanced-${enhancedState.id}`,
        JSON.stringify({markdown,revision:enhancedState.revision}));} catch {}
      document.querySelector('#enhanced-save-status').textContent = 'Unsaved';
      clearTimeout(enhancedSaveTimer); enhancedSaveTimer = setTimeout(() => flushEnhanced(), 600);
    }, error => {document.querySelector('#enhanced-save-status').textContent = error.message;});
  document.querySelector('#enhanced-retry').addEventListener('click', () => retryEnhanced());
  return enhancedEditor;
}
async function flushEnhanced() {
  if (!enhancedState || enhancedState.saving) return enhancedState?.saving || true;
  clearTimeout(enhancedSaveTimer);
  if (enhancedState.pending === enhancedState.saved) return true;
  const state = enhancedState;
  state.saving = (async () => {
    while (state.pending !== state.saved) {
      const markdown = state.pending;
      document.querySelector('#enhanced-save-status').textContent = 'Saving…';
      try {
        const saved = await json(await fetch(`${API}/enhanced-notes/${encodeURIComponent(state.id)}`, {
          method:'PUT',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({markdown,expected_revision:state.revision})}));
        state.revision = saved.edit_revision; state.saved = saved.edited_markdown;
        if (state.pending === state.saved) {
          try {localStorage.removeItem(`stellis-enhanced-${state.id}`);} catch {}
          document.querySelector('#enhanced-save-status').textContent = 'Saved';
          document.querySelector('#enhanced-retry').hidden = true;
        }
      } catch (error) {
        document.querySelector('#enhanced-save-status').textContent = error.message;
        document.querySelector('#enhanced-retry').hidden = false;
        return false;
      }
    }
    return true;
  })().finally(() => {state.saving = null;});
  return state.saving;
}
async function retryEnhanced() {
  if (!enhancedState) return;
  try {
    const remote = await json(await fetch(`${API}/enhanced-notes/${encodeURIComponent(enhancedState.id)}`));
    if (remote.edit_revision !== enhancedState.revision) {
      const original = remote.edited_markdown ?? enhancedMarkdown(remote.result);
      enhancedState.pending = enhancedState.pending.includes(original) ? enhancedState.pending :
        `${original}\n\n---\n\n${enhancedState.pending}`;
      enhancedState.saved = original; enhancedState.revision = remote.edit_revision;
      enhancedEditor.setMarkdown(enhancedState.pending);
    }
    await flushEnhanced();
  } catch (error) {document.querySelector('#enhanced-save-status').textContent = error.message;}
}
async function selectEnhanced(run) {
  if (enhancedState?.id !== run.id && !(await flushEnhanced())) return;
  enhancedSelectedId = run.id;
  const status = document.querySelector('#enhanced-status');
  status.textContent = run.state === 'failed' ? run.error_message :
    run.state === 'running' || run.state === 'queued' ? `Generating: ${run.stage}` :
    run.stale ? 'Sources changed. Refresh to update.' : '';
  const sources = document.querySelector('#enhanced-sources'); sources.replaceChildren();
  if (run.state !== 'succeeded') {
    enhancedState = null;
    if (enhancedEditor) enhancedEditor.setMarkdown('');
    document.querySelector('#enhanced-notes-editor').contentEditable = 'false';
    document.querySelector('#enhanced-notes-toolbar').hidden = true;
    return;
  }
  await ensureEnhancedEditor();
  document.querySelector('#enhanced-notes-editor').contentEditable = 'true';
  document.querySelector('#enhanced-notes-toolbar').hidden = false;
  const saved = run.edited_markdown ?? enhancedMarkdown(run.result);
  let pending = saved;
  try {
    const draft = JSON.parse(localStorage.getItem(`stellis-enhanced-${run.id}`) || 'null');
    if (typeof draft?.markdown === 'string' && draft.markdown !== saved)
      pending = draft.revision === run.edit_revision || draft.markdown.includes(saved) ? draft.markdown :
        `${saved}\n\n---\n\n${draft.markdown}`;
  } catch {}
  enhancedState = {id:run.id,revision:run.edit_revision,saved,pending,saving:null};
  enhancedEditor.setMarkdown(pending);
  document.querySelector('#enhanced-save-status').textContent = pending !== saved ? 'Recovered draft' : '';
  document.querySelector('#enhanced-retry').hidden = true;
  if (pending !== saved) {clearTimeout(enhancedSaveTimer); enhancedSaveTimer = setTimeout(() => flushEnhanced(), 600);}
  for (const [field,title] of enhancedFields) renderAIItems(title, run.result[field], sources, run.source_starts);
}
async function loadEnhancedRuns(id, autoStart = false) {
  const runs = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/enhanced-notes`));
  if (id !== activeConversationId) return;
  enhancedRuns = runs;
  if (!runs.length && autoStart && currentTranscript?.segments?.length) {
    await startEnhanced(false);
    return;
  }
  const picker = document.querySelector('#enhanced-version'); picker.replaceChildren();
  for (const run of runs) {
    const option = document.createElement('option'); option.value = run.id;
    option.textContent = new Date(run.created_at).toLocaleString(); picker.append(option);
  }
  const chosen = runs.find(run => run.id === enhancedSelectedId) || runs[0];
  picker.hidden = runs.length < 2;
  if (chosen) {
    picker.value = chosen.id;
    if (enhancedState?.id !== chosen.id || chosen.state !== 'succeeded') await selectEnhanced(chosen);
  }
  else {document.querySelector('#enhanced-status').textContent = currentTranscript ? 'No Enhanced Notes yet.' : 'Transcribe before generating notes.';}
  clearTimeout(enhancedPollTimer);
  if (runs.some(run => run.state === 'queued' || run.state === 'running'))
    enhancedPollTimer = setTimeout(() => loadEnhancedRuns(id).catch(error => {
      document.querySelector('#enhanced-status').textContent = error.message;}), 2000);
}
async function startEnhanced(force) {
  const id = activeConversationId;
  document.querySelector('#enhanced-status').textContent = 'Generating…';
  try {
    const run = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/enhanced-notes`, {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({force})}));
    enhancedSelectedId = run.id;
    await loadEnhancedRuns(id);
  } catch (error) {document.querySelector('#enhanced-status').textContent = error.message;}
}
function showNotesChoice(choice) {
  const enhanced = choice === 'enhanced';
  document.querySelector('#my-notes-panel').hidden = enhanced;
  document.querySelector('#enhanced-notes-panel').hidden = !enhanced;
  document.querySelector('#my-notes-tab').setAttribute('aria-selected', String(!enhanced));
  document.querySelector('#enhanced-notes-tab').setAttribute('aria-selected', String(enhanced));
}
document.querySelector('#my-notes-tab').addEventListener('click', () => showNotesChoice('my'));
document.querySelector('#enhanced-notes-tab').addEventListener('click', () => showNotesChoice('enhanced'));
document.querySelector('#refresh-enhanced').addEventListener('click', () => startEnhanced(true));
document.querySelector('#enhanced-version').addEventListener('change', async event => {
  const run = enhancedRuns.find(item => item.id === event.target.value);
  if (run) await selectEnhanced(run);
});
fetch(`${API}/auth/status`).then(json).then(session => {
  document.querySelector('#logout-button').hidden = !session.required;
}).catch(error => setStatus(error.message));
document.querySelector('#logout-button').addEventListener('click', async () => {
  try { await json(await fetch(`${API}/auth/logout`, {method:'POST'})); location.replace('/auth'); }
  catch (error) { setStatus(error.message); }
});
function appendSearchExcerpt(container, value, query) {
  const position = value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (position < 0) { container.textContent = value; return; }
  container.append(document.createTextNode(value.slice(0, position)));
  const mark = document.createElement('mark'); mark.textContent = value.slice(position, position + query.length);
  container.append(mark, document.createTextNode(value.slice(position + query.length)));
}
function renderLibrarySearch() {
  const kind = document.querySelector('#library-search-kind').value;
  const container = document.querySelector('#library-search-results');
  const query = document.querySelector('#library-search-input').value.trim();
  container.replaceChildren();
  const visible = librarySearchResults.filter(item => kind === 'all' || item.kind === kind);
  document.querySelector('#library-search-status').textContent = visible.length ?
    `${kind === 'all' ? librarySearchTotal : visible.length} results${kind === 'all' && librarySearchLimited ? ', first 150 shown' : ''}` :
    (kind === 'all' ? 'No results.' : 'No results in this category.');
  for (const item of visible) {
    const row = document.createElement('a'); row.className = 'search-result';
    row.href = item.kind === 'person' ? `/person/${encodeURIComponent(item.person_id)}` :
      `/conversation/${encodeURIComponent(item.conversation_id)}${item.segment_id ? `?at=${encodeURIComponent(item.segment_id)}` : ''}`;
    const heading = document.createElement('strong'); heading.textContent = item.conversation_title;
    const detail = document.createElement('span');
    detail.textContent = item.kind === 'conversation' ? 'Conversation' :
      item.kind === 'person' ? 'Confirmed person profile' :
      `${item.kind === 'speaker' ? 'Speaker' : 'Passage'}, ${item.speaker}, ${time(item.start_ms / 1000)}${item.speaker_uncertain ? ', uncertain speaker match' : ''}`;
    const excerpt = document.createElement('span'); excerpt.className = 'search-excerpt';
    appendSearchExcerpt(excerpt, item.excerpt, query);
    row.append(heading, detail, excerpt); container.append(row);
    if (item.person_id && item.kind === 'speaker') {
      const profile = document.createElement('a'); profile.className = 'search-profile-link';
      profile.href = `/person/${encodeURIComponent(item.person_id)}`;
      profile.textContent = `Open ${item.speaker}'s profile`;
      container.append(profile);
    }
  }
}
async function submitLibrarySearch(event) {
  event.preventDefault();
  const query = document.querySelector('#library-search-input').value.trim();
  const status = document.querySelector('#library-search-status');
  if (query.length < 2) { status.textContent = 'Enter at least two characters.'; return; }
  status.textContent = 'Searching local transcripts…';
  document.querySelector('#library-search-results').replaceChildren();
  try {
    const category = document.querySelector('#category-filter').value;
    const data = await json(await fetch(`${API}/search?q=${encodeURIComponent(query)}${category ? `&category_id=${encodeURIComponent(category)}` : ''}`));
    if (document.querySelector('#library-search-input').value.trim() !== query) return;
    librarySearchResults = data.results;
    librarySearchTotal = data.total;
    librarySearchLimited = data.limited;
    document.querySelector('#library-search-controls').hidden = false;
    document.querySelector('#library-search-kind').value = 'all';
    renderLibrarySearch();
  } catch (error) { status.textContent = error.message; }
}
function refreshTranscriptSearch() {
  const query = document.querySelector('#transcript-search-input').value.trim().toLocaleLowerCase();
  const picker = document.querySelector('#transcript-search-speaker');
  const selectedSpeaker = picker.value;
  const speakers = [...new Set(transcriptSegments.map(segment => segment.speaker_display_name))];
  picker.replaceChildren(new Option('All speakers', ''), ...speakers.map(name => new Option(name, name)));
  picker.value = speakers.includes(selectedSpeaker) ? selectedSpeaker : '';
  transcriptSearchMatches = transcriptSegments.filter(segment =>
    (!query || segment.text.toLocaleLowerCase().includes(query)) &&
    (!picker.value || segment.speaker_display_name === picker.value));
  if (!query && !picker.value) transcriptSearchMatches = [];
  for (const row of transcriptView.querySelectorAll('.segment')) row.classList.remove('search-match', 'search-current');
  for (const segment of transcriptSearchMatches) transcriptView.querySelector(`[data-segment-id="${CSS.escape(segment.id)}"]`)?.classList.add('search-match');
  if (transcriptSearchIndex >= transcriptSearchMatches.length) transcriptSearchIndex = -1;
  const current = transcriptSearchMatches[transcriptSearchIndex];
  if (current) transcriptView.querySelector(`[data-segment-id="${CSS.escape(current.id)}"]`)?.classList.add('search-current');
  document.querySelector('#transcript-search-status').textContent =
    query || picker.value ? `${transcriptSearchMatches.length} matches${current ? `, ${transcriptSearchIndex + 1} of ${transcriptSearchMatches.length}` : ''}` : '';
}
function moveTranscriptSearch(direction) {
  if (!transcriptSearchMatches.length) return;
  transcriptSearchIndex = transcriptSearchIndex < 0 ? (direction > 0 ? 0 : transcriptSearchMatches.length - 1) :
    (transcriptSearchIndex + direction + transcriptSearchMatches.length) % transcriptSearchMatches.length;
  refreshTranscriptSearch();
  const segment = transcriptSearchMatches[transcriptSearchIndex];
  transcriptView.querySelector(`[data-segment-id="${CSS.escape(segment.id)}"]`)?.scrollIntoView({block: 'center'});
  player.pause(); player.currentTime = segment.start_ms / 1000;
}
function updateTranscriptSearch() {
  transcriptSearchIndex = -1;
  if (highlightsOnly || rematchChangesOnly) {
    highlightsOnly = false; rematchChangesOnly = false;
    showTranscript(activeConversationId).catch(error => document.querySelector('#transcript-search-status').textContent = error.message);
  } else refreshTranscriptSearch();
}
async function showList() {
  document.body.classList.remove('profile-page', 'conversation-page', 'recording-page');
  recordingPanel.hidden = true;
  document.querySelector('#vocabulary-panel').hidden = false;
  conversationMore.open = false; conversationMore.hidden = true;
  clearTimeout(jobTimer);
  clearTimeout(aiRunTimer);
  clearTimeout(enhancedPollTimer);
  clearTimeout(recordingChatTimer);
  clearTimeout(cleanRunTimer);
  clearTimeout(silenceScanTimer); silenceSpans = [];
  activeConversationId = null;
  activePersonId = null;
  listView.hidden = false;
  detailView.hidden = true;
  document.querySelector('#trash-view').hidden = true;
  document.querySelector('#person-view').hidden = true;
  document.querySelector('#page-title').textContent = 'Your conversations';
  const [conversations, categories] = await Promise.all([
    json(await fetch(`${API}/conversations`)), json(await fetch(`${API}/categories`)),
  ]);
  libraryConversations = conversations;
  libraryCategories = categories;
  document.querySelector('#category-status').textContent = '';
  renderCategoryControls();
  renderConversationList();
  captureControls();
  await loadPeoplePanel();
  if (document.querySelector('#library-search-input').value.trim().length >= 2)
    await submitLibrarySearch(new Event('submit'));
}
function renderConversationList() {
  const category = document.querySelector('#category-filter').value;
  const conversations = libraryConversations.filter(item => !category ||
    (category === 'uncategorized' ? !item.category_ids.length : item.category_ids.includes(category)));
  list.replaceChildren();
  if (!conversations.length) {
    const empty = document.createElement('p');
    empty.textContent = category ? 'No conversations in this category.' : 'No saved conversations yet.';
    list.append(empty);
  }
  for (const item of conversations) {
    const row = document.createElement('a');
    row.className = 'conversation-row';
    row.href = `/conversation/${encodeURIComponent(item.id)}`;
    const summary = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.title;
    const meta = document.createElement('small');
    meta.textContent = `${new Date(item.created_at).toLocaleDateString()} (${time(item.duration_ms / 1000)})`;
    summary.append(title, meta);
    for (const categoryId of item.category_ids) {
      const category = libraryCategories.find(value => value.id === categoryId);
      if (category) { const tag = document.createElement('span'); tag.className = 'category-tag'; tag.textContent = category.name; summary.append(tag); }
    }
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    row.append(summary, arrow);
    list.append(row);
  }
}
function renderCategoryControls() {
  const picker = document.querySelector('#category-filter');
  const selected = picker.value;
  picker.replaceChildren(new Option('All conversations', ''),
    new Option(`Uncategorized (${libraryConversations.filter(item => !item.category_ids.length).length})`, 'uncategorized'),
    ...libraryCategories.map(item => new Option(`${item.name} (${item.conversation_count})`, item.id)));
  picker.value = selected === 'uncategorized' || libraryCategories.some(item => item.id === selected) ? selected : '';
  const container = document.querySelector('#category-list'); container.replaceChildren();
  for (const category of libraryCategories) {
    const row = document.createElement('div'); row.className = 'category-row';
    const name = document.createElement('span'); name.textContent = `${category.name} (${category.conversation_count})`;
    const rename = document.createElement('button'); rename.type = 'button'; rename.textContent = 'Rename';
    rename.addEventListener('click', async () => {
      const next = window.prompt('Category name', category.name);
      if (next === null || !next.trim()) return;
      try { await json(await fetch(`${API}/categories/${encodeURIComponent(category.id)}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:next})})); await showList(); }
      catch (error) { document.querySelector('#category-status').textContent = error.message; }
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete category';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Delete the category “${category.name}”? Its conversations will stay in the library.`)) return;
      try { await json(await fetch(`${API}/categories/${encodeURIComponent(category.id)}`, {method:'DELETE'})); await showList(); }
      catch (error) { document.querySelector('#category-status').textContent = error.message; }
    });
    row.append(name, rename, remove); container.append(row);
  }
}
async function renderConversationCategories(ids) {
  const categories = await json(await fetch(`${API}/categories`));
  const container = document.querySelector('#conversation-category-list'); container.replaceChildren();
  if (!categories.length) { const empty = document.createElement('p'); empty.textContent = 'Create categories from All conversations.'; container.append(empty); }
  for (const category of categories) {
    const label = document.createElement('label'); label.className = 'category-checkbox';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = ids.includes(category.id);
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true;
      try {
        const result = await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/categories/${encodeURIComponent(category.id)}`, {method:checkbox.checked ? 'PUT' : 'DELETE'}));
        ids = result.category_ids;
      } catch (error) { checkbox.checked = !checkbox.checked; setStatus(error.message); }
      checkbox.disabled = false;
    });
    label.append(checkbox, document.createTextNode(category.name)); container.append(label);
  }
}
async function showTrash() {
  const items = await json(await fetch(`${API}/trash`));
  document.querySelector('#trash-status').textContent = '';
  document.querySelector('#vocabulary-panel').hidden = true;
  listView.hidden = true; detailView.hidden = true; document.querySelector('#person-view').hidden = true;
  document.querySelector('#trash-view').hidden = false;
  const container = document.querySelector('#trash-list'); container.replaceChildren();
  if (!items.length) { const empty = document.createElement('p'); empty.textContent = 'Recently Deleted is empty.'; container.append(empty); }
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'trash-row';
    const title = document.createElement('strong'); title.textContent = item.title;
    const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = 'Restore';
    restore.addEventListener('click', async () => {
      try { await json(await fetch(`${API}/trash/${encodeURIComponent(item.id)}/restore`, {method:'POST'})); await showTrash(); }
      catch (error) { document.querySelector('#trash-status').textContent = error.message; }
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete permanently';
    remove.addEventListener('click', async () => {
      if (window.prompt(`Permanently delete “${item.title}” and its audio and transcript? Type DELETE to confirm.`) !== 'DELETE') return;
      try { await json(await fetch(`${API}/trash/${encodeURIComponent(item.id)}`, {method:'DELETE'})); await showTrash(); }
      catch (error) { document.querySelector('#trash-status').textContent = error.message; }
    });
    const expiry = document.createElement('span'); expiry.className = 'trash-expiry';
    expiry.textContent = `Deletes ${new Date(item.expires_at).toLocaleString()}`;
    row.append(title, expiry, restore, remove); container.append(row);
  }
}
async function loadPeoplePanel() {
  const people = await json(await fetch(`${API}/persons`));
  const container = document.querySelector('#people-list'); container.replaceChildren();
  if (!people.length) { const empty = document.createElement('p'); empty.textContent = 'No people yet.'; container.append(empty); }
  for (const person of people) {
    const link = document.createElement('a'); link.className = 'person-list-row';
    link.href = `/person/${encodeURIComponent(person.id)}`;
    link.textContent = `${person.name} (${person.conversation_count} conversations)`;
    container.append(link);
  }
}
async function showPerson(id) {
  document.body.classList.remove('conversation-page', 'recording-page');
  recordingPanel.hidden = true;
  document.querySelector('#vocabulary-panel').hidden = false;
  document.body.classList.add('profile-page');
  conversationMore.open = false; conversationMore.hidden = true;
  clearTimeout(jobTimer); clearTimeout(aiRunTimer); clearTimeout(enhancedPollTimer); clearTimeout(recordingChatTimer); clearTimeout(cleanRunTimer);
  clearTimeout(silenceScanTimer); silenceSpans = [];
  player.pause(); player.removeAttribute('src'); player.load();
  activeConversationId = null; activePersonId = id;
  const [person, all] = await Promise.all([
    json(await fetch(`${API}/persons/${encodeURIComponent(id)}`)), json(await fetch(`${API}/persons`)),
  ]);
  listView.hidden = true; detailView.hidden = true; document.querySelector('#trash-view').hidden = true;
  document.querySelector('#person-view').hidden = false;
  document.querySelector('#page-title').textContent = person.name;
  document.querySelector('#person-rename-input').value = person.name;
  document.querySelector('#person-status').textContent = '';
  const container = document.querySelector('#person-conversations'); container.replaceChildren();
  if (!person.conversations.length) { const empty = document.createElement('p'); empty.textContent = 'No active conversations confirmed for this person.'; container.append(empty); }
  for (const item of person.conversations) {
    const row = document.createElement('div'); row.className = 'person-conversation-row';
    const link = document.createElement('a'); link.href = `/conversation/${encodeURIComponent(item.conversation_id)}?at=${encodeURIComponent(item.segment_id)}&t=${item.start_ms}`;
    link.textContent = `${item.title}, ${new Date(item.created_at).toLocaleDateString()} at ${time(item.start_ms / 1000)}`;
    const note = document.createElement('small');
    note.textContent = `${item.confirmed_passages} confirmed passages${item.current_generation ? '' : ', prior transcript generation'}`;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove association';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Remove ${person.name}'s confirmation from “${item.title}”?`)) return;
      try { await json(await fetch(`${API}/persons/${encodeURIComponent(id)}/conversations/${encodeURIComponent(item.conversation_id)}`, {method:'DELETE'})); await showPerson(id); }
      catch (error) { document.querySelector('#person-status').textContent = error.message; }
    });
    const separate = document.createElement('button'); separate.type = 'button'; separate.textContent = 'Move to new person';
    separate.addEventListener('click', async () => {
      const name = window.prompt('Name for the separate person'); if (!name?.trim()) return;
      try {
        const created = await json(await fetch(`${API}/persons`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})}));
        await json(await fetch(`${API}/persons/${encodeURIComponent(id)}/move-conversation`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversation_id:item.conversation_id,target_id:created.id})}));
        history.pushState({}, '', `/person/${encodeURIComponent(created.id)}`);
        await showPerson(created.id);
      } catch (error) { document.querySelector('#person-status').textContent = error.message; }
    });
    row.append(link, note, remove, separate); container.append(row);
  }
  const picker = document.querySelector('#person-merge-source');
  picker.replaceChildren(new Option('Choose a person', ''),
    ...all.filter(item => item.id !== id).map(item => new Option(`${item.name} (${item.conversation_count})`, item.id)));
  document.querySelector('#person-delete').hidden = person.total_link_count > 0;
}
async function showDetail(id) {
  await flushNotes(notesStates.conversation);
  await flushEnhanced();
  document.body.classList.remove('profile-page', 'recording-page');
  recordingPanel.hidden = true;
  document.querySelector('#vocabulary-panel').hidden = false;
  document.body.classList.add('conversation-page');
  conversationMore.open = false; conversationMore.hidden = false;
  clearTimeout(jobTimer);
  clearTimeout(aiRunTimer);
  clearTimeout(enhancedPollTimer);
  clearTimeout(recordingChatTimer);
  enhancedRuns = []; enhancedSelectedId = null; enhancedState = null;
  clearTimeout(cleanRunTimer);
  clearTimeout(silenceScanTimer); silenceSpans = [];
  cleanRuns = [];
  currentCleanRun = null;
  awaitingCleanRun = false;
  cleanEditMode = false;
  cleanEditError = null;
  pendingCleanEdits.clear();
  document.querySelector('#edited-tab').hidden = true;
  document.querySelector('#edited-transcript').replaceChildren();
  activeConversationId = id;
  activePersonId = null;
  rematchChangesOnly = false;
  transcriptEditMode = false;
  pendingTranscriptEdits.clear();
  focusedEditSegmentId = null;
  transcriptEditError = null;
  transcriptSegments = [];
  conversationImages = [];
  currentTranscript = null;
  document.querySelector('#copy-transcript').hidden = true;
  document.querySelector('#transcript-search-input').value = '';
  document.querySelector('#transcript-search-speaker').value = '';
  transcriptSearchMatches = [];
  transcriptSearchIndex = -1;
  syncTranscriptEditControls();
  transcriptView.replaceChildren();
  processingStatus.textContent = 'Loading transcript…';
  processButton.hidden = true;
  rematchButton.hidden = true;
  const item = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}`));
  await renderConversationCategories(item.category_ids);
  listView.hidden = true;
  detailView.hidden = false;
  document.querySelector('#person-view').hidden = true;
  document.querySelector('#page-title').textContent = item.title;
  document.querySelector('#audio-duration').textContent = time(item.duration_ms / 1000);
  seekSlider.max = String(item.duration_ms / 1000);
  seekSlider.value = '0';
  document.querySelector('#seek-segments').replaceChildren();
  player.src = `${API}/conversations/${encodeURIComponent(id)}/audio`;
  player.load();
  syncPlayerControls();
  if (skipSilenceCheckbox.checked) startSilenceScan(id).catch(error => { skipSilenceStatus.textContent = error.message; });
  await loadImages('conversation', id);
  await loadSpeech(id);
  await loadNotes('conversation', id);
  showConversationTab('summary');
  showNotesChoice('my');
  await loadAIRuns(id);
  await loadSavedRecordingChat(id);
  await loadCleanRuns(id);
  const query = new URLSearchParams(location.search);
  const targetSegmentId = query.get('at');
  if (targetSegmentId) {
    showConversationTab('transcript');
    const target = transcriptSegments.find(segment => segment.id === targetSegmentId);
    if (target) {
      const seek = () => { player.pause(); player.currentTime = target.start_ms / 1000; };
      if (player.readyState >= 1) seek(); else player.addEventListener('loadedmetadata', seek, {once: true});
      transcriptView.querySelector(`[data-segment-id="${CSS.escape(target.id)}"]`)?.scrollIntoView({block: 'center'});
    }
  }
  if (targetSegmentId && !transcriptSegments.some(segment => segment.id === targetSegmentId) && query.has('t')) {
    const timestamp = Number(query.get('t'));
    if (Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= item.duration_ms) {
      const seek = () => { player.pause(); player.currentTime = timestamp / 1000; };
      if (player.readyState >= 1) seek(); else player.addEventListener('loadedmetadata', seek, {once: true});
    }
  }
  await loadEnhancedRuns(id, !targetSegmentId);
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
function sourceButtons(ids, sourceStarts = {}) {
  const holder = document.createElement('span'); holder.className = 'ai-sources';
  for (const id of ids) {
    const segment = transcriptSegments.find(item => item.id === id);
    const startMs = segment?.start_ms ?? sourceStarts[id];
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = Number.isFinite(startMs) ? `${time(startMs / 1000)}, ${segment?.speaker_display_name || 'Earlier source'}` : 'Source unavailable';
    button.disabled = !Number.isFinite(startMs);
    button.addEventListener('click', async () => {
      if (!Number.isFinite(startMs)) return;
      if (segment) {
        highlightsOnly = false; showConversationTab('transcript');
        await showTranscript(activeConversationId);
        transcriptView.querySelector(`[data-segment-id="${id}"]`)?.scrollIntoView({block:'center'});
      }
      player.currentTime = startMs / 1000;
      player.play().catch(() => {});
    });
    holder.append(button);
  }
  return holder;
}
function renderAIItems(title, items, container, sourceStarts) {
  if (!items?.length) return;
  const section = document.createElement('section'); section.className = 'ai-result-section';
  const heading = document.createElement('h3'); heading.textContent = title; section.append(heading);
  const list = document.createElement('ul');
  for (const item of items) {
    const row = document.createElement('li');
    const text = document.createElement('p'); text.textContent = item.text;
    row.append(text, sourceButtons(item.source_segment_ids, sourceStarts)); list.append(row);
  }
  section.append(list); container.append(section);
}
function renderAIRuns(runs) {
  const summaries = runs.filter(run => run.kind === 'summary');
  const latest = summaries[0];
  const displayed = latest?.state === 'succeeded' ? latest : summaries.find(run => run.state === 'succeeded');
  const summaryResults = document.querySelector('#summary-results'); summaryResults.replaceChildren();
  const button = document.querySelector('#generate-summary');
  const regenerate = document.querySelector('#regenerate-summary');
  button.disabled = latest?.state === 'running' || latest?.state === 'queued';
  button.hidden = latest?.state === 'succeeded' && !latest.stale;
  button.textContent = latest?.state === 'failed' ? 'Retry summary' : 'Generate summary';
  regenerate.hidden = latest?.state !== 'succeeded' || latest.stale;
  if (displayed) {
    if (displayed.stale || displayed !== latest) {const stale = document.createElement('p'); stale.className = 'ai-stale'; stale.textContent = displayed !== latest ? 'Previous summary.' : 'Summary is outdated.'; summaryResults.append(stale);}
    for (const [field, title] of [['overview','Overview'],['topics','Topics'],['decisions','Decisions'],['action_items','Action proposals']])
      renderAIItems(title, displayed.result[field], summaryResults, displayed.source_starts);
  }
  const status = document.querySelector('#ai-status');
  status.textContent = latest?.state === 'failed' ? `Summary stopped: ${latest.error_message}` :
    latest?.state === 'running' || latest?.state === 'queued' ? `Generating summary: ${latest.stage}` :
    latest?.state === 'succeeded' ? '' :
    currentTranscript ? '' : 'Transcribe before generating a summary.';
  const answers = document.querySelector('#ai-answers'); answers.replaceChildren();
  for (const run of runs.filter(item => item.kind === 'answer')) {
    const card = document.createElement('article'); card.className = 'ai-answer';
    const q = document.createElement('h4'); q.textContent = run.question; card.append(q);
    const body = document.createElement('p');
    body.textContent = run.state === 'succeeded' ? run.result.answer :
      run.state === 'failed' ? `Could not answer: ${run.error_message}` : `Answering: ${run.stage}`;
    card.append(body);
    if (run.stale) {const badge = document.createElement('small'); badge.textContent = 'Source changed since this answer'; card.append(badge);}
    if (run.state === 'succeeded') card.append(sourceButtons(run.result.source_segment_ids, run.source_starts));
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
async function startAIRun(kind, question = null, force = false) {
  const id = activeConversationId;
  const status = document.querySelector('#ai-status'); status.textContent = kind === 'summary' ? 'Generating summary…' : 'Answering…';
  try {
    await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/ai-runs`, {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({kind,question,force})}));
    await loadAIRuns(id);
  } catch (error) { status.textContent = error.message; }
}
document.querySelector('#summary-tab').addEventListener('click', () => {
  showConversationTab('summary');
  if (activeConversationId) loadAIRuns(activeConversationId).catch(error => document.querySelector('#ai-status').textContent = error.message);
  if (activeConversationId) loadEnhancedRuns(activeConversationId, true).catch(error => document.querySelector('#enhanced-status').textContent = error.message);
});
document.querySelector('#transcript-tab').addEventListener('click', () => showConversationTab('transcript'));
document.querySelector('#edited-tab').addEventListener('click', () => showConversationTab('edited'));
document.querySelector('#generate-summary').addEventListener('click', () =>
  startAIRun('summary', null, document.querySelector('#generate-summary').textContent === 'Retry summary'));
document.querySelector('#regenerate-summary').addEventListener('click', () => startAIRun('summary', null, true));
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
    option.textContent = `${new Date(run.created_at).toLocaleString()}${run.stale ? ' (source changed)' : ''}`;
    version.append(option);
  }
  if (currentCleanRun?.state === 'succeeded') version.value = currentCleanRun.id;
  renderCleanRun();
  if (awaitingCleanRun && latest?.state === 'succeeded') {
    awaitingCleanRun = false; currentCleanRun = latest; version.value = latest.id; renderCleanRun(); showConversationTab('edited');
  }
  if (awaitingCleanRun && latest?.state === 'failed') awaitingCleanRun = false;
  if ((latest?.state === 'running' || latest?.state === 'queued') && currentCleanRun?.id !== latest.id)
    document.querySelector('#clean-status').textContent = `Cleaning new version: ${latest.stage}. An earlier version remains available.`;
  if (runs.some(run => run.state === 'queued' || run.state === 'running'))
    cleanRunTimer = setTimeout(() => loadCleanRuns(id).catch(error => document.querySelector('#clean-status').textContent = error.message), 2000);
}
function syncCleanEditControls() {
  document.querySelector('#clean-edit-button').textContent = cleanEditMode ? 'Done' : 'Edit transcript';
  document.querySelector('#clean-discard-button').hidden = !cleanEditMode;
  if (cleanEditMode) document.querySelector('#clean-status').textContent = cleanEditError ||
    (pendingCleanEdits.size ? `${pendingCleanEdits.size} passage${pendingCleanEdits.size === 1 ? '' : 's'} pending. Press Done to save.` : 'Edit wording in place. Press Done to finish.');
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
  if (run.state !== 'succeeded') { status.textContent = run.state === 'failed' ? `Cleanup stopped: ${run.error_message}` : `Cleaning transcript: ${run.stage}`; return; }
  const segments = run.result.segments;
  const review = segments.filter(segment => segment.needs_review && !segment.reviewed).length;
  status.textContent = `${segments.length} passages, ${review} awaiting audio review${run.stale ? '. Source transcript has changed.' : ''}`;
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
      row.title = `Play from ${time(segment.start_ms / 1000)}${segment.needs_review ? '. Check wording against audio.' : ''}`;
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
  const title = document.createElement('h3'); title.textContent = `Passage at ${time(segment.start_ms / 1000)}, ${segment.speaker_display_name}`;
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
    const activeVersion = currentTranscript?.generation_version || existing.pipeline_version;
    processButton.hidden = generationReview?.state === 'pending' ||
      activeVersion === capabilities.pipeline_version ||
      activeVersion.startsWith(`${capabilities.pipeline_version}-`);
    if (!processButton.hidden) processButton.textContent = 'Reprocess transcript';
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
  processingStatus.textContent = 'Transcribing…';
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
  processingStatus.textContent = `${job.stage.charAt(0).toUpperCase() + job.stage.slice(1)}: ${Math.round(job.progress * 100)}%`;
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
    const resolved = item => item.person_id || item.speaker_label_source?.startsWith('manual') || (item.speaker_cluster_id && !item.speaker_uncertain);
    const sameTurn = previous && resolved(previous) && resolved(segment) &&
      previous.speaker_display_name === segment.speaker_display_name &&
      (previous.person_id || segment.person_id ? previous.person_id === segment.person_id : true) &&
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
    editStatus.textContent = transcriptEditError || (pendingTranscriptEdits.size ? `${pendingTranscriptEdits.size} passage${pendingTranscriptEdits.size === 1 ? '' : 's'} pending. Press Done to save.` : 'Edit words in place. Press Done to finish.');
}
function setTranscriptEditMode(enabled) {
  document.querySelector('#comment-composer')?.remove();
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
  renderSeekSegments(data.segments);
  document.querySelector('#copy-transcript').hidden = !data.segments.length;
  await loadGenerationReview(id);
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
  renderTranscriptComments(data);
  const changed = data.segments.filter(segment => segment.raw_speaker_cluster_id !== undefined && segment.raw_speaker_cluster_id !== segment.speaker_cluster_id).length;
  const changesButton = document.querySelector('#show-rematch-changes');
  changesButton.hidden = !data.generation_version.includes('-speaker-embedding-v1');
  if (changesButton.hidden) rematchChangesOnly = false;
  changesButton.setAttribute('aria-pressed', String(rematchChangesOnly));
  document.querySelector('#rematch-change-count').textContent = changesButton.hidden ? '' : `${changed} changed`;
  // Use the same persisted effective labels as the turns. Raw acoustic clusters
  // omit passage and confirmed-Person labels, so they cannot drive this index.
  const speakerDurations = new Map();
  for (const segment of data.segments) {
    const name = segment.speaker_display_name;
    if (!name || name === 'Unknown speaker') continue;
    const duration = Math.max(0, segment.end_ms - segment.start_ms);
    speakerDurations.set(name, (speakerDurations.get(name) || 0) + duration);
  }
  const totalSpeakerDuration = [...speakerDurations.values()].reduce((sum, duration) => sum + duration, 0);
  const summary = document.createElement('div');
  summary.className = 'speaker-summary';
  summary.setAttribute('role', 'list');
  summary.setAttribute('aria-label', 'Speakers');
  for (const [name, duration] of [...speakerDurations].sort((a, b) => b[1] - a[1])) {
    const pill = document.createElement('span');
    pill.className = 'speaker-pill';
    pill.setAttribute('role', 'listitem');
    const share = totalSpeakerDuration ? duration * 100 / totalSpeakerDuration : 0;
    pill.textContent = `${name} (${share > 0 && share < 0.5 ? '<1' : Math.round(share)}%)`;
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
    const firstSegment = visible[0];
    const turnSpeaker = document.createElement('button');
    turnSpeaker.type = 'button';
    turnSpeaker.textContent = visible[0].speaker_display_name;
    turnSpeaker.setAttribute('aria-label', `Tag speaker for turn at ${time(visible[0].start_ms / 1000)}`);
    turnSpeaker.addEventListener('click', () => showSpeakerPicker(turnSpeaker, turn.querySelector('.segment'), firstSegment));
    const range = document.createElement('span'); range.textContent = `${time(visible[0].start_ms / 1000)}${visible.length > 1 ? `–${time(visible.at(-1).end_ms / 1000)}` : ''}`;
    heading.append(turnSpeaker, range);
    turn.append(heading);
    const body = document.createElement('div'); body.className = 'turn-body';
    for (const segment of visible) {
    const highlights = data.highlights.filter(item => item.segment_id === segment.id);
    const comments = data.comments.filter(item => item.segment_id === segment.id);
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
    speaker.addEventListener('click', () => showSpeakerPicker(speaker, row, segment));
    const words = document.createElement('div');
    words.className = 'segment-text';
    words.setAttribute('aria-label', `Transcript at ${time(segment.start_ms / 1000)}: ${segment.text}. Select text to highlight, comment, or click to play.`);
    renderHighlightedText(words, segment.text, highlights, segment.words || [], comments);
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
  processingStatus.textContent = `${data.segments.length} passages, ${turns.length} turns, ${speakerDurations.size} speakers${unresolved ? `, ${unresolved} unresolved` : ''}`;
  if (transcriptEditMode) setTranscriptEditMode(true);
  if (cleanRuns.length) loadCleanRuns(id).catch(error => document.querySelector('#clean-status').textContent = error.message);
  refreshTranscriptSearch();
  renderConversationImages();
  window.scrollTo(0, previousScroll);
}

async function loadGenerationReview(id) {
  generationReview = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/transcript/review`));
  if (id !== activeConversationId) return;
  const panel = document.querySelector('#generation-review');
  panel.hidden = !generationReview;
  if (!generationReview) return;
  const pending = generationReview.state === 'pending';
  const items = generationReview.items;
  const decisions = generationReview.decisions;
  const resolved = items.filter(item => Object.hasOwn(decisions, item.id) && decisions[item.id] !== null).length;
  const reviewed = items.filter(item => Object.hasOwn(decisions, item.id)).length;
  panel.hidden = !pending && resolved === items.length;
  document.querySelector('#generation-review-status').textContent = pending ?
    `${reviewed} of ${items.length} reviewed. Listen before assigning.` :
    `${items.length - resolved} unresolved changes. Prior wording remains in history.`;
  const container = document.querySelector('#generation-review-items'); container.replaceChildren();
  for (const item of items) {
    if (!pending && decisions[item.id] !== null) continue;
    const row = document.createElement('article'); row.className = 'generation-review-row';
    const title = document.createElement('strong'); title.textContent = `${item.kind}, ${time(item.source_start_ms / 1000)}, ${item.boundary_change}`;
    const source = document.createElement('p'); source.textContent = `Before: ${item.source_text}`;
    const value = document.createElement('p'); value.textContent = `Saved ${item.kind}: ${item.kind === 'person' ? item.source_speaker : item.value}`;
    const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Play source';
    play.addEventListener('click', () => { player.pause(); player.currentTime = item.source_start_ms / 1000; player.play().catch(() => {}); });
    row.append(title, source, value, play);
    for (const candidate of item.candidates) {
      const result = document.createElement('div'); result.className = 'generation-review-candidate';
      const wording = document.createElement('p'); wording.textContent = `After ${time(candidate.start_ms / 1000)}: ${candidate.text}`;
      const listen = document.createElement('button'); listen.type = 'button'; listen.textContent = 'Play new passage';
      listen.addEventListener('click', () => { player.pause(); player.currentTime = candidate.start_ms / 1000; player.play().catch(() => {}); });
      result.append(wording, listen); row.append(result);
    }
    if (pending) {
      const choice = document.createElement('select'); choice.setAttribute('aria-label', `Target for ${item.kind} at ${time(item.source_start_ms / 1000)}`);
      choice.append(new Option('Choose a result', ''), new Option('Keep unresolved', 'unresolved'));
      for (const candidate of item.candidates) choice.append(new Option(
        `${time(candidate.start_ms / 1000)}: ${candidate.text.slice(0, 120)} (${Math.round(candidate.score * 100)}% match)`, candidate.segment_id));
      if (Object.hasOwn(decisions, item.id)) choice.value = decisions[item.id] ?? 'unresolved';
      const suggestion = document.createElement('small'); suggestion.textContent = item.suggestion ?
        'Check the recording before assigning.' : 'Listen to both passages.';
      choice.addEventListener('change', async () => {
        if (!choice.value) return;
        try {
          await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/transcript/review/decisions`, {
            method:'PUT', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({item_id:item.id,target_segment_id:choice.value === 'unresolved' ? null : choice.value}),
          }));
          await loadGenerationReview(id);
        } catch (error) { document.querySelector('#generation-review-status').textContent = error.message; }
      });
      row.append(choice, suggestion);
    }
    container.append(row);
  }
  document.querySelector('#generation-keep-source').hidden = !pending;
  document.querySelector('#generation-activate').hidden = !pending;
  document.querySelector('#generation-activate').disabled = reviewed !== items.length;
}

document.querySelector('#generation-keep-source').addEventListener('click', async () => {
  if (!activeConversationId || !window.confirm('Keep the current transcript? The new candidate will remain in generation history.')) return;
  try { await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/transcript/review/keep-source`, {method:'POST'}));
    await loadGenerationReview(activeConversationId); }
  catch (error) { document.querySelector('#generation-review-status').textContent = error.message; }
});
document.querySelector('#generation-activate').addEventListener('click', async () => {
  if (!activeConversationId || !window.confirm('Use the new transcription with only the mappings you reviewed?')) return;
  try { await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/transcript/review/activate`, {method:'POST'}));
    await showTranscript(activeConversationId); }
  catch (error) { document.querySelector('#generation-review-status').textContent = error.message; }
});
function renderHighlightedText(container, value, highlights, timedWords = [], comments = []) {
  const valid = highlights.filter(item => value.slice(item.start_offset, item.end_offset) === item.quote);
  const anchoredComments = comments.filter(item => value.slice(item.start_offset, item.end_offset) === item.quote);
  const measured = timedWords.map((word, index) => ({...word, index})).filter(word => value.slice(word.start_offset, word.end_offset) === word.text && word.end_ms > word.start_ms);
  const edges = [...new Set([0, value.length, ...valid.flatMap(item => [item.start_offset, item.end_offset]),
    ...anchoredComments.flatMap(item => [item.start_offset, item.end_offset]),
    ...measured.flatMap(word => [word.start_offset, word.end_offset])])].sort((a, b) => a - b);
  let currentWord = null;
  let currentWordIndex = -1;
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i], end = edges[i + 1];
    const content = value.slice(start, end);
    const marked = valid.some(item => item.start_offset <= start && item.end_offset >= end);
    const commented = anchoredComments.some(item => item.start_offset <= start && item.end_offset >= end);
    const wordIndex = measured.findIndex(word => word.start_offset <= start && word.end_offset >= end);
    if (wordIndex !== currentWordIndex) {
      currentWordIndex = wordIndex; currentWord = null;
      if (wordIndex >= 0) {
        const word = measured[wordIndex]; currentWord = document.createElement('span');
        currentWord.className = 'timed-word'; currentWord.dataset.wordIndex = String(word.index);
        currentWord.dataset.startMs = String(word.start_ms); currentWord.dataset.endMs = String(word.end_ms);
        currentWord.title = `Play from ${time(word.start_ms / 1000)}, measured on this device`;
        container.append(currentWord);
      }
    }
    let node = marked ? document.createElement('mark') : document.createTextNode(content);
    if (marked) { node.textContent = content; node.title = 'Highlighted excerpt'; }
    if (commented) {
      const anchor = document.createElement('span'); anchor.className = 'comment-range'; anchor.title = 'Open comments';
      anchor.addEventListener('click', event => {
        if (window.getSelection()?.toString().trim()) return;
        event.stopPropagation(); commentsOpen = true; renderTranscriptComments(currentTranscript);
        document.querySelector('#transcript-comments').scrollIntoView({block:'nearest'});
      });
      anchor.append(node); node = anchor;
    }
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
document.querySelector('#comments-toggle').addEventListener('click', () => {
  commentsOpen = !commentsOpen;
  renderTranscriptComments(currentTranscript);
});
function renderTranscriptComments(data) {
  const list = document.querySelector('#comments-list');
  const comments = data?.comments || [];
  document.querySelector('#comment-count').textContent = String(comments.length);
  document.querySelector('#comments-toggle').setAttribute('aria-expanded', String(commentsOpen));
  list.hidden = !commentsOpen;
  list.replaceChildren();
  if (!commentsOpen) return;
  for (const comment of comments) {
    const segment = data.segments.find(item => item.id === comment.segment_id);
    const exact = segment && segment.text.slice(comment.start_offset, comment.end_offset) === comment.quote;
    const item = document.createElement('article'); item.className = 'transcript-comment'; item.dataset.commentId = comment.id;
    const source = document.createElement('button'); source.type = 'button'; source.textContent = time(comment.start_ms / 1000);
    source.setAttribute('aria-label', `Play comment source at ${time(comment.start_ms / 1000)}`);
    source.addEventListener('click', () => {
      player.currentTime = comment.start_ms / 1000; player.play().catch(() => {});
      if (segment) transcriptView.querySelectorAll('.segment').forEach(row => {
        if (row.dataset.segmentId === comment.segment_id) row.scrollIntoView({block:'center'});
      });
    });
    const quote = document.createElement('blockquote'); quote.textContent = comment.quote;
    const body = document.createElement('p'); body.textContent = comment.body;
    const actions = document.createElement('div'); actions.className = 'comment-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit';
    edit.addEventListener('click', () => {
      const form = document.createElement('form'); form.className = 'comment-edit';
      const input = document.createElement('textarea'); input.value = comment.body; input.maxLength = 2000;
      input.setAttribute('aria-label', 'Edit comment');
      const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => renderTranscriptComments(currentTranscript));
      const message = document.createElement('p'); message.setAttribute('role', 'status');
      form.append(input, save, cancel, message); body.replaceWith(form); input.focus();
      form.addEventListener('submit', async event => {
        event.preventDefault(); save.disabled = true;
        try {
          await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/comments/${encodeURIComponent(comment.id)}`, {
            method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:input.value})}));
          await showTranscript(activeConversationId);
        } catch (error) { message.textContent = error.message; save.disabled = false; }
      });
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete';
    remove.addEventListener('click', async () => {
      if (!window.confirm('Delete comment?')) return;
      remove.disabled = true;
      try { await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/comments/${encodeURIComponent(comment.id)}`, {method:'DELETE'}));
        await showTranscript(activeConversationId);
      } catch (error) { processingStatus.textContent = error.message; remove.disabled = false; }
    });
    actions.append(edit, remove); item.append(source, quote, body);
    if (!exact) { const status = document.createElement('small'); status.textContent = segment ? 'Source changed' : 'Earlier transcript'; item.append(status); }
    item.append(actions); list.append(item);
  }
}
function openCommentComposer(excerpt) {
  commentsOpen = true; renderTranscriptComments(currentTranscript);
  const list = document.querySelector('#comments-list');
  const form = document.createElement('form'); form.id = 'comment-composer'; form.className = 'comment-composer';
  const quote = document.createElement('blockquote');
  const segment = currentTranscript.segments.find(item => item.id === excerpt.segment_id);
  quote.textContent = segment?.text.slice(excerpt.start_offset, excerpt.end_offset) || '';
  const input = document.createElement('textarea'); input.rows = 3; input.maxLength = 2000;
  input.placeholder = 'Add a comment'; input.setAttribute('aria-label', 'Add a comment');
  const actions = document.createElement('div'); actions.className = 'comment-actions';
  const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save'; save.disabled = true;
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => form.remove());
  input.addEventListener('input', () => { save.disabled = !input.value.trim(); });
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  actions.append(save, cancel); form.append(quote, input, actions, message); list.prepend(form);
  form.addEventListener('submit', async event => {
    event.preventDefault(); save.disabled = true;
    try { await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/comments`, {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...excerpt,body:input.value})}));
      await showTranscript(activeConversationId); processingStatus.textContent = 'Comment saved.';
    } catch (error) { message.textContent = error.message; save.disabled = false; }
  });
  document.querySelector('#transcript-comments').scrollIntoView({block:'nearest'}); input.focus();
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
      processingStatus.textContent = 'Highlight saved.';
    } catch (error) { processingStatus.textContent = error.message; }
  });
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy';
  copy.addEventListener('mousedown', event => event.preventDefault());
  copy.addEventListener('click', async () => { await navigator.clipboard.writeText(selection.toString()); hideSelectionToolbar(); });
  const comment = document.createElement('button'); comment.type = 'button'; comment.textContent = 'Comment';
  comment.addEventListener('mousedown', event => event.preventDefault());
  comment.addEventListener('click', () => { const excerpt = selectedExcerpt; hideSelectionToolbar();
    selection.removeAllRanges(); if (excerpt) openCommentComposer(excerpt); });
  toolbar.append(highlight, comment, copy); document.body.append(toolbar);
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
      processingStatus.textContent = 'Transcript saved.';
    } catch (error) { message.textContent = error.message; save.disabled = false; }
  });
  row.append(form); form.scrollIntoView({block:'start'}); input.focus(); input.select();
}
function showSpeakerPicker(anchor, row, segment) {
  document.querySelectorAll('.speaker-picker').forEach(picker => picker.remove());
  const picker = document.createElement('div');
  picker.className = 'speaker-picker';
  picker.setAttribute('role', 'dialog');
  picker.setAttribute('aria-label', 'Tag speaker');
  const search = document.createElement('input');
  search.type = 'search'; search.placeholder = 'Search speakers'; search.maxLength = 100;
  search.setAttribute('aria-label', 'Search speakers');
  const tag = document.createElement('button'); tag.type = 'button'; tag.textContent = 'Tag'; tag.disabled = true;
  const top = document.createElement('div'); top.className = 'speaker-picker-search'; top.append(search, tag);
  const list = document.createElement('div'); list.className = 'speaker-picker-list';
  const manage = document.createElement('button'); manage.type = 'button'; manage.className = 'speaker-picker-manage'; manage.textContent = 'Manage Speakers';
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  picker.append(top, list, message, manage);
  const host = anchor.closest('.turn-heading') || anchor.parentElement;
  host.append(picker);
  const close = event => { if (!picker.contains(event.target) && event.target !== anchor) { picker.remove(); document.removeEventListener('pointerdown', close); } };
  document.addEventListener('pointerdown', close);
  picker.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); picker.remove(); anchor.focus(); } });
  const manualNames = [...new Map((currentTranscript?.segments || [])
    .filter(item => !item.person_id && item.speaker_label_source?.startsWith('manual_'))
    .map(item => item.speaker_display_name)
    .filter(Boolean)
    .map(name => [name.trim().replace(/\s+/g, ' ').toLocaleLowerCase(), name])).values()];
  let people = [];
  async function apply(name, personId) {
    tag.disabled = true;
    message.textContent = '';
    try {
      const person = (personId ? people.find(item => item.id === personId) : null) ||
        people.find(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      const result = await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/person-links`, {
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({person_id:person?.id || null,name:person ? null : name,segment_id:segment.id,
          scope:segment.speaker_label_source === 'manual_segment' ? 'segment' : segment.speaker_cluster_id ? 'cluster' : 'segment',
          expected_revision:currentTranscript.revision}),
      }));
      picker.remove(); document.removeEventListener('pointerdown', close);
      await showTranscript(activeConversationId);
      processingStatus.textContent = result.preserved_other_people ?
        `Speaker tagged. ${result.preserved_other_people} previously tagged passage${result.preserved_other_people === 1 ? '' : 's'} kept.` : 'Speaker tagged.';
    } catch (error) { message.textContent = error.message; tag.disabled = false; }
  }
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    tag.disabled = !query;
    list.replaceChildren();
    const title = document.createElement('strong'); title.textContent = 'Select speaker'; list.append(title);
    const names = [...people.filter(person => !person.hidden_at || person.id === segment.person_id).map(person => ({name:person.name,id:person.id})),
      ...manualNames.filter(name => !people.some(person => person.name.toLocaleLowerCase() === name.toLocaleLowerCase())).map(name => ({name,id:null}))];
    for (const item of names.filter(item => !query || item.name.toLocaleLowerCase().includes(query))) {
      const line = document.createElement('div'); line.className = 'speaker-picker-option';
      const option = document.createElement('button'); option.type = 'button'; option.textContent = item.name;
      option.addEventListener('click', () => apply(item.name, item.id)); line.append(option);
      const current = (segment.person_id && segment.person_id === item.id) ||
        (!segment.person_id && segment.speaker_label_source?.startsWith('manual_') && segment.speaker_display_name === item.name);
      if (current) {
        const untag = document.createElement('button'); untag.type = 'button'; untag.textContent = 'Untag';
        untag.addEventListener('click', async () => {
          untag.disabled = true;
          try {
            if (segment.person_id) await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/person-links/remove`, {
              method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({segment_id:segment.id,scope:segment.speaker_cluster_id ? 'cluster' : 'segment',expected_revision:currentTranscript.revision}),
            }));
            else await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/speakers/label`, {
              method:'PUT',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({scope:segment.speaker_label_source === 'manual_segment' ? 'segment' : 'cluster',target_id:segment.speaker_label_source === 'manual_segment' ? segment.id : segment.speaker_cluster_id,name:null,expected_revision:currentTranscript.revision}),
            }));
            picker.remove(); document.removeEventListener('pointerdown', close);
            await showTranscript(activeConversationId); processingStatus.textContent = 'Speaker untagged.';
          } catch (error) { message.textContent = error.message; untag.disabled = false; }
        });
        line.append(untag);
      }
      list.append(line);
    }
  }
  search.addEventListener('input', render);
  search.addEventListener('keydown', event => { if (event.key === 'Enter' && !tag.disabled) { event.preventDefault(); tag.click(); } });
  tag.addEventListener('click', () => { const name = search.value.trim(); if (name) apply(name, null); });
  manage.addEventListener('click', () => {
    picker.remove(); document.removeEventListener('pointerdown', close);
    showManageSpeakers(row, segment);
  });
  fetch(`${API}/persons`).then(json).then(items => { if (picker.isConnected) { people = items; render(); } })
    .catch(error => { message.textContent = error.message; });
  render(); search.focus();
}
async function showManageSpeakers(row, segment) {
  document.querySelector('#manage-speakers-dialog')?.remove();
  const dialog = document.createElement('dialog'); dialog.id = 'manage-speakers-dialog';
  const heading = document.createElement('div'); heading.className = 'manage-speakers-heading';
  const title = document.createElement('h2'); title.textContent = 'Manage Speakers';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => dialog.close()); heading.append(title, close);
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Search'; search.setAttribute('aria-label', 'Search speakers');
  const list = document.createElement('div'); list.className = 'manage-speakers-list';
  const detail = document.createElement('div'); detail.className = 'manage-speakers-detail';
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  const merge = document.createElement('button'); merge.type = 'button'; merge.textContent = 'Merge'; merge.disabled = true;
  const editPassage = document.createElement('button'); editPassage.type = 'button'; editPassage.textContent = 'Edit this passage';
  const footer = document.createElement('div'); footer.className = 'manage-speakers-footer'; footer.append(editPassage, merge);
  const body = document.createElement('div'); body.className = 'manage-speakers-body'; body.append(list, detail);
  dialog.append(heading, search, body, message, footer); document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.showModal();
  let people = [];
  const selected = new Set();
  function render() {
    list.replaceChildren(); detail.replaceChildren();
    for (const person of people.filter(item => item.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))) {
      const item = document.createElement('div'); item.className = 'manage-speaker-row';
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(person.id);
      check.setAttribute('aria-label', `Select ${person.name}`);
      check.addEventListener('change', () => { if (check.checked) selected.add(person.id); else selected.delete(person.id); render(); });
      const identity = document.createElement('span'); identity.textContent = person.name;
      if (person.hidden_at) { const hidden = document.createElement('small'); hidden.textContent = 'Hidden'; identity.append(hidden); }
      const rename = document.createElement('button'); rename.type = 'button'; rename.textContent = 'Rename';
      rename.setAttribute('aria-label', `Rename ${person.name}`);
      rename.addEventListener('click', () => {
        const form = document.createElement('form'); form.className = 'manage-speaker-rename';
        const input = document.createElement('input'); input.value = person.name; input.maxLength = 100; input.setAttribute('aria-label', 'Speaker name');
        const save = document.createElement('button'); save.textContent = 'Save';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', render);
        form.append(input, save, cancel); item.replaceChildren(form); input.focus(); input.select();
        form.addEventListener('submit', async event => {
          event.preventDefault(); save.disabled = true;
          try { await json(await fetch(`${API}/persons/${encodeURIComponent(person.id)}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:input.value})}));
            people = await json(await fetch(`${API}/persons`)); message.textContent = 'Speaker renamed.'; render(); await showTranscript(activeConversationId);
          } catch (error) { message.textContent = error.message; save.disabled = false; }
        });
      });
      const visibility = document.createElement('button'); visibility.type = 'button'; visibility.textContent = person.hidden_at ? 'Show' : 'Hide';
      visibility.setAttribute('aria-label', `${person.hidden_at ? 'Show' : 'Hide'} ${person.name}`);
      visibility.addEventListener('click', async () => {
        visibility.disabled = true;
        try { await json(await fetch(`${API}/persons/${encodeURIComponent(person.id)}/visibility`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({hidden:!person.hidden_at})}));
          people = await json(await fetch(`${API}/persons`)); message.textContent = person.hidden_at ? 'Speaker shown.' : 'Speaker hidden.'; render();
        } catch (error) { message.textContent = error.message; visibility.disabled = false; }
      });
      item.append(check, identity, rename, visibility); list.append(item);
    }
    const manual = (currentTranscript?.speaker_labels || []).filter(label => {
      const matches = currentTranscript.segments.filter(item =>
        label.scope === 'cluster' ? item.speaker_cluster_id === label.target_id : item.id === label.target_id);
      return matches.some(item => !item.person_id) && label.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase());
    });
    const distinctManual = [...new Map(manual.map(label => [label.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase(), label])).values()]
      .filter(label => !people.some(person => person.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ===
        label.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()));
    for (const label of distinctManual) {
      const item = document.createElement('div'); item.className = 'manage-speaker-row';
      const identity = document.createElement('span'); identity.textContent = label.name;
      const local = document.createElement('small'); local.textContent = 'This recording'; identity.append(local);
      const tag = document.createElement('button'); tag.type = 'button'; tag.textContent = 'Tag';
      tag.addEventListener('click', async () => {
        const first = currentTranscript.segments.find(item => !item.person_id &&
          item.speaker_display_name.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ===
            label.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase() &&
          (label.scope === 'cluster' ? item.speaker_cluster_id === label.target_id : item.id === label.target_id));
        if (!first) return;
        tag.disabled = true;
        try { await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/person-links`, {
          method:'PUT',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({name:label.name,segment_id:first.id,
            scope:first.speaker_label_source === 'manual_segment' ? 'segment' : label.scope,
            expected_revision:currentTranscript.revision}),
        })); await showTranscript(activeConversationId); people = await json(await fetch(`${API}/persons`)); message.textContent = 'Speaker tagged.'; render();
        } catch (error) { message.textContent = error.message; tag.disabled = false; }
      });
      item.append(identity, tag); list.append(item);
    }
    merge.disabled = selected.size !== 2;
    if (selected.size === 2) {
      const label = document.createElement('label'); label.textContent = 'Keep speaker';
      const target = document.createElement('select'); target.id = 'manage-speakers-target';
      for (const person of people.filter(item => selected.has(item.id))) target.append(new Option(person.name, person.id));
      label.append(target); detail.append(label);
    } else detail.textContent = 'Select two speakers to merge.';
  }
  search.addEventListener('input', render);
  editPassage.addEventListener('click', () => {
    dialog.close();
    if (pendingTranscriptEdits.size) { editStatus.textContent = 'Press Done to save word changes first.'; return; }
    showSpeakerEditor(row, segment);
  });
  merge.addEventListener('click', async () => {
    const targetId = document.querySelector('#manage-speakers-target')?.value;
    const sourceId = [...selected].find(id => id !== targetId);
    if (!targetId || !sourceId) return;
    const targetName = people.find(person => person.id === targetId)?.name;
    const sourceName = people.find(person => person.id === sourceId)?.name;
    if (!window.confirm(`Merge ${sourceName} into ${targetName}?`)) return;
    merge.disabled = true;
    try { await json(await fetch(`${API}/persons/${encodeURIComponent(targetId)}/merge`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_id:sourceId})}));
      selected.clear(); people = await json(await fetch(`${API}/persons`)); message.textContent = 'Speakers merged.'; render(); await showTranscript(activeConversationId);
    } catch (error) { message.textContent = error.message; merge.disabled = false; }
  });
  try { people = await json(await fetch(`${API}/persons`)); render(); search.focus(); }
  catch (error) { message.textContent = error.message; }
}
function showSpeakerEditor(row, segment) {
  closeRowEditor(row);
  const form = document.createElement('div'); form.className = 'segment-editor';
  const scopeLabel = document.createElement('label'); scopeLabel.textContent = 'Apply to';
  const scope = document.createElement('select');
  for (const [value, caption] of [['cluster','All matching speaker turns'],['segment','This passage only']]) {
    if (value === 'cluster' && !segment.speaker_cluster_id) continue;
    const option = document.createElement('option'); option.value = value; option.textContent = caption; scope.append(option);
  }
  scope.value = segment.speaker_label_source === 'manual_segment' ? 'segment' : (segment.speaker_cluster_id ? 'cluster' : 'segment');
  scopeLabel.append(scope);
  const actions = document.createElement('div'); actions.className = 'editor-actions';
  const clear = document.createElement('button'); clear.type = 'button'; clear.textContent = 'Clear manual label';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.addEventListener('click', () => form.remove());
  actions.append(clear, cancel);
  clear.hidden = !segment.speaker_label_source?.startsWith('manual_') || !!segment.person_id;
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  const personSection = document.createElement('div'); personSection.className = 'person-confirmation';
  const personTitle = document.createElement('strong'); personTitle.textContent = 'Tag speaker';
  const personSelectLabel = document.createElement('label'); personSelectLabel.textContent = 'Existing speaker';
  const personSelect = document.createElement('select'); personSelect.append(new Option('Choose a person', ''));
  personSelectLabel.append(personSelect);
  const newPersonLabel = document.createElement('label'); newPersonLabel.textContent = 'New speaker name';
  const newPerson = document.createElement('input'); newPerson.type = 'text'; newPerson.maxLength = 100;
  newPerson.placeholder = 'Name';
  if (segment.speaker_label_source?.startsWith('manual_') && !segment.person_id) newPerson.value = segment.speaker_display_name;
  newPersonLabel.append(newPerson);
  const personActions = document.createElement('div'); personActions.className = 'editor-actions';
  const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = 'Tag';
  const unlink = document.createElement('button'); unlink.type = 'button'; unlink.textContent = 'Untag'; unlink.hidden = !segment.person_id;
  personActions.append(confirm, unlink);
  personSection.append(personTitle, personSelectLabel, newPersonLabel, personActions);
  fetch(`${API}/persons`).then(json).then(people => {
    personSelect.replaceChildren(new Option('Choose a person', ''), ...people.map(person => new Option(person.name, person.id)));
    if (segment.person_id) personSelect.value = segment.person_id;
  }).catch(error => { message.textContent = error.message; });
  personSelect.addEventListener('change', () => { if (personSelect.value) newPerson.value = ''; });
  newPerson.addEventListener('input', () => { if (newPerson.value.trim()) personSelect.value = ''; });
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    try {
      const speakerName = newPerson.value.trim();
      if (!speakerName && !personSelect.value) throw new Error('Choose or name a speaker.');
      await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/person-links`, {
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({person_id:speakerName ? null : personSelect.value,name:speakerName || null,
          segment_id:segment.id,scope:scope.value,expected_revision:currentTranscript.revision}),
      }));
      await showTranscript(activeConversationId);
      processingStatus.textContent = 'Speaker tagged.';
    } catch (error) { message.textContent = error.message; confirm.disabled = false; }
  });
  newPerson.addEventListener('keydown', event => { if (event.key === 'Enter') {event.preventDefault();confirm.click();} });
  unlink.addEventListener('click', async () => {
    unlink.disabled = true;
    try {
      await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/person-links/remove`, {
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({segment_id:segment.id,scope:scope.value,expected_revision:currentTranscript.revision}),
      }));
      await showTranscript(activeConversationId);
      processingStatus.textContent = 'Speaker untagged.';
    } catch (error) { message.textContent = error.message; unlink.disabled = false; }
  });
  clear.addEventListener('click', async () => {
    const targetId = scope.value === 'cluster' ? segment.speaker_cluster_id : segment.id;
    clear.disabled = true;
    try {
      await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/speakers/label`, {
        method:'PUT', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({scope:scope.value,target_id:targetId,name:null,expected_revision:currentTranscript.revision}),
      }));
      await showTranscript(activeConversationId);
      processingStatus.textContent = 'Speaker label cleared.';
    } catch (error) { message.textContent = error.message; clear.disabled = false; }
  });
  form.append(scopeLabel, personSection, actions, message);
  row.append(form); form.scrollIntoView({block:'start'}); newPerson.focus();
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
  else if (location.pathname === '/recording') showRecordingWorkspace();
  else if (location.pathname.match(/^\/person\/([^/]+)$/))
    await showPerson(decodeURIComponent(location.pathname.split('/')[2]));
  else await showList();
}
async function importFile(file) {
  if (!file) return;
  if ((pendingTranscriptEdits.size || pendingCleanEdits.size) && !window.confirm('Discard unsaved transcript changes and import another recording?')) return;
  importStatus.textContent = `Importing ${file.name}…`;
  setStatus(`Importing ${file.name}…`);
  fileInput.disabled = true;
  document.querySelector('#import-close').disabled = true;
  const body = new FormData();
  body.append('file', file);
  try {
    const result = await json(await fetch(`${API}/conversations/import`, {method: 'POST', body}));
    history.pushState({}, '', `/conversation/${encodeURIComponent(result.conversation.id)}`);
    await showDetail(result.conversation.id);
    importDialog.close();
    importStatus.textContent = '';
    setStatus(result.duplicate ? 'Already imported. Opening your recording.' : 'Recording imported.', true);
  } catch (error) {
    importStatus.textContent = error.message;
    setStatus(error.message);
  } finally {
    fileInput.disabled = false;
    document.querySelector('#import-close').disabled = false;
    fileInput.value = '';
  }
}
function captureElapsedMs() {
  if (!capture) return 0;
  const paused = capture.pausedAt ? Date.now() - capture.pausedAt : 0;
  return Math.max(0, Date.now() - capture.startedAt - capture.totalPausedMs - paused);
}
function drawRecordingWaveform(current, audioContext) {
  const canvas = document.querySelector('#recording-waveform');
  const context = canvas.getContext('2d');
  if (!context || !audioContext) {audioContext?.close().catch(() => {}); return () => {};}
  const source = audioContext.createMediaStreamSource(current.stream);
  const analyser = audioContext.createAnalyser(); analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--accent-strong').trim() || '#3652b4';
  let frame;
  const draw = () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (capture === current && current.recorder.state === 'recording') analyser.getByteTimeDomainData(samples);
    const count = 48, barWidth = 3, gap = 3;
    context.fillStyle = color;
    for (let index = 0; index < count; index++) {
      let peak = 0;
      if (capture === current && current.recorder.state === 'recording') {
        const start = Math.floor(index * samples.length / count);
        const end = Math.floor((index + 1) * samples.length / count);
        for (let sample = start; sample < end; sample++) peak = Math.max(peak, Math.abs(samples[sample] - 128));
      }
      const height = Math.max(2, Math.min(38, peak * 1.2 + 2));
      context.fillRect(index * (barWidth + gap) + 12, (canvas.height - height) / 2, barWidth, height);
    }
    frame = requestAnimationFrame(draw);
  };
  draw();
  return () => {cancelAnimationFrame(frame); source.disconnect(); audioContext.close().catch(() => {});
    context.clearRect(0, 0, canvas.width, canvas.height);};
}
function renderRecordingChat(runs, container, saved = false) {
  container.replaceChildren();
  for (const run of runs) {
    const card = document.createElement('article');
    const heading = document.createElement(saved ? 'h4' : 'h3'); heading.textContent = run.question;
    const answer = document.createElement('p');
    answer.textContent = run.state === 'succeeded' ? run.result.answer :
      run.state === 'failed' ? run.error_message : `Answering: ${run.stage}`;
    card.append(heading, answer);
    if (run.state === 'succeeded' && run.result.source_segment_ids.length) {
      if (saved) card.append(sourceButtons(run.result.source_segment_ids, run.source_starts));
      else {const times = document.createElement('small');
        times.textContent = run.result.source_segment_ids.map(id => time((run.source_starts[id] || 0) / 1000)).join(', ');
        card.append(times);}
    }
    if (!saved && run.state === 'succeeded') {
      const note = document.createElement('small'); note.textContent = 'Based on live transcript'; card.append(note);
    }
    container.append(card);
  }
}
async function loadRecordingChat(recordingId) {
  clearTimeout(recordingChatTimer);
  const runs = await json(await fetch(`${API}/recordings/${encodeURIComponent(recordingId)}/chat`));
  if (capture?.session.id !== recordingId && notesStates.recording?.id !== recordingId) return;
  renderRecordingChat(runs, document.querySelector('#recording-chat-messages'));
  if (runs.some(run => run.state === 'queued' || run.state === 'running'))
    recordingChatTimer = setTimeout(() => loadRecordingChat(recordingId).catch(error => {
      document.querySelector('#recording-chat-status').textContent = error.message;}), 2000);
}
async function askRecordingChat(question) {
  const recordingId = capture?.session.id || notesStates.recording?.id;
  const status = document.querySelector('#recording-chat-status');
  if (!recordingId) {status.textContent = 'Start recording first.'; return;}
  status.textContent = 'Answering…';
  try {
    await json(await fetch(`${API}/recordings/${encodeURIComponent(recordingId)}/chat`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question})}));
    document.querySelector('#recording-chat-input').value = '';
    status.textContent = '';
    await loadRecordingChat(recordingId);
  } catch (error) {status.textContent = error.message;}
}
document.querySelector('#recording-chat-form').addEventListener('submit', event => {
  event.preventDefault(); askRecordingChat(document.querySelector('#recording-chat-input').value);
});
document.querySelectorAll('[data-live-question]').forEach(button => button.addEventListener('click', () =>
  askRecordingChat(button.dataset.liveQuestion)));
async function loadSavedRecordingChat(conversationId) {
  const runs = await json(await fetch(`${API}/conversations/${encodeURIComponent(conversationId)}/recording-chat`));
  if (conversationId !== activeConversationId) return;
  const container = document.querySelector('#saved-recording-chat'); container.replaceChildren();
  if (!runs.length) return;
  const heading = document.createElement('h3'); heading.textContent = 'During recording'; container.append(heading);
  const messages = document.createElement('div'); renderRecordingChat(runs, messages, true); container.append(messages);
  if (runs.some(run => run.state === 'queued' || run.state === 'running'))
    setTimeout(() => loadSavedRecordingChat(conversationId).catch(() => {}), 2000);
}
function captureControls() {
  const active = Boolean(capture?.recorder && capture.recorder.state !== 'inactive');
  if (active && (captureHeartbeatId !== capture.session.id || Date.now() - captureHeartbeatAt >= 1000)) {
    try { localStorage.setItem(recordingHeartbeatKey(capture.session.id), JSON.stringify({at:Date.now(), state:capture.recorder.state})); } catch {}
    captureHeartbeatId = capture.session.id;
    captureHeartbeatAt = Date.now();
  }
  document.querySelector('#start-recording').hidden = active;
  document.querySelector('#start-recording').disabled = captureRequesting || captureFinalizing;
  document.querySelector('#stop-recording').hidden = !active;
  document.querySelector('#pause-recording').hidden = !active || !capture.recorder.pause;
  document.querySelector('#pause-recording').textContent = capture?.recorder?.state === 'paused' ? 'Resume' : 'Pause';
  document.querySelector('#back-from-recording').disabled = captureRequesting || captureFinalizing;
  document.querySelector('#record-button').textContent = active ? 'Open recording' : 'Record';
  const elapsed = time(captureElapsedMs() / 1000);
  recordingTimer.textContent = elapsed;
  document.querySelector('#capture-header-controls').hidden = !active || location.pathname === '/recording';
  document.querySelector('#capture-header-timer').textContent = elapsed;
  const headerPause = document.querySelector('#capture-header-pause');
  const paused = capture?.recorder?.state === 'paused';
  headerPause.textContent = paused ? '▶' : 'Ⅱ';
  headerPause.setAttribute('aria-label', paused ? 'Resume recording' : 'Pause recording');
  headerPause.title = paused ? 'Resume recording' : 'Pause recording';
  const liveCard = document.querySelector('#live-recording-card');
  liveCard.hidden = !active;
  if (active) {
    document.querySelector('#live-recording-state').textContent = capture.recorder.state === 'paused' ? 'Paused' : 'Live';
    document.querySelector('#live-recording-title').textContent = document.querySelector('#recording-title').value.trim() || capture.session.title;
    document.querySelector('#live-recording-time').textContent = elapsed;
  }
  document.querySelector('#add-recording-image').disabled = !(capture?.session.id || notesStates.recording?.id);
}
function showRecordingView(view) {
  if (view !== 'chat') recordingPrimaryView = view;
  const notes = view === 'notes';
  const transcript = view === 'transcript';
  document.querySelector('#recording-notes-panel').hidden = !notes;
  document.querySelector('#recording-transcript-panel').hidden = !transcript;
  document.querySelector('#recording-notes-tab').setAttribute('aria-selected', String(notes));
  document.querySelector('#recording-transcript-tab').setAttribute('aria-selected', String(transcript));
  document.querySelector('#recording-chat-toggle').setAttribute('aria-expanded', String(view === 'chat'));
  document.querySelector('.recording-workspace-grid').classList.toggle('recording-chat-open', view === 'chat');
}
document.querySelector('#recording-notes-tab').addEventListener('click', () => showRecordingView('notes'));
document.querySelector('#recording-transcript-tab').addEventListener('click', () => showRecordingView('transcript'));
document.querySelector('#recording-chat-toggle').addEventListener('click', () =>
  showRecordingView(document.querySelector('#recording-chat-toggle').getAttribute('aria-expanded') === 'true' ? recordingPrimaryView : 'chat'));
function showRecordingWorkspace() {
  document.body.classList.remove('profile-page', 'conversation-page');
  document.body.classList.add('recording-page');
  conversationMore.open = false; conversationMore.hidden = true;
  clearTimeout(jobTimer); clearTimeout(aiRunTimer); clearTimeout(enhancedPollTimer); clearTimeout(cleanRunTimer);
  clearTimeout(recordingChatTimer);
  clearTimeout(silenceScanTimer); silenceSpans = [];
  player.pause(); player.removeAttribute('src'); player.load();
  activeConversationId = null;
  listView.hidden = true; detailView.hidden = true;
  document.querySelector('#trash-view').hidden = true;
  document.querySelector('#person-view').hidden = true;
  document.querySelector('#vocabulary-panel').hidden = true;
  recordingPanel.hidden = false;
  document.querySelector('#page-title').textContent = 'New recording';
  showRecordingView('notes');
  if (!capture) {
    document.querySelector('#recording-transcript-state').textContent = 'Listening…';
    document.querySelector('#recording-transcript-preview').replaceChildren();
    document.querySelector('#recording-chat-messages').replaceChildren();
    document.querySelector('#recording-chat-status').textContent = '';
  }
  captureControls();
}
function renderRecordingPreview(result) {
  const container = document.querySelector('#recording-transcript-preview'); container.replaceChildren();
  const segments = result.segments || [];
  document.querySelector('#recording-transcript-state').textContent = segments.length ? 'Provisional transcript' : 'No speech yet';
  for (const segment of segments) {
    const row = document.createElement('p');
    const stamp = document.createElement('time'); stamp.textContent = time(segment.start_ms / 1000);
    const words = document.createElement('span'); words.textContent = segment.text;
    row.append(stamp, words); container.append(row);
  }
}
async function updateRecordingPreview(current) {
  if (current.previewPending || current.previewDisabled || capture !== current || current.sequence < 5) return;
  if (current.sequence - current.lastPreviewSequence < 8 && current.lastPreviewSequence >= 0) return;
  current.previewPending = true;
  document.querySelector('#recording-transcript-state').textContent = 'Transcribing on this device…';
  try {
    const result = await json(await fetch(`${API}/recordings/${encodeURIComponent(current.session.id)}/preview`, {method:'POST'}));
    if (capture === current) {current.lastPreviewSequence = result.through_sequence; renderRecordingPreview(result);}
  } catch (error) {
    if (capture === current) {
      current.previewDisabled = true;
      document.querySelector('#recording-transcript-state').textContent = 'Live transcript unavailable';
    }
  } finally {
    current.previewPending = false;
    if (capture === current && !current.previewDisabled && current.sequence - current.lastPreviewSequence >= 8)
      updateRecordingPreview(current);
  }
}
async function loadRecoveries() {
  const sessions = await json(await fetch(`${API}/recordings`));
  const container = document.querySelector('#recover-recordings'); container.replaceChildren();
  for (const session of sessions) {
    if (capture?.session.id === session.id) continue;
    const row = document.createElement('div'); row.className = 'recovery-row';
    const title = document.createElement('strong'); title.textContent = session.title;
    const message = document.createElement('span');
    let heartbeat;
    try { heartbeat = JSON.parse(localStorage.getItem(recordingHeartbeatKey(session.id))); } catch {}
    const liveElsewhere = heartbeat && Date.now() - heartbeat.at < 5000;
    message.textContent = liveElsewhere ? (heartbeat.state === 'paused' ? 'Paused in another tab' : 'Live in another tab') : 'Unfinished recording';
    if (liveElsewhere) row.classList.add('remote-live-recording');
    const review = document.createElement('button'); review.type = 'button'; review.textContent = 'Review notes';
    review.addEventListener('click', async () => {
      try {
        history.pushState({}, '', '/recording'); showRecordingWorkspace();
        document.querySelector('#recording-title').value = session.title;
        await loadNotes('recording', session.id);
        await loadImages('recording', session.id);
        await loadRecordingChat(session.id);
        notesEditors.recording.focus();
      } catch (error) {message.textContent = error.message;}
    });
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Save recording';
    button.disabled = session.chunk_count === 0;
    button.addEventListener('click', async () => {
      button.disabled = true; message.textContent = 'Checking and importing saved audio…';
      try {
        if (notesStates.recording?.id === session.id && !(await flushNotes(notesStates.recording)))
          throw new Error('Save your notes before recovery.');
        await recoverNotesDraft(session.id);
        const result = await json(await fetch(`${API}/recordings/${encodeURIComponent(session.id)}/finalize`, {method:'POST'}));
        await loadRecoveries(); history.pushState({}, '', `/conversation/${encodeURIComponent(result.conversation.id)}`);
        await showDetail(result.conversation.id); setStatus('Recovered recording saved.', true);
      } catch (error) {message.textContent = `Recovery failed: ${error.message}`; button.disabled = false;}
    });
    const discard = document.createElement('button'); discard.type = 'button'; discard.textContent = 'Discard';
    discard.setAttribute('aria-label', `Discard unfinished recording ${session.title}`);
    discard.addEventListener('click', async () => {
      if (!window.confirm(`Discard unfinished recording “${session.title}”? Saved audio chunks will be deleted.`)) return;
      try {await json(await fetch(`${API}/recordings/${encodeURIComponent(session.id)}`, {method:'DELETE'}));
        try {localStorage.removeItem(notesDraftKey('recording', session.id));} catch {}
        if (notesStates.recording?.id === session.id) {notesStates.recording = null; notesEditors.recording?.setMarkdown('');}
        await loadRecoveries();}
      catch (error) {message.textContent = `Could not discard recording: ${error.message}`;}
    });
    const actions = document.createElement('div'); actions.className = 'recovery-actions'; actions.append(review, button, discard);
    const summary = document.createElement('div'); summary.className = 'recovery-summary'; summary.append(title, message);
    row.append(summary);
    if (!liveElsewhere) row.append(actions);
    container.append(row);
  }
}
function captureErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') return 'Microphone access was denied. Allow this site to use the microphone, then try again.';
  if (error?.name === 'NotFoundError') return 'No microphone was found. Connect one and try again.';
  if (error?.name === 'NotReadableError') return 'The microphone is busy or disconnected. Check the device and try again.';
  return error?.message || 'Recording could not start.';
}
async function saveRecordingTitle(current) {
  const title = document.querySelector('#recording-title').value.trim() || 'New recording';
  if (title === current.session.title) return;
  current.session = await json(await fetch(`${API}/recordings/${encodeURIComponent(current.session.id)}`, {
    method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title}),
  }));
}
async function startCapture() {
  if (capture || captureRequesting) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    recordingState.textContent = 'Recording unavailable';
    recordingDetail.textContent = 'This browser does not provide microphone recording.';
    return;
  }
  const mediaType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find(candidate => MediaRecorder.isTypeSupported(candidate));
  if (!mediaType) { recordingDetail.textContent = 'This browser has no supported recording format.'; return; }
  recordingState.textContent = 'Requesting microphone access…';
  captureRequesting = true; captureControls();
  let stream;
  let waveformContext = null;
  try {waveformContext = new AudioContext(); waveformContext.resume().catch(() => {});} catch {}
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
    document.querySelector('#recording-source-label').textContent = `${stream.getAudioTracks()[0]?.label || 'Microphone'} (English)`;
    const recorder = new MediaRecorder(stream, {mimeType:mediaType});
    const session = await json(await fetch(`${API}/recordings`, {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title:document.querySelector('#recording-title').value.trim() || 'New recording',media_type:mediaType.split(';')[0]})}));
    capture = {recorder, stream, session, sequence:0, pending:Promise.resolve(), uploadError:null,
      startedAt:Date.now(), pausedAt:null, totalPausedMs:0, timer:null, stopping:false,
      previewPending:false, previewDisabled:false, lastPreviewSequence:-1};
    recordingImages = []; document.querySelector('#recording-image-list').replaceChildren();
    recorder.addEventListener('dataavailable', event => {
      if (!event.data.size) return;
      const current = capture;
      const sequence = current.sequence++;
      current.pending = current.pending.then(async () => {
        if (current.uploadError) return;
        const response = await fetch(`${API}/recordings/${encodeURIComponent(session.id)}/chunks/${sequence}`,
          {method:'PUT',headers:{'Content-Type':session.media_type},body:event.data});
        await json(response);
        recordingDetail.textContent = 'Saved locally';
        updateRecordingPreview(current);
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
    try {capture.stopWaveform = drawRecordingWaveform(capture, waveformContext);} catch {
      waveformContext?.close().catch(() => {}); capture.stopWaveform = () => {};}
    capture.timer = setInterval(captureControls, 250);
    recordingState.textContent = 'Recording'; recordingDetail.textContent = 'Saving locally';
    loadNotes('recording', session.id).catch(error => {notesElements('recording').status.textContent = error.message;});
    loadImages('recording', session.id).catch(error => {recordingDetail.textContent = error.message;});
    loadRecordingChat(session.id).catch(error => {document.querySelector('#recording-chat-status').textContent = error.message;});
    captureControls(); await loadRecoveries();
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    waveformContext?.close().catch(() => {});
    if (capture?.recorder?.state === 'inactive') capture = null;
    captureControls();
    recordingState.textContent = 'Could not start recording';
    recordingDetail.textContent = captureErrorMessage(error);
    loadRecoveries().catch(() => {});
  } finally {
    captureRequesting = false; captureControls();
  }
}
async function finishCapture() {
  const current = capture;
  if (!current || current.stopping) return;
  current.stopping = true;
  captureFinalizing = true; captureControls();
  clearInterval(current.timer);
  current.stopWaveform?.();
  current.stream.getTracks().forEach(track => track.stop());
  recordingState.textContent = 'Saving recording…';
  await current.pending;
  capture = null; captureControls();
  if (notesStates.recording?.id === current.session.id && !(await flushNotes(notesStates.recording))) {
    recordingState.textContent = 'Recording needs recovery';
    recordingDetail.textContent = 'Save your notes, then open All conversations to save the recording.';
    clearCaptureHeartbeat(current.session.id);
    await loadRecoveries(); captureFinalizing = false; captureControls(); return;
  }
  if (current.uploadError) {
    recordingState.textContent = 'Recording interrupted';
    recordingDetail.textContent = 'Some audio could not be stored. Open All conversations to save the audio that was captured.';
    clearCaptureHeartbeat(current.session.id);
    await loadRecoveries(); captureFinalizing = false; captureControls(); return;
  }
  try {
    await current.titleUpdate;
    await saveRecordingTitle(current);
    const result = await json(await fetch(`${API}/recordings/${encodeURIComponent(current.session.id)}/finalize`, {method:'POST'}));
    recordingState.textContent = 'Recording saved'; recordingDetail.textContent = '';
    await loadRecoveries();
    history.pushState({}, '', `/conversation/${encodeURIComponent(result.conversation.id)}`);
    await showDetail(result.conversation.id); setStatus('Recording saved.', true);
  } catch (error) {
    recordingState.textContent = 'Recording needs recovery'; recordingDetail.textContent = error.message;
    clearCaptureHeartbeat(current.session.id);
    await loadRecoveries();
  } finally {
    captureFinalizing = false;
    clearCaptureHeartbeat(current.session.id);
    captureControls();
  }
}
document.querySelector('#record-button').addEventListener('click', () => {
  if (capture) {
    history.pushState({}, '', '/recording');
    route().catch(error => setStatus(error.message));
    return;
  }
  if ((pendingTranscriptEdits.size || pendingCleanEdits.size) && !window.confirm('Discard unsaved transcript changes and start recording?')) return;
  pendingTranscriptEdits.clear(); pendingCleanEdits.clear();
  history.pushState({}, '', '/recording');
  showRecordingWorkspace();
  startCapture();
});
document.querySelector('#back-from-recording').addEventListener('click', () => {
  if (captureRequesting || captureFinalizing) return;
  history.pushState({}, '', '/'); showList().catch(error => setStatus(error.message));
});
document.querySelector('#recording-title').addEventListener('change', () => {
  if (!capture) return;
  const current = capture;
  current.titleUpdate = (current.titleUpdate || Promise.resolve()).then(() => saveRecordingTitle(current))
    .catch(error => { recordingDetail.textContent = `Title could not be saved: ${error.message}`; });
  captureControls();
});
document.querySelector('#start-recording').addEventListener('click', startCapture);
document.querySelector('#capture-header-pause').addEventListener('click', () => document.querySelector('#pause-recording').click());
document.querySelector('#capture-header-stop').addEventListener('click', () => document.querySelector('#stop-recording').click());
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
document.querySelector('#import-button').addEventListener('click', () => {
  importStatus.textContent = '';
  importDialog.showModal();
});
document.querySelector('#import-close').addEventListener('click', () => importDialog.close());
importDialog.addEventListener('cancel', event => {
  if (fileInput.disabled) event.preventDefault();
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
function syncPlayerControls() {
  const duration = Number.isFinite(player.duration) ? player.duration : Number(seekSlider.max) || 0;
  const position = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  seekSlider.max = String(Math.max(duration, 1));
  seekSlider.value = String(Math.min(position, duration));
  seekSlider.setAttribute('aria-valuetext', `${time(position)} of ${time(duration)}`);
  document.querySelector('.seek-timeline').style.setProperty('--seek-progress', `${duration ? Math.min(100, position / duration * 100) : 0}%`);
  document.querySelector('#current-time').textContent = time(position);
  document.querySelector('#audio-duration').textContent = time(duration);
  playPauseButton.textContent = player.paused ? '▶' : '❚❚';
  playPauseButton.setAttribute('aria-label', player.paused ? 'Play' : 'Pause');
}
function renderSeekSegments(segments) {
  const track = document.querySelector('#seek-segments'); track.replaceChildren();
  const duration = Number(seekSlider.max) * 1000;
  if (!duration) return;
  const intervals = [];
  for (const item of segments) {
    if (!Number.isFinite(item.start_ms) || !Number.isFinite(item.end_ms)) continue;
    const last = intervals.at(-1);
    if (last && item.start_ms - last[1] <= 1500) last[1] = Math.max(last[1], item.end_ms);
    else intervals.push([item.start_ms, item.end_ms]);
  }
  const fragment = document.createDocumentFragment();
  for (const [start, end] of intervals) {
    const mark = document.createElement('span');
    mark.style.left = `${Math.max(0, Math.min(100, start / duration * 100))}%`;
    mark.style.width = `${Math.max(.06, Math.min(100, end / duration * 100) - Math.max(0, start / duration * 100))}%`;
    fragment.append(mark);
  }
  track.append(fragment);
}
document.querySelector('#back-five').addEventListener('click', () => { player.currentTime = Math.max(0, player.currentTime - 5); syncPlayerControls(); });
document.querySelector('#forward-five').addEventListener('click', () => { player.currentTime = Math.min(player.duration || Number(seekSlider.max), player.currentTime + 5); syncPlayerControls(); });
playPauseButton.addEventListener('click', () => {
  if (player.paused) player.play().catch(() => { processingStatus.textContent = 'Audio could not play.'; });
  else player.pause();
});
function showTranscriptAtPlaybackPosition() {
  if (document.querySelector('#transcript-card').hidden || transcriptEditMode || !transcriptSegments.length) return;
  const ms = player.currentTime * 1000;
  const segment = transcriptSegments.find(item => item.start_ms <= ms && ms < item.end_ms) ||
    transcriptSegments.find(item => item.start_ms > ms) || transcriptSegments.at(-1);
  if (!segment) return;
  const word = segment.words?.find(item => item.start_ms <= ms && ms < item.end_ms) ||
    segment.words?.find(item => item.start_ms > ms);
  const row = transcriptView.querySelector(`[data-segment-id="${CSS.escape(segment.id)}"]`);
  (row?.querySelector(word ? `[data-word-index="${segment.words.indexOf(word)}"]` : '.segment-text') || row)
    ?.scrollIntoView({block: 'center'});
}
seekSlider.addEventListener('input', () => {
  player.currentTime = Number(seekSlider.value);
  syncPlayerControls();
  showTranscriptAtPlaybackPosition();
});
seekSlider.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  player.currentTime = Math.max(0, Math.min(player.duration || Number(seekSlider.max), player.currentTime + (event.key === 'ArrowRight' ? 10 : -10)));
  syncPlayerControls();
  showTranscriptAtPlaybackPosition();
});
const speedMenu = document.querySelector('#playback-speed-menu');
async function startSilenceScan(id) {
  if (!skipSilenceCheckbox.checked || id !== activeConversationId) return;
  skipSilenceStatus.textContent = 'Measuring silence…';
  const job = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}/silence-scan`, {method:'POST'}));
  async function accept(current) {
    if (!skipSilenceCheckbox.checked || id !== activeConversationId) return;
    if (current.state === 'succeeded') {
      silenceSpans = (current.metrics?.spans || []).filter(span =>
        Number.isFinite(span.start_ms) && Number.isFinite(span.end_ms) && span.end_ms > span.start_ms);
      skipSilenceStatus.textContent = silenceSpans.length ? `${silenceSpans.length} ${silenceSpans.length === 1 ? 'gap' : 'gaps'}` : 'No long pauses';
    } else if (current.state === 'failed') {
      silenceSpans = [];
      skipSilenceStatus.textContent = current.error || 'Silence scan failed.';
    } else {
      silenceScanTimer = setTimeout(async () => {
        try { await accept(await json(await fetch(`${API}/jobs/${encodeURIComponent(current.id)}`))); }
        catch (error) { skipSilenceStatus.textContent = error.message; }
      }, 1200);
    }
  }
  await accept(job);
}
skipSilenceCheckbox.addEventListener('change', () => {
  clearTimeout(silenceScanTimer);
  silenceSpans = [];
  skipSilenceStatus.textContent = '';
  if (skipSilenceCheckbox.checked && activeConversationId)
    startSilenceScan(activeConversationId).catch(error => { skipSilenceStatus.textContent = error.message; });
});
for (const button of speedMenu.querySelectorAll('[data-speed]')) button.addEventListener('click', () => {
  player.playbackRate = Number(button.dataset.speed);
  speedMenu.open = false;
  document.querySelector('#speed-button').focus();
});
function syncSpeed() {
  document.querySelector('#speed-button').textContent = `${player.playbackRate}x`;
  for (const button of speedMenu.querySelectorAll('[data-speed]')) button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === player.playbackRate));
}
player.addEventListener('ratechange', syncSpeed);
player.addEventListener('seeked', () => { manualSeekUntil = performance.now() + 450; });
for (const name of ['loadedmetadata', 'timeupdate', 'durationchange', 'play', 'pause', 'ended']) player.addEventListener(name, syncPlayerControls);
syncSpeed();
player.addEventListener('timeupdate', () => {
  if (skipSilenceCheckbox.checked && !player.paused && performance.now() >= manualSeekUntil) {
    const position = player.currentTime * 1000;
    const gap = silenceSpans.find(span => span.start_ms <= position && position < span.end_ms);
    if (gap) { player.currentTime = gap.end_ms / 1000; return; }
  }
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
document.addEventListener('click', event => {
  const link = event.target.closest('a[href="/"], a[href="/recording"], a[href^="/conversation/"], a[href^="/person/"]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!capture && !link.matches('a[href^="/person/"]')) return;
  event.preventDefault(); history.pushState({}, '', link.getAttribute('href'));
  route().catch(error => setStatus(error.message));
});
document.querySelector('#library-search-form').addEventListener('submit', submitLibrarySearch);
document.querySelector('#library-search-input').addEventListener('input', () => {
  librarySearchResults = []; librarySearchTotal = 0;
  document.querySelector('#library-search-controls').hidden = true;
  document.querySelector('#library-search-results').replaceChildren();
  document.querySelector('#library-search-status').textContent = '';
});
document.querySelector('#library-search-kind').addEventListener('change', renderLibrarySearch);
document.querySelector('#category-filter').addEventListener('change', () => {
  renderConversationList();
  if (document.querySelector('#library-search-input').value.trim().length >= 2)
    submitLibrarySearch(new Event('submit'));
});
document.querySelector('#create-category-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#new-category-name');
  try { await json(await fetch(`${API}/categories`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:input.value})}));
    input.value = ''; await showList(); }
  catch (error) { document.querySelector('#category-status').textContent = error.message; }
});
document.querySelector('#show-trash').addEventListener('click', () => showTrash().catch(error => document.querySelector('#trash-status').textContent = error.message));
document.querySelector('#back-from-trash').addEventListener('click', () => showList().catch(error => setStatus(error.message)));
document.querySelector('#person-rename-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { await json(await fetch(`${API}/persons/${encodeURIComponent(activePersonId)}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.querySelector('#person-rename-input').value})})); await showPerson(activePersonId); }
  catch (error) { document.querySelector('#person-status').textContent = error.message; }
});
document.querySelector('#person-merge-button').addEventListener('click', async () => {
  const source = document.querySelector('#person-merge-source').value;
  if (!source || !window.confirm('Merge this person into the open profile? Confirmed conversation links will move here.')) return;
  try { await json(await fetch(`${API}/persons/${encodeURIComponent(activePersonId)}/merge`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_id:source})})); await showPerson(activePersonId); }
  catch (error) { document.querySelector('#person-status').textContent = error.message; }
});
document.querySelector('#person-delete').addEventListener('click', async () => {
  if (!activePersonId || !window.confirm('Delete this empty person profile?')) return;
  try { await json(await fetch(`${API}/persons/${encodeURIComponent(activePersonId)}`, {method:'DELETE'}));
    history.pushState({}, '', '/'); await showList(); }
  catch (error) { document.querySelector('#person-status').textContent = error.message; }
});
const renameConversationDialog = document.querySelector('#rename-conversation-dialog');
const renameConversationInput = document.querySelector('#rename-conversation-input');
const renameConversationStatus = document.querySelector('#rename-conversation-status');
const renameConversationSave = document.querySelector('#rename-conversation-save');
document.querySelector('#rename-conversation').addEventListener('click', () => {
  if (!activeConversationId) return;
  renameConversationInput.value = document.querySelector('#page-title').textContent;
  renameConversationStatus.textContent = '';
  renameConversationDialog.showModal();
  renameConversationInput.focus();
  renameConversationInput.select();
});
document.querySelector('#rename-conversation-cancel').addEventListener('click', () => renameConversationDialog.close());
renameConversationDialog.addEventListener('close', () => conversationMore.querySelector('summary').focus());
document.querySelector('#rename-conversation-form').addEventListener('submit', async event => {
  event.preventDefault();
  const title = renameConversationInput.value.trim();
  if (!title) { renameConversationStatus.textContent = 'Enter a title.'; renameConversationInput.focus(); return; }
  if (title === document.querySelector('#page-title').textContent) { renameConversationDialog.close(); return; }
  renameConversationSave.disabled = true;
  renameConversationStatus.textContent = '';
  try {
    const updated = await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}`, {
      method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title}),
    }));
    document.querySelector('#page-title').textContent = updated.title;
    renameConversationDialog.close();
  } catch (error) { renameConversationStatus.textContent = error.message; }
  finally { renameConversationSave.disabled = false; }
});
document.querySelector('#trash-conversation').addEventListener('click', async () => {
  if (!activeConversationId || !window.confirm('Delete this conversation? You can restore it from Recently Deleted for 30 days.')) return;
  try {
    await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/trash`, {method:'POST'}));
    player.pause(); player.removeAttribute('src'); player.load();
    history.pushState({}, '', '/');
    await showList();
  } catch (error) { setStatus(error.message); }
});
document.querySelector('#copy-transcript').addEventListener('click', async () => {
  if (!currentTranscript?.segments?.length) return;
  if (pendingTranscriptEdits.size) { setStatus('Save transcript edits first.'); return; }
  const paragraphs = groupTranscriptSegments(currentTranscript.segments).map(group =>
    `[${time(group[0].start_ms / 1000)}] ${group[0].speaker_display_name}: ${group.map(segment => segment.text.trim()).join(' ')}`);
  try {
    await navigator.clipboard.writeText(paragraphs.join('\n\n'));
    setStatus('Transcript copied.', true);
  } catch (error) { console.warn('Transcript copy failed', error); setStatus('Could not copy transcript.'); }
});
document.querySelector('#transcript-search-input').addEventListener('input', () => {
  updateTranscriptSearch();
});
document.querySelector('#transcript-search-input').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); moveTranscriptSearch(event.shiftKey ? -1 : 1); }
});
document.querySelector('#transcript-search-speaker').addEventListener('change', () => {
  updateTranscriptSearch();
});
document.querySelector('#transcript-search-previous').addEventListener('click', () => moveTranscriptSearch(-1));
document.querySelector('#transcript-search-next').addEventListener('click', () => moveTranscriptSearch(1));
document.querySelector('#transcript-search-clear').addEventListener('click', () => {
  document.querySelector('#transcript-search-input').value = '';
  document.querySelector('#transcript-search-speaker').value = '';
  transcriptSearchIndex = -1; refreshTranscriptSearch();
});
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
window.addEventListener('storage', event => {
  if (!event.key?.startsWith('stellis-recording-live-')) return;
  let before; let after;
  try { before = JSON.parse(event.oldValue); after = JSON.parse(event.newValue); } catch {}
  if (before?.state !== after?.state || !before || !after)
    loadRecoveries().catch(error => setStatus(error.message));
});
setInterval(() => {
  if (document.querySelector('.remote-live-recording')) loadRecoveries().catch(error => setStatus(error.message));
}, 5000);
route().catch(error => setStatus(error.message));
