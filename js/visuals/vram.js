/* Ch14 · Will the AI model fit? VRAM need = parameters × bytes-per-parameter × 1.2 (KV cache and
   working memory). Five real cards with code-drawn boards whose memory chips fill up; overflow spills
   and shows how many cards you'd need. Token speed ceiling ≈ memory bandwidth ÷ model size. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var SIZES = [1, 3, 8, 14, 32, 70, 120, 405];
  var CARDS = [
    { name: 'Intel Arc A380', short: 'Arc A380', gb: 6, bw: 186, chips: 3, lp: true },
    { name: 'NVIDIA L4', short: 'L4', gb: 24, bw: 300, chips: 6, lp: true },
    { name: 'NVIDIA L40S', short: 'L40S', gb: 48, bw: 864, chips: 12 },
    { name: 'RTX PRO 6000', short: 'RTX PRO 6000', gb: 96, bw: 1600, chips: 16 },
    { name: 'H200 NVL', short: 'H200 NVL', gb: 141, bw: 4800, chips: 6, hbm: true }
  ];
  var MULTS = [2, 4, 8];

  S.defineVisual('vram', {
    init: function () {
      this.ctx = this.layer();
      this.idx = 2; this.bits = 16;
      this.disp = this.need(); this.dispMax = this.axisMax(this.disp);
      var self = this;
      var g = this.ui.group('Model');
      this.sl = g.slider({ label: 'Model size', min: 0, max: SIZES.length - 1, step: 1, value: this.idx,
        fmt: function (v) { return SIZES[v] + ' B'; }, valueText: function (v) { return SIZES[v] + ' billion parameters'; },
        onInput: function (v) { self.idx = v; self.changed(); } });
      g.seg({ label: 'Precision', options: [[16, '16-bit'], [8, '8-bit'], [4, '4-bit']], value: 16, onChange: function (v) { self.bits = v; self.changed(); } });
      this.ui.spacer();
      this.rNeed = this.ui.readout('VRAM needed', '–');
      this.rCard = this.ui.readout('Smallest single card', '–');
      this.sync();
    },
    weights: function () { return SIZES[this.idx] * this.bits / 8; },
    need: function () { return this.weights() * 1.2; },
    axisMax: function (n) { return Math.max(160, n * 1.12); },
    fmtGB: function (g) { return g >= 100 ? U.fmt(g) + ' GB' : g >= 10 ? g.toFixed(1).replace(/\.0$/, '') + ' GB' : g.toFixed(1) + ' GB'; },
    changed: function () {
      var self = this, from = this.disp, fromMax = this.dispMax, to = this.need(), toMax = this.axisMax(to);
      if (this._tw) this._tw.cancel();
      this._tw = this.tween({ from: 0, to: 1, dur: 0.5, ease: 'outCubic', onUpdate: function (k) {
        self.disp = U.lerp(from, to, k); self.dispMax = U.lerp(fromMax, toMax, k);
      } });
      this.sync();
      var c = this.firstFit();
      this.announce(SIZES[this.idx] + ' billion parameters at ' + this.bits + '-bit needs about ' + this.fmtGB(to) + '. ' +
        (c ? 'Smallest single card that fits: ' + c.name + '.' : 'No single card fits; you need several.'));
    },
    firstFit: function () { var n = this.need(); for (var i = 0; i < CARDS.length; i++) if (CARDS[i].gb >= n) return CARDS[i]; return null; },
    sync: function () {
      var n = this.need(), c = this.firstFit();
      this.rNeed.set(this.fmtGB(n), n > 141 ? 'bad' : n > 24 ? 'warn' : 'ok');
      this.rCard.set(c ? c.short + ' · ' + c.gb + ' GB' : 'none — needs multiple', c ? 'ok' : 'bad');
    },
    plan: function (card) {
      var n = this.need(), w = this.weights();
      if (n <= card.gb) return { k: 1, fits: true, tps: card.bw / w };
      for (var i = 0; i < MULTS.length; i++) if (n <= card.gb * MULTS[i]) return { k: MULTS[i], fits: false, tps: card.bw * MULTS[i] / w };
      return { k: 0, fits: false, tps: 0 };
    },
    resize: function (w, h) { this.mobile = w < 560; },

    // ---------- card glyph: top-down board with die + memory chips that fill ----------
    drawCard: function (ctx, c, x, y, cw, ch, frac, plan) {
      var P = S.pal, i;
      var bw = c.lp ? cw * 0.62 : cw, bh = c.lp ? ch * 0.78 : ch;
      var bx = x + (cw - bw) / 2, by = y + (ch - bh);
      // stacked outlines for multi-card plans
      if (plan.k > 1) {
        var n = Math.min(plan.k - 1, 7), off = Math.min(6, (ch * 0.35) / n);
        for (i = n; i >= 1; i--) {
          ctx.globalAlpha = 0.85 - i * 0.07;
          D.box(ctx, bx + i * off, by - i * off, bw, bh, 4, U.rgba(P.panel, 0.9), P.blueprint, 1);
          ctx.globalAlpha = 1;
        }
        ctx.setLineDash([]);
      }
      // bracket
      D.box(ctx, bx - 5, by - 3, 6, bh + 6, 1, P.alu, U.shade(P.alu, -0.3), 1);
      // board
      var over = frac > 1 && plan.k !== 1;
      D.box(ctx, bx, by, bw, bh, 4, U.mix(P.pcb, P.bg, 0.15), over ? U.rgba(P.fault, 0.8) : U.rgba(P.blueprint, 0.45), over ? 1.5 : 1);
      // gold fingers
      ctx.fillStyle = P.gold;
      var fx0 = bx + bw * 0.18, fw = bw * 0.5;
      for (i = 0; i < 18; i++) ctx.fillRect(fx0 + i * fw / 18, by + bh - 1, fw / 18 - 1.2, 4);
      // die
      var ds = Math.min(bw, bh) * (c.hbm ? 0.34 : 0.3), dx = bx + bw / 2 - ds / 2, dy = by + bh / 2 - ds / 2 - bh * 0.04;
      D.box(ctx, dx - 3, dy - 3, ds + 6, ds + 6, 3, U.mix(P.pcb, P.alu, 0.25));
      D.box(ctx, dx, dy, ds, ds, 2, P.silicon, U.rgba(P.alu, 0.5), 1);
      D.text(ctx, 'GPU', dx + ds / 2, dy + ds / 2, { size: Math.max(7, ds * 0.22), weight: 700, color: P.text3, align: 'center' });
      // chips around die
      var chips = [], n2 = c.chips;
      if (c.hbm) {
        var hw = ds * 0.32, hh = ds * 0.46;
        for (i = 0; i < 6; i++) {
          var side = i < 3 ? -1 : 1, row = i % 3, rh = (ds + 6) / 3 - 2;
          chips.push({ x: side < 0 ? dx - 3 - hw - 4 : dx + ds + 3 + 4, y: dy - 3 + row * (rh + 2), w: hw, h: rh });
        }
      } else {
        var perSide = Math.ceil(n2 / 2), cwid = Math.min((bw * 0.86) / perSide - 4, bh * 0.2), chh = Math.min(bh * 0.2, cwid * 1.1);
        var span = perSide * (cwid + 4) - 4, sx = bx + bw / 2 - span / 2;
        for (i = 0; i < n2; i++) {
          var r2 = i < perSide ? 0 : 1, k2 = i % perSide;
          chips.push({ x: sx + k2 * (cwid + 4), y: r2 === 0 ? by + bh * 0.08 : by + bh * 0.92 - chh - 4, w: cwid, h: chh });
        }
      }
      var fillK = Math.min(1, frac) * chips.length;
      var fillC = frac > 1 ? P.fault : frac > 0.9 ? P.warn : P.data;
      chips.forEach(function (q, j) {
        D.box(ctx, q.x, q.y, q.w, q.h, 1.5, P.silicon, U.rgba(P.alu, 0.35), 1);
        var f = U.clamp(fillK - j, 0, 1);
        if (f > 0) { var fh = (q.h - 2) * f; D.box(ctx, q.x + 1, q.y + q.h - 1 - fh, q.w - 2, fh, 1, U.rgba(fillC, 0.9)); }
      });
      // overflow spill
      if (frac > 1) {
        var sp = Math.min(1, (frac - 1) / 2);
        ctx.fillStyle = D.hatch(ctx, U.rgba(P.fault, 0.75), 5);
        if (this.mobile) { var sw2 = 5 + 9 * sp; D.rr(ctx, bx + bw + 3, by + 2, sw2, bh - 4, 2); }
        else { var sh = 10 + 26 * sp; D.rr(ctx, bx + bw * 0.6, by - sh - 2, bw * 0.36, sh, 3); }
        ctx.fill(); ctx.strokeStyle = P.fault; ctx.lineWidth = 1; ctx.stroke();
      }
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, self = this, mob = this.mobile;
      D.clear(ctx, w, h);
      var pad = mob ? 14 : 28;
      var need = this.disp, mx = this.dispMax, wt = need / 1.2;
      // ---------- header ----------
      var hy = mob ? 24 : 32;
      D.text(ctx, SIZES[this.idx] + 'B model @ ' + this.bits + '-bit', pad, hy, { size: mob ? 15 : 19, weight: 800, color: P.text1 });
      D.text(ctx, SIZES[this.idx] + ' B params × ' + (this.bits / 8) + ' byte' + (this.bits === 8 ? '' : 's') + ' × 1.2 overhead', pad, hy + (mob ? 19 : 22), { size: mob ? 9.5 : 11, weight: 500, color: P.text2 });
      D.text(ctx, this.fmtGB(need), w - pad, hy + 2, { size: mob ? 20 : 26, weight: 800, color: need > 141 ? P.fault : P.data, align: 'right' });
      D.text(ctx, 'VRAM needed', w - pad, hy + (mob ? 21 : 25), { size: mob ? 9 : 10, weight: 600, color: P.text3, align: 'right' });
      // ---------- need bar on GB axis ----------
      var ax0 = pad, ax1 = w - pad, by = mob ? 92 : 110, bh = mob ? 16 : 20;
      var X = function (g) { return ax0 + (ax1 - ax0) * g / mx; };
      D.box(ctx, ax0, by, ax1 - ax0, bh, 4, U.rgba(P.panel3, 0.6));
      D.box(ctx, ax0, by, Math.max(2, X(wt) - ax0), bh, 4, P.data);
      ctx.fillStyle = D.hatch(ctx, U.rgba(P.data, 0.75), 5);
      D.rr(ctx, X(wt), by, Math.max(1, X(need) - X(wt)), bh, 2); ctx.fill();
      if (!mob || X(need) - ax0 > 140) {
        if (X(wt) - ax0 > 70) D.text(ctx, 'weights', ax0 + 8, by + bh / 2, { size: 9.5, weight: 700, color: P.bg });
      }
      D.text(ctx, '+20% KV cache', Math.min(X(need) + 6, ax1 - 70), by + bh + 11, { size: 9, color: P.text3, align: X(need) + 70 > ax1 ? 'right' : 'left' });
      // card ticks
      var lastX = -1e9;
      CARDS.forEach(function (c, i) {
        var x = X(c.gb), fits = c.gb >= need;
        D.line(ctx, x, by - 14, x, by + bh + 3, fits ? P.ok : U.rgba(P.text3, 0.8), 1.2, [3, 2]);
        if (x - lastX > (mob ? 30 : 46)) {
          D.text(ctx, c.gb + (mob ? '' : ' GB'), x, by - 22, { size: mob ? 8.5 : 9.5, weight: 700, color: fits ? P.ok : P.text3, align: 'center' });
          lastX = x;
        }
      });
      // axis scale
      D.text(ctx, '0', ax0, by + bh + 11, { size: 8.5, color: P.text3 });
      D.text(ctx, U.fmt(mx) + ' GB', ax1, by - 22, { size: 8.5, color: P.text3, align: 'right' });

      // ---------- cards ----------
      var top = by + bh + (mob ? 24 : 34);
      if (!mob) {
        var cellW = (w - pad * 2) / CARDS.length, glyphH = Math.min(cellW * 0.48, h - top - 120);
        CARDS.forEach(function (c, i) {
          var cx = pad + i * cellW, gx = cx + cellW * 0.12, gw = cellW * 0.76, gy = top + 16;
          var frac = need / c.gb, plan = self.plan(c);
          self.drawCard(ctx, c, gx, gy, gw, glyphH, frac, plan);
          self.cardText(ctx, c, plan, frac, cx + cellW / 2, gy + glyphH + 22, 'center');
        });
      } else {
        var rowH = (h - top - 6) / CARDS.length;
        CARDS.forEach(function (c, i) {
          var ry = top + i * rowH, gw = Math.min(110, w * 0.3), gh = Math.min(rowH - 24, gw * 0.48);
          var frac = need / c.gb, plan = self.plan(c);
          self.drawCard(ctx, c, pad + 4, ry + rowH - gh - 6, gw, gh, frac, plan);
          self.cardText(ctx, c, plan, frac, pad + gw + 30, ry + rowH / 2 - 14, 'left');
        });
      }
      var fc = this.firstFit();
      this.setDesc(SIZES[this.idx] + ' billion parameters at ' + this.bits + '-bit needs ' + this.fmtGB(this.need()) + ' of VRAM; ' +
        (fc ? 'smallest single card that fits is ' + fc.name + '.' : 'no single card is big enough.'));
    },
    cardText: function (ctx, c, plan, frac, x, y, align) {
      var P = S.pal, mob = this.mobile, lh = mob ? 13 : 15;
      D.text(ctx, c.name, x, y, { size: mob ? 11 : 12, weight: 700, color: P.text1, align: align });
      D.text(ctx, c.gb + ' GB · ' + U.fmt(c.bw) + ' GB/s', x, y + lh, { size: mob ? 9 : 10, color: P.text3, align: align });
      var st, col, glyph;
      if (plan.k === 1) { st = 'fits · ' + Math.round(c.gb - this.need()) + ' GB spare'; col = P.ok; glyph = 'check'; }
      else if (plan.k > 1) { st = 'needs ' + plan.k + ' cards'; col = P.warn; glyph = 'warn'; }
      else { st = 'too big even for 8'; col = P.fault; glyph = 'cross'; }
      var sy = y + lh * 2 + 2, size = mob ? 10 : 11;
      var tw = D.measure(ctx, st, size, 700), gx = align === 'center' ? x - tw / 2 - 9 : x + 6;
      D.g[glyph](ctx, gx, sy, 13, col);
      D.text(ctx, st, align === 'center' ? x + 9 : x + 16, sy, { size: size, weight: 700, color: col, align: align });
      if (plan.k) {
        var tps = plan.tps, ts = '≤ ' + (tps >= 100 ? U.fmt(tps) : tps >= 10 ? Math.round(tps) : tps.toFixed(1)) + ' tokens/s';
        D.text(ctx, ts, x, sy + lh + 1, { size: mob ? 9.5 : 10.5, weight: 600, color: P.text2, align: align });
      }
    }
  });
})(window.SRV);
