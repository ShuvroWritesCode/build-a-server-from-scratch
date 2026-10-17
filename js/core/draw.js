/* 2D drawing toolkit: paths, labels, leader/dimension lines, glows, LEDs, fans,
   hatch patterns, flow lines and a code-drawn glyph set. Everything uses SRV.pal. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw = {};
  // Guard: negative radii throw in Canvas; clamp them globally (transient tiny layouts)
  (function () {
    var P = CanvasRenderingContext2D.prototype, arc = P.arc, ell = P.ellipse;
    P.arc = function (x, y, r, a0, a1, ccw) { return arc.call(this, x, y, r > 0 ? r : 0, a0, a1, ccw); };
    if (ell) P.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) { return ell.call(this, x, y, rx > 0 ? rx : 0, ry > 0 ? ry : 0, rot, a0, a1, ccw); };
  })();
  var TAU = Math.PI * 2;

  D.clear = function (ctx, w, h) { ctx.clearRect(0, 0, w, h); };
  D.rr = function (ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  };
  D.box = function (ctx, x, y, w, h, r, fill, stroke, lw) {
    D.rr(ctx, x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  };
  D.poly = function (ctx, pts, close) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    if (close !== false) ctx.closePath();
  };
  D.line = function (ctx, x1, y1, x2, y2, color, lw, dash) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.stroke(); if (dash) ctx.setLineDash([]);
  };
  D.circle = function (ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  };

  /** text(ctx, str, x, y, {size, weight, color, align, base, sans, alpha, maxW}) */
  D.text = function (ctx, str, x, y, o) {
    o = o || {};
    ctx.font = S.font(o.size || 11, o.weight || 500, !o.sans);
    ctx.fillStyle = o.color || S.pal.label;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'middle';
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (o.ls) { try { ctx.letterSpacing = o.ls + 'px'; } catch (e) { /* unsupported */ } }
    ctx.fillText(str, x, y, o.maxW);
    if (o.ls) { try { ctx.letterSpacing = '0px'; } catch (e) { /* unsupported */ } }
    if (o.alpha != null) ctx.globalAlpha = 1;
  };
  D.measure = function (ctx, str, size, weight, sans) { ctx.font = S.font(size || 11, weight || 500, !sans); return ctx.measureText(str).width; };

  /** pill label with background */
  D.pill = function (ctx, str, x, y, o) {
    o = o || {};
    var size = o.size || 11, pad = o.pad == null ? 6 : o.pad, w = D.measure(ctx, str, size, o.weight || 600) + pad * 2, h = size + pad * 1.2;
    var ax = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    D.box(ctx, ax, y - h / 2, w, h, o.r == null ? h / 2 : o.r, o.bg || U.rgba(S.pal.panel, 0.92), o.border || U.rgba(o.color || S.pal.blueprint, 0.6), 1);
    D.text(ctx, str, ax + w / 2, y + 0.5, { size: size, weight: o.weight || 600, color: o.color || S.pal.text1, align: 'center' });
    return { x: ax, y: y - h / 2, w: w, h: h };
  };

  /** drafting leader: from anchor (ax,ay) with a 45° elbow to label at (lx,ly) */
  D.leader = function (ctx, ax, ay, lx, ly, str, o) {
    o = o || {};
    var col = o.color || S.pal.blueprint, a = o.alpha == null ? 1 : o.alpha;
    if (a <= 0) return;
    ctx.globalAlpha = a;
    var dx = lx - ax, dy = ly - ay, ex = ax + Math.sign(dx || 1) * Math.min(Math.abs(dx), Math.abs(dy)), ey = ly;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.lineTo(lx, ly);
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
    D.circle(ctx, ax, ay, 2.5, col);
    var right = lx >= ax;
    D.text(ctx, str, lx + (right ? 5 : -5), ly - 0.5, { size: o.size || 11, weight: 600, color: o.textColor || S.pal.text1, align: right ? 'left' : 'right' });
    if (o.sub) D.text(ctx, o.sub, lx + (right ? 5 : -5), ly + (o.size || 11) + 2, { size: (o.size || 11) - 1.5, weight: 500, color: S.pal.text2, align: right ? 'left' : 'right' });
    ctx.globalAlpha = 1;
  };

  /** dimension line with arrowheads and centered text */
  D.dim = function (ctx, x1, y1, x2, y2, str, o) {
    o = o || {};
    var col = o.color || S.pal.blueprint, ang = Math.atan2(y2 - y1, x2 - x1), hl = 6;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    D.line(ctx, x1, y1, x2, y2, col, 1);
    [[x1, y1, ang], [x2, y2, ang + Math.PI]].forEach(function (p) {
      ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0] + Math.cos(p[2] + 0.35) * hl, p[1] + Math.sin(p[2] + 0.35) * hl);
      ctx.lineTo(p[0] + Math.cos(p[2] - 0.35) * hl, p[1] + Math.sin(p[2] - 0.35) * hl);
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    });
    if (str) {
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      ctx.translate(mx, my);
      var a = ang; if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
      ctx.rotate(a);
      var tw = D.measure(ctx, str, o.size || 10, 600) + 8;
      ctx.fillStyle = o.bg || S.pal.bg; ctx.fillRect(-tw / 2, -7, tw, 14);
      D.text(ctx, str, 0, 0, { size: o.size || 10, weight: 600, color: col, align: 'center' });
    }
    ctx.restore();
  };

  /** arrow from (x1,y1) to (x2,y2) */
  D.arrow = function (ctx, x1, y1, x2, y2, color, lw, head) {
    head = head || 7; lw = lw || 1.5;
    var ang = Math.atan2(y2 - y1, x2 - x1);
    D.line(ctx, x1, y1, x2 - Math.cos(ang) * head * 0.6, y2 - Math.sin(ang) * head * 0.6, color, lw);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(ang - 0.45) * head, y2 - Math.sin(ang - 0.45) * head);
    ctx.lineTo(x2 - Math.cos(ang + 0.45) * head, y2 - Math.sin(ang + 0.45) * head);
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  };

  // ---------- glow sprites (no shadowBlur in hot paths) ----------
  var glowCache = {};
  function glowSprite(color) {
    var c = glowCache[color]; if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, U.rgba(color, 0.95)); grd.addColorStop(0.18, U.rgba(color, 0.55));
    grd.addColorStop(0.5, U.rgba(color, 0.12)); grd.addColorStop(1, U.rgba(color, 0));
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return (glowCache[color] = c);
  }
  S.on('prefs', function () { glowCache = {}; });
  D.glow = function (ctx, x, y, r, color, alpha) {
    if (r <= 0) return;
    var prev = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
    ctx.globalCompositeOperation = S.pal.dark ? 'lighter' : 'source-over';
    ctx.globalAlpha = pa * (alpha == null ? 1 : alpha);
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = pa; ctx.globalCompositeOperation = prev;
  };
  /** LED: mode 'solid' | 'blink' | 'heartbeat' | 'activity' | 'off' */
  D.led = function (ctx, x, y, color, mode, t, size) {
    size = size || 2.2;
    var on = 1;
    if (mode === 'off') on = 0;
    else if (mode === 'blink') on = (Math.floor(t * 2) % 2) ? 1 : 0.15;
    else if (mode === 'heartbeat') { var ph = (t % 1.2) / 1.2; on = ph < 0.1 || (ph > 0.2 && ph < 0.3) ? 1 : 0.25; }
    else if (mode === 'activity') on = U.noise1(t * 9 + x * 0.37) > 0.45 ? 1 : 0.2;
    D.circle(ctx, x, y, size, on > 0.3 ? color : U.mix(color, S.pal.bg, 0.65));
    if (on > 0.3) D.glow(ctx, x, y, size * 5, color, on * 0.8);
  };

  // ---------- hatch patterns ----------
  var hatchCache = {};
  D.hatch = function (ctx, color, spacing, cross) {
    spacing = spacing || 6;
    var key = color + spacing + (cross ? 'x' : '');
    if (hatchCache[key]) return hatchCache[key];
    var c = document.createElement('canvas'); c.width = c.height = spacing * 2;
    var g = c.getContext('2d'); g.strokeStyle = color; g.lineWidth = 1.2;
    g.beginPath();
    for (var i = -1; i <= 2; i++) { g.moveTo(i * spacing, spacing * 2); g.lineTo(i * spacing + spacing * 2, 0); if (cross) { g.moveTo(i * spacing, 0); g.lineTo(i * spacing + spacing * 2, spacing * 2); } }
    g.stroke();
    return (hatchCache[key] = ctx.createPattern(c, 'repeat'));
  };

  // ---------- fan (2D; draw inside a face transform for iso) ----------
  D.fan2d = function (ctx, cx, cy, r, angle, o) {
    o = o || {};
    var blades = o.blades || 7, col = o.color || S.pal.plastic, rpmBlur = o.blur || 0;
    D.circle(ctx, cx, cy, r, o.housing || U.shade(col, -0.35));
    D.circle(ctx, cx, cy, r * 0.96, null, U.rgba(S.pal.alu, 0.35), 1);
    if (rpmBlur > 0.6) {
      // motion-blurred disc + strobe ghost blade
      D.circle(ctx, cx, cy, r * 0.9, U.rgba(U.shade(col, 0.25), 0.55));
      ctx.save(); ctx.globalAlpha = 0.5; bladesPath(ctx, cx, cy, r, angle * 0.02, 3, col); ctx.restore();
    } else {
      bladesPath(ctx, cx, cy, r, angle, blades, col);
    }
    D.circle(ctx, cx, cy, r * 0.28, U.shade(col, 0.15), U.rgba('#000', 0.3), 1);
    if (o.label) D.text(ctx, o.label, cx, cy, { size: Math.max(7, r * 0.22), weight: 700, color: S.pal.text2, align: 'center' });
  };
  function bladesPath(ctx, cx, cy, r, angle, n, col) {
    ctx.fillStyle = U.shade(col, 0.28);
    for (var i = 0; i < n; i++) {
      var a = angle + i * TAU / n;
      ctx.beginPath();
      var r0 = r * 0.28, r1 = r * 0.9;
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.bezierCurveTo(cx + Math.cos(a + 0.2) * r * 0.6, cy + Math.sin(a + 0.2) * r * 0.6,
        cx + Math.cos(a + 0.55) * r1, cy + Math.sin(a + 0.55) * r1,
        cx + Math.cos(a + 0.75) * r1, cy + Math.sin(a + 0.75) * r1);
      ctx.bezierCurveTo(cx + Math.cos(a + 0.6) * r * 0.55, cy + Math.sin(a + 0.6) * r * 0.55,
        cx + Math.cos(a + 0.5) * r0, cy + Math.sin(a + 0.5) * r0,
        cx + Math.cos(a + 0.5) * r0, cy + Math.sin(a + 0.5) * r0);
      ctx.closePath(); ctx.fill();
    }
  }

  // ---------- polylines: length, point-at, marching flow ----------
  D.polyLen = function (pts) {
    var L = [0];
    for (var i = 2; i < pts.length; i += 2) L.push(L[L.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
    return L;
  };
  /** point at distance s along polyline (pts flat, lens from polyLen) */
  D.along = function (pts, lens, s, out) {
    out = out || {};
    var total = lens[lens.length - 1];
    s = U.clamp(s, 0, total);
    var i = 1; while (i < lens.length - 1 && lens[i] < s) i++;
    var seg = lens[i] - lens[i - 1] || 1, t = (s - lens[i - 1]) / seg;
    out.x = pts[(i - 1) * 2] + (pts[i * 2] - pts[(i - 1) * 2]) * t;
    out.y = pts[(i - 1) * 2 + 1] + (pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]) * t;
    out.a = Math.atan2(pts[i * 2 + 1] - pts[(i - 1) * 2 + 1], pts[i * 2] - pts[(i - 1) * 2]);
    return out;
  };
  /** marching-dash flow along a polyline (power: dash, data: beads) */
  D.flow = function (ctx, pts, color, t, o) {
    o = o || {};
    var lw = o.width || 2;
    D.poly(ctx, pts, false);
    ctx.strokeStyle = U.rgba(color, o.base == null ? 0.18 : o.base); ctx.lineWidth = lw + 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    if (o.speed === 0) return;
    ctx.setLineDash(o.dash || [6, 8]);
    ctx.lineDashOffset = -t * (o.speed || 30);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'butt';
  };

  /** dotted background grid */
  D.dotGrid = function (ctx, w, h, sx, sy, color, alpha) {
    ctx.fillStyle = U.rgba(color || S.pal.grid, alpha == null ? 0.5 : alpha);
    for (var y = (sy || 14) / 2; y < h; y += sy || 14) for (var x = (sx || 24) / 2 + ((Math.round(y / (sy || 14)) % 2) * (sx || 24) / 2); x < w; x += sx || 24) ctx.fillRect(x, y, 1, 1);
  };

  /** horizontal meter bar */
  D.meter = function (ctx, x, y, w, h, frac, color, o) {
    o = o || {};
    D.box(ctx, x, y, w, h, h / 2, o.bg || U.rgba(S.pal.panel3, 0.9));
    var f = U.clamp(frac, 0, 1);
    if (f > 0) D.box(ctx, x, y, Math.max(h, w * f), h, h / 2, color);
    if (frac > 1) { ctx.fillStyle = D.hatch(ctx, S.pal.fault, 5); D.rr(ctx, x, y, w, h, h / 2); ctx.fill(); }
  };
  /** arc gauge */
  D.gauge = function (ctx, cx, cy, r, frac, color, o) {
    o = o || {};
    var a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.strokeStyle = U.rgba(S.pal.panel3, 1); ctx.lineWidth = o.lw || 6; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * U.clamp(frac, 0, 1)); ctx.strokeStyle = color; ctx.stroke();
    ctx.lineCap = 'butt';
    if (o.value) D.text(ctx, o.value, cx, cy - 1, { size: o.size || 13, weight: 700, color: S.pal.text1, align: 'center' });
    if (o.label) D.text(ctx, o.label, cx, cy + r * 0.62, { size: 9, weight: 600, color: S.pal.text3, align: 'center' });
  };

  /** wavy rising heat line */
  D.shimmer = function (ctx, x, y, h, t, color, alpha) {
    ctx.beginPath();
    for (var i = 0; i <= 12; i++) {
      var k = i / 12, yy = y - k * h, xx = x + Math.sin(k * 9 - t * 6) * 3 * (0.3 + k);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.strokeStyle = U.rgba(color || S.pal.heat, alpha == null ? 0.6 : alpha); ctx.lineWidth = 1.4; ctx.stroke();
  };

  // ======================================================================
  // Glyph set. Each draws centred at (x,y) within a box of size s.
  // ======================================================================
  var G = D.g = {};
  G.check = function (ctx, x, y, s, c) { ctx.beginPath(); ctx.moveTo(x - s * 0.35, y); ctx.lineTo(x - s * 0.1, y + s * 0.25); ctx.lineTo(x + s * 0.38, y - s * 0.28); ctx.strokeStyle = c || S.pal.ok; ctx.lineWidth = Math.max(1.5, s * 0.14); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineCap = 'butt'; };
  G.cross = function (ctx, x, y, s, c) { var k = s * 0.3; ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.strokeStyle = c || S.pal.fault; ctx.lineWidth = Math.max(1.5, s * 0.14); ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt'; };
  G.warn = function (ctx, x, y, s, c) {
    c = c || S.pal.warn;
    D.poly(ctx, [x, y - s * 0.45, x + s * 0.48, y + s * 0.38, x - s * 0.48, y + s * 0.38]); ctx.fillStyle = c; ctx.fill();
    ctx.fillStyle = S.pal.bg; ctx.fillRect(x - s * 0.05, y - s * 0.18, s * 0.1, s * 0.3); ctx.fillRect(x - s * 0.05, y + s * 0.18, s * 0.1, s * 0.1);
  };
  G.bolt = function (ctx, x, y, s, c) { D.poly(ctx, [x + s * 0.1, y - s * 0.5, x - s * 0.3, y + s * 0.06, x - s * 0.02, y + s * 0.06, x - s * 0.12, y + s * 0.5, x + s * 0.32, y - s * 0.1, x + s * 0.04, y - s * 0.1]); ctx.fillStyle = c || S.pal.power; ctx.fill(); };
  G.laptop = function (ctx, x, y, s, c, screen) {
    c = c || S.pal.alu;
    D.box(ctx, x - s * 0.4, y - s * 0.38, s * 0.8, s * 0.52, s * 0.04, U.shade(c, -0.5), c, 1.2);
    D.box(ctx, x - s * 0.34, y - s * 0.32, s * 0.68, s * 0.4, 1, screen || U.rgba(S.pal.data, 0.25));
    D.poly(ctx, [x - s * 0.5, y + s * 0.18, x + s * 0.5, y + s * 0.18, x + s * 0.42, y + s * 0.26, x - s * 0.42, y + s * 0.26]); ctx.fillStyle = c; ctx.fill();
  };
  G.phone = function (ctx, x, y, s, c) {
    c = c || S.pal.alu;
    D.box(ctx, x - s * 0.22, y - s * 0.42, s * 0.44, s * 0.84, s * 0.08, U.shade(c, -0.5), c, 1.2);
    D.box(ctx, x - s * 0.17, y - s * 0.34, s * 0.34, s * 0.62, 1, U.rgba(S.pal.data, 0.25));
  };
  G.desktop = function (ctx, x, y, s, c) {
    c = c || S.pal.alu;
    D.box(ctx, x - s * 0.45, y - s * 0.4, s * 0.9, s * 0.56, s * 0.04, U.shade(c, -0.5), c, 1.2);
    D.box(ctx, x - s * 0.39, y - s * 0.34, s * 0.78, s * 0.44, 1, U.rgba(S.pal.data, 0.22));
    ctx.fillStyle = c; ctx.fillRect(x - s * 0.05, y + s * 0.16, s * 0.1, s * 0.16); ctx.fillRect(x - s * 0.22, y + s * 0.32, s * 0.44, s * 0.05);
  };
  G.serverFront = function (ctx, x, y, s, c, t, led) {
    c = c || S.pal.steel;
    var w = s, h = s * 0.28;
    D.box(ctx, x - w / 2, y - h / 2, w, h, 2, c, U.shade(c, 0.25), 1);
    for (var i = 0; i < 4; i++) D.box(ctx, x - w / 2 + 4 + i * (w * 0.14), y - h / 2 + 3, w * 0.12, h - 6, 1, U.shade(c, -0.3));
    D.led(ctx, x + w / 2 - 8, y, led || S.pal.ok, t == null ? 'solid' : 'activity', t || 0, 1.6);
  };
  G.cloud = function (ctx, x, y, s, c) {
    ctx.beginPath();
    ctx.arc(x - s * 0.22, y + s * 0.05, s * 0.2, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(x - s * 0.02, y - s * 0.12, s * 0.24, Math.PI, Math.PI * 1.85);
    ctx.arc(x + s * 0.24, y + s * 0.02, s * 0.2, Math.PI * 1.4, Math.PI * 0.5);
    ctx.closePath();
    ctx.fillStyle = U.rgba(c || S.pal.blueprint, 0.16); ctx.fill(); ctx.strokeStyle = c || S.pal.blueprint; ctx.lineWidth = 1.5; ctx.stroke();
  };
  G.padlock = function (ctx, x, y, s, c, open) {
    c = c || S.pal.gold;
    ctx.beginPath(); ctx.arc(x + (open ? s * 0.18 : 0), y - s * 0.08, s * 0.2, Math.PI, open ? Math.PI * 1.85 : 0);
    if (!open) { ctx.lineTo(x + s * 0.2, y + s * 0.05); ctx.moveTo(x - s * 0.2, y + s * 0.05); ctx.lineTo(x - s * 0.2, y - s * 0.08); }
    ctx.strokeStyle = U.shade(c, 0.2); ctx.lineWidth = s * 0.09; ctx.stroke();
    D.box(ctx, x - s * 0.3, y - s * 0.02, s * 0.6, s * 0.46, s * 0.06, c, U.shade(c, -0.3), 1);
    D.circle(ctx, x, y + s * 0.17, s * 0.06, U.shade(c, -0.55));
  };
  G.key = function (ctx, x, y, s, c) {
    c = c || S.pal.accent;
    D.circle(ctx, x - s * 0.25, y, s * 0.18, null, c, s * 0.08);
    ctx.beginPath(); ctx.moveTo(x - s * 0.08, y); ctx.lineTo(x + s * 0.45, y); ctx.moveTo(x + s * 0.3, y); ctx.lineTo(x + s * 0.3, y + s * 0.14); ctx.moveTo(x + s * 0.42, y); ctx.lineTo(x + s * 0.42, y + s * 0.1);
    ctx.strokeStyle = c; ctx.lineWidth = s * 0.08; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
  };
  G.shield = function (ctx, x, y, s, c) {
    c = c || S.pal.ok;
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.45); ctx.lineTo(x + s * 0.36, y - s * 0.3); ctx.quadraticCurveTo(x + s * 0.34, y + s * 0.25, x, y + s * 0.46); ctx.quadraticCurveTo(x - s * 0.34, y + s * 0.25, x - s * 0.36, y - s * 0.3); ctx.closePath();
    ctx.fillStyle = U.rgba(c, 0.2); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.stroke();
    G.check(ctx, x, y, s * 0.5, c);
  };
  G.envelope = function (ctx, x, y, s, c) {
    c = c || S.pal.net;
    D.box(ctx, x - s * 0.4, y - s * 0.26, s * 0.8, s * 0.52, 2, U.rgba(c, 0.18), c, 1.4);
    ctx.beginPath(); ctx.moveTo(x - s * 0.4, y - s * 0.26); ctx.lineTo(x, y + s * 0.04); ctx.lineTo(x + s * 0.4, y - s * 0.26); ctx.strokeStyle = c; ctx.stroke();
  };
  G.disc = function (ctx, x, y, s, c) { D.circle(ctx, x, y, s * 0.4, U.rgba(c || S.pal.alu, 0.8), U.shade(c || S.pal.alu, -0.3), 1); D.circle(ctx, x, y, s * 0.1, S.pal.bg); D.circle(ctx, x, y, s * 0.26, null, U.rgba('#fff', 0.25), 1); };
  G.gear = function (ctx, x, y, s, c) {
    c = c || S.pal.text2; ctx.beginPath();
    for (var i = 0; i < 16; i++) { var a = i * TAU / 16, r = i % 2 ? s * 0.32 : s * 0.42; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = c; ctx.fill(); D.circle(ctx, x, y, s * 0.13, S.pal.bg);
  };
  G.doc = function (ctx, x, y, s, c) {
    c = c || S.pal.text2;
    D.poly(ctx, [x - s * 0.3, y - s * 0.4, x + s * 0.15, y - s * 0.4, x + s * 0.3, y - s * 0.25, x + s * 0.3, y + s * 0.4, x - s * 0.3, y + s * 0.4]);
    ctx.fillStyle = U.rgba(c, 0.15); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.stroke();
    for (var i = 0; i < 4; i++) D.line(ctx, x - s * 0.18, y - s * 0.15 + i * s * 0.12, x + s * 0.18, y - s * 0.15 + i * s * 0.12, U.rgba(c, 0.7), 1);
  };
  G.house = function (ctx, x, y, s, c, fill) {
    c = c || S.pal.blueprint;
    D.poly(ctx, [x - s * 0.42, y - s * 0.02, x, y - s * 0.42, x + s * 0.42, y - s * 0.02, x + s * 0.32, y - s * 0.02, x + s * 0.32, y + s * 0.4, x - s * 0.32, y + s * 0.4, x - s * 0.32, y - s * 0.02]);
    ctx.fillStyle = fill || U.rgba(c, 0.15); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.stroke();
    D.box(ctx, x - s * 0.08, y + s * 0.14, s * 0.16, s * 0.26, 1, U.rgba(c, 0.5));
  };
  G.flame = function (ctx, x, y, s, t) {
    var f = 1 + Math.sin((t || 0) * 12) * 0.06;
    ctx.beginPath(); ctx.moveTo(x, y + s * 0.45);
    ctx.bezierCurveTo(x - s * 0.4, y + s * 0.4, x - s * 0.35, y - s * 0.05, x - s * 0.05, y - s * 0.5 * f);
    ctx.bezierCurveTo(x + s * 0.05, y - s * 0.2, x + s * 0.4, y - s * 0.1, x + s * 0.3, y + s * 0.2);
    ctx.bezierCurveTo(x + s * 0.25, y + s * 0.4, x + s * 0.1, y + s * 0.45, x, y + s * 0.45);
    ctx.fillStyle = S.pal.heat; ctx.fill();
    D.circle(ctx, x, y + s * 0.22, s * 0.14, S.pal.power);
  };
  G.bug = function (ctx, x, y, s, c) {
    c = c || S.pal.fault;
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.05, s * 0.2, s * 0.28, 0, 0, TAU); ctx.fillStyle = c; ctx.fill();
    D.circle(ctx, x, y - s * 0.28, s * 0.12, c);
    ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.beginPath();
    for (var i = -1; i <= 1; i++) { ctx.moveTo(x - s * 0.18, y + i * s * 0.12); ctx.lineTo(x - s * 0.38, y + i * s * 0.16 - s * 0.04); ctx.moveTo(x + s * 0.18, y + i * s * 0.12); ctx.lineTo(x + s * 0.38, y + i * s * 0.16 - s * 0.04); }
    ctx.stroke();
  };
  G.clock = function (ctx, x, y, s, c, t) {
    c = c || S.pal.text2; D.circle(ctx, x, y, s * 0.4, U.rgba(c, 0.1), c, 1.4);
    var a = (t || 0) * 2; D.line(ctx, x, y, x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3, c, 1.4); D.line(ctx, x, y, x, y - s * 0.2, c, 1.6);
  };
  G.switchBox = function (ctx, x, y, s, c, t) {
    c = c || S.pal.steel;
    D.box(ctx, x - s * 0.5, y - s * 0.14, s, s * 0.28, 2, c, U.shade(c, 0.25), 1);
    for (var i = 0; i < 8; i++) { D.box(ctx, x - s * 0.44 + i * s * 0.1, y - s * 0.06, s * 0.07, s * 0.08, 1, U.shade(c, -0.45)); D.led(ctx, x - s * 0.405 + i * s * 0.1, y + s * 0.07, S.pal.ok, 'activity', (t || 0) + i, 1); }
  };
  /** simple figure (person / chef / technician) */
  G.person = function (ctx, x, y, s, c, o) {
    o = o || {};
    c = c || S.pal.alu;
    var bob = o.bob || 0, arm = o.arm || 0;
    D.box(ctx, x - s * 0.18, y - s * 0.12 + bob, s * 0.36, s * 0.5, s * 0.12, U.shade(c, -0.15));
    D.circle(ctx, x, y - s * 0.26 + bob, s * 0.15, U.shade(c, 0.2));
    ctx.strokeStyle = U.shade(c, -0.1); ctx.lineWidth = Math.max(1.5, s * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * 0.16, y + bob); ctx.lineTo(x - s * 0.32, y + s * 0.18 - arm * s * 0.25 + bob);
    ctx.moveTo(x + s * 0.16, y + bob); ctx.lineTo(x + s * 0.32, y + s * 0.18 + arm * s * 0.25 - s * 0.1 + bob); ctx.stroke(); ctx.lineCap = 'butt';
    if (o.hat) { // chef hat
      D.box(ctx, x - s * 0.13, y - s * 0.46 + bob, s * 0.26, s * 0.1, 2, '#F4F6FA');
      D.circle(ctx, x - s * 0.07, y - s * 0.5 + bob, s * 0.09, '#F4F6FA'); D.circle(ctx, x + s * 0.07, y - s * 0.5 + bob, s * 0.09, '#F4F6FA'); D.circle(ctx, x, y - s * 0.55 + bob, s * 0.1, '#F4F6FA');
    }
  };
  /** a code-drawn "photo"/pixel image (used by RAID/ECC): returns 2D array of colours */
  D.pixelArt = function (w, h, seed) {
    var r = U.rng(seed || 'art'), out = [];
    var sky = ['#1B3A6B', '#24508F', '#2F6FB5'], sun = '#FDD262', hill = ['#1F6B4A', '#2C8A5E', '#3DDC97'];
    for (var y = 0; y < h; y++) {
      var row = [];
      for (var x = 0; x < w; x++) {
        var c = sky[Math.min(2, Math.floor((y / h) * 3))];
        var dx = x - w * 0.72, dy = y - h * 0.3; if (dx * dx + dy * dy < (h * 0.18) * (h * 0.18)) c = sun;
        var hy = h * 0.62 + Math.sin(x * 0.55) * h * 0.08; if (y > hy) c = hill[Math.min(2, Math.floor((y - hy) / (h * 0.14)))];
        var sv = w * 0.22, sw = w * 0.16; if (x > sv && x < sv + sw && y > h * 0.4 && y < h * 0.8) c = (y % 2 ? '#3B4A66' : '#5A6A88');
        if (x > sv + 1 && x < sv + sw - 1 && y % 2 === 1 && y > h * 0.4 && y < h * 0.8 && x === Math.floor(sv + sw - 2)) c = '#3DDC97';
        if (r.chance(0.02) && y < h * 0.5) c = '#E8EEF8';
        row.push(c);
      }
      out.push(row);
    }
    return out;
  };
})(window.SRV);
