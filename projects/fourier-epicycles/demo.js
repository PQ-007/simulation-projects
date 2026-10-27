// Fourier epicycles: a closed path is decomposed with a DFT, then redrawn by chained rotating circles.
// Paths are kept in unit coordinates (centered, radius ~1) so the canvas can be any size.
const SAMPLES = 1024;
const PERIOD = 14; // seconds per full cycle at 1× speed

function dft(pts) {
  const N = pts.length, out = [];
  // e^(-2πi·kn/N) only depends on kn mod N, so one table of N angles covers every term.
  const cos = Float64Array.from({ length: N }, (_, j) => Math.cos((2 * Math.PI * j) / N));
  const sin = Float64Array.from({ length: N }, (_, j) => Math.sin((2 * Math.PI * j) / N));
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0, j = 0; n < N; n++, j = (j + k) % N) {
      re += pts[n].x * cos[j] + pts[n].y * sin[j];
      im += pts[n].y * cos[j] - pts[n].x * sin[j];
    }
    re /= N; im /= N;
    const freq = k <= N / 2 ? k : k - N; // signed frequency
    out.push({ freq, amp: Math.hypot(re, im), phase: Math.atan2(im, re) });
  }
  // The k=0 term is the path's center, which is already at the origin.
  return out.filter(c => c.freq !== 0).sort((a, b) => b.amp - a.amp);
}

// Resample a polyline to n points evenly spaced along its length.
function resample(pts, n) {
  const closed = [...pts, pts[0]];
  const d = [0];
  for (let i = 1; i < closed.length; i++) d.push(d[i - 1] + Math.hypot(closed[i].x - closed[i - 1].x, closed[i].y - closed[i - 1].y));
  const total = d[d.length - 1], res = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * total;
    while (d[j] < t) j++;
    const f = (t - d[j - 1]) / (d[j] - d[j - 1] || 1), a = closed[j - 1], b = closed[j];
    // Samples on a jump between two contours get c = null so they can be drawn faintly.
    res.push({ x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y), c: a.g === b.g ? a.c : null });
  }
  return res;
}

// Center on the origin and scale so the farthest point sits at radius 0.9.
function normalize(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const r = Math.max(...pts.map(p => Math.hypot(p.x - cx, p.y - cy))) || 1;
  return pts.map(p => ({ ...p, x: ((p.x - cx) / r) * 0.9, y: ((p.y - cy) / r) * 0.9 }));
}

const polygon = (n, radius) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * 2 * Math.PI - Math.PI / 2, r = radius(i);
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
});
// Samples a parametric curve over t ∈ [0, turns·2π).
const curve = (turns, f, n = 4000) => Array.from({ length: n }, (_, i) => f((i / n) * turns * 2 * Math.PI));
const PRESETS = {
  'CS лого': () => imageOutline(new URL('gen1cs-logo.jpg', import.meta.url)),
  'Зүрх': () => curve(1, t => ({ x: 16 * Math.sin(t) ** 3, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) }), 200),
  'Од': () => polygon(10, i => (i % 2 ? 0.45 : 1)),
  'Дөрвөлжин': () => polygon(4, () => 1).map(p => ({ x: p.x + p.y, y: p.y - p.x })),
  // Temple Fay's butterfly curve: r = e^cos t − 2cos 4t − sin⁵(t/12).
  'Butterfly': () => curve(6, t => {
    const r = Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t) - Math.sin(t / 12) ** 5;
    return { x: r * Math.sin(t), y: -r * Math.cos(t) };
  }),
  // Hypotrochoid with R=10, r=7, d=5: closes after r = 7 turns.
  'Spirograph': () => curve(7, t => ({ x: 3 * Math.cos(t) + 5 * Math.cos((3 / 7) * t), y: 3 * Math.sin(t) - 5 * Math.sin((3 / 7) * t) })),
  // Rose r = cos(7t/4): closes after 8π.
  'Rose': () => curve(4, t => ({ x: Math.cos((7 / 4) * t) * Math.cos(t), y: Math.cos((7 / 4) * t) * Math.sin(t) })),
  'Lissajous': () => curve(1, t => ({ x: Math.sin(5 * t + Math.PI / 2), y: Math.sin(4 * t) })),
};

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]; // clockwise on screen

// Outline of rendered text.
function textOutline(text) {
  const size = 220, c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
  const font = `700 ${size}px Inter, system-ui, sans-serif`;
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 40; c.height = Math.ceil(size * 1.6);
  g.font = font; g.textBaseline = 'middle';
  g.fillText(text, 20, c.height / 2);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  return pixelOutline(c.width, c.height, px, i => px[i + 3] > 127, false);
}

// Outline of a logo on a dark background, keeping each part's color.
async function imageOutline(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  // ~500px wide is plenty once contours are smoothed, and keeps the flood fill fast.
  const scale = Math.min(1, 500 / img.width);
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  return pixelOutline(c.width, c.height, px, i => Math.max(px[i], px[i + 1], px[i + 2]) > 90, true);
}

// Trace the edge of every ink blob and every hole inside one, then join them into a single closed path.
// Points carry their contour index `g` (and color `c` when `colored`), so jumps between contours can be told apart.
function pixelOutline(W, H, px, isInk, colored) {
  const ink = (x, y) => x >= 0 && y >= 0 && x < W && y < H && isInk((y * W + x) * 4);
  const hole = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !ink(x, y);
  const contours = [...blobContours(ink, W, H, false), ...blobContours(hole, W, H, true)].map(ct => smooth(ct, 3));
  contours.forEach((ct, g) => {
    // A contour's color is the average of the ink pixels around it, skipping dimmer anti-aliased edge pixels;
    // holes take their surroundings' color.
    let c;
    if (colored) {
      const near = [];
      for (const p of ct) for (const [dx, dy] of [[0, 0], ...DIRS]) {
        const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy, i = (y * W + x) * 4;
        if (ink(x, y)) near.push([px[i], px[i + 1], px[i + 2]]);
      }
      const solid = near.sort((a, b) => Math.max(...b) - Math.max(...a)).slice(0, Math.ceil(near.length / 4));
      if (solid.length) c = `rgb(${[0, 1, 2].map(k => Math.round(solid.reduce((s, q) => s + q[k], 0) / solid.length)).join(',')})`;
    }
    ct.forEach(p => { p.g = g; p.c = c; });
  });

  // Greedy nearest-neighbour order, starting each contour at the point closest to the previous end,
  // so the straight jumps between contours stay short.
  const out = [];
  let rest = contours.sort((a, b) => Math.min(...a.map(p => p.x)) - Math.min(...b.map(p => p.x)));
  while (rest.length) {
    const end = out[out.length - 1];
    let best = { d: Infinity, c: 0, k: 0 };
    if (end) rest.forEach((ct, ci) => ct.forEach((p, k) => {
      const d = (p.x - end.x) ** 2 + (p.y - end.y) ** 2;
      if (d < best.d) best = { d, c: ci, k };
    }));
    const ct = rest[best.c];
    out.push(...ct.slice(best.k), ...ct.slice(0, best.k));
    rest = rest.filter((_, i) => i !== best.c);
  }
  return out;
}

// Boundary of each 8-connected blob where `on` holds. Blobs touching the image edge are skipped when
// `enclosedOnly` is set, which leaves just the holes inside letters when `on` is "not ink".
function blobContours(on, W, H, enclosedOnly) {
  const seen = new Uint8Array(W * H), contours = [];
  for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
    if (seen[y0 * W + x0] || !on(x0, y0)) continue;
    // The first pixel found in raster order is on the blob's outer edge, with an empty west neighbour.
    const stack = [[x0, y0]];
    let area = 0, edge = false;
    seen[y0 * W + x0] = 1;
    while (stack.length) {
      const [x, y] = stack.pop();
      area++;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (on(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; stack.push([nx, ny]); }
      }
    }
    if (area > 40 && !(enclosedOnly && edge)) contours.push(mooreTrace(on, x0, y0));
  }
  return contours;
}

// Circular moving average over ±r points, which takes the pixel stair-steps out of a traced contour.
function smooth(ct, r) {
  const n = ct.length;
  if (n <= 2 * r) return ct;
  return ct.map((_, i) => {
    let x = 0, y = 0;
    for (let k = -r; k <= r; k++) { const p = ct[(i + k + n) % n]; x += p.x; y += p.y; }
    return { x: x / (2 * r + 1), y: y / (2 * r + 1) };
  });
}

// Moore-neighbour boundary tracing from a pixel whose west neighbour is empty.
function mooreTrace(on, sx, sy) {
  const out = [{ x: sx, y: sy }];
  let x = sx, y = sy, back = 4;
  for (let guard = 0; guard < 500000; guard++) {
    let moved = false;
    for (let i = 1; i <= 8; i++) {
      const d = (back + i) % 8, nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (!on(nx, ny)) continue;
      const p = DIRS[(d + 7) % 8]; // last empty pixel checked becomes the new backtrack
      back = DIRS.findIndex(([dx, dy]) => dx === x + p[0] - nx && dy === y + p[1] - ny);
      x = nx; y = ny; moved = true;
      break;
    }
    if (!moved || (x === sx && y === sy)) break;
    out.push({ x, y });
  }
  return out;
}

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const wrap = h('div', { style: 'position:relative;flex:1;min-height:240px' });
  const canvas = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair' });
  const hint = h('div', { textContent: 'Хулгана эсвэл хуруугаараа дурын битүү дүрс зурна уу, эсвэл доороос shape сонго', style: 'position:absolute;top:10px;left:12px;right:12px;font-size:.8rem;color:var(--muted);pointer-events:none' });
  wrap.append(canvas, hint);

  const field = (label, input, out) => h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--muted)' }, label, input, ...(out ? [out] : []));
  const play = h('button', { className: 'btn', style: 'min-width:120px;justify-content:center' });
  const count = h('input', { type: 'range', min: 1, max: SAMPLES - 1, value: SAMPLES - 1, style: 'width:140px' });
  const countOut = h('output', { style: 'min-width:5.5em;font-variant-numeric:tabular-nums;color:var(--fg)' });
  const speed = h('input', { type: 'range', min: 0.25, max: 4, step: 0.25, value: 1, style: 'width:90px' });
  const speedOut = h('output', { style: 'min-width:3em;font-variant-numeric:tabular-nums;color:var(--fg)' });
  const circles = h('input', { type: 'checkbox', checked: true });
  const presetBtns = Object.keys(PRESETS).map(name => h('button', { className: 'btn btn-sm', textContent: name, onclick: () => loadPreset(name) }));
  const text = h('input', { type: 'text', value: 'π', maxLength: 12, 'aria-label': 'Текст', style: 'width:110px;padding:4px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font:inherit;font-size:.9rem' });
  const textBtn = h('button', { className: 'btn btn-sm', textContent: 'Текст зурах' });
  const drawText = () => { const pts = text.value.trim() && textOutline(text.value.trim()); if (pts?.length > 8) setPath(pts, textBtn.textContent); };
  textBtn.onclick = drawText;
  text.onkeydown = e => { if (e.key === 'Enter') drawText(); };
  const label = s => h('span', { textContent: s, style: 'font-size:.85rem;color:var(--muted)' });
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center' }, ...kids);
  const controls = h('div', { style: 'display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-top:1px solid var(--line)' },
    row(play, field('Тойрог', count, countOut), field('Хурд', speed, speedOut), field('', circles, 'Тойргийг харуулах')),
    row(label('Shape:'), ...presetBtns),
    row(label('Текст / тэмдэгт:'), text, textBtn));
  root.append(wrap, controls);

  const ctx = canvas.getContext('2d');
  let coeffs = [], colors = [], trail = [], time = 0, running = true, drawing = null, raf = 0, last = performance.now();
  let size = { w: 1, h: 1, cx: 0, cy: 0, s: 1 };

  function setPath(pts, preset) {
    const samples = normalize(resample(pts, SAMPLES));
    coeffs = dft(samples);
    // Per-sample stroke color: a color, null for a jump between contours, or undefined for the theme accent.
    colors = samples.map(p => p.c);
    count.max = coeffs.length; count.value = coeffs.length;
    trail = []; time = 0;
    [...presetBtns, textBtn].forEach(b => b.setAttribute('aria-pressed', String(b.textContent === preset)));
    sync();
  }
  function sync() {
    countOut.textContent = `${count.value} / ${coeffs.length}`;
    speedOut.textContent = `${speed.value}×`;
    play.textContent = running ? '❚❚ Зогсоох' : '▶ Үргэлжлүүлэх';
  }

  function resize() {
    const r = wrap.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    size = { w: r.width, h: r.height, cx: r.width / 2, cy: r.height / 2 + 8, s: Math.min(r.width, r.height - 40) / 2 };
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  // Pointer positions are stored in unit coordinates relative to the current canvas size.
  const toUnit = e => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - size.cx) / size.s, y: (e.clientY - r.top - size.cy) / size.s };
  };
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); drawing = [toUnit(e)]; hint.hidden = true; });
  canvas.addEventListener('pointermove', e => { if (drawing) drawing.push(toUnit(e)); });
  const finish = () => {
    if (drawing && drawing.length > 8) setPath(drawing, null);
    drawing = null;
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  play.onclick = () => { running = !running; sync(); };
  count.oninput = () => { trail = []; sync(); };
  speed.oninput = sync;

  async function loadPreset(name) {
    try { setPath(await PRESETS[name](), name); } catch (e) { hint.textContent = `${name} ачаалж чадсангүй: ${e.message}`; }
  }

  // Sample n sits at t = 2πn/N, so a trail point's time tells which sample's color it takes.
  const colorAt = t => colors[Math.round((((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * SAMPLES) % SAMPLES];
  function drawTrail(accent, fg) {
    // Batch consecutive segments with the same style into one stroke.
    for (let i = 1; i < trail.length;) {
      const c = colorAt(trail[i].t), run = [trail[i - 1]];
      while (i < trail.length && colorAt(trail[i].t) === c) run.push(trail[i++]);
      ctx.globalAlpha = c === null ? 0.18 : 1;
      line(run, c === null ? fg : c ?? accent, c === null ? 1 : 2.5);
    }
    ctx.globalAlpha = 1;
  }

  const tipAt = (t, n) => {
    let x = 0, y = 0;
    for (let i = 0; i < n; i++) {
      const c = coeffs[i], a = c.freq * t + c.phase;
      x += c.amp * Math.cos(a); y += c.amp * Math.sin(a);
    }
    return { x, y, t };
  };

  const line = (pts, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, size.cx + p.x * size.s, size.cy + p.y * size.s));
    ctx.stroke();
  };

  function frame(now) {
    // Not on screen (hidden pane, closed dialog, scrolled away): skip the work until it is visible again.
    if (root.closest('[data-offscreen]')) { last = now; raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const css = getComputedStyle(root), fg = css.getPropertyValue('--fg').trim() || '#000', accent = css.getPropertyValue('--accent').trim() || '#2563eb';
    ctx.clearRect(0, 0, size.w, size.h);
    if (drawing) {
      line(drawing, accent, 2.5);
    } else if (coeffs.length) {
      const n = +count.value;
      let x = 0, y = 0;
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const c = coeffs[i], a = c.freq * time + c.phase;
        const nx = x + c.amp * Math.cos(a), ny = y + c.amp * Math.sin(a);
        if (circles.checked && c.amp * size.s > 0.5) {
          ctx.strokeStyle = fg; ctx.globalAlpha = i === 0 ? 0.2 : 0.14;
          ctx.beginPath(); ctx.arc(size.cx + x * size.s, size.cy + y * size.s, c.amp * size.s, 0, 2 * Math.PI); ctx.stroke();
          ctx.globalAlpha = 0.45;
          ctx.beginPath(); ctx.moveTo(size.cx + x * size.s, size.cy + y * size.s); ctx.lineTo(size.cx + nx * size.s, size.cy + ny * size.s); ctx.stroke();
        }
        x = nx; y = ny;
      }
      ctx.globalAlpha = 1;
      if (running) {
        // Sub-step so the trail gets about two points per sample, even when the tip moves fast.
        const advance = (2 * Math.PI * dt * +speed.value) / PERIOD, steps = Math.max(1, Math.ceil(advance / (Math.PI / SAMPLES)));
        for (let s = 1; s <= steps; s++) trail.push(tipAt(time + (advance * s) / steps, n));
        time += advance;
        while (trail.length && trail[0].t < time - 2 * Math.PI) trail.shift();
      }
      drawTrail(accent, fg);
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(size.cx + x * size.s, size.cy + y * size.s, 4, 0, 2 * Math.PI); ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  loadPreset(Object.keys(PRESETS)[0]); // the logo; by position, so renaming its label can't break this
  resize();
  raf = requestAnimationFrame(frame);
  // Stop animating once the demo is removed from the page.
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
