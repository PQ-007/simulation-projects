// Perlin noise terrain: random gradients on a grid, smoothly interpolated, layered in octaves (fBm).

// Seeded PRNG (mulberry32), so a seed always gives the same world.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Classic 2D Perlin noise: a random unit gradient at every integer grid point; a point's value is the
// smoothly blended dot products of the 4 surrounding gradients with the offsets to it. Returns about −1…1.
export function makePerlin(seed) {
  const r = rng(seed), perm = new Uint8Array(512), gx = new Float64Array(256), gy = new Float64Array(256);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) { const a = r() * 2 * Math.PI; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10); // 6t⁵ − 15t⁴ + 10t³: smooth at the grid lines
  const hash = (ix, iy) => perm[(ix & 255) + perm[iy & 255]];
  const noise = (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const dot = (ix, iy, dx, dy) => { const h = hash(ix, iy); return gx[h] * dx + gy[h] * dy; };
    const n00 = dot(x0, y0, fx, fy), n10 = dot(x0 + 1, y0, fx - 1, fy);
    const n01 = dot(x0, y0 + 1, fx, fy - 1), n11 = dot(x0 + 1, y0 + 1, fx - 1, fy - 1);
    const u = fade(fx), v = fade(fy);
    return Math.SQRT2 * ((n00 + u * (n10 - n00)) + v * ((n01 + u * (n11 - n01)) - (n00 + u * (n10 - n00))));
  };
  noise.gradient = (ix, iy) => { const h = hash(ix, iy); return [gx[h], gy[h]]; };
  return noise;
}

// Fractal Brownian motion: each octave doubles the frequency and scales the amplitude by `persistence`.
export function fbm(noise, x, y, { octaves, persistence, lacunarity }) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq + o * 17.3, y * freq - o * 9.1);
    norm += amp; amp *= persistence; freq *= lacunarity;
  }
  return sum / norm;
}

// Height (0…1) to terrain colour, with bands placed relative to the water level.
function colour(h, water) {
  if (h < water) {
    const d = (water - h) / water;
    return [52 - 34 * d, 128 - 70 * d, 196 - 70 * d];
  }
  const t = (h - water) / (1 - water);
  if (t < 0.04) return [222, 206, 150];
  if (t < 0.32) return [96 - 30 * t, 160 - 40 * t, 72];
  if (t < 0.55) return [58, 112, 60];
  if (t < 0.75) return [120, 108, 96];
  if (t < 0.88) return [150, 146, 142];
  return [240, 242, 246];
}

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const wrap = h('div', { style: 'position:relative;flex:1;min-height:220px;overflow:hidden;cursor:grab;touch-action:none' });
  const map = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%' });
  const overlay = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none' });
  const hud = h('div', { style: 'position:absolute;top:8px;left:10px;font-size:.78rem;color:#fff;text-shadow:0 1px 3px #000;pointer-events:none' });
  wrap.append(map, overlay, hud);
  const strip = h('canvas', { style: 'display:block;width:100%;height:96px;border-top:1px solid var(--line)' });

  // fBm values cluster near 0; stretching them by K gives real mountains and deep water.
  const K = 0.85;
  const P = { scale: 120, octaves: 5, persistence: 0.5, lacunarity: 2, water: 0.42, seed: 1337 };
  const slider = (label, key, min, max, step, fmt = v => v) => {
    const out = h('output', { style: 'min-width:2.4em;font-variant-numeric:tabular-nums;color:var(--fg)' });
    const input = h('input', { type: 'range', min, max, step, value: P[key], style: 'width:86px' });
    input.oninput = () => { P[key] = +input.value; out.textContent = fmt(P[key]); render(); };
    out.textContent = fmt(P[key]);
    return h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, label, input, out);
  };
  const check = (label, on) => { const c = h('input', { type: 'checkbox', checked: on, onchange: () => render() }); return [c, h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, c, label)]; };
  const [shadeBox, shadeLabel] = check('Hillshade', true);
  const [gradBox, gradLabel] = check('Gradient сумнууд', false);
  const [grayBox, grayLabel] = check('Grayscale', false);
  const fly = h('button', { className: 'btn', style: 'min-width:120px;justify-content:center', onclick: () => { flying = !flying; sync(); } });
  const seedBtn = h('button', { className: 'btn', textContent: '🎲 Шинэ ертөнц', onclick: () => { P.seed = (Math.random() * 1e9) | 0; noise = makePerlin(P.seed); render(); } });
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center' }, ...kids);
  const controls = h('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:10px 14px;border-top:1px solid var(--line)' },
    row(seedBtn, fly, shadeLabel, gradLabel, grayLabel),
    row(slider('Scale', 'scale', 20, 300, 5), slider('Octaves', 'octaves', 1, 8, 1), slider('Persistence', 'persistence', 0.2, 0.8, 0.05, v => v.toFixed(2)),
      slider('Lacunarity', 'lacunarity', 1.5, 3, 0.1, v => v.toFixed(1)), slider('Усны түвшин', 'water', 0.2, 0.7, 0.01, v => v.toFixed(2))));
  root.append(wrap, strip, controls);

  const mctx = map.getContext('2d'), octx = overlay.getContext('2d'), sctx = strip.getContext('2d');
  const buf = document.createElement('canvas'), bctx = buf.getContext('2d');
  let noise = makePerlin(P.seed), ox = 0, oy = 0, flying = false, raf = 0, last = performance.now(), view = { w: 1, h: 1 };

  // Render at reduced resolution and let the browser scale it up; one map pixel = `res` screen pixels.
  const res = () => (flying ? 3 : 2);
  function render() {
    const W = view.w, H = view.h, r = res(), bw = Math.ceil(W / r), bh = Math.ceil(H / r);
    if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
    const img = bctx.createImageData(bw, bh), s = P.scale / r;
    const heights = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++)
      heights[y * bw + x] = Math.min(1, Math.max(0, 0.5 + K * fbm(noise, (x + ox / r) / s, (y + oy / r) / s, P)));
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const i = y * bw + x, hgt = heights[i];
      let c = grayBox.checked ? [hgt * 255, hgt * 255, hgt * 255] : colour(hgt, P.water);
      if (shadeBox.checked && hgt >= P.water) {
        // Light from the top-left: brighten slopes facing it, darken the ones facing away.
        const a = heights[Math.max(0, y - 1) * bw + Math.max(0, x - 1)], b = heights[Math.min(bh - 1, y + 1) * bw + Math.min(bw - 1, x + 1)];
        const k = Math.max(0.55, Math.min(1.35, 1 + (a - b) * 9));
        c = c.map(v => v * k);
      }
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(buf, 0, 0, W, H);
    drawOverlay(); drawStrip();
    hud.textContent = `seed ${P.seed} · ${P.octaves} octave${flying ? ' · ✈ нисч байна' : ''}`;
  }

  // The random gradient vectors of the first octave, one per grid corner.
  function drawOverlay() {
    const W = view.w, H = view.h;
    octx.clearRect(0, 0, W, H);
    const midY = H / 2;
    octx.strokeStyle = 'rgba(255,255,255,.7)'; octx.setLineDash([6, 6]); octx.lineWidth = 1.5;
    octx.beginPath(); octx.moveTo(0, midY); octx.lineTo(W, midY); octx.stroke(); octx.setLineDash([]);
    if (!gradBox.checked) return;
    const s = P.scale, x0 = Math.floor(ox / s), y0 = Math.floor(oy / s);
    octx.strokeStyle = 'rgba(255,255,255,.35)'; octx.lineWidth = 1; octx.beginPath();
    for (let gxi = x0; gxi * s - ox <= W; gxi++) { const x = gxi * s - ox; octx.moveTo(x, 0); octx.lineTo(x, H); }
    for (let gyi = y0; gyi * s - oy <= H; gyi++) { const y = gyi * s - oy; octx.moveTo(0, y); octx.lineTo(W, y); }
    octx.stroke();
    const len = Math.min(26, s * 0.4);
    for (let gyi = y0; gyi * s - oy <= H + s; gyi++) for (let gxi = x0; gxi * s - ox <= W + s; gxi++) {
      // fbm samples octave 0 at (x, y) unshifted, so these are exactly the gradients the map uses.
      const [dx, dy] = noise.gradient(gxi, gyi), x = gxi * s - ox, y = gyi * s - oy, ex = x + dx * len, ey = y + dy * len;
      octx.strokeStyle = '#fde047'; octx.fillStyle = '#fde047'; octx.lineWidth = 2.5;
      octx.beginPath(); octx.moveTo(x, y); octx.lineTo(ex, ey); octx.stroke();
      const a = Math.atan2(dy, dx);
      octx.beginPath(); octx.moveTo(ex, ey); octx.lineTo(ex - 7 * Math.cos(a - 0.5), ey - 7 * Math.sin(a - 0.5)); octx.lineTo(ex - 7 * Math.cos(a + 0.5), ey - 7 * Math.sin(a + 0.5)); octx.fill();
      octx.beginPath(); octx.arc(x, y, 3, 0, 2 * Math.PI); octx.fill();
    }
  }

  // 1D slice along the dashed line: each octave's own wave (thin) and their normalised sum (thick).
  function drawStrip() {
    const W = strip.clientWidth, H = strip.clientHeight, dpr = devicePixelRatio || 1;
    if (strip.width !== W * dpr) { strip.width = W * dpr; strip.height = H * dpr; }
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(root), fg = css.getPropertyValue('--fg').trim() || '#000', muted = css.getPropertyValue('--muted').trim() || '#888';
    sctx.clearRect(0, 0, W, H);
    const s = P.scale, y = (view.h / 2 + oy) / s, toY = v => H / 2 + 6 - v * H * 0.8;
    let amp = 1, freq = 1, norm = 0;
    const hues = [205, 160, 45, 330, 270, 15, 100, 190];
    for (let o = 0; o < P.octaves; o++) { norm += amp; amp *= P.persistence; }
    amp = 1;
    for (let o = 0; o < P.octaves; o++) {
      sctx.strokeStyle = `hsl(${hues[o]} 75% 55%)`; sctx.globalAlpha = 0.85; sctx.lineWidth = 1.3; sctx.beginPath();
      for (let x = 0; x <= W; x += 2) {
        const v = (amp * noise(((x + ox) / s) * freq + o * 17.3, y * freq - o * 9.1)) / norm;
        x ? sctx.lineTo(x, toY(v)) : sctx.moveTo(x, toY(v));
      }
      sctx.stroke(); amp *= P.persistence; freq *= P.lacunarity;
    }
    sctx.globalAlpha = 1;
    sctx.strokeStyle = '#3b82f6'; sctx.globalAlpha = 0.5; sctx.setLineDash([4, 5]); sctx.lineWidth = 1;
    sctx.beginPath(); sctx.moveTo(0, toY((P.water - 0.5) / K)); sctx.lineTo(W, toY((P.water - 0.5) / K)); sctx.stroke();
    sctx.setLineDash([]); sctx.globalAlpha = 1;
    sctx.strokeStyle = fg; sctx.lineWidth = 2.5; sctx.beginPath();
    for (let x = 0; x <= W; x += 2) { const v = fbm(noise, (x + ox) / s, y, P); x ? sctx.lineTo(x, toY(v)) : sctx.moveTo(x, toY(v)); }
    sctx.stroke();
    sctx.fillStyle = muted; sctx.font = '11px Inter, system-ui, sans-serif';
    sctx.fillText('1D зүсэлт (тасархай шугам): өнгөт = octave бүр, хар = нийлбэр, цэнхэр = усны түвшин', 8, 13);
  }

  function sync() { fly.textContent = flying ? '❚❚ Зогсоох' : '✈ Нисэх'; }

  // Drag to pan around the endless world.
  let drag = null;
  wrap.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ox, oy }; wrap.setPointerCapture(e.pointerId); wrap.style.cursor = 'grabbing'; });
  wrap.addEventListener('pointermove', e => { if (!drag) return; ox = drag.ox - (e.clientX - drag.x); oy = drag.oy - (e.clientY - drag.y); render(); });
  const up = () => { drag = null; wrap.style.cursor = 'grab'; };
  wrap.addEventListener('pointerup', up);
  wrap.addEventListener('pointercancel', up);

  const ro = new ResizeObserver(() => {
    const r = wrap.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    view = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    for (const c of [map, overlay]) { c.width = view.w * dpr; c.height = view.h * dpr; c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); }
    render();
  });
  ro.observe(wrap);

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (flying && !drag) { ox += 90 * dt; oy += 25 * dt; render(); }
    raf = requestAnimationFrame(frame);
  }
  sync();
  raf = requestAnimationFrame(frame);
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
