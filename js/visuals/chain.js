/* Ch12 · The slowest link wins. A chain of pipes from the server's drive to the client's drive.
   Pipe diameter ∝ √capacity (area ∝ GB/s). The data stream has the SAME thickness everywhere:
   the thickness of the narrowest pipe. That pipe glows as the bottleneck. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var FILE = 50;
  var DRIVES = [['hdd', 'HDD', 0.25], ['sata', 'SATA SSD', 0.55], ['nvme', 'NVMe SSD', 7.0]];
  var NICS = [['1', '1 GbE', 0.115], ['2.5', '2.5 GbE', 0.29], ['10', '10 GbE', 1.15], ['25', '25 GbE', 2.9]];
  var SEGS = [
    { key: 'sdrive', label: 'Server drive', short: 'SRV DRIVE', kind: 'data', icon: 'drive', opts: DRIVES },
    { key: 'snic', label: 'Server NIC', short: 'SRV NIC', kind: 'net', icon: 'nic', opts: NICS },
    { key: 'cable', label: 'Cable', short: 'CABLE', kind: 'net', icon: 'cable', opts: [['cat5e', 'Cat5e', 0.29], ['cat6a', 'Cat6a', 1.15], ['fiber', 'Fiber', 11.5]] },
    { key: 'sw', label: 'Switch', short: 'SWITCH', kind: 'net', icon: 'switch', opts: [['1', '1 GbE', 0.115], ['10', '10 GbE', 1.15], ['25', '25 GbE', 2.9]] },
    { key: 'cnic', label: 'Client NIC', short: 'CLIENT NIC', kind: 'net', icon: 'nic', opts: NICS },
    { key: 'cdrive', label: 'Client drive', short: 'CLIENT DRIVE', kind: 'data', icon: 'drive', opts: DRIVES }
  ];
  var PRESETS = {
    home: ['hdd', '1', 'cat5e', '1', '1', 'sata'],
    hdd10: ['hdd', '10', 'cat6a', '10', '10', 'nvme'],
    fast: ['nvme', '25', 'fiber', '25', '25', 'nvme']
  };
  function fmtRate(gb) { return gb >= 1 ? U.fmt(gb, gb < 10 ? 2 : 1) + ' GB/s' : Math.round(gb * 1000) + ' MB/s'; }
  function fmtT(s) {
    if (s < 10) return s.toFixed(1) + ' s';
    if (s < 60) return Math.round(s) + ' s';
    var m = Math.floor(s / 60), r = Math.round(s - m * 60); if (r === 60) { m++; r = 0; }
    return m + ' min ' + r + ' s';
  }

  S.defineVisual('chain', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.sel = PRESETS.home.slice();
      this.dia = new Float32Array(SEGS.length);   // animated diameters
      this.band = 0;
      var self = this;
      var g = this.ui.group('Presets');
      g.button('Typical home (1 GbE)', function () { self.preset('home'); });
      g.button('10 GbE but HDD', function () { self.preset('hdd10'); });
      g.button('All fast', function () { self.preset('fast'); });
      this.ui.br();
      var g2 = this.ui.group('Each link');
      this.selects = SEGS.map(function (sg, i) {
        return g2.select({ label: sg.label, value: self.sel[i], options: sg.opts.map(function (o) { return [o[0], o[1] + ' · ' + fmtRate(o[2])]; }),
          onChange: function (v) { self.sel[i] = v; self.changed(true); } });
      });
      this.ui.br();
      this.rRate = this.ui.readout('Real speed', '–');
      this.rTime = this.ui.readout('50 GB takes', '–');
      // beads
      var n = 420; this.nb = n;
      this.ba = new Float32Array(n); this.bc = new Float32Array(n);
      for (var k = 0; k < n; k++) { this.ba[k] = this.rng.float(); this.bc[k] = this.rng.float() * 2 - 1; }
      this.pointer({
        down: function (p) {
          var hit = this.hits.query(p.x, p.y);
          if (!hit) return false;
          var i = hit.data.i, sg = SEGS[i], idx = 0;
          for (var j = 0; j < sg.opts.length; j++) if (sg.opts[j][0] === this.sel[i]) idx = j;
          this.sel[i] = sg.opts[(idx + 1) % sg.opts.length][0];
          this.selects[i].set(this.sel[i]);
          this.changed(true);
          return false;
        },
        hover: function (p) {
          var hit = this.hits.query(p.x, p.y);
          this.stage.style.cursor = hit ? 'pointer' : '';
          if (hit) this.tipAt('<b>' + SEGS[hit.data.i].label + '</b> · click to change', p.x, p.y); else this.tipAt(null);
        }
      });
      this.changed(false);
    },
    preset: function (k) {
      this.sel = PRESETS[k].slice();
      var self = this;
      this.selects.forEach(function (s, i) { s.set(self.sel[i]); });
      this.changed(true);
    },
    cap: function (i) { var sg = SEGS[i]; for (var j = 0; j < sg.opts.length; j++) if (sg.opts[j][0] === this.sel[i]) return sg.opts[j][2]; return sg.opts[0][2]; },
    optName: function (i) { var sg = SEGS[i]; for (var j = 0; j < sg.opts.length; j++) if (sg.opts[j][0] === this.sel[i]) return sg.opts[j][1]; return ''; },
    changed: function (speak) {
      var min = 1e9, i;
      for (i = 0; i < SEGS.length; i++) min = Math.min(min, this.cap(i));
      this.min = min;
      this.bott = SEGS.map(function (s, j) { return Math.abs(this.cap(j) - min) < 1e-9; }, this);
      var names = SEGS.filter(function (s, j) { return this.bott[j]; }, this).map(function (s) { return s.label; });
      this.bottNames = names;
      this.rRate.set(fmtRate(min), min >= 1 ? 'ok' : min < 0.2 ? 'warn' : '');
      this.rTime.set(fmtT(FILE / min));
      if (speak) this.announce('Slowest link: ' + names.join(', ') + ' at ' + fmtRate(min) + '. 50 GB takes ' + fmtT(FILE / min) + '.');
      if (!this.k) return;
      for (i = 0; i < SEGS.length; i++) this.tw(i, this.k * Math.sqrt(this.cap(i)));
      this.twBand(this.k * Math.sqrt(min));
    },
    tw: function (i, to) {
      var self = this;
      if (!this.reduced() && this.dia[i]) this.tween({ from: this.dia[i], to: to, dur: 0.6, ease: 'snap', onUpdate: function (v) { self.dia[i] = v; } });
      else this.dia[i] = to;
    },
    twBand: function (to) {
      var self = this;
      if (this.bandTw) this.bandTw.cancel();
      if (!this.reduced() && this.band) this.bandTw = this.tween({ from: this.band, to: to, dur: 0.7, ease: 'settle', onUpdate: function (v) { self.band = v; } });
      else this.band = to;
    },

    resize: function (w, h) {
      var m = this.mobile = w < 560, n = SEGS.length;
      if (m) { this.A0 = 64; this.A1 = h - 26; this.C = 66; this.k = 74 / Math.sqrt(11.5); }
      else { this.A0 = 40; this.A1 = w - 40; this.C = h * 0.55; this.k = Math.min(150, h * 0.34) / Math.sqrt(11.5); }
      this.segLen = (this.A1 - this.A0) / n;
      this.gapL = m ? 10 : 18;
      for (var i = 0; i < n; i++) this.dia[i] = this.k * Math.sqrt(this.cap(i));
      this.band = this.k * Math.sqrt(this.min);
    },
    /** along/across → screen */
    P: function (a, c) { return this.mobile ? [this.C + c, a] : [a, this.C + c]; },
    rect: function (ctx, a0, a1, half) {
      if (this.mobile) ctx.rect(this.C - half, a0, half * 2, a1 - a0); else ctx.rect(a0, this.C - half, a1 - a0, half * 2);
    },

    band2: function (ctx, a0, a1, c0, c1) {
      if (this.mobile) ctx.rect(this.C + c0, a0, c1 - c0, a1 - a0); else ctx.rect(a0, this.C + c0, a1 - a0, c1 - c0);
    },
    update: function (dt) {
      var L = this.A1 - this.A0, v = (this.mobile ? 70 : 110) / L;
      for (var k = 0; k < this.nb; k++) { this.ba[k] += dt * v * (0.9 + 0.2 * ((k * 0.618) % 1)); if (this.ba[k] > 1) this.ba[k] -= 1; }
    },

    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, m = this.mobile, t = this.time, n = SEGS.length, i;
      D.clear(ctx, w, h);
      this.hits.clear();
      var A0 = this.A0, sl = this.segLen, g = this.gapL, band = this.band;
      // headline
      var hx = m ? w / 2 : w / 2, hy = m ? 18 : 26;
      D.text(ctx, '50 GB transfer: ' + fmtT(FILE / this.min), hx, hy, { size: m ? 13 : 17, weight: 800, color: P.text1, align: 'center' });
      D.text(ctx, 'everything moves at ' + fmtRate(this.min) + ' — the narrowest pipe', hx, hy + (m ? 16 : 20), { size: m ? 9 : 10.5, color: P.text2, align: 'center' });

      // pipes (with reducers between)
      for (i = 0; i < n; i++) {
        var a0 = A0 + i * sl + g / 2, a1 = A0 + (i + 1) * sl - g / 2, half = this.dia[i] / 2, sg = SEGS[i], kc = sg.kind === 'data' ? P.data : P.net;
        var bn = this.bott[i];
        if (bn) {
          var pulse = 0.55 + 0.45 * Math.sin(t * 4);
          var c = this.P((a0 + a1) / 2, 0);
          D.glow(ctx, c[0], c[1], Math.max(30, half * 2.2), P.fault, 0.25 + 0.2 * pulse);
        }
        ctx.beginPath(); this.rect(ctx, a0, a1, half);
        ctx.fillStyle = U.rgba(kc, P.dark ? 0.07 : 0.08); ctx.fill();
        ctx.lineWidth = bn ? 2 : 1.2; ctx.strokeStyle = bn ? P.fault : U.rgba(P.alu, 0.6); ctx.stroke();
        // unused capacity hatch
        if (!bn && half - band / 2 > 3) {
          ctx.fillStyle = D.hatch(ctx, U.rgba(P.text3, 0.22), 6);
          ctx.beginPath(); this.band2(ctx, a0 + 1, a1 - 1, -half + 1, -band / 2 - 1); this.band2(ctx, a0 + 1, a1 - 1, band / 2 + 1, half - 1); ctx.fill();
        }
        // reducer to the next pipe
        if (i < n - 1) {
          var h2 = this.dia[i + 1] / 2, p1 = this.P(a1, -half), p2 = this.P(a1 + g, -h2), p3 = this.P(a1 + g, h2), p4 = this.P(a1, half);
          D.poly(ctx, [p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1]]);
          ctx.fillStyle = U.rgba(P.steel, 0.55); ctx.fill(); ctx.strokeStyle = U.rgba(P.alu, 0.4); ctx.lineWidth = 1; ctx.stroke();
        }
        // hit area
        var hp = this.P(a0, -Math.max(half, 22)), hq = this.P(a1, Math.max(half, 22));
        this.hits.rect('seg' + i, Math.min(hp[0], hq[0]), Math.min(hp[1], hq[1]), Math.abs(hq[0] - hp[0]), Math.abs(hq[1] - hp[1]), { i: i });
      }
      // the stream: same thickness everywhere = narrowest pipe
      this.drawBeads(ctx, P, band);

      // labels
      for (i = 0; i < n; i++) this.drawLabel(ctx, P, i, A0 + (i + 0.5) * sl, t);
      if (!m) {
        D.text(ctx, 'SERVER ▸', this.A0, h - 16, { size: 9.5, weight: 700, color: P.text3 });
        D.text(ctx, '▸ CLIENT', this.A1, h - 16, { size: 9.5, weight: 700, color: P.text3, align: 'right' });
        D.text(ctx, 'pipe area ∝ speed · the stream is only as thick as the narrowest pipe · click a pipe to change it', w / 2, h - 16, { size: 9.5, color: P.text3, align: 'center' });
      }
      this.setDesc('Transfer runs at ' + fmtRate(this.min) + ', limited by ' + this.bottNames.join(', ') + '. 50 GB takes ' + fmtT(FILE / this.min) + '.');
    },

    drawBeads: function (ctx, P, band) {
      var A0 = this.A0, L = this.A1 - this.A0, half = Math.max(1, band / 2 - 2), n = this.nb;
      // bead count ∝ stream thickness (constant areal density)
      var count = Math.min(n, Math.round(24 + band * (this.mobile ? 3.4 : 5)));
      var dataEnd = A0 + this.segLen, dataStart = A0 + this.segLen * 5, r = this.mobile ? 1.7 : 2.1;
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (var k = 0; k < count; k++) {
          var a = A0 + this.ba[k] * L, isData = a < dataEnd || a > dataStart;
          if ((pass === 0) !== isData) continue;
          var q = this.P(a, this.bc[k] * half);
          ctx.moveTo(q[0] + r, q[1]); ctx.arc(q[0], q[1], r, 0, U.TAU);
        }
        ctx.fillStyle = pass === 0 ? P.data : P.net; ctx.fill();
      }
    },

    drawLabel: function (ctx, P, i, a, t) {
      var m = this.mobile, sg = SEGS[i], cap = this.cap(i), bn = this.bott[i], half = this.dia[i] / 2;
      var used = Math.round(this.min / cap * 100);
      var kc = sg.kind === 'data' ? P.data : P.net;
      if (m) {
        var lx = this.C + 46, y = a;
        this.icon(ctx, P, sg.icon, 22, y, 22, kc);
        D.text(ctx, sg.short, lx, y - 13, { size: 8.5, weight: 700, color: P.text3, ls: 0.5 });
        D.text(ctx, this.optName(i) + ' · ' + fmtRate(cap), lx, y, { size: 10.5, weight: 800, color: bn ? P.fault : P.text1 });
        D.text(ctx, bn ? '◀ BOTTLENECK · 100% used' : 'used ' + used + '%', lx, y + 13, { size: 9, weight: bn ? 800 : 500, color: bn ? P.fault : P.text3 });
        return;
      }
      var top = this.C - Math.max(half, 28) - 14;
      this.icon(ctx, P, sg.icon, a, top - 52, 26, kc);
      D.text(ctx, sg.short, a, top - 30, { size: 9, weight: 700, color: P.text3, align: 'center', ls: 0.8 });
      D.text(ctx, this.optName(i), a, top - 15, { size: 12, weight: 800, color: bn ? P.fault : P.text1, align: 'center' });
      var bot = this.C + Math.max(half, 10) + 16;
      D.text(ctx, fmtRate(cap), a, bot, { size: 11, weight: 700, color: P.text2, align: 'center' });
      if (bn) D.pill(ctx, '▲ BOTTLENECK', a, bot + 20, { size: 9.5, align: 'center', color: P.fault, bg: U.rgba(P.fault, 0.12) });
      else D.text(ctx, 'used ' + used + '%', a, bot + 18, { size: 9.5, color: P.text3, align: 'center' });
    },

    icon: function (ctx, P, kind, x, y, s, kc) {
      if (kind === 'drive') {
        D.box(ctx, x - s * 0.42, y - s * 0.3, s * 0.84, s * 0.6, 3, U.rgba(kc, 0.15), kc, 1.3);
        D.circle(ctx, x - s * 0.08, y, s * 0.18, null, kc, 1.2); D.circle(ctx, x + s * 0.26, y + s * 0.16, 1.8, kc);
      } else if (kind === 'nic') {
        D.box(ctx, x - s * 0.45, y - s * 0.22, s * 0.9, s * 0.44, 2, U.rgba(P.pcb, 0.9), kc, 1.2);
        ctx.fillStyle = P.gold; for (var k = 0; k < 6; k++) ctx.fillRect(x - s * 0.36 + k * s * 0.13, y + s * 0.22, s * 0.08, s * 0.1);
        D.box(ctx, x + s * 0.12, y - s * 0.14, s * 0.24, s * 0.24, 1, U.rgba(P.silicon, 0.8));
      } else if (kind === 'cable') {
        ctx.beginPath(); ctx.moveTo(x - s * 0.5, y + s * 0.1); ctx.bezierCurveTo(x - s * 0.2, y - s * 0.4, x + s * 0.2, y + s * 0.4, x + s * 0.5, y - s * 0.1);
        ctx.strokeStyle = kc; ctx.lineWidth = 2.4; ctx.stroke();
        D.box(ctx, x - s * 0.56, y + s * 0.02, s * 0.16, s * 0.18, 1, kc); D.box(ctx, x + s * 0.4, y - s * 0.2, s * 0.16, s * 0.18, 1, kc);
      } else D.g.switchBox(ctx, x, y, s * 1.1, P.steel, this.time);
    }
  });
})(window.SRV);
