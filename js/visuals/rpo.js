/* Ch19 · How much work could you lose? A week-long timeline: work piles up as hourly bars, backups tick
   at the chosen frequency (1 h / 6 h / 24 h / 7 days). Work after the last tick is "at risk"; a disaster
   shades it red and reads out exactly how much you'd lose. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var HOURS = 168, SPEED = 2;           // 1 s shown = 2 h
  var FREQ = [1, 6, 24, 168];
  var FREQ_TXT = ['every hour', 'every 6 h', 'every 24 h', 'every 7 days'];
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function dur(h) {
    if (h < 1) return Math.round(h * 60) + ' min';
    var d = Math.floor(h / 24), hh = Math.floor(h - d * 24), mm = Math.round((h - Math.floor(h)) * 60);
    if (mm === 60) { hh++; mm = 0; }
    if (d) return d + (d > 1 ? ' days ' : ' day ') + hh + ' h';
    return hh + ' h' + (mm ? ' ' + mm + ' min' : '');
  }
  function stamp(h) { var d = Math.floor(h / 24) % 7, hh = Math.floor(h % 24), mm = Math.floor((h % 1) * 60); return DAYS[d] + ' ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; }

  S.defineVisual('rpo', {
    continuous: true,
    init: function () {
      var self = this;
      this.ctx = this.layer();
      this.work = new Float32Array(HOURS);
      var r = U.rng('rpo-work');
      for (var i = 0; i < HOURS; i++) {
        var d = Math.floor(i / 24), hr = i % 24, wk = d < 5;
        var base = wk ? (hr >= 9 && hr < 18 ? 0.75 : hr >= 19 && hr < 22 ? 0.22 : hr >= 7 && hr < 9 ? 0.18 : 0.02) : (hr >= 10 && hr < 16 ? 0.16 : 0.02);
        if (wk && (hr === 12)) base *= 0.5;
        this.work[i] = U.clamp(base * (0.75 + r.float() * 0.5), 0, 1);
      }
      this.now = 2 * 24 + 14 + 20 / 60;   // Wed 14:20
      this.fi = 1;                         // every 6 h
      this.dis = false; this.disT = 0; this.auto = false; this.autoT = 12;
      this.sl = this.ui.slider({ label: 'Back up', min: 0, max: 3, step: 1, value: 1, fmt: function (v) { return FREQ_TXT[v]; }, onInput: function (v) { self.fi = v; self.rRpo.set(dur(FREQ[v]), v >= 2 ? 'bad' : v === 1 ? 'warn' : 'ok'); self.announce('Backups now run ' + FREQ_TXT[v] + '. Worst case you lose ' + dur(FREQ[v]) + ' of work.'); } });
      this.bDis = this.ui.button('💥 Disaster now', function () { self.disaster(); }, { kind: 'danger' });
      this.bRes = this.ui.button('▶ Resume', function () { self.resume(); });
      this.bRes.setDisabled(true);
      this.ui.toggle({ label: 'Random disasters', value: false, onChange: function (v) { self.auto = v; self.autoT = 6 + self.rng.float() * 14; } });
      this.ui.spacer();
      this.rRpo = this.ui.readout('RPO (worst case)', '6 h', 'warn');
      this.rLost = this.ui.readout('Would lose', '—');
    },
    lastTick: function () { var f = FREQ[this.fi]; return Math.floor(this.now / f + 1e-9) * f; },
    disaster: function () {
      if (this.dis) return;
      var self = this;
      this.dis = true; this.disT = 0;
      this.tween({ from: 0, to: 1, dur: 0.8, ease: 'outCubic', onUpdate: function (v) { self.disT = v; } });
      this.bDis.setDisabled(true); this.bRes.setDisabled(false);
      var lost = this.now - this.lastTick();
      this.rLost.set(dur(lost), lost > 12 ? 'bad' : 'warn');
      this.announce('Disaster at ' + stamp(this.now) + '. The last backup ran at ' + stamp(this.lastTick()) + '. You would lose ' + dur(lost) + ' of work.');
    },
    resume: function () { this.dis = false; this.bDis.setDisabled(false); this.bRes.setDisabled(true); this.rLost.set('—', ''); this.autoT = 6 + this.rng.float() * 14; },

    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      L.fs = m ? 9 : U.clamp(w / 90, 9.5, 12);
      L.x0 = m ? 12 : 44; L.x1 = w - (m ? 12 : 20);
      L.y0 = m ? 66 : 64; L.y1 = h - (m ? 46 : 52);
    },
    update: function (dt) {
      if (this.dis) return;
      this.now += dt * SPEED;
      if (this.now >= HOURS) this.now -= HOURS;
      if (this.auto) { this.autoT -= dt; if (this.autoT <= 0) this.disaster(); }
      this.rRpo.set(dur(FREQ[this.fi]), this.fi >= 2 ? 'bad' : this.fi === 1 ? 'warn' : 'ok');
    },
    xOf: function (hr) { var L = this.L; return L.x0 + (hr / HOURS) * (L.x1 - L.x0); },
    draw: function () {
      if (this.w < 160 || this.h < 100) { D.clear(this.ctx, this.w, this.h); return; }
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, fs = L.fs, m = this.mobile, t = this.time;
      D.clear(ctx, w, h);
      var now = this.now, f = FREQ[this.fi], last = this.lastTick(), bw = (L.x1 - L.x0) / HOURS, ph = L.y1 - L.y0;
      // header
      D.text(ctx, m ? 'WORK THIS WEEK' : 'WORK CREATED THIS WEEK · one bar per hour', L.x0, m ? 16 : 20, { size: fs * 0.85, weight: 700, color: P.text3, ls: 1.5 });
      D.text(ctx, 'now ' + stamp(now), L.x0, m ? 33 : 38, { size: fs, weight: 700, color: P.text1 });
      var unsaved = now - last;
      D.text(ctx, (this.dis ? 'LOST ' : 'unsaved ') + dur(unsaved), m ? L.x0 + 104 : L.x1 - 110, m ? 33 : 38, { size: fs, weight: 700, color: this.dis ? P.fault : P.warn, align: m ? 'left' : 'right' });
      if (!m) D.text(ctx, '⏱ 1 s = 2 h', L.x1, 38, { size: fs * 0.8, color: P.text3, align: 'right' });
      // day grid
      for (var d = 0; d <= 7; d++) {
        var x = this.xOf(d * 24);
        D.line(ctx, x, L.y0 - 4, x, L.y1 + 4, U.rgba(P.grid, 0.9), 1);
        if (d < 7) {
          D.text(ctx, m ? DAYS[d].charAt(0) + DAYS[d].charAt(1) : DAYS[d], this.xOf(d * 24 + 12), L.y1 + 14, { size: fs * 0.85, weight: 600, color: d >= 5 ? P.text3 : P.text2, align: 'center' });
          if (d >= 5) D.box(ctx, x, L.y0 - 4, bw * 24, ph + 8, 0, U.rgba(P.panel2, 0.35));
        }
      }
      D.line(ctx, L.x0, L.y1, L.x1, L.y1, U.rgba(P.blueprint, 0.6), 1);
      // bars
      var nowBin = Math.floor(now), lostCol = P.fault;
      for (var i = 0; i <= nowBin && i < HOURS; i++) {
        var frac = i === nowBin ? now - nowBin : 1, hv = this.work[i] * ph * 0.92 * frac;
        if (hv < 0.5) continue;
        var bx = this.xOf(i), saved = i + 1 <= last + 1e-6;
        var col = saved ? P.data : (this.dis ? lostCol : P.warn);
        D.box(ctx, bx + bw * 0.12, L.y1 - hv, Math.max(1, bw * 0.76), hv, Math.min(2, bw * 0.3), U.rgba(col, saved ? 0.6 : 0.85));
      }
      // at-risk / lost region
      var xa = this.xOf(last), xn = this.xOf(now);
      if (xn - xa > 0.5) {
        var a = this.dis ? 0.12 + this.disT * 0.1 : 0.08;
        D.box(ctx, xa, L.y0 - 4, xn - xa, ph + 8, 0, U.rgba(this.dis ? P.fault : P.warn, a));
        if (this.dis) { ctx.fillStyle = D.hatch(ctx, U.rgba(P.fault, 0.35), 6); ctx.fillRect(xa, L.y0 - 4, xn - xa, ph + 8); }
      }
      // backup ticks
      for (var tk = 0; tk <= now + 1e-6; tk += f) {
        var tx = this.xOf(tk), big = m ? f >= 24 : f >= 6;
        D.line(ctx, tx, L.y0 - (big ? 10 : 4), tx, L.y1, U.rgba(P.ok, big ? 0.9 : 0.5), big ? 1.5 : 1);
        if (big || tk === last) D.g.disc(ctx, tx, L.y0 - 14, big ? 11 : 9, P.ok);
      }
      // upcoming tick ghosts
      for (var gt = Math.ceil((now + 1e-6) / f) * f; gt < HOURS; gt += f) {
        if (f < 6 && gt > now + 24) break;
        var gx = this.xOf(gt);
        D.line(ctx, gx, L.y0 - 4, gx, L.y1, U.rgba(P.ok, 0.18), 1, [2, 4]);
      }
      // now cursor
      D.line(ctx, xn, L.y0 - 18, xn, L.y1 + 4, this.dis ? P.fault : P.accent, 2);
      D.circle(ctx, xn, L.y0 - 18, 3.5, this.dis ? P.fault : P.accent);
      if (this.dis) {
        D.g.flame(ctx, xn, L.y0 - 30, 16, t);
        if (xn - xa > 30) D.dim(ctx, xa, L.y0 + 12, xn, L.y0 + 12, m ? dur(unsaved) : 'lost ' + dur(unsaved), { color: P.fault, size: fs * 0.85, bg: P.bg });
        var msg = 'You’d lose ' + dur(unsaved) + ' of work';
        D.pill(ctx, msg, m ? w / 2 : U.clamp((xa + xn) / 2, L.x0 + 140, L.x1 - 140), L.y0 + ph * 0.45, { color: P.fault, size: fs * (m ? 1 : 1.2), align: 'center', bg: U.rgba(P.panel, 0.97) });
        if (!m) D.text(ctx, 'last backup ' + stamp(last), xa - 6, L.y0 + ph * 0.45 + 24, { size: fs * 0.8, color: P.ok, align: 'right' });
      } else if (xn - xa > 24) {
        D.text(ctx, 'at risk', (xa + xn) / 2, L.y0 + 8, { size: fs * 0.75, weight: 700, color: P.warn, align: 'center' });
      }
      // legend
      var ly = h - 12;
      D.box(ctx, L.x0, ly - 4, 8, 8, 2, U.rgba(P.data, 0.6)); D.text(ctx, 'backed up', L.x0 + 12, ly, { size: fs * 0.8, color: P.text2 });
      var lx2 = L.x0 + (m ? 78 : 96);
      D.box(ctx, lx2, ly - 4, 8, 8, 2, U.rgba(P.warn, 0.85)); D.text(ctx, 'not yet backed up', lx2 + 12, ly, { size: fs * 0.8, color: P.text2 });
      var lx3 = lx2 + (m ? 118 : 150);
      D.g.disc(ctx, lx3 + 4, ly, 10, P.ok); D.text(ctx, 'backup ' + FREQ_TXT[this.fi], lx3 + 12, ly, { size: fs * 0.8, color: P.text2 });
      this.setDesc(this.describe());
    },
    describe: function () {
      var u = this.now - this.lastTick();
      return 'Backups run ' + FREQ_TXT[this.fi] + '. It is ' + stamp(this.now) + '; the last backup was ' + stamp(this.lastTick()) + ', so ' + dur(u) + ' of work is ' + (this.dis ? 'lost in the disaster.' : 'not yet backed up.');
    }
  });
})(window.SRV);
