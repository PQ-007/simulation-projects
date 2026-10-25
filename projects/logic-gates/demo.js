// Logic gates → half adder → full adder → multi-bit ripple-carry adder, all clickable.

export const GATES = {
  AND: (a, b) => a & b,
  OR: (a, b) => a | b,
  XOR: (a, b) => a ^ b,
  NOT: a => 1 - a,
  NAND: (a, b) => 1 - (a & b),
  NOR: (a, b) => 1 - (a | b),
};

// One full adder: two XORs make the sum, two ANDs and an OR make the carry.
export function fullAdder(a, b, cin) {
  const p = a ^ b;
  return { p, sum: p ^ cin, and1: a & b, and2: p & cin, cout: (a & b) | (p & cin) };
}

// n full adders in a row; each carry-out feeds the next carry-in (bit 0 = rightmost).
export function rippleAdd(x, y, n) {
  const bits = [];
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const r = fullAdder((x >> i) & 1, (y >> i) & 1, carry);
    bits.push({ a: (x >> i) & 1, b: (y >> i) & 1, cin: carry, ...r });
    carry = r.cout;
  }
  return { bits, carry, sum: bits.reduce((s, b, i) => s | (b.sum << i), 0) };
}

const RULES = {
  AND: 'Хоёулаа 1 бол 1',
  OR: 'Аль нэг нь 1 бол 1',
  XOR: 'Яг нэг нь 1 бол 1 (өөр бол 1)',
  NOT: 'Эсрэгээр нь эргүүлнэ',
  NAND: 'AND-ийн эсрэг',
  NOR: 'OR-ийн эсрэг',
};
const ON = '#22c55e', LAMP = '#facc15';

// ---- SVG drawing helpers -------------------------------------------------------------------------------
// A gate is drawn with its body starting at x, centred on y; inputs at (x, y∓10), output at out(type, x, y).
const bubble = t => t === 'NOT' || t === 'NAND' || t === 'NOR';
const outX = (t, x) => x + (t === 'NOT' ? 36 : t === 'AND' || t === 'NAND' ? 46 : 50) + (bubble(t) ? 8 : 0);
function gateShape(t, x, y, on) {
  const stroke = on ? ON : 'var(--fg)', sw = on ? 2.6 : 1.8, fill = 'var(--card)';
  const and = `M${x},${y - 20} H${x + 26} A20,20 0 0 1 ${x + 26},${y + 20} H${x} Z`;
  const or = `M${x},${y - 20} Q${x + 14},${y} ${x},${y + 20} Q${x + 34},${y + 20} ${x + 50},${y} Q${x + 34},${y - 20} ${x},${y - 20} Z`;
  let d = t === 'AND' || t === 'NAND' ? and : t === 'NOT' ? `M${x},${y - 16} L${x + 36},${y} L${x},${y + 16} Z` : or;
  let out = `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  if (t === 'XOR') out += `<path d="M${x - 7},${y - 20} Q${x + 7},${y} ${x - 7},${y + 20}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
  if (bubble(t)) { const bx = outX(t, x) - 4; out += `<circle cx="${bx}" cy="${y}" r="4" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`; }
  out += `<text x="${x + (t === 'NOT' ? 13 : 22)}" y="${y + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--muted)">${t}</text>`;
  return out;
}
const wire = (pts, on, dots = []) =>
  `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${on ? ON : 'var(--line)'}" stroke-width="${on ? 4 : 2.5}" stroke-linejoin="round" stroke-linecap="round"/>`
  + dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${on ? ON : 'var(--muted)'}"/>`).join('');
const sw = (id, x, y, v, label) =>
  `<g data-toggle="${id}" style="cursor:pointer"><rect x="${x - 18}" y="${y - 16}" width="36" height="32" rx="8" fill="${v ? ON : 'var(--card)'}" stroke="${v ? ON : 'var(--muted)'}" stroke-width="2"/>`
  + `<text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="800" fill="${v ? '#fff' : 'var(--fg)'}">${v}</text>`
  + `<text x="${x - 26}" y="${y + 1}" text-anchor="end" dominant-baseline="central" font-size="15" font-weight="700" fill="var(--fg)">${label}</text></g>`;
const lamp = (x, y, v, label, sub = '') =>
  `<circle cx="${x}" cy="${y}" r="15" fill="${v ? LAMP : 'var(--code)'}" stroke="${v ? '#ca8a04' : 'var(--muted)'}" stroke-width="2" style="${v ? `filter:drop-shadow(0 0 8px ${LAMP})` : ''}"/>`
  + `<text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="800" fill="${v ? '#713f12' : 'var(--muted)'}">${v}</text>`
  + `<text x="${x + 24}" y="${y + 1}" dominant-baseline="central" font-size="15" font-weight="700" fill="var(--fg)">${label}</text>`
  + (sub ? `<text x="${x + 24}" y="${y + 18}" font-size="11" fill="var(--muted)">${sub}</text>` : '');

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const tabs = [['gates', '1. Gates'], ['half', '2. Half adder'], ['full', '3. Full adder'], ['adder', '4. N-bit adder']];
  const seg = h('div', { className: 'seg', style: 'flex-wrap:wrap' });
  const tabBtns = tabs.map(([k, t]) => h('button', { textContent: t, onclick: () => { view = k; render(); } }));
  seg.append(...tabBtns);
  const body = h('div', { style: 'flex:1;min-height:0;overflow:auto;padding:12px 14px' });
  root.append(h('div', { style: 'padding:12px 14px 0' }, seg), body);

  let view = 'gates';
  const S = { A: 0, B: 1, Cin: 0 };                 // switch states for views 1–3
  let bits = 4, X = 7, Y = 3, rippleStep = Infinity, rippleTimer = 0, slow = true;

  const svgEl = (vb, html, maxW) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', vb);
    s.setAttribute('style', `display:block;width:100%;max-width:${maxW}px;font-family:Inter,system-ui,sans-serif;user-select:none`);
    s.innerHTML = html;
    s.addEventListener('click', e => { const g = e.target.closest('[data-toggle]'); if (g) { const k = g.dataset.toggle; S[k] = 1 - S[k]; render(); } });
    return s;
  };
  const note = s => h('p', { style: 'margin:0 0 10px;font-size:.92rem;color:var(--muted);line-height:1.55' }, s);
  // Truth table with the row matching the current inputs highlighted.
  function truth(cols, rows, current) {
    const th = s => h('th', { textContent: s, style: 'padding:4px 12px;border-bottom:2px solid var(--line);font-size:.8rem;color:var(--muted)' });
    return h('table', { style: 'border-collapse:collapse;font:600 .9rem "JetBrains Mono",ui-monospace,monospace;text-align:center' },
      h('tr', {}, ...cols.map(th)),
      ...rows.map(r => {
        const on = r.slice(0, current.length).every((v, i) => v === current[i]);
        return h('tr', { style: on ? 'background:var(--accent-soft)' : '' }, ...r.map((v, i) => h('td', {
          textContent: v, style: `padding:4px 12px;border-bottom:1px solid var(--line);${i >= current.length ? `color:${v ? '#16a34a' : 'var(--muted)'};font-weight:800` : ''}`,
        })));
      }));
  }

  function renderGates() {
    const A = S.A, B = S.B;
    const top = svgEl('0 0 240 70', sw('A', 60, 35, A, 'A') + sw('B', 170, 35, B, 'B'), 260);
    const cards = Object.keys(GATES).map(t => {
      const one = t === 'NOT', out = one ? GATES[t](A) : GATES[t](A, B);
      const x = 70, y = 50, ox = outX(t, x);
      let s = '';
      if (one) s += wire([[16, y], [x, y]], A) + `<text x="8" y="${y + 4}" font-size="12" font-weight="700" fill="var(--fg)">A</text>`;
      else s += wire([[16, y - 10], [x, y - 10]], A) + wire([[16, y + 10], [x, y + 10]], B)
        + `<text x="4" y="${y - 6}" font-size="12" font-weight="700" fill="var(--fg)">A</text><text x="4" y="${y + 14}" font-size="12" font-weight="700" fill="var(--fg)">B</text>`;
      s += gateShape(t, x, y, out) + wire([[ox, y], [168, y]], out) + lamp(185, y, out, '');
      const rows = one ? [[0, 1], [1, 0]] : [[0, 0], [0, 1], [1, 0], [1, 1]].map(([a, b]) => [a, b, GATES[t](a, b)]);
      return h('div', { style: 'border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--card);display:flex;flex-direction:column;gap:6px;align-items:center' },
        h('div', { style: 'font-weight:800;font-size:1.05rem' }, t), h('div', { textContent: RULES[t], style: 'font-size:.82rem;color:var(--muted);text-align:center' }),
        svgEl('0 0 220 100', s, 240), truth(one ? ['A', 'NOT'] : ['A', 'B', t], rows, one ? [A] : [A, B]));
    });
    body.replaceChildren(
      note('Gate бол жижиг дүрэм: 1 (асаалттай) ба 0 (унтраалттай) оролтоос нэг гаралт гаргана. Дээрх A, B товчийг дарж бүх gate хэрхэн хариулахыг хар. Ногоон утас = 1.'),
      top, h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-top:10px' }, ...cards));
  }

  function renderHalf() {
    const A = S.A, B = S.B, sum = A ^ B, carry = A & B;
    const s = wire([[58, 70], [150, 70], [150, 80], [220, 80]], A, [[150, 80]]) + wire([[150, 80], [150, 180], [220, 180]], A)
      + wire([[58, 170], [120, 170], [120, 100], [220, 100]], B, [[120, 170]]) + wire([[120, 170], [120, 200], [220, 200]], B)
      + gateShape('XOR', 220, 90, sum) + gateShape('AND', 220, 190, carry)
      + wire([[outX('XOR', 220), 90], [400, 90]], sum) + wire([[outX('AND', 220), 190], [400, 190]], carry)
      + sw('A', 40, 70, A, 'A') + sw('B', 40, 170, B, 'B') + lamp(415, 90, sum, 'S', 'нийлбэр (sum)') + lamp(415, 190, carry, 'C', 'дамжуулах (carry)');
    body.replaceChildren(
      note('Хоёр bit-ийг нэмэх: 0+0=0, 0+1=1, 1+0=1, харин 1+1=10 (хоёртын "2"). Баруун цифр (S) нь XOR, зүүн цифр буюу дараагийн багана руу "дамжуулах" (C) нь AND. A, B дээр дарж үз.'),
      svgEl('-30 0 600 240', s, 660),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin-top:10px' },
        truth(['A', 'B', 'C', 'S'], [[0, 0, 0, 0], [0, 1, 0, 1], [1, 0, 0, 1], [1, 1, 1, 0]], [A, B]),
        h('div', { style: 'font-size:1.1rem;font-weight:700' }, `${A} + ${B} = `, h('span', { textContent: `${carry}${sum}`, style: 'color:#16a34a;font-family:"JetBrains Mono",monospace' }), h('span', { textContent: ` (хоёртын) = ${A + B}`, style: 'color:var(--muted);font-weight:500' }))));
  }

  function renderFull() {
    const { A, B, Cin } = S, r = fullAdder(A, B, Cin);
    const s = wire([[58, 60], [130, 60], [130, 75], [190, 75]], A, [[130, 75]]) + wire([[130, 75], [130, 160], [190, 160]], A)
      + wire([[58, 110], [110, 110], [110, 95], [190, 95]], B, [[110, 110]]) + wire([[110, 110], [110, 180], [190, 180]], B)
      + wire([[outX('XOR', 190), 85], [300, 85], [300, 100], [360, 100]], r.p, [[300, 100]]) + wire([[300, 100], [300, 200], [360, 200]], r.p)
      + wire([[58, 250], [330, 250], [330, 220], [360, 220]], Cin, [[330, 220]]) + wire([[330, 220], [330, 120], [360, 120]], Cin)
      + wire([[outX('AND', 190), 170], [430, 170], [430, 250], [470, 250]], r.and1)
      + wire([[outX('AND', 360), 210], [450, 210], [450, 230], [470, 230]], r.and2)
      + gateShape('XOR', 190, 85, r.p) + gateShape('AND', 190, 170, r.and1) + gateShape('XOR', 360, 110, r.sum)
      + gateShape('AND', 360, 210, r.and2) + gateShape('OR', 470, 240, r.cout)
      + wire([[outX('XOR', 360), 110], [565, 110]], r.sum) + wire([[outX('OR', 470), 240], [565, 240]], r.cout)
      + sw('A', 40, 60, A, 'A') + sw('B', 40, 110, B, 'B') + sw('Cin', 40, 250, Cin, 'Cᵢₙ')
      + lamp(580, 110, r.sum, 'S', 'нийлбэр') + lamp(580, 240, r.cout, 'Cₒᵤₜ', 'дараагийн багана руу');
    const rows = [];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) { const q = fullAdder(a, b, c); rows.push([a, b, c, q.cout, q.sum]); }
    body.replaceChildren(
      note('Олон оронтой тоо нэмэхэд багана бүрт өмнөх баганаас ирсэн "дамжуулалт" (Cᵢₙ) нэмэгдэнэ. Full adder гурван bit нэмнэ: хоёр half adder + OR gate. Cᵢₙ-ийг дарж үз.'),
      svgEl('-34 0 790 290', s, 820),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin-top:10px' },
        truth(['A', 'B', 'Cᵢₙ', 'Cₒᵤₜ', 'S'], rows, [A, B, Cin]),
        h('div', { style: 'font-size:1.1rem;font-weight:700' }, `${A} + ${B} + ${Cin} = `, h('span', { textContent: `${r.cout}${r.sum}`, style: 'color:#16a34a;font-family:"JetBrains Mono",monospace' }), h('span', { textContent: ` (хоёртын) = ${A + B + Cin}`, style: 'color:var(--muted);font-weight:500' }))));
  }

  // N-bit ripple-carry adder: full adders in a row, the carry walking from the right (bit 0) to the left.
  function renderAdder() {
    const R = rippleAdd(X, Y, bits), max = (1 << bits) - 1, BW = 92, W = bits * BW + 120;
    const step = Math.min(rippleStep, bits); // how many bits have settled so far
    const colX = i => W - 70 - (i + 1) * BW + BW / 2;           // bit 0 on the right, like written numbers
    let s = '';
    for (let i = 0; i < bits; i++) {
      const b = R.bits[i], x = colX(i), done = i < step, active = i === step;
      s += `<g data-bit="a${i}" style="cursor:pointer">${sw(`a${i}`, x - 16, 26, b.a, '').replace('data-toggle', 'data-x')}</g>`;
      s += `<g data-bit="b${i}" style="cursor:pointer">${sw(`b${i}`, x + 16, 70, b.b, '').replace('data-toggle', 'data-x')}</g>`;
      s += wire([[x - 16, 42], [x - 16, 112]], b.a) + wire([[x + 16, 86], [x + 16, 112]], b.b);
      s += `<rect x="${x - 34}" y="112" width="68" height="56" rx="10" fill="${active ? 'var(--accent-soft)' : 'var(--card)'}" stroke="${active ? 'var(--accent)' : 'var(--fg)'}" stroke-width="${active ? 3 : 1.6}"/>`
        + `<text x="${x}" y="136" text-anchor="middle" font-size="13" font-weight="800" fill="var(--fg)">FA</text><text x="${x}" y="154" text-anchor="middle" font-size="10" fill="var(--muted)">bit ${i}</text>`
        + `<g data-zoom="${i}" style="cursor:zoom-in"><text x="${x + 26}" y="126" text-anchor="middle" font-size="12">🔍</text></g>`;
      // Carry into this block comes from the right; carry out leaves to the left.
      const cinOn = done || active ? b.cin : 0, coutOn = done ? b.cout : 0;
      s += wire([[x + 60, 140], [x + 34, 140]], cinOn) + wire([[x - 34, 140], [x - 58, 140]], coutOn);
      s += wire([[x, 168], [x, 210]], done ? b.sum : 0) + lamp(x, 226, done ? b.sum : 0, '');
      if (!done) s += `<text x="${x}" y="230" text-anchor="middle" font-size="18" fill="var(--muted)" dy="22">?</text>`;
    }
    const x0 = colX(0) + BW / 2 + 12;
    s += `<text x="${x0 + 20}" y="144" font-size="13" fill="var(--muted)">0</text>`;
    const xl = colX(bits - 1) - BW / 2 - 6, overflow = step >= bits ? R.carry : 0;
    s += lamp(xl - 6, 140, overflow, '', '') + `<text x="${xl - 6}" y="176" text-anchor="middle" font-size="11" fill="var(--muted)">carry</text>`;
    s += `<text x="${W - 30}" y="30" font-size="15" font-weight="700" fill="var(--fg)">A</text><text x="${W - 30}" y="74" font-size="15" font-weight="700" fill="var(--fg)">B</text><text x="${W - 30}" y="230" font-size="15" font-weight="700" fill="var(--fg)">S</text>`;
    const svg = svgEl(`0 0 ${W} 260`, s, W * 1.05);
    svg.addEventListener('click', e => {
      const t = e.target.closest('[data-x]');
      if (t) { const k = t.dataset.x, i = +k.slice(1); if (k[0] === 'a') X ^= 1 << i; else Y ^= 1 << i; startRipple(); return; }
      const z = e.target.closest('[data-zoom]');
      if (z) { const b = R.bits[+z.dataset.zoom]; Object.assign(S, { A: b.a, B: b.b, Cin: b.cin }); view = 'full'; render(); }
    });
    const num = (v, set) => h('input', { type: 'number', min: 0, max, value: v, style: 'width:80px;padding:5px 8px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font:inherit', oninput: e => { set(Math.max(0, Math.min(max, (+e.target.value) | 0))); startRipple(); } });
    const bin = v => v.toString(2).padStart(bits, '0');
    const finished = step >= bits;
    const result = finished ? R.sum + (R.carry << bits) : null;
    body.replaceChildren(
      note('Full adder-уудыг дараалуулж холбоно: баруун талын (bit 0) carry зүүн хөрш рүүгээ дамжина — гараар баганаар нэмдэгтэй яг адил. Bit дээр дарж эсвэл тоо бичиж үз. Carry зүүн тийш "долгион" шиг явдгийг хар (ripple carry).'),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-bottom:8px' },
        h('label', { style: 'display:flex;gap:6px;align-items:center;font-size:.9rem' }, 'A =', num(X, v => { X = v; })),
        h('label', { style: 'display:flex;gap:6px;align-items:center;font-size:.9rem' }, 'B =', num(Y, v => { Y = v; })),
        (() => { const sg = h('div', { className: 'seg' }); for (const n of [4, 8]) sg.append(h('button', { textContent: `${n}-bit`, 'aria-selected': String(bits === n), onclick: () => { bits = n; X &= (1 << n) - 1; Y &= (1 << n) - 1; startRipple(); } })); return sg; })(),
        h('label', { style: 'display:flex;gap:6px;align-items:center;font-size:.85rem;color:var(--muted)' }, h('input', { type: 'checkbox', checked: slow, onchange: e => { slow = e.target.checked; } }), 'Удаан (ripple-ийг харах)'),
        h('button', { className: 'btn btn-sm', textContent: '▶ Дахин нэмэх', onclick: startRipple })),
      svg,
      h('div', { style: `margin-top:10px;font:700 1.05rem "JetBrains Mono",ui-monospace,monospace;line-height:1.7` },
        h('div', {}, `  ${bin(X)}  (${X})`), h('div', {}, `+ ${bin(Y)}  (${Y})`),
        h('div', { style: 'border-top:2px solid var(--fg);display:inline-block;padding-top:2px;color:#16a34a' }, finished ? `${R.carry}${bin(R.sum)}  (${result})` : '…нэмж байна'),
        finished && R.carry ? h('div', { textContent: `⚠ ${bits} bit-д багтахгүй — хамгийн зүүн carry = 1 (overflow)`, style: 'font:600 .85rem Inter,system-ui,sans-serif;color:#dc2626' }) : ''));
  }

  function startRipple() {
    clearTimeout(rippleTimer);
    if (!slow) { rippleStep = Infinity; render(); return; }
    rippleStep = 0; render();
    const tick = () => { rippleStep++; render(); if (rippleStep < bits) rippleTimer = setTimeout(tick, 420); };
    rippleTimer = setTimeout(tick, 420);
  }

  function render() {
    tabBtns.forEach((b, i) => b.setAttribute('aria-selected', String(tabs[i][0] === view)));
    ({ gates: renderGates, half: renderHalf, full: renderFull, adder: renderAdder })[view]();
  }
  render();
  new MutationObserver((_, o) => { if (!root.isConnected) { clearTimeout(rippleTimer); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
}
