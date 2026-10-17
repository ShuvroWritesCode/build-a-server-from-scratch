/* Ch8 · Form-factor shelf. 3.5″ HDD, 2.5″ SSD, M.2 2280, U.2 and E3.S drawn to the same millimetre scale
   on a ruler grid. Pick a drive and a bay: a fit drops in and clicks; a mismatch bounces with the reason.
   Endurance meter: TBW = capacity × DWPD × 365 × 5 years. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var DRV = [
    { id: '35', name: '3.5″ HDD', short: '3.5″', w: 101.6, l: 147, th: '26.1 mm thick', iface: 'SATA/SAS' },
    { id: '25', name: '2.5″ SSD', short: '2.5″', w: 69.85, l: 100, th: '7 mm thick', iface: 'SATA' },
    { id: 'm2', name: 'M.2 2280', short: 'M.2', w: 22, l: 80, th: 'bare card', iface: 'NVMe' },
    { id: 'u2', name: 'U.2', short: 'U.2', w: 69.85, l: 100, th: '15 mm thick', iface: 'NVMe' },
    { id: 'e3', name: 'E3.S', short: 'E3.S', w: 76, l: 112.75, th: '7.5 mm thick', iface: 'NVMe' }
  ];
  var BAY = [
    { id: 'b35', name: '3.5″ bay + caddy', short: '3.5″ bay', w: 101.6, l: 147, back: 'SATA/SAS backplane' },
    { id: 'b25', name: '2.5″ SATA/SAS bay', short: '2.5″ bay', w: 69.85, l: 100, back: 'SATA/SAS backplane' },
    { id: 'bm2', name: 'M.2 slot (M-key)', short: 'M.2 slot', w: 22, l: 80, back: 'M.2 socket' },
    { id: 'bu2', name: 'U.2 NVMe bay', short: 'U.2 bay', w: 69.85, l: 100, back: 'NVMe backplane' },
    { id: 'bed', name: 'E3.S EDSFF bay', short: 'EDSFF', w: 76, l: 112.75, back: 'EDSFF backplane' }
  ];
  function fit(d, b) {
    var D_ = d.id, B = b.id;
    if (B === 'b35') {
      if (D_ === '35') return [true, 'Fits — screws into the caddy'];
      if (D_ === '25') return [true, 'Fits — 2.5″ screws into the caddy’s inner holes'];
      if (D_ === 'u2') return [false, 'U.2 needs an NVMe backplane — this one speaks SATA/SAS'];
      if (D_ === 'm2') return [false, 'M.2 is a bare card — it needs an M.2 slot'];
      return [false, 'E3.S needs an EDSFF bay'];
    }
    if (B === 'b25') {
      if (D_ === '25') return [true, 'Perfect fit'];
      if (D_ === '35') return [false, 'Too big: 101.6 mm wide, the bay is 70 mm'];
      if (D_ === 'u2') return [false, 'Same size, but U.2 needs an NVMe backplane'];
      if (D_ === 'm2') return [false, 'M.2 is a bare card — it needs an M.2 slot'];
      return [false, 'E3.S needs an EDSFF bay'];
    }
    if (B === 'bm2') {
      if (D_ === 'm2') return [true, 'Clicks into the socket · screw at 80 mm'];
      return [false, 'An M.2 slot only takes a 22 mm-wide card'];
    }
    if (B === 'bu2') {
      if (D_ === 'u2') return [true, 'Hot-swap NVMe — clicks into the backplane'];
      if (D_ === '25') return [false, 'Plugs in, but an NVMe-only backplane can’t talk SATA'];
      if (D_ === '35') return [false, 'Too big: 101.6 mm wide, the bay is 70 mm'];
      if (D_ === 'm2') return [false, 'M.2 is a bare card — it needs an M.2 slot'];
      return [false, 'E3.S needs an EDSFF bay'];
    }
    if (D_ === 'e3') return [true, 'Slides in — latch clicks'];
    return [false, 'EDSFF bays only take E1/E3 drives'];
  }
  var CAPS = [0.96, 1.92, 3.84, 7.68, 15.36, 30.72];
  var DWPD = [0.3, 1, 3];
  function wrap(ctx, str, maxW, size, weight) {
    var words = str.split(' '), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + ' ' + words[i] : words[i];
      if (cur && D.measure(ctx, t, size, weight) > maxW) { lines.push(cur); cur = words[i]; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function fmtTB(tb) { return tb >= 1000 ? U.fmt(tb / 1000, tb >= 10000 ? 0 : 1) + ' PB' : U.fmt(tb, 0) + ' TB'; }

  S.defineVisual('shelf', {
    init: function () {
      this.ctx = this.layer();
      this.di = 1; this.bi = 1; this.ci = 2; this.wi = 1;
      this.anim = { k: 0, z: 0, shake: 0, res: null, pulse: 0, active: false };
      this.hover = null;
      var self = this;
      var g = this.ui.group('Drive and bay');
      this.sDrv = g.seg({ label: 'Drive', options: DRV.map(function (d, i) { return [i, d.short]; }), value: this.di, onChange: function (v) { self.di = v; self.attempt(); } });
      this.sBay = g.seg({ label: 'Bay', options: BAY.map(function (b, i) { return [i, b.short]; }), value: this.bi, onChange: function (v) { self.bi = v; self.attempt(); } });
      g.button('▸ Try to fit', function () { self.attempt(); }, { kind: 'primary' });
      this.ui.br();
      var e = this.ui.group('SSD endurance');
      e.slider({ label: 'Capacity', min: 0, max: CAPS.length - 1, step: 1, value: this.ci, fmt: function (i) { return CAPS[i] + ' TB'; }, onInput: function (i) { self.ci = i; self.endur(); } });
      e.seg({ label: 'DWPD', options: [[0, '0.3'], [1, '1'], [2, '3']], value: this.wi, onChange: function (v) { self.wi = v; self.endur(); } });
      this.ui.spacer();
      this.rFit = this.ui.readout('Fit', '–');
      this.rTbw = this.ui.readout('Endurance', '–');
      this.pointer({
        down: function (p) {
          var hit = this.hits.query(p.x, p.y);
          if (!hit) return false;
          if (hit.id === 'drv') { this.di = hit.data; this.sDrv.set(hit.data); }
          if (hit.id === 'bay') { this.bi = hit.data; this.sBay.set(hit.data); }
          this.attempt();
          return false;
        },
        hover: function (p) {
          var hit = this.hits.query(p.x, p.y);
          this.stage.style.cursor = hit ? 'pointer' : '';
          var key = hit ? hit.id + hit.data : null;
          if (key !== this.hover) { this.hover = key; this.invalidate(); }
          if (hit && hit.id === 'drv') { var d = DRV[hit.data]; this.tipAt('<b>' + d.name + '</b><br>' + d.w + ' × ' + d.l + ' mm · ' + d.th + '<br>' + d.iface, p.x, p.y); }
          else this.tipAt(null);
        },
        leave: function () { this.hover = null; this.stage.style.cursor = ''; }
      });
      this.endur(true);
      this.first = true;
    },
    onVisible: function () { if (this.first) { this.first = false; this.attempt(true); } },
    endur: function (silent) {
      var cap = CAPS[this.ci], dw = DWPD[this.wi], tbw = cap * dw * 365 * 5;
      this.tbw = tbw;
      this.rTbw.set(fmtTB(tbw) + ' written', 'ok');
      if (!silent) this.announce(cap + ' terabytes at ' + dw + ' drive writes per day for 5 years is about ' + fmtTB(tbw) + ' of writes.');
      this.setDesc(this.describe());
      this.invalidate();
    },
    describe: function () {
      var d = DRV[this.di], b = BAY[this.bi], f = fit(d, b);
      return d.name + ' into a ' + b.name + ': ' + (f[0] ? 'fits. ' : 'does not fit — ' + f[1] + '. ') + 'Endurance ' + fmtTB(this.tbw || 0) + ' over 5 years.';
    },
    attempt: function (silent) {
      var a = this.anim, self = this, d = DRV[this.di], b = BAY[this.bi], f = fit(d, b);
      if (a.tws) a.tws.forEach(function (t) { t.cancel(); });
      a.tws = [];
      a.res = null; a.k = 0; a.z = 1; a.shake = 0; a.pulse = 0; a.active = true; a.ok = f[0]; a.msg = f[1];
      this.rFit.set('…');
      function tw(o) { var h = self.tween(o); a.tws.push(h); return h; }
      tw({ from: 0, to: 1, dur: 0.6, ease: 'inOutSine', onUpdate: function (v) { a.k = v; }, onDone: function () {
        if (f[0]) {
          tw({ from: 1, to: 0, dur: 0.35, ease: 'outCubic', onUpdate: function (v) { a.z = v; }, onDone: function () {
            a.res = 'ok';
            tw({ from: 1, to: 0, dur: 0.7, ease: 'outCubic', onUpdate: function (v) { a.pulse = v; } });
            self.done(f, silent);
          } });
        } else {
          tw({ from: 1, to: 0.35, dur: 0.2, ease: 'inQuad', onUpdate: function (v) { a.z = v; }, onDone: function () {
            a.res = 'bad';
            self.done(f, silent);
            tw({ from: 1, to: 0, dur: 0.5, ease: 'linear', onUpdate: function (v) { a.shake = v; } });
            tw({ from: 0.35, to: 1, dur: 0.5, ease: 'outBack', delay: 0.15, onUpdate: function (v) { a.z = v; } });
            tw({ from: 1, to: 0, dur: 0.55, ease: 'inOutSine', delay: 0.9, onUpdate: function (v) { a.k = v; } });
          } });
        }
      } });
    },
    done: function (f, silent) {
      this.rFit.set(f[0] ? 'Fits ✓' : 'Won’t fit ✕', f[0] ? 'ok' : 'bad');
      if (!silent) this.announce((f[0] ? 'Fits. ' : 'Does not fit. ') + f[1] + '.');
      this.setDesc(this.describe());
    },

    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      var pad = m ? 10 : 14;
      L.pad = pad;
      L.eh = m ? 104 : 86;                                // endurance strip
      L.ey = h - pad - L.eh;
      var topH = L.ey - pad - 8;
      var gapMm = 0, gaps = 4 * (m ? 8 : 16), sumW = 0;
      DRV.forEach(function (d) { sumW += d.w; });
      if (m) {
        L.sx = pad; L.sw = w - pad * 2; L.sy = pad;
        var shelfH = topH * 0.48;
        L.s = Math.min((L.sw - 16 - gaps) / sumW, (shelfH - 56) / 147);
        L.base = L.sy + 32 + 147 * L.s + 6;
        L.shH = L.base - L.sy + 22;
        L.bx = pad; L.bw = w - pad * 2; L.by = L.sy + L.shH + 8; L.bh = L.ey - 8 - L.by;
      } else {
        L.sx = pad; L.sw = Math.round(w * 0.6) - pad; L.sy = pad;
        L.s = Math.min((L.sw - 24 - gaps) / sumW, (topH - 70) / 147);
        L.base = L.sy + 38 + 147 * L.s + 6;
        L.shH = topH;
        L.bx = L.sx + L.sw + 10; L.bw = w - L.bx - pad; L.by = pad; L.bh = topH;
      }
      L.s = Math.max(0.25, L.s || 0.25);
      L.bh = Math.max(40, L.bh);
      // drive slots on the shelf (bottom-aligned on baseline)
      var x = L.sx + (m ? 8 : 12) + ((L.sw - (m ? 16 : 24)) - (sumW * L.s + gaps)) / 2;
      L.slots = DRV.map(function (d) {
        var o = { x: x, y: L.base - d.l * L.s, w: d.w * L.s, h: d.l * L.s };
        x += d.w * L.s + (m ? 8 : 16);
        return o;
      });
      L.x0 = L.slots[0].x;
      // bay geometry (bay drawn centred in the bay panel)
      L.bayCx = L.bx + 14 + (m ? 101.6 * L.s : 101.6 * L.s) / 2 + 8;
      L.bayCy = L.by + L.bh / 2 + 8;
      L.tx = L.bx + 14 + 101.6 * L.s + 34;
      void gapMm;
    },

    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, m = this.mobile, s = L.s, self = this;
      D.clear(ctx, w, h);
      this.hits.clear();
      // ---------- shelf panel + mm grid
      D.box(ctx, L.sx, L.sy, L.sw, L.shH, 10, U.rgba(P.panel, 0.45), U.rgba(P.blueprint, 0.25), 1);
      ctx.save(); D.rr(ctx, L.sx, L.sy, L.sw, L.shH, 10); ctx.clip();
      ctx.strokeStyle = U.rgba(P.blueprint, 0.08); ctx.lineWidth = 1; ctx.beginPath();
      for (var gx = L.x0; gx < L.sx + L.sw; gx += 10 * s) { ctx.moveTo(Math.round(gx) + 0.5, L.sy); ctx.lineTo(Math.round(gx) + 0.5, L.base); }
      for (var gy = L.base; gy > L.sy; gy -= 10 * s) { ctx.moveTo(L.sx, Math.round(gy) + 0.5); ctx.lineTo(L.sx + L.sw, Math.round(gy) + 0.5); }
      ctx.stroke(); ctx.restore();
      D.text(ctx, 'TO SCALE · 1 SQUARE = 10 mm', L.sx + 10, L.sy + 12, { size: m ? 8 : 9.5, weight: 700, color: P.text3, ls: 1 });
      // ruler
      var rx0 = L.x0, rx1 = L.slots[4].x + L.slots[4].w;
      D.line(ctx, rx0, L.base + 0.5, rx1, L.base + 0.5, U.rgba(P.blueprint, 0.8), 1);
      for (var mm = 0; mm * s <= rx1 - rx0 + 0.5; mm += 10) {
        var tx = rx0 + mm * s, major = mm % 50 === 0;
        D.line(ctx, tx, L.base, tx, L.base + (major ? 6 : 3), U.rgba(P.blueprint, 0.8), 1);
        if (major && (!m || mm % 100 === 0)) D.text(ctx, String(mm), tx, L.base + 13, { size: m ? 7.5 : 8.5, color: P.text3, align: 'center' });
      }
      D.text(ctx, 'mm', rx1 + 4, L.base + 13, { size: m ? 7.5 : 8.5, color: P.text3 });
      // drives on the shelf
      var a = this.anim;
      for (var i = 0; i < DRV.length; i++) {
        var sl = L.slots[i], d = DRV[i], sel = i === this.di, away = sel && a.active && (a.k > 0.001);
        this.hits.rect('drv', sl.x - 4, sl.y - 18, sl.w + 8, sl.h + 22, i);
        D.text(ctx, d.short, sl.x + sl.w / 2, sl.y - 9, { size: m ? 8.5 : 10, weight: 800, color: sel ? P.accent : P.text2, align: 'center' });
        if (away) {
          D.box(ctx, sl.x, sl.y, sl.w, sl.h, 3, null, U.rgba(P.blueprint, 0.5), 1);
          ctx.setLineDash([]);
          D.line(ctx, sl.x, sl.y, sl.x + sl.w, sl.y + sl.h, U.rgba(P.blueprint, 0.2), 1, [3, 3]);
        } else {
          this.drawDrive(ctx, d, sl.x, sl.y, s, 1);
        }
        if (this.hover === 'drv' + i || sel) D.box(ctx, sl.x - 3, sl.y - 3, sl.w + 6, sl.h + 6, 4, null, sel ? P.accent : U.rgba(P.accent, 0.5), sel ? 1.5 : 1);
        if (!m) D.text(ctx, (d.w % 1 ? d.w.toFixed(d.w === 69.85 ? 2 : 1) : d.w) + '', sl.x + sl.w / 2, L.base + 24, { size: 8.5, weight: 600, color: sel ? P.text1 : P.text3, align: 'center' });
      }
      // length dimension for selected drive
      var ss = L.slots[this.di], dd = DRV[this.di];
      if (!m) {
        var dxp = ss.x + ss.w + (m ? 3 : 6);
        if (this.di < 4) dxp = Math.min(dxp, L.slots[this.di + 1].x - 3);
        D.dim(ctx, dxp, ss.y, dxp, L.base, String(dd.l), { size: m ? 8 : 9, bg: P.bg });
      }

      // ---------- bay panel
      var bay = BAY[this.bi];
      D.box(ctx, L.bx, L.by, L.bw, L.bh, 10, U.rgba(P.panel, 0.45), U.rgba(P.blueprint, 0.25), 1);
      D.text(ctx, 'BAY · ' + bay.name.toUpperCase(), L.bx + 10, L.by + 14, { size: m ? 8.5 : 9.5, weight: 700, color: P.text2, ls: 0.8 });
      this.drawBay(ctx, bay);

      // ---------- flying / seated drive
      if (a.active) {
        var from = { x: ss.x + ss.w / 2, y: ss.y + ss.h / 2 };
        var bw = dd.w * s, bl = dd.l * s;
        var toX = L.bayCx, toY = L.bayTop + bl / 2;
        var kk = a.k, zz = a.z;
        var x = U.lerp(from.x, toX, kk), y = U.lerp(from.y, toY, kk) - Math.sin(kk * Math.PI) * 30;
        if (a.shake > 0) x += Math.sin(a.shake * 40) * 7 * a.shake;
        var sc = 1 + 0.08 * zz * (kk > 0.001 ? 1 : 0);
        if (kk > 0.001) {
          // shadow grows with height
          ctx.fillStyle = U.rgba('#000', 0.18 + 0.12 * zz);
          D.rr(ctx, x - bw / 2 + 6 * zz, y - bl / 2 + 8 * zz, bw, bl, 4); ctx.fill();
          ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
          this.drawDrive(ctx, dd, -bw / 2, -bl / 2, s, 1);
          if (a.res === 'bad') { ctx.fillStyle = D.hatch(ctx, U.rgba(P.fault, 0.6), 6, true); D.rr(ctx, -bw / 2, -bl / 2, bw, bl, 3); ctx.fill(); D.box(ctx, -bw / 2, -bl / 2, bw, bl, 3, null, P.fault, 2); }
          if (a.res === 'ok') D.box(ctx, -bw / 2 - 2, -bl / 2 - 2, bw + 4, bl + 4, 4, null, U.rgba(P.ok, 0.4 + 0.6 * a.pulse), 2);
          ctx.restore();
          if (a.res === 'ok' && a.pulse > 0) D.glow(ctx, L.bayCx, L.bayTop, 30 + 20 * (1 - a.pulse), P.ok, a.pulse);
        }
      }
      // side text block: backplane + verdict + wrapped reason
      var tx0 = L.tx, tw0 = L.bx + L.bw - 10 - tx0, ty0 = L.bayTop + 4;
      D.text(ctx, 'BACKPLANE', tx0, ty0, { size: m ? 8 : 8.5, weight: 700, color: P.text3, ls: 1 });
      D.text(ctx, bay.back, tx0, ty0 + 14, { size: m ? 9 : 10, weight: 600, color: P.text2, maxW: tw0 });
      if (a.res) {
        var ok = a.res === 'ok', col = ok ? P.ok : P.fault, ry = ty0 + (m ? 40 : 46);
        D.text(ctx, ok ? '✓ FITS' : '✕ WON’T FIT', tx0, ry, { size: m ? 12 : 14, weight: 800, color: col, ls: 1 });
        var lines = wrap(ctx, a.msg, tw0, m ? 9 : 10, 600);
        for (var li = 0; li < lines.length; li++) D.text(ctx, lines[li], tx0, ry + (m ? 17 : 20) + li * (m ? 12 : 14), { size: m ? 9 : 10, weight: 600, color: ok ? P.text2 : P.text1 });
      }

      // ---------- endurance strip
      this.drawEndurance(ctx);
      void self;
    },

    drawBay: function (ctx, bay) {
      var P = S.pal, L = this.L, s = L.s, m = this.mobile;
      var bw = bay.w * s, bl = bay.l * s;
      var top = Math.max(L.by + 34, Math.min(L.bayCy - bl / 2, L.by + L.bh - bl - 24));
      L.bayTop = top;
      var x = L.bayCx - bw / 2, isM2 = bay.id === 'bm2';
      var wall = isM2 ? 0 : 6;
      // backplane bar
      var bpW = Math.max(bw + 16, 40);
      D.box(ctx, L.bayCx - bpW / 2, top - 12, bpW, 9, 2, U.mix(P.pcb, P.bg, 0.2), U.rgba(P.blueprint, 0.5), 1);
      var conn = bay.id === 'b35' || bay.id === 'b25' ? 'SATA/SAS' : bay.id === 'bu2' ? 'NVMe · SFF-8639' : bay.id === 'bed' ? 'EDSFF' : 'M.2 M-key';
      D.box(ctx, L.bayCx - Math.min(bw * 0.5, 40) / 2, top - 6, Math.min(bw * 0.5, 40), 5, 1, P.plastic);
      void conn;
      if (isM2) {
        // M.2 slot: socket + dashed card outline + standoff positions
        ctx.save(); ctx.setLineDash([4, 3]);
        D.box(ctx, x, top, bw, bl, 2, U.rgba(P.blueprint, 0.06), U.rgba(P.blueprint, 0.6), 1);
        ctx.restore();
        [42, 60, 80].forEach(function (mm) {
          var yy = top + mm * s;
          D.circle(ctx, L.bayCx, yy, 3, mm === 80 ? P.gold : U.rgba(P.text3, 0.5));
          D.text(ctx, String(mm), L.bayCx - bw / 2 - 5, yy, { size: 8, color: P.text3, align: 'right' });
        });
      } else {
        // bay walls (U shape open at the bottom = front)
        ctx.fillStyle = U.shade(P.steel, P.dark ? -0.35 : 0.2);
        ctx.fillRect(x - wall, top - 3, wall, bl + 3);
        ctx.fillRect(x + bw, top - 3, wall, bl + 3);
        D.box(ctx, x, top, bw, bl, 1, U.rgba(P.bg0, 0.6), null);
        if (bay.id === 'b35') {
          // caddy rails
          ctx.fillStyle = U.rgba(P.plastic, 0.9); ctx.fillRect(x + 1, top, 4, bl); ctx.fillRect(x + bw - 5, top, 4, bl);
          D.box(ctx, x, top + bl - 10, bw, 10, 2, U.shade(P.plastic, 0.1), null);
        }
        D.line(ctx, x - wall, top + bl + 0.5, x - wall + 10, top + bl + 0.5, U.rgba(P.blueprint, 0.6), 1);
        
      }
      // width dimension
      D.dim(ctx, x, top + bl + 12, x + bw, top + bl + 12, (bay.w % 1 ? bay.w.toFixed(bay.w === 69.85 ? 0 : 1) : bay.w) + ' mm', { size: 8.5, bg: P.panel });
    },

    drawDrive: function (ctx, d, x, y, s, alpha) {
      var P = S.pal, w = d.w * s, l = d.l * s;
      ctx.save(); ctx.globalAlpha = alpha;
      if (d.id === '35') {
        D.box(ctx, x, y, w, l, 4, U.shade(P.alu, P.dark ? -0.35 : 0.05), U.rgba('#000', 0.3), 1);
        D.circle(ctx, x + w / 2, y + l * 0.42, w * 0.42, U.shade(P.alu, P.dark ? -0.25 : 0.12), U.rgba('#000', 0.15), 1);
        D.circle(ctx, x + w / 2, y + l * 0.42, w * 0.1, U.shade(P.alu, -0.1));
        D.box(ctx, x + w * 0.1, y + l * 0.72, w * 0.8, l * 0.22, 2, U.rgba(P.text1, P.dark ? 0.85 : 0.95), null);
        for (var i = 0; i < 4; i++) D.line(ctx, x + w * 0.16, y + l * (0.76 + i * 0.04), x + w * (0.5 + (i % 2) * 0.25), y + l * (0.76 + i * 0.04), U.rgba(P.bg, 0.5), 1);
        this.sata(ctx, x + w / 2, y, w);
      } else if (d.id === '25') {
        D.box(ctx, x, y, w, l, 3, U.shade(P.steel, P.dark ? -0.2 : 0.1), U.rgba('#000', 0.3), 1);
        D.box(ctx, x + w * 0.12, y + l * 0.3, w * 0.76, l * 0.5, 2, U.rgba(P.data, 0.25), U.rgba(P.data, 0.5), 1);
        D.text(ctx, 'SSD', x + w / 2, y + l * 0.55, { size: Math.max(7, w * 0.16), weight: 800, color: P.text1, align: 'center' });
        this.sata(ctx, x + w / 2, y, w);
      } else if (d.id === 'm2') {
        D.box(ctx, x, y, w, l, 1.5, P.pcb, U.rgba('#000', 0.3), 1);
        // gold fingers at top with M-key notch
        var fw = w / 12;
        ctx.fillStyle = P.gold;
        for (i = 0; i < 12; i++) if (i !== 8) ctx.fillRect(x + i * fw + fw * 0.2, y + 1, fw * 0.6, Math.max(3, 4 * s));
        ctx.fillStyle = P.bg; ctx.fillRect(x + 8 * fw, y - 1, fw, 6 * s);
        // chips
        D.box(ctx, x + w * 0.15, y + l * 0.12, w * 0.7, l * 0.14, 1, U.shade(P.silicon, 0.15));
        D.box(ctx, x + w * 0.15, y + l * 0.32, w * 0.7, l * 0.22, 1, P.silicon);
        D.box(ctx, x + w * 0.15, y + l * 0.6, w * 0.7, l * 0.22, 1, P.silicon);
        // screw notch at the far end
        ctx.beginPath(); ctx.arc(x + w / 2, y + l, Math.max(2, 2.5 * s), Math.PI, 0); ctx.fillStyle = P.bg; ctx.fill();
      } else if (d.id === 'u2') {
        D.box(ctx, x, y, w, l, 3, U.shade(P.alu, P.dark ? -0.3 : 0.08), U.rgba('#000', 0.3), 1);
        ctx.strokeStyle = U.rgba('#000', 0.22); ctx.lineWidth = 1; ctx.beginPath();
        for (var fy = y + l * 0.18; fy < y + l * 0.92; fy += Math.max(3, 4 * s)) { ctx.moveTo(x + w * 0.08, fy); ctx.lineTo(x + w * 0.92, fy); }
        ctx.stroke();
        D.pill(ctx, 'NVMe', x + w / 2, y + l * 0.55, { size: Math.max(7, w * 0.12), align: 'center', color: P.data, pad: 3 });
        // SFF-8639: wider connector with more segments
        ctx.fillStyle = P.plastic; ctx.fillRect(x + w * 0.1, y - 1, w * 0.8, Math.max(3, 3 * s));
        ctx.fillStyle = P.gold;
        for (i = 0; i < 10; i++) ctx.fillRect(x + w * 0.12 + i * w * 0.077, y, w * 0.04, Math.max(2, 2 * s));
      } else {
        D.box(ctx, x, y, w, l, 3, U.shade(P.steel, P.dark ? -0.15 : 0.12), U.rgba('#000', 0.3), 1);
        // heatsink fins (vertical)
        ctx.strokeStyle = U.rgba('#000', 0.2); ctx.beginPath();
        for (var fx = x + w * 0.1; fx < x + w * 0.9; fx += Math.max(3, 4 * s)) { ctx.moveTo(fx, y + l * 0.1); ctx.lineTo(fx, y + l * 0.78); }
        ctx.stroke();
        // latch handle at the front
        D.box(ctx, x + w * 0.1, y + l * 0.84, w * 0.8, l * 0.1, 2, P.accent, null);
        ctx.fillStyle = P.gold; ctx.fillRect(x + w * 0.25, y, w * 0.5, Math.max(2, 2.5 * s));
      }
      ctx.restore();
    },
    sata: function (ctx, cx, y, w) {
      var P = S.pal;
      ctx.fillStyle = P.plastic;
      ctx.fillRect(cx - w * 0.36, y - 1, w * 0.42, 4);
      ctx.fillRect(cx + w * 0.1, y - 1, w * 0.22, 4);
    },

    drawEndurance: function (ctx) {
      var P = S.pal, L = this.L, m = this.mobile;
      var x = L.pad, y = L.ey, w = this.w - L.pad * 2, h = L.eh;
      D.box(ctx, x, y, w, h, 10, U.rgba(P.panel, 0.55), U.rgba(P.blueprint, 0.25), 1);
      var cap = CAPS[this.ci], dw = DWPD[this.wi], tbw = this.tbw;
      D.text(ctx, 'SSD ENDURANCE', x + 12, y + 15, { size: m ? 8.5 : 10, weight: 800, color: P.text2, ls: 1 });
      var f = cap + ' TB × ' + dw + ' DWPD × 365 × 5 yr = ';
      if (m) {
        D.text(ctx, f, x + 12, y + 32, { size: 9, color: P.text3 });
        D.text(ctx, fmtTB(tbw), x + w - 12, y + 15, { size: 14, weight: 800, color: P.ok, align: 'right' });
      } else {
        var fx = x + 140;
        D.text(ctx, f, fx, y + 15, { size: 10, color: P.text3 });
        D.text(ctx, U.fmt(tbw) + ' TB  (' + fmtTB(tbw) + ')', fx + D.measure(ctx, f, 10, 500), y + 15, { size: 11, weight: 800, color: P.ok });
      }
      // log meter 100 TB → 200 PB
      var mx = x + 12, mw = w - 24, my = y + (m ? 64 : 46), mh = 10;
      var lo = Math.log10(40), hi = Math.log10(200000);
      function px(tb) { return mx + mw * U.clamp((Math.log10(tb) - lo) / (hi - lo), 0, 1); }
      D.box(ctx, mx, my, mw, mh, mh / 2, U.rgba(P.panel3, 0.9));
      D.box(ctx, mx, my, Math.max(mh, px(tbw) - mx), mh, mh / 2, P.ok);
      [[100, '100 TB'], [1000, '1 PB'], [10000, '10 PB'], [100000, '100 PB']].forEach(function (t) {
        var tx = px(t[0]);
        D.line(ctx, tx, my - 3, tx, my + mh + 3, U.rgba(P.text2, 0.5), 1);
        D.text(ctx, t[1], tx, my + mh + 11, { size: m ? 7.5 : 8.5, color: P.text3, align: 'center' });
      });
      // real-world markers: home server 50 GB/day, busy database 5 TB/day
      var marks = [[91, m ? 'home 50 GB/day' : 'home server · 50 GB/day', P.data], [9125, m ? 'DB 5 TB/day' : 'busy database · 5 TB/day', P.warn]];
      marks.forEach(function (mk, i) {
        var tx = px(mk[0]), ty = my - 4;
        D.poly(ctx, [tx, ty, tx - 4, ty - 6, tx + 4, ty - 6]); ctx.fillStyle = mk[2]; ctx.fill();
        if (!m || true) D.text(ctx, mk[1], tx + (i === 0 ? 0 : 0), ty - (m ? 12 : 13), { size: m ? 7.5 : 8.5, weight: 600, color: mk[2], align: i === 0 ? 'left' : 'center' });
      });
      if (!m) {
        var ok = tbw >= 9125 ? '✓ even a busy database' : tbw >= 91 ? '✓ plenty for a home server' : '';
        D.text(ctx, ok, x + w - 12, y + 15, { size: 9.5, weight: 600, color: tbw >= 9125 ? P.ok : P.text2, align: 'right' });
      }
    }
  });
})(window.SRV);
