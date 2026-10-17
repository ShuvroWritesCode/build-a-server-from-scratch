/* Ch6 · The Kitchen. Cores are chef stations, order tickets queue on a rail, a metronome is the clock.
   A tiny scheduling sim: each chef works its ticket at a rate ∝ GHz; ingredient trips (cache misses to
   the RAM "freezer") stall a thread. With SMT a chef holds two tickets and works the other while waiting. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var CORE_STEPS = [1, 2, 4, 8, 16, 32, 64];

  S.defineVisual('kitchen', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.cores = 4; this.ghz = 3.0; this.smt = false; this.mode = 'small'; this.cooling = 'server';
      this.queue = []; this.done = 0; this.doneWin = []; this.spawnAcc = 0; this.cake = null; this.metro = 0; this.served = 0;
      this.heat = 0; this.throttled = false;
      this.stations = [];
      var self = this;
      var g1 = this.ui.group('Kitchen size');
      this.sCores = g1.slider({ label: 'Cores (chefs)', min: 0, max: 6, step: 1, value: 2, fmt: function (i) { return CORE_STEPS[i]; }, valueText: function (i) { return CORE_STEPS[i] + ' cores'; }, onInput: function (i) { self.setCores(CORE_STEPS[i]); } });
      g1.slider({ label: 'Clock', min: 2, max: 5.2, step: 0.1, value: 3, fmt: function (v) { return v.toFixed(1) + ' GHz'; }, onInput: function (v) { self.ghz = v; } });
      g1.toggle({ label: 'SMT (2 threads/core)', value: false, onChange: function (v) { self.smt = v; self.rebuild(); self.announce(v ? 'SMT on: each chef holds two tickets and works one while waiting on ingredients.' : 'SMT off: one ticket per chef.'); } });
      this.ui.br();
      var g2 = this.ui.group('Workload');
      g2.seg({ label: 'Orders', options: [['small', '1,000 small orders'], ['cake', 'One giant cake']], value: 'small', onChange: function (v) { self.setMode(v); } });
      g2.seg({ label: 'Cooling', options: [['server', 'Server-grade'], ['stock', 'Weak cooler']], value: 'server', onChange: function (v) { self.cooling = v; } });
      this.ui.br();
      this.rTput = this.ui.readout('Orders / s', '0');
      this.rQueue = this.ui.readout('Waiting', '0');
      this.rCake = this.ui.readout('Cake', '–');
      this.rState = this.ui.readout('Chip', 'OK', 'ok');
      this.setCores(4);
    },
    setCores: function (n) { this.cores = n; this.rebuild(); this.announce(n + ' cores.'); },
    setMode: function (m) {
      this.mode = m; this.queue.length = 0; this.cake = null;
      this.stations.forEach(function (st) { st.th.forEach(function (t) { t.job = null; t.stall = 0; }); });
      this.rebuild();
      if (m === 'cake') { this.cake = { work: 80, left: 80, t: 0, done: false }; this.queue.push({ size: 80, left: 80, cake: true }); }
      this.announce(m === 'cake' ? 'One giant order: only one chef can work on it, so only clock speed helps.' : 'Many small orders: more chefs clear the queue faster.');
    },
    rebuild: function () {
      var threads = this.smt ? 2 : 1, old = this.stations;
      this.stations = [];
      for (var i = 0; i < this.cores; i++) {
        var st = { th: [], arm: 0, idle: 0 };
        for (var k = 0; k < threads; k++) st.th.push(old[i] && old[i].th[k] ? old[i].th[k] : { job: null, stall: 0 });
        this.stations.push(st);
      }
      // return orphaned jobs to the queue
      for (var j = this.cores; j < old.length; j++) old[j].th.forEach(function (t) { if (t.job) this.queue.unshift(t.job); }, this);
      if (!this.smt) old.forEach(function (st, i) { if (i < this.cores && st.th[1] && st.th[1].job) this.queue.unshift(st.th[1].job); }, this);
      this.layout();
    },
    resize: function () { this.layout(); },
    layout: function () {
      var w = this.w, h = this.h; if (!w) return;
      this.mobile = w < 560;
      var railW = this.mobile ? 0 : Math.min(150, w * 0.17), rightW = this.mobile ? 0 : Math.min(190, w * 0.22);
      var top = this.mobile ? 70 : 54, bottom = this.mobile ? 112 : 40;
      this.area = { x: railW + 22, y: top, w: w - railW - rightW - 44, h: h - top - bottom };
      var n = this.cores, ar = this.area.w / this.area.h;
      var cols = Math.max(1, Math.round(Math.sqrt(n * ar))); var rows = Math.ceil(n / cols);
      while (cols * rows < n) cols++;
      this.grid = { cols: cols, rows: rows, cw: this.area.w / cols, ch: this.area.h / rows };
      this.railW = railW; this.rightW = rightW;
    },
    effGhz: function () {
      var limit = this.cooling === 'stock' ? 3.4 : 5.2;
      this.throttled = this.ghz > limit && this.heat > 0.85;
      return this.throttled ? Math.min(this.ghz, 2.4 + 0.4 * Math.sin(this.time * 7)) : this.ghz;
    },
    update: function (dt) {
      var rng = this.rng, g = this.effGhz(), self = this;
      // heat: rises with clock^2 × busy cores, cooling removes it
      var busy = 0; this.stations.forEach(function (s) { if (s.th.some(function (t) { return t.job; })) busy++; });
      var load = (busy / this.cores) * Math.pow(this.ghz / 3.2, 2.2);
      var cool = this.cooling === 'stock' ? 0.55 : 1.4;
      this.heat = U.clamp(this.heat + (load * 0.6 - cool * 0.45 * this.heat) * dt, 0, 1.2);
      // arrivals
      if (this.mode === 'small') {
        this.spawnAcc += dt * 14;
        while (this.spawnAcc >= 1) { this.spawnAcc -= 1; if (this.queue.length < 400) this.queue.push({ size: 1, left: 1 }); }
      }
      // scheduler: give free threads a job
      this.stations.forEach(function (st) {
        st.th.forEach(function (t) { if (!t.job && self.queue.length) { t.job = self.queue.shift(); t.stall = 0; } });
      });
      // execute: one thread per core makes progress at a time; others can only stall-wait
      this.stations.forEach(function (st) {
        var ready = st.th.filter(function (t) { return t.job && t.stall <= 0; });
        st.th.forEach(function (t) { if (t.stall > 0) t.stall -= dt; });
        if (!ready.length) { st.idle += dt; st.arm = U.damp(st.arm, 0, 6, dt); return; }
        st.idle = 0;
        var share = ready.length > 1 ? 0.52 : 1; // two ready threads share the core
        ready.forEach(function (t) {
          var work = g * dt * share;
          t.job.left -= work;
          // ingredient trip (cache miss → RAM) ~ every 0.33 units
          if (!t.job.cake || rng.chance(0.5)) if (rng.chance(work * 0.9)) t.stall = 0.18;
          if (t.job.left <= 0) {
            if (t.job.cake) { self.cake.done = true; self.announce('Cake finished in ' + self.cake.t.toFixed(1) + ' seconds.'); }
            else { self.served++; self.doneWin.push(self.time); }
            t.job = null;
          }
        });
        st.arm += dt * g * 2.2;
      });
      if (this.cake && !this.cake.done) this.cake.t += dt;
      while (this.doneWin.length && this.doneWin[0] < this.time - 2) this.doneWin.shift();
      this.metro += dt * g * 0.55;
      var tput = this.doneWin.length / 2;
      this.rTput.set(this.mode === 'cake' ? '–' : tput.toFixed(1));
      this.rQueue.set(this.mode === 'cake' ? '–' : String(this.queue.length), this.queue.length > 60 ? 'bad' : this.queue.length > 15 ? 'warn' : 'ok');
      if (this.cake) this.rCake.set(this.cake.done ? 'done in ' + this.cake.t.toFixed(1) + ' s' : Math.round(100 * (1 - this.cake.left / this.cake.work)) + '% · ' + this.cake.t.toFixed(1) + ' s');
      else this.rCake.set('–');
      this.rState.set(this.throttled ? 'THROTTLING' : this.heat > 0.7 ? 'HOT' : 'OK', this.throttled ? 'bad' : this.heat > 0.7 ? 'warn' : 'ok');
      if (this.cake) this.cake.left = this.cake.done ? 0 : this.findCakeLeft();
    },
    findCakeLeft: function () {
      var left = this.cake.work;
      this.stations.forEach(function (s) { s.th.forEach(function (t) { if (t.job && t.job.cake) left = t.job.left; }); });
      this.queue.forEach(function (j) { if (j.cake) left = j.left; });
      return Math.max(0, left);
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, t = this.time, self = this, A = this.area, G = this.grid;
      D.clear(ctx, w, h);
      // ----- ticket rail (queue)
      if (!this.mobile) {
        var rx = 16, ry = A.y, rh = A.h;
        D.box(ctx, rx, ry, this.railW, rh, 10, U.rgba(P.panel2, 0.6), U.rgba(P.blueprint, 0.35));
        D.text(ctx, 'ORDER RAIL', rx + 10, ry + 14, { size: 10, weight: 700, color: P.text3, ls: 1 });
        var maxT = Math.floor((rh - 34) / 13);
        for (var i = 0; i < Math.min(this.queue.length, maxT); i++) {
          var q = this.queue[i];
          D.box(ctx, rx + 10, ry + 28 + i * 13, this.railW - 20, 10, 2, q.cake ? P.power : U.rgba(P.text1, 0.85));
          ctx.fillStyle = U.rgba(P.bg, 0.6); ctx.fillRect(rx + 14, ry + 31 + i * 13, (this.railW - 40) * 0.6, 2);
        }
        if (this.queue.length > maxT) D.text(ctx, '+' + (this.queue.length - maxT) + ' more', rx + this.railW / 2, ry + rh - 10, { size: 10, color: P.warn, align: 'center', weight: 700 });
      } else {
        D.text(ctx, 'QUEUE ' + this.queue.length, 14, 22, { size: 11, weight: 700, color: this.queue.length > 15 ? P.warn : P.text2 });
      }
      // ----- stations
      var g = this.effGhz();
      this.stations.forEach(function (st, i) {
        var c = i % G.cols, r = Math.floor(i / G.cols);
        var x = A.x + c * G.cw, y = A.y + r * G.ch, cw = G.cw - 6, ch = G.ch - 6;
        var hot = self.heat;
        D.box(ctx, x, y, cw, ch, Math.min(10, cw * 0.1), U.rgba(P.panel2, 0.9), U.rgba(hot > 0.8 ? P.heat : P.blueprint, 0.35 + hot * 0.3));
        var s = Math.min(cw, ch);
        var busy = st.th.some(function (th) { return th.job && th.stall <= 0; });
        var cx = x + cw * 0.38, cy = y + ch * 0.62;
        // counter (L2) + hands (L1)
        ctx.fillStyle = U.rgba(P.alu, 0.18); ctx.fillRect(x + cw * 0.12, y + ch * 0.78, cw * 0.76, ch * 0.08);
        if (s > 26) D.g.person(ctx, cx, cy, s * 0.42, S.pal.alu, { hat: true, bob: busy ? Math.sin(st.arm * 6) * s * 0.02 : 0, arm: busy ? Math.sin(st.arm * 6) : -0.4 });
        else D.circle(ctx, cx, cy, s * 0.18, busy ? P.ok : P.text3);
        // ticket clips (threads)
        st.th.forEach(function (th, k) {
          var tx = x + cw * 0.64, ty = y + ch * (0.2 + k * 0.3), tw = cw * 0.28, tH = ch * 0.2;
          D.box(ctx, tx, ty, tw, tH, 2, th.job ? (th.job.cake ? U.rgba(P.power, 0.25) : U.rgba(P.text1, 0.18)) : U.rgba(P.panel3, 0.5), th.job && th.stall <= 0 ? P.accent : U.rgba(P.text3, 0.5), 1);
          if (th.job) {
            var f = 1 - th.job.left / th.job.size;
            ctx.fillStyle = th.job.cake ? P.power : P.ok; ctx.fillRect(tx + 2, ty + tH - 4, (tw - 4) * U.clamp(f, 0, 1), 2.5);
            if (th.stall > 0 && s > 30) D.text(ctx, '…', tx + tw / 2, ty + tH * 0.4, { size: 9, color: P.data, align: 'center', weight: 700 });
          }
        });
        // ingredient trip: bead to the freezer and back
        st.th.forEach(function (th) {
          if (th.stall > 0 && !self.mobile) {
            var k2 = 1 - th.stall / 0.18, fx = w - self.rightW + 30, fy = h * 0.66;
            var bx = U.lerp(x + cw * 0.9, fx, k2 < 0.5 ? k2 * 2 : 2 - k2 * 2), by = U.lerp(y + ch * 0.5, fy, k2 < 0.5 ? k2 * 2 : 2 - k2 * 2);
            ctx.globalAlpha = 0.85; D.circle(ctx, bx, by, 2.2, P.data); ctx.globalAlpha = 1;
          }
        });
        if (!busy && st.idle > 0.6 && s > 30) D.text(ctx, 'z z', x + cw * 0.24, y + ch * 0.22, { size: Math.max(9, s * 0.12), color: P.text3, weight: 700 });
        if (hot > 0.6 && busy && s > 30) D.shimmer(ctx, x + cw * 0.5, y + ch * 0.25, ch * 0.2, t + i, P.heat, (hot - 0.6) * 1.2);
        if (G.cols * G.rows <= 16) D.text(ctx, 'CORE ' + i, x + 8, y + 12, { size: 9, color: P.text3, weight: 700 });
      });
      // ----- right: L3 pantry, RAM freezer, metronome
      if (!this.mobile) {
        var px0 = w - this.rightW - 6, pw = this.rightW - 10;
        D.box(ctx, px0, A.y, pw, A.h * 0.36, 10, U.rgba(P.panel2, 0.6), U.rgba(P.blueprint, 0.35));
        D.text(ctx, 'CLOCK', px0 + 12, A.y + 14, { size: 10, weight: 700, color: P.text3, ls: 1 });
        var mx = px0 + pw / 2, my = A.y + A.h * 0.3, ml = A.h * 0.22;
        var ang = Math.sin(this.metro * Math.PI) * 0.55;
        D.poly(ctx, [mx - 22, my + 6, mx + 22, my + 6, mx + 10, my - ml - 6, mx - 10, my - ml - 6]); ctx.fillStyle = U.rgba(P.alu, 0.18); ctx.fill();
        D.line(ctx, mx, my, mx + Math.sin(ang) * ml, my - Math.cos(ang) * ml, this.throttled ? P.fault : P.accent, 2.5);
        D.circle(ctx, mx + Math.sin(ang) * ml * 0.7, my - Math.cos(ang) * ml * 0.7, 5, this.throttled ? P.fault : P.accent);
        D.text(ctx, g.toFixed(1) + ' GHz' + (this.throttled ? ' ↓' : ''), mx, my + 20, { size: 12, weight: 700, color: this.throttled ? P.fault : P.text1, align: 'center' });
        var py = A.y + A.h * 0.42;
        D.box(ctx, px0, py, pw, A.h * 0.24, 10, U.rgba(P.panel2, 0.6), U.rgba(P.blueprint, 0.35));
        D.text(ctx, 'L3 PANTRY', px0 + 12, py + 14, { size: 10, weight: 700, color: P.text3, ls: 1 });
        D.text(ctx, 'shared · ~10 ns', px0 + 12, py + 30, { size: 10, color: P.text2 });
        for (var k = 0; k < 6; k++) D.box(ctx, px0 + 12 + k * (pw - 24) / 6, py + 44, (pw - 24) / 6 - 4, A.h * 0.24 - 56, 3, U.rgba(P.data, 0.18));
        var fy2 = A.y + A.h * 0.72;
        D.box(ctx, px0, fy2, pw, A.h * 0.28, 10, U.rgba(P.data, 0.08), U.rgba(P.data, 0.5));
        D.text(ctx, 'RAM FREEZER', px0 + 12, fy2 + 14, { size: 10, weight: 700, color: P.data, ls: 1 });
        D.text(ctx, 'down the hall · ~100 ns', px0 + 12, fy2 + 30, { size: 10, color: P.text2 });
        D.g.cloud && D.box(ctx, px0 + pw * 0.3, fy2 + 42, pw * 0.4, A.h * 0.28 - 54, 4, U.rgba(P.air, 0.15), U.rgba(P.air, 0.5));
      }
      // ----- cake progress banner
      if (this.cake) {
        var bw = Math.min(360, w - 40), bx = (w - bw) / 2, by = this.mobile ? 36 : 14;
        D.meter(ctx, bx, by, bw, 10, 1 - this.cake.left / this.cake.work, P.power);
        D.text(ctx, this.cake.done ? 'CAKE DONE ✓ ' + this.cake.t.toFixed(1) + ' s — extra chefs never helped' : 'ONE GIANT CAKE · only one chef can work on it', w / 2, by + 22, { size: 10, weight: 700, color: P.text2, align: 'center' });
      } else if (!this.mobile) {
        D.text(ctx, '14 orders arrive every second', A.x + A.w / 2, 26, { size: 11, weight: 600, color: P.text2, align: 'center' });
      }
      var waits = this.queue.length;
      this.setDesc(this.cores + ' cores at ' + this.ghz.toFixed(1) + ' GHz' + (this.smt ? ' with SMT' : '') + '. ' + (this.cake ? (this.cake.done ? 'The cake finished in ' + this.cake.t.toFixed(1) + ' s.' : 'Baking one giant cake.') : waits + ' orders waiting.') + (this.throttled ? ' The chip is throttling from heat.' : ''));
    }
  });
})(window.SRV);
