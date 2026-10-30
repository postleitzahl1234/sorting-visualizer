/* =====================================================================
 * export.js – "Record run": rewinds, plays and records a WebM video
 * (1280×720, including sound if it is switched on).
 * ===================================================================== */
(function (global) {
  'use strict';
  const SV = global.SortViz;

  let App = null;
  const X = {
    rec: null, chunks: [], canvas: null, ctx: null, active: false, stopAt: 0, mime: '',

    init(app) {
      App = app;
      document.getElementById('recordBtn').addEventListener('click', () => (this.active ? this.stop() : this.start()));
      SV.I18N.onChange(() => this.updateButton());
    },

    supported() {
      return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
    },

    pickMime() {
      const c = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      return c.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
    },

    async start() {
      const t = App.t;
      if (!this.supported()) { App.toast(t('rec.unsupported'), 5000); return; }
      if (App.state.busy) return;
      this.canvas = document.createElement('canvas');
      this.canvas.width = 1280; this.canvas.height = 720;
      this.ctx = this.canvas.getContext('2d');
      this.compose();
      const stream = this.canvas.captureStream(30);
      if (App.state.sound) {
        const a = SV.Sound.stream();
        if (a) a.getAudioTracks().forEach((tr) => stream.addTrack(tr));
      }
      this.mime = this.pickMime();
      try {
        this.rec = new MediaRecorder(stream, this.mime ? { mimeType: this.mime, videoBitsPerSecond: 6000000 } : undefined);
      } catch (e) { App.toast(t('rec.unsupported'), 5000); return; }
      this.chunks = [];
      this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.rec.onstop = () => this.save();
      this.active = true;
      this.stopAt = 0;
      this.updateButton();
      App.pause();
      App.seekTo(0);
      this.rec.start(500);
      const secs = App.state.maxCost / App.state.opsPerSec;
      if (secs > 120) App.toast(t('rec.long', { s: Math.round(secs) }), 6000);
      setTimeout(() => App.play(), 400);
    },

    stop() {
      if (!this.active) return;
      this.active = false;
      this.updateButton();
      try { this.rec.stop(); } catch (e) { /* ignore */ }
    },

    save() {
      const blob = new Blob(this.chunks, { type: this.mime || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const names = App.lanes.map((l) => App.algoName(l.algoId).replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')).join('_vs_');
      const a = document.createElement('a');
      a.href = url;
      a.download = `sorting_${names || 'run'}_n${App.state.n}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      App.toast(App.t('rec.saved', { file: a.download }), 6000);
    },

    updateButton() {
      const b = document.getElementById('recordBtn');
      b.classList.toggle('recording', this.active);
      b.querySelector('[data-i18n]').textContent = App.t(this.active ? 'rec.stop' : 'rec.start');
    },

    onFrame(now) {
      if (!this.active) return;
      this.compose();
      if (!App.state.playing && App.allFinished()) {
        if (!this.stopAt) this.stopAt = now + 1200;
        else if (now >= this.stopAt) this.stop();
      } else this.stopAt = 0;
    },

    compose() {
      const ctx = this.ctx, W = 1280, H = 720;
      const cs = getComputedStyle(document.documentElement);
      const col = (n) => cs.getPropertyValue(n).trim();
      ctx.fillStyle = col('--bg');
      ctx.fillRect(0, 0, W, H);
      const lanes = App.lanes;
      const cols = lanes.length >= 3 ? 2 : 1, rows = Math.ceil(lanes.length / cols);
      const pad = 16, footer = 34;
      const cw = (W - pad * (cols + 1)) / cols, ch = (H - footer - pad * (rows + 1)) / rows;
      lanes.forEach((L, i) => {
        const cx = pad + (i % cols) * (cw + pad), cy = pad + Math.floor(i / cols) * (ch + pad);
        ctx.fillStyle = col('--panel');
        ctx.fillRect(cx, cy, cw, ch);
        ctx.fillStyle = col('--text');
        ctx.font = '600 20px system-ui, sans-serif';
        ctx.textBaseline = 'top';
        const name = App.state.hideNames ? '???' : App.algoName(L.algoId);
        ctx.fillText(name, cx + 12, cy + 10);
        ctx.fillStyle = col('--muted');
        ctx.font = '14px system-ui, sans-serif';
        const st = L.st;
        ctx.fillText(`${App.fmt(L.pos)} ${App.t('stat.steps')} · ${App.fmt(st[0])} ${App.t('stat.cmp')} · ${App.fmt(st[1])} ${App.t('stat.swaps')} · ${App.fmt(st[2])} ${App.t('stat.writes')}`, cx + 12, cy + 36);
        const top = cy + 58, ih = ch - 66, iw = cw - 16;
        const src = L.canvas;
        if (src.width && src.height) {
          const s = Math.min(iw / src.width, ih / src.height);
          const w = src.width * s, h = src.height * s;
          ctx.drawImage(src, cx + 8 + (iw - w) / 2, top + (ih - h) / 2, w, h);
        }
      });
      ctx.fillStyle = col('--muted');
      ctx.font = '15px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${App.t('app.title')} · n = ${App.fmt(App.state.n)} · ${App.t('input.' + App.state.input)}`, pad, H - footer / 2);
    },
  };

  global.SortViz.Exporter = X;
})(window);
