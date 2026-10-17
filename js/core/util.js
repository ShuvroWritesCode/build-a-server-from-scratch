/* Math, easing, seeded RNG and colour utilities — all hand-written. */
;(function (S) {
  'use strict';
  var U = S.util = {};

  // ---------- math ----------
  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.invLerp = function (a, b, v) { return a === b ? 0 : (v - a) / (b - a); };
  U.remap = function (v, a, b, c, d, clampIt) { var t = U.invLerp(a, b, v); if (clampIt) t = U.clamp(t, 0, 1); return c + (d - c) * t; };
  U.damp = function (a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); };
  U.smoothstep = function (a, b, v) { var t = U.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  /** progress of p inside window [a,b] → 0..1 */
  U.segment = function (p, a, b) { return U.clamp((p - a) / (b - a), 0, 1); };
  /** staggered sub-progress for item i of n, overlap 0..1 */
  U.stagger = function (p, i, n, overlap) {
    overlap = overlap == null ? 0.5 : overlap;
    var w = 1 / (n - (n - 1) * overlap), start = i * w * (1 - overlap);
    return U.clamp((p - start) / w, 0, 1);
  };
  U.dist = function (ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); };
  U.TAU = Math.PI * 2;
  U.fmt = function (n, d) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : Math.min(d, 0) }); };
  U.fmtBytes = function (gb) {
    if (gb >= 1000) return U.fmt(gb / 1000, gb >= 10000 ? 0 : 1) + ' TB';
    if (gb >= 1) return U.fmt(gb, gb < 10 ? 1 : 0) + ' GB';
    return U.fmt(gb * 1000, 0) + ' MB';
  };
  U.fmtTime = function (s) {
    if (!isFinite(s)) return '∞';
    if (s < 1e-6) return U.fmt(s * 1e9, 0) + ' ns';
    if (s < 1e-3) return U.fmt(s * 1e6, 0) + ' µs';
    if (s < 1) return U.fmt(s * 1e3, s < 0.01 ? 1 : 0) + ' ms';
    if (s < 90) return U.fmt(s, s < 10 ? 1 : 0) + ' s';
    if (s < 5400) return U.fmt(s / 60, 1) + ' min';
    if (s < 172800) return U.fmt(s / 3600, 1) + ' h';
    if (s < 86400 * 60) return U.fmt(s / 86400, 1) + ' days';
    return U.fmt(s / (86400 * 30.4), 1) + ' months';
  };

  // ---------- easing ----------
  var E = U.ease = {
    linear: function (t) { return t; },
    inQuad: function (t) { return t * t; },
    outQuad: function (t) { return t * (2 - t); },
    inOutQuad: function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
    inCubic: function (t) { return t * t * t; },
    outCubic: function (t) { var u = t - 1; return u * u * u + 1; },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1; },
    outQuart: function (t) { var u = t - 1; return 1 - u * u * u * u; },
    outExpo: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; },
    outElastic: function (t) { if (t === 0 || t === 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1; },
    outBounce: function (t) {
      var n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  };
  /** CSS-like cubic-bezier easing (Newton–Raphson with bisection fallback) */
  U.cubicBezier = function (x1, y1, x2, y2) {
    function a(p1, p2) { return 1 - 3 * p2 + 3 * p1; }
    function b(p1, p2) { return 3 * p2 - 6 * p1; }
    function c(p1) { return 3 * p1; }
    function calc(t, p1, p2) { return ((a(p1, p2) * t + b(p1, p2)) * t + c(p1)) * t; }
    function slope(t, p1, p2) { return 3 * a(p1, p2) * t * t + 2 * b(p1, p2) * t + c(p1); }
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var t = x, i;
      for (i = 0; i < 6; i++) { var s = slope(t, x1, x2); if (Math.abs(s) < 1e-6) break; t -= (calc(t, x1, x2) - x) / s; }
      if (t < 0 || t > 1 || Math.abs(calc(t, x1, x2) - x) > 1e-4) {
        var lo = 0, hi = 1; t = x;
        for (i = 0; i < 20; i++) { var v = calc(t, x1, x2); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      }
      return calc(t, y1, y2);
    };
  };
  E.settle = U.cubicBezier(0.16, 1, 0.3, 1);
  E.camera = U.cubicBezier(0.65, 0, 0.35, 1);
  E.snap = U.cubicBezier(0.34, 1.56, 0.64, 1);
  E.fail = U.cubicBezier(0.55, 0, 1, 0.45);

  /** semi-implicit Euler spring. state = {x, v}; returns state */
  U.spring = function (st, target, dt, k, c) {
    k = k || 170; c = c || 26;
    st.v += (-k * (st.x - target) - c * st.v) * dt;
    st.x += st.v * dt;
    return st;
  };

  // ---------- seeded RNG (xmur3 + mulberry32) ----------
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return function () { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; };
  }
  function mulberry32(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  U.rng = function (seed) {
    var f = mulberry32(xmur3(String(seed))()), spare = null;
    var r = {
      float: f,
      range: function (a, b) { return a + (b - a) * f(); },
      int: function (a, b) { return Math.floor(a + (b - a + 1) * f()); },
      pick: function (arr) { return arr[Math.floor(f() * arr.length)]; },
      chance: function (p) { return f() < p; },
      gauss: function (mu, sigma) {
        mu = mu || 0; sigma = sigma == null ? 1 : sigma;
        if (spare !== null) { var s = spare; spare = null; return mu + sigma * s; }
        var u, v, q; do { u = f() * 2 - 1; v = f() * 2 - 1; q = u * u + v * v; } while (q >= 1 || q === 0);
        var m = Math.sqrt(-2 * Math.log(q) / q); spare = v * m; return mu + sigma * u * m;
      },
      shuffle: function (arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(f() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; },
      fork: function (label) { return U.rng(seed + '/' + label); }
    };
    return r;
  };
  /** cheap deterministic hash noise in 0..1 */
  U.hash = function (x, y) { var h = Math.sin(x * 127.1 + (y || 0) * 311.7) * 43758.5453; return h - Math.floor(h); };
  U.noise1 = function (x) { var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return U.lerp(U.hash(i), U.hash(i + 1), u); };

  // ---------- colour ----------
  var parseCache = {};
  U.parse = function (c) {
    if (typeof c !== 'string') return c;
    if (parseCache[c]) return parseCache[c];
    var r = 0, g = 0, b = 0, a = 1, m;
    c = c.trim();
    if (c[0] === '#') {
      var h = c.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
      if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
    } else if ((m = c.match(/rgba?\(([^)]+)\)/))) {
      var p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat); r = p[0]; g = p[1]; b = p[2]; if (p[3] != null) a = p[3];
    }
    return (parseCache[c] = { r: r, g: g, b: b, a: a });
  };
  var rgbaCache = {};
  /** rgba string for colour + alpha, memoised */
  U.rgba = function (c, alpha) {
    var key = c + '|' + alpha;
    var s = rgbaCache[key]; if (s) return s;
    var p = U.parse(c);
    s = 'rgba(' + Math.round(p.r) + ',' + Math.round(p.g) + ',' + Math.round(p.b) + ',' + (alpha == null ? p.a : alpha) + ')';
    rgbaCache[key] = s; return s;
  };
  U.toHex = function (p) {
    function h(v) { v = Math.round(U.clamp(v, 0, 255)).toString(16); return v.length < 2 ? '0' + v : v; }
    return '#' + h(p.r) + h(p.g) + h(p.b);
  };
  var mixCache = {};
  U.mix = function (a, b, t) {
    t = Math.round(t * 100) / 100;
    var key = a + b + t; if (mixCache[key]) return mixCache[key];
    var p = U.parse(a), q = U.parse(b);
    return (mixCache[key] = U.toHex({ r: p.r + (q.r - p.r) * t, g: p.g + (q.g - p.g) * t, b: p.b + (q.b - p.b) * t }));
  };
  function rgb2hsl(p) {
    var r = p.r / 255, g = p.g / 255, b = p.b / 255, max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
    }
    return { h: h, s: s, l: l };
  }
  function hsl2rgb(h, s, l) {
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return { r: f(p, q, h + 1 / 3) * 255, g: f(p, q, h) * 255, b: f(p, q, h - 1 / 3) * 255 };
  }
  var shadeCache = {};
  /** shift lightness by k (-1..1) */
  U.shade = function (c, k) {
    var key = c + '|' + k; if (shadeCache[key]) return shadeCache[key];
    var hsl = rgb2hsl(U.parse(c));
    var l = k >= 0 ? hsl.l + (1 - hsl.l) * k : hsl.l * (1 + k);
    return (shadeCache[key] = U.toHex(hsl2rgb(hsl.h, hsl.s, U.clamp(l, 0, 1))));
  };

  // Heat ramp (inferno-like, monotonic luminance)
  var HEAT = ['#120D2E', '#3E1A6B', '#8C2A7E', '#D2445E', '#F7823A', '#FDD262', '#FCFFA4'];
  var HEAT_T = [20, 30, 45, 60, 75, 85, 95];
  U.heatColor = function (T) {
    if (T <= HEAT_T[0]) return HEAT[0];
    for (var i = 1; i < HEAT_T.length; i++) {
      if (T <= HEAT_T[i]) return U.mix(HEAT[i - 1], HEAT[i], (T - HEAT_T[i - 1]) / (HEAT_T[i] - HEAT_T[i - 1]));
    }
    return HEAT[HEAT.length - 1];
  };
  /** 256-entry packed ABGR LUT for ImageData writes; index = temp mapped 20..100 °C */
  U.heatLUT = (function () {
    var lut = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var T = 20 + (i / 255) * 80, p = U.parse(U.heatColor(T));
      var a = Math.round(U.clamp((T - 22) / 30, 0, 1) * 235);
      lut[i] = (a << 24) | (Math.round(p.b) << 16) | (Math.round(p.g) << 8) | Math.round(p.r);
    }
    return lut;
  })();
})(window.SRV);
