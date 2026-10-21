/* Ch19 · Mission control. Five live sparklines (CPU %, CPU °C, disk used %, network Mb/s, SMART
   reallocated sectors) driven by smoothed random walks. Drag a threshold line (or use its slider);
   when a value crosses it the phone buzzes with an alert card. "Simulate dying drive" makes the SMART
   count creep up so the early warning fires well before the drive actually fails. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var NS = 120, DT = 0.25;            // 120 samples, one every 0.25 s
  var FF = 4 * 3600;                  // while a drive is dying: one sample = 4 h (1 s = 16 h)
  var MET = [
    { key: 'cpu', name: 'CPU', unit: '%', min: 0, max: 100, thr: 90, step: 1, col: 'data', d: 0 },
    { key: 'temp', name: 'CPU TEMP', unit: '°C', min: 20, max: 100, thr: 85, step: 1, col: 'heat', d: 0 },
    { key: 'disk', name: 'DISK /data', unit: '%', min: 0, max: 100, thr: 90, step: 1, col: 'blueprint', d: 1 },
    { key: 'net', name: 'NETWORK eth0', unit: 'Mb/s', min: 0, max: 1000, thr: 900, step: 10, col: 'net', d: 0 },
    { key: 'smart', name: 'disk2 SMART', unit: 'realloc.', min: 0, max: 40, thr: 5, step: 1, col: 'warn', d: 0 }
  ];

  S.defineVisual('monitor', {
    continuous: true,
    init: function () {
      var self = this;
      this.ctx = this.layer();
      this.hist = MET.map(function () { return new Float32Array(NS); });
      this.head = 0; this.filled = 0; this.acc = 0;
      this.v = { cpu: 22, temp: 46, disk: 72.4, net: 140, smart: 0 };
      this.thr = MET.map(function (m) { return m.thr; });
      this.armed = MET.map(function () { return true; });
      this.burst = { cpu: 0, net: 0 };
      this.cards = []; this.buzz = 0; this.sent = 0;
      this.dying = false; this.dieT = 0; this.failed = false; this.alertAt = -1; this.failAt = -1; this.sampleN = 0;
      this.clock = 2 * 3600 + 14 * 60;      // 02:14 at night
      this.drag = -1;
      for (var i = 0; i < NS; i++) this.sample(true);

      var g = this.ui.group('Drive health');
      this.bDie = g.button('☠ Simulate dying drive', function () { self.startDying(); }, { kind: 'danger' });
      g.button('↺ Replace drive', function () { self.replace(); });
      this.ui.spacer();
      this.rSent = this.ui.readout('Alerts sent', '0');
      this.ui.br();
      var t = this.ui.group('Alert thresholds');
      t.text('<span class="ctl-label">Alert when above</span>');
      this.sliders = MET.map(function (m, i) {
        return t.slider({ label: m.key === 'smart' ? 'SMART' : m.key === 'temp' ? 'Temp' : m.key === 'cpu' ? 'CPU' : m.key === 'disk' ? 'Disk' : 'Net', min: m.min, max: m.max, step: m.step, value: m.thr,
          fmt: function (x) { return Math.round(x) + (m.unit === '%' ? '%' : m.unit === '°C' ? '°C' : m.unit === 'Mb/s' ? '' : ''); },
          onInput: function (x) { self.setThr(i, x); } });
      });

      this.pointer({
        down: function (p) {
          var i = self.chartAt(p.x, p.y); if (i < 0) return false;
          self.drag = i; self.setThr(i, self.valAt(i, p.y), true); return true;
        },
        move: function (p) { if (self.drag >= 0) self.setThr(self.drag, self.valAt(self.drag, p.y), true); },
        up: function () { if (self.drag >= 0) { var m = MET[self.drag]; self.announce(m.name + ' alert threshold set to ' + Math.round(self.thr[self.drag]) + ' ' + m.unit + '.'); } self.drag = -1; },
        hover: function (p) { var i = self.chartAt(p.x, p.y); self.stage.style.cursor = i >= 0 ? 'ns-resize' : ''; }
      });
    },
    setThr: function (i, x, fromDrag) {
      var m = MET[i];
      x = U.clamp(Math.round(x / m.step) * m.step, m.min + m.step, m.max);
      this.thr[i] = x;
      if (fromDrag) this.sliders[i].set(x);
      if (this.hist[i][(this.head - 1 + NS) % NS] < x) this.armed[i] = true;
      this.invalidate();
    },
    startDying: function () {
      if (this.dying || this.failed) return;
      this.dying = true; this.dieT = 0; this.alertAt = -1; this.failAt = -1;
      this.bDie.setDisabled(true);
      this.announce('Disk 2 starts failing. Watch the SMART reallocated-sector count creep up.');
    },
    replace: function () {
      this.dying = false; this.failed = false; this.v.smart = 0; this.alertAt = -1; this.failAt = -1;
      var h = this.hist[4]; for (var i = 0; i < NS; i++) h[i] = 0;
      this.armed[4] = true; this.bDie.setDisabled(false);
      this.announce('Disk 2 replaced. SMART count back to zero.');
    },
    ff: function () { return this.dying ? FF : 15; }, // seconds of real time per sample

    sample: function (silent) {
      var v = this.v, r = this.rng, b = this.burst;
      // CPU: mean-reverting walk with occasional heavy jobs
      if (b.cpu <= 0 && r.chance(0.008)) b.cpu = r.int(10, 22);
      var cpuT = b.cpu > 0 ? 93 : 24; if (b.cpu > 0) b.cpu--;
      v.cpu = U.clamp(v.cpu + (cpuT - v.cpu) * 0.18 + r.gauss(0, 3.2), 2, 100);
      v.temp = U.clamp(v.temp + ((36 + v.cpu * 0.5) - v.temp) * 0.12 + r.gauss(0, 0.4), 25, 100);
      v.disk = U.clamp(v.disk + 0.006 + (r.chance(0.01) ? r.range(0.2, 0.8) : 0), 0, 99.5);
      if (v.disk > 98) v.disk = 72.4;
      if (b.net <= 0 && r.chance(0.012)) b.net = r.int(12, 30);
      var netT = b.net > 0 ? 920 : 140; if (b.net > 0) b.net--;
      v.net = U.clamp(v.net + (netT - v.net) * 0.25 + r.gauss(0, 30), 4, 990);
      if (this.dying) {
        this.dieT += 1;
        var rate = Math.pow(this.dieT / 10, 2.2) * 0.35;
        v.smart += Math.max(0, r.gauss(rate, rate * 0.8));
        if (v.smart > 32 && !this.failed) {
          this.failed = true; this.dying = false; this.failAt = this.sampleN;
          this.pushCard('CRITICAL: disk2 FAILED · RAID degraded, rebuilding onto spare', 'fault');
          S.audio.play('alarm', { level: 0.4 }); S.haptics.fail('fail');
          if (this.alertAt >= 0) {
            var lead = (this.failAt - this.alertAt) * FF;
            this.announce('Disk 2 failed. The SMART alert came ' + U.fmtTime(lead) + ' earlier — enough time to swap it.');
          }
        }
      }
      var vals = [v.cpu, v.temp, v.disk, v.net, v.smart];
      for (var i = 0; i < MET.length; i++) {
        this.hist[i][this.head] = vals[i];
        if (silent) continue;
        if (this.armed[i] && vals[i] > this.thr[i]) { this.armed[i] = false; this.alert(i, vals[i]); }
        else if (!this.armed[i] && vals[i] < this.thr[i] - (MET[i].max - MET[i].min) * 0.04) this.armed[i] = true;
      }
      this.head = (this.head + 1) % NS; this.filled = Math.min(NS, this.filled + 1);
      this.sampleN++;
      this.clock += this.ff();
    },
    alert: function (i, val) {
      var m = MET[i], txt;
      if (m.key === 'cpu') txt = 'ALERT: web-01 CPU ' + Math.round(val) + '% (> ' + Math.round(this.thr[i]) + '%)';
      else if (m.key === 'temp') txt = 'ALERT: CPU temperature ' + Math.round(val) + ' °C (> ' + Math.round(this.thr[i]) + ' °C)';
      else if (m.key === 'disk') txt = 'ALERT: /data is ' + Math.round(val) + '% full (> ' + Math.round(this.thr[i]) + '%)';
      else if (m.key === 'net') txt = 'ALERT: eth0 at ' + Math.round(val) + ' Mb/s (> ' + Math.round(this.thr[i]) + ')';
      else { txt = 'ALERT: disk2 SMART reallocated sectors = ' + Math.round(val); if (this.alertAt < 0 && (this.dying || this.failed)) this.alertAt = this.sampleN; }
      this.pushCard(txt, m.key === 'smart' ? 'warn' : 'net');
    },
    pushCard: function (txt, kind) {
      var hh = Math.floor(this.clock / 3600) % 24, mm = Math.floor(this.clock / 60) % 60;
      var day = Math.floor(this.clock / 86400);
      this.cards.unshift({ text: txt, kind: kind, time: (day ? 'day ' + (day + 1) + ' ' : '') + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm, t: 0 });
      if (this.cards.length > 4) this.cards.pop();
      this.buzz = 1; this.sent++;
      this.rSent.set(String(this.sent), kind === 'fault' ? 'bad' : 'warn');
      this.announce(txt);
    },

    // ------------------------------------------------------------ layout
    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      L.fs = m ? 9.5 : U.clamp(w / 85, 10, 12);
      var top = m ? 46 : 12, ch = m ? h * 0.66 - 46 : h - 24;
      L.cx = m ? 8 : 16; L.cw = m ? w - 16 : w * 0.66;
      L.rowH = ch / MET.length; L.top = top;
      L.lab = m ? 92 : Math.min(150, L.cw * 0.25);
      L.phone = m ? { x: 8, y: top + ch + 10, w: w - 16, h: h - top - ch - 18 } : { x: w * 0.69 + 8, y: 50, w: w * 0.31 - 24, h: h - 62 };
    },
    plot: function (i) {
      var L = this.L, y = L.top + i * L.rowH;
      var o = this._plot || (this._plot = {});
      o.x = L.cx + L.lab; o.y = y + 8; o.w = L.cw - L.lab - 8; o.h = L.rowH - 18;
      return o;
    },
    maxOf: function (i) { var hst = this.hist[i], mx = -1e9; for (var k = 0; k < NS; k++) if (hst[k] > mx) mx = hst[k]; return mx; },
    scaleMax: function (i) { var m = MET[i]; return m.key === 'smart' ? Math.max(m.max, this.v.smart * 1.15) : m.max; },
    yOf: function (i, val, p) { var m = MET[i]; return p.y + p.h - U.clamp((val - m.min) / (this.scaleMax(i) - m.min), 0, 1) * p.h; },
    valAt: function (i, y) { var p = this.plot(i), m = MET[i]; return m.min + (1 - (y - p.y) / p.h) * (this.scaleMax(i) - m.min); },
    chartAt: function (x, y) {
      for (var i = 0; i < MET.length; i++) { var p = this.plot(i); if (x >= p.x - 6 && x <= p.x + p.w + 12 && y >= p.y - 6 && y <= p.y + p.h + 6) return i; }
      return -1;
    },

    // ------------------------------------------------------------ sim step
    update: function (dt) {
      this.acc += dt;
      var step = DT;
      while (this.acc >= step) { this.acc -= step; this.sample(false); }
      this.buzz = Math.max(0, this.buzz - dt * 1.4);
      for (var i = 0; i < this.cards.length; i++) this.cards[i].t += dt;
    },

    // ------------------------------------------------------------ drawing
    draw: function () {
      if (this.w < 160 || this.h < 120) { D.clear(this.ctx, this.w, this.h); return; }
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, fs = L.fs, m = this.mobile;
      D.clear(ctx, w, h);
      for (var i = 0; i < MET.length; i++) this.drawChart(ctx, i);
      this.drawPhone(ctx);
      var ff = this.dying;
      var tag = ff ? '⏱ fast-forward · 1 s = 16 h' : '⏱ 1 s = 1 min · last 30 min';
      if (m) D.text(ctx, tag, L.cx, 22, { size: fs * 0.8, color: ff ? P.warn : P.text3 });
      else D.text(ctx, tag, L.cx + L.cw - 6, L.top + 2, { size: fs * 0.75, color: ff ? P.warn : P.text3, align: 'right', base: 'top' });
      this.setDesc(this.describe());
    },
    drawChart: function (ctx, i) {
      var P = S.pal, L = this.L, fs = L.fs, m = this.mobile, M = MET[i], p = this.plot(i), hist = this.hist[i], col = P[M.col];
      var y0 = L.top + i * L.rowH, cur = hist[(this.head - 1 + NS) % NS], thr = this.thr[i], over = cur > thr;
      // row frame
      if (i > 0) D.line(ctx, L.cx, y0, L.cx + L.cw, y0, U.rgba(P.grid, 0.8), 1);
      // label + value
      D.text(ctx, M.name, L.cx + 2, y0 + (m ? 12 : 16), { size: fs * 0.78, weight: 700, color: P.text3, ls: 1, maxW: L.lab - 8 });
      var vs = M.key === 'smart' ? String(Math.round(cur)) : M.key === 'disk' ? cur.toFixed(1) : String(Math.round(cur));
      var big = m ? 17 : Math.min(26, L.rowH * 0.3);
      D.text(ctx, vs, L.cx + 2, y0 + L.rowH * 0.56, { size: big, weight: 700, color: over ? P.fault : P.text1 });
      var vw = D.measure(ctx, vs, big, 700);
      D.text(ctx, M.unit, L.cx + 6 + vw, y0 + L.rowH * 0.56 + 2, { size: fs * 0.8, color: P.text3, maxW: L.lab - vw - 12 });
      if (over) D.g.warn(ctx, L.lab + L.cx - 14, y0 + (m ? 12 : 16), 12, P.fault);
      // plot background
      D.box(ctx, p.x, p.y, p.w, p.h, 4, U.rgba(P.panel, 0.7), U.rgba(P.grid, 0.9), 1);
      var n = this.filled, dx = p.w / (NS - 1);
      // area + line
      ctx.beginPath();
      for (var k = 0; k < NS; k++) {
        var idx = (this.head + k) % NS, x = p.x + k * dx, y = this.yOf(i, hist[idx], p);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(p.x + p.w, p.y + p.h); ctx.lineTo(p.x, p.y + p.h); ctx.closePath();
      ctx.fillStyle = U.rgba(col, 0.12); ctx.fill();
      ctx.beginPath();
      for (k = 0; k < NS; k++) {
        idx = (this.head + k) % NS; x = p.x + k * dx; y = this.yOf(i, hist[idx], p);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
      // part above the threshold in red
      var ty = this.yOf(i, thr, p);
      if (this.maxOf(i) > thr) {
        ctx.save(); ctx.beginPath(); ctx.rect(p.x, p.y - 2, p.w, Math.max(0, ty - p.y + 2)); ctx.clip();
        ctx.beginPath();
        for (k = 0; k < NS; k++) {
          idx = (this.head + k) % NS; x = p.x + k * dx; y = this.yOf(i, hist[idx], p);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = P.fault; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.restore();
      }
      void n;
      // live dot
      var ly = this.yOf(i, cur, p);
      D.circle(ctx, p.x + p.w, ly, 3, over ? P.fault : col);
      D.glow(ctx, p.x + p.w, ly, 10, over ? P.fault : col, 0.6);
      // threshold line with grip
      var tc = this.drag === i ? P.accent : U.rgba(P.fault, 0.85);
      D.line(ctx, p.x, ty, p.x + p.w, ty, tc, 1.2, [5, 4]);
      D.circle(ctx, p.x + p.w + 6, ty, 5, P.accent, U.rgba(P.bg, 0.8), 1.5);
      var tl = '> ' + (M.step >= 10 ? Math.round(thr) : Math.round(thr)) + (M.unit === '%' ? '%' : M.unit === '°C' ? '°C' : '');
      D.text(ctx, tl, p.x + 6, ty - 7, { size: fs * 0.75, weight: 700, color: this.drag === i ? P.accent : P.fault });
      // SMART markers: early warning → failure
      if (M.key === 'smart') this.drawMarkers(ctx, p, dx);
    },
    drawMarkers: function (ctx, p, dx) {
      var P = S.pal, fs = this.L.fs, xa = -1, xf = -1;
      if (this.alertAt >= 0) { var ka = NS - 1 - (this.sampleN - 1 - this.alertAt); if (ka >= 0) xa = p.x + ka * dx; }
      if (this.failAt >= 0) { var kf = NS - 1 - (this.sampleN - 1 - this.failAt); if (kf >= 0) xf = p.x + kf * dx; }
      if (xa >= 0) { D.line(ctx, xa, p.y, xa, p.y + p.h, P.warn, 1.4); if (xf < 0 || xf - xa > 60) D.text(ctx, '⚠ alert', xa + 3, p.y + 8, { size: fs * 0.75, weight: 700, color: P.warn }); }
      if (xf >= 0) {
        D.line(ctx, xf, p.y, xf, p.y + p.h, P.fault, 1.6); D.g.cross(ctx, xf, p.y + p.h * 0.5, 12, P.fault);
        D.text(ctx, 'FAILED', xf - 4, p.y + 8, { size: fs * 0.75, weight: 700, color: P.fault, align: 'right' });
        if (xa >= 0 && xf - xa > 40) {
          var lead = (this.failAt - this.alertAt) * FF;
          D.dim(ctx, xa, p.y + p.h - 7, xf, p.y + p.h - 7, U.fmtTime(lead) + ' warning', { color: P.ok, size: fs * 0.75, bg: S.pal.panel });
        }
      }
    },
    drawPhone: function (ctx) {
      var P = S.pal, L = this.L, R = L.phone, fs = L.fs, m = this.mobile, t = this.time;
      var shake = this.buzz > 0 ? Math.sin(t * 70) * this.buzz * 3 : 0;
      var pw = m ? 54 : Math.min(R.w * 0.86, 230), ph = m ? Math.min(R.h - 6, 96) : Math.min(R.h, pw * 1.95);
      var px = (m ? R.x + 4 : R.x + (R.w - pw) / 2) + shake, py = m ? R.y + (R.h - ph) / 2 : R.y + (R.h - ph) / 2;
      // buzz arcs
      if (this.buzz > 0.05) for (var k = 1; k <= 2; k++) {
        ctx.globalAlpha = this.buzz * 0.8 / k;
        ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, pw * 0.55 + k * 8, -0.5, 0.5); ctx.strokeStyle = P.accent; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(px + pw / 2, py + ph / 2, pw * 0.55 + k * 8, Math.PI - 0.5, Math.PI + 0.5); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      D.box(ctx, px, py, pw, ph, m ? 9 : 22, U.shade(P.plastic, -0.2), U.rgba(P.alu, 0.8), 1.5);
      var sx = px + (m ? 4 : 8), sy = py + (m ? 8 : 26), sw = pw - (m ? 8 : 16), sh = ph - (m ? 16 : 46);
      D.box(ctx, sx, sy, sw, sh, m ? 5 : 12, P.bg0);
      if (!m) {
        D.box(ctx, px + pw / 2 - 22, py + 10, 44, 8, 4, U.rgba(P.alu, 0.25));
        D.text(ctx, this.clockStr(), px + pw / 2, sy + 22, { size: 22, weight: 600, color: P.text1, align: 'center' });
        D.text(ctx, 'ops alerts', px + pw / 2, sy + 42, { size: fs * 0.75, color: P.text3, align: 'center' });
        var cy = sy + 58;
        if (!this.cards.length) D.text(ctx, 'no alerts — all quiet', px + pw / 2, cy + 20, { size: fs * 0.8, color: P.text3, align: 'center' });
        for (var i = 0; i < this.cards.length; i++) {
          var c = this.cards[i], ch = this.cardH(ctx, c, sw - 28, fs * 0.8);
          if (cy + ch > sy + sh - 4) break;
          var slide = U.ease.outCubic(U.clamp(c.t / 0.35, 0, 1));
          this.drawCard(ctx, sx + 6, cy - (1 - slide) * 16, sw - 12, ch, c, slide);
          cy += ch + 6;
        }
      } else {
        D.text(ctx, this.clockStr(), px + pw / 2, sy + 12, { size: 10, weight: 600, color: P.text1, align: 'center' });
        D.g.bolt(ctx, px + pw / 2, sy + sh * 0.62, 14, this.cards.length ? P.warn : P.text3);
        var cx = px + pw + 10, cw = R.x + R.w - cx, cy2 = R.y + 2;
        if (!this.cards.length) D.text(ctx, 'no alerts — all quiet', cx, R.y + R.h / 2, { size: fs * 0.85, color: P.text3 });
        for (var j = 0; j < Math.min(2, this.cards.length); j++) {
          var c2 = this.cards[j], ch2 = this.cardH(ctx, c2, cw - 16, fs * 0.82);
          if (cy2 + ch2 > R.y + R.h) break;
          this.drawCard(ctx, cx, cy2, cw, ch2, c2, 1, fs * 0.82);
          cy2 += ch2 + 5;
        }
      }
    },
    clockStr: function () { var hh = Math.floor(this.clock / 3600) % 24, mm = Math.floor(this.clock / 60) % 60; return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; },
    wrap: function (ctx, text, maxW, size) {
      var words = text.split(' '), lines = [], line = '';
      for (var i = 0; i < words.length; i++) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (D.measure(ctx, test, size, 500) > maxW && line) { lines.push(line); line = words[i]; } else line = test;
      }
      if (line) lines.push(line);
      return lines;
    },
    lines: function (ctx, c, maxW, size) { if (c._w !== maxW || c._s !== size) { c._w = maxW; c._s = size; c._l = this.wrap(ctx, c.text, maxW, size); } return c._l; },
    cardH: function (ctx, c, maxW, size) { return 20 + this.lines(ctx, c, maxW, size).length * (size + 3); },
    drawCard: function (ctx, x, y, w, h, c, a, size) {
      var P = S.pal, fs = size || this.L.fs * 0.8, col = c.kind === 'fault' ? P.fault : c.kind === 'warn' ? P.warn : P.net;
      ctx.globalAlpha = a;
      D.box(ctx, x, y, w, h, 7, U.rgba(P.panel2, 0.98), U.rgba(col, 0.7), 1);
      D.box(ctx, x, y + 4, 3, h - 8, 1.5, col);
      D.text(ctx, '● monitor', x + 9, y + 9, { size: fs * 0.9, weight: 700, color: col });
      D.text(ctx, c.time, x + w - 7, y + 9, { size: fs * 0.85, color: P.text3, align: 'right' });
      var lines = this.lines(ctx, c, w - 16, fs);
      for (var i = 0; i < lines.length; i++) D.text(ctx, lines[i], x + 9, y + 21 + i * (fs + 3), { size: fs, color: P.text1 });
      ctx.globalAlpha = 1;
    },
    describe: function () {
      var v = this.v;
      return 'CPU ' + Math.round(v.cpu) + '%, ' + Math.round(v.temp) + ' °C, disk ' + v.disk.toFixed(1) + '% used, network ' + Math.round(v.net) + ' Mb/s, disk2 SMART reallocated sectors ' + Math.round(v.smart) + (this.failed ? ' (disk2 failed)' : '') + '. ' + this.sent + ' alerts sent.';
    }
  });
})(window.SRV);
