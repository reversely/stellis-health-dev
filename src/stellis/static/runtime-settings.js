const $ = selector => document.querySelector(selector);
let current;
let busy = false;
const kindLabels = {tutor_vision: 'Tutor screen reading', onboarding_plan: 'Notebook proposals', agent_chat: 'Agent chat', specialist: 'Specialist', email_draft: 'Email draft',
  answer: 'Transcript question', summary: 'Summary', clean: 'Transcript cleanup', agent: 'To-do extraction', categorization: 'Category scoring'};
const stateLabels = {running: 'Running', succeeded: 'Completed', failed: 'Failed', interrupted: 'Interrupted'};
const eventLabels = {request_started: 'Request started', sources_selected: 'Sources selected',
  model_requested: 'Model requested', model_replied: 'Model replied', answer_retry: 'Answer format retry',
  sources_validated: 'Source citations validated', answer_validated: 'Answer validated',
  structured_reply_received: 'Structured reply received', category_scored: 'Categories scored',
  request_completed: 'Request completed', request_failed: 'Request failed', request_interrupted: 'Request interrupted'};
const checkLabels = {available: 'Model available', model_missing: 'Selected model not found',
  unavailable: 'Unavailable', not_configured: 'Not configured', reported: 'Route reported by runtime',
  mismatch: 'Agent and transcript routes differ', remote_unverified: 'Cloud route not yet verified'};
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function request(path = '', options = {}) {
  const response = await fetch('/api/v1/settings/inference' + path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Request failed. Try again.');
  return body;
}
function time(value) { return new Date(value).toLocaleString(); }
function route(title, execution, model, state) {
  const row = element('div', undefined, 'inference-route');
  row.append(element('strong', title));
  const details = element('div');
  details.append(element('div', execution), element('code', model || 'Model not reported'),
    element('p', state, 'settings-note'));
  row.append(details);
  return row;
}
function render(data) {
  current = data;
  const observed = data.observed;
  const agent = observed?.agent;
  $('#inference-routes').replaceChildren(
    route('Agents', data.agent_execution + ' → OpenClaw inside NemoClaw', agent?.model,
      agent ? (checkLabels[agent.state] || agent.state) + (agent.provider ? ', ' + agent.provider : '') :
        data.agent_configured ? 'Configured, not checked' : 'Not configured'),
    route('Transcript AI', data.inference_provider, data.inference_model,
      observed ? checkLabels[observed.inference.state] : data.inference_configured ? 'Configured, not checked' : 'Not configured'),
    route('Categories', data.inference_provider, data.category_model, 'Configured model'),
    route('Tutor screen reading', data.local_inference ? 'GN100 Ollama' : 'Cloud', data.tutor_vision_model,
      data.tutor_vision_model ? 'Configured vision model' : 'Not configured'));
  $('#inference-checked-at').textContent = observed ? 'Last checked ' + time(observed.checked_at) : 'No connection check yet.';
  $('#local-model-controls').hidden = !data.can_switch;
  const select = $('#local-model-select');
  const wanted = select.value || data.inference_model;
  select.replaceChildren(element('option', observed?.models.length ? 'Choose a model' : 'Check connections to load models'));
  select.firstElementChild.value = '';
  for (const model of data.local_inference ? observed?.models || [] : []) {
    const option = element('option', model);
    option.value = model; select.append(option);
  }
  if ([...select.options].some(option => option.value === wanted)) select.value = wanted;
  select.disabled = busy || !data.can_switch || !observed?.models.length;
  updateApply();
  const open = new Set([...document.querySelectorAll('#inference-traces details[open]')].map(node => node.dataset.traceId));
  const rows = data.traces.map(trace => {
    const details = element('details', undefined, 'inference-trace'); details.dataset.traceId = trace.id;
    details.open = open.has(trace.id);
    const summary = element('summary');
    const title = (kindLabels[trace.kind] || trace.kind) + (trace.agent_name ? ', ' + trace.agent_name : '');
    summary.append(element('strong', title), element('span', stateLabels[trace.state] || trace.state, 'trace-state'),
      element('span', trace.duration_ms == null ? 'Duration unavailable' : (trace.duration_ms / 1000).toFixed(1) + ' s', 'trace-duration'));
    details.append(summary);
    details.append(element('p', time(trace.created_at) + ', ' + trace.execution, 'settings-note'));
    details.append(element('p', (trace.model || 'Model not reported') +
      (trace.model ? (trace.model_source === 'reported' ? ' (reported)' : ' (configured)') : '') +
      (trace.provider ? ', ' + trace.provider : ''), 'trace-model'));
    const tokens = Object.entries(trace.usage).map(([key, count]) => key.replaceAll('_', ' ') + ': ' + count).join(', ');
    details.append(element('p', tokens || 'Token usage not reported', 'settings-note'));
    const list = element('ol', undefined, 'trace-events');
    for (const event of trace.events) {
      let label = eventLabels[event.name] || event.name;
      if (event.attempt != null) label += ', attempt ' + event.attempt;
      if (event.source_count != null) label += ': ' + event.source_count;
      if (event.citation_count != null) label += ': ' + event.citation_count;
      if (event.reads != null) label += ': ' + event.reads + ' reads';
      const failures = {timeout: 'Request timed out', network: 'Provider unreachable', authentication: 'Credential rejected',
        rate_limited: 'Rate limit reached', model_unavailable: 'Model unavailable', invalid_json: 'Invalid structured response',
        output_limit: 'Output limit reached', not_configured: 'Inference not configured', provider: 'Provider error'};
      if (event.error_code) label += ': ' + (failures[event.error_code] || 'Request failed');
      else if (event.error_type) label += ' (' + event.error_type + ')';
      const item = element('li');
      const elapsed = Math.max(0, (new Date(event.at) - new Date(trace.created_at)) / 1000);
      item.append(element('span', label), element('span', elapsed.toFixed(1) + ' s', 'trace-duration'));
      list.append(item);
    }
    details.append(list);
    const id = element('small', 'Request ' + trace.id); details.append(id);
    return details;
  });
  $('#inference-traces').replaceChildren(...(rows.length ? rows : [element('p', 'No requests recorded yet.', 'settings-note')]));
  $('#inference-clear').disabled = busy || !data.traces.some(trace => trace.state !== 'running');
}
function updateApply() {
  const value = $('#local-model-select').value;
  $('#local-model-apply').disabled = busy || !value || current?.traces.some(trace => trace.state === 'running') ||
    (value === current?.inference_model && value === current?.observed?.agent?.model);
}
export async function load() {
  try { render(await request()); $('#inference-trace-status').textContent = ''; }
  catch (error) { $('#inference-trace-status').textContent = error.message; }
}
async function operate(button, status, message, action) {
  if (busy) return;
  busy = true; button.disabled = true; status.textContent = message; updateApply();
  try { render(await action()); status.textContent = 'Done'; }
  catch (error) { status.textContent = error.message; }
  finally { busy = false; button.disabled = false; if (current) render(current); }
}
$('#local-model-select').addEventListener('change', updateApply);
$('#inference-refresh').addEventListener('click', () => load());
$('#inference-check').addEventListener('click', event => operate(event.currentTarget,
  $('#inference-check-status'), 'Checking connections…', () => request('/check', {method: 'POST'})));
$('#local-model-apply').addEventListener('click', event => {
  const model = $('#local-model-select').value;
  operate(event.currentTarget, $('#local-model-status'), 'Loading and verifying model…', () =>
    request('/model', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({model})}));
});
$('#inference-clear').addEventListener('click', event => operate(event.currentTarget,
  $('#inference-trace-status'), 'Clearing completed history…', () => request('/traces', {method: 'DELETE'})));
