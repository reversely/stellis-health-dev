/**
 * @fileoverview Health overview and goals on Home. From top to bottom:
 * reminder banners that are due now, a card of four latest readings with
 * small trend lines, one card per goal with a 6-week bar chart, and a form
 * that builds a goal from selectors. Every block reloads from GET /goals
 * after each change.
 */
(function(root) {
'use strict';

const SVG = 'http://www.w3.org/2000/svg';
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov',
  'Dec'
];
const OVERVIEW = ['pulse', 'blood_pressure', 'sleep', 'weight'];
const OVERVIEW_LABELS = {
  pulse: 'Resting pulse'
};
const SPARK_POINTS = 12;
const USUAL_MIN = 6;
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
const STATUS = {
  usual: 'Within your usual range',
  above: 'Higher than your usual range',
  below: 'Lower than your usual range',
};
const REFRESH_MS = 60000;

/** Local date as YYYY-MM-DD. */
function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${
      pad(date.getDate())}`;
}

/** Local time as HH:MM. */
function localTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Formats "20:00" as "8:00 pm". */
function clockText(time) {
  const [h, m] = String(time).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${
      h < 12 ? 'am' : 'pm'}`;
}

/** Formats a date as "Oct 12". */
function shortDate(date) {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** Names a reading's day relative to today: "today", "yesterday", "Oct 12". */
function dayText(time) {
  const text = String(time);
  const day = new Date(text.length <= 10 ? `${text}T12:00` : text);
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((start(new Date()) - start(day)) / 864e5);
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : shortDate(day);
}

/** Formats a reading's value. */
function valueText(measure, point) {
  const format = (v) => Number(v).toLocaleString('en-US', {
    maximumFractionDigits: measure.decimals,
  });
  return measure.paired ? `${format(point.value)}/${format(point.value2)}` :
                          format(point.value);
}

/** "Every day", "Once a week" or "4 times a week". */
function frequencyText(times) {
  if (times === 7) return 'Every day';
  return times === 1 ? 'Once a week' : `${times} times a week`;
}

/**
 * One sentence of encouragement for a goal's week.
 * @param {!Object} goal A goal from GET /goals.
 * @param {number} daysLeft Days left in a week, today included.
 * @return {string}
 */
function encouragement(goal, daysLeft) {
  const left = goal.times_per_week - goal.this_week;
  if (left <= 0) return 'Goal reached for this week. Well done.';
  const [one, many] = goal.noun;
  const count = left === 1 ? `One more ${one} reaches` :
                             `${WORDS[left] || left} more ${many} reach`;
  const sentence = `${count} this week's goal.`;
  if (goal.done_today) return `Logged today. ${sentence}`;
  if (left > daysLeft) {
    if (!goal.this_week) return `Start this week with a ${one} today.`;
    return `${WORDS[goal.this_week] || goal.this_week} so far this week. ` +
        'Every one counts.';
  }
  return sentence;
}

/** Overview context line for a measure. */
function contextText(measure) {
  if (measure.status in STATUS) return STATUS[measure.status];
  const more = USUAL_MIN - measure.points.length;
  if (more > 0) {
    return `${WORDS[more] || more} more ${
        more === 1 ? 'reading shows' : 'readings show'} your usual range`;
  }
  return 'Your usual range appears with more recent readings';
}

/** Overview source line for a reading. */
function sourceText(point) {
  const when = dayText(point.time);
  if (point.source === 'camera') return `Camera estimate, ${when}`;
  if (point.source === 'record') return `From ${point.title}, ${when}`;
  return `You logged, ${when}`;
}

/** Creates an SVG element with attributes. */
function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

/**
 * A small trend line of recent readings, with a usual-range band.
 * @param {!Object} measure
 * @return {!SVGElement}
 */
function sparkline(measure) {
  const points = measure.points.slice(-SPARK_POINTS);
  const w = 120;
  const h = 32;
  const chart = svg('svg', {
    class: 'overview-spark',
    viewBox: `0 0 ${w} ${h}`,
    preserveAspectRatio: 'none',
    'aria-hidden': 'true'
  });
  const values = points.map((p) => Number(p.value));
  const usual = measure.usual;
  const all = usual ? [...values, usual.low, usual.high] : values;
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const y = (v) => h - 4 - (v - lo) / (hi - lo) * (h - 8);
  const x = (i) => points.length === 1 ? w : i * w / (points.length - 1);
  if (usual) {
    chart.append(svg('rect', {
      class: 'overview-band',
      x: 0,
      y: y(usual.high),
      width: w,
      height: y(usual.low) - y(usual.high)
    }));
  }
  if (points.length > 1) {
    chart.append(svg('polyline', {
      points: values.map((v, i) => `${x(i)},${y(v)}`).join(' '),
    }));
  }
  chart.append(
      svg('circle',
          {cx: x(points.length - 1), cy: y(values[values.length - 1]), r: 3}));
  return chart;
}

/**
 * Bars of logged days per week, with a dashed line at a goal.
 * @param {!Object} goal
 * @param {!Date} today
 * @return {!SVGElement}
 */
function weekChart(goal, today) {
  const w = 240;
  const h = 96;
  const top = 14;
  const base = h - 18;
  const bar = 28;
  const gap = 12;
  // Scaled to a goal or a busier week, so a 3-a-week goal fills its chart.
  const max = Math.max(goal.times_per_week, ...goal.weeks);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const chart =
      svg('svg', {class: 'goal-weeks', viewBox: `0 0 ${w} ${h}`, role: 'img'});
  const label = goal.weeks.map((count, i) => {
    const start = new Date(monday);
    start.setDate(monday.getDate() - 7 * (goal.weeks.length - 1 - i));
    return {count, start, now: i === goal.weeks.length - 1};
  });
  chart.setAttribute(
      'aria-label',
      `Days logged per week: ${
          label
              .map(
                  (week) => `${
                      week.now ?
                          'this week' :
                          'week of ' + shortDate(week.start)} ${week.count}`)
              .join(', ')}. Goal ${goal.times_per_week}.`);
  const yGoal = base - goal.times_per_week / max * (base - top);
  chart.append(
      svg('line', {class: 'goal-line', x1: 0, x2: w, y1: yGoal, y2: yGoal}));
  const goalText =
      svg('text',
          {class: 'goal-line-label', x: w, y: yGoal - 4, 'text-anchor': 'end'});
  goalText.textContent = `Goal ${goal.times_per_week}`;
  chart.append(goalText);
  label.forEach((week, i) => {
    const x = 8 + i * (bar + gap);
    const height = Math.max(week.count / max * (base - top), 2);
    const radius = Math.min(4, height / 2);
    const path = svg('path', {
      class: week.now ? 'goal-bar is-now' : 'goal-bar',
      d: `M${x},${base} v${- (height - radius)} q0,${- radius} ${radius},${
          - radius} h${bar - 2 * radius} q${radius},0 ${radius},${radius} v${
          height - radius} z`,
    });
    const tip = svg('title');
    tip.textContent =
        `${week.now ? 'This week' : 'Week of ' + shortDate(week.start)}: ${
            week.count} of ${goal.times_per_week}`;
    path.append(tip);
    chart.append(path);
    const axis = svg('text', {
      class: 'goal-axis',
      x: x + bar / 2,
      y: h - 4,
      'text-anchor': 'middle'
    });
    axis.textContent = week.now ? 'This wk' : shortDate(week.start);
    chart.append(axis);
  });
  return chart;
}

/**
 * Builds Home's health overview and goals inside a host element.
 * @param {!Element} host
 * @return {{load: function(): !Promise}}
 */
function create(host) {
  const dom = root.StellisDom;
  let data = {goals: [], reminders: [], activities: []};
  let measures = [];
  let editing = null;
  let adding = false;
  let timer = 0;

  const query = () => new URLSearchParams({
    today: localDay(),
    now: localTime(),
    utc_offset: String(-new Date().getTimezoneOffset()),
  });

  async function load() {
    try {
      const [goals, readings] = await Promise.all([
        dom.api(`/goals?${query()}`),
        dom.api('/readings'),
      ]);
      data = goals;
      measures = readings.measures;
      paint();
    } catch (error) {
      host.replaceChildren(dom.el('p', error.message, 'goals-status'));
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (host.isConnected && !document.hidden && !editing && !adding)
        load();
      else if (host.isConnected)
        timer = setTimeout(load, REFRESH_MS);
    }, REFRESH_MS);
  }

  /** Runs a change, then reloads; reports a failure in place. */
  async function act(change, status) {
    try {
      await change();
      editing = null;
      adding = false;
      await load();
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  }

  const goalPath = (goal) => `/goals/${encodeURIComponent(goal.id)}`;
  const markToday = (goal, done) => dom.api(
      `${goalPath(goal)}/days/${localDay()}`, {method: 'PUT', json: {done}});

  function paint() {
    const parts = [];
    for (const reminder of data.reminders) parts.push(banner(reminder));
    const title = dom.el('h2', null, 'coach-title');
    title.id = 'goals-title';
    title.append(
        'Health overview ',
        dom.el(
            'span',
            new Date().toLocaleDateString(
                'en-US', {weekday: 'long', month: 'short', day: 'numeric'})));
    parts.push(title, overview());
    const head = dom.el('div', null, 'coach-section-head');
    head.append(dom.el('h3', 'Goals'));
    if (data.goals.length && !adding) {
      const add = dom.button('Add a goal', 'coach-link');
      add.addEventListener('click', () => {
        adding = true;
        paint();
      });
      head.append(add);
    }
    parts.push(head);
    const grid = dom.el('div', null, 'coach-goals');
    for (const goal of data.goals) {
      grid.append(editing === goal.id ? form(goal) : goalCard(goal));
    }
    if (data.goals.length) parts.push(grid);
    if (!data.goals.length || adding) parts.push(form(null));
    host.replaceChildren(...parts);
  }

  /** A due reminder: a question with Yes and Not yet, or a pending banner. */
  function banner(reminder) {
    const goal = data.goals.find((g) => g.id === reminder.goal_id);
    const node = dom.el('section', null, `coach-reminder is-${reminder.state}`);
    node.setAttribute('aria-label', 'Reminder');
    node.setAttribute('role', 'status');
    const status = dom.el('span', null, 'coach-reminder-error');
    const yes = dom.button(
        reminder.state === 'ask' ? 'Yes' : 'Done', 'coach-button is-primary');
    yes.addEventListener(
        'click', () => act(() => markToday(goal, true), status));
    const text = dom.el('div', null, 'coach-reminder-text');
    const actions = dom.el('div', null, 'coach-reminder-actions');
    if (reminder.state === 'ask') {
      text.append(
          dom.el(
              'span', `${clockText(reminder.reminder)} reminder`,
              'coach-reminder-when'),
          dom.el('strong', reminder.question));
      const later = dom.button('Not yet', 'coach-button');
      later.addEventListener(
          'click',
          () =>
              act(() => dom.api(
                      `${goalPath(goal)}/days/${localDay()}/not-yet`,
                      {method: 'POST'}),
                  status));
      actions.append(yes, later);
    } else {
      text.append(
          dom.el('strong', reminder.title),
          dom.el('span', ` is due from ${clockText(reminder.reminder)}`));
      actions.append(yes);
    }
    node.append(text, actions, status);
    return node;
  }

  /** Four latest readings with trend lines. */
  function overview() {
    const card = dom.el('section', null, 'overview');
    card.setAttribute('aria-label', 'Latest readings');
    for (const key of OVERVIEW) {
      const measure = measures.find((m) => m.key === key);
      if (!measure) continue;
      const stat = dom.el('div', null, 'overview-stat');
      stat.append(dom.el(
          'span', OVERVIEW_LABELS[key] || measure.label, 'overview-label'));
      const last = measure.points.at(-1);
      if (!last) {
        stat.append(dom.el('span', 'No readings yet', 'overview-empty'));
        const camera = root.StellisCameraPulse;
        if (key === 'pulse' && camera?.supported()) {
          const measureButton = dom.button('Measure with camera', 'coach-link');
          measureButton.addEventListener(
              'click', () => camera.open(() => load(), measure));
          stat.append(measureButton);
        } else {
          const link = /** @type {!HTMLAnchorElement} */ (
              dom.el('a', 'Add a reading', 'coach-link'));
          link.href = '/trends';
          stat.append(link);
        }
        card.append(stat);
        continue;
      }
      const value = dom.el('span', valueText(measure, last), 'overview-value');
      value.append(dom.el('span', measure.unit, 'overview-unit'));
      const meta = dom.el('span', sourceText(last), 'overview-meta');
      if (last.source === 'camera') {
        meta.append(' ', dom.accuracyNote('camera', 'How accurate'));
      }
      stat.append(
          value, sparkline(measure),
          dom.el('span', contextText(measure), 'overview-context'), meta);
      card.append(stat);
    }
    return card;
  }

  /** One goal: this week's count, a 6-week chart, encouragement and Log. */
  function goalCard(goal) {
    const today = new Date();
    const card = dom.el('article', null, 'coach-goal');
    const head = dom.el('div', null, 'coach-goal-head');
    const name = dom.el('h4', goal.title);
    const edit = dom.button(null, 'coach-icon');
    edit.append(dom.icon('pencil'));
    edit.setAttribute('aria-label', `Edit ${goal.title}`);
    edit.title = 'Edit goal';
    edit.addEventListener('click', () => {
      editing = goal.id;
      paint();
    });
    const chips = dom.el('div', null, 'coach-chips');
    chips.append(
        dom.el('span', frequencyText(goal.times_per_week), 'coach-chip'));
    if (goal.reminder) {
      chips.append(
          dom.el('span', `Reminder ${clockText(goal.reminder)}`, 'coach-chip'));
    }
    head.append(name, edit, chips);
    const body = dom.el('div', null, 'coach-goal-body');
    const count = dom.el('div', null, 'coach-count');
    count.append(
        dom.el(
            'span', `${goal.this_week} of ${goal.times_per_week}`,
            'coach-count-value'),
        dom.el('span', 'this week', 'coach-count-label'));
    body.append(count, weekChart(goal, today));
    const daysLeft = 7 - ((today.getDay() + 6) % 7);
    const status = dom.el('p', null, 'coach-error');
    status.setAttribute('role', 'status');
    card.append(
        head, body, dom.el('p', encouragement(goal, daysLeft), 'coach-note'),
        logControl(goal, card, status), status);
    return card;
  }

  /** A button that logs a goal for today, or a reading form for it. */
  function logControl(goal, card, status) {
    const [one] = goal.noun;
    if (goal.measure === 'pulse') {
      const camera = root.StellisCameraPulse;
      const pulse = measures.find((m) => m.key === 'pulse');
      const button = dom.button('Measure pulse', 'coach-button');
      button.disabled = !camera?.supported();
      button.addEventListener('click', () => camera.open(() => load(), pulse));
      return button;
    }
    if (goal.measure && !goal.done_today) {
      const button = dom.button(
          goal.measure === 'sleep' ? 'Log sleep' : 'Log a reading',
          'coach-button');
      button.addEventListener(
          'click', () => button.replaceWith(readingForm(goal, status)));
      return button;
    }
    const label = goal.done_today    ? 'Logged today' :
        goal.activity === 'medicine' ? 'Log a dose' :
                                       `Log a ${one}`;
    const button = dom.button(null, 'coach-button');
    if (goal.done_today) button.append(dom.icon('check'));
    button.append(dom.el('span', label));
    button.setAttribute('aria-pressed', String(goal.done_today));
    button.addEventListener(
        'click', () => act(() => markToday(goal, !goal.done_today), status));
    return button;
  }

  /** An inline form that logs a blood pressure or sleep reading. */
  function readingForm(goal, status) {
    const measure = measures.find((m) => m.key === goal.measure);
    const node = dom.el('form', null, 'coach-reading');
    const field = (label) => {
      const input = /** @type {!HTMLInputElement} */ (dom.el('input'));
      input.type = 'number';
      input.step = 'any';
      input.inputMode = 'decimal';
      input.required = true;
      input.setAttribute('aria-label', label);
      return input;
    };
    const first = field(measure.paired ? 'Systolic' : 'Hours of sleep');
    node.append(first);
    let second = null;
    if (measure.paired) {
      second = field('Diastolic');
      node.append(dom.el('span', '/'), second);
    }
    const save = dom.button('Save', 'coach-button is-primary');
    save.type = 'submit';
    node.append(dom.el('span', measure.unit, 'coach-unit'), save);
    node.addEventListener('submit', (event) => {
      event.preventDefault();
      act(() => dom.api('/readings', {
        method: 'POST',
        json: {
          measure: measure.key,
          value: Number(first.value),
          value2: second ? Number(second.value) : null,
        }
      }),
          status);
    });
    setTimeout(() => first.focus());
    return node;
  }

  /** Selectors that add a goal, or edit one when given. */
  function form(goal) {
    const node = dom.el('form', null, 'coach-form');
    node.setAttribute('aria-labelledby', 'coach-form-title');
    const heading = dom.el('h3', goal ? `Edit ${goal.title}` : 'Add a goal');
    heading.id = 'coach-form-title';
    const select = (label, options, value) => {
      const field = dom.el('label', null, 'coach-field');
      const control = /** @type {!HTMLSelectElement} */ (dom.el('select'));
      for (const [optionValue, text] of options) {
        control.append(new Option(text, String(optionValue)));
      }
      if (value != null) control.value = String(value);
      field.append(dom.el('span', label), control);
      return {field, control};
    };
    const text = (label, value, max) => {
      const field = dom.el('label', null, 'coach-field');
      const control = /** @type {!HTMLInputElement} */ (dom.el('input'));
      control.value = value || '';
      control.maxLength = max;
      field.append(dom.el('span', label), control);
      return {field, control};
    };
    const activity = select(
        'Activity', data.activities.map((a) => [a.key, a.label]),
        goal?.activity);
    const amount = select('Amount', [], null);
    const medicine = text('Medicine', goal?.medicine, 40);
    const dose = text('Dose', goal?.dose, 30);
    medicine.control.placeholder = 'Metformin';
    dose.control.placeholder = '500 mg';
    const often = select(
        'How often', [7, 6, 5, 4, 3, 2, 1].map((n) => [n, frequencyText(n)]),
        goal?.times_per_week ?? 4);
    const remind = dom.el('div', null, 'coach-field coach-remind');
    const toggle = /** @type {!HTMLInputElement} */ (dom.el('input'));
    toggle.type = 'checkbox';
    toggle.checked = !!goal?.reminder;
    toggle.id = 'coach-remind-toggle';
    const toggleLabel = dom.el('label', 'Remind me at');
    toggleLabel.htmlFor = toggle.id;
    const time = /** @type {!HTMLInputElement} */ (dom.el('input'));
    time.type = 'time';
    time.step = '900';
    time.value = goal?.reminder || '08:00';
    time.setAttribute('aria-label', 'Reminder time');
    const row = dom.el('span', null, 'coach-remind-row');
    row.append(toggle, toggleLabel, time);
    remind.append(dom.el('span', 'Reminder'), row);

    let chosenKey = null;
    const sync = () => {
      const chosen =
          data.activities.find((a) => a.key === activity.control.value);
      if (chosen.key !== chosenKey) {
        chosenKey = chosen.key;
        const saved = goal?.activity === chosen.key ? goal.amount : null;
        amount.control.replaceChildren(...chosen.amounts.map(
            (n) => new Option(`${n} ${chosen.unit}`, String(n))));
        const middle = chosen.amounts[Math.floor(chosen.amounts.length / 2)];
        amount.control.value =
            String(chosen.amounts.includes(saved) ? saved : middle);
      }
      amount.field.hidden = !chosen.amounts.length;
      medicine.field.hidden = dose.field.hidden = chosen.key !== 'medicine';
      medicine.control.required = chosen.key === 'medicine';
      time.disabled = !toggle.checked;
    };
    activity.control.addEventListener('change', sync);
    toggle.addEventListener('change', sync);
    sync();

    const status = dom.el('p', null, 'coach-error');
    status.setAttribute('role', 'status');
    const buttons = dom.el('div', null, 'coach-form-actions');
    const save =
        dom.button(goal ? 'Save goal' : 'Add goal', 'coach-button is-primary');
    save.type = 'submit';
    buttons.append(save);
    if (goal || data.goals.length) {
      const cancel = dom.button('Cancel', 'coach-button is-quiet');
      cancel.addEventListener('click', () => {
        editing = null;
        adding = false;
        paint();
      });
      buttons.append(cancel);
    }
    if (goal) {
      const remove = dom.button('Delete goal', 'coach-button is-danger');
      remove.addEventListener('click', () => {
        if (root.confirm(`Delete "${goal.title}"? Readings stay.`)) {
          act(() => dom.api(goalPath(goal), {method: 'DELETE'}), status);
        }
      });
      buttons.append(remove);
    }
    const fields = dom.el('div', null, 'coach-form-fields');
    fields.append(
        activity.field, amount.field, medicine.field, dose.field, often.field,
        remind);
    node.append(heading, fields, buttons, status);
    node.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = {
        activity: activity.control.value,
        amount: amount.field.hidden ? null : Number(amount.control.value),
        medicine: medicine.control.value,
        dose: dose.control.value,
        times_per_week: Number(often.control.value),
        reminder: toggle.checked ? time.value : null,
      };
      act(() => goal ? dom.api(goalPath(goal), {method: 'PUT', json: values}) :
                       dom.api('/goals', {method: 'POST', json: values}),
          status);
    });
    return node;
  }

  return {load};
}

let mounted = null;

/**
 * Fills Home's health overview and goals.
 * @param {?Element} host
 * @return {(!Promise|undefined)}
 */
function home(host) {
  if (!host) return;
  if (!mounted || mounted.host !== host) {
    mounted = {host, view: create(host)};
  }
  return mounted.view.load();
}

const exported = {
  home,
  encouragement,
  frequencyText,
  clockText,
  contextText
};
root.StellisGoals = exported;
if (typeof module !== 'undefined') module.exports = exported;
})(typeof window !== 'undefined' ? window : globalThis);
