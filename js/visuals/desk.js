/* Ch7 · Desk (RAM) vs filing cabinet (storage). One sheet of paper = 8 GB of the job's working set.
   If every sheet fits on the desk the worker just works; if not, the worker must keep walking to the
   cabinet to swap sheets (paging / swapping) and real throughput collapses — thrashing. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso;
  var RAM_STEPS = [8, 16, 32, 64, 128, 256];
  var GB_PER_SHEET = 8, COLS = 8;
  var SLOT_W = 175, SLOT_D = 225, SHEET_W = 145, SHEET_D = 190, MARGIN = 45;
  var DESK_X0 = 120, DESK_Y1 = 1640, DESK_Z = 720, DESK_T = 34;
  var CAB = { x: 2480, y: 120, z: 0, w: 460, d: 560, h: 1320 };
  var CAB_SPOT = { x: CAB.x + CAB.w / 2, y: CAB.y + CAB.d + 300 };
  var MISS_COST = 1000;   // NVMe ~100 µs vs RAM ~100 ns
  var WALK = 2100;        // mm per second (visual)

  S.defineVisual('desk', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.ramGb = 128; this.wsGb = 64;
      this.cap = this.ramGb / GB_PER_SHEET; this.ws = this.wsGb / GB_PER_SHEET;
      this.slots = []; this.lastUsed = [];
      for (var i = 0; i < 32; i++) { this.slots.push(-1); this.lastUsed.push(0); }
      for (i = 0; i < Math.min(this.ws, this.cap); i++) this.slots[i] = i;
      this.deskW = this.deskWFor(this.cap); this.deskD = this.deskDFor(this.cap);
      this.worker = { x: 0, y: 0, mode: 'work', t: 0, dur: 0.3, from: null, to: null, carry: -1, want: -1, active: -1, ph: 0, slot: -1 };
      this.drawer = 0; this.flying = [];
      this.meter = 1; this.done = 0; this.trips = 0; this.clock = 0;
      var spot = this.deskSpot(); this.worker.x = spot.x; this.worker.y = spot.y;
      var self = this;
      var g = this.ui.group('Memory settings');
      this.sRam = g.slider({
        label: 'RAM (desk)', min: 0, max: RAM_STEPS.length - 1, step: 1, value: RAM_STEPS.indexOf(this.ramGb),
        fmt: function (v) { return RAM_STEPS[v] + ' GB'; }, valueText: function (v) { return RAM_STEPS[v] + ' gigabytes of RAM'; },
        onInput: function (v) { self.setRam(RAM_STEPS[v]); }
      });
      this.sWs = g.slider({
        label: 'Job needs', min: 16, max: 192, step: 8, value: this.wsGb,
        fmt: function (v) { return v + ' GB'; }, valueText: function (v) { return 'Working set ' + v + ' gigabytes'; },
        onInput: function (v) { self.setWs(v); }
      });
      this.ui.br();
      var b = this.ui.group('Quick tries');
      b.button('Squeeze RAM to 32 GB', function () { self.sRam.set(2); self.setRam(32); }, { kind: 'danger' });
      b.button('Give it 128 GB', function () { self.sRam.set(4); self.setRam(128); });
      this.ui.spacer();
      this.rFit = this.ui.readout('Fits on desk?', '');
      this.rSpeed = this.ui.readout('Speed', '');
      this.syncText(false);
    },
    deskWFor: function (cap) { return Math.min(COLS, cap) * SLOT_W + MARGIN * 2; },
    deskDFor: function (cap) { return Math.ceil(cap / COLS) * SLOT_D + MARGIN * 2; },
    deskSpot: function () { return { x: DESK_X0 + this.deskWFor(this.cap) + 230, y: DESK_Y1 - 230 }; },
    slotPos: function (i) {
      var cols = Math.min(COLS, this.cap), rows = Math.ceil(this.cap / COLS);
      var c = i % COLS, r = Math.floor(i / COLS);
      var sw = (this.deskW - MARGIN * 2) / cols, sd = (this.deskD - MARGIN * 2) / rows;
      return { x: DESK_X0 + MARGIN + (c + 0.5) * sw, y: DESK_Y1 - MARGIN - (r + 0.5) * sd };
    },
    thrashing: function () { return this.ws > this.cap; },
    targetSpeed: function () { var m = Math.max(0, 1 - this.cap / this.ws); return 1 / ((1 - m) + m * MISS_COST); },

    setRam: function (gb) {
      if (gb === this.ramGb) return;
      var old = this.cap;
      this.ramGb = gb; this.cap = gb / GB_PER_SHEET;
      // sheets that no longer fit fly back to the cabinet
      for (var i = this.cap; i < old; i++) if (this.slots[i] >= 0) { this.flyHome(i, this.slots[i]); this.slots[i] = -1; }
      var self = this, fw = this.deskW, fd = this.deskD;
      this.tween({ from: 0, to: 1, dur: 0.5, ease: 'snap', onUpdate: function (k) { self.deskW = U.lerp(fw, self.deskWFor(self.cap), k); self.deskD = U.lerp(fd, self.deskDFor(self.cap), k); } });
      if (this.worker.mode === 'work' && this.worker.slot >= this.cap) this.worker.t = this.worker.dur;
      this.syncText(true);
    },
    setWs: function (gb) {
      if (gb === this.wsGb) return;
      this.wsGb = gb; this.ws = gb / GB_PER_SHEET;
      for (var i = 0; i < this.cap; i++) if (this.slots[i] >= this.ws) { this.flyHome(i, this.slots[i]); this.slots[i] = -1; }
      this.syncText(true);
    },
    flyHome: function (slot, id) {
      var p = this.slotPos(slot);
      this.flying.push({ id: id, x0: p.x, y0: p.y, z0: DESK_Z + DESK_T, t: 0 });
    },
    syncText: function (ann) {
      var fits = !this.thrashing(), sp = this.targetSpeed();
      this.rFit.set(fits ? '✓ yes · ' + this.wsGb + ' of ' + this.ramGb + ' GB' : '✕ no · needs ' + this.wsGb + ' GB, desk ' + this.ramGb + ' GB', fits ? 'ok' : 'bad');
      this.rSpeed.set(fmtPct(sp) + ' of normal', fits ? 'ok' : 'bad');
      var d = fits ? 'The job (' + this.wsGb + ' GB) fits on the desk (' + this.ramGb + ' GB of RAM): the worker stays at the desk and runs at full speed.'
        : 'The job needs ' + this.wsGb + ' GB but the desk holds ' + this.ramGb + ' GB: the worker keeps swapping papers with the filing cabinet (thrashing) and speed drops to about ' + fmtPct(sp) + '.';
      this.setDesc(d);
      if (ann) this.announce(fits ? 'Fits in RAM. Full speed.' : 'Does not fit. Thrashing: speed drops to ' + fmtPct(sp) + '.');
    },

    // ---------------------------------------------------------------- simulation
    update: function (dt) {
      var wk = this.worker;
      this.clock += dt;
      this.meter = U.damp(this.meter, this.targetSpeed(), this.thrashing() ? 3.5 : 2.2, dt);
      this.drawer = U.damp(this.drawer, wk.mode === 'cab' ? 1 : 0, 9, dt);
      for (var f = this.flying.length - 1; f >= 0; f--) { this.flying[f].t += dt / 0.9; if (this.flying[f].t >= 1) this.flying.splice(f, 1); }
      wk.t += dt;
      if (wk.mode === 'walk') {
        wk.ph += dt * 9;
        var k = Math.min(1, wk.t / wk.dur);
        wk.x = U.lerp(wk.from.x, wk.to.x, k); wk.y = U.lerp(wk.from.y, wk.to.y, k);
        if (k >= 1) this.arrive();
      } else if (wk.t >= wk.dur) {
        if (wk.mode === 'cab') { // swapped: carry the wanted sheet back
          wk.carry = wk.want; this.walkTo(this.deskSpot(), 'desk');
        } else if (wk.mode === 'place') {
          this.next();
        } else this.next();
      }
    },
    walkTo: function (to, dest) {
      var wk = this.worker;
      wk.mode = 'walk'; wk.dest = dest; wk.t = 0;
      wk.from = { x: wk.x, y: wk.y }; wk.to = to;
      wk.dur = Math.max(0.2, Math.hypot(to.x - wk.x, to.y - wk.y) / WALK);
      this.trips += dest === 'cab' ? 1 : 0;
    },
    arrive: function () {
      var wk = this.worker;
      if (wk.dest === 'cab') { wk.mode = 'cab'; wk.t = 0; wk.dur = 0.65; wk.carry = -1; }
      else {
        // put the fetched sheet into a free slot
        var s = this.freeSlot();
        if (s >= 0 && wk.carry >= 0) { this.slots[s] = wk.carry; this.lastUsed[s] = this.clock; wk.active = wk.carry; wk.slot = s; }
        wk.carry = -1; wk.mode = 'place'; wk.t = 0; wk.dur = 0.35;
        this.done++;
      }
    },
    freeSlot: function () { for (var i = 0; i < this.cap; i++) if (this.slots[i] < 0) return i; return -1; },
    next: function () {
      var wk = this.worker, spot = this.deskSpot();
      if (Math.hypot(wk.x - spot.x, wk.y - spot.y) > 30) { this.walkTo(spot, 'desk'); return; }
      var want = this.rng.int(0, this.ws - 1), slot = -1;
      for (var i = 0; i < this.cap; i++) if (this.slots[i] === want) { slot = i; break; }
      if (slot >= 0) { // hit: work on it right here
        wk.mode = 'work'; wk.t = 0; wk.dur = 0.22; wk.active = want; wk.slot = slot; this.lastUsed[slot] = this.clock; this.done++;
        return;
      }
      // miss: need a free slot — evict the least recently used sheet and carry it back
      var free = this.freeSlot();
      wk.want = want; wk.active = -1; wk.carry = -1;
      if (free < 0) {
        var lru = 0; for (i = 1; i < this.cap; i++) if (this.lastUsed[i] < this.lastUsed[lru]) lru = i;
        wk.carry = this.slots[lru]; this.slots[lru] = -1;
      }
      this.walkTo(CAB_SPOT, 'cab');
    },

    // ---------------------------------------------------------------- layout + drawing
    resize: function (w, h) {
      this.mobile = w < 560;
      var bb = { x0: 0, y0: 80, z0: 0, x1: 2980, y1: 1760, z1: 1420 };
      this.V = I.view({});
      if (this.mobile) { this.panel = { x: 14, y: 12, w: w - 28, h: 92 }; this.V.fit(bb, w, h - 112, 12); this.V.oy += 108; }
      else { this.panel = { x: 16, y: 16, w: Math.min(230, w * 0.26), h: h - 32 }; var px = this.panel.w + 24; this.V.fit(bb, w - px, h, 14); this.V.ox += px; }
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, V = this.V, self = this, wk = this.worker;
      D.clear(ctx, w, h);
      I.floorGrid(ctx, V, 0, 0, 3000, 1800, 150, P.grid, 0.7);
      var thr = this.thrashing();

      // walking path (dashed) between desk and cabinet
      var a = V.p(this.deskSpot().x, this.deskSpot().y, 0), c = V.p(CAB_SPOT.x, CAB_SPOT.y, 0);
      D.line(ctx, a[0], a[1], c[0], c[1], U.rgba(thr ? P.fault : P.text3, thr ? 0.55 : 0.25), thr ? 1.6 : 1, [6, 6]);
      if (thr) { var mid = V.p((this.deskSpot().x + CAB_SPOT.x) / 2, (this.deskSpot().y + CAB_SPOT.y) / 2, 0); D.text(ctx, 'SWAP TRIPS', mid[0] + 10, mid[1] + 12, { size: 9.5, weight: 700, color: P.fault, ls: 1 }); }

      // cabinet + drawer
      I.shadow(ctx, V, CAB, 0.25);
      var dn = 4, dh = (CAB.h - 60) / dn;
      I.box(ctx, V, CAB, { color: 'steel', decal: { left: function (g, fw, fh) {
        for (var i = 0; i < dn; i++) {
          var y = 30 + i * dh;
          g.fillStyle = U.shade(P.steel, -0.18); g.fillRect(24, y + 8, fw - 48, dh - 16);
          g.fillStyle = U.shade(P.alu, 0.1); g.fillRect(fw / 2 - 60, y + dh * 0.28, 120, 20);
          g.fillStyle = U.shade(P.alu, 0.45); g.fillRect(fw / 2 - 45, y + dh * 0.55, 90, 34);
        }
      } } });
      var dz = CAB.h - 30 - dh, dop = this.drawer * 380;
      if (dop > 4) {
        I.box(ctx, V, { x: CAB.x + 24, y: CAB.y + CAB.d - 380 + dop, z: dz + 8, w: CAB.w - 48, d: 380, h: dh - 16 }, { color: U.shade(P.steel, -0.05), decal: { top: function (g, fw, fd) {
          g.fillStyle = U.shade(P.alu, 0.5);
          for (var i = 0; i < 9; i++) g.fillRect(20, 20 + i * (fd - 40) / 9, fw - 40, 12);
        } } });
      }

      // desk
      var dk = { x: DESK_X0, y: DESK_Y1 - this.deskD, z: DESK_Z, w: this.deskW, d: this.deskD, h: DESK_T };
      I.shadow(ctx, V, { x: dk.x, y: dk.y, z: 0, w: dk.w, d: dk.d }, 0.2);
      var lg = 50;
      [[dk.x + 20, dk.y + 20], [dk.x + dk.w - 20 - lg, dk.y + 20], [dk.x + 20, dk.y + dk.d - 20 - lg], [dk.x + dk.w - 20 - lg, dk.y + dk.d - 20 - lg]].forEach(function (q) {
        I.box(ctx, V, { x: q[0], y: q[1], z: 0, w: lg, d: lg, h: DESK_Z }, { color: 'steel' });
      });
      I.box(ctx, V, dk, { color: thr ? U.mix(P.copper, P.fault, 0.25) : P.copper, decal: { top: function (g, fw, fd) {
        g.strokeStyle = U.rgba(P.text1, 0.12); g.lineWidth = 2 * I.px;
        for (var y = 40; y < fd; y += 60) { g.beginPath(); g.moveTo(10, y); g.lineTo(fw - 10, y + 6); g.stroke(); }
      } } });

      // sheets on the desk
      for (var i = 0; i < this.cap; i++) {
        var id = this.slots[i]; var sp = this.slotPos(i);
        if (id < 0) { // empty slot outline
          var o = I.facePts(V, { x: sp.x - SHEET_W / 2, y: sp.y - SHEET_D / 2, z: DESK_Z + DESK_T, w: SHEET_W, d: SHEET_D, h: 0 }, 'top');
          D.poly(ctx, o); ctx.setLineDash([3, 3]); ctx.strokeStyle = U.rgba(P.text1, 0.25); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
          continue;
        }
        this.sheet(ctx, sp.x, sp.y, DESK_Z + DESK_T, id, wk.mode === 'work' && wk.slot === i ? 1 : 0);
      }
      // flying sheets returning to the cabinet
      for (i = 0; i < this.flying.length; i++) {
        var fl = this.flying[i], k = U.ease.inOutSine(fl.t);
        this.sheet(ctx, U.lerp(fl.x0, CAB.x + CAB.w / 2, k), U.lerp(fl.y0, CAB.y + CAB.d, k), U.lerp(fl.z0, CAB.h - 100, k) + Math.sin(k * Math.PI) * 600, fl.id, 0, 1 - k * 0.6);
      }

      // worker
      this.drawWorker(ctx);

      // labels
      var mob = this.mobile;
      var dl = V.p(dk.x + dk.w * 0.15, dk.y, DESK_Z + DESK_T);
      var cl = V.p(CAB.x + CAB.w / 2, CAB.y + CAB.d / 2, CAB.h);
      if (!mob) {
        D.leader(ctx, dl[0], dl[1], dl[0] - 10, Math.max(30, dl[1] - 70), 'DESK = RAM · ' + this.ramGb + ' GB', { color: P.blueprint, sub: 'fast · small · ~100 ns away' });
        D.leader(ctx, cl[0], cl[1], cl[0] - 70, Math.max(28, cl[1] - 52), 'CABINET = STORAGE · 4 TB', { color: P.blueprint, sub: 'huge · slow · ~100 µs away' });
      } else {
        var dlb = V.p(dk.x + dk.w / 2, dk.y + dk.d, 0);
        D.text(ctx, 'DESK = RAM · ' + this.ramGb + ' GB', dlb[0], dlb[1] + 16, { size: 9.5, weight: 700, color: P.text1, align: 'center' });
        D.text(ctx, 'CABINET = STORAGE', cl[0], cl[1] - 12, { size: 9.5, weight: 700, color: P.text1, align: 'center' });
      }

      if (thr) {
        var pulse = 0.75 + 0.25 * Math.sin(this.time * 4);
        var tp = mob ? [w / 2, this.panel.y + this.panel.h + 26] : [this.panel.x + this.panel.w + 30 + (w - this.panel.w - 30) / 2, h - 30];
        ctx.globalAlpha = pulse;
        D.pill(ctx, '⚠ THRASHING', tp[0], tp[1], { color: P.fault, size: mob ? 12 : 15, weight: 800, align: 'center', bg: U.rgba(P.panel, 0.95) });
        ctx.globalAlpha = 1;
      }
      this.drawPanel(ctx);
    },
    /** one sheet of paper (8 GB of the working set) */
    sheet: function (ctx, x, y, z, id, glow, alpha) {
      var P = S.pal, V = this.V, TAB = [P.data, P.net, P.power, P.ok, P.mgmt, P.accent, P.heat, P.warn];
      var b = { x: x - SHEET_W / 2, y: y - SHEET_D / 2, z: z, w: SHEET_W, d: SHEET_D, h: 4 };
      var tab = TAB[id % TAB.length];
      I.box(ctx, V, b, { color: U.shade(P.alu, 0.55), alpha: alpha == null ? 1 : alpha, noStroke: false, highlight: glow ? P.accent : null, decal: { top: function (g, fw, fd) {
        g.fillStyle = tab; g.fillRect(0, 0, fw, 22);
        g.fillStyle = U.rgba(P.silicon, 0.45);
        for (var i = 0; i < 7; i++) g.fillRect(18, 44 + i * 24, (i % 3 === 2 ? 0.55 : 0.85) * (fw - 36), 7);
      } } });
      if (glow) { var c = V.p(x, y, z); D.glow(ctx, c[0], c[1], 26, P.accent, 0.5); }
    },
    drawWorker: function (ctx) {
      var P = S.pal, V = this.V, wk = this.worker;
      var f = V.p(wk.x, wk.y, 0), s = 1700 * V.k * 0.46; // s ≈ half the body height in px
      var walking = wk.mode === 'walk', ph = wk.ph;
      var bob = walking ? Math.abs(Math.sin(ph)) * s * 0.05 : 0;
      ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.ellipse(f[0], f[1], s * 0.28, s * 0.1, 0, 0, U.TAU); ctx.fillStyle = S.pal.dark ? '#000' : U.rgba(P.text3, 0.6); ctx.fill(); ctx.globalAlpha = 1;
      var hipY = f[1] - s * 0.9 - bob, shY = f[1] - s * 1.55 - bob;
      var body = this.thrashing() ? U.mix(P.alu, P.fault, 0.25) : P.alu;
      ctx.strokeStyle = U.shade(body, -0.25); ctx.lineWidth = Math.max(2.2, s * 0.1); ctx.lineCap = 'round';
      ctx.beginPath();
      for (var l = 0; l < 2; l++) {
        var sw = walking ? Math.sin(ph + l * Math.PI) * s * 0.25 : (l ? 1 : -1) * s * 0.08;
        ctx.moveTo(f[0] + (l ? 1 : -1) * s * 0.06, hipY); ctx.lineTo(f[0] + sw, f[1] - (walking ? Math.max(0, Math.cos(ph + l * Math.PI)) * s * 0.1 : 0));
      }
      ctx.stroke();
      // torso
      D.box(ctx, f[0] - s * 0.16, shY, s * 0.32, hipY - shY + s * 0.05, s * 0.1, body);
      // arms: typing at desk, holding a sheet while walking
      var typing = wk.mode === 'work' || wk.mode === 'place';
      ctx.strokeStyle = U.shade(body, -0.15); ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.beginPath();
      var ay = shY + s * 0.12, tk = typing ? Math.sin(this.time * 18) * s * 0.04 : 0;
      ctx.moveTo(f[0] - s * 0.18, ay); ctx.lineTo(f[0] - s * 0.34, ay + s * 0.3 + tk);
      ctx.moveTo(f[0] + s * 0.18, ay); ctx.lineTo(f[0] + s * 0.34, ay + s * 0.3 - tk);
      ctx.stroke(); ctx.lineCap = 'butt';
      D.circle(ctx, f[0], shY - s * 0.2, s * 0.14, U.shade(body, 0.25));
      // carried sheet
      if (wk.carry >= 0 || (wk.mode === 'walk' && wk.dest === 'desk' && wk.carry >= 0)) {
        var TAB = [P.data, P.net, P.power, P.ok, P.mgmt, P.accent, P.heat, P.warn];
        var cx = f[0] + s * 0.36, cy = ay + s * 0.15;
        D.box(ctx, cx - s * 0.2, cy - s * 0.26, s * 0.4, s * 0.5, 2, U.shade(P.alu, 0.55), U.rgba(P.silicon, 0.5), 1);
        ctx.fillStyle = TAB[wk.carry % TAB.length]; ctx.fillRect(cx - s * 0.2, cy - s * 0.26, s * 0.4, s * 0.08);
      }
      if (wk.mode === 'cab') { D.g.clock(ctx, f[0], shY - s * 0.75, Math.max(14, s * 0.4), P.warn, this.time * 6); }
    },
    drawPanel: function (ctx) {
      var P = S.pal, pn = this.panel, mob = this.mobile, thr = this.thrashing(), sp = this.meter;
      D.box(ctx, pn.x, pn.y, pn.w, pn.h, 10, U.rgba(P.panel, 0.88), U.rgba(P.panel3, 0.9), 1);
      var x = pn.x + 12, y = pn.y + 18, iw = pn.w - 24;
      D.text(ctx, 'THROUGHPUT', x, y, { size: 9.5, weight: 700, color: P.text2, ls: 1.4 });
      D.text(ctx, fmtPct(sp), mob ? x + 96 : x + iw, y, { size: mob ? 13 : 14, weight: 800, color: thr ? P.fault : P.ok, align: mob ? 'left' : 'right' });
      D.meter(ctx, x, y + 11, iw, 10, sp, thr ? P.fault : P.ok);
      // working set: one glyph per sheet, solid = on the desk, hollow = in the cabinet
      var y2 = y + (mob ? 40 : 46);
      var onDesk = 0; for (var i = 0; i < this.cap; i++) if (this.slots[i] >= 0) onDesk++;
      D.text(ctx, 'JOB · ' + this.wsGb + ' GB = ' + this.ws + ' sheets', x, y2, { size: 9.5, weight: 700, color: P.text2 });
      var gw = mob ? 9 : 11, gh = mob ? 12 : 14, gap = 3, perRow = Math.max(1, Math.floor((iw + gap) / (gw + gap)));
      var on = {}; for (i = 0; i < this.cap; i++) if (this.slots[i] >= 0) on[this.slots[i]] = 1;
      for (i = 0; i < this.ws; i++) {
        var gx = x + (i % perRow) * (gw + gap), gy = y2 + 10 + Math.floor(i / perRow) * (gh + gap);
        if (on[i]) D.box(ctx, gx, gy, gw, gh, 2, U.shade(P.alu, 0.45), U.rgba(P.ok, 0.8), 1);
        else D.box(ctx, gx, gy, gw, gh, 2, null, U.rgba(P.fault, 0.8), 1);
      }
      if (mob) return;
      var rows = Math.ceil(this.ws / perRow), y3 = y2 + 22 + rows * (gh + gap);
      D.text(ctx, '▮ on desk  ▯ in cabinet', x, y3, { size: 9, color: P.text3 });
      D.text(ctx, onDesk + ' of ' + this.ws + ' on the desk', x, y3 + 15, { size: 10, color: P.text2 });
      var y4 = y3 + 44;
      if (thr) {
        D.text(ctx, 'Every missing sheet =', x, y4, { size: 10.5, color: P.text2, sans: true });
        D.text(ctx, 'a walk to the cabinet', x, y4 + 15, { size: 10.5, color: P.text2, sans: true });
        D.text(ctx, '≈ 1,000× slower', x, y4 + 34, { size: 13, weight: 800, color: P.fault });
        D.text(ctx, 'than reaching the desk.', x, y4 + 50, { size: 10.5, color: P.text2, sans: true });
      } else {
        D.text(ctx, 'Everything is within', x, y4, { size: 10.5, color: P.text2, sans: true });
        D.text(ctx, 'arm’s reach: no trips.', x, y4 + 15, { size: 10.5, color: P.text2, sans: true });
        D.text(ctx, '✓ full speed', x, y4 + 34, { size: 13, weight: 800, color: P.ok });
      }
    }
  });

  function fmtPct(v) { v *= 100; return (v >= 10 ? U.fmt(v, 0) : v >= 1 ? U.fmt(v, 1) : U.fmt(v, 2)) + '%'; }
})(window.SRV);
