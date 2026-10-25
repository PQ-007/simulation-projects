// Real-world widget: procedural cave generation with a cellular automaton ("4-5 rule").
const W = 72, H = 40;

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const canvas = h('canvas', { style: 'display:block;width:100%;aspect-ratio:72/40;image-rendering:pixelated' });
  canvas.width = W; canvas.height = H;
  const status = h('span', { style: 'font-size:.85rem;color:var(--fg);min-width:11em' });
  const fill = h('input', { type: 'range', min: 35, max: 60, value: 45, style: 'width:90px' });
  const fillOut = h('output', { style: 'font-variant-numeric:tabular-nums;color:var(--fg)' });
  const stepBtn = h('button', { className: 'btn btn-sm', textContent: 'Smooth +1', onclick: () => { stop(); smooth(); } });
  const newBtn = h('button', { className: 'btn btn-sm', textContent: 'Шинэ агуй ▶', onclick: () => generate(true) });
  root.append(canvas, h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:10px 12px;border-top:1px solid var(--line)' },
    newBtn, stepBtn, h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, 'Ханын хувь', fill, fillOut), status));

  const ctx = canvas.getContext('2d');
  let grid = new Uint8Array(W * H), steps = 0, timer = 0;

  function draw() {
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      // Rock walls vs floor; floor gets a faint speckle so it reads as ground, not empty.
      const [r, g, b] = grid[i] ? [92, 74, 60] : (i * 7919) % 13 === 0 ? [222, 214, 196] : [236, 229, 212];
      img.data.set([r, g, b, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    status.textContent = steps ? `Smoothing: ${steps} алхам` : 'Санамсаргүй дуу чимээ (0 алхам)';
  }
  // A cell becomes wall when 5+ of the 9 cells around it (itself included) are walls; outside the map counts as wall.
  function smooth() {
    const next = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let walls = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        walls += nx < 0 || ny < 0 || nx >= W || ny >= H ? 1 : grid[ny * W + nx];
      }
      next[y * W + x] = walls >= 5 ? 1 : 0;
    }
    grid = next; steps++;
    draw();
  }
  function stop() { clearTimeout(timer); timer = 0; }
  // New random noise, then play five smoothing steps so the cave visibly "settles".
  function generate(animate) {
    stop();
    for (let i = 0; i < W * H; i++) grid[i] = Math.random() * 100 < +fill.value ? 1 : 0;
    steps = 0; draw();
    if (!animate) return;
    let n = 0;
    const tick = () => { smooth(); timer = ++n < 5 ? setTimeout(tick, 450) : 0; };
    timer = setTimeout(tick, 700);
  }
  fill.oninput = () => { fillOut.textContent = `${fill.value}%`; generate(true); };
  fillOut.textContent = `${fill.value}%`;
  generate(true);
  new MutationObserver((_, o) => { if (!root.isConnected) { stop(); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
}
