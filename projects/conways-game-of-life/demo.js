// Conway's Game of Life on a fixed-size toroidal grid (edges wrap around).
const COLS = 96, ROWS = 64;

// Count live neighbours of every cell and apply B3/S23.
export function step(cells, cols, rows) {
  const next = new Uint8Array(cells.length);
  for (let y = 0; y < rows; y++) {
    const up = ((y - 1 + rows) % rows) * cols, mid = y * cols, down = ((y + 1) % rows) * cols;
    for (let x = 0; x < cols; x++) {
      const l = (x - 1 + cols) % cols, r = (x + 1) % cols;
      const n = cells[up + l] + cells[up + x] + cells[up + r]
              + cells[mid + l] +                cells[mid + r]
              + cells[down + l] + cells[down + x] + cells[down + r];
      next[mid + x] = n === 3 || (n === 2 && cells[mid + x]) ? 1 : 0;
    }
  }
  return next;
}

// Patterns in plaintext format: O = alive, . = dead.
const PATTERNS = {
  'Glider': ['.O.', '..O', 'OOO'],
  'Gosper gun': [
    '........................O...........',
    '......................O.O...........',
    '............OO......OO............OO',
    '...........O...O....OO............OO',
    'OO........O.....O...OO..............',
    'OO........O...O.OO....O.O...........',
    '..........O.....O.......O...........',
    '...........O...O....................',
    '............OO......................',
  ],
  'Pulsar': [
    '..OOO...OOO..', '.............', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '..OOO...OOO..', '.............',
    '..OOO...OOO..', 'O....O.O....O', 'O....O.O....O', 'O....O.O....O', '.............', '..OOO...OOO..',
  ],
  'R-pentomino': ['.OO', 'OO.', '.O.'],
};

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const wrap = h('div', { style: 'position:relative;flex:1;min-height:240px' });
  const canvas = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair' });
  wrap.append(canvas);

  const field = (label, input, out) => h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--muted)' }, label, input, ...(out ? [out] : []));
  const stat = () => h('b', { style: 'font-variant-numeric:tabular-nums;color:var(--fg);font-weight:600' });
  const play = h('button', { className: 'btn', style: 'min-width:120px;justify-content:center' });
  const stepBtn = h('button', { className: 'btn', textContent: 'Step', title: 'Нэг үе урагшлах' });
  const random = h('button', { className: 'btn', textContent: 'Random' });
  const clear = h('button', { className: 'btn', textContent: 'Clear' });
  const speed = h('input', { type: 'range', min: 1, max: 60, value: 12, style: 'width:110px' });
  const speedOut = h('output', { style: 'min-width:5em;font-variant-numeric:tabular-nums;color:var(--fg)' });
  const genOut = stat(), popOut = stat();
  const patternBtns = Object.keys(PATTERNS).map(name => h('button', { className: 'btn btn-sm', textContent: name, onclick: () => place(name) }));
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center' }, ...kids);
  const controls = h('div', { style: 'display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-top:1px solid var(--line)' },
    row(play, stepBtn, random, clear, field('Хурд', speed, speedOut),
      h('span', { style: 'font-size:.85rem;color:var(--muted);margin-left:auto' }, 'Үе ', genOut, ' · Амьд ', popOut)),
    row(h('span', { textContent: 'Pattern:', style: 'font-size:.85rem;color:var(--muted)' }), ...patternBtns,
      h('span', { textContent: 'Нүд дээр дарж, чирж зурна.', style: 'font-size:.8rem;color:var(--muted)' })));
  root.append(wrap, controls);

  const ctx = canvas.getContext('2d');
  let cells = new Uint8Array(COLS * ROWS), gen = 0, running = false, raf = 0, acc = 0, last = performance.now();
  let view = { w: 1, h: 1, size: 1, ox: 0, oy: 0 };

  function sync() {
    play.textContent = running ? '❚❚ Зогсоох' : '▶ Эхлүүлэх';
    speedOut.textContent = `${speed.value} үе/с`;
    genOut.textContent = gen;
    popOut.textContent = cells.reduce((a, b) => a + b, 0);
  }
  function reset(fill) {
    cells = new Uint8Array(COLS * ROWS);
    if (fill) cells.forEach((_, i) => { cells[i] = Math.random() < 0.28 ? 1 : 0; });
    gen = 0;
    patternBtns.forEach(b => b.setAttribute('aria-pressed', 'false'));
    sync();
  }
  function place(name) {
    reset(false);
    const rows = PATTERNS[name], ph = rows.length, pw = rows[0].length;
    // The gun goes top-left so its gliders have room to travel; everything else is centered.
    const x0 = name === 'Gosper gun' ? 4 : (COLS - pw) >> 1, y0 = name === 'Gosper gun' ? 4 : (ROWS - ph) >> 1;
    rows.forEach((line, y) => [...line].forEach((ch, x) => { if (ch === 'O') cells[(y0 + y) * COLS + x0 + x] = 1; }));
    patternBtns.forEach(b => b.setAttribute('aria-pressed', String(b.textContent === name)));
    sync();
  }
  const advance = () => { cells = step(cells, COLS, ROWS); gen++; };

  function resize() {
    const r = wrap.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const size = Math.max(1, Math.floor(Math.min(r.width / COLS, r.height / ROWS) * dpr) / dpr);
    view = { w: r.width, h: r.height, size, ox: (r.width - size * COLS) / 2, oy: (r.height - size * ROWS) / 2 };
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  // Dragging paints the opposite of the first cell's state, so one gesture either draws or erases.
  let paint = null;
  const cellAt = e => {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - view.ox) / view.size), y = Math.floor((e.clientY - r.top - view.oy) / view.size);
    return x >= 0 && y >= 0 && x < COLS && y < ROWS ? y * COLS + x : -1;
  };
  canvas.addEventListener('pointerdown', e => {
    const i = cellAt(e);
    if (i < 0) return;
    canvas.setPointerCapture(e.pointerId);
    paint = cells[i] ? 0 : 1;
    cells[i] = paint; sync();
  });
  canvas.addEventListener('pointermove', e => {
    const i = paint === null ? -1 : cellAt(e);
    if (i >= 0 && cells[i] !== paint) { cells[i] = paint; sync(); }
  });
  const endPaint = () => { paint = null; };
  canvas.addEventListener('pointerup', endPaint);
  canvas.addEventListener('pointercancel', endPaint);

  play.onclick = () => { running = !running; sync(); };
  stepBtn.onclick = () => { running = false; advance(); sync(); };
  random.onclick = () => reset(true);
  clear.onclick = () => { running = false; reset(false); };
  speed.oninput = sync;

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (running) {
      acc += dt * +speed.value;
      if (acc >= 1) {
        for (; acc >= 1; acc--) advance();
        sync();
      }
    }
    const css = getComputedStyle(root), fg = css.getPropertyValue('--fg').trim() || '#000', accent = css.getPropertyValue('--accent').trim() || '#2563eb';
    const { size, ox, oy } = view;
    ctx.clearRect(0, 0, view.w, view.h);
    if (size >= 6) {
      ctx.strokeStyle = fg; ctx.globalAlpha = 0.07; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= COLS; x++) { ctx.moveTo(ox + x * size + 0.5, oy); ctx.lineTo(ox + x * size + 0.5, oy + ROWS * size); }
      for (let y = 0; y <= ROWS; y++) { ctx.moveTo(ox, oy + y * size + 0.5); ctx.lineTo(ox + COLS * size, oy + y * size + 0.5); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = accent;
    const gap = size >= 6 ? 1 : 0;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
      if (cells[y * COLS + x]) ctx.fillRect(ox + x * size + gap, oy + y * size + gap, size - gap, size - gap);
    raf = requestAnimationFrame(frame);
  }

  place('Gosper gun');
  running = true;
  sync();
  resize();
  raf = requestAnimationFrame(frame);
  // Stop animating once the demo is removed from the page.
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); o.disconnect(); } })
    .observe(document.body, { childList: true, subtree: true });
}
