/* Ch1 · The Morph (scroll-scrubbed): a desktop tower tips over and flattens into a 1U/2U rack server.
   Fans line up into a fan wall, the single PSU splits in two, drives move to front hot-swap bays. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso, M = S.models;

  function B(x, y, z, w, d, h) { return { x: x, y: y, z: z, w: w, d: d, h: h }; }
  function lerpB(a, b, t) { return { x: U.lerp(a.x, b.x, t), y: U.lerp(a.y, b.y, t), z: U.lerp(a.z, b.z, t), w: U.lerp(a.w, b.w, t), d: U.lerp(a.d, b.d, t), h: U.lerp(a.h, b.h, t) }; }

  // desktop tower occupies x 120..320, y 95..545, z 0..450 (front = +y)
  var DX = 120, DY = 95;
  var PARTS = [
    // id, group, desktop box, server box, color, extra
    ['base', 'chassis', B(DX, DY, 0, 200, 450, 4), B(0, 0, 0, 440, 640, 4), 'steel'],
    ['wall', 'chassis', B(DX, DY, 4, 3, 450, 446), B(0, 0, 4, 3, 640, 84), 'steel'],
    ['back', 'chassis', B(DX + 3, DY, 4, 197, 3, 446), B(3, 0, 4, 434, 3, 84), 'steel'],
    ['board', 'board', B(DX + 3, DY + 40, 70, 4, 340, 320), B(10, 20, 4, 320, 370, 2), 'pcb'],
    ['cpu', 'cpu', B(DX + 7, DY + 190, 250, 95, 100, 95), B(125, 190, 6, 92, 110, 62), 'alu'],
    ['ram0', 'ram', B(DX + 7, DY + 310, 300, 30, 4, 80), B(108, 180, 6, 4, 133, 32), 'pcb'],
    ['ram1', 'ram', B(DX + 7, DY + 318, 300, 30, 4, 80), B(226, 180, 6, 4, 133, 32), 'pcb'],
    ['gpu', 'nic', B(DX + 7, DY + 60, 160, 150, 280, 38), B(64, 24, 6, 4, 130, 50), 'steel'],
    ['psu0', 'psu', B(DX + 10, DY + 15, 4, 150, 160, 86), B(346, 6, 46, 88, 230, 40), 'steel'],
    ['drive0', 'drives', B(DX + 40, DY + 330, 10, 100, 115, 26), B(6, 488, 5, 105, 152, 26.5), 'plastic'],
    ['drive1', 'drives', B(DX + 40, DY + 330, 42, 100, 115, 26), B(113.5, 488, 5, 105, 152, 26.5), 'plastic'],
    ['fan0', 'fans', B(DX + 40, DY + 432, 250, 120, 15, 120), B(8, 404, 6, 68, 38, 72), 'plastic'],
    ['fan1', 'fans', B(DX + 50, DY + 3, 300, 100, 15, 100), B(79, 404, 6, 68, 38, 72), 'plastic'],
    ['front', 'chassis', B(DX, DY + 447, 4, 200, 3, 446), B(4, 480, 4, 432, 4, 82), 'steel']
  ];
  // extras that only exist in the server (ink in during later steps)
  var EXTRA = [];
  [2, 3, 4, 5].forEach(function (i) { EXTRA.push(['fan' + i, 'fans', B(8 + i * 71, 404, 6, 68, 38, 72), 'plastic', 2]); });
  EXTRA.push(['psu1', 'psu', B(346, 6, 4, 88, 230, 40), 'steel', 3]);
  for (var di = 2; di < 12; di++) EXTRA.push(['drive' + di, 'drives', B(6 + (di % 4) * 107.5, 488, 5 + Math.floor(di / 4) * 27.5, 105, 152, 26.5), 'plastic', 3]);
  [0, 1, 2, 3, 4].forEach(function (k) { EXTRA.push(['ramL' + k, 'ram', B(99 - k * 9, 180, 6, 4, 133, 32), 'pcb', 3]); EXTRA.push(['ramR' + k, 'ram', B(235 + k * 9, 180, 6, 4, 133, 32), 'pcb', 3]); });
  EXTRA.push(['bmc', 'bmc', B(30, 340, 6, 22, 22, 3), 'silicon', 4]);
  EXTRA.push(['lid', 'lid', B(0, 0, 88, 440, 640, 3), 'steel', 4]);
  EXTRA.push(['earL', 'chassis', B(-16, 636, 0, 16, 4, 88), 'steel', 4]);
  EXTRA.push(['earR', 'chassis', B(440, 636, 0, 16, 4, 88), 'steel', 4]);

  var STEP_TXT = [
    'A desktop tower: CPU, memory, one power supply, two drives, two fans.',
    'The tower lies down and flattens into a wide, thin rack chassis.',
    'Fans line up into a fan wall: air flows front to back.',
    'Second power supply, front hot-swap drive bays and full memory banks appear.',
    'Rack ears, a lid and a remote-management chip: it slides into a rack.'
  ];

  S.defineVisual('morph', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.p = 0; this.step = -1;
      var self = this;
      this.parts = PARTS.map(function (a) {
        var dec = null;
        if (a[0].indexOf('fan') === 0) dec = { left: M.decal.fanFront(+a[0].slice(3)) };
        if (a[0].indexOf('drive') === 0) dec = { left: M.decal.driveFront(+a[0].slice(5)) };
        if (a[0] === 'cpu') dec = { top: M.decal.heatsinkTop };
        if (a[0] === 'board') dec = { top: M.decal.boardTop('morph') };
        if (a[0].indexOf('ram') === 0) dec = { right: M.decal.dimmSide(true) };
        if (a[0] === 'psu0') dec = { top: M.decal.psuTop('PSU 1') };
        return { id: a[0], group: a[1], d: a[2], s: a[3], color: a[4], decal: dec, b: a[2] };
      });
      this.extras = EXTRA.map(function (a) {
        var dec = null;
        if (a[0].indexOf('fan') === 0) dec = { left: M.decal.fanFront(+a[0].slice(3)) };
        if (a[0].indexOf('drive') === 0) dec = { left: M.decal.driveFront(+a[0].slice(5)) };
        if (a[0].indexOf('ram') === 0) dec = { right: M.decal.dimmSide(true) };
        if (a[0] === 'psu1') dec = { top: M.decal.psuTop('PSU 2') };
        if (a[0] === 'bmc') dec = { top: M.decal.chipTop('BMC') };
        return { id: a[0], group: a[1], b: a[2], color: a[3], step: a[4], decal: dec };
      });
      this.V = I.view();
      // keyboard / reduced-motion stepper
      var g = this.ui.group('Morph steps');
      g.button('◀ Prev', function () { self.jump(-1); });
      g.button('Next ▶', function () { self.jump(1); });
      this.stepLabel = this.ui.text('', 'ctl');
    },
    jump: function (dir) {
      var steps = this.host.closest('.scrolly').querySelectorAll('.step');
      var i = U.clamp(this.step + dir, 0, steps.length - 1);
      steps[i].scrollIntoView({ block: 'center', behavior: this.reduced() ? 'auto' : 'smooth' });
    },
    resize: function (w, h) {
      this.V.fit({ x0: -60, y0: -40, z0: 0, x1: 500, y1: 680, z1: 470 }, w, h, w < 560 ? 8 : 24);
    },
    onProgress: function (p) {
      this.p = p;
      var st = Math.min(4, Math.floor(p * 5.0001));
      if (st !== this.step) {
        this.step = st;
        this.stepLabel.textContent = 'Step ' + (st + 1) + ' / 5';
        this.announce(STEP_TXT[st]);
      }
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, V = this.V, p = this.p, t = this.time, self = this;
      D.clear(ctx, w, h);
      var morphT = U.ease.inOutCubic(U.segment(p, 0.12, 0.38));
      var fanT = U.segment(p, 0.4, 0.55), redT = U.segment(p, 0.6, 0.76), rackT = U.segment(p, 0.8, 0.95);

      I.floorGrid(ctx, V, -60, -40, 500, 680, 40, P.grid, 0.45);
      var items = [];
      this.parts.forEach(function (pt, i) {
        var k = U.ease.inOutCubic(U.stagger(morphT, i, self.parts.length, 0.75));
        var b = lerpB(pt.d, pt.s, k);
        if (pt.id === 'front') return items.push({ p: pt, b: b, st: { alpha: 0.32 } });
        items.push({ p: pt, b: b, st: {} });
      });
      this.extras.forEach(function (ex) {
        var gate = ex.step === 2 ? fanT : ex.step === 3 ? redT : rackT;
        if (gate <= 0) return;
        var b = Object.assign({}, ex.b);
        var st = { inkT: U.ease.snap(gate), alpha: U.clamp(gate * 3, 0, 1) };
        if (ex.id === 'lid') { b.z += (1 - U.ease.outCubic(gate)) * 220; st.alpha = U.clamp(gate * 2, 0, 1) * 0.4; }
        if (ex.id.indexOf('drive') === 0) b.y += (1 - U.ease.outCubic(gate)) * 120;
        if (ex.id === 'psu1') b.y -= (1 - U.ease.outCubic(gate)) * 160;
        items.push({ p: ex, b: b, st: st });
      });
      // shadow under the whole thing
      I.shadow(ctx, V, morphT < 0.5 ? this.parts[0].d : { x: 0, y: 0, z: 0, w: 440, d: 640, h: 0 }, 0.25, 0, 14);

      M.t = t; M.fanAngle = t * 12; M.fanBlur = fanT > 0.5 ? 1 : 0; M.dataFlow = false; M.driveState = null; M.fanDead = null;
      I.sort(V, items).forEach(function (it) {
        I.box(ctx, V, it.b, { color: it.p.color, decal: it.p.decal, inkT: it.st.inkT, state: it.st.inkT != null && it.st.inkT < 1 ? 'blueprint' : 'solid', alpha: it.st.alpha });
      });

      // airflow streaks (front → back) once the fan wall exists
      if (fanT > 0) {
        var n = 14, len = 680;
        for (var a = 0; a < n; a++) {
          var lane = 30 + (a % 7) * 60, zz = a < 7 ? 30 : 64;
          var ph = ((t * 0.45 + a * 0.137) % 1);
          var y0 = 700 - ph * len, y1 = y0 - 60;
          var q0 = V.p(lane, y0, zz), q1 = V.p(lane, y1, zz);
          var col = ph < 0.5 ? P.air : U.mix(P.air, P.heat, (ph - 0.5) * 2);
          ctx.globalAlpha = fanT * (1 - Math.abs(ph - 0.5) * 1.4) * (rackT > 0.6 ? 0.4 : 1);
          D.line(ctx, q0[0], q0[1], q1[0], q1[1], col, 1.6); ctx.globalAlpha = 1;
        }
      }
      // rack posts + neighbour servers as ghosts
      if (rackT > 0) {
        [[-40, 610, -60, 20, 30, 300], [460, 610, -60, 20, 30, 300]].forEach(function (r) {
          I.box(ctx, V, B(r[0], r[1], r[2] + 60, r[3], r[4], r[5]), { state: 'blueprint', inkT: 0, alpha: rackT });
        });
        [-96, 96].forEach(function (dz) { I.box(ctx, V, B(0, 0, Math.max(0, dz), 440, 640, 88), { state: 'blueprint', inkT: 0, alpha: rackT * 0.5 }); });
        var led = V.p(420, 640, 70); D.led(ctx, led[0], led[1], P.mgmt, 'heartbeat', t, 2.4);
      }

      // step labels (leaders)
      var L = [];
      if (p < 0.12) L = [['cpu', 'CPU + tower cooler'], ['psu0', 'One power supply'], ['drive0', 'Two drives'], ['fan0', 'Front fan'], ['gpu', 'Graphics card']];
      else if (p > 0.38 && p < 0.6) L = [['fan2', 'Fan wall'], ['board', 'Board lies flat']];
      else if (p > 0.62 && p < 0.8) L = [['psu1', 'PSU 2 (redundant)'], ['drive6', 'Hot-swap bays'], ['ramL2', '12 memory slots']];
      else if (p > 0.82) L = [['earR', 'Rack ear'], ['bmc', 'BMC: remote control'], ['lid', '2U = 3.5 in tall']];
      var mobile = w < 560;
      var labelA = p < 0.12 ? 1 - U.segment(p, 0.08, 0.12) : 1;
      L.forEach(function (l, i) {
        var it = items.find(function (q) { return q.p.id === l[0]; }); if (!it) return;
        var b = it.b, a = V.p(b.x + b.w / 2, b.y + b.d / 2, b.z + b.h);
        var right = (i % 2 === 0);
        var lx = right ? Math.min(w - (mobile ? 90 : 150), a[0] + 60) : Math.max(mobile ? 90 : 150, a[0] - 60);
        D.leader(ctx, a[0], a[1], lx, a[1] - 30 - (i % 3) * 8, l[1], { alpha: labelA, size: mobile ? 10 : 11 });
      });
      // dimension: 2U height
      if (rackT > 0.5) {
        var d0 = V.p(440 + 40, 640, 0), d1 = V.p(440 + 40, 640, 88);
        D.dim(ctx, d0[0], d0[1], d1[0], d1[1], '88.9 mm', { alpha: U.segment(rackT, 0.5, 1) });
      }
      this.setDesc(STEP_TXT[Math.max(0, this.step)]);
    }
  });
})(window.SRV);
