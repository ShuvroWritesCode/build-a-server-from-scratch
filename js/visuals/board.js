/* Ch5 · Motherboard City. An isometric server board: CPU socket "downtown", 12 DIMM "warehouses",
   PCIe "on-ramps", BMC "city hall", M.2, power, fan headers and the chipset that isn't there.
   Data beads flow along routed copper traces. Hover / tap / pick a district → the rest dims and its
   roads light up. Dual socket adds CPU 2 + its memory joined by a bright socket link; a fetch across
   that bridge shows NUMA: local ~100 ns vs remote ~170 ns. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso, M = S.models;
  var ZT = 3;                 // board top (mm)
  var W1 = 420, W2 = 800, BD = 460, OX2 = 380;
  var LAT_LOCAL = 100, LAT_REMOTE = 170;

  var DISTRICTS = {
    cpu: { opt: 'CPU socket', name: 'CPU SOCKET', nick: 'downtown', text: 'Every road starts here. The CPU has its own memory controller and PCIe lanes built in.' },
    dimm: { opt: 'Memory slots', name: 'MEMORY SLOTS × 12', nick: 'warehouses', text: '12 DDR5 channels right beside the CPU. Short roads keep memory fast.' },
    pcie: { opt: 'PCIe slots', name: 'PCIe SLOTS', nick: 'highway on-ramps', text: 'GPUs, network and RAID cards join here, wired straight to the CPU’s lanes.' },
    m2: { opt: 'M.2 slot', name: 'M.2 SLOT', nick: 'side street', text: 'A small NVMe boot drive on 4 PCIe lanes.' },
    bmc: { opt: 'BMC chip', name: 'BMC CHIP', nick: 'city hall', text: 'A tiny separate computer: remote screen, power button and sensors — works even when the server is off.' },
    power: { opt: 'Power connectors', name: '24-PIN + 8-PIN POWER', nick: 'power plant', text: 'The PSU feeds 12 V in; VRMs beside the socket step it down to about 1 V for the CPU.' },
    fans: { opt: 'Fan headers', name: 'FAN HEADERS', nick: 'ventilation', text: 'The BMC reads temperatures and sets each fan’s speed through these.' },
    nochip: { opt: 'No chipset', name: 'NO CHIPSET', nick: 'no post office', text: 'Server CPUs are a system-on-chip: there is no separate chipset — the CPU itself is the hub.' },
    cpu2: { opt: 'CPU socket 2', name: 'CPU SOCKET 2', nick: 'second downtown', text: 'A second CPU with its own 12 memory channels and its own lanes.' },
    link: { opt: 'Socket link', name: 'SOCKET LINK (xGMI / UPI)', nick: 'the bridge', text: 'Joins the two CPUs. Memory across the bridge takes ~1.5–2× longer: that is NUMA.' }
  };
  var ORDER = ['cpu', 'dimm', 'pcie', 'm2', 'bmc', 'power', 'fans', 'nochip', 'cpu2', 'link'];
  var ANCHOR = {
    cpu: [210, 230, ZT + 9], dimm: [100, 232, 22], pcie: [340, 55, ZT + 11], m2: [70, 351, ZT + 4], bmc: [43, 53, ZT + 3],
    power: [183, 118, ZT + 12], fans: [110, 441, ZT + 7], nochip: [261, 382, ZT + 6], cpu2: [590, 230, ZT + 9], link: [400, 338, ZT]
  };

  // ---------------------------------------------------------------- geometry
  function buildParts() {
    var parts = [];
    function add(id, dist, b, color, o) { var p = Object.assign({ id: id, d: dist, b: b, color: color, cpu: 1 }, o || {}); parts.push(p); return p; }
    function cpuGroup(ox, n) {
      var dc = n === 2 ? 'cpu2' : 'cpu', o = { cpu: n };
      add('sock' + n, dc, { x: ox + 160, y: 170, z: ZT, w: 100, d: 120, h: 5 }, 'steel', Object.assign({ decal: { top: decalSocket } }, o));
      add('pkg' + n, dc, { x: ox + 174, y: 190, z: ZT + 5, w: 72, d: 80, h: 4 }, 'alu', Object.assign({ decal: { top: decalPkg('CPU ' + n) } }, o));
      for (var k = 0; k < 6; k++) add('vrm' + n + k, 'power', { x: ox + 166 + k * 9, y: 140, z: ZT, w: 7, d: 9, h: 8 }, 'steel', o);
      add('p8' + n, 'power', { x: ox + 170, y: 112, z: ZT, w: 26, d: 12, h: 12 }, 'plastic', Object.assign({ decal: { top: decalPins(4, 2) } }, o));
      for (k = 0; k < 6; k++) {
        [ox + 142 - k * 17, ox + 270 + k * 17].forEach(function (x, side) {
          add('slot' + n + side + k, 'dimm', { x: x, y: 165, z: ZT, w: 8, d: 135, h: 6 }, 'plastic', o);
          add('dimm' + n + side + k, 'dimm', { x: x + 2, y: 166, z: ZT + 6, w: 4, d: 133, h: 16 }, 'pcb', Object.assign({ decal: { right: M.decal.dimmSide(true) } }, o));
        });
      }
    }
    cpuGroup(0, 1);
    cpuGroup(OX2, 2);
    for (var k = 0; k < 4; k++) add('pcie' + k, 'pcie', { x: 300 + k * 25, y: 10, z: ZT, w: 9, d: 89, h: 11 }, 'plastic', { decal: { top: decalSlot } });
    add('rj45', 'bmc', { x: 30, y: -4, z: ZT, w: 18, d: 22, h: 15 }, 'steel', { decal: { left: decalRj45 } });
    add('usb', null, { x: 60, y: -4, z: ZT, w: 14, d: 16, h: 8 }, 'steel');
    add('vga', 'bmc', { x: 84, y: -4, z: ZT, w: 30, d: 12, h: 12 }, 'steel');
    add('bmc', 'bmc', { x: 30, y: 40, z: ZT, w: 26, d: 26, h: 3 }, 'silicon', { decal: { top: function (g, w, h) { M.decal.chipTop('BMC', S.pal.mgmt)(g, w, h); } } });
    add('bmcram', 'bmc', { x: 62, y: 44, z: ZT, w: 16, d: 10, h: 2 }, 'silicon');
    add('m2c', 'm2', { x: 110, y: 340, z: ZT, w: 8, d: 22, h: 6 }, 'plastic');
    add('m2', 'm2', { x: 30, y: 341, z: ZT + 2, w: 80, d: 20, h: 2 }, 'pcb', { decal: { top: decalM2 } });
    add('nochip', 'nochip', { x: 236, y: 362, z: ZT, w: 50, d: 40, h: 6 }, 'silicon', { ghost: true });
    add('p24', 'power', { x: 300, y: 432, z: ZT, w: 70, d: 16, h: 13 }, 'plastic', { decal: { top: decalPins(12, 2) } });
    for (k = 0; k < 6; k++) add('fan' + k, 'fans', { x: 34 + k * 28, y: 438, z: ZT, w: 12, d: 6, h: 7 }, 'plastic', { decal: { top: decalPins(4, 1) } });
    return parts;
  }

  function buildRoutes() {
    var R = [];
    function add(pts, dists, kind, cpu) { R.push({ w: pts, d: dists, kind: kind, cpu: cpu || 1, sp: [], lens: [0], phase: Math.random() }); }
    function cpuRoutes(ox, n) {
      var dc = n === 2 ? 'cpu2' : 'cpu';
      for (var k = 0; k < 6; k++) {
        var dxl = ox + 142 - k * 17 + 4, sxl = ox + 166 + k * 4, dxr = ox + 270 + k * 17 + 4, sxr = ox + 254 - k * 4, yk = 306 + k * 4;
        add([sxl, 290, sxl, yk, dxl, yk, dxl, 300], ['dimm', dc], 'data', n);
        add([sxr, 290, sxr, yk, dxr, yk, dxr, 300], ['dimm', dc], 'data', n);
      }
      add([ox + 183, 124, ox + 183, 140], ['power'], 'power', n);
    }
    cpuRoutes(0, 1); cpuRoutes(OX2, 2);
    for (var k = 0; k < 4; k++) { var sx = 228 + k * 7, yk = 108 + k * 6, slx = 300 + k * 25 + 4.5; add([sx, 170, sx, yk, slx, yk, slx, 99], ['pcie', 'cpu'], 'data'); }
    add([205, 290, 205, 350, 118, 350], ['m2', 'cpu'], 'data');
    add([56, 53, 222, 53, 222, 170], ['bmc', 'cpu'], 'mgmt');
    add([39, 40, 39, 18], ['bmc'], 'mgmt');
    for (k = 0; k < 6; k++) { var hx = 40 + k * 28; add([30, 60, 14, 60, 14, 425, hx, 425, hx, 438], ['fans', 'bmc'], 'mgmt'); }
    add([300, 440, 190, 440], ['power', 'fans'], 'power');
    [-4, 0, 4].forEach(function (o) { add([215 - o, 290, 215 - o, 338 + o, 590 + o, 338 + o, 590 + o, 290], ['link', 'cpu', 'cpu2'], 'link', 2); });
    return R;
  }
  var FETCH = {
    local: [210, 230, 166, 262, 166, 306, 146, 306, 146, 240],
    remote: [210, 230, 215, 270, 215, 338, 590, 338, 590, 290, 590, 230, 546, 262, 546, 306, 526, 306, 526, 240]
  };

  // ---------------------------------------------------------------- decals (face-local mm)
  function decalSocket(g, w, h) {
    g.strokeStyle = U.rgba(S.pal.alu, 0.45); g.lineWidth = 1.2 * I.px; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = U.rgba(S.pal.gold, 0.4); for (var y = 8; y < h - 8; y += 4) g.fillRect(6, y, 6, 1.2);
  }
  function decalPkg(label) {
    return function (g, w, h) {
      g.fillStyle = U.rgba(S.pal.silicon, 0.12); g.fillRect(6, 6, w - 12, h - 12);
      g.fillStyle = S.pal.gold; g.beginPath(); g.moveTo(3, h - 3); g.lineTo(11, h - 3); g.lineTo(3, h - 11); g.closePath(); g.fill();
      g.font = '800 12px ' + S.pal.mono; g.fillStyle = U.rgba(S.pal.silicon, 0.75); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, w / 2, h / 2);
    };
  }
  function decalPins(nx, ny) {
    return function (g, w, h) { g.fillStyle = U.rgba('#000', 0.45); var cw = w / nx, ch = h / ny; for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) g.fillRect(i * cw + cw * 0.22, j * ch + ch * 0.22, cw * 0.56, ch * 0.56); };
  }
  function decalSlot(g, w, h) { g.fillStyle = U.rgba('#000', 0.5); g.fillRect(w * 0.35, 3, w * 0.3, h - 6); }
  function decalRj45(g, w, h) { g.fillStyle = U.rgba('#000', 0.6); g.fillRect(3, 3, w - 6, h - 6); g.fillStyle = S.pal.ok; g.fillRect(2, 1, 3, 2); g.fillStyle = S.pal.power; g.fillRect(w - 5, 1, 3, 2); }
  function decalM2(g, w, h) {
    g.fillStyle = S.pal.silicon; g.fillRect(8, 4, 20, h - 8); g.fillRect(32, 4, 20, h - 8); g.fillRect(56, 5, 12, h - 10);
    g.fillStyle = U.rgba(S.pal.gold, 0.9); g.fillRect(w - 3, 3, 3, h - 6);
  }

  S.defineVisual('board', {
    continuous: true,
    init: function () {
      this.sctx = this.layer();     // static: board + parts (redrawn on change)
      this.ctx = this.layer();      // dynamic: beads, labels
      this.parts = buildParts(); this.routes = buildRoutes();
      this.dual = false; this.dualT = 0; this.sel = null; this.hov = null; this.sDirty = true;
      this.fetch = null; this.res = { local: null, remote: null };
      this.traces = this.genTraces();
      var self = this;
      var g = this.ui.group('District');
      this.sSel = g.select({
        label: 'District', value: '', options: [['', 'All (overview)']].concat(ORDER.map(function (k) { return [k, DISTRICTS[k].opt + ' · ' + DISTRICTS[k].nick]; })),
        onChange: function (v) { self.select(v || null, true); }
      });
      this.tDual = g.toggle({ label: 'Dual socket', value: false, onChange: function (v) { self.setDual(v); } });
      this.ui.br();
      var f = this.ui.group('NUMA test');
      this.bLocal = f.button('Fetch from local memory', function () { self.startFetch('local'); });
      this.bRemote = f.button('Fetch from other CPU’s memory', function () { self.startFetch('remote'); }, { kind: 'primary' });
      this.ui.spacer();
      this.rLocal = this.ui.readout('Local', '–');
      this.rRemote = this.ui.readout('Remote', '–');
      this.bRemote.setDisabled(true);
      this.pointer({
        hover: function (p) { var hit = self.hits.query(p.x, p.y), id = hit ? hit.data : null; if (id !== self.hov) { self.hov = id; self.sDirty = true; self.stage.style.cursor = id ? 'pointer' : ''; } },
        leave: function () { if (self.hov) { self.hov = null; self.sDirty = true; } self.stage.style.cursor = ''; },
        down: function (p) { var hit = self.hits.query(p.x, p.y), id = hit ? hit.data : null; self.select(id && id !== self.sel ? id : null, true); return false; }
      });
      this.syncDesc();
    },
    onTheme: function () { this.sDirty = true; },
    onQuality: function () { this.sDirty = true; },
    focus: function () { return this.hov || this.sel; },
    select: function (id, ann) {
      if ((id === 'cpu2' || id === 'link') && !this.dual) { this.tDual.set(true); this.setDual(true); }
      this.sel = id; this.sSel.set(id || ''); this.sDirty = true;
      if (ann && id) this.announce(DISTRICTS[id].name + ', the ' + DISTRICTS[id].nick + ': ' + DISTRICTS[id].text);
      this.syncDesc();
    },
    setDual: function (on) {
      this.dual = on; var self = this;
      this.tween({ from: this.dualT, to: on ? 1 : 0, dur: 0.9, ease: on ? 'settle' : 'camera', onUpdate: function (v) { self.dualT = v; self.sDirty = true; } });
      if (!on && (this.sel === 'cpu2' || this.sel === 'link')) { this.sel = null; this.sSel.set(''); }
      if (!on) { this.fetch = null; this.res.remote = null; this.rRemote.set('–'); }
      this.bRemote.setDisabled(!on);
      this.announce(on ? 'Second CPU added, joined by a socket link. Its memory is near to it and far from CPU 1.' : 'Back to a single socket.');
      this.syncDesc();
    },
    startFetch: function (kind) {
      if (kind === 'remote' && !this.dual) return;
      var lat = kind === 'local' ? LAT_LOCAL : LAT_REMOTE;
      this.fetch = { kind: kind, t: 0, dur: 1.5 * lat / LAT_LOCAL, lat: lat };
      if (this.reduced() || this._paused) { this.fetch.t = this.fetch.dur; this.endFetch(); }
    },
    endFetch: function () {
      var f = this.fetch; this.res[f.kind] = f.lat;
      (f.kind === 'local' ? this.rLocal : this.rRemote).set('~' + f.lat + ' ns', f.kind === 'local' ? 'ok' : 'warn');
      this.announce(f.kind === 'local' ? 'CPU 1 read its own memory in about 100 nanoseconds.' : 'CPU 1 read CPU 2’s memory across the socket link in about 170 nanoseconds: 1.7 times slower. That is NUMA.');
      this.fetch.doneT = 0;
      this.syncDesc();
    },
    syncDesc: function () {
      var f = this.focus();
      var d = (this.dual ? 'Dual-socket' : 'Single-socket') + ' server board. ' + (f ? 'Highlighting ' + DISTRICTS[f].name.toLowerCase() + ': ' + DISTRICTS[f].text : 'Data beads flow from the CPU to memory, PCIe slots and the M.2 drive.');
      if (this.res.remote) d += ' Local memory ~100 ns, remote memory ~170 ns.';
      this.setDesc(d);
    },
    genTraces: function () {
      var r = U.rng('mb-city'), out = [];
      for (var i = 0; i < 220; i++) {
        var x = r.range(6, W2 - 6), y = r.range(6, BD - 6), pts = [x, y], n = r.int(1, 3), mx = x;
        for (var j = 0; j < n; j++) {
          var dx = r.range(-50, 50), dy = r.range(-50, 50);
          if (r.chance(0.5)) { x += dx; y += Math.abs(dx) * Math.sign(dy) * (r.chance(0.5) ? 1 : 0); } else y += dy;
          x = U.clamp(x, 4, W2 - 4); y = U.clamp(y, 4, BD - 4); pts.push(x, y); mx = Math.max(mx, x);
        }
        out.push({ p: pts, mx: mx });
      }
      return out;
    },

    // ---------------------------------------------------------------- layout
    resize: function (w, h) {
      this.mobile = w < 560;
      this.sDirty = true;
    },
    camera: function () {
      var w = this.w, h = this.h, bw = U.lerp(W1, W2, this.dualT);
      var bb = { x0: 0, y0: -4, z0: 0, x1: bw, y1: BD, z1: 30 };
      var V = I.view({});
      if (this.mobile) { V.fit(bb, w, h - 128, 10); }
      else { V.fit(bb, w, h, 22); V.oy += 8; }
      this.V = V;
      // project routes
      for (var i = 0; i < this.routes.length; i++) {
        var R = this.routes[i], sp = R.sp; sp.length = 0;
        for (var k = 0; k < R.w.length; k += 2) { var q = V.p(R.w[k], R.w[k + 1], ZT + 0.3); sp.push(q[0], q[1]); }
        R.lens = D.polyLen(sp);
      }
    },
    partState: function (p) {
      if (p.cpu === 2) { if (this.dualT <= 0.01) return null; return { alpha: this.dualT, dz: (1 - this.dualT) * 70 }; }
      return { alpha: 1, dz: 0 };
    },
    routeAlpha: function (R) { return R.cpu === 2 ? this.dualT : 1; },
    routeOn: function (R, f) { return R.d.indexOf(f) >= 0; },
    routeCol: function (R) { var P = S.pal; return R.kind === 'power' ? P.power : R.kind === 'mgmt' ? P.mgmt : P.data; },

    // ---------------------------------------------------------------- static layer
    drawStatic: function () {
      var ctx = this.sctx, w = this.w, h = this.h, P = S.pal, self = this;
      this.camera();
      var V = this.V, bw = U.lerp(W1, W2, this.dualT), f = this.focus();
      D.clear(ctx, w, h);
      this.hits.clear();
      var board = { x: 0, y: 0, z: 0, w: bw, d: BD, h: ZT };
      I.shadow(ctx, V, board, 0.35, 0, 14);
      var traces = this.traces, dualT = this.dualT;
      I.box(ctx, V, board, { color: 'pcb', decal: { top: function (g, fw, fh) { self.boardDecal(g, fw, fh, traces, dualT); } } });
      // routes (copper)
      for (var i = 0; i < this.routes.length; i++) {
        var R = this.routes[i], a = this.routeAlpha(R); if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        D.poly(ctx, R.sp, false); ctx.lineJoin = 'round';
        ctx.strokeStyle = R.kind === 'link' ? U.rgba(P.data, 0.55) : U.rgba(P.copper, P.dark ? 0.95 : 1); ctx.lineWidth = R.kind === 'link' ? 2.4 : 1.5; ctx.stroke();
        ctx.strokeStyle = U.rgba(this.routeCol(R), R.kind === 'link' ? 0.5 : 0.22); ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // parts
      var items = this.collect(null);
      this.drawParts(ctx, items, null);
      // hits (district hulls)
      for (i = 0; i < items.length; i++) if (items[i].p.d && items[i].st.alpha > 0.5) this.hits.poly(items[i].p.d, I.hull(V, items[i].b), items[i].p.d);
      for (i = 0; i < this.routes.length; i++) { R = this.routes[i]; if (R.kind === 'link' && this.dualT > 0.5) this.hits.poly('link', this.thick(R.sp, 7), 'link'); }
      // battery (decor)
      I.cyl(ctx, V, { x: 205, y: 410, z: ZT, r: 11, h: 3 }, { color: 'alu' });

      if (f) {
        // dim everything, then redraw the focused district and its roads on top
        ctx.fillStyle = U.rgba(P.bg, P.dark ? 0.66 : 0.6); ctx.fillRect(0, 0, w, h);
        for (i = 0; i < this.routes.length; i++) {
          R = this.routes[i]; if (!this.routeOn(R, f) || this.routeAlpha(R) < 0.05) continue;
          D.poly(ctx, R.sp, false); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          ctx.strokeStyle = U.rgba(this.routeCol(R), 0.35); ctx.lineWidth = 5; ctx.stroke();
          ctx.strokeStyle = this.routeCol(R); ctx.lineWidth = 1.8; ctx.stroke(); ctx.lineCap = 'butt';
        }
        this.drawParts(ctx, this.collect(f), f);
      }
      this.sDirty = false;
    },
    thick: function (sp, r) { // thin parallelogram hit area along the socket link (constant world y)
      var a = this.V.p(211, 330, ZT), b = this.V.p(594, 330, ZT), c = this.V.p(594, 346, ZT), d = this.V.p(211, 346, ZT);
      return [a[0], a[1] - r, b[0], b[1] - r, c[0], c[1] + r, d[0], d[1] + r];
    },
    collect: function (only) {
      var out = [];
      for (var i = 0; i < this.parts.length; i++) {
        var p = this.parts[i];
        if (only && p.d !== only) continue;
        var st = this.partState(p); if (!st) continue;
        out.push({ p: p, st: st, b: { x: p.b.x, y: p.b.y, z: p.b.z + st.dz, w: p.b.w, d: p.b.d, h: p.b.h } });
      }
      return I.sort(this.V, out);
    },
    drawParts: function (ctx, items, focus) {
      var V = this.V, P = S.pal;
      for (var i = 0; i < items.length; i++) {
        var it = items[i], p = it.p;
        if (p.ghost) {
          I.box(ctx, V, it.b, { state: 'blueprint', alpha: it.st.alpha });
          var c = V.p(it.b.x + it.b.w / 2, it.b.y + it.b.d / 2, it.b.z + it.b.h);
          D.g.cross(ctx, c[0], c[1], 12 * Math.max(0.7, V.k * 1.4), U.rgba(P.blueprint, 0.8));
          continue;
        }
        I.box(ctx, V, it.b, { color: p.color, alpha: it.st.alpha, decal: p.decal, highlight: focus ? P.accent : null });
      }
    },
    boardDecal: function (g, fw, fh, traces, dualT) {
      var P = S.pal, px = I.px;
      g.lineWidth = 1 * px; g.strokeStyle = U.rgba(P.copper, P.dark ? 0.35 : 0.45);
      for (var i = 0; i < traces.length; i++) {
        var t = traces[i]; if (t.mx > fw - 2) continue;
        D.poly(g, t.p, false); g.stroke();
      }
      g.fillStyle = U.rgba(P.gold, 0.5);
      for (i = 0; i < traces.length; i += 3) { if (traces[i].mx > fw - 2) continue; g.fillRect(traces[i].p[0] - 1.4, traces[i].p[1] - 1.4, 2.8, 2.8); }
      // mounting holes
      [[10, 10], [fw - 10, 10], [10, fh - 10], [fw - 10, fh - 10], [fw / 2, fh / 2 - 60]].forEach(function (q) {
        g.beginPath(); g.arc(q[0], q[1], 5, 0, U.TAU); g.fillStyle = U.rgba(P.gold, 0.55); g.fill();
        g.beginPath(); g.arc(q[0], q[1], 2.6, 0, U.TAU); g.fillStyle = P.bg; g.fill();
      });
      // silkscreen
      g.fillStyle = U.rgba(P.text1, P.dark ? 0.55 : 0.75); g.textBaseline = 'middle'; g.textAlign = 'left';
      g.font = '700 10px ' + P.mono;
      var labels = [['PCIE1-4 · CPU1', 298, 104], ['BMC', 30, 76], ['M.2 · NVMe', 30, 372], ['ATX 24P', 300, 454], ['FAN1 – FAN6', 34, 452], ['CPU1 PWR', 168, 104], ['DIMM A–F', 66, 158], ['DIMM G–L', 270, 158], ['CR2032', 222, 410]];
      if (dualT > 0.6) labels.push(['DIMM A–F · CPU2', OX2 + 50, 158], ['DIMM G–L · CPU2', OX2 + 270, 158], ['CPU2 PWR', OX2 + 168, 104], ['xGMI / UPI LINK', 330, 356]);
      for (i = 0; i < labels.length; i++) if (labels[i][1] < fw - 30) g.fillText(labels[i][0], labels[i][1], labels[i][2]);
      g.font = '800 14px ' + P.mono; g.fillStyle = U.rgba(P.text1, P.dark ? 0.3 : 0.4);
      g.fillText(dualT > 0.5 ? 'SRV-2S · REV 1.0' : 'SRV-1S · REV 1.0', fw - 150, fh - 22);
    },

    // ---------------------------------------------------------------- dynamic layer
    update: function (dt) {
      var f = this.fetch;
      if (f && f.t < f.dur) { f.t += dt; if (f.t >= f.dur) { f.t = f.dur; this.endFetch(); } }
      else if (f && f.doneT != null) f.doneT += dt;
    },
    draw: function () {
      if (this.sDirty || !this.V) { this.drawStatic(); this.syncDesc(); }
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, t = this.time, V = this.V, f = this.focus(), m = this.mobile;
      D.clear(ctx, w, h);
      var pt = this._pt || (this._pt = {});
      // beads + marching power
      for (var i = 0; i < this.routes.length; i++) {
        var R = this.routes[i], a = this.routeAlpha(R); if (a <= 0.02) continue;
        var on = !f || this.routeOn(R, f), lit = f && on;
        if (!on) continue;
        var col = this.routeCol(R), L = R.lens[R.lens.length - 1];
        if (R.kind === 'power') {
          ctx.globalAlpha = a * (lit ? 1 : 0.85);
          D.poly(ctx, R.sp, false); ctx.setLineDash([4, 5]); ctx.lineDashOffset = -t * 22; ctx.strokeStyle = col; ctx.lineWidth = lit ? 2.2 : 1.6; ctx.stroke(); ctx.setLineDash([]);
          ctx.globalAlpha = 1; continue;
        }
        var gap = R.kind === 'link' ? 16 : 24, spd = R.kind === 'mgmt' ? 16 : R.kind === 'link' ? 46 : 34;
        if (L < 4) continue;
        var off = (t * spd + R.phase * gap) % gap, r = lit ? 2.4 : 1.9;
        for (var s = off; s < L; s += gap) {
          D.along(R.sp, R.lens, s, pt);
          var fade = Math.min(1, s / 8, (L - s) / 8);
          D.glow(ctx, pt.x, pt.y, lit ? 8 : 5.5, col, (lit ? 0.5 : 0.3) * a * fade);
          ctx.globalAlpha = a * fade * (lit ? 1 : 0.8);
          ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, U.TAU); ctx.fillStyle = col; ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // BMC heartbeat LED (on standby power)
      var bl = V.p(52, 44, ZT + 3); D.led(ctx, bl[0], bl[1], P.mgmt, 'heartbeat', t, 2);
      // NUMA fetch bead
      this.drawFetch(ctx);
      // labels
      if (f) this.drawCard(ctx, f); else this.drawIdle(ctx);
      if (this.dual || this.res.local || this.fetch) this.drawLatency(ctx);
    },
    drawFetch: function (ctx) {
      var F = this.fetch; if (!F) return;
      var P = S.pal, V = this.V, w = FETCH[F.kind];
      var sp = [], k;
      for (k = 0; k < w.length; k += 2) { var q = V.p(w[k], w[k + 1], ZT + 6); sp.push(q[0], q[1]); }
      var lens = D.polyLen(sp), L = lens[lens.length - 1];
      var u = F.t / F.dur, fadeOut = F.doneT == null ? 1 : U.clamp(1 - (F.doneT - 2.5) / 1.5, 0, 1);
      if (fadeOut <= 0) return;
      var pos = u < 0.5 ? (u * 2) * L : (2 - u * 2) * L;
      ctx.globalAlpha = 0.85 * fadeOut; D.poly(ctx, sp, false); ctx.setLineDash([3, 4]); ctx.strokeStyle = F.kind === 'local' ? P.ok : P.warn; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      if (u < 1) {
        var pt = D.along(sp, lens, pos, {});
        D.glow(ctx, pt.x, pt.y, 16, P.data, 0.9);
        D.circle(ctx, pt.x, pt.y, 4.2, P.data, P.bg, 1.2);
      }
      // the memory stick being read pulses
      var end = V.p(w[w.length - 2], w[w.length - 1], 22);
      if (u >= 0.4 && u <= 0.65) D.glow(ctx, end[0], end[1], 22, F.kind === 'local' ? P.ok : P.warn, 0.8);
    },
    drawLatency: function (ctx) {
      var P = S.pal, m = this.mobile, F = this.fetch;
      var pw = m ? this.w - 24 : 230, px = m ? 12 : this.w - pw - 16, py = m ? this.h - 120 - 46 : 54;
      if (m && this.focus()) return; // card takes the space on phones
      var ph = m ? 40 : 74;
      D.box(ctx, px, py, pw, ph, 8, U.rgba(P.panel, 0.9), U.rgba(P.panel3, 1), 1);
      D.text(ctx, 'MEMORY LATENCY · CPU 1 reads', px + 10, py + (m ? 10 : 13), { size: 9, weight: 700, color: P.text2, ls: 1 });
      var rows = [['local', 'own memory', LAT_LOCAL, P.ok], ['remote', 'CPU 2’s', LAT_REMOTE, P.warn]];
      var bx = px + (m ? 92 : 98), bwid = pw - (m ? 150 : 150);
      for (var i = 0; i < 2; i++) {
        var r = rows[i], y = py + (m ? 22 : 34) + i * (m ? 10 : 20);
        if (m && i === 1) y = py + 32;
        var cur = this.res[r[0]], live = F && F.kind === r[0] && F.t < F.dur;
        var val = live ? (F.t / F.dur) * r[2] : cur;
        if (m) { if (i === 0) { D.text(ctx, 'local ' + (this.res.local ? '~100 ns' : '–') + '   ·   remote ' + (this.res.remote ? '~170 ns' : this.dual ? '–' : 'needs 2 CPUs'), px + 10, py + 27, { size: 10, weight: 700, color: P.text1 }); } continue; }
        D.text(ctx, r[1], px + 10, y, { size: 9.5, color: P.text2 });
        D.box(ctx, bx, y - 5, bwid, 10, 5, U.rgba(P.panel3, 0.8));
        if (val) D.box(ctx, bx, y - 5, Math.max(10, bwid * val / 200), 10, 5, r[3]);
        D.text(ctx, val ? '~' + Math.round(val) + ' ns' : (i === 1 && !this.dual ? 'needs 2 CPUs' : '–'), px + pw - 10, y, { size: 10, weight: 700, color: val ? P.text1 : P.text3, align: 'right' });
      }
      if (!m && this.res.local && this.res.remote) D.text(ctx, 'remote = ' + U.fmt(LAT_REMOTE / LAT_LOCAL, 1) + '× slower (NUMA)', px + 10, py + ph - 9, { size: 9.5, weight: 700, color: P.warn });
    },
    wrap: function (ctx, str, maxW, size, sans) {
      var words = str.split(' '), lines = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var test = cur ? cur + ' ' + words[i] : words[i];
        if (D.measure(ctx, test, size, 500, sans) > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = test;
      }
      if (cur) lines.push(cur);
      return lines;
    },
    drawCard: function (ctx, f) {
      var P = S.pal, m = this.mobile, d = DISTRICTS[f], V = this.V;
      if (f === 'dimm' && this.dual) d = { name: 'MEMORY SLOTS × 24', nick: 'warehouses', text: 'Each CPU has its own 12 DDR5 channels. Its own sticks are near; the other CPU\u2019s sticks are across the bridge.' };
      var cw = m ? this.w - 24 : Math.min(300, this.w * 0.34), cx = 12, cy = m ? this.h - 118 : 14;
      var lines = this.wrap(ctx, d.text, cw - 24, 12, true);
      var ch = 46 + lines.length * 16 + 4;
      if (m) cy = this.h - ch - 8;
      else cx = 16;
      var an = ANCHOR[f], a = V.p(an[0], an[1], an[2]);
      var lx = m ? Math.min(Math.max(a[0], cx + 20), cx + cw - 20) : cx + cw, ly = m ? cy : cy + 24;
      // leader
      D.leader(ctx, a[0], a[1], lx, ly, '', { color: P.accent });
      D.glow(ctx, a[0], a[1], 12, P.accent, 0.7);
      D.box(ctx, cx, cy, cw, ch, 10, U.rgba(P.panel, 0.94), P.accent, 1.2);
      D.text(ctx, d.name, cx + 12, cy + 17, { size: m ? 11 : 12, weight: 800, color: P.text1, ls: 0.5 });
      D.text(ctx, '“' + d.nick + '”', cx + 12, cy + 34, { size: 10.5, weight: 600, color: P.accent });
      for (var i = 0; i < lines.length; i++) D.text(ctx, lines[i], cx + 12, cy + 52 + i * 16, { size: 12, color: P.text2, sans: true });
    },
    drawIdle: function (ctx) {
      var P = S.pal, m = this.mobile, V = this.V;
      if (m) {
        D.text(ctx, 'Tap a district (or pick one below).', 12, this.h - 14, { size: 10, color: P.text3 });
        D.text(ctx, '● data   ● management   ┅ power', 12, this.h - 30, { size: 9.5, color: P.text3 });
        return;
      }
      D.text(ctx, 'MOTHERBOARD CITY', 16, 22, { size: 11, weight: 800, color: P.text2, ls: 1.5 });
      D.text(ctx, 'Hover a district to light up its roads.', 16, 40, { size: 11, color: P.text3, sans: true });
      // legend
      var y = this.h - 16;
      D.circle(ctx, 20, y, 3, P.data); D.text(ctx, 'data', 28, y, { size: 9.5, color: P.text2 });
      D.circle(ctx, 72, y, 3, P.mgmt); D.text(ctx, 'management', 80, y, { size: 9.5, color: P.text2 });
      D.line(ctx, 160, y, 176, y, P.power, 2, [4, 3]); D.text(ctx, 'power', 182, y, { size: 9.5, color: P.text2 });
      // small district tags
      var tags = [['cpu', 'DOWNTOWN'], ['dimm', 'WAREHOUSES'], ['pcie', 'ON-RAMPS'], ['bmc', 'CITY HALL']];
      if (this.dualT > 0.8) tags.push(['link', 'BRIDGE']);
      for (var i = 0; i < tags.length; i++) {
        var an = ANCHOR[tags[i][0]], q = V.p(an[0], an[1], an[2] + 26);
        D.pill(ctx, tags[i][1], q[0], q[1] - 10, { size: 9, color: P.text2, align: 'center', pad: 4 });
      }
    }
  });
})(window.SRV);
