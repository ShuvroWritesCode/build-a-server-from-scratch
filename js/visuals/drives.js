/* Ch8 · Three drives, one workload. Cutaways of an HDD (spinning platter, actuator arm with a real
   seek → settle → wait-for-rotation cycle), a SATA SSD (NAND behind one narrow queue/lane) and an NVMe SSD
   (NAND fed by many queues over 4 PCIe lanes). Sequential vs random + queue depth; race events. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, TAU = Math.PI * 2;
  var QDS = [1, 2, 4, 8, 16, 32, 64, 128];
  var RACES = {
    copy: { title: 'Copy one 10 GB file', times: [40, 18, 1.4, 0.7] },
    tiny: { title: 'Read 100,000 tiny files', times: [480, 1.1, 0.1, 0.05] }
  };
  var RACERS = ['HDD 7,200 rpm', 'SATA SSD', 'NVMe Gen4', 'NVMe Gen5'];
  var POOL = 72;

  function iops(kind, qd) {
    if (kind === 0) return 120 + 80 * Math.min(1, Math.log2(qd) / 5);
    if (kind === 1) return Math.min(90000, 10000 * Math.pow(Math.min(qd, 32), 0.75));
    return Math.min(1000000, 16000 * Math.pow(qd, 0.995));
  }
  var SEQ = [250, 550, 7000], LAT = [0.0065, 0.0001, 0.00006];
  function fmtIops(v) { return v >= 1e6 ? U.fmt(v / 1e6, 1) + 'M' : v >= 1e4 ? U.fmt(v / 1e3, 0) + 'k' : U.fmt(v, 0); }

  S.defineVisual('drives', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.mode = 'random';
      this.qdi = 5;
      this.platAng = 0;
      // HDD state
      this.arm = { u: 0.5, from: 0.5, to: 0.5, t: 0, dur: 0.2, phase: 'idle', wait: 0, req: -1 };
      this.reqs = [];          // {u, ang}
      this.hddSeek = 0;        // displayed jitter amount
      // SSD cell flashes
      this.cellsS = new Float32Array(48);
      this.cellsN = new Float32Array(96);
      this.seqIdx = [0, 0];
      // bead pools: per drive
      this.beads = [];
      for (var d = 0; d < 3; d++) this.beads.push({ t: new Float32Array(POOL), lane: new Uint8Array(POOL), sx: new Float32Array(POOL), sy: new Float32Array(POOL), on: new Uint8Array(POOL), next: 0, acc: 0 });
      this.shown = [0, 0, 0];
      this.race = null;
      this.tmp = {};
      var self = this;
      var g = this.ui.group('Workload');
      this.sMode = g.seg({ label: 'Workload', options: [['seq', 'Sequential'], ['random', 'Random']], value: 'random', onChange: function (v) { self.setMode(v); } });
      this.sQd = g.slider({ label: 'Queue depth', min: 0, max: 7, step: 1, value: this.qdi, fmt: function (i) { return 'QD ' + QDS[i]; },
        valueText: function (i) { return QDS[i] + ' requests waiting at once'; }, onInput: function (i) { self.qdi = i; self.fillReqs(); self.refresh(); } });
      this.ui.br();
      var r = this.ui.group('Race');
      r.button('🏁 Copy one 10 GB file', function () { self.startRace('copy'); }, { kind: 'primary' });
      r.button('🏁 Read 100,000 tiny files', function () { self.startRace('tiny'); }, { kind: 'primary' });
      this.ui.br();
      this.rd = [this.ui.readout('HDD', '–'), this.ui.readout('SATA SSD', '–'), this.ui.readout('NVMe Gen4', '–')];
      this.fillReqs();
      this.refresh(true);
    },
    qd: function () { return QDS[this.qdi]; },
    metric: function (k) { return this.mode === 'random' ? iops(k, this.qd()) : SEQ[k] * (this.qd() === 1 ? 0.85 : 1); },
    setMode: function (v) {
      this.mode = v;
      this.arm.phase = 'idle';
      this.fillReqs();
      this.refresh();
    },
    refresh: function (silent) {
      var self = this, rnd = this.mode === 'random';
      [0, 1, 2].forEach(function (k) {
        var v = self.metric(k);
        self.rd[k].set(rnd ? fmtIops(v) + ' IOPS' : U.fmt(v) + ' MB/s', k === 0 && rnd ? 'bad' : k === 2 ? 'ok' : '');
      });
      var d = this.describe();
      this.setDesc(d);
      if (!silent) this.announce(d);
    },
    describe: function () {
      var rnd = this.mode === 'random', qd = this.qd();
      if (rnd) return 'Random 4 KB reads at queue depth ' + qd + ': hard drive about ' + fmtIops(iops(0, qd)) + ' IOPS, SATA SSD ' + fmtIops(iops(1, qd)) + ', NVMe ' + fmtIops(iops(2, qd)) + '.';
      return 'Sequential reads: hard drive about 250 MB/s, SATA SSD 550 MB/s, NVMe Gen4 7,000 MB/s.';
    },
    fillReqs: function () {
      var n = this.mode === 'random' ? Math.min(this.qd(), 10) : 1;
      while (this.reqs.length > n) this.reqs.pop();
      while (this.reqs.length < n) this.reqs.push({ u: this.mode === 'random' ? this.rng.float() : this.arm.u, ang: this.rng.float() * TAU });
    },

    // ------------------------------------------------------------ race
    startRace: function (kind) {
      var R = RACES[kind], max = Math.max.apply(null, R.times), dur = 6;
      this.race = { kind: kind, title: R.title, times: R.times, scale: max / dur, dur: dur, el: 0 };
      var self = this, race = this.race;
      this.announce('Race: ' + R.title + '. Hard drive ' + U.fmtTime(R.times[0]) + ', SATA SSD ' + U.fmtTime(R.times[1]) + ', NVMe Gen4 ' + U.fmtTime(R.times[2]) + ', NVMe Gen5 ' + U.fmtTime(R.times[3]) + '.');
      if (S.prefs.motion === 'off') { race.el = dur; this.invalidate(); return; }
      S.everyFrame(function (dt) {
        if (self.race !== race) return false;
        race.el = Math.min(dur, race.el + dt);
        self.invalidate();
        return race.el < dur;
      });
    },

    // ------------------------------------------------------------ simulation
    emit: function (d, lane, sx, sy) {
      var B = this.beads[d], i = B.next;
      B.next = (i + 1) % POOL;
      B.on[i] = 1; B.t[i] = 0; B.lane[i] = lane; B.sx[i] = sx; B.sy[i] = sy;
    },
    update: function (dt) {
      var rnd = this.mode === 'random', self = this;
      var omega = TAU * 1.6;
      this.platAng = (this.platAng + omega * dt) % TAU;
      // --- HDD arm
      var a = this.arm, G = this.geo;
      if (G) {
        if (!rnd) {
          a.phase = 'seq';
          a.u = (a.u + dt * 0.012) % 1;
          this.beads[0].acc += dt * 8;
        } else {
          if (a.phase === 'idle' || a.phase === 'seq') { a.phase = 'pick'; }
          if (a.phase !== 'pick' && !this.reqs[a.req]) a.phase = 'pick';
          if (a.phase === 'pick' && this.reqs.length) {
            // NCQ: serve the request with the shortest seek + rotational wait
            var best = -1, bd = 1e9, hp0 = this.headPos(), hA = Math.atan2(hp0.y - G.pcy, hp0.x - G.pcx);
            for (var i = 0; i < this.reqs.length; i++) {
              var rq0 = this.reqs[i], sk = 0.2 + 0.26 * Math.sqrt(Math.abs(rq0.u - a.u));
              var wait = (((hA - (rq0.ang + this.platAng + omega * sk)) % TAU) + TAU) % TAU / omega;
              if (sk + wait < bd) { bd = sk + wait; best = i; }
            }
            a.req = best; a.from = a.u; a.to = this.reqs[best].u; a.t = 0;
            a.dur = 0.08 + 0.26 * Math.sqrt(Math.abs(a.to - a.from));
            a.phase = 'seek';
          }
          if (a.phase === 'seek' || a.phase === 'settle') {
            a.t += dt;
            var k = a.t / a.dur, jump = a.to - a.from;
            if (k < 1) a.u = a.from + jump * U.ease.inOutCubic(k);
            else {
              a.phase = 'settle';
              var s = a.t - a.dur;
              a.u = a.to + jump * 0.06 * Math.exp(-s * 22) * Math.sin(s * 70);
              if (s > 0.12) { a.u = a.to; a.phase = 'rot'; }
            }
          }
          if (a.phase === 'rot') {
            var rq = this.reqs[a.req] || this.reqs[0], hp = this.headPos();
            var hAng = Math.atan2(hp.y - G.pcy, hp.x - G.pcx);
            var diff = ((hAng - (rq.ang + this.platAng)) % TAU + TAU) % TAU;
            if (diff < omega * dt * 1.2 || diff > TAU - 0.05) { a.phase = 'read'; a.t = 0; }
          }
          if (a.phase === 'read') {
            a.t += dt;
            if (a.t > 0.05) {
              var hp2 = this.headPos();
              this.emit(0, 0, hp2.x, hp2.y);
              this.reqs[a.req] = { u: this.rng.float(), ang: this.rng.float() * TAU };
              a.phase = 'pick';
            }
          }
        }
      }
      // --- SSD rates
      var rS = rnd ? 2 * Math.pow(iops(1, this.qd()) / 200, 0.35) : 14;
      var rN = rnd ? 2 * Math.pow(iops(2, this.qd()) / 200, 0.35) : 40;
      this.beads[1].acc += dt * rS;
      this.beads[2].acc += dt * rN;
      // spawn
      while (this.beads[0].acc >= 1) { this.beads[0].acc -= 1; var hp3 = this.headPos(); this.emit(0, 0, hp3.x, hp3.y); }
      while (this.beads[1].acc >= 1) {
        this.beads[1].acc -= 1;
        var c = rnd ? this.rng.int(0, 47) : (this.seqIdx[0] = (this.seqIdx[0] + 1) % 48);
        this.cellsS[c] = 1; this.emit(1, 0, 0, 0);
      }
      while (this.beads[2].acc >= 1) {
        this.beads[2].acc -= 1;
        var cn = rnd ? this.rng.int(0, 95) : (this.seqIdx[1] = (this.seqIdx[1] + 1) % 96);
        this.cellsN[cn] = 1; if (!rnd) this.cellsN[(cn + 48) % 96] = 1;
        this.emit(2, this.rng.int(0, 3), 0, 0);
      }
      var dec = Math.exp(-dt * 7);
      for (i = 0; i < 48; i++) this.cellsS[i] *= dec;
      for (i = 0; i < 96; i++) this.cellsN[i] *= dec;
      // move beads
      for (var d = 0; d < 3; d++) {
        var B = this.beads[d], sp = d === 0 ? 1.1 : 1.5;
        for (i = 0; i < POOL; i++) if (B.on[i]) { B.t[i] += dt * sp; if (B.t[i] >= 1) B.on[i] = 0; }
      }
      // displayed counters ease toward the model with a little jitter
      for (d = 0; d < 3; d++) {
        var target = this.metric(d) * (1 + (U.noise1(this.time * 3 + d * 7) - 0.5) * 0.04);
        this.shown[d] = this.shown[d] ? U.damp(this.shown[d], target, 6, dt) : target;
      }
      void self;
    },
    headPos: function () {
      var G = this.geo, o = this.tmp;
      if (!G) { o.x = 0; o.y = 0; return o; }
      var r = G.R * (0.3 + 0.64 * U.clamp(this.arm.u, -0.05, 1.05));
      var ph = G.phic - 2 * Math.asin(U.clamp(r / (2 * G.La), -1, 1));
      o.x = G.pvx + Math.cos(ph) * G.La; o.y = G.pvy + Math.sin(ph) * G.La; o.ph = ph;
      return o;
    },

    // ------------------------------------------------------------ layout
    resize: function (w, h) {
      var m = this.mobile = w < 560, pad = m ? 8 : 14, gap = m ? 8 : 12;
      this.panels = [];
      var raceH = m ? Math.min(138, Math.round(h * 0.34)) : Math.max(110, Math.round(h * 0.33));
      var topH = h - raceH - pad * 2 - gap;
      for (var k = 0; k < 3; k++) {
        if (m) {
          var ph = (topH - 2 * gap) / 3;
          this.panels.push({ x: pad, y: pad + k * (ph + gap), w: w - pad * 2, h: ph });
        } else {
          var pw = (w - pad * 2 - gap * 2) / 3;
          this.panels.push({ x: pad + k * (pw + gap), y: pad, w: pw, h: topH });
        }
      }
      this.raceR = { x: pad, y: h - pad - raceH, w: w - pad * 2, h: raceH };
      // drawing boxes inside panels
      var self = this;
      this.panels.forEach(function (p) {
        if (m) p.box = { x: p.x + 8, y: p.y + 6, w: Math.max(20, Math.min(p.w * 0.46, p.h * 1.5)), h: Math.max(20, p.h - 12) };
        else p.box = { x: p.x + 12, y: p.y + 44, w: p.w - 24, h: Math.max(30, p.h - 44 - 54) };
      });
      // HDD geometry
      var b = this.panels[0].box, bodyH = b.h * 0.78, bodyW = Math.min(b.w * 0.9, bodyH * 1.25);
      var bx = b.x + (b.w - bodyW) / 2, by = b.y;
      var R = Math.max(6, Math.min(bodyW * 0.38, bodyH * 0.43));
      var G = this.geo = { bx: bx, by: by, bw: bodyW, bh: bodyH, R: R, pcx: bx + bodyW * 0.42, pcy: by + bodyH * 0.48 };
      G.pvx = G.pcx + R * 1.12; G.pvy = G.pcy + R * 0.8;
      G.La = Math.hypot(G.pcx - G.pvx, G.pcy - G.pvy);
      G.phic = Math.atan2(G.pcy - G.pvy, G.pcx - G.pvx);
      G.conX = bx + bodyW * 0.5; G.conY = by + bodyH;
      // lanes (for beads): per drive list of polylines
      this.lanes = [];
      this.lanes.push([this.lanePts(G.conX, G.conY + 2, b.y + b.h)]);
      for (k = 1; k < 3; k++) {
        var bb = this.panels[k].box, cx = bb.x + bb.w / 2, n = k === 1 ? 1 : 4, arr = [];
        var cy = bb.y + bb.h * 0.78;
        for (var l = 0; l < n; l++) { var lx = cx + (l - (n - 1) / 2) * (m ? 7 : 10); arr.push(this.lanePts(lx, cy, bb.y + bb.h)); }
        this.lanes.push(arr);
      }
      void self;
    },
    lanePts: function (x, y0, y1) { var pts = [x, y0, x, y1]; return { pts: pts, lens: D.polyLen(pts) }; },

    // ------------------------------------------------------------ draw
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, m = this.mobile, rnd = this.mode === 'random';
      D.clear(ctx, w, h);
      var names = ['HDD · 7,200 rpm', 'SATA SSD', 'NVMe SSD · Gen4'];
      var subs = ['SATA 6 Gb/s · 1 arm', '1 queue × 32 · 1 lane', '64k queues · PCIe ×4'];
      for (var k = 0; k < 3; k++) {
        var p = this.panels[k];
        D.box(ctx, p.x, p.y, p.w, p.h, 10, U.rgba(P.panel, 0.55), U.rgba(P.blueprint, 0.25), 1);
        var tx = m ? p.box.x + p.box.w + 12 : p.x + 12;
        D.text(ctx, names[k], tx, p.y + (m ? 16 : 18), { size: m ? 10.5 : 12, weight: 800, color: P.text1, ls: 0.3 });
        D.text(ctx, subs[k], tx, p.y + (m ? 30 : 33), { size: m ? 8.5 : 9.5, color: P.text3 });
        if (k === 0) this.drawHdd(ctx, p.box); else this.drawSsd(ctx, p.box, k);
        this.drawBeads(ctx, k);
        // metric
        var v = this.shown[k] || this.metric(k);
        var big = rnd ? fmtIops(v) : U.fmt(v);
        var unit = rnd ? 'IOPS' : 'MB/s';
        var col = rnd ? (k === 0 ? P.fault : k === 1 ? P.text1 : P.ok) : (k === 2 ? P.ok : P.text1);
        var lat = Math.max(LAT[k], rnd ? this.qd() / iops(k, this.qd()) : 0);
        var mx, my;
        if (m) { mx = tx; my = p.y + p.h - 30; }
        else { mx = p.x + 12; my = p.y + p.h - 34; }
        D.text(ctx, big, mx, my, { size: m ? 18 : 22, weight: 800, color: col });
        D.text(ctx, unit, mx + D.measure(ctx, big, m ? 18 : 22, 800) + 5, my + 3, { size: m ? 9 : 10, weight: 700, color: P.text2 });
        D.text(ctx, (m ? '' : rnd ? 'random 4 KB · ' : 'sequential · ') + 'latency ' + U.fmtTime(lat), mx, my + (m ? 17 : 21), { size: m ? 8.5 : 9.5, color: P.text3, maxW: m ? p.x + p.w - mx - 6 : p.w - 24 });
      }
      // honest-time badge on HDD
      var hp = this.panels[0];
      D.pill(ctx, '⏱ slowed ~100×', hp.x + hp.w - (m ? 8 : 10), m ? hp.y + hp.h - 12 : hp.y + 18, { size: m ? 7.5 : 8.5, color: P.text2, align: 'right' });
      this.drawRace(ctx);
    },

    drawHdd: function (ctx, b) {
      var P = S.pal, G = this.geo, t = this.time, m = this.mobile, rnd = this.mode === 'random';
      // case
      D.box(ctx, G.bx, G.by, G.bw, G.bh, 8, U.shade(P.alu, P.dark ? -0.55 : -0.05), U.rgba(P.alu, 0.6), 1.2);
      ctx.fillStyle = U.rgba(P.alu, 0.5);
      [[8, 8], [G.bw - 8, 8], [8, G.bh - 8], [G.bw - 8, G.bh - 8]].forEach(function (s) { D.circle(ctx, G.bx + s[0], G.by + s[1], 2.2, U.rgba(P.alu, 0.6)); });
      // platter
      var R = G.R;
      D.circle(ctx, G.pcx, G.pcy, R + 3, U.rgba('#000', 0.25));
      D.circle(ctx, G.pcx, G.pcy, R, U.mix(P.alu, P.data, 0.12), U.rgba(P.alu, 0.8), 1);
      for (var i = 1; i <= 5; i++) D.circle(ctx, G.pcx, G.pcy, R * (0.3 + 0.64 * i / 5), null, U.rgba(P.bg, 0.25), 1);
      // spinning sector ticks on a few tracks
      ctx.strokeStyle = U.rgba(P.bg, 0.55); ctx.lineWidth = 2;
      for (var tr = 0; tr < 3; tr++) {
        var rr = R * (0.42 + tr * 0.2), nT = 14 + tr * 6;
        ctx.beginPath();
        for (i = 0; i < nT; i++) {
          var a0 = this.platAng + i * TAU / nT + tr * 0.3;
          ctx.moveTo(G.pcx + Math.cos(a0) * rr, G.pcy + Math.sin(a0) * rr);
          ctx.lineTo(G.pcx + Math.cos(a0 + 0.08) * rr, G.pcy + Math.sin(a0 + 0.08) * rr);
        }
        ctx.stroke();
      }
      // pending requests (rotate with platter)
      if (rnd) {
        for (i = 0; i < this.reqs.length; i++) {
          var rq = this.reqs[i], rr2 = R * (0.3 + 0.64 * rq.u), ang = rq.ang + this.platAng;
          var px = G.pcx + Math.cos(ang) * rr2, py = G.pcy + Math.sin(ang) * rr2;
          var target = this.arm.req === i && this.arm.phase !== 'pick';
          D.circle(ctx, px, py, target ? 3.6 : 2.6, target ? P.accent : P.data);
          if (target) D.glow(ctx, px, py, 10, P.accent, 0.6);
        }
      }
      // hub
      D.circle(ctx, G.pcx, G.pcy, R * 0.2, U.shade(P.alu, -0.1), U.rgba('#000', 0.3), 1);
      D.circle(ctx, G.pcx, G.pcy, R * 0.07, U.shade(P.alu, -0.4));
      // actuator arm
      var hp = this.headPos(), hx = hp.x, hy = hp.y;
      var ang2 = Math.atan2(hy - G.pvy, hx - G.pvx), nx = -Math.sin(ang2), ny = Math.cos(ang2);
      var wB = R * 0.13, wT = R * 0.04;
      ctx.beginPath();
      ctx.moveTo(G.pvx + nx * wB, G.pvy + ny * wB); ctx.lineTo(hx + nx * wT, hy + ny * wT);
      ctx.lineTo(hx - nx * wT, hy - ny * wT); ctx.lineTo(G.pvx - nx * wB, G.pvy - ny * wB); ctx.closePath();
      ctx.fillStyle = U.shade(P.steel, P.dark ? 0.15 : -0.1); ctx.fill(); ctx.strokeStyle = U.rgba('#000', 0.35); ctx.lineWidth = 1; ctx.stroke();
      // voice-coil wedge behind pivot
      var back = ang2 + Math.PI;
      ctx.beginPath(); ctx.moveTo(G.pvx, G.pvy);
      ctx.arc(G.pvx, G.pvy, R * 0.32, back - 0.45, back + 0.45); ctx.closePath();
      ctx.fillStyle = U.shade(P.copper, -0.2); ctx.fill();
      D.circle(ctx, G.pvx, G.pvy, R * 0.12, U.shade(P.steel, -0.2), U.rgba(P.alu, 0.6), 1);
      // head
      var reading = this.arm.phase === 'read' || !rnd;
      D.circle(ctx, hx, hy, 3, reading ? P.data : P.text2);
      if (reading) D.glow(ctx, hx, hy, 10, P.data, 0.7);
      // connector
      D.box(ctx, G.conX - 14, G.conY - 4, 28, 6, 1, P.plastic, null);
      // label phase
      if (rnd && !m) {
        var ph = this.arm.phase, lbl = ph === 'seek' ? 'SEEK' : ph === 'settle' ? 'SETTLE' : ph === 'rot' ? 'WAIT FOR SPIN' : 'READ';
        D.text(ctx, lbl, G.bx + 8, G.by + G.bh - 10, { size: 8.5, weight: 700, color: ph === 'read' ? P.data : P.warn, ls: 1 });
      }
      void t; void b;
    },

    drawSsd: function (ctx, b, k) {
      var P = S.pal, m = this.mobile, nv = k === 2, cells = nv ? this.cellsN : this.cellsS;
      var bodyH = b.h * 0.78, bodyW = Math.min(b.w * (nv ? 0.92 : 0.8), bodyH * (nv ? 1.5 : 1.25));
      var bx = b.x + (b.w - bodyW) / 2, by = b.y;
      D.box(ctx, bx, by, bodyW, bodyH, 6, nv ? U.rgba(P.pcb, 0.85) : U.shade(P.alu, P.dark ? -0.55 : -0.05), U.rgba(nv ? P.gold : P.alu, 0.5), 1.2);
      // NAND packages
      var pk = nv ? 4 : 2, rows = 2, cpr = nv ? 3 : 3, cpc = 4;
      var areaX = bx + 8, areaY = by + 8, areaW = bodyW - 16, areaH = bodyH * 0.52;
      var pw = (areaW - (pk - 1) * 6) / pk, phh = (areaH - 6) / rows, ci = 0;
      for (var r = 0; r < rows; r++) for (var c = 0; c < pk; c++) {
        var px = areaX + c * (pw + 6), py = areaY + r * (phh + 6);
        D.box(ctx, px, py, pw, phh, 2, U.shade(P.silicon, -0.15), U.rgba(P.alu, 0.25), 1);
        var cw = (pw - 6) / cpc, ch = (phh - 6) / cpr;
        for (var yy = 0; yy < cpr; yy++) for (var xx = 0; xx < cpc; xx++) {
          var f = cells[ci % cells.length]; ci++;
          var cx = px + 3 + xx * cw, cy = py + 3 + yy * ch;
          ctx.fillStyle = f > 0.05 ? U.mix(P.silicon, P.data, f) : U.rgba(P.text3, 0.18);
          ctx.fillRect(cx + 0.5, cy + 0.5, cw - 1.5, ch - 1.5);
        }
      }
      if (!m) D.text(ctx, 'NAND flash', areaX, areaY + areaH + 9, { size: 8.5, color: P.text3 });
      // controller
      var ctrlW = bodyW * 0.26, ctrlH = bodyH * 0.16, ctrlX = bx + bodyW * 0.5 - ctrlW / 2, ctrlY = areaY + areaH + 14;
      D.box(ctx, ctrlX, ctrlY, ctrlW, ctrlH, 2, U.shade(P.silicon, 0.2), U.rgba(P.alu, 0.4), 1);
      if (!m) D.text(ctx, 'CTRL', ctrlX + ctrlW / 2, ctrlY + ctrlH / 2, { size: 8, weight: 700, color: P.text2, align: 'center' });
      // queues
      var qd = this.qd(), rnd = this.mode === 'random';
      var qx = bx + 8, qw = bodyW - 16, qy = ctrlY + ctrlH + 6, qh = by + bodyH - 6 - qy;
      if (!nv) {
        var slots = 32, sw = qw / slots, fill = rnd ? Math.min(qd, 32) : 4;
        for (var i = 0; i < slots; i++) {
          ctx.fillStyle = i < fill ? U.rgba(P.data, 0.75) : U.rgba(P.text3, 0.2);
          ctx.fillRect(qx + i * sw + 0.5, qy + qh * 0.25, sw - 1, qh * 0.5);
        }
        if (rnd && qd > 32) D.text(ctx, 'FULL', qx + qw, qy - 4, { size: 8, weight: 800, color: P.warn, align: 'right' });
      } else {
        var rails = 8, rh = qh / rails, per = 16, fillN = rnd ? qd / rails : 1;
        for (var q = 0; q < rails; q++) {
          var nfill = Math.min(per, Math.ceil(Math.max(0, fillN - 0) * (q < qd ? 1 : 0)));
          if (qd < rails) nfill = q < qd ? 1 : 0;
          for (i = 0; i < per; i++) {
            ctx.fillStyle = i < nfill ? U.rgba(P.data, 0.75) : U.rgba(P.text3, 0.16);
            ctx.fillRect(qx + i * (qw / per) + 0.5, qy + q * rh + 0.5, qw / per - 1, Math.max(1, rh - 1.5));
          }
        }
      }
      // connector + lanes
      var lanes = this.lanes[k];
      for (i = 0; i < lanes.length; i++) {
        var lp = lanes[i].pts;
        D.line(ctx, lp[0], lp[1], lp[2], lp[3], U.rgba(P.data, 0.25), nv ? 3 : 2);
      }
      ctx.fillStyle = P.gold;
      if (nv) { for (i = 0; i < 12; i++) ctx.fillRect(bx + bodyW * 0.2 + i * bodyW * 0.05, by + bodyH - 4, bodyW * 0.03, 4); }
      else D.box(ctx, bx + bodyW * 0.5 - 12, by + bodyH - 4, 24, 6, 1, P.plastic, null);
      var lbl = nv ? 'PCIe ×4' : 'SATA · 1 lane';
      var ll = lanes[lanes.length - 1].pts;
      D.text(ctx, lbl, ll[0] + (nv ? 10 : 8), (ll[1] + ll[3]) / 2 + 2, { size: m ? 8 : 9, weight: 600, color: P.text3 });
    },

    drawBeads: function (ctx, d) {
      var P = S.pal, B = this.beads[d], lanes = this.lanes[d], o = this.tmp2 || (this.tmp2 = {}), G = this.geo;
      var seq = this.mode !== 'random';
      for (var i = 0; i < POOL; i++) {
        if (!B.on[i]) continue;
        var t = B.t[i], x, y;
        if (d === 0) {
          if (t < 0.5) { var k = t / 0.5; x = U.lerp(B.sx[i], G.conX, k); y = U.lerp(B.sy[i], G.conY, k); }
          else { D.along(lanes[0].pts, lanes[0].lens, (t - 0.5) / 0.5 * lanes[0].lens[1], o); x = o.x; y = o.y; }
        } else {
          var ln = lanes[Math.min(B.lane[i], lanes.length - 1)];
          D.along(ln.pts, ln.lens, t * ln.lens[1], o); x = o.x; y = o.y;
        }
        if (seq) { D.box(ctx, x - 2, y - 4, 4, 8, 2, P.data); }
        else D.circle(ctx, x, y, 2.2, P.data);
        D.glow(ctx, x, y, 7, P.data, 0.45);
      }
    },

    drawRace: function (ctx) {
      var P = S.pal, R = this.raceR, m = this.mobile, race = this.race;
      D.box(ctx, R.x, R.y, R.w, R.h, 10, U.rgba(P.panel, 0.55), U.rgba(P.blueprint, 0.25), 1);
      var title = race ? 'RACE · ' + race.title.toUpperCase() : 'RACE · PICK ONE BELOW';
      D.text(ctx, title, R.x + 12, R.y + 16, { size: m ? 9 : 10.5, weight: 800, color: P.text2, ls: 1, maxW: R.w - (race ? 150 : 24) });
      if (race) D.pill(ctx, '⏱ shown ' + U.fmt(race.scale, race.scale < 10 ? 1 : 0) + '× faster', R.x + R.w - 10, R.y + 16, { size: m ? 8.5 : 9.5, color: P.text2, align: 'right' });
      var top = R.y + 32, rowH = (R.h - 40) / 4, lw = m ? 78 : 118, tw = m ? 62 : 86;
      var bx = R.x + 12 + lw, bw = R.w - 24 - lw - tw;
      var elapsedReal = race ? race.el * race.scale : 0;
      for (var i = 0; i < 4; i++) {
        var y = top + i * rowH + rowH / 2;
        D.text(ctx, m ? ['HDD', 'SATA SSD', 'NVMe G4', 'NVMe G5'][i] : RACERS[i], R.x + 12, y, { size: m ? 9 : 10.5, weight: 700, color: i === 3 ? P.data : P.text1 });
        var bh = Math.min(12, rowH * 0.5);
        D.box(ctx, bx, y - bh / 2, bw, bh, bh / 2, U.rgba(P.panel3, 0.9));
        if (!race) continue;
        var T = race.times[i], frac = U.clamp(elapsedReal / T, 0, 1), done = frac >= 1;
        if (frac > 0) {
          var col = done ? (i === 0 ? P.warn : P.ok) : P.data;
          D.box(ctx, bx, y - bh / 2, Math.max(bh, bw * frac), bh, bh / 2, col);
          if (!done) D.glow(ctx, bx + bw * frac, y, 12, P.data, 0.7);
        }
        var shownT = Math.min(elapsedReal, T);
        D.text(ctx, (done ? '✓ ' : '') + U.fmtTime(shownT), R.x + R.w - 12, y, { size: m ? 9.5 : 11, weight: 700, color: done ? (i === 0 ? P.warn : P.ok) : P.text2, align: 'right' });
      }
    }
  });
})(window.SRV);
