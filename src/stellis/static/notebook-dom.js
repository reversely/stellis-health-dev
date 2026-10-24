/**
 * @fileoverview DOM and API helpers shared by the notebook chat, source viewer,
 * add-source dialog and document page.
 */
(function(root) {
'use strict';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Creates an element with optional text and class.
 * @param {string} tag
 * @param {?string=} text
 * @param {string=} className
 * @return {!HTMLElement}
 */
function el(tag, text = null, className = '') {
  const node = document.createElement(tag);
  if (text !== null) {
    node.textContent = text;
  }
  if (className) {
    node.className = className;
  }
  return node;
}

/**
 * Creates a button of type "button".
 * @param {?string=} text
 * @param {string=} className
 * @return {!HTMLButtonElement}
 */
function button(text = null, className = '') {
  const node =
      /** @type {!HTMLButtonElement} */ (el('button', text, className));
  node.type = 'button';
  return node;
}

/**
 * Creates a decorative icon from the page's SVG sprite.
 * @param {string} name The sprite symbol name without its "i-" prefix.
 * @return {!SVGElement}
 */
function icon(name) {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NAMESPACE, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/**
 * Formats a count with a singular or plural noun.
 * @param {number} count
 * @param {string} word The singular noun.
 * @return {string}
 */
function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Calls the app API and returns its JSON body.
 * @param {string} path The path after /api/v1.
 * @param {{method: (string|undefined), json: (*|undefined),
 *     body: (!FormData|undefined)}=} options
 * @return {!Promise<*>}
 * @throws {!Error} With the server's message when the response is not ok,
 *     and the response body as `data`.
 */
async function api(path, options = {}) {
  const init = {method: options.method || 'GET'};
  if (options.json !== undefined) {
    init.headers = {'Content-Type': 'application/json'};
    init.body = JSON.stringify(options.json);
  } else if (options.body) {
    init.body = options.body;
  }
  const response = await fetch('/api/v1' + path, init);
  const data = await response.json();
  if (!response.ok) {
    const detail = typeof data.detail === 'string' ? data.detail :
        typeof data.detail?.message === 'string' ? data.detail.message : '';
    const error = new Error(detail || 'Could not reach Stellis Health');
    error.data = data;  // Structured details, such as per-entry errors.
    throw error;
  }
  return data;
}

/**
 * Whether a click should open a link in place rather than follow it.
 * @param {!MouseEvent} event
 * @return {boolean}
 */
function isPlainClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey &&
      !event.shiftKey && !event.altKey;
}

/**
 * Creates the small note that links an estimate to the Accuracy page.
 * @param {string} section The page section: camera, speech or summaries.
 * @param {string=} text
 * @return {!HTMLAnchorElement}
 */
function accuracyNote(section, text = 'Estimate') {
  const link =
      /** @type {!HTMLAnchorElement} */ (el('a', null, 'accuracy-note'));
  link.href = `/accuracy#${section}`;
  link.append(icon('info-circle'), el('span', text));
  link.title = 'How accurate this is';
  return link;
}

const exported = {
  accuracyNote,
  el,
  button,
  icon,
  plural,
  api,
  isPlainClick
};
root.StellisDom = exported;
if (typeof module !== 'undefined') {
  module.exports = exported;
}
})(typeof window !== 'undefined' ? window : globalThis);
