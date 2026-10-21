/* Ch11 · Wind tunnel. Top-down cutaway of a 2U server with a live (simplified) airflow + heat model:
   - airflow: Darcy/potential flow ∇·(K∇φ)=0 on a grid (K = how easily air passes a cell), solved with SOR
     only when the configuration changes; dead fans and missing shrouds change K;
   - heat: semi-Lagrangian advection + diffusion of a temperature grid, heated by CPU, memory and PSUs;
   - ~900 particles ride the velocity field, coloured by the temperature they pass through. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  // ------------------------------------------------------------------ simulation (no DOM)
  S.windSim = function (GW, GH) {
    var N = GW * GH;
    var sim = {
      GW: GW, GH: GH,
      Kx: new Float32Array(N), Ky: new Float32Array(N), kind: new Uint8Array(N), fixed: new Int8Array(N), fanIn: new Int8Array(N),
      phi: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N),
      T: new Float32Array(N), T2: new Float32Array(N),
      nominal: 0, q0: 0, s: 1, ambient: 22, resid: 1, fanFlow: 1, cfg: null
    };
    sim.K = sim.Kx; // "is this cell open" test uses Kx > 0
    // kinds: 0 fluid, 1 solid, 2 heatsink, 3 dimm gap, 4 psu, 5 fan inlet, 6 drive gap, 7 fan outlet
    function rect(x0, y0, x1, y1, fn) {
      var a = Math.round(x0 * GW), b = Math.round(x1 * GW), c = Math.round(y0 * GH), d = Math.round(y1 * GH);
      if (d === c) d = c + 1;
      for (var y = Math.max(0, c); y < Math.min(GH, d); y++) for (var x = Math.max(0, a); x < Math.min(GW, b); x++) fn(y * GW + x, x, y);
    }
    function set(kind, kx, ky) { return function (i) { sim.kind[i] = kind; sim.Kx[i] = kx; sim.Ky[i] = ky == null ? kx : ky; }; }
    var FX0 = 0.30, FX1 = 0.35;
    sim.layout = { drives: [], fans: [], dimms: [], sink: [0.40, 0.38, 0.56, 0.56], shroud: [[0.37, 0.32, 0.60, 0.38], [0.37, 0.56, 0.60, 0.62]], psu: [[0.80, 0.04, 1, 0.165], [0.80, 0.18, 1, 0.31]], cards: [] };
    sim.fanInX = Math.round(FX0 * GW); sim.fanOutX = Math.round(FX1 * GW) - 1;
    sim.build = function (cfg) {
      sim.cfg = cfg;
      sim.Kx.fill(1); sim.Ky.fill(1); sim.kind.fill(0); sim.fixed.fill(0); sim.fanIn.fill(-1);
      rect(0, 0, 1, 0.03, set(1, 0)); rect(0, 0.97, 1, 1, set(1, 0));
      // front drive bays: drives are solid, the thin gaps between them carry their heat away
      sim.layout.drives = [];
      for (var i = 0; i < 4; i++) {
        var y0 = 0.035 + i * 0.235, y1 = y0 + 0.2;
        sim.layout.drives.push([0.012, y0, 0.135, y1, 'drive']);
        rect(0.012, y1, 0.135, y1 + 0.035, set(6, cfg.clogged ? 0.06 : 1, 0.2));
        rect(0.012, y0, 0.135, y1, set(1, 0));
      }
      rect(0.012, 0.03, 0.135, 0.035, set(6, cfg.clogged ? 0.06 : 1, 0.2));
      rect(0.145, 0.03, 0.155, 0.97, function (j, x, y) { if (y % 6 < 4) { sim.kind[j] = 1; sim.Kx[j] = 0; sim.Ky[j] = 0; } });
      // fan wall: each live fan is a pump (fixed low pressure at its inlet, high at its outlet)
      sim.layout.fans = [];
      for (var f = 0; f < 6; f++) {
        var fy0 = 0.03 + f * (0.94 / 6), fy1 = fy0 + 0.94 / 6;
        sim.layout.fans.push([FX0, fy0, FX1, fy1]);
        (function (fi, alive) {
          rect(FX0, fy0, FX1, fy1, function (j, x) {
            if (x === sim.fanInX) { sim.kind[j] = 5; if (alive) { sim.fixed[j] = -1; sim.fanIn[j] = fi; } }
            else if (x === sim.fanOutX) { sim.kind[j] = 7; if (alive) sim.fixed[j] = 1; }
            else { sim.kind[j] = 1; sim.Kx[j] = alive ? 0 : 0.05; sim.Ky[j] = 0; }
          });
        })(f, cfg.fans[f]);
        if (f < 5) rect(FX0 - 0.01, fy1 - 0.009, FX1 + 0.01, fy1 + 0.009, set(1, 0));
      }
      // memory banks: sticks run parallel to airflow; heat goes into the gaps between them
      sim.layout.dimms = [];
      [[0.06, 0.31], [0.63, 0.88]].forEach(function (bank) {
        rect(0.37, bank[0], 0.60, bank[1], set(3, 1, 0.08));
        for (var k = 0; k < 6; k++) {
          var yy = bank[0] + (k + 0.5) * (bank[1] - bank[0]) / 6;
          sim.layout.dimms.push([0.37, yy - 0.007, 0.60, yy + 0.007]);
          rect(0.37, yy - 0.007, 0.60, yy + 0.007, set(1, 0));
        }
      });
      // CPU heatsink: fins let air through front-to-back only
      var s = sim.layout.sink; rect(s[0], s[1], s[2], s[3], set(2, 0.16, 0.02));
      // shroud closes the easy lanes beside the heatsink
      sim.layout.shroud.forEach(function (r) { rect(r[0], r[1], r[2], r[3], cfg.shroud ? set(1, 0) : set(0, 1)); });
      sim.layout.cards = [];
      [0.68, 0.75, 0.82].forEach(function (yy) { sim.layout.cards.push([0.68, yy, 0.95, yy + 0.016]); rect(0.68, yy, 0.95, yy + 0.016, set(1, 0)); });
      sim.layout.psu.forEach(function (r) { rect(r[0], r[1], r[2], r[3], set(4, 0.7, 0.05)); });
      sim.resid = 1;
    };
    function cond(a, b) { return a > 0 && b > 0 ? 2 * a * b / (a + b) : 0; }
    /** SOR on ∇·(K∇φ)=0. Intake/exhaust φ=0; live fans fix φ=∓s at inlet/outlet. */
    sim.solve = function (iters) {
      var Kx = sim.Kx, Ky = sim.Ky, phi = sim.phi, fx = sim.fixed, s = sim.s, w = 1.7, maxd = 0, off = sim.fanOutX - sim.fanInX;
      for (var it = 0; it < iters; it++) {
        maxd = 0;
        for (var y = 1; y < GH - 1; y++) {
          var row = y * GW;
          phi[row] = 0; phi[row + GW - 1] = 0;
          for (var x = 1; x < GW - 1; x++) {
            var i = row + x;
            if (fx[i] > 0) continue; // fan outlet: set together with its inlet
            if (fx[i] < 0) {
              // live fan = pressure jump Δ between its inlet and outlet cells; solve the pair as one node
              var o = i + off, si = 0, sn = 0, so = 0, c;
              c = cond(Kx[i], Kx[i - 1]); si += c; sn += c * phi[i - 1];
              c = cond(Ky[i], Ky[i - GW]); si += c; sn += c * phi[i - GW];
              c = cond(Ky[i], Ky[i + GW]); si += c; sn += c * phi[i + GW];
              c = cond(Kx[o], Kx[o + 1]); so += c; sn += c * phi[o + 1];
              c = cond(Ky[o], Ky[o - GW]); so += c; sn += c * phi[o - GW];
              c = cond(Ky[o], Ky[o + GW]); so += c; sn += c * phi[o + GW];
              if (si + so > 0) { var a = (sn - so * 2 * s) / (si + so); var d0 = a - phi[i]; if (d0 < 0) d0 = -d0; if (d0 > maxd) maxd = d0; phi[i] = a; phi[o] = a + 2 * s; }
              continue;
            }
            if (Kx[i] <= 0 && Ky[i] <= 0) continue;
            var cl = cond(Kx[i], Kx[i - 1]), cr = cond(Kx[i], Kx[i + 1]), cu = cond(Ky[i], Ky[i - GW]), cd = cond(Ky[i], Ky[i + GW]);
            var den = cl + cr + cu + cd; if (den <= 0) continue;
            var nv = phi[i] + w * ((cl * phi[i - 1] + cr * phi[i + 1] + cu * phi[i - GW] + cd * phi[i + GW]) / den - phi[i]);
            var dd = nv - phi[i]; if (dd < 0) dd = -dd; if (dd > maxd) maxd = dd;
            phi[i] = nv;
          }
        }
      }
      sim.resid = maxd;
      return maxd;
    };
    /** flux-consistent velocity; also measures flow through the live fans and adapts fan pressure (fan curve) */
    sim.velocity = function (rpm) {
      var Kx = sim.Kx, Ky = sim.Ky, phi = sim.phi, vmax = 0, q = 0, live = 0;
      for (var y = 1; y < GH - 1; y++) for (var x = 0; x < GW; x++) {
        var i = y * GW + x;
        if (Kx[i] <= 0 && Ky[i] <= 0) { sim.vx[i] = 0; sim.vy[i] = 0; continue; }
        var fl = x > 0 ? cond(Kx[i], Kx[i - 1]) * (phi[i - 1] - phi[i]) : 0;
        var fr = x < GW - 1 ? cond(Kx[i], Kx[i + 1]) * (phi[i] - phi[i + 1]) : 0;
        if (x === 0) fl = fr; if (x === GW - 1) fr = fl;
        var fu = cond(Ky[i], Ky[i - GW]) * (phi[i - GW] - phi[i]), fd = cond(Ky[i], Ky[i + GW]) * (phi[i] - phi[i + GW]);
        var vx = 0.5 * (fl + fr), vy = 0.5 * (fu + fd);
        sim.vx[i] = vx; sim.vy[i] = vy;
        if (sim.kind[i] === 7 && sim.fixed[i]) { q += vx; live++; }
        var sp = (vx < 0 ? -vx : vx) + (vy < 0 ? -vy : vy); if (sp > vmax) vmax = sp;
      }
      var perFan = live ? q / live : 0;
      if (!sim.nominal) { sim.nominal = vmax || 1; sim.q0 = perFan || 1; }
      // fan curve: the more air a fan is asked to move, the less pressure it makes
      var target = U.clamp(rpm * (1.5 - 0.5 * perFan / (sim.q0 * Math.max(rpm, 0.3))), 0.15, 1.8);
      sim.s += (target - sim.s) * 0.25;
      sim.fanFlow = sim.q0 ? q / (sim.q0 * 6) : 1;
      var scale = GW * 0.5 / sim.nominal;
      for (var n = 0; n < N; n++) { sim.vx[n] *= scale; sim.vy[n] *= scale; }
    };
    function bilinear(F, x, y) {
      if (x < 0) x = 0; if (y < 0) y = 0; if (x > GW - 1.001) x = GW - 1.001; if (y > GH - 1.001) y = GH - 1.001;
      var x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * GW + x0;
      return (F[i] * (1 - fx) + F[i + 1] * fx) * (1 - fy) + (F[i + GW] * (1 - fx) + F[i + GW + 1] * fx) * fy;
    }
    sim.bilinear = bilinear;
    var counts = null;
    /** heat step. p: {cpuW, load, ambient} */
    sim.step = function (dt, p) {
      var T = sim.T, T2 = sim.T2, Kx = sim.Kx, Ky = sim.Ky, kind = sim.kind, amb = p.ambient;
      if (!counts || counts.cfg !== sim.cfg) {
        counts = { cfg: sim.cfg, c: [0, 0, 0, 0, 0, 0, 0, 0] };
        for (var n = 0; n < N; n++) counts.c[kind[n]]++;
      }
      var c = counts.c, H = 3.0;
      var q2 = H * p.cpuW * (0.12 + 0.88 * p.load) / c[2], q3 = H * 110 * (0.35 + 0.65 * p.load) / Math.max(1, c[3]);
      var q4 = H * 70 / Math.max(1, c[4]), q6 = H * 36 / Math.max(1, c[6]);
      for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
        var i = y * GW + x;
        if ((Kx[i] <= 0 && Ky[i] <= 0) || x === 0) { T2[i] = amb; continue; }
        var ta = bilinear(T, x - sim.vx[i] * dt, y - sim.vy[i] * dt);
        // conductance-weighted diffusion: heat spreads only where air can actually move
        var Ti = T[i], lap = 0, cc;
        cc = Math.min(1, cond(Kx[i], Kx[i - 1])); lap += cc * (T[i - 1] - Ti);
        if (x < GW - 1) { cc = Math.min(1, cond(Kx[i], Kx[i + 1])); lap += cc * (T[i + 1] - Ti); }
        if (y > 0) { cc = Math.min(1, cond(Ky[i], Ky[i - GW])); lap += cc * (T[i - GW] - Ti); }
        if (y < GH - 1) { cc = Math.min(1, cond(Ky[i], Ky[i + GW])); lap += cc * (T[i + GW] - Ti); }
        var kd = kind[i];
        var q = kd === 2 ? q2 : kd === 3 ? q3 : kd === 4 ? q4 : kd === 6 ? q6 : 0;
        var v = ta + 0.05 * lap + q * dt - (Ti - amb) * 0.01 * dt;
        T2[i] = v > 150 ? 150 : v;
      }
      sim.T = T2; sim.T2 = T;
    };
    sim.avgT = function (kd) { var s = 0, c = 0; for (var n = 0; n < N; n++) if (sim.kind[n] === kd) { s += sim.T[n]; c++; } return c ? s / c : sim.ambient; };
    /** die temperature = heatsink air temperature + die-to-heatsink offset */
    sim.cpuTemp = function (cpuW, load) {
      var mx = 0, s = 0, c = 0; for (var n = 0; n < N; n++) if (sim.kind[n] === 2) { s += sim.T[n]; c++; if (sim.T[n] > mx) mx = sim.T[n]; }
      return (c ? s / c : 22) * 0.6 + mx * 0.4 + cpuW * (0.12 + 0.88 * load) * 0.085;
    };
    sim.reset = function (amb) { sim.T.fill(amb); sim.T2.fill(amb); sim.phi.fill(0); sim.nominal = 0; sim.s = 1; };
    return sim;
  };

  // ------------------------------------------------------------------ visual
  if (!S.defineVisual) return;
  S.defineVisual('wind', {
    continuous: true,
    init: function () {
      this.bg = this.layer();
      this.fx = this.layer();
      this.cfg = { fans: [true, true, true, true, true, true], shroud: true, clogged: false };
      this.load = 0.7; this.cpuW = S.build.get().cpuTdp || 280; this.rpm = 0.6; this.auto = true; this.angle = 0; this.temp = 40;
      // sound: the fan wall hums (pitch and level follow rpm) and the air it moves is a noise bed
      // whose level follows airflow and whose brightness drops when the intake is clogged
      this.vHum = S.audio.voice('hum', 0.55);
      this.vWind = S.audio.voice('wind', 0.7);
      var self = this;
      var g1 = this.ui.group('Break the airflow');
      this.bFan = g1.button('✕ Fail fan 3', function () { self.toggleFan(2); }, { kind: 'danger' });
      this.tShroud = g1.toggle({ label: 'Air shroud', value: true, onChange: function (v) { self.cfg.shroud = v; self.rebuild(); self.announce(v ? 'Air shroud installed: air is forced through the heatsink.' : 'Air shroud removed: air sneaks around the heatsink. Watch the CPU temperature climb.'); } });
      this.tClog = g1.toggle({ label: 'Clogged / blocked intake', value: false, onChange: function (v) { self.cfg.clogged = v; self.rebuild(); if (v) S.haptics.fail('fail'); self.announce(v ? 'The front intake is blocked by dust or a wall: every fan struggles and the whole server heats up.' : 'Intake cleared.'); } });
      this.ui.br();
      var g2 = this.ui.group('Load');
      g2.slider({ label: 'CPU load', min: 0, max: 100, step: 1, value: 70, fmt: function (v) { return v + '%'; }, onInput: function (v) { self.load = v / 100; } });
      g2.slider({ label: 'CPU TDP', min: 65, max: 400, step: 5, value: this.cpuW, fmt: function (v) { return v + ' W'; }, onInput: function (v) { self.cpuW = v; } });
      g2.button('↺ Fix everything', function () { self.cfg = { fans: [true, true, true, true, true, true], shroud: true, clogged: false }; self.tShroud.set(true); self.tClog.set(false); self.rebuild(); });
      this.ui.br();
      this.rCpu = this.ui.readout('CPU', '–');
      this.rFan = this.ui.readout('Fans', '–');
      this.rState = this.ui.readout('Status', 'OK', 'ok');
      this.pointer({
        down: function (p) { var it = self.hits.query(p.x, p.y); if (it && it.id.indexOf('fan') === 0) self.toggleFan(it.data); return false; },
        hover: function (p) {
          var it = self.hits.query(p.x, p.y);
          self.stage.style.cursor = it ? 'pointer' : '';
          if (it) self.tipAt('<b>Fan ' + (it.data + 1) + '</b>' + (self.cfg.fans[it.data] ? 'Click to make it fail' : 'Dead — click to replace'), p.x, p.y); else self.tipAt(null);
        }
      });
    },
    toggleFan: function (i) {
      this.cfg.fans[i] = !this.cfg.fans[i];
      this.bFan.setLabel(this.cfg.fans[2] ? '✕ Fail fan 3' : '↺ Replace fan 3');
      this.rebuild();
      if (this.cfg.fans[i]) S.audio.play('clack', { level: 0.6 });
      else { S.audio.play('fanFail', { rate: 0.9 + i * 0.04 }); S.haptics.fail('fail'); }
      this.announce(this.cfg.fans[i] ? 'Fan ' + (i + 1) + ' replaced.' : 'Fan ' + (i + 1) + ' failed. Its lane goes still and a hot pocket forms behind it; the other fans ramp up.');
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      // mobile runs the chassis vertically (front at top): the sim stays horizontal and drawing rotates
      var GW = this.mobile ? 72 : 96, GH = this.mobile ? 48 : 54;
      if (!this.sim || this.sim.GW !== GW) {
        this.sim = S.windSim(GW, GH);
        this.sim.reset(22);
        this.sim.build({ fans: [true, true, true, true, true, true], shroud: true, clogged: false });
        for (var it0 = 0; it0 < 30; it0++) { this.sim.solve(20); this.sim.velocity(1); }
        this.sim.build(this.cfg); for (var it1 = 0; it1 < 20; it1++) { this.sim.solve(20); this.sim.velocity(this.rpm); }
        for (var k = 0; k < 600; k++) this.sim.step(1 / 30, { cpuW: this.cpuW, load: this.load, ambient: 22 });
        this.temp = this.sim.cpuTemp(this.cpuW, this.load);
        this.heatC = document.createElement('canvas'); this.heatC.width = this.sim.GW; this.heatC.height = this.sim.GH;
        this.heatCtx = this.heatC.getContext('2d'); this.img = this.heatCtx.createImageData(this.sim.GW, this.sim.GH);
        this.img32 = new Uint32Array(this.img.data.buffer);
        var NP = S.q(this.mobile ? 380 : 900);
        this.pts = { x: new Float32Array(NP), y: new Float32Array(NP), px: new Float32Array(NP), py: new Float32Array(NP), life: new Float32Array(NP), n: NP };
        for (var i = 0; i < NP; i++) this.respawn(i, true);
      }
      // drawing transform: sim grid → stage rect (rotated 90° on mobile)
      var pad = this.mobile ? 10 : 16, top = this.mobile ? 34 : 14, bottom = this.mobile ? 60 : 30;
      this.box = { x: pad + (this.mobile ? 0 : 0), y: top, w: w - pad * 2, h: h - top - bottom };
      this.drawStatic();
    },
    rebuild: function () { this.sim.build(this.cfg); this.solving = 60; this.drawStatic(); },
    respawn: function (i, anywhere) {
      var sim = this.sim, P = this.pts;
      for (var tries = 0; tries < 20; tries++) {
        var x = anywhere ? this.rng.float() * (sim.GW - 1) : 0.2 + this.rng.float() * 0.5, y = 1 + this.rng.float() * (sim.GH - 2);
        if (sim.K[(y | 0) * sim.GW + (x | 0)] > 0) { P.x[i] = P.px[i] = x; P.y[i] = P.py[i] = y; P.life[i] = 2 + this.rng.float() * 4; return; }
      }
      P.x[i] = P.px[i] = 0.3; P.y[i] = P.py[i] = sim.GH / 2; P.life[i] = 1;
    },
    // grid → screen
    toS: function (gx, gy, out) {
      var B = this.box, sim = this.sim;
      if (this.mobile) { out[0] = B.x + (1 - gy / sim.GH) * B.w; out[1] = B.y + (gx / sim.GW) * B.h; }
      else { out[0] = B.x + (gx / sim.GW) * B.w; out[1] = B.y + (gy / sim.GH) * B.h; }
      return out;
    },
    rectS: function (r) { // fractional rect → screen rect
      var a = this.toS(r[0] * this.sim.GW, r[1] * this.sim.GH, [0, 0]), b = this.toS(r[2] * this.sim.GW, r[3] * this.sim.GH, [0, 0]);
      return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
    },
    update: function (dt) {
      var sim = this.sim; if (!sim) return;
      sim.solve(this.solving > 0 ? 24 : 6); if (this.solving > 0) this.solving--;
      // fan curve: fans speed up as the CPU warms; dead fans make the rest work harder
      var alive = this.cfg.fans.filter(Boolean).length;
      var want = U.clamp(U.remap(this.temp, 45, 85, 0.45, 1), 0.45, 1) + (6 - alive) * 0.08;
      this.rpm = U.damp(this.rpm, U.clamp(want, 0.3, 1), 1.5, dt);
      sim.velocity(this.rpm);
      // throttling: above ~95 °C the CPU cuts its own clock, which cuts its heat
      this.eff = U.damp(this.eff == null ? this.load : this.eff, this.temp > 95 ? this.load * 0.45 : this.load, 1.2, dt);
      for (var k = 0; k < 2; k++) sim.step(1 / 60, { cpuW: this.cpuW, load: this.eff, ambient: 22 });
      this.temp = Math.min(104, U.damp(this.temp, sim.cpuTemp(this.cpuW, this.eff), 3, dt));
      // particles: RK2 through the velocity field
      var P = this.pts, n = P.n, GW = sim.GW, GH = sim.GH;
      for (var i = 0; i < n; i++) {
        var x = P.x[i], y = P.y[i];
        P.px[i] = x; P.py[i] = y;
        var vx = sim.bilinear(sim.vx, x, y), vy = sim.bilinear(sim.vy, x, y);
        var mx = x + vx * dt * 0.5, my = y + vy * dt * 0.5;
        vx = sim.bilinear(sim.vx, mx, my); vy = sim.bilinear(sim.vy, mx, my);
        x += vx * dt; y += vy * dt;
        P.life[i] -= dt;
        var ci = (y | 0) * GW + (x | 0);
        if (sim.fixed[ci] < 0) { x = sim.fanOutX + 0.6; P.px[i] = x - 0.5; ci = (y | 0) * GW + (x | 0); }
        if (x >= GW - 1 || x < 0 || y < 0.5 || y > GH - 1.5 || P.life[i] <= 0 || sim.K[ci] <= 0 || (Math.abs(vx) + Math.abs(vy) < 0.02 && this.rng.chance(0.05))) { this.respawn(i, false); continue; }
        P.x[i] = x; P.y[i] = y;
      }
      this.angle += dt * (6 + 30 * this.rpm);
      // sound follows the simulation: pitch tracks rpm, the hum thins as fans die, airflow scales
      // with the fan wall's live area and is muffled by a clogged intake
      var flow = this.rpm * (0.35 + 0.65 * alive / 6) * (this.cfg.clogged ? 0.45 : 1);
      this.vHum.set({ rate: 0.55 + 0.75 * this.rpm, level: (0.25 + 0.75 * this.rpm) * (0.4 + 0.6 * alive / 6), lp: 2500 + 6000 * this.rpm });
      this.vWind.set({ rate: 0.85 + 0.3 * this.rpm, level: flow, lp: this.cfg.clogged ? 500 : 900 + 2600 * flow });
      var thr = this.temp > 95;
      this.rCpu.set(Math.round(this.temp) + ' °C', this.temp > 95 ? 'bad' : this.temp > 82 ? 'warn' : 'ok');
      this.rFan.set(Math.round(4000 + 12000 * this.rpm) + ' rpm', this.rpm > 0.9 ? 'warn' : '');
      this.rState.set(thr ? 'THROTTLING' : this.temp > 82 ? 'HOT' : 'OK', thr ? 'bad' : this.temp > 82 ? 'warn' : 'ok');
      if (thr && !this._thrAnn) { this._thrAnn = true; S.audio.play('alarm', { level: 0.5 }); S.haptics.fail('critical'); this.announce('CPU above 95 degrees: it throttles its clock speed to protect itself.'); }
      if (!thr) this._thrAnn = false;
    },
    drawStatic: function () {
      var ctx = this.bg, w = this.w, h = this.h, P = S.pal, B = this.box, self = this, sim = this.sim;
      if (!sim || !w) return;
      D.clear(ctx, w, h);
      D.box(ctx, B.x - 4, B.y - 4, B.w + 8, B.h + 8, 8, null, U.rgba(P.steel, 0.9), 3);
      var L = sim.layout;
      // labels for front/rear
      if (this.mobile) {
        D.text(ctx, 'FRONT · cool air in ↓', w / 2, B.y - 14, { size: 10, weight: 700, color: P.air, align: 'center' });
        D.text(ctx, 'REAR · hot air out ↓', w / 2, B.y + B.h + 14, { size: 10, weight: 700, color: P.heat, align: 'center' });
      } else {
        D.text(ctx, 'FRONT → cool air in', B.x, B.y + B.h + 14, { size: 10, weight: 700, color: P.air });
        D.text(ctx, 'hot air out → REAR', B.x + B.w, B.y + B.h + 14, { size: 10, weight: 700, color: P.heat, align: 'right' });
      }
    },
    draw: function () {
      var ctx = this.fx, w = this.w, h = this.h, P = S.pal, sim = this.sim, B = this.box, self = this;
      if (!sim) return;
      D.clear(ctx, w, h);
      // heat field → tiny image → upscaled (free bilinear blur)
      var T = sim.T, img = this.img32, lut = U.heatLUT, N = sim.GW * sim.GH;
      for (var i = 0; i < N; i++) { var k = ((T[i] - 20) * 3.1875) | 0; img[i] = lut[k < 0 ? 0 : k > 255 ? 255 : k]; }
      this.heatCtx.putImageData(this.img, 0, 0);
      ctx.save(); ctx.imageSmoothingEnabled = true;
      if (this.mobile) { ctx.translate(B.x + B.w, B.y); ctx.rotate(Math.PI / 2); ctx.drawImage(this.heatC, 0, 0, B.h, B.w); }
      else ctx.drawImage(this.heatC, B.x, B.y, B.w, B.h);
      ctx.restore();
      var L = sim.layout, r;
      // drives
      L.drives.forEach(function (d, i) {
        r = self.rectS(d);
        D.box(ctx, r.x, r.y, r.w, r.h, 3, U.rgba(P.plastic, 0.95), U.rgba(P.alu, 0.4)); D.led(ctx, r.x + 6, r.y + 6, P.ok, 'activity', self.time + i, 1.8);
      });
      // DIMMs
      L.dimms.forEach(function (d) { r = self.rectS(d); ctx.fillStyle = P.pcb; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.fillStyle = U.rgba(P.gold, 0.8); ctx.fillRect(r.x, r.y, self.mobile ? r.w : 3, self.mobile ? 3 : r.h); });
      // heatsink fins
      r = this.rectS(L.sink);
      D.box(ctx, r.x, r.y, r.w, r.h, 3, U.rgba(P.alu, 0.25), U.rgba(P.alu, 0.9), 1.2);
      ctx.strokeStyle = U.rgba(P.alu, 0.55); ctx.lineWidth = 1; ctx.beginPath();
      if (this.mobile) for (var fx = r.x + 4; fx < r.x + r.w; fx += 5) { ctx.moveTo(fx, r.y + 2); ctx.lineTo(fx, r.y + r.h - 2); }
      else for (var fy = r.y + 4; fy < r.y + r.h; fy += 5) { ctx.moveTo(r.x + 2, fy); ctx.lineTo(r.x + r.w - 2, fy); }
      ctx.stroke();
      D.text(ctx, 'CPU', r.x + r.w / 2, r.y + r.h / 2, { size: 11, weight: 800, color: P.text1, align: 'center' });
      // shroud walls
      L.shroud.forEach(function (sr) { r = self.rectS(sr); if (self.cfg.shroud) D.box(ctx, r.x, r.y, r.w, r.h, 2, U.rgba(P.blueprint, 0.55), P.blueprint, 1); else { ctx.setLineDash([3, 3]); D.box(ctx, r.x, r.y, r.w, r.h, 2, null, U.rgba(P.blueprint, 0.5), 1); ctx.setLineDash([]); } });
      // cards + PSUs
      L.cards.forEach(function (c) { r = self.rectS(c); ctx.fillStyle = P.pcb; ctx.fillRect(r.x, r.y, r.w, r.h); });
      L.psu.forEach(function (ps, i) { r = self.rectS(ps); D.box(ctx, r.x, r.y, r.w, r.h, 3, U.rgba(P.steel, 0.55), U.rgba(P.power, 0.7), 1); D.text(ctx, 'PSU ' + (i + 1), r.x + r.w / 2, r.y + r.h / 2, { size: 9, weight: 700, color: P.power, align: 'center' }); });
      // particles: streaks batched into 6 colour buckets by temperature
      var Pp = this.pts, a = [0, 0], b = [0, 0], buckets = 6;
      ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      for (var bk = 0; bk < buckets; bk++) {
        var lo = 22 + bk * 12, hi = bk === buckets - 1 ? 999 : lo + 12;
        ctx.beginPath();
        for (var p = 0; p < Pp.n; p++) {
          var tt = sim.bilinear(sim.T, Pp.x[p], Pp.y[p]);
          if (tt < lo || tt >= hi) continue;
          this.toS(Pp.px[p], Pp.py[p], a); this.toS(Pp.x[p], Pp.y[p], b);
          var dx = b[0] - a[0], dy = b[1] - a[1];
          ctx.moveTo(a[0] - dx * 2, a[1] - dy * 2); ctx.lineTo(b[0], b[1]);
        }
        ctx.strokeStyle = bk === 0 ? U.rgba(P.air, 0.85) : U.rgba(U.heatColor(lo + 8), 0.9);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      // fans (clickable)
      this.hits.clear();
      L.fans.forEach(function (f, i) {
        r = self.rectS(f);
        var alive = self.cfg.fans[i], cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = Math.min(r.w, r.h) * 0.46;
        D.fan2d(ctx, cx, cy, rad, alive ? self.angle + i : i * 0.7, { blur: alive && self.rpm > 0.55 && !self.reduced() ? 1 : 0, color: alive ? P.plastic : U.mix(P.plastic, P.fault, 0.4) });
        if (!alive) D.g.cross(ctx, cx, cy, rad * 1.3, P.fault);
        self.hits.circle('fan' + i, cx, cy, Math.max(rad, 14), i);
      });
      // CPU gauge
      var gx = this.mobile ? w - 46 : B.x + B.w * 0.5, gy = this.mobile ? h - 30 : B.y + B.h + 2;
      if (!this.mobile) {
        var sr2 = this.rectS(L.sink);
        D.leader(ctx, sr2.x + sr2.w, sr2.y, sr2.x + sr2.w + 70, sr2.y - 26, Math.round(this.temp) + ' °C', { color: this.temp > 95 ? P.fault : this.temp > 82 ? P.warn : P.ok, sub: this.temp > 95 ? 'THROTTLING' : 'CPU die' });
      } else {
        D.text(ctx, 'CPU ' + Math.round(this.temp) + ' °C' + (this.temp > 95 ? ' · THROTTLING' : ''), 14, h - 22, { size: 12, weight: 800, color: this.temp > 95 ? P.fault : this.temp > 82 ? P.warn : P.ok });
      }
      // noise rings around the fan wall
      var fr = this.rectS([0.235, 0.03, 0.285, 0.97]);
      var nr = 6 + this.rpm * 18;
      for (var q = 0; q < 2; q++) {
        var ph = ((this.time * (0.6 + this.rpm) + q * 0.5) % 1);
        ctx.strokeStyle = U.rgba(P.text3, (1 - ph) * 0.35 * this.rpm); ctx.lineWidth = 1;
        if (this.mobile) { ctx.beginPath(); ctx.moveTo(fr.x, fr.y - 4 - ph * nr); ctx.lineTo(fr.x + fr.w, fr.y - 4 - ph * nr); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(fr.x - 4 - ph * nr, fr.y); ctx.lineTo(fr.x - 4 - ph * nr, fr.y + fr.h); ctx.stroke(); }
      }
      this.setDesc('CPU at ' + Math.round(this.temp) + ' °C with ' + this.cfg.fans.filter(Boolean).length + ' of 6 fans, shroud ' + (this.cfg.shroud ? 'on' : 'off') + ', intake ' + (this.cfg.clogged ? 'clogged' : 'clear') + '.');
    }
  });
})(window.SRV);
