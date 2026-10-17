/* Shared isometric server models (2U rack server, rack, generic parts).
   Front of the server faces +y (drawn bottom-left), air flows from +y (front) to y=0 (rear). */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso;
  var M = S.models = { t: 0, fanAngle: 0, fanBlur: 0 };

  M.W = 440; M.D = 640; M.H = 88;

  // chapter each part group belongs to (used by the build tracker)
  M.groups = {
    chassis: { ch: 4, label: 'Chassis' }, board: { ch: 5, label: 'Motherboard' }, cpu: { ch: 6, label: 'CPU + heatsink' },
    ram: { ch: 7, label: 'Memory (DIMMs)' }, drives: { ch: 8, label: 'Drives' }, raid: { ch: 9, label: 'RAID controller' },
    psu: { ch: 10, label: 'Power supplies' }, fans: { ch: 11, label: 'Fan wall' }, nic: { ch: 12, label: 'Network card' },
    bmc: { ch: 13, label: 'BMC chip' }, gpu: { ch: 14, label: 'GPU (optional)' }, shroud: { ch: 11, label: 'Air shroud' }, lid: { ch: 15, label: 'Lid' }
  };

  // ---------------------------------------------------------------- decals (face-local mm)
  function px() { return I.px || 1; }
  M.decal = {
    driveFront: function (idx, type) {
      return function (ctx, w, h) {
        var p = px();
        ctx.fillStyle = U.shade(S.pal.plastic, -0.25); ctx.fillRect(1, 1, w - 2, h - 2);
        // vent slots
        ctx.fillStyle = U.rgba('#000', 0.35);
        for (var i = 0; i < 9; i++) ctx.fillRect(6 + i * (w * 0.06), 4, w * 0.035, h - 8);
        // handle
        ctx.fillStyle = U.shade(S.pal.alu, -0.1); ctx.fillRect(w * 0.62, h * 0.3, w * 0.22, h * 0.4);
        // leds
        var st = M.driveState ? M.driveState(idx) : 'ok';
        var col = st === 'fail' ? S.pal.fault : st === 'rebuild' ? S.pal.warn : st === 'off' ? S.pal.panel3 : S.pal.ok;
        var mode = st === 'fail' ? 'blink' : st === 'off' ? 'off' : 'activity';
        ctx.save(); ctx.setTransform(ctx.getTransform()); D.led(ctx, w - 7, h * 0.32, col, mode, M.t + idx * 0.37, 2.4); D.led(ctx, w - 7, h * 0.7, S.pal.mgmt, 'off', 0, 2); ctx.restore();
        ctx.lineWidth = p; ctx.strokeStyle = U.rgba(S.pal.alu, 0.35); ctx.strokeRect(1, 1, w - 2, h - 2);
        if (type === 'ssd') { ctx.fillStyle = U.rgba(S.pal.data, 0.6); ctx.fillRect(4, h - 6, 14, 3); }
      };
    },
    fanFront: function (i) {
      return function (ctx, w, h) {
        ctx.fillStyle = U.shade(S.pal.plastic, -0.3); ctx.fillRect(0, 0, w, h);
        var dead = M.fanDead && M.fanDead(i);
        D.fan2d(ctx, w / 2, h / 2, Math.min(w, h) * 0.46, dead ? i : M.fanAngle * (1 + i * 0.03) + i, { blur: dead ? 0 : M.fanBlur, color: dead ? U.mix(S.pal.plastic, S.pal.fault, 0.3) : S.pal.plastic });
      };
    },
    heatsinkTop: function (ctx, w, h) {
      var p = px(); ctx.strokeStyle = U.rgba('#000', 0.28); ctx.lineWidth = 1.3 * p;
      for (var x = 3; x < w; x += 4) { ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, h - 2); ctx.stroke(); }
      ctx.fillStyle = U.rgba(S.pal.copper, 0.7); ctx.fillRect(w * 0.25, h * 0.45, w * 0.5, h * 0.1);
    },
    psuTop: function (label) {
      return function (ctx, w, h) {
        ctx.fillStyle = U.rgba('#000', 0.3);
        for (var y = 8; y < h * 0.45; y += 7) for (var x = 6; x < w - 4; x += 7) { ctx.beginPath(); ctx.arc(x, y, 2, 0, U.TAU); ctx.fill(); }
        ctx.fillStyle = U.rgba(S.pal.power, 0.85); ctx.fillRect(w * 0.15, h * 0.62, w * 0.7, h * 0.16);
        ctx.save(); ctx.translate(w / 2, h * 0.7); ctx.rotate(Math.PI / 2); ctx.scale(1, 1);
        ctx.font = '700 14px ' + S.pal.mono; ctx.fillStyle = S.pal.bg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label || 'PSU', 0, 0); ctx.restore();
      };
    },
    boardTop: function (seed) {
      var r = U.rng(seed || 'board'), traces = [];
      for (var i = 0; i < 70; i++) {
        var x = r.range(0, 320), y = r.range(0, 370), pts = [x, y], n = r.int(2, 5);
        for (var j = 0; j < n; j++) { if (r.chance(0.5)) x += r.range(-60, 60); else y += r.range(-60, 60); pts.push(U.clamp(x, 2, 318), U.clamp(y, 2, 368)); }
        traces.push(pts);
      }
      return function (ctx, w, h) {
        var p = px(); ctx.lineWidth = 1.1 * p;
        ctx.strokeStyle = U.rgba(S.pal.copper, S.pal.dark ? 0.55 : 0.7);
        traces.forEach(function (t) { D.poly(ctx, t, false); ctx.stroke(); });
        ctx.fillStyle = U.rgba(S.pal.gold, 0.55);
        for (var k = 0; k < traces.length; k += 3) ctx.fillRect(traces[k][0] - 1.5, traces[k][1] - 1.5, 3, 3);
        if (M.dataFlow) { // light some traces with data colour
          ctx.lineWidth = 2 * p; ctx.strokeStyle = S.pal.data; ctx.setLineDash([6, 10]); ctx.lineDashOffset = -M.t * 60;
          for (var q = 0; q < traces.length; q += 4) { D.poly(ctx, traces[q], false); ctx.stroke(); }
          ctx.setLineDash([]);
        }
      };
    },
    dimmSide: function (ecc) {
      return function (ctx, w, h) {
        ctx.fillStyle = U.rgba(S.pal.gold, 0.9); ctx.fillRect(0, h - 4, w, 4);
        ctx.fillStyle = S.pal.silicon;
        var n = ecc === false ? 8 : 9, cw = (w - 10) / n;
        for (var i = 0; i < n; i++) ctx.fillRect(5 + i * cw + 1, h * 0.25, cw - 2.5, h * 0.4);
      };
    },
    cardSide: function (kind) {
      return function (ctx, w, h) {
        ctx.fillStyle = U.rgba(S.pal.gold, 0.85); ctx.fillRect(w * 0.15, h - 4, w * 0.5, 4);
        ctx.fillStyle = S.pal.silicon; ctx.fillRect(w * 0.35, h * 0.3, w * 0.22, h * 0.35);
        if (kind === 'gpu') {
          ctx.fillStyle = U.shade(S.pal.steel, -0.2); ctx.fillRect(2, 2, w - 4, h * 0.85);
          ctx.fillStyle = U.rgba(S.pal.accent, 0.8); ctx.fillRect(4, 4, w * 0.3, 3);
          ctx.font = '700 10px ' + S.pal.mono; ctx.fillStyle = S.pal.text2; ctx.textBaseline = 'middle'; ctx.fillText('GPU', 8, h * 0.45);
        }
        if (kind === 'nic') { ctx.fillStyle = U.rgba(S.pal.net, 0.9); ctx.fillRect(w * 0.7, h * 0.35, 6, 6); }
        if (kind === 'raid') { ctx.fillStyle = U.rgba(S.pal.ok, 0.9); ctx.fillRect(w * 0.7, h * 0.35, 6, 6); ctx.fillStyle = S.pal.alu; ctx.fillRect(w * 0.08, h * 0.25, w * 0.18, h * 0.3); }
      };
    },
    chipTop: function (label, col) {
      return function (ctx, w, h) {
        ctx.fillStyle = U.rgba(col || S.pal.mgmt, 0.9); ctx.fillRect(w * 0.15, h * 0.15, w * 0.7, h * 0.7);
        if (label) { ctx.font = '700 7px ' + S.pal.mono; ctx.fillStyle = S.pal.bg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, w / 2, h / 2); }
      };
    },
    wallCut: function (ctx, w, h) {
      ctx.strokeStyle = U.rgba(S.pal.blueprint, 0.7); ctx.lineWidth = px(); ctx.setLineDash([6 * px(), 4 * px()]);
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(w, 1); ctx.stroke(); ctx.setLineDash([]);
    },
    vents: function (ctx, w, h) {
      ctx.fillStyle = U.rgba('#000', 0.35);
      for (var x = 10; x < w - 10; x += 9) ctx.fillRect(x, h * 0.25, 4, h * 0.5);
    }
  };

  // ---------------------------------------------------------------- 2U server
  /**
   * opts: { drives: 12, dimms: 12, gpu: false, lid: false, shroud: false, cut: true }
   * returns part list: {id, group, b:{x,y,z,w,d,h}, color, decal, explode:[dx,dy,dz], order, label}
   */
  M.server = function (o) {
    o = Object.assign({ drives: 12, dimms: 12, gpu: false, lid: false, shroud: false, cut: true, raid: true, nic: true }, o || {});
    var W = M.W, Dd = M.D, H = M.H, parts = [];
    function add(id, group, b, color, extra) {
      var p = Object.assign({ id: id, group: group, b: b, color: color }, extra || {});
      parts.push(p); return p;
    }
    // chassis
    add('base', 'chassis', { x: 0, y: 0, z: 0, w: W, d: Dd, h: 4 }, 'steel', { explode: [0, 0, 0], order: 0 });
    add('wallFar', 'chassis', { x: 0, y: 0, z: 4, w: 3, d: Dd, h: H - 4 }, 'steel', { explode: [0, 0, 0] });
    add('rear', 'chassis', { x: 3, y: 0, z: 4, w: W - 6, d: 3, h: H - 4 }, 'steel', { explode: [0, 0, 0] });
    add('wallNear', 'chassis', { x: W - 3, y: 0, z: 4, w: 3, d: Dd, h: o.cut ? 18 : H - 4 }, 'steel', { explode: [0, 0, 0], decal: { right: o.cut ? M.decal.wallCut : M.decal.vents, top: null } });
    add('earL', 'chassis', { x: -16, y: Dd - 4, z: 0, w: 16, d: 4, h: H }, 'steel', { explode: [0, 0, 0] });
    add('earR', 'chassis', { x: W, y: Dd - 4, z: 0, w: 16, d: 4, h: H }, 'steel', { explode: [0, 0, 0] });

    // motherboard + chips
    add('board', 'board', { x: 10, y: 20, z: 4, w: 320, d: 370, h: 2 }, 'pcb', { decal: { top: M.decal.boardTop('mb') }, explode: [0, 0, 60], order: 1 });
    add('bmc', 'bmc', { x: 30, y: 340, z: 6, w: 22, d: 22, h: 3 }, 'silicon', { decal: { top: M.decal.chipTop('BMC', S.pal.mgmt) }, explode: [0, 0, 120], order: 9 });
    // CPU heatsink
    add('cpu', 'cpu', { x: 125, y: 190, z: 6, w: 92, d: 110, h: 62 }, 'alu', { decal: { top: M.decal.heatsinkTop }, explode: [0, 0, 240], order: 2 });
    // DIMMs (two banks of up to 6)
    var dimmCount = Math.min(12, o.dimms);
    for (var i = 0; i < 12; i++) {
      if (i >= dimmCount) break;
      var left = i % 2 === 0, k = Math.floor(i / 2);
      var x = left ? 108 - k * 9 : 226 + k * 9;
      add('dimm' + i, 'ram', { x: x, y: 180, z: 6, w: 4, d: 133, h: 32 }, 'pcb', { decal: { right: M.decal.dimmSide(true) }, explode: [0, 0, 170 + k * 6], order: 3 });
    }
    if (o.shroud) add('shroud', 'shroud', { x: 50, y: 176, z: 72, w: 244, d: 142, h: 4 }, 'plastic', { explode: [0, 0, 330], order: 7, alpha: 0.8 });

    // PCIe cards (rear-left)
    if (o.raid) add('raid', 'raid', { x: 24, y: 24, z: 6, w: 4, d: 150, h: 64 }, 'pcb', { decal: { right: M.decal.cardSide('raid') }, explode: [0, 0, 200], order: 5 });
    if (o.nic) add('nic', 'nic', { x: 64, y: 24, z: 6, w: 4, d: 130, h: 50 }, 'pcb', { decal: { right: M.decal.cardSide('nic') }, explode: [0, 0, 200], order: 5 });
    if (o.gpu) add('gpu', 'gpu', { x: 262, y: 24, z: 6, w: 40, d: 150, h: 76 }, 'steel', { decal: { right: M.decal.cardSide('gpu') }, explode: [0, 0, 280], order: 5 });

    // power supplies (rear right, stacked)
    add('psu1', 'psu', { x: 346, y: 6, z: 4, w: 88, d: 230, h: 40 }, 'steel', { decal: { top: M.decal.psuTop('PSU 2') }, explode: [0, -220, 0], order: 8 });
    add('psu0', 'psu', { x: 346, y: 6, z: 46, w: 88, d: 230, h: 40 }, 'steel', { decal: { top: M.decal.psuTop('PSU 1') }, explode: [0, -260, 40], order: 8 });

    // fan wall
    for (var f = 0; f < 6; f++) {
      add('fan' + f, 'fans', { x: 8 + f * 71, y: 404, z: 6, w: 68, d: 38, h: 72 }, 'plastic', { decal: { left: M.decal.fanFront(f) }, explode: [0, 0, 130], order: 6 });
    }
    // backplane + drive sleds (4 columns × 3 rows of 3.5")
    add('backplane', 'drives', { x: 4, y: Dd - 160, z: 4, w: W - 8, d: 4, h: H - 6 }, 'pcb', { explode: [0, 0, 0], order: 4 });
    var n = Math.min(12, o.drives), idx = 0;
    for (var r = 0; r < 3; r++) for (var c = 0; c < 4; c++) {
      if (idx >= n) break;
      var di = idx;
      add('drive' + di, 'drives', { x: 6 + c * 107.5, y: Dd - 152, z: 5 + r * 27.5, w: 105, d: 152, h: 26.5 }, 'plastic', { decal: { left: M.decal.driveFront(di, o.ssd ? 'ssd' : 'hdd') }, explode: [0, 230 + r * 20, 0], order: 4, idx: di });
      idx++;
    }
    if (o.lid) add('lid', 'lid', { x: 0, y: 0, z: H, w: W, d: Dd, h: 3 }, 'steel', { explode: [0, 0, 420], order: 10 });
    return parts;
  };
  M.bounds = function (extra) {
    extra = extra || 0;
    return { x0: -20 - extra, y0: -extra, z0: 0, x1: M.W + 20 + extra, y1: M.D + extra, z1: M.H + extra };
  };

  /**
   * Draw parts. opts:
   *   state(p) → {state, inkT, alpha, offset:[dx,dy,dz], highlight, hidden}
   *   hits: S.Hits to register hull polygons (id = part id)
   *   shadow: true
   */
  M.draw = function (ctx, V, parts, opts) {
    opts = opts || {};
    var items = [];
    parts.forEach(function (p) {
      var st = opts.state ? opts.state(p) || {} : {};
      if (st.hidden || st.alpha === 0) return;
      var off = st.offset || [0, 0, 0];
      var b = { x: p.b.x + off[0], y: p.b.y + off[1], z: p.b.z + off[2], w: p.b.w, d: p.b.d, h: p.b.h };
      items.push({ p: p, b: b, st: st });
    });
    var sorted = I.sort(V, items);
    sorted.forEach(function (it) {
      var st = it.st;
      I.box(ctx, V, it.b, {
        color: st.color || it.p.color, state: st.state, inkT: st.inkT, alpha: (st.alpha == null ? 1 : st.alpha) * (it.p.alpha || 1),
        decal: (st.state === 'blueprint' && st.inkT == null) ? null : it.p.decal, highlight: st.highlight, noStroke: st.noStroke
      });
      if (opts.hits) opts.hits.poly(it.p.id, I.hull(V, it.b), it.p);
    });
    return sorted;
  };

  // ---------------------------------------------------------------- 42U rack (front-facing frame)
  M.rack = function (o) {
    o = o || {};
    var U1 = 44.45, n = o.units || 42, W = 600, Dd = 1000, H = n * U1 + 80, parts = [];
    var post = 40;
    parts.push({ id: 'rbase', b: { x: 0, y: 0, z: 0, w: W, d: Dd, h: 40 }, color: 'steel' });
    parts.push({ id: 'rpostFL', b: { x: 0, y: Dd - post, z: 40, w: post, d: post, h: H - 80 }, color: 'steel' });
    parts.push({ id: 'rpostFR', b: { x: W - post, y: Dd - post, z: 40, w: post, d: post, h: H - 80 }, color: 'steel' });
    parts.push({ id: 'rpostBL', b: { x: 0, y: 0, z: 40, w: post, d: post, h: H - 80 }, color: 'steel' });
    parts.push({ id: 'rpostBR', b: { x: W - post, y: 0, z: 40, w: post, d: post, h: H - 80 }, color: 'steel' });
    parts.push({ id: 'rtop', b: { x: 0, y: 0, z: H - 40, w: W, d: Dd, h: 40 }, color: 'steel' });
    return { parts: parts, W: W, D: Dd, H: H, U: U1, z0: 40 };
  };
})(window.SRV);
