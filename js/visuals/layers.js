/* Ch17 · The layer cake. Iso slabs: hardware → firmware → OS → apps. Switch to a hypervisor and a
   new slab slides in while the OS + apps split into N tinted VM stacks that all share the same
   hardware; the hardware's cores and DIMMs recolour to show each VM's slice (32 cores / 256 GB host,
   8 GB kept for the hypervisor). */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso;

  var W = 520, DP = 300, GAP = 12, VGAP = 16;
  var H_HW = 70, H_FW = 22, H_HV = 34, H_OS = 44, H_AP = 44;
  var CORES = 32, RAM = 256, RESV = 8;
  var TINTS = ['data', 'net', 'ok', 'power', 'accent', 'mgmt', 'warn', 'heat'];

  S.defineVisual('layers', {
    init: function () {
      this.ctx = this.layer();
      this.hv = 0; this.hvT = 0; this.n = 3;
      this.cols = []; for (var i = 0; i < 8; i++) this.cols.push({ x: 0, w: i ? 0 : W, a: i ? 0 : 1 });
      var self = this;
      this.segMode = this.ui.seg({ label: 'Run it as', options: [['bare', 'Bare metal'], ['hv', 'Hypervisor']], value: 'bare', onChange: function (v) { self.setHv(v === 'hv'); } });
      this.sl = this.ui.slider({ label: 'VMs', min: 1, max: 8, step: 1, value: 3, fmt: function (v) { return v + ' VM' + (v > 1 ? 's' : ''); },
        onInput: function (v) { self.n = v; if (!self.hvT) { self.segMode.set('hv'); self.setHv(true); } else self.kick(); self.announceShare(); } });
      this.ui.spacer();
      this.rCpu = this.ui.readout('Each VM · CPU', '–');
      this.rRam = this.ui.readout('Each VM · RAM', '–');
      this.syncR();
      this.snapCols();
    },
    share: function () {
      if (!this.hvT) return { cores: CORES, ram: RAM, spare: 0 };
      var c = Math.floor(CORES / this.n), r = Math.floor((RAM - RESV) / this.n);
      return { cores: c, ram: r, spare: CORES - c * this.n };
    },
    syncR: function () {
      var s = this.share();
      this.rCpu.set(s.cores + ' cores', this.hvT && s.cores <= 4 ? 'warn' : '');
      this.rRam.set(s.ram + ' GB', this.hvT && s.ram < 40 ? 'warn' : '');
    },
    announceShare: function () {
      var s = this.share();
      this.announce(this.hvT ? this.n + ' virtual machines. Each gets ' + s.cores + ' cores and ' + s.ram + ' GB of RAM; 8 GB stays with the hypervisor.' :
        'Bare metal: one operating system owns all 32 cores and 256 GB.');
    },
    setHv: function (on) {
      var self = this; this.hvT = on ? 1 : 0;
      this.tween({ from: this.hv, to: this.hvT, dur: 0.9, ease: 'inOutCubic', onUpdate: function (v) { self.hv = v; } });
      this.kick(); this.syncR(); this.announceShare();
    },
    targets: function () {
      var t = [], n = this.hvT ? this.n : 1, cw = (W - (n - 1) * VGAP) / n;
      for (var i = 0; i < 8; i++) t.push(i < n ? { x: i * (cw + VGAP), w: cw, a: 1 } : { x: W, w: 0, a: 0 });
      return t;
    },
    snapCols: function () { var t = this.targets(); this.cols.forEach(function (c, i) { c.x = t[i].x; c.w = t[i].w; c.a = t[i].a; }); },
    kick: function () { this.syncR(); if (this.reduced()) { this.snapCols(); this.invalidate(); } else this.setActive(true); },
    update: function (dt) {
      var t = this.targets(), moving = false;
      this.cols.forEach(function (c, i) {
        c.x = U.damp(c.x, t[i].x, 9, dt); c.w = U.damp(c.w, t[i].w, 9, dt); c.a = U.damp(c.a, t[i].a, 9, dt);
        if (Math.abs(c.x - t[i].x) + Math.abs(c.w - t[i].w) + Math.abs(c.a - t[i].a) > 0.3) moving = true;
      });
      if (!moving) { this.snapCols(); this.setActive(false); }
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      var bb = { x0: 0, y0: 0, z0: 0, x1: W, y1: DP, z1: H_HW + H_FW + H_HV + H_OS + H_AP + GAP * 4 };
      var rx = this.mobile ? 86 : 150, rw = this.mobile ? w - rx - 10 : w * 0.66 - rx;
      var rh = this.mobile ? h * 0.74 : h - 30;
      this.V = I.view({}).fit(bb, rw, rh, this.mobile ? 14 : 30);
      this.V.ox += rx; this.V.oy += this.mobile ? 6 : 14;
      this.panel = this.mobile ? { x: 12, y: h * 0.76, w: w - 24, h: h * 0.24 - 10 } : { x: w * 0.68, y: 24, w: w * 0.32 - 24, h: h - 48 };
    },
    zs: function () {
      var k = this.hv, z = 0, o = {};
      o.hw = [0, H_HW]; z = H_HW + GAP;
      o.fw = [z, H_FW]; z += H_FW + GAP;
      o.hvz = [z, H_HV * k]; z += (H_HV + GAP) * k;
      o.os = [z, H_OS]; z += H_OS + GAP;
      o.ap = [z, H_AP];
      return o;
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, V = this.V, self = this, mob = this.mobile, k = this.hv;
      D.clear(ctx, w, h);
      if (!V) return;
      var z = this.zs(), sh = this.share(), n = this.hvT ? this.n : 1;
      var per = sh.cores, items = [];
      I.floorGrid(ctx, V, -60, -60, W + 60, DP + 60, 40, P.grid, 0.7);
      I.shadow(ctx, V, { x: 0, y: 0, z: 0, w: W, d: DP, h: 0 }, 0.3);
      // hardware slab with core + DIMM decal
      var coreTint = function (i) {
        if (!self.hvT) return U.mix(P.blueprint, P.steel, 0.15);
        var vm = Math.floor(i / Math.max(1, per));
        return vm < n ? U.mix(U.mix(P.blueprint, P.steel, 0.15), P[TINTS[vm]], k) : U.rgba(P.text3, 0.45);
      };
      I.box(ctx, V, { x: 0, y: 0, z: z.hw[0], w: W, d: DP, h: z.hw[1] }, { color: 'steel', decal: {
        left: function (c, fw, fh) {
          // 32 CPU cores along the front, coloured by owner
          var cs = 12.5, g = 3.4, ox = (fw - (CORES * cs + (CORES - 1) * g)) / 2;
          for (var i = 0; i < CORES; i++) { c.fillStyle = coreTint(i); c.fillRect(ox + i * (cs + g), 14, cs, 26); }
          c.fillStyle = U.rgba(P.silicon, 0.4); c.fillRect(ox, 48, CORES * (cs + g) - g, 8);
          D.led(c, fw - 14, fh - 10, P.ok, 'solid', 0, 3.5);
        },
        right: function (c, fw, fh) {
          // 8 DIMMs (8 × 32 GB) on the side, coloured by RAM share
          var dw = 22, g = 12, ox = (fw - (8 * dw + 7 * g)) / 2;
          for (var d = 0; d < 8; d++) {
            var vm2 = self.hvT ? Math.floor((d + 0.5) * 32 / Math.max(1, sh.ram)) : 0;
            var tint2 = !self.hvT ? U.mix(P.blueprint, P.steel, 0.15) : vm2 < n ? U.mix(U.mix(P.blueprint, P.steel, 0.15), P[TINTS[vm2]], k) : U.rgba(P.mgmt, 0.6);
            c.fillStyle = tint2; c.fillRect(ox + d * (dw + g), 12, dw, fh - 24);
            c.fillStyle = U.rgba(P.gold, 0.8); c.fillRect(ox + d * (dw + g), fh - 16, dw, 3);
          }
        }
      } });
      // firmware
      I.box(ctx, V, { x: 0, y: 0, z: z.fw[0], w: W, d: DP, h: z.fw[1] }, { color: U.mix(P.pcb, P.steel, 0.3) });
      // hypervisor (slides in)
      if (k > 0.01) {
        I.box(ctx, V, { x: -(1 - k) * 420, y: 0, z: z.hvz[0], w: W, d: DP, h: Math.max(1, H_HV * Math.min(1, k * 1.5)) }, { color: U.mix(P.mgmt, P.steel, 0.35), alpha: Math.min(1, k * 1.6), decal: {
          top: function (c, fw, fh) { c.strokeStyle = U.rgba(P.mgmt, 0.9); c.lineWidth = I.px * 1.5; c.setLineDash([12, 8]); c.strokeRect(16, 16, fw - 32, fh - 32); c.setLineDash([]); }
        } });
      }
      // VM columns: OS + apps
      for (var i = 0; i < 8; i++) {
        var cc = this.cols[i];
        if (cc.a < 0.02 || cc.w < 2) continue;
        var tint = this.hvT || k > 0.01 ? U.mix(U.mix(P.steel, P.blueprint, 0.5), P[TINTS[i]], k) : U.mix(P.steel, P.blueprint, 0.5);
        items.push({ b: { x: cc.x, y: 0, z: z.os[0], w: cc.w, d: DP, h: z.os[1] }, col: U.mix(P.steel, tint, 0.45), a: cc.a, kind: 'os', i: i });
        items.push({ b: { x: cc.x, y: 0, z: z.ap[0], w: cc.w, d: DP, h: z.ap[1] }, col: U.mix(P.steel, tint, 0.7), a: cc.a, kind: 'ap', i: i });
      }
      I.sort(V, items).forEach(function (it) {
        I.box(ctx, V, it.b, { color: it.col, alpha: it.a, decal: it.kind === 'ap' ? {
          top: function (c, fw, fh) {
            var m = Math.max(1, Math.floor(fw / 70)), s = Math.min(36, fw / (m + 1));
            for (var j = 0; j < m && j < 4; j++) for (var r = 0; r < 2; r++) { c.fillStyle = U.rgba(P.silicon, 0.35); c.fillRect(14 + j * (s + 10), 30 + r * (fh / 2 - 10), s, s * 0.8); }
          }
        } : null });
      });
      // VM labels above stacks
      if (this.hvT && k > 0.5) {
        for (var j = 0; j < n; j++) {
          var c2 = this.cols[j], p = V.p(c2.x + c2.w * 0.5, DP * 0.5, z.ap[0] + H_AP + 4);
          var lab = (mob || n > 5 ? '' : 'VM ') + (j + 1);
          D.pill(ctx, lab, p[0], p[1] - 12, { size: mob ? 8.5 : 9.5, color: P[TINTS[j]], align: 'center' });
        }
      }
      // layer leaders (left)
      var lx = mob ? 8 : 22, fsL = mob ? 9 : 11;
      var lab = [['HARDWARE', z.hw[0] + z.hw[1] / 2, '32 cores · 256 GB'], ['FIRMWARE', z.fw[0] + z.fw[1] / 2, 'BIOS / UEFI']];
      if (k > 0.3) lab.push(['HYPERVISOR', z.hvz[0] + z.hvz[1] / 2, 'Proxmox, ESXi…']);
      lab.push([this.hvT ? 'GUEST OS' : 'OS', z.os[0] + H_OS / 2, this.hvT ? 'one per VM' : 'Linux / Windows'], ['APPS', z.ap[0] + H_AP / 2, this.hvT ? 'isolated per VM' : 'share one OS']);
      var minGap = mob ? 19 : 30;
      lab.forEach(function (L) { L.a = V.p(0, DP, L[1]); L.y = L.a[1]; });
      for (var q = lab.length - 2; q >= 0; q--) if (lab[q].y - lab[q + 1].y < minGap) lab[q].y = lab[q + 1].y + minGap;
      lab.forEach(function (L) {
        var a = L.a, ly = L.y, ex = lx + (mob ? 66 : 96);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(ex + 10, a[1]); ctx.lineTo(ex, ly); ctx.lineTo(ex - 4, ly);
        ctx.strokeStyle = U.rgba(P.blueprint, 0.55); ctx.lineWidth = 1; ctx.stroke(); D.circle(ctx, a[0], a[1], 2.5, U.rgba(P.blueprint, 0.8));
        var al = L[0] === 'HYPERVISOR' ? Math.min(1, k * 1.5) : 1;
        D.text(ctx, L[0], lx, ly - (mob ? 0 : 6), { size: fsL, weight: 800, color: L[0] === 'HYPERVISOR' ? P.mgmt : P.text1, ls: 0.8, alpha: al });
        if (!mob) D.text(ctx, L[2], lx, ly + 8, { size: 9, color: P.text3, alpha: al });
      });
      this.drawPanel(ctx, sh, n);
      this.setDesc(this.hvT ? 'Hypervisor with ' + n + ' virtual machines sharing one server; each gets ' + sh.cores + ' cores and ' + sh.ram + ' GB of RAM.' : 'Bare metal: hardware, firmware, one operating system and its apps.');
    },
    drawPanel: function (ctx, sh, n) {
      var P = S.pal, R = this.panel, mob = this.mobile;
      D.box(ctx, R.x, R.y, R.w, R.h, 10, U.rgba(P.panel, 0.7), U.rgba(P.blueprint, 0.3), 1);
      var x = R.x + 14, y = R.y + (mob ? 16 : 22), fs = mob ? 9.5 : 10.5;
      D.text(ctx, this.hvT ? 'EACH VM GETS' : 'ONE OS GETS', x, y, { size: fs, weight: 700, color: P.text3, ls: 1 });
      var big = mob ? 17 : 24;
      if (mob) {
        D.text(ctx, sh.cores + ' cores', x, y + 22, { size: big, weight: 800, color: P.text1 });
        D.text(ctx, sh.ram + ' GB RAM', x + R.w * 0.48, y + 22, { size: big, weight: 800, color: P.text1 });
        var bw = R.w - 28;
        this.shareBar(ctx, x, y + 40, bw, 8, n, sh.cores * n / CORES, true);
        D.text(ctx, this.hvT ? 'host keeps ' + RESV + ' GB' + (sh.spare ? ' + ' + sh.spare + ' spare cores' : '') : 'nothing shared, nothing isolated', x, R.y + R.h - 10, { size: 8.5, color: P.text3 });
        return;
      }
      D.text(ctx, String(sh.cores), x, y + 30, { size: big, weight: 800, color: P.text1 });
      D.text(ctx, 'cores', x + D.measure(ctx, String(sh.cores), big, 800) + 6, y + 34, { size: 11, color: P.text2 });
      this.shareBar(ctx, x, y + 50, R.w - 28, 10, n, sh.cores * n / CORES, true);
      D.text(ctx, String(sh.ram), x, y + 86, { size: big, weight: 800, color: P.text1 });
      D.text(ctx, 'GB RAM', x + D.measure(ctx, String(sh.ram), big, 800) + 6, y + 90, { size: 11, color: P.text2 });
      this.shareBar(ctx, x, y + 106, R.w - 28, 10, n, sh.ram * n / RAM, false);
      var ny = y + 140;
      var notes = this.hvT ? [['check', 'VMs are isolated: one crash stays put'], ['check', 'Snapshot, move, restore whole VMs'], ['warn', 'Host keeps ' + RESV + ' GB' + (sh.spare ? ', ' + sh.spare + ' cores spare' : '')], ['warn', 'More VMs = thinner slices']] :
        [['check', 'All 32 cores for one OS'], ['check', 'Simplest, least overhead'], ['warn', 'Apps share one OS: no isolation']];
      notes.forEach(function (q, i) { if (ny + i * 20 > R.y + R.h - 10) return; D.g[q[0]](ctx, x + 5, ny + i * 20, 12, q[0] === 'check' ? P.ok : P.warn); D.text(ctx, q[1], x + 18, ny + i * 20, { size: 10, color: P.text1, maxW: R.w - 40 }); });
    },
    shareBar: function (ctx, x, y, w, h, n, used, cpu) {
      var P = S.pal;
      D.box(ctx, x, y, w, h, 3, U.rgba(P.panel3, 0.8));
      if (!this.hvT) { D.box(ctx, x, y, w, h, 3, U.mix(P.blueprint, P.steel, 0.2)); return; }
      var seg = (w * used) / n;
      for (var i = 0; i < n; i++) { ctx.fillStyle = P[TINTS[i]]; ctx.fillRect(x + i * seg + (i ? 1 : 0), y, seg - 1, h); }
      if (!cpu) { ctx.fillStyle = D.hatch(ctx, U.rgba(P.mgmt, 0.9), 4); ctx.fillRect(x + w * (1 - RESV / RAM), y, w * RESV / RAM, h); }
    }
  });
})(window.SRV);
