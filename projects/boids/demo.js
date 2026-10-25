// Boids (Craig Reynolds, 1986): flocking from three local rules — separation, alignment, cohesion.
const MAX_FORCE = 260; // px/s² cap on how hard a boid can steer

// Steering toward a desired direction: desired velocity minus current velocity, capped at MAX_FORCE.
function steer(b, dx, dy, maxSpeed) {
  const len = Math.hypot(dx, dy);
  if (!len) return [0, 0];
  let sx = (dx / len) * maxSpeed - b.vx, sy = (dy / len) * maxSpeed - b.vy;
  const f = Math.hypot(sx, sy);
  if (f > MAX_FORCE) { sx *= MAX_FORCE / f; sy *= MAX_FORCE / f; }
  return [sx, sy];
}

// One simulation step. Neighbours come from a spatial hash with cells as large as the perception radius,
// so each boid only checks the 3×3 cells around it instead of the whole flock.
export function update(boids, p, W, H, dt, pointer) {
  const cell = p.radius, cols = Math.max(1, Math.ceil(W / cell)), rows = Math.max(1, Math.ceil(H / cell));
  const buckets = new Map();
  for (const b of boids) {
    const k = Math.min(cols - 1, (b.x / cell) | 0) + Math.min(rows - 1, (b.y / cell) | 0) * cols;
    (buckets.get(k) || buckets.set(k, []).get(k)).push(b);
  }
  for (const b of boids) {
    let n = 0, ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0;
    const bx = (b.x / cell) | 0, by = (b.y / cell) | 0;
    b.near = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const list = buckets.get(((bx + ox + cols) % cols) + ((by + oy + rows) % rows) * cols);
      if (list) for (const o of list) {
        if (o === b) continue;
        // Shortest offset across the wrapped edges.
        let dx = o.x - b.x, dy = o.y - b.y;
        if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
        if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
        const d2 = dx * dx + dy * dy;
        if (d2 > p.radius * p.radius || d2 === 0) continue;
        n++; b.near.push(o);
        ax += o.vx; ay += o.vy;
        cx += dx; cy += dy;
        if (d2 < (p.radius * 0.45) ** 2) { sx -= dx / d2; sy -= dy / d2; } // closer neighbours push harder (1/d)
      }
    }
    let fx = 0, fy = 0;
    b.forces = null;
    if (n) {
      const sep = steer(b, sx, sy, p.maxSpeed), ali = steer(b, ax / n, ay / n, p.maxSpeed), coh = steer(b, cx / n, cy / n, p.maxSpeed);
      b.forces = { sep, ali, coh };
      fx += p.sep * sep[0] + p.ali * ali[0] + p.coh * coh[0];
      fy += p.sep * sep[1] + p.ali * ali[1] + p.coh * coh[1];
    }
    // The pointer is a predator to flee from or food to fly toward.
    if (pointer && p.mode !== 'none') {
      const dx = pointer.x - b.x, dy = pointer.y - b.y, d = Math.hypot(dx, dy);
      if (d < 150) {
        const [px, py] = steer(b, p.mode === 'predator' ? -dx : dx, p.mode === 'predator' ? -dy : dy, p.maxSpeed);
        const k = p.mode === 'predator' ? 3 * (1 - d / 150) : 1;
        fx += px * k; fy += py * k;
      }
    }
    b.ax = fx; b.ay = fy;
  }
  for (const b of boids) {
    b.vx += b.ax * dt; b.vy += b.ay * dt;
    const s = Math.hypot(b.vx, b.vy), lo = p.maxSpeed * 0.4;
    if (s > p.maxSpeed) { b.vx *= p.maxSpeed / s; b.vy *= p.maxSpeed / s; }
    else if (s < lo && s > 0) { b.vx *= lo / s; b.vy *= lo / s; }
    b.x = (b.x + b.vx * dt + W) % W; b.y = (b.y + b.vy * dt + H) % H;
  }
}

// Boid shapes, drawn in the boid's own frame (+x = forward) with the current fill colour.
// `t` is time plus the boid's own phase, so wings and tails don't all move in lockstep.
const SKINS = {
  arrow(ctx) {
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, 4.5); ctx.lineTo(-3, 0); ctx.lineTo(-6, -4.5); ctx.closePath(); ctx.fill();
  },
  // Seen from above, gull-style: long wings swept back from a bent wrist, slim body, small head
  // and a short fan tail. Flapping foreshortens the wings, so their span shrinks on the downstroke.
  bird(ctx, t) {
    const k = 0.5 + 0.5 * Math.cos(t * 9), span = 6 + 7 * k, sweep = 2.5 * (1 - k);
    ctx.beginPath();
    for (const s of [1, -1]) {
      ctx.moveTo(2.2, s * 0.8);                                   // shoulder, leading edge
      ctx.quadraticCurveTo(2, s * span * 0.45, 0.6, s * span * 0.55); // to the wrist
      ctx.quadraticCurveTo(-1, s * span * 0.85, -3.5 - sweep, s * span); // out to the swept-back tip
      ctx.quadraticCurveTo(-2.2, s * span * 0.55, -1.8, s * span * 0.45); // trailing edge back in
      ctx.quadraticCurveTo(-2.2, s * 1.5, -2.4, s * 0.8);          // wing root
      ctx.closePath();
    }
    ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, 5, 1.4, 0, 0, 2 * Math.PI); ctx.fill();           // body
    ctx.beginPath(); ctx.ellipse(5.2, 0, 1.7, 1.2, 0, 0, 2 * Math.PI); ctx.fill();       // head
    ctx.beginPath(); ctx.moveTo(6.6, -0.5); ctx.lineTo(8.4, 0); ctx.lineTo(6.6, 0.5); ctx.fill(); // beak
    ctx.beginPath(); ctx.moveTo(-4.2, -0.9); ctx.lineTo(-8, -2.2); ctx.lineTo(-8, 2.2); ctx.lineTo(-4.2, 0.9); ctx.closePath(); ctx.fill(); // tail
  },
  // Side-on fish shape with a tail fin that swings from side to side, and an eye.
  fish(ctx, t) {
    const wag = 0.55 * Math.sin(t * 8);
    ctx.beginPath(); ctx.moveTo(9, 0);
    ctx.quadraticCurveTo(3, -5.5, -5, -1.2); ctx.lineTo(-5, 1.2); ctx.quadraticCurveTo(3, 5.5, 9, 0); ctx.fill();
    ctx.save(); ctx.translate(-4.5, 0); ctx.rotate(wag);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6, -4.5); ctx.quadraticCurveTo(-4, 0, -6, 4.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(2, -3.6); ctx.lineTo(-1.5, -6); ctx.lineTo(-2, -2.6); ctx.closePath(); ctx.fill(); // dorsal fin
    const fill = ctx.fillStyle;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5.2, -1, 1.2, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = fill;
  },
};

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const wrap = h('div', { style: 'position:relative;flex:1;min-height:260px;overflow:hidden' });
  const canvas = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;touch-action:none' });
  const hud = h('div', { style: 'position:absolute;top:8px;left:12px;font-size:.8rem;color:var(--muted);pointer-events:none' });
  wrap.append(canvas, hud);

  const P = { sep: 1.6, ali: 1.0, coh: 0.9, radius: 55, maxSpeed: 150, count: 180, mode: 'predator', skin: 'bird' };
  const slider = (label, key, min, max, step, fmt = v => v) => {
    const out = h('output', { style: 'min-width:2.6em;font-variant-numeric:tabular-nums;color:var(--fg)' });
    const input = h('input', { type: 'range', min, max, step, value: P[key], style: 'width:90px' });
    const set = () => { P[key] = +input.value; out.textContent = fmt(P[key]); if (key === 'count') setCount(); };
    input.oninput = set; out.textContent = fmt(P[key]);
    return h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, label, input, out);
  };
  const dot = c => h('span', { style: `display:inline-block;width:9px;height:9px;border-radius:50%;background:${c}` });
  const seg = (items, onPick) => {
    const box = h('div', { className: 'seg' });
    const btns = items.map(([k, t]) => h('button', { textContent: t, onclick: () => onPick(k) }));
    box.append(...btns);
    return { box, set: k => btns.forEach((b, i) => b.setAttribute('aria-selected', String(items[i][0] === k))) };
  };
  const modeSeg = seg([['predator', 'Махчин 🦅'], ['food', 'Хоол 🍞'], ['none', 'Юу ч биш']], k => { P.mode = k; modeSeg.set(k); });
  const skinSeg = seg([['bird', 'Шувуу 🐦'], ['fish', 'Загас 🐟'], ['arrow', 'Сум ➤']], k => { P.skin = k; skinSeg.set(k); });
  const play = h('button', { className: 'btn', style: 'min-width:120px;justify-content:center', onclick: () => { paused = !paused; sync(); } });
  const check = (label, on) => { const c = h('input', { type: 'checkbox', checked: on }); return [c, h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, c, label)]; };
  const [focusBox, focusLabel] = check('Нэг boid-ийг задлан харах', true);
  const [trailBox, trailLabel] = check('Мөр (trail)', false);
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center' }, ...kids);
  const controls = h('div', { style: 'display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-top:1px solid var(--line)' },
    row(play, h('button', { className: 'btn', textContent: 'Шинээр', onclick: () => spawn() }), slider('Тоо', 'count', 10, 500, 10), slider('Хурд', 'maxSpeed', 40, 300, 10)),
    row(h('span', { style: 'display:flex;align-items:center;gap:6px' }, dot('#ef4444'), slider('Separation', 'sep', 0, 4, 0.1, v => v.toFixed(1))),
      h('span', { style: 'display:flex;align-items:center;gap:6px' }, dot('#22c55e'), slider('Alignment', 'ali', 0, 4, 0.1, v => v.toFixed(1))),
      h('span', { style: 'display:flex;align-items:center;gap:6px' }, dot('#3b82f6'), slider('Cohesion', 'coh', 0, 4, 0.1, v => v.toFixed(1))),
      slider('Радиус', 'radius', 20, 120, 5)),
    row(h('span', { textContent: 'Хулгана:', style: 'font-size:.85rem;color:var(--muted)' }), modeSeg.box,
      h('span', { style: 'display:flex;align-items:center;gap:8px' }, h('span', { textContent: 'Skin:', style: 'font-size:.85rem;color:var(--muted)' }), skinSeg.box)),
    row(focusLabel, trailLabel));
  root.append(wrap, controls);

  const ctx = canvas.getContext('2d');
  let boids = [], W = 1, H = 1, paused = false, raf = 0, last = performance.now(), pointer = null;

  const make = () => {
    const a = Math.random() * 2 * Math.PI;
    return { x: Math.random() * W, y: Math.random() * H, vx: Math.cos(a) * P.maxSpeed * 0.7, vy: Math.sin(a) * P.maxSpeed * 0.7, ax: 0, ay: 0, near: [], forces: null, phase: Math.random() * 2 * Math.PI };
  };
  function spawn() { boids = Array.from({ length: P.count }, make); }
  function setCount() {
    while (boids.length < P.count) boids.push(make());
    boids.length = P.count;
  }
  function sync() { play.textContent = paused ? '▶ Үргэлжлүүлэх' : '❚❚ Зогсоох'; }

  function resize() {
    const r = wrap.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    const first = W === 1;
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (first) spawn(); else for (const b of boids) { b.x %= W; b.y %= H; }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  canvas.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  canvas.addEventListener('pointerleave', () => { pointer = null; });
  canvas.addEventListener('pointerdown', e => { const r = canvas.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; });

  function draw() {
    const css = getComputedStyle(root), fg = css.getPropertyValue('--fg').trim() || '#000', card = css.getPropertyValue('--card').trim() || '#fff';
    // With trails on, paint a translucent background instead of clearing, so old frames fade out.
    if (trailBox.checked) { ctx.globalAlpha = 0.18; ctx.fillStyle = card; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    else ctx.clearRect(0, 0, W, H);
    // A faint sky or water tint behind birds and fish.
    if (P.skin !== 'arrow') {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      if (P.skin === 'fish') { g.addColorStop(0, 'hsl(195 85% 55% / .10)'); g.addColorStop(1, 'hsl(215 80% 35% / .22)'); }
      else { g.addColorStop(0, 'hsl(205 90% 65% / .14)'); g.addColorStop(1, 'hsl(205 90% 65% / 0)'); }
      ctx.fillStyle = g; ctx.globalAlpha = trailBox.checked ? 0.18 : 1; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    const t = performance.now() / 1000;

    const focus = focusBox.checked ? boids[0] : null;
    if (focus) {
      ctx.save();
      ctx.strokeStyle = fg; ctx.globalAlpha = 0.35; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(focus.x, focus.y, P.radius, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 0.25;
      // Neighbours across a wrapped edge are drawn at their wrapped offset, not across the whole screen.
      for (const o of focus.near) {
        let dx = o.x - focus.x, dy = o.y - focus.y;
        if (dx > W / 2) dx -= W; else if (dx < -W / 2) dx += W;
        if (dy > H / 2) dy -= H; else if (dy < -H / 2) dy += H;
        ctx.beginPath(); ctx.moveTo(focus.x, focus.y); ctx.lineTo(focus.x + dx, focus.y + dy); ctx.stroke();
      }
      ctx.restore();
    }

    for (const b of boids) {
      const a = Math.atan2(b.vy, b.vx), isFocus = b === focus, near = focus && focus.near.includes(b);
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
      // Colour by heading, so groups flying the same way share a colour.
      ctx.fillStyle = isFocus ? fg : `hsl(${((a * 180) / Math.PI + 360) % 360} 75% ${near ? 45 : 55}%)`;
      ctx.globalAlpha = focus && !isFocus && !near ? 0.55 : 1;
      const s = isFocus ? 1.6 : 1;
      ctx.scale(s, s);
      (SKINS[P.skin] || SKINS.arrow)(ctx, t * (paused ? 0 : 1) + b.phase);
      ctx.restore();
    }

    // The focused boid's three steering forces, scaled by their weights.
    if (focus && focus.forces) {
      const arrow = ([fx, fy], w, col) => {
        const k = (0.22 * w), ex = focus.x + fx * k, ey = focus.y + fy * k;
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(focus.x, focus.y); ctx.lineTo(ex, ey); ctx.stroke();
        const a = Math.atan2(ey - focus.y, ex - focus.x);
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 8 * Math.cos(a - 0.4), ey - 8 * Math.sin(a - 0.4)); ctx.lineTo(ex - 8 * Math.cos(a + 0.4), ey - 8 * Math.sin(a + 0.4)); ctx.fill();
      };
      arrow(focus.forces.sep, P.sep, '#ef4444'); arrow(focus.forces.ali, P.ali, '#22c55e'); arrow(focus.forces.coh, P.coh, '#3b82f6');
    }

    if (pointer && P.mode !== 'none') {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = P.mode === 'predator' ? '#ef4444' : '#16a34a'; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 150, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
      ctx.font = '22px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(P.mode === 'predator' ? '🦅' : '🍞', pointer.x, pointer.y);
    }
    hud.textContent = `${boids.length} boid${focus ? ` · Хар boid-ийн хөрш: ${focus.near.length}` : ''}${paused ? ' · ❚❚' : ''}`;
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (!paused) update(boids, P, W, H, dt, pointer);
    draw();
    raf = requestAnimationFrame(frame);
  }

  modeSeg.set(P.mode); skinSeg.set(P.skin); sync(); resize();
  raf = requestAnimationFrame(frame);
  // Stop animating once the demo is removed from the page.
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
