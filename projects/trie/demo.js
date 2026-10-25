// Trie (prefix tree): every word is a path of letters from the root; words with the same start share it.

export class Trie {
  constructor() { this.root = { kids: new Map(), end: false }; this.size = 0; this.nodes = 1; }
  // Walk the letters, creating any missing nodes; returns the nodes that were new (for highlighting).
  insert(word) {
    let n = this.root;
    const created = [];
    for (const ch of word) {
      if (!n.kids.has(ch)) { const k = { kids: new Map(), end: false }; n.kids.set(ch, k); created.push(k); this.nodes++; }
      n = n.kids.get(ch);
    }
    if (!n.end) { n.end = true; this.size++; }
    return created;
  }
  // The node at the end of a prefix, or null if the prefix leaves the tree.
  find(prefix) {
    let n = this.root;
    for (const ch of prefix) { n = n.kids.get(ch); if (!n) return null; }
    return n;
  }
  has(word) { const n = this.find(word); return !!(n && n.end); }
  // Every word under a prefix, in alphabetical order (depth-first, children sorted).
  words(prefix, limit = Infinity) {
    const out = [], start = this.find(prefix);
    const walk = (n, s) => {
      if (out.length >= limit) return;
      if (n.end) out.push(s);
      for (const ch of [...n.kids.keys()].sort((a, b) => a.localeCompare(b))) walk(n.kids.get(ch), s + ch);
    };
    if (start) walk(start, prefix);
    return out;
  }
  // Unmark the word, then prune nodes that no longer lead to any word.
  remove(word) {
    const path = [this.root];
    for (const ch of word) { const n = path[path.length - 1].kids.get(ch); if (!n) return false; path.push(n); }
    const last = path[path.length - 1];
    if (!last.end) return false;
    last.end = false; this.size--;
    for (let i = path.length - 1; i > 0; i--) {
      if (path[i].end || path[i].kids.size) break;
      path[i - 1].kids.delete([...word][i - 1]); this.nodes--;
    }
    return true;
  }
  count(n) { let c = n.end ? 1 : 0; for (const k of n.kids.values()) c += this.count(k); return c; }
}

const SETS = {
  'Жишээ': 'car cat cart care card dog dot do done tea ten team to toy',
  'Монгол': 'нар нарс нам намар нохой ном номин сар сайн сайхан сур сурагч сургууль ус уул уурхай хот хотон хонь хонх',
  'English': 'the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us apple apply application ape april apron arc arch archive area arena argue arm army art article artist ask bake ball ban band bank bar bark barn base bat bath battle beach bean bear beat bed bee beef beer bell belt bench best bet big bike bird birth bit bite black blade blue boat body bone book boot born boss both bottle box boy brain bread break bridge bright bring brother brown build burn bus busy butter buy cake call calm camp can candle card care carry case cast catch cause cell center chain chair change charge cheap check cheese chest child chip choice city class clean clear climb clock close cloud coach coat code coffee cold color come cook cool copy corn cost count cover cow crack craft crash cream create cross crowd cry cup cut',
  'Код': 'for function false float foreach if int include import interface in class const continue case catch char return break while void var let long long new null namespace public private protected static struct switch this throw true try typeof using virtual',
};

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const mono = 'font-family:"JetBrains Mono",ui-monospace,monospace';
  const input = h('input', { type: 'text', placeholder: 'Үг бичих…', spellcheck: false, autocomplete: 'off', style: `width:220px;padding:7px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font-size:1rem;${mono}` });
  const addBtn = h('button', { className: 'btn', textContent: '+ Нэмэх', onclick: () => add() });
  const delBtn = h('button', { className: 'btn', textContent: '− Устгах', onclick: () => del() });
  const seg = h('div', { className: 'seg' });
  const setBtns = Object.keys(SETS).map(k => h('button', { textContent: k, onclick: () => load(k) }));
  seg.append(...setBtns);
  const status = h('div', { style: 'font-size:.9rem;min-height:1.4em' });
  const svgWrap = h('div', { className: 'navy-panel', style: 'flex:1;min-height:240px;overflow:auto;margin:0 14px' });
  const sugg = h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' });
  const stats = h('div', { style: 'font-size:.82rem;color:var(--muted)' });
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center' }, ...kids);
  root.append(
    h('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:12px 14px' },
      row(h('span', { textContent: 'Толь бичиг:', style: 'font-size:.85rem;color:var(--muted)' }), seg),
      row(input, addBtn, delBtn), status),
    svgWrap,
    h('div', { style: 'display:flex;flex-direction:column;gap:6px;padding:10px 14px' }, sugg, stats));

  let trie = new Trie(), fresh = new Set(), freshTimer = 0;
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function load(name) {
    trie = new Trie();
    for (const w of SETS[name].split(/\s+/).filter(Boolean)) trie.insert(w);
    setBtns.forEach(b => b.setAttribute('aria-selected', String(b.textContent === name)));
    fresh = new Set(); input.value = '';
    render();
  }
  function add() {
    const w = input.value.trim().toLowerCase();
    if (!w) return;
    const created = trie.insert(w);
    fresh = new Set(created);
    clearTimeout(freshTimer); freshTimer = setTimeout(() => { fresh = new Set(); render(); }, 2500);
    render(created.length ? `"${w}" нэмэгдлээ — ${created.length} шинэ нүд, бусад нь өмнөх үгстэй хуваалцсан.` : `"${w}" нэмэгдлээ — шинэ нүд хэрэггүй, зам нь аль хэдийн байсан!`);
  }
  function del() {
    const w = input.value.trim().toLowerCase();
    render(trie.remove(w) ? `"${w}" устгагдлаа — өөр үгэнд хэрэггүй болсон нүднүүд хамт арилав.` : `"${w}" толь бичигт алга.`);
  }
  input.oninput = () => render();
  input.onkeydown = e => { if (e.key === 'Enter') add(); };

  function render(message) {
    const q = input.value.trim().toLowerCase(), letters = [...q];
    // Follow the typed letters as far as the tree goes.
    let n = trie.root, matched = 0;
    const path = [trie.root];
    for (const ch of letters) { const k = n.kids.get(ch); if (!k) break; n = k; path.push(k); matched++; }
    const full = matched === letters.length, node = full ? n : null;

    if (message) status.textContent = message;
    else if (!q) status.textContent = 'Үг бичихэд зам нь шараар тодорч, доор нь тэр эхлэлтэй бүх үг гарна.';
    else if (!full) status.textContent = `"${letters.slice(0, matched).join('')}" хүртэл зам байна, "${letters[matched]}" гэсэн салаа алга → ийм эхлэлтэй үг байхгүй (${matched + 1} алхамд мэдлээ).`;
    else status.textContent = `${letters.length} алхамд олдлоо · ${node.end ? `"${q}" бол бүтэн үг ✓` : `"${q}" бол үгийн эхлэл`} · доор нь ${trie.count(node)} үг. Жагсаалтаар хайвал ${trie.size} үгийг нэг бүрчлэн шалгах байсан.`;
    status.style.color = q && !full ? '#dc2626' : 'var(--fg)';

    const list = node ? trie.words(q, 14) : [];
    const total = node ? trie.count(node) : 0;
    sugg.replaceChildren(...(q ? [h('span', { textContent: 'Autocomplete:', style: 'font-size:.85rem;color:var(--muted)' })] : []),
      ...list.map(w => h('button', { className: 'btn btn-sm', style: `${mono};gap:0`, onclick: () => { input.value = w; render(); } },
        h('b', { textContent: w.slice(0, q.length), style: 'color:var(--accent)' }), w.slice(q.length))),
      ...(total > list.length ? [h('span', { textContent: `+${total - list.length}`, style: 'font-size:.85rem;color:var(--muted)' })] : []));
    let sumLetters = 0;
    for (const w of trie.words('')) sumLetters += [...w].length;
    stats.textContent = `${trie.size} үг · ${sumLetters} үсэг · ${trie.nodes - 1} нүд → эхлэлийг хуваалцсанаар ${sumLetters - (trie.nodes - 1)} үсгийн зай хэмнэв`;

    redraw = () => drawTree(path.slice(0, matched + 1), node, !full ? letters[matched] : null);
    redraw();
  }
  let redraw = () => {};

  // Draw the trie left to right. Big tries only show the typed path plus the part below it (capped).
  function drawTree(path, focus, missing) {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    const DX = 62, DY = 30, R = 12, MAX = 70;
    const base = focus || path[path.length - 1];
    // Choose which nodes to show: the path, then breadth-first below `base` until MAX.
    const shown = new Set(path), queue = [base];
    while (queue.length && shown.size < MAX) {
      const n = queue.shift();
      for (const ch of [...n.kids.keys()].sort((a, b) => a.localeCompare(b))) {
        if (shown.size >= MAX) break;
        const k = n.kids.get(ch); shown.add(k); queue.push(k);
      }
    }
    // Layout: leaves (of the shown tree) take one row each; a parent sits in the middle of its children.
    let row = 0, maxDepth = 0;
    const pos = new Map(), edges = [];
    const place = (n, ch, depth) => {
      maxDepth = Math.max(maxDepth, depth);
      const kids = [...n.kids.entries()].sort((a, b) => a[0].localeCompare(b[0])).filter(([, k]) => shown.has(k));
      const hidden = [...n.kids.values()].filter(k => !shown.has(k)).reduce((s, k) => s + trie.count(k), 0);
      let y;
      if (!kids.length) y = row++ * DY;
      else {
        const ys = kids.map(([c, k]) => { edges.push([n, k]); return place(k, c, depth + 1); });
        y = (ys[0] + ys[ys.length - 1]) / 2;
      }
      pos.set(n, { x: depth * DX, y, ch, hidden });
      return y;
    };
    place(trie.root, '', 0);
    const onPath = new Set(path);
    const W = (maxDepth + 1) * DX + 90, H = Math.max(row, 1) * DY + 20;
    svg.setAttribute('viewBox', `-30 -18 ${W} ${H}`);
    svg.setAttribute('style', 'display:block;font-family:Inter,system-ui,sans-serif;margin:8px auto');
    let out = '';
    for (const [a, b] of edges) {
      const p = pos.get(a), q = pos.get(b), on = onPath.has(a) && onPath.has(b);
      out += `<path d="M${p.x},${p.y} C${p.x + DX / 2},${p.y} ${q.x - DX / 2},${q.y} ${q.x},${q.y}" fill="none" stroke="${on ? '#fbbf24' : 'var(--line)'}" stroke-width="${on ? 3.5 : 1.8}"/>`;
    }
    for (const [n, p] of pos) {
      const isRoot = n === trie.root, on = onPath.has(n), isNew = fresh.has(n);
      const fill = n.end ? '#4ade80' : 'var(--card)', stroke = isNew ? '#22d3ee' : on ? '#fbbf24' : n.end ? '#4ade80' : 'var(--muted)';
      out += `<circle cx="${p.x}" cy="${p.y}" r="${isRoot ? 8 : R}" fill="${isRoot ? 'var(--fg)' : fill}" stroke="${stroke}" stroke-width="${on || isNew ? 3.5 : 1.5}"/>`;
      if (!isRoot) out += `<text x="${p.x}" y="${p.y + 0.5}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" fill="${n.end ? '#10141d' : 'var(--fg)'}">${esc(p.ch)}</text>`;
      if (p.hidden) out += `<text x="${p.x}" y="${p.y + R + 11}" text-anchor="middle" font-size="10" fill="var(--muted)">+${p.hidden} үг</text>`;
    }
    // The missing letter gets its own row above the tree, so it never sits on top of a real branch.
    let top = -18;
    if (missing) {
      const p = pos.get(path[path.length - 1]), gx = p.x + DX, gy = Math.min(...[...pos.values()].map(v => v.y)) - DY;
      top = gy - 18;
      out += `<path d="M${p.x},${p.y} C${p.x + DX / 2},${p.y} ${gx - DX / 2},${gy} ${gx},${gy}" fill="none" stroke="#fb7185" stroke-width="2" stroke-dasharray="4 4"/><circle cx="${gx}" cy="${gy}" r="${R}" fill="var(--card)" stroke="#fb7185" stroke-width="2" stroke-dasharray="3 3"/><text x="${gx}" y="${gy + 0.5}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" fill="#fb7185">${esc(missing)}</text><text x="${gx + R + 6}" y="${gy + 0.5}" dominant-baseline="central" font-size="11" fill="#fb7185">байхгүй</text>`;
    }
    const VH = H - 18 - top;
    svg.setAttribute('viewBox', `-30 ${top} ${W} ${VH}`);
    // Small tries are scaled up to fill the panel (e.g. in full view); big ones keep 1:1 and scroll.
    const k = Math.max(1, Math.min(2.2, (svgWrap.clientWidth - 28) / W, (svgWrap.clientHeight - 16) / VH));
    Object.assign(svg.style, { width: `${W * k}px`, height: `${VH * k}px` });
    svg.innerHTML = out;
    svgWrap.replaceChildren(svg);
    // Keep the end of the typed path in view.
    const end = pos.get(path[path.length - 1]);
    if (end) svgWrap.scrollTop = Math.max(0, (end.y - top) * k - svgWrap.clientHeight / 2);
  }

  load('Жишээ');
  const ro = new ResizeObserver(() => redraw());
  ro.observe(svgWrap);
  new MutationObserver((_, o) => { if (!root.isConnected) { ro.disconnect(); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
}
