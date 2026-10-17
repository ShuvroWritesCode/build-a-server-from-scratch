/* Ch6 · Amdahl's law: speed-up vs cores (log x). The part of a job that can't be split sets a hard
   ceiling 1/(1-p); a mini timeline shows the serial slice taking over as the parallel slice shrinks. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var MAXLOG = 7; // 2^7 = 128 cores
  var NICE = [2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150];

  function speed(p, n) { return 1 / ((1 - p) + p / n); }
  function coresFromS(v) { return Math.max(1, Math.min(128, Math.round(Math.pow(2, v / 100)))); }
  function sFromCores(n) { return Math.round(Math.log(n) / Math.LN2 * 100); }
  function niceMax(v) { for (var i = 0; i < NICE.length; i++) if (NICE[i] >= v) return NICE[i]; return NICE[NICE.length - 1]; }
  function niceStep(raw) {
    var e = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  function fx(v) { return v >= 100 ? U.fmt(v, 0) : U.fmt(v, 1); }

  S.defineVisual('amdahl', {
    continuous: false,
    init: function () {
      this.ctx = this.layer();
      this.p = 0.95; this.n = 64;
      this.yMax = this._yTarget = niceMax(1 / (1 - this.p) * 1.18);
      this._yTw = null;
      var self = this;
      var g = this.ui.group('Amdahl settings');
      this.sP = g.slider({
        label: 'Parallel portion', min: 50, max: 99, step: 1, value: 95,
        fmt: function (v) { return v + '%'; },
        valueText: function (v) { return v + ' percent of the job can be split across cores'; },
        onInput: function (v) { self.setP(v / 100); }
      });
      this.sN = g.slider({
        label: 'Cores', min: 0, max: MAXLOG * 100, step: 1, value: sFromCores(64),
        fmt: function (v) { return String(coresFromS(v)); },
        valueText: function (v) { return coresFromS(v) + ' cores'; },
        onInput: function (v) { self.setN(coresFromS(v), true); }
      });
      this.ui.br();
      var pr = this.ui.group('Presets');
      pr.button('Web server · 99%', function () { self.sP.set(99); self.setP(0.99); });
      pr.button('Typical app · 90%', function () { self.sP.set(90); self.setP(0.9); });
      pr.button('Hard to split · 50%', function () { self.sP.set(50); self.setP(0.5); });
      this.ui.spacer();
      this.rS = this.ui.readout('Speed-up', '');
      this.rC = this.ui.readout('Ceiling', '');

      this.pointer({
        down: function (p) { if (!self.inPlot(p.x, p.y)) return false; self.setFromX(p.x); return true; },
        move: function (p) { self.setFromX(p.x); },
        hover: function (p) { self.stage.style.cursor = self.inPlot(p.x, p.y) ? 'ew-resize' : ''; },
        leave: function () { self.stage.style.cursor = ''; }
      });
      this.sync(false);
    },
    inPlot: function (x, y) { var L = this.L; return L && x >= L.x0 - 12 && x <= L.x1 + 12 && y >= L.y0 - 6 && y <= L.y1 + 34; },
    setFromX: function (x) {
      var L = this.L, k = U.clamp((x - L.x0) / (L.x1 - L.x0), 0, 1);
      this.setN(Math.max(1, Math.min(128, Math.round(Math.pow(2, k * MAXLOG)))), false);
    },
    setP: function (p) {
      this.p = p;
      var target = niceMax(Math.max(2.4, 1 / (1 - p) * 1.18)), self = this;
      if (target !== this._yTarget) {
        this._yTarget = target;
        if (this._yTw) this._yTw.cancel();
        this._yTw = this.tween({ from: this.yMax, to: target, dur: 0.55, onUpdate: function (v) { self.yMax = v; } });
      }
      this.sync(true);
    },
    setN: function (n, fromSlider) {
      if (n === this.n && !fromSlider) return;
      this.n = n;
      if (!fromSlider) this.sN.set(sFromCores(n));
      this.sync(true);
    },
    sync: function (announce) {
      var s = speed(this.p, this.n), c = 1 / (1 - this.p), eff = s / this.n;
      this.rS.set(fx(s) + '× on ' + this.n + (this.n === 1 ? ' core' : ' cores'), eff < 0.35 ? 'warn' : 'ok');
      this.rC.set(fx(c) + '× max, ever');
      var txt = 'With ' + Math.round(this.p * 100) + '% of the job parallel, ' + this.n + ' cores give ' + fx(s) + ' times speed-up; the ceiling is ' + fx(c) + ' times no matter how many cores.';
      this.setDesc(txt);
      if (announce) this.announce(this.n + ' cores, ' + fx(s) + ' times faster. Ceiling ' + fx(c) + ' times.');
      this.invalidate();
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      if (this.mobile) {
        var py1 = Math.round(h * 0.5);
        this.L = { x0: 40, x1: w - 16, y0: 22, y1: py1 };
        this.M = { x: 16, y: py1 + 42, w: w - 32, h: h - py1 - 48 };
      } else {
        var split = Math.round(w * 0.66);
        this.L = { x0: 54, x1: split - 18, y0: 30, y1: h - 44 };
        this.M = { x: split + 22, y: 30, w: w - split - 40, h: h - 60 };
      }
    },
    xOf: function (n) { var L = this.L; return L.x0 + (Math.log(n) / Math.LN2 / MAXLOG) * (L.x1 - L.x0); },
    yOf: function (s) { var L = this.L; return L.y1 - (s / this.yMax) * (L.y1 - L.y0); },

    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, self = this;
      D.clear(ctx, w, h);
      var p = this.p, n = this.n, ceil = 1 / (1 - p), sp = speed(p, n);
      var fs = this.mobile ? 9.5 : 10;

      // ---- grid + axes
      var step = niceStep(this.yMax / (this.mobile ? 4 : 5));
      ctx.lineWidth = 1;
      for (var yv = 0; yv <= this.yMax + 1e-6; yv += step) {
        var gy = Math.round(this.yOf(yv)) + 0.5;
        D.line(ctx, L.x0, gy, L.x1, gy, U.rgba(P.grid, yv === 0 ? 0.9 : 0.55), 1);
        D.text(ctx, (step < 1 ? U.fmt(yv, 1) : U.fmt(yv, 0)) + '×', L.x0 - 7, gy, { size: fs, color: P.text3, align: 'right' });
      }
      for (var i = 0; i <= MAXLOG; i++) {
        var c = Math.pow(2, i), gx = Math.round(this.xOf(c)) + 0.5;
        D.line(ctx, gx, L.y0, gx, L.y1, U.rgba(P.grid, 0.45), 1, [2, 4]);
        if (!this.mobile || i % 1 === 0) D.text(ctx, String(c), gx, L.y1 + 13, { size: fs, color: c === n ? P.accent : P.text3, align: 'center', weight: c === n ? 700 : 500 });
      }
      D.text(ctx, 'CORES  (each step = double)', (L.x0 + L.x1) / 2, L.y1 + 29, { size: 9, color: P.text3, align: 'center', ls: 1 });
      if (!this.mobile) {
        ctx.save(); ctx.translate(16, (L.y0 + L.y1) / 2); ctx.rotate(-Math.PI / 2);
        D.text(ctx, 'SPEED-UP', 0, 0, { size: 9, color: P.text3, align: 'center', ls: 1.5 });
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath(); ctx.rect(L.x0, L.y0 - 2, L.x1 - L.x0 + 2, L.y1 - L.y0 + 2); ctx.clip();

      // ---- ideal (perfect scaling) line
      ctx.beginPath();
      for (var k = 0; k <= 60; k++) { var nn = Math.pow(2, k / 60 * MAXLOG), x = this.xOf(nn), y = this.yOf(nn); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.setLineDash([5, 5]); ctx.strokeStyle = U.rgba(P.text2, 0.55); ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);

      // ---- area under the Amdahl curve + curve
      ctx.beginPath(); ctx.moveTo(this.xOf(1), L.y1);
      for (k = 0; k <= 90; k++) { nn = Math.pow(2, k / 90 * MAXLOG); ctx.lineTo(this.xOf(nn), this.yOf(speed(p, nn))); }
      ctx.lineTo(L.x1, L.y1); ctx.closePath();
      var grd = ctx.createLinearGradient(0, L.y0, 0, L.y1);
      grd.addColorStop(0, U.rgba(P.data, 0.22)); grd.addColorStop(1, U.rgba(P.data, 0.02));
      ctx.fillStyle = grd; ctx.fill();
      ctx.beginPath();
      for (k = 0; k <= 90; k++) { nn = Math.pow(2, k / 90 * MAXLOG); x = this.xOf(nn); y = this.yOf(speed(p, nn)); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.strokeStyle = P.data; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.stroke();

      // ---- ceiling
      var cy = this.yOf(ceil);
      if (cy > L.y0 - 1) {
        D.line(ctx, L.x0, cy, L.x1, cy, P.warn, 1.4, [8, 5]);
      }
      ctx.restore();

      // ideal label (where the dashed line is still inside the plot)
      var nl = Math.min(this.yMax * 0.32, 60), lx = this.xOf(Math.max(1.5, nl)), ly = this.yOf(Math.max(1.5, nl));
      D.text(ctx, 'perfect scaling', lx - 8, ly - 2, { size: fs, color: P.text2, align: 'right', alpha: 0.85 });
      if (cy > L.y0 - 1) D.pill(ctx, '⚠ CEILING ' + fx(ceil) + '×', L.x1 - 4, Math.max(L.y0 + 8, cy - 12), { color: P.warn, size: fs, align: 'right' });

      // ---- marker at current core count
      var mx = this.xOf(n), my = this.yOf(sp);
      D.line(ctx, mx, my, mx, L.y1, U.rgba(P.accent, 0.8), 1.2, [3, 3]);
      var iy = this.yOf(Math.min(n, this.yMax));
      if (n > sp * 1.05 && n <= this.yMax) {
        D.line(ctx, mx, iy, mx, my, U.rgba(P.text2, 0.45), 1, [1, 3]);
        D.circle(ctx, mx, iy, 3, P.bg, U.rgba(P.text2, 0.8), 1.2);
      }
      D.glow(ctx, mx, my, 18, P.accent, 0.55);
      D.circle(ctx, mx, my, 5.5, P.accent, P.bg, 2);
      // drag grip on the axis
      D.box(ctx, mx - 13, L.y1 - 6, 26, 12, 6, P.accent);
      D.text(ctx, '‹ ›', mx, L.y1, { size: 10, weight: 800, color: P.bg, align: 'center' });

      var label = n + (n === 1 ? ' core' : ' cores') + ' → ' + fx(sp) + '× faster';
      var tw = D.measure(ctx, label, this.mobile ? 11 : 12, 700) + 16;
      var px = mx + 12, py = my - 22;
      if (px + tw > L.x1) px = mx - 12 - tw;
      if (px < L.x0 + 2) px = L.x0 + 2;
      if (py < L.y0 + 8) py = my + 22;
      var cpy = Math.max(L.y0 + 8, cy - 12);
      if (cy > L.y0 - 1 && Math.abs(py - cpy) < 18) py = my + 24;
      D.pill(ctx, label, px, py, { color: P.accent, size: this.mobile ? 11 : 12, weight: 700 });
      if (n > 1 && !this.mobile) D.text(ctx, 'hoped for ' + n + '× · got ' + Math.round(sp / n * 100) + '% of that', px + 8, py + 17, { size: 9.5, color: P.text3 });

      // ---- mini illustration: where the time goes
      this.drawMini(ctx);
    },

    drawMini: function (ctx) {
      var P = S.pal, M = this.M, p = this.p, n = this.n, mob = this.mobile;
      var serial = 1 - p, par = p / n, total = serial + par;
      D.text(ctx, 'WHERE THE TIME GOES', M.x, M.y + 2, { size: 9.5, weight: 700, color: P.text2, ls: 1.2 });
      var bw = M.w, rowH = mob ? 12 : 22;
      var y1 = M.y + (mob ? 24 : 34), y2 = y1 + rowH + (mob ? 20 : 48);
      var lab = mob ? 0 : 0;
      // row 1: one core
      D.text(ctx, '1 core', M.x + lab, y1 - 9, { size: 9.5, color: P.text3 });
      D.text(ctx, '100%', M.x + bw, y1 - 9, { size: 9.5, color: P.text3, align: 'right' });
      this.bar(ctx, M.x, y1, bw, rowH, serial, p, 1);
      // row 2: n cores
      D.text(ctx, n + (n === 1 ? ' core' : ' cores'), M.x, y2 - 9, { size: 9.5, color: P.accent, weight: 700 });
      D.text(ctx, fx(total * 100) + '%', M.x + bw, y2 - 9, { size: 9.5, color: P.text1, weight: 700, align: 'right' });
      this.bar(ctx, M.x, y2, bw, rowH, serial, par, n);
      // legend + punchline
      var ly = y2 + rowH + (mob ? 11 : 22);
      ctx.fillStyle = D.hatch(ctx, U.rgba(P.warn, 0.9), 4); ctx.fillRect(M.x, ly - 5, 10, 10);
      D.text(ctx, "can't split", M.x + 15, ly, { size: 9.5, color: P.text2 });
      D.box(ctx, M.x + (mob ? 98 : 92), ly - 5, 10, 10, 2, P.data);
      D.text(ctx, 'split across cores', M.x + (mob ? 113 : 107), ly, { size: 9.5, color: P.text2 });
      if (!mob) {
        var share = Math.round(serial / total * 100);
        D.text(ctx, 'The serial part is now', M.x, ly + 30, { size: 11, color: P.text2, sans: true });
        D.text(ctx, share + '% of the run time.', M.x, ly + 47, { size: 15, weight: 700, color: share > 50 ? P.warn : P.text1 });
        D.text(ctx, 'More cores only shrink the blue part.', M.x, ly + 66, { size: 11, color: P.text3, sans: true });
      }
    },
    /** timeline bar: serial (hatched) + parallel split into up to 8 stacked strips */
    bar: function (ctx, x, y, w, h, serial, par, n) {
      var P = S.pal, sw = serial * w;
      D.box(ctx, x, y, w, h, 3, U.rgba(P.panel3, 0.45));
      D.box(ctx, x, y, sw, h, 3, U.rgba(P.warn, 0.18));
      ctx.fillStyle = D.hatch(ctx, U.rgba(P.warn, 0.85), 4); D.rr(ctx, x, y, sw, h, 3); ctx.fill();
      var pw = Math.max(1.5, par * w), strips = Math.min(n, 8), sh = (h - 1) / strips;
      for (var i = 0; i < strips; i++) D.box(ctx, x + sw + 1, y + i * sh + 0.5, pw, Math.max(1, sh - (strips > 1 ? 1 : 0)), strips > 3 ? 1 : 3, P.data);
      if (n > 8) D.text(ctx, '×' + n, x + sw + pw + 5, y + h / 2, { size: 9, color: P.data, weight: 700 });
    }
  });
})(window.SRV);
