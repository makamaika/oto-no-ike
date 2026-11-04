(() => {
  'use strict';

  // ---------- 音階と色 ----------
  // 陽音階（レ ミ ソ ラ シ）。上に置いた石ほど高い音。
  const SCALE = [0, 2, 5, 7, 9];
  const NAMES = ['レ', 'ミ', 'ソ', 'ラ', 'シ'];
  const PIGMENTS = ['#3B9BAA', '#5AA97F', '#E0A52E', '#DD7A72', '#8B7DBF']; // 浅葱 若竹 山吹 薄紅 藤
  const BASE_HZ = 146.83; // D3
  const STEPS = 12;       // 0..12 → D3〜G5
  const Y_TOP = 0.08, Y_BOT = 0.90;
  const MAX_STONES = 24;
  const MAX_RIPPLES = 140;
  const STORE_KEY = 'oto-no-ike-v1';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function noteIndex(y) {
    const t = (Y_BOT - y) / (Y_BOT - Y_TOP);
    return Math.max(0, Math.min(STEPS, Math.round(t * STEPS)));
  }
  function noteInfo(idx) {
    const deg = idx % 5, oct = Math.floor(idx / 5);
    return {
      idx, deg, oct,
      freq: BASE_HZ * Math.pow(2, (12 * oct + SCALE[deg]) / 12),
      name: NAMES[deg],
      color: PIGMENTS[deg],
    };
  }
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const PIGMENT_RGB = PIGMENTS.map(hexToRgb);

  // ---------- 音 ----------
  let ac = null, master = null, bus = null, voices = 0, muted = false;

  function makeImpulse(seconds) {
    const rate = ac.sampleRate, len = Math.floor(rate * seconds);
    const buf = ac.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    return buf;
  }

  function ensureAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!ac) {
      ac = new Ctx();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4;
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.85;
      master.connect(comp); comp.connect(ac.destination);

      bus = ac.createGain();
      bus.connect(master);                // 直接音
      const conv = ac.createConvolver();
      conv.buffer = makeImpulse(3.4);
      const wet = ac.createGain(); wet.gain.value = 0.42;
      bus.connect(conv); conv.connect(wet); wet.connect(master); // 残響
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function panNode(pan) {
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      return p;
    }
    return ac.createGain();
  }

  // 石の音：わずかに非整数倍音を混ぜた、鈴に近い音色
  function chime(freq, vol, pan, decay) {
    if (!ac || voices > 28) return;
    const t = ac.currentTime + 0.005;
    const out = ac.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(vol, t + 0.004);
    out.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const p = panNode(pan);
    out.connect(p); p.connect(bus);

    const partials = [[1, 1, 1], [2, 0.20, 0.55], [3.01, 0.07, 0.3], [4.17, 0.045, 0.15]];
    partials.forEach(([ratio, amp, life], i) => {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * ratio;
      const g = ac.createGain();
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay * life);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + decay + 0.05);
      if (i === 0) { voices++; o.onended = () => { voices--; }; }
    });
  }

  // しずくの音：短く下がる「ぽつ」
  function plip(pan, vol) {
    if (!ac) return;
    const t = ac.currentTime + 0.005;
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1500 + Math.random() * 300, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 0.075);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    const p = panNode(pan);
    o.connect(g); g.connect(p); p.connect(bus);
    o.start(t); o.stop(t + 0.16);
  }

  function setMuted(v) {
    muted = v;
    muteBtn.setAttribute('aria-pressed', String(v));
    if (master) master.gain.setTargetAtTime(v ? 0 : 0.85, ac.currentTime, 0.05);
  }

  // ---------- 画面 ----------
  const cv = document.getElementById('pond');
  const ctx = cv.getContext('2d');
  const water = document.createElement('canvas');
  const wctx = water.getContext('2d');
  let W = 0, H = 0, DPR = 1, unit = 1;

  function buildWater() {
    water.width = Math.max(1, Math.floor(W));
    water.height = Math.max(1, Math.floor(H));
    const g = wctx.createRadialGradient(W * 0.48, H * 0.42, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, '#DFEAE6');
    g.addColorStop(0.55, '#D2E0DB');
    g.addColorStop(1, '#B4C9C3');
    wctx.fillStyle = g;
    wctx.fillRect(0, 0, W, H);
    // うっすらとした水のざらつき
    const img = wctx.getImageData(0, 0, water.width, water.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 7;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    wctx.putImageData(img, 0, 0);
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    unit = Math.max(0.62, Math.min(1.35, Math.min(W, H) / 800));
    buildWater();
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  // ---------- 石 ----------
  let stones = [];
  let nextId = 1;

  const DEFAULT_LAYOUT = [
    [0.50, 0.47, 23], [0.37, 0.38, 18], [0.61, 0.33, 16], [0.70, 0.52, 20],
    [0.58, 0.65, 15], [0.40, 0.62, 19], [0.27, 0.50, 14], [0.22, 0.27, 17],
    [0.74, 0.25, 13], [0.82, 0.72, 21], [0.17, 0.77, 16],
  ];

  function makeStone(x, y, r, seed) {
    return {
      id: nextId++, x, y, r,
      seed: seed == null ? Math.random() * Math.PI * 2 : seed,
      glow: 0, lastHit: 0, px: 0, py: 0, rad: 0,
      note: noteInfo(noteIndex(y)),
    };
  }
  function defaultStones() {
    return DEFAULT_LAYOUT.map(([x, y, r], i) => makeStone(x, y, r, (i * 2.399) % (Math.PI * 2)));
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(stones.map(s => ({ x: s.x, y: s.y, r: s.r, seed: s.seed }))));
    } catch (_) { /* 保存できない環境では何もしない */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return null;
      return arr
        .filter(o => o && isFinite(o.x) && isFinite(o.y) && isFinite(o.r))
        .slice(0, MAX_STONES)
        .map(o => makeStone(clamp01(o.x), clamp01(o.y), Math.max(10, Math.min(28, o.r)), isFinite(o.seed) ? o.seed : null));
    } catch (_) { return null; }
  }
  function clamp01(v) { return Math.max(0.02, Math.min(0.98, v)); }

  function layoutStones() {
    for (const s of stones) {
      s.px = s.x * W; s.py = s.y * H; s.rad = s.r * unit;
    }
  }

  function stoneAt(x, y, slop) {
    let best = null, bestD = Infinity;
    for (const s of stones) {
      const d = Math.hypot(x - s.px, y - s.py) - s.rad * 1.15;
      if (d < slop && d < bestD) { best = s; bestD = d; }
    }
    return best;
  }

  // ---------- 波紋・にじみ・飛沫 ----------
  let ripples = [];
  let blooms = [];
  let sparks = [];
  let chimeCount = 0;

  function addRipple(x, y, energy, fromStone) {
    if (ripples.length >= MAX_RIPPLES) return;
    const hit = new Set();
    if (fromStone) hit.add(fromStone.id);
    ripples.push({
      x, y, r: 0,
      v: 150 * unit,
      energy,
      maxR: (90 + 520 * energy) * unit,
      hit,
    });
  }

  function drop(x, y, energy) {
    addRipple(x, y, energy, null);
    plip((x / W) * 2 - 1, 0.05 + 0.07 * energy);
    if (!reduceMotion) {
      const n = 5 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (40 + Math.random() * 60) * unit * energy;
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.15, age: 0 });
      }
    }
  }

  function ringStone(s, strength, now) {
    // 80ms 以内に重なった当たりは 1 回にまとめる（時刻の取り方が違っても誤判定しないよう絶対値で比べる）
    if (Math.abs(now - s.lastHit) < 80) return;
    s.lastHit = now;
    chimeCount++;
    s.glow = Math.min(1, 0.35 + strength);
    const decay = 1.4 + ((s.r - 12) / 14) * 1.8;
    chime(s.note.freq, 0.03 + 0.32 * Math.pow(strength, 1.3), (s.px / W) * 2 - 1, decay);
    blooms.push({ x: s.px, y: s.py, rgb: PIGMENT_RGB[s.note.deg], r0: s.rad, strength, age: 0, life: 3.6 });
    if (blooms.length > 80) blooms.shift();
    // 鳴った石からも小さな波紋が広がり、連鎖する（弱まりながら止まる）
    const child = strength * 0.4;
    if (child > 0.18) addRipple(s.px, s.py, child, s);
  }

  // ---------- 状態 ----------
  let mode = 'drop';
  let raining = false, rainWait = 0.4;
  let drag = null;
  let hintShown = true;
  const hintEl = document.getElementById('hint');
  const toastEl = document.getElementById('toast');
  const rainBtn = document.getElementById('rain');
  const muteBtn = document.getElementById('mute');
  const resetBtn = document.getElementById('reset');
  const modeBtns = Array.from(document.querySelectorAll('[data-mode]'));

  function dismissHint() {
    if (!hintShown) return;
    hintShown = false;
    hintEl.classList.add('gone');
  }
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }
  function setMode(m) {
    mode = m;
    modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    cv.classList.toggle('removing', m === 'remove');
  }
  function setRain(v) {
    raining = v;
    rainWait = 0.3;
    rainBtn.setAttribute('aria-pressed', String(v));
  }

  modeBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  rainBtn.addEventListener('click', () => { ensureAudio(); dismissHint(); setRain(!raining); });
  muteBtn.addEventListener('click', () => setMuted(!muted));
  resetBtn.addEventListener('click', () => {
    stones = defaultStones();
    layoutStones();
    save();
    toast('石を最初の並びに戻しました');
  });

  // ---------- 操作 ----------
  function pointerSlop(e) { return e.pointerType === 'touch' ? 14 : 6; }

  cv.addEventListener('pointerdown', (e) => {
    ensureAudio();
    dismissHint();
    const x = e.clientX, y = e.clientY;
    const s = stoneAt(x, y, pointerSlop(e));

    if (mode === 'remove') {
      if (s) {
        stones = stones.filter(t => t !== s);
        addRipple(s.px, s.py, 0.32, s);
        plip((s.px / W) * 2 - 1, 0.06);
        save();
      }
      return;
    }
    if (s) {
      drag = { s, dx: x - s.px, dy: y - s.py, sx: x, sy: y, moved: false, idx: s.note.idx };
      cv.setPointerCapture(e.pointerId);
      cv.classList.add('dragging');
      return;
    }
    if (mode === 'drop') {
      drop(x, y, 1);
    } else if (mode === 'stone') {
      if (stones.length >= MAX_STONES) { toast(`石は${MAX_STONES}個まで置けます`); return; }
      const st = makeStone(clamp01(x / W), clamp01(y / H), 13 + Math.random() * 11);
      stones.push(st);
      layoutStones();
      st.glow = 0.8;
      chime(st.note.freq, 0.14, (x / W) * 2 - 1, 1.2);
      addRipple(st.px, st.py, 0.25, st);
      save();
    }
  });

  cv.addEventListener('pointermove', (e) => {
    const x = e.clientX, y = e.clientY;
    if (drag) {
      if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) > 5) drag.moved = true;
      if (!drag.moved) return;
      const s = drag.s;
      s.x = clamp01((x - drag.dx) / W);
      s.y = clamp01((y - drag.dy) / H);
      s.note = noteInfo(noteIndex(s.y));
      layoutStones();
      if (s.note.idx !== drag.idx) {
        drag.idx = s.note.idx;
        s.glow = Math.max(s.glow, 0.5);
        chime(s.note.freq, 0.1, (s.px / W) * 2 - 1, 0.9);
      }
      return;
    }
    if (e.pointerType === 'mouse') {
      cv.classList.toggle('on-stone', mode !== 'remove' && !!stoneAt(x, y, 4));
    }
  });

  function endDrag() {
    if (!drag) return;
    const s = drag.s;
    if (!drag.moved) {
      // 石をそのまま叩いた
      ringStone(s, 0.75, performance.now());
    } else {
      save();
    }
    drag = null;
    cv.classList.remove('dragging');
  }
  cv.addEventListener('pointerup', () => { ensureAudio(); endDrag(); });
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const onButton = e.target && e.target.closest && e.target.closest('button');
    const k = e.key.toLowerCase();
    if (k === '1') setMode('drop');
    else if (k === '2') setMode('stone');
    else if (k === '3') setMode('remove');
    else if (k === 'r') { ensureAudio(); dismissHint(); setRain(!raining); }
    else if (k === 'm') setMuted(!muted);
    else if (k === ' ' && !onButton) {
      e.preventDefault();
      ensureAudio(); dismissHint();
      drop(W * (0.15 + Math.random() * 0.7), H * (0.15 + Math.random() * 0.65), 0.9);
    }
  });

  // ---------- 更新 ----------
  function update(dt, now) {
    layoutStones();

    for (const s of stones) s.glow = Math.max(0, s.glow - dt * 1.5);

    if (raining) {
      rainWait -= dt;
      if (rainWait <= 0) {
        drop(W * (0.06 + Math.random() * 0.88), H * (0.06 + Math.random() * 0.84), 0.5 + Math.random() * 0.45);
        rainWait = 0.6 + Math.random() * 1.7;
      }
    }

    for (const rp of ripples) {
      const prev = rp.r;
      rp.r += rp.v * dt;
      for (const s of stones) {
        if (rp.hit.has(s.id)) continue;
        const edge = Math.hypot(s.px - rp.x, s.py - rp.y) - s.rad;
        if (edge <= 0) { rp.hit.add(s.id); continue; }   // 石の上に落ちた波紋
        if (prev < edge && rp.r >= edge) {
          rp.hit.add(s.id);
          if (edge < rp.maxR) {
            const strength = rp.energy * (1 - edge / rp.maxR);
            if (strength > 0.07) ringStone(s, strength, now);
          }
        }
      }
    }
    ripples = ripples.filter(rp => rp.r < rp.maxR);

    for (const b of blooms) b.age += dt;
    blooms = blooms.filter(b => b.age < b.life);

    for (const p of sparks) {
      p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.9; p.vy *= 0.9;
    }
    sparks = sparks.filter(p => p.age < p.life);
  }

  // ---------- 描画 ----------
  function pebblePath(s, cx, cy, rad, scale) {
    const n = 9, pts = [];
    const c = Math.cos(s.seed), sn = Math.sin(s.seed);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + 0.10 * Math.sin(a * 2 + s.seed) + 0.05 * Math.sin(a * 3 + s.seed * 2.3);
      const px = Math.cos(a) * rad * k * 1.12;
      const py = Math.sin(a) * rad * k * 0.88;
      pts.push([cx + (px * c - py * sn) * scale, cy + (px * sn + py * c) * scale]);
    }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    ctx.beginPath();
    const m0 = mid(pts[n - 1], pts[0]);
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], m = mid(p, pts[(i + 1) % n]);
      ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    ctx.closePath();
  }

  function drawBlooms() {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (const b of blooms) {
      const t = b.age / b.life;
      const ease = 1 - Math.pow(1 - Math.min(1, t * 1.6), 3);
      const R = b.r0 * (1.4 + 3.2 * ease) * (0.7 + 0.6 * b.strength);
      const a = (0.42 + 0.3 * b.strength) * (1 - t) * (1 - t);
      const [r, g, bl] = b.rgb;
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, R);
      grad.addColorStop(0, `rgba(${r},${g},${bl},${a})`);
      grad.addColorStop(0.6, `rgba(${r},${g},${bl},${a * 0.45})`);
      grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawRipples() {
    for (const rp of ripples) {
      const k = 1 - rp.r / rp.maxR;
      const s = rp.energy * k;
      const a = Math.min(0.75, s * 0.85);
      if (a <= 0.004) continue;
      ctx.lineWidth = Math.max(0.8, (0.7 + 2.0 * s) * unit);
      ctx.strokeStyle = `rgba(34,48,58,${a})`;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2); ctx.stroke();
      if (rp.r > 8 * unit) {
        ctx.lineWidth = Math.max(0.6, (0.5 + 1.2 * s) * unit);
        ctx.strokeStyle = `rgba(34,48,58,${a * 0.4})`;
        ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r * 0.86, 0, Math.PI * 2); ctx.stroke();
        // 水面の光の照り返し
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.55})`;
        ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r + 2.2 * unit, 0, Math.PI * 2); ctx.stroke();
      }
      if (rp.energy > 0.6 && rp.r > 30 * unit) {
        ctx.strokeStyle = `rgba(34,48,58,${a * 0.18})`;
        ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r * 0.68, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  function drawStones() {
    // 影
    for (const s of stones) {
      const g = ctx.createRadialGradient(s.px + 2 * unit, s.py + 4 * unit, 0, s.px + 2 * unit, s.py + 4 * unit, s.rad * 1.7);
      g.addColorStop(0, 'rgba(34,48,58,0.24)');
      g.addColorStop(1, 'rgba(34,48,58,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.px + 2 * unit, s.py + 4 * unit, s.rad * 1.7, 0, Math.PI * 2); ctx.fill();
    }
    for (const s of stones) {
      const lifted = drag && drag.s === s && drag.moved;
      const scale = 1 + 0.07 * s.glow + (lifted ? 0.08 : 0);
      const cx = s.px, cy = s.py - (lifted ? 3 * unit : 0), rad = s.rad;

      // 鳴ったときの輪
      if (s.glow > 0.01) {
        const [r, g, b] = PIGMENT_RGB[s.note.deg];
        ctx.lineWidth = 2 * unit;
        ctx.strokeStyle = `rgba(${r},${g},${b},${s.glow * 0.9})`;
        ctx.beginPath(); ctx.arc(cx, cy, rad * 1.3 + (1 - s.glow) * 10 * unit, 0, Math.PI * 2); ctx.stroke();
      }

      // 水際の明るい縁
      pebblePath(s, cx, cy, rad, scale * 1.08);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fill();

      // 石の本体
      pebblePath(s, cx, cy, rad, scale);
      const body = ctx.createLinearGradient(cx - rad, cy - rad, cx + rad, cy + rad);
      body.addColorStop(0, '#7C8985');
      body.addColorStop(1, '#3A4441');
      ctx.fillStyle = body;
      ctx.fill();

      // つや
      ctx.save();
      ctx.translate(cx - rad * 0.32, cy - rad * 0.38);
      ctx.rotate(-0.55);
      ctx.fillStyle = 'rgba(255,255,255,0.17)';
      ctx.beginPath(); ctx.ellipse(0, 0, rad * 0.38, rad * 0.17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // 音を示す色の点
      ctx.fillStyle = s.note.color;
      ctx.beginPath();
      ctx.arc(cx + rad * 0.22, cy + rad * 0.2, Math.max(2.6, rad * 0.17) * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSparks() {
    for (const p of sparks) {
      const a = 0.55 * (1 - p.age / p.life);
      ctx.fillStyle = `rgba(34,48,58,${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * unit, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ドラッグ中に音名を表示（数字譜のように、低い音は下に点、高い音は上に点）
  function drawDragLabel() {
    if (!drag || !drag.moved) return;
    const s = drag.s;
    const x = s.px, y = s.py - s.rad * 1.6 - 18 * unit;
    ctx.save();
    ctx.font = `600 ${Math.round(20 * unit + 4)}px ${getComputedStyle(document.documentElement).getPropertyValue('--mincho')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#22303A';
    ctx.fillText(s.note.name, x, y);
    ctx.fillStyle = s.note.color;
    const dotR = 2.6 * unit + 0.5;
    if (s.note.oct === 0) { ctx.beginPath(); ctx.arc(x, y + 17 * unit, dotR, 0, Math.PI * 2); ctx.fill(); }
    if (s.note.oct === 2) { ctx.beginPath(); ctx.arc(x, y - 17 * unit, dotR, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  function draw() {
    ctx.drawImage(water, 0, 0, W, H);
    drawBlooms();
    drawRipples();
    drawStones();
    drawSparks();
    drawDragLabel();
  }

  // ---------- 開始 ----------
  resize();
  stones = load() || defaultStones();
  layoutStones();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt, now);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 動作確認用（コンソールから状態を見たり、時間を進めたりできるように）
  let simClock = 0;
  window.__pond = { get stones() { return stones; }, get ripples() { return ripples; }, get chimes() { return chimeCount; }, drop, setRain,
    simulate(sec) {
      simClock = Math.max(simClock, performance.now());
      for (let i = 0; i < sec * 60; i++) { simClock += 1000 / 60; update(1 / 60, simClock); }
      draw();
    } };
})();
