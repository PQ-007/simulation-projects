// UI shell only: simulations live in ../projects/<id>/ and plug in via `demo` in projects.json.
const app = document.getElementById('app');
const crumb = document.getElementById('crumb');
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k.startsWith('on') ? n.addEventListener(k.slice(2), v) : n.setAttribute(k, v);
  n.append(...kids);
  return n;
};
const SITE = 'Simulation Projects';
// The ?v= on this script's tag in index.html; reused so demos and docs also skip stale browser caches.
const VERSION = new URL(document.currentScript.src).searchParams.get('v') || '0';
const versioned = (path, base = location.href) => { const u = new URL(path, base); u.searchParams.set('v', VERSION); return u; };
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
// Media lines in project docs:  @youtube(VIDEO_ID "caption")  and  @live(widget.js "caption").
// They become placeholders here and are filled in after sanitizing (see fillEmbeds).
const embedRenderer = t => `<figure class="embed" data-kind="${t.kind}" data-src="${escAttr(t.src)}"><figcaption>${escAttr(t.caption)}</figcaption></figure>`;
marked.use({ extensions: [
  { name: 'embed', level: 'block', start: s => /^@(youtube|live)\(/m.exec(s)?.index, renderer: embedRenderer,
    tokenizer(src) {
      const m = /^@(youtube|live)\(([^\s)"]+)(?:\s+"([^"]*)")?\)[^\S\n]*(?:\n|$)/.exec(src);
      if (m) return { type: 'embed', raw: m[0], kind: m[1], src: m[2], caption: m[3] || '' };
    } },
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
  const grid = el('div', { class: 'grid' });
  const active = el('div', { class: 'active-filter' });
  const count = el('span', { class: 'count' });
  const search = el('input', { type: 'search', placeholder: 'Хайх…', 'aria-label': 'Хайх', oninput: e => { filter.q = e.target.value; update(); } });
  search.value = filter.q;
  const setTag = t => { filter.tag = t; update(); };

  function update() {
    active.replaceChildren(...(filter.tag ? [el('button', { class: 'chip', 'aria-pressed': 'true', title: 'Шүүлтүүр арилгах', onclick: () => setTag(null) }, `${filter.tag} ✕`)] : []));
    const q = filter.q.trim().toLowerCase();
    const shown = projects.filter(p =>
      (!filter.tag || (p.tags || []).includes(filter.tag)) &&
      (!q || [p.title, p.summary, ...(p.tags || [])].join(' ').toLowerCase().includes(q)));
    count.textContent = shown.length === projects.length ? projects.length : `${shown.length} / ${projects.length}`;
    grid.replaceChildren(...shown.map(p => card(p, setTag)));
    if (!shown.length) grid.append(el('p', { class: 'empty-note' }, 'Илэрц олдсонгүй.'));
  }

  app.className = 'home';
  app.replaceChildren(
    el('div', { class: 'toolbar' },
      el('h1', {}, 'Simulations ', count),
      active,
      el('label', { class: 'search' }, el('span', { class: 'search-icon', 'aria-hidden': 'true' }, '⌕'), search)),
    grid);
  update();
}

// The title link stretches over the whole card; tags sit above it so they stay clickable as filters.
const card = (p, setTag) => el('article', { class: 'card' },
  el('div', { class: 'thumb' }, p.thumb ? el('img', { src: p.thumb, alt: '', loading: 'lazy' }) : ''),
  el('div', { class: 'card-body' },
    el('h2', {}, el('a', { href: `#/p/${p.id}` }, p.title),
      p.status !== 'live' ? el('span', { class: `badge status-${p.status}` }, STATUS[p.status] || p.status) : ''),
    el('p', {}, p.summary),
    el('div', { class: 'card-foot' },
      el('div', { class: 'card-tags' }, ...(p.tags || []).map(t =>
        el('button', { class: 'tag', title: `"${t}"-ээр шүүх`, onclick: () => setTag(t) }, t))),
      el('span', { class: 'open', 'aria-hidden': 'true' }, 'Нээх →'))));

const VIEWS = [['split', 'Split', '1'], ['demo', 'Demo', '2'], ['docs', 'Docs', '3'], ['real', 'Real world', '4']];
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
  const demo = pane('demo', 'Demo'), docs = pane('docs', 'Docs'), real = pane('real', 'Real world');
  const divider = el('div', { class: 'divider', role: 'separator', 'aria-orientation': 'vertical', title: 'Чирж хэмжээг өөрчлөх · давхар товшвол тэнцүүлнэ' });
  const layout = el('div', { class: 'layout' }, demo.node, divider, docs.node, real.node);
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
    for (const [key, pn] of [['demo', demo], ['docs', docs], ['real', real]]) {
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
  renderDocs(p, real.body, 'REAL_WORLD.md');
}

async function renderDemo(p, panel) {
  if (!p.demo) {
    panel.append(el('div', { class: 'demo empty' }, 'Demo удахгүй нэмэгдэнэ.'));
    return;
  }
  const box = el('div', { class: 'demo' }, 'Ачаалж байна…');
  panel.append(box);
  try {
    const mod = await import(versioned(p.demo));
    box.replaceChildren();
    await mod.mount(box);
  } catch (e) {
    box.classList.add('empty');
    box.textContent = `Demo ачаалж чадсангүй: ${e.message}`;
  }
}

async function renderDocs(p, panel, file = 'README.md') {
  const base = new URL(`../projects/${p.id}/`, location.href);
  const box = el('article', { class: 'doc' }, 'Ачаалж байна…');
  panel.append(box);
  try {
    const r = await fetch(versioned(file, base));
    if (!r.ok) throw new Error(file === 'README.md' ? `README.md олдсонгүй (${r.status})` : 'Энэ project-ийн бодит хэрэглээний тайлбар хараахан бичигдээгүй байна.');
    const html = DOMPurify.sanitize(marked.parse(await r.text()));
    box.innerHTML = html;
    box.querySelectorAll('.math').forEach(m => {
      try { katex.render(m.dataset.tex, m, { displayMode: !!m.dataset.display, throwOnError: false }); } catch { m.textContent = m.dataset.tex; }
    });
    box.querySelectorAll('pre code').forEach(c => window.hljs?.highlightElement(c));
    // README links/images are relative to the project folder, not the site.
    box.querySelectorAll('img[src]').forEach(i => { i.src = new URL(i.getAttribute('src'), base); });
    // A paragraph holding only an image becomes a figure, captioned by its alt text.
    box.querySelectorAll('p > img:only-child').forEach(img => {
      if (img.parentElement.textContent.trim()) return;
      img.loading = 'lazy';
      img.parentElement.replaceWith(el('figure', { class: 'fig' }, img.cloneNode(), ...(img.alt ? [el('figcaption', {}, img.alt)] : [])));
    });
    fillEmbeds(box, base);
    box.querySelectorAll('a[href]').forEach(a => {
      const h = a.getAttribute('href');
      if (!h.startsWith('#') && !/^[a-z]+:/i.test(h)) a.href = new URL(h, base);
    });
  } catch (e) {
    box.textContent = e.message;
  }
}

function fillEmbeds(box, base) {
  for (const fig of box.querySelectorAll('figure.embed')) {
    const { kind, src } = fig.dataset, cap = fig.querySelector('figcaption');
    if (kind === 'youtube' && /^[\w-]{11}$/.test(src)) {
      // Click-to-play: only a thumbnail loads until the reader asks for the video.
      const frame = el('button', { class: 'yt', 'aria-label': `Video тоглуулах: ${cap?.textContent || ''}` },
        el('img', { src: `https://i.ytimg.com/vi/${src}/hqdefault.jpg`, alt: '', loading: 'lazy' }), el('span', { class: 'yt-play', 'aria-hidden': 'true' }));
      frame.addEventListener('click', () => frame.replaceWith(el('iframe', {
        class: 'yt-frame', src: `https://www.youtube-nocookie.com/embed/${src}?autoplay=1&rel=0`,
        title: cap?.textContent || 'YouTube video', allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: '',
      })));
      fig.prepend(frame);
    } else if (kind === 'live' && /^[\w-]+\.js$/.test(src)) {
      // A small interactive widget from the project folder, mounted like a demo.
      const stage = el('div', { class: 'live' }, 'Ачаалж байна…');
      fig.prepend(stage);
      import(versioned(src, base)).then(mod => { stage.replaceChildren(); return mod.mount(stage); })
        .catch(e => { stage.textContent = `Widget ачаалж чадсангүй: ${e.message}`; });
    } else fig.remove();
  }
}

function renderNotFound() {
  current = null;
  crumb.replaceChildren();
  app.className = '';
  app.replaceChildren(el('h1', {}, 'Олдсонгүй'), el('a', { href: '#/' }, 'Simulation Projects руу буцах'));
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
