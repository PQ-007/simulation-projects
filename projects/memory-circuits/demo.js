// Memory from gates: SR latch → D latch → master-slave D flip-flop → register → counter.
// A tiny netlist simulator evaluates gates repeatedly until the feedback loops stop changing.
const sibling = name => import(new URL(name + new URL(import.meta.url).search, import.meta.url));
const { gateShape, outX, wire, sw, lamp } = await sibling('../logic-gates/demo.js');

const FN = { NOT: a => 1 - a, AND: (a, b) => a & b, OR: (a, b) => a | b, NAND: (a, b) => 1 - (a & b), NOR: (a, b) => 1 - (a | b) };

// Evaluate gates in order, in place, until nothing changes. Feedback loops are what make memory possible:
// the stable state they settle into depends on what they held before.
export function settle(net, v) {
  for (let i = 0; i < 100; i++) {
    let changed = false;
    for (const g of net) {
      const out = FN[g.t](...g.i.map(n => v[n] ?? 0));
      if (v[g.o] !== out) { v[g.o] = out; changed = true; }
    }
    if (!changed) return true;
  }
  return false; // never settled (an oscillating loop)
}

// D latch from 4 NANDs + NOT: while E = 1 the output follows D, while E = 0 it holds.
export const latch = (p, D, E) => [
  { o: p + 'nd', t: 'NOT', i: [D] }, { o: p + 's', t: 'NAND', i: [D, E] }, { o: p + 'r', t: 'NAND', i: [p + 'nd', E] },
  { o: p + 'Q', t: 'NAND', i: [p + 's', p + 'Qn'] }, { o: p + 'Qn', t: 'NAND', i: [p + 'r', p + 'Q'] },
];
// Master-slave D flip-flop: two latches with opposite enables, so Q only changes at the clock's rising edge.
export const dff = (p, D, CLK) => [
  { o: p + 'nclk', t: 'NOT', i: [CLK] },
  ...latch(p + 'm.', D, p + 'nclk'), ...latch(p + 's.', p + 'm.Q', CLK),
];
export const dffQ = p => p + 's.Q', dffQn = p => p + 's.Qn';

// Put every latch into the "Q = 0" state, then let the gates settle (a hardware reset).
export function forceZero(net, v) {
  for (const g of net) if (/(^|\.)Q$/.test(g.o)) { v[g.o] = 0; v[g.o + 'n'] = 1; v[g.o.replace(/Q$/, 's')] = 1; v[g.o.replace(/Q$/, 'r')] = 1; }
  settle(net, v);
}
// 4-bit ripple counter: each flip-flop toggles (D = its own Qn) and clocks the next one from its Qn.
export const rippleCounter = bits => {
  const net = [];
  for (let k = 0; k < bits; k++) net.push(...dff(`f${k}.`, dffQn(`f${k}.`), k ? dffQn(`f${k - 1}.`) : 'CLK'));
  return net;
};

const TITLES = [['sr', '1. SR latch'], ['d', '2. D latch'], ['ff', '3. Flip-flop'], ['reg', '4. Register'], ['cnt', '5. Counter']];
const mono = '"JetBrains Mono",ui-monospace,monospace';

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const seg = h('div', { className: 'seg', style: 'flex-wrap:wrap' });
  const btns = TITLES.map(([k, t]) => h('button', { textContent: t, onclick: () => { view = k; resetView(); render(); } }));
  seg.append(...btns);
  const body = h('div', { style: 'flex:1;min-height:0;overflow:auto;padding:12px 14px' });
  root.append(h('div', { style: 'padding:12px 14px 0' }, seg), body);

  let view = 'sr', S = {}, net = [], v = {}, hist = [], run = 0, wasBoth = false;

  // Notes are my own constant strings; **text** becomes bold.
  const note = s => h('p', { style: 'margin:0 0 10px;font-size:.92rem;color:var(--muted);line-height:1.55', innerHTML: s.replace(/\*\*(.+?)\*\*/g, '<b style="color:var(--fg)">$1</b>') });
  const svgEl = (vb, html, maxW) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', vb);
    s.setAttribute('style', `display:block;width:100%;max-width:${maxW}px;font-family:Inter,system-ui,sans-serif;user-select:none`);
    s.innerHTML = html;
    s.addEventListener('click', e => { const g = e.target.closest('[data-toggle]'); if (g) toggle(g.dataset.toggle); });
    return s;
  };
  const btn = (text, onclick) => h('button', { className: 'btn btn-sm', textContent: text, onclick });
  // Record the state after every input change, for the timing diagrams.
  const snap = () => { hist.push({ ...S, ...Object.fromEntries(Object.keys(v).map(k => [k, v[k]])) }); if (hist.length > 40) hist.shift(); };

  function resetView() {
    clearInterval(run); run = 0; hist = []; wasBoth = false;
    S = { S: 0, R: 0, D: 1, E: 0, CLK: 0, D0: 1, D1: 0, D2: 1, D3: 1 };
    v = {};
    if (view === 'sr') net = [{ o: 'Q', t: 'NOR', i: ['R', 'Qn'] }, { o: 'Qn', t: 'NOR', i: ['S', 'Q'] }];
    else if (view === 'd') net = latch('', 'D', 'E');
    else if (view === 'ff') net = dff('', 'D', 'CLK');
    else if (view === 'reg') net = [0, 1, 2, 3].flatMap(k => dff(`r${k}.`, `D${k}`, 'CLK'));
    else net = rippleCounter(4);
    apply();
    if (view === 'cnt') { v = {}; forceZero(net, v); }
    else if (view === 'sr') { v.Q = 0; v.Qn = 1; apply(); }
    snap();
  }
  function apply() { Object.assign(v, S); settle(net, v); }
  function toggle(k) {
    const before = { ...S };
    S[k] = 1 - S[k];
    if (view === 'sr') { wasBoth = before.S && before.R && !(S.S || S.R) ? true : (S.S || S.R) ? false : wasBoth; }
    apply(); snap(); render();
  }
  function pulse() { // CLK 0 → 1 → 0
    S.CLK = 1; apply(); snap(); render();
    setTimeout(() => { S.CLK = 0; apply(); snap(); render(); }, 380);
  }

  // ---- timing diagram: one row per signal, one column per recorded event ----
  function timing(rows, title) {
    const W = Math.max(hist.length, 8) * 26 + 70, rh = 34;
    let s = '';
    rows.forEach(([label, get], r) => {
      const y0 = 14 + r * rh;
      s += `<text x="4" y="${y0 + 16}" font-size="12" font-weight="700" fill="var(--fg)">${label}</text>`;
      let d = '', prevY = 0;
      hist.forEach((st, i) => {
        const y = y0 + (get(st) ? 4 : 22), x = 60 + i * 26;
        d += (i ? `L${x},${prevY} L${x},${y} ` : `M${x},${y} `) + `L${x + 26},${y} `;
        prevY = y;
      });
      s += `<path d="${d}" fill="none" stroke="${label === 'CLK' ? '#3b82f6' : '#16a34a'}" stroke-width="2.4" stroke-linejoin="round"/>`;
    });
    return h('div', { style: 'margin-top:10px;overflow-x:auto;border:1px solid var(--line);border-radius:10px;padding:6px 8px;background:var(--card)' },
      h('div', { textContent: title, style: 'font-size:.8rem;color:var(--muted)' }), svgEl(`0 0 ${W} ${rows.length * rh + 14}`, s, W));
  }

  // ---- 1. SR latch ----
  function renderSR() {
    const { S: s, R: r } = S, Q = v.Q, Qn = v.Qn, both = s && r;
    const g1 = 200, g2 = 200, ox = outX('NOR', 200), y1 = 80, y2 = 200;
    let svg = sw('R', 50, y1 - 10, r, 'R') + sw('S', 50, y2 + 10, s, 'S')
      + wire([[68, y1 - 10], [200, y1 - 10]], r) + wire([[68, y2 + 10], [200, y2 + 10]], s)
      + gateShape('NOR', 200, y1, Q) + gateShape('NOR', 200, y2, Qn)
      // Q feeds back into the bottom gate, Qn into the top gate — this loop is the memory
      + wire([[ox, y1], [ox + 24, y1], [ox + 24, 140], [172, 140], [172, y2 - 10], [200, y2 - 10]], Q, [[ox + 24, y1]])
      + wire([[ox, y2], [ox + 40, y2], [ox + 40, 152], [186, 152], [186, y1 + 10], [200, y1 + 10]], Qn, [[ox + 40, y2]])
      + wire([[ox + 24, y1], [ox + 100, y1]], Q) + wire([[ox + 40, y2], [ox + 100, y2]], Qn)
      + lamp(ox + 118, y1, Q, 'Q', 'санах ой') + lamp(ox + 118, y2, Qn, 'Q̅', 'эсрэг');
    const msg = both ? ['⚠ S = R = 1: хоёр гаралт 0 боллоо — энэ нь хориотой байдал (Q ба Q̅ эсрэг байх ёстой)', '#dc2626']
      : wasBoth ? ['⚠ S, R хоёулаа 1-ээс 0 болов — аль нь ялахыг урьдчилан хэлэх боломжгүй (бодит чипэд санамсаргүй)', '#dc2626']
      : s ? ['S = 1 → SET: Q = 1 болно', 'var(--fg)'] : r ? ['R = 1 → RESET: Q = 0 болно', 'var(--fg)'] : [`S = R = 0 → ХАДГАЛНА: Q = ${Q} хэвээр үлдэнэ`, '#16a34a'];
    body.replaceChildren(
      note('Хоёр NOR gate гаралтаа бие биеийнхээ оролт руу холбосон: Q → доод gate, Q̅ → дээд gate. Энэ **гогцоо** нь утгыг "түгжиж" санадаг. Туршаад үз: S-ийг 1 болгоод буцааж 0 болго — Q 1 хэвээр үлдэнэ!'),
      svgEl('0 0 560 260', svg, 640),
      h('div', { textContent: msg[0], style: `margin-top:8px;font-weight:700;color:${msg[1]}` }),
      h('table', { style: `border-collapse:collapse;font:600 .85rem ${mono};margin-top:10px;text-align:center` },
        h('tr', {}, ...['S', 'R', 'Q', 'Юу болох'].map(t => h('th', { textContent: t, style: 'padding:3px 12px;color:var(--muted);border-bottom:2px solid var(--line)' }))),
        ...[[0, 0, '—', 'хадгална'], [1, 0, '1', 'SET'], [0, 1, '0', 'RESET'], [1, 1, '?', 'хориотой']].map(([a, b, c, t]) =>
          h('tr', { style: a === s && b === r ? 'background:var(--accent-soft)' : '' }, ...[a, b, c, t].map(x => h('td', { textContent: x, style: 'padding:3px 12px;border-bottom:1px solid var(--line)' }))))));
  }

  // ---- 2. D latch ----
  function renderD() {
    const { D, E } = S, Q = v.Q, Qn = v.Qn, nd = v.nd, s = v.s, r = v.r;
    const gate = (t, x, y, val) => gateShape(t, x, y, val);
    let svg = sw('D', 40, 70, D, 'D') + sw('E', 40, 250, E, 'E')
      + wire([[58, 70], [100, 70]], D, [[100, 70]]) + wire([[100, 70], [100, 60], [210, 60]], D) + wire([[100, 70], [100, 130], [120, 130]], D)
      + gate('NOT', 120, 130, nd) + wire([[164, 130], [190, 130], [190, 180], [210, 180]], nd)
      + wire([[58, 250], [180, 250]], E) + wire([[180, 250], [180, 80], [210, 80]], E, [[180, 200]]) + wire([[180, 200], [210, 200]], E)
      + gate('NAND', 210, 70, s) + gate('NAND', 210, 190, r)
      + wire([[264, 70], [300, 70], [300, 90], [330, 90]], s) + wire([[264, 190], [300, 190], [300, 180], [330, 180]], r)
      + gate('NAND', 330, 100, Q) + gate('NAND', 330, 170, Qn)
      + wire([[384, 100], [410, 100], [410, 135], [310, 135], [310, 160], [330, 160]], Q, [[410, 100]])
      + wire([[384, 170], [400, 170], [400, 125], [318, 125], [318, 110], [330, 110]], Qn, [[400, 170]])
      + wire([[410, 100], [455, 100]], Q) + wire([[400, 170], [455, 170]], Qn)
      + lamp(470, 100, Q, 'Q', 'санах ой') + lamp(470, 170, Qn, 'Q̅');
    body.replaceChildren(
      note('SR latch-д S, R хоёрыг тусад нь удирдах хэцүү. D latch нэг "өгөгдөл" D, нэг "зөвшөөрөл" E (enable) ашиглана. **E = 1** үед Q нь D-г дагана (хаалга онгорхой). **E = 0** үед хаалга хаагдаж Q **хадгална**.'),
      svgEl('0 0 580 280', svg, 680),
      h('div', { style: 'margin-top:8px;font-weight:700;color:var(--fg)' }, E ? `E = 1: хаалга ОНГОРХОЙ → Q = D = ${D}` : `E = 0: хаалга ХААЛТТАЙ → Q = ${Q} хадгалагдсан (D-г ойшоохгүй)`),
      h('div', { style: 'display:flex;gap:8px;margin-top:8px' }, btn('Туршилт: E = 1, D = 1, дараа нь E = 0, D = 0', () => { Object.assign(S, { E: 1, D: 1 }); apply(); snap(); render(); setTimeout(() => { S.E = 0; apply(); snap(); render(); setTimeout(() => { S.D = 0; apply(); snap(); render(); }, 450); }, 450); })),
      timing([['E', s0 => s0.E], ['D', s0 => s0.D], ['Q', s0 => s0.Q]], 'Цаг хугацааны диаграмм (өөрчлөлт бүрд нэг алхам)'));
  }

  // ---- 3. master-slave flip-flop ----
  function renderFF() {
    const { D, CLK } = S, mQ = v['m.Q'], sQ = v['s.Q'], me = 1 - CLK, se = CLK;
    const box = (x, label, en, q) => `<rect x="${x}" y="70" width="130" height="110" rx="12" fill="${en ? 'var(--accent-soft)' : 'var(--card)'}" stroke="${en ? 'var(--accent)' : 'var(--muted)'}" stroke-width="${en ? 3 : 1.6}"/>`
      + `<text x="${x + 65}" y="98" text-anchor="middle" font-size="14" font-weight="800" fill="var(--fg)">${label}</text>`
      + `<text x="${x + 65}" y="122" text-anchor="middle" font-size="11" fill="${en ? 'var(--accent)' : 'var(--muted)'}">${en ? 'хаалга ОНГОРХОЙ' : 'хаалга ХААЛТТАЙ'}</text>`
      + `<text x="${x + 65}" y="160" text-anchor="middle" font-size="26" font-weight="800" fill="${q ? '#16a34a' : 'var(--muted)'}">${q}</text>`;
    let svg = sw('D', 40, 125, D, 'D') + wire([[58, 125], [100, 125]], D)
      + box(100, 'MASTER', me, mQ) + wire([[230, 125], [320, 125]], mQ) + box(320, 'SLAVE', se, sQ)
      + wire([[450, 125], [510, 125]], sQ) + lamp(526, 125, sQ, 'Q')
      + sw('CLK', 40, 250, CLK, 'CLK')
      + wire([[58, 250], [385, 250], [385, 180]], CLK, [[165, 250]])
      + wire([[165, 250], [165, 180]], 1 - CLK) + `<text x="172" y="222" font-size="11" fill="var(--muted)">NOT: эсрэг</text>`;
    body.replaceChildren(
      note('Flip-flop = **хоёр D latch** дараалуулсан, хаалга нь **эсрэг** ээлжээр онгойдог. CLK = 0 үед MASTER D-г харна, SLAVE хаалттай. CLK 0 → 1 болох **мөчид** MASTER хаагдаж, түүнд байсан утгыг SLAVE өөртөө авна. Тиймээс Q нь **зөвхөн CLK өгсөх (↑) мөчид** өөрчлөгдөнө!'),
      svgEl('-30 0 630 280', svg, 700),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px' }, btn('⏵ Нэг CLK пульс (0→1→0)', pulse)),
      h('div', { style: 'margin-top:8px;font-weight:700' }, CLK ? 'CLK = 1: SLAVE онгорхой, MASTER хаалттай — D-г солиход Q өөрчлөгдөхгүй!' : 'CLK = 0: MASTER онгорхой — D-г солиход зөвхөн MASTER дагана, Q хөдлөхгүй'),
      timing([['CLK', s0 => s0.CLK], ['D', s0 => s0.D], ['Q', s0 => s0['s.Q']]], 'Q зөвхөн CLK өгсөх үед D-г хуулна'));
  }

  // ---- 4. register ----
  function renderReg() {
    let svg = '';
    for (let k = 0; k < 4; k++) {
      const x = 450 - k * 125, Dk = S[`D${k}`], Qk = v[`r${k}.s.Q`];
      svg += sw(`D${k}`, x, 40, Dk, `D${k}`.replace('D', '')) + wire([[x, 56], [x, 100]], Dk)
        + `<rect x="${x - 42}" y="100" width="84" height="64" rx="10" fill="var(--card)" stroke="${S.CLK ? 'var(--accent)' : 'var(--fg)'}" stroke-width="${S.CLK ? 3 : 1.6}"/>`
        + `<text x="${x}" y="128" text-anchor="middle" font-size="13" font-weight="800" fill="var(--fg)">D flip-flop</text><text x="${x}" y="148" text-anchor="middle" font-size="10" fill="var(--muted)">bit ${k}</text>`
        + wire([[x, 164], [x, 210]], Qk) + lamp(x, 226, Qk, '');
    }
    // One clock rail above the flip-flops, tapped into each box (a crossing with the D wires is just a crossing).
    const clk = S.CLK ? '#3b82f6' : 'var(--line)';
    svg += `<polyline points="48,84 480,84" fill="none" stroke="${clk}" stroke-width="4" stroke-linecap="round"/>`
      + [0, 1, 2, 3].map(k => `<polyline points="${450 - k * 125 - 28},84 ${450 - k * 125 - 28},100" fill="none" stroke="${clk}" stroke-width="4"/><circle cx="${450 - k * 125 - 28}" cy="84" r="4" fill="${clk}"/>`).join('')
      + sw('CLK', 30, 84, S.CLK, 'CLK')
      + `<text x="520" y="44" font-size="13" font-weight="700" fill="var(--fg)">D (оролт)</text><text x="520" y="230" font-size="13" font-weight="700" fill="var(--fg)">Q (хадгалсан)</text>`;
    const val = [3, 2, 1, 0].map(k => v[`r${k}.s.Q`]).join(''), inp = [3, 2, 1, 0].map(k => S[`D${k}`]).join('');
    body.replaceChildren(
      note('4 flip-flop нэг CLK-ээр удирдуулж **4-bit register** болно. Дээд талын D товчлууруудаар тоо бэлдээд, **CLK пульс** өгөхөд л тоо register-д "бичигдэнэ". Дараа нь D-г өөрчилсөн ч register хуучнаа хадгална. CPU-ийн дотор ийм хэдэн арван register байдаг.'),
      svgEl('-30 0 680 262', svg, 760),
      h('div', { style: `display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin-top:6px;font:700 1.05rem ${mono}` },
        btn('⏵ CLK пульс', pulse), h('span', {}, `Оролт D = ${inp} (${parseInt(inp, 2)})`), h('span', { textContent: `Register = ${val} (${parseInt(val, 2)})`, style: `color:${val === inp ? '#16a34a' : '#ea580c'}` })),
      timing([['CLK', s0 => s0.CLK], ['D3', s0 => s0.D3], ['Q3', s0 => s0['r3.s.Q']], ['Q0', s0 => s0['r0.s.Q']]], 'Register зөвхөн CLK өгсөх үед шинэчлэгдэнэ'));
  }

  // ---- 5. ripple counter ----
  function renderCnt() {
    let svg = '';
    for (let k = 0; k < 4; k++) {
      const x = 450 - k * 125, Q = v[`f${k}.s.Q`], clk = k ? v[`f${k - 1}.s.Qn`] : S.CLK;
      svg += `<rect x="${x - 42}" y="80" width="84" height="64" rx="10" fill="var(--card)" stroke="var(--fg)" stroke-width="1.6"/>`
        + `<text x="${x}" y="108" text-anchor="middle" font-size="13" font-weight="800" fill="var(--fg)">T flip-flop</text><text x="${x}" y="128" text-anchor="middle" font-size="10" fill="var(--muted)">bit ${k}</text>`
        + wire([[x, 144], [x, 190]], Q) + lamp(x, 206, Q, '')
        + (k ? wire([[x + 83, 112], [x + 42, 112]], clk) : wire([[x + 83, 112], [x + 42, 112]], S.CLK));
    }
    svg += sw('CLK', 570, 112, S.CLK, 'CLK')
      + `<text x="150" y="44" font-size="12" fill="var(--muted)">Q̅ → дараагийн flip-flop-ын CLK  ←  ←  ←</text>`;
    const val = [3, 2, 1, 0].map(k => v[`f${k}.s.Q`]).join('');
    body.replaceChildren(
      note('Flip-flop бүр өөрийн Q̅-г D-д буцааж холбоход **хоёр CLK тутамд нэг удаа** эргэдэг (toggle). Нэгнийх нь гаралтыг дараагийн нь CLK болгон ашиглавал 4 flip-flop **0 → 15** хүртэл тоолно — хоёртын тоолуур! Бит бүр өмнөхөөсөө хоёр дахин удаан эргэнэ.'),
      svgEl('0 0 640 250', svg, 740),
      h('div', { style: `display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:6px;font:700 1.2rem ${mono}` },
        btn('⏵ CLK пульс', () => { pulseCnt(); }),
        h('label', { style: 'display:flex;gap:6px;align-items:center;font:500 .85rem Inter,system-ui,sans-serif' }, h('input', { type: 'checkbox', checked: !!run, onchange: e => autoRun(e.target.checked) }), 'Автоматаар'),
        btn('Reset', () => { resetView(); render(); }),
        h('span', { textContent: `${val}₂ = ${parseInt(val, 2)}`, style: 'color:#16a34a' })),
      timing([['CLK', s0 => s0.CLK], ['Q3', s0 => s0['f3.s.Q']], ['Q2', s0 => s0['f2.s.Q']], ['Q1', s0 => s0['f1.s.Q']], ['Q0', s0 => s0['f0.s.Q']]], 'Q0 хамгийн хурдан, Q3 хамгийн удаан — хоёртын тооны орон бүр'));
  }
  const pulseCnt = () => { S.CLK = 1; apply(); snap(); S.CLK = 0; apply(); snap(); render(); };
  function autoRun(on) { clearInterval(run); run = on ? setInterval(pulseCnt, 650) : 0; }

  function render() {
    btns.forEach((b, i) => b.setAttribute('aria-selected', String(TITLES[i][0] === view)));
    ({ sr: renderSR, d: renderD, ff: renderFF, reg: renderReg, cnt: renderCnt })[view]();
  }
  resetView(); render();
  new MutationObserver((_, o) => { if (!root.isConnected) { clearInterval(run); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
}
