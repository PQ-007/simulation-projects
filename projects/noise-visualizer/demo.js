// Sound visualizer: waveform (time), spectrum (FFT) and spectrogram (FFT over time) of live audio.
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const F_MIN = 30, F_MAX = 16000;

// Frequency → nearest note name and how many cents off it is (A4 = 440 Hz, 12 notes per octave).
export function noteOf(f) {
  const m = 69 + 12 * Math.log2(f / 440), r = Math.round(m);
  return { name: NOTES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1), cents: Math.round((m - r) * 100) };
}

// Looping noise buffers. White: independent random samples (flat spectrum). Pink: white filtered so power
// falls 3 dB per octave (Paul Kellet's filter). Brown: a leaky running sum of white, falling 6 dB per octave.
export function noiseSamples(kind, n, rand = Math.random) {
  const out = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, last = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const w = rand() * 2 - 1;
    let v = w;
    if (kind === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      v = b0 + b1 + b2 + w * 0.1848;
    } else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02; v = last;
    }
    out[i] = v; peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < n; i++) out[i] *= 0.9 / peak;
  return out;
}

const SOURCES = [
  ['sine', 'Sine 〜'], ['chord', 'Аккорд 🎹'], ['chirp', 'Chirp ↗'],
  ['white', 'White noise'], ['pink', 'Pink noise'], ['brown', 'Brown noise'], ['mic', '🎤 Микрофон'],
];

export function mount(root) {
  const h = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const panel = (label, flex) => {
    const box = h('div', { style: `position:relative;flex:${flex} 1 0;min-height:80px;border-radius:8px;overflow:hidden;background:#0b1020` });
    const cv = h('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%' });
    box.append(cv, h('span', { textContent: label, style: 'position:absolute;left:8px;top:5px;font-size:.72rem;font-weight:600;letter-spacing:.04em;color:#94a3b8;pointer-events:none' }));
    return { box, cv };
  };
  const wave = panel('WAVEFORM — цаг хугацаа', 1), spec = panel('SPECTRUM — FFT (давтамж)', 1.4), gram = panel('SPECTROGRAM — давтамж × цаг', 1.5);
  const peakLabel = h('div', { style: 'position:absolute;right:10px;top:6px;font:700 1.05rem "JetBrains Mono",ui-monospace,monospace;color:#fde047;text-shadow:0 1px 4px #000;pointer-events:none' });
  spec.box.append(peakLabel);
  const startHint = h('div', { textContent: 'Эх сурвалж сонгоод ▶ дарна уу', style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:.95rem;pointer-events:none' });
  spec.box.append(startHint);
  const stage = h('div', { style: 'flex:1;min-height:360px;display:flex;flex-direction:column;gap:8px;padding:10px' }, wave.box, spec.box, gram.box);

  const label = s => h('span', { textContent: s, style: 'font-size:.85rem;color:var(--muted)' });
  const seg = (items, onPick) => {
    const box = h('div', { className: 'seg', style: 'flex-wrap:wrap' });
    const btns = items.map(([k, t]) => h('button', { textContent: t, onclick: () => onPick(k) }));
    box.append(...btns);
    return { box, set: k => btns.forEach((b, i) => b.setAttribute('aria-selected', String(items[i][0] === k))) };
  };
  const slider = (min, max, step, value, width = 110) => h('input', { type: 'range', min, max, step, value, style: `width:${width}px` });
  const play = h('button', { className: 'btn', style: 'min-width:110px;justify-content:center', onclick: () => (running ? stop() : start()) });
  const freq = slider(0, 1, 0.001, 0.5);
  const freqOut = h('output', { style: 'min-width:5.5em;font-variant-numeric:tabular-nums;color:var(--fg)' });
  const freqField = h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, 'Давтамж', freq, freqOut);
  const vol = slider(0, 1, 0.01, 0.35, 90);
  const cutoff = slider(0, 1, 0.001, 0.6);
  const cutOut = h('output', { style: 'min-width:5em;font-variant-numeric:tabular-nums;color:var(--fg)' });
  const msg = h('span', { style: 'font-size:.8rem;color:#dc2626' });
  const srcSeg = seg(SOURCES, k => { source = k; srcSeg.set(k); freqField.style.display = k === 'sine' ? 'flex' : 'none'; if (running) start(); });
  const filtSeg = seg([['off', 'Filter-гүй'], ['lowpass', 'Lowpass'], ['highpass', 'Highpass']], k => { filterType = k; filtSeg.set(k); applyFilter(); });
  const row = (...kids) => h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center' }, ...kids);
  const controls = h('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:10px 14px;border-top:1px solid var(--line)' },
    row(play, srcSeg.box),
    row(freqField, h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, '🔊', vol), msg),
    row(label('Filter:'), filtSeg.box, h('label', { style: 'display:flex;align-items:center;gap:6px;font-size:.85rem;color:var(--muted)' }, 'Cutoff', cutoff, cutOut)));
  root.append(stage, controls);

  // Sliders run on a 0…1 scale mapped logarithmically, since we hear frequency ratios, not differences.
  const logMap = (t, lo, hi) => lo * Math.pow(hi / lo, t);
  const sineHz = () => logMap(+freq.value, 55, 3520);
  const cutHz = () => logMap(+cutoff.value, 60, 15000);

  let ctx = null, analyser, filter, gain, nodes = [], micStream = null, chirpTimer = 0;
  let source = 'sine', filterType = 'off', running = false, raf = 0;

  function sync() {
    play.textContent = running ? '■ Зогсоох' : '▶ Эхлүүлэх';
    freqOut.textContent = `${sineHz().toFixed(0)} Hz`;
    cutOut.textContent = `${cutHz().toFixed(0)} Hz`;
    startHint.style.display = running ? 'none' : 'flex'; // inline display:flex would override the hidden attribute
  }
  function applyFilter() {
    if (!filter) return sync();
    // "Off" is an allpass, so the graph never needs rewiring.
    filter.type = filterType === 'off' ? 'allpass' : filterType;
    filter.frequency.setTargetAtTime(cutHz(), ctx.currentTime, 0.02);
    filter.Q.value = 0.9;
    sync();
  }

  function teardown() {
    clearInterval(chirpTimer);
    for (const n of nodes) { try { n.stop?.(); } catch {} n.disconnect(); }
    nodes = [];
    micStream?.getTracks().forEach(t => t.stop());
    micStream = null;
  }

  // Audio graph: source → filter → analyser, and filter → volume → speakers (not for the mic, to avoid feedback).
  async function start() {
    msg.textContent = '';
    teardown();
    if (!ctx) {
      ctx = new AudioContext();
      analyser = Object.assign(ctx.createAnalyser(), { fftSize: 4096, smoothingTimeConstant: 0.65, minDecibels: -100, maxDecibels: -10 });
      filter = ctx.createBiquadFilter(); gain = ctx.createGain();
      filter.connect(analyser); filter.connect(gain); gain.connect(ctx.destination);
    }
    await ctx.resume();
    gain.gain.value = source === 'mic' ? 0 : +vol.value * (['white', 'pink', 'brown'].includes(source) ? 0.4 : 1);
    if (source === 'mic') {
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
      catch (e) { msg.textContent = `Микрофон нээгдсэнгүй: ${e.message}`; running = false; return sync(); }
      const m = ctx.createMediaStreamSource(micStream); m.connect(filter); nodes.push(m);
    } else if (['white', 'pink', 'brown'].includes(source)) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      buf.copyToChannel(noiseSamples(source, buf.length), 0);
      const s = Object.assign(ctx.createBufferSource(), { buffer: buf, loop: true });
      s.connect(filter); s.start(); nodes.push(s);
    } else {
      const freqs = source === 'chord' ? [261.63, 329.63, 392.0] : [source === 'chirp' ? 110 : sineHz()]; // C major chord
      for (const f of freqs) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; g.gain.value = 1 / freqs.length;
        o.connect(g); g.connect(filter); o.start(); nodes.push(o, g);
      }
      if (source === 'chirp') {
        // Sweep 110 Hz → 3.5 kHz over 4 seconds, again and again.
        const o = nodes[0], sweep = () => { const t = ctx.currentTime; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(3520, t + 4); };
        sweep(); chirpTimer = setInterval(sweep, 4000);
      }
    }
    running = true;
    applyFilter();
  }
  function stop() { teardown(); running = false; sync(); }

  freq.oninput = () => { if (running && source === 'sine') nodes[0]?.frequency.setTargetAtTime(sineHz(), ctx.currentTime, 0.02); sync(); };
  vol.oninput = () => { if (gain && source !== 'mic') gain.gain.setTargetAtTime(+vol.value * (['white', 'pink', 'brown'].includes(source) ? 0.4 : 1), ctx.currentTime, 0.02); };
  cutoff.oninput = applyFilter;

  // Canvas sizing: every panel follows its box.
  const sized = new Map();
  const fit = cv => {
    const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1, w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; sized.set(cv, true); }
    return [w, hh];
  };
  // x position (0…W) ↔ frequency on a log axis, shared by the spectrum and the spectrogram.
  const xToF = (x, W) => F_MIN * Math.pow(F_MAX / F_MIN, x / W);
  const fToX = (f, W) => (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * W;

  let time = null, bins = null;
  // Colour map for loudness 0…1: near-black → blue → magenta → orange → pale yellow.
  const heat = t => {
    const stops = [[11, 16, 32], [30, 64, 175], [190, 24, 160], [249, 115, 22], [254, 249, 195]];
    const x = Math.max(0, Math.min(0.999, t)) * (stops.length - 1), i = Math.floor(x), f = x - i;
    return stops[i].map((c, k) => Math.round(c + (stops[i + 1][k] - c) * f));
  };

  function drawWave() {
    const [W, H] = fit(wave.cv), g = wave.cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(148,163,184,.25)'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    if (!running) return;
    analyser.getFloatTimeDomainData(time);
    // Start at a rising zero crossing so a steady tone stands still instead of sliding.
    let s = 0;
    for (let i = 1; i < time.length / 2; i++) if (time[i - 1] < 0 && time[i] >= 0) { s = i; break; }
    const n = Math.min(time.length - s, 1024);
    g.strokeStyle = '#38bdf8'; g.lineWidth = 2 * (devicePixelRatio || 1); g.beginPath();
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * W, y = H / 2 - time[s + i] * H * 0.45; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }

  function drawSpectrum() {
    const [W, H] = fit(spec.cv), g = spec.cv.getContext('2d'), dpr = devicePixelRatio || 1;
    g.clearRect(0, 0, W, H);
    // Frequency grid with labels.
    g.font = `${11 * dpr}px Inter, system-ui, sans-serif`; g.textAlign = 'center';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      const x = fToX(f, W);
      g.strokeStyle = 'rgba(148,163,184,.18)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      g.fillStyle = '#64748b'; g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x, H - 4 * dpr);
    }
    if (filterType !== 'off') {
      const x = fToX(cutHz(), W);
      g.fillStyle = 'rgba(248,113,113,.10)';
      filterType === 'lowpass' ? g.fillRect(x, 0, W - x, H) : g.fillRect(0, 0, x, H);
      g.strokeStyle = '#f87171'; g.setLineDash([5 * dpr, 5 * dpr]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.setLineDash([]);
    }
    if (!running) { peakLabel.textContent = ''; return; }
    analyser.getFloatFrequencyData(bins);
    const ny = ctx.sampleRate / 2, level = db => Math.max(0, Math.min(1, (db - analyser.minDecibels) / (analyser.maxDecibels - analyser.minDecibels)));
    const grad = g.createLinearGradient(0, H, 0, 0); grad.addColorStop(0, 'rgba(56,189,248,.15)'); grad.addColorStop(1, 'rgba(232,121,249,.85)');
    g.beginPath(); g.moveTo(0, H);
    // Low frequencies span many pixels per FFT bin, so interpolate between bins instead of drawing steps.
    const at = f => { const p = Math.min(bins.length - 1.001, (f / ny) * bins.length), i = Math.floor(p); return bins[i] + (bins[i + 1] - bins[i]) * (p - i); };
    for (let x = 0; x <= W; x += dpr) g.lineTo(x, H - level(at(xToF(x, W))) * (H - 14 * dpr));
    g.lineTo(W, H); g.closePath(); g.fillStyle = grad; g.fill();
    g.strokeStyle = '#e879f9'; g.lineWidth = 1.5 * dpr; g.stroke();
    // Loudest bin between 40 Hz and 5 kHz, refined by fitting a parabola through it and its neighbours.
    let best = -1;
    const lo = Math.ceil((40 / ny) * bins.length), hi = Math.floor((5000 / ny) * bins.length);
    for (let b = lo; b <= hi; b++) if (best < 0 || bins[b] > bins[best]) best = b;
    // Only call it a note when the peak towers over its own neighbourhood (±half an octave, skipping the peak
    // itself). Noise always has a highest bin, but sloped noise spectra have no such local spike.
    const near = [];
    // At low frequencies half an octave is only a few bins wide, so the window is at least 8 bins each way.
    const from = Math.max(1, best - Math.max(8, Math.floor(best / 3))), to = Math.min(bins.length - 1, best + Math.max(8, Math.ceil(best / 2)));
    for (let b = from; b <= to; b++) if (Math.abs(b - best) > 2) near.push(bins[b]);
    near.sort((p, q) => p - q);
    const local = near[near.length >> 1];
    if (best > 0 && near.length >= 6 && bins[best] > -75 && bins[best] - local > 15) {
      const a = bins[best - 1], c = bins[best + 1], m = bins[best], off = (a - c) / (2 * (a - 2 * m + c) || 1);
      const f = ((best + off) * ny) / bins.length, note = noteOf(f), x = fToX(f, W);
      g.fillStyle = '#fde047'; g.beginPath(); g.arc(x, H - level(m) * (H - 14 * dpr), 4 * dpr, 0, 2 * Math.PI); g.fill();
      peakLabel.textContent = `${f.toFixed(1)} Hz · ${note.name} ${note.cents >= 0 ? '+' : ''}${note.cents}¢`;
    } else peakLabel.textContent = '';
  }

  // Spectrogram: shift the picture left and paint the newest spectrum as a column on the right.
  function drawGram() {
    const [W, H] = fit(gram.cv), g = gram.cv.getContext('2d'), dpr = devicePixelRatio || 1;
    if (sized.get(gram.cv)) { g.fillStyle = '#0b1020'; g.fillRect(0, 0, W, H); sized.set(gram.cv, false); }
    if (!running) return;
    const step = Math.max(1, Math.round(2 * dpr));
    g.drawImage(gram.cv, step, 0, W - step, H, 0, 0, W - step, H);
    const ny = ctx.sampleRate / 2, col = g.createImageData(step, H);
    for (let y = 0; y < H; y++) {
      const f = xToF(H - 1 - y, H), b = Math.min(bins.length - 1, Math.round((f / ny) * bins.length));
      const [r, gg, bb] = heat((bins[b] - analyser.minDecibels) / (analyser.maxDecibels - analyser.minDecibels));
      for (let k = 0; k < step; k++) col.data.set([r, gg, bb, 255], (y * step + k) * 4);
    }
    g.putImageData(col, W - step, 0);
  }

  function frame() {
    if (running && !time) { time = new Float32Array(analyser.fftSize); bins = new Float32Array(analyser.frequencyBinCount); }
    drawWave(); drawSpectrum(); drawGram();
    raf = requestAnimationFrame(frame);
  }

  srcSeg.set(source); filtSeg.set(filterType); freqField.style.display = 'flex'; sync();
  raf = requestAnimationFrame(frame);
  new MutationObserver((_, o) => {
    if (root.isConnected) return;
    cancelAnimationFrame(raf); teardown(); ctx?.close(); o.disconnect();
  }).observe(document.body, { childList: true, subtree: true });
}
