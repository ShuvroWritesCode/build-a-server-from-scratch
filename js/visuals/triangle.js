/* Ch3 · The tradeoff triangle. Drag a lime puck between Cost · Convenience · Control; the nearest
   buying option lights up and a code-drawn front bezel + BMC name chip swaps beside it. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  // u,v are normalised inside the triangle's bounding box: top=(.5,0), bottom-left=(0,1), bottom-right=(1,1)
  var OPTS = [
    { id: 'dell', short: 'Dell', name: 'Dell PowerEdge', kind: 'Brand-name · new', u: 0.40, v: 0.33, side: 'l', bmc: 'iDRAC', style: 'hex', units: 2,
      line: 'Phone support, next-day parts. Some features need a licence.', r: [1, 3, 1] },
    { id: 'hpe', short: 'HPE', name: 'HPE ProLiant', kind: 'Brand-name · new', u: 0.60, v: 0.33, side: 'r', bmc: 'iLO', style: 'slots', units: 2,
      line: 'Phone support, next-day parts. Some features need a licence.', r: [1, 3, 1] },
    { id: 'lenovo', short: 'Lenovo', name: 'Lenovo ThinkSystem', kind: 'Brand-name · new', u: 0.50, v: 0.47, side: 'b', bmc: 'XClarity', style: 'dots', units: 2,
      line: 'Phone support, next-day parts. Some features need a licence.', r: [1, 3, 1] },
    { id: 'smc', short: 'Supermicro', name: 'Supermicro barebones', kind: 'Barebones', u: 0.70, v: 0.68, side: 'r', bmc: 'IPMI', style: 'bare', units: 2,
      line: 'Case, board and power supplies included. You add CPU, RAM, drives.', r: [2, 2, 2] },
    { id: 'diy', short: 'DIY', name: 'DIY whitebox', kind: 'Build it yourself', u: 0.78, v: 0.88, side: 'a', bmc: 'none', style: 'diy', units: 4,
      line: 'Every part is your choice — and you are the warranty department.', r: [2, 1, 3] },
    { id: 'refurb', short: 'Refurb', name: 'Refurbished off-lease', kind: 'Used · 3–6 years old', u: 0.22, v: 0.88, side: 'a', bmc: 'iDRAC / iLO', style: 'refurb', units: 2,
      line: 'Very cheap to buy. Older, louder, hungrier for electricity.', r: [3, 1, 1] }
  ];
  var BYID = {}; OPTS.forEach(function (o) { BYID[o.id] = o; });

  S.defineVisual('triangle', {
    init: function () {
      this.ctx = this.layer();
      this.puck = { u: 0.5, v: 0.64 };
      this.near = this.nearest().id; this.prev = null; this.fade = 1;
      this.hoverPuck = false;
      var self = this;
      this.seg = this.ui.seg({
        label: 'Jump to', options: OPTS.map(function (o) { return [o.id, o.short]; }), value: this.near,
        onChange: function (id) { self.jump(id); }
      });
      this.pointer({
        down: function (p) {
          var T = this.T;
          var pp = this.toPx(this.puck.u, this.puck.v);
          if (U.dist(p.x, p.y, pp[0], pp[1]) < 26 || this.inside(p.x, p.y)) { this.dragTo(p.x, p.y); return true; }
          return false;
        },
        move: function (p) { this.dragTo(p.x, p.y); },
        up: function () { var o = BYID[this.near]; this.announce('Nearest option: ' + o.name + '. ' + o.line); },
        hover: function (p) {
          var pp = this.toPx(this.puck.u, this.puck.v), on = U.dist(p.x, p.y, pp[0], pp[1]) < 26;
          if (on !== this.hoverPuck) { this.hoverPuck = on; this.invalidate(); }
          this.stage.style.cursor = on ? 'grab' : this.inside(p.x, p.y) ? 'pointer' : '';
        }
      });
    },
    toPx: function (u, v) { var T = this.T; return [T.x + u * T.w, T.y + v * T.h]; },
    inside: function (x, y) { var T = this.T, v = (y - T.y) / T.h, u = (x - T.x) / T.w; return v >= 0 && v <= 1 && Math.abs(u - 0.5) <= v / 2; },
    clampUV: function (u, v) {
      // keep inside the triangle (slightly inset)
      v = U.clamp(v, 0.04, 0.97);
      var half = v / 2 - 0.02;
      u = U.clamp(u, 0.5 - half, 0.5 + half);
      return { u: u, v: v };
    },
    dragTo: function (x, y) {
      var T = this.T, c = this.clampUV((x - T.x) / T.w, (y - T.y) / T.h);
      this.puck.u = c.u; this.puck.v = c.v; this._moved = true;
      if (this.pt) { this.pt.cancel(); this.pt = null; }
      this.refresh(false);
    },
    jump: function (id) {
      var o = BYID[id], self = this, fu = this.puck.u, fv = this.puck.v;
      this._moved = true;
      if (this.pt) this.pt.cancel();
      this.pt = this.tween({ from: 0, to: 1, dur: 0.6, ease: 'settle', onUpdate: function (k) {
        self.puck.u = U.lerp(fu, o.u, k); self.puck.v = U.lerp(fv, o.v + 0.0001, k); self.refresh(false);
      } });
      this.announce(o.name + ': ' + o.line + ' Remote management: ' + o.bmc + '.');
    },
    nearest: function () {
      var best = null, bd = 1e9, p = this.puck;
      OPTS.forEach(function (o) { var d = U.dist(p.u, p.v * 0.866, o.u, o.v * 0.866); if (d < bd) { bd = d; best = o; } });
      return best;
    },
    weights: function () {
      // barycentric weights of the puck: [cost, convenience, control]
      var u = this.puck.u, v = this.puck.v;
      var conv = 1 - v, ctrl = u - 0.5 + v / 2, cost = 1 - conv - ctrl;
      return [U.clamp(cost, 0, 1), U.clamp(conv, 0, 1), U.clamp(ctrl, 0, 1)];
    },
    refresh: function (silent) {
      var n = this.nearest().id;
      if (n !== this.near) {
        this.prev = this.near; this.near = n; this.seg.set(n, false);
        var self = this; this.fade = 0;
        if (this.ft) this.ft.cancel();
        this.ft = this.tween({ from: 0, to: 1, dur: 0.45, ease: 'outCubic', onUpdate: function (v) { self.fade = v; } });
      }
      this.invalidate();
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      var triW, triH, tx, ty;
      if (this.mobile) {
        triH = Math.min(h * 0.34, (w - 120) * 0.866); triW = triH / 0.866;
        tx = (w - triW) / 2; ty = 48;
        this.panel = { x: 16, y: ty + triH + 60, w: w - 32, h: h - (ty + triH + 60) - 8 };
      } else {
        var aw = w * 0.55;
        triH = Math.min(h - 110, (aw - 110) * 0.866); triW = triH / 0.866;
        tx = 60 + (aw - 110 - triW) / 2; ty = (h - triH) / 2 + 4;
        this.panel = { x: aw + 10, y: 30, w: w - aw - 40, h: h - 60 };
      }
      this.T = { x: tx, y: ty, w: triW, h: triH };
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, T = this.T, self = this, mob = this.mobile;
      D.clear(ctx, w, h);
      var A = [T.x + T.w / 2, T.y], B = [T.x, T.y + T.h], C = [T.x + T.w, T.y + T.h];

      // triangle body + barycentric grid
      D.poly(ctx, [A[0], A[1], B[0], B[1], C[0], C[1]]);
      ctx.fillStyle = U.rgba(P.blueprint, 0.06); ctx.fill();
      ctx.save(); D.poly(ctx, [A[0], A[1], B[0], B[1], C[0], C[1]]); ctx.clip();
      ctx.setLineDash([2, 4]); ctx.strokeStyle = U.rgba(P.blueprint, 0.25); ctx.lineWidth = 1;
      for (var i = 1; i < 5; i++) {
        var k = i / 5;
        ctx.beginPath(); ctx.moveTo(T.x, T.y + T.h * k); ctx.lineTo(T.x + T.w, T.y + T.h * k); ctx.stroke(); // ∥ base
        ctx.beginPath(); ctx.moveTo(B[0] + (C[0] - B[0]) * k, B[1]); ctx.lineTo(B[0] + (C[0] - B[0]) * k + (A[0] - C[0]), B[1] + (A[1] - C[1])); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(B[0] + (C[0] - B[0]) * k, B[1]); ctx.lineTo(B[0] + (C[0] - B[0]) * k + (A[0] - B[0]), B[1] + (A[1] - B[1])); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.restore();
      D.poly(ctx, [A[0], A[1], B[0], B[1], C[0], C[1]]);
      ctx.strokeStyle = P.blueprint; ctx.lineWidth = 1.5; ctx.stroke();

      // corners
      var wt = this.weights();
      var corners = [
        { p: B, t: 'COST', s: 'cheap to buy', dx: -6, dy: 20, al: 'left', wi: 0, col: P.ok },
        { p: A, t: 'CONVENIENCE', s: 'support · warranty', dx: 0, dy: -34, al: 'center', wi: 1, col: P.mgmt },
        { p: C, t: 'CONTROL', s: 'choose every part', dx: 6, dy: 20, al: 'right', wi: 2, col: P.net }
      ];
      corners.forEach(function (c) {
        D.circle(ctx, c.p[0], c.p[1], 4 + 4 * wt[c.wi], c.col);
        D.circle(ctx, c.p[0], c.p[1], 10 + 6 * wt[c.wi], null, U.rgba(c.col, 0.35), 1);
        var x = c.p[0] + c.dx, y = c.p[1] + c.dy;
        if (c.al === 'left') x = Math.max(8, x - 30); if (c.al === 'right') x = Math.min(w - 8, x + 30);
        D.text(ctx, c.t, x, y, { size: mob ? 10 : 11, weight: 700, color: P.text1, align: c.al, ls: 1.5 });
        D.text(ctx, c.s, x, y + 14, { size: mob ? 9 : 10, color: P.text3, align: c.al });
      });

      // markers
      var pp = this.toPx(this.puck.u, this.puck.v), near = this.near;
      var nO = BYID[near], np = this.toPx(nO.u, nO.v);
      ctx.setLineDash([3, 4]); D.line(ctx, pp[0], pp[1], np[0], np[1], U.rgba(P.accent, 0.7), 1.2); ctx.setLineDash([]);
      OPTS.forEach(function (o) {
        var q = self.toPx(o.u, o.v), d = U.dist(pp[0], pp[1], q[0], q[1]);
        var inf = U.clamp(1 - d / (T.w * 0.6), 0, 1), on = o.id === near;
        var col = on ? P.accent : U.mix(P.text3, P.text1, inf);
        D.circle(ctx, q[0], q[1], on ? 7 : 5, on ? U.rgba(P.accent, 0.25) : P.bg, col, on ? 2 : 1.4);
        if (on) {
          D.circle(ctx, q[0] + 9, q[1] - 9, 7, P.ok);
          D.g.check(ctx, q[0] + 9, q[1] - 9, 11, P.bg);
        }
        var lbl = mob ? o.short : o.name.split(' ')[0] + (o.id === 'smc' ? ' barebones' : o.id === 'diy' ? ' whitebox' : o.id === 'refurb' ? ' off-lease' : ' ' + o.name.split(' ')[1]);
        var lx = q[0], ly = q[1], al = 'center';
        if (o.side === 'l') { lx -= 12; al = 'right'; } else if (o.side === 'r') { lx += on ? 20 : 12; al = 'left'; } else if (o.side === 'a') { ly -= 15; } else { ly += 17; }
        if (o.side === 'l' && on && o.id !== 'diy') lx -= 0;
        D.text(ctx, lbl, lx, ly, { size: mob ? 9.5 : 10.5, weight: on ? 700 : 500, color: on ? P.text1 : U.mix(P.text3, P.text2, inf), align: al });
      });

      // puck
      var pr = mob ? 10 : 11;
      D.glow(ctx, pp[0], pp[1], 34, P.accent, 0.45);
      D.circle(ctx, pp[0], pp[1], pr, P.accent, U.shade(P.accent, -0.4), 1.5);
      D.circle(ctx, pp[0], pp[1], 3, U.shade(P.accent, -0.6));
      if (this.hoverPuck) { ctx.setLineDash([3, 3]); D.circle(ctx, pp[0], pp[1], pr + 6, null, P.accent, 1); ctx.setLineDash([]); }
      if (!this._moved) D.text(ctx, 'drag me', pp[0], pp[1] + pr + 12, { size: 9, weight: 700, color: P.accent, align: 'center', ls: 1 });
      this.hits.clear();

      this.drawPanel(ctx, wt);
      this.setDesc('Puck nearest ' + nO.name + ' (' + nO.kind + '). Mix: cost ' + Math.round(wt[0] * 100) + '%, convenience ' + Math.round(wt[1] * 100) + '%, control ' + Math.round(wt[2] * 100) + '%. Remote management: ' + nO.bmc + '.');
    },

    drawPanel: function (ctx, wt) {
      var P = S.pal, R = this.panel, mob = this.mobile, o = BYID[this.near], f = this.fade;
      var bw = Math.min(R.w, mob ? (R.h - 122) * 482.6 / 177.8 : 440);
      var maxBh = bw * 177.8 / 482.6; // room for a 4U
      var bx = R.x + (R.w - bw) / 2, by = mob ? R.y + 4 : Math.max(R.y + 20, R.y + (R.h - maxBh - 170) / 2);
      var slot = { x: bx, y: by, w: bw, h: maxBh };
      if (this.prev && f < 1) this.bezel(ctx, BYID[this.prev], slot, 1 - f, -12 * f);
      this.bezel(ctx, o, slot, f, 12 * (1 - f));

      var y = by + maxBh + (mob ? 34 : 46);
      bx = R.x + (R.w - Math.max(bw, mob ? R.w : 0)) / 2; bw = Math.max(bw, mob ? R.w : 0);
      ctx.globalAlpha = 0.3 + 0.7 * f;
      D.text(ctx, o.name, bx, y, { size: mob ? 15 : 18, weight: 700, color: P.text1, sans: true });
      D.text(ctx, o.kind.toUpperCase(), bx + bw, y, { size: 9, weight: 700, color: P.text3, align: 'right', ls: 1 });
      y += mob ? 18 : 22;
      D.text(ctx, o.line, bx, y, { size: mob ? 11 : 12.5, color: P.text2, sans: true, maxW: bw });
      ctx.globalAlpha = 1;
      // ratings vs your mix
      y += mob ? 20 : 30;
      var names = ['Cost', 'Support', 'Control'], cols = [P.ok, P.mgmt, P.net], colW = bw / 3;
      for (var i = 0; i < 3; i++) {
        var cx = bx + i * colW;
        D.text(ctx, names[i].toUpperCase(), cx, y, { size: 9, weight: 700, color: P.text3, ls: 1 });
        for (var d = 0; d < 3; d++) D.circle(ctx, cx + 6 + d * 13, y + 16, 4.5, d < o.r[i] ? cols[i] : null, d < o.r[i] ? null : U.rgba(P.text3, 0.6), 1);
        if (!mob || true) {
          D.meter(ctx, cx, y + 32, colW - 16, 4, wt[i], U.rgba(P.accent, 0.85));
        }
      }
      D.text(ctx, '● option   ▬ your puck', bx, y + 48, { size: 9, color: P.text3 });
    },

    /** code-drawn front bezel, to scale (482.6 mm wide) */
    bezel: function (ctx, o, slot, alpha, dx) {
      if (alpha <= 0.01) return;
      var P = S.pal, u = o.units, k = slot.w / 482.6, H = u * 44.45 * k, W = slot.w;
      var x = slot.x + dx, y = slot.y + (slot.h - H) / 2;
      if (u === 2) y = slot.y + slot.h - H - 6;
      ctx.save(); ctx.globalAlpha = alpha;
      var ear = 18 * k, fx = x + ear, fw = W - ear * 2;
      var steel = P.steel, dark = U.shade(P.steel, -0.35), light = U.shade(P.steel, P.dark ? 0.2 : 0.25);
      // ears
      D.box(ctx, x, y, ear + 2, H, 2, dark, U.shade(steel, -0.5), 1);
      D.box(ctx, x + W - ear - 2, y, ear + 2, H, 2, dark, U.shade(steel, -0.5), 1);
      for (var e = 0; e < u; e++) {
        D.circle(ctx, x + ear / 2, y + (e + 0.5) * 44.45 * k, Math.max(1.5, 2.6 * k * 2), P.bg);
        D.circle(ctx, x + W - ear / 2, y + (e + 0.5) * 44.45 * k, Math.max(1.5, 2.6 * k * 2), P.bg);
      }
      // body
      D.box(ctx, fx, y, fw, H, 3, steel, U.shade(steel, -0.5), 1);
      var st = o.style, t = this.time || 0, i, j;
      if (st === 'hex' || st === 'refurb') {
        // drive bays behind (8 × 2.5" on the refurb, bezel removed)
        if (st === 'refurb') {
          var n = 8, bw = fw * 0.62 / n;
          for (i = 0; i < n; i++) {
            var empty = i === 5 || i === 6, bxx = fx + fw * 0.2 + i * bw;
            D.box(ctx, bxx + 1, y + 4, bw - 2, H - 8, 1, empty ? P.bg0 : U.shade(P.plastic, -0.1), U.rgba('#000', 0.4), 1);
            if (!empty) { ctx.fillStyle = U.rgba(P.alu, 0.5); ctx.fillRect(bxx + bw * 0.3, y + H * 0.55, bw * 0.4, H * 0.3); D.circle(ctx, bxx + bw / 2, y + 9, 1.6, P.ok); }
          }
          // asset sticker + scuffs
          ctx.save(); ctx.translate(fx + fw * 0.09, y + H * 0.5); ctx.rotate(-0.08);
          D.box(ctx, -fw * 0.07, -H * 0.22, fw * 0.14, H * 0.44, 2, P.warn);
          D.text(ctx, 'OFF-LEASE', 0, -H * 0.06, { size: Math.max(5, Math.min(fw * 0.022, H * 0.2)), weight: 800, color: P.bg0, align: 'center' });
          ctx.fillStyle = P.bg0; for (i = 0; i < 9; i++) ctx.fillRect(-fw * 0.05 + i * fw * 0.011, H * 0.06, fw * 0.006 * (1 + (i % 3)), H * 0.1);
          ctx.restore();
          ctx.strokeStyle = U.rgba(P.alu, 0.35); ctx.lineWidth = 1;
          [[0.86, 0.2, 0.93, 0.35], [0.88, 0.6, 0.95, 0.52], [0.15, 0.85, 0.2, 0.7]].forEach(function (s) { ctx.beginPath(); ctx.moveTo(fx + fw * s[0], y + H * s[1]); ctx.lineTo(fx + fw * s[2], y + H * s[3]); ctx.stroke(); });
        } else {
          // honeycomb grille bezel
          ctx.save(); D.rr(ctx, fx + fw * 0.06, y + 4, fw * 0.88, H - 8, 3); ctx.clip();
          ctx.fillStyle = U.rgba('#000', 0.45);
          var r = Math.max(2.4, 5 * k * 1.4), hx = r * 1.8, hy = r * 1.56;
          for (j = 0; j * hy < H; j++) for (i = 0; i * hx < fw; i++) {
            var cx = fx + fw * 0.06 + i * hx + (j % 2 ? hx / 2 : 0), cy = y + 6 + j * hy;
            ctx.beginPath(); for (var a = 0; a < 6; a++) { var an = Math.PI / 6 + a * Math.PI / 3; ctx.lineTo(cx + Math.cos(an) * r * 0.8, cy + Math.sin(an) * r * 0.8); } ctx.closePath(); ctx.fill();
          }
          ctx.restore();
          D.box(ctx, fx + fw * 0.42, y + H * 0.36, fw * 0.16, H * 0.28, 3, light, U.rgba(P.blueprint, 0.6), 1);
          ctx.fillStyle = P.blueprint; ctx.fillRect(fx + fw * 0.06, y + H - 6, fw * 0.88, 1.5);
        }
      } else if (st === 'slots') {
        ctx.fillStyle = U.rgba('#000', 0.45);
        var rows = Math.max(4, Math.round(H / 7));
        for (j = 0; j < rows; j++) {
          var yy = y + 6 + j * (H - 12) / rows;
          ctx.fillRect(fx + fw * 0.08, yy, fw * 0.36, Math.max(1.5, (H - 12) / rows * 0.45));
          ctx.fillRect(fx + fw * 0.56, yy, fw * 0.36, Math.max(1.5, (H - 12) / rows * 0.45));
        }
        D.box(ctx, fx + fw * 0.46, y + 5, fw * 0.08, H - 10, 2, light);
        ctx.fillStyle = P.ok; ctx.fillRect(fx + fw * 0.47, y + 8, fw * 0.06, 2.5);
        // lever handles on the ears
        [x + ear * 0.25, x + W - ear * 0.75].forEach(function (hx2) { D.box(ctx, hx2, y + H * 0.15, ear * 0.5, H * 0.7, 2, null, P.alu, 1.4); });
      } else if (st === 'dots') {
        ctx.fillStyle = U.rgba('#000', 0.45);
        var sp = Math.max(4, 7 * k * 1.6);
        for (j = 0; y + 7 + j * sp < y + H - 5; j++) for (i = 0; fx + fw * 0.05 + i * sp < fx + fw * 0.82; i++) { D.circle(ctx, fx + fw * 0.05 + i * sp + (j % 2) * sp / 2, y + 7 + j * sp, sp * 0.28, U.rgba('#000', 0.45)); }
        // angled accent panel on the right
        D.poly(ctx, [fx + fw * 0.85, y + 3, fx + fw - 3, y + 3, fx + fw - 3, y + H - 3, fx + fw * 0.82, y + H - 3]); ctx.fillStyle = dark; ctx.fill();
        ctx.fillStyle = P.fault; ctx.fillRect(fx + fw * 0.87, y + H * 0.45, fw * 0.08, 2.5);
      } else if (st === 'bare') {
        // 12 × 3.5" trays, 4 across × 3 rows
        var tw = fw / 4, th = (H - 4) / 3;
        for (j = 0; j < 3; j++) for (i = 0; i < 4; i++) {
          var tx = fx + i * tw, ty = y + 2 + j * th;
          D.box(ctx, tx + 1.5, ty + 1, tw - 3, th - 2, 1.5, U.shade(P.plastic, 0.05), U.rgba('#000', 0.5), 1);
          ctx.fillStyle = U.rgba('#000', 0.4); for (var s2 = 0; s2 < 7; s2++) ctx.fillRect(tx + 6 + s2 * tw * 0.06, ty + 3, tw * 0.03, th - 6);
          D.box(ctx, tx + tw * 0.62, ty + th * 0.25, tw * 0.28, th * 0.5, 1, U.shade(P.alu, -0.2));
          D.led(ctx, tx + tw - 6, ty + th / 2, P.ok, 'solid', t, 1.4);
        }
        [x + ear * 0.25, x + W - ear * 0.75].forEach(function (hx2) { D.box(ctx, hx2, y + H * 0.2, ear * 0.5, H * 0.6, ear * 0.25, null, P.alu, 1.4); });
      } else if (st === 'diy') {
        // generic 4U case: two 5.25" covers, square mesh, round power button, USB
        var bayH = H * 0.16;
        for (i = 0; i < 2; i++) D.box(ctx, fx + fw * 0.06, y + H * 0.1 + i * (bayH + 4), fw * 0.3, bayH, 2, light, U.rgba('#000', 0.4), 1);
        ctx.save(); D.rr(ctx, fx + fw * 0.44, y + H * 0.1, fw * 0.5, H * 0.8, 3); ctx.clip();
        ctx.strokeStyle = U.rgba('#000', 0.45); ctx.lineWidth = 1;
        var m = Math.max(3, 5 * k * 1.6);
        for (var gx = fx + fw * 0.44; gx < fx + fw * 0.94; gx += m) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + H); ctx.stroke(); }
        for (var gy = y + H * 0.1; gy < y + H * 0.9; gy += m) { ctx.beginPath(); ctx.moveTo(fx, gy); ctx.lineTo(fx + fw, gy); ctx.stroke(); }
        ctx.restore();
        D.circle(ctx, fx + fw * 0.12, y + H * 0.72, Math.max(4, H * 0.07), dark, P.alu, 1.2);
        D.circle(ctx, fx + fw * 0.12, y + H * 0.72, 1.8, P.data);
        ctx.fillStyle = P.bg0; ctx.fillRect(fx + fw * 0.2, y + H * 0.68, fw * 0.035, H * 0.04); ctx.fillRect(fx + fw * 0.25, y + H * 0.68, fw * 0.035, H * 0.04);
      }
      // power / ID LEDs on the left ear
      D.led(ctx, x + ear / 2, y + H - 7, P.ok, 'solid', t, 1.6);
      // BMC name chip
      var chipY = y + H + 14, none = o.bmc === 'none';
      var pl = D.pill(ctx, 'BMC · ' + o.bmc, x, chipY, { size: 10, color: none ? P.text3 : P.mgmt, align: 'left', r: 4, bg: U.rgba(P.panel, 0.95) });
      if (none) D.g.cross(ctx, pl.x + pl.w + 10, chipY, 12, P.fault);
      D.dim(ctx, x, y - 10, x + W, y - 10, u + 'U · 482.6 mm', { alpha: 0.7, size: 9, bg: P.bg });
      if (!this.mobile) D.text(ctx, 'FRONT VIEW · TO SCALE', x, y - 30, { size: 9, weight: 700, color: P.text3, ls: 1.5 });
      ctx.restore();
    }
  });
})(window.SRV);
