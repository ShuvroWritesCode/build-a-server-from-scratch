/* Ch10 · Power budget builder. A stacked bar of maximum watts (CPU, memory, drives, fans, NIC, GPU,
   board) read from and written back to SRV.build. Vertical lines: the PSU rating — which ONE supply must
   carry alone — and the recommended size (sum × 1.25). Readouts: yearly cost and heat in BTU/hr. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var TDPS = [65, 120, 250, 300, 400], GPUS = [0, 72, 350, 600], PSUS = [800, 1100, 1400, 2000];

  // mini glyphs (centred, size s)
  var GL = {
    cpu: function (c, x, y, s, col) {
      D.box(c, x - s * 0.32, y - s * 0.32, s * 0.64, s * 0.64, 2, null, col, 1.4);
      D.box(c, x - s * 0.16, y - s * 0.16, s * 0.32, s * 0.32, 1, col);
      c.strokeStyle = col; c.lineWidth = 1; c.beginPath();
      for (var i = -1; i <= 1; i++) { c.moveTo(x + i * s * 0.16, y - s * 0.32); c.lineTo(x + i * s * 0.16, y - s * 0.46); c.moveTo(x + i * s * 0.16, y + s * 0.32); c.lineTo(x + i * s * 0.16, y + s * 0.46); }
      c.stroke();
    },
    ram: function (c, x, y, s, col) {
      D.box(c, x - s * 0.48, y - s * 0.16, s * 0.96, s * 0.32, 1.5, null, col, 1.4);
      for (var i = 0; i < 4; i++) c.fillStyle = col, c.fillRect(x - s * 0.4 + i * s * 0.21, y - s * 0.08, s * 0.14, s * 0.16);
    },
    drv: function (c, x, y, s, col) { D.box(c, x - s * 0.3, y - s * 0.4, s * 0.6, s * 0.8, 2, null, col, 1.4); D.circle(c, x, y - s * 0.06, s * 0.18, null, col, 1.2); },
    fan: function (c, x, y, s, col) {
      D.circle(c, x, y, s * 0.42, null, col, 1.3);
      c.fillStyle = col;
      for (var i = 0; i < 3; i++) { var a = i * Math.PI * 2 / 3; c.beginPath(); c.ellipse(x + Math.cos(a) * s * 0.18, y + Math.sin(a) * s * 0.18, s * 0.17, s * 0.07, a, 0, Math.PI * 2); c.fill(); }
    },
    nic: function (c, x, y, s, col) { D.box(c, x - s * 0.45, y - s * 0.22, s * 0.9, s * 0.44, 1.5, null, col, 1.4); c.fillStyle = col; c.fillRect(x - s * 0.3, y - s * 0.08, s * 0.22, s * 0.16); c.fillRect(x + s * 0.06, y - s * 0.08, s * 0.22, s * 0.16); },
    gpu: function (c, x, y, s, col) { D.box(c, x - s * 0.5, y - s * 0.24, s, s * 0.48, 2, null, col, 1.4); D.circle(c, x - s * 0.22, y, s * 0.15, null, col, 1.2); D.circle(c, x + s * 0.22, y, s * 0.15, null, col, 1.2); },
    brd: function (c, x, y, s, col) { D.box(c, x - s * 0.42, y - s * 0.32, s * 0.84, s * 0.64, 1.5, null, col, 1.4); c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.moveTo(x - s * 0.3, y); c.lineTo(x, y); c.lineTo(x + s * 0.1, y - s * 0.15); c.lineTo(x + s * 0.3, y - s * 0.15); c.stroke(); }
  };

  function ensure(ctl, val, label) {
    var sel = ctl.el.querySelector('select'); if (!sel) return;
    for (var i = 0; i < sel.options.length; i++) if (+sel.options[i].value === +val) return;
    var op = document.createElement('option'); op.value = val; op.textContent = label;
    var at = null; for (i = 0; i < sel.options.length; i++) if (+sel.options[i].value > +val) { at = sel.options[i]; break; }
    sel.insertBefore(op, at);
  }

  S.defineVisual('budget', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.disp = null;
      var self = this, b = S.build.get();
      var tdpOpts = TDPS.slice(); if (tdpOpts.indexOf(b.cpuTdp) < 0) { tdpOpts.push(b.cpuTdp); tdpOpts.sort(function (x, y) { return x - y; }); }
      var g = this.ui.group('Parts');
      this.cTdp = g.select({ label: 'CPU', options: tdpOpts.map(function (v) { return [v, v + ' W']; }), value: b.cpuTdp, onChange: function (v) { S.build.set({ cpuTdp: +v }); } });
      this.cGpu = g.select({ label: 'GPU', options: GPUS.map(function (v) { return [v, v ? v + ' W' : 'none']; }), value: b.gpuW, onChange: function (v) { S.build.set({ gpuW: +v }); } });
      this.cPsu = g.select({ label: 'PSU (each)', options: PSUS.map(function (v) { return [v, U.fmt(v) + ' W']; }), value: b.psuW, onChange: function (v) { S.build.set({ psuW: +v }); } });
      this.ui.br();
      var g2 = this.ui.group('Counts');
      this.cDimm = g2.slider({ label: 'DIMMs', min: 0, max: 24, step: 1, value: b.dimms, fmt: function (v) { return v + ' × 10 W'; }, onInput: function (v) { S.build.set({ dimms: v }); } });
      this.cDrv = g2.slider({ label: 'Drives', min: 0, max: 24, step: 1, value: b.drives, fmt: function (v) { return v + ' × ' + S.build.get().driveW + ' W'; }, onInput: function (v) { S.build.set({ drives: v }); } });
      this.cFan = g2.slider({ label: 'Fans', min: 2, max: 10, step: 1, value: b.fans, fmt: function (v) { return v + ' × 15 W'; }, onInput: function (v) { S.build.set({ fans: v }); } });
      this.cRate = g2.slider({ label: '$/kWh', min: 0.05, max: 0.5, step: 0.01, value: b.rate, fmt: function (v) { return '$' + v.toFixed(2); }, onInput: function (v) { S.build.set({ rate: +v.toFixed(2) }); } });
      this.ui.br();
      this.rTot = this.ui.readout('Max draw', '–');
      this.rRec = this.ui.readout('Recommended PSU', '–');
      this.rCost = this.ui.readout('Per year', '–');
      this.rBtu = this.ui.readout('Heat', '–');
      this.unsub = S.build.subscribe(function (s) { return { a: s.cpuTdp, b: s.dimms, c: s.drives, d: s.fans, e: s.gpuW, f: s.psuW, g: s.rate, h: s.nicW, i: s.driveW }; }, function () { self.sync(true); });
      this.sync(false);
    },
    segs: function (b) {
      return [
        { k: 'cpu', name: 'CPU', w: b.cpuTdp, col: S.pal.power, sp: 6, cross: false },
        { k: 'gpu', name: 'GPU', w: b.gpuW, col: S.pal.heat, sp: 4, cross: false },
        { k: 'ram', name: 'Memory', w: b.dimms * 10, col: S.pal.data, sp: 5, cross: true },
        { k: 'drv', name: 'Drives', w: b.drives * b.driveW, col: S.pal.gold, sp: 7, cross: false },
        { k: 'fan', name: 'Fans', w: b.fans * 15, col: S.pal.air, sp: 4, cross: true },
        { k: 'nic', name: 'NIC', w: b.nicW, col: S.pal.net, sp: 6, cross: true },
        { k: 'brd', name: 'Board · BMC', w: 50, col: S.pal.alu, sp: 8, cross: false }
      ];
    },
    sync: function (fromStore) {
      var b = S.build.get(), self = this;
      if (fromStore) {
        ensure(this.cTdp, b.cpuTdp, b.cpuTdp + ' W'); ensure(this.cGpu, b.gpuW, b.gpuW ? b.gpuW + ' W' : 'none'); ensure(this.cPsu, b.psuW, U.fmt(b.psuW) + ' W');
        this.cTdp.set(b.cpuTdp); this.cGpu.set(b.gpuW); this.cPsu.set(b.psuW);
        this.cDimm.set(b.dimms); this.cDrv.set(b.drives); this.cFan.set(b.fans); this.cRate.set(b.rate);
      }
      var segs = this.segs(b), tgt = segs.map(function (s) { return s.w; });
      var prevPsu = this.dispPsu == null ? b.psuW : this.dispPsu;
      if (!this.disp) { this.disp = tgt.slice(); this.dispPsu = b.psuW; }
      else {
        var from = this.disp.slice();
        if (this._tw) this._tw.cancel();
        this._tw = this.tween({ from: 0, to: 1, dur: 0.5, onUpdate: function (v) {
          for (var i = 0; i < tgt.length; i++) self.disp[i] = U.lerp(from[i], tgt[i], v);
          self.dispPsu = U.lerp(prevPsu, b.psuW, v);
        } });
      }
      var tot = b.watts, rec = b.psuNeed;
      var cost = tot * 0.6 * 8.76 * b.rate;
      this.rTot.set(U.fmt(tot) + ' W', tot > b.psuW ? 'bad' : rec > b.psuW ? 'warn' : 'ok');
      this.rRec.set('≥ ' + U.fmt(rec) + ' W', rec > b.psuW ? 'warn' : 'ok');
      this.rCost.set('$' + U.fmt(cost) + ' / yr');
      this.rBtu.set(U.fmt(tot * 3.41) + ' BTU/hr');
      var d = this.describe();
      this.setDesc(d);
      if (fromStore) this.announce(d);
    },
    describe: function () {
      var b = S.build.get(), tot = b.watts;
      var st = tot > b.psuW ? 'too much for one ' + U.fmt(b.psuW) + ' W supply' : b.psuNeed > b.psuW ? 'fits one ' + U.fmt(b.psuW) + ' W supply but without the 25% headroom' : 'fits one ' + U.fmt(b.psuW) + ' W supply with headroom';
      return 'Maximum draw ' + U.fmt(tot) + ' W: ' + st + '. Recommended supply ' + U.fmt(b.psuNeed) + ' W. About $' + U.fmt(tot * 0.6 * 8.76 * b.rate) + ' a year and ' + U.fmt(tot * 3.41) + ' BTU per hour of heat.';
    },

    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      L.pad = m ? 12 : 22;
      L.bx = L.pad; L.bw = w - L.pad * 2;
      L.barY = m ? 132 : Math.round(h * 0.36);
      L.barH = m ? 42 : 48;
    },

    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, m = this.mobile, t = this.time;
      D.clear(ctx, w, h);
      var b = S.build.get(), segs = this.segs(b), disp = this.disp;
      var total = 0; for (var i = 0; i < disp.length; i++) total += disp[i];
      var psu = this.dispPsu, rec = Math.ceil(total * 1.25 / 50) * 50;
      var maxW = Math.max(psu, rec, total) * 1.12;
      var step = maxW > 2400 ? 500 : 250;
      maxW = Math.ceil(maxW / step) * step;
      var sx = L.bw / maxW, x0 = L.bx, by = L.barY, bh = L.barH;
      var over = total > psu + 0.5, tight = !over && rec > psu;

      // header
      D.text(ctx, 'POWER BUDGET · MAX DRAW', L.pad, m ? 16 : 20, { size: m ? 9 : 10.5, weight: 800, color: P.text3, ls: 1.2 });
      var big = U.fmt(total) + ' W';
      D.text(ctx, big, m ? L.pad : L.pad, m ? 40 : 50, { size: m ? 24 : 30, weight: 800, color: over ? P.fault : P.text1 });
      var stTxt = over ? '✕ Over one PSU by ' + U.fmt(total - psu) + ' W' : tight ? '⚠ Fits, but under 25% headroom' : '✓ Fits on ONE PSU with headroom';
      var stCol = over ? P.fault : tight ? P.warn : P.ok;
      var bw0 = D.measure(ctx, big, m ? 24 : 30, 800);
      if (m) D.text(ctx, stTxt, L.pad, 60, { size: 10, weight: 700, color: stCol });
      else D.text(ctx, stTxt, L.pad + bw0 + 16, 50, { size: 12, weight: 700, color: stCol });

      // axis grid
      for (var v = 0; v <= maxW + 1; v += step) {
        var gx = x0 + v * sx;
        D.line(ctx, gx, by - 6, gx, by + bh + 6, U.rgba(P.blueprint, v === 0 ? 0.5 : 0.14), 1);
        if (!m || v % (step * 2) === 0) D.text(ctx, U.fmt(v), gx, by + bh + 16, { size: m ? 8 : 9, color: P.text3, align: v === 0 ? 'left' : v + step > maxW ? 'right' : 'center' });
      }
      D.text(ctx, 'W', x0 + L.bw, by + bh + 28, { size: 8.5, color: P.text3, align: 'right' });

      // stacked bar
      D.box(ctx, x0, by, L.bw, bh, 6, U.rgba(P.panel3, 0.5));
      var cx = x0;
      ctx.save(); D.rr(ctx, x0, by, Math.max(1, total * sx), bh, 6); ctx.clip();
      for (i = 0; i < segs.length; i++) {
        var sw = disp[i] * sx; if (sw < 0.5) continue;
        var sg = segs[i];
        ctx.fillStyle = U.rgba(sg.col, P.dark ? 0.78 : 0.85); ctx.fillRect(cx, by, sw, bh);
        ctx.fillStyle = D.hatch(ctx, U.rgba('#000', P.dark ? 0.22 : 0.14), sg.sp, sg.cross); ctx.fillRect(cx, by, sw, bh);
        D.line(ctx, cx + sw, by, cx + sw, by + bh, P.bg, 1.5);
        if (sw > (m ? 26 : 30)) {
          var gs = Math.min(bh * 0.46, 18);
          ctx.fillStyle = U.rgba(P.bg, 0.55); ctx.beginPath(); ctx.arc(cx + sw / 2, by + bh * (m ? 0.5 : 0.38), gs * 0.72, 0, Math.PI * 2); ctx.fill();
          GL[sg.k](ctx, cx + sw / 2, by + bh * (m ? 0.5 : 0.38), gs, P.text1);
          if (!m && sw > 44) D.text(ctx, U.fmt(disp[i]), cx + sw / 2, by + bh * 0.8, { size: 9, weight: 800, color: P.dark ? '#0B1220' : '#0B1220', align: 'center' });
        }
        cx += sw;
      }
      ctx.restore();
      // marching power dashes along the top edge
      var tw = total * sx;
      if (tw > 4) {
        ctx.save(); ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 30;
        ctx.strokeStyle = U.rgba(P.power, 0.9); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0 + 3, by - 3); ctx.lineTo(x0 + tw - 3, by - 3); ctx.stroke(); ctx.restore();
      }
      // overflow hatch beyond the PSU line
      var px = x0 + psu * sx;
      if (over) {
        ctx.save(); ctx.beginPath(); ctx.rect(px, by - 2, tw - (px - x0) + 1, bh + 4); ctx.clip();
        ctx.fillStyle = U.rgba(P.fault, 0.35); ctx.fillRect(px, by - 2, tw, bh + 4);
        ctx.fillStyle = D.hatch(ctx, P.fault, 5, true); ctx.fillRect(px, by - 2, tw, bh + 4);
        ctx.restore();
        D.box(ctx, px, by - 2, x0 + tw - px, bh + 4, 2, null, P.fault, 1.5);
      }
      // recommended line (sum × 1.25)
      var rx = x0 + rec * sx;
      D.line(ctx, rx, by - 16, rx, by + bh + 6, P.accent, 1.5, [4, 4]);
      // PSU line — must fit on ONE PSU
      D.line(ctx, px, by - (m ? 34 : 46), px, by + bh + 8, over ? P.fault : P.power, 2.5);
      // labels above
      var lblY = by - (m ? 40 : 54);
      var psuLbl = 'ONE PSU · ' + U.fmt(Math.round(psu)) + ' W';
      var lw = D.measure(ctx, psuLbl, m ? 9.5 : 11, 800);
      var lx = U.clamp(px - lw / 2, L.pad, w - L.pad - lw);
      D.text(ctx, psuLbl, lx, lblY, { size: m ? 9.5 : 11, weight: 800, color: over ? P.fault : P.power });
      if (!m) D.text(ctx, 'must carry everything alone', U.clamp(px - 80, L.pad, w - L.pad - 160), lblY + 15, { size: 9.5, color: P.text2 });
      var recLbl = '×1.25 → ' + U.fmt(rec) + ' W';
      var rlw = D.measure(ctx, recLbl, m ? 8.5 : 9.5, 700);
      var rlx = rx + 6; if (rlx + rlw > w - L.pad) rlx = rx - 6 - rlw;
      D.text(ctx, recLbl, U.clamp(rlx, L.pad, w - L.pad - rlw), by - 12, { size: m ? 8.5 : 9.5, weight: 700, color: P.accent });

      // PSU A / B diagram
      // legend
      var ly = by + bh + (m ? 36 : 44), cols = m ? 2 : 4, colW = L.bw / cols, rowH = m ? 20 : 22;
      for (i = 0; i < segs.length; i++) {
        var col = i % cols, row = (i / cols) | 0, lx2 = L.bx + col * colW, ly2 = ly + row * rowH;
        var sg2 = segs[i];
        D.box(ctx, lx2, ly2 - 6, 12, 12, 2, U.rgba(sg2.col, 0.85));
        ctx.fillStyle = D.hatch(ctx, U.rgba('#000', 0.25), sg2.sp, sg2.cross); D.rr(ctx, lx2, ly2 - 6, 12, 12, 2); ctx.fill();
        D.text(ctx, sg2.name, lx2 + 18, ly2, { size: m ? 9 : 10, weight: 600, color: P.text2 });
        D.text(ctx, U.fmt(sg2.w) + ' W', lx2 + colW - 12, ly2, { size: m ? 9 : 10, weight: 700, color: sg2.w ? P.text1 : P.text3, align: 'right' });
      }
      // stat tiles
      var tH0 = m ? 62 : 66, ty = Math.max(ly + Math.ceil(segs.length / cols) * rowH + 6, h - tH0 - (m ? 10 : 16));
      var cost = total * 0.6 * 8.76 * b.rate;
      var dx = L.pad, dy = ty - (m ? 22 : 24);
      this.psuGlyph(ctx, dx, dy, 'A', 'carries it all', over ? P.fault : P.power, true);
      this.psuGlyph(ctx, dx + (m ? 128 : 120), dy, 'B', 'spare', P.text3, false);
      D.text(ctx, '2 × ' + U.fmt(b.psuW) + ' W ≠ ' + U.fmt(2 * b.psuW) + ' W', m ? dx + 210 : dx + 196, dy, { size: 9, color: P.text3 });

      var tiles = [
        ['RECOMMENDED PSU', '≥ ' + U.fmt(rec) + ' W', 'sum × 1.25', rec > b.psuW ? P.warn : P.ok],
        ['PER YEAR', '$' + U.fmt(cost), '60% avg × 8.76 × $' + b.rate.toFixed(2), P.text1],
        ['HEAT', U.fmt(total * 3.41) + ' BTU/hr', 'W × 3.41', P.heat]
      ];
      var tc = m ? 3 : 3, tgap = 8, tW = (L.bw - tgap * (tc - 1)) / tc, tH = Math.min(h - ty - 8, tH0);
      if (tH > 34) for (i = 0; i < tiles.length; i++) {
        var tx = L.bx + i * (tW + tgap);
        D.box(ctx, tx, ty, tW, tH, 8, U.rgba(P.panel, 0.6), U.rgba(P.blueprint, 0.22), 1);
        D.text(ctx, tiles[i][0], tx + 10, ty + 13, { size: m ? 7.5 : 9, weight: 700, color: P.text3, ls: 0.8, maxW: tW - 16 });
        D.text(ctx, tiles[i][1], tx + 10, ty + tH * 0.52, { size: m ? 12 : 17, weight: 800, color: tiles[i][3], maxW: tW - 16 });
        if (tH > 48) D.text(ctx, tiles[i][2], tx + 10, ty + tH - 11, { size: m ? 7.5 : 9, color: P.text3, maxW: tW - 16 });
      }
    },
    psuGlyph: function (ctx, x, y, name, sub, col, active) {
      var P = S.pal;
      D.box(ctx, x, y - 12, 26, 24, 3, U.rgba(col, active ? 0.18 : 0.06), col, 1.3);
      D.circle(ctx, x + 13, y, 7, null, U.rgba(col, 0.8), 1);
      D.text(ctx, name, x + 13, y + 0.5, { size: 9, weight: 800, color: col, align: 'center' });
      D.text(ctx, sub, x + 31, y, { size: 9, weight: 600, color: active ? P.text1 : P.text3 });
    }
  });
})(window.SRV);
