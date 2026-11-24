/* =========================================================
   恒存 EVERKEEP — 滚动叙事引擎
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- 工具 ---------------- */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a || 1), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const root = document.documentElement;
  const body = document.body;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 全局状态 ---------------- */
  let X = 0;          // 溃烂进度（单调不减）
  let D = 0;          // 暗化进度（可回退）
  let lastX = -1, lastD = -1, lastStage = -1, lastTitle = '';
  let lastSeep = -1;
  let vh = window.innerHeight;
  let seepTop = 1e9;
  let docMax = 1;
  let ticking = false;
  let upFlow = 0;
  let warnedRewind = false;
  let meterHot = false;
  let cookieDismissed = false;

  /* =========================================================
     程序化图像
     ========================================================= */
  let noiseCanvas = null;
  function getNoise() {
    if (noiseCanvas) return noiseCanvas;
    const c = document.createElement('canvas');
    c.width = c.height = 140;
    const cx = c.getContext('2d');
    const img = cx.createImageData(140, 140);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + (Math.random() * 2 - 1) * 72;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 26;
    }
    cx.putImageData(img, 0, 0);
    noiseCanvas = c;
    return c;
  }

  function grain(ctx, w, h, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const pat = ctx.createPattern(getNoise(), 'repeat');
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function vignette(ctx, w, h, strength) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + strength + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /* ---- 一张"照片" ---- */
  function drawPhoto(ctx, w, h, seed, forceKind) {
    const r = mulberry32(seed * 7919 + 13);
    const kind = forceKind != null ? forceKind : Math.floor(r() * 4);
    ctx.clearRect(0, 0, w, h);

    if (kind === 0) {
      /* 黄昏风景 */
      const g = ctx.createLinearGradient(0, 0, 0, h * 0.78);
      g.addColorStop(0, '#7d8fa8');
      g.addColorStop(0.42, '#c9a888');
      g.addColorStop(0.72, '#e8bd8e');
      g.addColorStop(1, '#f2cf9f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const sx = w * (0.28 + r() * 0.44), sy = h * (0.52 + r() * 0.14);
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.62);
      rg.addColorStop(0, 'rgba(255,246,218,.95)');
      rg.addColorStop(0.16, 'rgba(255,226,178,.42)');
      rg.addColorStop(1, 'rgba(255,205,155,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);

      const baseY = h * (0.7 + r() * 0.06);
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      const seg = 6;
      for (let i = 0; i <= seg; i++) {
        const px = (w / seg) * i;
        const py = baseY - (r() * 0.16 + 0.02) * h;
        ctx.quadraticCurveTo(px - w / seg / 2, py, px, baseY - r() * 0.03 * h);
      }
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      ctx.fillStyle = 'rgba(58,52,44,.92)';
      ctx.fill();
      ctx.fillStyle = 'rgba(34,30,26,1)';
      ctx.fillRect(0, h * 0.88, w, h * 0.12);

    } else if (kind === 1) {
      /* 逆光人像 */
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#efe3cf');
      g.addColorStop(0.5, '#dcc9ad');
      g.addColorStop(1, '#b9a68b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      const hx = w * (0.46 + r() * 0.12), hy = h * 0.42;
      const hr = w * 0.2;
      const halo = ctx.createRadialGradient(hx, hy, hr * 0.6, hx, hy, hr * 2.4);
      halo.addColorStop(0, 'rgba(255,250,235,.75)');
      halo.addColorStop(1, 'rgba(255,245,225,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      /* 肩 */
      ctx.beginPath();
      ctx.moveTo(hx - w * 0.36, h);
      ctx.quadraticCurveTo(hx - w * 0.18, h * 0.7, hx, h * 0.72);
      ctx.quadraticCurveTo(hx + w * 0.18, h * 0.7, hx + w * 0.36, h);
      ctx.closePath();
      ctx.fillStyle = 'rgba(46,41,36,.9)';
      ctx.fill();

      /* 头 */
      ctx.beginPath();
      ctx.ellipse(hx, hy, hr * 0.82, hr, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(40,35,31,.94)';
      ctx.fill();

      /* 边缘光 */
      ctx.strokeStyle = 'rgba(255,238,205,.5)';
      ctx.lineWidth = w * 0.012;
      ctx.stroke();

    } else if (kind === 2) {
      /* 室内 */
      ctx.fillStyle = '#ddd3c2';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#cabfab';
      ctx.fillRect(0, h * 0.62, w, h * 0.38);

      const wx = w * 0.5, wy = h * 0.36, ww = w * 0.44, wh = h * 0.44;
      const glow = ctx.createRadialGradient(wx, wy, 0, wx, wy, ww * 1.5);
      glow.addColorStop(0, 'rgba(255,255,248,.95)');
      glow.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fdfcf3';
      ctx.fillRect(wx - ww / 2, wy - wh / 2, ww, wh);
      ctx.strokeStyle = 'rgba(120,110,95,.5)';
      ctx.lineWidth = Math.max(1, w * 0.008);
      ctx.beginPath();
      ctx.moveTo(wx, wy - wh / 2); ctx.lineTo(wx, wy + wh / 2);
      ctx.moveTo(wx - ww / 2, wy); ctx.lineTo(wx + ww / 2, wy);
      ctx.stroke();

      /* 前景家具 */
      ctx.fillStyle = 'rgba(72,62,50,.88)';
      const fx = w * (0.02 + r() * 0.1);
      ctx.fillRect(fx, h * 0.6, w * 0.3, h * 0.4);
      ctx.fillStyle = 'rgba(60,51,41,.55)';
      ctx.fillRect(w * 0.68, h * 0.72, w * 0.3, h * 0.28);

    } else {
      /* 夜景 */
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#141b2c');
      g.addColorStop(0.6, '#1d2438');
      g.addColorStop(1, '#0e1220');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 14; i++) {
        const px = r() * w, py = h * (0.3 + r() * 0.6);
        const rad = w * (0.02 + r() * 0.06);
        const lg = ctx.createRadialGradient(px, py, 0, px, py, rad);
        lg.addColorStop(0, 'rgba(255,214,140,' + (0.5 + r() * 0.5) + ')');
        lg.addColorStop(1, 'rgba(255,190,90,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
      ctx.fillStyle = 'rgba(8,10,16,.92)';
      for (let i = 0; i < 5; i++) {
        const bw = w * (0.1 + r() * 0.2), bh = h * (0.1 + r() * 0.35);
        ctx.fillRect(r() * w, h - bh, bw, bh);
      }
    }

    /* 统一调性：胶片颗粒 + 暗角 + 色偏 */
    grain(ctx, w, h, 0.9);
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255,196,132,.18)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    vignette(ctx, w, h, 0.55);
  }

  /* ---- 黑暗中站着一个人影（逆光剪影，看不清是谁） ---- */
  function drawFigure(ctx, w, h, seed, opts) {
    const r = mulberry32(seed * 104729 + 7);
    const o = opts || {};
    const bright = o.bright == null ? 1 : o.bright;
    const zoom = o.zoom == null ? 1 : o.zoom;
    const lift = o.lift == null ? 0 : o.lift;

    ctx.clearRect(0, 0, w, h);

    /* 背后有光，但不亮 —— 昏的、有雾的，人影才立得住 */
    const bg = ctx.createRadialGradient(
      w * 0.5, h * (0.40 - lift * 0.5), 0,
      w * 0.5, h * (0.52 - lift * 0.4), Math.max(w, h) * 0.95
    );
    bg.addColorStop(0, 'rgb(' + Math.round(60 * bright) + ',' + Math.round(56 * bright) + ',' + Math.round(49 * bright) + ')');
    bg.addColorStop(0.28, 'rgb(' + Math.round(36 * bright) + ',' + Math.round(33 * bright) + ',' + Math.round(29 * bright) + ')');
    bg.addColorStop(0.60, 'rgb(' + Math.round(17 * bright) + ',' + Math.round(16 * bright) + ',' + Math.round(15 * bright) + ')');
    bg.addColorStop(1, '#040405');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    /* 一点点雾，让人影不是贴在纯色上 */
    for (let i = 0; i < 3; i++) {
      const fx = w * (0.2 + r() * 0.6);
      const fy = h * (0.3 + r() * 0.5);
      const fr = Math.max(w, h) * (0.3 + r() * 0.35);
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      fg.addColorStop(0, 'rgba(120,112,100,' + (0.05 * bright) + ')');
      fg.addColorStop(1, 'rgba(120,112,100,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, w, h);
    }

    /* ---- 人影几何 ---- */
    const cx = w * (0.5 + (r() - 0.5) * 0.12);
    const base = Math.min(w, h);
    const headR = base * 0.135 * zoom;
    const headH = headR * 1.14;
    const headY = h * (0.40 - lift) - headR * (zoom - 1) * 0.55;
    const neckW = headR * 0.40;
    const shW = headR * 3.45;
    const shY = headY + headH * 1.55;

    /* 身体：脖子 → 肩 → 向下没出画面 */
    ctx.beginPath();
    ctx.moveTo(cx - shW, h + h * 0.1);
    ctx.bezierCurveTo(cx - shW * 0.99, shY + (h - shY) * 0.22, cx - shW * 0.62, shY + h * 0.02, cx - neckW * 1.35, shY - headH * 0.08);
    ctx.lineTo(cx - neckW, headY + headH * 0.72);
    ctx.lineTo(cx + neckW, headY + headH * 0.72);
    ctx.lineTo(cx + neckW * 1.35, shY - headH * 0.08);
    ctx.bezierCurveTo(cx + shW * 0.62, shY + h * 0.02, cx + shW * 0.99, shY + (h - shY) * 0.22, cx + shW, h + h * 0.1);
    ctx.closePath();
    ctx.fillStyle = '#000';
    ctx.fill();

    /* 头 */
    ctx.beginPath();
    ctx.ellipse(cx, headY, headR * 0.88, headH * 0.92, (r() - 0.5) * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    /* 轮廓光：背后有光，边缘就有一线极淡的亮 */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(196,186,166,' + (0.13 * bright) + ')';
    ctx.lineWidth = Math.max(1, base * 0.006);
    ctx.beginPath();
    ctx.ellipse(cx, headY, headR * 0.88, headH * 0.92, 0, Math.PI * 1.06, Math.PI * 1.94);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - shW * 0.98, h + h * 0.1);
    ctx.bezierCurveTo(cx - shW * 0.98, shY + (h - shY) * 0.22, cx - shW * 0.62, shY + h * 0.02, cx - neckW * 1.35, shY - headH * 0.08);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + shW * 0.98, h + h * 0.1);
    ctx.bezierCurveTo(cx + shW * 0.98, shY + (h - shY) * 0.22, cx + shW * 0.62, shY + h * 0.02, cx + neckW * 1.35, shY - headH * 0.08);
    ctx.stroke();
    ctx.restore();

    /* 颗粒 + 暗角 */
    grain(ctx, w, h, 1);
    vignette(ctx, w, h, 0.92);
  }

  /* =========================================================
     初始化照片
     ========================================================= */
  function paintPhoto(fig, idx) {
    const base = $('canvas', fig);
    const alt = $('canvas.alt', fig);
    if (!base || base.dataset.done) return;
    base.dataset.done = '1';
    const w = 300, h = 375;
    base.width = w; base.height = h;
    drawPhoto(base.getContext('2d'), w, h, +fig.dataset.seed || 1, (idx || 0) % 4);
    if (alt) {
      alt.width = 300; alt.height = 375;
      drawFigure(alt.getContext('2d'), 300, 375, (+fig.dataset.seed || 1) + 3, { bright: 0.9 });
    }
  }

  function paintTile(tile, seed, idx) {
    const base = $('canvas', tile);
    const alt = $('canvas.alt', tile);
    const w = 200, h = 250;
    if (base) { base.width = w; base.height = h; drawPhoto(base.getContext('2d'), w, h, seed, idx % 4); }
    if (alt) {
      alt.width = w; alt.height = h;
      drawFigure(alt.getContext('2d'), w, h, seed + 101, {
        bright: 0.7 + (seed % 5) * 0.09,
        zoom: 0.92 + (seed % 4) * 0.06,
      });
    }
  }

  /* =========================================================
     文本溃烂
     ========================================================= */
  const CJK = '的一是了我不人在他有这上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感亡失焦枯竭尘暗噬';
  const SIG = '▓▒░█▚▞▙#@$%&*/<>¦·≡≠';

  function randChar(ref) {
    const isAscii = /[\x00-\x7F]/.test(ref);
    const pool = isAscii ? SIG : CJK;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const morphs = [];
  let morphRaf = 0;

  function pumpMorphs() {
    if (!morphs.length) { morphRaf = 0; return; }
    const now = performance.now();
    for (let i = morphs.length - 1; i >= 0; i--) {
      const m = morphs[i];
      const t = clamp((now - m.t0) / m.dur, 0, 1);
      const to = m.to, from = m.from;
      const n = to.length;
      const head = Math.floor(t * n);
      let out = '';
      for (let k = 0; k < n; k++) {
        if (k < head) out += to[k];
        else if (k < head + 1 && t < 1) out += randChar(to[k]);
        else out += (from[k] !== undefined ? from[k] : to[k]);
      }
      m.el.textContent = out;
      if (t >= 1) { m.el.textContent = to; morphs.splice(i, 1); }
    }
    morphRaf = requestAnimationFrame(pumpMorphs);
  }

  function morphTo(el, text) {
    if (el.textContent === text) return;
    for (let i = morphs.length - 1; i >= 0; i--) {
      if (morphs[i].el === el) morphs.splice(i, 1);
    }
    /* 并发太多就跳过动画，直接定型，避免滚太快时卡死 */
    if (morphs.length > 7) { el.textContent = text; return; }
    const from = el.textContent.split('');
    morphs.push({ el: el, from: from, to: text.split(''), t0: performance.now(), dur: reduce ? 1 : 300 });
    if (!morphRaf) morphRaf = requestAnimationFrame(pumpMorphs);
  }

  /* 解析 data-mut —— at 按元素在文档中的位置自动分配，滚动到它附近才开始坏 */
  const muts = [];
  function initMuts() {
    muts.length = 0;
    const mTop = Math.max(1, seepTop - vh * 0.4);
    const list = $$('[data-mut]');
    list.forEach(function (el, i) {
      const parts = el.dataset.mut.split('|');
      if (parts.length < 2) return;
      let at;
      if (el.dataset.at != null) {
        at = parseFloat(el.dataset.at);
      } else {
    /* 元素越靠下，越晚开始坏；营销区映射到 0.05 ~ 0.43 */
        const top = el.getBoundingClientRect().top + window.scrollY;
        at = 0.05 + 0.40 * clamp(top / mTop, 0, 1);
        /* 轻微错位，让崩溃显得没有统一调度 */
        at += ((i * 37) % 11 - 5) * 0.007;
        at = clamp(at, 0.04, 0.46);
      }
      muts.push({ el: el, parts: parts, stage: -1, at: at });
    });
  }

  function updateMuts(x) {
    for (let i = 0; i < muts.length; i++) {
      const m = muts[i];
      const at = m.at;
      let stage = 0;
      if (x >= at) stage = 1;
      if (x >= at + 0.13) stage = 2;
      if (x >= at + 0.28) stage = 3;
      if (x >= at + 0.44) stage = 4;
      stage = Math.min(stage, m.parts.length - 1);
      if (stage !== m.stage) {
        m.stage = stage;
        morphTo(m.el, m.parts[stage]);
      }
    }
  }

  /* =========================================================
     照片墙
     ========================================================= */
  const wall = $('#wall');
  const tiles = [];
  let wallBuilt = 0;

  function buildWall() {
    if (!wall) return;
    /* 按视口算需要多少块才能正好铺满，多备一行避免留白 */
    const cell = 118 + 5;
    const cols = Math.max(4, Math.ceil((window.innerWidth + 40) / cell));
    const extra = Math.ceil((window.innerHeight * 1.2) / 150);
    const need = cols * (extra + 2);
    for (let i = wallBuilt; i < need; i++) {
      const d = document.createElement('div');
      d.className = 'tile';
      d.innerHTML = '<canvas></canvas><canvas class="alt"></canvas>';
      wall.appendChild(d);
      tiles.push({ el: d, awake: false, changed: false, seed: 17 + i * 31, i: i });
    }
    wallBuilt = need;
  }

  let painted = 0;
  function paintTilesLazy() {
    if (painted >= tiles.length) return;
    const batch = tiles.slice(painted, painted + 6);
    batch.forEach(function (t) { paintTile(t.el, t.seed, t.i); });
    painted += batch.length;
    if (painted < tiles.length) setTimeout(paintTilesLazy, 40);
  }

  /* =========================================================
     主滚动引擎
     ========================================================= */
  function measure() {
    vh = window.innerHeight;
    const seep = $('#seep');
    seepTop = seep ? seep.getBoundingClientRect().top + window.scrollY : 1e9;
    docMax = Math.max(1, document.documentElement.scrollHeight - vh);
  }

  /* 位置 → 溃烂进度（0..1） */
  function progressOf(y) {
    const mEnd = Math.max(1, seepTop - vh * 0.4);
    if (y <= mEnd) {
      return 0.40 * smooth(0, mEnd, y);
    }
    return 0.40 + 0.60 * smooth(mEnd, Math.max(mEnd + 1, docMax), y);
  }
  const navEl = $('#nav');
  const navProgress = $('#navProgress');
  const bleed = $('#bleed');
  const sceneEye = $('#sceneEye');
  const sceneWall = $('#sceneWall');
  const sceneFace = $('#sceneFace');
  const eyeEl = $('#eye');
  const faceCanvas = $('#faceCanvas');
  const usersNum = $('#usersNum');
  const heroMeter = $('#heroMeter');
  const meterLabel = $('#meterLabel');

  function sceneProgress(el) {
    if (!el) return 0;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const h = el.offsetHeight - vh;
    if (h <= 0) return 0;
    return clamp((window.scrollY - top) / h, 0, 1);
  }

  function setStage(st) {
    if (st === lastStage) return;
    lastStage = st;
    body.dataset.stage = String(st);
  }

  function setTitle(t) {
    if (t === lastTitle) return;
    lastTitle = t;
    document.title = t;
  }

  function tick() {
    ticking = false;
    const y = window.scrollY;

    /* 1. 溃烂进度：只增不减（时间不可逆） */
    const raw = clamp(progressOf(y), 0, 1);
    if (raw > X) X = raw;

    /* 2. 黑潮：footer 中段开始从底部涌，到 seep 入口时彻底淹没 */
    const bleedP = smooth(seepTop - vh * 1.05, seepTop - vh * 0.02, y);
    bleed.style.height = (bleedP * bleedP * (3 - 2 * bleedP) * vh * 1.18).toFixed(1) + 'px';

    /* 3. 暗化：只在黑潮快吞完时把页面压暗，避免白底露出 */
    D = smooth(0.45, 1.0, bleedP) * 0.96;

    if (Math.abs(X - lastX) > 0.003) {
      root.style.setProperty('--x', X.toFixed(3));
      lastX = X;
    }
    if (Math.abs(D - lastD) > 0.002) {
      root.style.setProperty('--d', D.toFixed(3));
      lastD = D;
    }

    /* 4. seep 文案分段 */
    const pSeep = clamp((y - (seepTop - vh)) / Math.max(1, vh), 0, 1);
    const sStage = pSeep < 0.20 ? 0 : pSeep < 0.48 ? 1 : pSeep < 0.76 ? 2 : 3;
    if (lastSeep !== sStage) { lastSeep = sStage; body.dataset.seep = String(sStage); }

    /* 5. 氛围 */
    const st = X < 0.10 ? 0 : X < 0.40 ? 1 : X < 0.62 ? 2 : X < 0.86 ? 3 : 4;
    setStage(st);

    /* Cookie 横幅：一旦黑潮来了就自己退场，没人在这儿读隐私政策 */
    if (!cookieDismissed && X > 0.34) {
      cookieDismissed = true;
      if (cookieEl) {
        cookieEl.classList.add('out');
        setTimeout(function () { cookieEl.classList.add('gone'); }, 900);
      }
    }

    /* 6. 文本 */
    updateMuts(X);
    updateImplants(X);

    /* 6. 数字 */
    if (usersNum) {
      const v = 2438901 + Math.round(smooth(0.55, 1, X) * 2);
      const s = v.toLocaleString('en-US');
      if (usersNum.textContent !== s) usersNum.textContent = s;
    }

    /* 7. 进度条 */
    if (heroMeter) {
      heroMeter.style.width = '100%';
      if (X > 0.55 && !meterHot) {
        meterHot = true;
        heroMeter.style.background = '#a32424';
        if (meterLabel) meterLabel.style.color = '#a32424';
      }
    }

    /* 8. 导航 */
    const scrolled = y > 40;
    if (scrolled !== navEl.classList.contains('scrolled')) navEl.classList.toggle('scrolled', scrolled);
    const docH = document.documentElement.scrollHeight - vh;
    navProgress.style.width = (docH > 0 ? clamp(y / docH, 0, 1) * 100 : 0).toFixed(2) + '%';

    /* 9. 场景 */
    const pEye = sceneProgress(sceneEye);
    if (sceneEye) sceneEye.style.setProperty('--p', pEye.toFixed(4));
    const pe = pEye < 0.3 ? 0 : pEye < 0.62 ? 1 : pEye < 0.88 ? 2 : 3;
    if (body.dataset.eye !== String(pe)) body.dataset.eye = String(pe);

    const pWall = sceneProgress(sceneWall);
    if (sceneWall) sceneWall.style.setProperty('--p', pWall.toFixed(4));
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      /* 用伪随机打乱顺序，让"醒来"没有明显方向 */
      const jitter = ((i * 61) % 97) / 97;
      const wake = 0.02 + jitter * 0.30;
      const chg = 0.40 + jitter * 0.42;
      const shouldAwake = pWall > wake;
      const shouldChange = pWall > chg;
      if (shouldAwake !== t.awake) { t.awake = shouldAwake; t.el.classList.toggle('awake', shouldAwake); }
      if (shouldChange !== t.changed) { t.changed = shouldChange; t.el.classList.toggle('changed', shouldChange); }
    }

    const pFace = sceneProgress(sceneFace);
    if (sceneFace) sceneFace.style.setProperty('--p', pFace.toFixed(4));
    if (pFace > 0.02 && pFace <= 1.02) drawFaceScene(pFace);

    /* 闪帧：划到脸最接近的一刻，白一下，然后一切消失 */
    if (!faceFlashed && pFace > 0.66) {
      faceFlashed = true;
      triggerFlash();
    }

    /* 10. 标题与图标 */
    if (X > 0.9) setTitle('别回头');
    else if (X > 0.78) setTitle('不要关闭');
    else if (X > 0.62) setTitle('你在看');
    else if (X > 0.42) setTitle('everkeep');
    else if (X > 0.2) setTitle('恒存 EVERKEEP');
    else setTitle('恒存 EVERKEEP — 你珍视的每一刻，都值得永远保存');

    /* 11. 往回滚的警告 */
    if (y < (tick._ly || 0) - 2) upFlow += (tick._ly || 0) - y;
    if (!warnedRewind && upFlow > vh * 1.4) {
      warnedRewind = true;
      toast('上行通道已关闭。', true);
    }
    tick._ly = y;

    /* 12. 声音 */
    if (audioReady) audioMix(X, D);
  }

  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(tick); }
  }

  /* =========================================================
     巨脸
     ========================================================= */
  let faceW = 0, faceH = 0, faceLast = -1, faceFlashed = false;

  /* 一帧的白，短到让人怀疑刚才看见没有 */
  const flashEl = $('#flash');
  function triggerFlash() {
    if (!flashEl) return;
    if (reduce) return;
    flashEl.style.transition = 'none';
    flashEl.style.opacity = '0.92';
    setTimeout(function () {
      flashEl.style.transition = 'opacity 420ms cubic-bezier(.4,0,1,1)';
      flashEl.style.opacity = '0';
    }, 46);
    /* 再补两下更短的，像接触不良 */
    setTimeout(function () {
      flashEl.style.transition = 'none';
      flashEl.style.opacity = '0.55';
      setTimeout(function () {
        flashEl.style.transition = 'opacity 260ms linear';
        flashEl.style.opacity = '0';
      }, 34);
    }, 520);
  }

  function sizeFace() {
    if (!faceCanvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    faceW = Math.round(window.innerWidth * dpr);
    faceH = Math.round(window.innerHeight * dpr);
    faceCanvas.width = faceW;
    faceCanvas.height = faceH;
    faceLast = -1;
  }

  function drawFaceScene(p) {
    if (!faceCanvas) return;
    const key = Math.round(p * 300);
    if (key === faceLast) return;
    faceLast = key;

    const ctx = faceCanvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    /* 从很远的地方开始，一直走过来。看不清是谁。 */
    const close = smooth(0, 1, p);
    drawFigure(ctx, faceW, faceH, 424242, {
      zoom: 0.48 + close * 1.72,
      bright: 0.52 + close * 0.55,
      lift: 0.02 - close * 0.05,
    });
  }

  /* =========================================================
     植入的眼睛 —— 崩坏从最小的元素开始
     ========================================================= */
  const POS = ['p-tr', 'p-br', 'p-bl', 'p-l', 'p-r'];
  const implants = [];   // {el, host, opened:false, at:0..1}
  let implantBuilt = false;

  function buildImplants() {
    if (implantBuilt) return;
    implantBuilt = true;
    /* 挑选"应该保持干净"的小元素：按钮、徽章、复选项、小标签 */
    const hosts = $$(
      '.btn, .plan-badge, .eyebrow, .c-btn, .float-tag, .device-title, .brand-mark, ' +
      '.nav-links a, .foot-cols a, .plan li, .card-no, .end-btn, .who b'
    );
    hosts.forEach(function (host, i) {
      if (host.dataset.implantHost) return;
      /* 大按钮给两颗，小的给一颗；间距太密的地方隔一个放 */
      const isBig = host.classList.contains('btn-lg') || host.classList.contains('btn-xl');
      const count = isBig ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const el = document.createElement('span');
        el.className = 'implant ' + POS[(i * 7 + k * 3) % POS.length];
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = '<i></i>';
        host.classList.add('implant-host');
        host.appendChild(el);
        /* 错峰睁开：每个元素有自己的阈值 */
        const at = 0.10 + ((i * 13 + k * 29) % 100) / 100 * 0.42;
        implants.push({ el: el, host: host, opened: false, at: at });
      }
    });
  }

  function updateImplants(x) {
    let eyeX = (mx * 2.2).toFixed(1) + 'px';
    let eyeY = (my * 1.6).toFixed(1) + 'px';
    for (const im of implants) {
      if (!im.opened && x >= im.at) {
        im.opened = true;
        im.el.classList.add('on');
      }
      if (im.opened) {
        im.el.style.setProperty('--ex', eyeX);
        im.el.style.setProperty('--ey', eyeY);
      }
    }
  }

  /* =========================================================
     眼睛跟随
     ========================================================= */
  let mx = 0, my = 0;
  window.addEventListener('mousemove', function (e) {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    mx = clamp(nx, -1, 1);
    my = clamp(ny, -1, 1);
    if (eyeEl && sceneEye) {
      eyeEl.style.setProperty('--px', mx.toFixed(3));
      eyeEl.style.setProperty('--py', my.toFixed(3));
    }
    moveCursor(e.clientX, e.clientY);
  }, { passive: true });

  /* =========================================================
     光标
     ========================================================= */
  const cursorEl = $('#cursor');
  let cx2 = 0, cy2 = 0, tx = 0, ty = 0, cursorRaf = 0;
  function moveCursor(x, y) {
    tx = x; ty = y;
    if (!cursorRaf) cursorRaf = requestAnimationFrame(cursorTick);
  }
  function cursorTick() {
    cx2 += (tx - cx2) * 0.28;
    cy2 += (ty - cy2) * 0.28;
    if (cursorEl) cursorEl.style.transform = 'translate3d(' + cx2.toFixed(1) + 'px,' + cy2.toFixed(1) + 'px,0)';
    if (Math.abs(tx - cx2) > 0.4 || Math.abs(ty - cy2) > 0.4) {
      cursorRaf = requestAnimationFrame(cursorTick);
    } else { cursorRaf = 0; }
  }
  document.addEventListener('mouseover', function (e) {
    const hit = e.target.closest('a, button, .ph, .card, .tile');
    document.body.classList.toggle('cursor-grow', !!hit);
  });

  /* =========================================================
     Toast
     ========================================================= */
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg, dark) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.toggle('dark', !!dark);
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 3400);
  }

  /* =========================================================
     声音
     ========================================================= */
  let AC = null, audioReady = false;
  let masterG = null, droneG = null, noiseG = null, tinG = null, hbTimer = 0;
  let hbLevel = 0;

  function startAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (AC) { AC.resume(); return; }
    try { AC = new Ctx(); } catch (e) { return; }

    masterG = AC.createGain();
    masterG.gain.value = 0.0001;
    masterG.connect(AC.destination);

    /* 低频 drone */
    const lp = AC.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    lp.Q.value = 0.7;
    droneG = AC.createGain();
    droneG.gain.value = 0.0;
    lp.connect(droneG);
    droneG.connect(masterG);

    [51.5, 52.3, 77.1].forEach(function (f, i) {
      const o = AC.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const g = AC.createGain();
      g.gain.value = i === 2 ? 0.24 : 0.62;
      o.connect(g); g.connect(lp);
      o.start();
    });

    /* 噪声 */
    const len = AC.sampleRate * 3;
    const buf = AC.createBuffer(1, len, AC.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = AC.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = AC.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 0.55;
    noiseG = AC.createGain();
    noiseG.gain.value = 0.0;
    src.connect(bp); bp.connect(noiseG); noiseG.connect(masterG);
    src.start();

    /* 耳鸣 */
    const to = AC.createOscillator();
    to.type = 'sine';
    to.frequency.value = 5860;
    tinG = AC.createGain();
    tinG.gain.value = 0.0;
    to.connect(tinG); tinG.connect(masterG);
    to.start();

    hbTimer = setInterval(function () {
      if (!AC || hbLevel < 0.04) return;
      heartbeat(hbLevel);
    }, 1180);

    audioReady = true;
    masterG.gain.setTargetAtTime(0.32, AC.currentTime, 2.2);
  }

  function heartbeat(level) {
    const t0 = AC.currentTime + 0.02;
    [0, 0.31].forEach(function (off, i) {
      const o = AC.createOscillator();
      o.type = 'sine';
      const g = AC.createGain();
      const peak = (i ? 0.16 : 0.3) * level;
      o.frequency.setValueAtTime(78, t0 + off);
      o.frequency.exponentialRampToValueAtTime(34, t0 + off + 0.32);
      g.gain.setValueAtTime(0.0001, t0 + off);
      g.gain.linearRampToValueAtTime(peak, t0 + off + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.42);
      o.connect(g); g.connect(masterG);
      o.start(t0 + off); o.stop(t0 + off + 0.46);
    });
  }

  function audioMix(x, d) {
    if (!AC) return;
    const t = AC.currentTime;
    hbLevel = smooth(0.35, 0.85, x);
    try {
      droneG.gain.setTargetAtTime(0.05 + x * 0.5, t, 0.8);
      noiseG.gain.setTargetAtTime(Math.max(0, x - 0.45) * 0.16, t, 1.0);
      tinG.gain.setTargetAtTime(Math.max(0, x - 0.55) * 0.016, t, 1.2);
      masterG.gain.setTargetAtTime(0.26 + smooth(0.3, 0.9, x) * 0.5, t, 1.2);
    } catch (e) { /* noop */ }
  }

  /* =========================================================
     Cookie
     ========================================================= */
  const cookieEl = $('#cookie');
  const cookieDeny = $('#cookieDeny');
  const cookieOk = $('#cookieOk');
  let denyCount = 0;

  setTimeout(function () {
    if (cookieEl) cookieEl.classList.add('in');
  }, 2200);

  if (cookieDeny) {
    cookieDeny.addEventListener('click', function () {
      denyCount++;
      if (denyCount === 1) {
        cookieDeny.classList.add('dead');
        toast('拒绝失败，请重试。');
      } else if (denyCount === 2) {
        toast('这是唯一的选择。');
        setTimeout(function () { cookieDeny.style.display = 'none'; }, 900);
      } else {
        cookieDeny.style.display = 'none';
      }
    });
  }

  if (cookieOk) {
    cookieOk.addEventListener('click', function () {
      cookieEl.classList.add('out');
      startAudio();
      toast('偏好已保存。');
    });
  }

  /* 任何点击都尝试解锁音频 */
  document.addEventListener('pointerdown', function () {
    if (!audioReady && !AC) startAudio();
    else if (AC && AC.state === 'suspended') AC.resume();
  }, { passive: true });

  /* =========================================================
     交互小彩蛋
     ========================================================= */
  const bigCta = $('#bigCta');
  if (bigCta) {
    bigCta.addEventListener('click', function (e) {
      e.preventDefault();
      toast('备份已开始。请不要关闭这个页面。');
      bigCta.textContent = '正在备份…';
      setTimeout(function () { bigCta.textContent = '备份中 · 99.98%'; }, 1600);
    });
  }

  const endBtn = $('#endBtn');
  if (endBtn) {
    endBtn.addEventListener('click', function () {
      endBtn.textContent = '关闭失败';
      toast('无法关闭。', true);
      setTimeout(function () { endBtn.textContent = '关闭'; }, 2400);
    });
  }

  const endSub = $('#endSub');
  if (endSub && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) {
          setTimeout(function () { endSub.classList.add('on'); }, 1400);
        }
      });
    }, { threshold: 0.4 });
    io.observe($('#end'));
  }

  /* =========================================================
     启动
     ========================================================= */
  function start() {
    measure();
    sizeFace();

    /* 绘制首屏照片 */
    const heroFigs = $$('#heroPhotos .ph');
    heroFigs.forEach(function (f, i) { paintPhoto(f, i); });

    /* 延迟绘制墙体 */
    buildWall();
    setTimeout(paintTilesLazy, 900);
    initMuts();

    /* 进度条 */
    if (heroMeter) {
      requestAnimationFrame(function () {
        setTimeout(function () { heroMeter.style.width = '99.98%'; }, 500);
      });
    }

    tick();
    window.scrollTo(0, 0);

    /* 关键：字体加载完成后重新测量，否则 seepTop 严重偏小 */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        measure();
        initMuts();
        tick();
        setTimeout(function () { measure(); initMuts(); tick(); }, 500);
      });
    }
    window.addEventListener('load', function () {
      measure(); initMuts(); tick();
      setTimeout(function () { measure(); initMuts(); tick(); }, 300);
    });

    /* 隐藏调试：
       ?y=像素 | ?y=42%
       ?at=<选择器>&p=0..1  —— 把某个场景滚到指定进度 */
    const qs = new URLSearchParams(location.search);
    const qy = qs.get('y');
    const qat = qs.get('at');
    if (qy !== null || qat !== null) {
      document.documentElement.style.scrollBehavior = 'auto';
      setTimeout(function () {
        measure();
        const maxY = document.documentElement.scrollHeight - vh;
        let yy;
        if (qat) {
          const el = document.querySelector(qat);
          if (el) {
            const top = el.getBoundingClientRect().top + window.scrollY;
            const span = Math.max(1, el.offsetHeight - vh);
            yy = top + span * parseFloat(qs.get('p') || '0');
          }
        } else {
          yy = qy.indexOf('%') > -1 ? maxY * parseFloat(qy) / 100 : parseFloat(qy);
        }
        window.scrollTo(0, clamp(yy || 0, 0, maxY));
        tick();
      }, 700);
    }
    if (qs.get('dbg') !== null) {
      setTimeout(function () {
        const secs = $$('main > section, main > footer');
        const info = secs.map(function (s) {
          const r = s.getBoundingClientRect();
          return (s.className || s.tagName).slice(0, 14) + ':' + Math.round(r.top) + '/' + Math.round(r.height);
        }).join(' | ');
        document.title = 'SY=' + Math.round(window.scrollY) + ' VH=' + vh +
          ' SH=' + document.documentElement.scrollHeight +
          ' ST=' + Math.round(seepTop) + ' ' + info;
      }, 1400);
    }
  }

  let rt = 0;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { measure(); sizeFace(); tick(); }, 160);
  });
  window.addEventListener('scroll', onScroll, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
