const fileInput = document.querySelector('#audio-file');
const status = document.querySelector('#status');
const list = document.querySelector('#conversation-list');
const dropZone = document.querySelector('#drop-zone');
const listView = document.querySelector('#list-view');
const detailView = document.querySelector('#detail-view');
const player = document.querySelector('#audio-player');
const API = '/api/v1';
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
let activeWordElement = null;
let lastIntentionalScroll = 0;
let lastAutoFollow = 0;
for (const name of ['wheel', 'touchstart', 'keydown']) window.addEventListener(name, () => { lastIntentionalScroll = Date.now(); }, {passive:true});
const recordingPanel = document.querySelector('#recording-panel');
const recordingState = document.querySelector('#recording-state');
const recordingDetail = document.querySelector('#recording-detail');
const recordingTimer = document.querySelector('#recording-timer');
let capture = null;
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
  if (!response.ok) throw new Error(data.detail || 'The request failed.');
  return data;
}
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
    `${kind === 'all' ? librarySearchTotal : visible.length} results${kind === 'all' && librarySearchLimited ? ' · first 150 shown' : ''}` :
    (kind === 'all' ? 'No results.' : 'No results in this category.');
  for (const item of visible) {
    const row = document.createElement('a'); row.className = 'search-result';
    row.href = item.kind === 'person' ? `/person/${encodeURIComponent(item.person_id)}` :
      `/conversation/${encodeURIComponent(item.conversation_id)}${item.segment_id ? `?at=${encodeURIComponent(item.segment_id)}` : ''}`;
    const heading = document.createElement('strong'); heading.textContent = item.conversation_title;
    const detail = document.createElement('span');
    detail.textContent = item.kind === 'conversation' ? 'Conversation' :
      item.kind === 'person' ? 'Confirmed person profile' :
      `${item.kind === 'speaker' ? 'Speaker' : 'Passage'} · ${item.speaker} · ${time(item.start_ms / 1000)}${item.speaker_uncertain ? ' · Uncertain speaker match' : ''}`;
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
    query || picker.value ? `${transcriptSearchMatches.length} matches${current ? ` · ${transcriptSearchIndex + 1} of ${transcriptSearchMatches.length}` : ''}` : '';
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
  document.body.classList.remove('profile-page');
  clearTimeout(jobTimer);
  clearTimeout(aiRunTimer);
  clearTimeout(cleanRunTimer);
  activeConversationId = null;
  activePersonId = null;
  listView.hidden = false;
  detailView.hidden = true;
  document.querySelector('#trash-view').hidden = true;
  document.querySelector('#person-view').hidden = true;
  document.querySelector('#page-title').textContent = 'Your conversations';
  document.querySelector('#page-subtitle').textContent = 'Listen, review, and return to what matters.';
  const [conversations, categories] = await Promise.all([
    json(await fetch(`${API}/conversations`)), json(await fetch(`${API}/categories`)),
  ]);
  libraryConversations = conversations;
  libraryCategories = categories;
  document.querySelector('#category-status').textContent = '';
  renderCategoryControls();
  renderConversationList();
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
    const empty = document.createElement('p'); empty.textContent = 'No conversations in this view.'; list.append(empty);
  }
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
    new Option(`Uncategorized · ${libraryConversations.filter(item => !item.category_ids.length).length}`, 'uncategorized'),
    ...libraryCategories.map(item => new Option(`${item.name} · ${item.conversation_count}`, item.id)));
  picker.value = selected === 'uncategorized' || libraryCategories.some(item => item.id === selected) ? selected : '';
  const container = document.querySelector('#category-list'); container.replaceChildren();
  for (const category of libraryCategories) {
    const row = document.createElement('div'); row.className = 'category-row';
    const name = document.createElement('span'); name.textContent = `${category.name} · ${category.conversation_count}`;
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
    expiry.textContent = `Deletes automatically ${new Date(item.expires_at).toLocaleString()}`;
    row.append(title, expiry, restore, remove); container.append(row);
  }
}
async function loadPeoplePanel() {
  const people = await json(await fetch(`${API}/persons`));
  const container = document.querySelector('#people-list'); container.replaceChildren();
  if (!people.length) { const empty = document.createElement('p'); empty.textContent = 'Confirmed speakers will appear here.'; container.append(empty); }
  for (const person of people) {
    const link = document.createElement('a'); link.className = 'person-list-row';
    link.href = `/person/${encodeURIComponent(person.id)}`;
    link.textContent = `${person.name} · ${person.conversation_count} conversations`;
    container.append(link);
  }
}
async function showPerson(id) {
  document.body.classList.add('profile-page');
  clearTimeout(jobTimer); clearTimeout(aiRunTimer); clearTimeout(cleanRunTimer);
  player.pause(); player.removeAttribute('src'); player.load();
  activeConversationId = null; activePersonId = id;
  const [person, all] = await Promise.all([
    json(await fetch(`${API}/persons/${encodeURIComponent(id)}`)), json(await fetch(`${API}/persons`)),
  ]);
  listView.hidden = true; detailView.hidden = true; document.querySelector('#trash-view').hidden = true;
  document.querySelector('#person-view').hidden = false;
  document.querySelector('#page-title').textContent = person.name;
  document.querySelector('#page-subtitle').textContent = 'Confirmed speaker history.';
  document.querySelector('#person-rename-input').value = person.name;
  document.querySelector('#person-status').textContent = '';
  const container = document.querySelector('#person-conversations'); container.replaceChildren();
  if (!person.conversations.length) { const empty = document.createElement('p'); empty.textContent = 'No active conversations confirmed for this person.'; container.append(empty); }
  for (const item of person.conversations) {
    const row = document.createElement('div'); row.className = 'person-conversation-row';
    const link = document.createElement('a'); link.href = `/conversation/${encodeURIComponent(item.conversation_id)}?at=${encodeURIComponent(item.segment_id)}&t=${item.start_ms}`;
    link.textContent = `${item.title} · ${new Date(item.created_at).toLocaleDateString()} · ${time(item.start_ms / 1000)}`;
    const note = document.createElement('small');
    note.textContent = `${item.confirmed_passages} confirmed passages${item.current_generation ? '' : ' · prior transcript generation'}`;
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
    ...all.filter(item => item.id !== id).map(item => new Option(`${item.name} · ${item.conversation_count}`, item.id)));
  document.querySelector('#person-delete').hidden = person.total_link_count > 0;
}
async function showDetail(id) {
  document.body.classList.remove('profile-page');
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
  activePersonId = null;
  rematchChangesOnly = false;
  transcriptEditMode = false;
  pendingTranscriptEdits.clear();
  focusedEditSegmentId = null;
  transcriptEditError = null;
  transcriptSegments = [];
  currentTranscript = null;
  document.querySelector('#transcript-search-input').value = '';
  document.querySelector('#transcript-search-speaker').value = '';
  transcriptSearchMatches = [];
  transcriptSearchIndex = -1;
  syncTranscriptEditControls();
  transcriptView.replaceChildren();
  processingStatus.textContent = 'Checking local speech models…';
  processButton.hidden = true;
  rematchButton.hidden = true;
  const item = await json(await fetch(`${API}/conversations/${encodeURIComponent(id)}`));
  await renderConversationCategories(item.category_ids);
  listView.hidden = true;
  detailView.hidden = false;
  document.querySelector('#person-view').hidden = true;
  document.querySelector('#page-title').textContent = item.title;
  document.querySelector('#page-subtitle').textContent = 'Replay and scrub through your recording.';
  document.querySelector('#audio-duration').textContent = time(item.duration_ms / 1000);
  player.src = `${API}/conversations/${encodeURIComponent(id)}/audio`;
  player.load();
  await loadSpeech(id);
  showConversationTab('transcript');
  await loadAIRuns(id);
  await loadCleanRuns(id);
  const query = new URLSearchParams(location.search);
  const targetSegmentId = query.get('at');
  if (targetSegmentId) {
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
    const firstSegment = visible[0];
    const turnSpeaker = document.createElement(firstSegment.person_id ? 'a' : 'button');
    if (firstSegment.person_id) turnSpeaker.href = `/person/${encodeURIComponent(firstSegment.person_id)}`;
    else turnSpeaker.type = 'button';
    turnSpeaker.textContent = visible[0].speaker_display_name;
    if (!firstSegment.person_id) {
      turnSpeaker.setAttribute('aria-label', `Edit speaker label for turn at ${time(visible[0].start_ms / 1000)}`);
      turnSpeaker.addEventListener('click', () => {
        if (pendingTranscriptEdits.size) { editStatus.textContent = 'Press Done to save word changes before changing a speaker.'; return; }
        if (!transcriptEditMode) setTranscriptEditMode(true);
        showSpeakerEditor(turn.querySelector('.segment'), firstSegment);
      });
    }
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
  refreshTranscriptSearch();
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
  document.querySelector('#generation-review-status').textContent = pending ?
    `${reviewed} of ${items.length} changes reviewed. The current transcript stays active until you choose the new one. Confirm a target only after listening to the voice.` :
    `${resolved} changes moved to the new transcript; ${items.length - resolved} remain linked to the prior generation for review.`;
  const container = document.querySelector('#generation-review-items'); container.replaceChildren();
  for (const item of items) {
    if (!pending && decisions[item.id] !== null) continue;
    const row = document.createElement('article'); row.className = 'generation-review-row';
    const title = document.createElement('strong'); title.textContent = `${item.kind} · ${time(item.source_start_ms / 1000)} · ${item.boundary_change}`;
    const source = document.createElement('p'); source.textContent = `Before: ${item.source_text}`;
    const value = document.createElement('p'); value.textContent = `Saved ${item.kind}: ${item.kind === 'person' ? item.source_speaker : item.value}`;
    const play = document.createElement('button'); play.type = 'button'; play.textContent = 'Play source';
    play.addEventListener('click', () => { player.pause(); player.currentTime = item.source_start_ms / 1000; player.play().catch(() => {}); });
    row.append(title, source, value, play);
    for (const candidate of item.candidates) {
      const result = document.createElement('div'); result.className = 'generation-review-candidate';
      const wording = document.createElement('p'); wording.textContent = `After · ${time(candidate.start_ms / 1000)}: ${candidate.text}`;
      const listen = document.createElement('button'); listen.type = 'button'; listen.textContent = 'Play new passage';
      listen.addEventListener('click', () => { player.pause(); player.currentTime = candidate.start_ms / 1000; player.play().catch(() => {}); });
      result.append(wording, listen); row.append(result);
    }
    if (pending) {
      const choice = document.createElement('select'); choice.setAttribute('aria-label', `Target for ${item.kind} at ${time(item.source_start_ms / 1000)}`);
      choice.append(new Option('Choose a result', ''), new Option('Keep unresolved', 'unresolved'));
      for (const candidate of item.candidates) choice.append(new Option(
        `${time(candidate.start_ms / 1000)} · ${candidate.text.slice(0, 120)} (${Math.round(candidate.score * 100)}% match)`, candidate.segment_id));
      if (Object.hasOwn(decisions, item.id)) choice.value = decisions[item.id] ?? 'unresolved';
      const suggestion = document.createElement('small'); suggestion.textContent = item.suggestion ?
        'Close text and time match; choose only after checking the recording.' : 'Boundary or wording changed; review both passages.';
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
  name.value = segment.speaker_label_source === 'automatic' || segment.person_id ? '' : segment.speaker_display_name;
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
  if (segment.person_id) { nameLabel.hidden = true; save.hidden = true; clear.hidden = true; }
  const message = document.createElement('p'); message.setAttribute('role', 'status');
  const personSection = document.createElement('div'); personSection.className = 'person-confirmation';
  const personTitle = document.createElement('strong'); personTitle.textContent = segment.person_id ?
    `Confirmed as ${segment.speaker_display_name}` : 'Confirm a person';
  const personSelectLabel = document.createElement('label'); personSelectLabel.textContent = 'Existing person';
  const personSelect = document.createElement('select'); personSelect.append(new Option('Choose a person', ''));
  personSelectLabel.append(personSelect);
  const newPersonLabel = document.createElement('label'); newPersonLabel.textContent = 'Or create a person';
  const newPerson = document.createElement('input'); newPerson.type = 'text'; newPerson.maxLength = 100;
  newPerson.placeholder = 'Person name'; newPersonLabel.append(newPerson);
  const personActions = document.createElement('div'); personActions.className = 'editor-actions';
  const confirm = document.createElement('button'); confirm.type = 'button'; confirm.textContent = segment.person_id ? 'Update confirmation' : 'Confirm speaker';
  const unlink = document.createElement('button'); unlink.type = 'button'; unlink.textContent = 'Remove confirmation'; unlink.hidden = !segment.person_id;
  personActions.append(confirm, unlink);
  personSection.append(personTitle, personSelectLabel, newPersonLabel, personActions);
  fetch(`${API}/persons`).then(json).then(people => {
    personSelect.replaceChildren(new Option('Choose a person', ''), ...people.map(person => new Option(person.name, person.id)));
    if (segment.person_id) personSelect.value = segment.person_id;
  }).catch(error => { message.textContent = error.message; });
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    try {
      const person = newPerson.value.trim() ? await json(await fetch(`${API}/persons`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newPerson.value})})) : {id:personSelect.value};
      if (!person.id) throw new Error('Choose or create a person.');
      await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/person-links`, {
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({person_id:person.id,segment_id:segment.id,scope:scope.value,expected_revision:currentTranscript.revision}),
      }));
      await showTranscript(activeConversationId);
      processingStatus.textContent = 'Person confirmed from this recording.';
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
      processingStatus.textContent = 'Person confirmation removed.';
    } catch (error) { message.textContent = error.message; unlink.disabled = false; }
  });
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
  form.append(nameLabel, scopeLabel, actions, personSection, message);
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
  else if (location.pathname.match(/^\/person\/([^/]+)$/))
    await showPerson(decodeURIComponent(location.pathname.split('/')[2]));
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
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="/person/"]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
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
document.querySelector('#trash-conversation').addEventListener('click', async () => {
  if (!activeConversationId || !window.confirm('Move this conversation to Recently Deleted? You can restore it within 30 days.')) return;
  try {
    await json(await fetch(`${API}/conversations/${encodeURIComponent(activeConversationId)}/trash`, {method:'POST'}));
    player.pause(); player.removeAttribute('src'); player.load();
    history.pushState({}, '', '/');
    await showList();
  } catch (error) { setStatus(error.message); }
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
route().catch(error => setStatus(error.message));
