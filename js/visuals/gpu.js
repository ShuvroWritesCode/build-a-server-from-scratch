/* Ch14 · 8 professors vs 2,048 students. A CPU (8 strong cores) and a GPU (2,048 small cores) each
   compute a 64×64 picture. "Colour the image" splits perfectly (GPU: two waves, done in a blink);
   "Solve a maze" is one chain of dependent steps (one worker moves, the rest wait → CPU wins). */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var PX = 64, NPX = PX * PX;
  var UNIT = 0.008;          // seconds of animation per "work unit" (one CPU core step)
  var GPU_SLOW = 4;          // one GPU core step costs 4 units (simpler, slower cores)
  var CPU_CORES = 8, GPU_CORES = 2048;
  var MZ = 21, MS = 3;       // maze grid 21×21 "maze pixels", each 3 image px

  function buildMaze() {
    var r = U.rng('gpu-maze-7'), g = new Uint8Array(MZ * MZ); // 1 = open
    var st = [[1, 1]]; g[MZ + 1] = 1;
    var dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    while (st.length) {
      var c = st[st.length - 1], opts = [];
      for (var k = 0; k < 4; k++) {
        var nx = c[0] + dirs[k][0], ny = c[1] + dirs[k][1];
        if (nx > 0 && ny > 0 && nx < MZ - 1 && ny < MZ - 1 && !g[ny * MZ + nx]) opts.push(dirs[k]);
      }
      if (!opts.length) { st.pop(); continue; }
      var d = r.pick(opts), mx = c[0] + d[0], my = c[1] + d[1];
      g[(c[1] + d[1] / 2) * MZ + c[0] + d[0] / 2] = 1; g[my * MZ + mx] = 1;
      st.push([mx, my]);
    }
    // solve with depth-first search, recording every move (visits and backtracks)
    var start = MZ + 1, goal = (MZ - 2) * MZ + (MZ - 2), seen = new Uint8Array(MZ * MZ), stack = [start], steps = [start];
    seen[start] = 1;
    var rs = U.rng('gpu-solve-3');
    while (stack.length) {
      var cur = stack[stack.length - 1];
      if (cur === goal) break;
      var cx = cur % MZ, cy = (cur / MZ) | 0, nb = [];
      [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(function (q) {
        var ni = (cy + q[1]) * MZ + cx + q[0];
        if (g[ni] && !seen[ni]) nb.push(ni);
      });
      if (nb.length) { var n = rs.pick(nb); seen[n] = 1; stack.push(n); steps.push(n); }
      else { stack.pop(); steps.push(-(cur + 1)); }
    }
    var path = new Uint8Array(MZ * MZ); stack.forEach(function (i) { path[i] = 1; });
    return { g: g, steps: steps, path: path, start: start, goal: goal };
  }

  S.defineVisual('gpu', {
    init: function () {
      this.ctx = this.layer();
      this.task = 'colour';
      this.elapsed = 0; this.running = false; this.finished = false;
      var art = D.pixelArt(PX, PX, 'gpu-art');
      this.art = new Uint8ClampedArray(NPX * 3);
      for (var y = 0; y < PX; y++) for (var x = 0; x < PX; x++) {
        var p = U.parse(art[y][x]), i = (y * PX + x) * 3;
        this.art[i] = p.r; this.art[i + 1] = p.g; this.art[i + 2] = p.b;
      }
      this.maze = buildMaze();
      this.sides = [this.mkSide('cpu'), this.mkSide('gpu')];
      var self = this;
      var g = this.ui.group('Task');
      this.segTask = g.seg({ label: 'Task', options: [['colour', 'Colour the image'], ['maze', 'Solve a maze']], value: 'colour',
        onChange: function (v) { self.task = v; self.reset(); } });
      var g2 = this.ui.group('Run');
      this.bRun = g2.button('▶ Run both', function () { self.run(); }, { kind: 'primary' });
      g2.button('↺ Reset', function () { self.reset(); });
      this.ui.spacer();
      this.rCpu = this.ui.readout('CPU time', '–');
      this.rGpu = this.ui.readout('GPU time', '–');
      this.rWin = this.ui.readout('Result', 'ready');
      this.reset(true);
    },
    mkSide: function (kind) {
      var c = document.createElement('canvas'); c.width = PX; c.height = PX;
      var ictx = c.getContext('2d');
      var img = ictx.createImageData(PX, PX);
      return { kind: kind, c: c, ictx: ictx, img: img, prog: 0, waves: 0, mk: 0, vis: new Uint8Array(MZ * MZ), head: -1,
        done: false, doneAt: 0, time: 0, painted: new Uint8Array(NPX), dirty: true };
    },
    total: function (s) {
      if (this.task === 'colour') return s.kind === 'cpu' ? (NPX / CPU_CORES) * UNIT : Math.ceil(NPX / GPU_CORES) * GPU_SLOW * UNIT;
      return this.maze.steps.length * UNIT * (s.kind === 'cpu' ? 1 : GPU_SLOW);
    },
    reset: function (silent) {
      this.running = false; this.finished = false; this.elapsed = 0; this.setActive(false);
      var self = this;
      this.sides.forEach(function (s) {
        s.prog = 0; s.waves = 0; s.mk = 0; s.vis.fill(0); s.head = -1; s.done = false; s.time = 0; s.painted.fill(0);
        s.doneAt = self.total(s); s.dirty = true;
      });
      if (this.bRun) this.bRun.setDisabled(false);
      this.syncReadouts();
      if (!silent) this.announce(this.task === 'colour' ? 'Task: colour the image. Press Run.' : 'Task: solve the maze. Press Run.');
      this.invalidate();
    },
    run: function () {
      if (this.running) return;
      if (this.finished) this.reset(true);
      this.running = true; this.bRun.setDisabled(true);
      this.rWin.set('running…');
      if (this.reduced()) { this.elapsed = Math.max(this.sides[0].doneAt, this.sides[1].doneAt) + 0.01; this.advance(); }
      else this.setActive(true);
    },
    update: function (dt) {
      if (!this.running) return;
      this.elapsed += dt;
      this.advance();
    },
    advance: function () {
      var self = this, e = this.elapsed;
      this.sides.forEach(function (s) {
        if (s.done) return;
        var u = e / UNIT;
        if (self.task === 'colour') {
          if (s.kind === 'cpu') {
            var per = NPX / CPU_CORES, n = Math.min(per, Math.floor(u));
            for (var k = 0; k < CPU_CORES; k++) for (var j = s.prog; j < n; j++) s.painted[k * per + j] = 1;
            if (n !== s.prog) { s.prog = n; s.dirty = true; }
          } else {
            var w = Math.min(Math.ceil(NPX / GPU_CORES), Math.floor(u / GPU_SLOW));
            for (var q = s.waves; q < w; q++) for (var p = q * GPU_CORES; p < Math.min(NPX, (q + 1) * GPU_CORES); p++) s.painted[p] = 1;
            if (w !== s.waves) { s.waves = w; s.dirty = true; }
          }
        } else {
          var steps = self.maze.steps, m = Math.min(steps.length, Math.floor(u / (s.kind === 'cpu' ? 1 : GPU_SLOW)));
          for (var i = s.mk; i < m; i++) {
            var st = steps[i];
            if (st >= 0) { s.vis[st] = 1; s.head = st; } else { s.vis[-st - 1] = 2; }
          }
          if (m !== s.mk) {
            s.mk = m; s.dirty = true;
            for (var b = m - 1; b >= 0; b--) { if (steps[b] >= 0 && s.vis[steps[b]] === 1) { s.head = steps[b]; break; } }
          }
        }
        s.time = Math.min(e, s.doneAt);
        if (e >= s.doneAt) { s.done = true; s.time = s.doneAt; s.dirty = true; }
      });
      this.syncReadouts();
      if (this.sides[0].done && this.sides[1].done && this.running) {
        this.running = false; this.finished = true; this.setActive(false); this.bRun.setDisabled(false);
        this.bRun.setLabel('▶ Run again');
        var c = this.sides[0].doneAt, g = this.sides[1].doneAt;
        this.announce(g < c ? 'Done. The GPU finished about ' + Math.round(c / g) + ' times faster: every pixel could be coloured at the same time.' :
          'Done. The CPU finished about ' + Math.round(g / c) + ' times faster: each maze step depends on the previous one, so 2,047 GPU workers waited.');
      }
      this.invalidate();
    },
    syncReadouts: function () {
      if (!this.rCpu) return;
      var a = this.sides[0], b = this.sides[1];
      this.rCpu.set(this.elapsed ? a.time.toFixed(2) + ' s' + (a.done ? ' ✓' : '') : '–', a.done && this.finished && a.doneAt <= b.doneAt ? 'ok' : '');
      this.rGpu.set(this.elapsed ? b.time.toFixed(2) + ' s' + (b.done ? ' ✓' : '') : '–', b.done && this.finished && b.doneAt < a.doneAt ? 'ok' : '');
      if (this.finished) {
        var fast = b.doneAt < a.doneAt ? 'GPU' : 'CPU', k = b.doneAt < a.doneAt ? a.doneAt / b.doneAt : b.doneAt / a.doneAt;
        this.rWin.set(fast + ' ' + Math.round(k) + '× faster', 'ok');
      } else if (!this.running) this.rWin.set('ready');
    },
    onTheme: function () { this.sides.forEach(function (s) { s.dirty = true; }); },
    compose: function (s) {
      var d = s.img.data, P = S.pal;
      var u0 = U.parse(U.mix(P.bg, P.blueprint, 0.07)), u1 = U.parse(U.mix(P.bg, P.blueprint, 0.16));
      var i, x, y, o;
      if (this.task === 'colour') {
        for (y = 0; y < PX; y++) for (x = 0; x < PX; x++) {
          i = y * PX + x; o = i * 4;
          if (s.painted[i]) { d[o] = this.art[i * 3]; d[o + 1] = this.art[i * 3 + 1]; d[o + 2] = this.art[i * 3 + 2]; }
          else { var q = ((x >> 2) + (y >> 2)) & 1 ? u1 : u0; d[o] = q.r; d[o + 1] = q.g; d[o + 2] = q.b; }
          d[o + 3] = 255;
        }
      } else {
        var M = this.maze, wall = U.parse(U.mix(P.steel, P.bg, 0.15)), open = U.parse(P.bg0), seen = U.parse(U.mix(P.data, P.bg0, 0.35)),
          dead = U.parse(U.mix(P.data, P.bg0, 0.78)), path = U.parse(P.accent), st = U.parse(P.ok), go = U.parse(P.power), head = U.parse(P.text1);
        for (y = 0; y < PX; y++) for (x = 0; x < PX; x++) {
          o = (y * PX + x) * 4;
          var mx = (x / MS) | 0, my = (y / MS) | 0, c = wall;
          if (mx < MZ && my < MZ) {
            var mi = my * MZ + mx;
            if (M.g[mi]) {
              var v = s.vis[mi];
              c = v === 1 ? seen : v === 2 ? dead : open;
              if (s.done && M.path[mi]) c = path;
              if (mi === M.start) c = st; else if (mi === M.goal) c = go;
              if (!s.done && mi === s.head) c = head;
            }
          }
          d[o] = c.r; d[o + 1] = c.g; d[o + 2] = c.b; d[o + 3] = 255;
        }
      }
      s.ictx.putImageData(s.img, 0, 0);
      s.dirty = false;
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      var pads = this.mobile ? [{ x: 0, y: 0, w: w, h: h / 2 }, { x: 0, y: h / 2, w: w, h: h / 2 }] : [{ x: 0, y: 0, w: w / 2, h: h - 26 }, { x: w / 2, y: 0, w: w / 2, h: h - 26 }];
      this.panels = pads.map(function (P) {
        var pad = w < 560 ? 12 : 20, top = w < 560 ? 40 : 52, bottom = w < 560 ? 34 : 46;
        var S2 = Math.floor(Math.min(P.w * 0.52, P.h - top - bottom - 10));
        var ix = P.x + P.w - pad - S2, iy = P.y + top + Math.max(0, (P.h - top - bottom - S2) / 2);
        var cw = ix - (P.x + pad) - pad;
        var chip = Math.min(cw, S2);
        return { P: P, pad: pad, img: { x: ix, y: iy, s: S2 }, chip: { x: P.x + pad + (cw - chip) / 2, y: iy + (S2 - chip) / 2, s: chip } };
      });
    },
    drawChip: function (ctx, s, R) {
      var P = S.pal, x = R.x, y = R.y, sz = R.s, cpu = s.kind === 'cpu', t = this.time;
      var colour = this.task === 'colour', active = this.running && !s.done;
      // package + substrate
      D.box(ctx, x, y, sz, sz, 8, U.mix(P.pcb, P.bg, 0.35), U.rgba(P.blueprint, 0.5), 1);
      ctx.fillStyle = U.rgba(P.gold, 0.55);
      for (var k = 0; k < 14; k++) { var o = 10 + k * (sz - 20) / 13; ctx.fillRect(x + o - 1, y + 2, 2, 4); ctx.fillRect(x + o - 1, y + sz - 6, 2, 4); }
      var m = sz * 0.1, dx = x + m, dy = y + m, ds = sz - m * 2;
      D.box(ctx, dx, dy, ds, ds, 4, P.silicon, U.rgba(P.alu, 0.4), 1);
      var busyC = P.data, idleC = U.mix(P.panel3, P.silicon, 0.3);
      if (cpu) {
        var g = 6, cw = (ds - g * 3) / 2, ch = (ds - g * 5) / 4;
        for (var i = 0; i < CPU_CORES; i++) {
          var cx = dx + g + (i % 2) * (cw + g), cy = dy + g + Math.floor(i / 2) * (ch + g);
          var busy = active && (colour || i === 0);
          D.box(ctx, cx, cy, cw, ch, 3, busy ? U.rgba(busyC, 0.22) : idleC, busy ? busyC : U.rgba(P.alu, 0.25), busy ? 1.5 : 1);
          var ps = Math.min(ch * 0.9, cw * 0.45);
          D.g.person(ctx, cx + cw * 0.3, cy + ch * 0.55, ps, busy ? busyC : P.text3, { arm: busy ? Math.sin(t * 22 + i) : 0, bob: busy ? Math.sin(t * 11 + i) * 0.8 : 0 });
          if (cw > 54) D.text(ctx, 'C' + i, cx + cw - 6, cy + ch / 2, { size: 9.5, weight: 700, color: busy ? busyC : P.text3, align: 'right' });
          if (busy) D.glow(ctx, cx + cw / 2, cy + ch / 2, cw * 0.6, busyC, 0.18);
        }
      } else {
        var cols = 64, rows = 32, cs = ds / cols, rh = ds / rows;
        var waveK = 0;
        if (colour && active) waveK = 1;
        ctx.fillStyle = U.mix(P.panel3, P.blueprint, 0.22); ctx.fillRect(dx + 1, dy + 1, ds - 2, ds - 2);
        if (waveK) {
          var ph = ((this.elapsed / UNIT) % GPU_SLOW) / GPU_SLOW;
          ctx.fillStyle = U.rgba(busyC, 0.55 + 0.4 * Math.sin(ph * Math.PI));
          ctx.fillRect(dx + 1, dy + 1, ds - 2, ds - 2);
          D.glow(ctx, dx + ds / 2, dy + ds / 2, ds * 0.7, busyC, 0.35);
        }
        // grid lines to show the many tiny cores
        ctx.fillStyle = P.silicon;
        for (var c2 = 1; c2 < cols; c2++) ctx.fillRect(dx + c2 * cs - 0.25, dy, Math.max(0.5, cs * 0.28), ds);
        for (var r2 = 1; r2 < rows; r2++) ctx.fillRect(dx, dy + r2 * rh - 0.25, ds, Math.max(0.5, rh * 0.22));
        if (!colour && active) {
          var hx = dx + 3 * cs, hy = dy + 2 * rh;
          ctx.fillStyle = busyC; ctx.fillRect(hx, hy, cs, rh);
          D.glow(ctx, hx + cs / 2, hy + rh / 2, 14, busyC, 0.9);
          D.leader(ctx, hx + cs / 2, hy + rh / 2, dx + ds * 0.45, dy + ds * 0.32, 'the only busy one', { color: busyC, size: this.mobile ? 9 : 10 });
        }
      }
      // caption
      var ly = y + sz + (this.mobile ? 13 : 16);
      var busyN = !active ? 0 : colour ? (cpu ? CPU_CORES : GPU_CORES) : 1, tot = cpu ? CPU_CORES : GPU_CORES;
      var txt = active ? U.fmt(busyN) + ' busy · ' + U.fmt(tot - busyN) + ' idle' : (cpu ? '8 cores · ~5 GHz each' : '2,048 cores · ~2 GHz, simple');
      D.text(ctx, txt, x + sz / 2, ly, { size: this.mobile ? 9.5 : 10.5, weight: 600, align: 'center', color: active && tot - busyN > 1 && !colour ? P.warn : P.text2 });
    },
    drawImage: function (ctx, s, R) {
      var P = S.pal, x = R.x, y = R.y, sz = R.s;
      if (s.dirty) this.compose(s);
      D.box(ctx, x - 3, y - 3, sz + 6, sz + 6, 4, null, U.rgba(P.blueprint, 0.55), 1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(s.c, x, y, sz, sz);
      ctx.imageSmoothingEnabled = true;
      var k = sz / PX;
      // worker cursors
      if (this.running && !s.done) {
        if (this.task === 'colour' && s.kind === 'cpu') {
          var per = NPX / CPU_CORES;
          for (var i = 0; i < CPU_CORES; i++) {
            var p = i * per + s.prog, px = p % PX, py = (p / PX) | 0;
            D.box(ctx, x + px * k - 1.5, y + py * k - 1.5, k + 3, k + 3, 1, null, P.accent, 1.5);
          }
        } else if (this.task === 'colour') {
          var wv = s.waves, y0 = y + wv * 32 * k;
          if (wv < 2) { ctx.fillStyle = U.rgba(P.data, 0.35); ctx.fillRect(x, y0, sz, 32 * k); D.line(ctx, x, y0, x + sz, y0, P.data, 2); }
        } else if (s.head >= 0) {
          var hx = (s.head % MZ) * MS * k, hy = ((s.head / MZ) | 0) * MS * k;
          D.glow(ctx, x + hx + MS * k / 2, y + hy + MS * k / 2, 16, P.accent, 0.9);
        }
      }
      // dimension
      if (!this.mobile) D.dim(ctx, x, y - 12, x + sz, y - 12, '64 × 64 px', { size: 9, bg: P.bg });
      // timer
      var ty = y + sz + (this.mobile ? 15 : 22);
      var col = s.done ? (this.finished && s.doneAt <= this.sides[s.kind === 'cpu' ? 1 : 0].doneAt ? P.ok : P.text1) : P.text2;
      var tstr = this.elapsed ? s.time.toFixed(2) + ' s' : '0.00 s';
      D.text(ctx, tstr, x + sz / 2, ty, { size: this.mobile ? 14 : 18, weight: 700, color: col, align: 'center' });
      if (s.done) {
        var tw = D.measure(ctx, tstr, this.mobile ? 14 : 18, 700);
        D.g.check(ctx, x + sz / 2 + tw / 2 + 12, ty, 14, P.ok);
      }
      if (this.finished && s.doneAt < this.sides[s.kind === 'cpu' ? 1 : 0].doneAt) {
        D.pill(ctx, 'FASTER', x + sz / 2, y + 16, { color: P.ok, size: 10, align: 'center' });
      }
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, self = this;
      D.clear(ctx, w, h);
      if (!this.panels) return;
      // divider
      if (this.mobile) D.line(ctx, 12, h / 2, w - 12, h / 2, U.rgba(P.blueprint, 0.25), 1, [4, 4]);
      else D.line(ctx, w / 2, 16, w / 2, h - 40, U.rgba(P.blueprint, 0.25), 1, [4, 4]);
      this.panels.forEach(function (L, i) {
        var s = self.sides[i], R = L.P, cpu = s.kind === 'cpu';
        var hy = R.y + (self.mobile ? 18 : 24);
        D.text(ctx, cpu ? 'CPU' : 'GPU', R.x + L.pad, hy, { size: self.mobile ? 14 : 16, weight: 800, color: P.text1, ls: 1.5 });
        D.text(ctx, cpu ? '8 professors' : '2,048 students', R.x + L.pad + (self.mobile ? 40 : 48), hy, { size: self.mobile ? 10.5 : 12, weight: 500, color: P.text2, sans: true });
        D.text(ctx, cpu ? 'few, fast, clever' : 'many, slow, simple', R.x + R.w - L.pad, hy, { size: self.mobile ? 9 : 10, weight: 600, color: P.text3, align: 'right' });
        self.drawChip(ctx, s, L.chip);
        self.drawImage(ctx, s, L.img);
      });
      // lesson line
      var colour = this.task === 'colour';
      var msg = colour ? 'Every pixel is independent → split it across thousands of workers' : 'Each step depends on the last → only one worker can move at a time';
      if (!this.mobile) {
        D.text(ctx, msg, w / 2, h - 16, { size: 11, weight: 600, color: P.text2, align: 'center' });
        D.text(ctx, '⏱ slow motion ≈ 1,000,000×', w - 14, h - 16, { size: 9.5, color: P.text3, align: 'right' });
      }
      var a = this.sides[0], b = this.sides[1];
      this.setDesc(colour ? (this.finished ? 'Colouring finished: GPU ' + b.doneAt.toFixed(2) + ' s versus CPU ' + a.doneAt.toFixed(2) + ' s.' : 'Colouring task: the CPU paints 8 pixels at a time, the GPU paints 2,048 at a time.') :
        (this.finished ? 'Maze solved: CPU ' + a.doneAt.toFixed(2) + ' s versus GPU ' + b.doneAt.toFixed(2) + ' s; the GPU’s other workers sat idle.' : 'Maze task: one path is explored step by step; only one worker can move on either chip.'));
    }
  });
})(window.SRV);
