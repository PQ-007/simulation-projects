// Finite state machine simulator: DFA/NFA (with ε-moves) written as text, drawn as a graph, run one symbol at a time.
const EPS = 'ε';
const ANY = '*'; // "any state" source, like Unity's Animator: `* -> Dead : d`
const R = 26; // state radius in SVG units
const VW = 800, VH = 440;
// Sibling modules load with this module's ?v= so they never come from a stale browser cache.
const sibling = name => import(new URL(name + new URL(import.meta.url).search, import.meta.url));
const [{ SCENES, STYLE, SCENE_VIEWBOX }, { mountBot, EVENTS, STATE_COLORS }] = await Promise.all([sibling('scenes.js'), sibling('bot.js')]);

// Definition syntax, one item per line (# starts a comment):
//   start: q0        accept: q1, q2        q0 -> q1 : a, b        (ε / eps for an empty move, * -> q : x from any state)
export function parse(src) {
  const m = { states: [], start: null, accept: new Set(), edges: [], errors: [] };
  const add = s => { if (!m.states.includes(s)) m.states.push(s); };
  src.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*/, '').trim();
    let r;
    if (!line) return;
    if ((r = /^start\s*:\s*(\S+)$/i.exec(line))) { m.start = r[1]; add(r[1]); }
    else if ((r = /^accept\s*:\s*(.*)$/i.exec(line))) r[1].split(/[\s,]+/).filter(Boolean).forEach(s => { m.accept.add(s); add(s); });
    else if ((r = /^(\S+)\s*->\s*(\S+)\s*:\s*(.+)$/.exec(line))) {
      if (r[1] !== ANY) add(r[1]);
      add(r[2]);
      for (let sym of r[3].split(',').map(s => s.trim()).filter(Boolean)) {
        if (/^(eps|epsilon|ε)$/i.test(sym)) sym = EPS;
        if ([...sym].length !== 1) { m.errors.push(`${i + 1}-р мөр: "${sym}" нэг тэмдэгт байх ёстой`); continue; }
        m.edges.push({ from: r[1], to: r[2], sym });
      }
    } else m.errors.push(`${i + 1}-р мөр ойлгомжгүй: ${line}`);
  });
  if (!m.start && m.states.length) m.start = m.states[0];
  return m;
}

// Every state reachable through ε-moves alone.
export function closure(m, states) {
  const out = new Set(states), stack = [...states];
  while (stack.length) {
    const s = stack.pop();
    for (const e of m.edges) if (e.from === s && e.sym === EPS && !out.has(e.to)) { out.add(e.to); stack.push(e.to); }
  }
  return out;
}

// Read one symbol from every active state at once (a DFA simply always has a single active state).
export function step(m, states, c) {
  const next = new Set(), used = [];
  for (const e of m.edges) {
    if (e.sym !== c) continue;
    // An any-state edge fires from every active state except its own target.
    if (states.has(e.from) || (e.from === ANY && [...states].some(s => s !== e.to))) { next.add(e.to); used.push(e); }
  }
  return { states: closure(m, next), used };
}

const isDFA = m => !m.edges.some(e => e.sym === EPS) && new Set(m.edges.map(e => `${e.from}\0${e.sym}`)).size === m.edges.length;

const PRESETS = {
  'Game bot (AI)': {
    live: true,
    desc: 'Тоглоомын bot: төлөв нь юу хийхийг, event нь хэзээ солихыг шийднэ. Player-г чирж үз.',
    input: '',
    def: `start: Patrol
# s = player харагдсан, l = алдсан
# r = буудах зайд, o = зайнаас гарсан
# h = health бага, f = бүрэн эдгэрсэн
# d = health 0 (үхсэн), n = respawn
Patrol -> Chase : s
Chase -> Patrol : l
Chase -> Attack : r
Attack -> Chase : o
Attack -> Flee : h
Chase -> Flee : h
Flee -> Patrol : f
# * = бүх төлөв: аль ч төлөвт үхэж болно
* -> Dead : d
Dead -> Patrol : n`,
    pos: { Dead: [90, 110], '*': [90, 300], Patrol: [300, 210], Chase: [530, 100], Attack: [760, 210], Flee: [530, 320] },
  },
  'Turnstile': {
    desc: 'Эргэдэг хаалга: c = зоос хийх (coin), p = түлхэх (push). Хүлээн авах төлөвгүй, зөвхөн төлөв нь чухал.',
    input: 'pcppcc',
    def: `start: Locked\nLocked -> Unlocked : c\nLocked -> Locked : p\nUnlocked -> Locked : p\nUnlocked -> Unlocked : c`,
    pos: { Locked: [260, 250], Unlocked: [540, 250] },
  },
  'Traffic light': {
    desc: 'Гэрлэн дохио: t = timer, e = emergency (шууд улаан болно).',
    input: 'ttttet',
    def: `start: Red\nRed -> Green : t\nGreen -> Yellow : t\nYellow -> Red : t\nRed -> Red : e\nGreen -> Red : e\nYellow -> Red : e`,
    pos: { Red: [400, 120], Green: [620, 330], Yellow: [180, 330] },
  },
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  // Stage: the real-world scene on top, the state graph below it.
  // The stage never shrinks below its content; on narrow screens the whole demo scrolls instead.
  const stage = h('div', { style: 'flex:1 0 auto;min-height:560px;display:flex;flex-direction:column' });
  root.style.overflowY = 'auto';
  const sceneBox = h('div', { style: 'flex:1.4 1 0;min-height:260px;display:flex;flex-direction:column;margin:10px 10px 0;border-radius:10px;background:var(--bg);overflow:hidden' });
  const sceneArea = h('div', { style: 'position:relative;flex:1;min-height:200px' });
  const sceneSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sceneSvg.setAttribute('viewBox', SCENE_VIEWBOX);
  sceneSvg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;font-family:Inter,system-ui,sans-serif');
  const caption = h('div', { style: 'padding:8px 12px;font-size:.85rem;color:var(--fg);border-top:1px solid var(--line);min-height:2.6em' });
  sceneArea.append(sceneSvg);
  sceneBox.append(sceneArea, caption);

  const wrap = h('div', { style: 'position:relative;flex:1 1 0;min-height:240px' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;user-select:none');
  const info = h('div', { style: 'position:absolute;top:10px;left:12px;right:12px;font-size:.8rem;color:var(--muted);pointer-events:none' });
  const result = h('div', { style: 'position:absolute;bottom:10px;left:12px;font-size:.85rem;font-weight:600;padding:3px 10px;border-radius:99px;pointer-events:none' });
  wrap.append(svg, info, result);
  stage.append(sceneBox, wrap);

  const mono = 'font-family:"JetBrains Mono",ui-monospace,monospace';
  const tape = h('div', { style: `display:flex;flex-wrap:wrap;gap:4px;align-items:center;${mono}` });
  const trace = h('div', { style: `display:flex;gap:6px;align-items:center;overflow-x:auto;white-space:nowrap;font-size:.8rem;padding-bottom:2px;${mono}` });
  const btn = (text, title, onclick) => h('button', { className: 'btn', textContent: text, title, onclick });
  const resetBtn = btn('⏮', 'Эхнээс нь (Reset)', () => { stop(); reset(); bot?.reset(); });
  const backBtn = btn('◀', 'Нэг алхам буцах', () => { stop(); back(); });
  const stepBtn = btn('Step ▶', 'Нэг тэмдэгт унших', () => { stop(); forward(); });
  const play = h('button', { className: 'btn', style: 'min-width:110px;justify-content:center', onclick: () => (live ? setPaused(!paused) : timer ? stop() : run()) });
  const speed = h('input', { type: 'range', min: 0.5, max: 6, step: 0.5, value: 2, style: 'width:90px' });
  const speedField = h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--muted)' }, 'Хурд', speed);
  const input = h('input', { type: 'text', 'aria-label': 'Оролт', spellcheck: false, style: `width:170px;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font-size:.95rem;${mono}` });
  const label = s => h('span', { textContent: s, style: 'font-size:.85rem;color:var(--muted)' });
  const inputLabel = label('Оролт:');
  const legend = h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.8rem;color:var(--muted)' },
    ...Object.entries(EVENTS).map(([k, v]) => h('span', {}, h('b', { textContent: k, style: `color:var(--fg);${mono}` }), ` = ${v}`)));
  const presetBtns = Object.keys(PRESETS).map(name => h('button', { className: 'btn btn-sm', textContent: name, onclick: () => load(name) }));

  const editor = h('textarea', { rows: 9, spellcheck: false, style: `width:100%;resize:vertical;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font-size:.85rem;line-height:1.5;${mono}` });
  const errors = h('div', { style: 'font-size:.8rem;color:#dc2626;white-space:pre-line' });
  const editorHint = h('div', { style: 'color:var(--muted);font-size:.8rem' });
  const details = h('details', { style: 'font-size:.85rem' },
    h('summary', { textContent: 'Definition засах', style: 'cursor:pointer;color:var(--muted)' }),
    h('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:8px' }, editorHint, editor, errors));

  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center' }, ...kids);
  const controls = h('div', { style: 'display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-top:1px solid var(--line)' },
    row(inputLabel, input, resetBtn, backBtn, stepBtn, play, speedField),
    row(tape), legend, trace,
    row(label('Machine:'), ...presetBtns),
    details);
  root.append(stage, controls);

  const nodes = () => (m.edges.some(e => e.from === ANY) ? [...m.states, ANY] : m.states);
  let m = parse(''), pos = {}, hist = [], timer = 0, drag = null, preset = null, vb = [0, 0, VW, VH];
  let live = false, paused = false, bot = null, sceneKey = '';
  // Hide/show without losing an element's own inline display (several of these are flex boxes).
  const show = (el, on) => { if (el._display === undefined) el._display = el.style.display; el.style.display = on ? el._display : 'none'; };

  // Zoom the view to the states (with room for self-loops and the start arrow), keeping at least a 4:3-ish frame.
  function fit() {
    const ps = nodes().map(s => pos[s]);
    if (!ps.length) return;
    const xs = ps.map(p => p[0]), ys = ps.map(p => p[1]);
    let x0 = Math.min(...xs) - R - 60, x1 = Math.max(...xs) + R + 40, y0 = Math.min(...ys) - R - 70, y1 = Math.max(...ys) + R + 60;
    const w = Math.max(x1 - x0, 360), hh = Math.max(y1 - y0, 240);
    vb = [(x0 + x1 - w) / 2, (y0 + y1 - hh) / 2, w, hh];
    svg.setAttribute('viewBox', vb.join(' '));
  }

  function load(name) {
    stop();
    preset = name;
    const p = PRESETS[name];
    live = !!p.live;
    pos = Object.fromEntries(Object.entries(p.pos).map(([k, v]) => [k, [...v]]));
    editor.value = p.def;
    input.value = p.input;
    presetBtns.forEach(b => b.setAttribute('aria-pressed', String(b.textContent === name)));
    // Live machines are driven by the world instead of an input string.
    for (const el of [inputLabel, input, backBtn, stepBtn, speedField, tape]) show(el, !live);
    show(legend, live);
    // The arena needs more room than the small string scenes.
    sceneBox.style.flex = live ? '1.6 1 0' : '1.2 1 0';
    editorHint.replaceChildren(...(live
      ? ['Bot нь ', h('code', { textContent: 'Patrol' }), ', ', h('code', { textContent: 'Chase' }), ', ', h('code', { textContent: 'Attack' }), ', ', h('code', { textContent: 'Flee' }), ', ', h('code', { textContent: 'Dead' }), ' төлвүүдийн үйлдлийг мэднэ. Шилжилтийг өөрчилж үз — жишээ нь Flee мөрүүдийг устгавал bot үхтэлээ тулалдана, Dead -> Patrol-г устгавал дахин төрөхгүй.']
      : ['Мөр бүрд: ', h('code', { textContent: 'start: q0' }), ', ', h('code', { textContent: 'accept: q1, q2' }), ', ', h('code', { textContent: 'q0 -> q1 : a, b' }), ' (ε эсвэл eps = хоосон шилжилт, ', h('code', { textContent: '* -> q : x' }), ' = бүх төлвөөс). Бичих зуур шууд шинэчлэгдэнэ.']));
    bot?.destroy(); bot = null;
    show(sceneSvg, !live);
    if (live) { bot = mountBot(sceneArea, { state: () => (hist[hist.length - 1] ? [...hist[hist.length - 1].states][0] : null), fire }); paused = false; }
    sceneKey = '';
    apply();
    fit();
    sync();
  }

  // Re-read the definition; states without a position are placed on a circle.
  function apply() {
    m = parse(editor.value);
    errors.textContent = m.errors.join('\n');
    const missing = nodes().filter(s => !pos[s]);
    missing.forEach((s, i) => {
      const a = (i / missing.length) * 2 * Math.PI - Math.PI / 2;
      pos[s] = [VW / 2 + 150 * Math.cos(a), VH / 2 + 20 + 120 * Math.sin(a)];
    });
    if (missing.length) fit();
    reset();
  }

  function reset() {
    hist = m.start ? [{ states: closure(m, [m.start]), used: [] }] : [];
    sceneKey = '';
    draw();
  }
  function forward() {
    const cur = hist[hist.length - 1], word = [...input.value];
    if (!cur || hist.length - 1 >= word.length) return false;
    const c = word[hist.length - 1];
    hist.push({ ...step(m, cur.states, c), sym: c });
    draw();
    return hist.length - 1 < word.length;
  }
  // Live mode: an event only matters if the current state has a transition for it; otherwise the state stays.
  function fire(sym) {
    const cur = hist[hist.length - 1];
    if (!cur) return false;
    const next = step(m, cur.states, sym);
    if (!next.used.length) return false;
    hist.push({ ...next, sym });
    if (hist.length > 30) hist.splice(1, 1);
    draw();
    return true;
  }
  function back() {
    if (hist.length > 1) { hist.pop(); draw(); }
  }
  function run() {
    if (hist.length - 1 >= [...input.value].length) reset();
    const tick = () => { timer = forward() ? setTimeout(tick, 1000 / +speed.value) : 0; sync(); };
    timer = setTimeout(tick, 1000 / +speed.value);
    sync();
  }
  function stop() { clearTimeout(timer); timer = 0; sync(); }
  function setPaused(p) { paused = p; bot?.setPaused(p); sync(); }
  function sync() { play.textContent = live ? (paused ? '▶ Үргэлжлүүлэх' : '❚❚ Зогсоох') : timer ? '❚❚ Зогсоох' : '▶ Run'; }

  function drawScene(word, read) {
    const scene = !live && preset && SCENES[preset];
    show(sceneBox, !!(scene || live));
    if (live) { caption.textContent = `${hist[hist.length - 1]?.sym ? `"${hist[hist.length - 1].sym}" event → ` : ''}${[...(hist[hist.length - 1]?.states || [])][0] || '—'}. Arena дээр дарж/чирж player-г зөөнө.`; return; }
    if (!scene) return;
    // Only redraw when the run moves, so each step's animation plays once (dragging graph states must not restart it).
    const key = `${preset}|${input.value}|${read}`;
    if (key === sceneKey) return;
    sceneKey = key;
    const cur = hist[hist.length - 1];
    const out = scene({ word, read, hist, states: cur ? cur.states : new Set(), prev: hist[read - 1]?.states || null, sym: read ? word[read - 1] : null });
    sceneSvg.innerHTML = STYLE + out.svg;
    caption.textContent = out.caption;
  }

  function drawTrace() {
    const set = st => (st.size === 1 ? [...st][0] : `{${[...st].join(', ') || '∅'}}`);
    trace.replaceChildren(label('Trace:'), ...hist.flatMap((e, i) => [
      ...(i ? [h('span', { textContent: `—${e.sym}→`, style: 'color:var(--muted)' })] : []),
      h('span', { textContent: set(e.states), style: `padding:1px 7px;border-radius:6px;border:1px solid ${i === hist.length - 1 ? 'var(--accent)' : 'var(--line)'};${i === hist.length - 1 ? 'color:var(--accent);font-weight:600' : ''}` }),
    ]));
    trace.scrollLeft = trace.scrollWidth;
  }

  function draw() {
    const word = [...input.value], cur = hist[hist.length - 1], read = live ? 0 : hist.length - 1;
    const active = cur ? cur.states : new Set(), done = !live && cur && read === word.length;
    const usedKeys = new Set((cur?.used || []).map(e => `${e.from}\0${e.to}`));
    const sigma = [...new Set(m.edges.filter(e => e.sym !== EPS).map(e => e.sym))];

    // Tape: read symbols are dimmed, the next one is outlined.
    tape.replaceChildren(...(word.length ? word.map((c, i) => h('span', {
      textContent: c,
      style: `min-width:26px;padding:3px 6px;text-align:center;border-radius:6px;border:${i === read ? '2px solid var(--accent)' : '1px solid var(--line)'};${i < read ? 'opacity:.4' : ''}`,
    })) : [h('span', { textContent: 'ε (хоосон мөр)', style: 'color:var(--muted);font-size:.85rem' })]));
    drawTrace();
    drawScene(word, read);

    const names = [...active].join(', ') || '∅';
    info.textContent = `${live ? 'Live machine' : isDFA(m) ? 'DFA' : 'NFA'} · Σ = {${sigma.join(', ')}}${preset ? ` · ${PRESETS[preset].desc}` : ''}`;

    // Result: accept/reject when the machine has accept states, otherwise just where it ended up.
    let verdict = null;
    if (cur && !active.size) verdict = ['Гацсан — rejected', '#dc2626'];
    else if (done && m.accept.size) verdict = [...active].some(s => m.accept.has(s)) ? ['Accepted ✓', '#16a34a'] : ['Rejected ✕', '#dc2626'];
    else if (done) verdict = [`Төгсгөлийн төлөв: ${names}`, 'var(--accent)'];
    result.hidden = !verdict;
    if (verdict) {
      result.textContent = verdict[0];
      Object.assign(result.style, { color: verdict[1], border: `1px solid ${verdict[1]}`, background: 'var(--card)' });
    }

    // Edges: one arrow per (from, to) pair with all of its symbols as the label.
    const groups = new Map();
    for (const e of m.edges) {
      const k = `${e.from}\0${e.to}`;
      if (!groups.has(k)) groups.set(k, { from: e.from, to: e.to, syms: [] });
      groups.get(k).syms.push(e.sym);
    }
    let edgesSvg = '';
    for (const [k, g] of groups) {
      const on = usedKeys.has(k), [x1, y1] = pos[g.from], [x2, y2] = pos[g.to];
      const stroke = on ? 'var(--accent)' : 'var(--muted)', width = on ? 2.6 : 1.4, marker = on ? 'url(#fsm-arrow-on)' : 'url(#fsm-arrow)';
      let d, lx, ly;
      if (g.from === g.to) {
        // Self-loop above the state.
        d = `M${x1 - 14},${y1 - R + 4} C${x1 - 42},${y1 - R - 52} ${x1 + 42},${y1 - R - 52} ${x1 + 14},${y1 - R + 4}`;
        lx = x1; ly = y1 - R - 46;
      } else {
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = dy / len, ny = -dx / len;
        // Bend when there is an edge back the other way, or when a straight line would pass through another state.
        const blocked = nodes().some(s => {
          if (s === g.from || s === g.to) return false;
          const [px, py] = pos[s], t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len ** 2));
          return Math.hypot(x1 + t * dx - px, y1 + t * dy - py) < R + 10;
        });
        const bend = blocked ? 70 : groups.has(`${g.to}\0${g.from}`) ? 30 : 0;
        const cx = (x1 + x2) / 2 + nx * bend * 2, cy = (y1 + y2) / 2 + ny * bend * 2;
        const at = (px, py, qx, qy) => { const l = Math.hypot(qx - px, qy - py) || 1; return [px + ((qx - px) / l) * R, py + ((qy - py) / l) * R]; };
        const [sx, sy] = at(x1, y1, cx, cy), [ex, ey] = at(x2, y2, cx, cy);
        d = `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`;
        lx = 0.25 * sx + 0.5 * cx + 0.25 * ex + nx * 13; ly = 0.25 * sy + 0.5 * cy + 0.25 * ey + ny * 13;
      }
      edgesSvg += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" marker-end="${marker}"/>`
        + `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="15" fill="${on ? 'var(--accent)' : 'var(--fg)'}" font-weight="${on ? 700 : 500}" stroke="var(--card)" stroke-width="5" paint-order="stroke">${esc(g.syms.join(', '))}</text>`;
    }

    let nodesSvg = '';
    if (m.start && pos[m.start]) {
      const [x, y] = pos[m.start];
      nodesSvg += `<path d="M${x - R - 44},${y} L${x - R},${y}" stroke="var(--fg)" stroke-width="1.6" marker-end="url(#fsm-arrow-start)"/>`;
    }
    for (const s of m.states) {
      const [x, y] = pos[s], on = active.has(s), acc = m.accept.has(s);
      const ring = on && done && acc ? '#16a34a' : on ? (live ? STATE_COLORS[s.toLowerCase()] || 'var(--accent)' : 'var(--accent)') : 'var(--fg)';
      nodesSvg += `<g data-state="${esc(s)}" style="cursor:grab">`
        + `<circle cx="${x}" cy="${y}" r="${R}" fill="${on ? 'var(--accent-soft)' : 'var(--card)'}" stroke="${ring}" stroke-width="${on ? 3 : 1.6}"/>`
        + (acc ? `<circle cx="${x}" cy="${y}" r="${R - 5}" fill="none" stroke="${ring}" stroke-width="${on ? 2 : 1.4}"/>` : '')
        + `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(14, 76 / [...s].length).toFixed(1)}" font-weight="600" fill="var(--fg)">${esc(s)}</text></g>`;
    }
    if (pos[ANY] && nodes().includes(ANY)) {
      const [x, y] = pos[ANY];
      nodesSvg += `<g data-state="${ANY}" style="cursor:grab"><circle cx="${x}" cy="${y}" r="${R}" fill="var(--card)" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="4 4"/>`
        + `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="600" fill="var(--muted)">Any</text>`
        + `<text x="${x}" y="${y + R + 14}" text-anchor="middle" font-size="11" fill="var(--muted)">бүх төлөв</text></g>`;
    }

    const arrow = (id, fill) => `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${fill}"/></marker>`;
    svg.innerHTML = `<defs>${arrow('fsm-arrow', 'var(--muted)')}${arrow('fsm-arrow-on', 'var(--accent)')}${arrow('fsm-arrow-start', 'var(--fg)')}</defs>`
      + (m.states.length ? '' : `<text x="${VW / 2}" y="${VH / 2}" text-anchor="middle" fill="var(--muted)" font-size="16">Definition хоосон байна</text>`)
      + `<g>${edgesSvg}</g><g>${nodesSvg}</g>`;
    backBtn.disabled = hist.length <= 1;
    stepBtn.disabled = !cur || done;
  }

  // Drag states around; the SVG keeps pointer capture while its contents are redrawn.
  const toSvg = e => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return [Math.max(vb[0] + R, Math.min(vb[0] + vb[2] - R, p.x)), Math.max(vb[1] + R, Math.min(vb[1] + vb[3] - R, p.y))];
  };
  svg.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-state]');
    if (!g) return;
    drag = g.dataset.state;
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => { if (drag) { pos[drag] = toSvg(e); draw(); } });
  const endDrag = () => { if (drag) fit(); drag = null; };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  input.oninput = () => { stop(); reset(); };
  input.onkeydown = e => { if (e.key === 'Enter') run(); };
  editor.oninput = () => {
    stop();
    // A string preset's scene depends on its exact states, so editing drops it; the bot keeps running on the new brain.
    if (!live) { preset = null; presetBtns.forEach(b => b.setAttribute('aria-pressed', 'false')); }
    apply();
  };

  load('Game bot (AI)');
  // Stop the run timer and the bot once the demo is removed from the page.
  new MutationObserver((_, o) => { if (!root.isConnected) { clearTimeout(timer); bot?.destroy(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
