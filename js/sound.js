/* =====================================================================
 * sound.js – Web Audio tones.
 *   pitch   = value (low values → low notes)
 *   timbre  = kind of operation (compare / swap+write / read / sweep)
 *   panning = position in the array (left … right)
 * ===================================================================== */
(function (global) {
  'use strict';

  const WAVES = ['triangle', 'square', 'square', 'sine', 'sine'];   // by op class; 4 = sweep
  const GAINS = [1, 0.45, 0.45, 0.8, 0.7];

  const Sound = {
    ctx: null, master: null, comp: null, streamDest: null,
    enabled: false, volume: 0.3,

    ensure() {
      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.comp = this.ctx.createDynamicsCompressor();
        this.master.connect(this.comp);
        this.comp.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    },

    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },

    /** A MediaStream carrying the sound (for video export). */
    stream() {
      if (!this.ensure()) return null;
      if (!this.streamDest) {
        this.streamDest = this.ctx.createMediaStreamDestination();
        this.comp.connect(this.streamDest);
      }
      return this.streamDest.stream;
    },

    /**
     * @param {number} frac   0…1 – height of the value
     * @param {number} cls    0 compare, 1 swap, 2 write, 3 read, 4 sweep
     * @param {number} pan    -1 … 1
     * @param {number} gain   loudness factor
     * @param {number} dur    seconds
     */
    note(frac, cls, pan, gain, dur) {
      if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
      const c = this.ctx, t = c.currentTime;
      const f = 140 * Math.pow(2, Math.max(0, Math.min(1, frac)) * 3.4);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = WAVES[cls] || 'sine';
      o.frequency.value = cls === 4 ? f * 1.5 : f;
      const peak = gain * (GAINS[cls] || 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = g;
      if (c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan));
        g.connect(p);
        node = p;
      }
      o.connect(g);
      node.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
  };

  global.SortViz.Sound = Sound;
})(window);
