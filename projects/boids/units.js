// Real-world widget: RTS-style units ordered to one point, with and without boids separation.
const COUNT = 24, R = 7;

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const canvas = h('canvas', { style: 'display:block;width:100%;height:280px;cursor:crosshair;touch-action:none' });
  const sep = h('input', { type: 'checkbox', checked: true });
  const status = h('span', { style: 'font-size:.85rem;color:var(--fg);font-variant-numeric:tabular-nums' });
  root.append(canvas, h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding:10px 12px;border-top:1px solid var(--line)' },
    h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--fg)' }, sep, 'Separation (бие биенээ түлхэх)'),
    h('span', { textContent: 'Талбай дээр дарж нэгжүүдийг илгээ.', style: 'font-size:.85rem;color:var(--muted)' }), status));

  const ctx = canvas.getContext('2d');
  let W = 1, H = 1, raf = 0, last = performance.now(), target = null;
  const units = Array.from({ length: COUNT }, (_, i) => ({ x: 40 + (i % 6) * 22, y: 60 + ((i / 6) | 0) * 22, vx: 0, vy: 0 }));

  const ro = new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!target) target = { x: W * 0.72, y: H * 0.5 };
  });
  ro.observe(canvas);
  canvas.addEventListener('pointerdown', e => { const r = canvas.getBoundingClientRect(); target = { x: e.clientX - r.left, y: e.clientY - r.top }; });

  function update(dt) {
    for (const u of units) {
      // Seek with arrival: full speed far away, slowing down inside 60 px of the target.
      const dx = target.x - u.x, dy = target.y - u.y, d = Math.hypot(dx, dy) || 1;
      const speed = 120 * Math.min(1, d / 60);
      let ax = (dx / d) * speed - u.vx, ay = (dy / d) * speed - u.vy;
      if (sep.checked) for (const o of units) {
        if (o === u) continue;
        const ox = u.x - o.x, oy = u.y - o.y, od = Math.hypot(ox, oy);
        if (od > 0 && od < R * 2.6) { const push = (R * 2.6 - od) * 14; ax += (ox / od) * push; ay += (oy / od) * push; }
      }
      u.vx += ax * dt * 4; u.vy += ay * dt * 4;
      u.x += u.vx * dt; u.y += u.vy * dt;
    }
  }

  function draw() {
    const css = getComputedStyle(root), fg = css.getPropertyValue('--fg').trim() || '#000', line = css.getPropertyValue('--line').trim() || '#ddd';
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = line; ctx.globalAlpha = 0.6;
    for (let x = 0; x < W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // Target marker, like a move order in an RTS.
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(target.x, target.y, 10, 0, 2 * Math.PI); ctx.moveTo(target.x - 15, target.y); ctx.lineTo(target.x + 15, target.y); ctx.moveTo(target.x, target.y - 15); ctx.lineTo(target.x, target.y + 15); ctx.stroke();
    let overlaps = 0;
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) if (Math.hypot(units[i].x - units[j].x, units[i].y - units[j].y) < R * 1.6) overlaps++;
    for (const u of units) {
      ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.arc(u.x, u.y, R, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = fg; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
    }
    status.textContent = `Давхцсан хос: ${overlaps}`;
    status.style.color = overlaps > 10 ? '#dc2626' : 'var(--fg)';
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (target) { update(dt); draw(); }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
