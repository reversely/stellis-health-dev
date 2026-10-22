/**
 * @fileoverview First-run setup: one welcome screen that finishes setup and
 * opens Records or Trends. The intake conversation (issue #62) replaces it.
 */
(() => {
  const main = document.querySelector('#setup-main');
  const error = document.querySelector('#setup-error');

  /**
   * @param {string} tag
   * @param {?string=} text
   * @param {string=} className
   * @return {!Element}
   */
  function node(tag, text = null, className = '') {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  /**
   * @param {string} path Under /api/v1.
   * @param {string=} method
   * @param {?Object=} body
   * @return {!Promise<!Object>}
   */
  async function api(path, method = 'GET', body = null) {
    const response = await fetch('/api/v1' + path, {
      method,
      headers: body ? {'Content-Type': 'application/json'} : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) {
      throw Error(
          typeof data.detail === 'string' ?
              data.detail :
              'Setup could not finish. Try again.');
    }
    return data;
  }

  /**
   * Finishes setup with no starter notebooks and opens a page.
   * @param {!Object} state The setup state from GET /onboarding.
   * @param {string} target
   */
  async function finish(state, target) {
    await api('/onboarding', 'PUT', {uses: [], step: 'review'});
    await api('/onboarding/complete', 'POST', {});
    location.assign(state.editing ? '/' : target);
  }

  /**
   * @param {string} text
   * @param {function(): !Promise<void>} action
   * @param {string} className
   * @return {!Element}
   */
  function button(text, action, className) {
    const element = node('button', text, className);
    element.type = 'button';
    element.addEventListener('click', async () => {
      element.disabled = true;
      error.textContent = '';
      try {
        await action();
      } catch (e) {
        error.textContent = e.message;
        element.disabled = false;
      }
    });
    return element;
  }

  /** @param {!Object} state */
  function welcome(state) {
    const scene = node('section', null, 'setup-scene setup-welcome');
    const copy = node('div', null, 'welcome-copy');
    const actions = node('div', null, 'setup-actions welcome-actions');
    actions.append(
        button('Add your records', () => finish(state, '/records'), 'primary'),
        button('Track your vitals', () => finish(state, '/trends'), 'quiet'));
    copy.append(
        node('span', null, 'brand-mark'),
        node('h1', 'Welcome to Stellis Health'),
        node(
            'p',
            'Keep your medical records and vital signs in one place, ' +
                'and see how they change over time.'),
        node(
            'p',
            'Camera readings stay on your device. Summaries use AI models ' +
                'on Nebius Cloud.',
            'setup-hint'),
        actions);
    scene.append(copy);
    main.replaceChildren(scene);
  }

  document.querySelector('#setup-theme').addEventListener('click', () => {
    const theme =
        document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('stellis-theme', theme);
    } catch {
      // Without storage the theme lasts for this page only.
    }
  });

  (async () => {
    try {
      const state = await api('/onboarding');
      if (!state.required) {
        location.replace('/');
        return;
      }
      welcome(state);
    } catch (e) {
      error.textContent = e.message;
      main.replaceChildren(
          node('h1', 'Setup could not load'),
          button('Try again', async () => location.reload(), 'primary'));
    }
  })();
})();
