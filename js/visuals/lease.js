/* Ch3 · The lease conveyor. Servers ride a belt through years of business use while their price tag
   shrinks, then tip off the end into the refurb market bin at ~20–30% of the new price. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var RESALE = { 3: 0.30, 4: 0.25, 5: 0.20 };

  S.defineVisual('lease', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.years = 4;
      this.items = []; this.bin = []; this.sold = [];
      this.gen = 2017; this.spawnT = 0; this.seeded = false;
      var self = this;
      this.ui.seg({
        label: 'Lease length', options: [[3, '3 years'], [4, '4 years'], [5, '5 years']], value: 4,
        onChange: function (v) { self.years = v; self.rRes.set('≈ ' + Math.round(RESALE[v] * 100) + '% of new'); self.announce('Lease length ' + v + ' years: servers resell for about ' + Math.round(RESALE[v] * 100) + ' percent of their new price.'); }
      });
      this.ui.spacer();
      this.rRes = this.ui.readout('Refurb price', '≈ 25% of new', 'ok');
    },
    resize: function (w, h) {
      var mob = this.mobile = w < 560;
      this.sw = mob ? Math.max(46, w * 0.15) : U.clamp(w * 0.12, 70, 132);
      this.sh = this.sw * 88.9 / 482.6;
      this.x0 = mob ? 14 : w * 0.05;
      this.x1 = mob ? w * 0.66 : w * 0.72;
      this.yb = mob ? h * 0.56 : h * 0.56;
      this.bin = this.bin || [];
      this.binR = { x: this.x1 + (mob ? 18 : 34), y: this.yb + (mob ? 14 : 18), w: w - this.x1 - (mob ? 30 : 34) - (mob ? 8 : w * 0.04), h: h - this.yb - (mob ? 14 : 18) - (mob ? 24 : 30) };
      this.speed = (this.x1 - this.x0) / (mob ? 9 : 12);
      this.gap = this.sw * (mob ? 1.7 : 1.6);
      this.maxBin = (this.binR.w > this.sw * 2.3 ? 2 : 1) * Math.max(2, Math.min(3, Math.floor((this.binR.h - 6) / (this.sh + 3))));
      if (!this.seeded) this.seed();
      while (this.bin.length > this.maxBin) this.bin.shift();
      var self = this;
      this.bin.forEach(function (b, i) { b.tx = self.binSlot(i).x; b.ty = self.binSlot(i).y; b.x = b.tx; b.y = b.ty; });
    },
    seed: function () {
      this.seeded = true;
      var x = this.x1 - this.sw * 0.6;
      while (x > this.x0 + this.sw * 0.5) { this.items.unshift(this.mk(x)); x -= this.gap; }
      for (var i = 0; i < 2; i++) { var b = this.mk(0); b.st = 'bin'; b.rot = (i ? -0.05 : 0.04); this.bin.push(b); }
      // make generations increase left → right along the belt order of arrival
      var g = 2016; this.bin.forEach(function (b) { b.gen = g++; }); this.items.slice().reverse().forEach(function (it) { it.gen = g++; });
      this.gen = g;
    },
    mk: function (x) {
      var price = Math.round((8 + this.rng.float() * 8)) * 1000;
      return { x: x, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, st: 'belt', price: price, gen: this.gen++, seed: this.rng.float() * 100 };
    },
    age: function (it) { return U.clamp((it.x - this.x0) / (this.x1 - this.x0), 0, 1); },
    binSlot: function (i) {
      var B = this.binR, cols = B.w > this.sw * 2.3 ? 2 : 1, c = i % cols, r = Math.floor(i / cols);
      var x = B.x + B.w / 2 + (cols === 2 ? (c ? 1 : -1) * this.sw * 0.55 : 0);
      return { x: x, y: B.y + B.h - 6 - this.sh / 2 - r * (this.sh + 3) };
    },
    update: function (dt) {
      var self = this;
      this.beltOff = ((this.beltOff || 0) + dt * this.speed) % 24;
      // spawn
      var first = this.items[0];
      if (!first || first.x - this.x0 > this.gap) this.items.unshift(this.mk(this.x0 - this.sw * 0.1));
      for (var i = this.items.length - 1; i >= 0; i--) {
        var it = this.items[i];
        if (it.st === 'belt') {
          it.x += this.speed * dt;
          if (it.x > this.x1 + this.sw * 0.05) { it.st = 'fall'; it.vx = this.speed * 1.4; it.vy = -30; it.vr = 2.2; it.y = 0;
            var slot = this.binSlot(Math.min(this.bin.length, this.maxBin - 1)); it.tx = slot.x; }
        } else if (it.st === 'fall') {
          it.vy += 900 * dt; it.y += it.vy * dt;
          it.x = U.damp(it.x, it.tx, 3.5, dt) + it.vx * dt * 0.15;
          it.rot += it.vr * dt;
          var base = this.yb - this.sh / 2;
          var land = this.binSlot(Math.min(this.bin.length, this.maxBin)).y - base;
          if (this.bin.length >= this.maxBin) land = this.binSlot(this.maxBin - 1).y - base - this.sh * 0.6;
          if (it.y >= land) {
            it.st = 'bin'; it.rot = (this.rng.float() - 0.5) * 0.12;
            this.items.splice(i, 1);
            it.y = it.y + base;
            this.bin.push(it);
            if (this.bin.length > this.maxBin) {
              var s = this.bin.shift(); s.life = 1; this.sold.push(s);
            }
            this.bin.forEach(function (b, k) { var sl = self.binSlot(k); b.tx = sl.x; b.ty = sl.y; });
            it.bounce = 1;
          }
        }
      }
      this.bin.forEach(function (b) {
        b.x = U.damp(b.x, b.tx == null ? b.x : b.tx, 10, dt);
        b.y = U.damp(b.y, b.ty == null ? b.y : b.ty, 12, dt);
        if (b.bounce) { b.bounce = Math.max(0, b.bounce - dt * 3); }
      });
      for (var j = this.sold.length - 1; j >= 0; j--) {
        var s2 = this.sold[j]; s2.life -= dt * 0.55; s2.y -= dt * 40; s2.x += dt * 26;
        if (s2.life <= 0) this.sold.splice(j, 1);
      }
    },
    price: function (it, age) { var r = RESALE[this.years]; return it.price * Math.pow(r, age); },
    drawServer: function (ctx, cx, cy, age, rot, it, alpha) {
      var P = S.pal, w = this.sw, h = this.sh, t = this.time;
      ctx.save(); ctx.translate(cx, cy); if (rot) ctx.rotate(rot); if (alpha != null) ctx.globalAlpha = alpha;
      var body = U.mix(P.steel, P.text3, age * 0.35);
      var ear = w * 0.035;
      D.box(ctx, -w / 2, -h / 2, w, h, 1.5, U.shade(body, -0.35));
      D.box(ctx, -w / 2 + ear, -h / 2, w - ear * 2, h, 1.5, body, U.shade(body, -0.5), 1);
      var n = 8, bw = (w - ear * 2) * 0.7 / n, bx0 = -w / 2 + ear + (w - ear * 2) * 0.22;
      for (var i = 0; i < n; i++) {
        ctx.fillStyle = U.shade(P.plastic, -0.1); ctx.fillRect(bx0 + i * bw + 0.5, -h / 2 + 2, bw - 1, h - 4);
        if (h > 12) { ctx.fillStyle = U.rgba(P.alu, 0.45); ctx.fillRect(bx0 + i * bw + bw * 0.3, h * 0.05, bw * 0.4, h * 0.28); }
      }
      var ledCol = age < 0.98 ? P.ok : P.text3;
      D.circle(ctx, -w / 2 + ear + w * 0.05, -h * 0.15, Math.max(1, h * 0.09), ledCol);
      if (age < 0.98 && U.noise1(t * 6 + it.seed) > 0.4) D.glow(ctx, -w / 2 + ear + w * 0.05, -h * 0.15, h * 0.5, P.ok, 0.6);
      D.circle(ctx, -w / 2 + ear + w * 0.05, h * 0.2, Math.max(1, h * 0.08), P.mgmt);
      // dust accumulates with age
      if (age > 0.15) {
        ctx.fillStyle = U.rgba(P.alu, 0.55 * age);
        for (var d = 0; d < 14 * age; d++) { var hx = U.hash(it.seed, d), hy = U.hash(d, it.seed); ctx.fillRect(-w / 2 + hx * w, -h / 2 + hy * h, 1.2, 1.2); }
      }
      // generation label
      if (w > 56) D.text(ctx, "'" + String(it.gen).slice(2), w / 2 - ear - 3, 0, { size: Math.max(7, h * 0.42), weight: 700, color: P.bg0, align: 'right' });
      ctx.restore();
    },
    tag: function (ctx, x, y, price, frac, alpha) {
      var P = S.pal, sz = (this.mobile ? 8 : 10) * (0.72 + 0.28 * frac), col = U.mix(P.warn, P.ok, U.clamp((frac - 0.2) / 0.8, 0, 1));
      var txt = '$' + U.fmt(Math.round(price / 50) * 50);
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      D.line(ctx, x, y + 2, x, y + 10, U.rgba(P.text3, 0.7), 1);
      var tw = D.measure(ctx, txt, sz, 700) + 10, th = sz + 6;
      D.poly(ctx, [x - tw / 2, y - th / 2, x + tw / 2, y - th / 2, x + tw / 2 + 5, y, x + tw / 2, y + th / 2, x - tw / 2, y + th / 2]);
      ctx.fillStyle = U.rgba(P.panel, 0.96); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      D.circle(ctx, x + tw / 2 - 1, y, 1.5, col);
      D.text(ctx, txt, x - 2, y + 0.5, { size: sz, weight: 700, color: col, align: 'center' });
      ctx.globalAlpha = 1;
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, self = this, mob = this.mobile, t = this.time;
      D.clear(ctx, w, h);
      var x0 = this.x0, x1 = this.x1, yb = this.yb, bt = mob ? 8 : 12, yrs = this.years, sh = this.sh, sw = this.sw;

      // datacenter bracket + year markers
      var by = mob ? 22 : 34;
      ctx.strokeStyle = U.rgba(P.blueprint, 0.6); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, by + 8); ctx.lineTo(x0, by); ctx.lineTo(x1, by); ctx.lineTo(x1, by + 8); ctx.stroke();
      var head = mob ? 'BUSINESS DATACENTER' : 'IN A BUSINESS DATACENTER · ' + yrs + '-YEAR LEASE';
      var hw = D.measure(ctx, head, mob ? 9 : 10, 700) + 16;
      ctx.fillStyle = P.bg; ctx.fillRect((x0 + x1) / 2 - hw / 2, by - 7, hw, 14);
      D.text(ctx, head, (x0 + x1) / 2, by, { size: mob ? 9 : 10, weight: 700, color: P.blueprint, align: 'center', ls: 1 });
      for (var y = 0; y <= yrs; y++) {
        var yx = x0 + (x1 - x0) * y / yrs;
        D.line(ctx, yx, by + 12, yx, yb - 2, U.rgba(P.grid, 0.9), 1, [2, 4]);
        if (y < yrs) D.text(ctx, (mob ? 'Y' : 'YEAR ') + (y + 1), yx + (x1 - x0) / yrs / 2, yb + bt + (mob ? 22 : 26), { size: mob ? 8.5 : 10, weight: 600, color: P.text3, align: 'center' });
      }

      // belt
      D.box(ctx, x0 - bt / 2, yb, x1 - x0 + bt, bt, bt / 2, U.shade(P.cable, P.dark ? 0 : 0.1), U.shade(P.cable, -0.4), 1);
      ctx.save(); D.rr(ctx, x0 - bt / 2, yb, x1 - x0 + bt, bt, bt / 2); ctx.clip();
      ctx.strokeStyle = U.rgba(P.alu, 0.28); ctx.lineWidth = 1.5;
      for (var bx = x0 - 24 + (this.beltOff || 0); bx < x1 + 24; bx += 24) { ctx.beginPath(); ctx.moveTo(bx, yb + 1); ctx.lineTo(bx - 4, yb + bt - 1); ctx.stroke(); }
      ctx.restore();
      var nr = mob ? 5 : 8, rr = bt * 0.32;
      for (var r = 0; r <= nr; r++) {
        var rx = x0 + (x1 - x0) * r / nr;
        D.circle(ctx, rx, yb + bt / 2, rr, U.shade(P.alu, -0.25));
        var an = (this.beltOff || 0) / rr;
        D.line(ctx, rx - Math.cos(an) * rr, yb + bt / 2 - Math.sin(an) * rr, rx + Math.cos(an) * rr, yb + bt / 2 + Math.sin(an) * rr, U.shade(P.alu, -0.55), 1);
      }
      // stand legs
      [x0 + 10, x1 - 10].forEach(function (lx) { var ly2 = yb + bt + (mob ? 10 : 14); D.line(ctx, lx, yb + bt, lx - 5, ly2, U.rgba(P.steel, 0.9), 2); D.line(ctx, lx, yb + bt, lx + 5, ly2, U.rgba(P.steel, 0.9), 2); });

      // bin
      var B = this.binR;
      D.poly(ctx, [B.x, B.y, B.x + B.w, B.y, B.x + B.w - 8, B.y + B.h, B.x + 8, B.y + B.h]);
      ctx.fillStyle = U.rgba(P.panel2, 0.9); ctx.fill();
      ctx.fillStyle = D.hatch(ctx, U.rgba(P.blueprint, 0.12), 7); ctx.fill();
      ctx.strokeStyle = P.blueprint; ctx.lineWidth = 1.5; ctx.stroke();
      // sold servers floating out
      this.sold.forEach(function (s) {
        self.drawServer(ctx, s.x, s.y, 1, s.rot, s, Math.max(0, s.life));
        D.text(ctx, '→ homelab', s.x, s.y - sh - 4, { size: mob ? 8 : 9.5, weight: 700, color: P.accent, align: 'center', alpha: Math.max(0, s.life) });
      });
      this.bin.forEach(function (b) {
        var bo = b.bounce ? -Math.sin(b.bounce * Math.PI) * 6 * b.bounce : 0;
        self.drawServer(ctx, b.x, b.y + bo, 1, b.rot, b);
      });
      var res = RESALE[yrs];
      D.text(ctx, 'REFURB MARKET', B.x + B.w / 2, B.y + B.h + (mob ? 11 : 14), { size: mob ? 8.5 : 10, weight: 700, color: P.text1, align: 'center', ls: 1 });
      var last = this.bin[this.bin.length - 1];
      if (last) {
        var lp = last.price * res;
        var pillTxt = '$' + U.fmt(Math.round(lp / 50) * 50) + ' · ' + Math.round(res * 100) + '% of new';
        if (mob) D.pill(ctx, pillTxt, w - 8, yb - sh - 34, { size: 9, align: 'right', color: P.ok, r: 4 });
        else D.pill(ctx, pillTxt, B.x + B.w / 2, B.y - 20, { size: 10.5, align: 'center', color: P.ok, r: 4 });
      }

      // belt items
      this.items.forEach(function (it) {
        if (it.st === 'belt') {
          var age = self.age(it), cy = yb - sh / 2 - 1;
          var a = U.clamp((it.x - x0 + sw * 0.1) / (sw * 0.4), 0, 1);
          self.drawServer(ctx, it.x, cy, age, 0, it, a);
          var frac = Math.pow(res, age);
          self.tag(ctx, it.x, cy - sh / 2 - (mob ? 14 : 20), it.price * frac, frac, a);
        } else {
          self.drawServer(ctx, it.x, yb - sh / 2 + it.y, 1, it.rot, it);
        }
      });

      // price curve sparkline under the belt (desktop)
      if (!mob) {
        var cyB = h - 16, ch = 18;
        ctx.beginPath();
        for (var k = 0; k <= 40; k++) { var f = k / 40, px = x0 + (x1 - x0) * f, py = cyB - ch * Math.pow(res, f); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.strokeStyle = U.rgba(P.ok, 0.6); ctx.lineWidth = 1.2; ctx.stroke();
        D.text(ctx, 'RESALE VALUE · 100%', x0, cyB - ch - 9, { size: 9, color: P.text3 });
        D.text(ctx, Math.round(res * 100) + '%', x1 + 6, cyB - ch * res, { size: 9, weight: 700, color: P.ok });
      }
      this.setDesc('Servers ride a ' + yrs + '-year lease belt; their price tags shrink until they drop into the refurb market at about ' + Math.round(res * 100) + '% of the new price.');
    }
  });
})(window.SRV);
