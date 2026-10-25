// Fourier epicycles: a closed path is decomposed with a DFT, then redrawn by chained rotating circles.
// Paths are kept in unit coordinates (centered, radius ~1) so the canvas can be any size.
const SAMPLES = 256;
const PERIOD = 10; // seconds per full cycle at 1× speed

function dft(pts) {
  const N = pts.length, out = [];
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const a = (2 * Math.PI * k * n) / N;
      re += pts[n].x * Math.cos(a) + pts[n].y * Math.sin(a);
      im += pts[n].y * Math.cos(a) - pts[n].x * Math.sin(a);
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
    const f = (t - d[j - 1]) / (d[j] - d[j - 1] || 1);
    res.push({ x: closed[j - 1].x + f * (closed[j].x - closed[j - 1].x), y: closed[j - 1].y + f * (closed[j].y - closed[j - 1].y) });
  }
  return res;
}

// Center on the origin and scale so the farthest point sits at radius 0.9.
function normalize(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const r = Math.max(...pts.map(p => Math.hypot(p.x - cx, p.y - cy))) || 1;
  return pts.map(p => ({ x: ((p.x - cx) / r) * 0.9, y: ((p.y - cy) / r) * 0.9 }));
}

const polygon = (n, radius) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * 2 * Math.PI - Math.PI / 2, r = radius(i);
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
});
const PRESETS = {
  'Зүрх': () => Array.from({ length: 200 }, (_, i) => {
    const t = (i / 200) * 2 * Math.PI;
    return { x: 16 * Math.sin(t) ** 3, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) };
  }),
  'Од': () => polygon(10, i => (i % 2 ? 0.45 : 1)),
  'Дөрвөлжин': () => polygon(4, () => 1).map(p => ({ x: p.x + p.y, y: p.y - p.x })),
};

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const wrap = h('div', { style: 'position:relative;flex:1;min-height:240px' });
  const canvas = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair' });
  const hint = h('div', { textContent: 'Хулгана эсвэл хуруугаараа дурын битүү дүрс зурна уу', style: 'position:absolute;top:10px;left:12px;right:12px;font-size:.8rem;color:var(--muted);pointer-events:none' });
  wrap.append(canvas, hint);

  const field = (label, input, out) => h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--muted)' }, label, input, ...(out ? [out] : []));
  const play = h('button', { className: 'btn', style: 'min-width:120px;justify-content:center' });
  const count = h('input', { type: 'range', min: 1, max: SAMPLES - 1, value: SAMPLES - 1, style: 'width:140px' });
  const countOut = h('output', { style: 'min-width:5.5em;font-variant-numeric:tabular-nums;color:var(--fg)' });
  const speed = h('input', { type: 'range', min: 0.25, max: 4, step: 0.25, value: 1, style: 'width:90px' });
  const speedOut = h('output', { style: 'min-width:3em;font-variant-numeric:tabular-nums;color:var(--fg)' });
  const circles = h('input', { type: 'checkbox', checked: true });
  const presetBtns = Object.keys(PRESETS).map(name => h('button', { className: 'btn btn-sm', textContent: name, onclick: () => setPath(PRESETS[name](), name) }));
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center' }, ...kids);
  const controls = h('div', { style: 'display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-top:1px solid var(--line)' },
    row(play, field('Тойрог', count, countOut), field('Хурд', speed, speedOut), field('', circles, 'Тойргийг харуулах')),
    row(h('span', { textContent: 'Бэлэн дүрс:', style: 'font-size:.85rem;color:var(--muted)' }), ...presetBtns));
  root.append(wrap, controls);

  const ctx = canvas.getContext('2d');
  let coeffs = [], trail = [], time = 0, running = true, drawing = null, raf = 0, last = performance.now();
  let size = { w: 1, h: 1, cx: 0, cy: 0, s: 1 };

  function setPath(pts, preset) {
    coeffs = dft(normalize(resample(pts, SAMPLES)));
    trail = []; time = 0;
    presetBtns.forEach(b => b.setAttribute('aria-pressed', String(b.textContent === preset)));
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

  const line = (pts, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, size.cx + p.x * size.s, size.cy + p.y * size.s));
    ctx.stroke();
  };

  function frame(now) {
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
        time += (2 * Math.PI * dt * +speed.value) / PERIOD;
        trail.push({ x, y, t: time });
        while (trail.length && trail[0].t < time - 2 * Math.PI) trail.shift();
      }
      line(trail, accent, 2.5);
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(size.cx + x * size.s, size.cy + y * size.s, 4, 0, 2 * Math.PI); ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  setPath(PRESETS['Зүрх'](), 'Зүрх');
  resize();
  raf = requestAnimationFrame(frame);
  // Stop animating once the demo is removed from the page.
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
