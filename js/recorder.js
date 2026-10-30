/* =====================================================================
 * recorder.js – runs recordings in a background Web Worker.
 * The worker is created from a Blob that contains the source text of
 * SortVizCore, so it also works when the page is opened via file://.
 * If workers are unavailable, everything falls back to the main thread.
 * ===================================================================== */
(function (global) {
  'use strict';
  const SV = global.SortViz;

  // ---- code that runs INSIDE the worker ------------------------------
  function workerMain(self, SV) {
    const analyze = (m) => {
      const res = {};
      const total = m.algos.length * m.sizes.length;
      let done = 0;
      for (const id of m.algos) {
        res[id] = [];
        let stopped = false;
        const fn = id === 'custom' && m.customCode ? SV.compileCustom(m.customCode) : undefined;
        for (const n of m.sizes) {
          if (stopped) { res[id].push(null); done++; continue; }
          const acc = { steps: 0, cmp: 0, swaps: 0, writes: 0, reads: 0, aux: 0, cls: [0, 0, 0, 0] };
          const trials = ['shuffled', 'dups', 'few', 'nearly', 'stability'].includes(m.input) ? m.trials : 1;
          const t0 = Date.now();
          let capped = false;
          for (let t = 0; t < trials; t++) {
            const seed = (m.seed + t * 7919 + n * 31) >>> 0;
            const inp = m.input === 'killer' ? SV.makeKiller(id, n, seed) : SV.makeInput(m.input, n, seed);
            const r = SV.countRun(id, inp.values, { cap: m.capOps, seed, keyDiv: inp.keyDiv, fn });
            if (r.capped) { capped = true; break; }
            acc.steps += r.len; acc.cmp += r.stats[0]; acc.swaps += r.stats[1]; acc.writes += r.stats[2];
            acc.reads += r.stats[3]; acc.aux += r.stats[4];
            for (let c = 0; c < 4; c++) acc.cls[c] += r.classCounts[c];
          }
          if (capped) { res[id].push({ capped: true }); stopped = true; }
          else {
            for (const k of ['steps', 'cmp', 'swaps', 'writes', 'reads', 'aux']) acc[k] /= trials;
            acc.cls = acc.cls.map((v) => v / trials);
            res[id].push(acc);
            if (Date.now() - t0 > m.timeBudgetMs) stopped = true;
          }
          done++;
          self.postMessage({ id: m.id, progress: done / total });
        }
      }
      return res;
    };
    self.onmessage = (e) => {
      const m = e.data;
      try {
        if (m.type === 'ping') { self.postMessage({ id: m.id, ok: true }); return; }
        if (m.type === 'record') {
          const fn = m.customCode ? SV.compileCustom(m.customCode) : undefined;
          const tr = SV.record(m.algoId, m.values, { cap: m.cap, seed: m.seed, keyDiv: m.keyDiv, fn });
          self.postMessage({ id: m.id, ok: true, trace: tr }, SV.traceBuffers(tr));
        } else if (m.type === 'killer') {
          const r = SV.makeKiller(m.algoId, m.n, m.seed);
          self.postMessage({ id: m.id, ok: true, values: r.values });
        } else if (m.type === 'analyze') {
          self.postMessage({ id: m.id, ok: true, result: analyze(m) });
        }
      } catch (err) {
        self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
      }
    };
  }

  function workerSource() {
    /* global SortVizCore */
    return `${SortVizCore.toString()}\nconst SV = SortVizCore(self);\n(${workerMain.toString()})(self, SV);\n`;
  }

  function makeWorker() {
    const blob = new Blob([workerSource()], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    w._url = url;
    return w;
  }

  // ---- main-thread side ----------------------------------------------
  let seq = 0;
  const Recorder = {
    worker: null,
    pending: new Map(),
    ready: null,
    usingWorker: false,

    init() {
      this.ready = new Promise((resolve) => {
        try {
          this.worker = makeWorker();
        } catch (e) { resolve(false); return; }
        const timer = setTimeout(() => resolve(false), 2500);
        this.worker.onmessage = (e) => {
          const m = e.data;
          const p = this.pending.get(m.id);
          if (!p) return;
          if (m.progress != null) { if (p.onProgress) p.onProgress(m.progress); return; }
          this.pending.delete(m.id);
          m.ok ? p.resolve(m) : p.reject(new Error(m.error));
        };
        this.worker.onerror = () => { clearTimeout(timer); resolve(false); };
        const id = ++seq;
        this.pending.set(id, { resolve: () => { clearTimeout(timer); resolve(true); }, reject: () => resolve(false) });
        this.worker.postMessage({ type: 'ping', id });
      }).then((ok) => {
        this.usingWorker = ok;
        if (!ok && this.worker) { try { this.worker.terminate(); } catch (e) { /* ignore */ } this.worker = null; }
        return ok;
      });
      return this.ready;
    },

    _call(msg, transfer, onProgress) {
      const id = ++seq;
      msg.id = id;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject, onProgress });
        this.worker.postMessage(msg, transfer || []);
      });
    },

    /** Record one lane. opts: {cap, seed, keyDiv, customCode} */
    async record(algoId, values, opts) {
      const ok = await this.ready;
      if (ok) {
        const v = Int32Array.from(values);
        const m = await this._call({ type: 'record', algoId, values: v, cap: opts.cap, seed: opts.seed, keyDiv: opts.keyDiv, customCode: opts.customCode }, [v.buffer]);
        return m.trace;
      }
      await new Promise((r) => setTimeout(r, 0));
      const fn = opts.customCode ? SV.compileCustom(opts.customCode) : undefined;
      return SV.record(algoId, values, { cap: opts.cap, seed: opts.seed, keyDiv: opts.keyDiv, fn });
    },

    async killer(algoId, n, seed) {
      const ok = await this.ready;
      if (ok) return (await this._call({ type: 'killer', algoId, n, seed })).values;
      return SV.makeKiller(algoId, n, seed).values;
    },

    /** Custom code runs in its own worker so an endless loop can be stopped. */
    async recordCustom(code, values, opts, timeoutMs = 6000) {
      const ok = await this.ready;
      if (!ok) {
        const fn = SV.compileCustom(code);
        return SV.record('custom', values, { cap: opts.cap, seed: opts.seed, keyDiv: opts.keyDiv, fn });
      }
      const w = makeWorker();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { w.terminate(); reject(new Error('timeout')); }, timeoutMs);
        w.onmessage = (e) => {
          clearTimeout(timer); w.terminate();
          e.data.ok ? resolve(e.data.trace) : reject(new Error(e.data.error));
        };
        w.onerror = (e) => { clearTimeout(timer); w.terminate(); reject(new Error(e.message || 'worker error')); };
        const v = Int32Array.from(values);
        w.postMessage({ type: 'record', id: 1, algoId: 'custom', values: v, cap: opts.cap, seed: opts.seed, keyDiv: opts.keyDiv, customCode: code }, [v.buffer]);
      });
    },

    /** Analysis job in a dedicated worker; returns { promise, cancel }. */
    analyze(job, onProgress) {
      let w = null, cancelled = false;
      const promise = this.ready.then((ok) => {
        if (!ok) {
          // main-thread fallback (blocking, but correct)
          let res = null, err = null;
          const fakeSelf = {
            onmessage: null,
            postMessage(m) {
              if (m.progress != null) { if (onProgress) onProgress(m.progress); return; }
              if (m.ok) res = m.result; else err = m.error;
            },
          };
          workerMain(fakeSelf, SV);
          fakeSelf.onmessage({ data: Object.assign({ type: 'analyze', id: 1 }, job) });
          if (err) throw new Error(err);
          return res;
        }
        w = makeWorker();
        return new Promise((resolve, reject) => {
          w.onmessage = (e) => {
            const m = e.data;
            if (m.progress != null) { if (onProgress) onProgress(m.progress); return; }
            w.terminate();
            m.ok ? resolve(m.result) : reject(new Error(m.error));
          };
          w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'worker error')); };
          w.postMessage(Object.assign({ type: 'analyze', id: 1 }, job));
        });
      });
      return {
        promise,
        cancel() { cancelled = true; if (w) w.terminate(); },
        get cancelled() { return cancelled; },
      };
    },
  };

  global.SortViz.Recorder = Recorder;
})(window);
