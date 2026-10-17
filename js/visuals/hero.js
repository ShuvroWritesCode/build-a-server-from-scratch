/* Hero · "The Dive". A dark isometric datacenter boots in a ripple of LEDs. Scrolling dollies the camera
   into one rack, slides a server out on its rails, lifts the lid and explodes the parts into a blueprint. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso, M = S.models;

  var RACK = { w: 600, d: 1100, h: 2000 }, ROWS = 4, COLS = 7, AISLE = 1500, U1 = 44.45;
  var TARGET = { row: ROWS - 1, col: 3, u: 18 }, SLIDE = 380;

  S.defineVisual('hero', {
    continuous: true,
    maxDpr: 2,
    init: function () {
      this.ctx = this.layer();
      this.p = 0; this.yaw = 0; this.yawT = 0;
      this.copy = document.getElementById('hero-copy');
      this.caption = document.getElementById('hero-caption');
      this.scrollHint = document.querySelector('.hero-scroll');
      this.racks = [];
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var rack = { r: r, c: c, x: c * (RACK.w + 20), y: r * (RACK.d + AISLE), slots: [] };
        // fill rack with a seeded mix of 1U/2U servers
        var rr = this.rng.fork('rack' + r + '-' + c), u = 2;
        while (u < 42) {
          var size = rr.chance(0.35) ? 2 : 1;
          if (rr.chance(0.12)) { u += 1; continue; }
          if (r === TARGET.row && c === TARGET.col && u <= TARGET.u + 1 && u + size > TARGET.u) { u = TARGET.u + 2; continue; }
          rack.slots.push({ u: u, size: size, seed: rr.float(), name: (rr.pick(['web', 'db', 'vm', 'nas', 'app', 'k8s'])) + '-' + String(rr.int(1, 40)).padStart(2, '0') });
          u += size;
        }
        if (r === TARGET.row && c === TARGET.col) rack.slots.push({ u: TARGET.u, size: 2, target: true, name: 'yours-01', seed: 0.5 });
        this.racks.push(rack);
      }
      var tr = this.racks[TARGET.row * COLS + TARGET.col];
      this.target = tr;
      this.srvOrigin = { x: tr.x + (RACK.w - M.W) / 2, y: tr.y + RACK.d - M.D, z: 60 + TARGET.u * U1 };
      this.parts = M.server({ drives: 12, dimms: 12, lid: true, shroud: false, cut: false, gpu: false });
      this.V = I.view();
      var self = this;
      this.pointer({
        hover: function (p) {
          if (!self.reduced()) self.yawT = ((p.x / self.w) - 0.5) * 0.12;
          var it = self.hits.query(p.x, p.y);
          if (it && self.p < 0.3) {
            var d = it.data;
            self.tipAt('<b>R' + (d.r + 1) + '-C' + (d.c + 1) + '</b>' + d.n + ' servers · ' + Math.round(22 + d.r * 1.5 + d.c * 0.7) + '°C intake', p.x, p.y);
          } else self.tipAt(null);
        },
        leave: function () { self.yawT = 0; }
      });
    },
    resize: function (w, h) {
      this.mobile = w < 640;
      var bb = { x0: 0, y0: 0, z0: 0, x1: COLS * (RACK.w + 20), y1: ROWS * (RACK.d + AISLE), z1: RACK.h };
      var V = I.view(); V.fit(bb, w, h * (this.mobile ? 0.75 : 0.85), 10);
      this.kFar = V.k * (this.mobile ? 1.05 : 0.95);
      var o = this.srvOrigin;
      var sb = { x0: o.x - 30, y0: o.y + 120, z0: o.z, x1: o.x + M.W + 30, y1: o.y + M.D + SLIDE + 260, z1: o.z + 300 };
      var V2 = I.view(); V2.fit(sb, w * (this.mobile ? 0.98 : 0.72), h * (this.mobile ? 0.6 : 0.7), 10);
      this.kNear = V2.k;
    },
    onProgress: function (p) {
      this.p = p;
      if (this.copy) this.copy.style.opacity = String(U.clamp(1 - p * 7, 0, 1));
      if (this.scrollHint) this.scrollHint.style.opacity = String(U.clamp(1 - p * 10, 0, 1));
      if (this.caption) this.caption.style.opacity = String(U.segment(p, 0.8, 0.88) * (1 - U.segment(p, 0.97, 1)));
      if (p > 0.85) this.announce('A server opened into its parts: chassis, motherboard, CPU, memory, drives, power supplies, fans and cards. This is what you will build.');
    },
    update: function (dt) {
      this.yaw = U.damp(this.yaw, this.yawT, 4, dt);
    },
    camera: function () {
      var p = this.p, V = this.V, w = this.w, h = this.h, o = this.srvOrigin;
      var e = U.ease.inOutCubic(U.segment(p, 0, 0.4));
      var k = Math.exp(U.lerp(Math.log(this.kFar), Math.log(this.kNear), e));
      var far = { x: COLS * (RACK.w + 20) / 2, y: ROWS * (RACK.d + AISLE) / 2, z: 300 };
      var lift = U.ease.inOutSine(U.segment(p, 0.55, 0.92));
      var slideE = U.ease.inOutCubic(U.segment(p, 0.38, 0.55));
      var near = { x: o.x + M.W / 2, y: o.y + M.D / 2 + SLIDE * slideE + 60 * lift, z: o.z + 40 + 130 * lift };
      var f = { x: U.lerp(far.x, near.x, e), y: U.lerp(far.y, near.y, e), z: U.lerp(far.z, near.z, e) };
      V.k = k; V.ox = 0; V.oy = 0; V.yaw = this.yaw; V.cx = f.x; V.cy = f.y;
      var s = V.p(f.x, f.y, f.z);
      V.ox = w / 2 - s[0];
      V.oy = h * (this.mobile ? 0.58 : 0.56) - s[1];
      return V;
    },
    rackDecal: function (rack, alpha) {
      var self = this, t = this.time, P = S.pal;
      return function (ctx, w, h) {
        var px = I.px, zoomed = px < 1.2;
        ctx.fillStyle = U.shade(P.steel, -0.55); ctx.fillRect(18, 30, w - 36, h - 60);
        // boot ripple: LEDs come alive in a wave from the far corner
        var wave = self.reduced() ? 1e9 : t * 9 - (rack.r * 2 + rack.c * 0.8);
        for (var i = 0; i < rack.slots.length; i++) {
          var s = rack.slots[i];
          if (s.target && self.p > 0.38) {
            ctx.fillStyle = '#000'; ctx.fillRect(80, h - 60 - (s.u + s.size) * U1, w - 160, s.size * U1); continue;
          }
          var y = h - 60 - (s.u + s.size) * U1;
          ctx.fillStyle = s.target ? U.shade(P.steel, 0.05) : U.shade(P.steel, -0.2 + s.seed * 0.15);
          ctx.fillRect(70, y + 2, w - 140, s.size * U1 - 4);
          if (zoomed) { ctx.fillStyle = U.rgba('#000', 0.35); for (var b = 0; b < 4; b++) ctx.fillRect(90 + b * 70, y + 8, 56, s.size * U1 - 16); }
          var on = wave > i * 0.12 + s.seed;
          var col = s.target && self.p > 0.25 ? P.mgmt : (s.seed > 0.93 ? P.warn : P.ok);
          var act = on ? (U.noise1(t * 6 + s.seed * 40) > 0.4 ? 1 : 0.35) : 0.08;
          ctx.globalAlpha = alpha * act;
          ctx.fillStyle = col; ctx.fillRect(w - 110, y + s.size * U1 / 2 - 5, 10, 10);
          ctx.fillStyle = P.data; ctx.fillRect(w - 92, y + s.size * U1 / 2 - 5, 10, 10);
          ctx.globalAlpha = alpha;
          if (on && act > 0.9 && (zoomed || s.seed > 0.6)) D.glow(ctx, w - 105, y + s.size * U1 / 2, zoomed ? 30 : 60, col, 0.6);
        }
        // rack label plate
        ctx.fillStyle = U.rgba(P.blueprint, 0.5); ctx.fillRect(18, 4, 120, 20);
      };
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, p = this.p, self = this;
      D.clear(ctx, w, h);
      // vignette backdrop
      var g = ctx.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.75);
      g.addColorStop(0, U.rgba(P.panel, 0.9)); g.addColorStop(1, U.rgba(P.bg0, 1));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      var V = this.camera();
      this.hits.clear();
      var rackFade = 1 - U.segment(p, 0.5, 0.62);
      var floorX = COLS * (RACK.w + 20), floorY = ROWS * (RACK.d + AISLE);

      // floor: aisle tint + dot grid
      if (rackFade > 0) {
        ctx.globalAlpha = rackFade;
        for (var r = 0; r < ROWS; r++) {
          var ay = r * (RACK.d + AISLE) + RACK.d;
          var cold = { x: -200, y: ay + 100, z: 0, w: floorX + 400, d: AISLE - 200, h: 0 };
          D.poly(ctx, I.facePts(V, cold, 'top')); ctx.fillStyle = U.rgba(P.data, 0.05); ctx.fill();
        }
        ctx.globalAlpha = 1;
        I.floorGrid(ctx, V, -400, -400, floorX + 400, floorY + 400, 300, P.grid, 0.5 * rackFade);
      }

      // racks (back rows first)
      if (rackFade > 0.01) {
        var focusAlpha = 1 - 0.75 * U.segment(p, 0.3, 0.45);
        this.racks.forEach(function (rack) {
          var isT = rack === self.target;
          var a = rackFade * (isT ? 1 : focusAlpha);
          var b = { x: rack.x, y: rack.y, z: 0, w: RACK.w, d: RACK.d, h: RACK.h };
          I.box(ctx, V, b, { color: U.shade(P.steel, -0.35), alpha: a, decal: { left: self.rackDecal(rack, a), right: function (c, ww, hh) { c.fillStyle = U.rgba('#000', 0.18); for (var y = 60; y < hh - 60; y += 40) c.fillRect(30, y, ww - 60, 6); } } });
          if (p < 0.3) self.hits.poly('r' + rack.r + rack.c, I.hull(V, b), { r: rack.r, c: rack.c, n: rack.slots.length });
        });
      }

      // the target server
      if (p > 0.36) {
        var o = this.srvOrigin;
        var slide = U.ease.inOutCubic(U.segment(p, 0.38, 0.55)) * SLIDE;
        var lid = U.ease.inOutCubic(U.segment(p, 0.52, 0.64));
        var ex = U.segment(p, 0.6, 0.92);
        ctx.save();
        if (rackFade > 0.98) {
          // clip: show the server outside the rack, and inside only through its slot opening
          var tb = { x: this.target.x, y: this.target.y, z: 0, w: RACK.w, d: RACK.d, h: RACK.h };
          var hull = I.hull(V, tb);
          var slot = I.facePts(V, { x: o.x, y: o.y, z: o.z, w: M.W, d: M.D, h: M.H }, 'left');
          ctx.beginPath(); ctx.rect(0, 0, w, h); D.poly(ctx, hull); ctx.moveTo(slot[0], slot[1]); for (var i = 2; i < 8; i += 2) ctx.lineTo(slot[i], slot[i + 1]); ctx.closePath();
          ctx.clip('evenodd');
        }
        M.t = this.time; M.fanAngle = this.time * 14; M.fanBlur = ex > 0.2 ? 0 : 1; M.dataFlow = false; M.driveState = null; M.fanDead = null;
        M.draw(ctx, V, this.parts, {
          state: function (part) {
            var k = U.ease.outCubic(U.stagger(ex, part.order || 0, 11, 0.55));
            var e = part.explode || [0, 0, 0];
            var off = [o.x + e[0] * k, o.y + slide + e[1] * k, o.z + e[2] * k];
            if (part.group === 'lid') {
              off[2] += lid * 260; off[1] -= lid * 120;
              return { offset: off, alpha: 1 - U.segment(p, 0.6, 0.68) };
            }
            return { offset: off, inkT: 1 - U.ease.inOutSine(U.segment(ex, 0.25, 0.85)) * 0.85 };
          }
        });
        ctx.restore();
        // labels once exploded
        var la = U.segment(p, 0.84, 0.9);
        if (la > 0) {
          var lbl = [
            ['cpu', 'CPU + heatsink', 'Ch 06'], ['dimm6', 'Memory', 'Ch 07'], ['drive2', 'Hot-swap drives', 'Ch 08'],
            ['psu0', 'Redundant power', 'Ch 10'], ['fan2', 'Fan wall', 'Ch 11'], ['board', 'Motherboard', 'Ch 05'], ['nic', 'Network card', 'Ch 12']
          ];
          var mobile = this.mobile, anchors = [];
          lbl.forEach(function (L, i) {
            var part = self.parts.find(function (q) { return q.id === L[0]; }); if (!part) return;
            if (mobile && i % 2) return;
            var e = part.explode, b = part.b;
            var a = V.p(o.x + b.x + b.w / 2 + e[0], o.y + slide + b.y + b.d / 2 + e[1], o.z + b.z + b.h + e[2]);
            anchors.push({ a: a, L: L });
          });
          // stack labels in two columns so they never collide
          var cxm = w / 2;
          [true, false].forEach(function (right) {
            var side = anchors.filter(function (q) { return (q.a[0] > cxm) === right; }).sort(function (m, n) { return m.a[1] - n.a[1]; });
            var lastY = -1e9;
            side.forEach(function (q) {
              var ly = Math.max(q.a[1] - 30, lastY + 36); lastY = ly;
              var lx = right ? Math.min(w - 130, Math.max(q.a[0] + 60, cxm + 180)) : Math.max(130, Math.min(q.a[0] - 60, cxm - 180));
              if (mobile) lx = right ? w - 100 : 100;
              D.leader(ctx, q.a[0], q.a[1], lx, ly, q.L[1], { alpha: la, sub: q.L[2] });
            });
          });
        }
        // ID LED sonar on the target front
        var son = U.segment(p, 0.22, 0.4) * (1 - U.segment(p, 0.5, 0.56));
        if (son > 0) {
          var q = V.p(o.x + M.W - 30, o.y + M.D + slide, o.z + M.H / 2);
          for (var r2 = 0; r2 < 3; r2++) {
            var ph = ((this.time * 0.8 + r2 / 3) % 1);
            D.circle(ctx, q[0], q[1], 6 + ph * 60, null, U.rgba(P.mgmt, son * (1 - ph)), 2);
          }
          D.glow(ctx, q[0], q[1], 26, P.mgmt, son);
        }
      } else if (p > 0.18) {
        // pre-slide sonar on the rack
        var o2 = this.srvOrigin, s2 = U.segment(p, 0.18, 0.3);
        var q2 = V.p(o2.x + M.W - 30, o2.y + M.D, o2.z + M.H / 2);
        for (var r3 = 0; r3 < 3; r3++) {
          var ph2 = ((this.time * 0.8 + r3 / 3) % 1);
          D.circle(ctx, q2[0], q2[1], 4 + ph2 * 50, null, U.rgba(P.mgmt, s2 * (1 - ph2)), 2);
        }
      }
      // drafting frame
      var fa = 0.35 + 0.4 * U.segment(p, 0.6, 0.9);
      ctx.strokeStyle = U.rgba(P.blueprint, fa * 0.6); ctx.lineWidth = 1;
      var m = 16, tk = 14;
      [[m, m + 56], [w - m, m + 56], [m, h - m], [w - m, h - m]].forEach(function (c, i) {
        var sx = i % 2 ? -1 : 1, sy = i < 2 ? 1 : -1;
        ctx.beginPath(); ctx.moveTo(c[0], c[1] + sy * tk); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0] + sx * tk, c[1]); ctx.stroke();
      });
      if (!this.mobile) {
        D.text(ctx, 'SHEET 00 · DATACENTER → 2U SERVER', m + 4, h - m - 10, { size: 10, color: U.rgba(P.blueprint, fa), ls: 1 });
        D.text(ctx, 'SCALE ' + (p < 0.4 ? '1:' + Math.round(1 / (this.camK || 0.1)) : 'DETAIL'), w - m - 4, h - m - 10, { size: 10, color: U.rgba(P.blueprint, fa), align: 'right', ls: 1 });
      }
      this.camK = V.k / 3.78;
      this.setDesc(p < 0.3 ? 'A dark datacenter of ' + ROWS * COLS + ' racks booting up.' : p < 0.6 ? 'One server slides out of its rack.' : 'The server is opened and its parts float apart as a blueprint.');
    }
  });
})(window.SRV);
