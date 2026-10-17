/* Ch2 · Workload heat map. An isometric 2U server (lid off); pick a job and each part group tints and
   glows by how hard that job stresses it. The hungriest part gets a "BOTTLENECK" leader label. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso, M = S.models;

  var KEYS = ['cpu', 'ram', 'drives', 'nic', 'gpu', 'psu', 'fans'];
  // tie-break priority for the bottleneck (the thing you would actually buy for)
  var PRIORITY = ['gpu', 'drives', 'ram', 'cpu', 'nic', 'psu', 'fans'];
  var NAMES = { cpu: 'CPU', ram: 'Memory', drives: 'Drives', nic: 'Network', gpu: 'GPU', psu: 'Power', fans: 'Cooling' };
  // 3D anchor (mm) for each group: where glows, tags and the leader attach
  var ANCHOR = {
    cpu: [171, 245, 70], ram: [84, 300, 40], drives: [220, 640, 62], nic: [66, 90, 58],
    gpu: [282, 100, 84], psu: [390, 120, 88], fans: [220, 423, 80]
  };
  var ORDER = [['nas', 'NAS'], ['web', 'Web'], ['db', 'Database'], ['vm', 'VMs'], ['game', 'Game'], ['media', 'Media'], ['ai', 'AI']];

  /** cool → warm → hot ramp built only from palette signals */
  function stressCol(s) {
    var P = S.pal;
    if (s < 0.4) return U.mix(P.blueprint, P.warn, s / 0.4);
    if (s < 0.75) return U.mix(P.warn, P.heat, (s - 0.4) / 0.35);
    return U.mix(P.heat, P.fault, Math.min(1, (s - 0.75) / 0.25));
  }

  S.defineVisual('workload', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.parts = M.server({ lid: false, gpu: true, drives: 12, dimms: 12, cut: true, shroud: false });
      var W = S.data.workloads, b = S.build.get();
      this.key = W[b.workload] ? b.workload : 'vm';
      this.cur = {}; this.from = {};
      var st = W[this.key].stress, self = this;
      KEYS.forEach(function (k) { self.cur[k] = st[k]; });
      this.labelA = 1; this.k = 0;
      this.hover = null;
      this.seg = this.ui.seg({
        label: 'Workload', options: ORDER, value: this.key,
        onChange: function (v) { self.pick(v, true); }
      });
      this.ui.spacer();
      this.rNeck = this.ui.readout('Bottleneck', NAMES[this.neck(st)], 'bad');
      this.pointer({
        hover: function (p) {
          var h = this.hits.query(p.x, p.y), g = h && h.data && h.data.group;
          var key = g && KEYS.indexOf(g) >= 0 ? g : null;
          if (key !== this.hover) { this.hover = key; this.invalidate(); }
          if (key) this.tipAt('<b>' + NAMES[key] + '</b>' + W[this.key].label + ': ' + Math.round(this.cur[key] * 100) + '% stressed', p.x, p.y);
          else this.tipAt(null);
        },
        leave: function () { this.hover = null; },
        down: function (p) {
          // tap on touch: show the same tip
          var h = this.hits.query(p.x, p.y), g = h && h.data && h.data.group;
          if (g && KEYS.indexOf(g) >= 0) this.tipAt('<b>' + NAMES[g] + '</b>' + Math.round(this.cur[g] * 100) + '% stressed', p.x, p.y);
          return false;
        }
      });
      this.unsub = S.build.subscribe('workload', function (wk) { if (wk && wk !== self.key && W[wk]) { self.seg.set(wk, false); self.pick(wk, false); } });
    },
    neck: function (st) {
      var best = null;
      PRIORITY.forEach(function (k) { if (best === null || st[k] > st[best] + 1e-6) best = k; });
      return best;
    },
    pick: function (key, user) {
      if (key === this.key) return;
      var W = S.data.workloads, self = this;
      KEYS.forEach(function (k) { self.from[k] = self.cur[k]; });
      this.key = key;
      if (user) S.build.set({ workload: key });
      var target = W[key].stress;
      if (this.tw) this.tw.cancel();
      this.tw = this.tween({
        from: 0, to: 1, dur: 0.9, ease: 'inOutSine',
        onUpdate: function (v) { KEYS.forEach(function (k) { self.cur[k] = U.lerp(self.from[k], target[k], v); }); }
      });
      if (this.lw) this.lw.cancel();
      this.labelA = 0;
      this.lw = this.tween({ from: 0, to: 1, dur: 0.5, delay: 0.55, ease: 'outCubic', onUpdate: function (v) { self.labelA = v; } });
      var n = this.neck(target);
      this.rNeck.set(NAMES[n], 'bad');
      if (user) this.announce(W[key].label + ': the bottleneck is the ' + NAMES[n].toLowerCase() + '. Needs ' + W[key].note.toLowerCase() + '.');
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      var V = this.V = I.view();
      var bb = { x0: -20, y0: 0, z0: 0, x1: M.W + 20, y1: M.D, z1: 100 };
      if (this.mobile) {
        var listH = 7 * 22 + 30;
        this.srvR = { x: 0, y: 64, w: w, h: Math.max(140, h - listH - 64) };
        this.listR = { x: 16, y: h - listH + 6, w: w - 32, h: listH - 12 };
      } else {
        var lw = Math.min(300, Math.max(230, w * 0.3));
        this.srvR = { x: 0, y: 70, w: w - lw - 24, h: h - 84 };
        this.listR = { x: w - lw - 20, y: Math.max(24, h / 2 - 7 * 15 - 30), w: lw, h: 7 * 30 + 40 };
      }
      V.fit(bb, this.srvR.w, this.srvR.h, this.mobile ? 12 : 22);
      V.ox += this.srvR.x; V.oy += this.srvR.y;
      this.s = V.k / 0.55;
    },
    update: function (dt) {
      var f = this.cur.fans || 0;
      this.fanA = (this.fanA || 0) + dt * (3 + 28 * f);
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, V = this.V, self = this, t = this.time;
      var W = S.data.workloads[this.key], cur = this.cur, neck = this.neck(W.stress);
      D.clear(ctx, w, h);
      this.hits.clear();

      // ground: floor grid + shadow
      I.floorGrid(ctx, V, -60, -40, M.W + 60, M.D + 60, 40, P.grid, 0.8);
      I.shadow(ctx, V, { x: -16, y: 0, z: 0, w: M.W + 32, d: M.D, h: 0 }, 0.3, 0, 14);

      // shared model globals (save + restore so other visuals are unaffected)
      var saved = { a: M.fanAngle, b: M.fanBlur, t: M.t, df: M.dataFlow, ds: M.driveState, fd: M.fanDead };
      M.fanAngle = this.fanA || 0; M.fanBlur = cur.fans > 0.7 ? 0.8 : 0; M.t = t;
      M.dataFlow = (cur.cpu + cur.ram) / 2 > 0.6; M.driveState = null; M.fanDead = null;
      var pulse = 0.5 + 0.5 * Math.sin(t * 4);
      M.draw(ctx, V, this.parts, {
        hits: this.hits,
        state: function (p) {
          var g = p.group, s = cur[g];
          if (s == null) {
            if (g === 'drives') s = cur.drives; else return { inkT: 1 };
          }
          if (g === 'gpu' && s < 0.12) return { state: 'blueprint', inkT: s / 0.12 * 0.8 };
          var base = I.col(p.color), k = U.smoothstep(0.2, 1, s) * 0.72;
          var o = { color: U.mix(base, stressCol(s), k) };
          if (g === neck && self.labelA > 0.05) o.highlight = U.rgba(stressCol(1), (0.45 + 0.45 * pulse) * self.labelA);
          else if (self.hover === g) o.highlight = P.accent;
          return o;
        }
      });
      M.fanAngle = saved.a; M.fanBlur = saved.b; M.t = saved.t; M.dataFlow = saved.df; M.driveState = saved.ds; M.fanDead = saved.fd;

      // glows + shimmer + tags
      var q = [0, 0], anch = {};
      KEYS.forEach(function (k) {
        var a = ANCHOR[k]; V.p(a[0], a[1], a[2], q);
        anch[k] = [q[0], q[1]];
        var s = cur[k]; if (s < 0.05) return;
        var col = stressCol(s);
        D.glow(ctx, q[0], q[1], (26 + 60 * s) * self.s, col, (P.dark ? 0.55 : 0.32) * s * s * (0.85 + 0.15 * Math.sin(t * 3 + a[0])));
        if (s > 0.6 && !self.mobile) {
          for (var i = 0; i < 3; i++) D.shimmer(ctx, q[0] - 10 + i * 10, q[1] - 6, 22 + 26 * s, t + i * 0.7, col, 0.35 + 0.4 * (s - 0.6));
        }
      });
      if (!this.mobile) {
        KEYS.forEach(function (k) {
          var s = cur[k]; if (s <= 0.62 || k === neck) return;
          var a = anch[k];
          D.pill(ctx, NAMES[k].toUpperCase() + ' ' + Math.round(s * 100) + '%', a[0] - (k === 'ram' ? 30 : 0), a[1] + (k === 'ram' ? 26 : -30), { size: 9, align: 'center', color: stressCol(s), alpha: 1 });
        });
      }

      // bottleneck leader
      var la = this.labelA;
      if (la > 0.01) {
        var a = anch[neck], R = this.srvR;
        var right = a[0] < R.x + R.w * 0.55;
        var lx = right ? Math.min(a[0] + 70, R.x + R.w - 170) : Math.max(a[0] - 70, R.x + 170);
        var ly = this.mobile ? 22 : R.y - 22;
        if (this.mobile) lx = right ? Math.max(16, Math.min(lx, w - 190)) : Math.min(w - 16, Math.max(lx, 190));
        var col = stressCol(1);
        ctx.globalAlpha = la;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]);
        var ex = a[0] + (lx > a[0] ? 1 : -1) * Math.min(Math.abs(lx - a[0]), Math.abs(ly - a[1]) * 0.6);
        ctx.lineTo(ex, ly); ctx.lineTo(lx, ly);
        ctx.strokeStyle = col; ctx.lineWidth = 1.25; ctx.stroke();
        D.circle(ctx, a[0], a[1], 3.5, col);
        D.circle(ctx, a[0], a[1], 7 + 4 * pulse, null, U.rgba(col, 0.5), 1);
        ctx.globalAlpha = 1;
        var title = '⚠ BOTTLENECK: ' + NAMES[neck].toUpperCase();
        var pl = D.pill(ctx, title, lx, ly, { size: this.mobile ? 10 : 11, align: right ? 'left' : 'right', color: col, weight: 700, r: 4, bg: U.rgba(P.panel, 0.95) });
        D.text(ctx, 'Needs: ' + W.note, right ? pl.x + 2 : pl.x + pl.w - 2, ly + pl.h / 2 + 10, { size: this.mobile ? 10 : 11, color: P.text2, align: right ? 'left' : 'right', alpha: la, sans: true });
        ctx.globalAlpha = 1;
      }

      // title block
      if (!this.mobile) {
        D.text(ctx, 'JOB', 18, 22, { size: 9, weight: 700, color: P.text3, ls: 1.5 });
        D.text(ctx, W.label, 18, 38, { size: 14, weight: 700, color: P.text1, sans: true });
      }

      // stress list
      var L = this.listR, rows = KEYS.slice().sort(function (x, y) { return W.stress[y] - W.stress[x]; });
      var rowH = this.mobile ? 22 : 30, nameW = this.mobile ? 70 : 80, barW = L.w - nameW - 44;
      if (!this.mobile) {
        D.box(ctx, L.x - 14, L.y - 30, L.w + 28, rowH * 7 + 48, 10, U.rgba(P.panel, 0.7), U.rgba(P.blueprint, 0.25), 1);
        D.text(ctx, 'STRESS BY PART', L.x, L.y - 12, { size: 9, weight: 700, color: P.text3, ls: 1.5 });
      } else {
        D.text(ctx, 'STRESS BY PART · ' + W.label.toUpperCase(), L.x, L.y - 10, { size: 9, weight: 700, color: P.text3, ls: 1, maxW: L.w });
      }
      rows.forEach(function (k, i) {
        var y = L.y + i * rowH + rowH / 2, s = cur[k], col = stressCol(s), isNeck = k === neck;
        if (isNeck) D.box(ctx, L.x - 6, y - rowH / 2 + 2, L.w + 12, rowH - 4, 6, U.rgba(col, 0.12 * la), U.rgba(col, 0.6 * la), 1);
        D.text(ctx, (isNeck ? '⚠ ' : '') + NAMES[k], L.x, y, { size: self.mobile ? 10 : 11, weight: isNeck ? 700 : 500, color: isNeck ? P.text1 : (self.hover === k ? P.accent : P.text2) });
        D.meter(ctx, L.x + nameW, y - 3, barW, 6, s, col);
        // tick marks at 25/50/75%
        ctx.fillStyle = U.rgba(P.text3, 0.5);
        for (var tk = 1; tk < 4; tk++) ctx.fillRect(L.x + nameW + barW * tk / 4, y - 5, 1, 2);
        D.text(ctx, Math.round(s * 100) + '%', L.x + L.w, y, { size: self.mobile ? 10 : 11, weight: 700, color: s > 0.6 ? col : P.text3, align: 'right' });
      });

      this.setDesc(W.label + ': most stressed part is the ' + NAMES[neck].toLowerCase() + ' (' + Math.round(W.stress[neck] * 100) + '%). It needs ' + W.note.toLowerCase() + '.');
    },
    onTheme: function () { this.invalidate(); }
  });
})(window.SRV);
