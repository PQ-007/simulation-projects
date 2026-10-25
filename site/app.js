// UI shell only: simulations live in ../projects/<id>/ and plug in via `demo` in projects.json.
const app = document.getElementById('app');
const crumb = document.getElementById('crumb');
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k.startsWith('on') ? n.addEventListener(k.slice(2), v) : n.setAttribute(k, v);
  n.append(...kids);
  return n;
};
const SITE = 'Симуляцийн төслүүд';
const STATUS = { planned: 'Төлөвлөсөн', wip: 'Хийгдэж буй', live: 'Бэлэн' };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
let projects = [];

// $$…$$ and $…$ become placeholders that survive sanitizing; KaTeX fills them in afterwards.
const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const mathRenderer = t => `<${t.display ? 'div' : 'span'} class="math" data-tex="${escAttr(t.text)}"${t.display ? ' data-display="1"' : ''}></${t.display ? 'div' : 'span'}>`;
const startAt = s => (i => (i < 0 ? undefined : i))(s.indexOf('$'));
marked.use({ extensions: [
  { name: 'mathBlock', level: 'block', start: s => /^\$\$/m.exec(s)?.index, renderer: mathRenderer,
    tokenizer(src) { const m = /^\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n|$)/.exec(src); if (m) return { type: 'mathBlock', raw: m[0], text: m[1].trim(), display: true }; } },
  { name: 'mathInline', level: 'inline', start: startAt, renderer: mathRenderer,
    tokenizer(src) {
      const m = /^\$\$([^$]+?)\$\$/.exec(src) || /^\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/.exec(src);
      if (m) return { type: 'mathInline', raw: m[0], text: m[1].trim(), display: m[0].startsWith('$$') };
    } },
] });

async function loadProjects() {
  const r = await fetch('projects.json');
  if (!r.ok) throw new Error('projects.json ачаалж чадсангүй');
  projects = await r.json();
}

let filter = { q: '', tag: null };

function renderHome() {
  document.title = SITE;
  crumb.replaceChildren();
  const tags = [...new Set(projects.flatMap(p => p.tags || []))];
  const grid = el('div', { class: 'grid' });
  const chips = el('div', { class: 'chips' });
  const search = el('input', { type: 'search', class: 'search', placeholder: 'Төсөл хайх…', 'aria-label': 'Төсөл хайх', oninput: e => { filter.q = e.target.value; update(); } });
  search.value = filter.q;

  function update() {
    chips.replaceChildren(...[null, ...tags].map(t =>
      el('button', { class: 'chip', 'aria-pressed': String(filter.tag === t), onclick: () => { filter.tag = t; update(); } }, t ?? 'Бүгд')));
    const q = filter.q.trim().toLowerCase();
    const shown = projects.filter(p =>
      (!filter.tag || (p.tags || []).includes(filter.tag)) &&
      (!q || [p.title, p.summary, ...(p.tags || [])].join(' ').toLowerCase().includes(q)));
    grid.replaceChildren(...shown.map(card));
    if (!shown.length) grid.append(el('p', { class: 'empty-note' }, 'Тохирох төсөл олдсонгүй.'));
  }

  app.className = '';
  app.replaceChildren(
    el('h1', {}, SITE),
    el('p', { class: 'lead' }, 'Алгоритм ба симуляцууд — тус бүрийг өөрт тохирох хэрэгслээр бүтээсэн.'),
    el('div', { class: 'filters' }, search, chips),
    grid);
  update();
}

const card = p => el('a', { class: 'card', href: `#/p/${p.id}` },
  el('div', { class: 'card-top' },
    el('span', { class: `badge status-${p.status}` }, STATUS[p.status] || p.status),
    p.demo ? el('span', { class: 'card-meta' }, 'Demo') : ''),
  el('h2', {}, p.title),
  el('p', {}, p.summary),
  el('div', {}, ...(p.tags || []).map(t => el('span', { class: 'tag' }, t))));

const VIEWS = [['split', 'Split', '1'], ['demo', 'Demo', '2'], ['docs', 'Docs', '3']];
// The project currently on screen, so switching views doesn't remount the demo.
let current = null;

function renderProject(id, view) {
  if (current?.id === id) return current.setView(view);
  const p = projects.find(x => x.id === id);
  if (!p) return renderNotFound();
  document.title = `${p.title} · ${SITE}`;
  crumb.replaceChildren(el('span', { class: 'sep', 'aria-hidden': 'true' }, '/'), el('span', {}, p.title));
  const go = v => { location.hash = `#/p/${id}/${v}`; };
  const pane = (key, label) => {
    const toggle = el('button', { class: 'btn btn-sm', onclick: () => go(layout.dataset.view === key ? 'split' : key) });
    const body = el('div', { class: 'pane-body' });
    return { toggle, body, node: el('section', { class: `pane pane-${key}`, 'aria-label': label }, el('div', { class: 'pane-head' }, el('span', {}, label), toggle), body) };
  };
  const demo = pane('demo', 'Demo'), docs = pane('docs', 'Docs');
  const divider = el('div', { class: 'divider', role: 'separator', 'aria-orientation': 'vertical', title: 'Чирж хэмжээг өөрчлөх · давхар товшвол тэнцүүлнэ' });
  const layout = el('div', { class: 'layout' }, demo.node, divider, docs.node);
  const buttons = VIEWS.map(([key, label, k]) => el('button', { role: 'tab', title: `${label} (${k})`, onclick: () => go(key) }, label));

  const setSplit = pct => { layout.style.setProperty('--split', `${pct}%`); store.set('split', pct); };
  setSplit(+store.get('split') || 50);
  divider.addEventListener('pointerdown', e => {
    divider.setPointerCapture(e.pointerId);
    layout.classList.add('resizing');
    const r = layout.getBoundingClientRect();
    const move = ev => setSplit(Math.min(80, Math.max(20, ((ev.clientX - r.left) / r.width) * 100)));
    const up = () => { divider.removeEventListener('pointermove', move); layout.classList.remove('resizing'); };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', up, { once: true });
  });
  divider.addEventListener('dblclick', () => setSplit(50));

  const setView = v => {
    layout.dataset.view = v;
    buttons.forEach((b, i) => b.setAttribute('aria-selected', String(VIEWS[i][0] === v)));
    for (const [key, pn] of [['demo', demo], ['docs', docs]]) {
      pn.toggle.textContent = v === key ? '⤡ Split view' : '⤢ Full view';
      pn.toggle.title = v === key ? 'Split view руу буцах (Esc)' : 'Зөвхөн үүнийг харуулах';
    }
  };
  current = { id, setView, go };
  app.className = 'project';
  app.replaceChildren(
    el('div', { class: 'proj-head' },
      el('div', { class: 'proj-title' }, el('h1', {}, p.title), el('p', { class: 'lead' }, p.summary)),
      el('div', { class: 'seg', role: 'tablist', 'aria-label': 'Харагдац' }, ...buttons)),
    layout);
  setView(view);
  renderDemo(p, demo.body);
  renderDocs(p, docs.body);
}

async function renderDemo(p, panel) {
  if (!p.demo) {
    panel.append(el('div', { class: 'demo empty' }, 'Demo удахгүй нэмэгдэнэ.'));
    return;
  }
  const box = el('div', { class: 'demo' }, 'Ачаалж байна…');
  panel.append(box);
  try {
    const mod = await import(new URL(p.demo, location.href));
    box.replaceChildren();
    await mod.mount(box);
  } catch (e) {
    box.classList.add('empty');
    box.textContent = `Demo ачаалж чадсангүй: ${e.message}`;
  }
}

async function renderDocs(p, panel) {
  const base = new URL(`../projects/${p.id}/`, location.href);
  const box = el('article', { class: 'doc' }, 'Ачаалж байна…');
  panel.append(box);
  try {
    const r = await fetch(new URL('README.md', base));
    if (!r.ok) throw new Error(`README.md олдсонгүй (${r.status})`);
    const html = DOMPurify.sanitize(marked.parse(await r.text()));
    box.innerHTML = html;
    box.querySelectorAll('.math').forEach(m => {
      try { katex.render(m.dataset.tex, m, { displayMode: !!m.dataset.display, throwOnError: false }); } catch { m.textContent = m.dataset.tex; }
    });
    box.querySelectorAll('pre code').forEach(c => window.hljs?.highlightElement(c));
    // README links/images are relative to the project folder, not the site.
    box.querySelectorAll('img[src]').forEach(i => { i.src = new URL(i.getAttribute('src'), base); });
    box.querySelectorAll('a[href]').forEach(a => {
      const h = a.getAttribute('href');
      if (!h.startsWith('#') && !/^[a-z]+:/i.test(h)) a.href = new URL(h, base);
    });
  } catch (e) {
    box.textContent = e.message;
  }
}

function renderNotFound() {
  current = null;
  crumb.replaceChildren();
  app.className = '';
  app.replaceChildren(el('h1', {}, 'Олдсонгүй'), el('a', { href: '#/' }, 'Төслүүд рүү буцах'));
}

// 1/2/3 switch views, Esc returns to split; ignored while typing or using demo controls.
addEventListener('keydown', e => {
  if (!current || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const v = e.key === 'Escape' ? 'split' : VIEWS.find(x => x[2] === e.key)?.[0];
  if (v) current.go(v);
});

function route() {
  const [, kind, id, view] = location.hash.split('/');
  if (kind === 'p' && id) return renderProject(id, VIEWS.some(([k]) => k === view) ? view : 'split');
  current = null;
  renderHome();
}

loadProjects().then(() => { addEventListener('hashchange', route); route(); })
  .catch(e => { app.textContent = e.message; });
