/* Ch4 · Form factors to scale. 1U, 2U, 4U and a tower drawn front-on at one shared mm scale, with their
   fans (40/60/80/120 mm, also to scale) spinning at real-ratio speeds and noise rings sized by dBA. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var FORMS = [
    { id: '1u', name: '1U', w: 482.6, h: 44.45, bays: '4 × 3.5″ bays', rows: 1, cols: 4, fan: 40, n: 8, rpm: [8000, 22000], db: [52, 76], use: 'dense, loud' },
    { id: '2u', name: '2U', w: 482.6, h: 88.9, bays: '12 × 3.5″ bays', rows: 3, cols: 4, fan: 60, n: 6, rpm: [5000, 13000], db: [45, 66], use: 'best default' },
    { id: '4u', name: '4U', w: 482.6, h: 177.8, bays: '24 × 3.5″ bays', rows: 4, cols: 6, fan: 80, n: 4, rpm: [2800, 7000], db: [40, 57], use: 'storage, GPUs' },
    { id: 'tw', name: 'Tower', w: 200, h: 450, bays: '4–8 bays', rows: 4, cols: 1, fan: 120, n: 2, rpm: [600, 1500], db: [31, 42], use: 'quiet, office' }
  ];
  function dbCol(db) { var P = S.pal; return db < 45 ? P.ok : db < 62 ? P.warn : P.fault; }

  S.defineVisual('lineup', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.load = 1; this.k = 1;
      this.cur = FORMS.map(function (f) { return { rpm: f.rpm[1], db: f.db[1], ang: 0, ring: 0 }; });
      var self = this;
      this.ui.seg({
        label: 'Load', options: [[0, 'Idle'], [1, 'Full load']], value: 1,
        onChange: function (v) {
          self.load = v;
          if (self._paused || S.prefs.pausedAll) { self.cur.forEach(function (c, i) { c.rpm = FORMS[i].rpm[v]; c.db = FORMS[i].db[v]; }); self.sync(); }
          self.announce(v ? 'Full load: the 1U screams at about ' + FORMS[0].db[1] + ' dBA while the tower stays near ' + FORMS[3].db[1] + ' dBA.' : 'Idle: fans slow down; the 1U is still about ' + FORMS[0].db[0] + ' dBA.');
        }
      });
      this.ui.spacer();
      this.r1 = this.ui.readout('1U fans', '–', 'bad');
      this.rT = this.ui.readout('Tower fans', '–', 'ok');
      this.sync();
    },
    sync: function () {
      this.r1.set(U.fmt(Math.round(this.cur[0].rpm / 100) * 100) + ' RPM · ' + Math.round(this.cur[0].db) + ' dBA', this.cur[0].db > 62 ? 'bad' : 'warn');
      this.rT.set(U.fmt(Math.round(this.cur[3].rpm / 10) * 10) + ' RPM · ' + Math.round(this.cur[3].db) + ' dBA', 'ok');
    },
    resize: function (w, h) {
      var mob = this.mobile = w < 560, self = this;
      this.L = [];
      if (!mob) {
        var gap = 56, padX = 34, top = 84, textH = 74, fanH = 66;
        var s = Math.min((w - padX * 2 - gap * 3) / (482.6 * 3 + 200), (h - top - textH - fanH) / 450);
        var widths = FORMS.map(function (f) { return f.w * s; });
        var total = widths.reduce(function (a, b) { return a + b; }, 0) + gap * 3;
        var x = (w - total) / 2, floor = top + 450 * s;
        FORMS.forEach(function (f, i) {
          var cw = widths[i];
          self.L.push({ x: x, cw: cw, floor: floor, fanY: floor + 18 + 60 * s, textY: floor + 26 + 120 * s + 8, colW: cw + gap });
          x += cw + gap;
        });
        this.s = s;
      } else {
        var cellW = (w - 32) / 2, s2 = (cellW - 16) / 482.6, row1Floor, row1Fan, row1Text, row2Top, row2Floor, row2Fan, row2Text;
        for (var it = 0; it < 30; it++) {
          row1Floor = 80 + 88.9 * s2; row1Fan = row1Floor + 14 + 30 * s2; row1Text = row1Fan + 30 * s2 + 18;
          row2Top = row1Text + 74; row2Floor = row2Top + 450 * s2; row2Fan = row2Floor + 14 + 60 * s2; row2Text = row2Fan + 60 * s2 + 18;
          if (row2Text + 42 <= h) break;
          s2 *= 0.96;
        }
        FORMS.forEach(function (f, i) {
          var col = i % 2, row = i < 2 ? 0 : 1, cw = f.w * s2, cx = 16 + col * cellW + cellW / 2;
          self.L.push({ x: cx - cw / 2, cw: cw, floor: row ? row2Floor : row1Floor, fanY: row ? row2Fan : row1Fan, textY: row ? row2Text : row1Text, colW: cellW });
        });
        this.s = s2;
      }
    },
    update: function (dt) {
      var self = this, lam = this.reduced() ? 30 : 2.2;
      FORMS.forEach(function (f, i) {
        var c = self.cur[i], tr = f.rpm[self.load], td = f.db[self.load];
        c.rpm = U.damp(c.rpm, tr, lam, dt); c.db = U.damp(c.db, td, lam, dt);
        c.ang += dt * c.rpm / 60 * 0.18 * Math.PI * 2 / 6;  // slowed for the eye, true ratio between fans
        c.ring = (c.ring + dt * (0.25 + c.rpm / 9000)) % 1;
      });
      this.sync();
    },
    drawFront: function (ctx, f, x, floor, s) {
      var P = S.pal, w = f.w * s, h = f.h * s, y = floor - h, t = this.time, i, j;
      D.box(ctx, x, y, w, h, Math.min(3, h * 0.1), U.shade(P.steel, -0.3), U.shade(P.steel, -0.55), 1);
      if (f.id === 'tw') {
        var bez = 6 * s * 2;
        D.box(ctx, x + bez * 0.5, y + bez * 0.5, w - bez, h - bez, 3, P.steel, U.shade(P.steel, -0.5), 1);
        // 5.25" bay + power
        D.box(ctx, x + w * 0.14, y + h * 0.06, w * 0.72, h * 0.07, 1.5, U.shade(P.steel, 0.12), U.rgba('#000', 0.4), 1);
        D.circle(ctx, x + w * 0.5, y + h * 0.18, Math.max(2.5, w * 0.05), U.shade(P.steel, -0.35), P.alu, 1);
        D.circle(ctx, x + w * 0.5, y + h * 0.18, 1.2, P.data);
        // mesh door over 4 bays
        var dy = y + h * 0.26, dh = h * 0.68;
        D.box(ctx, x + w * 0.1, dy, w * 0.8, dh, 2, U.shade(P.steel, -0.2), U.rgba('#000', 0.4), 1);
        ctx.fillStyle = U.rgba('#000', 0.35);
        var m = Math.max(2.5, 5 * s * 2);
        for (j = dy + 3; j < dy + dh - 3; j += m) for (i = x + w * 0.12 + ((j / m) % 2 ? m / 2 : 0); i < x + w * 0.88; i += m) ctx.fillRect(i, j, m * 0.45, m * 0.45);
        for (i = 0; i < 4; i++) D.led(ctx, x + w * 0.84, dy + dh * (0.12 + i * 0.12), P.ok, 'activity', t + i, 1.2);
        return;
      }
      var ear = 18 * s, fx = x + ear, fw = w - ear * 2;
      ctx.fillStyle = P.steel; ctx.fillRect(fx, y + 0.5, fw, h - 1);
      var bw = fw * 0.86 / f.cols, bh = (h - 2) / f.rows, bx0 = fx + fw * 0.12;
      for (j = 0; j < f.rows; j++) for (i = 0; i < f.cols; i++) {
        var bx = bx0 + i * bw, by = y + 1 + j * bh;
        ctx.fillStyle = U.shade(P.plastic, -0.05); ctx.fillRect(bx + 0.8, by + 0.8, bw - 1.6, bh - 1.6);
        ctx.fillStyle = U.rgba('#000', 0.35); for (var v = 0; v < 6; v++) ctx.fillRect(bx + 3 + v * bw * 0.07, by + 2, bw * 0.035, bh - 4);
        ctx.fillStyle = U.rgba(P.alu, 0.4); ctx.fillRect(bx + bw * 0.62, by + bh * 0.3, bw * 0.28, bh * 0.4);
        D.led(ctx, bx + bw - 3.5, by + bh / 2, P.ok, 'activity', t + i * 0.7 + j, Math.min(1.4, bh * 0.12));
      }
      ctx.fillStyle = U.shade(P.steel, -0.35); ctx.fillRect(x, y, ear, h); ctx.fillRect(x + w - ear, y, ear, h);
      D.circle(ctx, x + ear / 2, y + Math.min(h / 2, 11 * s * 2), Math.max(1, 3 * s), P.bg0);
      D.circle(ctx, x + w - ear / 2, y + Math.min(h / 2, 11 * s * 2), Math.max(1, 3 * s), P.bg0);
      D.led(ctx, fx + fw * 0.05, y + h / 2, P.mgmt, 'heartbeat', t, Math.min(1.6, h * 0.08));
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, s = this.s, mob = this.mobile, self = this;
      D.clear(ctx, w, h);
      if (!mob) {
        D.text(ctx, 'FRONT VIEW · ALL TO ONE SCALE · SMALL FANS SPIN FASTER → LOUDER', 34, 22, { size: 9, weight: 700, color: P.text3, ls: 1.2 });
        D.line(ctx, 20, this.L[0].floor + 0.5, w - 20, this.L[0].floor + 0.5, U.rgba(P.text3, 0.5), 1);
      } else D.text(ctx, 'ALL TO ONE SCALE', 16, 16, { size: 9, weight: 700, color: P.text3, ls: 1.2 });

      FORMS.forEach(function (f, i) {
        var L = self.L[i], c = self.cur[i], cx = L.x + L.cw / 2;
        if (mob) D.line(ctx, cx - L.colW / 2 + 6, L.floor + 0.5, cx + L.colW / 2 - 6, L.floor + 0.5, U.rgba(P.text3, 0.4), 1);
        // title
        var ty = L.floor - f.h * s - (mob ? 22 : 30);
        D.text(ctx, f.name, L.x, ty, { size: mob ? 12 : 15, weight: 800, color: P.text1 });
        var narrow = L.cw < 150;
        if (narrow) D.text(ctx, f.bays, L.x + D.measure(ctx, f.name, mob ? 12 : 15, 800) + 8, ty + 1, { size: mob ? 8.5 : 10, color: P.text2 });
        else D.text(ctx, f.bays, L.x + L.cw, ty + (mob ? 0 : 1), { size: mob ? 8.5 : 10, color: P.text2, align: 'right' });
        if (!mob) D.text(ctx, f.h + ' mm' + (f.id === 'tw' ? ' tall' : ''), L.x, ty + 15, { size: 9, color: P.blueprint });
        self.drawFront(ctx, f, L.x, L.floor, s);
        // height dimension
        var dx = L.x - (mob ? 5 : 9);
        if (f.h * s > 24) D.dim(ctx, dx, L.floor - f.h * s, dx, L.floor, f.h * s > 60 ? f.h + ' mm' : '', { size: 8.5, alpha: 0.75 });

        // fans to scale, with noise rings
        var fr = f.fan * s / 2, gap = Math.max(2, fr * 0.35), n = f.n;
        var rowW = n * fr * 2 + (n - 1) * gap, maxW = L.colW - 12;
        if (rowW > maxW) { n = Math.max(1, Math.floor((maxW + gap) / (fr * 2 + gap))); rowW = n * fr * 2 + (n - 1) * gap; }
        var fx0 = cx - rowW / 2 + fr, blur = c.rpm > 2500 ? 0.8 : 0, ext = (c.db - 25) * (mob ? 0.35 : 0.6), col = dbCol(c.db);
        for (var k = 0; k < n; k++) {
          var fxk = fx0 + k * (fr * 2 + gap);
          {
            for (var r = 0; r < 3; r++) {
              var ph = (c.ring + r / 3) % 1, rad = fr + 2 + ph * ext;
              ctx.globalAlpha = (1 - ph) * (n > 4 ? 0.35 : 0.5) * U.clamp((c.db - 28) / 30, 0.25, 1);
              D.circle(ctx, fxk, L.fanY, rad, null, col, 1.2);
            }
            ctx.globalAlpha = 1;
          }
          D.fan2d(ctx, fxk, L.fanY, fr, c.ang * (f.fan === 40 ? 1 : 1) + k, { blur: blur, color: P.plastic, blades: f.fan >= 120 ? 9 : 7 });
        }
        var fl = f.n + ' × ' + f.fan + ' mm' + (n < f.n ? ' (' + n + ' shown)' : '');
        // readouts
        var ty2 = L.textY;
        D.text(ctx, fl, cx, ty2, { size: mob ? 9 : 10, color: P.text2, align: 'center' });
        D.text(ctx, U.fmt(Math.round(c.rpm / 10) * 10) + ' RPM', cx, ty2 + (mob ? 13 : 16), { size: mob ? 9 : 10.5, weight: 600, color: P.text3, align: 'center' });
        D.text(ctx, Math.round(c.db) + ' dBA', cx, ty2 + (mob ? 30 : 38), { size: mob ? 15 : 20, weight: 800, color: col, align: 'center' });
      });
      if (!mob) {
        D.text(ctx, 'for scale: library ≈ 40 dBA · office ≈ 50 · vacuum ≈ 70 (every +10 dB sounds about twice as loud)', 34, 38, { size: 9.5, color: P.text3 });
      }
      var c0 = this.cur;
      this.setDesc((this.load ? 'Full load' : 'Idle') + ': 1U ' + Math.round(c0[0].db) + ' dBA (40 mm fans at ' + U.fmt(Math.round(c0[0].rpm / 100) * 100) + ' RPM), 2U ' + Math.round(c0[1].db) + ' dBA, 4U ' + Math.round(c0[2].db) + ' dBA, tower ' + Math.round(c0[3].db) + ' dBA (120 mm fans).');
    }
  });
})(window.SRV);
