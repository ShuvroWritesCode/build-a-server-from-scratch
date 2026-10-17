/* Ch5 · PCIe highway + CPU lane budget. Lanes run from the CPU to one device; width (x1–x16) adds lanes,
   each generation doubles bead speed (≈1 / 2 / 4 GB/s per lane). Below, devices spend the CPU's lane
   budget (EPYC 9005 = 128, Xeon 6700P = 88); overspending hatches red. Bifurcation splits x16 → 4 × x4. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var PER_LANE = { 3: 0.985, 4: 1.969, 5: 3.938 };      // GB/s, one direction, after 128b/130b encoding
  var DEV = {
    nvme: { label: 'NVMe SSD', lanes: 4, need: 14, needTxt: 'a Gen5 SSD can do ~14 GB/s' },
    nic: { label: '100GbE NIC', lanes: 8, need: 12.5, needTxt: '100 Gb/s = 12.5 GB/s' },
    gpu: { label: 'GPU', lanes: 16, need: 64, needTxt: 'a GPU wants every lane it can get' },
    bif: { label: '4 × NVMe card', lanes: 16, need: 56, needTxt: '4 drives × ~14 GB/s' }
  };
  var BUDGET = { gpu: { lanes: 16, txt: 'GPU' }, nvme: { lanes: 4, txt: 'NVMe' }, nic: { lanes: 16, txt: '100GbE' } };
  var CPUS = { epyc: { lanes: 128, txt: 'EPYC 9005' }, xeon: { lanes: 88, txt: 'Xeon 6700P' } };

  S.defineVisual('pcie', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.width = 4; this.gen = 4; this.dev = 'nvme';
      this.laneT = 4; this.bifT = 0; this.cpu = 'epyc';
      this.items = [{ k: 'gpu', s: 1 }, { k: 'nvme', s: 1 }, { k: 'nvme', s: 1 }, { k: 'nic', s: 1 }];
      this.phase = []; for (var i = 0; i < 16; i++) this.phase.push(this.rng.float());
      var self = this;
      var g = this.ui.group('Link');
      this.sDev = g.select({ label: 'Device', value: 'nvme', options: [['nvme', 'NVMe SSD (x4)'], ['nic', '100GbE NIC (x8)'], ['gpu', 'GPU (x16)'], ['bif', '4× NVMe card (x16 split)']], onChange: function (v) { self.setDev(v); } });
      this.sW = g.seg({ label: 'Lanes', value: 4, options: [[1, 'x1'], [4, 'x4'], [8, 'x8'], [16, 'x16']], onChange: function (v) { self.setWidth(v); } });
      this.sG = g.seg({ label: 'Gen', value: 4, options: [[3, 'Gen3'], [4, 'Gen4'], [5, 'Gen5']], onChange: function (v) { self.gen = v; self.sync(true); } });
      this.ui.spacer();
      this.rBw = this.ui.readout('Link speed', '');
      this.ui.br();
      var b = this.ui.group('Lane budget');
      this.sCpu = b.seg({ label: 'CPU', value: 'epyc', options: [['epyc', 'EPYC 9005 · 128'], ['xeon', 'Xeon 6700P · 88']], onChange: function (v) { self.cpu = v; self.sync(true); } });
      this.bAdd = [
        b.button('+ GPU (x16)', function () { self.add('gpu'); }),
        b.button('+ NVMe (x4)', function () { self.add('nvme'); }),
        b.button('+ 100GbE NIC (x16)', function () { self.add('nic'); })
      ];
      b.button('Clear', function () { self.items = []; self.sync(true); });
      b.button('Bifurcation demo', function () { self.sDev.set('bif'); self.setDev('bif'); self.sW.set(16, true); }, { title: 'Split one x16 slot into four x4 links for four NVMe drives' });
      this.ui.spacer();
      this.rBud = this.ui.readout('Lanes used', '');
      this.sync(false);
    },
    setDev: function (v) {
      this.dev = v; var self = this;
      this.tween({ from: this.bifT, to: v === 'bif' ? 1 : 0, dur: 0.7, ease: 'snap', onUpdate: function (x) { self.bifT = x; } });
      this.sync(true);
    },
    setWidth: function (v) {
      this.width = v; var self = this;
      this.tween({ from: this.laneT, to: v, dur: 0.45, onUpdate: function (x) { self.laneT = x; } });
      this.sync(true);
    },
    add: function (k) {
      if (this.used() >= 220) return;
      var it = { k: k, s: 0 }; this.items.push(it);
      this.tween({ from: 0, to: 1, dur: 0.45, ease: 'snap', onUpdate: function (x) { it.s = x; } });
      this.sync(true);
    },
    used: function () { var n = 0; for (var i = 0; i < this.items.length; i++) n += BUDGET[this.items[i].k].lanes; return n; },
    linkLanes: function () { return Math.min(this.width, DEV[this.dev].lanes); },
    linkGBs: function () { return this.linkLanes() * PER_LANE[this.gen]; },
    sync: function (ann) {
      var bw = this.linkGBs(), dv = DEV[this.dev], total = CPUS[this.cpu].lanes, used = this.used();
      var bif = this.dev === 'bif';
      this.rBw.set(bif ? Math.max(1, Math.floor(this.width / 4)) + ' × ' + U.fmt(Math.min(4, this.width) * PER_LANE[this.gen], 1) + ' GB/s' : '≈ ' + U.fmt(bw, 1) + ' GB/s', bw + 0.01 < Math.min(dv.need, 64) * 0.95 ? 'warn' : 'ok');
      this.rBud.set(used + ' / ' + total + (used > total ? ' ✕ over' : ''), used > total ? 'bad' : used > total * 0.85 ? 'warn' : 'ok');
      this.bAdd.forEach(function (b) { b.setDisabled(used >= 220); });
      var d = dv.label + ' on x' + this.width + ' Gen' + this.gen + ': ' + this.linkLanes() + ' lanes × ' + U.fmt(PER_LANE[this.gen], 1) + ' GB/s ≈ ' + U.fmt(bw, 1) + ' GB/s. Lane budget: ' + used + ' of ' + total + ' CPU lanes used' + (used > total ? ', over budget.' : '.');
      this.setDesc(d);
      if (ann) this.announce(d);
      this.invalidate();
    },
    resize: function (w, h) {
      var m = this.mobile = w < 560;
      this.split = Math.round(h * (m ? 0.56 : 0.6));
      var top = m ? 88 : 98, bot = this.split - (m ? 22 : 26);
      this.ly0 = top; this.ly1 = bot;
      this.cpuBox = { x: m ? 10 : 22, w: m ? 58 : 104 };
      this.devBox = { w: m ? 74 : 150 }; this.devBox.x = w - this.devBox.w - (m ? 10 : 22);
      this.lx0 = this.cpuBox.x + this.cpuBox.w + 6; this.lx1 = this.devBox.x - 6;
      this.gauge = { x: m ? w / 2 : w / 2, y: m ? 40 : 46, r: m ? 26 : 30 };
    },
    laneY: function (i, bt) {
      // contiguous lanes centred on the highway; with bifurcation the 4 groups spread apart
      if (bt == null) bt = this.bifT;
      var n = 16, yc = (this.ly0 + this.ly1) / 2, gap = (this.ly1 - this.ly0) / (n + 3 * 1.6 * bt + 1);
      var g = Math.floor(i / 4);
      return yc + (i - (n - 1) / 2) * gap + (g - 1.5) * 1.6 * gap * bt;
    },
    /** y of lane at screen x: one x16 slot at the CPU, fanning out into x4 groups near the device */
    laneAt: function (yU, yS, x) {
      if (yU === yS) return yS;
      var L = this.lx1 - this.lx0, k = U.smoothstep(this.lx0 + L * 0.42, this.lx0 + L * 0.72, x);
      return yU + (yS - yU) * k;
    },
    lanePath: function (ctx, yU, yS) {
      ctx.beginPath(); ctx.moveTo(this.lx0, yU);
      if (yU !== yS) { var L = this.lx1 - this.lx0; for (var k = 0; k <= 12; k++) { var x = this.lx0 + L * (0.42 + 0.3 * k / 12); ctx.lineTo(x, this.laneAt(yU, yS, x)); } }
      ctx.lineTo(this.lx1, yS);
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, m = this.mobile, self = this, t = this.time;
      D.clear(ctx, w, h);
      var dv = DEV[this.dev], bif = this.dev === 'bif', link = this.linkLanes();
      var genMul = this.gen === 3 ? 1 : this.gen === 4 ? 2 : 4;

      // ---------- lanes
      var lw = Math.max(2, Math.min(5, (this.ly1 - this.ly0) / 16 * 0.38));
      var spacing = m ? 22 : 30, speed = (m ? 34 : 46) * genMul;
      for (var i = 0; i < 16; i++) {
        var y = this.laneY(i), yU = this.bifT > 0.001 ? this.laneY(i, 0) : y, dc = Math.abs(i - 7.5);
        // normal links grow from the middle of the slot; bifurcated groups fill from the top
        var a = bif ? U.clamp(this.laneT - i, 0, 1) : U.clamp(this.laneT / 2 - dc + 0.5, 0, 1);
        var wired = a > 0.01, act = bif ? (Math.floor(i / 4) < Math.floor(this.width / 4) || (this.width < 4 && i < this.width)) : dc < link / 2;
        if (!wired && a <= 0) {
          this.lanePath(ctx, yU, y); ctx.setLineDash([2, 5]); ctx.strokeStyle = U.rgba(P.grid, 0.8); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
          continue;
        }
        if (!act) { // wired by the slot, but the device doesn't use it
          this.lanePath(ctx, yU, y); ctx.setLineDash([6, 5]); ctx.strokeStyle = U.rgba(P.blueprint, 0.45 * a); ctx.lineWidth = lw * 0.6; ctx.stroke(); ctx.setLineDash([]);
          continue;
        }
        ctx.globalAlpha = a;
        this.lanePath(ctx, yU, y); ctx.lineJoin = 'round';
        ctx.strokeStyle = U.rgba(P.data, 0.2); ctx.lineWidth = lw + 2; ctx.stroke();
        ctx.strokeStyle = U.rgba(P.data, 0.45); ctx.lineWidth = 1; ctx.stroke();
        var L = this.lx1 - this.lx0, off = (t * speed + this.phase[i] * spacing) % spacing;
        for (var x = this.lx0 + off; x < this.lx1; x += spacing) {
          var fade = U.clamp((x - this.lx0) / 14, 0, 1) * U.clamp((this.lx1 - x) / 14, 0, 1);
          D.circle(ctx, x, this.laneAt(yU, y, x), lw * 0.62 + 0.6, U.rgba(P.data, 0.35 + 0.65 * fade));
        }
        ctx.globalAlpha = 1;
      }
      // lane counter ticks on the left
      if (!m) D.text(ctx, 'x' + this.width + ' slot', this.lx0 + 4, this.ly0 - 10, { size: 9.5, color: P.text3 });
      D.text(ctx, '→ data · Gen' + this.gen + ' = ' + genMul + '× bead speed', this.lx1 - 2, this.ly0 - 10, { size: m ? 8.5 : 9.5, color: P.text3, align: 'right' });

      // ---------- CPU package
      this.drawCpu(ctx);
      // ---------- device
      this.drawDevice(ctx);

      // ---------- gauge + verdict
      var G = this.gauge, bw = this.linkGBs();
      var shown = bif ? Math.min(4, this.width) * PER_LANE[this.gen] * Math.max(1, Math.floor(this.width / 4)) : bw;
      D.gauge(ctx, G.x, G.y, G.r, shown / 64, P.data, { value: shown >= 10 ? U.fmt(shown, 0) : U.fmt(shown, 1), label: 'GB/s', lw: m ? 5 : 6, size: m ? 12 : 14 });
      // demand tick on the arc
      var need = Math.min(dv.need, 64), na = Math.PI * 0.75 + Math.PI * 1.5 * need / 64;
      D.line(ctx, G.x + Math.cos(na) * (G.r - 7), G.y + Math.sin(na) * (G.r - 7), G.x + Math.cos(na) * (G.r + 7), G.y + Math.sin(na) * (G.r + 7), P.warn, 2);
      var bott = shown < need * 0.95;
      var line1 = bif ? Math.max(1, Math.floor(this.width / 4)) + ' drive' + (this.width >= 8 ? 's' : '') + ' × x' + Math.min(4, this.width) + ' Gen' + this.gen
        : link + (link === 1 ? ' lane' : ' lanes') + ' × ' + U.fmt(PER_LANE[this.gen], 1) + ' GB/s';
      var tx = G.x + G.r + 14;
      if (m) {
        D.text(ctx, line1, 12, 18, { size: 9.5, color: P.text2 });
        D.text(ctx, '⚑ needs ~' + U.fmt(need, need < 20 ? 1 : 0) + ' GB/s', 12, 34, { size: 9.5, color: P.warn });
      } else {
        D.text(ctx, line1, tx, G.y - 8, { size: 11, weight: 700, color: P.text1 });
        D.text(ctx, '⚑ ' + dv.needTxt, tx, G.y + 9, { size: 10, color: P.warn });
      }
      var note = null, col = P.ok;
      if (bif && this.width < 16) { note = '⚠ only ' + Math.max(this.width >= 4 ? Math.floor(this.width / 4) : 1, 1) + ' of 4 drives get lanes'; col = P.warn; }
      else if (!bif && this.width > dv.lanes) { note = 'device only uses x' + dv.lanes + ' · ' + (this.width - dv.lanes) + ' lanes idle'; col = P.blueprint; }
      else if (bott) { note = '⚠ bottleneck: the link is slower than the device'; col = P.warn; }
      else { note = '✓ link is fast enough'; col = P.ok; }
      D.pill(ctx, note, m ? w / 2 : w / 2, this.ly1 + (m ? 12 : 14), { color: col, size: m ? 9.5 : 10.5, align: 'center' });

      this.drawBudget(ctx);
    },
    drawCpu: function (ctx) {
      var P = S.pal, m = this.mobile, cb = this.cpuBox, cy = (this.ly0 + this.ly1) / 2, s = Math.min(cb.w, this.ly1 - this.ly0);
      var x = cb.x, y = cy - s / 2;
      D.box(ctx, x, y, s, s, 6, U.shade(P.pcb, -0.1), U.rgba(P.gold, 0.7), 1.2);
      for (var i = 0; i < 9; i++) { ctx.fillStyle = U.rgba(P.gold, 0.6); ctx.fillRect(x + 6 + i * (s - 12) / 9, y + s - 7, (s - 12) / 9 - 2, 3); ctx.fillRect(x + 6 + i * (s - 12) / 9, y + 4, (s - 12) / 9 - 2, 3); }
      var ins = s * 0.16;
      D.box(ctx, x + ins, y + ins, s - ins * 2, s - ins * 2, 4, P.alu, U.shade(P.alu, -0.3), 1);
      D.text(ctx, 'CPU', x + s / 2, y + s / 2 - (m ? 4 : 7), { size: m ? 11 : 14, weight: 800, color: P.silicon, align: 'center' });
      D.text(ctx, CPUS[this.cpu].lanes + (m ? '' : ' lanes'), x + s / 2, y + s / 2 + (m ? 8 : 10), { size: m ? 8 : 9.5, weight: 700, color: U.shade(P.silicon, 0.25), align: 'center' });
      // pins where the lanes leave
      for (i = 0; i < 16; i++) D.circle(ctx, this.lx0 - 4, this.laneY(i, 0), 1.6, U.rgba(P.gold, Math.abs(i - 7.5) < this.laneT / 2 ? 0.95 : 0.35));
    },
    drawDevice: function (ctx) {
      var P = S.pal, m = this.mobile, db = this.devBox, k = this.dev, x = db.x, y0 = this.ly0, y1 = this.ly1, cy = (y0 + y1) / 2;
      // edge connector
      D.box(ctx, x - 2, y0 - 2, 6, y1 - y0 + 4, 2, U.rgba(P.gold, 0.25), U.rgba(P.gold, 0.6), 1);
      for (var i = 0; i < 16; i++) D.circle(ctx, x + 1, this.laneY(i), 1.6, U.rgba(P.gold, 0.9));
      var bw = db.w - 8, bx = x + 8;
      if (this.bifT > 0.02) {
        // four M.2 drives, one per x4 group
        for (var g = 0; g < 4; g++) {
          var gy = (this.laneY(g * 4) + this.laneY(g * 4 + 3)) / 2, live = g < Math.floor(this.width / 4) || (this.width < 4 && g === 0);
          ctx.globalAlpha = this.bifT;
          this.m2(ctx, bx, gy, bw, Math.max(10, (this.ly1 - this.ly0) / 7), live, 'x4');
          ctx.globalAlpha = 1;
        }
        if (!m) D.text(ctx, 'x16 → x4 x4 x4 x4', x + db.w / 2, y0 - 10, { size: 9.5, weight: 700, color: P.accent, align: 'center', alpha: this.bifT });
        if (this.bifT > 0.98) return;
        ctx.globalAlpha = 1 - this.bifT;
      }
      if (k === 'gpu') {
        D.box(ctx, bx, y0, bw, y1 - y0, 6, U.shade(P.steel, -0.15), U.shade(P.steel, 0.2), 1);
        var r = Math.min(bw / 2, (y1 - y0) / 2) * 0.42;
        D.fan2d(ctx, bx + bw * 0.3, cy, r, this.time * 8, { blur: 0.8, color: P.plastic });
        D.fan2d(ctx, bx + bw * 0.72, cy, r, this.time * 8 + 1, { blur: 0.8, color: P.plastic });
        D.box(ctx, bx + 6, y0 + 6, bw * 0.4, 3, 1, P.heat);
        D.text(ctx, 'GPU', bx + bw - 6, y1 - 10, { size: m ? 9 : 11, weight: 800, color: P.text2, align: 'right' });
      } else if (k === 'nic') {
        D.box(ctx, bx, y0 + (y1 - y0) * 0.12, bw, (y1 - y0) * 0.76, 4, P.pcb, U.shade(P.pcb, 0.3), 1);
        D.box(ctx, bx + bw * 0.2, cy - 14, bw * 0.3, 28, 2, P.silicon);
        for (var q = 0; q < 2; q++) {
          var qy = cy - 30 + q * 34;
          D.box(ctx, bx + bw - (m ? 22 : 34), qy, m ? 18 : 28, 24, 2, P.steel, U.shade(P.steel, 0.3), 1);
          D.led(ctx, bx + bw - (m ? 26 : 40), qy + 12, P.net, 'activity', this.time + q, 2.2);
        }
        D.text(ctx, '100GbE', bx + 8, y1 - (y1 - y0) * 0.12 - 9, { size: m ? 8 : 10, weight: 800, color: P.text1 });
      } else {
        this.m2(ctx, bx, cy, bw, Math.max(14, (y1 - y0) * 0.22), true, 'NVMe');
      }
      ctx.globalAlpha = 1;
      if (this.bifT <= 0.02 && !m) D.text(ctx, DEV[k].label + ' · x' + DEV[k].lanes, x + db.w / 2, y0 - 10, { size: 9.5, weight: 700, color: P.text2, align: 'center' });
    },
    m2: function (ctx, x, cy, w, h, live, label) {
      var P = S.pal;
      D.box(ctx, x, cy - h / 2, w, h, 3, live ? P.pcb : U.rgba(P.pcb, 0.35), U.rgba(live ? P.data : P.text3, 0.6), 1);
      var cw = (w - 20) / 4;
      for (var i = 0; i < 3; i++) D.box(ctx, x + 10 + i * (cw + 3), cy - h * 0.3, cw, h * 0.6, 1, live ? P.silicon : U.rgba(P.silicon, 0.4));
      D.text(ctx, label, x + w - 6, cy, { size: Math.min(10, h * 0.55), weight: 800, color: live ? P.data : P.text3, align: 'right' });
    },
    drawBudget: function (ctx) {
      var P = S.pal, m = this.mobile, w = this.w, h = this.h;
      var total = CPUS[this.cpu].lanes, used = this.used();
      var x0 = m ? 12 : 22, x1 = w - (m ? 12 : 22), bh = m ? 32 : 44, y = this.split + Math.max(m ? 24 : 34, (h - this.split) * 0.4 - bh / 2);
      D.line(ctx, x0, this.split, x1, this.split, U.rgba(P.panel3, 0.9), 1);
      D.text(ctx, 'CPU LANE BUDGET · ' + CPUS[this.cpu].txt, x0, this.split + (m ? 11 : 16), { size: 9.5, weight: 700, color: P.text2, ls: 1.2 });
      var free = total - used;
      D.text(ctx, used + ' / ' + total + ' lanes', x1, this.split + (m ? 11 : 16), { size: m ? 10 : 11, weight: 800, color: used > total ? P.fault : P.text1, align: 'right' });
      var scale = (x1 - x0) / Math.max(total, used);
      // track
      D.box(ctx, x0, y, total * scale, bh, 5, U.rgba(P.panel3, 0.55), U.rgba(P.blueprint, 0.5), 1);
      // per-16 tick marks
      for (var l = 16; l < total; l += 16) D.line(ctx, x0 + l * scale + 0.5, y + bh, x0 + l * scale + 0.5, y + bh + 4, U.rgba(P.text3, 0.6), 1);
      var COL = { gpu: P.heat, nvme: P.data, nic: P.net };
      var cx = x0;
      for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i], L = BUDGET[it.k].lanes, sw = L * scale * it.s;
        var over = cx + sw > x0 + total * scale + 0.5;
        D.box(ctx, cx + 0.5, y + 2 + (1 - it.s) * 6, Math.max(1, sw - 1.5), bh - 4, 3, U.rgba(COL[it.k], over ? 0.5 : 0.85));
        if (sw > (m ? 30 : 46)) D.text(ctx, (sw > 70 ? BUDGET[it.k].txt + ' ' : '') + 'x' + L, cx + sw / 2, y + bh / 2, { size: m ? 8.5 : 9.5, weight: 800, color: P.bg, align: 'center' });
        cx += sw;
      }
      // overflow: hatched red beyond the budget
      if (used > total) {
        var ox = x0 + total * scale, ow = (used - total) * scale;
        ctx.fillStyle = D.hatch(ctx, U.rgba(P.fault, 0.95), 5, true); D.rr(ctx, ox, y - 3, ow, bh + 6, 4); ctx.fill();
        D.box(ctx, ox, y - 3, ow, bh + 6, 4, null, P.fault, 1.5);
      }
      // budget limit marker
      var lx = x0 + total * scale;
      D.line(ctx, lx, y - 8, lx, y + bh + 8, used > total ? P.fault : P.text2, 2);
      D.text(ctx, String(total), lx, y + bh + 15, { size: 9.5, weight: 700, color: P.text2, align: used > total ? 'center' : 'right' });
      D.text(ctx, '0', x0, y + bh + 15, { size: 9.5, color: P.text3 });
      // status line
      var sy = Math.min(h - 14, y + bh + (m ? 34 : 40));
      if (used > total) D.pill(ctx, '✕ ' + (used - total) + ' lanes over budget — some cards won’t get their lanes', x0, sy, { color: P.fault, size: m ? 9 : 10.5 });
      else if (!this.items.length) D.text(ctx, 'Add devices with the buttons below to spend lanes.', x0, sy, { size: 10, color: P.text3 });
      else D.text(ctx, '✓ ' + free + ' lanes free' + (m ? '' : ' · every device gets its full link'), x0, sy, { size: m ? 9.5 : 10.5, weight: 700, color: P.ok });
      // legend
      if (!m) {
        var lgx = x1, ks = [['nic', '100GbE x16'], ['nvme', 'NVMe x4'], ['gpu', 'GPU x16']];
        for (var k = 0; k < ks.length; k++) {
          var tw = D.measure(ctx, ks[k][1], 9.5, 500);
          lgx -= tw + 22;
          D.box(ctx, lgx, sy - 5, 10, 10, 2, COL[ks[k][0]]);
          D.text(ctx, ks[k][1], lgx + 14, sy, { size: 9.5, color: P.text2 });
        }
      }
    }
  });
})(window.SRV);
