// Real-world pictures for the string-driven preset machines. Each scene gets the run so far and returns { svg, caption }.
// Scenes are redrawn only when the run advances, so their CSS animations play once per step.
//   S = { word, read, hist, states, prev, sym }   (word: input chars, read: how many consumed, sym: last char read)
const GREEN = '#16a34a', RED = '#dc2626', AMBER = '#f59e0b';
const W = 320, H = 220;

export const STYLE = `<style>
.fa{transform-box:fill-box;transform-origin:center}
@keyframes fsm-coin{from{transform:translateY(-80px)}85%{transform:translateY(0);opacity:1}to{transform:translateY(8px);opacity:0}}
@keyframes fsm-walk{to{transform:translateX(170px)}}
@keyframes fsm-bump{0%,100%{transform:translateX(0)}35%{transform:translateX(22px)}55%{transform:translateX(12px)}}
@keyframes fsm-spin{from{transform:rotate(0)}to{transform:rotate(120deg)}}
@keyframes fsm-drive{from{transform:translateX(0)}to{transform:translateX(260px)}}
@keyframes fsm-blink{50%{opacity:.15}}
@keyframes fsm-pop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style>`;

const text = (x, y, s, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${s}</text>`;
const prefix = S => S.word.slice(0, S.read);

function turnstile(S) {
  const unlocked = S.states.has('Unlocked'), wasUnlocked = S.prev?.has('Unlocked');
  const pass = S.sym === 'p' && wasUnlocked, bump = S.sym === 'p' && !wasUnlocked, coin = S.sym === 'c';
  const coins = prefix(S).filter(c => c === 'c').length;
  const passed = prefix(S).filter((c, i) => c === 'p' && S.hist[i].states.has('Unlocked')).length;
  const col = unlocked ? GREEN : RED;
  const arms = [180, 300, 60].map(a => {
    const r = (a * Math.PI) / 180;
    return `<line x1="160" y1="112" x2="${160 + 52 * Math.cos(r)}" y2="${112 + 52 * Math.sin(r)}" stroke="var(--fg)" stroke-width="6" stroke-linecap="round"/>`;
  }).join('');
  const person = `<g transform="translate(92,170)"><g class="fa" style="${pass ? 'animation:fsm-walk 1s ease-in-out forwards' : bump ? 'animation:fsm-bump .5s ease-out' : ''}">
    <circle cx="0" cy="-60" r="9" fill="var(--fg)"/>
    <g stroke="var(--fg)" stroke-width="3.5" stroke-linecap="round"><line x1="0" y1="-50" x2="0" y2="-22"/><line x1="0" y1="-22" x2="-9" y2="0"/><line x1="0" y1="-22" x2="9" y2="0"/><line x1="0" y1="-42" x2="14" y2="-32"/><line x1="0" y1="-42" x2="-10" y2="-30"/></g></g></g>`;
  const svg = `
    ${text(12, 20, `Зоос: ${coins} · Нэвтэрсэн: ${passed}`, 'font-size="12" fill="var(--muted)"')}
    <line x1="10" y1="170" x2="310" y2="170" stroke="var(--line)" stroke-width="2"/>
    <g fill="none" stroke="${col}" stroke-width="3.5" stroke-linecap="round">
      <path d="${unlocked ? 'M151,36 v-10 a9,9 0 0 1 18,0' : 'M151,36 v-8 a9,9 0 0 1 18,0 v8'}"/>
    </g>
    <rect x="146" y="35" width="28" height="22" rx="4" fill="${col}"/>
    ${text(138, 52, unlocked ? 'UNLOCKED' : 'LOCKED', `font-size="13" font-weight="700" fill="${col}" text-anchor="end"`)}
    <rect x="153" y="112" width="14" height="58" rx="3" fill="var(--muted)" opacity=".6"/>
    <g class="fa" style="${pass ? 'animation:fsm-spin .9s ease-in-out' : ''}"><circle cx="160" cy="112" r="55" fill="none"/>${arms}</g>
    <circle cx="160" cy="112" r="8" fill="var(--fg)"/>
    <rect x="200" y="122" width="30" height="48" rx="4" fill="var(--muted)" opacity=".35"/>
    <line x1="206" y1="127" x2="224" y2="127" stroke="var(--fg)" stroke-width="3" stroke-linecap="round"/>
    ${coin ? `<circle class="fa" cx="215" cy="120" r="8" fill="${AMBER}" stroke="#b45309" stroke-width="2" style="animation:fsm-coin .7s ease-in forwards"/>` : ''}
    ${person}
    ${bump ? `<g class="fa" style="animation:fsm-pop .3s ease-out">${text(126, 92, '✕', `font-size="26" font-weight="700" fill="${RED}"`)}</g>` : ''}`;
  const caption = !S.read ? 'Хаалга түгжээтэй. c = зоос хийх, p = түлхэх.'
    : coin ? (wasUnlocked ? 'c: дахин зоос хийлээ — хаалга аль хэдийн нээлттэй, зоос дэмий.' : 'c: зоос хийлээ — түгжээ тайлагдав (Unlocked).')
    : pass ? 'p: түлхээд нэвтэрлээ — хаалга дахин түгжигдэв (Locked).'
    : 'p: түгжээтэй байна — нэвтэрч чадсангүй.';
  return { svg, caption };
}

function trafficLight(S) {
  const on = s => S.states.has(s);
  const lamp = (cy, color, name) => `<circle cx="72" cy="${cy}" r="20" fill="${color}" opacity="${on(name) ? 1 : 0.15}" style="${on(name) ? `filter:drop-shadow(0 0 10px ${color})` : ''}"/>`;
  const green = on('Green'), emergency = S.sym === 'e';
  const svg = `
    <rect x="40" y="16" width="64" height="170" rx="14" fill="#1f2937"/>
    <rect x="66" y="186" width="12" height="30" fill="#1f2937"/>
    ${lamp(52, '#ef4444', 'Red')}${lamp(101, AMBER, 'Yellow')}${lamp(150, '#22c55e', 'Green')}
    <rect x="120" y="150" width="200" height="40" fill="var(--muted)" opacity=".22"/>
    <line x1="120" y1="170" x2="320" y2="170" stroke="var(--muted)" stroke-width="2" stroke-dasharray="10 8" opacity=".6"/>
    <line x1="168" y1="150" x2="168" y2="190" stroke="var(--fg)" stroke-width="4"/>
    <g transform="translate(118,0)"><g class="fa" style="${green ? 'animation:fsm-drive 2.2s linear infinite' : ''}">
      <rect x="0" y="146" width="46" height="15" rx="5" fill="var(--accent)"/>
      <rect x="9" y="136" width="26" height="13" rx="4" fill="var(--accent)" opacity=".75"/>
      <circle cx="11" cy="162" r="5" fill="var(--fg)"/><circle cx="35" cy="162" r="5" fill="var(--fg)"/>
    </g></g>
    ${emergency ? `<g style="animation:fsm-blink .5s step-end 4">${text(214, 70, '🚨 EMERGENCY', `font-size="15" font-weight="700" fill="${RED}" text-anchor="middle"`)}</g>` : ''}
    ${text(214, 120, green ? 'Машин явж байна' : on('Yellow') ? 'Удаашраад зогсоно' : 'Машин зогсож байна', 'font-size="12" fill="var(--muted)" text-anchor="middle"')}`;
  const now = [...S.states][0] || '—';
  const caption = !S.read ? 'Улаанаас эхэлнэ. t = timer, e = emergency.'
    : emergency ? `e: яаралтай дохио — шууд ${now}.` : `t: timer дуусав → ${now}.`;
  return { svg, caption };
}

export const SCENES = {
  'Turnstile': turnstile,
  'Traffic light': trafficLight,
};
export const SCENE_VIEWBOX = `0 0 ${W} ${H}`;
