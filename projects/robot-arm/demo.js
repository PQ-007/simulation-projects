// Robot arm with PID control. Five joints (base yaw, shoulder, elbow, wrist, gripper), each a motor with inertia,
// friction and gravity, driven by its own PID controller. The pure physics/IK/control code comes first; drawing is below.

export const G = 9.81;
export const GEO = { h0: 0.3, L1: 0.5, L2: 0.45, L3: 0.16 };
export const JOINTS = ['Суурь (yaw)', 'Мөр (shoulder)', 'Тохой (elbow)', 'Бугуй (wrist)', 'Атгагч (gripper)'];
const INERTIA = [1.0, 0.9, 0.5, 0.06, 0.05];       // J: how hard each joint is to accelerate
const DAMPING = [1.5, 1.5, 1.0, 0.12, 0.8];       // b: joint friction (N·m·s/rad)
const TMAX = [40, 60, 35, 6, 40];                  // motor torque limits
const LIMITS = [[-Infinity, Infinity], [-0.2, 2.6], [-2.8, 0], [-3, 3], [0, 0.12]];
const MASS = [2.0, 1.5, 0.6];                      // link 1, link 2, hand
const BALL_R = 0.04;

// ---- kinematics in the arm's vertical plane (r = distance from the base axis, y = height) ----------------
export function planar(q, payload = 0) {
  const a1 = q[1], a2 = q[1] + q[2], a3 = q[1] + q[2] + q[3], { h0, L1, L2, L3 } = GEO;
  const S = [0, h0], P1 = [L1 * Math.cos(a1), h0 + L1 * Math.sin(a1)];
  const P2 = [P1[0] + L2 * Math.cos(a2), P1[1] + L2 * Math.sin(a2)], P3 = [P2[0] + L3 * Math.cos(a3), P2[1] + L3 * Math.sin(a3)];
  return { S, P1, P2, P3, com: [[(S[0] + P1[0]) / 2, (S[1] + P1[1]) / 2], [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2], [(P2[0] + P3[0]) / 2, (P2[1] + P3[1]) / 2]], payload };
}
// Same points in 3D: yaw rotates the whole plane about the vertical axis.
export function fk(q, payload = 0) {
  const p = planar(q, payload), c = Math.cos(q[0]), s = Math.sin(q[0]), to3 = ([r, y]) => [r * c, y, r * s];
  return { S: to3(p.S), P1: to3(p.P1), P2: to3(p.P2), tip: to3(p.P3), t: [-s, 0, c] };
}
// Inverse kinematics: joint angles that put the fingertip at `tip` with the hand pointing straight down (elbow up).
export function ik(tip) {
  const { h0, L1, L2, L3 } = GEO, wx = tip[0], wy = tip[1] + L3, wz = tip[2];
  const yaw = Math.atan2(wz, wx), r = Math.hypot(wx, wz), dy = wy - h0;
  const d = Math.min(Math.max(Math.hypot(r, dy), Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  const c2 = (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), q2 = -Math.acos(Math.min(1, Math.max(-1, c2)));
  const q1 = Math.atan2(dy, r) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
  return [yaw, q1, q2, -Math.PI / 2 - q1 - q2];
}
// Torque gravity applies about joint k: −Σ m·g·(horizontal distance from the joint to each link's centre of mass).
export function gravityTorques(q, payload = 0) {
  const p = planar(q), joints = [p.S, p.P1, p.P2], masses = [...MASS], coms = [...p.com];
  if (payload) { masses.push(payload); coms.push(p.P3); }
  return [1, 2, 3].map(k => {
    let t = 0;
    for (let j = k - 1; j < masses.length; j++) t -= masses[j] * G * (coms[j][0] - joints[k - 1][0]);
    return t;
  });
}

// ---- the controlled system -------------------------------------------------------------------------------
export function newArm() {
  const tgt = [...ik([0.45, 0.2, 0])].concat(0.1);
  return { q: [...tgt], w: [0, 0, 0, 0, 0], I: [0, 0, 0, 0, 0], tgt, tau: [0, 0, 0, 0, 0], holding: false };
}
// One physics step of length dt under PID control. Each joint: torque = J·(Kp·e + Ki·∫e − Kd·ω), clipped to the motor limit.
// (Derivative acts on the measured velocity, so a jump in the target doesn't give a derivative "kick".)
export function step(s, P, dt) {
  const grav = P.gravity ? [0, ...gravityTorques(s.q, P.payload), 0] : [0, 0, 0, 0, 0];
  for (let k = 0; k < 5; k++) {
    // The gripper is PD-only: while it squeezes a ball it can't close on, the error never goes away and an integral
    // would wind up for as long as it holds. The arm joints keep their I term, which they need to fight gravity.
    const ki = k === 4 ? 0 : P.ki, J = INERTIA[k], e = s.tgt[k] - s.q[k], imax = ki > 0 ? TMAX[k] / (J * ki) : 0;
    // Anti-windup: don't keep accumulating the integral while the motor is already maxed out pushing the same way
    // (e.g. a gripper squeezing a ball it cannot close on), otherwise it takes ages to unwind afterwards.
    const raw = J * (P.kp * e + ki * s.I[k] - P.kd * s.w[k]), pushing = Math.abs(raw) >= TMAX[k] && Math.sign(raw) === Math.sign(e);
    if (!pushing) s.I[k] = Math.max(-imax, Math.min(imax, s.I[k] + e * dt));
    s.tau[k] = Math.max(-TMAX[k], Math.min(TMAX[k], J * (P.kp * e + ki * s.I[k] - P.kd * s.w[k])));
    s.w[k] += ((s.tau[k] + grav[k] - DAMPING[k] * s.w[k]) / J) * dt;
    s.q[k] += s.w[k] * dt;
    const [lo, hi] = LIMITS[k];
    if (s.q[k] < lo) { s.q[k] = lo; s.w[k] = Math.max(0, s.w[k]); } else if (s.q[k] > hi) { s.q[k] = hi; s.w[k] = Math.min(0, s.w[k]); }
  }
  if (s.holding && s.q[4] < 2 * BALL_R) { s.q[4] = 2 * BALL_R; s.w[4] = Math.max(0, s.w[4]); }   // fingers can't squeeze through the ball
}

// Step-response numbers from a recorded {t, y} series that started at `y0` and aimed at `target` from time t0.
export function metrics(series, t0, y0, target) {
  const A = target - y0, mag = Math.abs(A);
  if (mag < 0.05) return null;
  const sgn = Math.sign(A), seg = series.filter(p => p.t >= t0);
  if (seg.length < 10) return null;
  const peak = Math.max(...seg.map(p => (p.y - target) * sgn)), tol = Math.max(0.02 * mag, 0.003);
  let settle = null;
  for (let i = seg.length - 1; i >= 0; i--) if (Math.abs(seg[i].y - target) > tol) { settle = i < seg.length - 1 ? seg[i + 1].t - t0 : null; break; }
  if (settle === null && Math.abs(seg[seg.length - 1].y - target) <= tol && Math.abs(seg[0].y - target) <= tol) settle = 0;
  const tail = seg.filter(p => p.t > seg[seg.length - 1].t - 0.4), sse = Math.abs(target - tail.reduce((a, p) => a + p.y, 0) / tail.length);
  return { overshoot: Math.max(0, peak / mag) * 100, settle, sse, duration: seg[seg.length - 1].t - t0 };
}

// ---- pick-and-place mission: a list of fingertip waypoints with gripper commands -------------------------
export function missionPlan(ball, place) {
  const up = (p, y) => [p[0], y, p[2]];
  return [
    { name: 'Бөмбөгний дээгүүр очих', tip: up(ball, 0.24), grip: 0.11 },
    { name: 'Доош бууж, бөмбөгийг тойрох', tip: up(ball, BALL_R + 0.005), grip: 0.11 },
    { name: 'Атгагчийг хаах', tip: up(ball, BALL_R + 0.005), grip: 0, action: 'grab' },
    { name: 'Өргөх', tip: up(ball, 0.26), grip: 0 },
    { name: 'Байршуулах газрын дээгүүр', tip: up(place, 0.26), grip: 0 },
    { name: 'Доош буулгах', tip: up(place, BALL_R + 0.01), grip: 0 },
    { name: 'Атгагчийг нээх', tip: up(place, BALL_R + 0.01), grip: 0.11, action: 'release' },
    { name: 'Дээш гарах', tip: up(place, 0.24), grip: 0.11 },
  ];
}
// Advance the mission: set targets for the current waypoint, and move on once the tip has settled there (or after a timeout).
export function missionUpdate(m, s, ball, dt, tolerance = 0.012) {
  if (!m || m.done) return null;
  const wp = m.plan[m.i], f = fk(s.q), err = Math.hypot(f.tip[0] - wp.tip[0], f.tip[1] - wp.tip[1], f.tip[2] - wp.tip[2]);
  const t = ik(wp.tip); s.tgt[0] = t[0]; s.tgt[1] = t[1]; s.tgt[2] = t[2]; s.tgt[3] = t[3]; s.tgt[4] = wp.grip;
  m.wait = (m.wait || 0) + dt;
  const still = s.w.slice(0, 4).every(v => Math.abs(v) < 0.06) && Math.abs(s.w[4]) < 0.03;
  const gripOk = wp.action === 'grab' ? s.q[4] < 0.1 && still : Math.abs(s.q[4] - wp.grip) < 0.006 || s.holding && s.q[4] <= 2 * BALL_R + 0.002;
  m.settled = (err < tolerance && still && gripOk) ? (m.settled || 0) + dt : 0;
  if (m.settled > 0.3 || m.wait > 6) {
    const msg = m.settled > 0.3 ? null : `⚠ "${wp.name}": хугацаа дууслаа, алдаа ${(err * 100).toFixed(1)} см`;
    if (wp.action === 'grab') { const d = Math.hypot(f.tip[0] - ball.x, f.tip[1] - ball.y, f.tip[2] - ball.z); if (d < 0.05) s.holding = true; else m.note = `⚠ Атгагч бөмбөгөөс ${(d * 100).toFixed(1)} см зайтай — барьж чадсангүй`; }
    if (wp.action === 'release') s.holding = false;
    m.i++; m.wait = 0; m.settled = 0;
    if (m.i >= m.plan.length) m.done = true;
    return msg;
  }
  return null;
}

export const PRESETS = {
  'P': { kp: 60, ki: 0, kd: 0, note: 'Зөвхөн P: савлаж, таталцлын улмаас зорьсон цэгт хүрэхгүй' },
  'PD': { kp: 120, ki: 0, kd: 16, note: 'P + D: савлалт арилсан, харин таталцлаас үлдэх алдаа байна' },
  'PID': { kp: 120, ki: 60, kd: 16, note: 'Бүгд: I нь үлдэх алдааг арилгана' },
  'Хэт их Kp': { kp: 600, ki: 0, kd: 2, note: 'Хэт хүчтэй, D дутуу: ширүүн савлана' },
  'Хэт сул': { kp: 20, ki: 5, kd: 10, note: 'Сул: аюулгүй ч удаан' },
};

// ================================================================================================================
const mono = '"JetBrains Mono",ui-monospace,monospace';
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const view = h('canvas', { style: 'width:100%;aspect-ratio:4/3;max-width:640px;border-radius:12px;cursor:grab;touch-action:none;background:var(--bg)' });
  const plot = h('canvas', { style: 'width:100%;height:210px;border:1px solid var(--line);border-radius:10px;background:var(--card)' });
  const metricsBox = h('div', { style: `font:600 .85rem ${mono};line-height:1.7;min-height:3.4em` });
  const status = h('div', { style: 'font-size:.84rem;line-height:1.5;color:var(--muted);min-height:2.6em' });
  const btn = (text, onclick, title = '') => h('button', { className: 'btn btn-sm', textContent: text, onclick, title });
  const slider = (min, max, value, onInput) => {
    const out = h('output', { style: `min-width:3em;font:600 .85rem ${mono};color:var(--fg)` });
    const input = h('input', { type: 'range', min, max, step: 1, value, style: 'width:140px', oninput: () => { out.textContent = input.value; onInput(+input.value); } });
    out.textContent = value; return { input, out };
  };
  const P = { kp: 120, ki: 60, kd: 16, gravity: true, payload: 0 };
  const sKp = slider(0, 600, P.kp, v => { P.kp = v; unpreset(); }), sKi = slider(0, 300, P.ki, v => { P.ki = v; unpreset(); }), sKd = slider(0, 60, P.kd, v => { P.kd = v; unpreset(); });
  const gain = (label, s, hint) => h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--muted)', title: hint }, h('b', { textContent: label, style: `min-width:1.6em;color:var(--fg);font-family:${mono}` }), s.input, s.out);
  const presetBox = h('div', { className: 'seg', style: 'flex-wrap:wrap' });
  const presetBtns = Object.keys(PRESETS).map(k => h('button', { textContent: k, onclick: () => applyPreset(k) }));
  presetBox.append(...presetBtns);
  const jointSel = h('div', { className: 'seg', style: 'flex-wrap:wrap' });
  const jointBtns = JOINTS.map((n, i) => h('button', { textContent: n.split(' ')[0], title: n, onclick: () => { plotJoint = i; hist.length = 0; updateJointBtns(); } }));
  jointSel.append(...jointBtns);
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center' }, ...kids);
  const label = s => h('span', { textContent: s, style: 'font-size:.85rem;color:var(--muted)' });
  const grav = h('input', { type: 'checkbox', checked: true, onchange: () => { P.gravity = grav.checked; } });
  const slow = h('input', { type: 'checkbox' });

  const left = h('div', { style: 'flex:1 1 440px;min-width:280px;display:flex;flex-direction:column;gap:8px' }, view,
    row(btn('▶ Pick & place', () => startMission(), 'Бөмбөгийг аваад нөгөө тэмдэг рүү зөөнө'), btn('⌂ Home', () => { mission = null; setTip([0.45, 0.2, 0]); }), btn('↺ Бөмбөг', () => resetBall()),
      h('label', { style: 'display:flex;gap:6px;align-items:center;font-size:.85rem;color:var(--muted)' }, slow, '¼ хурд')),
    status);
  const right = h('div', { style: 'flex:1 1 380px;min-width:280px;display:flex;flex-direction:column;gap:9px' },
    row(label('Controller:'), presetBox),
    gain('Kp', sKp, 'Пропорциональ: алдаа том бол хүчтэй түлхэнэ'), gain('Ki', sKi, 'Интеграл: үлдэж буй алдааг цуглуулж арилгана'), gain('Kd', sKd, 'Дериватив: хурдыг тормозлоно (савлалтыг дарна)'),
    row(h('label', { style: 'display:flex;gap:6px;align-items:center;font-size:.85rem;color:var(--muted)' }, grav, 'Таталцал'),
      btn('🏋 Ачаа 1.5 кг', () => { P.payload = P.payload ? 0 : 1.5; payloadBtn.textContent = P.payload ? '🏋 Ачаа авлаа' : '🏋 Ачаа 1.5 кг'; }), btn('👉 Түлхэх', () => { arm.w[1] += 2.5; arm.w[2] -= 1.5; })),
    row(label('График:'), jointSel), plot, metricsBox);
  const payloadBtn = right.children[4].children[1];
  root.append(h('div', { style: 'flex:1;min-height:0;overflow:auto;padding:12px 14px;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start' }, left, right));

  // ---- state ----
  let arm = newArm(), ball, mission = null, plotJoint = 1, hist = [], simT = 0, stepT = 0, stepFrom = arm.q[1], stepTarget = arm.tgt[1], logMsg = '', trail = [];
  let cam = { az: 0.7, el: 0.42, dist: 2.3 }, clickMark = null, presetName = 'PID';
  const PLACE = [-0.28, 0, 0.5], BALL0 = { x: 0.5, y: BALL_R, z: 0.12, vy: 0 };
  function resetBall() { ball = { ...BALL0 }; arm.holding = false; mission = null; }
  resetBall();
  function applyPreset(name) {
    presetName = name; const p = PRESETS[name]; Object.assign(P, { kp: p.kp, ki: p.ki, kd: p.kd });
    for (const [s, v] of [[sKp, p.kp], [sKi, p.ki], [sKd, p.kd]]) { s.input.value = v; s.out.textContent = v; }
    updatePresetBtns(); status.textContent = p.note;
  }
  function unpreset() { presetName = null; updatePresetBtns(); }
  const updatePresetBtns = () => presetBtns.forEach(b => b.setAttribute('aria-selected', String(b.textContent === presetName)));
  const updateJointBtns = () => jointBtns.forEach((b, i) => b.setAttribute('aria-selected', String(i === plotJoint)));
  function setTip(tip) { const t = ik(tip); for (let k = 0; k < 4; k++) arm.tgt[k] = t[k]; noteTargetChange(); }
  function noteTargetChange() { stepT = simT; stepFrom = arm.q[plotJoint]; stepTarget = arm.tgt[plotJoint]; }
  function startMission() { resetBall(); arm = { ...arm, holding: false }; mission = { plan: missionPlan([ball.x, 0, ball.z], PLACE), i: 0 }; logMsg = ''; noteTargetChange(); }

  // ---- camera ----
  function camBasis() {
    const t = [0, 0.28, 0.05], e = cam.el, a = cam.az;
    const pos = [t[0] + cam.dist * Math.cos(e) * Math.sin(a), t[1] + cam.dist * Math.sin(e), t[2] + cam.dist * Math.cos(e) * Math.cos(a)];
    const f = vnorm(vsub(t, pos)), r = vnorm(vcross(f, [0, 1, 0])), u = vcross(r, f);
    return { pos, f, r, u };
  }
  let W = 1, H = 1;
  const proj = (cb, p) => { const d = vsub(p, cb.pos), z = vdot(d, cb.f), F = Math.min(W, H) * 1.35; return { x: W / 2 + (vdot(d, cb.r) / z) * F, y: H / 2 - (vdot(d, cb.u) / z) * F, z, s: F / z }; };
  function unproject(cb, sx, sy, planeY) {
    const F = Math.min(W, H) * 1.35, dir = [0, 1, 2].map(i => cb.f[i] + ((sx - W / 2) / F) * cb.r[i] - ((sy - H / 2) / F) * cb.u[i]);
    const t = (planeY - cb.pos[1]) / dir[1];
    return t > 0 ? [cb.pos[0] + dir[0] * t, planeY, cb.pos[2] + dir[2] * t] : null;
  }

  function draw() {
    const css = getComputedStyle(root), c = n => css.getPropertyValue(n).trim();
    const fg = c('--fg') || '#111', muted = c('--muted') || '#888', line = c('--line') || '#ddd', card = c('--card') || '#fff', accent = c('--accent') || '#2563eb';
    const r = view.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (view.width !== Math.round(r.width * dpr)) { view.width = Math.round(r.width * dpr); view.height = Math.round(r.height * dpr); }
    W = r.width; H = r.height;
    const g = view.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const cb = camBasis(), P3 = p => proj(cb, p);
    // floor: a square grid, with a rim
    g.lineWidth = 1;
    for (let i = -10; i <= 10; i++) {
      const v = i * 0.1; g.strokeStyle = i % 5 === 0 ? muted : line; g.globalAlpha = i % 5 === 0 ? 0.55 : 0.5;
      for (const [a, b] of [[[v, 0, -1], [v, 0, 1]], [[-1, 0, v], [1, 0, v]]]) { const A = P3(a), B = P3(b); g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); }
    }
    g.globalAlpha = 1;
    // placement mark
    { const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => P3([PLACE[0] + a * 0.06, 0.001, PLACE[2] + b * 0.06])); g.strokeStyle = '#16a34a'; g.lineWidth = 2.5; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.stroke(); }
    const f = fk(arm.q, P.payload), grip = arm.q[4], hw = grip / 2;
    const tipL = f.tip.map((v, i) => v + f.t[i] * hw), tipR = f.tip.map((v, i) => v - f.t[i] * hw);
    const palmL = f.P2.map((v, i) => v + f.t[i] * 0.075), palmR = f.P2.map((v, i) => v - f.t[i] * 0.075);
    const fingerBaseL = f.P2.map((v, i) => v + f.t[i] * hw), fingerBaseR = f.P2.map((v, i) => v - f.t[i] * hw);
    const capsule = (a, b, w, col) => ({ z: (P3(a).z + P3(b).z) / 2, draw: () => { const A = P3(a), B = P3(b); g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = Math.max(2, w * (A.s + B.s) / 2); g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke(); } });
    const ballP = arm.holding ? f.tip : [ball.x, ball.y, ball.z];
    const items = [
      capsule([0, 0, 0], [0, GEO.h0, 0], 0.16, '#64748b'), capsule(f.S, f.P1, 0.085, '#2563eb'), capsule(f.P1, f.P2, 0.07, '#3b82f6'),
      capsule(palmL, palmR, 0.03, '#d97706'), capsule(fingerBaseL, tipL, 0.022, '#f59e0b'), capsule(fingerBaseR, tipR, 0.022, '#f59e0b'),
      { z: P3(ballP).z, draw: () => { const B = P3(ballP), R = BALL_R * B.s; const gr = g.createRadialGradient(B.x - R * .3, B.y - R * .3, R * .1, B.x, B.y, R); gr.addColorStop(0, '#fca5a5'); gr.addColorStop(1, '#dc2626'); g.fillStyle = gr; g.beginPath(); g.arc(B.x, B.y, R, 0, 7); g.fill(); } },
      ...[f.S, f.P1, f.P2].map(p => ({ z: P3(p).z - 0.02, draw: () => { const A = P3(p); g.fillStyle = card; g.strokeStyle = fg; g.lineWidth = 2; g.beginPath(); g.arc(A.x, A.y, 0.04 * A.s, 0, 7); g.fill(); g.stroke(); } })),
    ];
    // ground shadows under the moving parts
    g.fillStyle = 'rgba(0,0,0,.14)';
    for (const p of [f.P1, f.P2, f.tip, ballP]) { const A = P3([p[0], 0, p[2]]); g.beginPath(); g.ellipse(A.x, A.y, 0.05 * A.s, 0.02 * A.s, 0, 0, 7); g.fill(); }
    // tip trail and the target marker
    g.strokeStyle = '#22c55e'; g.lineWidth = 2; g.beginPath(); trail.forEach((p, i) => { const A = P3(p); i ? g.lineTo(A.x, A.y) : g.moveTo(A.x, A.y); }); g.globalAlpha = 0.6; g.stroke(); g.globalAlpha = 1;
    const tf = fk(arm.tgt), T = P3(tf.tip);
    g.strokeStyle = '#ef4444'; g.lineWidth = 2; g.beginPath(); g.arc(T.x, T.y, 9, 0, 7); g.moveTo(T.x - 14, T.y); g.lineTo(T.x + 14, T.y); g.moveTo(T.x, T.y - 14); g.lineTo(T.x, T.y + 14); g.stroke();
    items.sort((a, b) => b.z - a.z).forEach(it => it.draw());
    if (P.payload) { const A = P3(f.tip); g.fillStyle = '#0f172a'; g.fillRect(A.x - 14, A.y + 8, 28, 20); g.fillStyle = '#fff'; g.font = '700 10px Inter, system-ui'; g.textAlign = 'center'; g.fillText('1.5kg', A.x, A.y + 22); }
    if (clickMark && simT - clickMark.t < 1) { const A = P3(clickMark.p); g.strokeStyle = '#ef4444'; g.globalAlpha = 1 - (simT - clickMark.t); g.beginPath(); g.arc(A.x, A.y, 6 + 24 * (simT - clickMark.t), 0, 7); g.stroke(); g.globalAlpha = 1; }
    g.fillStyle = muted; g.font = '11px Inter, system-ui'; g.textAlign = 'left'; g.fillText('чирж эргүүл · цэнхэр: шалан дээр дарж гараа тийшээ илгээ · ногоон дөрвөлжин = байршуулах газар', 10, H - 10);
  }

  function drawPlot() {
    const r = plot.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (plot.width !== Math.round(r.width * dpr)) { plot.width = Math.round(r.width * dpr); plot.height = Math.round(r.height * dpr); }
    const g = plot.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); const w = r.width, hh = r.height;
    g.clearRect(0, 0, w, hh);
    const css = getComputedStyle(root), muted = css.getPropertyValue('--muted').trim() || '#888', fg = css.getPropertyValue('--fg').trim() || '#111';
    if (hist.length < 2) return;
    const T = 8, t1 = hist[hist.length - 1].t, t0 = t1 - T, vals = hist.flatMap(p => [p.y, p.tgt]);
    let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max((hi - lo) * 0.15, plotJoint === 4 ? 0.01 : 0.1); lo -= pad; hi += pad;
    const X = t => 8 + (t - t0) / T * (w - 16), Y = v => hh - 18 - (v - lo) / (hi - lo) * (hh - 30);
    g.strokeStyle = muted; g.globalAlpha = 0.3; g.lineWidth = 1; for (let s = Math.ceil(t0); s <= t1; s++) { g.beginPath(); g.moveTo(X(s), 6); g.lineTo(X(s), hh - 18); g.stroke(); } g.globalAlpha = 1;
    g.strokeStyle = '#ef4444'; g.setLineDash([6, 4]); g.lineWidth = 2; g.beginPath(); hist.forEach((p, i) => { const x = X(p.t), y = Y(p.tgt); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#2563eb'; g.lineWidth = 2.5; g.beginPath(); hist.forEach((p, i) => { const x = X(p.t), y = Y(p.y); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.fillStyle = muted; g.font = '11px Inter, system-ui'; g.fillText(`${JOINTS[plotJoint]}: ─ бодит  ┅ зорилго (өнцөг, rad)`, 10, 14);
  }

  function updateMetrics() {
    const seg = hist.filter(p => p.t >= stepT);
    const m = seg.length > 20 ? metrics(hist, stepT, stepFrom, stepTarget) : null;
    if (!m) { metricsBox.textContent = 'Зорилго өөрчлөгдөхийг хүлээж байна (шалан дээр дар) …'; return; }
    const bad = v => `<span style="color:#dc2626">${v}</span>`, ok = v => `<span style="color:#16a34a">${v}</span>`;
    const os = m.overshoot, st = m.settle, se = m.sse * (plotJoint === 4 ? 100 : 1);
    metricsBox.innerHTML = `Overshoot: ${os > 25 ? bad(os.toFixed(0) + '%') : ok(os.toFixed(0) + '%')} &nbsp; Тогтох хугацаа: ${st === null ? bad('тогтохгүй') : ok(st.toFixed(2) + ' с')}<br>Үлдэх алдаа: ${m.sse > 0.02 ? bad(se.toFixed(plotJoint === 4 ? 1 : 3) + (plotJoint === 4 ? ' см' : ' rad')) : ok(se.toFixed(plotJoint === 4 ? 1 : 3) + (plotJoint === 4 ? ' см' : ' rad'))}`;
  }

  // ---- interaction: drag to orbit, click the floor to send the hand there ----
  let drag = null;
  view.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el, moved: false }; view.setPointerCapture(e.pointerId); view.style.cursor = 'grabbing'; });
  view.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; cam.az = drag.az - dx * 0.008; cam.el = Math.max(0.05, Math.min(1.4, drag.el + dy * 0.006)); });
  view.addEventListener('pointerup', e => {
    view.style.cursor = 'grab';
    if (drag && !drag.moved) {
      const rect = view.getBoundingClientRect(), p = unproject(camBasis(), e.clientX - rect.left, e.clientY - rect.top, 0.0);
      if (p && Math.hypot(p[0], p[2]) < 0.82 && Math.hypot(p[0], p[2]) > 0.2) { mission = null; clickMark = { p, t: simT }; setTip([p[0], 0.12, p[2]]); status.textContent = `Зорилго: (${p[0].toFixed(2)}, ${p[2].toFixed(2)}) м — гар тийш хөдөлнө.`; }
      else status.textContent = 'Энэ цэг гарын хүрэх хүрээнээс гадуур (0.2–0.8 м).';
    }
    drag = null;
  });
  view.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.max(1.4, Math.min(3.5, cam.dist + e.deltaY * 0.002)); }, { passive: false });

  // ---- main loop: fixed physics step, real-time ----
  const DT = 1 / 240; let acc = 0, last = performance.now(), raf = 0, frame = 0;
  function loop(now) {
    acc += Math.min(0.05, (now - last) / 1000) * (slow.checked ? 0.25 : 1); last = now;
    while (acc >= DT) {
      const before = arm.tgt[plotJoint];
      if (mission) {
        const msg = missionUpdate(mission, arm, ball, DT);
        if (msg) logMsg = msg;
        if (mission.i !== (mission._last ?? -1)) { mission._last = mission.i; noteTargetChange(); if (!mission.done) status.textContent = `Алхам ${mission.i + 1}/${mission.plan.length}: ${mission.plan[mission.i].name}${logMsg ? '   ' + logMsg : ''}`; else status.textContent = (mission.note || 'Дууслаа: ' + (Math.hypot(ball.x - PLACE[0], ball.z - PLACE[2]) < 0.05 ? '✓ бөмбөг байршуулсан газартаа байна' : 'бөмбөг байршуулсан газартаа биш')) + (logMsg ? '   ' + logMsg : ''); }
      }
      step(arm, P, DT); simT += DT;
      if (arm.tgt[plotJoint] !== before && !mission) noteTargetChange();
      const f = fk(arm.q);
      if (arm.holding) { ball.x = f.tip[0]; ball.y = f.tip[1]; ball.z = f.tip[2]; ball.vy = 0; }
      else if (ball.y > BALL_R) { ball.vy -= G * DT; ball.y = Math.max(BALL_R, ball.y + ball.vy * DT); if (ball.y === BALL_R) ball.vy = 0; }
      if (++frame % 4 === 0) { hist.push({ t: simT, y: arm.q[plotJoint], tgt: arm.tgt[plotJoint], tau: arm.tau[plotJoint] }); if (hist.length > 8 * 60 + 60) hist.shift(); }
      if (frame % 12 === 0) { trail.push(f.tip); if (trail.length > 160) trail.shift(); }
      acc -= DT;
    }
    draw(); drawPlot(); if (frame % 8 === 0) updateMetrics();
    raf = requestAnimationFrame(loop);
  }
  applyPreset('PID'); updateJointBtns();
  status.textContent = 'Шалан дээр дарж гарыг тийш нь илгээ, эсвэл ▶ Pick & place дар. Controller-ийг сольж харьцуул.';
  setTip([0.55, 0.12, 0.2]);
  raf = requestAnimationFrame(loop);
  new MutationObserver((_, o) => { if (!root.isConnected) { cancelAnimationFrame(raf); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
}
