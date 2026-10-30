/* =====================================================================
 * analysis.js – growth chart: operation counts vs. array size, log-log.
 * The slope of a line in a log-log chart is the exponent of its growth:
 * n² → slope 2, n log n → slope a bit above 1.
 * ===================================================================== */
(function (global) {
  'use strict';
  const SV = global.SortViz;
  const MAX_SERIES = 8;
  const METRICS = ['steps', 'cmp', 'swaps', 'writes', 'reads', 'aux', 'cost'];
  const INPUTS = ['shuffled', 'dups', 'nearly', 'reversed', 'few', 'organ', 'sawtooth', 'sorted', 'stability', 'killer'];
  const PRESETS = {
    nlogn: ['merge', 'heap', 'quickhoare', 'tim', 'pdq', 'shell'],
    quadratic: ['bubble', 'insertion', 'selection', 'cocktail', 'gnome', 'cycle'],
  };

  let App = null;
  const A = {
    selected: new Set(), result: null, job: null, sizes: [], shown: false, hoverIdx: -1,
    metric: 'cmp', input: 'shuffled', maxN: 1024, trials: 3,

    init(app) {
      App = app;
      SV.I18N.onChange(() => this.build());
      this.build();
    },

    root() { return document.getElementById('analysisRoot'); },

    onShow() {
      if (!this.shown) {
        this.shown = true;
        if (!this.selected.size) this.defaultSelection();
        this.build();
        this.run();
      } else this.draw();
    },

    defaultSelection() {
      const ids = App.lanes.map((l) => l.algoId).filter((id) => id !== 'custom');
      for (const id of ids.concat(['bubble', 'insertion', 'merge', 'quickhoare', 'heap'])) {
        if (this.selected.size >= 5) break;
        this.selected.add(id);
      }
    },

    build() {
      const el = this.root();
      if (!el || !App) return;
      const t = App.t, esc = App.esc;
      const groups = SV.CATEGORIES.map((cat) => {
        const items = SV.INFO.filter((i) => i.cat === cat).map((i) =>
          `<label class="an-check"><input type="checkbox" value="${i.id}" ${this.selected.has(i.id) ? 'checked' : ''}> ${esc(App.algoName(i.id))}</label>`).join('');
        return `<div class="an-group"><div class="an-cat">${esc(t('cat.' + cat))}</div>${items}</div>`;
      }).join('');
      const custom = App.state.customCode
        ? `<div class="an-group"><div class="an-cat">${esc(t('cat.custom'))}</div><label class="an-check"><input type="checkbox" value="custom" ${this.selected.has('custom') ? 'checked' : ''}> ${esc(t('custom.name'))}</label></div>` : '';
      const opt = (arr, cur, lab) => arr.map((v) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(lab(v))}</option>`).join('');
      el.innerHTML = `
        <div class="an-grid">
          <div class="an-side">
            <div class="an-side-head"><b>${esc(t('an.algos'))}</b> <span class="muted small">${esc(t('an.max', { n: MAX_SERIES }))}</span></div>
            <div class="presets">
              <button class="chip" data-pre="lanes">${esc(t('an.pre.lanes'))}</button>
              <button class="chip" data-pre="nlogn">n log n</button>
              <button class="chip" data-pre="quadratic">n²</button>
              <button class="chip" data-pre="none">${esc(t('an.pre.none'))}</button>
            </div>
            <div class="an-list">${groups}${custom}</div>
          </div>
          <div class="an-main">
            <div class="an-controls">
              <label>${esc(t('an.metric'))} <select id="anMetric">${opt(METRICS, this.metric, (m) => t('an.m.' + m))}</select></label>
              <label>${esc(t('array.input'))} <select id="anInput">${opt(INPUTS, this.input, (m) => t('input.' + m))}</select></label>
              <label>${esc(t('an.maxN'))} <select id="anMaxN">${opt([256, 1024, 4096, 16384], this.maxN, (v) => App.fmt(v))}</select></label>
              <label>${esc(t('an.trials'))} <select id="anTrials">${opt([1, 3, 5], this.trials, String)}</select></label>
              <button class="btn primary" id="anRun">▶ ${esc(t('an.run'))}</button>
              <button class="btn" id="anCancel" hidden>${esc(t('an.cancel'))}</button>
              <div class="an-progress" id="anProgress" hidden><div></div></div>
            </div>
            <div class="an-chart" id="anChart"><canvas id="anCanvas" aria-label="${esc(t('an.chartLabel'))}"></canvas><div class="an-tip" id="anTip" hidden></div></div>
            <ul class="an-legend" id="anLegend"></ul>
            <p class="muted small">${esc(t('an.hint'))}</p>
            <details class="an-table"><summary>${esc(t('an.table'))}</summary><div class="table-wrap" id="anTable"></div></details>
          </div>
        </div>`;
      el.querySelectorAll('.an-check input').forEach((cb) => cb.addEventListener('change', () => {
        if (cb.checked) { if (this.selected.size >= MAX_SERIES) { cb.checked = false; App.toast(t('an.maxReached', { n: MAX_SERIES })); return; } this.selected.add(cb.value); }
        else this.selected.delete(cb.value);
      }));
      el.querySelectorAll('[data-pre]').forEach((b) => b.addEventListener('click', () => {
        const p = b.dataset.pre;
        this.selected.clear();
        if (p === 'lanes') App.lanes.forEach((l) => this.selected.add(l.algoId));
        else if (PRESETS[p]) PRESETS[p].forEach((id) => this.selected.add(id));
        this.build();
      }));
      el.querySelector('#anMetric').addEventListener('change', (e) => { this.metric = e.target.value; this.draw(); });
      el.querySelector('#anInput').addEventListener('change', (e) => { this.input = e.target.value; });
      el.querySelector('#anMaxN').addEventListener('change', (e) => { this.maxN = +e.target.value; });
      el.querySelector('#anTrials').addEventListener('change', (e) => { this.trials = +e.target.value; });
      el.querySelector('#anRun').addEventListener('click', () => this.run());
      el.querySelector('#anCancel').addEventListener('click', () => this.cancel());
      const cv = el.querySelector('#anCanvas');
      cv.addEventListener('pointermove', (e) => this.hover(e));
      cv.addEventListener('pointerleave', () => { this.hoverIdx = -1; this.draw(); });
      if (!this._ro) {
        this._ro = new ResizeObserver(() => this.draw());
      }
      this._ro.disconnect();
      this._ro.observe(el.querySelector('#anChart'));
      this.draw();
    },

    run() {
      if (this.job) this.cancel();
      const ids = [...this.selected];
      if (!ids.length) { App.toast(App.t('an.empty')); return; }
      const sizes = [];
      for (let n = 16; n <= this.maxN; n *= 2) sizes.push(n);
      this.sizes = sizes;
      const el = this.root();
      const prog = el.querySelector('#anProgress');
      prog.hidden = false;
      prog.firstElementChild.style.width = '0%';
      el.querySelector('#anCancel').hidden = false;
      el.querySelector('#anRun').disabled = true;
      const job = {
        algos: ids, sizes, input: this.input, trials: this.trials, seed: 12345,
        capOps: 20000000, timeBudgetMs: 2500,
        customCode: ids.includes('custom') ? (App.state.customInstrumented || App.state.customCode) : null,
      };
      this.job = SV.Recorder.analyze(job, (p) => { prog.firstElementChild.style.width = `${Math.round(p * 100)}%`; });
      const my = this.job;
      my.promise.then((res) => {
        if (my !== this.job) return;
        this.result = { ids, sizes, data: res };
        this.finish();
      }).catch((e) => {
        if (my !== this.job) return;
        App.toast(e.message);
        this.finish();
      });
    },

    cancel() { if (this.job) { this.job.cancel(); this.job = null; } this.finish(); },

    finish() {
      this.job = null;
      const el = this.root();
      if (!el) return;
      el.querySelector('#anProgress').hidden = true;
      el.querySelector('#anCancel').hidden = true;
      el.querySelector('#anRun').disabled = false;
      this.draw();
    },

    value(pt) {
      if (!pt || pt.capped) return null;
      switch (this.metric) {
        case 'steps': return pt.steps;
        case 'cmp': return pt.cmp;
        case 'swaps': return pt.swaps;
        case 'writes': return pt.writes;
        case 'reads': return pt.reads;
        case 'aux': return pt.aux;
        case 'cost': { const w = App.state.weights; return pt.cls.reduce((s, c, i) => s + c * w[i], 0); }
      }
      return null;
    },

    series() {
      if (!this.result) return [];
      const colors = seriesColors();
      return this.result.ids.map((id, k) => {
        const pts = this.result.data[id] || [];
        const vals = this.result.sizes.map((n, i) => ({ n, v: this.value(pts[i]), capped: pts[i] && pts[i].capped }));
        const valid = vals.filter((p) => p.v > 0);
        let exp = null;
        const tail = valid.slice(-3);
        if (tail.length >= 2) {
          const xs = tail.map((p) => Math.log(p.n)), ys = tail.map((p) => Math.log(p.v));
          const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
          let num = 0, den = 0;
          xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
          exp = den ? num / den : null;
        }
        const capAt = vals.find((p) => p.capped);
        const allZero = vals.some((p) => p.v === 0) && !valid.length;
        return { id, color: colors[k % colors.length], vals, valid, exp, capAt: capAt ? capAt.n : null, allZero };
      });
    },

    draw() {
      const el = this.root();
      if (!el) return;
      const cv = el.querySelector('#anCanvas');
      if (!cv) return;
      const box = cv.parentElement.getBoundingClientRect();
      if (box.width < 50) return;
      const dpr = window.devicePixelRatio || 1;
      const W = Math.round(box.width * dpr), H = Math.round(box.height * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const ctx = cv.getContext('2d');
      const cs = getComputedStyle(document.documentElement);
      const col = (n) => cs.getPropertyValue(n).trim();
      const surface = col('--panel'), text = col('--text'), muted = col('--muted'), grid = col('--grid');
      ctx.fillStyle = surface;
      ctx.fillRect(0, 0, W, H);
      const t = App.t;
      const S = this.series();
      this.renderLegend(S);
      this.renderTable(S);
      const all = S.flatMap((s) => s.valid.map((p) => p.v));
      ctx.font = `${12 * dpr}px system-ui, sans-serif`;
      if (!all.length) {
        ctx.fillStyle = muted;
        ctx.textAlign = 'center';
        ctx.fillText(this.job ? t('an.running') : t('an.empty'), W / 2, H / 2);
        this.geom = null;
        return;
      }
      const sizes = this.result.sizes;
      const padL = 64 * dpr, padR = (S.length <= 4 ? 150 : 56) * dpr, padT = 16 * dpr, padB = 42 * dpr;
      const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
      const lx0 = Math.log2(sizes[0]), lx1 = Math.log2(sizes[sizes.length - 1]);
      let ly0 = Math.log10(Math.min(...all)), ly1 = Math.log10(Math.max(...all));
      ly0 = Math.floor(ly0); ly1 = Math.ceil(ly1);
      if (ly1 === ly0) ly1 = ly0 + 1;
      const X = (n) => x0 + ((Math.log2(n) - lx0) / Math.max(1e-9, lx1 - lx0)) * (x1 - x0);
      const Y = (v) => y1 - ((Math.log10(v) - ly0) / (ly1 - ly0)) * (y1 - y0);
      this.geom = { X, Y, x0, x1, y0, y1, dpr, sizes };

      // grid + axes
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1 * dpr;
      ctx.fillStyle = muted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let e = ly0; e <= ly1; e++) {
        const y = Y(Math.pow(10, e));
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.fillText(compact(Math.pow(10, e)), x0 - 8 * dpr, y);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      sizes.forEach((n, i) => {
        const x = X(n);
        if (i % (sizes.length > 8 ? 2 : 1) === 0) ctx.fillText(n >= 1024 ? `${n / 1024}k` : String(n), x, y1 + 6 * dpr);
        ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y1 + 4 * dpr); ctx.stroke();
      });
      ctx.fillText(t('an.xlabel'), (x0 + x1) / 2, y1 + 24 * dpr);
      ctx.save();
      ctx.translate(14 * dpr, (y0 + y1) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle';
      ctx.fillText(t('an.ylabel', { m: t('an.m.' + this.metric) }), 0, 0);
      ctx.restore();

      // reference guides (dashed): n log n and n², through a common start point
      const firsts = S.map((s) => s.valid[0]).filter(Boolean).filter((p) => p.n === sizes[0]).map((p) => p.v);
      if (firsts.length) {
        const ref = Math.exp(firsts.reduce((a, b) => a + Math.log(b), 0) / firsts.length);
        const n0 = sizes[0], nEnd = sizes[sizes.length - 1];
        const guides = [
          ['n log n', (n) => ref * (n * Math.log2(n)) / (n0 * Math.log2(n0))],
          ['n²', (n) => ref * (n * n) / (n0 * n0)],
        ];
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.strokeStyle = muted;
        ctx.lineWidth = 1 * dpr;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        for (const [label, f] of guides) {
          ctx.beginPath();
          let started = false, lastX = 0, lastY = 0;
          for (let lg = Math.log2(n0); lg <= Math.log2(nEnd) + 1e-9; lg += 0.25) {
            const n = Math.pow(2, lg), v = f(n);
            if (Math.log10(v) > ly1) break;
            const x = X(n), y = Y(v);
            if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
            lastX = x; lastY = y;
          }
          ctx.stroke();
          if (started) ctx.fillText(label, lastX + 4 * dpr, lastY);
        }
        ctx.setLineDash([]);
      }

      // hover crosshair
      if (this.hoverIdx >= 0) {
        const x = X(sizes[this.hoverIdx]);
        ctx.strokeStyle = muted;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
      }

      // series
      for (const s of S) {
        if (!s.valid.length) continue;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2 * dpr;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        s.valid.forEach((p, i) => { const x = X(p.n), y = Y(p.v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
        for (const p of s.valid) {
          const x = X(p.n), y = Y(p.v);
          const hot = this.hoverIdx >= 0 && sizes[this.hoverIdx] === p.n;
          ctx.fillStyle = surface;
          ctx.beginPath(); ctx.arc(x, y, (hot ? 6 : 4.5) * dpr, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = s.color;
          ctx.beginPath(); ctx.arc(x, y, (hot ? 4.5 : 3) * dpr, 0, Math.PI * 2); ctx.fill();
        }
      }
      // direct labels (≤ 4 series), in text colour next to a coloured mark
      if (S.length <= 4) {
        const labels = S.filter((s) => s.valid.length).map((s) => {
          const p = s.valid[s.valid.length - 1];
          return { s, x: X(p.n), y: Y(p.v) };
        }).sort((a, b) => a.y - b.y);
        for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15 * dpr) labels[i].y = labels[i - 1].y + 15 * dpr;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (const l of labels) {
          ctx.fillStyle = l.s.color;
          ctx.fillRect(l.x + 8 * dpr, l.y - 1 * dpr, 8 * dpr, 2 * dpr);
          ctx.fillStyle = text;
          ctx.fillText(App.algoName(l.s.id), l.x + 20 * dpr, l.y);
        }
      }
    },

    hover(e) {
      const g = this.geom;
      if (!g) return;
      const cv = e.currentTarget, r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) * g.dpr;
      let best = -1, bd = Infinity;
      g.sizes.forEach((n, i) => { const d = Math.abs(g.X(n) - px); if (d < bd) { bd = d; best = i; } });
      if (px < g.x0 - 20 * g.dpr || px > g.x1 + 20 * g.dpr) best = -1;
      const tip = this.root().querySelector('#anTip');
      if (best !== this.hoverIdx) { this.hoverIdx = best; this.draw(); }
      if (best < 0) { tip.hidden = true; return; }
      const n = g.sizes[best];
      const rows = this.series().map((s) => {
        const p = s.vals[best];
        const v = p.v == null ? (p.capped ? App.t('an.stoppedShort') : '–') : App.fmt(p.v);
        return `<div><i style="background:${s.color}"></i>${App.esc(App.algoName(s.id))}<b>${v}</b></div>`;
      }).join('');
      tip.innerHTML = `<div class="tip-head">n = ${App.fmt(n)}</div>${rows}`;
      tip.hidden = false;
      const x = g.X(n) / g.dpr;
      tip.style.left = `${Math.min(r.width - tip.offsetWidth - 4, x + 12)}px`;
      tip.style.top = '8px';
    },

    renderLegend(S) {
      const ul = this.root().querySelector('#anLegend');
      if (!ul) return;
      const t = App.t;
      ul.innerHTML = S.map((s) => {
        let extra = '';
        if (s.allZero) extra = t('an.zero');
        else if (s.exp != null) extra = `≈ n<sup>${s.exp.toFixed(2).replace('.', SV.I18N.lang === 'de' ? ',' : '.')}</sup>`;
        if (s.capAt) extra += ` · ${t('an.stopped', { n: App.fmt(s.capAt) })}`;
        return `<li><i style="background:${s.color}"></i>${App.esc(App.algoName(s.id))} <span class="muted">${extra}</span></li>`;
      }).join('');
    },

    renderTable(S) {
      const box = this.root().querySelector('#anTable');
      if (!box || !this.result) { if (box) box.innerHTML = ''; return; }
      const sizes = this.result.sizes;
      box.innerHTML = `<table><thead><tr><th>${App.esc(App.t('cheat.algorithm'))}</th>${sizes.map((n) => `<th class="num">${App.fmt(n)}</th>`).join('')}</tr></thead>
        <tbody>${S.map((s) => `<tr><td>${App.esc(App.algoName(s.id))}</td>${s.vals.map((p) => `<td class="num mono">${p.v == null ? (p.capped ? '⚠' : '–') : App.fmt(p.v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    },
  };

  function seriesColors() {
    const cs = getComputedStyle(document.documentElement);
    const out = [];
    for (let i = 1; i <= 8; i++) out.push(cs.getPropertyValue(`--series-${i}`).trim() || '#888');
    return out;
  }
  function compact(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(v % 1e9 ? 1 : 0) + 'G';
    if (v >= 1e6) return (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + 'k';
    return String(Math.round(v));
  }

  global.SortViz.Analysis = A;
})(window);
