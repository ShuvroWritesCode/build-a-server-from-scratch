/* Ch3 · 5-year true cost. Stacked bars per buying option: purchase + support + electricity + your time.
   Electricity = avg W × 8.76 kWh/yr per W × 5 yrs × $/kWh (× 1.3 if you also pay to cool the room). */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var YEARS = 5;

  var OPTS = [
    { id: 'brand', name: 'Brand-name, new', sub: 'Dell · HPE · Lenovo', buy: 3000, support: 900, watts: 95, hours: 10 },
    { id: 'smc', name: 'Supermicro barebones', sub: 'you add CPU, RAM, drives', buy: 2100, support: 250, watts: 90, hours: 25 },
    { id: 'diy', name: 'DIY whitebox', sub: 'every part, your choice', buy: 1600, support: 0, watts: 80, hours: 45 },
    { id: 'refurb', name: 'Refurbished off-lease', sub: '6-year-old 2U', buy: 400, support: 200, watts: 200, hours: 30 }
  ];
  var SEGS = [
    { k: 'buy', label: 'Purchase' }, { k: 'support', label: 'Support / spares' },
    { k: 'power', label: 'Electricity' }, { k: 'time', label: 'Your time' }
  ];
  function segCol(k) { var P = S.pal; return k === 'buy' ? P.alu : k === 'support' ? P.mgmt : k === 'power' ? P.power : P.net; }
  function onCol(k) { var P = S.pal; if (k === 'buy') return P.dark ? P.bg0 : P.text1; if (k === 'support') return P.dark ? P.text1 : P.panel; return P.dark ? P.bg0 : P.panel; }
  function money(v) { return v >= 10000 ? '$' + (v / 1000).toFixed(0) + 'k' : v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + Math.round(v); }
  function niceMax(v) { var steps = [2000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000]; for (var i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i]; return Math.ceil(v / 5000) * 5000; }

  S.defineVisual('tco', {
    init: function () {
      this.ctx = this.layer();
      var b = S.build.get(), self = this;
      this.rate = U.clamp(b.rate || 0.15, 0.08, 0.4);
      this.hourly = 30; this.cool = false;
      this.disp = OPTS.map(function () { return { buy: 0, support: 0, power: 0, time: 0 }; });
      this.axis = 6000; this.hover = null;
      this.sRate = this.ui.slider({
        label: 'Electricity', min: 0.08, max: 0.4, step: 0.01, value: this.rate,
        fmt: function (v) { return '$' + v.toFixed(2) + '/kWh'; },
        onInput: function (v) { self.rate = v; S.build.set({ rate: v }); self.retarget(true); }
      });
      this.sHour = this.ui.slider({
        label: 'Your time', min: 0, max: 100, step: 5, value: this.hourly,
        fmt: function (v) { return '$' + v + '/h'; },
        onInput: function (v) { self.hourly = v; self.retarget(true); }
      });
      this.ui.toggle({ label: 'Pay to cool the room (+30%)', value: false, onChange: function (v) { self.cool = v; self.retarget(true); } });
      this.ui.spacer();
      this.rBest = this.ui.readout('Cheapest over 5 yrs', '–', 'ok');
      this.unsub = S.build.subscribe('rate', function (r) { if (Math.abs(r - self.rate) > 0.004) { self.rate = U.clamp(r, 0.08, 0.4); self.sRate.set(self.rate); self.retarget(false); } });
      this.pointer({
        hover: function (p) {
          var h = this.hits.query(p.x, p.y);
          var id = h ? h.id : null;
          if (id !== this.hover) { this.hover = id; this.invalidate(); }
          if (h) this.tipAt(this.tip(h.data), p.x, p.y); else this.tipAt(null);
        },
        down: function (p) { var h = this.hits.query(p.x, p.y); if (h) { this.hover = h.id; this.tipAt(this.tip(h.data), p.x, p.y); } return false; },
        leave: function () { this.hover = null; }
      });
      this.retarget(false);
    },
    elec: function (o) { return o.watts * 8.76 * YEARS * this.rate * (this.cool ? 1.3 : 1); },
    target: function (o) { return { buy: o.buy, support: o.support, power: this.elec(o), time: o.hours * this.hourly }; },
    tip: function (d) {
      var o = OPTS[d.row], t = this.target(o);
      if (d.seg === 'power') return '<b>Electricity · ' + o.name + '</b>' + o.watts + ' W average × 8.76 × ' + YEARS + ' yrs × $' + this.rate.toFixed(2) + (this.cool ? ' × 1.3 cooling' : '') + ' ≈ ' + money(t.power);
      if (d.seg === 'time') return '<b>Your time · ' + o.name + '</b>' + o.hours + ' h of setup, fixes and research × $' + this.hourly + '/h = ' + money(t.time);
      if (d.seg === 'support') return '<b>Support · ' + o.name + '</b>' + (t.support ? 'Warranty, support contract or spare parts: ' + money(t.support) : 'No warranty contract — you fix it.');
      return '<b>Purchase · ' + o.name + '</b>' + money(t.buy) + ' up front';
    },
    retarget: function (user) {
      var self = this, tot = OPTS.map(function (o) { var t = self.target(o); return t.buy + t.support + t.power + t.time; });
      this.axisT = niceMax(Math.max.apply(null, tot) * 1.04);
      var best = 0; tot.forEach(function (v, i) { if (v < tot[best]) best = i; });
      this.best = best; this.totals = tot;
      this.rBest.set(OPTS[best].name.split(',')[0] + ' · ' + money(tot[best]), 'ok');
      if (this.reduced() && !user) this.snap();
      this.setActive(true);
      if (user) {
        var r = OPTS[3], e = this.elec(r);
        this.announce('At $' + this.rate.toFixed(2) + ' per kWh the refurbished server costs about ' + money(e) + ' in electricity over five years. Cheapest overall: ' + OPTS[best].name + ' at ' + money(tot[best]) + '.');
      }
    },
    snap: function () {
      var self = this;
      OPTS.forEach(function (o, i) { var t = self.target(o); SEGS.forEach(function (s) { self.disp[i][s.k] = t[s.k]; }); });
      this.axis = this.axisT;
    },
    update: function (dt) {
      var self = this, moving = false, lam = this.reduced() ? 40 : 9;
      OPTS.forEach(function (o, i) {
        var t = self.target(o), d = self.disp[i];
        SEGS.forEach(function (s) {
          var nv = U.damp(d[s.k], t[s.k], lam, dt);
          if (Math.abs(nv - t[s.k]) < 0.5) nv = t[s.k]; else moving = true;
          d[s.k] = nv;
        });
      });
      this.axis = U.damp(this.axis, this.axisT, lam * 0.8, dt);
      if (Math.abs(this.axis - this.axisT) < 1) this.axis = this.axisT; else moving = true;
      if (!moving) this.setActive(false);
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      if (this.mobile) {
        this.L = { x: 16, y: 92, w: w - 32, nameW: 0, rowH: (h - 92 - 70) / 4, barH: 20 };
      } else {
        this.L = { x: 210, y: 70, w: w - 210 - 96, nameW: 190, rowH: (h - 70 - 74) / 4, barH: Math.min(30, (h - 144) / 4 * 0.42) };
      }
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, mob = this.mobile, self = this;
      D.clear(ctx, w, h);
      this.hits.clear();
      var scale = L.w / this.axis;

      // legend + approx badge
      var lx = mob ? 16 : L.x, ly = mob ? 22 : 30;
      SEGS.forEach(function (s, i) {
        var x = mob ? 16 + (i % 2) * ((w - 32) / 2) : lx + i * 132, y = mob ? ly + Math.floor(i / 2) * 18 : ly;
        D.box(ctx, x, y - 5, 12, 10, 2, segCol(s.k));
        if (s.k === 'power') { ctx.fillStyle = D.hatch(ctx, U.rgba(P.bg, 0.55), 4); ctx.fillRect(x, y - 5, 12, 10); }
        D.text(ctx, s.label, x + 18, y, { size: 10.5, color: P.text2 });
      });
      D.pill(ctx, 'APPROX. · USD · 5 YEARS', mob ? w - 16 : w - 20, mob ? 66 : ly, { size: 9, align: 'right', color: P.text3, r: 4 });

      // grid + axis
      var top = L.y - 8, bottom = L.y + L.rowH * 4;
      var step = this.axis > 12000 ? 5000 : this.axis > 6000 ? 2000 : 1000;
      for (var v = 0; v <= this.axis + 1; v += step) {
        var gx = L.x + v * scale;
        if (gx > L.x + L.w + 2) break;
        D.line(ctx, gx, top, gx, bottom, U.rgba(P.grid, v === 0 ? 1 : 0.7), 1, v === 0 ? null : [2, 4]);
        if (!mob || v % (step * 2) === 0) D.text(ctx, money(v), gx, bottom + 14, { size: 9.5, color: P.text3, align: 'center' });
      }

      // rows
      OPTS.forEach(function (o, i) {
        var d = self.disp[i], cy = L.y + L.rowH * i + L.rowH / 2 + (mob ? 8 : 0), by = cy - L.barH / 2, x = L.x;
        var isBest = i === self.best;
        if (mob) {
          D.text(ctx, o.name, L.x, by - 11, { size: 12, weight: 700, color: P.text1, sans: true });
        } else {
          D.text(ctx, o.name, L.x - 16, cy - 7, { size: 13, weight: 700, color: P.text1, align: 'right', sans: true });
          D.text(ctx, o.sub, L.x - 16, cy + 10, { size: 10, color: P.text3, align: 'right' });
        }
        SEGS.forEach(function (s) {
          var val = d[s.k], sw = val * scale;
          if (sw < 0.5) return;
          var id = o.id + ':' + s.k, hov = self.hover === id;
          D.box(ctx, x, by, Math.max(1, sw - 1.5), L.barH, 2, hov ? U.shade(segCol(s.k), 0.2) : segCol(s.k));
          if (s.k === 'power') { ctx.save(); D.rr(ctx, x, by, Math.max(1, sw - 1.5), L.barH, 2); ctx.clip(); ctx.fillStyle = D.hatch(ctx, U.rgba(P.bg, 0.35), 5); ctx.fillRect(x, by, sw, L.barH); ctx.restore(); }
          if (sw > 46) D.text(ctx, money(val), x + 6, cy + 0.5, { size: 10, weight: 700, color: onCol(s.k) });
          self.hits.rect(id, x, by, sw, L.barH, { row: i, seg: s.k });
          x += sw;
        });
        var tot = d.buy + d.support + d.power + d.time;
        var tx = mob ? L.x + L.w : x + 10;
        D.text(ctx, money(tot), tx, mob ? by - 11 : cy, { size: mob ? 12 : 14, weight: 800, color: isBest ? P.ok : P.text1, align: mob ? 'right' : 'left' });
        if (isBest) D.g.check(ctx, mob ? L.x + L.w - D.measure(ctx, money(tot), 12, 800) - 12 : tx + D.measure(ctx, money(tot), 14, 800) + 12, mob ? by - 11 : cy, 14, P.ok);

        // the "aha": power bill vs price tag on the refurb row
        if (o.id === 'refurb' && d.power > d.buy * 1.2) {
          var ex = L.x + (d.buy + d.support + d.power / 2) * scale, ratio = d.power / d.buy;
          var ty = by + L.barH + (mob ? 13 : 15);
          D.line(ctx, ex, by + L.barH + 1, ex, ty - 6, P.power, 1);
          D.pill(ctx, '⚡ power ≈ ' + ratio.toFixed(1) + '× the price tag', U.clamp(ex, L.x + 100, w - 110), ty + 2, { size: mob ? 9 : 10, align: 'center', color: P.power, r: 4 });
        }
      });

      // insight footer
      var r = OPTS[3], e = this.elec(r);
      var msg = '$' + r.buy + ' refurb at ' + r.watts + ' W → $' + r.buy + ' + ≈ $' + U.fmt(Math.round(e / 10) * 10) + ' electricity ≈ $' + U.fmt(Math.round((e + r.buy) / 10) * 10) + ' over 5 yrs at $' + this.rate.toFixed(2) + '/kWh';
      D.text(ctx, msg, mob ? 16 : L.x, h - 18, { size: mob ? 9.5 : 11, weight: 600, color: P.power, maxW: w - 32 });
      if (!mob) D.text(ctx, 'watts × 8.76 × years × $/kWh' + (this.cool ? ' × 1.3' : ''), w - 20, h - 18, { size: 10, color: P.text3, align: 'right' });

      var t = this.totals;
      this.setDesc('At $' + this.rate.toFixed(2) + '/kWh and $' + this.hourly + '/h: ' + OPTS.map(function (o, i) { return o.name + ' ' + money(t[i]); }).join(', ') + '. Refurbished electricity alone ≈ ' + money(e) + '.');
    }
  });
})(window.SRV);
