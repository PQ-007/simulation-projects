// A tiny 8-bit CPU: PC, MAR, 16 bytes of RAM, IR, A and B registers, an ALU made of full adders, an OUT register.
// It runs one micro-step per clock tick, so every fetch, decode and execute step can be watched.
const sibling = name => import(new URL(name + new URL(import.meta.url).search, import.meta.url));
const { fullAdder } = await sibling('../logic-gates/demo.js');

// ---- instruction set: high nibble = opcode, low nibble = operand (an address or a 4-bit value) ----------
export const OPS = { NOP: 0x0, LDA: 0x1, ADD: 0x2, SUB: 0x3, STA: 0x4, LDI: 0x5, JMP: 0x6, JC: 0x7, OUT: 0xE, HLT: 0xF };
const NAME = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));
const NO_ARG = new Set(['NOP', 'OUT', 'HLT']);
export const mnemonic = byte => { const n = NAME[byte >> 4]; return !n ? `?${byte.toString(16)}` : NO_ARG.has(n) ? n : `${n} ${byte & 15}`; };

// ALU: 8 full adders from the Logic Gates project, carry rippling from bit 0 up.
export function add8(a, b, cin = 0) {
  let carry = cin, sum = 0;
  for (let i = 0; i < 8; i++) { const r = fullAdder((a >> i) & 1, (b >> i) & 1, carry); sum |= r.sum << i; carry = r.cout; }
  return { sum, carry };
}
// Subtraction is addition of the inverted B plus 1 (two's complement). Carry = 1 means "no borrow", i.e. A >= B.
export const alu = (op, a, b) => { const r = op === 'SUB' ? add8(a, (~b) & 255, 1) : add8(a, b, 0); return { value: r.sum, carry: r.carry }; };

export const newCPU = ram => ({ pc: 0, mar: 0, ir: 0, a: 0, b: 0, out: null, outs: [], c: 0, ram: [...ram], halted: false, t: 0, cycles: 0, instr: 0, lastAlu: null });

// Execute ONE micro-step. Returns what happened, for display: which parts were active and what was on the bus.
export function microStep(c) {
  if (c.halted) return null;
  const t = c.t, op = NAME[c.ir >> 4] ?? 'NOP', arg = c.ir & 15, info = { t, phase: t < 3 ? 'fetch' : 'execute' };
  const set = (desc, active, bus = null) => Object.assign(info, { desc, active, bus });
  c.cycles++;
  if (t === 0) { c.mar = c.pc; set(`MAR ← PC  (PC = ${c.pc} хаягийг bus-аар MAR руу)`, ['pc', 'mar', 'bus'], c.pc); c.t = 1; return info; }
  if (t === 1) { c.ir = c.ram[c.mar]; set(`IR ← RAM[${c.mar}] = ${mnemonic(c.ir)}  (командыг RAM-аас уншина)`, ['ram', 'ir', 'bus'], c.ir); c.t = 2; return info; }
  if (t === 2) { c.pc = (c.pc + 1) & 15; set(`PC ← PC + 1 = ${c.pc}  (дараагийн команд руу)`, ['pc'], null); c.t = 3; return info; }
  const next = last => { if (last) { c.t = 0; c.instr++; } else c.t = t + 1; };
  switch (op) {
    case 'LDA': case 'ADD': case 'SUB': case 'STA':
      if (t === 3) { c.mar = arg; set(`MAR ← ${arg}  (IR-ийн operand: ${op} ${arg})`, ['ir', 'mar', 'bus'], arg); next(false); }
      else if (t === 4 && op === 'STA') { c.ram[c.mar] = c.a; set(`RAM[${c.mar}] ← A = ${c.a}  (санах ойд бичнэ)`, ['a', 'ram', 'bus'], c.a); next(true); }
      else if (t === 4 && op === 'LDA') { c.a = c.ram[c.mar]; set(`A ← RAM[${c.mar}] = ${c.a}`, ['ram', 'a', 'bus'], c.a); next(true); }
      else if (t === 4) { c.b = c.ram[c.mar]; set(`B ← RAM[${c.mar}] = ${c.b}`, ['ram', 'b', 'bus'], c.b); next(false); }
      else {
        const r = alu(op, c.a, c.b);
        c.lastAlu = { op, a: c.a, b: c.b, ...r }; c.a = r.value; c.c = r.carry;
        set(`A ← A ${op === 'ADD' ? '+' : '−'} B = ${r.value}  (ALU-ийн 8 full adder, carry = ${r.carry})`, ['alu', 'a', 'b', 'flag'], null); next(true);
      }
      return info;
    case 'LDI': c.a = arg; set(`A ← ${arg}  (шууд утга)`, ['ir', 'a', 'bus'], arg); next(true); return info;
    case 'JMP': c.pc = arg; set(`PC ← ${arg}  (үсрэнэ)`, ['ir', 'pc', 'bus'], arg); next(true); return info;
    case 'JC':
      if (c.c) { c.pc = arg; set(`Carry = 1 → PC ← ${arg}  (үсэрлээ)`, ['flag', 'ir', 'pc', 'bus'], arg); }
      else set('Carry = 0 → үсрэхгүй, дараагийн команд', ['flag'], null);
      next(true); return info;
    case 'OUT': c.out = c.a; c.outs.push(c.a); set(`OUT ← A = ${c.a}  (дэлгэц рүү гаргана)`, ['a', 'out', 'bus'], c.a); next(true); return info;
    case 'HLT': c.halted = true; c.instr++; set('HLT — CPU зогслоо', [], null); return info;
    default: set('NOP — юу ч хийхгүй', [], null); next(true); return info;
  }
}

// ---- assembler: "LDA 14" lines are placed from address 0; "14: 28" puts the value 28 in RAM[14] ----------
export function assemble(text) {
  const ram = Array(16).fill(0), errors = []; let at = 0;
  const num = s => (/^0x/i.test(s) ? parseInt(s, 16) : /^\d+$/.test(s) ? +s : NaN);
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/;.*/, '').trim(); if (!line) return;
    const fail = m => errors.push(`${i + 1}-р мөр: ${m}`);
    let m = /^(\d+|0x[0-9a-f]+)\s*:\s*(\S+)$/i.exec(line);
    if (m) { const a = num(m[1]), v = num(m[2]); if (!(a >= 0 && a < 16)) fail('хаяг 0–15 байх ёстой'); else if (!(v >= 0 && v < 256)) fail('утга 0–255 байх ёстой'); else ram[a] = v; return; }
    m = /^([A-Za-z]+)(?:\s+(\S+))?$/.exec(line);
    const name = m?.[1].toUpperCase();
    if (!m || !(name in OPS)) return fail(`"${line}" ойлгомжгүй`);
    let arg = 0;
    if (!NO_ARG.has(name)) { arg = num(m[2] ?? ''); if (!(arg >= 0 && arg < 16)) return fail(`${name}-д 0–15 хоорондын тоо хэрэгтэй`); }
    else if (m[2]) return fail(`${name}-д operand хэрэггүй`);
    if (at > 15) return fail('програм 16 байтаас урт байна');
    ram[at++] = (OPS[name] << 4) | arg;
  });
  return { ram, errors, size: at };
}

export const PROGRAMS = {
  '28 + 14': { desc: 'RAM-аас хоёр тоо уншиж нэмээд гаргана.', text: 'LDA 14\nADD 15\nOUT\nHLT\n\n14: 28\n15: 14' },
  '3 × 4': { desc: 'Үржих = давтан нэмэх: 3-ыг 4 удаа нэмнэ. Тоолуур 0 болтол давтана.', text: '; үржих: 15 = 13 × 14\nLDA 14\nSUB 12\nJC 4\nJMP 9\nSTA 14\nLDA 15\nADD 13\nSTA 15\nJMP 0\nLDA 15\nOUT\nHLT\n\n12: 1   ; тогтмол 1\n13: 3   ; үржигдэхүүн\n14: 4   ; тоолуур\n15: 0   ; үр дүн' },
  'Тоолуур': { desc: '1, 2, 3 … 255 хүртэл тоолоод carry гарвал зогсоно.', text: 'LDA 15\nADD 14\nJC 6\nSTA 15\nOUT\nJMP 0\nHLT\n\n14: 1\n15: 0' },
};

const ACCENT = 'var(--accent)', ON = '#22c55e', mono = '"JetBrains Mono",ui-monospace,monospace';

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const diagram = h('div', { style: 'padding:6px 12px 0' });
  const logBox = h('div', { style: `font-size:.85rem;line-height:1.5;min-height:3.2em;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card)` });
  const ramBox = h('div', { style: 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px' });
  const outBox = h('div', { style: `font:700 1rem ${mono}` });
  const editor = h('textarea', { rows: 12, spellcheck: false, style: `width:100%;resize:vertical;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font-size:.82rem;line-height:1.5;font-family:${mono}` });
  const errBox = h('div', { style: 'font-size:.8rem;color:#dc2626;white-space:pre-line' });
  const speed = h('input', { type: 'range', min: 1, max: 40, value: 6, style: 'width:90px' });
  const btn = (text, onclick, title = '') => h('button', { className: 'btn btn-sm', textContent: text, onclick, title });
  const play = btn('▶ Ажиллуул', () => (timer ? stop() : start()));
  const progSeg = h('div', { className: 'seg', style: 'flex-wrap:wrap' });
  const progBtns = Object.keys(PROGRAMS).map(k => h('button', { textContent: k, onclick: () => load(k) }));
  progSeg.append(...progBtns);
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center' }, ...kids);
  const left = h('div', { style: 'flex:1 1 560px;min-width:0;display:flex;flex-direction:column;gap:10px' },
    row(h('span', { textContent: 'Програм:', style: 'font-size:.85rem;color:var(--muted)' }), progSeg),
    diagram, logBox,
    row(btn('⏭ 1 micro-step', () => { stop(); step(); }, 'Нэг clock цохилт'), btn('⏩ 1 команд', () => { stop(); stepInstr(); }), play,
      h('label', { style: 'display:flex;gap:6px;align-items:center;font-size:.85rem;color:var(--muted)' }, 'Хурд', speed),
      btn('⏭⏭ Дуустал', () => { stop(); runAll(); }), btn('Reset', () => { stop(); reset(); })));
  const right = h('div', { style: 'flex:0 1 330px;min-width:240px;display:flex;flex-direction:column;gap:10px' },
    h('div', { style: 'font-size:.8rem;font-weight:700;color:var(--muted)' }, 'RAM (16 байт) — одоогийн команд, MAR'), ramBox,
    h('div', {}, h('div', { textContent: 'OUT гаралт:', style: 'font-size:.8rem;font-weight:700;color:var(--muted)' }), outBox),
    h('details', {}, h('summary', { textContent: 'Програмаа өөрөө бич (assembly)', style: 'cursor:pointer;font-size:.85rem;color:var(--muted)' }),
      h('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:6px' }, editor, errBox,
        h('div', { style: 'font-size:.78rem;color:var(--muted);line-height:1.5' }, 'Команд: LDA ADD SUB STA LDI JMP JC OUT HLT NOP. ', h('code', { textContent: '14: 28' }), ' = RAM[14]-д 28 тавь.'),
        btn('Ачаалах', () => { stop(); const r = assemble(editor.value); errBox.textContent = r.errors.join('\n'); if (!r.errors.length) { prog = null; codeSize = r.size; progBtns.forEach(b => b.setAttribute('aria-selected', 'false')); reset(r.ram); } }))));
  root.append(h('div', { style: 'flex:1;min-height:0;overflow:auto;padding:12px 14px;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start' }, left, right));

  let cpu, base, codeSize = 0, prog = '28 + 14', timer = 0, last = null, log = [];

  function load(name) {
    prog = name; editor.value = PROGRAMS[name].text; errBox.textContent = '';
    progBtns.forEach(b => b.setAttribute('aria-selected', String(b.textContent === name)));
    const r = assemble(PROGRAMS[name].text); codeSize = r.size; reset(r.ram);
  }
  function reset(ram = base) { base = ram; cpu = newCPU(base); last = null; log = []; render(); }
  function step() {
    const info = microStep(cpu);
    if (info) { last = info; log.push(info); if (log.length > 6) log.shift(); }
    else stop();
    if (cpu.halted) stop();
    render();
    return !!info;
  }
  function stepInstr() { const n = cpu.instr; for (let i = 0; i < 12 && !cpu.halted; i++) { step(); if (cpu.instr > n) break; } }
  function runAll() { for (let i = 0; i < 200000 && !cpu.halted; i++) microStep(cpu); last = { t: 0, desc: `Дууслаа: ${cpu.cycles} clock, ${cpu.instr} команд`, active: [] }; render(); }
  function start() { if (cpu.halted) reset(); timer = setInterval(step, 1000 / +speed.value); play.textContent = '❚❚ Зогсоох'; }
  function stop() { clearInterval(timer); timer = 0; play.textContent = '▶ Ажиллуул'; }
  speed.oninput = () => { if (timer) { stop(); start(); } };

  // ---------- drawing ----------
  const bits = (v, n, x, y) => Array.from({ length: n }, (_, i) => {
    const on = (v >> (n - 1 - i)) & 1;
    return `<circle cx="${x + i * 15}" cy="${y}" r="5.5" fill="${on ? '#facc15' : 'var(--code)'}" stroke="${on ? '#ca8a04' : 'var(--muted)'}" stroke-width="1.2"/>`;
  }).join('');
  function renderDiagram() {
    const act = new Set(last?.active || []), bus = last?.bus, busOn = act.has('bus');
    const box = (id, x, y, w, hh, title, lines, bitsHtml = '') => {
      const on = act.has(id);
      return `<rect x="${x}" y="${y}" width="${w}" height="${hh}" rx="10" fill="${on ? 'var(--accent-soft)' : 'var(--card)'}" stroke="${on ? ACCENT : 'var(--fg)'}" stroke-width="${on ? 3.2 : 1.5}"/>`
        + `<text x="${x + 10}" y="${y + 18}" font-size="12" font-weight="800" fill="${on ? ACCENT : 'var(--fg)'}">${title}</text>`
        + lines.map((l, i) => `<text x="${x + w - 10}" y="${y + 18 + i * 15}" text-anchor="end" font-size="${i ? 11 : 13}" font-weight="${i ? 500 : 700}" fill="${i ? 'var(--muted)' : 'var(--fg)'}" font-family='${mono}'>${l}</text>`).join('')
        + bitsHtml;
    };
    const tap = (id, x1, x2, y) => `<polyline points="${x1},${y} ${x2},${y}" fill="none" stroke="${busOn && act.has(id) ? ON : 'var(--line)'}" stroke-width="${busOn && act.has(id) ? 5 : 3}" stroke-linecap="round"/>`;
    const BX = 305, ramVal = cpu.ram[cpu.mar], op = NAME[cpu.ir >> 4];
    let s = `<line x1="${BX}" y1="22" x2="${BX}" y2="398" stroke="${busOn ? ON : 'var(--line)'}" stroke-width="${busOn ? 8 : 6}" stroke-linecap="round"/>`
      + `<text x="${BX}" y="14" text-anchor="middle" font-size="11" font-weight="700" fill="var(--muted)">BUS${busOn && bus !== null ? `: ${bus} = ${bus.toString(2).padStart(8, '0')}` : ''}</text>`
      + tap('pc', 190, BX, 52) + tap('mar', 190, BX, 132) + tap('ram', 190, BX, 232) + tap('ir', BX, 420, 52) + tap('a', BX, 420, 132) + tap('b', BX, 420, 296) + tap('out', BX, 420, 368)
      + box('pc', 20, 24, 170, 56, 'PC (команд тоологч)', [cpu.pc, '4 bit'], bits(cpu.pc, 4, 32, 66))
      + box('mar', 20, 104, 170, 56, 'MAR (хаяг)', [cpu.mar, '4 bit'], bits(cpu.mar, 4, 32, 146))
      + box('ram', 20, 184, 170, 96, 'RAM', [`[${cpu.mar}] = ${ramVal}`, mnemonic(ramVal)], bits(ramVal, 8, 32, 262))
      + box('ctrl', 20, 304, 170, 94, 'CONTROL', [last ? `T${last.t}` : 'T0', last?.phase === 'fetch' ? 'FETCH' : last ? 'EXECUTE' : '—'],
        Array.from({ length: 6 }, (_, i) => `<rect x="${30 + i * 25}" y="364" width="20" height="22" rx="4" fill="${(last ? last.t : -1) === i ? ACCENT : 'var(--code)'}"/><text x="${40 + i * 25}" y="379" text-anchor="middle" font-size="10" fill="${(last ? last.t : -1) === i ? '#fff' : 'var(--muted)'}">${i}</text>`).join(''))
      + box('ir', 420, 24, 210, 56, 'IR (команд)', [mnemonic(cpu.ir), cpu.ir.toString(2).padStart(8, '0')], bits(cpu.ir, 8, 432, 66))
      + box('a', 420, 104, 210, 56, 'A register', [cpu.a, '8 bit'], bits(cpu.a, 8, 432, 146))
      + box('alu', 420, 176, 210, 84, 'ALU = 8 full adder', cpu.lastAlu ? [`${cpu.lastAlu.a} ${cpu.lastAlu.op === 'ADD' ? '+' : '−'} ${cpu.lastAlu.b}`, `= ${cpu.lastAlu.value}, carry ${cpu.lastAlu.carry}`] : ['—', 'ADD / SUB'])
      + box('b', 420, 272, 210, 48, 'B register', [cpu.b], bits(cpu.b, 8, 432, 308).replace(/cy="308"/g, 'cy="310"'))
      + box('out', 420, 344, 210, 54, 'OUT', [cpu.out ?? '—', cpu.out === null ? '' : cpu.out.toString(2).padStart(8, '0')])
      + box('flag', 644, 176, 66, 84, 'Carry', [cpu.c], '')
      + `<polyline points="630,218 644,218" fill="none" stroke="${act.has('alu') ? ON : 'var(--line)'}" stroke-width="3"/>`
      + `<line x1="${BX}" y1="218" x2="420" y2="218" stroke="${act.has('alu') ? ON : 'var(--line)'}" stroke-width="3"/>`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 724 408');
    // Fills the column in full view, but stays short enough that the log and buttons below remain on screen.
    svg.setAttribute('style', 'display:block;width:100%;max-height:max(320px,calc(100dvh - 390px));margin-inline:auto;font-family:Inter,system-ui,sans-serif');
    svg.innerHTML = s;
    diagram.replaceChildren(svg);
  }

  function render() {
    renderDiagram();
    logBox.replaceChildren(...(log.length ? log.map((l, i) => h('div', { style: `opacity:${0.45 + 0.55 * (i + 1) / log.length};${i === log.length - 1 ? 'font-weight:700' : ''}` },
      h('span', { textContent: `${l.phase === 'fetch' ? 'FETCH' : 'EXEC '} T${l.t}  `, style: `font-family:${mono};color:${l.phase === 'fetch' ? '#2563eb' : '#ea580c'}` }), l.desc))
      : [h('div', { textContent: `${PROGRAMS[prog]?.desc ?? 'Өөрийн програм.'}  ⏭ дарж эхлүүл — clock цохилт бүр нэг micro-step.`, style: 'color:var(--muted)' })]));
    ramBox.replaceChildren(...cpu.ram.map((byte, i) => {
      const isPC = i === cpu.pc, isMAR = i === cpu.mar && cpu.t > 0;
      return h('div', { style: `padding:4px 6px;border:${isPC ? '2px solid var(--accent)' : '1px solid var(--line)'};border-radius:7px;background:${isMAR ? 'var(--accent-soft)' : 'var(--card)'};font:600 .72rem ${mono};line-height:1.35` },
        h('div', { textContent: `${i}${isPC ? ' ◂PC' : ''}`, style: 'color:var(--muted);font-size:.65rem' }), ...(i < codeSize
          ? [h('div', { textContent: mnemonic(byte) }), h('div', { textContent: byte, style: 'color:var(--muted);font-weight:500' })]
          : [h('div', { textContent: byte }), h('div', { textContent: 'өгөгдөл', style: 'color:var(--muted);font-weight:500;font-size:.62rem' })]));
    }));
    outBox.textContent = cpu.outs.length ? cpu.outs.slice(-14).join('  ') + (cpu.outs.length > 14 ? '  …' : '') : '—';
    if (cpu.halted) outBox.textContent += `   ■ HLT · ${cpu.cycles} clock · ${cpu.instr} команд`;
  }

  load(prog);
  new MutationObserver((_, o) => { if (!root.isConnected) { clearInterval(timer); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
}
