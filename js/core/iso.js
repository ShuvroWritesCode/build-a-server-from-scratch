/* Isometric toolkit. World units are millimetres. Axes: x → right-down, y → left-down, z → up.
   The viewer looks from (+x,+y,+z), so the visible faces of a box are: top (+z), "left" (+y) and "right" (+x). */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var I = S.iso = {};
  var C30 = Math.cos(Math.PI / 6), S30 = 0.5;

  /** create a view (camera). k = px per mm. Optional yaw (radians) about (cx,cy). */
  I.view = function (o) {
    o = o || {};
    var V = {
      k: o.k || 1, ox: o.ox || 0, oy: o.oy || 0, C: o.C || C30, S: o.S || S30,
      yaw: o.yaw || 0, cx: o.cx || 0, cy: o.cy || 0,
      p: function (x, y, z, out) {
        if (this.yaw) {
          var dx = x - this.cx, dy = y - this.cy, cs = Math.cos(this.yaw), sn = Math.sin(this.yaw);
          x = this.cx + dx * cs - dy * sn; y = this.cy + dx * sn + dy * cs;
        }
        var sx = this.ox + (x - y) * this.C * this.k, sy = this.oy + (x + y) * this.S * this.k - z * this.k;
        if (out) { out[0] = sx; out[1] = sy; return out; }
        return [sx, sy];
      },
      /** inverse on plane z = z0 (ignores yaw) */
      unproject: function (sx, sy, z0) {
        var a = (sx - this.ox) / (this.C * this.k), b = (sy - this.oy + (z0 || 0) * this.k) / (this.S * this.k);
        return { x: (a + b) / 2, y: (b - a) / 2 };
      },
      /** fit an AABB {x0,y0,z0,x1,y1,z1} into w×h with padding */
      fit: function (bb, w, h, pad, alignY) {
        pad = pad == null ? 20 : pad;
        this.k = 1; this.ox = 0; this.oy = 0;
        var r = I.screenBounds(this, bb);
        var k = Math.min((w - pad * 2) / (r.x1 - r.x0), (h - pad * 2) / (r.y1 - r.y0));
        this.k = k;
        r = I.screenBounds(this, bb);
        this.ox = (w - (r.x1 - r.x0)) / 2 - r.x0;
        this.oy = alignY === 'bottom' ? h - pad - r.y1 : (h - (r.y1 - r.y0)) / 2 - r.y0;
        return this;
      }
    };
    return V;
  };
  I.screenBounds = function (V, bb) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, p = [0, 0];
    for (var i = 0; i < 8; i++) {
      V.p(i & 1 ? bb.x1 : bb.x0, i & 2 ? bb.y1 : bb.y0, i & 4 ? bb.z1 : bb.z0, p);
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  };

  // ---------- materials: three face shades from one base ----------
  var matCache = {};
  I.mat = function (base) {
    var key = base + (S.pal.dark ? 'd' : 'l');
    if (matCache[key]) return matCache[key];
    var m = {
      top: U.shade(base, S.pal.dark ? 0.14 : 0.18),
      left: base,
      right: U.shade(base, -0.26),
      edge: U.shade(base, S.pal.dark ? 0.32 : -0.4),
      line: U.shade(base, S.pal.dark ? -0.45 : -0.5)
    };
    return (matCache[key] = m);
  };
  S.on('prefs', function () { matCache = {}; });
  /** resolve colour: palette key or hex */
  I.col = function (c) { return (c && S.pal[c]) || c || S.pal.steel; };

  // ---------- face geometry ----------
  var tmp = [0, 0], tmp2 = [0, 0];
  /** face polygon in screen space (flat array of 8 numbers) */
  I.facePts = function (V, b, face) {
    var x = b.x, y = b.y, z = b.z, w = b.w, d = b.d, h = b.h, P = [];
    function add(a, bb, c) { V.p(a, bb, c, tmp); P.push(tmp[0], tmp[1]); }
    if (face === 'top') { add(x, y, z + h); add(x + w, y, z + h); add(x + w, y + d, z + h); add(x, y + d, z + h); }
    else if (face === 'right') { add(x + w, y, z); add(x + w, y + d, z); add(x + w, y + d, z + h); add(x + w, y, z + h); }
    else { add(x, y + d, z); add(x + w, y + d, z); add(x + w, y + d, z + h); add(x, y + d, z + h); }
    return P;
  };
  /** affine basis so that fn draws in face-local mm: u → right, v → down (top: u=x, v=y) */
  I.faceBasis = function (V, b, face) {
    var o, u, v, uw, vh;
    if (face === 'top') { o = [b.x, b.y, b.z + b.h]; u = [1, 0, 0]; v = [0, 1, 0]; uw = b.w; vh = b.d; }
    else if (face === 'left') { o = [b.x, b.y + b.d, b.z + b.h]; u = [1, 0, 0]; v = [0, 0, -1]; uw = b.w; vh = b.h; }
    else { o = [b.x + b.w, b.y + b.d, b.z + b.h]; u = [0, -1, 0]; v = [0, 0, -1]; uw = b.d; vh = b.h; }
    V.p(o[0], o[1], o[2], tmp);
    var ox = tmp[0], oy = tmp[1];
    V.p(o[0] + u[0], o[1] + u[1], o[2] + u[2], tmp2); var ux = tmp2[0] - ox, uy = tmp2[1] - oy;
    V.p(o[0] + v[0], o[1] + v[1], o[2] + v[2], tmp2); var vx = tmp2[0] - ox, vy = tmp2[1] - oy;
    return { ox: ox, oy: oy, ux: ux, uy: uy, vx: vx, vy: vy, w: uw, h: vh };
  };
  /** draw in face-local coordinates (mm). fn(ctx, w, h) */
  I.withFace = function (ctx, V, b, face, fn) {
    var B = I.faceBasis(V, b, face);
    ctx.save();
    ctx.transform(B.ux, B.uy, B.vx, B.vy, B.ox, B.oy);
    // I.px = one screen pixel expressed in face-local units (for crisp strokes)
    I.px = 1 / Math.max(1e-4, Math.sqrt(Math.abs(B.ux * B.vy - B.uy * B.vx)));
    ctx.beginPath(); ctx.rect(0, 0, B.w, B.h); ctx.clip();
    try { fn(ctx, B.w, B.h); } finally { ctx.restore(); }
  };

  /** silhouette hexagon (for hit testing / outlines) */
  I.hull = function (V, b) {
    var pts = [], c = [
      [b.x, b.y, b.z + b.h], [b.x + b.w, b.y, b.z + b.h], [b.x + b.w, b.y, b.z], [b.x + b.w, b.y + b.d, b.z],
      [b.x, b.y + b.d, b.z], [b.x, b.y + b.d, b.z + b.h]];
    c.forEach(function (q) { V.p(q[0], q[1], q[2], tmp); pts.push(tmp[0], tmp[1]); });
    return pts;
  };

  /**
   * Draw an iso box.
   * o: { color, mat, state:'solid'|'blueprint'|'ghost'|'fault'|'hot', inkT (0..1 blueprint→solid),
   *      alpha, decal:{top,left,right: fn(ctx,w,h)}, noStroke, glow, highlight }
   */
  I.box = function (ctx, V, b, o) {
    o = o || {};
    var state = o.state || 'solid', a = o.alpha == null ? 1 : o.alpha;
    if (a <= 0.003) return;
    var inkT = o.inkT == null ? (state === 'blueprint' ? 0 : 1) : o.inkT;
    var faces = ['left', 'right', 'top'];
    var pts = faces.map(function (f) { return I.facePts(V, b, f); });

    // blueprint wireframe pass
    if (inkT < 1) {
      ctx.globalAlpha = a * (1 - inkT * 0.85);
      var bp = S.pal.blueprint;
      pts.forEach(function (P) { D.poly(ctx, P); ctx.fillStyle = U.rgba(bp, 0.05); ctx.fill(); });
      ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(bp, 0.85);
      pts.forEach(function (P) { D.poly(ctx, P); ctx.stroke(); });
      ctx.setLineDash([]);
    }
    // solid pass
    if (inkT > 0) {
      var base = I.col(o.color);
      if (state === 'fault') base = U.mix(base, S.pal.fault, 0.45);
      if (state === 'hot') base = U.mix(base, S.pal.heat, 0.5);
      var m = o.mat || I.mat(base);
      ctx.globalAlpha = a * (state === 'ghost' ? 0.35 : 1) * inkT;
      var fills = [o.leftColor || m.left, o.rightColor || m.right, o.topColor || m.top];
      for (var i = 0; i < 3; i++) {
        D.poly(ctx, pts[i]); ctx.fillStyle = fills[i]; ctx.fill();
        var dec = o.decal && o.decal[faces[i]];
        if (dec) I.withFace(ctx, V, b, faces[i], dec);
      }
      if (!o.noStroke) {
        ctx.lineWidth = 1; ctx.strokeStyle = U.rgba(m.line, 0.9);
        var hull = I.hull(V, b); D.poly(ctx, hull); ctx.stroke();
        // crisp highlight on top-front edges
        ctx.strokeStyle = U.rgba(m.edge, 0.55);
        ctx.beginPath(); ctx.moveTo(pts[2][2], pts[2][3]); ctx.lineTo(pts[2][4], pts[2][5]); ctx.lineTo(pts[2][6], pts[2][7]); ctx.stroke();
      }
      if (state === 'fault') { ctx.fillStyle = D.hatch(ctx, U.rgba(S.pal.fault, 0.7), 5, true); D.poly(ctx, pts[2]); ctx.fill(); }
    }
    if (o.highlight) {
      ctx.globalAlpha = a;
      ctx.lineWidth = 2; ctx.strokeStyle = o.highlight === true ? S.pal.accent : o.highlight;
      D.poly(ctx, I.hull(V, b)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  /** soft ground shadow at z = z0 */
  I.shadow = function (ctx, V, b, alpha, z0, spread) {
    spread = spread || 8;
    var s = { x: b.x - spread, y: b.y - spread, z: z0 || 0, w: b.w + spread * 2, d: b.d + spread * 2, h: 0 };
    var P = I.facePts(V, s, 'top');
    ctx.globalAlpha = alpha == null ? 0.35 : alpha;
    D.poly(ctx, P); ctx.fillStyle = S.pal.dark ? '#000' : 'rgba(20,40,80,0.5)'; ctx.fill();
    ctx.globalAlpha = 1;
  };

  /** vertical cylinder (axis z) */
  I.cyl = function (ctx, V, c, o) {
    o = o || {};
    var m = I.mat(I.col(o.color));
    var top = V.p(c.x, c.y, c.z + c.h), bot = V.p(c.x, c.y, c.z);
    var rx = Math.SQRT2 * c.r * V.C * V.k, ry = Math.SQRT2 * c.r * V.S * V.k;
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.beginPath(); ctx.ellipse(bot[0], bot[1], rx, ry, 0, 0, Math.PI);
    ctx.lineTo(top[0] - rx, top[1]); ctx.ellipse(top[0], top[1], rx, ry, 0, Math.PI, 0, true); ctx.closePath();
    var g = ctx.createLinearGradient(bot[0] - rx, 0, bot[0] + rx, 0);
    g.addColorStop(0, m.left); g.addColorStop(0.45, m.top); g.addColorStop(1, m.right);
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.ellipse(top[0], top[1], rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = o.topColor || m.top; ctx.fill();
    ctx.strokeStyle = U.rgba(m.line, 0.8); ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
  };

  /** polyline through 3D points, e.g. cables; o: {color, width, flow, t} */
  I.path3 = function (V, pts3) {
    var out = [];
    pts3.forEach(function (q) { V.p(q[0], q[1], q[2], tmp); out.push(tmp[0], tmp[1]); });
    return out;
  };

  // ---------- painter's topological depth sort for non-intersecting boxes ----------
  function behind(A, B) {
    if (A.x + A.w <= B.x + 0.01) return true; if (B.x + B.w <= A.x + 0.01) return false;
    if (A.y + A.d <= B.y + 0.01) return true; if (B.y + B.d <= A.y + 0.01) return false;
    if (A.z + A.h <= B.z + 0.01) return true; if (B.z + B.h <= A.z + 0.01) return false;
    return (A.x + A.y + A.z + (A.w + A.d + A.h) / 2) < (B.x + B.y + B.z + (B.w + B.d + B.h) / 2);
  }
  /** items: [{b:{x,y,z,w,d,h}, ...}] → sorted copy (far → near) */
  I.sort = function (V, items) {
    var n = items.length, sb = new Array(n), i, j;
    for (i = 0; i < n; i++) {
      var b = items[i].b;
      sb[i] = I.screenBounds(V, { x0: b.x, y0: b.y, z0: b.z, x1: b.x + b.w, y1: b.y + b.d, z1: b.z + b.h });
    }
    var indeg = new Int32Array(n), adj = [];
    for (i = 0; i < n; i++) adj.push([]);
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var a = sb[i], c = sb[j];
      if (a.x1 <= c.x0 || c.x1 <= a.x0 || a.y1 <= c.y0 || c.y1 <= a.y0) continue;
      if (behind(items[i].b, items[j].b)) { adj[i].push(j); indeg[j]++; } else { adj[j].push(i); indeg[i]++; }
    }
    var keyOf = function (k) { var b = items[k].b; return b.x + b.y + b.z; };
    var ready = [], out = [];
    for (i = 0; i < n; i++) if (!indeg[i]) ready.push(i);
    var seen = new Uint8Array(n);
    while (out.length < n) {
      if (!ready.length) { // cycle: break by smallest depth key
        var best = -1; for (i = 0; i < n; i++) if (!seen[i] && (best < 0 || keyOf(i) < keyOf(best))) best = i;
        ready.push(best); indeg[best] = 0;
      }
      ready.sort(function (p, q) { return keyOf(q) - keyOf(p); });
      var k = ready.pop();
      if (seen[k]) continue;
      seen[k] = 1; out.push(items[k]);
      adj[k].forEach(function (m) { if (!seen[m] && --indeg[m] === 0) ready.push(m); });
    }
    return out;
  };

  /** dot grid on the floor plane z=0 */
  I.floorGrid = function (ctx, V, x0, y0, x1, y1, step, color, alpha) {
    ctx.fillStyle = U.rgba(color || S.pal.grid, alpha == null ? 0.6 : alpha);
    for (var x = x0; x <= x1; x += step) for (var y = y0; y <= y1; y += step) { V.p(x, y, 0, tmp); ctx.fillRect(tmp[0] - 0.75, tmp[1] - 0.75, 1.5, 1.5); }
  };
})(window.SRV);
