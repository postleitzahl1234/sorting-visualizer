/* =====================================================================
 * quiz.js – three quiz modes, one question at a time
 *   guess   : which algorithm is this?
 *   predict : which two bars will be touched next?
 *   race    : which of two algorithms finishes first?
 * ===================================================================== */
(function (global) {
  'use strict';
  const SV = global.SortViz;

  const GUESS_POOL = ['bubble', 'cocktail', 'oddeven', 'comb', 'gnome', 'circle', 'selection', 'doubleselection', 'cycle',
    'pancake', 'heap', 'smooth', 'tournament', 'insertion', 'binaryinsertion', 'shell', 'tree', 'merge', 'mergebu', 'tim',
    'inplacemerge', 'patience', 'strand', 'quicklomuto', 'quickhoare', 'dualpivot', 'quick3', 'intro', 'counting',
    'radixlsd', 'radixmsd', 'bucket', 'gravity', 'bitonic', 'oddevenmerge', 'stooge', 'sleep', 'spaghetti'];
  const PREDICT_POOL = ['bubble', 'cocktail', 'oddeven', 'comb', 'gnome', 'selection', 'doubleselection', 'pancake', 'heap',
    'quicklomuto', 'quickhoare', 'dualpivot', 'circle', 'bitonic', 'oddevenmerge', 'smooth', 'inplacemerge'];
  const RACE_POOL = ['bubble', 'cocktail', 'comb', 'gnome', 'selection', 'cycle', 'heap', 'smooth', 'insertion',
    'binaryinsertion', 'shell', 'merge', 'mergebu', 'tim', 'inplacemerge', 'quicklomuto', 'quickhoare', 'dualpivot',
    'quick3', 'intro', 'pdq', 'counting', 'radixlsd', 'bucket', 'bitonic'];
  const RACE_INPUTS = ['shuffled', 'nearly', 'reversed', 'few', 'sorted'];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let App = null;
  const Q = {
    active: false, mode: null, score: 0, asked: 0, saved: null, q: null, busy: false,

    init(app) {
      App = app;
      SV.I18N.onChange(() => { if (Q.active) Q.render(); });
    },
    panel() { return document.getElementById('quizPanel'); },

    open() {
      if (this.active) return;
      this.active = true;
      this.saved = App.snapshot();
      this.mode = null; this.q = null; this.score = 0; this.asked = 0;
      this.render();
    },

    async close() {
      if (!this.active) return;
      this.active = false;
      this.q = null;
      App.setHidden(false);
      App.lanes.forEach((L) => { L.quizSel = null; });
      const s = this.saved;
      this.saved = null;
      if (s) await App.setup({ algos: s.algos, n: s.n, input: s.input, seed: s.seed, view: s.view, speed: s.speed, weights: s.weights, preset: s.preset, custom: s.custom });
    },

    wantsClicks() { return this.active && this.q && this.q.mode === 'predict' && !this.q.answered; },

    // ---------------------------------------------------------------
    async start(mode) {
      this.mode = mode;
      await this.next();
    },

    async next() {
      if (this.busy) return;
      this.busy = true;
      const t = App.t;
      App.lanes.forEach((L) => { L.quizSel = null; });
      this.q = { mode: this.mode, loading: true };
      this.render();
      try {
        if (this.mode === 'guess') {
          const id = pick(GUESS_POOL);
          const n = ['stooge'].includes(id) ? 32 : 48;
          await App.setup({ algos: [id], n, input: 'shuffled', view: 'bars', weights: [1, 1, 1, 1], preset: 'steps', freezeUrl: true });
          App.setHidden(true);
          const cat = App.INFO_BY_ID[id].cat;
          const same = GUESS_POOL.filter((x) => x !== id && App.INFO_BY_ID[x].cat === cat);
          const others = GUESS_POOL.filter((x) => x !== id && App.INFO_BY_ID[x].cat !== cat);
          const opts = new Set([id]);
          if (same.length) opts.add(pick(same));
          for (const x of shuffle(others)) { if (opts.size >= 4) break; opts.add(x); }
          this.q = { mode: 'guess', answer: id, options: shuffle([...opts]) };
          const L = App.lanes[0];
          App.setSpeed(Math.max(20, L.trace.len / 10));
          App.play();
        } else if (this.mode === 'predict') {
          const id = pick(PREDICT_POOL);
          await App.setup({ algos: [id], n: 20, input: 'shuffled', view: 'bars', weights: [1, 1, 1, 1], preset: 'steps', freezeUrl: true });
          App.setHidden(false);
          const L = App.lanes[0], tr = L.trace;
          const cands = [];
          for (let k = Math.floor(tr.len * 0.1); k < Math.floor(tr.len * 0.9); k++) {
            if ((tr.op[k] === 0 || tr.op[k] === 3) && tr.x[k] !== tr.y[k]) cands.push(k);
          }
          const k = cands.length ? pick(cands) : 0;
          App.seekTo(k);
          L.quizSel = new Set();
          this.q = { mode: 'predict', algo: id, k, want: [tr.x[k], tr.y[k]].sort((a, b) => a - b), line: tr.ln[k] };
          App.redraw();
        } else if (this.mode === 'race') {
          let a = pick(RACE_POOL), b = pick(RACE_POOL);
          while (b === a || App.INFO_BY_ID[b].cat === App.INFO_BY_ID[a].cat) b = pick(RACE_POOL);
          const input = pick(RACE_INPUTS);
          await App.setup({ algos: [a, b], n: 64, input, view: 'bars', weights: [1, 1, 1, 1], preset: 'steps', freezeUrl: true });
          App.setHidden(false);
          const [la, lb] = App.lanes;
          const winner = la.trace.len === lb.trace.len ? 'tie' : la.trace.len < lb.trace.len ? a : b;
          this.q = { mode: 'race', a, b, input, winner, options: [a, b, 'tie'] };
          App.setSpeed(Math.max(50, Math.max(la.trace.len, lb.trace.len) / 8));
        }
      } finally {
        this.busy = false;
      }
      this.render();
      void t;
    },

    answer(choice) {
      const q = this.q;
      if (!q || q.answered) return;
      q.answered = true;
      q.choice = choice;
      this.asked++;
      if (q.mode === 'guess') {
        q.correct = choice === q.answer;
        App.setHidden(false);
      } else if (q.mode === 'race') {
        q.correct = choice === q.winner;
        App.play();
      }
      if (q.correct) this.score++;
      this.render();
    },

    onBarClick(L, i) {
      const q = this.q;
      if (!q || q.mode !== 'predict' || q.answered || L !== App.lanes[0]) return;
      if (L.quizSel.has(i)) L.quizSel.delete(i); else if (L.quizSel.size < 2) L.quizSel.add(i);
      App.redraw();
      if (L.quizSel.size === 2) {
        const got = [...L.quizSel].sort((a, b) => a - b);
        q.answered = true;
        q.got = got;
        q.correct = got[0] === q.want[0] && got[1] === q.want[1];
        this.asked++;
        if (q.correct) this.score++;
        App.step(1);
        App.redraw();
      }
      this.render();
    },

    showHint() { if (this.q) { this.q.hint = true; this.render(); } },

    onRecorded() { /* hook – nothing to do */ },

    // ---------------------------------------------------------------
    render() {
      const el = this.panel();
      if (!el || !this.active) return;
      const t = App.t, esc = App.esc, name = (id) => App.algoName(id);
      const q = this.q;
      const modes = ['guess', 'predict', 'race'].map((m) =>
        `<button class="chip ${this.mode === m ? 'on' : ''}" data-mode="${m}">${esc(t('quiz.mode.' + m))}</button>`).join('');
      let body = '';
      if (!this.mode) {
        body = `<p class="muted">${esc(t('quiz.intro'))}</p>`;
      } else if (!q || q.loading) {
        body = `<p class="muted">${esc(t('quiz.loading'))}</p>`;
      } else if (q.mode === 'guess') {
        body = `<p class="q">${esc(t('quiz.guess.q'))}</p>
          <div class="opts">${q.options.map((id) => {
            let cls = '';
            if (q.answered) cls = id === q.answer ? 'right' : id === q.choice ? 'wrong' : '';
            return `<button class="opt ${cls}" data-choice="${id}" ${q.answered ? 'disabled' : ''}>${esc(name(id))}</button>`;
          }).join('')}</div>`;
        if (q.answered) body += `<p class="fb ${q.correct ? 'ok' : 'bad'}"><b>${esc(t(q.correct ? 'quiz.right' : 'quiz.wrong'))}</b> ${esc(t('quiz.guess.was', { name: name(q.answer) }))} ${esc(SV.I18N.info(q.answer).summary)}</p>`;
      } else if (q.mode === 'predict') {
        body = `<p class="q">${esc(t('quiz.predict.q', { name: name(q.algo) }))}</p>`;
        if (!q.answered) {
          body += `<p class="muted small">${esc(t('quiz.predict.how'))}</p>`;
          if (q.hint) body += `<p class="hint"><code>${esc((SV.CODE[q.algo] || [])[q.line - 1] || '')}</code></p>`;
          else body += `<button class="btn small-btn" data-act="hint">${esc(t('quiz.hint'))}</button>`;
        } else {
          body += `<p class="fb ${q.correct ? 'ok' : 'bad'}"><b>${esc(t(q.correct ? 'quiz.right' : 'quiz.wrong'))}</b> ${esc(t('quiz.predict.was', { a: q.want[0], b: q.want[1], x: q.got[0], y: q.got[1] }))}</p>`;
        }
      } else if (q.mode === 'race') {
        body = `<p class="q">${esc(t('quiz.race.q', { input: t('input.' + q.input) }))}</p>
          <div class="opts">${q.options.map((id) => {
            let cls = '';
            if (q.answered) cls = id === q.winner ? 'right' : id === q.choice ? 'wrong' : '';
            const label = id === 'tie' ? t('quiz.race.tie') : name(id);
            return `<button class="opt ${cls}" data-choice="${id}" ${q.answered ? 'disabled' : ''}>${esc(label)}</button>`;
          }).join('')}</div>`;
        if (q.answered) {
          const [la, lb] = App.lanes;
          body += `<p class="fb ${q.correct ? 'ok' : 'bad'}"><b>${esc(t(q.correct ? 'quiz.right' : 'quiz.wrong'))}</b> ${esc(t('quiz.race.result', { a: name(q.a), sa: App.fmt(la.trace.len), b: name(q.b), sb: App.fmt(lb.trace.len) }))}</p>`;
        }
      }
      const next = this.mode && q && !q.loading && q.answered ? `<button class="btn primary" data-act="next">${esc(t('quiz.next'))}</button>` : '';
      el.innerHTML = `
        <div class="quiz-head"><b>${esc(t('dock.quiz'))}</b><span class="score">${esc(t('quiz.score', { a: this.score, b: this.asked }))}</span></div>
        <div class="quiz-modes">${modes}</div>
        <div class="quiz-body">${body}</div>
        <div class="quiz-foot">${next}<button class="btn" data-act="exit">${esc(t('quiz.exit'))}</button></div>`;
      el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => this.start(b.dataset.mode)));
      el.querySelectorAll('[data-choice]').forEach((b) => b.addEventListener('click', () => this.answer(b.dataset.choice)));
      const on = (act, fn) => { const b = el.querySelector(`[data-act="${act}"]`); if (b) b.addEventListener('click', fn); };
      on('next', () => this.next());
      on('hint', () => this.showHint());
      on('exit', () => App.setDock(null));
    },
  };

  global.SortViz.Quiz = Q;
})(window);
