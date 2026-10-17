/* Ch15 · Guided build bench. A barebones 2U chassis (board pre-installed) on an anti-static mat.
   Ten steps, each with a small hands-on interaction; parts ink from blueprint ghosts to solid as they seat. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso, M = S.models;

  var STEPS = [
    { key: 'esd', title: 'Ground yourself', why: 'Static you can’t feel can kill a chip. Clip the wrist strap to bare chassis metal.' },
    { key: 'cpu', title: 'Seat the CPU', why: 'Line up the gold triangle with the socket’s mark, then lower it straight down — never slide.' },
    { key: 'paste', title: 'Thermal paste', why: 'A pea-sized dot spreads into a thin, full layer. Too little leaves air gaps; too much oozes.' },
    { key: 'screws', title: 'Heatsink screws', why: 'Tighten in a cross (X) pattern so pressure stays even.' },
    { key: 'ram', title: 'Memory', why: 'Follow the population chart: same slots on every channel. Push until both latches click.' },
    { key: 'drives', title: 'Drives', why: 'Drives go into caddies, caddies slide into the front bays until the latch closes.' },
    { key: 'cards', title: 'PCIe cards', why: 'RAID/HBA and network cards go in the slots the vendor recommends for lanes and airflow.' },
    { key: 'air', title: 'Fan wall + air shroud', why: 'The shroud forces air through the heatsink. Forgetting it is the classic overheating mistake.' },
    { key: 'psu', title: 'Power supplies', why: 'Hot-swap PSUs slide in last from the rear. Later, plug them into two different circuits.' },
    { key: 'lid', title: 'Lid on + bench test', why: 'Close it up and power on the bench before racking. First boot is slow: memory training.' }
  ];
  var GROUP_STEP = { cpuchip: 1, cpu: 3, ram: 4, drives: 5, raid: 6, nic: 6, fans: 7, shroud: 7, psu: 8, lid: 9 };

  S.defineVisual('assembly', {
    init: function () {
      this.ctx = this.layer();
      this.parts = M.server({ drives: 8, dimms: 12, shroud: true, lid: true, cut: true, raid: true, nic: true });
      // the CPU package itself, under the heatsink
      this.parts.push({ id: 'cpuchip', group: 'cpuchip', b: { x: 140, y: 205, z: 6, w: 62, d: 80, h: 6 }, color: 'silicon', decal: { top: function (c, w, h) { c.fillStyle = U.rgba(S.pal.alu, 0.8); c.fillRect(6, 6, w - 12, h - 12); c.fillStyle = S.pal.gold; c.beginPath(); c.moveTo(2, 2); c.lineTo(14, 2); c.lineTo(2, 14); c.fill(); } }, explode: [0, 0, 160] });
      this.step = 0; this.done = {}; this.seat = {}; // seat[group] 0..1
      Object.keys(GROUP_STEP).forEach(function (g) { this.seat[g] = 0; }, this);
      this.rot = 2; this.paste = 15; this.pressed = false; this.screwOrder = []; this.tilt = 0; this.strap = 0; this.spark = 0; this.warn = ''; this.power = 0;
      this.V = I.view();
      var self = this;
      this.pointer({
        down: function (p) { var it = self.hits.query(p.x, p.y); if (it && it.id.indexOf('screw') === 0) self.screw(it.data); return false; },
        hover: function (p) { var it = self.hits.query(p.x, p.y); self.stage.style.cursor = it ? 'pointer' : ''; }
      });
      this.buildControls();
    },
    resize: function (w, h) {
      this.mobile = w < 620;
      var sceneW = this.mobile ? w : w * 0.66, sceneX = this.mobile ? 0 : w * 0.34;
      this.V.fit({ x0: -40, y0: -60, z0: -10, x1: 480, y1: 700, z1: 250 }, sceneW, this.mobile ? h * 0.62 : h, this.mobile ? 6 : 26);
      this.V.ox += sceneX;
      if (this.mobile) this.V.oy += h * 0.36;
    },
    buildControls: function () {
      var self = this, st = STEPS[this.step];
      this.ctrl.innerHTML = '';
      var nav = this.ui.group('Steps');
      nav.button('◀', function () { self.go(self.step - 1); }, { title: 'Previous step' }).setDisabled(this.step === 0);
      nav.text('<b>' + (this.step + 1) + '/10</b> ' + st.title, 'ctl');
      var nx = nav.button('Next ▶', function () { self.go(self.step + 1); }, { kind: this.done[this.step] ? 'primary' : '' });
      nx.setDisabled(!this.done[this.step] || this.step === 9);
      this.ui.br();
      var g = this.ui.group('Do it');
      if (st.key === 'esd') g.button('🔗 Clip on the wrist strap', function () { self.doStrap(); }, { kind: 'primary' });
      if (st.key === 'cpu') {
        g.button('⟲ Rotate', function () { self.rot = (self.rot + 3) % 4; self.warn = ''; });
        g.button('⟳ Rotate', function () { self.rot = (self.rot + 1) % 4; self.warn = ''; });
        g.button('⬇ Lower CPU', function () { self.lowerCpu(); }, { kind: 'primary' });
      }
      if (st.key === 'paste') {
        g.slider({ label: 'Paste amount', min: 0, max: 100, step: 1, value: this.paste, fmt: function (v) { return v < 30 ? 'too little' : v > 62 ? 'too much' : 'pea-sized'; }, onInput: function (v) { self.paste = v; self.pressed = false; self.warn = ''; } });
        g.button('⬇ Press heatsink', function () { self.pressPaste(); }, { kind: 'primary' });
      }
      if (st.key === 'screws') {
        [['TL', 0], ['TR', 1], ['BR', 2], ['BL', 3]].forEach(function (s) { g.button('Screw ' + s[0], function () { self.screw(s[1]); }); });
        g.button('↺ Loosen all', function () { self.screwOrder = []; self.tilt = 0; self.warn = ''; });
      }
      if (['ram', 'drives', 'cards', 'psu', 'lid'].indexOf(st.key) >= 0) g.button(st.key === 'lid' ? '⏻ Lid on + power on' : 'Install', function () { self.install(st.key); }, { kind: 'primary' });
      if (st.key === 'air') {
        g.button('Install fans + shroud', function () { self.install('air'); }, { kind: 'primary' });
        g.button('Skip the shroud?', function () { self.warn = 'Without the shroud, air bypasses the heatsink → CPU overheats (see Chapter 11).'; self.invalidate(); });
      }
      g.button('↺ Restart build', function () { self.restart(); });
    },
    go: function (i) {
      if (i < 0 || i > 9) return;
      if (i > this.step && !this.done[this.step]) return;
      this.step = i; this.warn = ''; this.buildControls(); this.invalidate();
      this.announce('Step ' + (i + 1) + ': ' + STEPS[i].title + '. ' + STEPS[i].why);
    },
    complete: function (msg) {
      this.done[this.step] = true; this.warn = '';
      this.buildControls();
      this.announce((msg || 'Done.') + ' Press Next.');
      if (this.step === 9) S.markDone(15);
    },
    seatGroup: function (groups, dur) {
      var self = this;
      groups.forEach(function (g, i) { self.tween({ from: self.seat[g], to: 1, dur: dur || 0.9, delay: i * 0.12, ease: 'snap', onUpdate: function (v) { self.seat[g] = v; } }); });
    },
    doStrap: function () {
      var self = this;
      this.tween({ from: 0, to: 1, dur: 0.8, ease: 'snap', onUpdate: function (v) { self.strap = v; }, onDone: function () { self.tween({ from: 1, to: 0, dur: 0.7, onUpdate: function (v) { self.spark = v; } }); self.complete('Strap on: static drains safely to the chassis.'); } });
    },
    lowerCpu: function () {
      var self = this;
      if (this.rot !== 0) { this.warn = '✕ Triangle not aligned — forcing it bends pins! Rotate until the gold triangles match.'; this.announce(this.warn); this.invalidate(); return; }
      this.seatGroup(['cpuchip'], 0.8);
      setTimeout(function () { self.complete('CPU seated: triangle aligned, lowered straight down.'); }, 500);
    },
    pressPaste: function () {
      this.pressed = true;
      if (this.paste < 30) this.warn = '⚠ Too little: air gaps leave hot spots. Add more.';
      else if (this.paste > 62) this.warn = '⚠ Too much: paste oozes over the edge. Use less.';
      else { this.warn = ''; this.complete('Pea-sized dot spread into a thin, complete layer.'); }
      if (this.warn) this.announce(this.warn);
      this.invalidate();
    },
    screw: function (i) {
      if (STEPS[this.step].key !== 'screws' || this.done[this.step]) return;
      if (this.screwOrder.indexOf(i) >= 0) return;
      var order = [0, 2, 1, 3]; // TL, BR, TR, BL — a cross pattern
      var expect = order[this.screwOrder.length];
      this.screwOrder.push(i);
      if (i !== expect) {
        this.tilt = 1; this.warn = '⚠ Not a cross pattern — the heatsink tilts and only touches one edge. Loosen all and try TL → BR → TR → BL.';
        this.announce(this.warn);
      } else if (this.screwOrder.length === 4) {
        this.seatGroup(['cpu'], 0.7);
        this.complete('Heatsink tightened evenly in an X pattern.');
      }
      this.invalidate();
    },
    install: function (key) {
      var self = this;
      var map = { ram: ['ram'], drives: ['drives'], cards: ['raid', 'nic'], air: ['fans', 'shroud'], psu: ['psu'], lid: ['lid'] };
      this.seatGroup(map[key], 1);
      var msgs = { ram: '12 DIMMs, one per channel: balanced.', drives: '8 drives clicked into the front bays.', cards: 'RAID controller and network card seated.', air: 'Fan wall in, shroud on: air goes through the heatsink.', psu: 'Both power supplies latched.', lid: 'Lid on. Power on: fans roar, memory training… POST OK.' };
      setTimeout(function () {
        if (key === 'lid') self.tween({ from: 0, to: 1, dur: 2, onUpdate: function (v) { self.power = v; } });
        self.complete(msgs[key]);
      }, 700);
    },
    restart: function () {
      var self = this;
      Object.keys(this.seat).forEach(function (g) { self.seat[g] = 0; });
      this.done = {}; this.rot = 2; this.paste = 15; this.pressed = false; this.screwOrder = []; this.tilt = 0; this.strap = 0; this.power = 0; this.warn = '';
      this.go(0);
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, V = this.V, self = this, st = STEPS[this.step];
      D.clear(ctx, w, h);
      this.hits.clear();
      // anti-static mat
      var mat = { x: -60, y: -80, z: -8, w: 560, d: 800, h: 8 };
      I.box(ctx, V, mat, { color: S.pal.dark ? '#2B1F3A' : '#B9A9D0', noStroke: true, decal: { top: function (c, ww, hh) { c.strokeStyle = U.rgba(S.pal.text3, 0.25); c.lineWidth = I.px; for (var x = 20; x < ww; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, hh); c.stroke(); } } } });
      M.t = this.time; M.fanAngle = this.time * 12 * this.power; M.fanBlur = this.power > 0.5 ? 1 : 0; M.dataFlow = false; M.driveState = this.power > 0.3 ? null : function () { return 'off'; }; M.fanDead = null;
      var tiltZ = this.tilt * 8;
      M.draw(ctx, V, this.parts, {
        state: function (p) {
          if (p.group === 'gpu') return { hidden: true };
          var s = GROUP_STEP[p.group];
          if (s == null) return {};
          var k = self.seat[p.group];
          var e = p.explode || [0, 0, 0];
          var off = [e[0] * (1 - k), e[1] * (1 - k), e[2] * (1 - k)];
          if (p.group === 'lid') off = [0, 0, 260 * (1 - k)];
          if (p.group === 'cpu' && k < 1) { off = [0, 0, (self.step >= 3 ? 30 : 140) * (1 - k)]; if (self.tilt && self.step === 3) off[2] += tiltZ; }
          var active = s === self.step;
          if (k <= 0.001) return { offset: off, state: 'blueprint', inkT: 0, alpha: active ? 1 : 0.45, highlight: active ? P.accent : null };
          return { offset: off, inkT: k, state: k < 1 ? 'blueprint' : 'solid' };
        }
      });
      // wrist strap
      if (this.step === 0 || this.strap > 0) {
        var a = V.p(0, 600, 60), b = V.p(-40, 760, 0);
        ctx.strokeStyle = U.rgba(P.accent, 0.4 + this.strap * 0.6); ctx.lineWidth = 2; ctx.setLineDash(this.strap > 0.9 ? [] : [5, 4]);
        ctx.beginPath(); ctx.moveTo(b[0] - 40, b[1] + 30); ctx.quadraticCurveTo(b[0], b[1] + 50, U.lerp(b[0] - 30, a[0], this.strap), U.lerp(b[1] + 10, a[1], this.strap)); ctx.stroke(); ctx.setLineDash([]);
        D.circle(ctx, b[0] - 46, b[1] + 30, 9, null, P.accent, 3);
        if (this.strap < 0.5 && this.step === 0) D.g.bolt(ctx, b[0] - 46, b[1] + 6, 16, P.warn);
        if (this.spark > 0) D.glow(ctx, a[0], a[1], 40 * this.spark, P.accent, this.spark);
      }
      // power-on overlay
      if (this.power > 0) {
        var led = V.p(420, 640, 70); D.led(ctx, led[0], led[1], P.ok, 'solid', 0, 3);
        var txt = this.power < 0.6 ? 'MEMORY TRAINING…' : 'POST OK ✓';
        var q = V.p(220, 320, 330); D.pill(ctx, txt, q[0], q[1], { color: this.power < 0.6 ? P.warn : P.ok, align: 'center', size: 12 });
      }
      // step rail (desktop)
      if (!this.mobile) {
        var rx = 18, ry = 22, rh = (h - 44) / 10;
        STEPS.forEach(function (s, i) {
          var y = ry + i * rh, cur = i === self.step, dn = self.done[i];
          D.circle(ctx, rx + 10, y + rh / 2, 9, dn ? P.ok : cur ? U.rgba(P.accent, 0.2) : null, dn ? P.ok : cur ? P.accent : U.rgba(P.text3, 0.6), 1.5);
          if (dn) D.g.check(ctx, rx + 10, y + rh / 2, 12, P.bg);
          else D.text(ctx, String(i + 1), rx + 10, y + rh / 2, { size: 9, weight: 700, color: cur ? P.accent : P.text3, align: 'center' });
          if (i < 9) D.line(ctx, rx + 10, y + rh / 2 + 10, rx + 10, y + rh * 1.5 - 10, U.rgba(P.text3, 0.3), 1);
          D.text(ctx, s.title, rx + 28, y + rh / 2, { size: 12, weight: cur ? 700 : 500, color: cur ? P.text1 : dn ? P.text2 : P.text3, sans: true });
        });
      }
      // explanation + warning panel
      var px = this.mobile ? 12 : w * 0.24, pw = this.mobile ? w - 24 : Math.min(420, w * 0.42), py = this.mobile ? 10 : 16;
      D.box(ctx, px, py, pw, this.warn ? 74 : 50, 10, U.rgba(P.panel, 0.92), U.rgba(P.blueprint, 0.4));
      D.text(ctx, 'WHY', px + 12, py + 15, { size: 9, weight: 700, color: P.blueprint, ls: 1 });
      wrap(ctx, st.why, px + 12, py + 31, pw - 24, 12, P.text1);
      if (this.warn) wrap(ctx, this.warn, px + 12, py + 58, pw - 24, 11, this.warn[0] === '✕' ? P.fault : P.warn);
      // close-up insets
      var ix = this.mobile ? w - 132 : w - 170, iy = this.mobile ? 96 : 20, is = this.mobile ? 118 : 150;
      if (st.key === 'cpu' && !this.done[1]) this.insetCpu(ctx, ix, iy, is);
      if (st.key === 'paste') this.insetPaste(ctx, ix, iy, is);
      if (st.key === 'screws') this.insetScrews(ctx, ix, iy, is);
      this.setDesc('Step ' + (this.step + 1) + ' of 10: ' + st.title + (this.done[this.step] ? ' — done.' : '.') + (this.warn ? ' ' + this.warn : ''));
    },
    insetFrame: function (ctx, x, y, s, label) {
      D.box(ctx, x, y, s, s + 18, 10, U.rgba(S.pal.panel, 0.95), U.rgba(S.pal.accent, 0.6));
      D.text(ctx, label, x + 10, y + 12, { size: 9, weight: 700, color: S.pal.accent, ls: 1 });
    },
    insetCpu: function (ctx, x, y, s) {
      var P = S.pal; this.insetFrame(ctx, x, y, s, 'CLOSE-UP · SOCKET');
      var cx = x + s / 2, cy = y + 18 + s / 2, r = s * 0.32;
      D.box(ctx, cx - r - 8, cy - r - 8, (r + 8) * 2, (r + 8) * 2, 4, U.rgba(P.alu, 0.15), P.alu, 1);
      ctx.fillStyle = P.gold; ctx.beginPath(); ctx.moveTo(cx - r - 8, cy - r - 8); ctx.lineTo(cx - r + 8, cy - r - 8); ctx.lineTo(cx - r - 8, cy - r + 8); ctx.fill();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.rot * Math.PI / 2);
      D.box(ctx, -r, -r, r * 2, r * 2, 3, P.silicon, this.rot === 0 ? P.ok : P.warn, 2);
      ctx.fillStyle = P.gold; ctx.beginPath(); ctx.moveTo(-r + 3, -r + 3); ctx.lineTo(-r + 15, -r + 3); ctx.lineTo(-r + 3, -r + 15); ctx.fill();
      ctx.restore();
      D.text(ctx, this.rot === 0 ? 'ALIGNED ✓' : 'rotate ' + ((4 - this.rot) % 4) * 90 + '°', cx, y + s + 8, { size: 10, weight: 700, color: this.rot === 0 ? P.ok : P.warn, align: 'center' });
    },
    insetPaste: function (ctx, x, y, s) {
      var P = S.pal; this.insetFrame(ctx, x, y, s, 'CLOSE-UP · CPU LID');
      var cx = x + s / 2, cy = y + 18 + s / 2, half = s * 0.34;
      D.box(ctx, cx - half, cy - half, half * 2, half * 2, 4, P.alu, U.shade(P.alu, -0.3), 1);
      var amt = this.paste / 100;
      var rad = this.pressed ? half * (0.35 + amt * 1.25) : half * (0.08 + amt * 0.3);
      ctx.save(); D.rr(ctx, cx - half - (this.pressed && amt > 0.62 ? 14 : 0), cy - half - (this.pressed && amt > 0.62 ? 14 : 0), half * 2 + (this.pressed && amt > 0.62 ? 28 : 0), half * 2 + (this.pressed && amt > 0.62 ? 28 : 0), 4); ctx.clip();
      D.circle(ctx, cx, cy, rad, '#C9CED6', U.shade('#C9CED6', -0.3), 1);
      ctx.restore();
      if (this.pressed && amt < 0.3) { // gaps → hot corners
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { D.glow(ctx, cx + c[0] * half * 0.75, cy + c[1] * half * 0.75, 18, P.heat, 0.9); });
      }
      D.text(ctx, this.pressed ? (amt < 0.3 ? 'GAPS = HOT SPOTS' : amt > 0.62 ? 'OOZING OVER' : 'FULL, THIN LAYER ✓') : 'before pressing', cx, y + s + 8, { size: 10, weight: 700, color: !this.pressed ? P.text3 : amt < 0.3 || amt > 0.62 ? P.warn : P.ok, align: 'center' });
    },
    insetScrews: function (ctx, x, y, s) {
      var P = S.pal, self = this; this.insetFrame(ctx, x, y, s, 'CLOSE-UP · HEATSINK');
      var cx = x + s / 2, cy = y + 18 + s / 2, half = s * 0.32;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.tilt ? 0.08 : 0);
      D.box(ctx, -half, -half, half * 2, half * 2, 4, U.rgba(P.alu, 0.4), P.alu, 1);
      ctx.strokeStyle = U.rgba(P.alu, 0.6); for (var fx = -half + 6; fx < half; fx += 6) { ctx.beginPath(); ctx.moveTo(fx, -half + 4); ctx.lineTo(fx, half - 4); ctx.stroke(); }
      ctx.restore();
      var pos = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      var nums = { 0: 1, 2: 2, 1: 3, 3: 4 };
      pos.forEach(function (p, i) {
        var sx = cx + p[0] * half, sy = cy + p[1] * half, done = self.screwOrder.indexOf(i) >= 0;
        D.circle(ctx, sx, sy, 11, done ? P.ok : P.panel3, done ? P.ok : P.accent, 2);
        D.text(ctx, String(nums[i]), sx, sy + 0.5, { size: 10, weight: 800, color: done ? P.bg : P.text1, align: 'center' });
        self.hits.circle('screw' + i, sx, sy, 16, i);
      });
      D.text(ctx, 'tap in order 1 → 4', cx, y + s + 8, { size: 10, weight: 700, color: P.text3, align: 'center' });
    }
  });

  function wrap(ctx, text, x, y, maxW, size, color) {
    ctx.font = S.font(size, 500, false);
    var words = text.split(' '), line = '', yy = y;
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i] + ' ';
      if (ctx.measureText(test).width > maxW && line) { D.text(ctx, line, x, yy, { size: size, color: color, sans: true }); line = words[i] + ' '; yy += size + 4; }
      else line = test;
    }
    D.text(ctx, line, x, yy, { size: size, color: color, sans: true });
  }
})(window.SRV);
