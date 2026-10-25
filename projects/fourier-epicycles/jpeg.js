// Real-world widget: JPEG-style compression. Each 8×8 block is transformed with a DCT and only the
// first k coefficients in zigzag order (lowest frequencies) are kept — the same idea as dropping circles.
const IW = 192, IH = 128, N = 8;

// cos table for the 8-point DCT-II: COS[x][u] = cos((2x + 1)uπ / 16)
const COS = Array.from({ length: N }, (_, x) => Array.from({ length: N }, (_, u) => Math.cos(((2 * x + 1) * u * Math.PI) / 16)));
const C = u => (u === 0 ? Math.SQRT1_2 : 1);
// Zigzag order: walk the anti-diagonals, alternating direction, so low frequencies come first.
const ZIGZAG = Array.from({ length: N * N }, (_, i) => [i % N, (i / N) | 0])
  .sort(([a, b], [c, d]) => a + b - (c + d) || ((a + b) % 2 ? b - d : d - b));

function dct(block) {
  const out = new Float64Array(N * N);
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
    let s = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s += block[y * N + x] * COS[x][u] * COS[y][v];
    out[v * N + u] = 0.25 * C(u) * C(v) * s;
  }
  return out;
}
function idct(coef) {
  const out = new Float64Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0;
    for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) s += C(u) * C(v) * coef[v * N + u] * COS[x][u] * COS[y][v];
    out[y * N + x] = 0.25 * s;
  }
  return out;
}

// A small scene with smooth areas and sharp edges, which is where JPEG's trade-offs show.
function scene(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, IH);
  sky.addColorStop(0, '#3b82f6'); sky.addColorStop(1, '#fde68a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, IW, IH);
  ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(150, 34, 16, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.moveTo(0, 100); ctx.lineTo(40, 58); ctx.lineTo(78, 92); ctx.lineTo(118, 50); ctx.lineTo(170, 100); ctx.lineTo(192, 88); ctx.lineTo(192, 128); ctx.lineTo(0, 128); ctx.fill();
  ctx.fillStyle = '#16a34a'; ctx.fillRect(0, 108, IW, 20);
  ctx.fillStyle = '#fff'; ctx.font = '800 26px Inter, system-ui, sans-serif'; ctx.fillText('JPEG', 12, 36);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(110 + i * 12, 112); ctx.lineTo(116 + i * 12, 124); ctx.stroke(); }
}

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const pane = (title, canvas) => h('div', { style: 'flex:1 1 240px;display:flex;flex-direction:column;gap:6px;align-items:center' },
    h('div', { textContent: title, style: 'font-size:.8rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em' }), canvas);
  const mk = () => Object.assign(h('canvas', { style: 'width:100%;max-width:384px;image-rendering:pixelated;border-radius:6px' }), { width: IW, height: IH });
  const src = mk(), dst = mk();
  const k = h('input', { type: 'range', min: 1, max: 64, value: 6, style: 'flex:1;min-width:140px' });
  const out = h('div', { style: 'font-size:.85rem;color:var(--fg);font-variant-numeric:tabular-nums;min-width:16em' });
  root.append(
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:12px;padding:12px' }, pane('Эх зураг', src), pane('Шахсан', dst)),
    h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:10px 12px;border-top:1px solid var(--line)' },
      h('span', { textContent: 'Блок бүрд хадгалах коэффициент:', style: 'font-size:.85rem;color:var(--muted)' }), k, out));

  const sctx = src.getContext('2d'), dctx = dst.getContext('2d');
  scene(sctx);
  const pixels = sctx.getImageData(0, 0, IW, IH);
  // Transform every block of every colour channel once; the slider only changes how many coefficients survive.
  const blocks = [];
  for (let by = 0; by < IH; by += N) for (let bx = 0; bx < IW; bx += N) for (let ch = 0; ch < 3; ch++) {
    const b = new Float64Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) b[y * N + x] = pixels.data[((by + y) * IW + bx + x) * 4 + ch] - 128;
    blocks.push({ bx, by, ch, coef: dct(b) });
  }

  function render() {
    const keep = +k.value, img = dctx.createImageData(IW, IH), kept = new Float64Array(N * N);
    for (const { bx, by, ch, coef } of blocks) {
      kept.fill(0);
      for (let i = 0; i < keep; i++) { const [u, v] = ZIGZAG[i]; kept[v * N + u] = coef[v * N + u]; }
      const px = idct(kept);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = ((by + y) * IW + bx + x) * 4;
        img.data[i + ch] = Math.max(0, Math.min(255, Math.round(px[y * N + x] + 128)));
        img.data[i + 3] = 255;
      }
    }
    dctx.putImageData(img, 0, 0);
    out.textContent = `${keep} / 64 (${Math.round((keep / 64) * 100)}% өгөгдөл)${keep === 1 ? ' — блок бүр нэг өнгө' : keep >= 40 ? ' — эхтэйгээ бараг ижил' : ''}`;
  }
  k.oninput = render;
  render();
}
