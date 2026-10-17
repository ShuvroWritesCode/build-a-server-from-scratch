/* Ch12 · Pipe race. Four pipes whose cross-section AREA is proportional to bandwidth
   (radius ∝ √Gb/s), packets at density ∝ bandwidth. "Send 50 GB" races progress bars in scaled
   time (badge shows the scale) and stamps each finish time. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var FILE = 50; // GB
  var LINKS = [
    { name: '1 GbE', gbps: 1, rate: 0.115, port: 'RJ45' },
    { name: '10 GbE', gbps: 10, rate: 1.15, port: 'SFP+ / RJ45' },
    { name: '25 GbE', gbps: 25, rate: 2.9, port: 'SFP28' },
    { name: '100 GbE', gbps: 100, rate: 11.5, port: 'QSFP28' }
  ];
  function fmtT(s) {
    if (s < 10) return s.toFixed(1) + ' s';
    if (s < 60) return Math.round(s) + ' s';
    var m = Math.floor(s / 60), r = Math.round(s - m * 60);
    if (r === 60) { m++; r = 0; }
    return m + ' min ' + (r < 10 ? '0' : '') + r + ' s';
  }
  function clock(s) { var m = Math.floor(s / 60), r = Math.floor(s - m * 60); return 'T+ ' + (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; }

  S.defineVisual('pipes', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.scale = 10; this.simT = 0; this.racing = false; this.started = false;
      this.stamp = [0, 0, 0, 0];
      var self = this, n = LINKS.length;
      this.pk = [];
      for (var i = 0; i < n; i++) {
        var c = Math.max(3, Math.round(LINKS[i].gbps * 2.6));
        var a = { n: c, x: new Float32Array(c), y: new Float32Array(c) };
        for (var k = 0; k < c; k++) { a.x[k] = this.rng.float(); a.y[k] = this.rng.float() * 2 - 1; }
        this.pk.push(a);
      }
      var g = this.ui.group('Race');
      this.bGo = g.button('▶ Send 50 GB', function () { self.go(); }, { kind: 'primary' });
      g.button('↺ Reset', function () { self.reset(); });
      this.ui.seg({ label: 'Time speed-up', options: [[1, '1×'], [10, '10×'], [30, '30×']], value: 10, onChange: function (v) { self.scale = v; } });
      this.ui.spacer();
      this.rClock = this.ui.readout('Real time', '0 s');
    },
    go: function () {
      this.simT = 0; this.stamp = [0, 0, 0, 0]; this.racing = true; this.started = true;
      this.bGo.setLabel('▶ Send again');
      if (this.reduced() && this._paused) {
        // no animation: jump straight to the result table
        this.simT = FILE / LINKS[0].rate; this.racing = false; this.stamp = [1, 1, 1, 1];
        this.rClock.set(fmtT(this.simT), 'ok');
        this.announce('Sending 50 GB: 1 GbE takes about 7 minutes 15 seconds, 10 GbE 43 seconds, 25 GbE 17 seconds, 100 GbE 4.3 seconds.');
      } else {
        if (this._paused) this.setPaused(false);
        this.announce('Sending 50 GB over all four links at once, time sped up ' + this.scale + ' times.');
      }
    },
    reset: function () { this.simT = 0; this.racing = false; this.started = false; this.stamp = [0, 0, 0, 0]; this.bGo.setLabel('▶ Send 50 GB'); this.rClock.set('0 s'); },

    resize: function (w, h) {
      var m = this.mobile = w < 560, n = LINKS.length, i;
      var top = m ? 50 : 56, bottom = h - (m ? 40 : 44), avail = bottom - top;
      var fixed = m ? 34 : 14, minRow = m ? 0 : 34, gap = m ? 6 : 12;
      var r0 = 14;
      for (; r0 > 2; r0 -= 0.25) {
        var sum = 0;
        for (i = 0; i < n; i++) sum += Math.max(2 * r0 * Math.sqrt(LINKS[i].gbps), minRow) + fixed;
        if (sum + gap * (n - 1) <= avail) break;
      }
      this.r0 = r0;
      var y = top;
      this.rows = [];
      for (i = 0; i < n; i++) {
        var r = r0 * Math.sqrt(LINKS[i].gbps), rowH = Math.max(2 * r, minRow) + fixed;
        var cy = m ? y + 16 + r : y + rowH / 2;
        this.rows.push({ y: cy, r: r, top: y, h: rowH });
        y += rowH + gap;
      }
      if (m) { this.px0 = 18 + r0 * Math.sqrt(100) * 0.32; this.px1 = w - 14; this.bx0 = 14; this.bx1 = w - 14; }
      else { this.px0 = 150; this.px1 = w * 0.6; this.bx0 = w * 0.64; this.bx1 = w - 22; }
    },

    update: function (dt) {
      var n = LINKS.length, speed = 0.16;
      for (var i = 0; i < n; i++) {
        var a = this.pk[i], running = !this.started || (this.racing && this.simT < FILE / LINKS[i].rate);
        if (!running) continue;
        for (var k = 0; k < a.n; k++) { a.x[k] += dt * speed; if (a.x[k] > 1) a.x[k] -= 1; }
      }
      if (this.racing) {
        this.simT += dt * this.scale;
        for (var j = 0; j < n; j++) {
          var T = FILE / LINKS[j].rate;
          if (this.simT >= T && !this.stamp[j]) {
            this.stamp[j] = 0.001;
            (function (self, jj) { self.tween({ from: 0.001, to: 1, dur: 0.5, ease: 'outBack', onUpdate: function (v) { self.stamp[jj] = v; } }); })(this, j);
            if (j === 0) { this.racing = false; this.announce('All done. 1 gigabit finally finished after ' + fmtT(T) + ' — 100 gigabit took ' + fmtT(FILE / LINKS[3].rate) + '.'); }
          }
        }
      }
      this.rClock.set(this.started ? fmtT(Math.min(this.simT, FILE / LINKS[0].rate)) : '0 s', this.started && !this.racing ? 'ok' : '');
    },

    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, m = this.mobile, n = LINKS.length;
      D.clear(ctx, w, h);
      var simEnd = FILE / LINKS[0].rate, st = Math.min(this.simT, simEnd);
      // header: file + clock + scale badge
      D.g.doc(ctx, 22, 24, 26, P.data);
      D.text(ctx, '50 GB', 40, 18, { size: m ? 11 : 12, weight: 800, color: P.text1 });
      D.text(ctx, 'one big file', 40, 31, { size: 9, color: P.text3 });
      D.text(ctx, clock(st), m ? w * 0.52 : w * 0.4, 24, { size: m ? 15 : 18, weight: 800, color: this.racing ? P.text1 : P.text2, align: 'center' });
      D.pill(ctx, m ? '⏱ ×' + this.scale + ' time' : '⏱ 1 s shown = ' + this.scale + ' s real', w - 12, 24, { size: m ? 9 : 10, align: 'right', color: this.scale === 1 ? P.text2 : P.warn });

      for (var i = 0; i < n; i++) this.drawRow(ctx, P, i, st);

      // footer: bits ÷ 8
      var fy = h - (m ? 16 : 18);
      if (m) D.text(ctx, 'bits ÷ 8 = bytes · 1 Gb/s ≈ 115 MB/s real', w / 2, fy, { size: 9.5, weight: 600, color: P.text2, align: 'center' });
      else {
        D.pill(ctx, 'bits ÷ 8 = bytes', 14, fy, { size: 10, color: P.accent });
        D.text(ctx, '1 Gb/s ÷ 8 = 125 MB/s → ≈ 115 MB/s after protocol overhead', 128, fy, { size: 10, weight: 600, color: P.text2 });
        D.text(ctx, 'pipe area ∝ bandwidth', w - 14, fy, { size: 9.5, color: P.text3, align: 'right' });
      }
      var done = this.started && !this.racing;
      this.setDesc(!this.started ? 'Four pipes sized by bandwidth: 1, 10, 25 and 100 gigabit Ethernet. Press send to race a 50 GB file.'
        : done ? '50 GB arrived: 100 GbE in 4.3 s, 25 GbE in 17 s, 10 GbE in 43 s, 1 GbE in 7 min 15 s.'
        : 'Racing: ' + fmtT(st) + ' of real time have passed.');
    },

    drawRow: function (ctx, P, i, st) {
      var L = LINKS[i], R = this.rows[i], m = this.mobile, r = R.r, y = R.y, x0 = this.px0, x1 = this.px1, len = x1 - x0;
      var T = FILE / L.rate, prog = this.started ? U.clamp(st / T, 0, 1) : 0, fin = this.started && st >= T;
      var running = !this.started || (this.racing && !fin);
      // labels
      if (m) {
        D.text(ctx, L.name, x0, R.top + 6, { size: 11, weight: 800, color: P.text1 });
        D.text(ctx, '≈ ' + (L.rate >= 1 ? L.rate + ' GB/s' : Math.round(L.rate * 1000) + ' MB/s'), x0 + 62, R.top + 6, { size: 9, color: P.text3 });
      } else {
        var lx = x0 - 12 - Math.max(2, r * 0.32);
        D.text(ctx, L.name, lx, y - 7, { size: 12, weight: 800, color: P.text1, align: 'right' });
        D.text(ctx, '≈ ' + (L.rate >= 1 ? L.rate + ' GB/s' : Math.round(L.rate * 1000) + ' MB/s'), lx, y + 8, { size: 9.5, color: P.text3, align: 'right' });
      }
      // pipe body
      var wall = Math.max(1.5, r * 0.08);
      D.box(ctx, x0, y - r, len, 2 * r, Math.min(r, 3), U.rgba(P.net, P.dark ? 0.07 : 0.06), U.rgba(P.alu, 0.55), 1.2);
      ctx.fillStyle = P.dark ? U.rgba(P.text1, 0.08) : U.rgba(P.panel, 0.75); ctx.fillRect(x0 + 2, y - r + wall, len - 4, Math.max(1, r * 0.18));
      // transferred fraction (sweeps through the pipe on mobile; subtle tint on desktop)
      if (prog > 0) { ctx.fillStyle = U.rgba(fin ? P.ok : P.net, 0.12); ctx.fillRect(x0, y - r, len * prog, 2 * r); }
      // packets: orchid chevrons, density ∝ bandwidth
      var a = this.pk[i], cs = U.clamp(r * 0.42, 2.6, 5.5), pad = cs + wall;
      ctx.save(); ctx.beginPath(); ctx.rect(x0 + 2, y - r, len - 4, 2 * r); ctx.clip();
      ctx.beginPath();
      for (var k = 0; k < a.n; k++) {
        var px = x0 + a.x[k] * len, py = y + a.y[k] * Math.max(0, r - pad);
        ctx.moveTo(px - cs, py - cs); ctx.lineTo(px, py); ctx.lineTo(px - cs, py + cs);
      }
      ctx.strokeStyle = P.net; ctx.lineWidth = cs > 4 ? 1.8 : 1.4; ctx.lineJoin = 'round';
      ctx.globalAlpha = running ? (this.started ? 0.95 : 0.6) : 0.18; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.restore();
      // flanges + cross-section at the left end (shows the area)
      ctx.fillStyle = U.shade(P.steel, P.dark ? 0.1 : 0); ctx.fillRect(x0 - 4, y - r - 3, 5, 2 * r + 6); ctx.fillRect(x1 - 1, y - r - 3, 5, 2 * r + 6);
      ctx.beginPath(); ctx.ellipse(x0 - 4, y, Math.max(2, r * 0.32), r, 0, 0, U.TAU);
      ctx.fillStyle = U.rgba(P.net, 0.28); ctx.fill(); ctx.strokeStyle = U.rgba(P.net, 0.9); ctx.lineWidth = 1.2; ctx.stroke();

      // progress bar + time
      var bx0 = this.bx0, bx1 = this.bx1, bw = bx1 - bx0, by = m ? y + r + 7 : y - 3, bh = m ? 5 : 8;
      D.meter(ctx, bx0, by, bw, bh, prog, fin ? P.ok : P.net);
      var tcol = fin ? P.ok : this.started ? P.text1 : P.text3;
      var ttxt = fin ? '✓ ' + fmtT(T) : this.started ? Math.round(prog * 100) + '% · ' + fmtT(st) : '≈ ' + fmtT(T);
      if (m) D.text(ctx, ttxt, bx1, R.top + 6, { size: 10, weight: 700, color: tcol, align: 'right' });
      else {
        D.text(ctx, ttxt, bx0, by - 10, { size: 11, weight: 700, color: tcol });
        D.text(ctx, U.fmt(Math.min(FILE, st * L.rate), 1) + ' / 50 GB', bx1, by - 10, { size: 9.5, color: P.text3, align: 'right' });
      }
      // finish stamp
      var sp = this.stamp[i];
      if (sp > 0) {
        var sx = x1 - 50, sy = y, sc = sp;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.12); ctx.scale(sc, sc);
        D.box(ctx, -38, -10, 76, 20, 4, U.rgba(P.panel, 0.9), P.ok, 1.6);
        D.text(ctx, 'ARRIVED', 0, 0.5, { size: 10, weight: 800, color: P.ok, align: 'center', ls: 1.5 });
        ctx.restore();
      }
    }
  });
})(window.SRV);
