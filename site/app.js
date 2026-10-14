// UI shell only: simulations live in ../projects/<id>/ and plug in via `demo` in projects.json.
const app = document.getElementById('app');
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k.startsWith('on') ? n.addEventListener(k.slice(2), v) : n.setAttribute(k, v);
  n.append(...kids);
  return n;
};
const STATUS = { planned: 'Planned', wip: 'In progress', live: 'Live' };
let projects = [];

async function loadProjects() {
  const r = await fetch('projects.json');
  if (!r.ok) throw new Error('Could not load projects.json');
  projects = await r.json();
}

function renderHome() {
  document.title = 'Simulation Projects';
  app.replaceChildren(
    el('h1', {}, 'Simulation Projects'),
    el('p', { class: 'lead' }, 'Algorithms and simulations, each built with the tool that suits it.'),
    el('div', { class: 'grid' }, ...projects.map(p =>
      el('a', { class: 'card', href: `#/p/${p.id}` },
        el('h2', {}, p.title),
        el('p', {}, p.summary),
        el('span', { class: 'badge' }, STATUS[p.status] || p.status),
        ...(p.tags || []).map(t => el('span', { class: 'tag' }, t)))))
  );
}

function renderProject(id, tab) {
  const p = projects.find(x => x.id === id);
  if (!p) return renderNotFound();
  document.title = `${p.title} · Simulation Projects`;
  const panel = el('div', { role: 'tabpanel' });
  const tabs = el('div', { class: 'tabs', role: 'tablist' },
    ...[['demo', 'Demo'], ['docs', 'Docs']].map(([key, label]) =>
      el('button', { role: 'tab', 'aria-selected': String(key === tab), onclick: () => { location.hash = `#/p/${id}/${key}`; } }, label)));
  app.replaceChildren(
    el('a', { class: 'back', href: '#/' }, '← All projects'),
    el('h1', {}, p.title),
    el('p', { class: 'lead' }, p.summary),
    tabs, panel);
  (tab === 'docs' ? renderDocs : renderDemo)(p, panel);
}

async function renderDemo(p, panel) {
  if (!p.demo) {
    panel.append(el('div', { class: 'demo' }, 'Demo coming soon.'));
    return;
  }
  const box = el('div', { class: 'demo' });
  panel.append(box);
  try {
    const mod = await import(new URL(p.demo, location.href));
    box.replaceChildren();
    await mod.mount(box);
  } catch (e) {
    box.textContent = `Could not load demo: ${e.message}`;
  }
}

async function renderDocs(p, panel) {
  const base = new URL(`../projects/${p.id}/`, location.href);
  const box = el('article', { class: 'doc' }, 'Loading…');
  panel.append(box);
  try {
    const r = await fetch(new URL('README.md', base));
    if (!r.ok) throw new Error(`README.md not found (${r.status})`);
    const html = DOMPurify.sanitize(marked.parse(await r.text()));
    box.innerHTML = html;
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
  app.replaceChildren(el('h1', {}, 'Not found'), el('a', { href: '#/' }, 'Back to projects'));
}

function route() {
  const [, kind, id, tab] = location.hash.split('/');
  if (kind === 'p' && id) renderProject(id, tab === 'docs' ? 'docs' : 'demo');
  else renderHome();
}

loadProjects().then(() => { addEventListener('hashchange', route); route(); })
  .catch(e => { app.textContent = e.message; });
