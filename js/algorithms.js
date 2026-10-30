/* =====================================================================
 * algorithms.js  –  recording engine + 42 sorting algorithms
 * ---------------------------------------------------------------------
 * Everything lives inside ONE function (SortVizCore) on purpose: its
 * source text is reused to start a Web Worker from a Blob, so recording
 * can run in the background even when the page is opened via file://.
 * Do not reference anything outside this function.
 *
 * Algorithms work on a Tracker T instead of a raw array. T performs the
 * real operation AND records it. The app replays the recording.
 *
 *   T.n                      length
 *   T.ln(k)                  current pseudocode line (1-based)
 *   T.cmp(i, j)              compare a[i], a[j]            → <0, 0, >0
 *   T.cmpv(i, v)             compare a[i] with a held value
 *   T.cmpa(x, y, h1,h2,a1,a2) compare values held elsewhere (highlight
 *                            main h1/h2 and aux-track-0 a1/a2)
 *   T.cmpMA(i, p)            compare a[i] with aux0[p]
 *   T.cmpAA(p, q, h)         compare aux0[p] with aux0[q]
 *   T.get(i) / T.set(i, v)   read / write
 *   T.move(dst, src)         a[dst] = a[src]   (one step)
 *   T.swap(i, j)
 *   T.aux(track, size, label, kind)   declare helper array 0 or 1
 *   T.auxSet(t, idx, v, src) / T.auxGet(t, idx) / T.auxVal(t, idx)
 *   T.toAux(t, idx, i)       aux[t][idx] = a[i]            (one step)
 *   T.fromAux(t, idx, i)     a[i] = aux[t][idx]            (one step)
 *   T.key(v)                 sort key of a value (stability test packs ids)
 *   T.mark(i, j)  T.enter(lo, hi)  T.leave()  T.note(key, a, b, c)  T.say(text)
 *   T.random()  T.randInt(k)  seeded, reproducible
 * ===================================================================== */
function SortVizCore(global) {
  'use strict';

  // ---------------------------------------------------------------- ops
  const OP = { CMP: 0, CMPV: 1, CMPA: 2, SWAP: 3, SET: 4, GET: 5, AUXSET0: 6, AUXSET1: 7, AUXGET0: 8, AUXGET1: 9 };
  // cost class of every op: 0 compare, 1 swap, 2 write, 3 read
  const OP_CLASS = [0, 0, 0, 1, 2, 3, 2, 2, 3, 3];
  const INF = 32767;
  const MAX_VALUE = 32766;
  const CAP_REACHED = { capReached: true };

  // note keys (index is stored in the trace; texts live in i18n.js)
  const NOTES = [
    'pass', 'earlyExit', 'forward', 'backward', 'round', 'gap', 'selectMin', 'selectMinMax', 'cycleStart',
    'flip', 'heapBuilt', 'extractMax', 'merge', 'width', 'run', 'minrun', 'pivotPlaced', 'depthLimit',
    'finalInsertion', 'patternBreak', 'heapFallback', 'partialInsertion', 'equalBlock', 'leoAdd', 'leoRemove',
    'symMerge', 'rotate', 'blocks', 'fjLevel', 'fjInsert', 'deal', 'collect', 'buildTree', 'traverse',
    'strand', 'mergeStrand', 'beadsDrop', 'beadsFall', 'sleeping', 'wake', 'rods', 'pullTallest', 'count',
    'prefix', 'place', 'copyBack', 'digit', 'bucketsSplit', 'bucketSort', 'bitonicMerge', 'phase', 'shuffle',
    'findMax', 'insertKey', 'custom', 'reverseRun', 'insertionBlocks', 'partition', 'findMin', 'dualPartition',
  ];
  const NOTE_INDEX = Object.fromEntries(NOTES.map((k, i) => [k, i]));

  /** Adds (sign = +1) or removes (sign = -1) the statistics of one event.
   *  out = [comparisons, swaps, writes, reads, auxAccesses] */
  function statDeltas(op, x, y, z, w, out, sign) {
    switch (op) {
      case 0: out[0] += sign; out[3] += 2 * sign; break;
      case 1: out[0] += sign; out[3] += sign; break;
      case 2: out[0] += sign; out[4] += ((z >= 0) + (w >= 0)) * sign; break;
      case 3: out[1] += sign; out[2] += 2 * sign; out[3] += 2 * sign; break;
      case 4: out[2] += sign; if (w >= 0) out[3] += sign; else if (w <= -2) out[4] += sign; break;
      case 5: out[3] += sign; break;
      case 6: case 7: out[4] += sign; if (w >= 0) out[3] += sign; break;
      case 8: case 9: out[4] += sign; break;
    }
  }

  // ---------------------------------------------------------------- rng
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // ------------------------------------------------ growable typed column
  class Col {
    constructor(Type, size = 256) { this.T = Type; this.a = new Type(size); this.len = 0; }
    push(v) {
      if (this.len === this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; }
      this.a[this.len++] = v;
    }
    last() { return this.a[this.len - 1]; }
    out() { return this.a.slice(0, this.len); }
  }

  // ---------------------------------------------------------------- tracker
  class Tracker {
    constructor(values, o = {}) {
      this.n = values.length;
      this.a = Int32Array.from(values);
      this.cap = o.cap || 3000000;
      this.countOnly = !!o.countOnly;
      this.keyDiv = o.keyDiv || 1;
      this.compare = o.compare || null;
      this.rng = mulberry32((o.seed >>> 0) || 1);
      this.len = 0;
      this.L = 0;
      this.auxArr = [null, null];
      this.auxDefs = [];
      this.auxMax = [0, 0];
      this.stats = [0, 0, 0, 0, 0];
      this.classCounts = [0, 0, 0, 0];
      this.metaCap = this.cap * 2;
      if (!this.countOnly) {
        this._size = 1 << 14;
        this.op = new Uint8Array(this._size);
        this.x = new Int16Array(this._size);
        this.y = new Int16Array(this._size);
        this.z = new Int16Array(this._size);
        this.w = new Int32Array(this._size);
        this.lnArr = new Uint8Array(this._size);
        this.markAt = new Col(Int32Array); this.m1 = new Col(Int16Array); this.m2 = new Col(Int16Array);
        this.stAt = new Col(Int32Array); this.stType = new Col(Int8Array); this.stLo = new Col(Int16Array); this.stHi = new Col(Int16Array);
        this.ntAt = new Col(Int32Array); this.ntKey = new Col(Uint8Array);
        this.ntA = new Col(Int32Array); this.ntB = new Col(Int32Array); this.ntC = new Col(Int32Array);
        this.strings = [];
        this.stack = [];
        this.maxDepth = 0;
        this.metaCount = 0;
      }
    }

    _push(op, x, y, z, w) {
      if (this.len >= this.cap) throw CAP_REACHED;
      statDeltas(op, x, y, z, w, this.stats, 1);
      this.classCounts[OP_CLASS[op]]++;
      if (this.countOnly) { this.len++; return; }
      if (this.len === this._size) this._grow();
      const k = this.len++;
      this.op[k] = op; this.x[k] = x; this.y[k] = y; this.z[k] = z; this.w[k] = w; this.lnArr[k] = this.L;
    }

    _grow() {
      const s = Math.min(this._size * 2, this.cap + 1);
      const g = (Type, a) => { const b = new Type(s); b.set(a); return b; };
      this.op = g(Uint8Array, this.op); this.x = g(Int16Array, this.x); this.y = g(Int16Array, this.y);
      this.z = g(Int16Array, this.z); this.w = g(Int32Array, this.w); this.lnArr = g(Uint8Array, this.lnArr);
      this._size = s;
    }

    // ---- keys & comparisons
    key(v) { return this.keyDiv === 1 ? v : Math.floor(v / this.keyDiv); }
    _c(x, y) { return this.compare ? this.compare(x, y) : this.key(x) - this.key(y); }
    ln(k) { this.L = k; }
    cmp(i, j) { this._push(0, i, j, 0, -1); return this._c(this.a[i], this.a[j]); }
    cmpv(i, v) { this._push(1, i, -1, 0, -1); return this._c(this.a[i], v); }
    cmpa(x, y, h1 = -1, h2 = -1, a1 = -1, a2 = -1) { this._push(2, h1, h2, a1, a2); return this._c(x, y); }
    cmpMA(i, p) { return this.cmpa(this.a[i], this.auxArr[0][p], i, -1, p, -1); }
    cmpAA(p, q, h = -1) { return this.cmpa(this.auxArr[0][p], this.auxArr[0][q], h, -1, p, q); }

    // ---- main array
    get(i) { this._push(5, i, -1, 0, -1); return this.a[i]; }
    set(i, v) { this._push(4, i, v, this.a[i], -1); this.a[i] = v; }
    move(dst, src) { const v = this.a[src]; this._push(4, dst, v, this.a[dst], src); this.a[dst] = v; }
    swap(i, j) {
      if (i === j) return;
      this._push(3, i, j, 0, -1);
      const t = this.a[i]; this.a[i] = this.a[j]; this.a[j] = t;
    }

    // ---- helper arrays
    aux(track, size, label, kind = 'values') {
      this.auxArr[track] = new Int32Array(size);
      this.auxDefs[track] = { size, label, kind };
    }
    auxSet(t, idx, v, src = -1) {
      const A = this.auxArr[t];
      this._push(6 + t, idx, v, A[idx], src);
      A[idx] = v;
      if (v !== INF && v > this.auxMax[t]) this.auxMax[t] = v;
    }
    auxGet(t, idx) { this._push(8 + t, idx, -1, 0, -1); return this.auxArr[t][idx]; }
    auxVal(t, idx) { return this.auxArr[t][idx]; }
    toAux(t, idx, i) { const v = this.a[i]; this.auxSet(t, idx, v, i); return v; }
    fromAux(t, idx, i) {
      const v = this.auxArr[t][idx];
      this._push(4, i, v, this.a[i], -(2 + t * 65536 + idx));
      this.a[i] = v;
      return v;
    }

    // ---- zero-time meta information
    _meta() { if (++this.metaCount > this.metaCap) throw CAP_REACHED; }
    mark(i = -1, j = -1) {
      if (this.countOnly) return;
      const c = this.markAt, k = c.len - 1;
      if (k >= 0 && this.m1.a[k] === i && this.m2.a[k] === j) return;
      if (k >= 0 && c.a[k] === this.len) { this.m1.a[k] = i; this.m2.a[k] = j; return; }
      this._meta();
      c.push(this.len); this.m1.push(i); this.m2.push(j);
    }
    enter(lo, hi) {
      if (this.countOnly) return;
      this._meta();
      this.stack.push([lo, hi]);
      if (this.stack.length > this.maxDepth) this.maxDepth = this.stack.length;
      this.stAt.push(this.len); this.stType.push(1); this.stLo.push(lo); this.stHi.push(hi);
    }
    leave() {
      if (this.countOnly) return;
      const top = this.stack.pop();
      if (!top) return;
      this._meta();
      this.stAt.push(this.len); this.stType.push(-1); this.stLo.push(top[0]); this.stHi.push(top[1]);
    }
    note(key, a = 0, b = 0, c = 0) {
      if (this.countOnly) return;
      const k = NOTE_INDEX[key];
      if (k === undefined) throw new Error('unknown note ' + key);
      this._meta();
      this.ntAt.push(this.len); this.ntKey.push(k); this.ntA.push(a); this.ntB.push(b); this.ntC.push(c);
    }
    say(text) {
      if (this.countOnly) return;
      this.strings.push(String(text).slice(0, 200));
      this.note('custom', this.strings.length - 1);
    }
    random() { return this.rng(); }
    randInt(k) { return Math.floor(this.rng() * k); }
  }

  // ---------------------------------------------------------------- recording
  const ALG = {}, CODE = {};
  function def(id, code, fn) { ALG[id] = fn; CODE[id] = code; }

  function algoSeed(seed, id) { return (seed ^ hashStr(id)) >>> 0; }

  /** Record an algorithm. Returns a trace object (typed arrays). */
  function record(algoId, values, opts = {}) {
    const fn = opts.fn || ALG[algoId];
    const T = new Tracker(values, { cap: opts.cap, seed: algoSeed(opts.seed || 1, algoId), keyDiv: opts.keyDiv });
    let capped = false, error = null;
    try { fn(T); } catch (e) {
      if (e === CAP_REACHED) capped = true;
      else error = (e && e.message) ? e.message : String(e);
    }
    T.metaCap = Infinity;
    while (T.stack.length) T.leave();
    T.mark(-1, -1);
    const L = T.len;
    return {
      len: L, capped, error,
      op: T.op.slice(0, L), x: T.x.slice(0, L), y: T.y.slice(0, L), z: T.z.slice(0, L),
      w: T.w.slice(0, L), ln: T.lnArr.slice(0, L),
      markAt: T.markAt.out(), m1: T.m1.out(), m2: T.m2.out(),
      stAt: T.stAt.out(), stType: T.stType.out(), stLo: T.stLo.out(), stHi: T.stHi.out(),
      ntAt: T.ntAt.out(), ntKey: T.ntKey.out(), ntA: T.ntA.out(), ntB: T.ntB.out(), ntC: T.ntC.out(),
      strings: T.strings,
      auxDefs: T.auxDefs.filter(Boolean).map((d) => ({ size: d.size, label: d.label, kind: d.kind })),
      auxMax: T.auxMax.slice(),
      maxDepth: T.maxDepth,
      stats: T.stats.slice(),
      classCounts: T.classCounts.slice(),
      result: T.a,
    };
  }

  /** Count operations only (no recording) – used by the analysis tab. */
  function countRun(algoId, values, opts = {}) {
    const fn = opts.fn || ALG[algoId];
    const T = new Tracker(values, { cap: opts.cap || 30000000, countOnly: true, seed: algoSeed(opts.seed || 1, algoId), keyDiv: opts.keyDiv });
    let capped = false;
    try { fn(T); } catch (e) { if (e === CAP_REACHED) capped = true; else throw e; }
    return { len: T.len, capped, stats: T.stats.slice(), classCounts: T.classCounts.slice() };
  }

  /** Transferable buffers of a trace (for postMessage). */
  function traceBuffers(tr) {
    return ['op', 'x', 'y', 'z', 'w', 'ln', 'markAt', 'm1', 'm2', 'stAt', 'stType', 'stLo', 'stHi', 'ntAt', 'ntKey', 'ntA', 'ntB', 'ntC', 'result']
      .map((k) => tr[k].buffer);
  }

  // ---------------------------------------------------------------- inputs
  function makeInput(kind, n, seed, extra = {}) {
    const rnd = mulberry32(seed >>> 0);
    const a = new Int32Array(n);
    for (let i = 0; i < n; i++) a[i] = i + 1;
    const shuffle = () => {
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    };
    let keyDiv = 1;
    switch (kind) {
      case 'shuffled': shuffle(); break;
      case 'dups': for (let i = 0; i < n; i++) a[i] = 1 + Math.floor(rnd() * n); break;
      case 'nearly': {
        const swaps = Math.max(2, Math.round(n * 0.04));
        for (let k = 0; k < swaps; k++) {
          const i = Math.floor(rnd() * n);
          const j = Math.min(n - 1, Math.max(0, i + Math.floor(rnd() * 9) - 4));
          const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        break;
      }
      case 'reversed': a.reverse(); break;
      case 'few': for (let i = 0; i < n; i++) a[i] = Math.max(1, Math.round((1 + Math.floor(rnd() * 5)) * n / 5)); break;
      case 'organ': { const h = Math.ceil(n / 2); for (let i = 0; i < n; i++) a[i] = i < h ? 2 * i + 1 : 2 * (n - i); break; }
      case 'sawtooth': { const t = Math.max(2, Math.ceil(n / 4)); for (let i = 0; i < n; i++) a[i] = 1 + Math.floor((i % t) * n / t); break; }
      case 'stability': {
        keyDiv = n;
        for (let i = 0; i < n; i++) a[i] = (1 + Math.floor(rnd() * 6)) * n + i;
        break;
      }
      case 'custom': {
        const v = extra.values || [];
        for (let i = 0; i < n; i++) a[i] = v[i] || 1;
        break;
      }
      case 'sorted': default: break;
    }
    return { values: a, keyDiv };
  }

  /** McIlroy's "antiqsort" adversary: builds an input that is bad for `algoId`. */
  function makeKiller(algoId, n, seed) {
    const GAS = n;
    const val = new Int32Array(n).fill(GAS);
    let nsolid = 0, candidate = -1;
    const compare = (x, y) => {
      if (x >= n || y >= n || x < 0 || y < 0) return (x >= n ? 1 : 0) - (y >= n ? 1 : 0);
      if (val[x] === GAS && val[y] === GAS) { if (x === candidate) val[x] = nsolid++; else val[y] = nsolid++; }
      if (val[x] === GAS) candidate = x; else if (val[y] === GAS) candidate = y;
      return val[x] - val[y];
    };
    const ids = new Int32Array(n);
    for (let i = 0; i < n; i++) ids[i] = i;
    const T = new Tracker(ids, { countOnly: true, compare, cap: 40000000, seed: algoSeed(seed || 1, algoId) });
    try { ALG[algoId](T); } catch (e) { if (e !== CAP_REACHED) throw e; }
    for (let i = 0; i < n; i++) if (val[i] === GAS) val[i] = nsolid++;
    const out = new Int32Array(n);
    for (let i = 0; i < n; i++) out[i] = val[i] + 1;
    return { values: out, keyDiv: 1 };
  }

  // =================================================================
  //  shared helpers
  // =================================================================
  /** Insertion sort on [lo, hi]. hand = use aux track 0 (size 1) as "key in hand". */
  function insertionRange(T, lo, hi, L, hand) {
    for (let i = lo + 1; i <= hi; i++) {
      T.ln(L.key);
      let j = i - 1;
      if (hand) {
        T.toAux(0, 0, i);
        while (j >= lo) {
          T.ln(L.cmp);
          if (T.cmpMA(j, 0) <= 0) break;
          T.ln(L.shift); T.move(j + 1, j); j--;
        }
        if (j + 1 !== i) { T.ln(L.drop); T.fromAux(0, 0, j + 1); }
      } else {
        const key = T.get(i);
        while (j >= lo) {
          T.ln(L.cmp);
          if (T.cmpv(j, key) <= 0) break;
          T.ln(L.shift); T.move(j + 1, j); j--;
        }
        if (j + 1 !== i) { T.ln(L.drop); T.set(j + 1, key); }
      }
    }
  }

  /** Heap sort on [lo, hi]. */
  function heapRange(T, lo, hi, L) {
    const size = hi - lo + 1;
    const sift = (i, end) => {
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        T.ln(L.cmp);
        if (l < end && T.cmp(lo + l, lo + m) > 0) m = l;
        if (r < end && T.cmp(lo + r, lo + m) > 0) m = r;
        if (m === i) return;
        T.ln(L.swap);
        T.swap(lo + i, lo + m);
        i = m;
      }
    };
    T.enter(lo, hi);
    for (let i = (size >> 1) - 1; i >= 0; i--) { T.ln(L.build); sift(i, size); }
    T.note('heapBuilt');
    for (let end = size - 1; end > 0; end--) {
      T.mark(lo + end);
      T.ln(L.extract);
      T.note('extractMax', T.a[lo], lo + end);
      T.swap(lo, lo + end);
      T.leave(); T.enter(lo, lo + end - 1);
      sift(0, end);
    }
    T.leave();
    T.mark(-1);
  }

  /** Median-of-three + Hoare-style partition. Returns the pivot's final index. */
  function partitionMedian3(T, lo, hi, L) {
    const mid = (lo + hi) >> 1;
    T.ln(L.median);
    if (T.cmp(mid, lo) < 0) T.swap(mid, lo);
    if (T.cmp(hi, lo) < 0) T.swap(hi, lo);
    if (T.cmp(hi, mid) < 0) T.swap(hi, mid);
    T.swap(lo, mid);
    T.mark(lo);
    T.note('partition', lo, hi, T.a[lo]);
    let i = lo, j = hi + 1;
    for (;;) {
      T.ln(L.scanI);
      while (T.cmp(++i, lo) < 0) if (i === hi) break;
      T.ln(L.scanJ);
      while (T.cmp(lo, --j) < 0) if (j === lo) break;
      if (i >= j) break;
      T.ln(L.swap);
      T.swap(i, j);
    }
    T.ln(L.place);
    T.swap(lo, j);
    T.note('pivotPlaced', T.a[j], j);
    T.mark(-1);
    return j;
  }

  /** Merge a[lo..mid] and a[mid+1..hi] through aux track 0. */
  function mergeWithAux(T, lo, mid, hi, L) {
    T.note('merge', lo, mid, hi);
    T.ln(L.copy);
    for (let k = lo; k <= hi; k++) T.toAux(0, k, k);
    let i = lo, j = mid + 1;
    T.ln(L.take);
    for (let k = lo; k <= hi; k++) {
      if (i > mid) T.fromAux(0, j++, k);
      else if (j > hi) T.fromAux(0, i++, k);
      else if (T.cmpAA(j, i, k) < 0) T.fromAux(0, j++, k);
      else T.fromAux(0, i++, k);
    }
  }

  const digitOf = (T, v, exp) => Math.floor(T.key(v) / exp) % 10;

  // =================================================================
  //  EXCHANGE SORTS
  // =================================================================
  def('bubble', [
    'for end = n-1 down to 1:',
    '  swapped = false',
    '  for i = 0 to end-1:',
    '    if a[i] > a[i+1]:',
    '      swap(a[i], a[i+1]); swapped = true',
    '  if not swapped: stop       // already sorted',
  ], function (T) {
    const n = T.n;
    for (let end = n - 1; end > 0; end--) {
      T.enter(0, end); T.note('pass', n - end);
      let swapped = false;
      for (let i = 0; i < end; i++) {
        T.ln(4);
        if (T.cmp(i, i + 1) > 0) { T.ln(5); T.swap(i, i + 1); swapped = true; }
      }
      T.leave();
      if (!swapped) { T.note('earlyExit'); break; }
    }
  });

  def('cocktail', [
    'lo = 0, hi = n-1',
    'while lo < hi:',
    '  for i = lo to hi-1:            // forward pass',
    '    if a[i] > a[i+1]: swap, last = i',
    '  hi = last',
    '  for i = hi down to lo+1:       // backward pass',
    '    if a[i-1] > a[i]: swap, last = i',
    '  lo = last',
  ], function (T) {
    let lo = 0, hi = T.n - 1;
    while (lo < hi) {
      T.enter(lo, hi);
      let last = lo;
      T.note('forward');
      for (let i = lo; i < hi; i++) { T.ln(4); if (T.cmp(i, i + 1) > 0) { T.swap(i, i + 1); last = i; } }
      hi = last;
      T.note('backward');
      for (let i = hi; i > lo; i--) { T.ln(7); if (T.cmp(i - 1, i) > 0) { T.swap(i - 1, i); last = i; } }
      lo = last;
      T.leave();
    }
  });

  def('oddeven', [
    'repeat:',
    '  sorted = true',
    '  for i = 1, 3, 5, …:         // odd phase',
    '    if a[i] > a[i+1]: swap; sorted = false',
    '  for i = 0, 2, 4, …:         // even phase',
    '    if a[i] > a[i+1]: swap; sorted = false',
    'until sorted',
  ], function (T) {
    const n = T.n;
    let sorted = false, round = 0;
    while (!sorted) {
      sorted = true;
      T.note('round', ++round);
      for (let start = 1; start >= 0; start--) {
        const line = start === 1 ? 4 : 6;
        for (let i = start; i + 1 < n; i += 2) {
          T.ln(line);
          if (T.cmp(i, i + 1) > 0) { T.swap(i, i + 1); sorted = false; }
        }
      }
    }
  });

  def('comb', [
    'gap = n',
    'repeat:',
    '  gap = max(1, floor(gap / 1.3))',
    '  sorted = (gap == 1)',
    '  for i = 0 to n-1-gap:',
    '    if a[i] > a[i+gap]:',
    '      swap(a[i], a[i+gap]); sorted = false',
    'until sorted',
  ], function (T) {
    const n = T.n;
    let gap = n, sorted = false;
    while (!sorted) {
      gap = Math.floor(gap / 1.3);
      if (gap <= 1) { gap = 1; sorted = true; }
      T.note('gap', gap);
      for (let i = 0; i + gap < n; i++) {
        T.ln(6);
        if (T.cmp(i, i + gap) > 0) { T.ln(7); T.swap(i, i + gap); sorted = false; }
      }
    }
  });

  def('gnome', [
    'i = 0',
    'while i < n:',
    '  if i == 0 or a[i-1] <= a[i]:',
    '    i = i + 1              // step forward',
    '  else:',
    '    swap(a[i-1], a[i])',
    '    i = i - 1              // step back',
  ], function (T) {
    const n = T.n;
    let i = 0;
    while (i < n) {
      T.mark(i);
      T.ln(3);
      if (i === 0 || T.cmp(i - 1, i) <= 0) i++;
      else { T.ln(6); T.swap(i - 1, i); i--; }
    }
    T.mark(-1);
  });

  def('circle', [
    'circle(lo, hi):',
    '  if lo >= hi: return false',
    '  p = lo, q = hi',
    '  while p < q (odd length: middle vs. next):',
    '    if a[p] > a[q]: swap(a[p], a[q]); swapped = true',
    '    p = p + 1, q = q - 1',
    '  return swapped | circle(lo, q) | circle(p, hi)',
    'repeat circle(0, n-1) until it makes no swap',
  ], function (T) {
    const inner = (lo, hi) => {
      if (lo >= hi) return false;
      T.enter(lo, hi);
      let swapped = false, p = lo, q = hi;
      while (p < q || (p === q && ++q)) {
        T.ln(5);
        if (T.cmp(p, q) > 0) { T.swap(p, q); swapped = true; }
        p++; q--;
      }
      T.ln(7);
      const a = inner(lo, q);
      const b = inner(p, hi);
      T.leave();
      return swapped || a || b;
    };
    let round = 0;
    if (T.n > 1) { do { T.ln(8); T.note('round', ++round); } while (inner(0, T.n - 1)); }
  });

  // =================================================================
  //  SELECTION SORTS
  // =================================================================
  def('selection', [
    'for i = 0 to n-2:',
    '  min = i',
    '  for j = i+1 to n-1:',
    '    if a[j] < a[min]:',
    '      min = j',
    '  swap(a[i], a[min])      // a[0..i] is final now',
  ], function (T) {
    const n = T.n;
    for (let i = 0; i < n - 1; i++) {
      T.enter(i, n - 1);
      T.note('findMin', i, n - 1);
      let m = i;
      T.mark(m);
      for (let j = i + 1; j < n; j++) {
        T.ln(4);
        if (T.cmp(j, m) < 0) { m = j; T.mark(m); }
      }
      T.note('selectMin', T.a[m], i);
      T.ln(6);
      T.swap(i, m);
      T.leave();
    }
    T.mark(-1);
  });

  def('doubleselection', [
    'lo = 0, hi = n-1',
    'while lo < hi:',
    '  min = max = lo',
    '  for i = lo+1 to hi:',
    '    if a[i] < a[min]: min = i',
    '    if a[i] > a[max]: max = i',
    '  swap(a[lo], a[min])',
    '  if max == lo: max = min    // the max was just moved',
    '  swap(a[hi], a[max])',
    '  lo = lo + 1, hi = hi - 1',
  ], function (T) {
    let lo = 0, hi = T.n - 1;
    while (lo < hi) {
      T.enter(lo, hi);
      let mn = lo, mx = lo;
      T.mark(mn, mx);
      for (let i = lo + 1; i <= hi; i++) {
        T.ln(5); if (T.cmp(i, mn) < 0) { mn = i; T.mark(mn, mx); }
        T.ln(6); if (T.cmp(i, mx) > 0) { mx = i; T.mark(mn, mx); }
      }
      T.note('selectMinMax', T.a[mn], T.a[mx]);
      T.ln(7); T.swap(lo, mn);
      if (mx === lo) mx = mn;
      T.ln(9); T.swap(hi, mx);
      T.leave();
      lo++; hi--;
    }
    T.mark(-1);
  });

  def('cycle', [
    'for start = 0 to n-2:',
    '  item = a[start]                  // pick it up',
    '  pos = start + #{ i > start : a[i] < item }',
    '  if pos == start: continue        // already in place',
    '  while a[pos] == item: pos++      // skip duplicates',
    '  exchange item with a[pos]        // put down, pick up',
    '  while pos != start:',
    '    pos = start + #{ i > start : a[i] < item }',
    '    while a[pos] == item: pos++',
    '    exchange item with a[pos]',
  ], function (T) {
    const n = T.n;
    T.aux(0, 1, 'hand');
    const exchange = (pos) => {
      const old = T.a[pos];
      T.fromAux(0, 0, pos);
      T.auxSet(0, 0, old, pos);
    };
    for (let cs = 0; cs < n - 1; cs++) {
      T.ln(2); T.note('cycleStart', cs);
      T.toAux(0, 0, cs);
      T.mark(cs);
      let pos = cs;
      T.ln(3);
      for (let i = cs + 1; i < n; i++) if (T.cmpMA(i, 0) < 0) pos++;
      if (pos === cs) continue;
      T.ln(5);
      while (T.cmpMA(pos, 0) === 0) pos++;
      T.ln(6); exchange(pos);
      while (pos !== cs) {
        pos = cs;
        T.ln(8);
        for (let i = cs + 1; i < n; i++) if (T.cmpMA(i, 0) < 0) pos++;
        T.ln(9);
        while (T.cmpMA(pos, 0) === 0) pos++;
        T.ln(10); exchange(pos);
      }
    }
    T.mark(-1);
  });

  def('pancake', [
    'for size = n down to 2:',
    '  m = index of the maximum in a[0 .. size-1]',
    '  if m == size-1: continue',
    '  flip(0 .. m)             // maximum to the front',
    '  flip(0 .. size-1)        // maximum to its final place',
  ], function (T) {
    const flip = (k, line) => { T.ln(line); T.note('flip', k + 1); let i = 0; while (i < k) { T.swap(i, k); i++; k--; } };
    for (let size = T.n; size > 1; size--) {
      T.enter(0, size - 1);
      let m = 0;
      T.mark(m, size - 1);
      for (let i = 1; i < size; i++) { T.ln(2); if (T.cmp(i, m) > 0) { m = i; T.mark(m, size - 1); } }
      if (m !== size - 1) {
        if (m !== 0) flip(m, 4);
        flip(size - 1, 5);
      }
      T.leave();
    }
    T.mark(-1);
  });

  def('heap', [
    'for i = n/2-1 down to 0:        // build a max-heap',
    '  siftDown(i, n)',
    'for end = n-1 down to 1:',
    '  swap(a[0], a[end])           // largest to its final place',
    '  siftDown(0, end)',
    'siftDown(i, size):',
    '  c = larger child of i (2i+1 or 2i+2)',
    '  if a[i] >= a[c]: return',
    '  swap(a[i], a[c]); i = c; repeat',
  ], function (T) {
    if (T.n > 1) heapRange(T, 0, T.n - 1, { cmp: 7, swap: 9, build: 2, extract: 4 });
  });

  const LEO = [1, 1];
  while (LEO[LEO.length - 1] < 1e7) LEO.push(LEO[LEO.length - 1] + LEO[LEO.length - 2] + 1);

  def('smooth', [
    'for i = 0 to n-1:                     // build the Leonardo heap',
    '  add a[i] as a new root (joins two trees L(k+1), L(k) if possible)',
    '  rectify: move the root left past larger roots, then sift down',
    'for i = n-1 down to 1:                // take it apart again',
    '  a[i] is the largest root → already in its final place',
    '  split its tree into its two subtrees and rectify both',
    'siftDown(root): swap with the larger child while that child is bigger',
    '(tree sizes are Leonardo numbers 1, 1, 3, 5, 9, 15, 25, 41, …)',
  ], function (T) {
    const n = T.n;
    if (n < 2) return;
    const orders = [];
    const sift = (root, order) => {
      while (order >= 2) {
        const right = root - 1, left = root - 1 - LEO[order - 2];
        T.ln(7);
        let child, co;
        if (T.cmp(left, right) > 0) { child = left; co = order - 1; } else { child = right; co = order - 2; }
        if (T.cmp(root, child) >= 0) return;
        T.swap(root, child);
        root = child; order = co;
      }
    };
    const rectify = (root, ti) => {
      let pos = root, cur = ti;
      T.ln(3);
      while (cur > 0) {
        const prev = pos - LEO[orders[cur]];
        if (T.cmp(prev, pos) <= 0) break;
        if (orders[cur] >= 2) {
          const right = pos - 1, left = pos - 1 - LEO[orders[cur] - 2];
          if (T.cmp(prev, left) <= 0 || T.cmp(prev, right) <= 0) break;
        }
        T.swap(pos, prev);
        pos = prev; cur--;
      }
      sift(pos, orders[cur]);
    };
    for (let i = 0; i < n; i++) {
      T.ln(2);
      const k = orders.length;
      if (k >= 2 && orders[k - 2] === orders[k - 1] + 1) { orders.pop(); orders[orders.length - 1]++; }
      else if (k >= 1 && orders[k - 1] === 1) orders.push(0);
      else orders.push(1);
      T.mark(i);
      T.note('leoAdd', i, LEO[orders[orders.length - 1]]);
      T.enter(0, i);
      rectify(i, orders.length - 1);
      T.leave();
    }
    T.note('heapBuilt');
    for (let i = n - 1; i > 0; i--) {
      T.ln(5); T.mark(i);
      T.note('leoRemove', T.a[i], i);
      T.enter(0, i - 1);
      const k = orders.pop();
      if (k >= 2) {
        T.ln(6);
        orders.push(k - 1); rectify(i - 1 - LEO[k - 2], orders.length - 1);
        orders.push(k - 2); rectify(i - 1, orders.length - 1);
      }
      T.leave();
    }
    T.mark(-1);
  });

  def('tournament', [
    'copy the elements into the leaves of a complete binary tree',
    'every inner node = smaller of its two children   // play all matches',
    'repeat n times:',
    '  winner = root → write it to the next position',
    '  replace the winner\'s leaf with +∞',
    '  replay the matches on its path back up to the root',
  ], function (T) {
    const n = T.n;
    let P = 1; while (P < n) P <<= 1;
    T.aux(0, 2 * P, 'tournament tree');
    const src = new Int32Array(2 * P);
    T.ln(1); T.note('buildTree');
    for (let i = 0; i < P; i++) {
      if (i < n) T.toAux(0, P + i, i); else T.auxSet(0, P + i, INF);
      src[P + i] = P + i;
    }
    const play = (node) => {
      const l = 2 * node, r = l + 1;
      const vl = T.auxVal(0, l), vr = T.auxVal(0, r);
      let win;
      if (vr === INF) win = l;
      else if (vl === INF) win = r;
      else win = T.cmpAA(r, l) < 0 ? r : l;    // ties → left (stable)
      T.auxSet(0, node, T.auxVal(0, win));
      src[node] = src[win];
    };
    T.ln(2);
    for (let node = P - 1; node >= 1; node--) play(node);
    for (let k = 0; k < n; k++) {
      T.ln(4); T.fromAux(0, 1, k);
      const leaf = src[1];
      T.ln(5); T.auxSet(0, leaf, INF);
      T.ln(6);
      for (let node = leaf >> 1; node >= 1; node >>= 1) play(node);
    }
  });

  // =================================================================
  //  INSERTION SORTS
  // =================================================================
  def('insertion', [
    'for i = 1 to n-1:',
    '  key = a[i]               // pick it up',
    '  j = i - 1',
    '  while j >= 0 and a[j] > key:',
    '    a[j+1] = a[j]          // shift right',
    '    j = j - 1',
    '  a[j+1] = key             // drop it into the gap',
  ], function (T) {
    T.aux(0, 1, 'key');
    insertionRange(T, 0, T.n - 1, { key: 2, cmp: 4, shift: 5, drop: 7 }, true);
  });

  def('binaryinsertion', [
    'for i = 1 to n-1:',
    '  key = a[i]',
    '  lo = 0, hi = i',
    '  while lo < hi:                        // binary search',
    '    mid = (lo + hi) / 2',
    '    if a[mid] > key: hi = mid else lo = mid + 1',
    '  shift a[lo .. i-1] one step right',
    '  a[lo] = key',
  ], function (T) {
    const n = T.n;
    T.aux(0, 1, 'key');
    for (let i = 1; i < n; i++) {
      T.ln(2); T.toAux(0, 0, i);
      T.mark(i);
      let lo = 0, hi = i;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        T.ln(6);
        if (T.cmpMA(mid, 0) > 0) hi = mid; else lo = mid + 1;
      }
      T.ln(7);
      for (let j = i; j > lo; j--) T.move(j, j - 1);
      if (lo !== i) { T.ln(8); T.fromAux(0, 0, lo); }
    }
    T.mark(-1);
  });

  def('shell', [
    'for gap in [ …, 57, 23, 10, 4, 1 ]:     // Ciura\'s gaps',
    '  for i = gap to n-1:',
    '    key = a[i]',
    '    j = i',
    '    while j >= gap and a[j-gap] > key:',
    '      a[j] = a[j-gap]',
    '      j = j - gap',
    '    a[j] = key',
  ], function (T) {
    const n = T.n;
    T.aux(0, 1, 'key');
    const gaps = [701, 301, 132, 57, 23, 10, 4, 1];
    while (gaps[0] * 2.25 < n) gaps.unshift(Math.floor(gaps[0] * 2.25));
    for (const gap of gaps) {
      if (gap >= n) continue;
      T.note('gap', gap);
      for (let i = gap; i < n; i++) {
        T.ln(3); T.toAux(0, 0, i);
        let j = i;
        while (j >= gap) {
          T.ln(5);
          if (T.cmpMA(j - gap, 0) <= 0) break;
          T.ln(6); T.move(j, j - gap); j -= gap;
        }
        if (j !== i) { T.ln(8); T.fromAux(0, 0, j); }
      }
    }
  });

  def('tree', [
    'for each element x:                         // build the tree',
    '  walk down: go left if x < node, else right',
    '  attach x as a new leaf',
    'in-order traversal (left subtree, node, right subtree):',
    '  write each node\'s value to the next position',
  ], function (T) {
    const n = T.n;
    T.aux(0, n, 'tree nodes');
    const left = new Int32Array(n).fill(-1), right = new Int32Array(n).fill(-1);
    T.note('buildTree');
    for (let i = 0; i < n; i++) {
      T.ln(1); T.toAux(0, i, i);
      if (i === 0) continue;
      let cur = 0;
      for (;;) {
        T.ln(2);
        if (T.cmpAA(i, cur, i) < 0) {
          if (left[cur] < 0) { T.ln(3); left[cur] = i; break; }
          cur = left[cur];
        } else {
          if (right[cur] < 0) { T.ln(3); right[cur] = i; break; }
          cur = right[cur];
        }
      }
    }
    T.note('traverse');
    const stack = [];
    let cur = n > 0 ? 0 : -1, k = 0;
    while (cur >= 0 || stack.length) {
      while (cur >= 0) { stack.push(cur); cur = left[cur]; }
      cur = stack.pop();
      T.ln(5); T.fromAux(0, cur, k++);
      cur = right[cur];
    }
  });

  def('fordjohnson', [
    'mergeInsertion(items):',
    '  pair up the items and compare each pair → (big, small)',
    '  sort the bigs recursively',
    '  chain = [small partner of the 1st big] + sorted bigs',
    '  insert the other smalls in Jacobsthal order (3,2, 5,4, 11…6, …)',
    '    binary search only left of its big partner',
    '  return chain',
    'write the elements back in chain order',
  ], function (T) {
    const n = T.n;
    const jac = [1, 3];
    while (jac[jac.length - 1] < n) jac.push(jac[jac.length - 1] + 2 * jac[jac.length - 2]);
    const fj = (items) => {
      const m = items.length;
      if (m <= 1) return items.slice();
      T.note('fjLevel', m);
      const bigs = [], partner = new Map();
      for (let k = 0; k + 1 < m; k += 2) {
        const x = items[k], y = items[k + 1];
        T.ln(2);
        if (T.cmp(x, y) > 0) { bigs.push(x); partner.set(x, y); } else { bigs.push(y); partner.set(y, x); }
      }
      const leftover = m % 2 ? items[m - 1] : -1;
      T.ln(3);
      const sortedBigs = fj(bigs);
      T.ln(4);
      const chain = [partner.get(sortedBigs[0])].concat(sortedBigs);
      const pend = [];
      for (let i = 1; i < sortedBigs.length; i++) pend.push({ item: partner.get(sortedBigs[i]), bound: sortedBigs[i] });
      if (leftover >= 0) pend.push({ item: leftover, bound: -1 });
      const total = pend.length + 1;
      let prevT = 1;
      for (let k = 1; prevT < total; k++) {
        const t = Math.min(jac[k], total);
        for (let b = t; b > prevT; b--) {
          const { item, bound } = pend[b - 2];
          let hi = bound < 0 ? chain.length : chain.indexOf(bound), lo = 0;
          T.mark(item);
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            T.ln(6);
            if (T.cmp(item, chain[mid]) < 0) hi = mid; else lo = mid + 1;
          }
          T.ln(5);
          chain.splice(lo, 0, item);
        }
        prevT = t;
      }
      return chain;
    };
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    const order = fj(idx);
    T.mark(-1);
    T.aux(0, n, 'sorted copy');
    T.ln(8); T.note('copyBack');
    for (let k = 0; k < n; k++) T.toAux(0, k, order[k]);
    for (let k = 0; k < n; k++) T.fromAux(0, k, k);
  });

  // =================================================================
  //  MERGE SORTS
  // =================================================================
  def('merge', [
    'mergeSort(lo, hi):',
    '  if lo >= hi: return',
    '  mid = (lo + hi) / 2',
    '  mergeSort(lo, mid); mergeSort(mid+1, hi)',
    '  if a[mid] <= a[mid+1]: return      // already in order',
    '  copy a[lo..hi] into the buffer',
    '  i = lo, j = mid+1',
    '  for k = lo to hi:',
    '    a[k] = smaller of buf[i], buf[j]   (left wins ties)',
  ], function (T) {
    T.aux(0, T.n, 'buffer');
    const sort = (lo, hi) => {
      if (lo >= hi) return;
      T.enter(lo, hi);
      const mid = (lo + hi) >> 1;
      T.ln(4);
      sort(lo, mid); sort(mid + 1, hi);
      T.ln(5);
      if (T.cmp(mid, mid + 1) > 0) mergeWithAux(T, lo, mid, hi, { copy: 6, take: 9 });
      T.leave();
    };
    sort(0, T.n - 1);
  });

  def('mergebu', [
    'for width = 1, 2, 4, … while width < n:',
    '  for lo = 0, 2·width, 4·width, …:',
    '    merge a[lo .. lo+width-1] with a[lo+width .. lo+2·width-1]:',
    '      copy both runs into the buffer',
    '      a[k] = smaller front element   (left wins ties)',
  ], function (T) {
    const n = T.n;
    T.aux(0, n, 'buffer');
    for (let w = 1; w < n; w *= 2) {
      T.note('width', w);
      for (let lo = 0; lo < n - w; lo += 2 * w) {
        const hi = Math.min(lo + 2 * w - 1, n - 1);
        T.enter(lo, hi); T.ln(3);
        mergeWithAux(T, lo, lo + w - 1, hi, { copy: 4, take: 5 });
        T.leave();
      }
    }
  });

  def('tim', [
    'minrun = 16…32 (computed from n)',
    'for each natural run starting at lo:',
    '  if it is strictly descending: reverse it',
    '  if shorter than minrun: extend it with binary insertion',
    '  push the run onto the stack',
    '  while the stack rules are broken: merge two neighbouring runs',
    'merge all remaining runs',
    'merge(A, B): copy A into the buffer, merge forward',
  ], function (T) {
    const n = T.n;
    if (n < 2) return;
    let r = 0, m = n;
    while (m >= 32) { r |= m & 1; m >>= 1; }
    const minrun = m + r;
    T.ln(1); T.note('minrun', minrun);
    T.aux(0, n, 'buffer');
    const reverse = (lo, hi) => { T.ln(3); T.note('reverseRun', lo, hi); while (lo < hi) T.swap(lo++, hi--); };
    const binIns = (lo, hi, start) => {
      T.ln(4);
      for (let i = start; i < hi; i++) {
        const key = T.get(i);
        let a = lo, b = i;
        while (a < b) { const mid = (a + b) >> 1; if (T.cmpv(mid, key) > 0) b = mid; else a = mid + 1; }
        for (let j = i; j > a; j--) T.move(j, j - 1);
        if (a !== i) T.set(a, key);
      }
    };
    const runs = [];
    const mergeAt = (idx) => {
      const A = runs[idx], B = runs[idx + 1];
      const endB = B.base + B.len;
      T.enter(A.base, endB - 1);
      T.note('merge', A.base, B.base - 1, endB - 1);
      T.mark(A.base, B.base);
      T.ln(8);
      for (let k = 0; k < A.len; k++) T.toAux(0, A.base + k, A.base + k);
      let i = A.base, j = B.base, k = A.base;
      const endA = A.base + A.len;
      while (i < endA && j < endB) {
        if (T.cmpMA(j, i) < 0) T.move(k++, j++);
        else T.fromAux(0, i++, k++);
      }
      while (i < endA) T.fromAux(0, i++, k++);
      runs.splice(idx, 2, { base: A.base, len: A.len + B.len });
      T.mark(-1);
      T.leave();
    };
    const collapse = () => {
      while (runs.length > 1) {
        let k = runs.length - 2;
        if ((k > 0 && runs[k - 1].len <= runs[k].len + runs[k + 1].len) ||
            (k > 1 && runs[k - 2].len <= runs[k - 1].len + runs[k].len)) {
          if (runs[k - 1].len < runs[k + 1].len) k--;
          T.ln(6); mergeAt(k);
        } else if (runs[k].len <= runs[k + 1].len) {
          T.ln(6); mergeAt(k);
        } else break;
      }
    };
    let lo = 0;
    while (lo < n) {
      let hi = lo + 1;
      T.ln(2);
      if (hi < n) {
        if (T.cmp(hi, lo) < 0) {
          while (hi + 1 < n && T.cmp(hi + 1, hi) < 0) hi++;
          reverse(lo, hi);
        } else {
          while (hi + 1 < n && T.cmp(hi + 1, hi) >= 0) hi++;
        }
        hi++;
      }
      let len = hi - lo;
      if (len < minrun) {
        const force = Math.min(minrun, n - lo);
        binIns(lo, lo + force, lo + len);
        len = force;
      }
      T.ln(5); T.note('run', lo, lo + len - 1);
      runs.push({ base: lo, len });
      collapse();
      lo += len;
    }
    while (runs.length > 1) {
      let k = runs.length - 2;
      if (k > 0 && runs[k - 1].len < runs[k + 1].len) k--;
      T.ln(7); mergeAt(k);
    }
  });

  def('inplacemerge', [
    'insertion-sort blocks of 20 elements',
    'for size = 20, 40, 80, … while size < n:',
    '  for each pair of neighbouring blocks: symMerge(a, m, b)',
    'symMerge(a, m, b):',
    '  if one side has a single element: binary search, then swap it in',
    '  binary-search the cut so that the halves can be exchanged',
    '  rotate(start, m, end)       // block swaps, no extra memory',
    '  symMerge(a, start, mid); symMerge(mid, end, b)',
  ], function (T) {
    const n = T.n;
    const insertion = (a, b) => {
      T.enter(a, b - 1);
      for (let i = a + 1; i < b; i++) {
        for (let j = i; j > a; j--) { T.ln(1); if (T.cmp(j, j - 1) < 0) T.swap(j, j - 1); else break; }
      }
      T.leave();
    };
    const swapRange = (x, y, cnt) => { for (let i = 0; i < cnt; i++) T.swap(x + i, y + i); };
    const rotate = (a, m, b) => {
      T.note('rotate', a, m, b);
      let i = m - a, j = b - m;
      while (i !== j) {
        if (i > j) { swapRange(m - i, m, j); i -= j; } else { swapRange(m - i, m + j - i, i); j -= i; }
      }
      swapRange(m - i, m, i);
    };
    const symMerge = (a, m, b) => {
      T.enter(a, b - 1);
      if (m - a === 1) {
        T.ln(5);
        let i = m, j = b;
        while (i < j) { const h = (i + j) >>> 1; if (T.cmp(h, a) < 0) i = h + 1; else j = h; }
        for (let k = a; k < i - 1; k++) T.swap(k, k + 1);
        T.leave(); return;
      }
      if (b - m === 1) {
        T.ln(5);
        let i = a, j = m;
        while (i < j) { const h = (i + j) >>> 1; if (!(T.cmp(m, h) < 0)) i = h + 1; else j = h; }
        for (let k = m; k > i; k--) T.swap(k, k - 1);
        T.leave(); return;
      }
      const mid = (a + b) >>> 1, nn = mid + m;
      let start, r;
      if (m > mid) { start = nn - b; r = mid; } else { start = a; r = m; }
      const p = nn - 1;
      T.ln(6);
      while (start < r) { const c = (start + r) >>> 1; if (!(T.cmp(p - c, c) < 0)) start = c + 1; else r = c; }
      const end = nn - start;
      if (start < m && m < end) { T.ln(7); rotate(start, m, end); }
      T.ln(8);
      if (a < start && start < mid) symMerge(a, start, mid);
      if (mid < end && end < b) symMerge(mid, end, b);
      T.leave();
    };
    let block = 20;
    T.note('insertionBlocks', block);
    let a = 0, b = block;
    while (b <= n) { insertion(a, b); a = b; b += block; }
    insertion(a, n);
    while (block < n) {
      T.ln(2); T.note('blocks', block);
      a = 0; b = 2 * block;
      while (b <= n) { T.ln(3); T.note('symMerge', a, a + block, b - 1); symMerge(a, a + block, b); a = b; b += 2 * block; }
      const mm = a + block;
      if (mm < n) { T.ln(3); symMerge(a, mm, n); }
      block *= 2;
    }
  });

  def('patience', [
    'for each element x:                           // deal',
    '  find the leftmost pile whose top >= x  (binary search)',
    '  put x on that pile, or start a new pile',
    'while cards remain:                            // collect',
    '  take the pile with the smallest top  (min-heap of piles)',
    '  write that card to the next position',
  ], function (T) {
    const n = T.n;
    T.aux(0, n, 'pile tops');
    const piles = [];
    T.note('deal');
    for (let i = 0; i < n; i++) {
      const x = T.a[i];
      let lo = 0, hi = piles.length;
      T.ln(2);
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (T.cmpa(T.auxVal(0, mid), x, i, -1, mid, -1) >= 0) hi = mid; else lo = mid + 1;
      }
      T.ln(3);
      if (lo === piles.length) piles.push([]);
      piles[lo].push(x);
      T.toAux(0, lo, i);
    }
    T.note('collect');
    const heap = [];
    const less = (p, q) => T.cmpAA(p, q) < 0;
    const up = (k) => { while (k > 0) { const par = (k - 1) >> 1; if (less(heap[k], heap[par])) { const t = heap[k]; heap[k] = heap[par]; heap[par] = t; k = par; } else break; } };
    const down = (k) => {
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === k) return;
        const t = heap[k]; heap[k] = heap[m]; heap[m] = t; k = m;
      }
    };
    T.ln(5);
    for (let p = 0; p < piles.length; p++) { heap.push(p); up(heap.length - 1); }
    for (let k = 0; k < n; k++) {
      const p = heap[0];
      T.ln(6); T.fromAux(0, p, k);
      piles[p].pop();
      T.ln(5);
      if (piles[p].length) { T.auxSet(0, p, piles[p][piles[p].length - 1]); down(0); }
      else {
        T.auxSet(0, p, 0);
        const last = heap.pop();
        if (heap.length) { heap[0] = last; down(0); }
      }
    }
  });

  def('strand', [
    'while elements remain:',
    '  strand = [ first remaining element ]',
    '  for each remaining x:',
    '    if x >= last element of the strand: move x to the strand',
    '  merge the strand into the result',
    'write the result back into the array',
  ], function (T) {
    const n = T.n;
    T.aux(0, n, 'result');
    T.aux(1, n, 'strand');
    let m = n, r = 0, count = 0;
    while (m > 0) {
      T.ln(2);
      let s = 0;
      T.toAux(1, s++, 0);
      let w = 0;
      for (let i = 1; i < m; i++) {
        T.ln(4);
        if (T.cmpa(T.a[i], T.auxVal(1, s - 1), i) >= 0) T.toAux(1, s++, i);
        else { if (w !== i) T.move(w, i); w++; }
      }
      T.note('strand', ++count, s);
      for (let q = w; q < m; q++) T.set(q, 0);         // taken elements leave the array
      m = w;
      T.ln(5); T.note('mergeStrand', s);
      let i = r - 1, j = s - 1, k = r + s - 1;
      while (j >= 0) {
        if (i >= 0 && T.cmpa(T.auxVal(0, i), T.auxVal(1, j), -1, -1, i, -1) > 0) { T.auxSet(0, k--, T.auxVal(0, i)); i--; }
        else { T.auxSet(0, k--, T.auxVal(1, j)); j--; }
      }
      r += s;
      for (let q = 0; q < s; q++) T.auxSet(1, q, 0);
    }
    T.ln(6); T.note('copyBack');
    for (let k = 0; k < n; k++) T.fromAux(0, k, k);
  });

  // =================================================================
  //  QUICKSORT FAMILY
  // =================================================================
  def('quicklomuto', [
    'quicksort(lo, hi):',
    '  if lo >= hi: return',
    '  pivot = a[hi]',
    '  i = lo',
    '  for j = lo to hi-1:',
    '    if a[j] < pivot:',
    '      swap(a[i], a[j]); i = i + 1',
    '  swap(a[i], a[hi])        // pivot lands in its final place',
    '  quicksort(lo, i-1); quicksort(i+1, hi)',
  ], function (T) {
    const qs = (lo, hi) => {
      if (lo >= hi) return;
      T.enter(lo, hi);
      T.ln(3); T.mark(hi);
      T.note('partition', lo, hi, T.a[hi]);
      let i = lo;
      for (let j = lo; j < hi; j++) {
        T.ln(6);
        if (T.cmp(j, hi) < 0) { T.ln(7); T.swap(i, j); i++; }
      }
      T.ln(8); T.swap(i, hi);
      T.note('pivotPlaced', T.a[i], i);
      T.mark(-1);
      T.ln(9);
      qs(lo, i - 1); qs(i + 1, hi);
      T.leave();
    };
    qs(0, T.n - 1);
  });

  def('quickhoare', [
    'quicksort(lo, hi):',
    '  if hi <= lo: return',
    '  median of a[lo], a[mid], a[hi] = pivot, park it at a[lo]',
    '  i = lo, j = hi + 1',
    '  loop:',
    '    do i++ while a[i] < pivot',
    '    do j-- while a[j] > pivot',
    '    if i >= j: break',
    '    swap(a[i], a[j])',
    '  swap(a[lo], a[j])        // pivot lands in its final place',
    '  quicksort(lo, j-1); quicksort(j+1, hi)',
  ], function (T) {
    const L = { median: 3, scanI: 6, scanJ: 7, swap: 9, place: 10 };
    const qs = (lo, hi) => {
      if (hi <= lo) return;
      T.enter(lo, hi);
      const p = partitionMedian3(T, lo, hi, L);
      T.ln(11);
      qs(lo, p - 1); qs(p + 1, hi);
      T.leave();
    };
    qs(0, T.n - 1);
  });

  def('dualpivot', [
    'sort(lo, hi):',
    '  if hi <= lo: return',
    '  if a[hi] < a[lo]: swap     // pivots p = a[lo] <= q = a[hi]',
    '  lt = lo+1, gt = hi-1, i = lo+1',
    '  while i <= gt:',
    '    if a[i] < p: swap(a[i], a[lt]); lt++; i++',
    '    else if a[i] > q: swap(a[i], a[gt]); gt--',
    '    else: i++',
    '  put p at --lt and q at ++gt',
    '  sort(lo, lt-1); if p < q: sort(lt+1, gt-1); sort(gt+1, hi)',
  ], function (T) {
    const qs = (lo, hi) => {
      if (hi <= lo) return;
      T.enter(lo, hi);
      T.ln(3);
      if (T.cmp(hi, lo) < 0) T.swap(lo, hi);
      T.mark(lo, hi);
      T.note('dualPartition', lo, hi);
      let lt = lo + 1, gt = hi - 1, i = lo + 1;
      while (i <= gt) {
        T.ln(6);
        if (T.cmp(i, lo) < 0) { T.swap(lt++, i++); continue; }
        T.ln(7);
        if (T.cmp(hi, i) < 0) { T.swap(i, gt--); continue; }
        i++;
      }
      T.ln(9);
      T.swap(lo, --lt);
      T.swap(hi, ++gt);
      T.note('pivotPlaced', T.a[lt], lt);
      T.mark(-1);
      T.ln(10);
      qs(lo, lt - 1);
      if (T.cmp(lt, gt) < 0) qs(lt + 1, gt - 1);
      qs(gt + 1, hi);
      T.leave();
    };
    qs(0, T.n - 1);
  });

  def('quick3', [
    'sort(lo, hi):',
    '  if hi <= lo: return',
    '  swap a random element to a[lo]; v = a[lo]',
    '  lt = lo, gt = hi, i = lo+1',
    '  while i <= gt:',
    '    if a[i] < v: swap(a[lt], a[i]); lt++; i++',
    '    else if a[i] > v: swap(a[i], a[gt]); gt--',
    '    else: i++                      // equal to the pivot: leave it',
    '  sort(lo, lt-1); sort(gt+1, hi)   // a[lt..gt] == v are done',
  ], function (T) {
    const qs = (lo, hi) => {
      if (hi <= lo) return;
      T.enter(lo, hi);
      T.ln(3);
      T.swap(lo, lo + T.randInt(hi - lo + 1));
      const v = T.get(lo);
      T.note('partition', lo, hi, v);
      let lt = lo, gt = hi, i = lo + 1;
      while (i <= gt) {
        T.mark(lt, gt);
        T.ln(6);
        const c = T.cmpv(i, v);
        if (c < 0) { T.swap(lt++, i++); continue; }
        T.ln(7);
        if (c > 0) { T.swap(i, gt--); continue; }
        T.ln(8); i++;
      }
      T.mark(-1);
      T.note('equalBlock', lt, gt);
      T.ln(9);
      qs(lo, lt - 1); qs(gt + 1, hi);
      T.leave();
    };
    qs(0, T.n - 1);
  });

  def('intro', [
    'introsort(lo, hi, depth):',
    '  while hi - lo + 1 > 16:',
    '    if depth == 0: heapsort(a[lo..hi]); return',
    '    depth = depth - 1',
    '    p = partition(lo, hi)        // median-of-3, Hoare',
    '    introsort(p+1, hi, depth); hi = p - 1',
    'introsort(0, n-1, 2·log2(n))',
    'insertionSort(a)                // one final pass',
  ], function (T) {
    const n = T.n;
    if (n < 2) return;
    const PL = { median: 5, scanI: 5, scanJ: 5, swap: 5, place: 5 };
    const HL = { cmp: 3, swap: 3, build: 3, extract: 3 };
    const intro = (lo, hi, depth) => {
      T.enter(lo, hi);
      while (hi - lo + 1 > 16) {
        if (depth === 0) { T.ln(3); T.note('depthLimit', lo, hi); heapRange(T, lo, hi, HL); T.leave(); return; }
        depth--;
        const p = partitionMedian3(T, lo, hi, PL);
        T.ln(6);
        intro(p + 1, hi, depth);
        hi = p - 1;
      }
      T.leave();
    };
    T.ln(7);
    intro(0, n - 1, 2 * Math.floor(Math.log2(n)));
    T.note('finalInsertion');
    insertionRange(T, 0, n - 1, { key: 8, cmp: 8, shift: 8, drop: 8 }, false);
  });

  def('pdq', [
    'pdqsort(lo, hi):',
    '  if size < 24: insertion sort, return',
    '  pivot = median of 3 (ninther if size > 128) → a[lo]',
    '  if a[lo-1] == pivot: put equal elements left, continue right',
    '  p = partition (equal elements go right)',
    '  if the split is very unbalanced: break patterns with a few swaps',
    '    after log2(n) bad splits: heapsort(lo, hi) instead',
    '  else if no swaps were needed: try a partial insertion sort',
    '  pdqsort(lo, p-1); continue with (p+1, hi)',
  ], function (T) {
    const n = T.n;
    if (n < 2) return;
    const INS = 24, NIN = 128;
    const sort2 = (x, y) => { if (T.cmp(y, x) < 0) T.swap(x, y); };
    const sort3 = (x, y, z) => { sort2(x, y); sort2(y, z); sort2(x, y); };
    const insertion = (lo, hi) => {          // [lo, hi)
      T.ln(2);
      for (let i = lo + 1; i < hi; i++) {
        let j = i;
        if (T.cmp(j, j - 1) < 0) {
          const tmp = T.get(j);
          do { T.move(j, j - 1); j--; } while (j > lo && T.cmpv(j - 1, tmp) > 0);
          T.set(j, tmp);
        }
      }
    };
    const partialInsertion = (lo, hi) => {
      T.ln(8);
      if (lo === hi) return true;
      let limit = 0;
      for (let cur = lo + 1; cur < hi; cur++) {
        if (limit > 8) return false;
        let sift = cur;
        if (T.cmp(sift, sift - 1) < 0) {
          const tmp = T.get(sift);
          do { T.move(sift, sift - 1); sift--; } while (sift !== lo && T.cmpv(sift - 1, tmp) > 0);
          T.set(sift, tmp);
          limit += cur - sift;
        }
      }
      return true;
    };
    const partitionRight = (lo, hi) => {
      T.ln(5); T.mark(lo);
      T.note('partition', lo, hi - 1, T.a[lo]);
      let first = lo, last = hi;
      while (first + 1 < hi && T.cmp(++first, lo) < 0) { /* scan */ }
      if (first - 1 === lo) { while (first < last && !(T.cmp(--last, lo) < 0)) { /* scan */ } }
      else { while (last - 1 > lo && !(T.cmp(--last, lo) < 0)) { /* scan */ } }
      const already = first >= last;
      while (first < last) {
        T.swap(first, last);
        while (first + 1 < hi && T.cmp(++first, lo) < 0) { /* scan */ }
        while (last - 1 > lo && !(T.cmp(--last, lo) < 0)) { /* scan */ }
      }
      const p = first - 1;
      T.swap(lo, p);
      T.note('pivotPlaced', T.a[p], p);
      T.mark(-1);
      return [p, already];
    };
    const partitionLeft = (lo, hi) => {
      T.ln(4); T.mark(lo);
      let first = lo, last = hi;
      while (last - 1 > lo && T.cmp(lo, --last) < 0) { /* scan */ }
      if (last + 1 === hi) { while (first < last && !(T.cmp(lo, ++first) < 0)) { /* scan */ } }
      else { while (first + 1 < hi && !(T.cmp(lo, ++first) < 0)) { /* scan */ } }
      while (first < last) {
        T.swap(first, last);
        while (last - 1 > lo && T.cmp(lo, --last) < 0) { /* scan */ }
        while (first + 1 < hi && !(T.cmp(lo, ++first) < 0)) { /* scan */ }
      }
      T.swap(lo, last);
      T.mark(-1);
      return last;
    };
    const pdq = (lo, hi, bad, leftmost) => {     // [lo, hi)
      T.enter(lo, hi - 1);
      for (;;) {
        const size = hi - lo;
        if (size < INS) { insertion(lo, hi); break; }
        const s2 = size >> 1;
        T.ln(3);
        if (size > NIN) {
          sort3(lo, lo + s2, hi - 1); sort3(lo + 1, lo + s2 - 1, hi - 2);
          sort3(lo + 2, lo + s2 + 1, hi - 3); sort3(lo + s2 - 1, lo + s2, lo + s2 + 1);
          T.swap(lo, lo + s2);
        } else sort3(lo + s2, lo, hi - 1);
        if (!leftmost) {
          T.ln(4);
          if (!(T.cmp(lo - 1, lo) < 0)) { lo = partitionLeft(lo, hi) + 1; continue; }
        }
        const [p, already] = partitionRight(lo, hi);
        const lSize = p - lo, rSize = hi - (p + 1);
        const unbalanced = lSize < (size >> 3) || rSize < (size >> 3);
        if (unbalanced) {
          if (--bad === 0) { T.ln(7); T.note('heapFallback', lo, hi - 1); heapRange(T, lo, hi - 1, { cmp: 7, swap: 7, build: 7, extract: 7 }); break; }
          T.ln(6); T.note('patternBreak');
          if (lSize >= INS) {
            T.swap(lo, lo + (lSize >> 2)); T.swap(p - 1, p - (lSize >> 2));
            if (lSize > NIN) {
              T.swap(lo + 1, lo + ((lSize >> 2) + 1)); T.swap(lo + 2, lo + ((lSize >> 2) + 2));
              T.swap(p - 2, p - ((lSize >> 2) + 1)); T.swap(p - 3, p - ((lSize >> 2) + 2));
            }
          }
          if (rSize >= INS) {
            T.swap(p + 1, p + (1 + (rSize >> 2))); T.swap(hi - 1, hi - (rSize >> 2));
            if (rSize > NIN) {
              T.swap(p + 2, p + (2 + (rSize >> 2))); T.swap(p + 3, p + (3 + (rSize >> 2)));
              T.swap(hi - 2, hi - (1 + (rSize >> 2))); T.swap(hi - 3, hi - (2 + (rSize >> 2)));
            }
          }
        } else if (already) {
          T.note('partialInsertion');
          if (partialInsertion(lo, p) && partialInsertion(p + 1, hi)) break;
        }
        T.ln(9);
        pdq(lo, p, bad, leftmost);
        lo = p + 1; leftmost = false;
      }
      T.leave();
    };
    pdq(0, n, Math.max(1, Math.floor(Math.log2(n))), true);
  });

  // =================================================================
  //  DISTRIBUTION SORTS
  // =================================================================
  def('counting', [
    'k = max(a)',
    'count[v] = number of elements with value v',
    'prefix sums: count[v] = number of elements <= v',
    'for i = n-1 down to 0:              // stable placement',
    '  out[--count[a[i]]] = a[i]',
    'copy out back into a',
  ], function (T) {
    const n = T.n;
    let mx = 0;
    T.ln(1); T.note('findMax');
    for (let i = 0; i < n; i++) { const v = T.key(T.get(i)); if (v > mx) mx = v; }
    T.aux(0, mx + 1, 'count', 'counts');
    T.aux(1, n, 'output');
    T.ln(2); T.note('count');
    for (let i = 0; i < n; i++) { const v = T.key(T.a[i]); T.auxSet(0, v, T.auxVal(0, v) + 1, i); }
    T.ln(3); T.note('prefix');
    for (let v = 1; v <= mx; v++) T.auxSet(0, v, T.auxVal(0, v) + T.auxVal(0, v - 1));
    T.ln(5); T.note('place');
    for (let i = n - 1; i >= 0; i--) {
      const v = T.key(T.a[i]);
      const pos = T.auxVal(0, v) - 1;
      T.auxSet(0, v, pos);
      T.toAux(1, pos, i);
    }
    T.ln(6); T.note('copyBack');
    for (let i = 0; i < n; i++) T.fromAux(1, i, i);
  });

  def('radixlsd', [
    'for exp = 1, 10, 100, … while max / exp > 0:',
    '  count[d] += 1 for the digit d = (a[i] / exp) mod 10',
    '  prefix sums over count',
    '  for i = n-1 down to 0: out[--count[d(a[i])]] = a[i]   // stable',
    '  copy out back into a',
  ], function (T) {
    const n = T.n;
    let mx = 0;
    T.ln(1); T.note('findMax');
    for (let i = 0; i < n; i++) { const v = T.key(T.get(i)); if (v > mx) mx = v; }
    T.aux(0, 10, 'digit count', 'counts');
    T.aux(1, n, 'output');
    for (let exp = 1; Math.floor(mx / exp) > 0; exp *= 10) {
      T.note('digit', exp);
      T.ln(2);
      for (let d = 0; d < 10; d++) if (T.auxVal(0, d) !== 0) T.auxSet(0, d, 0);
      for (let i = 0; i < n; i++) { const d = digitOf(T, T.a[i], exp); T.auxSet(0, d, T.auxVal(0, d) + 1, i); }
      T.ln(3);
      for (let d = 1; d < 10; d++) T.auxSet(0, d, T.auxVal(0, d) + T.auxVal(0, d - 1));
      T.ln(4);
      for (let i = n - 1; i >= 0; i--) {
        const d = digitOf(T, T.a[i], exp);
        const pos = T.auxVal(0, d) - 1;
        T.auxSet(0, d, pos);
        T.toAux(1, pos, i);
      }
      T.ln(5);
      for (let i = 0; i < n; i++) T.fromAux(1, i, i);
    }
  });

  def('radixmsd', [
    'd = number of digits of max(a)',
    'flagSort(lo, hi, exp):     // most significant digit first',
    '  count how many elements have each digit',
    '  compute each digit\'s bucket [start, end)',
    '  for each bucket d, while it has unplaced elements:',
    '    swap the next element into the bucket of its digit',
    '  for each bucket: flagSort(start, end, exp / 10)',
  ], function (T) {
    const n = T.n;
    let mx = 0;
    T.ln(1); T.note('findMax');
    for (let i = 0; i < n; i++) { const v = T.key(T.get(i)); if (v > mx) mx = v; }
    T.aux(0, 10, 'digit count', 'counts');
    let exp = 1;
    while (Math.floor(mx / exp) >= 10) exp *= 10;
    const flag = (lo, hi, exp) => {
      if (hi - lo < 2 || exp === 0) return;
      T.enter(lo, hi - 1);
      T.note('digit', exp);
      T.ln(3);
      for (let d = 0; d < 10; d++) if (T.auxVal(0, d) !== 0) T.auxSet(0, d, 0);
      for (let i = lo; i < hi; i++) { const d = digitOf(T, T.a[i], exp); T.auxSet(0, d, T.auxVal(0, d) + 1, i); }
      T.ln(4);
      const start = new Int32Array(10), end = new Int32Array(10);
      let s = lo;
      for (let d = 0; d < 10; d++) { start[d] = s; s += T.auxVal(0, d); end[d] = s; }
      const next = start.slice();
      for (let d = 0; d < 10; d++) {
        while (next[d] < end[d]) {
          T.ln(6);
          let dd = digitOf(T, T.get(next[d]), exp);
          while (dd !== d) {
            T.swap(next[d], next[dd]++);
            dd = digitOf(T, T.get(next[d]), exp);
          }
          next[d]++;
        }
      }
      T.ln(7);
      const e2 = Math.floor(exp / 10);
      for (let d = 0; d < 10; d++) flag(start[d], end[d], e2);
      T.leave();
    };
    flag(0, n, exp);
  });

  def('bucket', [
    'k = √n buckets over the value range [0, max]',
    'put every element into bucket ⌊v · k / (max+1)⌋',
    'write the buckets back in order',
    'insertion-sort every bucket in place',
  ], function (T) {
    const n = T.n;
    if (n < 2) return;
    let mx = 0;
    T.ln(1); T.note('findMax');
    for (let i = 0; i < n; i++) { const v = T.key(T.get(i)); if (v > mx) mx = v; }
    const k = Math.max(2, Math.round(Math.sqrt(n)));
    const bOf = (v) => Math.floor(T.key(v) * k / (mx + 1));
    const size = new Int32Array(k);
    for (let i = 0; i < n; i++) size[bOf(T.a[i])]++;
    const start = new Int32Array(k), fill = new Int32Array(k);
    for (let b = 1; b < k; b++) start[b] = start[b - 1] + size[b - 1];
    T.aux(0, n, 'buckets');
    T.ln(2); T.note('bucketsSplit', k);
    for (let i = 0; i < n; i++) { const b = bOf(T.a[i]); T.toAux(0, start[b] + fill[b]++, i); }
    T.ln(3); T.note('copyBack');
    for (let i = 0; i < n; i++) T.fromAux(0, i, i);
    for (let b = 0; b < k; b++) {
      const lo = start[b], hi = start[b] + size[b] - 1;
      if (hi > lo) {
        T.enter(lo, hi); T.mark(lo, hi); T.note('bucketSort', lo, hi);
        insertionRange(T, lo, hi, { key: 4, cmp: 4, shift: 4, drop: 4 }, false);
        T.leave();
      }
    }
    T.mark(-1);
  });

  def('gravity', [
    'rods = max(a)',
    'for each value v:',
    '  drop one bead on each of the rods 1 … v',
    'let the beads fall – for k = 0 to n-1:',
    '  a[n-1-k] = number of rods that hold more than k beads',
  ], function (T) {
    const n = T.n;
    let mx = 0;
    T.ln(1); T.note('findMax');
    for (let i = 0; i < n; i++) { const v = T.key(T.get(i)); if (v > mx) mx = v; }
    T.aux(0, mx, 'beads per rod', 'counts');
    T.note('beadsDrop');
    for (let i = 0; i < n; i++) {
      T.ln(2);
      const v = T.key(T.get(i));
      T.ln(3);
      for (let r = 0; r < v; r++) T.auxSet(0, r, T.auxVal(0, r) + 1);
    }
    T.note('beadsFall');
    let p = mx;
    for (let k = 0; k < n; k++) {
      T.ln(5);
      while (p > 0 && T.auxGet(0, p - 1) <= k) p--;
      T.set(n - 1 - k, p * T.keyDiv);
    }
  });

  // =================================================================
  //  SORTING NETWORKS
  // =================================================================
  def('bitonic', [
    'bitonicSort(lo, n, up):',
    '  sort the first half descending, the second half ascending',
    '  bitonicMerge(lo, n, up)',
    'bitonicMerge(lo, n, up):',
    '  m = greatest power of two < n',
    '  compare-and-swap a[i] with a[i+m] for i = lo … lo+n-m-1',
    '  bitonicMerge(lo, m, up); bitonicMerge(lo+m, n-m, up)',
  ], function (T) {
    const cmpSwap = (i, j, up) => { if ((T.cmp(i, j) > 0) === up) T.swap(i, j); };
    const gpow2 = (n) => { let k = 1; while (k < n) k <<= 1; return k >> 1; };
    const merge = (lo, n, up) => {
      if (n <= 1) return;
      T.enter(lo, lo + n - 1);
      const m = gpow2(n);
      T.ln(6);
      for (let i = lo; i < lo + n - m; i++) cmpSwap(i, i + m, up);
      T.ln(7);
      merge(lo, m, up);
      merge(lo + m, n - m, up);
      T.leave();
    };
    const sort = (lo, n, up) => {
      if (n <= 1) return;
      T.enter(lo, lo + n - 1);
      const m = n >> 1;
      T.ln(2);
      sort(lo, m, !up);
      sort(lo + m, n - m, up);
      T.ln(3); T.note('bitonicMerge', lo, n);
      merge(lo, n, up);
      T.leave();
    };
    sort(0, T.n, true);
  });

  def('oddevenmerge', [
    'for p = 1, 2, 4, … while p < n:          // size of sorted blocks',
    '  for k = p, p/2, …, 1:                   // comparator distance',
    '    for every i where i and i+k lie in the same 2p-block:',
    '      compare-and-swap a[i], a[i+k]',
  ], function (T) {
    const n = T.n;
    for (let p = 1; p < n; p *= 2) {
      for (let k = p; k >= 1; k = Math.floor(k / 2)) {
        T.note('phase', p, k);
        for (let j = k % p; j <= n - 1 - k; j += 2 * k) {
          for (let i = 0; i <= Math.min(k - 1, n - j - k - 1); i++) {
            if (Math.floor((i + j) / (p * 2)) === Math.floor((i + j + k) / (p * 2))) {
              T.ln(4);
              if (T.cmp(i + j, i + j + k) > 0) T.swap(i + j, i + j + k);
            }
          }
        }
      }
    }
  });

  // =================================================================
  //  JOKE & ESOTERIC SORTS
  // =================================================================
  def('stooge', [
    'stooge(i, j):',
    '  if a[i] > a[j]: swap(a[i], a[j])',
    '  if j - i + 1 > 2:',
    '    t = (j - i + 1) / 3',
    '    stooge(i, j-t)      // first 2/3',
    '    stooge(i+t, j)      // last 2/3',
    '    stooge(i, j-t)      // first 2/3 again',
  ], function (T) {
    const st = (i, j) => {
      T.enter(i, j);
      T.ln(2);
      if (T.cmp(i, j) > 0) T.swap(i, j);
      if (j - i + 1 > 2) {
        const t = Math.floor((j - i + 1) / 3);
        T.ln(5); st(i, j - t);
        T.ln(6); st(i + t, j);
        T.ln(7); st(i, j - t);
      }
      T.leave();
    };
    if (T.n > 1) st(0, T.n - 1);
  });

  def('slow', [
    'slowsort(i, j):',
    '  if i >= j: return',
    '  m = (i + j) / 2',
    '  slowsort(i, m); slowsort(m+1, j)    // maxima now at m and j',
    '  if a[j] < a[m]: swap(a[j], a[m])    // the larger goes to the end',
    '  slowsort(i, j-1)                     // sort everything else',
  ], function (T) {
    const slow = (i, j) => {
      if (i >= j) return;
      T.enter(i, j);
      const m = (i + j) >> 1;
      T.ln(4);
      slow(i, m); slow(m + 1, j);
      T.ln(5);
      if (T.cmp(j, m) < 0) T.swap(j, m);
      T.ln(6);
      slow(i, j - 1);
      T.leave();
    };
    slow(0, T.n - 1);
  });

  def('bogo', [
    'while not sorted(a):',
    '  shuffle(a)          // Fisher–Yates, completely random',
    'sorted(a): check a[i] <= a[i+1] for every i',
  ], function (T) {
    const n = T.n;
    const isSorted = () => { T.ln(3); for (let i = 0; i + 1 < n; i++) if (T.cmp(i, i + 1) > 0) return false; return true; };
    let k = 0;
    while (!isSorted()) {
      T.ln(2); T.note('shuffle', ++k);
      for (let i = n - 1; i > 0; i--) T.swap(i, T.randInt(i + 1));
    }
  });

  def('sleep', [
    'for each element x:',
    '  start a thread that sleeps for x ms, then appends x to the output',
    '(the threads wake up in the order of their values)',
    'output position k receives the k-th thread that wakes up',
  ], function (T) {
    const n = T.n;
    T.aux(0, n, 'sleeping threads');
    T.note('sleeping');
    for (let i = 0; i < n; i++) { T.ln(2); T.toAux(0, i, i); }
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    const keys = order.map((i) => T.key(T.auxVal(0, i)));
    order.sort((p, q) => keys[p] - keys[q] || p - q);     // the "clock"
    let k = 0;
    for (const idx of order) {
      T.ln(4);
      T.note('wake', T.auxVal(0, idx));
      T.fromAux(0, idx, k++);
      T.auxSet(0, idx, 0);
    }
  });

  def('spaghetti', [
    'cut one rod per value and stand them all upright',
    'repeat n times:',
    '  lower your hand until it touches the tallest rod',
    '  pull that rod out → it goes to the end of the output',
  ], function (T) {
    const n = T.n;
    T.aux(0, n, 'rods');
    T.ln(1); T.note('rods');
    for (let i = 0; i < n; i++) T.toAux(0, i, i);
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    const keys = order.map((i) => T.key(T.auxVal(0, i)));
    order.sort((p, q) => keys[q] - keys[p] || q - p);    // physics: tallest first
    for (let k = n - 1, o = 0; k >= 0; k--, o++) {
      const idx = order[o];
      T.ln(3);
      T.cmpa(T.auxVal(0, idx), T.auxVal(0, idx), -1, -1, idx, -1);   // hand touches the rod
      T.note('pullTallest', T.auxVal(0, idx));
      T.ln(4);
      T.fromAux(0, idx, k);
      T.auxSet(0, idx, 0);
    }
  });

  // ---------------------------------------------------------------- export
  const api = {
    OP, OP_CLASS, INF, MAX_VALUE, NOTES, ALG, CODE, LEO,
    Tracker, record, countRun, traceBuffers, makeInput, makeKiller, statDeltas, mulberry32, hashStr,
    compileCustom(code) {
      // eslint-disable-next-line no-new-func
      return new Function('T', '"use strict";\n' + code + '\n;if (typeof sort !== "function") throw new Error("Please define function sort(T) { … }");\nsort(T);');
    },
  };
  global.SortViz = global.SortViz || {};
  Object.assign(global.SortViz, api);
  return api;
}
SortVizCore(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
