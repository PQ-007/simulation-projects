// Ray casting, Wolfenstein-3D style: one ray per screen column, walked through the grid with DDA.
const MAP_W = 16, MAP_H = 16;
const LEVEL = [
  '1111111111111111',
  '1000000000000002',
  '1011100000330002',
  '1010000000030002',
  '1010000000030002',
  '1000000400000002',
  '1000000400000002',
  '1000000444400002',
  '1000000000000002',
  '1033300000000002',
  '1000300002220002',
  '1000300002000002',
  '1000000002000002',
  '1000000000000002',
  '1000000000000002',
  '1111111111111111',
];
const WALL_COLORS = { 1: '#b45309', 2: '#64748b', 3: '#2563eb', 4: '#16a34a' };

// Cast one ray from (px, py) in direction (dx, dy) with DDA: step to whichever grid line (x or y) is
// nearer, cell by cell, until a wall. Returns the perpendicular distance, which side was hit and where.
export function castRay(grid, px, py, dx, dy) {
  let mx = Math.floor(px), my = Math.floor(py);
  const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx), ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  let sdx = (dx < 0 ? px - mx : mx + 1 - px) * ddx, sdy = (dy < 0 ? py - my : my + 1 - py) * ddy;
  let side = 0, steps = 0;
  for (; steps < 64; steps++) {
    if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
    if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H || grid[my * MAP_W + mx] > 0) break;
  }
  const dist = side === 0 ? sdx - ddx : sdy - ddy;
  const wallX = side === 0 ? py + dist * dy : px + dist * dx; // where along the wall face it hit, for texturing
  return { dist, side, cell: grid[my * MAP_W + mx] || 1, hx: px + dx * dist, hy: py + dy * dist, u: wallX - Math.floor(wallX), steps: steps + 1 };
}

// Small procedural textures, one per wall type.
function makeTextures() {
  const tex = {};
  const mk = draw => { const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }); draw(c.getContext('2d')); return c; };
  tex[1] = mk(g => { // brick
    g.fillStyle = '#7c2d12'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#b45309';
    for (let r = 0; r < 8; r++) for (let c = -1; c < 4; c++) g.fillRect(c * 16 + (r % 2) * 8 + 1, r * 8 + 1, 14, 6);
  });
  tex[2] = mk(g => { // stone blocks
    g.fillStyle = '#334155'; g.fillRect(0, 0, 64, 64);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { g.fillStyle = `hsl(215 14% ${42 + ((r * 3 + c) * 7) % 14}%)`; g.fillRect(c * 22 + (r % 2) * 10 - 5, r * 16 + 1, 20, 14); }
  });
  tex[3] = mk(g => { // blue tiles
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = (r + c) % 2 ? '#1d4ed8' : '#3b82f6'; g.fillRect(c * 16, r * 16, 16, 16); }
    g.strokeStyle = '#dbeafe'; g.lineWidth = 1; for (let i = 0; i <= 64; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
  });
  tex[4] = mk(g => { // wooden planks
    for (let c = 0; c < 4; c++) { g.fillStyle = c % 2 ? '#15803d' : '#16a34a'; g.fillRect(c * 16, 0, 16, 64); }
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let c = 0; c < 4; c++) { g.fillRect(c * 16, 0, 1, 64); g.fillRect(c * 16 + 7, (c * 23) % 64, 2, 6); }
  });
  return tex;
}

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  root.tabIndex = 0;
  root.style.outline = 'none';
  const stage = h('div', { style: 'flex:1;min-height:0;display:flex;flex-wrap:wrap;gap:10px;padding:10px;align-content:flex-start;overflow:auto' });
  const mapBox = h('div', { style: 'flex:0 1 300px;min-width:200px;aspect-ratio:1;position:relative' });
  const viewBox = h('div', { style: 'flex:1 1 360px;min-width:260px;aspect-ratio:16/10;position:relative;border-radius:8px;overflow:hidden' });
  const mapCv = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;border-radius:8px;cursor:pointer' });
  const viewCv = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;cursor:ew-resize;touch-action:none' });
  const hud = h('div', { style: 'position:absolute;left:8px;top:6px;font-size:.78rem;color:#fff;text-shadow:0 1px 3px #000;pointer-events:none;font-variant-numeric:tabular-nums' });
  mapBox.append(mapCv); viewBox.append(viewCv, hud);
  stage.append(mapBox, viewBox);

  const P = { fov: 66, rays: 240 };
  const slider = (label, key, min, max, step, fmt = v => v) => {
    const out = h('output', { style: 'min-width:2.6em;font-variant-numeric:tabular-nums;color:var(--fg)' });
    const input = h('input', { type: 'range', min, max, step, value: P[key], style: 'width:96px' });
    input.oninput = () => { P[key] = +input.value; out.textContent = fmt(P[key]); };
    out.textContent = fmt(P[key]);
    return h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, label, input, out);
  };
  const check = (label, on) => { const c = h('input', { type: 'checkbox', checked: on }); return [c, h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, c, label)]; };
  const [texBox, texLabel] = check('Texture', true);
  const [fishBox, fishLabel] = check('Fisheye (засваргүй)', false);
  // Hold-to-move buttons for touch screens.
  const keys = new Set();
  const hold = (label, key) => {
    const b = h('button', { className: 'btn btn-sm', textContent: label, style: 'min-width:38px;justify-content:center;touch-action:none' });
    b.addEventListener('pointerdown', e => { keys.add(key); b.setPointerCapture(e.pointerId); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => keys.delete(key));
    return b;
  };
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center' }, ...kids);
  const controls = h('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:10px 14px;border-top:1px solid var(--line)' },
    row(h('span', { style: 'display:flex;gap:4px' }, hold('⟲', 'ArrowLeft'), hold('↑', 'KeyW'), hold('↓', 'KeyS'), hold('⟳', 'ArrowRight')),
      h('span', { textContent: 'WASD / сум · 3D дээр чирж эргэ · Map дээр дарж хана нэм/хас', style: 'font-size:.8rem;color:var(--muted)' })),
    row(slider('Ray-ийн тоо', 'rays', 8, 480, 8), slider('FOV', 'fov', 30, 120, 2, v => `${v}°`), texLabel, fishLabel));
  root.append(stage, controls);

  const grid = new Uint8Array(MAP_W * MAP_H);
  LEVEL.forEach((r, y) => [...r].forEach((c, x) => { grid[y * MAP_W + x] = +c; }));
  const textures = makeTextures();
  const me = { x: 2.5, y: 14.2, a: -0.5 }; // bottom-left corner, looking across the room
  const mctx = mapCv.getContext('2d'), vctx = viewCv.getContext('2d');
  let hover = -1, raf = 0, last = performance.now(), hits = [];

  const fit = (cv, box) => {
    const r = box.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    cv.width = Math.max(1, r.width * dpr); cv.height = Math.max(1, r.height * dpr);
    cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    return [r.width, r.height];
  };
  let mapSize = [1, 1], viewSize = [1, 1];
  const ro = new ResizeObserver(() => { mapSize = fit(mapCv, mapBox); viewSize = fit(viewCv, viewBox); });
  ro.observe(mapBox); ro.observe(viewBox);

  // Player movement with simple collision: only move along an axis if the destination cell is open.
  function move(dt) {
    const turn = (keys.has('ArrowLeft') || keys.has('KeyQ') ? -1 : 0) + (keys.has('ArrowRight') || keys.has('KeyE') ? 1 : 0);
    me.a += turn * 2.2 * dt;
    const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sp = 2.6 * dt, dx = (Math.cos(me.a) * fwd - Math.sin(me.a) * strafe) * sp, dy = (Math.sin(me.a) * fwd + Math.cos(me.a) * strafe) * sp;
    const free = (x, y) => grid[Math.floor(y) * MAP_W + Math.floor(x)] === 0;
    if (free(me.x + dx + Math.sign(dx) * 0.2, me.y)) me.x += dx;
    if (free(me.x, me.y + dy + Math.sign(dy) * 0.2)) me.y += dy;
  }

  function render() {
    const [W, H] = viewSize, n = P.rays;
    // Camera: a direction vector plus a perpendicular "plane" whose length sets the field of view.
    const dirX = Math.cos(me.a), dirY = Math.sin(me.a), k = Math.tan((P.fov * Math.PI) / 360), plX = -dirY * k, plY = dirX * k;
    const ceil = vctx.createLinearGradient(0, 0, 0, H / 2); ceil.addColorStop(0, '#0f172a'); ceil.addColorStop(1, '#475569');
    const floor = vctx.createLinearGradient(0, H / 2, 0, H); floor.addColorStop(0, '#3f3f46'); floor.addColorStop(1, '#a8a29e');
    vctx.fillStyle = ceil; vctx.fillRect(0, 0, W, H / 2); vctx.fillStyle = floor; vctx.fillRect(0, H / 2, W, H / 2);
    hits = [];
    const colW = W / n;
    vctx.imageSmoothingEnabled = false; // crisp, blocky texels like the original
    for (let i = 0; i < n; i++) {
      const cam = (2 * (i + 0.5)) / n - 1, rx = dirX + plX * cam, ry = dirY + plY * cam;
      const hit = castRay(grid, me.x, me.y, rx, ry);
      hits.push(hit);
      // Perpendicular distance keeps walls straight; the true (Euclidean) distance bends them into a fisheye.
      const d = fishBox.checked ? hit.dist * Math.hypot(rx, ry) : hit.dist;
      // Columns snap to whole pixels so neighbours never overlap (overlaps showed as dark seams).
      const lineH = H / Math.max(d, 0.05), top = H / 2 - lineH / 2, x = Math.round(i * colW), cw = Math.max(1, Math.round((i + 1) * colW) - x);
      if (texBox.checked) {
        let tx = Math.floor(hit.u * 64);
        if ((hit.side === 0 && rx > 0) || (hit.side === 1 && ry < 0)) tx = 63 - tx;
        vctx.drawImage(textures[hit.cell] || textures[1], tx, 0, 1, 64, x, top, cw, lineH);
      } else {
        vctx.fillStyle = WALL_COLORS[hit.cell] || '#888'; vctx.fillRect(x, top, cw, lineH);
      }
      // y-facing walls a bit darker (cheap lighting), and fog that grows with distance.
      const shade = (hit.side ? 0.28 : 0) + Math.min(0.6, d / 14);
      vctx.fillStyle = `rgba(0,0,0,${shade})`; vctx.fillRect(x, top, cw, lineH);
    }
    if (hover >= 0 && hover < n) {
      vctx.strokeStyle = '#fde047'; vctx.lineWidth = 2;
      const hl = H / Math.max(fishBox.checked ? hits[hover].dist * Math.hypot(dirX + plX * ((2 * (hover + 0.5)) / n - 1), dirY + plY * ((2 * (hover + 0.5)) / n - 1)) : hits[hover].dist, 0.05);
      vctx.strokeRect(hover * colW + 1, H / 2 - hl / 2, Math.max(2, colW - 2), hl);
      hud.textContent = `Ray ${hover + 1} / ${n} · зай ${hits[hover].dist.toFixed(2)} · ${hits[hover].steps} нүд шалгав · багана өндөр ${Math.round(hl)}px`;
    } else hud.textContent = `${n} ray · 1 ray = 1 багана · FOV ${P.fov}°`;
    drawMap(dirX, dirY);
  }

  function drawMap() {
    const [W, H] = mapSize, s = Math.min(W / MAP_W, H / MAP_H);
    const css = getComputedStyle(root), card = css.getPropertyValue('--card').trim() || '#fff', line = css.getPropertyValue('--line').trim() || '#ddd';
    mctx.clearRect(0, 0, W, H);
    mctx.fillStyle = card; mctx.fillRect(0, 0, MAP_W * s, MAP_H * s);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const c = grid[y * MAP_W + x];
      if (c) { mctx.fillStyle = WALL_COLORS[c]; mctx.fillRect(x * s, y * s, s, s); }
    }
    mctx.strokeStyle = line; mctx.lineWidth = 1; mctx.beginPath();
    for (let i = 0; i <= MAP_W; i++) { mctx.moveTo(i * s + 0.5, 0); mctx.lineTo(i * s + 0.5, MAP_H * s); mctx.moveTo(0, i * s + 0.5); mctx.lineTo(MAP_W * s, i * s + 0.5); }
    mctx.stroke();
    // Every ray (thinned out when there are many), then the hovered one on top.
    const every = Math.max(1, Math.ceil(hits.length / 90));
    mctx.strokeStyle = 'rgba(250,204,21,.45)'; mctx.lineWidth = 1; mctx.beginPath();
    hits.forEach((ht, i) => { if (i % every === 0 || i === hits.length - 1) { mctx.moveTo(me.x * s, me.y * s); mctx.lineTo(ht.hx * s, ht.hy * s); } });
    mctx.stroke();
    if (hover >= 0 && hits[hover]) {
      const ht = hits[hover];
      mctx.strokeStyle = '#facc15'; mctx.lineWidth = 3; mctx.beginPath(); mctx.moveTo(me.x * s, me.y * s); mctx.lineTo(ht.hx * s, ht.hy * s); mctx.stroke();
      mctx.fillStyle = '#facc15'; mctx.beginPath(); mctx.arc(ht.hx * s, ht.hy * s, 4, 0, 2 * Math.PI); mctx.fill();
    }
    mctx.fillStyle = '#dc2626'; mctx.beginPath(); mctx.arc(me.x * s, me.y * s, s * 0.32, 0, 2 * Math.PI); mctx.fill();
    mctx.strokeStyle = '#dc2626'; mctx.lineWidth = 2; mctx.beginPath(); mctx.moveTo(me.x * s, me.y * s); mctx.lineTo((me.x + Math.cos(me.a) * 0.8) * s, (me.y + Math.sin(me.a) * 0.8) * s); mctx.stroke();
  }

  // Input: keyboard while the demo has focus, drag on the 3D view to turn, click the map to edit walls.
  root.addEventListener('keydown', e => {
    if (e.target.closest('input')) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { keys.add(e.code); e.preventDefault(); e.stopPropagation(); }
  });
  root.addEventListener('keyup', e => keys.delete(e.code));
  root.addEventListener('blur', () => keys.clear());
  root.addEventListener('pointerdown', () => root.focus({ preventScroll: true }));
  let turnDrag = null;
  viewCv.addEventListener('pointerdown', e => { turnDrag = { x: e.clientX, a: me.a }; viewCv.setPointerCapture(e.pointerId); });
  viewCv.addEventListener('pointermove', e => {
    const r = viewCv.getBoundingClientRect();
    hover = Math.floor(((e.clientX - r.left) / r.width) * P.rays);
    if (turnDrag) me.a = turnDrag.a + (e.clientX - turnDrag.x) * 0.008;
  });
  viewCv.addEventListener('pointerup', () => { turnDrag = null; });
  viewCv.addEventListener('pointerleave', () => { if (!turnDrag) hover = -1; });
  mapCv.addEventListener('pointerdown', e => {
    const r = mapCv.getBoundingClientRect(), s = Math.min(r.width / MAP_W, r.height / MAP_H);
    const x = Math.floor((e.clientX - r.left) / s), y = Math.floor((e.clientY - r.top) / s);
    if (x <= 0 || y <= 0 || x >= MAP_W - 1 || y >= MAP_H - 1) return; // keep the outer wall
    if (Math.floor(me.x) === x && Math.floor(me.y) === y) return;
    const i = y * MAP_W + x;
    grid[i] = (grid[i] + 1) % 5; // empty → brick → stone → tile → wood → empty
  });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    move(dt); render();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
