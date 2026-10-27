// Game-bot arena. The bot's brain is the state machine: each tick the world turns conditions into event
// symbols, the machine decides the state, and the bot acts out whichever state it is in.
export const EVENTS = {
  s: 'player харагдсан',
  l: 'player-г алдсан',
  r: 'буудах зайд орсон',
  o: 'буудах зайнаас гарсан',
  h: 'health бага (<30)',
  f: 'бүрэн эдгэрсэн (≥95)',
  d: 'health 0 — үхсэн',
  n: 'respawn (3 сек)',
};
// Checked in this order every tick; the first event the current state has a transition for wins.
const ORDER = ['d', 'n', 'h', 'f', 'r', 'o', 's', 'l'];
const AW = 600, AH = 380, SIGHT = 200, RANGE = 120, PLAYER_RANGE = 95, RESPAWN = 3;
const SPAWN = [120, 190];
const WAYPOINTS = [[90, 80], [510, 80], [510, 300], [90, 300]];
export const STATE_COLORS = { patrol: '#3b82f6', chase: '#f59e0b', attack: '#dc2626', flee: '#a855f7', dead: '#6b7280' };

export function mountBot(box, { state, fire }) {
  const canvas = Object.assign(document.createElement('canvas'), { style: 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab' });
  box.append(canvas);
  const ctx = canvas.getContext('2d');
  let view = { w: 1, h: 1, s: 1, ox: 0, oy: 0 }, world, paused = false, raf = 0, last = performance.now(), dragging = false;

  function reset() {
    world = { bot: { x: SPAWN[0], y: SPAWN[1], hp: 100, angle: 0, lastHit: -9 }, player: { x: 470, y: 190, flash: 0 }, shots: [], wp: 0, cool: 0, playerCool: 0, hits: 0, deaths: 0, diedAt: null, t: 0 };
  }

  function resize() {
    const r = box.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.min(r.width / AW, r.height / AH);
    view = { w: r.width, h: r.height, s, ox: (r.width - AW * s) / 2, oy: (r.height - AH * s) / 2 };
  }
  const ro = new ResizeObserver(resize);
  ro.observe(box);

  // Click or drag anywhere to move the player.
  const toWorld = e => {
    const r = canvas.getBoundingClientRect();
    return [Math.max(10, Math.min(AW - 10, (e.clientX - r.left - view.ox) / view.s)), Math.max(10, Math.min(AH - 10, (e.clientY - r.top - view.oy) / view.s))];
  };
  canvas.addEventListener('pointerdown', e => {
    [world.player.x, world.player.y] = toWorld(e);
    dragging = true; canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => { if (dragging) [world.player.x, world.player.y] = toWorld(e); });
  const up = () => { dragging = false; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const moveToward = (b, x, y, speed, dt) => {
    const d = Math.hypot(x - b.x, y - b.y);
    if (d < 1) return d;
    b.angle = Math.atan2(y - b.y, x - b.x);
    const k = Math.min(1, (speed * dt) / d);
    b.x += (x - b.x) * k; b.y += (y - b.y) * k;
    return d;
  };
  const current = () => (state() || '').toLowerCase();

  function update(dt) {
    const { bot, player } = world;
    world.t += dt;
    const d = Math.hypot(player.x - bot.x, player.y - bot.y);
    const wasDead = current() === 'dead';
    const cond = {
      d: bot.hp <= 0,
      n: world.diedAt !== null && world.t - world.diedAt >= RESPAWN,
      h: bot.hp < 30, f: bot.hp >= 95, r: d < RANGE, o: d >= RANGE, s: d < SIGHT, l: d >= SIGHT,
    };
    for (const k of ORDER) if (cond[k] && fire(k)) break;

    // Entering Dead starts the respawn clock; leaving it puts a fresh bot back at the spawn point.
    const st = current();
    if (st === 'dead' && !wasDead) { world.diedAt = world.t; world.deaths++; }
    if (wasDead && st !== 'dead') {
      Object.assign(bot, { x: SPAWN[0], y: SPAWN[1], hp: 100, lastHit: -9 });
      world.diedAt = null; world.wp = 0;
    }

    switch (st) {
      case 'patrol': {
        const [x, y] = WAYPOINTS[world.wp];
        if (moveToward(bot, x, y, 70, dt) < 6) world.wp = (world.wp + 1) % WAYPOINTS.length;
        break;
      }
      case 'chase': moveToward(bot, player.x, player.y, 95, dt); break;
      case 'attack':
        bot.angle = Math.atan2(player.y - bot.y, player.x - bot.x);
        if ((world.cool -= dt) <= 0) {
          world.cool = 0.45;
          world.shots.push({ x: bot.x, y: bot.y, vx: Math.cos(bot.angle) * 330, vy: Math.sin(bot.angle) * 330, mine: true });
        }
        break;
      case 'flee': {
        const away = Math.atan2(bot.y - player.y, bot.x - player.x);
        moveToward(bot, bot.x + Math.cos(away) * 50, bot.y + Math.sin(away) * 50, 115, dt);
        break;
      }
      default: break; // Dead, or an unknown state name: the bot does nothing
    }
    bot.x = Math.max(16, Math.min(AW - 16, bot.x)); bot.y = Math.max(16, Math.min(AH - 16, bot.y));

    // The player shoots back at a living bot that comes close; the bot heals once it has not been hit for a while.
    const alive = st !== 'dead';
    if (alive && d < PLAYER_RANGE && (world.playerCool -= dt) <= 0) {
      world.playerCool = 0.6;
      const a = Math.atan2(bot.y - player.y, bot.x - player.x);
      world.shots.push({ x: player.x, y: player.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, mine: false });
    }
    if (alive && world.t - bot.lastHit > 1.5) bot.hp = Math.min(100, bot.hp + 9 * dt);
    player.flash = Math.max(0, player.flash - dt);

    world.shots = world.shots.filter(p => {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const target = p.mine ? player : bot;
      if ((p.mine || alive) && Math.hypot(p.x - target.x, p.y - target.y) < 15) {
        if (p.mine) { world.hits++; player.flash = 0.15; }
        else { bot.hp = Math.max(0, bot.hp - 12); bot.lastHit = world.t; }
        return false;
      }
      return p.x > -10 && p.y > -10 && p.x < AW + 10 && p.y < AH + 10;
    });
  }

  function render() {
    const css = getComputedStyle(box), v = n => css.getPropertyValue(n).trim();
    const fg = v('--fg') || '#000', muted = v('--muted') || '#888', line = v('--line') || '#ddd';
    const { bot, player } = world, st = current(), col = STATE_COLORS[st] || muted, dead = st === 'dead';
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.translate(view.ox, view.oy); ctx.scale(view.s, view.s);

    ctx.strokeStyle = line; ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, AW, AH);
    ctx.beginPath(); ctx.rect(0, 0, AW, AH); ctx.clip();
    ctx.globalAlpha = 0.5;
    for (let x = 40; x < AW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, AH); ctx.stroke(); }
    for (let y = 40; y < AH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(AW, y); ctx.stroke(); }
    ctx.globalAlpha = 1;

    if (st === 'patrol') {
      ctx.fillStyle = STATE_COLORS.patrol;
      WAYPOINTS.forEach(([x, y], i) => { ctx.globalAlpha = i === world.wp ? 0.9 : 0.3; ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill(); });
      ctx.globalAlpha = 1;
    }

    // Sight and shooting range around the bot, the player's range around the player.
    const ring = (x, y, r, color, dash, alpha) => { ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.setLineDash(dash); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke(); ctx.restore(); };
    if (!dead) {
      ring(bot.x, bot.y, SIGHT, muted, [6, 6], 0.6);
      ring(bot.x, bot.y, RANGE, STATE_COLORS.attack, [], 0.35);
    }
    ring(player.x, player.y, PLAYER_RANGE, fg, [3, 5], 0.35);

    const d = Math.hypot(player.x - bot.x, player.y - bot.y);
    if (!dead && d < SIGHT) {
      ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(bot.x, bot.y); ctx.lineTo(player.x, player.y); ctx.stroke(); ctx.restore();
    }

    for (const p of world.shots) {
      ctx.fillStyle = p.mine ? STATE_COLORS.attack : fg;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.mine ? 4 : 3, 0, 2 * Math.PI); ctx.fill();
    }

    // Player: a diamond the user drags.
    ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = player.flash > 0 ? STATE_COLORS.attack : fg;
    ctx.fillRect(-11, -11, 22, 22); ctx.restore();
    ctx.fillStyle = muted; ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Player (чир)', player.x, player.y + 30);

    // Bot: body in the state's color with a gun pointing where it faces; a grey cross when dead.
    ctx.save(); ctx.translate(bot.x, bot.y); ctx.rotate(bot.angle);
    if (dead) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 2 * Math.PI); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7); ctx.stroke();
    } else {
      ctx.fillStyle = fg; ctx.fillRect(6, -3.5, 18, 7);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = line; ctx.fillRect(bot.x - 20, bot.y - 30, 40, 5);
    ctx.fillStyle = bot.hp < 30 ? STATE_COLORS.attack : '#16a34a'; ctx.fillRect(bot.x - 20, bot.y - 30, (40 * bot.hp) / 100, 5);
    ctx.fillStyle = col; ctx.font = '700 13px Inter, system-ui, sans-serif';
    const left = dead && world.diedAt !== null ? Math.max(0, RESPAWN - (world.t - world.diedAt)) : null;
    ctx.fillText(left !== null ? `${state()} · ${left.toFixed(1)}s` : state() || '—', bot.x, bot.y + 34);

    ctx.textAlign = 'left'; ctx.fillStyle = muted; ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.fillText(`HP ${Math.round(bot.hp)} · Оносон: ${world.hits} · Үхсэн: ${world.deaths}${paused ? ' · ❚❚ зогссон' : ''}`, 10, 20);
    ctx.restore();
  }

  function frame(now) {
    // Not on screen (hidden pane, closed dialog, scrolled away): skip the work until it is visible again.
    if (box.closest('[data-offscreen]')) { last = now; raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) update(dt);
    render();
    raf = requestAnimationFrame(frame);
  }

  reset();
  resize();
  raf = requestAnimationFrame(frame);
  return {
    reset,
    setPaused: p => { paused = p; },
    destroy: () => { cancelAnimationFrame(raf); ro.disconnect(); canvas.remove(); },
  };
}
