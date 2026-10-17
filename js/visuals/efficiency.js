/* Ch10 · 80 PLUS efficiency curves (230 V internal points) with a live operating point. The power lost
   inside the PSU (wall − output) rises as heat particles. Second panel: UPS runtime
   (minutes = Wh × 0.85 ÷ load × 60) with a draining battery. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var RAT = [
    { id: 'bronze', name: 'Bronze', pts: [[10, 0.76], [20, 0.81], [50, 0.85], [100, 0.81]], cert: 1, col: 'copper' },
    { id: 'gold', name: 'Gold', pts: [[10, 0.83], [20, 0.88], [50, 0.92], [100, 0.88]], cert: 1, col: 'gold' },
    { id: 'plat', name: 'Platinum', pts: [[10, 0.86], [20, 0.90], [50, 0.94], [100, 0.91]], cert: 1, col: 'text2' },
    { id: 'ti', name: 'Titanium', pts: [[10, 0.90], [20, 0.94], [50, 0.96], [100, 0.91]], cert: 0, col: 'data' }
  ];
  var UPS = [600, 1500, 3000];
  var Y0 = 0.68, Y1 = 1.0, NP = 110;

  // monotone cubic (Fritsch–Carlson) through points xs/ys
  function mono(xs, ys) {
    var n = xs.length, d = [], m = [], i;
    for (i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m.push(d[0]);
    for (i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
    m.push(d[n - 2]);
    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { var tt = 3 / Math.sqrt(s); m[i] = tt * a * d[i]; m[i + 1] = tt * b * d[i]; }
    }
    return function (x) {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      var k = 0; while (x > xs[k + 1]) k++;
      var h = xs[k + 1] - xs[k], t = (x - xs[k]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
    };
  }
  RAT.forEach(function (r) {
    var e10 = r.pts[0][1];
    var xs = [3, 5].concat(r.pts.map(function (p) { return p[0]; }));
    var ys = [e10 * 0.78, e10 * 0.88].concat(r.pts.map(function (p) { return p[1]; }));
    r.f = mono(xs, ys);
  });

  S.defineVisual('efficiency', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      var b = S.build.get();
      this.ri = 2; this.ui_ = 1;
      this.load = U.clamp(Math.round(b.watts * 0.6 / b.psuW * 100), 5, 100);
      this.psuW = b.psuW;
      this.N = 120;
      this.px = new Float32Array(this.N); this.py = new Float32Array(this.N); this.pl = new Float32Array(this.N); this.pv = new Float32Array(this.N);
      this.pnext = 0; this.acc = 0;
      this.curves = null;
      var self = this;
      var g = this.ui.group('PSU');
      this.sRat = g.seg({ label: 'Rating', options: RAT.map(function (r, i) { return [i, r.name]; }), value: this.ri, onChange: function (v) { self.ri = v; self.changed(); } });
      this.sLoad = g.slider({ label: 'Load', min: 5, max: 100, step: 1, value: this.load, fmt: function (v) { return v + '%'; },
        valueText: function (v) { return v + ' percent of ' + self.psuW + ' watts'; }, onInput: function (v) { self.load = v; self.changed(); } });
      this.ui.br();
      var g2 = this.ui.group('UPS');
      g2.seg({ label: 'UPS battery', options: UPS.map(function (u, i) { return [i, U.fmt(u) + ' Wh']; }), value: this.ui_, onChange: function (v) { self.ui_ = v; self.changed(); } });
      g2.button('Use my build’s load', function () {
        var bb = S.build.get(); self.psuW = bb.psuW;
        self.load = U.clamp(Math.round(bb.watts * 0.6 / bb.psuW * 100), 5, 100); self.sLoad.set(self.load); self.changed();
      });
      this.ui.spacer();
      this.rWall = this.ui.readout('From the wall', '–');
      this.rHeat = this.ui.readout('Wasted as heat', '–');
      this.rUps = this.ui.readout('UPS runtime', '–');
      S.build.subscribe('psuW', function (v) { self.psuW = v; self.changed(true); });
      this.changed(true);
    },
    calc: function () {
      var r = RAT[this.ri], eff = r.f(this.load), out = this.psuW * this.load / 100, wall = out / eff;
      var wh = UPS[this.ui_], mins = wh * 0.85 / wall * 60;
      return { r: r, eff: eff, out: out, wall: wall, waste: wall - out, wh: wh, mins: mins };
    },
    changed: function (silent) {
      var c = this.calc();
      this.rWall.set(U.fmt(c.wall) + ' W');
      this.rHeat.set(U.fmt(c.waste) + ' W', c.waste > 80 ? 'warn' : '');
      this.rUps.set(fmtMin(c.mins), c.mins < 5 ? 'bad' : c.mins < 10 ? 'warn' : 'ok');
      var d = this.describe(c);
      this.setDesc(d);
      if (!silent) this.announce(d);
      this.invalidate();
    },
    describe: function (c) {
      c = c || this.calc();
      return '80 PLUS ' + c.r.name + ' supply at ' + this.load + '% load: ' + U.fmt(c.out) + ' W out, ' + U.fmt(c.wall) + ' W from the wall, ' + U.fmt(c.waste) + ' W lost as heat (' + U.fmt(c.eff * 100, 1) + '% efficient). A ' + U.fmt(c.wh) + ' Wh UPS lasts about ' + fmtMin(c.mins) + '.';
    },

    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      if (m) {
        L.cx = 36; L.cy = h > w ? 26 : 44; L.cw = w - L.cx - 12; L.ch = Math.round(h * (h > w ? 0.5 : 0.62)) - L.cy - 22;
        L.px = 10; L.py = L.cy + L.ch + 30; L.pw = (w - 30) / 2; L.ph = h - L.py - 10;
        L.ux = L.px + L.pw + 10; L.uy = L.py; L.uw = L.pw; L.uh = L.ph;
      } else {
        L.cx = 52; L.cy = 26; L.cw = Math.round(w * 0.6) - L.cx; L.ch = h - L.cy - 46;
        L.px = Math.round(w * 0.64); L.pw = w - L.px - 16; L.py = 16; L.ph = Math.round((h - 40) * 0.56);
        L.ux = L.px; L.uw = L.pw; L.uy = L.py + L.ph + 10; L.uh = h - L.uy - 16;
      }
      // cache curve polylines
      this.curves = RAT.map(function (r) {
        var pts = new Float32Array(NP * 2);
        for (var i = 0; i < NP; i++) {
          var x = 3 + 97 * i / (NP - 1);
          pts[i * 2] = L.cx + L.cw * x / 100; pts[i * 2 + 1] = L.cy + L.ch * (1 - (r.f(x) - Y0) / (Y1 - Y0));
        }
        return pts;
      });
    },
    X: function (x) { return this.L.cx + this.L.cw * x / 100; },
    Y: function (e) { return this.L.cy + this.L.ch * (1 - (e - Y0) / (Y1 - Y0)); },

    update: function (dt) {
      var c = this.calc(), L = this.L; if (!L) return;
      var rate = Math.min(90, c.waste * 0.45);
      this.acc += dt * rate;
      var sx = this.psuBox ? this.psuBox.x : L.px + 20, sw = this.psuBox ? this.psuBox.w : 40, sy = this.psuBox ? this.psuBox.y : L.py + 40;
      while (this.acc >= 1) {
        this.acc -= 1;
        var i = this.pnext; this.pnext = (i + 1) % this.N;
        this.px[i] = sx + this.rng.float() * sw; this.py[i] = sy; this.pl[i] = 1; this.pv[i] = 18 + this.rng.float() * 22;
      }
      var top = this.mobile ? L.py + 4 : L.py + 6;
      for (i = 0; i < this.N; i++) {
        if (this.pl[i] <= 0) continue;
        this.py[i] -= this.pv[i] * dt;
        this.px[i] += Math.sin(this.time * 4 + i) * 6 * dt;
        this.pl[i] -= dt * 0.9;
        if (this.py[i] < top) this.pl[i] = 0;
      }
    },

    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, m = this.mobile, self = this;
      D.clear(ctx, w, h);
      var c = this.calc();
      // ---------- chart
      // sweet spot band
      D.box(ctx, this.X(40), L.cy, this.X(60) - this.X(40), L.ch, 0, U.rgba(P.ok, 0.07));
      D.text(ctx, 'SWEET SPOT', this.X(50), L.cy + 9, { size: m ? 7.5 : 8.5, weight: 700, color: U.rgba(P.ok, 0.9), align: 'center', ls: 1 });
      // grid
      for (var e = 0.7; e <= 1.0001; e += m ? 0.1 : 0.05) {
        var yy = this.Y(e);
        D.line(ctx, L.cx, yy, L.cx + L.cw, yy, U.rgba(P.blueprint, e > 0.999 ? 0.3 : 0.12), 1);
        D.text(ctx, Math.round(e * 100) + '%', L.cx - 6, yy, { size: m ? 8 : 9, color: P.text3, align: 'right' });
      }
      for (var x = 0; x <= 100; x += m ? 25 : 10) {
        var xx = this.X(x);
        D.line(ctx, xx, L.cy, xx, L.cy + L.ch, U.rgba(P.blueprint, x % 50 === 0 ? 0.2 : 0.08), 1);
        D.text(ctx, x + '%', xx, L.cy + L.ch + 12, { size: m ? 8 : 9, color: P.text3, align: x === 100 ? 'right' : 'center' });
      }
      D.text(ctx, 'LOAD →', L.cx + L.cw, L.cy + L.ch + 26, { size: m ? 7.5 : 8.5, weight: 700, color: P.text3, align: 'right', ls: 1 });
      if (!m) D.text(ctx, 'EFFICIENCY', L.cx - 44, L.cy - 14, { size: 8.5, weight: 700, color: P.text3, ls: 1 });
      // below 10% load nothing is certified
      ctx.save(); D.rr(ctx, L.cx, L.cy, this.X(10) - L.cx, L.ch, 0);
      ctx.fillStyle = D.hatch(ctx, U.rgba(P.text3, 0.18), 6); ctx.fill(); ctx.restore();
      if (!m) D.text(ctx, 'unrated', this.X(5), L.cy + L.ch - 10, { size: 8, color: P.text3, align: 'center' });
      // curves
      ctx.save(); ctx.beginPath(); ctx.rect(L.cx, L.cy - 4, L.cw + 4, L.ch + 4); ctx.clip();
      for (var k = 0; k < RAT.length; k++) {
        var r = RAT[k], pts = this.curves[k], sel = k === this.ri, col = r.id === 'ti' ? P.data : P[r.col];
        ctx.beginPath();
        for (var i = 0; i < NP; i++) { if (i === 0) ctx.moveTo(pts[0], pts[1]); else ctx.lineTo(pts[i * 2], pts[i * 2 + 1]); }
        ctx.strokeStyle = U.rgba(col, sel ? 1 : 0.35); ctx.lineWidth = sel ? 2.6 : 1.4; ctx.lineJoin = 'round'; ctx.stroke();
        // certified test points
        for (var q = r.cert; q < r.pts.length; q++) D.circle(ctx, this.X(r.pts[q][0]), this.Y(r.pts[q][1]), sel ? 3.2 : 2, sel ? col : U.rgba(col, 0.5), sel ? P.bg : null, 1);
        // name near 50% peak
        var py = this.Y(r.pts[2][1]);
        if (!m || sel) D.text(ctx, r.name, this.X(m ? 74 : 66), py - (m ? 4 : 5) - (r.id === 'bronze' ? -12 : 0), { size: m ? 8.5 : 9.5, weight: sel ? 800 : 600, color: U.rgba(col, sel ? 1 : 0.6) });
      }
      ctx.restore();
      // operating point
      var ox = this.X(this.load), oy = this.Y(c.eff), col2 = c.r.id === 'ti' ? P.data : P[c.r.col];
      D.line(ctx, ox, oy, ox, L.cy + L.ch, U.rgba(P.accent, 0.6), 1, [3, 3]);
      D.line(ctx, L.cx, oy, ox, oy, U.rgba(P.accent, 0.6), 1, [3, 3]);
      D.glow(ctx, ox, oy, 16, P.accent, 0.7);
      D.circle(ctx, ox, oy, 5.5, P.accent, P.bg, 2);
      var lab = U.fmt(c.eff * 100, 1) + '%';
      var lx = ox + 10, al = 'left';
      if (ox > L.cx + L.cw - 70) { lx = ox - 10; al = 'right'; }
      D.pill(ctx, lab, lx, oy - 16, { size: m ? 9 : 10.5, color: P.accent, align: al });
      void col2;

      this.drawPsu(ctx, c);
      this.drawUps(ctx, c);
      void self; void w;
    },

    drawPsu: function (ctx, c) {
      var P = S.pal, L = this.L, m = this.mobile, t = this.time;
      var x = L.px, y = L.py, w = L.pw, h = L.ph;
      D.box(ctx, x, y, w, h, 10, U.rgba(P.panel, 0.55), U.rgba(P.blueprint, 0.25), 1);
      // PSU body
      var bw = m ? 54 : Math.min(84, w * 0.34), bh = m ? 32 : 46;
      var bx = m ? x + 10 : x + 16, by = m ? y + h - bh - 26 : y + h - bh - 44;
      this.psuBox = { x: bx + 6, y: by - 2, w: bw - 12 };
      // heat particles (behind body)
      for (var i = 0; i < this.N; i++) {
        var l = this.pl[i]; if (l <= 0) continue;
        var a = U.clamp(l, 0, 1);
        D.circle(ctx, this.px[i], this.py[i], 1.1 + (1 - a) * 1.6, U.rgba(U.mix(P.heat, P.power, a * 0.6), a * 0.7));
      }
      if (c.waste > 2) for (var s = 0; s < 3; s++) D.shimmer(ctx, bx + bw * (0.25 + s * 0.25), by - 4, Math.min(by - y - 18, 20 + c.waste * 0.25), t + s, P.heat, 0.4);
      D.box(ctx, bx, by, bw, bh, 4, U.shade(P.steel, P.dark ? -0.3 : 0.15), U.rgba(P.alu, 0.6), 1.2);
      D.fan2d(ctx, bx + bh / 2, by + bh / 2, bh * 0.38, t * 6, { color: P.plastic, blur: 0 });
      D.led(ctx, bx + bw - 8, by + 8, P.ok, 'solid', t, 2.2);
      D.text(ctx, 'PSU', bx + bw - 6, by + bh - 9, { size: m ? 7.5 : 8.5, weight: 800, color: P.text2, align: 'right' });
      // flows: wall → psu → server
      var midY = by + bh / 2;
      if (!m) {
        D.flow(ctx, [x + w - 12, midY + 14, bx + bw + 4, midY + 14], P.power, t, { width: 2, speed: 18 + c.wall * 0.03 });
        D.text(ctx, 'IN  ' + U.fmt(c.wall) + ' W', x + w - 12, midY + 2, { size: 10, weight: 700, color: P.power, align: 'right' });
        D.text(ctx, 'OUT ' + U.fmt(c.out) + ' W → server', x + w - 12, midY - 16, { size: 10, weight: 700, color: P.text1, align: 'right' });
        D.text(ctx, '↑ ' + U.fmt(c.waste) + ' W heat', bx + bw + 8, by - 18, { size: 11, weight: 800, color: P.heat });
        D.text(ctx, 'PSU ' + U.fmt(this.psuW) + ' W · 80 PLUS ' + c.r.name, x + 12, y + h - 14, { size: 9, color: P.text3, maxW: w - 24 });
        D.text(ctx, 'WASTED HEAT', x + 12, y + 16, { size: 9, weight: 800, color: P.text3, ls: 1 });
      } else {
        var tx = bx + bw + 8;
        D.text(ctx, 'HEAT', x + 8, y + 12, { size: 8, weight: 800, color: P.text3, ls: 1 });
        D.text(ctx, U.fmt(c.waste) + ' W', tx, by + 4, { size: 13, weight: 800, color: P.heat });
        D.text(ctx, 'wall ' + U.fmt(c.wall) + ' W', tx, by + 20, { size: 8.5, color: P.power });
        D.text(ctx, 'out ' + U.fmt(c.out) + ' W', x + 8, y + h - 12, { size: 8.5, color: P.text2 });
      }
    },

    drawUps: function (ctx, c) {
      var P = S.pal, L = this.L, m = this.mobile, t = this.time;
      var x = L.ux, y = L.uy, w = L.uw, h = L.uh;
      D.box(ctx, x, y, w, h, 10, U.rgba(P.panel, 0.55), U.rgba(P.blueprint, 0.25), 1);
      var mins = c.mins, col = mins < 5 ? P.fault : mins < 10 ? P.warn : P.ok;
      D.text(ctx, m ? 'UPS' : 'UPS RUNTIME · ' + U.fmt(c.wh) + ' Wh battery', x + (m ? 8 : 12), y + (m ? 12 : 16), { size: m ? 8 : 9, weight: 800, color: P.text3, ls: 1, maxW: w - 20 });
      // battery glyph draining (looped; one loop = the runtime, sped up)
      var bw = m ? w - 30 : Math.min(w * 0.42, 120), bh = m ? 18 : 30;
      var bx = x + (m ? 8 : 12), by = m ? y + 22 : y + 30;
      var period = 6, lvl = 1 - ((t % period) / period);
      if (this.reduced()) lvl = 1;
      D.box(ctx, bx, by, bw, bh, 4, null, U.rgba(P.text2, 0.8), 1.5);
      D.box(ctx, bx + bw, by + bh * 0.3, 4, bh * 0.4, 1, U.rgba(P.text2, 0.8));
      var lc = lvl < 0.2 ? P.fault : lvl < 0.4 ? P.warn : col;
      D.box(ctx, bx + 3, by + 3, Math.max(0, (bw - 6) * lvl), bh - 6, 2, U.rgba(lc, 0.85));
      // tick marks = 5 segments
      for (var i = 1; i < 5; i++) D.line(ctx, bx + bw * i / 5, by + 3, bx + bw * i / 5, by + bh - 3, U.rgba(P.bg, 0.6), 1);
      if (!m) {
        D.text(ctx, fmtMin(mins), bx + bw + 16, by + bh / 2 - 2, { size: 22, weight: 800, color: col });
        D.text(ctx, U.fmt(c.wh) + ' Wh × 0.85 ÷ ' + U.fmt(c.wall) + ' W × 60', x + 12, by + bh + 16, { size: 9, color: P.text3, maxW: w - 24 });
        D.text(ctx, mins >= 10 ? '✓ time for a clean auto-shutdown' : mins >= 5 ? '⚠ tight — shut down right away' : '✕ too short for a clean shutdown', x + 12, by + bh + 32, { size: 9.5, weight: 700, color: col, maxW: w - 24 });
      } else {
        D.text(ctx, fmtMin(mins), bx, by + bh + 16, { size: 14, weight: 800, color: col });
        D.text(ctx, U.fmt(c.wh) + ' Wh', x + w - 8, y + 12, { size: 8, color: P.text3, align: 'right' });
      }
    }
  });
  function fmtMin(mins) {
    if (mins >= 120) return Math.floor(mins / 60) + ' h ' + Math.round(mins % 60) + ' min';
    return U.fmt(mins, mins < 10 ? 1 : 0) + ' min';
  }
})(window.SRV);
