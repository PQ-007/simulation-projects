// Neural network playground: a small multi-layer perceptron learns to separate two classes of 2D points.
// tanh hidden layers, sigmoid output, cross-entropy loss, plain gradient descent (backpropagation).

export class Net {
  // sizes e.g. [2, 6, 4, 1]: inputs, hidden layers..., one output
  constructor(sizes, rand = Math.random) {
    this.sizes = sizes;
    this.W = []; this.b = [];
    for (let l = 1; l < sizes.length; l++) {
      const fanIn = sizes[l - 1], s = Math.sqrt(1 / fanIn); // small random weights, scaled to the layer's width
      this.W.push(Array.from({ length: sizes[l] }, () => Array.from({ length: fanIn }, () => (rand() * 2 - 1) * s * 1.7)));
      this.b.push(new Array(sizes[l]).fill(0));
    }
  }
  // Forward pass; keeps every layer's activations (needed for backpropagation and for drawing neurons).
  forward(x) {
    const acts = [x];
    for (let l = 0; l < this.W.length; l++) {
      const last = l === this.W.length - 1, prev = acts[l];
      acts.push(this.W[l].map((w, j) => {
        let z = this.b[l][j];
        for (let i = 0; i < w.length; i++) z += w[i] * prev[i];
        return last ? 1 / (1 + Math.exp(-z)) : Math.tanh(z);
      }));
    }
    return acts;
  }
  predict(x) { return this.forward(x).at(-1)[0]; }

  // Loss and gradients for a batch of {x, y}. With a sigmoid output and cross-entropy, dLoss/dz at the output is simply (p − y).
  gradients(batch) {
    const gW = this.W.map(m => m.map(r => r.map(() => 0))), gB = this.b.map(v => v.map(() => 0));
    let loss = 0;
    for (const { x, y } of batch) {
      const acts = this.forward(x), p = acts.at(-1)[0];
      loss -= y * Math.log(p + 1e-12) + (1 - y) * Math.log(1 - p + 1e-12);
      let delta = [p - y];
      for (let l = this.W.length - 1; l >= 0; l--) {
        for (let j = 0; j < delta.length; j++) {
          gB[l][j] += delta[j];
          for (let i = 0; i < this.W[l][j].length; i++) gW[l][j][i] += delta[j] * acts[l][i];
        }
        if (l === 0) break;
        // push the error back one layer: through the weights, then through tanh's slope 1 − a²
        const next = new Array(this.W[l][0].length).fill(0);
        for (let j = 0; j < delta.length; j++) for (let i = 0; i < next.length; i++) next[i] += delta[j] * this.W[l][j][i];
        delta = next.map((v, i) => v * (1 - acts[l][i] ** 2));
      }
    }
    const n = batch.length;
    return { loss: loss / n, gW: gW.map(m => m.map(r => r.map(v => v / n))), gB: gB.map(v => v.map(x => x / n)) };
  }
  // One gradient descent step: move every weight a little against its gradient.
  train(batch, lr) {
    const { loss, gW, gB } = this.gradients(batch);
    for (let l = 0; l < this.W.length; l++) for (let j = 0; j < this.W[l].length; j++) {
      this.b[l][j] -= lr * gB[l][j];
      for (let i = 0; i < this.W[l][j].length; i++) this.W[l][j][i] -= lr * gW[l][j][i];
    }
    return loss;
  }
  accuracy(data) { return data.length ? data.filter(({ x, y }) => (this.predict(x) > 0.5) === (y === 1)).length / data.length : 1; }
}

// ---- datasets: points in [-1, 1]², label 1 or 0 ---------------------------------------------------------
const gauss = r => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
export const DATASETS = {
  'Хоёр бөөгнөрөл': r => Array.from({ length: 160 }, (_, i) => { const y = i % 2, c = y ? 0.5 : -0.5; return { x: [c + gauss(r) * 0.2, c * 0.8 + gauss(r) * 0.2], y }; }),
  'Дугуй': r => Array.from({ length: 200 }, (_, i) => { const y = i % 2, rad = y ? Math.sqrt(r()) * 0.4 : 0.65 + r() * 0.3, a = r() * 6.283; return { x: [rad * Math.cos(a), rad * Math.sin(a)], y }; }),
  'XOR': r => Array.from({ length: 200 }, () => { const x = r() * 2 - 1, yy = r() * 2 - 1; return { x: [x + Math.sign(x) * 0.08, yy + Math.sign(yy) * 0.08], y: x * yy > 0 ? 1 : 0 }; }),
  'Спираль': r => Array.from({ length: 240 }, (_, i) => { const y = i % 2, t = (Math.floor(i / 2) / 120) * 3.6 + 0.4, a = t * 1.6 + y * Math.PI; return { x: [(t / 4.2) * Math.cos(a) * 0.95 + gauss(r) * 0.02, (t / 4.2) * Math.sin(a) * 0.95 + gauss(r) * 0.02], y }; }),
};

// Optional hand-crafted extra inputs: lets the network "cheat" with x², y², xy features so a small net can solve circles/XOR.
export const FEATURES = {
  x: p => p[0], y: p => p[1], 'x²': p => p[0] * p[0], 'y²': p => p[1] * p[1], 'x·y': p => p[0] * p[1], 'sin x': p => Math.sin(3 * p[0]), 'sin y': p => Math.sin(3 * p[1]),
};

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const mono = '"JetBrains Mono",ui-monospace,monospace';
  const field = h('canvas', { style: 'width:100%;aspect-ratio:1;max-width:520px;border-radius:10px;cursor:crosshair;touch-action:none;image-rendering:auto' });
  const diagram = h('canvas', { style: 'width:100%;height:260px;border:1px solid var(--line);border-radius:10px;background:var(--card)' });
  const lossCv = h('canvas', { style: 'width:100%;height:84px;border:1px solid var(--line);border-radius:10px;background:var(--card)' });
  const stats = h('div', { style: `font:700 .95rem ${mono};line-height:1.6` });
  const msg = h('div', { style: 'font-size:.82rem;color:var(--muted);line-height:1.5' });

  const btn = (text, onclick, title = '') => h('button', { className: 'btn btn-sm', textContent: text, onclick, title });
  const play = h('button', { className: 'btn', style: 'min-width:120px;justify-content:center', onclick: () => { running = !running; sync(); } });
  const slider = (min, max, step, value, w = 100) => h('input', { type: 'range', min, max, step, value, style: `width:${w}px` });
  const lrIn = slider(-2, 0.7, 0.05, -0.5), lrOut = h('output', { style: 'min-width:3em;font-variant-numeric:tabular-nums;color:var(--fg)' });
  const speedIn = slider(1, 40, 1, 8, 80);
  const seg = (items, onPick) => { const b = h('div', { className: 'seg', style: 'flex-wrap:wrap' }); const bs = items.map(([k, t]) => h('button', { textContent: t, onclick: () => onPick(k) })); b.append(...bs); return { box: b, set: k => bs.forEach((x, i) => x.setAttribute('aria-selected', String(items[i][0] === k))) }; };
  const dataSeg = seg(Object.keys(DATASETS).map(k => [k, k]), k => { dsName = k; data = DATASETS[k](Math.random); build(); });
  const featBtns = Object.keys(FEATURES).map(k => h('button', { className: 'btn btn-sm', textContent: k, onclick: () => { if (feats.has(k) && feats.size === 1) return; feats.has(k) ? feats.delete(k) : feats.add(k); build(); } }));
  const layerBtns = h('span', { style: 'display:inline-flex;gap:4px;align-items:center;flex-wrap:wrap' });

  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center' }, ...kids);
  const label = s => h('span', { textContent: s, style: 'font-size:.85rem;color:var(--muted)' });
  const left = h('div', { style: 'flex:1 1 360px;min-width:260px;display:flex;flex-direction:column;gap:8px;align-items:flex-start' }, field,
    row(label('Дээр дарж цэг нэм:'), btn('🔵 анги 1', () => { brush = 1; sync(); }), btn('🔴 анги 0', () => { brush = 0; sync(); }), btn('Цэвэрлэх', () => { data = []; build(); })), msg);
  const right = h('div', { style: 'flex:1 1 380px;min-width:280px;display:flex;flex-direction:column;gap:10px' },
    row(play, btn('⏭ 1 алхам', () => { running = false; trainSteps(1); render(); sync(); }), btn('↺ Дахин эхлэх', () => build()),
      h('label', { style: 'display:flex;gap:6px;align-items:center;font-size:.85rem;color:var(--muted)' }, 'Хурд', speedIn)),
    row(label('Өгөгдөл:'), dataSeg.box),
    row(label('Оролт:'), ...featBtns),
    row(label('Hidden layer:'), layerBtns),
    row(h('label', { style: 'display:flex;gap:6px;align-items:center;font-size:.85rem;color:var(--muted)' }, 'Learning rate', lrIn, lrOut)),
    stats, diagram, h('div', { textContent: 'Loss (буурах ёстой):', style: 'font-size:.78rem;color:var(--muted)' }), lossCv);
  root.append(h('div', { style: 'flex:1;min-height:0;overflow:auto;padding:12px 14px;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start' }, left, right));

  let net, data = [], dsName = 'Дугуй', feats = new Set(['x', 'y']), hidden = [4, 3], running = true, brush = 1, epoch = 0, losses = [], heat = null, lastLoss = 0;
  const lr = () => 10 ** +lrIn.value;
  const featNames = () => Object.keys(FEATURES).filter(k => feats.has(k));
  const inputs = p => featNames().map(k => FEATURES[k](p));
  const batchOf = () => data.map(d => ({ x: inputs(d.x), y: d.y }));

  // Hidden layer editor: each layer is a button group "− n +"; "+ layer" adds one, "− layer" removes one.
  function drawLayerBtns() {
    layerBtns.replaceChildren(...hidden.flatMap((n, i) => [
      h('span', { style: 'display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:8px;overflow:hidden' },
        h('button', { className: 'btn btn-sm', textContent: '−', style: 'border:0;border-radius:0', onclick: () => { hidden[i] = Math.max(1, n - 1); build(); } }),
        h('span', { textContent: n, style: `padding:0 6px;font:700 .85rem ${mono}` }),
        h('button', { className: 'btn btn-sm', textContent: '+', style: 'border:0;border-radius:0', onclick: () => { hidden[i] = Math.min(8, n + 1); build(); } }))]),
      btn('+ layer', () => { if (hidden.length < 4) { hidden.push(3); build(); } }), btn('− layer', () => { if (hidden.length) { hidden.pop(); build(); } }));
    featBtns.forEach(b => b.setAttribute('aria-pressed', String(feats.has(b.textContent))));
  }

  function build() {
    net = new Net([featNames().length, ...hidden, 1]);
    epoch = 0; losses = []; heat = null;
    dataSeg.set(dsName); drawLayerBtns(); sync(); render();
  }
  function trainSteps(k) {
    if (!data.length) return;
    const batch = batchOf();
    for (let i = 0; i < k; i++) { lastLoss = net.train(batch, lr()); epoch++; if (epoch % 2 === 0) losses.push(lastLoss); }
    if (losses.length > 400) losses = losses.filter((_, i) => i % 2 === 0);
  }
  function sync() {
    play.textContent = running ? '❚❚ Зогсоох' : '▶ Сургах';
    lrOut.textContent = lr().toFixed(lr() < 0.1 ? 2 : 1);
    msg.textContent = `Өнгөт дэвсгэр = сүлжээний таамаг (🔵 → анги 1, 🔴 → анги 0). Одоогийн сойз: ${brush ? '🔵 анги 1' : '🔴 анги 0'}.`;
  }

  // ---- drawing ----
  const fit = (cv, w, hh) => { const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1; cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return [r.width, r.height, c]; };
  function drawField() {
    const [W, H, g] = fit(field), N = 56, cell = W / N;
    // The decision surface: probability for each cell, blue (1) ↔ red (0), faded near 0.5.
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p = net.predict(inputs([(i + 0.5) / N * 2 - 1, 1 - (j + 0.5) / N * 2]));
      g.fillStyle = `rgba(${p > 0.5 ? '59,130,246' : '239,68,68'},${0.12 + 0.5 * Math.abs(p - 0.5) * 2})`;
      g.fillRect(i * cell, j * cell, cell + 0.8, cell + 0.8);
    }
    g.strokeStyle = 'rgba(100,116,139,.35)'; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    for (const d of data) {
      const x = (d.x[0] + 1) / 2 * W, y = (1 - d.x[1]) / 2 * H, ok = (net.predict(inputs(d.x)) > 0.5) === (d.y === 1);
      g.beginPath(); g.arc(x, y, 5, 0, 7); g.fillStyle = d.y ? '#2563eb' : '#dc2626'; g.fill();
      g.lineWidth = ok ? 1.5 : 2.5; g.strokeStyle = ok ? '#fff' : '#facc15'; g.stroke();
    }
  }
  function drawNet() {
    const [W, H, g] = fit(diagram), sizes = net.sizes, cols = sizes.length, xs = i => 56 + i * (W - 112) / (cols - 1);
    const ys = (l, j) => H / 2 + (j - (sizes[l] - 1) / 2) * Math.min(34, (H - 40) / Math.max(sizes[l], 1));
    // connections: colour = sign of the weight (blue +, red −), thickness = |weight|
    for (let l = 0; l < net.W.length; l++) for (let j = 0; j < net.W[l].length; j++) for (let i = 0; i < net.W[l][j].length; i++) {
      const w = net.W[l][j][i];
      g.strokeStyle = w > 0 ? '#3b82f6' : '#ef4444'; g.globalAlpha = Math.min(0.9, 0.12 + Math.abs(w) * 0.4); g.lineWidth = Math.min(4, 0.4 + Math.abs(w) * 1.6);
      g.beginPath(); g.moveTo(xs(l), ys(l, i)); g.lineTo(xs(l + 1), ys(l + 1, j)); g.stroke();
    }
    g.globalAlpha = 1;
    const fn = featNames();
    for (let l = 0; l < cols; l++) for (let j = 0; j < sizes[l]; j++) {
      g.beginPath(); g.arc(xs(l), ys(l, j), 11, 0, 7); g.fillStyle = l === cols - 1 ? '#8b5cf6' : l === 0 ? '#16a34a' : 'var(--card)'; g.fill();
      g.strokeStyle = 'var(--fg)'; g.lineWidth = 1.4; g.stroke();
      if (l === 0) { g.fillStyle = 'var(--fg)'; g.font = '11px Inter, system-ui'; g.textAlign = 'right'; g.fillText(fn[j], xs(0) - 16, ys(0, j) + 4); }
    }
    g.fillStyle = 'var(--muted)'; g.font = '11px Inter, system-ui'; g.textAlign = 'center';
    g.fillText('оролт', xs(0), 14); g.fillText('гаралт', xs(cols - 1), 14);
    const params = net.W.reduce((s, m) => s + m.length * m[0].length + m.length, 0);
    g.textAlign = 'left'; g.fillText(`${params} параметр (жин + bias)`, 8, H - 8);
  }
  function drawLoss() {
    const [W, H, g] = fit(lossCv);
    if (losses.length < 2) return;
    const max = Math.max(...losses, 0.8);
    g.strokeStyle = '#8b5cf6'; g.lineWidth = 2; g.beginPath();
    losses.forEach((v, i) => { const x = 6 + i / (losses.length - 1) * (W - 12), y = H - 6 - (v / max) * (H - 14); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    g.strokeStyle = 'rgba(100,116,139,.4)'; g.setLineDash([4, 4]); const y0 = H - 6 - (Math.log(2) / max) * (H - 14); g.beginPath(); g.moveTo(0, y0); g.lineTo(W, y0); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'var(--muted)'; g.font = '10px Inter, system-ui'; g.fillText('0.69 = санамсаргүй таамаг', 8, y0 - 3);
  }
  function render() {
    drawField(); drawNet(); drawLoss();
    const acc = net.accuracy(data.map(d => ({ x: inputs(d.x), y: d.y })));
    stats.textContent = `Epoch ${epoch} · Loss ${data.length ? lastLoss.toFixed(3) : '—'} · Нарийвчлал ${(acc * 100).toFixed(0)}%`;
    stats.style.color = acc > 0.97 ? '#16a34a' : 'var(--fg)';
  }

  // Click/drag on the plane to add points of the current class (right-click or Shift for the other class).
  const addAt = e => {
    const r = field.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = 1 - (e.clientY - r.top) / r.height * 2;
    data.push({ x: [x, y], y: e.shiftKey ? 1 - brush : brush }); render();
  };
  let painting = false;
  field.addEventListener('pointerdown', e => { painting = true; field.setPointerCapture(e.pointerId); addAt(e); });
  field.addEventListener('pointermove', e => { if (painting && e.buttons) addAt(e); });
  field.addEventListener('pointerup', () => { painting = false; });
  field.addEventListener('contextmenu', e => { e.preventDefault(); const r = field.getBoundingClientRect(); data.push({ x: [(e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2], y: 1 - brush }); render(); });
  lrIn.oninput = sync;

  let raf = 0;
  const frame = () => { if (running) { trainSteps(+speedIn.value); render(); } raf = requestAnimationFrame(frame); };
  data = DATASETS[dsName](Math.random);
  hidden = [4, 3];
  build(); raf = requestAnimationFrame(frame);
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
}
