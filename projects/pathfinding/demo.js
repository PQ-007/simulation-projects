// Pathfinding on a grid: BFS, DFS, Dijkstra, A* and Greedy best-first, animated expansion by expansion.
const COLS = 45, ROWS = 25;
const WEIGHT = 5; // cost of entering a weighted (mud) cell
const WALL = 1, MUD = 2;

export const ALGOS = {
  bfs: { name: 'BFS', desc: 'Давхарга давхаргаар тэлнэ. Жингүй үед хамгийн богино замыг олно, жинг тоохгүй.' },
  dfs: { name: 'DFS', desc: 'Нэг чиглэлд аль болох гүн явна. Зам олдох ч хамгийн богино байх баталгаагүй.' },
  dijkstra: { name: 'Dijkstra', desc: 'Хамгийн бага зардалтай node-ийг түрүүлж задална. Жинтэй үед ч хамгийн хямд замыг олно.' },
  astar: { name: 'A*', desc: 'Dijkstra + heuristic: g(n) + h(n). Зорилго руу чиглэж, цөөн node задлаад хамгийн хямд замыг олно.' },
  greedy: { name: 'Greedy', desc: 'Зөвхөн h(n)-ээр — зорилгод хамгийн ойрхон харагдах node руу. Хурдан ч хамгийн богино биш байж болно.' },
};

// Binary min-heap ordered by [priority, tiebreak].
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(i, j) { const x = this.a[i], y = this.a[j]; return x.pr < y.pr || (x.pr === y.pr && x.tie < y.tie); }
  swap(i, j) { [this.a[i], this.a[j]] = [this.a[j], this.a[i]]; }
  push(e) {
    this.a.push(e);
    for (let i = this.a.length - 1; i > 0;) { const p = (i - 1) >> 1; if (!this.less(i, p)) break; this.swap(i, p); i = p; }
  }
  pop() {
    const top = this.a[0], last = this.a.pop();
    if (this.a.length) {
      this.a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.a.length && this.less(l, m)) m = l;
        if (r < this.a.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
}

// One search, recorded step by step: each step is the node expanded and the neighbours it added to the frontier.
export function search(algo, grid, start, goal, diagonal) {
  const N = COLS * ROWS, xy = n => [n % COLS, (n / COLS) | 0];
  const [gx, gy] = xy(goal);
  const h = n => {
    const [x, y] = xy(n), dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return diagonal ? dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy) : dx + dy; // octile / Manhattan
  };
  const dirs = diagonal ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const closed = new Uint8Array(N), seen = new Uint8Array(N), parent = new Int32Array(N).fill(-1), best = new Float64Array(N).fill(Infinity);
  const open = new Heap(), steps = [];
  let counter = 0, found = false;
  const priority = (n, g) => {
    counter++;
    switch (algo) {
      case 'bfs': return { pr: counter, tie: 0 };
      case 'dfs': return { pr: -counter, tie: 0 };
      case 'dijkstra': return { pr: g, tie: counter };
      case 'astar': return { pr: g + h(n), tie: h(n) };
      default: return { pr: h(n), tie: counter }; // greedy
    }
  };
  open.push({ n: start, from: -1, g: 0, ...priority(start, 0) });
  seen[start] = 1; best[start] = 0;
  while (open.size) {
    const e = open.pop();
    if (closed[e.n]) continue;
    closed[e.n] = 1; parent[e.n] = e.from;
    const step = { n: e.n, added: [] };
    steps.push(step);
    if (e.n === goal) { found = true; break; }
    const [x, y] = xy(e.n);
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy, nb = ny * COLS + nx;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || grid[nb] === WALL || closed[nb]) continue;
      // No squeezing diagonally between two walls.
      if (dx && dy && (grid[y * COLS + nx] === WALL || grid[ny * COLS + x] === WALL)) continue;
      const g = e.g + (dx && dy ? Math.SQRT2 : 1) * (grid[nb] === MUD ? WEIGHT : 1);
      if (algo === 'bfs' || algo === 'greedy') { if (seen[nb]) continue; seen[nb] = 1; }
      else if (algo !== 'dfs') { if (g >= best[nb]) continue; best[nb] = g; }
      open.push({ n: nb, from: e.n, g, ...priority(nb, g) });
      step.added.push(nb);
    }
  }
  const path = [];
  if (found) for (let n = goal; n !== -1; n = parent[n]) path.unshift(n);
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = xy(path[i - 1]), [bx, by] = xy(path[i]);
    cost += (ax !== bx && ay !== by ? Math.SQRT2 : 1) * (grid[path[i]] === MUD ? WEIGHT : 1);
  }
  return { steps, path, cost, found };
}

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const wrap = h('div', { style: 'position:relative;flex:1;min-height:260px' });
  const canvas = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair' });
  const info = h('div', { style: 'position:absolute;top:8px;left:12px;right:12px;font-size:.8rem;color:var(--muted);pointer-events:none' });
  wrap.append(canvas, info);

  const label = s => h('span', { textContent: s, style: 'font-size:.85rem;color:var(--muted)' });
  const seg = (items, onPick) => {
    const box = h('div', { className: 'seg' });
    const btns = items.map(([key, text]) => h('button', { textContent: text, onclick: () => onPick(key) }));
    box.append(...btns);
    return { box, set: key => btns.forEach((b, i) => b.setAttribute('aria-selected', String(items[i][0] === key))) };
  };
  const algoSeg = seg(Object.entries(ALGOS).map(([k, v]) => [k, v.name]), k => { algo = k; algoSeg.set(k); rerun(); });
  const toolSeg = seg([['wall', 'Хана'], ['mud', `Шавар ×${WEIGHT}`], ['erase', 'Арилгах']], k => { tool = k; toolSeg.set(k); });
  const play = h('button', { className: 'btn', style: 'min-width:130px;justify-content:center', onclick: () => (anim ? pause() : visualize()) });
  const btn = (text, onclick, title = '') => h('button', { className: 'btn', textContent: text, onclick, title });
  const speed = h('input', { type: 'range', min: 1, max: 40, value: 6, style: 'width:90px' });
  const diag = h('input', { type: 'checkbox' });
  const stats = h('div', { style: 'font-size:.85rem;color:var(--fg)' });
  const table = h('table', { style: 'border-collapse:collapse;font-size:.8rem;width:100%;max-width:520px' });
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center' }, ...kids);
  const controls = h('div', { style: 'display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-top:1px solid var(--line)' },
    row(label('Algorithm:'), algoSeg.box, h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, diag, 'Диагональ')),
    row(play, btn('Path арилгах', () => { stopAnim(); result = null; draw(); }), h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--muted)' }, 'Хурд', speed)),
    row(label('Зурах:'), toolSeg.box, btn('Maze', maze, 'Recursive backtracker maze'), btn('Random', randomWalls), btn('Цэвэрлэх', () => { grid.fill(0); rerun(); })),
    stats,
    h('details', {}, h('summary', { textContent: 'Бүх algorithm-ийг харьцуулах', style: 'cursor:pointer;font-size:.85rem;color:var(--muted)' }), table));
  root.append(wrap, controls);

  const ctx = canvas.getContext('2d');
  const grid = new Uint8Array(COLS * ROWS);
  let start = 12 * COLS + 8, goal = 12 * COLS + 36, algo = 'astar', tool = 'wall';
  let result = null, shown = 0, pathShown = 0, anim = false, raf = 0, view = { w: 1, h: 1, s: 1, ox: 0, oy: 0 };
  // Per-cell playback state: 0 untouched, 1 frontier, 2 expanded (with the order it was expanded in).
  const status = new Uint8Array(COLS * ROWS), order = new Int32Array(COLS * ROWS);

  // A starter wall with gaps, so the algorithms visibly differ.
  for (let y = 4; y < 21; y++) if (y !== 6 && y !== 19) grid[y * COLS + 22] = WALL;
  for (let x = 14; x < 22; x++) grid[20 * COLS + x] = MUD;

  function resetPlayback() {
    status.fill(0); shown = 0; pathShown = 0;
  }
  function applyStep(i) {
    const s = result.steps[i];
    status[s.n] = 2; order[s.n] = i;
    for (const n of s.added) if (status[n] !== 2) status[n] = 1;
  }
  // Instant run: used after edits once a search has been shown, so dragging S/G updates the path live.
  function rerun() {
    stopAnim();
    result = search(algo, grid, start, goal, diag.checked);
    resetPlayback();
    for (; shown < result.steps.length; shown++) applyStep(shown);
    pathShown = result.path.length;
    compare();
    draw();
  }
  function visualize() {
    if (!result || shown >= result.steps.length) { result = search(algo, grid, start, goal, diag.checked); resetPlayback(); compare(); }
    anim = true; sync();
  }
  function pause() { anim = false; sync(); }
  function stopAnim() { anim = false; sync(); }
  function sync() { play.textContent = anim ? '❚❚ Зогсоох' : result && shown < result.steps.length ? '▶ Үргэлжлүүлэх' : '▶ Visualize'; }

  function compare() {
    const rows = Object.entries(ALGOS).map(([k, v]) => ({ k, name: v.name, ...search(k, grid, start, goal, diag.checked) }));
    const bestCost = Math.min(...rows.filter(r => r.found).map(r => r.cost));
    const th = s => h('th', { textContent: s, style: 'text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);color:var(--muted);font-weight:500' });
    const td = (s, extra = '') => h('td', { textContent: s, style: `padding:4px 8px;border-bottom:1px solid var(--line);${extra}` });
    table.replaceChildren(h('tr', {}, th('Algorithm'), th('Задалсан node'), th('Замын урт'), th('Зардал'), th('Хамгийн хямд?')),
      ...rows.map(r => h('tr', { style: r.k === algo ? 'background:var(--accent-soft)' : '' },
        td(r.name, 'font-weight:600'), td(r.steps.length), td(r.found ? r.path.length - 1 : '—'), td(r.found ? r.cost.toFixed(1) : '—'),
        td(!r.found ? 'олдсонгүй' : Math.abs(r.cost - bestCost) < 1e-9 ? '✓' : '✕', `color:${!r.found || Math.abs(r.cost - bestCost) >= 1e-9 ? '#dc2626' : '#16a34a'}`))));
  }

  function resize() {
    const r = wrap.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.max(4, Math.floor(Math.min((r.width - 16) / COLS, (r.height - 34) / ROWS)));
    view = { w: r.width, h: r.height, s, ox: Math.round((r.width - s * COLS) / 2), oy: Math.round(28 + (r.height - 28 - s * ROWS) / 2) };
    draw();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  function draw() {
    const css = getComputedStyle(root), v = n => css.getPropertyValue(n).trim();
    const fg = v('--fg') || '#000', line = v('--line') || '#ddd', card = v('--card') || '#fff';
    const { s, ox, oy } = view, total = result ? result.steps.length : 1;
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.fillStyle = card; ctx.fillRect(ox, oy, s * COLS, s * ROWS);
    for (let n = 0; n < COLS * ROWS; n++) {
      const x = ox + (n % COLS) * s, y = oy + ((n / COLS) | 0) * s;
      if (grid[n] === WALL) { ctx.fillStyle = fg; ctx.fillRect(x, y, s, s); continue; }
      if (status[n] === 2) {
        // Expanded cells shade from blue to violet in the order they were expanded.
        ctx.fillStyle = `hsl(${205 + (order[n] / total) * 75} 85% 62% / .55)`; ctx.fillRect(x, y, s, s);
      } else if (status[n] === 1) {
        ctx.fillStyle = 'hsl(150 70% 45% / .45)'; ctx.fillRect(x, y, s, s);
      }
      if (grid[n] === MUD) {
        ctx.fillStyle = 'hsl(30 70% 40% / .45)'; ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
      }
    }
    ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= COLS; x++) { ctx.moveTo(ox + x * s + 0.5, oy); ctx.lineTo(ox + x * s + 0.5, oy + ROWS * s); }
    for (let y = 0; y <= ROWS; y++) { ctx.moveTo(ox, oy + y * s + 0.5); ctx.lineTo(ox + COLS * s, oy + y * s + 0.5); }
    ctx.stroke();

    const center = n => [ox + (n % COLS) * s + s / 2, oy + ((n / COLS) | 0) * s + s / 2];
    if (result && pathShown > 1) {
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = Math.max(3, s * 0.32); ctx.lineCap = ctx.lineJoin = 'round';
      ctx.beginPath();
      result.path.slice(0, pathShown).forEach((n, i) => { const [x, y] = center(n); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    for (const [n, col, txt] of [[start, '#16a34a', 'S'], [goal, '#dc2626', 'G']]) {
      const [x, y] = center(n);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, s * 0.46, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(s * 0.55)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, x, y + 1);
    }

    info.textContent = `${ALGOS[algo].name} — ${ALGOS[algo].desc}`;
    if (!result) stats.textContent = 'S, G-г чирж зөөнө. Хоосон нүдэн дээр чирж хана/шавар зурна. ▶ Visualize дарж эхлүүл.';
    else {
      const done = shown >= result.steps.length;
      stats.textContent = `Задалсан: ${shown} node`
        + (done ? (result.found ? ` · Замын урт: ${result.path.length - 1} · Зардал: ${result.cost.toFixed(1)}` : ' · Зам олдсонгүй ✕') : ' · хайж байна…');
    }
  }

  function frame() {
    // Not on screen (hidden pane, closed dialog, scrolled away): skip the work until it is visible again.
    if (root.closest('[data-offscreen]')) { raf = requestAnimationFrame(frame); return; }
    if (anim && result) {
      if (shown < result.steps.length) for (let k = 0; k < +speed.value && shown < result.steps.length; k++) applyStep(shown++);
      else if (pathShown < result.path.length) pathShown = Math.min(result.path.length, pathShown + Math.max(1, Math.ceil(+speed.value / 4)));
      else { anim = false; sync(); }
      draw();
    }
    raf = requestAnimationFrame(frame);
  }

  // Editing: drag S or G, or paint with the current tool; the first cell decides whether a drag adds or erases.
  let drag = null;
  const cellAt = e => {
    const r = canvas.getBoundingClientRect(), x = Math.floor((e.clientX - r.left - view.ox) / view.s), y = Math.floor((e.clientY - r.top - view.oy) / view.s);
    return x >= 0 && y >= 0 && x < COLS && y < ROWS ? y * COLS + x : -1;
  };
  const edited = () => { if (result && !anim) rerun(); else { stopAnim(); result = null; resetPlayback(); draw(); } };
  const paint = n => {
    if (n < 0 || n === start || n === goal) return;
    const val = drag.paint;
    if (grid[n] !== val) { grid[n] = val; edited(); }
  };
  canvas.addEventListener('pointerdown', e => {
    const n = cellAt(e);
    if (n < 0) return;
    canvas.setPointerCapture(e.pointerId);
    if (n === start || n === goal) drag = { move: n === start ? 'start' : 'goal' };
    else {
      const want = tool === 'wall' ? WALL : tool === 'mud' ? MUD : 0;
      drag = { paint: tool !== 'erase' && grid[n] === want ? 0 : want };
      paint(n);
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const n = cellAt(e);
    if (drag.paint !== undefined) return paint(n);
    if (n < 0 || grid[n] === WALL || n === start || n === goal) return;
    if (drag.move === 'start') start = n; else goal = n;
    edited();
  });
  const up = () => { drag = null; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  diag.onchange = () => (result ? rerun() : draw());

  function randomWalls() {
    grid.fill(0);
    for (let n = 0; n < grid.length; n++) if (n !== start && n !== goal && Math.random() < 0.28) grid[n] = WALL;
    edited();
  }
  // Recursive backtracker on odd cells, then knock out a few extra walls so there is more than one route.
  function maze() {
    grid.fill(WALL);
    const stack = [[1, 1]];
    grid[COLS + 1] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const next = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dy]) => [x + dx, y + dy, dx, dy])
        .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < COLS - 1 && ny < ROWS - 1 && grid[ny * COLS + nx] === WALL);
      if (!next.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = next[(Math.random() * next.length) | 0];
      grid[(y + dy / 2) * COLS + x + dx / 2] = 0; grid[ny * COLS + nx] = 0;
      stack.push([nx, ny]);
    }
    for (let k = 0; k < 40; k++) {
      const x = 1 + ((Math.random() * (COLS - 2)) | 0), y = 1 + ((Math.random() * (ROWS - 2)) | 0);
      if ((x + y) % 2 === 1) grid[y * COLS + x] = 0;
    }
    start = COLS + 1; goal = (ROWS - 2) * COLS + COLS - 2;
    edited();
  }

  algoSeg.set(algo); toolSeg.set(tool);
  compare(); resize();
  visualize(); // play the first search straight away
  raf = requestAnimationFrame(frame);
  // Stop animating once the demo is removed from the page.
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
