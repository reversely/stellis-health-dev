/**
 * @fileoverview Today on Home: the person's goals with their trackers, and
 * the latest reading of each measure a goal uses. Each tracker shows its
 * progress for today, a 7-day row of dots and its streak, and logs in place:
 * a reading, a habit done today, a timer, or a reset count.
 */
(function(root) {
'use strict';

const SVG = 'http://www.w3.org/2000/svg';
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov',
  'Dec'
];
const KINDS = [
  ['daily', 'Daily target'],
  ['target', 'Value to reach'],
  ['weekly', 'Days a week'],
  ['timer', 'Timer'],
  ['without', 'Days without'],
];
/** Measures logged one at a time get a +1 button instead of a form. */
const STEP_UNITS = new Set(['glasses', 'drinks']);
const MAX_TILES = 6;

/** The person's local date as YYYY-MM-DD. */
function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${
      pad(date.getDate())}`;
}

/** Formats 2026-10-22 as "Oct 22". */
function shortDate(day) {
  const [, m, d] = String(day).slice(0, 10).split('-').map(Number);
  return m && d ? `${MONTHS[m - 1]} ${d}` : '';
}

/**
 * Formats a number for a tracker line.
 * @param {?number} value
 * @param {number=} decimals
 * @return {string}
 */
function number(value, decimals = 0) {
  return Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: decimals,
  });
}

/** Formats minutes as "9 h 20 min", "45 min" or "14 h". */
function duration(minutes) {
  const total = Math.round(minutes || 0);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Formats elapsed milliseconds as a clock, such as "3:12:05". */
function clock(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${
      pad(seconds % 60)}`;
}

/**
 * The one-line progress of a tracker.
 * @param {!Object} tracker A tracker from GET /goals.
 * @return {string}
 */
function summary(tracker) {
  const unit = tracker.unit;
  switch (tracker.kind) {
    case 'daily': {
      const today = number(tracker.today, tracker.decimals);
      const target = number(tracker.target, tracker.decimals);
      return tracker.direction === 'at_most' ?
          `${today} today, at most ${target} ${unit}` :
          `${today} of ${target} ${unit} today`;
    }
    case 'weekly':
      return `${tracker.this_week} of ${number(tracker.target)} ${
          tracker.target === 1 ? 'day' : 'days'} this week`;
    case 'timer':
      return `${duration(tracker.today)} of ${duration(tracker.target)} today`;
    case 'without':
      return `${tracker.streak} ${tracker.streak === 1 ? 'day' : 'days'} ` +
          `without ${tracker.label.toLowerCase()}`;
    case 'target':
      if (tracker.latest == null) return `Log a reading to start`;
      return `${number(tracker.latest, tracker.decimals)} ${unit} now, ` +
          `target ${number(tracker.target, tracker.decimals)} ${unit}`;
  }
  return '';
}

/** The streak label, or '' with no streak. */
function streakText(tracker) {
  if (tracker.kind === 'without' || !tracker.streak) return '';
  return `${tracker.streak}-${tracker.streak_unit} streak`;
}

/** The share of today's target reached, from 0 to 1. */
function fraction(tracker) {
  if (tracker.kind === 'target') return tracker.fraction || 0;
  if (tracker.kind === 'weekly') return tracker.this_week / tracker.target;
  if (tracker.kind === 'daily' && tracker.direction === 'at_most')
    return tracker.met_today ? 1 : 0;
  return Math.min(1, (tracker.today || 0) / tracker.target);
}

/** A ring that fills to a fraction. */
function ring(share, label) {
  const node = document.createElementNS(SVG, 'svg');
  node.setAttribute('viewBox', '0 0 44 44');
  node.setAttribute('class', 'goal-ring');
  node.setAttribute('aria-hidden', 'true');
  const radius = 18;
  const length = 2 * Math.PI * radius;
  for (const [cls, dash] of [
           ['goal-ring-track', length],
           ['goal-ring-fill', length * Math.min(1, share)]]) {
    const circle = document.createElementNS(SVG, 'circle');
    circle.setAttribute('cx', '22');
    circle.setAttribute('cy', '22');
    circle.setAttribute('r', String(radius));
    circle.setAttribute('class', cls);
    circle.style.strokeDasharray = `${dash} ${length}`;
    node.append(circle);
  }
  const text = document.createElementNS(SVG, 'text');
  text.setAttribute('x', '22');
  text.setAttribute('y', '22');
  text.setAttribute('class', 'goal-ring-label');
  text.textContent = label;
  node.append(text);
  return node;
}

/** A row of day dots, each with its weekday initial. */
function dots(days, dom) {
  const list = dom.el('ol', null, 'goal-days');
  for (const day of days) {
    const [y, m, d] = day.date.split('-').map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    const item = dom.el('li', null, 'goal-day');
    item.classList.toggle('is-met', day.met);
    item.classList.toggle('is-untracked', !day.tracked || !!day.future);
    item.title = `${shortDate(day.date)}: ${day.met ? 'met' : 'not met'}`;
    item.append(
        dom.el('span', null, 'goal-dot'),
        dom.el('span', WEEKDAYS[weekday], 'goal-weekday'));
    list.append(item);
  }
  list.setAttribute(
      'aria-label',
      `${days.filter((d) => d.met).length} of ${days.length} days met`);
  return list;
}

/** Today on Home. */
class GoalsPanel {
  /** @param {!Element} host */
  constructor(host) {
    this.dom = root.StellisDom;
    this.host = host;
    this.goals = [];
    this.measures = [];
    this.ticker = 0;
    this.dialog = null;
  }

  /** Loads goals and readings, then paints. */
  async load() {
    const dom = this.dom;
    const params = new URLSearchParams({
      today: localDay(),
      utc_offset: String(-new Date().getTimezoneOffset()),
    });
    try {
      const [goals, readings] = await Promise.all([
        dom.api(`/goals?${params}`),
        dom.api('/readings'),
      ]);
      this.goals = goals.goals;
      this.measures = readings.measures;
      this.paint();
    } catch (error) {
      this.host.replaceChildren(dom.el('p', error.message, 'goals-status'));
    }
  }

  paint() {
    const dom = this.dom;
    clearInterval(this.ticker);
    const head = dom.el('div', null, 'goals-head');
    const title = dom.el('h2', 'Today');
    title.id = 'goals-title';
    const now = new Date();
    const date = dom.el(
        'span',
        now.toLocaleDateString(
            'en-US', {weekday: 'long', month: 'short', day: 'numeric'}),
        'goals-date');
    const add = dom.button(null, 'goals-add');
    add.append(dom.icon('plus'), dom.el('span', 'Add goal'));
    add.addEventListener('click', () => this.openDialog());
    head.append(title, date, add);

    const grid = dom.el('div', null, 'goals-grid');
    for (const goal of this.goals) grid.append(this.goalCard(goal));
    if (!this.goals.length) {
      const empty = dom.el('div', null, 'goals-empty');
      empty.append(
          dom.el('p', 'Set a goal to track steps, sleep, habits and more'));
      grid.append(empty);
    }
    this.host.replaceChildren(head, grid);
    const tiles = this.readingTiles();
    if (tiles) this.host.append(tiles);
    if (this.goals.some((g) => g.trackers.some((t) => t.running_since))) {
      this.ticker = setInterval(() => this.tick(), 1000);
    }
  }

  /** Updates every running timer's clock. */
  tick() {
    for (const node of this.host.querySelectorAll('[data-running-since]')) {
      node.textContent =
          clock(Date.now() - Date.parse(node.dataset.runningSince));
    }
  }

  /** @param {!Object} goal */
  goalCard(goal) {
    const dom = this.dom;
    const card = dom.el('article', null, 'goal-card');
    const head = dom.el('div', null, 'goal-card-head');
    const title = dom.el('h3', goal.title);
    const remove = dom.button(null, 'goal-remove');
    remove.append(dom.icon('trash'));
    remove.setAttribute('aria-label', `Delete ${goal.title}`);
    remove.title = 'Delete goal';
    remove.addEventListener('click', async () => {
      if (!root.confirm(`Delete "${goal.title}"? Its readings stay.`)) return;
      await this.act(() => dom.api(`/goals/${encodeURIComponent(goal.id)}`, {
        method: 'DELETE',
      }));
    });
    head.append(title, remove);
    card.append(head);
    for (const tracker of goal.trackers) card.append(this.trackerRow(tracker));
    if (!goal.trackers.length) {
      const add = dom.button(null, 'goal-add-tracker');
      add.append(dom.icon('plus'), dom.el('span', 'Add a tracker'));
      add.addEventListener('click', () => this.openDialog(goal));
      card.append(add);
    }
    return card;
  }

  /** @param {!Object} tracker */
  trackerRow(tracker) {
    const dom = this.dom;
    const row = dom.el('section', null, `goal-tracker is-${tracker.kind}`);
    // A habit or a value to reach is met for the week or for good, not
    // only today.
    row.classList.toggle(
        'is-met',
        ['weekly', 'target'].includes(tracker.kind) ? fraction(tracker) >= 1 :
                                                      !!tracker.met_today);
    row.setAttribute('aria-label', tracker.label);
    const share = fraction(tracker);
    const figure = tracker.kind === 'without' ?
        dom.el('strong', String(tracker.streak), 'goal-count') :
        ring(share, `${Math.round(share * 100)}%`);
    const text = dom.el('div', null, 'goal-text');
    text.append(
        dom.el('span', tracker.label, 'goal-label'),
        dom.el('span', summary(tracker), 'goal-summary'));
    const streak = streakText(tracker);
    if (streak) {
      const badge = dom.el('span', null, 'goal-streak');
      badge.append(dom.icon('flame'), dom.el('span', streak));
      text.append(badge);
    }
    if (tracker.kind === 'timer' && tracker.running_since) {
      const running = dom.el(
          'span', clock(Date.now() - Date.parse(tracker.running_since)),
          'goal-clock');
      running.dataset.runningSince = tracker.running_since;
      running.setAttribute('role', 'timer');
      text.append(running);
    }
    if (tracker.kind === 'target' && tracker.baseline != null) {
      text.append(dom.el(
          'span',
          `Started at ${number(tracker.baseline, tracker.decimals)} ${
              tracker.unit} on ${shortDate(tracker.baseline_date)}`,
          'goal-detail'));
    }
    const actions = dom.el('div', null, 'goal-actions');
    actions.append(...this.trackerActions(tracker, row));
    row.append(figure, text, actions);
    if (tracker.days) row.append(dots(tracker.days, dom));
    return row;
  }

  /** The buttons that log a tracker. */
  trackerActions(tracker, row) {
    const dom = this.dom;
    const today = localDay();
    const id = encodeURIComponent(tracker.id);
    const make = (label, glyph, action, cls = '') => {
      const node = dom.button(null, `goal-action ${cls}`);
      if (glyph) node.append(dom.icon(glyph));
      node.append(dom.el('span', label));
      node.addEventListener('click', action);
      return node;
    };
    const measure = this.measures.find((m) => m.key === tracker.measure);
    switch (tracker.kind) {
      case 'weekly': {
        if (tracker.from_readings && measure) {
          return [make('Log', 'plus', () => this.logForm(row, measure))];
        }
        const done = make(
            'Done today', 'check',
            () => this.act(() => dom.api(`/trackers/${id}/days`, {
              method: 'PUT',
              json: {day: today, done: !tracker.met_today},
            })));
        done.setAttribute('aria-pressed', String(!!tracker.met_today));
        return [done];
      }
      case 'timer':
        return tracker.running_since ?
            [make(
                'Stop', 'player-stop',
                () => this.act(
                    () => dom.api(
                        `/trackers/${id}/timer?utc_offset=${
                            - new Date().getTimezoneOffset()}`,
                        {method: 'DELETE'})),
                'is-primary')] :
            [make(
                'Start', 'player-play',
                () => this.act(
                    () => dom.api(`/trackers/${id}/timer`, {method: 'POST'})))];
      case 'without':
        return [make(
            'Reset', null, () => this.confirmReset(row, tracker),
            'is-quiet')];
      default:
        if (!measure) return [];
        if (STEP_UNITS.has(measure.unit)) {
          return [make('1', 'plus', () => this.act(() => dom.api('/readings', {
            method: 'POST',
            json: {measure: measure.key, value: 1},
          })))];
        }
        return [make('Log', 'plus', () => this.logForm(row, measure))];
    }
  }

  /** Asks before starting a "days without" count again from today. */
  confirmReset(row, tracker) {
    const dom = this.dom;
    const confirm = dom.el('div', null, 'goal-form');
    confirm.append(dom.el('span', 'Start the count again from today?'));
    const yes = dom.button('Reset count', 'goal-action is-primary');
    const no = dom.button('Cancel', 'goal-action is-quiet');
    yes.addEventListener(
        'click',
        () => this.act(
            () => dom.api(
                `/trackers/${encodeURIComponent(tracker.id)}/days`,
                {method: 'PUT', json: {day: localDay(), done: true}})));
    no.addEventListener('click', () => confirm.remove());
    confirm.append(yes, no);
    row.querySelector('.goal-form')?.remove();
    row.append(confirm);
    yes.focus();
  }

  /** An inline form that logs one reading of a measure. */
  logForm(row, measure) {
    const dom = this.dom;
    row.querySelector('.goal-form')?.remove();
    const form = dom.el('form', null, 'goal-form');
    const field = (label) => {
      const input = /** @type {!HTMLInputElement} */ (dom.el('input'));
      input.type = 'number';
      input.inputMode = 'decimal';
      input.step = 'any';
      input.required = true;
      input.setAttribute('aria-label', label);
      return input;
    };
    const first = field(
        measure.paired ? 'Systolic' : `${measure.label} in ${measure.unit}`);
    form.append(first);
    let second = null;
    if (measure.paired) {
      second = field('Diastolic');
      form.append(dom.el('span', '/', 'goal-unit'), second);
    }
    const status = dom.el('span', null, 'goal-form-status');
    status.setAttribute('role', 'status');
    const save = dom.button('Save', 'goal-action is-primary');
    save.type = 'submit';
    const cancel = dom.button('Cancel', 'goal-action is-quiet');
    cancel.addEventListener('click', () => form.remove());
    form.append(
        dom.el('span', measure.unit, 'goal-unit'), save, cancel, status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await dom.api('/readings', {
          method: 'POST',
          json: {
            measure: measure.key,
            value: Number(first.value),
            value2: second ? Number(second.value) : null,
          },
        });
        await this.load();
      } catch (error) {
        status.textContent = error.message;
      }
    });
    row.append(form);
    first.focus();
  }

  /** Runs a change, then reloads; shows a failure in place. */
  async act(change) {
    try {
      await change();
      await this.load();
    } catch (error) {
      root.alert(error.message);
    }
  }

  /** Tiles for the latest single-value readings that goals use. */
  readingTiles() {
    const dom = this.dom;
    const used = new Set(this.goals.flatMap(
        (g) => g.trackers.map((t) => t.measure).filter(Boolean)));
    const shown =
        this.measures
            .filter(
                (m) =>
                    m.daily === 'last' && (used.has(m.key) || m.points.length))
            .sort((a, b) => Number(used.has(b.key)) - Number(used.has(a.key)))
            .slice(0, MAX_TILES);
    if (!shown.length) return null;
    const section = dom.el('section', null, 'goal-readings');
    section.setAttribute('aria-labelledby', 'goal-readings-title');
    const head = dom.el('div', null, 'goals-head');
    const title = dom.el('h3', 'Latest readings');
    title.id = 'goal-readings-title';
    const link = /** @type {!HTMLAnchorElement} */ (dom.el('a', 'Trends'));
    link.href = '/trends';
    head.append(title, link);
    const tiles = dom.el('div', null, 'reading-tiles');
    for (const measure of shown) {
      const tile = dom.el('article', null, 'reading-tile');
      const last = measure.points.at(-1);
      tile.append(dom.el('span', measure.label, 'reading-label'));
      if (last) {
        const value = dom.el('strong', null, 'reading-value');
        value.append(
            measure.paired ? `${number(last.value)}/${number(last.value2)}` :
                             number(last.value, measure.decimals),
            dom.el('span', ` ${measure.unit}`, 'reading-unit'));
        tile.append(
            value, dom.el('span', shortDate(last.time), 'reading-date'));
        if (last.source === 'camera') tile.append(dom.accuracyNote('camera'));
      } else {
        tile.append(dom.el('span', 'No readings yet', 'reading-date'));
      }
      tile.dataset.source = last?.source || '';
      tiles.append(tile);
    }
    section.append(head, tiles);
    return section;
  }

  /**
   * Opens the Add goal dialog, or adds a tracker to an existing goal.
   * @param {?Object=} goal
   */
  async openDialog(goal = null) {
    const dom = this.dom;
    if (!this.dialog) {
      this.dialog = /** @type {!HTMLDialogElement} */ (
          dom.el('dialog', null, 'goal-dialog'));
      this.dialog.setAttribute('aria-labelledby', 'goal-dialog-title');
      document.body.append(this.dialog);
    }
    const dialog = this.dialog;
    const {templates} = await dom.api('/goals/templates');
    const title = dom.el('h2', goal ? `Track "${goal.title}"` : 'Add goal');
    title.id = 'goal-dialog-title';
    const close = dom.button(null, 'goal-dialog-close');
    close.append(dom.icon('x'));
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => dialog.close());
    const head = dom.el('div', null, 'goal-dialog-head');
    head.append(title, close);
    const body = dom.el('div', null, 'goal-dialog-body');
    dialog.replaceChildren(head, body);

    const showList = () => {
      const list = dom.el('div', null, 'goal-templates');
      for (const template of templates) {
        const option = dom.button(null, 'goal-template');
        option.append(
            dom.el('strong', template.title),
            dom.el('span', template.trackers.map((t) => t.label).join(', ')));
        option.addEventListener('click', () => showTemplate(template));
        list.append(option);
      }
      const custom = dom.button(null, 'goal-template is-custom');
      custom.append(
          dom.el('strong', 'Your own goal'),
          dom.el('span', 'Choose what to track'));
      custom.addEventListener('click', showCustom);
      list.append(custom);
      body.replaceChildren(list);
    };

    const status = () => {
      const node = dom.el('p', null, 'goal-dialog-status');
      node.setAttribute('role', 'status');
      return node;
    };
    const labelled = (text, control) => {
      const label = dom.el('label', null, 'goal-field');
      label.append(dom.el('span', text), control);
      return label;
    };
    const input = (value = '', type = 'text') => {
      const node = /** @type {!HTMLInputElement} */ (dom.el('input'));
      node.type = type;
      node.value = value;
      if (type === 'number') node.step = 'any';
      return node;
    };
    const actions = (back, submit) => {
      const row = dom.el('div', null, 'goal-dialog-actions');
      const backButton = dom.button('Back', 'goal-action is-quiet');
      backButton.addEventListener('click', back);
      const submitButton = dom.button(submit, 'goal-action is-primary');
      submitButton.type = 'submit';
      row.append(backButton, submitButton);
      return row;
    };

    const showTemplate = (template) => {
      const form = dom.el('form', null, 'goal-form-wide');
      const name = input(goal ? goal.title : template.title);
      name.maxLength = 80;
      name.required = true;
      form.append(labelled('Goal', name));
      const targets = template.trackers.map((tracker) => {
        if (tracker.kind === 'without') {
          form.append(dom.el(
              'p', `Counts days without ${tracker.label.toLowerCase()}`,
              'goal-field-note'));
          return null;
        }
        const field = input(tracker.target ?? '', 'number');
        field.placeholder = tracker.target == null ? 'Optional' : '';
        const unit = tracker.kind === 'timer' ? 'minutes' : tracker.unit;
        form.append(labelled(`${tracker.label} target (${unit})`, field));
        return field;
      });
      const note = status();
      form.append(note, actions(showList, goal ? 'Add trackers' : 'Add goal'));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          if (goal) {
            for (const [index, tracker] of template.trackers.entries()) {
              const field = targets[index];
              if (field && field.value === '') continue;
              await dom.api(
                  `/goals/${encodeURIComponent(goal.id)}/trackers?today=${
                      localDay()}`,
                  {
                    method: 'POST',
                    json: {
                      ...tracker,
                      target: field ? Number(field.value) : null
                    },
                  });
            }
          } else {
            // A blank field keeps the template's target, or skips a
            // tracker that has none.
            const values = {};
            targets.forEach((field, index) => {
              if (field && field.value !== '')
                values[index] = Number(field.value);
            });
            await dom.api('/goals', {
              method: 'POST',
              json: {
                template: template.key,
                title: name.value,
                targets: values,
                today: localDay(),
              },
            });
          }
          dialog.close();
          await this.load();
        } catch (error) {
          note.textContent = error.message;
        }
      });
      body.replaceChildren(form);
      name.focus();
    };

    const showCustom = () => {
      const form = dom.el('form', null, 'goal-form-wide');
      const name = input(goal ? goal.title : '');
      name.maxLength = 80;
      name.required = true;
      const kind = /** @type {!HTMLSelectElement} */ (dom.el('select'));
      for (const [value, text] of KINDS) {
        kind.append(new Option(text, value));
      }
      const measure = /** @type {!HTMLSelectElement} */ (dom.el('select'));
      for (const item of this.measures.filter((m) => !m.paired)) {
        measure.append(new Option(`${item.label} (${item.unit})`, item.key));
      }
      const direction = /** @type {!HTMLSelectElement} */ (dom.el('select'));
      direction.append(
          new Option('At least', 'at_least'), new Option('At most', 'at_most'));
      const label = input();
      label.maxLength = 40;
      const target = input('', 'number');
      const fields = {
        measure: labelled('Measure', measure),
        direction: labelled('Each day', direction),
        label: labelled('Name', label),
        target: labelled('Target', target),
      };
      const sync = () => {
        const value = kind.value;
        fields.measure.hidden = !['daily', 'target'].includes(value);
        fields.direction.hidden = value !== 'daily';
        fields.label.hidden = ['daily', 'target'].includes(value);
        fields.target.hidden = value === 'without';
        const unit = value === 'weekly' ?
            'days a week' :
            value === 'timer' ?
            'minutes' :
            this.measures.find((m) => m.key === measure.value)?.unit;
        fields.target.firstChild.textContent = `Target (${unit})`;
        label.required = !fields.label.hidden;
        target.required = !fields.target.hidden;
      };
      kind.addEventListener('change', sync);
      measure.addEventListener('change', sync);
      sync();
      const note = status();
      if (!goal) form.append(labelled('Goal', name));
      form.append(
          labelled('Track', kind), fields.measure, fields.direction,
          fields.label, fields.target, note,
          actions(showList, goal ? 'Add tracker' : 'Add goal'));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const tracker = {
          kind: kind.value,
          measure: fields.measure.hidden ? null : measure.value,
          direction: fields.direction.hidden ? 'at_least' : direction.value,
          label: fields.label.hidden ? '' : label.value,
          target: fields.target.hidden ? null : Number(target.value),
        };
        try {
          if (goal) {
            await dom.api(
                `/goals/${encodeURIComponent(goal.id)}/trackers?today=${
                    localDay()}`,
                {method: 'POST', json: tracker});
          } else {
            await dom.api('/goals', {
              method: 'POST',
              json: {title: name.value, trackers: [tracker], today: localDay()},
            });
          }
          dialog.close();
          await this.load();
        } catch (error) {
          note.textContent = error.message;
        }
      });
      body.replaceChildren(form);
      (goal ? kind : name).focus();
    };

    showList();
    if (!dialog.open) dialog.showModal();
  }
}

/** The panel on Home, built once and reloaded on each visit. */
let panel = null;

/**
 * Fills Today on Home.
 * @param {?Element} host
 */
function home(host) {
  if (!host) return;
  if (!panel || panel.host !== host) panel = new GoalsPanel(host);
  return panel.load();
}

const exported = {
  home,
  summary,
  streakText,
  fraction,
  duration,
  clock
};
root.StellisGoals = exported;
if (typeof module !== 'undefined') module.exports = exported;
})(typeof window !== 'undefined' ? window : globalThis);
