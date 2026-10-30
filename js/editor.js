/* =====================================================================
 * editor.js – write your own sorting algorithm against the Tracker API.
 * The code runs in its own Web Worker with a time limit, so an endless
 * loop cannot freeze the page.
 * ===================================================================== */
(function (global) {
  'use strict';
  const SV = global.SortViz;
  const STORE_KEY = 'sortviz.customCode';

  const EXAMPLES = {
    bubble: `// Bubble sort – the classic
function sort(T) {
  for (let end = T.n - 1; end > 0; end--) {
    let swapped = false;
    for (let i = 0; i < end; i++) {
      if (T.cmp(i, i + 1) > 0) {
        T.swap(i, i + 1);
        swapped = true;
      }
    }
    if (!swapped) break;
  }
}`,
    insertion: `// Insertion sort with shifting
function sort(T) {
  for (let i = 1; i < T.n; i++) {
    const key = T.get(i);
    let j = i - 1;
    while (j >= 0 && T.cmpv(j, key) > 0) {
      T.move(j + 1, j);
      j--;
    }
    T.set(j + 1, key);
  }
}`,
    quick: `// Quicksort (Lomuto partition) with a purple pivot marker
function sort(T) {
  quick(T, 0, T.n - 1);
}
function quick(T, lo, hi) {
  if (lo >= hi) return;
  T.enter(lo, hi);
  T.mark(hi);
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (T.cmp(j, hi) < 0) {
      T.swap(i, j);
      i++;
    }
  }
  T.swap(i, hi);
  T.mark(-1);
  T.say('pivot is now at index ' + i);
  quick(T, lo, i - 1);
  quick(T, i + 1, hi);
  T.leave();
}`,
    selection: `// Selection sort
function sort(T) {
  for (let i = 0; i < T.n - 1; i++) {
    let min = i;
    for (let j = i + 1; j < T.n; j++) {
      if (T.cmp(j, min) < 0) min = j;
    }
    T.swap(i, min);
  }
}`,
    buffer: `// Merge sort using a helper array (shown under the bars)
function sort(T) {
  T.aux(0, T.n, 'buffer');
  mergeSort(T, 0, T.n - 1);
}
function mergeSort(T, lo, hi) {
  if (lo >= hi) return;
  const mid = (lo + hi) >> 1;
  mergeSort(T, lo, mid);
  mergeSort(T, mid + 1, hi);
  for (let k = lo; k <= hi; k++) T.toAux(0, k, k);
  let i = lo, j = mid + 1;
  for (let k = lo; k <= hi; k++) {
    if (i > mid) T.fromAux(0, j++, k);
    else if (j > hi) T.fromAux(0, i++, k);
    else if (T.cmpAA(j, i, k) < 0) T.fromAux(0, j++, k);
    else T.fromAux(0, i++, k);
  }
}`,
    empty: `// Your algorithm. Define sort(T) and use T's methods only.
function sort(T) {

}`,
  };

  /** Insert T.ln(k) at the start of lines that begin a statement. */
  function instrument(code) {
    const lines = code.split('\n');
    const out = [];
    let prevEnd = ';';
    let inBlockComment = false;
    const skipStart = /^(}|\)|\]|\.|\?|:|&&|\|\||\+|-|\*|\/(?!\/)|,|else\b|catch\b|finally\b|case\b|default\b|function\b)/;
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      let prefix = '';
      if (inBlockComment) {
        if (trimmed.includes('*/')) inBlockComment = false;
      } else if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) inBlockComment = true;
      } else if (trimmed && !trimmed.startsWith('//')) {
        if (/[;{}]$/.test(prevEnd) && !skipStart.test(trimmed) && i + 1 <= 255) prefix = `T.ln(${i + 1}); `;
        prevEnd = trimmed.replace(/\/\/.*$/, '').trim().slice(-1) || prevEnd;
      }
      if (prefix) {
        const ind = line.match(/^\s*/)[0];
        out.push(ind + prefix + line.slice(ind.length));
      } else out.push(line);
    });
    return out.join('\n');
  }

  let App = null;
  const E = {
    code: '', auto: true,

    init(app, codeFromUrl) {
      App = app;
      let saved = null;
      try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* storage unavailable */ }
      this.code = codeFromUrl || saved || EXAMPLES.bubble;
      if (codeFromUrl) this.prepare();
      SV.I18N.onChange(() => this.build());
      this.build();
    },

    root() { return document.getElementById('editorRoot'); },

    prepare() {
      const lines = this.code.split('\n');
      let instrumented = null;
      if (this.auto) {
        instrumented = instrument(this.code);
        try { SV.compileCustom(instrumented); } catch (e) { instrumented = null; }
      }
      App.state.customCode = this.code;
      App.state.customLines = lines;
      App.state.customInstrumented = instrumented;
      return { lines, instrumented };
    },

    build() {
      const el = this.root();
      if (!el || !App) return;
      const t = App.t, esc = App.esc;
      const api = [
        ['T.n', 'api.n'], ['T.cmp(i, j)', 'api.cmp'], ['T.cmpv(i, v)', 'api.cmpv'], ['T.get(i)', 'api.get'],
        ['T.set(i, v)', 'api.set'], ['T.move(dst, src)', 'api.move'], ['T.swap(i, j)', 'api.swap'],
        ['T.aux(t, size, label)', 'api.aux'], ['T.toAux(t, p, i) / T.fromAux(t, p, i)', 'api.toAux'],
        ['T.auxSet(t, p, v) / T.auxGet(t, p)', 'api.auxSet'], ['T.cmpMA(i, p) / T.cmpAA(p, q)', 'api.cmpAux'],
        ['T.mark(i, j)', 'api.mark'], ['T.enter(lo, hi) / T.leave()', 'api.enter'], ['T.say(text)', 'api.say'],
        ['T.ln(k)', 'api.ln'], ['T.random() / T.randInt(k)', 'api.random'],
      ];
      el.innerHTML = `
        <div class="ed-grid">
          <div class="ed-main">
            <div class="ed-toolbar">
              <label>${esc(t('ed.examples'))}
                <select id="edExample">
                  <option value="">—</option>
                  ${Object.keys(EXAMPLES).map((k) => `<option value="${k}">${esc(t('ed.ex.' + k))}</option>`).join('')}
                </select>
              </label>
              <label class="toggle"><input type="checkbox" id="edAuto" ${this.auto ? 'checked' : ''}> <span>${esc(t('ed.auto'))}</span></label>
              <button class="btn primary" id="edRun">▶ ${esc(t('ed.run'))}</button>
            </div>
            <div class="ed-box">
              <pre class="ed-gutter" id="edGutter" aria-hidden="true"></pre>
              <textarea id="edCode" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="${esc(t('ed.codeLabel'))}"></textarea>
            </div>
            <div class="ed-status" id="edStatus"></div>
          </div>
          <div class="ed-side">
            <h3>${esc(t('ed.apiTitle'))}</h3>
            <p class="muted small">${esc(t('ed.apiIntro'))}</p>
            <dl class="api">${api.map(([sig, k]) => `<dt><code>${esc(sig)}</code></dt><dd>${esc(t(k))}</dd>`).join('')}</dl>
          </div>
        </div>`;
      const ta = el.querySelector('#edCode');
      ta.value = this.code;
      const gutter = el.querySelector('#edGutter');
      const syncGutter = () => {
        const n = ta.value.split('\n').length;
        gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
        gutter.scrollTop = ta.scrollTop;
      };
      syncGutter();
      ta.addEventListener('input', () => {
        this.code = ta.value;
        syncGutter();
        try { localStorage.setItem(STORE_KEY, this.code); } catch (e) { /* ignore */ }
      });
      ta.addEventListener('scroll', () => { gutter.scrollTop = ta.scrollTop; });
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const s = ta.selectionStart, en = ta.selectionEnd;
          ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en);
          ta.selectionStart = ta.selectionEnd = s + 2;
          ta.dispatchEvent(new Event('input'));
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.run(); }
      });
      el.querySelector('#edExample').addEventListener('change', (e) => {
        const k = e.target.value;
        if (!k) return;
        ta.value = EXAMPLES[k];
        ta.dispatchEvent(new Event('input'));
        e.target.value = '';
      });
      el.querySelector('#edAuto').addEventListener('change', (e) => { this.auto = e.target.checked; });
      el.querySelector('#edRun').addEventListener('click', () => this.run());
    },

    status(msg, cls) {
      const s = this.root().querySelector('#edStatus');
      if (!s) return;
      s.textContent = msg;
      s.className = 'ed-status ' + (cls || '');
    },

    async run() {
      const t = App.t;
      try { SV.compileCustom(this.code); } catch (e) {
        this.status(t('ed.syntax', { msg: e.message }), 'bad');
        return;
      }
      this.status(t('ed.running'), '');
      const { lines, instrumented } = this.prepare();
      if (this.auto && !instrumented) this.status(t('ed.noAuto'), 'warn');
      await App.useCustom(this.code, lines, instrumented);
    },

    reportRun(tr, initial, keyDiv) {
      const t = App.t;
      if (tr.error) { this.status(t('custom.runtimeError', { msg: tr.error }), 'bad'); return; }
      if (tr.capped) { this.status(t('ed.capped'), 'warn'); return; }
      const key = (v) => Math.floor(v / keyDiv);
      const r = tr.result;
      for (let i = 1; i < r.length; i++) {
        if (key(r[i - 1]) > key(r[i])) { this.status(t('ed.notSorted', { i }), 'warn'); return; }
      }
      const a = Array.from(r).sort((x, y) => x - y).join(), b = Array.from(initial).sort((x, y) => x - y).join();
      if (a !== b) { this.status(t('ed.changed'), 'warn'); return; }
      this.status(t('ed.ok', { n: App.fmt(tr.len) }), 'ok');
    },

    reportError(msg) { this.status(msg, 'bad'); },
  };

  global.SortViz.Editor = E;
  global.SortViz.instrumentCode = instrument;
})(window);
