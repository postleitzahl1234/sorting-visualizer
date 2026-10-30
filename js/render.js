/* =====================================================================
 * render.js – draws one lane onto its canvas.
 * Small arrays are drawn element by element; large arrays are drawn
 * per pixel column (bars/spectrum) or straight into an ImageData pixel
 * buffer (dots, disc, disparity), so 16k elements stay smooth.
 *
 * Highlight states per element: 0 none, 1 compare, 2 write/swap,
 * 3 read, 4 marker, 5 verified, 6 out of order
 * ===================================================================== */
(function (global) {
  'use strict';
  const SV = global.SortViz;
  const INF = SV.INF;
  const RANK = [0, 5, 6, 4, 3, 1, 2];       // priority when several elements share a pixel

  const C = { hl: [], hl32: [] };

  // ---- colour helpers ----------------------------------------------------
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function rgba(css) {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = '#000';
    probe.fillStyle = css;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }
  const u32 = (c) => ((c[3] << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
  function blend(a, b, t) { return [0, 1, 2].map((i) => Math.round(a[i] * (1 - t) + b[i] * t)).concat(255); }

  function refreshTheme() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name) => cs.getPropertyValue(name).trim();
    C.bg = v('--cv-bg'); C.base = v('--cv-base'); C.text = v('--cv-text'); C.muted = v('--cv-muted');
    C.auxBg = v('--cv-aux-bg'); C.range = v('--cv-range'); C.rangeEdge = v('--cv-range-edge'); C.rim = v('--cv-rim');
    C.flash = v('--cv-flash');
    C.hl = [null, v('--hl-cmp'), v('--hl-write'), v('--hl-read'), v('--hl-mark'), v('--hl-ok'), v('--hl-bad')];
    const bg = rgba(C.bg);
    C.bg32 = u32(bg);
    C.base32 = u32(rgba(C.base));
    C.flash32 = u32(rgba(C.flash));
    C.range32 = u32(blend(bg, rgba(v('--cv-range-solid')), 0.22));
    C.hl32 = C.hl.map((c) => (c ? u32(rgba(c)) : 0));
  }

  const VIRIDIS = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];
  /** Colours for 0…count-1. cb = colour-blind friendly (viridis) instead of a hue wheel. */
  function buildPalette(count, cb) {
    const css = new Array(count), p32 = new Uint32Array(count);
    const stops = cb ? VIRIDIS.map(rgba) : null;
    for (let i = 0; i < count; i++) {
      const f = count > 1 ? i / (count - 1) : 0;
      let c;
      if (cb) {
        const x = f * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(x));
        c = blend(stops[k], stops[k + 1], x - k);
      } else {
        c = hsl2rgb(f * 330, 0.8, 0.6);
      }
      css[i] = `rgb(${c[0]},${c[1]},${c[2]})`;
      p32[i] = u32(c);
    }
    return { css, u32: p32 };
  }
  function hsl2rgb(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255), 255];
  }

  // ---- value helpers -------------------------------------------------------
  const keyOf = (v, env) => (env.keyDiv === 1 ? v : Math.floor(v / env.keyDiv));
  function valueColor(v, env, forceColour) {
    if (env.idPalette) return env.idPalette.css[v % env.keyDiv];
    if (env.rainbow || forceColour) return env.palette.css[Math.min(env.palette.css.length - 1, Math.max(0, keyOf(v, env)))];
    return C.base;
  }
  function valueColor32(v, env, forceColour) {
    if (env.idPalette) return env.idPalette.u32[v % env.keyDiv];
    if (env.rainbow || forceColour) return env.palette.u32[Math.min(env.palette.u32.length - 1, Math.max(0, keyOf(v, env)))];
    return C.base32;
  }

  // ---- layout -----------------------------------------------------------------
  function layout(L, env) {
    const d = L.dpr, W = L.canvas.width, H = L.canvas.height, tr = L.trace;
    const pad = Math.round(8 * d);
    const x = pad, w = W - 2 * pad;
    let bottom = H - pad;
    const aux = [];
    const circ = env.view === 'disc' || env.view === 'disparity';
    if (env.showAux && tr && tr.auxDefs.length) {
      const sh = Math.max(Math.round(20 * d), Math.min(Math.round(64 * d), Math.round(H * 0.15)));
      for (let t = tr.auxDefs.length - 1; t >= 0; t--) {
        aux[t] = { x, y: bottom - sh, w, h: sh };
        bottom -= sh + Math.round(6 * d);
      }
    }
    let band = null;
    if (env.showRanges && !circ && tr && tr.maxDepth > 0) {
      const rows = Math.min(tr.maxDepth, 12), rh = Math.max(2, Math.round(3 * d));
      const bh = rows * rh + Math.round(2 * d);
      band = { x, y: bottom - bh, w, h: bh, rows, rh };
      bottom -= bh + Math.round(5 * d);
    }
    const main = { x, y: pad, w, h: Math.max(10, bottom - pad) };
    return { main, band, aux, circ };
  }

  // ---- main entry ---------------------------------------------------------------
  function draw(L, env) {
    const cv = L.canvas, ctx = L.ctx;
    if (cv.width < 8 || cv.height < 8 || !L.arr) return;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, cv.width, cv.height);
    const lay = layout(L, env);
    L.lay = lay;
    if (lay.circ) drawCircular(L, env, lay.main); else drawLinear(L, env, lay.main);
    if (lay.band) drawBand(L, env, lay.band);
    lay.aux.forEach((r, t) => { if (r) drawAux(L, env, t, r); });
  }

  function topRange(L, env) {
    if (!env.showRanges || !L.stack || !L.stack.length) return null;
    return L.stack[L.stack.length - 1];
  }

  // ---- linear views ------------------------------------------------------------------
  function drawLinear(L, env, R) {
    const ctx = L.ctx, d = L.dpr, n = env.n, a = L.arr, s = L.hs;
    const maxKey = env.maxKey, view = env.view;
    const bw = R.w / n;
    const range = topRange(L, env);
    if (range) {
      const x0 = R.x + Math.floor(range[0] * bw), x1 = R.x + Math.floor((range[1] + 1) * bw);
      ctx.fillStyle = C.range;
      ctx.fillRect(x0, R.y, Math.max(1, x1 - x0), R.h);
      ctx.fillStyle = C.rangeEdge;
      ctx.fillRect(x0, R.y, Math.max(1, Math.round(d)), R.h);
      ctx.fillRect(Math.max(x0, x1 - Math.round(d)), R.y, Math.max(1, Math.round(d)), R.h);
    }
    const colour = view === 'spectrum';
    if (view === 'dots' && n > R.w) { drawDotsPixel(L, env, R, range); return; }

    if (n <= R.w) {
      // one element at a time
      const gap = !colour && bw >= 4 * d ? Math.max(1, Math.round(bw * 0.2)) : 0;
      const r = Math.max(1.3 * d, Math.min(bw * 0.42, 4.5 * d));
      let last = null;
      for (let i = 0; i < n; i++) {
        const v = a[i];
        if (v <= 0 || v >= INF) continue;
        const st = s[i];
        const k = keyOf(v, env);
        const x0 = R.x + Math.floor(i * bw), x1 = R.x + Math.floor((i + 1) * bw);
        let col;
        if (colour) col = st >= 1 && st <= 3 ? C.flash : st === 4 ? C.hl[4] : valueColor(v, env, true);
        else col = st ? C.hl[st] : valueColor(v, env, false);
        if (col !== last) { ctx.fillStyle = col; last = col; }
        if (view === 'bars') {
          const h = Math.max(1, Math.round((k / maxKey) * R.h));
          ctx.fillRect(x0, R.y + R.h - h, Math.max(1, x1 - x0 - gap), h);
        } else if (view === 'dots') {
          const cy = R.y + R.h - (k / maxKey) * R.h;
          ctx.beginPath();
          ctx.arc(R.x + (i + 0.5) * bw, cy, st && st < 5 ? r * 1.8 : r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(x0, R.y, Math.max(1, x1 - x0), R.h);
          if (st >= 5) { ctx.fillStyle = C.hl[st]; last = null; ctx.fillRect(x0, R.y + R.h - Math.round(5 * d), Math.max(1, x1 - x0), Math.round(5 * d)); }
        }
      }
      if (L.quizSel && L.quizSel.size) {
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 2 * d;
        for (const i of L.quizSel) {
          const x0 = R.x + Math.floor(i * bw), x1 = R.x + Math.floor((i + 1) * bw);
          ctx.strokeRect(x0 + d, R.y + d, Math.max(2, x1 - x0 - 2 * d), R.h - 2 * d);
        }
      }
      return;
    }

    // more elements than pixel columns: one representative per column
    const W = Math.floor(R.w);
    let last = null;
    for (let col = 0; col < W; col++) {
      const i0 = Math.floor((col * n) / W), i1 = Math.max(i0 + 1, Math.floor(((col + 1) * n) / W));
      let best = -1, bestRank = -1, tall = -1, tallKey = -1;
      for (let i = i0; i < i1; i++) {
        const v = a[i];
        if (v <= 0 || v >= INF) continue;
        const rk = RANK[s[i]];
        if (rk > bestRank) { bestRank = rk; best = i; }
        const k = keyOf(v, env);
        if (k > tallKey) { tallKey = k; tall = i; }
      }
      if (tall < 0) continue;
      const pick = bestRank > 0 ? best : (colour ? i0 : tall);
      const st = bestRank > 0 ? s[best] : 0;
      const v = a[pick] > 0 ? a[pick] : a[tall];
      let c;
      if (colour) c = st >= 1 && st <= 3 ? C.flash : st === 4 ? C.hl[4] : valueColor(v, env, true);
      else c = st ? C.hl[st] : valueColor(v, env, false);
      if (c !== last) { ctx.fillStyle = c; last = c; }
      if (colour) {
        ctx.fillRect(R.x + col, R.y, 1, R.h);
        if (st >= 5) { ctx.fillStyle = C.hl[st]; last = null; ctx.fillRect(R.x + col, R.y + R.h - Math.round(5 * d), 1, Math.round(5 * d)); }
      } else {
        const h = Math.max(1, Math.round((tallKey / maxKey) * R.h));
        ctx.fillRect(R.x + col, R.y + R.h - h, 1, h);
      }
    }
  }

  function getImage(L, key, w, h) {
    L._img = L._img || {};
    let c = L._img[key];
    if (!c || c.img.width !== w || c.img.height !== h) {
      const img = L.ctx.createImageData(w, h);
      c = { img, buf: new Uint32Array(img.data.buffer) };
      L._img[key] = c;
    }
    return c;
  }

  function drawDotsPixel(L, env, R, range) {
    const w = Math.max(1, Math.floor(R.w)), h = Math.max(1, Math.floor(R.h));
    const { img, buf } = getImage(L, 'dots', w, h);
    buf.fill(C.bg32);
    const n = env.n, a = L.arr, s = L.hs;
    if (range) {
      const x0 = Math.floor((range[0] * w) / n), x1 = Math.floor(((range[1] + 1) * w) / n);
      for (let y = 0; y < h; y++) buf.fill(C.range32, y * w + x0, y * w + Math.max(x0 + 1, x1));
    }
    for (let i = 0; i < n; i++) {
      const v = a[i];
      if (v <= 0 || v >= INF) continue;
      const x = Math.min(w - 1, Math.floor((i * w) / n));
      const y = Math.min(h - 1, Math.max(0, Math.round((1 - keyOf(v, env) / env.maxKey) * (h - 1))));
      const st = s[i];
      const c = st ? C.hl32[st] : valueColor32(v, env, false);
      const r = st && st < 5 ? 2 : 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) buf[yy * w + xx] = c; }
      }
    }
    L.ctx.putImageData(img, Math.round(R.x), Math.round(R.y));
  }

  // ---- call-stack band --------------------------------------------------------------
  function drawBand(L, env, B) {
    const ctx = L.ctx, n = env.n, st = L.stack || [];
    const depth = st.length;
    if (!depth) return;
    const first = Math.max(0, depth - B.rows);
    for (let lvl = first; lvl < depth; lvl++) {
      const [lo, hi] = st[lvl];
      const row = lvl - first;
      const x0 = B.x + Math.floor((lo * B.w) / n), x1 = B.x + Math.floor(((hi + 1) * B.w) / n);
      ctx.fillStyle = lvl === depth - 1 ? C.rangeEdge : C.muted;
      ctx.fillRect(x0, B.y + row * B.rh, Math.max(1, x1 - x0), Math.max(1, B.rh - 1));
    }
  }

  // ---- helper arrays -------------------------------------------------------------------
  function drawAux(L, env, t, R) {
    const ctx = L.ctx, d = L.dpr, tr = L.trace;
    const def = tr.auxDefs[t], A = L.aux[t], hs = L.auxHs[t];
    if (!A) return;
    const size = A.length;
    ctx.fillStyle = C.auxBg;
    ctx.fillRect(R.x, R.y, R.w, R.h);
    const counts = def.kind === 'counts';
    const scale = counts ? Math.max(1, tr.auxMax[t]) : env.maxKey;
    const labelH = Math.round(12 * d);
    const top = R.y + labelH, h = R.h - labelH - Math.round(2 * d);
    const heightOf = (v) => (counts ? v : keyOf(v, env)) / scale;
    if (size <= R.w) {
      const bw = R.w / size, gap = bw >= 5 * d ? Math.max(1, Math.round(bw * 0.18)) : 0;
      for (let i = 0; i < size; i++) {
        const v = A[i];
        const st = hs[i];
        if ((v <= 0 || v >= INF) && !st) continue;
        const x0 = R.x + Math.floor(i * bw), x1 = R.x + Math.floor((i + 1) * bw);
        const bh = v > 0 && v < INF ? Math.max(1, Math.round(Math.min(1, heightOf(v)) * h)) : Math.round(3 * d);
        ctx.fillStyle = st ? C.hl[st] : (counts ? C.base : valueColor(v, env, false));
        ctx.fillRect(x0, top + h - bh, Math.max(1, x1 - x0 - gap), bh);
      }
    } else {
      const W = Math.floor(R.w);
      for (let col = 0; col < W; col++) {
        const i0 = Math.floor((col * size) / W), i1 = Math.max(i0 + 1, Math.floor(((col + 1) * size) / W));
        let tallH = -1, tall = -1, best = -1, bestRank = 0;
        for (let i = i0; i < i1; i++) {
          const v = A[i];
          if (RANK[hs[i]] > bestRank) { bestRank = RANK[hs[i]]; best = i; }
          if (v > 0 && v < INF) { const hh = heightOf(v); if (hh > tallH) { tallH = hh; tall = i; } }
        }
        if (tall < 0 && best < 0) continue;
        const bh = tall >= 0 ? Math.max(1, Math.round(Math.min(1, tallH) * h)) : Math.round(3 * d);
        ctx.fillStyle = best >= 0 ? C.hl[hs[best]] : (counts ? C.base : valueColor(A[tall], env, false));
        ctx.fillRect(R.x + col, top + h - bh, 1, bh);
      }
    }
    ctx.fillStyle = C.muted;
    ctx.font = `${Math.round(10.5 * d)}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(env.auxLabel(def.label) + (counts ? '' : ` [${size}]`), R.x + Math.round(4 * d), R.y + Math.round(1.5 * d));
  }

  // ---- circular views --------------------------------------------------------------------
  function drawCircular(L, env, R) {
    const ctx = L.ctx, d = L.dpr, n = env.n;
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    const rad = Math.max(8, Math.min(R.w, R.h) / 2 - 12 * d);
    const step = (Math.PI * 2) / n;
    if (env.view === 'disc') {
      if (n <= 720) drawDiscVector(L, env, cx, cy, rad, step);
      else drawDiscPixel(L, env, R, cx, cy, rad);
    } else {
      ctx.strokeStyle = C.rim;
      ctx.lineWidth = d;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
      if (n <= 1500) drawDisparityVector(L, env, cx, cy, rad, step);
      else drawDisparityPixel(L, env, R, cx, cy, rad);
    }
    const range = topRange(L, env);
    if (range) {
      ctx.strokeStyle = C.rangeEdge;
      ctx.lineWidth = 3 * d;
      ctx.beginPath();
      ctx.arc(cx, cy, rad + 5 * d, -Math.PI / 2 + range[0] * step, -Math.PI / 2 + (range[1] + 1) * step);
      ctx.stroke();
    }
    if (L.sweep >= 0) {
      const m = Math.min(n, Math.floor(L.sweep));
      ctx.strokeStyle = C.hl[5];
      ctx.lineWidth = 3 * d;
      ctx.beginPath();
      ctx.arc(cx, cy, rad + 9 * d, -Math.PI / 2, -Math.PI / 2 + m * step);
      ctx.stroke();
    }
  }

  function discColour(L, env, i) {
    const st = L.hs[i];
    if (st >= 1 && st <= 3) return C.flash;
    if (st === 4) return C.hl[4];
    return valueColor(L.arr[i], env, true);
  }

  function drawDiscVector(L, env, cx, cy, rad, step) {
    const ctx = L.ctx, n = env.n;
    const overlap = n > 64 ? 0.012 : 0.004;
    for (let i = 0; i < n; i++) {
      const v = L.arr[i];
      if (v <= 0 || v >= INF) continue;
      ctx.fillStyle = discColour(L, env, i);
      const a0 = -Math.PI / 2 + i * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rad, a0, a0 + step + overlap);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawDiscPixel(L, env, R, cx, cy, rad) {
    const w = Math.max(1, Math.floor(R.w)), h = Math.max(1, Math.floor(R.h)), n = env.n;
    const { img, buf } = getImage(L, 'disc', w, h);
    const key = `${w}x${h}x${n}x${Math.round(rad)}`;
    if (!L._discMap || L._discKey !== key) {
      const map = new Int32Array(w * h).fill(-1);
      const ox = cx - R.x, oy = cy - R.y, r2 = rad * rad;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x + 0.5 - ox, dy = y + 0.5 - oy;
          if (dx * dx + dy * dy > r2) continue;
          let ang = Math.atan2(dy, dx) + Math.PI / 2;
          if (ang < 0) ang += Math.PI * 2;
          map[y * w + x] = Math.min(n - 1, Math.floor((ang / (Math.PI * 2)) * n));
        }
      }
      L._discMap = map; L._discKey = key;
    }
    const map = L._discMap, a = L.arr, s = L.hs;
    const colOf = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const v = a[i], st = s[i];
      colOf[i] = v <= 0 || v >= INF ? C.bg32 : st >= 1 && st <= 3 ? C.flash32 : st === 4 ? C.hl32[4] : valueColor32(v, env, true);
    }
    for (let p = 0; p < map.length; p++) { const i = map[p]; buf[p] = i < 0 ? C.bg32 : colOf[i]; }
    L.ctx.putImageData(img, Math.round(R.x), Math.round(R.y));
  }

  function disparityPos(L, env, i, cx, cy, rad, step) {
    const v = L.arr[i];
    const dist = Math.abs(env.target[Math.min(env.target.length - 1, keyOf(v, env))] - i);
    const r = rad * Math.max(0.03, 1 - dist / (env.n * 0.5));
    const ang = -Math.PI / 2 + (i + 0.5) * step;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  }

  function drawDisparityVector(L, env, cx, cy, rad, step) {
    const ctx = L.ctx, d = L.dpr, n = env.n, s = L.hs;
    const rd = Math.max(1.4 * d, Math.min(4.5 * d, rad * step * 0.45));
    for (let i = 0; i < n; i++) {
      const v = L.arr[i];
      if (v <= 0 || v >= INF) continue;
      const st = s[i];
      const [x, y] = disparityPos(L, env, i, cx, cy, rad, step);
      ctx.fillStyle = st ? C.hl[st] : valueColor(v, env, true);
      ctx.beginPath();
      ctx.arc(x, y, st && st < 5 ? rd * 1.8 : rd, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDisparityPixel(L, env, R, cx, cy, rad) {
    const w = Math.max(1, Math.floor(R.w)), h = Math.max(1, Math.floor(R.h)), n = env.n, s = L.hs;
    const { img, buf } = getImage(L, 'disp', w, h);
    buf.fill(C.bg32);
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const v = L.arr[i];
      if (v <= 0 || v >= INF) continue;
      const [x, y] = disparityPos(L, env, i, cx - R.x, cy - R.y, rad, step);
      const st = s[i];
      const c = st ? C.hl32[st] : valueColor32(v, env, true);
      const r = st && st < 5 ? 2 : 1;
      const xi = Math.round(x), yi = Math.round(y);
      for (let dy = -r + 1; dy < r; dy++) for (let dx = -r + 1; dx < r; dx++) {
        const xx = xi + dx, yy = yi + dy;
        if (xx >= 0 && xx < w && yy >= 0 && yy < h) buf[yy * w + xx] = c;
      }
    }
    L.ctx.putImageData(img, Math.round(R.x), Math.round(R.y));
  }

  // ---- hit testing (quiz clicks, drawing mode) --------------------------------------------
  function indexAt(L, env, px) {
    const R = L.lay && L.lay.main;
    if (!R) return -1;
    const i = Math.floor(((px - R.x) / R.w) * env.n);
    return i < 0 || i >= env.n ? -1 : i;
  }
  function keyAt(L, env, py) {
    const R = L.lay && L.lay.main;
    if (!R) return 1;
    const f = (R.y + R.h - py) / R.h;
    return Math.max(1, Math.min(env.maxKey, Math.round(f * env.maxKey)));
  }

  global.SortViz.Render = { refreshTheme, buildPalette, draw, indexAt, keyAt, colors: C };
})(window);
