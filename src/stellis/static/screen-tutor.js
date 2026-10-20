let stopCurrent = () => {};
let lifecycle = 0;
export function stop() { lifecycle++; stopCurrent(); stopCurrent = () => {}; }
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
export async function create(agent, refreshed, messageBody) {
  stop();
  const epoch = lifecycle;
  const section = el('section', null, 'agent-detail-section screen-tutor');
  section.append(el('h3', 'Learn with your screen'));
  const response = await fetch(`/api/v1/agents/${encodeURIComponent(agent.id)}/tutor`);
  const state = await response.json();
  if (epoch !== lifecycle) return section;
  const local = el('p', state.inference || 'Screen tutoring unavailable', 'tutor-local-mode'); section.append(local);
  if (!response.ok || !state.configured) { section.append(el('p', state.reason || state.detail || 'Screen tutoring unavailable')); return section; }
  section.append(el('p', state.local_inference ? 'Share a window or choose a screenshot. Images stay on GN100 and are not saved; observations stay in chat.' : 'Screenshots go to Token Factory when you ask. Stellis saves observations in chat, not the images.', 'settings-note'));
  const actions = el('div', null, 'agent-inline-actions');
  const share = el('button', 'Share window'); share.type = 'button';
  const upload = el('button', 'Choose screenshot', 'agent-quiet'); upload.type = 'button';
  const end = el('button', 'Stop sharing', 'agent-quiet'); end.type = 'button'; end.hidden = true;
  const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg'; file.hidden = true;
  actions.append(share, upload, end, file); section.append(actions);
  const status = el('p', '', 'tutor-status'); status.role = 'status'; status.setAttribute('aria-live','polite'); section.append(status);
  const preview = el('div', null, 'tutor-preview'); preview.hidden = true;
  const video = el('video'); video.autoplay = true; video.muted = true; video.playsInline = true; video.hidden = true;
  const image = el('img'); image.alt = 'Shared screen preview'; image.hidden = true;
  const pointer = el('span', null, 'tutor-pointer'); pointer.hidden = true; pointer.setAttribute('aria-hidden','true');
  preview.append(video, image, pointer); section.append(preview);
  const pointLabel = el('p', '', 'settings-note'); section.append(pointLabel);
  const form = el('form', null, 'tutor-question');
  const notebookLabel = el('label', 'Notebook'); const notebook = el('select'); notebook.required = true;
  for (const book of agent.notebooks) { const option = el('option', book.notebook_name); option.value = book.notebook_id; notebook.append(option); }
  notebookLabel.append(notebook);
  const questionLabel = el('label', 'What would you like to learn?'); const question = el('textarea'); question.maxLength = 2000; question.required = true;
  questionLabel.append(question);
  const submit = el('button', 'Ask tutor'); submit.type = 'submit'; submit.disabled = true;
  form.append(notebookLabel, questionLabel, submit); section.append(form);
  const answer = el('div', null, 'tutor-answer'); answer.setAttribute('aria-live','polite'); section.append(answer);
  let stream = null, objectURL = null, controller = null, busy = false, disposed = false, generation = 0;
  const canShare = Boolean(navigator.mediaDevices?.getDisplayMedia);
  const available = () => Boolean(stream || objectURL);
  function controls() { submit.disabled = busy || !available() || !notebook.value; share.disabled = busy || !canShare; upload.disabled = busy; }
  function clearFrame(message = '') {
    generation++; controller?.abort(); controller = null;
    if (stream) { for (const track of stream.getTracks()) { track.onended = null; track.stop(); } }
    stream = null; video.srcObject = null; video.hidden = true;
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = null; image.removeAttribute('src'); image.hidden = true;
    preview.hidden = true; pointer.hidden = true; pointLabel.textContent = ''; end.hidden = true; file.value = '';
    busy = false; controls(); status.textContent = message;
  }
  section.stopSharing = () => { disposed = true; clearFrame(); };
  stopCurrent = section.stopSharing;
  end.addEventListener('click', () => { clearFrame('Sharing stopped'); share.focus(); });
  if (!navigator.mediaDevices?.getDisplayMedia) { share.disabled = true; share.title = 'Window sharing is unavailable in this browser. Choose a screenshot.'; }
  share.addEventListener('click', async () => {
    clearFrame(); const mine = generation;
    try {
      const shared = await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      if (disposed || mine !== generation) { shared.getTracks().forEach(track => track.stop()); return; }
      stream = shared; video.srcObject = shared; await video.play();
      if (disposed || mine !== generation) { shared.getTracks().forEach(track => track.stop()); return; }
      video.hidden = false; preview.hidden = false; end.hidden = false;
      shared.getVideoTracks()[0].onended = () => clearFrame('Sharing stopped');
      status.textContent = 'Sharing a window. A frame is sent only when you ask.'; controls();
    } catch (error) { if (disposed || mine !== generation) return; clearFrame(error.name === 'NotAllowedError' ? 'Window sharing was cancelled. You can choose a screenshot.' : 'Window sharing failed. Choose a screenshot.'); }
  });
  upload.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const picked = file.files[0]; if (!picked) return;
    clearFrame(); const mine = generation;
    if (!['image/png','image/jpeg'].includes(picked.type) || picked.size > 2000000) {status.textContent = 'Choose a PNG or JPEG smaller than 2 MB'; return;}
    objectURL = URL.createObjectURL(picked); image.src = objectURL;
    try { await image.decode(); if (disposed || !objectURL || mine !== generation) return; image.hidden = false; preview.hidden = false; end.hidden = false;
      status.textContent = 'Screenshot ready. Ask a question to share it with your tutor.'; controls();
    } catch {if (mine === generation) clearFrame('This image could not be read. Choose a PNG or JPEG.');}
  });
  async function capture() {
    const source = stream ? video : image;
    const width = stream ? video.videoWidth : image.naturalWidth, height = stream ? video.videoHeight : image.naturalHeight;
    if (!width || !height) throw Error('The shared image is not ready. Try again.');
    const scale = Math.min(1,1280 / Math.max(width,height)); const canvas = document.createElement('canvas');
    canvas.width = Math.round(width*scale); canvas.height = Math.round(height*scale); canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
    return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Could not capture this frame.')), 'image/jpeg', .8));
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !available()) return;
    const mine = generation; busy = true; controls(); pointer.hidden = true; pointLabel.textContent = ''; answer.replaceChildren();
    status.textContent = 'Reading your screen and preparing guidance…'; controller = new AbortController();
    try {
      const blob = await capture(); if (mine !== generation || disposed) return;
      const data = new FormData(); data.set('question',question.value); data.set('notebook_id',notebook.value); data.set('image',blob,'shared-screen.jpg');
      const response = await fetch(`/api/v1/agents/${encodeURIComponent(agent.id)}/tutor`,{method:'POST',body:data,signal:controller.signal});
      const result = await response.json(); if (!response.ok) throw Error(typeof result.detail === 'string' ? result.detail : 'The tutor could not answer. Try again.');
      if (mine !== generation || disposed) return;
      // Present the exact captured frame so guidance cannot drift with a changing live window.
      if (objectURL) URL.revokeObjectURL(objectURL); objectURL = URL.createObjectURL(blob); image.src = objectURL;
      await image.decode(); if (mine !== generation || disposed) return; video.hidden = true; image.hidden = false;
      if (result.point) {
        pointer.style.left = (result.point.x*100)+'%'; pointer.style.top = (result.point.y*100)+'%'; pointer.hidden = false;
        pointLabel.textContent = 'Suggested location: ' + result.point.label;
      }
      answer.append(el('h4',agent.name),messageBody(result.agent_message.content));
      const seen = el('details'); seen.append(el('summary','What the tutor saw'),el('p',result.observation)); answer.append(seen);
      status.textContent = stream ? 'Guidance uses the captured frame. Ask again for a fresh frame.' : 'Guidance uses this screenshot.';
      await refreshed();
    } catch (error) { if (mine === generation && !disposed && error.name !== 'AbortError') status.textContent = error.message; }
    finally {if (mine === generation && !disposed) {busy = false; controller = null; controls();}}
  });
  return section;
}
window.addEventListener('pagehide', stop);
