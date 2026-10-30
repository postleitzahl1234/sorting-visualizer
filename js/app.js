/* =====================================================================
 * app.js – state, playback engine, UI wiring
 * ===================================================================== */
(function () {
  'use strict';

  const SV = window.SortViz;
  const { OP, OP_CLASS, INF, CATEGORIES, INFO, Recorder, Sound, Render, I18N } = SV;
  const t = (k, p) => I18N.t(k, p);
  const INFO_BY_ID = Object.fromEntries(INFO.map((i) => [i.id, i]));

  const CAP = 3000000;
  const MAX_LANES = 4;
  const MIN_OPS = 1, MAX_OPS = 200000;
  const MIN_N = 4, MAX_N = 16384, STAB_MAX_N = 4096;
  const VIEWS = ['bars', 'dots', 'spectrum', 'disc', 'disparity'];
  const HL_MAX = 12;
  const EPS = 1e-9;
  const COST_PRESETS = { steps: [1, 1, 1, 1], flash: [1, 2, 10, 1], cmp: [10, 1, 1, 1], freeReads: [1, 1, 1, 0] };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const fmt = (x) => Math.round(x).toLocaleString(I18N.locale());
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ------------------------------------------------------------------
  //  State
  // ------------------------------------------------------------------
  const state = {
    n: 100, input: 'shuffled', seed: 1, keyDiv: 1, maxKey: 100,
    initial: new Int32Array(0), customValues: null, killerFor: null,
    lanes: [], activeLane: 0,
    t: 0, maxCost: 1, playing: false,
    opsPerSec: 500, view: 'bars', rainbow: false, colorblind: false,
    showAux: true, showRanges: true, sound: false, volume: 0.3,
    weights: [1, 1, 1, 1], costPreset: 'steps', opCost: new Float64Array(10),
    lang: 'en', theme: 'auto', dock: null, drawing: false,
    busy: false, gen: 0, hideNames: false,
    palette: null, idPalette: null, target: null,
    customCode: null, customLines: null, customInstrumented: null,
  };

  // ------------------------------------------------------------------
  //  Helpers for values / cost
  // ------------------------------------------------------------------
  const keyOf = (v) => (state.keyDiv === 1 ? v : Math.floor(v / state.keyDiv));
  const defaultWeights = () => state.weights.every((w) => w === 1);
  function updateOpCost() {
    for (let o = 0; o < 10; o++) state.opCost[o] = state.weights[OP_CLASS[o]];
  }
  updateOpCost();

  function newSeed() { return (Math.random() * 0x7fffffff) >>> 0 || 1; }

  // size slider (log scale)
  const sliderToN = (v) => clamp(Math.round(MIN_N * Math.pow(MAX_N / MIN_N, v / 1000)), MIN_N, MAX_N);
  const nToSlider = (n) => Math.round((1000 * Math.log(n / MIN_N)) / Math.log(MAX_N / MIN_N));
  const sliderToOps = (v) => MIN_OPS * Math.pow(MAX_OPS / MIN_OPS, v / 1000);
  const opsToSlider = (o) => Math.round((1000 * Math.log(o / MIN_OPS)) / Math.log(MAX_OPS / MIN_OPS));

  function algoName(id) {
    if (id === 'custom') return t('custom.name');
    return I18N.info(id).name;
  }

  // ------------------------------------------------------------------
  //  Input generation
  // ------------------------------------------------------------------
  function firstComparisonLane() {
    const act = state.lanes[state.activeLane];
    if (act && (act.algoId === 'custom' || INFO_BY_ID[act.algoId].comparison)) return act;
    return state.lanes.find((l) => l.algoId !== 'custom' && INFO_BY_ID[l.algoId].comparison) || null;
  }

  async function buildInitial() {
    let values, keyDiv = 1;
    state.killerFor = null;
    let note = '';
    if (state.input === 'custom' && state.customValues) {
      values = Int32Array.from(state.customValues);
      state.n = values.length;
    } else if (state.input === 'killer') {
      const L = firstComparisonLane();
      if (L && L.algoId !== 'custom') {
        values = await Recorder.killer(L.algoId, state.n, state.seed);
        state.killerFor = L.algoId;
        note = t('input.killerNote', { name: algoName(L.algoId) });
      } else {
        values = SV.makeInput('shuffled', state.n, state.seed).values;
        note = t('input.killerNone');
      }
    } else {
      if (state.input === 'stability' && state.n > STAB_MAX_N) { state.n = STAB_MAX_N; note = t('input.stabilityMax', { n: STAB_MAX_N }); }
      if (state.input === 'stability' && !note) note = t('input.stabilityNote');
      const r = SV.makeInput(state.input === 'custom' ? 'shuffled' : state.input, state.n, state.seed);
      values = r.values; keyDiv = r.keyDiv;
    }
    state.initial = values;
    state.keyDiv = keyDiv;
    let mx = 1;
    for (let i = 0; i < values.length; i++) { const k = keyOf(values[i]); if (k > mx) mx = k; }
    state.maxKey = state.input === 'stability' ? 6 : Math.max(mx, state.input === 'custom' ? mx : state.n);
    buildPalettes();
    const noteEl = $('#inputNote');
    noteEl.textContent = note;
    noteEl.hidden = !note;
    $('#seedOut').textContent = String(state.seed);
    updateSizeUi();
  }

  function buildPalettes() {
    state.palette = Render.buildPalette(state.maxKey + 1, state.colorblind);
    state.idPalette = state.input === 'stability' ? Render.buildPalette(state.n, state.colorblind) : null;
    // final (middle) position of every key, for the disparity view
    const keys = Array.from(state.initial, keyOf).sort((a, b) => a - b);
    const first = new Int32Array(state.maxKey + 2).fill(-1), last = new Int32Array(state.maxKey + 2);
    keys.forEach((k, i) => { if (first[k] < 0) first[k] = i; last[k] = i; });
    state.target = new Float32Array(state.maxKey + 2);
    for (let k = 0; k < state.target.length; k++) state.target[k] = first[k] < 0 ? 0 : (first[k] + last[k]) / 2;
  }

  // ------------------------------------------------------------------
  //  Lanes
  // ------------------------------------------------------------------
  const lanesEl = $('#lanes');
  const laneTpl = $('#laneTpl');
  let laneSeq = 0;

  function fillAlgoSelect(sel, value) {
    sel.innerHTML = '';
    for (const cat of CATEGORIES) {
      const og = document.createElement('optgroup');
      og.label = t('cat.' + cat);
      for (const info of INFO.filter((i) => i.cat === cat)) {
        const o = document.createElement('option');
        o.value = info.id; o.textContent = algoName(info.id);
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
    if (state.customCode) {
      const og = document.createElement('optgroup');
      og.label = t('cat.custom');
      const o = document.createElement('option');
      o.value = 'custom'; o.textContent = t('custom.name');
      og.appendChild(o);
      sel.appendChild(og);
    }
    sel.value = value;
  }

  function createLane(algoId) {
    const el = laneTpl.content.firstElementChild.cloneNode(true);
    const L = {
      id: ++laneSeq, algoId, el,
      select: $('.algo-select', el), badge: $('.badge', el), mystery: $('.mystery', el),
      statsEl: $('.lane-stats', el), note: $('.lane-note', el), canvas: $('canvas', el),
      ctx: null, dpr: 1, trace: null, arr: null, hs: null, aux: [], auxHs: [], stack: [], sIdx: 0,
      pos: 0, cost: 0, totalCost: 0, st: [0, 0, 0, 0, 0], hlCount: 0, sweep: -1, rank: 0,
      dirty: true, uiPos: -1, lay: null, quizSel: null, stabilityResult: null, error: null,
    };
    L.ctx = L.canvas.getContext('2d', { alpha: false });
    fillAlgoSelect(L.select, algoId);
    L.select.addEventListener('change', () => {
      L.algoId = L.select.value;
      setActiveLane(state.lanes.indexOf(L));
      if (state.input === 'killer') recordAll(); else recordLanes([L]);
      scheduleUrl();
    });
    el.addEventListener('pointerdown', () => setActiveLane(state.lanes.indexOf(L)));
    $('.lane-remove', el).addEventListener('click', (e) => { e.stopPropagation(); removeLane(L); });
    $('.lane-remove', el).title = t('race.remove');
    L.canvas.addEventListener('pointerdown', (e) => onCanvasPointer(L, e, 'down'));
    L.canvas.addEventListener('pointermove', (e) => onCanvasPointer(L, e, 'move'));
    new ResizeObserver(() => resizeLane(L)).observe($('.lane-canvas', el));
    return L;
  }

  function resizeLane(L) {
    const box = L.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (L.canvas.width !== w || L.canvas.height !== h) { L.canvas.width = w; L.canvas.height = h; }
    L.dpr = dpr;
    L.dirty = true;
  }

  function computeTotalCost(L) {
    const op = L.trace.op, c = state.opCost;
    let s = 0;
    for (let k = 0; k < L.trace.len; k++) s += c[op[k]];
    L.totalCost = s;
  }

  function resetLane(L) {
    L.arr = Int32Array.from(state.initial);
    L.hs = new Uint8Array(state.initial.length);
    const defs = L.trace ? L.trace.auxDefs : [];
    L.aux = defs.map((d) => new Int32Array(d.size));
    L.auxHs = defs.map((d) => new Uint8Array(d.size));
    L.stack = []; L.sIdx = 0;
    L.pos = 0; L.cost = 0; L.hlCount = 0; L.sweep = -1; L.uiPos = -1;
    L.st = [0, 0, 0, 0, 0];
    L.stabilityResult = null;
    L.dirty = true;
    if (L.trace) syncStack(L);
    updateLaneNote(L);
    buildStatsDom(L);
  }

  function updateLaneNote(L) {
    let text = '', cls = '';
    if (L.error) { text = L.error; cls = 'bad'; }
    else if (L.trace && L.trace.capped) { text = t('lane.capped', { n: fmt(CAP) }); cls = 'warn'; }
    else if (L.stabilityResult) { text = L.stabilityResult.text; cls = L.stabilityResult.ok ? 'ok' : 'bad'; }
    L.note.textContent = text;
    L.note.className = 'lane-note' + (text ? ' show ' + cls : '');
  }

  function addLane(algoId) {
    if (state.lanes.length >= MAX_LANES) return;
    if (!algoId) {
      const used = new Set(state.lanes.map((l) => l.algoId));
      algoId = ['merge', 'heap', 'tim', 'pdq', 'shell', 'intro', 'radixlsd', 'bubble'].find((a) => !used.has(a)) || 'merge';
    }
    const L = createLane(algoId);
    state.lanes.push(L);
    lanesEl.appendChild(L.el);
    layoutChanged();
    setActiveLane(state.lanes.length - 1);
    recordLanes([L]);
    scheduleUrl();
  }

  function removeLane(L) {
    if (state.lanes.length <= 1) return;
    const idx = state.lanes.indexOf(L);
    state.lanes.splice(idx, 1);
    L.el.remove();
    if (state.activeLane >= state.lanes.length) state.activeLane = state.lanes.length - 1;
    layoutChanged();
    computeRace();
    seekTo(Math.min(state.t, state.maxCost));
    setActiveLane(state.activeLane);
    scheduleUrl();
  }

  function layoutChanged() {
    lanesEl.className = `lanes count-${state.lanes.length}`;
    const b = $('#addLane');
    b.disabled = state.lanes.length >= MAX_LANES;
    b.textContent = state.lanes.length >= MAX_LANES ? t('race.max') : t('race.add');
    state.lanes.forEach((l) => { l.dirty = true; l.uiPos = -1; });
  }

  function setActiveLane(i) {
    if (i < 0 || i >= state.lanes.length) return;
    state.activeLane = i;
    state.lanes.forEach((l, k) => l.el.classList.toggle('active', k === i));
    renderInfo();
    renderCheatHighlight();
    renderCodePanel(true);
    renderNarration(true);
  }

  // ------------------------------------------------------------------
  //  Recording
  // ------------------------------------------------------------------
  function setBusy(on) {
    state.busy = on;
    $('#busy').hidden = !on;
  }

  async function recordTrace(L) {
    L.error = null;
    const opts = { cap: CAP, seed: state.seed, keyDiv: state.keyDiv };
    try {
      if (L.algoId === 'custom') {
        if (!state.customCode) throw new Error(t('custom.none'));
        const tr = await Recorder.recordCustom(state.customInstrumented || state.customCode, state.initial, opts);
        if (tr.error) L.error = t('custom.runtimeError', { msg: tr.error });
        if (SV.Editor) SV.Editor.reportRun(tr, state.initial, state.keyDiv);
        return tr;
      }
      return await Recorder.record(L.algoId, state.initial, opts);
    } catch (e) {
      const msg = e.message === 'timeout' ? t('custom.timeout') : e.message;
      L.error = msg;
      if (L.algoId === 'custom' && SV.Editor) SV.Editor.reportError(msg);
      return SV.record('bubble', [], { cap: 1 });   // empty trace
    }
  }

  async function recordLanes(lanes, regenerate) {
    const gen = ++state.gen;
    pause();
    setBusy(true);
    try {
      if (regenerate) await buildInitial();
      if (gen !== state.gen) return;
      const traces = await Promise.all(lanes.map(recordTrace));
      if (gen !== state.gen) return;
      lanes.forEach((L, i) => { L.trace = traces[i]; });
      restartRace();
    } finally {
      if (gen === state.gen) setBusy(false);
    }
  }

  function recordAll() { return recordLanes(state.lanes.slice(), true); }
  function regenerate(newRandom = true) { if (newRandom) state.seed = newSeed(); scheduleUrl(); return recordAll(); }

  function computeRace() {
    state.lanes.forEach((L) => { if (L.trace) computeTotalCost(L); });
    state.maxCost = Math.max(EPS, ...state.lanes.map((l) => (l.trace ? l.totalCost : 0)));
    const finishers = state.lanes.filter((l) => l.trace && !l.trace.capped && !l.error).sort((a, b) => a.totalCost - b.totalCost);
    state.lanes.forEach((l) => {
      l.rank = !l.trace || l.trace.capped || l.error ? 0 : 1 + finishers.findIndex((f) => Math.abs(f.totalCost - l.totalCost) < EPS);
      l.uiPos = -1;
    });
    lastUiT = -1;
    updateDurationHint();
  }

  function restartRace() {
    pause();
    state.lanes.forEach((L) => { if (L.trace) resetLane(L); });
    state.t = 0;
    computeRace();
    renderInfo();
    renderCodePanel(true);
    renderNarration(true);
    if (SV.Quiz) SV.Quiz.onRecorded();
  }

  // ------------------------------------------------------------------
  //  Trace playback
  // ------------------------------------------------------------------
  function applyOp(L, k) {
    const tr = L.trace, o = tr.op[k], x = tr.x[k], y = tr.y[k], z = tr.z[k], w = tr.w[k];
    SV.statDeltas(o, x, y, z, w, L.st, 1);
    if (o === 3) { const a = L.arr, tmp = a[x]; a[x] = a[y]; a[y] = tmp; }
    else if (o === 4) L.arr[x] = y;
    else if (o === 6 || o === 7) L.aux[o - 6][x] = y;
  }
  function undoOp(L, k) {
    const tr = L.trace, o = tr.op[k], x = tr.x[k], y = tr.y[k], z = tr.z[k], w = tr.w[k];
    SV.statDeltas(o, x, y, z, w, L.st, -1);
    if (o === 3) { const a = L.arr, tmp = a[x]; a[x] = a[y]; a[y] = tmp; }
    else if (o === 4) L.arr[x] = z;
    else if (o === 6 || o === 7) L.aux[o - 6][x] = z;
  }

  function syncStack(L) {
    const tr = L.trace, at = tr.stAt, m = at.length;
    while (L.sIdx < m && at[L.sIdx] <= L.pos) {
      if (tr.stType[L.sIdx] > 0) L.stack.push([tr.stLo[L.sIdx], tr.stHi[L.sIdx]]); else L.stack.pop();
      L.sIdx++;
    }
    while (L.sIdx > 0 && at[L.sIdx - 1] > L.pos) {
      L.sIdx--;
      if (tr.stType[L.sIdx] > 0) L.stack.pop(); else L.stack.push([tr.stLo[L.sIdx], tr.stHi[L.sIdx]]);
    }
  }

  /** Move lane L to global time T (in cost units). Returns number of events moved. */
  function seekLane(L, T) {
    if (!L.trace) return 0;
    const tr = L.trace, op = tr.op, c = state.opCost, from = L.pos;
    if (T + EPS >= L.cost) {
      while (L.pos < tr.len && L.cost + c[op[L.pos]] <= T + EPS) { applyOp(L, L.pos); L.cost += c[op[L.pos]]; L.pos++; }
    } else if (T < L.cost - T) {
      L.arr.set(state.initial);
      L.aux.forEach((a) => a.fill(0));
      L.st = [0, 0, 0, 0, 0];
      L.stack = []; L.sIdx = 0; L.pos = 0; L.cost = 0;
      while (L.pos < tr.len && L.cost + c[op[L.pos]] <= T + EPS) { applyOp(L, L.pos); L.cost += c[op[L.pos]]; L.pos++; }
    } else {
      while (L.pos > 0 && L.cost > T + EPS) { L.pos--; L.cost -= c[op[L.pos]]; undoOp(L, L.pos); }
      if (L.cost < EPS) L.cost = 0;
    }
    if (L.pos === from) return 0;
    syncStack(L);
    if (L.pos < tr.len) { L.sweep = -1; if (L.stabilityResult) { L.stabilityResult = null; updateLaneNote(L); } }
    L.dirty = true;
    return Math.abs(L.pos - from);
  }

  function syncLanes(withSound, forceHl) {
    const T = state.t;
    const count = state.lanes.length;
    for (const L of state.lanes) {
      const before = L.pos;
      const moved = seekLane(L, T);
      if (moved > 0) {
        L.hlCount = forceHl != null ? forceHl : Math.min(HL_MAX, moved);
        if (withSound && L.pos > before) playEventSound(L, L.pos - 1, 0.28 / Math.sqrt(count));
      }
    }
  }

  function playEventSound(L, k, gain) {
    if (!state.sound) return;
    const tr = L.trace, o = tr.op[k];
    let idx = tr.x[k], v;
    if (o >= 6) { const A = L.aux[(o - 6) % 2]; v = A ? A[idx] : 0; }
    else { if (idx < 0) idx = tr.y[k]; v = idx >= 0 ? L.arr[idx] : 0; }
    if (!(v > 0) || v >= INF) return;
    const dur = clamp(1 / state.opsPerSec, 0.045, 0.14);
    Sound.note(keyOf(v) / state.maxKey, OP_CLASS[o], (idx / Math.max(1, state.n - 1)) * 2 - 1, gain, dur);
  }

  function markersAt(L) {
    const at = L.trace.markAt;
    let lo = 0, hi = at.length - 1, found = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (at[mid] <= L.pos) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    return found < 0 ? [-1, -1] : [L.trace.m1[found], L.trace.m2[found]];
  }
  function noteAt(L) {
    const at = L.trace.ntAt;
    let lo = 0, hi = at.length - 1, found = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (at[mid] <= L.pos) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    return found;
  }

  function computeStates(L) {
    const n = state.n, s = L.hs, a = L.arr;
    s.fill(0);
    L.auxHs.forEach((h) => h.fill(0));
    // in the stability test the id colours must stay visible once the check is done
    if (L.sweep >= 0 && !(state.input === 'stability' && L.sweep >= n)) {
      const m = Math.min(n, Math.floor(L.sweep));
      for (let i = 0; i < m; i++) s[i] = i === 0 || keyOf(a[i - 1]) <= keyOf(a[i]) ? 5 : 6;
    }
    const [m1, m2] = markersAt(L);
    if (m1 >= 0 && m1 < n) s[m1] = 4;
    if (m2 >= 0 && m2 < n) s[m2] = 4;
    const tr = L.trace, ah = L.auxHs;
    for (let k = Math.max(0, L.pos - L.hlCount); k < L.pos; k++) {
      const x = tr.x[k], y = tr.y[k], z = tr.z[k], w = tr.w[k];
      switch (tr.op[k]) {
        case 0: s[x] = 1; s[y] = 1; break;
        case 1: s[x] = 1; break;
        case 2: if (x >= 0) s[x] = 1; if (y >= 0) s[y] = 1; if (ah[0]) { if (z >= 0) ah[0][z] = 1; if (w >= 0) ah[0][w] = 1; } break;
        case 3: s[x] = 2; s[y] = 2; break;
        case 4:
          s[x] = 2;
          if (w >= 0) { if (s[w] === 0) s[w] = 3; }
          else if (w <= -2) { const t2 = Math.floor((-w - 2) / 65536), idx = (-w - 2) % 65536; if (ah[t2]) ah[t2][idx] = 3; }
          break;
        case 5: s[x] = 3; break;
        case 6: case 7: if (ah[tr.op[k] - 6]) ah[tr.op[k] - 6][x] = 2; if (w >= 0 && s[w] === 0) s[w] = 3; break;
        case 8: case 9: if (ah[tr.op[k] - 8]) ah[tr.op[k] - 8][x] = 3; break;
      }
    }
  }

  function renderEnv() {
    return {
      view: state.view, n: state.n, keyDiv: state.keyDiv, maxKey: state.maxKey,
      palette: state.palette, idPalette: state.idPalette, target: state.target,
      rainbow: state.rainbow, showAux: state.showAux, showRanges: state.showRanges,
      auxLabel: (label) => t('aux.' + label.replace(/\s+/g, '_')),
    };
  }

  // ------------------------------------------------------------------
  //  Main loop
  // ------------------------------------------------------------------
  let lastFrame = performance.now();
  let lastUiT = -1;
  let lastSweepNote = 0;

  function allFinished() {
    return state.lanes.every((L) => !L.trace || L.pos >= L.trace.len);
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (state.playing && !state.busy) {
      state.t = Math.min(state.maxCost, state.t + state.opsPerSec * dt);
      syncLanes(true);
    }
    let sweepVal = -1, sweepIdx = 0;
    for (const L of state.lanes) {
      if (!L.trace) continue;
      const finished = L.pos >= L.trace.len && !L.trace.capped && !L.error;
      if (finished && L.sweep < 0) { L.sweep = 0; L.hlCount = 0; }
      if (L.sweep >= 0 && L.sweep < state.n) {
        L.sweep = Math.min(state.n, L.sweep + (state.n * dt) / 0.8);
        L.dirty = true;
        const i = Math.min(state.n - 1, Math.floor(L.sweep));
        if (sweepVal < 0) { sweepVal = L.arr[i]; sweepIdx = i; }
        if (L.sweep >= state.n) finishStability(L);
      }
    }
    if (sweepVal > 0 && state.sound && now - lastSweepNote > 35) {
      Sound.note(keyOf(sweepVal) / state.maxKey, 4, (sweepIdx / Math.max(1, state.n - 1)) * 2 - 1, 0.18, 0.08);
      lastSweepNote = now;
    }
    if (state.playing && state.lanes.every((L) => !L.trace || (L.pos >= L.trace.len && (L.trace.capped || L.error || L.sweep >= state.n)))) {
      state.playing = false;
      updatePlayButton();
    }
    const env = renderEnv();
    for (const L of state.lanes) {
      if (L.dirty && L.trace) {
        computeStates(L);
        Render.draw(L, env);
        L.dirty = false;
      }
    }
    updateUi();
    if (SV.Exporter) SV.Exporter.onFrame(now);
    requestAnimationFrame(frame);
  }

  function finishStability(L) {
    if (state.input !== 'stability' || L.stabilityResult) return;
    const a = L.arr, kd = state.keyDiv;
    if (L.algoId === 'gravity') { L.stabilityResult = { ok: false, text: t('stab.lost') }; updateLaneNote(L); return; }
    let broken = 0;
    for (let i = 1; i < a.length; i++) {
      if (Math.floor(a[i - 1] / kd) === Math.floor(a[i] / kd) && a[i - 1] % kd > a[i] % kd) broken++;
    }
    L.stabilityResult = broken === 0 ? { ok: true, text: t('stab.ok') } : { ok: false, text: t('stab.broken', { k: fmt(broken) }) };
    updateLaneNote(L);
  }

  // ------------------------------------------------------------------
  //  UI updates
  // ------------------------------------------------------------------
  const timelineEl = $('#timeline');
  let scrubbing = false;

  function fmtDuration(sec) {
    if (!isFinite(sec)) return '–';
    if (sec < 60) return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)} s`;
    if (sec < 3600) return `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`;
    return `${(sec / 3600).toFixed(1)} h`;
  }

  const STAT_KEYS = ['steps', 'cmp', 'swaps', 'writes', 'reads', 'aux', 'cost'];
  function buildStatsDom(L) {
    const hasAux = L.trace && L.trace.auxDefs.length > 0;
    const keys = STAT_KEYS.filter((k) => (k !== 'aux' || hasAux) && (k !== 'cost' || !defaultWeights()));
    L.statsEl.innerHTML = keys.map((k) => `<span><b data-k="${k}">0</b> ${t('stat.' + k)}</span>`).join('');
    L.statEls = {};
    $$('[data-k]', L.statsEl).forEach((b) => { L.statEls[b.dataset.k] = b; });
    L.uiPos = -1;
  }

  function updateUi() {
    for (const L of state.lanes) {
      if (!L.trace || L.uiPos === L.pos) continue;
      L.uiPos = L.pos;
      const e = L.statEls, s = L.st;
      if (e.steps) e.steps.textContent = fmt(L.pos);
      if (e.cmp) e.cmp.textContent = fmt(s[0]);
      if (e.swaps) e.swaps.textContent = fmt(s[1]);
      if (e.writes) e.writes.textContent = fmt(s[2]);
      if (e.reads) e.reads.textContent = fmt(s[3]);
      if (e.aux) e.aux.textContent = fmt(s[4]);
      if (e.cost) e.cost.textContent = fmt(L.cost);
      updateBadge(L);
    }
    const ti = Math.round((state.t / state.maxCost) * 10000);
    if (ti !== lastUiT) {
      lastUiT = ti;
      if (!scrubbing) timelineEl.value = ti;
      const L = state.lanes[state.activeLane];
      if (defaultWeights()) $('#stepOut').textContent = t('time.step', { a: fmt(state.t), b: fmt(state.maxCost) });
      else $('#stepOut').textContent = t('time.cost', { a: fmt(state.t), b: fmt(state.maxCost) });
      void L;
    }
    renderCodePanel(false);
    renderNarration(false);
  }

  function updateBadge(L) {
    const b = L.badge, len = L.trace.len;
    b.className = 'badge';
    const amount = defaultWeights() ? t('badge.steps', { n: fmt(len) }) : t('badge.cost', { n: fmt(L.totalCost) });
    if (L.error) { b.textContent = t('badge.error'); b.classList.add('cap'); return; }
    if (L.pos >= len) {
      if (L.trace.capped) { b.textContent = t('badge.gaveUp'); b.classList.add('cap'); }
      else if (state.lanes.length > 1) {
        b.textContent = `✓ ${t('rank.' + Math.min(L.rank, 5))} · ${amount}`;
        b.classList.add(L.rank === 1 ? 'gold' : 'done');
      } else { b.textContent = `✓ ${t('badge.sorted')} · ${amount}`; b.classList.add('done'); }
    } else if (L.pos > 0) {
      b.textContent = `${Math.floor((L.pos / len) * 100)}%`; b.classList.add('run');
    } else {
      b.textContent = L.trace.capped ? t('badge.exceeds') : amount;
      if (L.trace.capped) b.classList.add('cap');
    }
  }

  function updateDurationHint() {
    $('#durationOut').textContent = t('time.total', { d: fmtDuration(state.maxCost / state.opsPerSec) });
  }

  function updatePlayButton() {
    const b = $('#play');
    b.textContent = state.playing ? '❚❚' : '▶';
    b.title = state.playing ? t('play.pause') : t('play.play');
  }

  function updateSizeUi() {
    $('#size').value = nToSlider(state.n);
    $('#sizeOut').textContent = fmt(state.n);
  }

  // ------------------------------------------------------------------
  //  Narration & code panel
  // ------------------------------------------------------------------
  let narrKey = '';
  function valText(v) { return v > 0 && v < INF ? fmt(keyOf(v)) : v >= INF ? '∞' : '–'; }

  function describeEvent(L, k) {
    const tr = L.trace, o = tr.op[k], x = tr.x[k], y = tr.y[k], w = tr.w[k], a = L.arr;
    const auxName = (i) => (L.trace.auxDefs[i] ? t('aux.' + L.trace.auxDefs[i].label.replace(/\s+/g, '_')) : 'aux');
    switch (o) {
      case 0: return t('ev.cmp', { i: x, j: y, a: valText(a[x]), b: valText(a[y]) });
      case 1: return t('ev.cmpv', { i: x, a: valText(a[x]) });
      case 2: return x >= 0 ? t('ev.cmpaMain', { i: x }) : t('ev.cmpa');
      case 3: return t('ev.swap', { i: x, j: y, a: valText(a[y]), b: valText(a[x]) });
      case 4:
        if (w >= 0) return t('ev.move', { i: x, j: w, v: valText(y) });
        if (w <= -2) { const tt = Math.floor((-w - 2) / 65536), idx = (-w - 2) % 65536; return t('ev.fromAux', { i: x, v: valText(y), aux: auxName(tt), j: idx }); }
        return t('ev.set', { i: x, v: valText(y) });
      case 5: return t('ev.get', { i: x, v: valText(a[x]) });
      case 6: case 7: {
        const def = L.trace.auxDefs[o - 6];
        const v = def && def.kind === 'counts' ? fmt(y) : valText(y);
        return w >= 0 ? t('ev.toAux', { aux: auxName(o - 6), i: x, v, j: w }) : t('ev.auxSet', { aux: auxName(o - 6), i: x, v });
      }
      case 8: case 9: return t('ev.auxGet', { aux: auxName(o - 8), i: x });
    }
    return '';
  }

  function describeNote(L, idx) {
    const tr = L.trace;
    const key = SV.NOTES[tr.ntKey[idx]];
    const a = tr.ntA[idx], b = tr.ntB[idx], c = tr.ntC[idx];
    if (key === 'custom') return tr.strings[a] || '';
    return t('note.' + key, { a: fmt(a), b: fmt(b), c: fmt(c), va: valText(a), vb: valText(b), a1: fmt(a + 1), b1: fmt(b + 1), c1: fmt(c - 1), vc: valText(c) });
  }

  function renderNarration(force) {
    const L = state.lanes[state.activeLane];
    const el = $('#narration');
    if (!L || !L.trace || state.hideNames) { if (el.textContent) el.textContent = ''; narrKey = ''; return; }
    const key = `${L.id}:${L.pos}:${I18N.lang}`;
    if (!force && key === narrKey) return;
    narrKey = key;
    if (L.pos === 0) { el.innerHTML = `<span class="muted">${esc(t('narr.ready'))}</span>`; return; }
    const ni = noteAt(L);
    const phase = ni >= 0 ? describeNote(L, ni) : '';
    const ev = describeEvent(L, L.pos - 1);
    const done = L.pos >= L.trace.len ? ` · <b>${esc(t('narr.done'))}</b>` : '';
    el.innerHTML = (phase ? `<b>${esc(phase)}</b> · ` : '') + esc(ev) + done;
  }

  let codeKey = '';
  function codeLines(L) {
    if (L.algoId === 'custom') return state.customLines || [];
    return SV.CODE[L.algoId] || [];
  }
  function renderCodePanel(force) {
    if (state.dock !== 'code') return;
    const panel = $('#codePanel');
    const L = state.lanes[state.activeLane];
    if (!L || !L.trace) return;
    const line = L.pos > 0 ? L.trace.ln[L.pos - 1] : 0;
    const structKey = `${L.id}:${L.algoId}:${I18N.lang}:${state.hideNames}`;
    if (force || panel.dataset.key !== structKey) {
      panel.dataset.key = structKey;
      const lines = codeLines(L);
      panel.innerHTML = `<div class="code-head"><span class="code-title">${esc(state.hideNames ? t('quiz.mystery') : algoName(L.algoId))}</span><span class="code-line" id="codeLineOut"></span></div>
        <ol class="code">${state.hideNames ? `<li class="muted">${esc(t('quiz.codeHidden'))}</li>` : lines.map((s) => `<li><code>${esc(s) || ' '}</code></li>`).join('')}</ol>`;
      codeKey = '';
    }
    const ck = `${structKey}:${line}`;
    if (!force && ck === codeKey) return;
    codeKey = ck;
    const items = $$('.code li', panel);
    items.forEach((li, i) => li.classList.toggle('cur', i + 1 === line));
    $('#codeLineOut').textContent = line ? t('code.line', { n: line }) : '';
    const cur = items[line - 1];
    if (cur) {
      const box = $('.code', panel);
      const top = cur.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - cur.offsetHeight) box.scrollTop = top - box.clientHeight / 3;
    }
  }

  function setDock(which) {
    if (which === 'quiz' && state.dock !== 'quiz' && SV.Quiz) SV.Quiz.open();
    if (state.dock === 'quiz' && which !== 'quiz' && SV.Quiz) SV.Quiz.close();
    state.dock = which;
    const dock = $('#dock');
    dock.hidden = !which;
    $('#codePanel').hidden = which !== 'code';
    $('#quizPanel').hidden = which !== 'quiz';
    $('#dockCode').setAttribute('aria-pressed', String(which === 'code'));
    $('#dockQuiz').setAttribute('aria-pressed', String(which === 'quiz'));
    $('.stage').classList.toggle('docked', !!which);
    if (which === 'code') renderCodePanel(true);
    state.lanes.forEach((l) => { l.dirty = true; });
  }

  // ------------------------------------------------------------------
  //  Playback controls
  // ------------------------------------------------------------------
  function play() {
    if (state.busy) return;
    if (allFinished()) { state.t = 0; syncLanes(false, 0); }
    if (state.sound) Sound.ensure();
    state.playing = true;
    updatePlayButton();
  }
  function pause() { state.playing = false; updatePlayButton(); }
  function togglePlay() { state.playing ? pause() : play(); }

  function step(dir) {
    if (state.busy) return;
    pause();
    if (state.sound) Sound.ensure();
    const c = state.opCost;
    if (dir > 0) {
      let next = Infinity;
      for (const L of state.lanes) {
        if (!L.trace) continue;
        let k = L.pos;
        while (k < L.trace.len && c[L.trace.op[k]] === 0) k++;
        if (k < L.trace.len) next = Math.min(next, L.cost + c[L.trace.op[k]]);
      }
      state.t = next === Infinity ? state.maxCost : Math.min(state.maxCost, next);
      syncLanes(true, 1);
    } else {
      let prev = -Infinity;
      for (const L of state.lanes) {
        if (!L.trace) continue;
        let k = L.pos - 1;
        while (k >= 0 && c[L.trace.op[k]] === 0) k--;
        if (k >= 0) prev = Math.max(prev, L.cost - c[L.trace.op[k]]);
      }
      state.t = prev === -Infinity ? 0 : Math.max(0, prev);
      syncLanes(false, 1);
    }
  }

  function seekTo(T) {
    state.t = clamp(T, 0, state.maxCost);
    syncLanes(false, 1);
  }

  function setSpeed(ops) {
    state.opsPerSec = clamp(ops, MIN_OPS, MAX_OPS);
    $('#speed').value = opsToSlider(state.opsPerSec);
    const o = state.opsPerSec;
    $('#speedOut').textContent = t('speed.value', { v: o < 10 ? o.toFixed(1) : fmt(o) });
    updateDurationHint();
    scheduleUrl();
  }

  function setView(v) {
    state.view = v;
    $$('#viewSeg button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    state.lanes.forEach((l) => { l.dirty = true; });
    scheduleUrl();
  }

  function setWeights(w, preset) {
    state.weights = w.slice();
    state.costPreset = preset;
    updateOpCost();
    $('#costPreset').value = preset;
    $$('#weights input').forEach((inp) => { inp.value = state.weights[+inp.dataset.w]; });
    $$('#weights output').forEach((o) => { o.textContent = String(state.weights[+o.dataset.w]).replace('.', I18N.lang === 'de' ? ',' : '.'); });
    state.lanes.forEach((L) => { if (L.trace) buildStatsDom(L); });
    restartRace();
    scheduleUrl();
  }

  function setSize(n) {
    state.n = clamp(n | 0, MIN_N, MAX_N);
    if (state.input === 'custom') { state.input = 'shuffled'; $('#input').value = 'shuffled'; showCustomBox(false); }
    updateSizeUi();
    scheduleUrl();
    return recordAll();
  }

  function setInput(kind) {
    state.input = kind;
    $('#input').value = kind;
    showCustomBox(kind === 'custom');
    if (kind === 'custom') {
      if (!state.customValues) { $('#customText').focus(); return Promise.resolve(); }
    }
    scheduleUrl();
    return recordAll();
  }

  function showCustomBox(on) {
    $('#customBox').hidden = !on;
    if (on && state.customValues && !$('#customText').value) $('#customText').value = state.customValues.join(' ');
  }

  function applyCustomText() {
    const raw = $('#customText').value.trim();
    const err = $('#customErr');
    err.textContent = '';
    const parts = raw.split(/[\s,;]+/).filter(Boolean);
    const nums = parts.map(Number);
    if (parts.length < 2) { err.textContent = t('custom.errFew'); return; }
    if (parts.length > MAX_N) { err.textContent = t('custom.errMany', { n: fmt(MAX_N) }); return; }
    if (nums.some((x) => !Number.isInteger(x) || x < 1 || x > 9999)) { err.textContent = t('custom.errRange'); return; }
    state.customValues = nums;
    state.input = 'custom';
    $('#input').value = 'custom';
    scheduleUrl();
    recordAll();
  }

  // ------------------------------------------------------------------
  //  Drawing the array with the mouse / quiz clicks
  // ------------------------------------------------------------------
  let drawLast = -1;
  function onCanvasPointer(L, e, kind) {
    const rect = L.canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * L.dpr, py = (e.clientY - rect.top) * L.dpr;
    const env = renderEnv();
    if (kind === 'down' && SV.Quiz && SV.Quiz.wantsClicks()) {
      const i = Render.indexAt(L, env, px);
      if (i >= 0) SV.Quiz.onBarClick(L, i);
      return;
    }
    if (!state.drawing || state.busy) return;
    if (kind === 'move' && !(e.buttons & 1)) { drawLast = -1; return; }
    if (kind === 'down') { L.canvas.setPointerCapture(e.pointerId); beginDrawing(); }
    const i = Render.indexAt(L, env, px);
    if (i < 0) return;
    const k = Render.keyAt(L, env, py);
    const from = drawLast >= 0 ? drawLast : i;
    const kFrom = drawLast >= 0 ? state.initial[drawLast] : k;
    const lo = Math.min(from, i), hi = Math.max(from, i);
    for (let j = lo; j <= hi; j++) {
      const f = i === from ? 1 : (j - from) / (i - from);      // 0 at the last point, 1 at the pointer
      state.initial[j] = Math.max(1, Math.round(kFrom + (k - kFrom) * f));
    }
    drawLast = i;
    state.lanes.forEach((l) => { if (l.arr) { l.arr.set(state.initial); l.dirty = true; } });
  }

  function beginDrawing() {
    pause();
    if (state.keyDiv !== 1) {
      state.initial = Int32Array.from(state.initial, (v) => keyOf(v));
      state.keyDiv = 1;
    }
    if (state.view === 'disc' || state.view === 'disparity') setView('bars');
    state.idPalette = null;
    state.t = 0;
    state.lanes.forEach((l) => { if (l.trace) { l.pos = 0; l.cost = 0; l.sweep = -1; l.hlCount = 0; l.stack = []; l.sIdx = 0; l.st = [0, 0, 0, 0, 0]; } });
  }

  function endDrawing() {
    if (drawLast < 0) return;
    drawLast = -1;
    state.customValues = Array.from(state.initial);
    state.input = 'custom';
    $('#input').value = 'custom';
    showCustomBox(true);
    $('#customText').value = state.customValues.join(' ');
    scheduleUrl();
    recordAll();
  }

  function setDrawing(on) {
    state.drawing = on;
    $('#drawBtn').setAttribute('aria-pressed', String(on));
    lanesEl.classList.toggle('drawing', on);
    if (on) toast(t('draw.hint'));
  }

  // ------------------------------------------------------------------
  //  Info panel & cheat sheet
  // ------------------------------------------------------------------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function cxClass(v, isMem) {
    const s = v.replace(/\s+/g, ' ').trim();
    if (/∞|!|\^\(log|\^2\.7/.test(s)) return 'bad';
    if (isMem) return s === '1' || s === 'log n' ? 'good' : 'mid';
    if (/n²/.test(s)) return 'bad';
    if (/^(n|n log n|n \+ k|n·d|S|n \+ max)$/.test(s)) return 'good';
    return 'mid';
  }

  function renderInfo() {
    const tabs = $('#infoTabs');
    tabs.innerHTML = '';
    if (state.lanes.length > 1) {
      state.lanes.forEach((L, i) => {
        const b = document.createElement('button');
        b.textContent = t('info.laneTab', { i: i + 1, name: state.hideNames ? '???' : algoName(L.algoId) });
        if (i === state.activeLane) b.classList.add('active');
        b.addEventListener('click', () => setActiveLane(i));
        tabs.appendChild(b);
      });
    }
    const L = state.lanes[state.activeLane];
    const body = $('#infoBody');
    if (!L) return;
    if (state.hideNames) { body.innerHTML = `<p class="muted">${esc(t('quiz.infoHidden'))}</p>`; return; }
    if (L.algoId === 'custom') {
      body.innerHTML = `<div class="info-head"><h2>${esc(t('custom.name'))}</h2><span class="tag">${esc(t('cat.custom'))}</span></div>
        <p class="info-summary">${esc(t('custom.infoSummary'))}</p>`;
      return;
    }
    const info = I18N.info(L.algoId);
    const base = INFO_BY_ID[L.algoId];
    const cx = (label, v, mem) => `<div class="cx"><span>${esc(label)}</span><b class="${cxClass(v, mem)}">${esc(v)}</b></div>`;
    const tipTry = base.tip && base.tip.try;
    const tip = info.tipText ? `<div class="tip"><span><b>${esc(t('info.try'))}</b> ${esc(info.tipText)}</span>
      ${tipTry ? `<button class="btn primary" id="tryBtn">▶ ${esc(t('info.tryIt'))}</button>` : ''}</div>` : '';
    body.innerHTML = `
      <div class="info-head"><h2>${esc(info.name)}</h2><span class="tag">${esc(t('cat.' + base.cat))}</span>
        <button class="btn small-btn" id="infoCode">&lt;/&gt; ${esc(t('info.showCode'))}</button></div>
      <p class="info-summary">${esc(info.summary)}</p>
      <div class="complexity">
        ${cx(t('cx.best'), base.best)}${cx(t('cx.avg'), base.avg)}${cx(t('cx.worst'), base.worst)}
        ${cx(t('cx.mem'), base.mem, true)}
        <div class="cx"><span>${esc(t('cx.stable'))}</span><b class="${base.stable ? 'good' : 'mid'}">${base.stable ? t('yes') : t('no')}</b></div>
      </div>
      <div class="info-cols">
        <div><h3>${esc(t('info.how'))}</h3><p>${esc(info.how)}</p><ol>${info.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
        <div><h3>${esc(t('info.trivia'))}</h3><ul class="trivia">${info.trivia.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>
      </div>${tip}`;
    const tb = $('#tryBtn');
    if (tb) tb.addEventListener('click', () => applyTry(tipTry));
    $('#infoCode').addEventListener('click', () => { setDock('code'); $('.stagebox').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  }

  async function applyTry(tr) {
    if (tr.view) setView(tr.view);
    if (tr.input) { state.input = tr.input; $('#input').value = tr.input; showCustomBox(false); }
    if (tr.size) { state.n = tr.size; updateSizeUi(); }
    state.seed = newSeed();
    scheduleUrl();
    $('.stagebox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    await recordAll();
    play();
  }

  function buildCheatSheet() {
    const tbody = $('#cheatTable tbody');
    tbody.innerHTML = '';
    for (const cat of CATEGORIES) {
      const g = document.createElement('tr');
      g.className = 'group';
      g.innerHTML = `<td colspan="7">${esc(t('cat.' + cat))}</td>`;
      tbody.appendChild(g);
      for (const i of INFO.filter((x) => x.cat === cat)) {
        const tr = document.createElement('tr');
        tr.dataset.id = i.id;
        tr.innerHTML = `<td>${esc(algoName(i.id))}</td><td class="muted">${esc(t('cat.' + cat))}</td>
          <td class="mono">${esc(i.best)}</td><td class="mono">${esc(i.avg)}</td><td class="mono">${esc(i.worst)}</td>
          <td class="mono">${esc(i.mem)}</td><td class="${i.stable ? 'yes' : 'no'}">${i.stable ? t('yes') : t('no')}</td>`;
        tr.addEventListener('click', () => {
          if (state.hideNames) return;
          const L = state.lanes[state.activeLane];
          L.algoId = i.id;
          L.select.value = i.id;
          if (state.input === 'killer') recordAll(); else recordLanes([L]);
          renderCheatHighlight();
          scheduleUrl();
          $('.stagebox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        tbody.appendChild(tr);
      }
    }
    renderCheatHighlight();
  }

  function renderCheatHighlight() {
    const L = state.lanes[state.activeLane];
    const id = L && !state.hideNames ? L.algoId : null;
    $$('#cheatTable tbody tr[data-id]').forEach((tr) => tr.classList.toggle('current', tr.dataset.id === id));
  }

  // ------------------------------------------------------------------
  //  URL state (shareable links)
  // ------------------------------------------------------------------
  let urlTimer = null;
  let urlFrozen = false;
  function b64enc(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }

  function buildHash() {
    const p = new URLSearchParams();
    p.set('a', state.lanes.map((l) => l.algoId).join(','));
    p.set('n', String(state.n));
    p.set('in', state.input);
    p.set('s', String(state.seed));
    p.set('v', state.view);
    p.set('sp', String(Math.round(state.opsPerSec * 10) / 10));
    if (!defaultWeights()) p.set('w', state.weights.join(','));
    p.set('lang', I18N.lang);
    if (state.theme !== 'auto') p.set('th', state.theme);
    if (state.colorblind) p.set('cb', '1');
    if (state.rainbow) p.set('rb', '1');
    if (!state.showAux) p.set('aux', '0');
    if (!state.showRanges) p.set('rng', '0');
    if (state.input === 'custom' && state.customValues && state.customValues.length <= 1024) p.set('cv', state.customValues.join('.'));
    if (state.customCode && state.lanes.some((l) => l.algoId === 'custom')) p.set('code', b64enc(state.customCode));
    return '#' + p.toString();
  }
  function scheduleUrl() {
    if (urlFrozen) return;
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => { try { history.replaceState(null, '', buildHash()); } catch (e) { /* ignore */ } }, 300);
  }
  function readHash() {
    const h = location.hash.replace(/^#/, '');
    if (!h) return null;
    const p = new URLSearchParams(h);
    const r = {};
    if (p.get('a')) r.algos = p.get('a').split(',').filter((id) => INFO_BY_ID[id] || id === 'custom').slice(0, MAX_LANES);
    if (p.get('n')) r.n = clamp(parseInt(p.get('n'), 10) || 100, MIN_N, MAX_N);
    if (p.get('in')) r.input = p.get('in');
    if (p.get('s')) r.seed = (parseInt(p.get('s'), 10) >>> 0) || 1;
    if (VIEWS.includes(p.get('v'))) r.view = p.get('v');
    if (p.get('sp')) r.speed = parseFloat(p.get('sp'));
    if (p.get('w')) { const w = p.get('w').split(',').map(Number); if (w.length === 4 && w.every((x) => x >= 0 && x <= 10)) r.weights = w; }
    if (p.get('lang')) r.lang = p.get('lang');
    if (p.get('th')) r.theme = p.get('th');
    r.cb = p.get('cb') === '1';
    r.rb = p.get('rb') === '1';
    r.aux = p.get('aux') !== '0';
    r.rng = p.get('rng') !== '0';
    if (p.get('cv')) { const cv = p.get('cv').split('.').map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= 9999); if (cv.length >= 2) r.cv = cv; }
    if (p.get('code')) { try { r.code = b64dec(p.get('code')); } catch (e) { /* ignore */ } }
    return r;
  }

  async function copyLink() {
    try { history.replaceState(null, '', buildHash()); } catch (e) { /* ignore */ }
    const url = location.href;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    toast(ok ? (location.protocol === 'file:' ? t('link.copiedLocal') : t('link.copied')) : t('link.failed'), 5000);
  }

  // ------------------------------------------------------------------
  //  Toast
  // ------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, ms = 3500) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ------------------------------------------------------------------
  //  Theme / language
  // ------------------------------------------------------------------
  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', state.theme);
    if (state.colorblind) root.setAttribute('data-cb', '1'); else root.removeAttribute('data-cb');
    $('#theme').value = state.theme;
    Render.refreshTheme();
    if (state.initial.length) buildPalettes();
    state.lanes.forEach((l) => { l.dirty = true; l._discKey = null; });
  }

  function refreshLanguage() {
    I18N.applyDom(document);
    document.documentElement.lang = I18N.lang;
    $$('#langSeg button').forEach((b) => b.classList.toggle('active', b.dataset.lang === I18N.lang));
    state.lanes.forEach((L) => {
      fillAlgoSelect(L.select, L.algoId);
      $('.lane-remove', L.el).title = t('race.remove');
      if (L.trace) { buildStatsDom(L); updateLaneNote(L); }
      if (L.stabilityResult) { L.stabilityResult = null; finishStability(L); }
      L.dirty = true;
    });
    layoutChanged();
    buildCheatSheet();
    renderInfo();
    renderCodePanel(true);
    renderNarration(true);
    updatePlayButton();
    updateDurationHint();
    setSpeed(state.opsPerSec);
    setWeightsUiOnly();
    updateSizeUi();
    lastUiT = -1;
    if (state.input === 'killer' && state.killerFor) { $('#inputNote').textContent = t('input.killerNote', { name: algoName(state.killerFor) }); }
  }
  function setWeightsUiOnly() {
    $$('#weights output').forEach((o) => { o.textContent = String(state.weights[+o.dataset.w]).replace('.', I18N.lang === 'de' ? ',' : '.'); });
  }

  // ------------------------------------------------------------------
  //  Wiring
  // ------------------------------------------------------------------
  function wire() {
    $('#size').addEventListener('input', (e) => { $('#sizeOut').textContent = fmt(sliderToN(+e.target.value)); });
    $('#size').addEventListener('change', (e) => setSize(sliderToN(+e.target.value)));
    $$('#sizePresets .chip').forEach((c) => c.addEventListener('click', () => setSize(+c.dataset.n)));
    $('#input').addEventListener('change', (e) => setInput(e.target.value));
    $('#customApply').addEventListener('click', applyCustomText);
    $('#newArray').addEventListener('click', () => {
      if (state.input === 'custom') { state.input = 'shuffled'; $('#input').value = 'shuffled'; showCustomBox(false); }
      regenerate(true);
    });
    $('#drawBtn').addEventListener('click', () => setDrawing(!state.drawing));
    window.addEventListener('pointerup', () => { if (state.drawing) endDrawing(); });

    $('#play').addEventListener('click', togglePlay);
    $('#stepFwd').addEventListener('click', () => step(1));
    $('#stepBack').addEventListener('click', () => step(-1));
    $('#rewind').addEventListener('click', () => { pause(); seekTo(0); });
    $('#toEnd').addEventListener('click', () => { pause(); seekTo(state.maxCost); });
    $('#speed').addEventListener('input', (e) => setSpeed(sliderToOps(+e.target.value)));
    $$('#speedPresets .chip').forEach((c) => c.addEventListener('click', () => setSpeed(+c.dataset.ops)));

    timelineEl.addEventListener('pointerdown', () => { scrubbing = true; });
    window.addEventListener('pointerup', () => { scrubbing = false; });
    timelineEl.addEventListener('input', (e) => seekTo((+e.target.value / 10000) * state.maxCost));

    $('#costPreset').addEventListener('change', (e) => {
      const p = e.target.value;
      if (COST_PRESETS[p]) setWeights(COST_PRESETS[p], p); else { state.costPreset = 'custom'; }
    });
    $$('#weights input').forEach((inp) => {
      inp.addEventListener('input', () => {
        const w = state.weights.slice();
        w[+inp.dataset.w] = +inp.value;
        $(`#weights output[data-w="${inp.dataset.w}"]`).textContent = String(+inp.value).replace('.', I18N.lang === 'de' ? ',' : '.');
        void w;
      });
      inp.addEventListener('change', () => {
        const w = state.weights.slice();
        w[+inp.dataset.w] = +inp.value;
        const preset = Object.keys(COST_PRESETS).find((k) => COST_PRESETS[k].join() === w.join()) || 'custom';
        setWeights(w, preset);
      });
    });

    $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    $('#rainbow').addEventListener('change', (e) => { state.rainbow = e.target.checked; state.lanes.forEach((l) => { l.dirty = true; }); scheduleUrl(); });
    $('#colorblind').addEventListener('change', (e) => { state.colorblind = e.target.checked; applyTheme(); scheduleUrl(); });
    $('#showAux').addEventListener('change', (e) => { state.showAux = e.target.checked; state.lanes.forEach((l) => { l.dirty = true; }); scheduleUrl(); });
    $('#showRanges').addEventListener('change', (e) => { state.showRanges = e.target.checked; state.lanes.forEach((l) => { l.dirty = true; }); scheduleUrl(); });
    $('#sound').addEventListener('change', (e) => { state.sound = e.target.checked; Sound.enabled = state.sound; if (state.sound) Sound.ensure(); });
    $('#volume').addEventListener('input', (e) => {
      state.volume = +e.target.value / 100;
      $('#volOut').textContent = `${e.target.value}%`;
      Sound.setVolume(state.volume);
    });
    $('#addLane').addEventListener('click', () => addLane());

    $$('#langSeg button').forEach((b) => b.addEventListener('click', () => { I18N.set(b.dataset.lang); scheduleUrl(); }));
    $('#theme').addEventListener('change', (e) => { state.theme = e.target.value; applyTheme(); scheduleUrl(); });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', () => { if (state.theme === 'auto') applyTheme(); });

    $('#dockCode').addEventListener('click', () => setDock(state.dock === 'code' ? null : 'code'));
    $('#dockQuiz').addEventListener('click', () => setDock(state.dock === 'quiz' ? null : 'quiz'));
    $('#copyLink').addEventListener('click', copyLink);

    $$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

    // after a mouse click, drop focus so Space / arrows keep controlling playback
    document.addEventListener('click', (e) => {
      if (e.detail > 0) {
        setTimeout(() => {
          const el = document.activeElement;
          if (el && (el.tagName === 'BUTTON' || el.type === 'checkbox')) el.blur();
        }, 0);
      }
    });
    document.addEventListener('pointerup', () => {
      const el = document.activeElement;
      if (el && el.type === 'range') setTimeout(() => el.blur(), 0);
    });

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target, tag = tg.tagName;
      if (tag === 'SELECT' || tag === 'TEXTAREA' || tg.isContentEditable || (tag === 'INPUT' && !['range', 'checkbox'].includes(tg.type))) return;
      const onControl = tag === 'BUTTON' || (tag === 'INPUT' && tg.type === 'checkbox');
      const onRange = tag === 'INPUT' && tg.type === 'range';
      switch (e.key) {
        case ' ': if (onControl) return; e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': if (onRange) return; e.preventDefault(); step(1); break;
        case 'ArrowLeft': if (onRange) return; e.preventDefault(); step(-1); break;
        case 'n': case 'N': $('#newArray').click(); break;
        case 'm': case 'M': { const cb = $('#sound'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); break; }
        case 'v': case 'V': setView(VIEWS[(VIEWS.indexOf(state.view) + 1) % VIEWS.length]); break;
        case 'c': case 'C': setDock(state.dock === 'code' ? null : 'code'); break;
      }
    });
  }

  function showTab(name) {
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tabpanel').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
    if (name === 'analysis' && SV.Analysis) SV.Analysis.onShow();
  }

  // ------------------------------------------------------------------
  //  API for the other modules (quiz, editor, analysis, export)
  // ------------------------------------------------------------------
  const App = {
    state, t, fmt, esc, toast, algoName, INFO_BY_ID,
    play, pause, togglePlay, step, seekTo, setSpeed, setView, recordAll, allFinished,
    renderInfo, renderCheatHighlight,
    get lanes() { return state.lanes; },
    activeLane() { return state.lanes[state.activeLane]; },
    redraw() { state.lanes.forEach((l) => { l.dirty = true; }); },
    snapshot() {
      return {
        algos: state.lanes.map((l) => l.algoId), n: state.n, input: state.input, seed: state.seed, view: state.view,
        speed: state.opsPerSec, weights: state.weights.slice(), preset: state.costPreset, custom: state.customValues,
      };
    },
    /** Replace the whole setup (used by the quiz). */
    async setup(o) {
      urlFrozen = !!o.freezeUrl;
      pause();
      while (state.lanes.length > o.algos.length) { const L = state.lanes.pop(); L.el.remove(); }
      o.algos.forEach((id, i) => {
        if (state.lanes[i]) { state.lanes[i].algoId = id; state.lanes[i].select.value = id; }
        else { const L = createLane(id); state.lanes.push(L); lanesEl.appendChild(L.el); }
      });
      state.activeLane = 0;
      layoutChanged();
      state.lanes.forEach((l, k) => l.el.classList.toggle('active', k === 0));
      if (o.weights) { state.weights = o.weights.slice(); state.costPreset = o.preset || 'steps'; updateOpCost(); $('#costPreset').value = state.costPreset; setWeightsUiOnly(); $$('#weights input').forEach((inp) => { inp.value = state.weights[+inp.dataset.w]; }); }
      state.n = o.n; state.input = o.input; state.seed = o.seed != null ? o.seed : newSeed();
      if (o.custom) state.customValues = o.custom;
      $('#input').value = state.input;
      showCustomBox(state.input === 'custom');
      if (o.view) setView(o.view);
      if (o.speed) setSpeed(o.speed);
      await recordAll();
      renderCheatHighlight();
      if (!o.freezeUrl) scheduleUrl();
    },
    setHidden(on) {
      state.hideNames = on;
      state.lanes.forEach((L) => {
        L.select.hidden = on;
        L.mystery.hidden = !on;
        L.mystery.textContent = t('quiz.mystery');
      });
      lanesEl.classList.toggle('hidden-names', on);
      renderInfo(); renderCheatHighlight(); renderCodePanel(true); renderNarration(true);
    },
    setDock,
    /** Load custom code from the editor into the active lane. */
    async useCustom(code, lines, instrumented) {
      state.customCode = code;
      state.customLines = lines;
      state.customInstrumented = instrumented || null;
      const L = state.lanes[state.activeLane];
      state.lanes.forEach((l) => fillAlgoSelect(l.select, l.algoId));
      L.algoId = 'custom';
      L.select.value = 'custom';
      scheduleUrl();
      if (state.input === 'killer') await recordAll(); else await recordLanes([L]);
      renderInfo();
      $('.stagebox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    renderEnv,
  };
  SV.App = App;

  // ------------------------------------------------------------------
  //  Init
  // ------------------------------------------------------------------
  async function init() {
    const h = readHash() || {};
    I18N.init(h.lang);
    I18N.onChange(refreshLanguage);
    state.theme = ['auto', 'dark', 'light'].includes(h.theme) ? h.theme : 'auto';
    state.colorblind = !!h.cb;
    state.rainbow = !!h.rb;
    state.showAux = h.aux !== false;
    state.showRanges = h.rng !== false;
    $('#colorblind').checked = state.colorblind;
    $('#rainbow').checked = state.rainbow;
    $('#showAux').checked = state.showAux;
    $('#showRanges').checked = state.showRanges;
    applyTheme();
    wire();
    if (h.code) { state.customCode = h.code; }
    if (SV.Editor) SV.Editor.init(App, h.code);
    if (SV.Quiz) SV.Quiz.init(App);
    if (SV.Analysis) SV.Analysis.init(App);
    if (SV.Exporter) SV.Exporter.init(App);
    Recorder.init();

    state.n = h.n || 100;
    state.seed = h.seed || newSeed();
    const inputs = $$('#input option').map((o) => o.value);
    state.input = inputs.includes(h.input) ? h.input : 'shuffled';
    if (state.input === 'custom') {
      if (h.cv) state.customValues = h.cv; else state.input = 'shuffled';
    }
    $('#input').value = state.input;
    showCustomBox(state.input === 'custom');
    if (h.weights) {
      state.weights = h.weights;
      state.costPreset = Object.keys(COST_PRESETS).find((k) => COST_PRESETS[k].join() === h.weights.join()) || 'custom';
      updateOpCost();
      $('#costPreset').value = state.costPreset;
      $$('#weights input').forEach((inp) => { inp.value = state.weights[+inp.dataset.w]; });
    }
    let algos = h.algos && h.algos.length ? h.algos : ['quickhoare'];
    if (!state.customCode) algos = algos.filter((a) => a !== 'custom');
    if (!algos.length) algos = ['quickhoare'];
    for (const id of algos) {
      const L = createLane(id);
      state.lanes.push(L);
      lanesEl.appendChild(L.el);
    }
    layoutChanged();
    setView(h.view || 'bars');
    setSpeed(h.speed || 500);
    refreshLanguage();
    setActiveLane(0);
    requestAnimationFrame((ts) => { lastFrame = ts; frame(ts); });
    await recordAll();
  }

  init();
})();
