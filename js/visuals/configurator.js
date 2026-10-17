/* Ch20 · Configurator. Pick a workload and parts; a chain of pipes (network, CPU, memory, storage, GPU)
   shows each part's capacity relative to what the workload needs. The narrowest pipe is the bottleneck.
   Beside it the server assembles from your choices; power on to finish. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso, M = S.models;
  var Dt = S.data;
  var RAM = [16, 32, 64, 128, 256, 512, 1024];
  var NIC = [1, 2.5, 10, 25, 100];

  S.defineVisual('configurator', {
    continuous: true,
    init: function () {
      this.bg = this.layer();
      this.ctx = this.layer();
      var b = S.build.get();
      this.c = { workload: Dt.workloads[b.workload] ? b.workload : 'vm', users: 200, dataTB: 4, cpu: 2, ram: 4, sto: 2, drives: 4, nic: 2, gpu: 0 };
      this.power = 0; this.flowT = 0; this.ratios = {}; this.parts = null; this.yaw = 0;
      var self = this;
      var g0 = this.ui.group('Workload');
      this.sWork = g0.select({ label: 'Workload', options: Object.keys(Dt.workloads).map(function (k) { return [k, Dt.workloads[k].label]; }), value: this.c.workload, onChange: function (v) { self.c.workload = v; self.autoPick(); } });
      g0.slider({ label: 'Users', min: 10, max: 5000, step: 10, value: 200, fmt: function (v) { return U.fmt(v); }, onInput: function (v) { self.c.users = v; self.recalc(); } });
      g0.slider({ label: 'Data', min: 0.5, max: 200, step: 0.5, value: 4, fmt: function (v) { return v + ' TB'; }, onInput: function (v) { self.c.dataTB = v; self.recalc(); } });
      g0.button('✨ Auto-pick parts', function () { self.autoPick(); }, { kind: 'primary' });
      this.ui.br();
      var g1 = this.ui.group('Parts');
      this.sCpu = g1.select({ label: 'CPU', options: Dt.parts.cpu.map(function (c, i) { return [i, c.label]; }), value: this.c.cpu, onChange: function (v) { self.c.cpu = +v; self.recalc(); } });
      this.sRam = g1.select({ label: 'RAM', options: RAM.map(function (g, i) { return [i, g + ' GB']; }), value: this.c.ram, onChange: function (v) { self.c.ram = +v; self.recalc(); } });
      this.sSto = g1.select({ label: 'Drives', options: Dt.parts.storage.map(function (s, i) { return [i, s.label]; }), value: this.c.sto, onChange: function (v) { self.c.sto = +v; self.recalc(); } });
      this.sCnt = g1.select({ label: '×', options: [2, 4, 6, 8, 12].map(function (n) { return [n, n + ' drives']; }), value: this.c.drives, onChange: function (v) { self.c.drives = +v; self.recalc(); } });
      this.sNic = g1.select({ label: 'Network', options: NIC.map(function (n, i) { return [i, n + ' GbE']; }), value: this.c.nic, onChange: function (v) { self.c.nic = +v; self.recalc(); } });
      this.sGpu = g1.select({ label: 'GPU', options: Dt.parts.gpu.map(function (g, i) { return [i, g.label]; }), value: this.c.gpu, onChange: function (v) { self.c.gpu = +v; self.recalc(); } });
      this.ui.br();
      this.bPower = this.ui.button('⏻ Power on', function () { self.powerOn(); }, { kind: 'primary' });
      this.ui.button('⧉ Copy spec sheet', function (e, btn) { self.copySpec(btn); });
      this.ui.spacer();
      this.rBott = this.ui.readout('Bottleneck', '–');
      this.rW = this.ui.readout('Power', '–');
      this.rCost = this.ui.readout('Approx. cost', '–');
      this.autoPick();
    },
    autoPick: function () {
      var w = Dt.workloads[this.c.workload], n = w.need, uf = this.userF(), self = this;
      var cpuNeed = n.cpu * uf;
      var ci = Dt.parts.cpu.findIndex(function (c) { return self.c.workload === 'game' ? c.ghz >= 5.4 && c.cores >= cpuNeed : c.cores * c.ghz / 3.5 >= cpuNeed * 1.1; });
      this.c.cpu = ci < 0 ? Dt.parts.cpu.length - 1 : ci;
      var ramNeed = this.ramNeed();
      var ri = RAM.findIndex(function (g) { return g >= ramNeed * 1.15; }); this.c.ram = ri < 0 ? RAM.length - 1 : ri;
      var tbNeed = this.tbNeed(), iopsNeed = n.iops * uf;
      var best = null;
      Dt.parts.storage.forEach(function (s, i) {
        [2, 4, 6, 8, 12].forEach(function (cnt) {
          var usable = s.tb * cnt * (cnt >= 4 ? (cnt - 2) / cnt : 0.5);
          if (usable >= tbNeed * 1.1 && s.iops * cnt * 0.6 >= iopsNeed) { var cost = s.price * cnt; if (!best || cost < best.cost) best = { i: i, cnt: cnt, cost: cost }; }
        });
      });
      if (!best) best = { i: 3, cnt: 12 };
      this.c.sto = best.i; this.c.drives = best.cnt;
      var ni = NIC.findIndex(function (g) { return g >= n.net * Math.pow(uf, 0.7); }); this.c.nic = ni < 0 ? NIC.length - 1 : ni;
      var gi = Dt.parts.gpu.findIndex(function (g) { return g.vram >= n.vram * (n.vram ? 1 : 0); });
      this.c.gpu = n.vram ? (gi < 0 ? Dt.parts.gpu.length - 1 : gi) : 0;
      [[this.sCpu, this.c.cpu], [this.sRam, this.c.ram], [this.sSto, this.c.sto], [this.sCnt, this.c.drives], [this.sNic, this.c.nic], [this.sGpu, this.c.gpu]].forEach(function (p) { p[0].set(p[1]); });
      this.recalc();
      this.announce('Picked balanced parts for ' + w.label + '.');
    },
    userF: function () { return Math.pow(this.c.users / 200, 0.8); },
    ramNeed: function () { var n = Dt.workloads[this.c.workload].need; return n.ram * Math.pow(this.userF(), 0.5) * (this.c.workload === 'db' ? Math.max(1, this.c.dataTB / 8) : 1); },
    tbNeed: function () { return Math.max(Dt.workloads[this.c.workload].need.tb * 0.25, this.c.dataTB) * 1.5; },
    recalc: function () {
      var c = this.c, w = Dt.workloads[c.workload], n = w.need, uf = this.userF();
      var cpu = Dt.parts.cpu[c.cpu], sto = Dt.parts.storage[c.sto], gpu = Dt.parts.gpu[c.gpu], ram = RAM[c.ram], nic = NIC[c.nic];
      var usable = sto.tb * c.drives * (c.drives >= 4 ? (c.drives - 2) / c.drives : 0.5);
      var r = {};
      r.cpu = c.workload === 'game' ? Math.min(cpu.ghz / 5.0, cpu.cores / Math.max(1, n.cpu * uf)) * 1.15 : (cpu.cores * cpu.ghz / 3.5) / (n.cpu * uf);
      r.ram = ram / this.ramNeed();
      var rCap = usable / this.tbNeed(), rIops = (sto.iops * c.drives * 0.6) / (n.iops * uf);
      r.storage = Math.min(rCap, rIops); this.stoWhy = rCap < rIops ? 'capacity' : 'speed (IOPS)';
      r.net = nic / (n.net * Math.pow(uf, 0.7));
      r.gpu = n.vram ? gpu.vram / n.vram : null;
      this.ratios = r;
      var keys = ['net', 'cpu', 'ram', 'storage', 'gpu'].filter(function (k) { return r[k] != null; });
      var bott = keys.reduce(function (a, k) { return r[k] < r[a] ? k : a; }, keys[0]);
      this.bott = bott; this.flow = Math.min(1, r[bott]);
      // power, cost, chassis
      var dimms = Math.min(cpu.ch * 2, Math.max(cpu.ch, Math.ceil(ram / 64)));
      this.dimms = dimms;
      var watts = cpu.tdp + dimms * 10 + c.drives * sto.w + gpu.w + 6 * 15 + (nic >= 25 ? 25 : 12) + 50;
      this.watts = watts;
      this.units = gpu.w >= 350 || c.drives > 12 ? 4 : (c.drives > 4 || gpu.w > 75 ? 2 : 1);
      var cost = 1400 + this.units * 300 + cpu.price + ram * 6 + sto.price * c.drives + gpu.price + (nic >= 25 ? 450 : nic >= 10 ? 220 : 0) + (watts > 900 ? 600 : 400);
      this.cost = cost;
      var names = { net: 'Network', cpu: 'CPU', ram: 'Memory', storage: 'Storage ' + this.stoWhy, gpu: 'GPU memory' };
      this.rBott.set(r[bott] >= 1 ? 'none ✓' : names[bott], r[bott] >= 1 ? 'ok' : r[bott] < 0.6 ? 'bad' : 'warn');
      this.rW.set(watts + ' W → 2×' + (Math.ceil(watts * 1.25 / 100) * 100) + ' W PSU');
      this.rCost.set('≈ $' + U.fmt(Math.round(cost / 100) * 100));
      this.parts = M.server({ drives: Math.min(12, c.drives), dimms: Math.min(12, dimms), gpu: gpu.w > 0, cut: true, ssd: sto.id !== 'hdd' });
      S.build.set({ workload: c.workload, cpuTdp: cpu.tdp, cpuCores: cpu.cores, dimms: dimms, dimmGb: Math.round(ram / dimms), drives: c.drives, driveW: sto.w, gpuW: gpu.w, nicW: nic >= 25 ? 25 : 12 });
      this.drawStatic();
      this.invalidate();
    },
    powerOn: function () {
      var self = this;
      this.power = 0;
      this.tween({ from: 0, to: 1, dur: 2.4, ease: 'inOutSine', onUpdate: function (v) { self.power = v; }, onDone: function () { S.markDone(20); } });
      this.announce('Power on: fans spin up, lights cascade and your server starts answering requests. ' + (this.ratios[this.bott] >= 1 ? 'Balanced build — no bottleneck.' : 'Bottleneck: ' + this.bott + '.'));
    },
    copySpec: function (btn) {
      var c = this.c, cpu = Dt.parts.cpu[c.cpu], sto = Dt.parts.storage[c.sto], gpu = Dt.parts.gpu[c.gpu];
      var txt = ['My server — ' + Dt.workloads[c.workload].label, 'CPU: ' + cpu.label, 'Memory: ' + RAM[c.ram] + ' GB ECC DDR5 (' + this.dimms + ' DIMMs)', 'Storage: ' + c.drives + ' × ' + sto.label,
        'Network: ' + NIC[c.nic] + ' GbE', 'GPU: ' + gpu.label, 'Chassis: ' + this.units + 'U, 2 × ' + (Math.ceil(this.watts * 1.25 / 100) * 100) + ' W redundant PSUs', 'Max power ≈ ' + this.watts + ' W', 'Approx. cost ≈ $' + U.fmt(Math.round(this.cost / 100) * 100) + ' (late-2026 estimate)'].join('\n');
      var done = function () { btn.setLabel('✓ Copied'); setTimeout(function () { btn.setLabel('⧉ Copy spec sheet'); }, 1600); };
      try { navigator.clipboard.writeText(txt).then(done, function () { window.prompt('Copy your spec sheet:', txt); }); } catch (e) { window.prompt('Copy your spec sheet:', txt); }
    },
    resize: function (w, h) { this.mobile = w < 640; this.drawStatic(); },
    drawStatic: function () { /* pipes + server are drawn every frame (animated); nothing static yet */ if (this.bg && this.w) D.clear(this.bg, this.w, this.h); },
    update: function (dt) { this.flowT += dt * (0.4 + this.flow * 1.6); if (this.power >= 1) this.yaw = Math.sin(this.time * 0.4) * 0.12; },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, r = this.ratios, self = this, t = this.time, mob = this.mobile;
      D.clear(ctx, w, h);
      // ---------------- pipes
      var keys = [['net', 'NETWORK', P.net], ['cpu', 'CPU', P.accent], ['ram', 'MEMORY', P.data], ['storage', 'STORAGE', P.power], ['gpu', 'GPU', P.mgmt]];
      var px = 20, pw = mob ? w - 40 : w * 0.46, py = mob ? 26 : 40, ph = mob ? h * 0.42 : h - 70;
      var rowH = ph / keys.length;
      D.text(ctx, 'CAPACITY ÷ WHAT YOUR WORKLOAD NEEDS', px, py - 14, { size: 10, weight: 700, color: P.text3, ls: 1 });
      keys.forEach(function (k, i) {
        var ratio = r[k[0]], y = py + i * rowH + rowH / 2;
        var na = ratio == null;
        var thick = na ? 4 : U.clamp(ratio, 0.08, 2) / 2 * (rowH * 0.62);
        var isB = k[0] === self.bott && !na && ratio < 1;
        D.text(ctx, k[1], px, y - thick / 2 - 9, { size: 10, weight: 700, color: isB ? P.fault : P.text2 });
        D.text(ctx, na ? 'not needed' : (ratio >= 2 ? '2×+' : ratio.toFixed(1) + '×') + (isB ? '  ← BOTTLENECK' : ratio >= 1 ? '  ✓' : ''), px + pw, y - thick / 2 - 9, { size: 10, weight: 700, color: isB ? P.fault : ratio >= 1 ? P.ok : P.warn, align: 'right' });
        // need marker (1×)
        var need = rowH * 0.62 / 2;
        ctx.setLineDash([3, 3]); D.box(ctx, px, y - need / 2, pw, need, need / 2, null, U.rgba(P.text3, 0.45), 1); ctx.setLineDash([]);
        D.box(ctx, px, y - thick / 2, pw, thick, thick / 2, U.rgba(na ? P.panel3 : k[2], na ? 0.4 : 0.22), na ? null : U.rgba(isB ? P.fault : k[2], 0.9), isB ? 2 : 1);
        if (isB) D.glow(ctx, px + pw / 2, y, rowH * 0.8, P.fault, 0.25 + 0.15 * Math.sin(t * 4));
        if (!na) { // beads limited by the global bottleneck
          var nb = Math.round(6 + 10 * Math.min(1, self.flow));
          for (var b = 0; b < nb; b++) {
            var ph2 = ((self.flowT * 0.25 + b / nb) % 1), bx = px + 6 + ph2 * (pw - 12);
            D.circle(ctx, bx, y + Math.sin(b * 2.3) * thick * 0.25, Math.max(1.6, Math.min(3.2, thick * 0.18)), k[2]);
          }
        }
      });
      // ---------------- server preview
      var sx = mob ? 0 : w * 0.5, sw = mob ? w : w * 0.5, sy = mob ? h * 0.46 : 0, sh = mob ? h * 0.54 : h;
      var V = I.view(); V.fit({ x0: -20, y0: 0, z0: 0, x1: M.W + 20, y1: M.D, z1: 220 }, sw, sh * 0.9, 14);
      V.ox += sx; V.oy += sy + sh * 0.05; V.yaw = this.yaw; V.cx = M.W / 2; V.cy = M.D / 2;
      var pw2 = this.power;
      M.t = t; M.fanAngle = t * 16 * pw2; M.fanBlur = pw2 > 0.5 ? 1 : 0; M.dataFlow = pw2 > 0.6; M.fanDead = null;
      M.driveState = pw2 > 0.3 ? null : function () { return 'off'; };
      I.shadow(ctx, V, { x: 0, y: 0, z: 0, w: M.W, d: M.D, h: 0 }, 0.3);
      M.draw(ctx, V, this.parts, { state: function (p) { return {}; } });
      // U height dimension
      var d0 = V.p(M.W + 40, M.D, 0), d1 = V.p(M.W + 40, M.D, 44.45 * this.units);
      D.dim(ctx, d0[0], d0[1], d1[0], d1[1], this.units + 'U', {});
      // power-on: LED cascade + packets to clients
      if (pw2 > 0) {
        var led = V.p(M.W - 10, M.D, 70); D.led(ctx, led[0], led[1], P.ok, 'solid', 0, 3);
        if (pw2 > 0.6) {
          for (var c2 = 0; c2 < 5; c2++) {
            var ang = -0.9 + c2 * 0.45, cx = (sx + sw / 2) + Math.cos(ang - Math.PI / 2) * sh * 0.42, cy = sy + sh * 0.12 + Math.sin(ang) * 6;
            D.g[c2 % 2 ? 'phone' : 'laptop'](ctx, cx, cy, 26, P.alu);
            var ph3 = ((t * 0.7 + c2 * 0.21) % 1), o = V.p(M.W / 2, M.D / 2, 100);
            var bx2 = U.lerp(o[0], cx, ph3), by2 = U.lerp(o[1], cy + 14, ph3);
            ctx.globalAlpha = (pw2 - 0.6) * 2.5; D.circle(ctx, bx2, by2, 3, P.net); D.glow(ctx, bx2, by2, 10, P.net, 0.6); ctx.globalAlpha = 1;
          }
        }
      }
      // noise ring
      var noise = U.clamp((this.watts - 200) / 1500, 0.1, 1);
      if (pw2 > 0.4) for (var q = 0; q < 2; q++) { var ph4 = ((t * (0.5 + noise) + q * 0.5) % 1); var nc = V.p(0, M.D, 40); D.circle(ctx, nc[0], nc[1], 8 + ph4 * 40 * noise, null, U.rgba(P.text3, (1 - ph4) * 0.4), 1); }
      var bt = r[this.bott] >= 1 ? 'Balanced: no part is starving the others.' : 'Bottleneck: ' + this.bott + ' at ' + Math.round(r[this.bott] * 100) + '% of what the workload needs.';
      this.setDesc(Dt.workloads[this.c.workload].label + ' for ' + this.c.users + ' users and ' + this.c.dataTB + ' TB. ' + bt + ' About ' + this.watts + ' W, ' + this.units + 'U.');
    }
  });
})(window.SRV);
