// Lossless compression side by side: RLE, Huffman coding and LZ77 (LZSS), against the entropy limit and real gzip.
const enc = new TextEncoder();
const charBits = c => 8 * enc.encode(c).length; // UTF-8: Latin letters 8 bits, Cyrillic 16
export const show = c => (c === ' ' ? '␣' : c === '\n' ? '↵' : c);

// Run-length encoding: each run of a repeated character becomes (count, character). Count fits one byte.
export function rle(text) {
  const chars = [...text], runs = [];
  for (let i = 0; i < chars.length;) {
    let j = i;
    while (j < chars.length && chars[j] === chars[i] && j - i < 255) j++;
    runs.push({ ch: chars[i], n: j - i });
    i = j;
  }
  return { runs, bits: runs.reduce((s, r) => s + 8 + charBits(r.ch), 0) };
}
export const unrle = runs => runs.map(r => r.ch.repeat(r.n)).join('');

// Huffman coding: repeatedly merge the two least frequent trees; frequent characters end up near the root
// and get short codes. `steps` records every merge so the tree can be built up step by step on screen.
export function huffman(text) {
  const freq = new Map();
  for (const c of text) freq.set(c, (freq.get(c) || 0) + 1);
  let id = 0;
  let forest = [...freq].sort((a, b) => b[1] - a[1]).map(([ch, f]) => ({ ch, f, id: id++ }));
  const steps = [forest.slice()];
  while (forest.length > 1) {
    const sorted = forest.slice().sort((a, b) => a.f - b.f || a.id - b.id);
    const [a, b] = sorted, node = { f: a.f + b.f, left: a, right: b, id: id++ };
    forest = forest.filter(t => t !== a && t !== b).concat(node);
    steps.push(forest.slice());
  }
  const codes = new Map(), root = forest[0];
  const walk = (n, code) => { if (!n) return; if (n.ch !== undefined) codes.set(n.ch, code || '0'); else { walk(n.left, code + '0'); walk(n.right, code + '1'); } };
  walk(root, '');
  let bits = 0;
  for (const [c, f] of freq) bits += f * codes.get(c).length;
  return { freq, codes, root, steps, bits };
}
export function unhuffman(bitstring, root) {
  if (root.ch !== undefined) return root.ch.repeat(bitstring.length);
  let out = '', n = root;
  for (const b of bitstring) { n = b === '0' ? n.left : n.right; if (n.ch !== undefined) { out += n.ch; n = root; } }
  return out;
}

// LZ77 in its LZSS form: at each position look back up to `window` characters for the longest earlier copy.
// A copy of 3+ characters becomes (offset, length); otherwise the character is written as a literal.
// Cost: 1 flag bit, then either the literal or 8 bits of offset + 4 bits of length (3…18).
export function lz77(text, window = 255) {
  const s = [...text], tokens = [], MIN = 3, MAX = 18;
  let bits = 0;
  for (let i = 0; i < s.length;) {
    let bestLen = 0, bestOff = 0;
    for (let j = Math.max(0, i - window); j < i; j++) {
      let k = 0;
      while (k < MAX && i + k < s.length && s[j + k] === s[i + k]) k++; // may overlap i: that's how runs repeat
      if (k > bestLen) { bestLen = k; bestOff = i - j; }
    }
    if (bestLen >= MIN) { tokens.push({ off: bestOff, len: bestLen, at: i }); bits += 1 + 8 + 4; i += bestLen; }
    else { tokens.push({ ch: s[i], at: i }); bits += 1 + charBits(s[i]); i++; }
  }
  return { tokens, bits };
}
export function unlz77(tokens) {
  const out = [];
  for (const t of tokens) {
    if (t.ch !== undefined) out.push(t.ch);
    else for (let k = 0; k < t.len; k++) out.push(out[out.length - t.off]);
  }
  return out.join('');
}

// Shannon entropy: the fewest bits per character any code can average if it only looks at character frequencies.
export function entropy(text) {
  const n = [...text].length, freq = new Map();
  for (const c of text) freq.set(c, (freq.get(c) || 0) + 1);
  let h = 0;
  for (const f of freq.values()) h -= (f / n) * Math.log2(f / n);
  return { perChar: h, bits: h * n };
}

const PRESETS = {
  'AAAA…': 'AAAAAAAAAABBBBBBBBCCCCCCCCCCCCDDDDDAAAAAAAAAAAAAAA',
  'banana': 'banana bandana banana bandana',
  'Дуу': 'Хүүхэд ахуй цаг минь, хүүхэд ахуй цаг минь,\nхөөрхөн сайхан цаг минь, хөөрхөн сайхан цаг минь.',
  'English': 'the quick brown fox jumps over the lazy dog and the lazy dog sleeps while the quick brown fox runs away',
  'Fax мөр': '□□□□□□□□□□□□■■■■□□□□□□□□□□□□□□□■■■■■■■■■■□□□□□□□□□□□□□□□',
  'Random': null,
};
const PALETTE = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#65a30d', '#7c3aed', '#ca8a04'];

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const mono = 'font-family:"JetBrains Mono",ui-monospace,monospace';
  const input = h('textarea', { rows: 3, spellcheck: false, style: `width:100%;resize:vertical;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font-size:.95rem;${mono}` });
  const presetBtns = Object.keys(PRESETS).map(k => h('button', { className: 'btn btn-sm', textContent: k, onclick: () => setText(k) }));
  const tabs = [['rle', 'RLE'], ['huffman', 'Huffman'], ['lz77', 'LZ77'], ['compare', 'Харьцуулах']];
  const seg = h('div', { className: 'seg' });
  const tabBtns = tabs.map(([k, t]) => h('button', { textContent: t, onclick: () => { tab = k; render(); } }));
  seg.append(...tabBtns);
  const panel = h('div', { style: 'flex:1;min-height:0;overflow:auto;padding:12px 14px' });
  const stats = h('div', { style: 'font-size:.85rem;color:var(--muted);font-variant-numeric:tabular-nums' });
  root.append(
    h('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line)' },
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' }, h('span', { textContent: 'Текст:', style: 'font-size:.85rem;color:var(--muted)' }), ...presetBtns),
      input, h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between' }, seg, stats)),
    panel);

  let tab = 'huffman', hStep = Infinity, gzipBits = null, gzipFor = null, debounce = 0;
  const colorOf = new Map();
  const tint = c => { if (!colorOf.has(c)) colorOf.set(c, PALETTE[colorOf.size % PALETTE.length]); return colorOf.get(c); };

  function setText(k) {
    input.value = PRESETS[k] ?? Array.from({ length: 60 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[(Math.random() * 36) | 0]).join('');
    hStep = Infinity; colorOf.clear(); render();
  }
  input.oninput = () => { clearTimeout(debounce); debounce = setTimeout(() => { hStep = Infinity; colorOf.clear(); render(); }, 150); };

  const card = (...kids) => h('div', { style: 'border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--card)' }, ...kids);
  const note = s => h('p', { style: 'margin:0 0 10px;font-size:.9rem;color:var(--muted);line-height:1.5' }, s);
  const sizeLine = (bits, orig) => h('div', { style: 'margin-top:10px;font-size:.95rem;font-weight:600' },
    `${bits.toLocaleString()} bit vs ${orig.toLocaleString()} bit → `, h('span', { style: `color:${bits < orig ? '#16a34a' : '#dc2626'}` }, `${Math.round((bits / orig) * 100)}%`));

  function renderRle(text, orig) {
    const { runs, bits } = rle(text);
    const chips = runs.map(r => h('span', {
      style: `display:inline-flex;align-items:baseline;gap:2px;margin:2px;padding:3px 7px;border-radius:6px;${mono};font-size:.95rem;background:${r.n > 1 ? 'var(--accent-soft)' : 'var(--code)'};color:${r.n > 1 ? 'var(--accent)' : 'var(--fg)'}`,
    }, h('b', { textContent: r.n }), h('span', { textContent: `×${show(r.ch)}` })));
    panel.replaceChildren(card(
      note('Дараалан давтагдсан тэмдэгтийг "тоо × тэмдэгт" болгоно. Урт давталттай өгөгдөлд (fax, энгийн зураг) гайхалтай, харин энгийн текстэд эсрэгээрээ томруулна.'),
      h('div', {}, ...chips), sizeLine(bits, orig),
      h('div', { style: 'font-size:.8rem;color:var(--muted);margin-top:4px' }, `${runs.length} run · run бүр = 8 bit тоо + тэмдэгт`)));
  }

  function renderHuffman(text, orig) {
    const H = huffman(text), last = H.steps.length - 1, k = Math.min(hStep, last);
    const rows = [...H.freq].sort((a, b) => b[1] - a[1]);
    const table = h('table', { style: 'border-collapse:collapse;font-size:.85rem' },
      h('tr', {}, ...['Тэмдэгт', 'Тоо', 'Code', 'Bit'].map(s => h('th', { textContent: s, style: 'text-align:left;padding:3px 10px 3px 0;color:var(--muted);font-weight:500;border-bottom:1px solid var(--line)' }))),
      ...rows.map(([c, f]) => h('tr', {},
        h('td', { style: `padding:2px 10px 2px 0;${mono};color:${tint(c)};font-weight:700` }, show(c)), h('td', { textContent: f, style: 'padding:2px 10px 2px 0' }),
        h('td', { style: `padding:2px 10px 2px 0;${mono}` }, k === last ? H.codes.get(c) : '…'), h('td', { textContent: k === last ? f * H.codes.get(c).length : '', style: 'padding:2px 0' }))));
    const ctrl = h('div', { style: 'display:flex;gap:6px;align-items:center;margin:8px 0' },
      h('button', { className: 'btn btn-sm', textContent: '⏮', onclick: () => { hStep = 0; render(); } }),
      h('button', { className: 'btn btn-sm', textContent: '◀', onclick: () => { hStep = Math.max(0, k - 1); render(); } }),
      h('button', { className: 'btn btn-sm', textContent: 'Нэгтгэх ▶', onclick: () => { hStep = Math.min(last, k + 1); render(); } }),
      h('button', { className: 'btn btn-sm', textContent: 'Бүтэн мод', onclick: () => { hStep = Infinity; render(); } }),
      h('span', { textContent: `Алхам ${k} / ${last}`, style: 'font-size:.85rem;color:var(--muted)' }));
    // Encoded bitstream, each character's code coloured like the character.
    const bitsView = h('div', { style: `${mono};font-size:.8rem;line-height:1.7;word-break:break-all` },
      ...[...text].slice(0, 400).map(c => h('span', { textContent: H.codes.get(c), title: show(c), style: `color:${tint(c)};margin-right:3px` })));
    panel.replaceChildren(card(
      note('Хамгийн цөөн давтагдсан хоёр модыг дахин дахин нэгтгэнэ. Олон давтагдсан тэмдэгт оройд ойр үлдэж богино code авна (зүүн = 0, баруун = 1).'),
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start' },
        h('div', { style: 'flex:0 0 auto' }, table),
        h('div', { style: 'flex:1 1 360px;min-width:260px' }, ctrl, treeSvg(H.steps[k]))),
      k === last ? h('div', { style: 'margin-top:12px' }, h('div', { textContent: 'Шахсан bit-ийн урсгал:', style: 'font-size:.8rem;color:var(--muted);margin-bottom:4px' }), bitsView, sizeLine(H.bits, orig)) : ''));
  }

  // Draw a forest of Huffman trees: leaves spaced evenly, parents centred over their children.
  function treeSvg(forest) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    const DX = 34, DY = 52, R = 13;
    let leaf = 0, depthMax = 0;
    const place = (n, d) => {
      depthMax = Math.max(depthMax, d);
      if (n.ch !== undefined) { n._x = leaf++ * DX + DX / 2; } else { place(n.left, d + 1); place(n.right, d + 1); n._x = (n.left._x + n.right._x) / 2; }
      n._y = d * DY + 24;
    };
    forest.forEach(t => { place(t, 0); leaf += 0.6; });
    const W = Math.max(leaf * DX, 200), Hh = depthMax * DY + 56;
    svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    svg.setAttribute('style', `width:100%;max-height:${Math.min(520, Hh * 1.4)}px;font-family:Inter,system-ui,sans-serif`);
    let out = '';
    const draw = n => {
      if (n.ch !== undefined) {
        out += `<circle cx="${n._x}" cy="${n._y}" r="${R}" fill="${tint(n.ch)}"/><text x="${n._x}" y="${n._y + 1}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="700" fill="#fff">${esc(show(n.ch))}</text><text x="${n._x}" y="${n._y + R + 11}" text-anchor="middle" font-size="10" fill="var(--muted)">${n.f}</text>`;
        return;
      }
      for (const [c, bit] of [[n.left, 0], [n.right, 1]]) {
        out += `<line x1="${n._x}" y1="${n._y}" x2="${c._x}" y2="${c._y}" stroke="var(--muted)" stroke-width="1.4"/>`;
        out += `<text x="${(n._x + c._x) / 2 + (bit ? 6 : -6)}" y="${(n._y + c._y) / 2}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--accent)">${bit}</text>`;
        draw(c);
      }
      out += `<circle cx="${n._x}" cy="${n._y}" r="${R}" fill="var(--card)" stroke="var(--fg)" stroke-width="1.4"/><text x="${n._x}" y="${n._y + 1}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="var(--fg)">${n.f}</text>`;
    };
    forest.forEach(draw);
    svg.innerHTML = out;
    return svg;
  }
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function renderLz(text, orig) {
    const { tokens, bits } = lz77(text);
    const chars = [...text];
    // The text with each copied stretch boxed; hovering a token outlines the earlier text it copies.
    const spans = chars.map(c => h('span', { textContent: show(c), style: 'padding:1px 0;border-radius:3px' }));
    const view = h('div', { style: `${mono};font-size:1rem;line-height:2;word-break:break-all` }, ...spans);
    const list = h('div', { style: `${mono};font-size:.85rem;line-height:2.1` });
    const mark = (t, on) => {
      for (let i = 0; i < t.len; i++) {
        spans[t.at - t.off + i].style.background = on ? 'rgba(250,204,21,.45)' : '';
        spans[t.at + i].style.outline = on ? '2px solid #f59e0b' : '';
      }
    };
    tokens.forEach((t, i) => {
      if (t.ch !== undefined) { list.append(h('span', { textContent: show(t.ch), style: 'padding:2px 5px;margin:1px;border-radius:5px;background:var(--code)' })); return; }
      const col = PALETTE[i % PALETTE.length];
      for (let k = 0; k < t.len; k++) { spans[t.at + k].style.color = col; spans[t.at + k].style.fontWeight = '700'; }
      const chip = h('span', { textContent: `⟲${t.off},${t.len}`, title: `${t.off} тэмдэгтийн өмнөхөөс ${t.len}-ийг хуулах`, style: `cursor:help;padding:2px 6px;margin:1px;border-radius:5px;color:#fff;background:${col}` });
      chip.onmouseenter = () => mark(t, true); chip.onmouseleave = () => mark(t, false);
      list.append(chip);
    });
    const copies = tokens.filter(t => t.len).length;
    panel.replaceChildren(card(
      note('Өмнө нь гарсан хэсэг дахин гарвал "N тэмдэгтийн өмнөхөөс L-ийг хуул" гэж бичнэ. Өнгөт хэсгүүд нь хуулбар — доорх ⟲ chip дээр хулганаа аваачвал эх сурвалж нь тодорно.'),
      view, h('div', { textContent: `Token-ууд (${tokens.length - copies} literal, ${copies} хуулбар):`, style: 'font-size:.8rem;color:var(--muted);margin:10px 0 4px' }), list,
      sizeLine(bits, orig)));
  }

  function renderCompare(text, orig) {
    const E = entropy(text), rows = [
      ['Эх текст (UTF-8)', orig, 'var(--muted)'],
      ['RLE', rle(text).bits, '#ea580c'],
      ['Huffman', huffman(text).bits, '#2563eb'],
      ['LZ77', lz77(text).bits, '#16a34a'],
      ['gzip (таны browser)', gzipBits, '#9333ea'],
    ];
    const max = Math.max(...rows.map(r => r[1] || 0), E.bits);
    const bar = ([name, bits, col]) => h('div', { style: 'display:grid;grid-template-columns:150px 1fr 130px;gap:10px;align-items:center;margin:6px 0' },
      h('span', { textContent: name, style: 'font-size:.85rem;font-weight:600' }),
      h('div', { style: 'height:20px;background:var(--code);border-radius:5px;position:relative;overflow:hidden' },
        h('div', { style: `position:absolute;inset:0 auto 0 0;width:${bits == null ? 0 : (bits / max) * 100}%;background:${col};border-radius:5px` }),
        h('div', { style: `position:absolute;top:-3px;bottom:-3px;left:${(E.bits / max) * 100}%;border-left:2px dashed #dc2626` })),
      h('span', { textContent: bits == null ? '…' : `${Math.round(bits).toLocaleString()} bit (${Math.round((bits / orig) * 100)}%)`, style: 'font-size:.8rem;font-variant-numeric:tabular-nums;color:var(--muted)' }));
    panel.replaceChildren(card(
      note('Улаан тасархай шугам = Shannon entropy: тэмдэгт бүрийг тусад нь кодлоход хүрч болох доод хязгаар. Huffman түүнд ойртдог; LZ77, gzip давтагдсан хэсгийг хуулж түүнээс ч бага болж чадна. Random текст юугаар ч бараг шахагдахгүй.'),
      ...rows.map(bar),
      h('div', { style: 'font-size:.8rem;color:var(--muted);margin-top:8px' },
        `Entropy: ${E.perChar.toFixed(2)} bit/тэмдэгт × ${[...text].length} = ${Math.round(E.bits)} bit. gzip ~18 byte толгойтой тул богино текстэд томорч болно.`)));
    // The real thing: the browser's own gzip (CompressionStream), measured asynchronously.
    if (gzipFor !== text && window.CompressionStream) {
      gzipFor = text; gzipBits = null;
      new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
        .then(b => { if (gzipFor === text) { gzipBits = b.byteLength * 8; if (tab === 'compare') render(); } });
    }
  }

  function render() {
    tabBtns.forEach((b, i) => b.setAttribute('aria-selected', String(tabs[i][0] === tab)));
    const text = input.value;
    const orig = enc.encode(text).length * 8;
    stats.textContent = `${[...text].length} тэмдэгт · ${orig.toLocaleString()} bit · ${new Set(text).size} өөр тэмдэгт`;
    if (!text) { panel.replaceChildren(note('Текст бичих эсвэл дээрх жишээнээс сонгоно уу.')); return; }
    ({ rle: renderRle, huffman: renderHuffman, lz77: renderLz, compare: renderCompare })[tab](text, orig);
  }

  setText('banana');
}
