// Real-world widget: the same planet integrated two ways. Explicit Euler gains energy every step and
// spirals away; Verlet is time-symmetric (symplectic), so its orbit stays closed for as long as you watch.
const GM = 1, R0 = 1;

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const canvas = h('canvas', { style: 'display:block;width:100%;height:300px;touch-action:none' });
  const dtIn = h('input', { type: 'range', min: 0.02, max: 0.3, step: 0.01, value: 0.1, style: 'width:110px' });
  const dtOut = h('output', { style: 'min-width:2.6em;font-variant-numeric:tabular-nums;color:var(--fg)' });
  const status = h('span', { style: 'font-size:.85rem;color:var(--fg);font-variant-numeric:tabular-nums' });
  root.append(canvas, h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:10px 12px;border-top:1px solid var(--line)' },
    h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, 'Алхам dt', dtIn, dtOut),
    h('button', { className: 'btn btn-sm', textContent: '↺ Дахин', onclick: () => reset() }), status));

  const ctx = canvas.getContext('2d');
  let W = 1, H = 1, raf = 0, last = performance.now(), acc = 0, dt = 0.1, t = 0, euler, verlet;
  const E0 = -GM / (2 * R0); // energy of a circular orbit: v²/2 − GM/r

  function reset() {
    dt = +dtIn.value; dtOut.textContent = dt.toFixed(2); t = 0; acc = 0;
    const v = Math.sqrt(GM / R0);
    euler = { x: R0, y: 0, vx: 0, vy: v, trail: [], lost: false };
    // Verlet keeps the previous position instead of a velocity; start it one step back along the orbit.
    verlet = { x: R0, y: 0, px: R0 * Math.cos(-v * dt), py: R0 * Math.sin(-v * dt), trail: [] };
  }
  dtIn.oninput = reset;
  const acc2 = (x, y) => { const r = Math.hypot(x, y), k = -GM / (r * r * r); return [k * x, k * y]; };

  function stepOnce() {
    t += dt;
    if (!euler.lost) {
      // Explicit Euler: move with the old velocity, then update velocity with the old acceleration.
      const [ax, ay] = acc2(euler.x, euler.y);
      euler.x += euler.vx * dt; euler.y += euler.vy * dt;
      euler.vx += ax * dt; euler.vy += ay * dt;
      if (Math.hypot(euler.x, euler.y) > 3.2) euler.lost = true;
    }
    // Verlet: x_next = 2x − x_prev + a·dt²
    const [ax, ay] = acc2(verlet.x, verlet.y);
    const nx = 2 * verlet.x - verlet.px + ax * dt * dt, ny = 2 * verlet.y - verlet.py + ay * dt * dt;
    verlet.px = verlet.x; verlet.py = verlet.y; verlet.x = nx; verlet.y = ny;
    for (const b of [euler, verlet]) { b.trail.push(b.x, b.y); if (b.trail.length > 1600) b.trail.splice(0, 2); }
  }
  const energy = b => {
    const vx = b.vx ?? (b.x - b.px) / dt, vy = b.vy ?? (b.y - b.py) / dt;
    return (vx * vx + vy * vy) / 2 - GM / Math.hypot(b.x, b.y);
  };

  const ro = new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
  ro.observe(canvas);

  function draw() {
    const css = getComputedStyle(root), fg = css.getPropertyValue('--fg').trim() || '#000', muted = css.getPropertyValue('--muted').trim() || '#888';
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, s = Math.min(W, H) * 0.3;
    ctx.strokeStyle = muted; ctx.globalAlpha = 0.4; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.arc(cx, cy, R0 * s, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    const sun = ctx.createRadialGradient(cx, cy, 2, cx, cy, 14);
    sun.addColorStop(0, '#fde68a'); sun.addColorStop(1, '#f59e0b');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, 2 * Math.PI); ctx.fill();
    for (const [b, col] of [[euler, '#ef4444'], [verlet, '#3b82f6']]) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < b.trail.length; i += 2) {
        const x = cx + b.trail[i] * s, y = cy - b.trail[i + 1] * s;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx + b.x * s, cy - b.y * s, 6, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.font = '13px system-ui'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#ef4444'; ctx.fillText('● Euler', 12, 10);
    ctx.fillStyle = '#3b82f6'; ctx.fillText('● Verlet', 12, 28);
    ctx.fillStyle = fg;
    const pct = b => `${(((energy(b) - E0) / Math.abs(E0)) * 100).toFixed(1)}%`;
    status.textContent = `Тойрог: ${(t / (2 * Math.PI)).toFixed(1)} · Энергийн өөрчлөлт — Euler ${euler.lost ? 'зугтсан 🚀' : pct(euler)}, Verlet ${pct(verlet)}`;
  }

  function frame(now) {
    if (root.closest('[data-offscreen]')) { last = now; raf = requestAnimationFrame(frame); return; }
    // About one orbit every 4 seconds of real time, whatever dt is.
    acc = Math.min(acc + ((now - last) / 1000) * (2 * Math.PI / 4), 2);
    last = now;
    while (acc >= dt) { stepOnce(); acc -= dt; }
    draw();
    raf = requestAnimationFrame(frame);
  }
  reset();
  raf = requestAnimationFrame(frame);
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
