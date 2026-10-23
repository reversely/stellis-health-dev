/** DOM geometry checks used by the Maya guide layout audit. */
const PAGE_AUDIT = ({ centerSelectors, ignoreSelectors, isNarrow }) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const findings = [];
  const doc = document.documentElement;

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`;
  };
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top + window.scrollY), right: Math.round(r.right), bottom: Math.round(r.bottom + window.scrollY), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const ignored = new Set();
  for (const sel of ignoreSelectors) {
    try { document.querySelectorAll(sel).forEach((el) => { ignored.add(el); el.querySelectorAll('*').forEach((c) => ignored.add(c)); }); } catch {}
  }
  const isVisible = (el) => {
    if (ignored.has(el)) return false;
    const cs = getComputedStyle(el);
    if (el.checkVisibility && !el.checkVisibility({checkOpacity:true, checkVisibilityCSS:true})) return false;
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    // A screen-reader-only element (the sr-only pattern: 1px box, clipped, absolute) is hidden by design.
    if (r.width <= 1 && r.height <= 1 && cs.position === 'absolute' && /(hidden|clip)/.test(cs.overflow)) return false;
    return r.width > 0 && r.height > 0;
  };

  // 1. Horizontal page overflow.
  if (doc.scrollWidth > vw + 1) {
    findings.push({ check: 'page-overflow-x', level: 'fail', element: 'document', detail: `scrollWidth ${doc.scrollWidth}px exceeds viewport ${vw}px` });
  }

  const all = Array.from(document.body.querySelectorAll('*')).filter(isVisible);

  // 2. Elements outside the viewport horizontally.
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && cs.transform !== 'none') continue; // off-canvas drawers by design
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      // Skip when an ancestor clips it (overflow hidden / auto scroll containers are intentional).
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) {
        const pcs = getComputedStyle(p);
        if (/(hidden|auto|scroll|clip)/.test(pcs.overflowX)) { clipped = true; break; }
        p = p.parentElement;
      }
      if (!clipped) findings.push({ check: 'element-outside-viewport', level: 'fail', element: describe(el), rect: rectOf(el), detail: `left ${Math.round(r.left)} right ${Math.round(r.right)} vs viewport 0..${vw}` });
    }
  }

  // 3. Clipped text: content wider or taller than its box under overflow hidden without ellipsis.
  for (const el of all) {
    const cs = getComputedStyle(el);
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const ox = cs.overflowX, oy = cs.overflowY;
    if (/(hidden|clip)/.test(ox) && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis' && cs.whiteSpace === 'nowrap') {
      findings.push({ check: 'text-clipped-x', level: 'fail', element: describe(el), rect: rectOf(el), detail: `content ${el.scrollWidth}px in ${el.clientWidth}px box, nowrap, no ellipsis` });
    }
    if (/(hidden|clip)/.test(oy) && el.scrollHeight > el.clientHeight + 2 && cs.webkitLineClamp === 'none') {
      findings.push({ check: 'text-clipped-y', level: 'warn', element: describe(el), rect: rectOf(el), detail: `content ${el.scrollHeight}px in ${el.clientHeight}px box` });
    }
    // Word wider than its container: a long unbroken string that escapes.
    if (!/(hidden|clip|auto|scroll)/.test(ox) && el.scrollWidth > el.clientWidth + 1 && cs.overflowWrap !== 'anywhere' && cs.overflowWrap !== 'break-word' && cs.wordBreak !== 'break-all') {
      findings.push({ check: 'text-escapes-box', level: 'fail', element: describe(el), rect: rectOf(el), detail: `content ${el.scrollWidth}px in ${el.clientWidth}px box` });
    }
  }

  // 4. Overlaps between visible text-bearing or interactive leaves that are not ancestor/descendant.
  const leafLike = all.filter((el) => {
    const tag = el.tagName;
    const interactive = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|IMG|SVG|VIDEO|CANVAS)$/.test(tag);
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    return interactive || ownText;
  });
  const visibleBox = (el) => {
    const box = el.getBoundingClientRect();
    let {left,top,right,bottom} = box;
    for(let parent=el.parentElement;parent;parent=parent.parentElement){
      const style=getComputedStyle(parent),r=parent.getBoundingClientRect();
      if(/(hidden|auto|scroll|clip)/.test(style.overflowX)){left=Math.max(left,r.left+parent.clientLeft);right=Math.min(right,r.left+parent.clientLeft+parent.clientWidth);}
      if(/(hidden|auto|scroll|clip)/.test(style.overflowY)){top=Math.max(top,r.top+parent.clientTop);bottom=Math.min(bottom,r.top+parent.clientTop+parent.clientHeight);}
    }
    return {left,top,right,bottom,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
  };
  const boxes = leafLike.map((el) => ({ el, r: visibleBox(el), cs: getComputedStyle(el) }));
  const seen = new Set();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ix <= 3 || iy <= 3) continue;
      const inter = ix * iy;
      const smaller = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
      if (smaller === 0 || inter / smaller < 0.1) continue;
      // An overlay by design: one side is fixed/absolute with a z-index and a background.
      const overlay = [a, b].some((x) => /(fixed|absolute|sticky)/.test(x.cs.position) && x.cs.zIndex !== 'auto');
      const key = `${describe(a.el)}|${describe(b.el)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ check: 'overlap', level: overlay ? 'warn' : 'fail', element: describe(a.el), other: describe(b.el), rect: rectOf(a.el), otherRect: rectOf(b.el), detail: `${Math.round(ix)}x${Math.round(iy)}px shared${overlay ? ' (one side is a positioned overlay)' : ''}` });
    }
  }

  // 5. Centring for flagged elements: horizontal centre within the offset parent or viewport.
  const centerTargets = new Set(document.querySelectorAll('[data-audit-center]'));
  for (const sel of centerSelectors) { try { document.querySelectorAll(sel).forEach((el) => centerTargets.add(el)); } catch { findings.push({ check: 'bad-selector', level: 'warn', element: sel, detail: 'selector did not parse' }); } }
  for (const el of centerTargets) {
    if (!isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    const parent = el.offsetParent || document.body;
    const pr = parent === document.body ? { left: 0, right: vw } : parent.getBoundingClientRect();
    const mine = (r.left + r.right) / 2;
    const theirs = (pr.left + pr.right) / 2;
    const delta = Math.round(mine - theirs);
    if (Math.abs(delta) > 1) findings.push({ check: 'off-centre', level: 'fail', element: describe(el), rect: rectOf(el), detail: `centre is ${delta}px ${delta > 0 ? 'right' : 'left'} of its container centre` });
  }

  // 6. Tap targets on narrow viewports: WCAG 2.2 minimum 24x24 CSS px.
  if (isNarrow) {
    for (const el of all) {
      if (!/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.getAttribute('role') !== 'button') continue;
      if (el.tagName === 'INPUT' && /^(hidden)$/.test(el.type)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) findings.push({ check: 'tap-target', level: 'warn', element: describe(el), rect: rectOf(el), detail: `${Math.round(r.width)}x${Math.round(r.height)}px, minimum 24x24` });
    }
    // 7. Body text under 12px on a phone.
    for (const el of leafLike) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12 && (el.innerText || '').trim().length > 20) findings.push({ check: 'small-text', level: 'warn', element: describe(el), rect: rectOf(el), detail: `${fs}px` });
    }
  }

  return { viewport: { width: vw, height: vh, scrollWidth: doc.scrollWidth, scrollHeight: doc.scrollHeight }, findings };
};


export {PAGE_AUDIT};
