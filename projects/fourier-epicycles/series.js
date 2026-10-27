// Docs widget: a Fourier series built from sine waves. Each sine is a spinning circle; stacking the circles
// and following the last tip draws the sum, which gets closer to the target wave as terms are added.

// Terms (frequency, amplitude) of the classic series. Square: odd n with 4/(nπ). Sawtooth: every n with
// alternating 2/(nπ). Triangle: odd n with alternating 8/(π²n²).
export function terms(kind, count) {
  const out = [];
  for (let i = 0; out.length < count; i++) {
    if (kind === 'saw') { const n = i + 1; out.push([n, ((n % 2 ? 1 : -1) * 2) / (n * Math.PI)]); }
    else {
      const n = 2 * i + 1;
      out.push([n, kind === 'square' ? 4 / (n * Math.PI) : ((i % 2 ? -1 : 1) * 8) / (Math.PI * Math.PI * n * n)]);
    }
  }
  return out;
}
// The ideal shape each series is heading for, one period over t ∈ [0, 2π).
export function target(kind, t) {
  const u = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (kind === 'square') return u < Math.PI ? 1 : -1;
  if (kind === 'saw') return u < Math.PI ? u / Math.PI : u / Math.PI - 2;
  return u < Math.PI / 2 ? (2 * u) / Math.PI : u < (3 * Math.PI) / 2 ? 2 - (2 * u) / Math.PI : (2 * u) / Math.PI - 4;
}

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const canvas = h('canvas', { style: 'display:block;width:100%;height:300px' });
  const formula = h('div', { style: 'font:600 .95rem "JetBrains Mono",ui-monospace,monospace;color:var(--fg);padding:8px 12px 0;overflow-x:auto;white-space:nowrap' });
  const count = h('input', { type: 'range', min: 1, max: 30, value: 1, style: 'width:140px' });
  const countOut = h('output', { style: 'min-width:5.5em;font-variant-numeric:tabular-nums;color:var(--fg);font-weight:600' });
  const seg = h('div', { className: 'seg' });
  const kinds = [['square', 'Дөрвөлжин'], ['saw', 'Хөрөө'], ['triangle', 'Гурвалжин']];
  const kindBtns = kinds.map(([k, t]) => h('button', { textContent: t, onclick: () => { kind = k; sync(); } }));
  seg.append(...kindBtns);
  const parts = h('input', { type: 'checkbox', checked: true });
  root.append(canvas, formula, h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:8px 12px 12px' },
    h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--muted)' }, 'Долгионы тоо', count, countOut),
    seg, h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, parts, 'Долгион бүрийг тусад нь')));

  const ctx = canvas.getContext('2d');
  let kind = 'square', t = 0, raf = 0, last = performance.now(), W = 1, H = 1;
  const trail = []; // {y, t}: the tip's height and the time it was there
  const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2'];
  // Exact series, written the way a textbook would: a constant times sines with friendly fractions.
  const FRONT = { square: '4/π', saw: '2/π', triangle: '8/π²' };
  const fracStr = m => {
    for (let d = 1; d <= 900; d++) { const n = Math.round(m * d); if (Math.abs(m * d - n) < 1e-6) return d === 1 ? `${n}` : `${n}/${d}`; }
    return m.toFixed(2);
  };
  function sync() {
    kindBtns.forEach((b, i) => b.setAttribute('aria-selected', String(kinds[i][0] === kind)));
    countOut.textContent = `${count.value} sin`;
    const ts = terms(kind, +count.value), a1 = ts[0][1];
    const body = ts.slice(0, 5).map(([n, a], i) => {
      const rel = a / a1, f = fracStr(Math.abs(rel)), term = `${f === '1' ? '' : `${f}·`}sin(${n === 1 ? '' : n}t)`;
      return i ? ` ${rel < 0 ? '−' : '+'} ${term}` : term;
    }).join('');
    formula.textContent = `${FRONT[kind]} · [ ${body}${ts.length > 5 ? ' + …' : ''} ]`;
    trail.length = 0;
  }
  count.oninput = sync;

  const ro = new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
  ro.observe(canvas);

  function frame(now) {
    // Not on screen (hidden pane, closed dialog, scrolled away): skip the work until it is visible again.
    if (root.closest('[data-offscreen]')) { last = now; raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; t += dt * 1.6;
    const css = getComputedStyle(root), fg = css.getPropertyValue('--fg').trim() || '#000', muted = css.getPropertyValue('--muted').trim() || '#888';
    ctx.clearRect(0, 0, W, H);
    const scale = Math.min(H * 0.32, W * 0.12), cx = Math.min(W * 0.2, scale * 1.6 + 10), cy = H / 2, waveX = cx + scale * 1.5 + 20;
    const ts = terms(kind, +count.value);

    // Circles: each term is a circle of radius |amplitude| spinning n times as fast; stack them tip to tip.
    let x = cx, y = cy;
    ts.forEach(([n, a], i) => {
      const r = Math.abs(a) * scale, ang = n * t + (a < 0 ? Math.PI : 0);
      const nx = x + r * Math.cos(ang), ny = y - r * Math.sin(ang);
      ctx.strokeStyle = i < COLORS.length && parts.checked ? COLORS[i] : muted; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      x = nx; y = ny;
    });
    ctx.globalAlpha = 1;

    // The tip's height joins the wave on the right; the newest point is at the wave's left edge.
    trail.unshift({ y, t });
    const maxLen = Math.max(10, Math.floor(W - waveX));
    if (trail.length > maxLen) trail.length = maxLen;
    ctx.strokeStyle = muted; ctx.globalAlpha = 0.5; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(waveX, y); ctx.stroke(); ctx.setLineDash([]);
    // Axis and the ideal target shape (dashed) to compare against.
    ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(waveX, cy); ctx.lineTo(W, cy); ctx.stroke();
    ctx.setLineDash([5, 5]); ctx.beginPath();
    for (let i = 0; i < trail.length; i++) { const v = target(kind, trail[i].t); i ? ctx.lineTo(waveX + i, cy - v * scale) : ctx.moveTo(waveX, cy - v * scale); }
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    // Each sine on its own, faint, so the sum can be seen as "these added together".
    if (parts.checked) ts.slice(0, COLORS.length).forEach(([n, a], k) => {
      ctx.strokeStyle = COLORS[k]; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.3; ctx.beginPath();
      for (let i = 0; i < trail.length; i += 2) { const v = a * Math.sin(n * trail[i].t); i ? ctx.lineTo(waveX + i, cy - v * scale) : ctx.moveTo(waveX, cy - v * scale); }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = fg; ctx.lineWidth = 2.5; ctx.beginPath();
    trail.forEach((p, i) => (i ? ctx.lineTo(waveX + i, p.y) : ctx.moveTo(waveX, p.y)));
    ctx.stroke();
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill();
    raf = requestAnimationFrame(frame);
  }
  sync();
  raf = requestAnimationFrame(frame);
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
