/**
 * @fileoverview The demo's scene dock: back and next around one numbered
 * button per scene, and a card with the scene's date, title, description and
 * tags. Scenes come from story.json; each opens the real view it names. The
 * dock shows only in the demo workspace.
 */
(function(root) {
'use strict';
const dom = () => root.StellisDom;
const el = (tag, text, cls) => dom().el(tag, text, cls);
let scenes = [], index = 0, key = '', dock = null, card = null;

/** Resolves a scene's target, described as data, to an app route. */
async function route(scene) {
  const target = scene.target;
  if (target.kind === 'home') return '/';
  if (target.kind === 'notebook') {
    const book = (await dom().api('/notebooks')).notebooks.find(item => item.name === target.name);
    if (!book) throw new Error(`Add the ${target.name} notebook in Maya’s story first`);
    return `/notebook/${encodeURIComponent(book.id)}`;
  }
  if (target.kind === 'document') {
    // A year that is not imported yet has no review; the scene says what to do.
    const review = await dom().api(`/demo/years/${scene.year}`).catch(() => null);
    const record = review?.documents.find(item => item.corpus_id === target.corpus_id);
    if (!record) throw new Error(`Import Maya’s ${scene.year} records first`);
    return `/document/${encodeURIComponent(record.id)}`;
  }
  throw new Error('This scene has no view yet');
}

/** Waits for the scene's focus element, highlights it and brings it into view. */
function focus(selector) {
  const started = Date.now();
  (function find() {
    const node = [...document.querySelectorAll(selector)].find(item => item.getClientRects().length);
    if (node) {
      node.classList.add('maya-scene-focus');
      node.scrollIntoView({block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      setTimeout(() => node.classList.remove('maya-scene-focus'), 2200);
    } else if (Date.now() - started < 8000) setTimeout(find, 200);
  })();
}

async function go(next) {
  index = Math.max(0, Math.min(scenes.length - 1, next));
  card.hidden = false;
  sessionStorage.setItem(key, String(index));
  paint();
  const scene = scenes[index];
  const status = card.querySelector('[role=status]');
  status.textContent = '';
  try {
    const path = await route(scene);
    if (location.pathname !== path) {
      history.pushState({}, '', path);
      root.dispatchEvent(new PopStateEvent('popstate'));
    }
    if (scene.target.tab) setTimeout(() => document.querySelector(`#notebook-tab-${scene.target.tab}`)?.click(), 300);
    focus(scene.focus);
  } catch (error) { status.textContent = error.message; }
}

function paint() {
  const scene = scenes[index];
  card.querySelector('time').textContent = new Date(scene.date + 'T12:00:00').toLocaleDateString([], {month: 'short', day: 'numeric', year: 'numeric'});
  card.querySelector('time').dateTime = scene.date;
  card.querySelector('h2').textContent = scene.title;
  card.querySelector('p').textContent = scene.description;
  const tags = card.querySelector('.maya-scene-tags');
  tags.replaceChildren(...scene.tags.map(tag => el('li', tag)));
  dock.querySelectorAll('.maya-scene-button').forEach((button, i) => {
    if (i === index) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
  });
  dock.querySelector('[data-step=back]').disabled = index === 0;
  dock.querySelector('[data-step=next]').disabled = index === scenes.length - 1;
}

function build() {
  card = el('section', null, 'maya-scene-card');
  card.setAttribute('aria-label', 'Scene');
  const title = el('h2'); title.id = 'maya-scene-title';
  card.setAttribute('aria-labelledby', title.id);
  const status = el('p', null, 'maya-scene-status'); status.setAttribute('role', 'status');
  // The card can step aside so the page underneath stays usable; choosing a scene brings it back.
  const hide = dom().button('Hide', 'maya-scene-hide');
  hide.addEventListener('click', () => { card.hidden = true; dock.querySelector('[aria-current]')?.focus(); });
  card.append(el('time'), title, el('p'), el('ul', null, 'maya-scene-tags'), status, hide);
  dock = el('nav', null, 'maya-scene-dock');
  dock.setAttribute('aria-label', 'Demo scenes');
  const arrow = (step, glyph, label) => {
    const button = dom().button(null, 'maya-scene-arrow');
    button.dataset.step = step; button.setAttribute('aria-label', label); button.append(dom().icon(glyph));
    button.addEventListener('click', () => go(index + (step === 'next' ? 1 : -1)));
    return button;
  };
  const list = el('ol', null, 'maya-scene-list');
  scenes.forEach((scene, i) => {
    const item = el('li');
    const button = dom().button(null, 'maya-scene-button');
    button.append(el('span', String(i + 1), 'maya-scene-number'), el('span', scene.label));
    button.addEventListener('click', () => go(i));
    item.append(button); list.append(item);
  });
  dock.append(arrow('back', 'chevron-left', 'Previous scene'), list, arrow('next', 'chevron-right', 'Next scene'));
  dock.addEventListener('keydown', event => {
    const step = {ArrowLeft: -1, ArrowRight: 1}[event.key];
    if (!step || !event.target.closest('.maya-scene-list')) return;
    event.preventDefault();
    go(index + step).then(() => dock.querySelectorAll('.maya-scene-button')[index]?.focus());
  });
  document.body.append(card, dock);
  document.body.classList.add('has-maya-scenes');
}

async function start() {
  const status = await dom().api('/demo/status').catch(() => null);
  if (!status?.active) return;
  const story = await (await fetch('/static/maya/story.json')).json();
  scenes = story.scenes || [];
  if (!scenes.length) return;
  key = `stellis-maya-scene:${status.generation || 'demo'}`;
  index = Math.min(scenes.length - 1, Number(sessionStorage.getItem(key)) || 0);
  build();
  paint();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start());
else start();
root.StellisMayaScenes = {go: next => go(next)};
})(window);
