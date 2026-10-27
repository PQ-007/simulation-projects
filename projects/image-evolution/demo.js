// Genetic algorithm: a population of "pictures made of triangles" evolves toward a target image.
// Each picture's DNA is a list of triangles; fitness = how close its pixels are to the target.

// ---- genome ----
// One triangle = 10 numbers: x1 y1 x2 y2 x3 y3 (0..1 of the image), r g b (0..255), alpha (0..1).
export const GENE = 10;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampC = v => (v < 0 ? 0 : v > 255 ? 255 : v);
// Normal random number (Box–Muller), for small mutation nudges.
const gauss = rand => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

// New triangles start small, around a random point, so they can find a place to fit.
export function randomTriangle(g, o, rand) {
  const cx = rand(), cy = rand(), s = 0.06 + rand() * 0.14;
  for (let k = 0; k < 3; k++) {
    g[o + 2 * k] = clamp01(cx + (rand() * 2 - 1) * s);
    g[o + 2 * k + 1] = clamp01(cy + (rand() * 2 - 1) * s);
  }
  g[o + 6] = rand() * 255; g[o + 7] = rand() * 255; g[o + 8] = rand() * 255;
  g[o + 9] = 0.15 + rand() * 0.45;
}

export function randomGenome(n, rand) {
  const g = new Float32Array(n * GENE);
  for (let t = 0; t < n; t++) randomTriangle(g, t * GENE, rand);
  return g;
}

// ---- drawing and fitness ----
// Paint the triangles in order onto a W×H RGB buffer (each one see-through by its alpha), like a painter
// layering glass. A pixel is covered when its centre is inside the triangle (same sign for all 3 edges).
export function render(g, n, W, H, bg, out) {
  for (let i = 0; i < W * H; i++) { out[3 * i] = bg[0]; out[3 * i + 1] = bg[1]; out[3 * i + 2] = bg[2]; }
  for (let t = 0; t < n; t++) {
    const o = t * GENE;
    const x0 = g[o] * W, y0 = g[o + 1] * H, x1 = g[o + 2] * W, y1 = g[o + 3] * H, x2 = g[o + 4] * W, y2 = g[o + 5] * H;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area > -1e-6 && area < 1e-6) continue;
    const s = area > 0 ? 1 : -1;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    const a = g[o + 9], r = g[o + 6] * a, gr = g[o + 7] * a, b = g[o + 8] * a, keep = 1 - a;
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        if (s * ((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0)) < 0) continue;
        if (s * ((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)) < 0) continue;
        if (s * ((x0 - x2) * (py - y2) - (y0 - y2) * (px - x2)) < 0) continue;
        const i = 3 * (y * W + x);
        out[i] = out[i] * keep + r; out[i + 1] = out[i + 1] * keep + gr; out[i + 2] = out[i + 2] * keep + b;
      }
    }
  }
  return out;
}

// Sum of squared colour differences, pixel by pixel. Smaller = closer to the target.
export function error(img, target) {
  let e = 0;
  for (let i = 0; i < target.length; i++) { const d = img[i] - target[i]; e += d * d; }
  return e;
}
// Shown to people as a percentage: 100% = identical. (1 − average colour difference / 255.)
export const similarity = (err, len) => 1 - Math.sqrt(err / len) / 255;

// ---- the genetic algorithm ----
export class GA {
  constructor(target, W, H, { n = 100, size = 40, rate = 0.015, crossover = true, elite = 2, islands = 1, migrate = 50, rand = Math.random } = {}) {
    Object.assign(this, { target, W, H, n, size, rate, crossover, elite, islands, migrate, rand, gen: 0, evals: 0 });
    // Background = the target's average colour, so triangles only have to paint the differences.
    this.bg = [0, 1, 2].map(c => { let s = 0; for (let i = c; i < target.length; i += 3) s += target[i]; return s / (W * H); });
    this.buf = new Float32Array(W * H * 3);
    this.pop = Array.from({ length: size }, (_, i) => Object.assign(this.evaluate(randomGenome(n, rand)), { isl: i % islands }));
    this.sort();
  }
  // Split the population into k islands (members dealt out in turn, so each island gets good and bad ones).
  setIslands(k) { this.islands = k; this.pop.forEach((p, i) => { p.isl = i % k; }); }
  evaluate(g) { this.evals++; return { g, err: error(render(g, this.n, this.W, this.H, this.bg, this.buf), this.target) }; }
  sort() { this.pop.sort((a, b) => a.err - b.err); }
  fitness(ind) { return similarity(ind.err, this.target.length); }
  // Tournament: pick k at random, the best of them becomes a parent. Good ones win more often, but not always.
  tournament(k = 3, picks = null, group = this.pop) {
    let best = null;
    for (let i = 0; i < k; i++) {
      const c = group[(this.rand() * group.length) | 0];
      if (picks) picks.push(c);
      if (!best || c.err < best.err) best = c;
    }
    return best;
  }
  // Child = each triangle copied from parent A or B (coin flip), then a few triangles mutated.
  // `origin` / `mutated` record what happened, for the "inside one generation" view.
  breed(A, B) {
    const { n, rand } = this, g = new Float32Array(n * GENE), origin = new Uint8Array(n), mutated = new Uint8Array(n);
    for (let t = 0; t < n; t++) {
      const fromB = this.crossover && rand() < 0.5;
      origin[t] = fromB ? 1 : 0;
      g.set((fromB ? B : A).g.subarray(t * GENE, t * GENE + GENE), t * GENE);
      if (rand() < this.rate) { mutated[t] = 1; this.mutate(g, t * GENE); }
    }
    return { child: this.evaluate(g), origin, mutated };
  }
  mutate(g, o) {
    const r = this.rand(), rand = this.rand;
    if (r < 0.1) randomTriangle(g, o, rand);                                 // a brand-new triangle
    else if (r < 0.55) {                                                     // move one corner
      const k = 2 * ((rand() * 3) | 0);
      g[o + k] = clamp01(g[o + k] + gauss(rand) * 0.1); g[o + k + 1] = clamp01(g[o + k + 1] + gauss(rand) * 0.1);
    } else if (r < 0.9) {                                                    // shift the colour
      for (let c = 6; c < 9; c++) g[o + c] = clampC(g[o + c] + gauss(rand) * 30);
    } else g[o + 9] = Math.min(0.95, Math.max(0.05, g[o + 9] + gauss(rand) * 0.15));   // more / less see-through
  }
  // One generation: keep the best few as they are (elitism), fill the rest with children.
  // With islands, each island does this on its own; parents never come from two islands.
  step() {
    const k = this.islands, next = [];
    for (let i = 0; i < k; i++) {
      const group = k > 1 ? this.pop.filter(p => p.isl === i) : this.pop;   // already sorted, best first
      if (!group.length) continue;
      const quota = Math.round(this.size * (i + 1) / k) - Math.round(this.size * i / k);
      const keep = group.slice(0, Math.min(quota, Math.max(1, Math.round(this.elite / k))));
      next.push(...keep);
      for (let c = keep.length; c < quota; c++) {
        const A = this.tournament(3, null, group), B = this.tournament(3, null, group);
        next.push(Object.assign(this.breed(A, B).child, { isl: i }));
      }
    }
    this.pop = next;
    this.sort();
    this.gen++;
    // Migration: now and then each island's best visits the next island, replacing that island's worst.
    if (k > 1 && this.gen % this.migrate === 0) {
      const bests = [], worst = [];
      this.pop.forEach((p, j) => { if (!bests[p.isl]) bests[p.isl] = p; worst[p.isl] = j; });
      for (let i = 0; i < k; i++) {
        const from = bests[i], to = (i + 1) % k;
        if (from && worst[to] !== undefined) this.pop[worst[to]] = { g: from.g, err: from.err, isl: to };
      }
      this.sort();
    }
  }
  get best() { return this.pop[0]; }
}

// Hill climbing = a "population" of one: change one triangle, keep the change only if the picture didn't get worse.
export class HillClimber extends GA {
  constructor(target, W, H, opts = {}) { super(target, W, H, { ...opts, size: 1 }); }
  step() {
    const g = this.best.g.slice();
    this.mutate(g, ((this.rand() * this.n) | 0) * GENE);
    const child = this.evaluate(g);
    if (child.err <= this.best.err) this.pop[0] = child;
    this.gen++;
  }
}

// Random search: a brand-new random picture every time; remember the best one ever seen.
export class RandomSearch extends GA {
  constructor(target, W, H, opts = {}) { super(target, W, H, { ...opts, size: 1 }); }
  step() {
    const child = this.evaluate(randomGenome(this.n, this.rand));
    if (child.err < this.best.err) this.pop[0] = child;
    this.gen++;
  }
}

// How different the population still is: for every pair, the share of triangles that are not identical,
// averaged. 0 = everyone is a copy of the same picture; near 1 = all different.
export function diversity(pop, n) {
  let s = 0, pairs = 0;
  for (let a = 0; a < pop.length; a++) for (let b = a + 1; b < pop.length; b++) {
    const A = pop[a].g, B = pop[b].g;
    let d = 0;
    for (let t = 0; t < n; t++) for (let k = t * GENE, e = k + GENE; k < e; k++) if (A[k] !== B[k]) { d++; break; }
    s += d / n; pairs++;
  }
  return pairs ? s / pairs : 0;
}

// Deterministic random numbers (for tests and the C++ comparison in the docs).
export function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ================================================================================================================
const mono = '"JetBrains Mono",ui-monospace,monospace';
const RES = 64;                                  // fitness is measured on a small copy (long side 64 px) — fast
const asset = name => new URL(name + new URL(import.meta.url).search, import.meta.url).href;
const pct = v => `${(v * 100).toFixed(1)}%`;

// A target painted in code: sunset over the sea.
function sunset() {
  const c = Object.assign(document.createElement('canvas'), { width: 320, height: 240 }), x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 160);
  sky.addColorStop(0, '#1e1b4b'); sky.addColorStop(0.55, '#c026d3'); sky.addColorStop(1, '#fb923c');
  x.fillStyle = sky; x.fillRect(0, 0, 320, 160);
  x.fillStyle = '#fde047'; x.beginPath(); x.arc(210, 150, 44, 0, Math.PI * 2); x.fill();
  const sea = x.createLinearGradient(0, 160, 0, 240);
  sea.addColorStop(0, '#9a3412'); sea.addColorStop(1, '#172554');
  x.fillStyle = sea; x.fillRect(0, 160, 320, 80);
  x.fillStyle = '#fde68a';
  for (let i = 0; i < 6; i++) x.fillRect(180 + i * 3, 168 + i * 12, 60 - i * 6, 4);
  x.fillStyle = '#0f172a';
  x.beginPath(); x.moveTo(0, 160); x.lineTo(0, 95); x.lineTo(60, 120); x.lineTo(110, 70); x.lineTo(170, 160); x.fill();
  return c;
}
const TARGETS = { 'CS лого': () => asset('cs-logo.jpg'), 'Mona Lisa': () => asset('mona-lisa.jpg'), 'Нар жаргах': sunset };

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const btn = (text, onclick, title = '') => h('button', { className: 'btn btn-sm', textContent: text, onclick, title });
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center' }, ...kids);
  const label = s => h('span', { textContent: s, style: 'font-size:.85rem;color:var(--muted)' });
  const caption = s => h('div', { textContent: s, style: 'font-size:.78rem;font-weight:600;color:var(--muted);margin-bottom:4px' });
  const seg = (items, onPick) => {
    const box = h('div', { className: 'seg', style: 'flex-wrap:wrap' });
    const bs = items.map(([k, t]) => h('button', { textContent: t, onclick: () => onPick(k) }));
    box.append(...bs);
    return { box, set: k => bs.forEach((b, i) => b.setAttribute('aria-selected', String(items[i][0] === k))) };
  };

  // Draw a genome with the browser's own canvas (same layering as render(), just at any size).
  const paint = (cv, g, n, bg, outline = false, mark = -1) => {
    const x = cv.getContext('2d'), w = cv.width, hh = cv.height;
    x.fillStyle = `rgb(${bg.map(Math.round)})`; x.fillRect(0, 0, w, hh);
    for (let t = 0; t < n; t++) {
      const o = t * GENE;
      x.beginPath(); x.moveTo(g[o] * w, g[o + 1] * hh); x.lineTo(g[o + 2] * w, g[o + 3] * hh); x.lineTo(g[o + 4] * w, g[o + 5] * hh); x.closePath();
      x.fillStyle = `rgba(${Math.round(g[o + 6])},${Math.round(g[o + 7])},${Math.round(g[o + 8])},${g[o + 9].toFixed(3)})`; x.fill();
    }
    const stroke = (t, color, width) => {
      const o = t * GENE;
      x.beginPath(); x.moveTo(g[o] * w, g[o + 1] * hh); x.lineTo(g[o + 2] * w, g[o + 3] * hh); x.lineTo(g[o + 4] * w, g[o + 5] * hh); x.closePath();
      x.strokeStyle = color; x.lineWidth = width; x.stroke();
    };
    if (outline) for (let t = 0; t < n; t++) stroke(t, 'rgba(255,255,255,.55)', Math.max(0.6, w / 500));
    if (mark >= 0) { stroke(mark, '#000', Math.max(3, w / 60)); stroke(mark, '#facc15', Math.max(1.5, w / 120)); }
  };
  // Canvases keep their shape and shrink to fit: big in full view, smaller in split view.
  const bigCanvas = () => h('canvas', { style: 'display:block;max-width:100%;max-height:max(220px,calc(100dvh - 520px));border-radius:10px;background:var(--code)' });
  const thumb = (W, H, size) => h('canvas', { width: Math.round(size * W / Math.max(W, H)), height: Math.round(size * H / Math.max(W, H)), style: 'display:block;border-radius:6px' });

  // ---------- state ----------
  let ga = null, W = 1, H = 1, targetImg = null, running = true, targetName = 'CS лого', nTri = 100;
  let hist = [], stride = 1, snaps = [], lastThumbs = 0, lastDrawnGen = -1, t0 = 0, elapsed = 0;
  const SNAP_AT = [0, 10, 50, 200, 1000, 3000, 10000];
  const params = { size: 40, rate: 0.015, crossover: true, islands: 1 };
  const ISLAND_COLORS = ['#3b82f6', '#f59e0b', '#ec4899', '#14b8a6'];
  let divNow = 0;

  // ---------- tab 1: evolution ----------
  const targetCv = bigCanvas(), bestCv = bigCanvas(), errCv = bigCanvas();
  const bestTitle = caption('Шилдэг');
  const chartBox = hh => h('canvas', { style: `width:100%;height:${hh}px;display:block;border:1px solid var(--line);border-radius:10px;background:var(--card)` });
  const chart = chartBox(150), divChart = chartBox(90);
  const errSmall = document.createElement('canvas'), errBuf = { img: null };
  const snapRow = h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px' });
  const stats = h('div', { style: `font:600 .88rem ${mono};line-height:1.75` });
  const popCaption = caption('');
  const popGrid = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(60px,1fr));gap:6px' });
  const play = h('button', { className: 'btn', style: 'min-width:120px;justify-content:center', onclick: () => { running = !running; sync(); } });
  const targetSeg = seg([...Object.keys(TARGETS), 'upload'].map(k => [k, k === 'upload' ? '⬆ Өөрийн зураг' : k]), k => k === 'upload' ? fileIn.click() : loadTarget(k));
  const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: () => {
    const f = fileIn.files[0]; if (!f) return;
    const url = URL.createObjectURL(f); targetName = 'upload'; loadTarget('upload', url);
  } });
  const triSeg = seg([[50, '50'], [100, '100'], [200, '200']], k => { nTri = k; restart(); });
  const slider = (min, max, step, value, fmt, onInput) => {
    const out = h('output', { style: `min-width:3.4em;font:600 .85rem ${mono};color:var(--fg)` });
    const input = h('input', { type: 'range', min, max, step, value, style: 'width:130px', oninput: () => { out.textContent = fmt(+input.value); onInput(+input.value); } });
    out.textContent = fmt(value);
    return h('label', { style: 'display:flex;gap:8px;align-items:center;font-size:.85rem;color:var(--muted)' }, input, out);
  };
  const crossIn = h('input', { type: 'checkbox', checked: true, onchange: () => { params.crossover = crossIn.checked; if (ga) ga.crossover = crossIn.checked; } });
  const outlineIn = h('input', { type: 'checkbox', onchange: () => drawBest(true) });
  const islandSeg = seg([[1, '1'], [4, '4']], k => { params.islands = k; islandSeg.set(k); if (ga) { ga.setIslands(k); ga.sort(); divNow = diversity(ga.pop, ga.n); drawThumbs(); } });
  const check = (input, text, title) => h('label', { style: 'display:flex;gap:6px;align-items:center;font-size:.85rem;color:var(--muted)', title }, input, text);

  const evoView = h('div', { style: 'display:flex;flex-wrap:wrap;gap:16px 24px;align-items:flex-start' },
    h('div', { style: 'flex:999 1 520px;min-width:0;display:flex;flex-direction:column;gap:12px' },
      // Target, best and its error map always side by side; they shrink in a narrow pane.
      h('div', { style: 'display:grid;grid-template-columns:repeat(3,minmax(0,max-content));gap:12px;justify-content:center' },
        h('div', { style: 'min-width:0' }, caption('Зорилго (target)'), targetCv), h('div', { style: 'min-width:0' }, bestTitle, bestCv),
        h('div', { style: 'min-width:0' }, caption('Алдаа хаана байна: гэрэлтэй = их зөрүү'), errCv)),
      h('div', {}, caption('Ижил төстэй байдал үе үеэр: ногоон = шилдэг, саарал = популяцын дундаж'), chart),
      h('div', {}, caption('Олон янз байдал: популяцын хоёр зураг дунджаар хэдэн хувь гурвалжнаараа ялгаатай вэ'), divChart),
      h('div', {}, caption('Шилдэг нь хэрхэн өөрчлөгдсөн бэ'), snapRow)),
    h('div', { style: 'flex:1 1 300px;display:flex;flex-direction:column;gap:12px' },
      row(play, btn('⏭ 1 үе', () => { running = false; sync(); ga.step(); record(); onStep(); }), btn('↺ Шинээр', () => restart())),
      h('div', { style: 'display:flex;flex-direction:column;gap:8px' },
        row(label('Зорилго:'), targetSeg.box, fileIn),
        row(label('Гурвалжин:'), triSeg.box),
        row(label('Популяц:'), slider(10, 100, 2, params.size, v => `${v}`, v => { params.size = v; if (ga) { ga.size = v; if (ga.pop.length > v) ga.pop.length = v; } })),
        row(label('Mutation:'), slider(0.002, 0.1, 0.002, params.rate, v => `${(v * 100).toFixed(1)}%`, v => { params.rate = v; if (ga) ga.rate = v; })),
        row(label('Арал (islands):'), islandSeg.box, h('span', { textContent: '4 = тусдаа 4 популяц, 50 үе тутамд шилдгээ солилцоно', style: 'font-size:.75rem;color:var(--muted)' })),
        row(check(crossIn, 'Crossover (хоёр эцэг эх)', 'Унтраавал хүүхэд зөвхөн нэг эцэг эхийн хуулбар + mutation'),
          check(outlineIn, 'Гурвалжнуудыг харуулах', 'Шилдэг зургийн гурвалжин бүрийн хүрээг зурна'))),
      stats,
      h('div', {}, popCaption, popGrid)));

  // ---------- tab 2: inside one generation ----------
  const anatomy = h('div', { style: 'display:flex;flex-direction:column;gap:16px' });

  const raceView = h('div', { style: 'display:flex;flex-direction:column;gap:14px' });
  const tabs = seg([['evo', '1. Хувьсал'], ['inside', '2. Нэг үе дотор'], ['race', '3. Уралдаан']], k => setTab(k));
  const body = h('div', { style: 'flex:1;min-height:0;overflow:auto;padding:12px 14px' });
  root.append(h('div', { style: 'padding:12px 14px 0' }, tabs.box), body);
  let tab = 'evo';
  function setTab(k) {
    tab = k; tabs.set(k);
    if (k === 'inside') { running = false; sync(); showAnatomy(); body.replaceChildren(anatomy); }
    else if (k === 'race') { running = false; sync(); if (!race || race.key !== raceKey()) newRace(); body.replaceChildren(raceView); drawRace(); }
    else { body.replaceChildren(evoView); drawBest(true); drawThumbs(); drawChart(); }
  }

  // ---------- target loading ----------
  async function loadTarget(name, url) {
    targetName = name; targetSeg.set(name);
    const src = name === 'upload' ? url : TARGETS[name]();
    let img = src;
    if (typeof src === 'string') {
      img = new Image();
      img.src = src;
      try { await img.decode(); } catch { stats.textContent = 'Зураг ачаалж чадсангүй.'; return; }
    }
    targetImg = img;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = RES / Math.max(iw, ih);
    W = Math.max(8, Math.round(iw * k)); H = Math.max(8, Math.round(ih * k));
    for (const cv of [targetCv, bestCv, errCv]) { const s = 480 / Math.max(W, H); cv.width = Math.round(W * s); cv.height = Math.round(H * s); }
    targetCv.getContext('2d').drawImage(img, 0, 0, targetCv.width, targetCv.height);
    restart();
  }
  function targetPixels() {
    const c = Object.assign(document.createElement('canvas'), { width: W, height: H }), x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high';
    x.drawImage(targetImg, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, t = new Float32Array(W * H * 3);
    for (let i = 0, j = 0; i < d.length; i += 4) { t[j++] = d[i]; t[j++] = d[i + 1]; t[j++] = d[i + 2]; }
    return t;
  }
  function restart() {
    if (!targetImg) return;
    triSeg.set(nTri);
    ga = new GA(targetPixels(), W, H, { n: nTri, ...params });
    hist = []; stride = 1; snaps = []; elapsed = 0; t0 = performance.now(); lastDrawnGen = -1;
    errSmall.width = W; errSmall.height = H; errBuf.img = new Float32Array(W * H * 3);
    divNow = diversity(ga.pop, ga.n);
    record(); onStep();
    if (tab === 'inside') showAnatomy();
    if (tab === 'race') { newRace(); drawRace(); }
  }

  // ---------- per-generation bookkeeping and drawing ----------
  const avgFit = () => ga.pop.reduce((s, p) => s + ga.fitness(p), 0) / ga.pop.length;
  function record() {
    // Comparing every pair is slower than a generation, so diversity is measured every 10th one.
    if (ga.gen % 10 === 0) divNow = diversity(ga.pop, ga.n);
    if (ga.gen % stride === 0) hist.push([ga.gen, ga.fitness(ga.best), avgFit(), divNow]);
    if (hist.length > 600) { hist = hist.filter((_, i) => i % 2 === 0); stride *= 2; }
    if (SNAP_AT.includes(ga.gen)) snaps.push({ gen: ga.gen, g: ga.best.g.slice(), fit: ga.fitness(ga.best) });
  }
  function onStep() {
    drawBest(); drawChart(); drawStats();
    if (performance.now() - lastThumbs > 400 || !running) { drawThumbs(); lastThumbs = performance.now(); }
  }
  function drawBest(force = false) {
    if (!ga || (!force && ga.gen === lastDrawnGen)) return;
    lastDrawnGen = ga.gen;
    paint(bestCv, ga.best.g, ga.n, ga.bg, outlineIn.checked);
    bestTitle.textContent = `Шилдэг · ${ga.gen}-р үе · ${pct(ga.fitness(ga.best))} ижил`;
    drawError();
  }
  // Error map: how far each pixel of the best picture is from the target (dark = right, bright = wrong).
  const HEAT = [[0, 0, 4], [87, 16, 110], [188, 55, 84], [249, 142, 9], [252, 255, 164]];
  function drawError() {
    const img = render(ga.best.g, ga.n, W, H, ga.bg, errBuf.img), t = ga.target;
    const x = errSmall.getContext('2d'), out = x.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const dr = img[3 * i] - t[3 * i], dg = img[3 * i + 1] - t[3 * i + 1], db = img[3 * i + 2] - t[3 * i + 2];
      const v = Math.min(1, Math.sqrt((dr * dr + dg * dg + db * db) / 3) / 255 * 3) * 4, k = Math.min(3, v | 0), f = v - k;
      for (let c = 0; c < 3; c++) out.data[4 * i + c] = HEAT[k][c] + (HEAT[k + 1][c] - HEAT[k][c]) * f;
      out.data[4 * i + 3] = 255;
    }
    x.putImageData(out, 0, 0);
    const big = errCv.getContext('2d');
    big.imageSmoothingEnabled = false;
    big.drawImage(errSmall, 0, 0, errCv.width, errCv.height);
  }
  function drawStats() {
    stats.replaceChildren(
      h('div', {}, `Үе (generation): ${ga.gen}`),
      h('div', { style: 'color:#16a34a' }, `Шилдэг: ${pct(ga.fitness(ga.best))} ижил`),
      h('div', { style: 'color:var(--muted)' }, `Дундаж: ${pct(avgFit())}`),
      h('div', { style: 'color:#8b5cf6;display:flex;align-items:center;gap:8px' }, `Олон янз байдал: ${Math.round(divNow * 100)}%`,
        h('span', { style: 'flex:0 0 90px;height:8px;border-radius:4px;background:var(--code);overflow:hidden' },
          h('span', { style: `display:block;height:100%;width:${Math.round(divNow * 100)}%;background:#8b5cf6` }))),
      h('div', { style: 'color:var(--muted);font-weight:500' }, `${ga.evals.toLocaleString('en-US')} зураг зурж шалгасан · ${(elapsed / 1000).toFixed(0)} сек`));
  }
  function drawThumbs() {
    if (!ga || tab !== 'evo') return;
    // With islands: grouped by island (one colour each); the first of each group is its elite.
    const isl = ga.islands > 1;
    const order = isl ? [...ga.pop].sort((a, b) => a.isl - b.isl || a.err - b.err) : ga.pop;
    const shown = order.slice(0, 48);
    popCaption.textContent = isl ? 'Популяц 4 арлаар — өнгө = арал, тод хүрээ = тэр арлын шилдэг (elite)' : 'Популяц (шилдгээс нь эхлээд) — шар хүрээ = elite, өөрчлөгдөхгүй дараагийн үе рүү орно';
    popGrid.replaceChildren(...shown.map((p, i) => {
      const c = thumb(W, H, 56);
      paint(c, p.g, ga.n, ga.bg);
      const lead = isl ? i === 0 || shown[i - 1].isl !== p.isl : i < ga.elite;
      c.style.outline = isl ? `${lead ? 3 : 1.5}px solid ${ISLAND_COLORS[p.isl]}` : lead ? '2px solid #facc15' : '1px solid var(--line)';
      return h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:2px', title: `#${i + 1}: ${pct(ga.fitness(p))}` }, c,
        h('span', { textContent: pct(ga.fitness(p)), style: `font:500 .62rem ${mono};color:var(--muted)` }));
    }), ...(ga.pop.length > shown.length ? [h('span', { textContent: `+${ga.pop.length - shown.length}`, style: 'align-self:center;font-size:.8rem;color:var(--muted)' })] : []));
    snapRow.replaceChildren(...snaps.map(s => {
      const c = thumb(W, H, 84);
      paint(c, s.g, ga.n, ga.bg);
      return h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:2px' }, c,
        h('span', { textContent: `${s.gen}-р үе · ${pct(s.fit)}`, style: `font:500 .7rem ${mono};color:var(--muted)` }));
    }));
  }
  // Line chart: series = [{ pts: [[x, y], …], color, width }], y from lo to hi, gridlines every `tick`.
  function lineChart(cv, series, { lo, hi, tick, xLabel }) {
    const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (!r.width) return;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const x = cv.getContext('2d'), w = r.width, hh = r.height;
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, hh);
    const all = series.flatMap(s => s.pts);
    if (all.length < 2) return;
    const css = getComputedStyle(root), muted = css.getPropertyValue('--muted').trim() || '#888', line = css.getPropertyValue('--line').trim() || '#ddd';
    const maxX = Math.max(10, ...all.map(p => p[0]));
    const X = v => 40 + (v / maxX) * (w - 52), Y = v => 10 + (1 - (v - lo) / (hi - lo)) * (hh - 34);
    x.font = `10px ${mono}`; x.fillStyle = muted; x.strokeStyle = line; x.lineWidth = 1;
    for (let v = lo; v <= hi + 1e-9; v += tick) { x.beginPath(); x.moveTo(40, Y(v)); x.lineTo(w - 12, Y(v)); x.stroke(); x.fillText(`${Math.round(v * 100)}%`, 4, Y(v) + 3); }
    x.fillText('0', 38, hh - 8); x.textAlign = 'right'; x.fillText(`${maxX.toLocaleString('en-US')} ${xLabel}`, w - 12, hh - 8); x.textAlign = 'left';
    for (const s of series) {
      if (s.pts.length < 2) continue;
      x.beginPath(); s.pts.forEach((p, i) => (i ? x.lineTo : x.moveTo).call(x, X(p[0]), Y(Math.max(lo, p[1]))));
      x.strokeStyle = s.color; x.lineWidth = s.width || 2; x.stroke();
    }
  }
  function drawChart() {
    if (hist.length < 2) return;
    const css = getComputedStyle(root), muted = css.getPropertyValue('--muted').trim() || '#888';
    const lo = Math.floor(Math.min(...hist.map(p => p[2])) * 20) / 20;
    lineChart(chart, [{ pts: hist.map(p => [p[0], p[2]]), color: muted, width: 1.5 }, { pts: hist.map(p => [p[0], p[1]]), color: '#16a34a', width: 2.5 }], { lo, hi: 1, tick: 0.05, xLabel: 'үе' });
    lineChart(divChart, [{ pts: hist.map(p => [p[0], p[3]]), color: '#8b5cf6', width: 2 }], { lo: 0, hi: 1, tick: 0.5, xLabel: 'үе' });
  }
  function sync() { play.textContent = running ? '❚❚ Зогсоох' : '▶ Үргэлжлүүлэх'; }

  // ---------- tab 2 content ----------
  function showAnatomy() {
    if (!ga) { anatomy.replaceChildren('Ачаалж байна…'); return; }
    const picksA = [], picksB = [];
    // With islands, both parents come from the same (random) island.
    const island = ga.islands > 1 ? (Math.random() * ga.islands) | 0 : -1;
    const group = island >= 0 ? ga.pop.filter(p => p.isl === island) : ga.pop;
    const A = ga.tournament(3, picksA, group), B = ga.tournament(3, picksB, group);
    const { child, origin, mutated } = ga.breed(A, B);
    const fA = ga.fitness(A), fB = ga.fitness(B), fC = ga.fitness(child);
    const imgs = [];
    const picture = (ind, size, title, color) => {
      const c = thumb(W, H, size); paint(c, ind.g, ga.n, ga.bg); imgs.push([c, ind]);
      if (color) c.style.outline = `3px solid ${color}`;
      return h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:4px' }, c,
        h('span', { textContent: title, style: `font:600 .75rem ${mono};color:${color || 'var(--muted)'}` }));
    };
    const mark = t => imgs.forEach(([c, ind]) => paint(c, ind.g, ga.n, ga.bg, false, t));
    // DNA strip: one chip per triangle in its own colour. The child's chips show where they came from.
    const chipW = ga.n > 100 ? 7 : 11;   // 50 chips per row
    const strip = (ind, kind) => h('div', { style: `display:flex;flex-wrap:wrap;gap:2px;max-width:${50 * (chipW + 2)}px` }, ...Array.from({ length: ga.n }, (_, t) => {
      const o = t * GENE, col = `rgb(${Math.round(ind.g[o + 6])},${Math.round(ind.g[o + 7])},${Math.round(ind.g[o + 8])})`;
      const from = kind === 'child' ? (origin[t] ? '#f59e0b' : '#3b82f6') : kind === 'A' ? '#3b82f6' : '#f59e0b';
      const mut = kind === 'child' && mutated[t];
      return h('span', {
        title: `Гурвалжин #${t + 1}${kind === 'child' ? (origin[t] ? ' — B-ээс' : ' — A-аас') : ''}${mut ? ' · MUTATION' : ''}`,
        style: `width:${chipW}px;height:22px;border-radius:3px;background:${col};border-top:4px solid ${from};cursor:crosshair;${mut ? 'outline:2px solid #ef4444;outline-offset:1px' : ''}`,
        onmouseenter: () => mark(t), onmouseleave: () => mark(-1),
      });
    }));
    const tour = (picks, winner, name, color) => h('div', { style: 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap' },
      h('b', { textContent: `${name}:`, style: `color:${color};min-width:5.5em;align-self:center` }),
      ...picks.map(p => picture(p, 72, `${pct(ga.fitness(p))}${p === winner ? ' ✓' : ''}`, p === winner ? color : null)));
    const step = (n, title, text, ...kids) => h('section', { style: 'border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;background:var(--card)' },
      h('div', { style: 'font-weight:800' }, h('span', { textContent: `${n}. `, style: 'color:var(--accent)' }, ), title),
      h('div', { textContent: text, style: 'font-size:.88rem;color:var(--muted);line-height:1.55' }), ...kids);
    const nMut = mutated.reduce((s, v) => s + v, 0), nB = origin.reduce((s, v) => s + v, 0);
    // How many triangles differ between the parents (a converged population is mostly one "family").
    let nDiff = 0;
    for (let t = 0; t < ga.n; t++) for (let k = 0; k < GENE; k++) if (A.g[t * GENE + k] !== B.g[t * GENE + k]) { nDiff++; break; }
    const verdict = fC > Math.max(fA, fB) ? ['Хүүхэд хоёр эцэг эхээсээ ИЛҮҮ! Дараагийн үед шалгарах магадлал өндөр.', '#16a34a']
      : fC >= Math.min(fA, fB) ? ['Хүүхэд эцэг эхийнхээ дунд. Популяцад үлдэж магадгүй.', 'var(--fg)']
      : ['Хүүхэд эцэг эхээсээ ДУТУУ. Ихэнх mutation ийм — дараагийн tournament-д ялагдаж арилна.', '#dc2626'];
    anatomy.replaceChildren(
      row(btn('🎲 Өөр хос сонгох', showAnatomy), btn('← Хувьсал руу буцах', () => setTab('evo')),
        h('span', { textContent: `${ga.gen}-р үе · популяц ${ga.pop.length} · нэг үе = ${ga.pop.length - ga.elite} удаа ийм хүүхэд гаргах (+${ga.elite} elite)`, style: 'font-size:.82rem;color:var(--muted)' })),
      step(1, `Сонголт (selection) — tournament${island >= 0 ? ` · ${island + 1}-р арал` : ''}`, (island >= 0 ? `Арлууд асаалттай: хоёр эцэг эх хоёулаа ${island + 1}-р арлаас. ` : '') + 'Популяцаас санамсаргүй 3 зураг аваад хамгийн сайныг нь эцэг эх болгоно. Сайн нь олон удаа ялах ч сул нь ч заримдаа шалгарна — олон янз байдал хадгалагдана.',
        tour(picksA, A, 'Эцэг эх A', '#3b82f6'), tour(picksB, B, 'Эцэг эх B', '#f59e0b')),
      step(2, 'DNA — гурвалжнуудын жагсаалт', `Зураг бүр ${ga.n} гурвалжны жагсаалт: нэг өнгөт хайрцаг = нэг гурвалжин (өнгө нь гурвалжны өнгө). Хулганаар хайрцаг дээр очвол тэр гурвалжин зураг дээр шараар тодорно. ${A === B ? 'Энэ удаа хоёр tournament-д нэг зураг ялсан тул A = B.' : `A, B хоёр ${nDiff} гурвалжнаар л ялгаатай${nDiff < ga.n / 4 ? ' — олон үе өнгөрсний дараа популяц нэг "гэр бүл" болж, бие биендээ төстэй болдог' : ''}.`}`,
        h('div', {}, caption('A'), strip(A, 'A')), h('div', {}, caption('B'), strip(B, 'B'))),
      step(3, 'Crossover + mutation', `Хүүхдийн гурвалжин бүр A эсвэл B-ээс (зоос шидэж) ирнэ: дээд талын цэнхэр зураас = A-аас (${ga.n - nB}), улбар шар = B-ээс (${nB}). Улаан хүрээтэй ${nMut} гурвалжин mutation-д орсон: булан нь хөдөлсөн, өнгө нь өөрчлөгдсөн, эсвэл шинэ гурвалжин.`,
        h('div', {}, caption('Хүүхэд'), strip(child, 'child'))),
      step(4, 'Fitness — хэр төстэй вэ', `Хүүхдийг ${W}×${H} пикселээр зураад пиксел бүрийн өнгийг зорилготой харьцуулна. Ялгаа бага = fitness өндөр.`,
        h('div', { style: 'display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap' },
          picture(A, 150, `A · ${pct(fA)}`, '#3b82f6'), h('span', { textContent: '+', style: 'font-size:1.6rem;color:var(--muted);align-self:center' }),
          picture(B, 150, `B · ${pct(fB)}`, '#f59e0b'), h('span', { textContent: '→', style: 'font-size:1.6rem;color:var(--muted);align-self:center' }),
          picture(child, 150, `Хүүхэд · ${pct(fC)}`, null),
          h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:4px' }, (() => { const c = thumb(W, H, 150); c.getContext('2d').drawImage(targetImg, 0, 0, c.width, c.height); return c; })(),
            h('span', { textContent: 'Зорилго', style: `font:600 .75rem ${mono};color:var(--muted)` }))),
        h('div', { textContent: verdict[0], style: `font-weight:700;color:${verdict[1]}` })));
  }

  // ---------- tab 3: race — same target, same number of pictures drawn, four ways to search ----------
  const RUNNERS = [
    ['Санамсаргүй хайлт', 'Бүр шинэ санамсаргүй зураг бүрт; хамгийн сайныг нь санана. Өмнөх амжилтаа ашигладаггүй.', '#94a3b8', T => new RandomSearch(T, W, H, { n: nTri })],
    ['Hill climbing', '1 зураг: нэг гурвалжныг өөрчил, муудаагүй бол үлдээ. = популяц нь 1 GA.', '#f59e0b', T => new HillClimber(T, W, H, { n: nTri })],
    ['Genetic algorithm', '40 зураг: tournament + crossover + mutation + elitism (1-р таб шиг).', '#16a34a', T => new GA(T, W, H, { n: nTri })],
    ['GA + 4 арал', '4 тусдаа популяц, 50 үе тутамд шилдгээ солилцоно. Олон янз байдал өндөр.', '#8b5cf6', T => new GA(T, W, H, { n: nTri, islands: 4 })],
  ];
  let race = null, raceRunning = false;
  const raceKey = () => `${targetName}|${W}x${H}|${nTri}`;
  const racePlay = h('button', { className: 'btn', style: 'min-width:120px;justify-content:center', onclick: () => { raceRunning = !raceRunning; raceSync(); } });
  const raceSync = () => { racePlay.textContent = raceRunning ? '❚❚ Зогсоох' : race?.budget ? '▶ Үргэлжлүүлэх' : '▶ Уралдаан эхлүүлэх'; };
  const raceChart = chartBox(170), raceCards = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px' });
  const raceInfo = h('span', { style: 'font-size:.85rem;color:var(--muted)' });
  raceView.append(
    h('div', { textContent: 'Дөрвөн арга ижил зорилготой, ижил тооны зураг зурж шалгах эрхтэй. Аль нь хамгийн төстэй зураг олох вэ? Таамаглаад, дараа нь эхлүүл.', style: 'font-size:.92rem;line-height:1.55' }),
    row(racePlay, btn('↺ Шинээр', () => { newRace(); drawRace(); }), raceInfo),
    raceCards,
    h('div', {}, caption('Ижил төстэй байдал — хэвтээ тэнхлэг нь үе биш, зурсан зургийн тоо (шударга харьцуулалт)'), raceChart),
    h('details', { style: 'border:1px solid var(--line);border-radius:12px;padding:10px 14px;background:var(--card);font-size:.9rem;line-height:1.6' },
      h('summary', { textContent: 'Юу болж байна вэ? (уралдааны дараа уншаарай)', style: 'cursor:pointer;font-weight:700' }),
      h('p', { textContent: 'Санамсаргүй хайлт бараг хөдөлдөггүй: 1000 гурвалжны тоог санамсаргүй таавал Mona Lisa гарах магадлал тэг. Өмнөх сайн зургаа ашиглах нь бүх зүйл.' }),
      h('p', { textContent: 'Энэ зураг дээр hill climbing ихэвчлэн түрүүлдэг! Зураг "гөлгөр" бодлого: жижиг өөрчлөлт бүр жаахан сайжруулалт өгдөг, нэг том толгод руу авирахтай адил. Тийм үед 40 зураг зэрэг хадгалах нь зургаа 40 хуваахтай адил.' }),
      h('p', { textContent: 'Тэгвэл GA яагаад хэрэгтэй вэ? (1) Олон "хавх"-тай бодлогод (жижиг толгод олонтой) нэг авирагч эхний толгод дээрээ гацдаг, популяц олон газар зэрэг хайдаг. (2) Crossover өөр өөр шийдлийн сайн хэсгийг нийлүүлж чадна. (3) 40 зургийг 40 компьютер дээр зэрэг шалгаж болно, hill climbing дараалан л явна.' }),
      h('p', { textContent: 'Арлуудтай GA олон янз байдлаа хэд дахин өндөр хадгалдаг (1-р таб дээрх ягаан шугам), гэхдээ энэ зураг дээр оноо нь энгийн GA-тай ойролцоо эсвэл арай доогуур. Олон янз байдал нь хавхтай бодлогод л үнэ цэнтэй, энд хавх бараг байхгүй.' }),
      h('p', { textContent: '"Ид шид биш" гэдгийн нэг утга энэ: алгоритм бүр багаж. Бодлогоо харж тохирохыг нь сонгоно.' })));

  function newRace() {
    if (!targetImg) return;
    const T = targetPixels();
    race = { key: raceKey(), budget: 0, stride: 40, runners: RUNNERS.map(([name, desc, color, make]) => {
      const cv = thumb(W, H, 360);
      // Keep its shape; short enough in full view that the chart below stays on screen.
      Object.assign(cv.style, { width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 'max(150px,calc(100dvh - 740px))', margin: '0 auto' });
      const fit = h('div', { style: `font:800 1.25rem ${mono};color:${color}` }), sub = h('div', { style: `font:500 .75rem ${mono};color:var(--muted)` });
      const badge = h('span', { style: 'margin-left:auto;font-size:1.1rem' });
      const card = h('div', { style: `border:1px solid var(--line);border-top:4px solid ${color};border-radius:12px;padding:10px 12px;background:var(--card);display:flex;flex-direction:column;gap:6px;min-width:0` },
        h('div', { style: 'display:flex;align-items:center;gap:6px;font-weight:800' }, name, badge),
        h('div', { textContent: desc, style: 'font-size:.78rem;color:var(--muted);line-height:1.45;min-height:3.4em' }), cv, fit, sub);
      return { name, color, algo: make(T), cv, fit, sub, badge, card, pts: [] };
    }) };
    race.runners.forEach(r => r.pts.push([r.algo.evals, r.algo.fitness(r.algo.best)]));
    raceCards.replaceChildren(...race.runners.map(r => r.card));
    raceRunning = false; raceSync();
  }
  // Every runner may draw the same number of pictures: each round raises the budget by 40 and lets each catch up.
  function raceTick(deadline) {
    do {
      race.budget += 40;
      for (const r of race.runners) while (r.algo.evals < race.budget) r.algo.step();
      if (race.budget % race.stride === 0) race.runners.forEach(r => r.pts.push([r.algo.evals, r.algo.fitness(r.algo.best)]));
      if (race.runners[0].pts.length > 400) { race.runners.forEach(r => { r.pts = r.pts.filter((_, i) => i % 2 === 0); }); race.stride *= 2; }
    } while (performance.now() < deadline);
  }
  function drawRace() {
    if (!race) { raceCards.replaceChildren('Ачаалж байна…'); return; }
    const fits = race.runners.map(r => r.algo.fitness(r.algo.best)), top = Math.max(...fits);
    race.runners.forEach((r, i) => {
      paint(r.cv, r.algo.best.g, r.algo.n, r.algo.bg);
      r.fit.textContent = `${pct(fits[i])} ижил`;
      r.sub.textContent = `${r.algo.evals.toLocaleString('en-US')} зураг зурсан`;
      r.badge.textContent = race.budget && fits[i] === top ? '🏆' : '';
    });
    raceInfo.textContent = `Зорилго: ${targetName === 'upload' ? 'өөрийн зураг' : targetName} (1-р табаас солино) · ${nTri} гурвалжин`;
    const lo = Math.floor(Math.min(...race.runners.flatMap(r => r.pts.map(p => p[1]))) * 20) / 20;
    lineChart(raceChart, race.runners.map(r => ({ pts: r.pts, color: r.color, width: 2.2 })), { lo, hi: 1, tick: 0.05, xLabel: 'зураг' });
  }

  // ---------- main loop: as many generations as fit in ~12 ms per frame ----------
  let raf = 0, prev = performance.now();
  const frame = now => {
    if (raceRunning && race && tab === 'race') { raceTick(performance.now() + 12); drawRace(); }
    if (running && ga && tab === 'evo') {
      elapsed += now - prev;
      const start = performance.now();
      do { ga.step(); record(); } while (performance.now() - start < 12);
      onStep();
    }
    prev = now;
    raf = requestAnimationFrame(frame);
  };
  const ro = new ResizeObserver(() => { if (ga) drawChart(); if (race && tab === 'race') drawRace(); });
  ro.observe(chart); ro.observe(raceChart);
  setTab('evo'); sync(); triSeg.set(nTri); islandSeg.set(params.islands);
  loadTarget(targetName);
  raf = requestAnimationFrame(frame);
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
}
