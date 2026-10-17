/* Ch11 · Hot aisle / cold aisle. Side section of two racks facing a cold aisle fed by perforated
   floor tiles. Air particles follow authored streamlines and change colour as they pick up heat.
   Remove a blanking panel → hot exhaust curls back through the gap into the cold aisle and the
   intakes above it climb past 27 °C. Containment seals the cold aisle (the gap then only bypasses). */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var N = 9, GAP = 3;           // rows per rack; rack A row index (from bottom) that holds the blanking panel
  var SUPPLY = 18, DT = 14;     // supply air °C, temperature rise through a server
  var NB = 24;                  // colour buckets
  var RECIRC_ADD = [14, 12, 10, 7.5, 6];

  /** rounded polyline: pts [[x,y],…] → flat array */
  function rounded(pts, r) {
    var out = [pts[0][0], pts[0][1]];
    for (var i = 1; i < pts.length - 1; i++) {
      var a = pts[i - 1], b = pts[i], c = pts[i + 1];
      var l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
      var rr = Math.min(r, l1 / 2, l2 / 2);
      var p0x = b[0] - (b[0] - a[0]) / l1 * rr, p0y = b[1] - (b[1] - a[1]) / l1 * rr;
      var p1x = b[0] + (c[0] - b[0]) / l2 * rr, p1y = b[1] + (c[1] - b[1]) / l2 * rr;
      for (var k = 0; k <= 6; k++) {
        var t = k / 6, u = 1 - t;
        out.push(u * u * p0x + 2 * u * t * b[0] + t * t * p1x, u * u * p0y + 2 * u * t * b[1] + t * t * p1y);
      }
    }
    var e = pts[pts.length - 1]; out.push(e[0], e[1]);
    return out;
  }
  function lensOf(f) {
    var L = new Float32Array(f.length / 2);
    for (var i = 1; i < L.length; i++) L[i] = L[i - 1] + Math.hypot(f[i * 2] - f[i * 2 - 2], f[i * 2 + 1] - f[i * 2 - 1]);
    return L;
  }
  /** arc length at the vertex nearest to (x,y) */
  function sAt(f, L, x, y) {
    var best = 0, bd = 1e9;
    for (var i = 0; i < L.length; i++) { var d = Math.abs(f[i * 2] - x) + Math.abs(f[i * 2 + 1] - y); if (d < bd) { bd = d; best = i; } }
    return L[best];
  }

  S.defineVisual('aisle', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.gapOpen = false; this.contain = false; this.cAlpha = 0; this.gAlpha = 0;
      this.tIn = [new Float32Array(N), new Float32Array(N)];
      for (var r = 0; r < 2; r++) for (var i = 0; i < N; i++) this.tIn[r][i] = this.target(r, i);
      this.paths = []; this.n = 0;
      var self = this;
      var g = this.ui.group('Rack airflow');
      this.tGap = g.toggle({ label: 'Remove blanking panel', value: false, onChange: function (v) { self.setGap(v); } });
      this.tCon = g.toggle({ label: 'Containment doors', value: false, onChange: function (v) { self.setContain(v); } });
      this.ui.spacer();
      this.rHot = this.ui.readout('Hottest intake', '–');
      this.pointer({
        down: function (p) { var hit = this.hits.query(p.x, p.y); if (hit && hit.id === 'blank') { this.setGap(!this.gapOpen); this.tGap.set(this.gapOpen); } return false; },
        hover: function (p) {
          var hit = this.hits.query(p.x, p.y);
          this.stage.style.cursor = hit && hit.id === 'blank' ? 'pointer' : '';
          if (hit) this.tipAt(hit.data, p.x, p.y); else this.tipAt(null);
        }
      });
    },
    snapTemps: function () {
      if (!this._paused) return;
      for (var r = 0; r < 2; r++) for (var i = 0; i < N; i++) this.tIn[r][i] = this.target(r, i);
      this.computeWeights();
      for (var k = 0; k < this.n; k++) this.spawn(k, true);
    },
    setGap: function (v) {
      this.gapOpen = v; var self = this; this.snapTemps();
      this.tween({ from: this.gAlpha, to: v ? 1 : 0, dur: 0.6, onUpdate: function (x) { self.gAlpha = x; } });
      this.announce(v ? (this.contain ? 'Blanking panel removed. With containment, cold air just leaks through the gap to the hot side: wasted, but intakes stay cool.' :
        'Blanking panel removed. Hot exhaust curls back through the gap into the cold aisle; the servers above now breathe 30 to 37 degree air.') : 'Blanking panel back in place. Hot and cold air are separated again.');
    },
    setContain: function (v) {
      this.contain = v; var self = this; this.snapTemps();
      this.tween({ from: this.cAlpha, to: v ? 1 : 0, dur: 0.7, onUpdate: function (x) { self.cAlpha = x; } });
      this.announce(v ? 'Containment doors and roof seal the cold aisle. Hot air can no longer curl back in, so intakes drop to about 22 degrees.' : 'Containment removed. Hot air can curl over the racks and through any gap.');
    },
    /** target intake °C for rack r, row i */
    target: function (r, i) {
      var t = 22 + 0.15 * i;
      if (!this.contain) { if (i === N - 1) t += 2.5; else if (i === N - 2) t += 1; }
      if (r === 0 && this.gapOpen && !this.contain && i > GAP) t += RECIRC_ADD[Math.min(RECIRC_ADD.length - 1, i - GAP - 1)];
      if (r === 0 && this.gapOpen && !this.contain && i === GAP - 1) t += 2;
      return t;
    },

    // ---------------------------------------------------------------- geometry
    resize: function (w, h) {
      var m = this.mobile = w < 560;
      var G = this.G = {
        ceil: h * 0.14, ret: h * 0.075, floor: h * (m ? 0.84 : 0.83), plen: h * (m ? 0.93 : 0.92),
        rackTop: h * (m ? 0.24 : 0.23)
      };
      if (m) { G.L = [w * 0.19, w * 0.37]; G.R = [w * 0.63, w * 0.81]; G.hotL = w * 0.09; G.hotR = w * 0.91; }
      else { G.L = [w * 0.26, w * 0.385]; G.R = [w * 0.615, w * 0.74]; G.hotL = w * 0.165; G.hotR = w * 0.835; }
      G.rh = (G.floor - 6 - (G.rackTop + 8)) / N;
      G.cold = [G.L[1], G.R[0]];
      this.buildPaths(w, h);
      // particle pool
      var n = S.q(m ? 420 : 900);
      if (n !== this.n) {
        this.n = n;
        this.pp = new Int16Array(n); this.ps = new Float32Array(n); this.po = new Float32Array(n); this.pv = new Float32Array(n);
        this.pseg = new Int16Array(n); this.px = new Float32Array(n); this.py = new Float32Array(n); this.pdx = new Float32Array(n); this.pdy = new Float32Array(n);
        this.pb = new Uint8Array(n); this.order = new Int16Array(n); this.cnt = new Int32Array(NB + 1);
      }
      for (var i = 0; i < n; i++) this.spawn(i, true);
      this.speed = (m ? 62 : 84) * Math.max(0.7, w / 980);
      this.colors = null;
    },
    rowY: function (i) { var G = this.G; return G.floor - 6 - (i + 0.5) * G.rh; },
    buildPaths: function (w, h) {
      var G = this.G, P = [], self = this, coldW = G.cold[1] - G.cold[0], r = Math.min(26, G.rh * 0.9);
      function add(kind, rack, row, pts, inX, outX, y) {
        var f = rounded(pts, r), L = lensOf(f), path = { kind: kind, rack: rack, row: row, f: f, L: L, total: L[L.length - 1] };
        path.sIn = sAt(f, L, inX, y); path.sOut = sAt(f, L, outX, y);
        path.spread = kind === 'main' ? G.rh * 0.36 : G.rh * 0.3;
        P.push(path);
      }
      var tileY = G.floor, pl = (G.floor + G.plen) / 2, sx = Math.max(0, G.cold[0] - (this.mobile ? 70 : 150));
      var exL = Math.max(0, G.hotL - (this.mobile ? 60 : 130)), exR = Math.min(w, G.hotR + (this.mobile ? 60 : 130));
      for (var i = 0; i < N; i++) {
        var y = self.rowY(i), f = i / (N - 1);
        // rack A (left): front faces right (cold aisle)
        if (i !== GAP) {
          var xr = G.L[1] + coldW * (0.07 + 0.33 * f);
          add('main', 0, i, [[sx, pl], [xr, pl], [xr, tileY], [xr, y], [G.L[1], y], [G.L[0], y], [G.hotL, y], [G.hotL, G.ceil], [G.hotL, G.ret], [exL, G.ret]], G.L[1], G.L[0], y);
        }
        var xr2 = G.R[0] - coldW * (0.07 + 0.33 * f);
        add('main', 1, i, [[sx, pl], [xr2, pl], [xr2, tileY], [xr2, y], [G.R[0], y], [G.R[1], y], [G.hotR, y], [G.hotR, G.ceil], [G.hotR, G.ret], [exR, G.ret]], G.R[0], G.R[1], y);
      }
      // recirculation: hot aisle A → through the gap → up the cold side → into a higher intake
      var yg = this.rowY(GAP);
      for (var j = GAP + 1; j < N; j++) {
        var yj = this.rowY(j), cx = G.L[1] + 10 + (j - GAP) * 4;
        add('recirc', 0, j, [[G.hotL + 10, yg + G.rh * 1.6], [G.L[0] - 8, yg], [G.L[1] + 4, yg], [cx + 10, yg - 4], [cx + 10, yj], [G.L[1], yj], [G.L[0], yj], [G.hotL, yj], [G.hotL, G.ceil], [G.hotL, G.ret], [exL, G.ret]], G.L[1], G.L[0], yj);
      }
      // over-the-top recirculation (no containment)
      var yt = this.rowY(N - 1), top = G.rackTop - 12;
      add('over', 0, N - 1, [[G.hotL + 6, yt + G.rh], [G.hotL + 6, top + 6], [G.L[0], top], [G.L[1] + 6, top], [G.L[1] + 22, yt], [G.L[1], yt], [G.L[0], yt], [G.hotL, yt], [G.hotL, G.ceil], [G.hotL, G.ret], [exL, G.ret]], G.L[1], G.L[0], yt);
      add('over', 1, N - 1, [[G.hotR - 6, yt + G.rh], [G.hotR - 6, top + 6], [G.R[1], top], [G.R[0] - 6, top], [G.R[0] - 22, yt], [G.R[0], yt], [G.R[1], yt], [G.hotR, yt], [G.hotR, G.ceil], [G.hotR, G.ret], [exR, G.ret]], G.R[0], G.R[1], yt);
      // bypass (containment on, gap open): cold air leaks straight through the empty slot
      var xb = G.L[1] + coldW * 0.12;
      add('bypass', 0, GAP, [[sx, pl], [xb, pl], [xb, tileY], [xb, yg], [G.L[1], yg], [G.L[0], yg], [G.hotL, yg], [G.hotL, G.ceil], [G.hotL, G.ret], [exL, G.ret]], G.L[1], G.L[0], yg);
      this.paths = P;
      this.weights = new Float32Array(P.length);
    },
    computeWeights: function () {
      var W = this.weights, sum = 0, recirc = this.gapOpen && !this.contain;
      for (var i = 0; i < this.paths.length; i++) {
        var p = this.paths[i], wgt = 0;
        if (p.kind === 'main') wgt = 1;
        else if (p.kind === 'recirc') wgt = recirc ? 1.5 - (p.row - GAP - 1) * 0.2 : 0;
        else if (p.kind === 'over') wgt = this.contain ? 0 : 0.45;
        else if (p.kind === 'bypass') wgt = this.gapOpen && this.contain ? 1.6 : 0;
        sum += wgt; W[i] = sum;
      }
      this.wSum = sum;
    },
    spawn: function (i, scatter) {
      if (!this.wSum) this.computeWeights();
      var x = this.rng.float() * this.wSum, W = this.weights, k = 0;
      while (k < W.length - 1 && W[k] < x) k++;
      var p = this.paths[k];
      this.pp[i] = k; this.pseg[i] = 0;
      this.ps[i] = scatter ? this.rng.float() * p.total : (p.kind === 'main' || p.kind === 'bypass' ? 0 : this.rng.float() * 20);
      this.po[i] = (this.rng.float() * 2 - 1) * p.spread;
      this.pv[i] = 0.8 + this.rng.float() * 0.45;
    },

    // ---------------------------------------------------------------- simulation
    update: function (dt) {
      this.computeWeights();
      for (var r = 0; r < 2; r++) for (var i = 0; i < N; i++) this.tIn[r][i] = U.damp(this.tIn[r][i], this.target(r, i), 0.9, dt);
      var n = this.n, sp = this.speed * dt;
      for (var k = 0; k < n; k++) {
        var p = this.paths[this.pp[k]];
        this.ps[k] += sp * this.pv[k] * (this.ps[k] > p.sIn && this.ps[k] < p.sOut ? 1.5 : 1);
        if (this.ps[k] >= p.total) this.spawn(k, false);
      }
    },
    /** temperature of particle k */
    tempOf: function (p, s) {
      var tin = p.kind === 'bypass' ? SUPPLY : this.tIn[p.rack][p.row];
      if (s < p.sIn) {
        var start = p.kind === 'main' || p.kind === 'bypass' ? SUPPLY : 38;
        var a = p.sIn - (p.kind === 'main' ? 36 : p.sIn * 0.7);
        return s < a ? start : U.lerp(start, tin, (s - a) / (p.sIn - a));
      }
      var tout = p.kind === 'bypass' ? SUPPLY + 3 : tin + DT;
      if (s < p.sOut) return U.lerp(tin, tout, (s - p.sIn) / Math.max(1, p.sOut - p.sIn));
      return tout - Math.min(4, (s - p.sOut) * 0.01);
    },
    buildColors: function () {
      var P = S.pal, c = [];
      for (var b = 0; b < NB; b++) {
        var k = b / (NB - 1);
        c.push(k < 0.6 ? U.mix(P.air, P.heat, k / 0.6) : U.mix(P.heat, P.power, (k - 0.6) / 0.4));
      }
      this.colors = c;
    },
    onTheme: function () { this.colors = null; },

    // ---------------------------------------------------------------- drawing
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, G = this.G, t = this.time, m = this.mobile;
      if (!this.colors) this.buildColors();
      D.clear(ctx, w, h);
      this.hits.clear();
      // --- room shell
      ctx.fillStyle = U.rgba(P.air, P.dark ? 0.05 : 0.08); ctx.fillRect(G.cold[0], G.rackTop - 14, G.cold[1] - G.cold[0], G.floor - G.rackTop + 14);
      ctx.fillStyle = U.rgba(P.heat, P.dark ? 0.045 : 0.05); ctx.fillRect(0, G.ceil, G.L[0], G.floor - G.ceil); ctx.fillRect(G.R[1], G.ceil, w - G.R[1], G.floor - G.ceil);
      // plenums
      ctx.fillStyle = U.rgba(P.panel3, 0.45); ctx.fillRect(0, G.floor, w, G.plen - G.floor); ctx.fillRect(0, G.ret - (G.ceil - G.ret), w, (G.ceil - G.ret) * 2);
      D.line(ctx, 0, G.floor, w, G.floor, U.rgba(P.blueprint, 0.6), 1.5);
      D.line(ctx, 0, G.plen, w, G.plen, U.rgba(P.blueprint, 0.35), 1);
      D.line(ctx, 0, G.ceil, w, G.ceil, U.rgba(P.blueprint, 0.6), 1.5);
      // perforated tiles in the cold aisle
      var tx0 = G.cold[0] + 4, tx1 = G.cold[1] - 4;
      ctx.fillStyle = U.rgba(P.air, 0.85);
      for (var x = tx0; x < tx1; x += 5) ctx.fillRect(x, G.floor - 1.5, 2.2, 3);
      // ceiling grilles above hot aisles
      ctx.fillStyle = U.rgba(P.heat, 0.7);
      for (x = 6; x < G.L[0] - 6; x += 5) ctx.fillRect(x, G.ceil - 1.5, 2.2, 3);
      for (x = G.R[1] + 6; x < w - 6; x += 5) ctx.fillRect(x, G.ceil - 1.5, 2.2, 3);

      this.drawRack(ctx, P, 0, t, 0);
      this.drawRack(ctx, P, 1, t, 0);
      this.drawParticles(ctx, P);
      this.drawRack(ctx, P, 0, t, 1);
      this.drawRack(ctx, P, 1, t, 1);
      this.drawContainment(ctx, P);

      // --- labels
      var fs = m ? 9 : 10.5, cy = G.rackTop - (m ? 36 : 42);
      D.text(ctx, 'COLD AISLE', (G.cold[0] + G.cold[1]) / 2, cy, { size: fs + 1, weight: 800, color: P.air, align: 'center', ls: 1.5 });
      D.text(ctx, 'HOT', G.L[0] / 2, cy, { size: fs + 1, weight: 800, color: P.heat, align: 'center', ls: 1.5 });
      D.text(ctx, 'HOT', (G.R[1] + w) / 2, cy, { size: fs + 1, weight: 800, color: P.heat, align: 'center', ls: 1.5 });
      if (!m) { D.text(ctx, 'AISLE', G.L[0] / 2, cy + 14, { size: fs, weight: 700, color: P.heat, align: 'center', ls: 1.5 }); D.text(ctx, 'AISLE', (G.R[1] + w) / 2, cy + 14, { size: fs, weight: 700, color: P.heat, align: 'center', ls: 1.5 }); }
      D.text(ctx, m ? 'FLOOR · 18 °C supply' : 'RAISED FLOOR PLENUM · 18 °C SUPPLY FROM CRAC →', 8, (G.floor + G.plen) / 2 + (m ? 10 : 12), { size: m ? 8 : 9, weight: 600, color: P.text3 });
      D.text(ctx, m ? 'HOT RETURN ↑' : 'HOT RETURN · ceiling plenum → back to the cooling unit (CRAC)', 8, G.ret - (m ? 9 : 12), { size: m ? 8 : 9, weight: 600, color: P.text3 });
      if (!m) D.text(ctx, 'perforated tiles', (G.cold[0] + G.cold[1]) / 2, G.floor + 10, { size: 9, color: P.text3, align: 'center' });
      D.text(ctx, 'RACK A', (G.L[0] + G.L[1]) / 2, G.floor + (m ? 9 : 10), { size: m ? 8 : 9, weight: 700, color: P.text2, align: 'center' });
      D.text(ctx, 'RACK B', (G.R[0] + G.R[1]) / 2, G.floor + (m ? 9 : 10), { size: m ? 8 : 9, weight: 700, color: P.text2, align: 'center' });
      // front/rear tags
      if (!m) {
        D.text(ctx, 'rear ◂', G.L[0] - 4, G.rackTop - 6, { size: 9, color: P.text3, align: 'right' });
        D.text(ctx, '▸ front', G.L[1] + 4, G.rackTop - 6, { size: 9, color: P.text3 });
        D.text(ctx, 'front ◂', G.R[0] - 4, G.rackTop - 6, { size: 9, color: P.text3, align: 'right' });
        D.text(ctx, '▸ rear', G.R[1] + 4, G.rackTop - 6, { size: 9, color: P.text3 });
      }
      // status pill
      var hot = 0, hr = 0, hi = 0;
      for (var r = 0; r < 2; r++) for (var i = 0; i < N; i++) if (!(r === 0 && i === GAP) && this.tIn[r][i] > hot) { hot = this.tIn[r][i]; hr = r; hi = i; }
      var cls = hot > 32 ? 'bad' : hot > 27 ? 'warn' : 'ok';
      this.rHot.set(hot.toFixed(1) + ' °C ' + (cls === 'ok' ? '✓' : '⚠') + ' (' + (hr ? 'B' : 'A') + hi + ')', cls);
      var col = cls === 'bad' ? P.fault : cls === 'warn' ? P.warn : P.ok;
      var msg = this.gapOpen && !this.contain ? '⚠ RECIRCULATION · hot air back in the cold aisle'
        : this.gapOpen && this.contain ? '✓ intakes cool · gap only leaks cold air (bypass)'
        : this.contain ? '✓ sealed cold aisle · every intake ≈ 22 °C' : (hot > 27 ? '⚠ top servers breathe warm air' : '✓ intakes ≤ 27 °C (recommended)');
      D.pill(ctx, m ? msg.replace(' · hot air back in the cold aisle', '').replace(' · gap only leaks cold air (bypass)', ' · bypass').replace(' · every intake ≈ 22 °C', '') : msg, w / 2, h - (m ? 12 : 14), { size: m ? 9 : 10.5, align: 'center', color: col });
      if (!m) D.text(ctx, 'intake °C · ≤ 27 recommended', w - 10, h - 14, { size: 9, color: P.text3, align: 'right' });
      this.setDesc(this.gapOpen && !this.contain ? 'A blanking panel is missing in rack A: hot exhaust flows back through the gap and the servers above breathe air up to ' + Math.round(hot) + ' °C.' :
        this.contain ? 'The cold aisle is sealed with containment doors; every server breathes air around 22 °C.' : 'Cold air rises from the floor tiles, passes front-to-back through both racks and leaves hot into the hot aisles.');
    },

    drawParticles: function (ctx, P) {
      var n = this.n, cnt = this.cnt, ord = this.order, k, i;
      cnt.fill(0);
      for (k = 0; k < n; k++) {
        var p = this.paths[this.pp[k]], s = this.ps[k], f = p.f, L = p.L, seg = this.pseg[k];
        if (seg >= L.length - 1 || L[seg] > s) seg = 0;
        while (seg < L.length - 2 && L[seg + 1] < s) seg++;
        this.pseg[k] = seg;
        var sl = L[seg + 1] - L[seg] || 1, tt = U.clamp((s - L[seg]) / sl, 0, 1);
        var dx = (f[seg * 2 + 2] - f[seg * 2]) / sl, dy = (f[seg * 2 + 3] - f[seg * 2 + 1]) / sl;
        this.px[k] = f[seg * 2] + (f[seg * 2 + 2] - f[seg * 2]) * tt - dy * this.po[k];
        this.py[k] = f[seg * 2 + 1] + (f[seg * 2 + 3] - f[seg * 2 + 1]) * tt + dx * this.po[k];
        this.pdx[k] = dx; this.pdy[k] = dy;
        var T = this.tempOf(p, s), b = Math.round(U.clamp((T - SUPPLY) / 24, 0, 1) * (NB - 1));
        this.pb[k] = b; cnt[b + 1]++;
      }
      for (i = 1; i <= NB; i++) cnt[i] += cnt[i - 1];
      for (k = 0; k < n; k++) ord[cnt[this.pb[k]]++] = k;
      // after the scatter, cnt[b] holds end index of bucket b; bucket b starts at previous end
      ctx.lineWidth = this.mobile ? 1.3 : 1.5; ctx.lineCap = 'round';
      var start = 0, len = this.mobile ? 5 : 7;
      for (var b2 = 0; b2 < NB; b2++) {
        var end = cnt[b2];
        if (end > start) {
          ctx.beginPath();
          for (i = start; i < end; i++) { k = ord[i]; ctx.moveTo(this.px[k], this.py[k]); ctx.lineTo(this.px[k] - this.pdx[k] * len, this.py[k] - this.pdy[k] * len); }
          ctx.strokeStyle = this.colors[b2]; ctx.globalAlpha = 0.85; ctx.stroke();
        }
        start = end;
      }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    },

    drawRack: function (ctx, P, r, t, pass) {
      var G = this.G, X = r ? G.R : G.L, x0 = X[0], x1 = X[1], rw = x1 - x0, m = this.mobile;
      var front = r ? x0 : x1, dir = r ? -1 : 1;
      if (pass === 0) {
        // frame + server bodies (particles stream over them so the heating is visible)
        D.box(ctx, x0 - 3, G.rackTop, rw + 6, G.floor - G.rackTop, 3, null, U.rgba(P.alu, 0.55), 1.5);
        ctx.fillStyle = U.rgba(P.steel, 0.5); ctx.fillRect(x0 - 3, G.rackTop, rw + 6, 5);
        for (var q = 0; q < N; q++) {
          if (r === 0 && q === GAP) continue;
          var yq = this.rowY(q), shq = G.rh - 3;
          D.box(ctx, x0, yq - shq / 2, rw, shq, 2, U.rgba(U.shade(P.steel, P.dark ? -0.15 : 0.1), 0.92), U.rgba(P.alu, 0.35), 1);
          ctx.strokeStyle = U.rgba(P.silicon, 0.5); ctx.lineWidth = 1;
          for (var f = 0; f < 3; f++) { var fx = (r ? x1 - 5 : x0 + 5), fy = yq - shq / 2 + shq * (0.22 + f * 0.28); ctx.beginPath(); ctx.arc(fx, fy, Math.min(3.2, shq * 0.13), 0, U.TAU); ctx.stroke(); }
        }
        return;
      }
      for (var i = 0; i < N; i++) {
        var y = this.rowY(i), sh = G.rh - 3, top = y - sh / 2;
        if (r === 0 && i === GAP) {
          // blanking panel / gap
          var ga = this.gAlpha;
          ctx.fillStyle = U.rgba(P.bg0, 0.75 * ga); ctx.fillRect(x0, top, rw, sh);
          ctx.setLineDash([3, 3]); ctx.strokeStyle = U.rgba(P.fault, 0.8 * ga); ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, top + 0.5, rw - 1, sh - 1); ctx.setLineDash([]);
          if (ga < 1) {
            // panel slides out toward the viewer: drawn sliding up and fading
            ctx.globalAlpha = 1 - ga;
            D.box(ctx, x0 - 2, top - ga * sh * 0.8, rw + 4, sh, 2, U.shade(P.plastic, P.dark ? 0.08 : 0.25), U.rgba(P.alu, 0.5), 1);
            D.text(ctx, 'BLANK', x0 + rw / 2, top + sh / 2 - ga * sh * 0.8, { size: m ? 7.5 : 8.5, weight: 700, color: P.text3, align: 'center', ls: 1 });
            ctx.globalAlpha = 1;
          }
          if (ga > 0.5) D.text(ctx, 'GAP', x0 + rw / 2, y, { size: m ? 8 : 9, weight: 800, color: P.fault, align: 'center', alpha: ga });
          this.hits.rect('blank', x0 - 4, top - 2, rw + 8, sh + 4, this.gapOpen ? 'Empty slot — click to put the blanking panel back' : 'Blanking panel — click to remove it');
          continue;
        }
        var T = this.tIn[r][i];
        // front bezel (drive bays)
        var bz = Math.min(8, rw * 0.12);
        ctx.fillStyle = U.shade(P.plastic, P.dark ? 0 : 0.2); ctx.fillRect(r ? x0 : x1 - bz, top + 1, bz, sh - 2);
        D.led(ctx, r ? x0 + bz / 2 : x1 - bz / 2, top + sh * 0.3, T > 32 ? P.fault : P.ok, T > 32 ? 'blink' : 'activity', t + i * 0.7 + r, 1.4);
        // intake temperature readout in the cold aisle
        var col = T > 32 ? P.fault : T > 27 ? P.warn : P.ok;
        var tx = front + dir * (m ? 4 : 6), txt = (m ? Math.round(T) : T.toFixed(1)) + '°';
        var tw0 = D.measure(ctx, txt, m ? 8.5 : 10, 700) + (T > 27 ? (m ? 13 : 16) : 0);
        D.box(ctx, r ? tx - tw0 - 3 : tx - 3, y - 7, tw0 + 6, 14, 3, U.rgba(P.bg, 0.72));
        D.text(ctx, txt, tx, y, { size: m ? 8.5 : 10, weight: 700, color: col, align: r ? 'right' : 'left' });
        if (T > 27) { var tw = D.measure(ctx, txt, m ? 8.5 : 10, 700); D.g.warn(ctx, tx + dir * (tw + 8), y, m ? 9 : 11, col); }
      }
    },

    drawContainment: function (ctx, P) {
      var a = this.cAlpha, G = this.G;
      if (a < 0.01) return;
      var y = G.rackTop - 6, x0 = G.cold[0] - 3, x1 = G.cold[1] + 3;
      ctx.globalAlpha = a;
      D.box(ctx, x0, y - 6, x1 - x0, 7, 2, U.rgba(P.air, 0.25), U.rgba(P.air, 0.9), 1.2);
      ctx.fillStyle = D.hatch(ctx, U.rgba(P.air, 0.6), 5); ctx.fillRect(x0, y - 6, x1 - x0, 7);
      // door frames at the aisle ends (drawn as thin dashed outline of the sealed volume)
      ctx.setLineDash([5, 4]); ctx.strokeStyle = U.rgba(P.air, 0.7); ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 6, y + 2, x1 - x0 - 12, G.floor - y - 4); ctx.setLineDash([]);
      D.pill(ctx, this.mobile ? 'CONTAINED' : 'CONTAINMENT · doors + roof', (x0 + x1) / 2, y - 16, { size: this.mobile ? 8 : 9, align: 'center', color: P.air });
      ctx.globalAlpha = 1;
    }
  });
})(window.SRV);
