// Verlet physics (Thomas Jakobsen, "Advanced Character Physics", GDC 2001):
// points remember where they were last step, so velocity is just (x − x_prev);
// sticks then push pairs of points back to their rest length, a few times per step.
// That is all it takes for cloth, rope, ragdolls and soft bodies.
const DT = 1 / 60;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------- world ----------
// point: { x, y, px, py, w0 (inverse mass), w (0 while pinned or held), r (collision radius), body, pinned }
// stick: { a, b, len, k (stiffness per iteration), min (only pushes apart), tear, style, hue }
function newWorld() {
  return { pts: [], sticks: [], shapes: [], heads: [], balls: [], circles: [], segs: [], nextBody: 0, held: null, t: 0 };
}
function point(world, x, y, { w = 1, r = 0, body = 0, pinned = false } = {}) {
  const p = { x, y, px: x, py: y, w0: w, w: pinned ? 0 : w, r, body, pinned, hit: false };
  world.pts.push(p);
  return p;
}
function stick(world, a, b, opts = {}) {
  const s = { a, b, len: Math.hypot(b.x - a.x, b.y - a.y), k: 1, min: false, tear: false, style: 'hidden', hue: 0, ...opts };
  if (opts.lenScale) s.len *= opts.lenScale;
  world.sticks.push(s);
  return s;
}
const refreshW = (world, p) => { p.w = p.pinned || (world.held && world.held.p === p) ? 0 : p.w0; };

// ---------- one simulation step ----------
export function step(world, P, W, H) {
  const { pts, sticks } = world;
  world.t += DT;
  const damp = 1 - P.damping / 100;
  const gy = P.gravity * DT * DT;

  // 1) Verlet integration: new = x + (x − x_prev)·damping + a·dt². No velocity variable anywhere.
  for (const p of pts) {
    p.hit = false;
    if (!p.w) { p.px = p.x; p.py = p.y; continue; }
    const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
    p.px = p.x; p.py = p.y;
    // Wind gusts vary in time and along the cloth, so it ripples instead of sliding as one sheet.
    const gx = P.wind && P.scene === 'cloth' ? 380 * (0.55 + 0.45 * Math.sin(world.t * 1.7 + p.y * 0.015 + p.x * 0.004)) * DT * DT : 0;
    p.x += vx + gx;
    p.y += vy + gy;
  }
  const held = world.held;
  if (held) { held.p.x = held.x; held.p.y = held.y; }

  // Collision pairs between different bodies, found once per step with a spatial hash.
  const pairs = findPairs(pts);

  // 2) Relaxation: fix every stick, then every collision, and repeat. More iterations → stiffer.
  for (let it = 0; it < P.iterations; it++) {
    for (const s of sticks) solveStick(s);
    for (let i = 0; i < pairs.length; i += 2) solvePair(pairs[i], pairs[i + 1]);
    for (const p of pts) if (p.w) collideWorld(p, world, W, H);
  }

  // 3) Friction: points touching something lose part of their velocity.
  for (const p of pts) if (p.hit && p.w) { p.px += (p.x - p.px) * 0.12; p.py += (p.y - p.py) * 0.12; }

  // 4) Tearing: a stick stretched far past its rest length snaps.
  if (P.tear) world.sticks = sticks.filter(s => !s.tear || Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) < s.len * 2.6);
}

function solveStick(s) {
  const a = s.a, b = s.b, wsum = a.w + b.w;
  if (!wsum) return;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
  if (s.min && d >= s.len) return; // joint limit: only stops points getting too close
  // Move both ends along the stick, split by inverse mass, so the length becomes `len` again.
  const diff = ((d - s.len) / (d * wsum)) * s.k;
  a.x += dx * diff * a.w; a.y += dy * diff * a.w;
  b.x -= dx * diff * b.w; b.y -= dy * diff * b.w;
}

function findPairs(pts) {
  const cell = 40, grid = new Map(), out = [];
  for (const p of pts) {
    if (!p.r) continue;
    const k = ((p.x / cell) | 0) * 73856093 ^ ((p.y / cell) | 0) * 19349663;
    (grid.get(k) || grid.set(k, []).get(k)).push(p);
  }
  for (const p of pts) {
    if (!p.r) continue;
    const cx = (p.x / cell) | 0, cy = (p.y / cell) | 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const list = grid.get((cx + ox) * 73856093 ^ (cy + oy) * 19349663);
      if (list) for (const q of list) {
        if (q === p || q.body === p.body || q.x < p.x || (q.x === p.x && q.y <= p.y)) continue; // each pair once
        const rr = p.r + q.r;
        if (Math.abs(q.x - p.x) < rr && Math.abs(q.y - p.y) < rr) out.push(p, q);
      }
    }
  }
  return out;
}

function solvePair(a, b) {
  const wsum = a.w + b.w;
  if (!wsum) return;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
  if (d >= min || d === 0) return;
  const c = (d - min) / (d * wsum);
  a.x += dx * c * a.w; a.y += dy * c * a.w;
  b.x -= dx * c * b.w; b.y -= dy * c * b.w;
  a.hit = b.hit = true;
}

// Walls, floor, round pegs and slopes: if a point is inside, put it back on the surface.
function collideWorld(p, world, W, H) {
  const r = p.r || 1;
  if (p.y > H - r) { p.y = H - r; p.hit = true; }
  if (p.x < r) { p.x = r; p.hit = true; } else if (p.x > W - r) { p.x = W - r; p.hit = true; }
  if (p.y < -H) p.y = -H;
  for (const c of world.circles) {
    const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy), m = c.r + r;
    if (d < m && d > 0) { p.x = c.x + (dx / d) * m; p.y = c.y + (dy / d) * m; p.hit = true; }
  }
  for (const s of world.segs) {
    const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
    const t = clamp(((p.x - s.x1) * ex + (p.y - s.y1) * ey) / (ex * ex + ey * ey), 0, 1);
    const qx = s.x1 + ex * t, qy = s.y1 + ey * t, dx = p.x - qx, dy = p.y - qy, d = Math.hypot(dx, dy), m = s.hw + r;
    if (d < m && d > 0) { p.x = qx + (dx / d) * m; p.y = qy + (dy / d) * m; p.hit = true; }
  }
}

// Remove every stick the pointer's path crossed this frame.
function cut(world, x1, y1, x2, y2) {
  const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const before = world.sticks.length;
  world.sticks = world.sticks.filter(s => {
    if (s.style === 'hidden' && !s.tear) return true; // only cut what you can see (and cloth)
    const { a, b } = s;
    const d1 = cross(x1, y1, x2, y2, a.x, a.y), d2 = cross(x1, y1, x2, y2, b.x, b.y);
    const d3 = cross(a.x, a.y, b.x, b.y, x1, y1), d4 = cross(a.x, a.y, b.x, b.y, x2, y2);
    return !(d1 * d2 < 0 && d3 * d4 < 0);
  });
  return before - world.sticks.length;
}

// ---------- builders ----------
function rope(world, x0, y0, x1, y1, n, { r = 0, pinStart = true, pinEnd = false, style = 'rope', hue = 30, slack = 1 } = {}) {
  const body = world.nextBody++, list = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    list.push(point(world, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, { r, body, pinned: (i === 0 && pinStart) || (i === n && pinEnd) }));
  }
  for (let i = 0; i < n; i++) stick(world, list[i], list[i + 1], { style, hue, lenScale: slack });
  return list;
}

// A ring of points around a centre point. `spokeK` near 0 = jelly, 1 = wheel.
function ring(world, cx, cy, R, n, { spokeK = 1, shapeK = 0.15, hue = 150, r = 6 } = {}) {
  const body = world.nextBody++, c = point(world, cx, cy, { body, r: 0 }), list = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    list.push(point(world, cx + Math.cos(a) * R, cy + Math.sin(a) * R, { r, body }));
  }
  for (let i = 0; i < n; i++) {
    stick(world, list[i], list[(i + 1) % n], { style: 'body', hue });
    stick(world, list[i], list[(i + 2) % n], { k: shapeK });
    stick(world, c, list[i], { k: spokeK, style: spokeK === 1 ? 'spoke' : 'hidden', hue });
  }
  world.shapes.push({ pts: list, hue, centre: c });
  return list;
}

// A soft square: an n×n grid of points with edges, plus diagonals of stiffness k that hold the shape.
function box(world, cx, cy, size, n, k, hue, r = 6) {
  const body = world.nextBody++, sp = size / (n - 1), g = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.push(point(world, cx - size / 2 + i * sp, cy - size / 2 + j * sp, { r, body }));
  const at = (i, j) => g[j * n + i];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const edgeH = j === 0 || j === n - 1, edgeV = i === 0 || i === n - 1;
    if (i < n - 1) stick(world, at(i, j), at(i + 1, j), { style: edgeH ? 'body' : 'hidden', hue });
    if (j < n - 1) stick(world, at(i, j), at(i, j + 1), { style: edgeV ? 'body' : 'hidden', hue });
    if (i < n - 1 && j < n - 1) {
      stick(world, at(i, j), at(i + 1, j + 1), { k });
      stick(world, at(i + 1, j), at(i, j + 1), { k });
    }
  }
  const outline = [];
  for (let i = 0; i < n; i++) outline.push(at(i, 0));
  for (let j = 1; j < n; j++) outline.push(at(n - 1, j));
  for (let i = n - 2; i >= 0; i--) outline.push(at(i, n - 1));
  for (let j = n - 2; j > 0; j--) outline.push(at(0, j));
  world.shapes.push({ pts: outline, hue });
}

// A stick figure: rigid bones plus "min" sticks that work as joint limits (knees and the neck can't fold flat).
function ragdoll(world, x, y, s, hue) {
  const body = world.nextBody++;
  const P = (dx, dy, r = 5) => point(world, x + dx * s, y + dy * s, { body, r: r * s });
  const head = P(0, -62, 11), neck = P(0, -44), hip = P(0, 0, 6);
  const le = P(-16, -26), lh = P(-24, -8), re = P(16, -26), rh = P(24, -8);
  const lk = P(-8, 24), lf = P(-10, 48), rk = P(8, 24), rf = P(10, 48);
  const bone = (a, b) => stick(world, a, b, { style: 'limb', hue });
  bone(head, neck); bone(neck, hip);
  bone(neck, le); bone(le, lh); bone(neck, re); bone(re, rh);
  bone(hip, lk); bone(lk, lf); bone(hip, rk); bone(rk, rf);
  const limit = (a, b, f) => stick(world, a, b, { min: true, lenScale: f });
  limit(head, hip, 0.92); limit(hip, lf, 0.55); limit(hip, rf, 0.55); limit(neck, lk, 0.7); limit(neck, rk, 0.7);
  limit(neck, lh, 0.45); limit(neck, rh, 0.45); limit(lk, rk, 0.4); limit(lf, rf, 0.3);
  world.heads.push({ p: head, hue });
}

const SCENES = {
  cloth(world, W, H) {
    const sp = clamp(Math.round(Math.min(W / 52, H / 30)), 7, 15);
    const cols = Math.min(64, Math.floor((W * 0.84) / sp)), rows = Math.min(40, Math.floor((H * 0.62) / sp));
    const x0 = (W - (cols - 1) * sp) / 2, y0 = Math.max(W < 600 ? 52 : 34, H * 0.08), g = []; // below the HUD text
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
      g.push(point(world, x0 + i * sp, y0 + j * sp, { pinned: j === 0 && (i % 6 === 0 || i === cols - 1) }));
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (i < cols - 1) stick(world, g[j * cols + i], g[j * cols + i + 1], { style: 'cloth', tear: true });
      if (j < rows - 1) stick(world, g[j * cols + i], g[(j + 1) * cols + i], { style: 'cloth', tear: true });
    }
  },
  rope(world, W, H) {
    const s = clamp(Math.min(W / 800, H / 460), 0.55, 1.3), seg = 10 * s, r = 5 * s;
    // A long rope released from the side, so it swings and whips.
    const L1 = H * 0.55, n1 = Math.round(L1 / seg);
    rope(world, W * 0.1, 40, W * 0.1 + L1 * 0.8, 40 + L1 * 0.6, n1, { r, hue: 30 });
    // A heavy ball (inverse mass 0.05 → 20× heavier) on a chain, held out horizontally.
    const L2 = H * 0.42, n2 = Math.round(L2 / seg);
    const chain = rope(world, W * 0.32, 40, W * 0.32 + L2, 40, n2, { r, hue: 210 });
    const ball = chain[n2];
    ball.w0 = ball.w = 0.05; ball.r = 18 * s; world.balls.push(ball);
    // A rope bridge pinned at both ends, 15% longer than the gap so it sags.
    const bx0 = W * 0.48, bx1 = W * 0.94, by = H * 0.52, nb = Math.max(8, Math.round((bx1 - bx0) / (12 * s)));
    rope(world, bx0, by, bx1, by, nb, { r: 6 * s, pinEnd: true, style: 'plank', hue: 30, slack: 1.15 });
    // Something to drop on it.
    ring(world, W * 0.7, by - 90 * s, 26 * s, 14, { spokeK: 0.05, hue: 150, r: 5 * s });
    world.circles.push({ x: W * 0.62, y: H * 0.86, r: 18 * s });
  },
  ragdoll(world, W, H) {
    const s = clamp(Math.min(W / 800, H / 460), 0.55, 1.25);
    world.segs.push({ x1: W * 0.02, y1: H * 0.42, x2: W * 0.4, y2: H * 0.62, hw: 4 });
    for (let i = 0; i < 5; i++) world.circles.push({ x: W * (0.52 + i * 0.09), y: H * (0.5 + (i % 2) * 0.12), r: 9 * s });
    [[0.12, -0.05, 200], [0.6, -0.15, 20], [0.82, 0.02, 280], [0.42, -0.35, 120]].forEach(([fx, fy, hue]) =>
      ragdoll(world, W * fx, H * fy + 70 * s, s, hue));
  },
  soft(world, W, H) {
    const s = clamp(Math.min(W / 800, H / 460), 0.55, 1.25);
    world.segs.push({ x1: W * 0.03, y1: H * 0.36, x2: W * 0.46, y2: H * 0.56, hw: 4 });
    world.segs.push({ x1: W * 0.97, y1: H * 0.6, x2: W * 0.56, y2: H * 0.78, hw: 4 });
    world.circles.push({ x: W * 0.5, y: H * 0.42, r: 14 * s }, { x: W * 0.22, y: H * 0.8, r: 20 * s });
    ring(world, W * 0.12, H * 0.08, 32 * s, 18, { spokeK: 0.03, hue: 150, r: 6 * s });
    ring(world, W * 0.3, H * 0.02, 28 * s, 14, { spokeK: 1, shapeK: 1, hue: 210, r: 6 * s });
    box(world, W * 0.62, H * 0.1, 56 * s, 4, 0.05, 30, 6 * s);
    box(world, W * 0.84, H * 0.06, 46 * s, 3, 1, 280, 6 * s);
  },
};
// "+" button: drop one more thing into the current scene.
const SPAWN = {
  ragdoll: (world, W, H) => ragdoll(world, W * (0.15 + Math.random() * 0.7), -30, clamp(Math.min(W / 800, H / 460), 0.55, 1.25), Math.random() * 360),
  soft(world, W, H) {
    const s = clamp(Math.min(W / 800, H / 460), 0.55, 1.25), x = W * (0.15 + Math.random() * 0.7), hue = Math.random() * 360, kind = Math.random();
    if (kind < 0.4) ring(world, x, -40, (24 + Math.random() * 14) * s, 16, { spokeK: 0.03, hue, r: 6 * s });
    else if (kind < 0.6) ring(world, x, -40, 24 * s, 12, { spokeK: 1, shapeK: 1, hue, r: 6 * s });
    else box(world, x, -40, 48 * s, 4, Math.random() < 0.5 ? 0.04 : 1, hue, 6 * s);
  },
  rope: (world, W, H) => ring(world, W * (0.5 + Math.random() * 0.4), -40, 22, 12, { spokeK: Math.random() < 0.5 ? 0.05 : 1, hue: Math.random() * 360, r: 5 }),
};

// ---------- UI ----------
export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const wrap = h('div', { style: 'position:relative;flex:1;min-height:280px;overflow:hidden' });
  const canvas = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;touch-action:none' });
  const hud = h('div', { style: 'position:absolute;top:8px;left:12px;right:12px;font-size:.8rem;color:var(--muted);pointer-events:none;font-variant-numeric:tabular-nums' });
  wrap.append(canvas, hud);

  const P = { scene: 'cloth', tool: 'drag', iterations: 12, gravity: 980, damping: 1, wind: false, tear: true };
  const slider = (label, key, min, max, step, fmt = v => v) => {
    const out = h('output', { style: 'min-width:3.4em;font-variant-numeric:tabular-nums;color:var(--fg)' });
    const input = h('input', { type: 'range', min, max, step, value: P[key], style: 'width:96px' });
    input.oninput = () => { P[key] = +input.value; out.textContent = fmt(P[key]); };
    out.textContent = fmt(P[key]);
    return h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, label, input, out);
  };
  const seg = (items, onPick) => {
    const box = h('div', { className: 'seg' });
    const btns = items.map(([k, t]) => h('button', { textContent: t, onclick: () => onPick(k) }));
    box.append(...btns);
    return { box, set: k => btns.forEach((b, i) => b.setAttribute('aria-selected', String(items[i][0] === k))) };
  };
  const check = (label, on, onchange) => {
    const c = h('input', { type: 'checkbox', checked: on, onchange });
    return [c, h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, c, label)];
  };

  const sceneSeg = seg([['cloth', 'Даавуу 🧣'], ['rope', 'Олс 🪢'], ['ragdoll', 'Ragdoll 🤸'], ['soft', 'Зөөлөн бие 🟢']], k => { P.scene = k; sceneSeg.set(k); build(); });
  const toolSeg = seg([['drag', 'Чирэх ✋'], ['cut', 'Хайчлах ✂️'], ['pin', 'Хадах 📌']], k => { P.tool = k; toolSeg.set(k); canvas.style.cursor = k === 'cut' ? 'crosshair' : k === 'pin' ? 'cell' : 'grab'; });
  const play = h('button', { className: 'btn', style: 'min-width:120px;justify-content:center', onclick: () => { paused = !paused; sync(); } });
  const stepBtn = h('button', { className: 'btn', textContent: '⏭ Алхам', title: 'Нэг алхам (1/60 секунд)', onclick: () => { step(world, P, W, H); steps++; } });
  const addBtn = h('button', { className: 'btn', textContent: '＋ Нэмэх', onclick: () => SPAWN[P.scene]?.(world, W, H) });
  const [windBox, windLabel] = check('Салхи 🌬️', P.wind, () => { P.wind = windBox.checked; });
  const [tearBox, tearLabel] = check('Тасрах', P.tear, () => { P.tear = tearBox.checked; });
  const [stressBox, stressLabel] = check('Суналтыг өнгөөр', false);
  const [structBox, structLabel] = check('Бүтэц (цэг, далд stick)', false);
  const [velBox, velLabel] = check('Хурд = x − x_prev', false);
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center' }, ...kids);
  const controls = h('div', { style: 'display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-top:1px solid var(--line)' },
    row(play, stepBtn, h('button', { className: 'btn', textContent: '↺ Шинээр', onclick: () => build() }), sceneSeg.box),
    row(slider('Iterations', 'iterations', 1, 40, 1), slider('Таталцал', 'gravity', 0, 2000, 20), slider('Агаарын эсэргүүцэл', 'damping', 0, 5, 0.1, v => `${v.toFixed(1)}%`)),
    row(h('span', { textContent: 'Хулгана:', style: 'font-size:.85rem;color:var(--muted)' }), toolSeg.box, addBtn, windLabel, tearLabel),
    row(stressLabel, structLabel, velLabel));
  root.append(wrap, controls);

  const ctx = canvas.getContext('2d');
  let world = newWorld(), W = 1, H = 1, paused = false, raf = 0, last = performance.now(), acc = 0, steps = 0;
  let pointer = null, cutting = null, cutCount = 0;

  function build() {
    world = newWorld(); steps = 0; cutCount = 0;
    SCENES[P.scene](world, W, H);
    addBtn.style.display = SPAWN[P.scene] ? '' : 'none';
    windLabel.style.display = tearLabel.style.display = P.scene === 'cloth' ? '' : 'none';
  }
  function sync() { play.textContent = paused ? '▶ Үргэлжлүүлэх' : '❚❚ Зогсоох'; stepBtn.disabled = !paused; }

  function resize() {
    const r = wrap.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    const tiny = W < 50;
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (tiny && W >= 50) build();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const nearest = (x, y, maxD) => {
    let best = null, bd = maxD * maxD;
    for (const p of world.pts) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  };
  canvas.addEventListener('pointerdown', e => {
    pointer = pos(e);
    canvas.setPointerCapture(e.pointerId);
    if (P.tool === 'drag') {
      const p = nearest(pointer.x, pointer.y, 40);
      if (p) { world.held = { p, x: pointer.x, y: pointer.y }; refreshW(world, p); canvas.style.cursor = 'grabbing'; }
    } else if (P.tool === 'cut') cutting = { ...pointer };
    else {
      const p = nearest(pointer.x, pointer.y, 30);
      if (p) { p.pinned = !p.pinned; refreshW(world, p); p.px = p.x; p.py = p.y; }
    }
  });
  canvas.addEventListener('pointermove', e => {
    pointer = pos(e);
    if (world.held) { world.held.x = pointer.x; world.held.y = pointer.y; if (paused) { world.held.p.x = pointer.x; world.held.p.y = pointer.y; } }
    if (cutting) { cutCount += cut(world, cutting.x, cutting.y, pointer.x, pointer.y); cutting = { ...pointer }; }
  });
  const release = () => {
    if (world.held) { const p = world.held.p; world.held = null; refreshW(world, p); }
    cutting = null;
    if (P.tool === 'drag') canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { if (!world.held) pointer = null; });

  // ---------- drawing ----------
  const STYLE = { cloth: 1.2, rope: 3, plank: 6, limb: 6, body: 2.5, spoke: 1.5, hidden: 1 };
  function draw() {
    const css = getComputedStyle(root), fg = css.getPropertyValue('--fg').trim() || '#000', muted = css.getPropertyValue('--muted').trim() || '#888';
    const accent = css.getPropertyValue('--accent').trim() || '#2563eb';
    ctx.clearRect(0, 0, W, H);

    // Static obstacles.
    ctx.fillStyle = muted; ctx.strokeStyle = muted; ctx.lineCap = 'round'; ctx.globalAlpha = 0.45;
    for (const c of world.circles) { ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 2 * Math.PI); ctx.fill(); }
    for (const s of world.segs) { ctx.lineWidth = s.hw * 2; ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // Soft-body fills.
    for (const sh of world.shapes) {
      ctx.beginPath();
      sh.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = `hsl(${sh.hue} 70% 55% / .28)`; ctx.fill();
    }

    // Sticks, batched into one path per colour so a 2000-stick cloth stays cheap to draw.
    const stress = stressBox.checked, showHidden = structBox.checked, batches = new Map();
    let sum = 0, cnt = 0;
    for (const s of world.sticks) {
      const d = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), e = d / s.len - 1;
      if (!s.min && s.k === 1) { sum += Math.max(0, e); cnt++; }
      if (s.style === 'hidden' && !showHidden) continue;
      if (s.min && !showHidden) continue;
      let col;
      if (stress && !s.min) { const b = clamp(Math.floor(Math.abs(e) / 0.02), 0, 7); col = `hsl(${140 - b * 20} 80% 50%)`; }
      else if (s.style === 'hidden') col = s.min ? '#ef4444' : muted;
      else if (s.style === 'cloth') col = accent;
      else if (s.style === 'limb') col = `hsl(${s.hue} 55% 50%)`;
      else if (s.style === 'rope' || s.style === 'plank') col = `hsl(${s.hue} 45% 42%)`;
      else col = `hsl(${s.hue} 65% 45%)`;
      const key = `${col}|${s.style}|${s.min ? 1 : 0}`;
      (batches.get(key) || batches.set(key, []).get(key)).push(s);
    }
    for (const [key, list] of batches) {
      const [col, style, min] = key.split('|');
      ctx.strokeStyle = col; ctx.lineWidth = STYLE[style];
      ctx.globalAlpha = style === 'hidden' ? 0.55 : 1;
      ctx.setLineDash(min === '1' ? [3, 4] : []);
      ctx.beginPath();
      for (const s of list) { ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); }
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    for (const { p, hue } of world.heads) { ctx.fillStyle = `hsl(${hue} 55% 50%)`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 2 * Math.PI); ctx.fill(); }
    for (const b of world.balls) {
      const g = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, 1, b.x, b.y, b.r);
      g.addColorStop(0, '#9ca3af'); g.addColorStop(1, '#374151');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 2 * Math.PI); ctx.fill();
    }

    if (showHidden) {
      ctx.fillStyle = fg; ctx.globalAlpha = 0.6;
      for (const p of world.pts) { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, p.r * 0.35), 0, 2 * Math.PI); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // Velocity is not stored anywhere: it is the gap between where a point is and where it was.
    if (velBox.checked) {
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.beginPath();
      const every = world.pts.length > 400 ? 3 : 1;
      world.pts.forEach((p, i) => {
        if (i % every || !p.w) return;
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + (p.x - p.px) * 6, p.y + (p.y - p.py) * 6);
      });
      ctx.stroke();
    }

    // Pins.
    ctx.fillStyle = '#ef4444';
    for (const p of world.pts) if (p.pinned) ctx.fillRect(p.x - 3.5, p.y - 3.5, 7, 7);
    if (world.held) {
      const p = world.held.p;
      ctx.strokeStyle = fg; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 2 * Math.PI); ctx.stroke();
    } else if (pointer && P.tool !== 'cut') {
      const p = nearest(pointer.x, pointer.y, P.tool === 'drag' ? 40 : 30);
      if (p) { ctx.strokeStyle = fg; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 2 * Math.PI); ctx.stroke(); ctx.globalAlpha = 1; }
    }

    const hint = { drag: 'Цэгийг барьж чир', cut: 'Зурж хайчил', pin: 'Цэг дээр дарж хад / сулла' }[P.tool];
    hud.textContent = `${world.pts.length} цэг · ${world.sticks.length} stick · дундаж сунал ${(cnt ? (100 * sum) / cnt : 0).toFixed(1)}%`
      + `${cutCount ? ` · ✂️ ${cutCount}` : ''}${paused ? ` · ❚❚ алхам ${steps}` : ''} · ${hint}`;
  }

  function frame(now) {
    // Not on screen (hidden pane, closed dialog, scrolled away): skip the work until it is visible again.
    if (root.closest('[data-offscreen]')) { last = now; raf = requestAnimationFrame(frame); return; }
    // Fixed 1/60 s steps, whatever the display's refresh rate: the physics stays the same on every screen.
    acc = Math.min(acc + (now - last) / 1000, DT * 3);
    last = now;
    if (!paused) while (acc >= DT) { step(world, P, W, H); steps++; acc -= DT; }
    else acc = 0;
    draw();
    raf = requestAnimationFrame(frame);
  }

  sceneSeg.set(P.scene); toolSeg.set(P.tool); canvas.style.cursor = 'grab'; sync(); resize();
  raf = requestAnimationFrame(frame);
  // Stop animating once the demo is removed from the page.
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
