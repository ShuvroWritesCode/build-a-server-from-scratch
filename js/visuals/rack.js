/* Ch4 · Rack elevation builder. A to-scale 42U front elevation (EIA-310 hole pattern), a parts tray,
   snap-to-U drag & drop (plus DOM buttons), a measuring tape for 1U, and a centre-of-gravity marker
   that makes a side-view rack tip forward when heavy gear goes high. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var NU = 42, UMM = 44.45;

  var TYPES = {
    srv1: { u: 1, kg: 18, w: 350, name: '1U server', short: '1U SRV' },
    srv2: { u: 2, kg: 28, w: 500, name: '2U server', short: '2U SRV' },
    sto4: { u: 4, kg: 40, w: 800, name: '4U storage', short: '4U STORAGE' },
    sw1: { u: 1, kg: 5, w: 150, name: '1U switch', short: 'SWITCH' },
    ups2: { u: 2, kg: 30, w: 60, name: '2U UPS', short: 'UPS' },
    blank: { u: 1, kg: 0.3, w: 0, name: '1U blank', short: 'BLANK' }
  };
  var ORDER = ['srv1', 'srv2', 'sto4', 'sw1', 'ups2', 'blank'];
  var START = [['ups2', 1], ['srv2', 3], ['srv2', 5], ['srv1', 7], ['sw1', 42]];
  var BAD = [['sto4', 39], ['ups2', 37], ['srv2', 35], ['srv2', 33], ['srv1', 32], ['sw1', 1]];

  S.defineVisual('rack', {
    init: function () {
      this.ctx = this.layer();
      this.placed = []; this.nid = 1; this.sel = 'srv2';
      this.drag = null; this.hover = null; this.tilt = 0; this.tape = 0; this.cogDisp = null;
      var self = this;
      START.forEach(function (s) { self.place(s[0], s[1], true); });
      var g = this.ui.group('Add equipment');
      this.segSel = g.seg({ label: 'Item', options: ORDER.map(function (k) { return [k, TYPES[k].name.replace(' server', ' srv').replace(' storage', ' storage')]; }), value: this.sel, onChange: function (v) { self.sel = v; } });
      g.button('＋ Add at lowest free U', function () { self.addLowest(self.sel); }, { kind: 'primary' });
      g.button('Remove last', function () { self.removeLast(); });
      this.ui.br();
      var g2 = this.ui.group('Layouts');
      g2.button('⚠ Heavy on top', function () { self.load(BAD, 'Heavy gear loaded at the top. The rack is top-heavy.'); }, { kind: 'danger' });
      g2.button('✓ Heaviest to the bottom', function () { self.sortHeavy(); });
      g2.button('Clear', function () { self.load([], 'Rack cleared.'); });
      this.ui.spacer();
      this.rU = this.ui.readout('U used', '–');
      this.rKg = this.ui.readout('Weight', '–');
      this.rW = this.ui.readout('Power', '–');
      this.rBal = this.ui.readout('Balance', '–');
      this.pointer({
        down: function (p) {
          var h = this.hits.query(p.x, p.y);
          if (!h) return false;
          if (h.data.tray) { this.startDrag(h.data.type, null, p, h.data); return true; }
          if (h.data.item) {
            var it = h.data.item; this.placed.splice(this.placed.indexOf(it), 1);
            this.startDrag(it.type, it, p, h.data); this.stats(); return true;
          }
          return false;
        },
        move: function (p) { if (this.drag) { this.drag.x = p.x; this.drag.y = p.y; this.drag.cand = this.candidate(p); } },
        up: function (p) { this.endDrag(p); },
        hover: function (p) {
          var h = this.hits.query(p.x, p.y), id = h ? h.id : null;
          if (id !== this.hover) { this.hover = id; this.invalidate(); }
          this.stage.style.cursor = h ? 'grab' : '';
          if (h) {
            var T = TYPES[h.data.type];
            this.tipAt('<b>' + T.name + '</b>' + T.u + 'U · ' + T.kg + ' kg · ' + T.w + ' W' + (h.data.item ? '<br>U' + h.data.item.u + (T.u > 1 ? '–' + (h.data.item.u + T.u - 1) : '') + ' · drag out to remove' : '<br>drag into the rack'), p.x, p.y);
          } else this.tipAt(null);
        },
        leave: function () { this.hover = null; }
      });
      this.stats();
    },
    onVisible: function () {
      if (this._taped) return; this._taped = true;
      var self = this;
      this.tween({ from: 0, to: 1, dur: 1.4, delay: 0.3, ease: 'outCubic', onUpdate: function (v) { self.tape = v; } });
    },

    // ------------------------------------------------------------ model
    occ: function (skip) {
      var o = new Array(NU + 2);
      this.placed.forEach(function (it) { if (it === skip) return; for (var k = 0; k < TYPES[it.type].u; k++) o[it.u + k] = it; });
      return o;
    },
    fits: function (type, u) {
      var n = TYPES[type].u; if (u < 1 || u + n - 1 > NU) return false;
      var o = this.occ(); for (var k = 0; k < n; k++) if (o[u + k]) return false; return true;
    },
    lowest: function (type) { for (var u = 1; u <= NU; u++) if (this.fits(type, u)) return u; return 0; },
    place: function (type, u, quiet) {
      var it = { id: this.nid++, type: type, u: u, dy: 0 };
      this.placed.push(it);
      if (!quiet) {
        var self = this;
        it.dy = -14;
        this.tween({ from: -14, to: 0, dur: 0.45, ease: 'outBack', onUpdate: function (v) { it.dy = v; } });
        this.stats();
      }
      return it;
    },
    addLowest: function (type) {
      var u = this.lowest(type), T = TYPES[type];
      if (!u) { this.announce('No room for a ' + T.name + '.'); this.flash = 1; return; }
      this.place(type, u);
      this.announce(T.name + ' added at U' + u + '. ' + this.balanceText());
    },
    removeLast: function () {
      var it = this.placed.pop();
      if (it) { this.stats(); this.announce(TYPES[it.type].name + ' removed from U' + it.u + '. ' + this.balanceText()); }
    },
    load: function (list, msg) {
      var self = this; this.placed = [];
      list.forEach(function (s, i) { var it = self.place(s[0], s[1], true); it.dy = -10; self.tween({ from: -10 - i * 3, to: 0, dur: 0.5, delay: i * 0.05, ease: 'outBack', onUpdate: function (v) { it.dy = v; } }); });
      this.stats(); this.announce(msg + ' ' + this.balanceText());
    },
    sortHeavy: function () {
      var items = this.placed.slice().sort(function (a, b) { return TYPES[b.type].kg - TYPES[a.type].kg; });
      var self = this, u = 1, sw = [];
      // switches traditionally live at the top; keep them there
      items = items.filter(function (it) { if (it.type === 'sw1') { sw.push(it); return false; } return true; });
      items.forEach(function (it) {
        var from = it.u; it.u = u; u += TYPES[it.type].u;
        var dyPx = (it.u - from) * (self.pu || 10);
        it.dy = dyPx; self.tween({ from: dyPx, to: 0, dur: 0.7, ease: 'settle', onUpdate: function (v) { it.dy = v; } });
      });
      var top = NU;
      sw.forEach(function (it) { var from = it.u; it.u = top--; var d = (it.u - from) * (self.pu || 10); it.dy = d; self.tween({ from: d, to: 0, dur: 0.7, onUpdate: function (v) { it.dy = v; } }); });
      this.stats(); this.announce('Re-racked heaviest equipment at the bottom. ' + this.balanceText());
    },
    stats: function () {
      var used = 0, kg = 0, w = 0, m = 0;
      this.placed.forEach(function (it) { var T = TYPES[it.type]; used += T.u; kg += T.kg; w += T.w; m += T.kg * (it.u - 1 + T.u / 2); });
      var cog = kg > 0 ? m / kg : 0, frac = cog / NU;
      var level = kg < 25 ? 0 : frac > 0.6 ? 2 : frac > 0.42 ? 1 : 0;
      this.st = { used: used, kg: kg, w: w, cog: cog, frac: frac, level: level };
      this.tiltT = level === 2 ? U.remap(frac, 0.6, 0.95, 2.5, 4.5, true) * Math.min(1, kg / 120) + 1 : level === 1 ? 0.8 : 0;
      this.rU.set(used + ' / ' + NU, used >= NU ? 'warn' : '');
      this.rKg.set(Math.round(kg) + ' kg');
      this.rW.set(w >= 1000 ? (w / 1000).toFixed(2) + ' kW' : w + ' W');
      this.rBal.set(level === 2 ? '✕ Tip risk' : level === 1 ? '⚠ Top-heavy' : '✓ Stable', level === 2 ? 'bad' : level === 1 ? 'warn' : 'ok');
      this.setActive(true);
    },
    balanceText: function () {
      var s = this.st;
      if (!s.kg) return 'The rack is empty.';
      return 'Centre of gravity at U' + s.cog.toFixed(0) + ' of 42: ' + (s.level === 2 ? 'danger, the rack can tip forward.' : s.level === 1 ? 'top-heavy, move heavy gear down.' : 'stable.');
    },

    // ------------------------------------------------------------ drag
    startDrag: function (type, item, p, data) {
      var T = TYPES[type];
      this.drag = { type: type, item: item, x: p.x, y: p.y, gx: p.x - data.x, gy: p.y - data.y, scale: data.scale || 1, cand: 0 };
      this.drag.cand = this.candidate(p);
      this.setActive(true);
    },
    candidate: function (p) {
      var d = this.drag, R = this.R; if (!d) return 0;
      var T = TYPES[d.type], w = 482.6 * this.k;
      var cx = p.x - d.gx + w / 2;
      if (Math.abs(cx - R.cx) > w * 0.75) return 0;
      var top = p.y - d.gy / d.scale;
      var bottomPx = top + T.u * this.pu;
      var u = Math.round((R.uBottom - bottomPx) / this.pu) + 1;
      u = U.clamp(u, 1, NU - T.u + 1);
      if (this.fits(d.type, u)) return u;
      // nearest free slot within 2U
      for (var o = 1; o <= 2; o++) { if (this.fits(d.type, u + o)) return u + o; if (this.fits(d.type, u - o)) return u - o; }
      return -u;
    },
    endDrag: function (p) {
      var d = this.drag; if (!d) return;
      var T = TYPES[d.type], c = this.candidate(p);
      this.drag = null;
      if (c > 0) {
        var it = this.place(d.type, c, true);
        var fromY = p.y - d.gy, toY = this.R.uBottom - (c - 1 + T.u) * this.pu;
        var self = this;
        it.dy = fromY - toY;
        this.tween({ from: it.dy, to: 0, dur: 0.35, ease: 'outBack', onUpdate: function (v) { it.dy = v; } });
        this.stats();
        this.announce(T.name + ' placed at U' + c + '. ' + this.balanceText());
      } else {
        this.stats();
        if (d.item) this.announce(T.name + ' removed. ' + this.balanceText());
      }
    },

    update: function (dt) {
      this.tilt = U.damp(this.tilt, this.tiltT || 0, this.reduced() ? 30 : 5, dt);
      var cogT = this.st ? this.st.cog : 0;
      this.cogDisp = this.cogDisp == null ? cogT : U.damp(this.cogDisp, cogT, 8, dt);
      if (!this.drag && Math.abs(this.tilt - (this.tiltT || 0)) < 0.01 && Math.abs(this.cogDisp - cogT) < 0.01) { this.tilt = this.tiltT || 0; this.cogDisp = cogT; this.setActive(false); }
    },

    // ------------------------------------------------------------ layout
    resize: function (w, h) {
      var mob = this.mobile = w < 560;
      var top = mob ? 26 : 34, bot = mob ? 26 : 34;
      this.pu = (h - top - bot - 16) / NU;
      this.k = this.pu / UMM;
      var fw = 600 * this.k;
      var rx = mob ? 30 : Math.max(220, w * 0.24);
      this.R = { x: rx, y: top, w: fw, h: NU * this.pu + 16, cx: rx + fw / 2, uTop: top + 8, uBottom: top + 8 + NU * this.pu };
      this.tray = mob ? null : { x: 18, y: top + 8, w: rx - 70 };
      var px = rx + fw + (mob ? 22 : 70);
      this.side = { x: px, w: w - px - (mob ? 10 : 24) };
    },

    // ------------------------------------------------------------ drawing
    drawItem: function (ctx, type, x, y, wpx, hpx, alpha, ghost) {
      var P = S.pal, T = TYPES[type], t = this.time;
      ctx.save(); if (alpha != null) ctx.globalAlpha = alpha;
      if (ghost) {
        D.box(ctx, x, y, wpx, hpx, 2, U.rgba(ghost, 0.18), ghost, 1.5);
        ctx.restore(); return;
      }
      var ear = 9 * this.k * 1.2, body = type === 'sw1' ? U.shade(P.plastic, 0.1) : type === 'blank' ? U.mix(P.steel, P.bg, 0.25) : P.steel;
      D.box(ctx, x, y + 0.5, wpx, hpx - 1, 1.5, U.shade(body, -0.25), U.shade(body, -0.55), 1);
      var fx = x + ear, fw = wpx - ear * 2, fy = y + 1.5, fh = hpx - 3;
      ctx.fillStyle = body; ctx.fillRect(fx, fy, fw, fh);
      var lblW = fw * 0.27, i, j;
      if (type === 'srv1' || type === 'srv2' || type === 'sto4') {
        var cols = type === 'srv1' ? 10 : type === 'srv2' ? 4 : 6, rows = type === 'srv1' ? 1 : type === 'srv2' ? 3 : 4;
        var bx = fx + lblW, bw = (fw - lblW - 2) / cols, bh = fh / rows;
        for (j = 0; j < rows; j++) for (i = 0; i < cols; i++) {
          ctx.fillStyle = U.shade(P.plastic, -0.05); ctx.fillRect(bx + i * bw + 0.6, fy + j * bh + 0.6, bw - 1.2, bh - 1.2);
          if (bh > 4) { ctx.fillStyle = U.rgba(P.alu, 0.35); ctx.fillRect(bx + i * bw + bw * 0.55, fy + j * bh + bh * 0.3, bw * 0.3, bh * 0.4); }
          if (bw > 5 && U.noise1(t * 7 + i * 1.7 + j * 3.1 + x) > 0.55) { ctx.fillStyle = P.ok; ctx.fillRect(bx + i * bw + 1.5, fy + j * bh + 1.4, 1.5, 1.5); }
        }
      } else if (type === 'sw1') {
        var n = 12, pw = (fw - lblW - 30) / n;
        for (i = 0; i < n; i++) for (j = 0; j < 2; j++) {
          var px2 = fx + lblW + i * pw, py2 = fy + 1 + j * (fh / 2);
          ctx.fillStyle = P.bg0; ctx.fillRect(px2 + 0.5, py2 + 0.5, pw - 1.5, fh / 2 - 2);
          if (U.noise1(t * 9 + i * 2.3 + j * 7) > 0.5) { ctx.fillStyle = P.net; ctx.fillRect(px2 + 0.5, py2 + 0.5, 1.5, 1.2); }
        }
        for (i = 0; i < 4; i++) { ctx.fillStyle = U.shade(P.alu, -0.3); ctx.fillRect(fx + fw - 28 + i * 7, fy + 1.5, 5.5, fh - 3); }
      } else if (type === 'ups2') {
        var sx = fx + lblW + 4, sy = fy + fh * 0.2;
        D.box(ctx, sx, sy, fw * 0.16, fh * 0.42, 1.5, U.mix(P.bg0, P.data, 0.25), U.rgba(P.data, 0.6), 1);
        D.text(ctx, '100%', sx + fw * 0.08, sy + fh * 0.21, { size: Math.max(5, fh * 0.22), weight: 700, color: P.data, align: 'center' });
        ctx.fillStyle = U.rgba('#000', 0.35);
        for (i = 0; i < 16; i++) ctx.fillRect(fx + fw * 0.5 + i * fw * 0.028, fy + 2, fw * 0.014, fh - 4);
        D.circle(ctx, fx + fw * 0.42, fy + fh * 0.5, Math.max(1.5, fh * 0.12), U.shade(P.alu, -0.2));
        D.circle(ctx, fx + fw * 0.42, fy + fh * 0.5, Math.max(0.8, fh * 0.05), P.ok);
      } else {
        ctx.fillStyle = U.rgba('#000', 0.18);
        for (i = 0; i < 18; i++) ctx.fillRect(fx + fw * 0.2 + i * fw * 0.035, fy + fh * 0.3, fw * 0.015, fh * 0.4);
      }
      if (type !== 'blank' && hpx > 7) D.circle(ctx, fx + 3, fy + fh / 2, 1.3, P.ok);
      if (hpx >= 8 && lblW > 30) D.text(ctx, T.short + (this.mobile ? '' : ' · ' + T.kg + 'kg'), fx + 7, fy + fh / 2 + 0.5, { size: Math.min(9, Math.max(6.5, hpx * 0.62)), weight: 700, color: type === 'blank' ? P.text3 : (P.dark ? P.text1 : P.bg0), maxW: lblW - 8 });
      ctx.restore();
    },

    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, R = this.R, pu = this.pu, k = this.k, mob = this.mobile, self = this;
      D.clear(ctx, w, h);
      this.hits.clear();
      var st = this.st, lvlCol = st.level === 2 ? P.fault : st.level === 1 ? P.warn : P.ok;

      // ---- rack frame
      var earW = 482.6 * k, ex = R.cx - earW / 2;
      D.box(ctx, R.x, R.y, R.w, R.h, 3, U.rgba(P.bg0, 0.9), U.shade(P.steel, -0.2), 1.5);
      ctx.fillStyle = P.steel; ctx.fillRect(R.x, R.y, R.w, 8); ctx.fillRect(R.x, R.uBottom, R.w, 8);
      ctx.fillStyle = U.shade(P.steel, -0.15); ctx.fillRect(R.x, R.y + 8, ex - R.x - 2, R.h - 16); ctx.fillRect(ex + earW + 2, R.y + 8, R.x + R.w - ex - earW - 2, R.h - 16);
      // feet
      ctx.fillStyle = U.shade(P.steel, -0.3); ctx.fillRect(R.x + 4, R.y + R.h, 10, 5); ctx.fillRect(R.x + R.w - 14, R.y + R.h, 10, 5);
      D.line(ctx, R.x - 30, R.y + R.h + 5, R.x + R.w + 30, R.y + R.h + 5, U.rgba(P.text3, 0.6), 1);
      // rails with EIA-310 holes (holes at 0.25", 0.875", 1.5" in each U)
      var railW = 16 * k;
      [ex, ex + earW - railW].forEach(function (rx2) {
        ctx.fillStyle = U.shade(P.steel, 0.12); ctx.fillRect(rx2, R.uTop, railW, NU * pu);
        ctx.fillStyle = P.bg0;
        var hs = Math.max(1.2, 9.5 * k);
        for (var u = 0; u < NU; u++) {
          [6.35, 22.225, 38.1].forEach(function (off) { var hy = R.uBottom - (u * UMM + off) * k; ctx.fillRect(rx2 + railW / 2 - hs / 2, hy - hs / 2, hs, hs); });
        }
      });
      // U grid + numbers
      for (var u = 1; u <= NU; u++) {
        var yb = R.uBottom - (u - 1) * pu;
        D.line(ctx, ex + railW, yb, ex + earW - railW, yb, U.rgba(P.grid, 0.45), 1);
        if (!mob || u % 2 === 1 || u === NU) D.text(ctx, String(u), R.x - 5, yb - pu / 2, { size: mob ? 7.5 : 8.5, color: u % 5 === 0 ? P.text2 : P.text3, align: 'right' });
      }
      D.text(ctx, '42U · 19-INCH RACK', R.cx, R.y - 12, { size: mob ? 8.5 : 10, weight: 700, color: P.text2, align: 'center', ls: 1 });

      // ---- placed items
      this.placed.forEach(function (it) {
        var T = TYPES[it.type], y = R.uBottom - (it.u - 1 + T.u) * pu + (it.dy || 0);
        self.drawItem(ctx, it.type, ex, y, earW, T.u * pu);
        if (self.hover === 'p' + it.id) D.box(ctx, ex - 1, y - 0.5, earW + 2, T.u * pu + 1, 2, null, P.accent, 1.5);
        self.hits.rect('p' + it.id, ex, y, earW, T.u * pu, { item: it, type: it.type, x: ex, y: y });
      });

      // ---- centre of gravity marker
      if (st.kg > 0) {
        var cg = this.cogDisp == null ? st.cog : this.cogDisp, cy = R.uBottom - cg * pu;
        ctx.setLineDash([4, 3]); D.line(ctx, R.x - 2, cy, R.x + R.w + 14, cy, U.rgba(lvlCol, 0.9), 1.2); ctx.setLineDash([]);
        var cx2 = R.x + R.w + 14, r = mob ? 6 : 7.5;
        D.circle(ctx, cx2, cy, r, P.bg, lvlCol, 1.5);
        ctx.fillStyle = lvlCol; ctx.beginPath(); ctx.moveTo(cx2, cy); ctx.arc(cx2, cy, r, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx2, cy); ctx.arc(cx2, cy, r, Math.PI / 2, Math.PI); ctx.closePath(); ctx.fill();
        if (!mob) {
          D.text(ctx, 'CG · U' + cg.toFixed(0), cx2 + 12, cy - 6, { size: 10, weight: 700, color: lvlCol });
          D.text(ctx, st.level === 2 ? 'tip risk' : st.level === 1 ? 'top-heavy' : 'low = stable', cx2 + 12, cy + 7, { size: 9, color: P.text3 });
        }
        if (st.level === 2) {
          ctx.save(); ctx.globalAlpha = 0.5 + 0.2 * Math.sin((this.time || 0) * 4);
          ctx.fillStyle = D.hatch(ctx, U.rgba(P.fault, 0.35), 6);
          ctx.fillRect(ex - 4, R.uTop, 3, NU * pu * 0.4); ctx.fillRect(ex + earW + 1, R.uTop, 3, NU * pu * 0.4);
          ctx.restore();
        }
      }

      // ---- tray (desktop)
      if (this.tray) {
        var T0 = this.tray, ty = T0.y + 14, tw = Math.min(T0.w, earW), sc = 1;
        D.text(ctx, 'PARTS TRAY · DRAG →', T0.x, T0.y, { size: 9, weight: 700, color: P.text3, ls: 1.2 });
        ORDER.forEach(function (key) {
          var T = TYPES[key], ih = T.u * pu, hov = self.hover === 't' + key;
          self.drawItem(ctx, key, T0.x, ty, tw, ih);
          if (hov) D.box(ctx, T0.x - 1, ty - 0.5, tw + 2, ih + 1, 2, null, P.accent, 1.5);
          D.text(ctx, T.name, T0.x, ty + ih + 9, { size: 10, weight: 600, color: hov ? P.accent : P.text2 });
          D.text(ctx, T.kg + ' kg · ' + T.w + ' W', T0.x + tw, ty + ih + 9, { size: 9, color: P.text3, align: 'right' });
          self.hits.rect('t' + key, T0.x, ty, tw, ih, { tray: true, type: key, x: T0.x, y: ty });
          ty += ih + 30;
        });
      }

      // ---- drag ghost + floating item
      var d = this.drag;
      if (d) {
        var T = TYPES[d.type], ih2 = T.u * pu;
        if (d.cand) {
          var cu = Math.abs(d.cand), gy = R.uBottom - (cu - 1 + T.u) * pu;
          this.drawItem(ctx, d.type, ex, gy, earW, ih2, 1, d.cand > 0 ? P.accent : P.fault);
          D.text(ctx, d.cand > 0 ? 'U' + cu + (T.u > 1 ? '–' + (cu + T.u - 1) : '') : 'occupied', ex + earW + 6, gy + ih2 / 2, { size: 10, weight: 700, color: d.cand > 0 ? P.accent : P.fault });
        } else if (d.item) {
          D.text(ctx, 'drop to remove', d.x, d.y - d.gy - 10, { size: 10, weight: 700, color: P.fault, align: 'center' });
        }
        this.drawItem(ctx, d.type, d.x - d.gx, d.y - d.gy, earW, ih2, 0.85);
      }

      // ---- right panel: measuring tape detail + side view
      this.drawTape(ctx);
      this.drawSide(ctx, lvlCol);

      this.setDesc(st.used + ' of 42 U used, ' + Math.round(st.kg) + ' kg, ' + st.w + ' W. ' + this.balanceText());
    },

    drawTape: function (ctx) {
      var P = S.pal, S0 = this.side, R = this.R, mob = this.mobile, k = this.k;
      var boxH = mob ? 120 : Math.min(200, this.h * 0.36), boxW = Math.min(S0.w, mob ? 160 : 300);
      var bx = S0.x, by = R.uTop + 4;
      this.tapeBox = { x: bx, y: by, w: boxW, h: boxH };
      D.box(ctx, bx, by, boxW, boxH, 8, U.rgba(P.panel, 0.75), U.rgba(P.blueprint, 0.35), 1);
      D.text(ctx, mob ? 'DETAIL · 1U' : 'DETAIL · ONE RACK UNIT', bx + 10, by + 14, { size: 9, weight: 700, color: P.text3, ls: 1.2 });
      // callout from rack U41-42 right rail
      var earW = 482.6 * k, rrx = R.cx + earW / 2 - 8 * k, ry = R.uTop + R.uBottom - R.uTop - (NU - 1) * this.pu - this.pu / 2;
      ry = R.uTop + this.pu * 1.5;
      D.circle(ctx, rrx, ry, this.pu * 1.3, null, U.rgba(P.blueprint, 0.8), 1);
      ctx.setLineDash([3, 3]); D.line(ctx, rrx + this.pu * 1.3, ry, bx, by + boxH * 0.5, U.rgba(P.blueprint, 0.5), 1); ctx.setLineDash([]);
      // zoomed rail: 1.5 U visible, 1U = zu px
      var zu = (boxH - 40) / 1.35, railX = bx + (mob ? 22 : 76), railW = zu * 15.9 / UMM, top = by + 26, base = top + zu * 1.25;
      ctx.save(); D.rr(ctx, bx + 1, by + 20, boxW - 2, boxH - 22, 7); ctx.clip();
      ctx.fillStyle = U.shade(P.steel, 0.12); ctx.fillRect(railX, by + 20, railW, boxH);
      ctx.fillStyle = P.bg0;
      var hs = zu * 9.5 / UMM;
      for (var uu = -1; uu <= 1; uu++) [6.35, 22.225, 38.1].forEach(function (off) { var hy = base - (uu * UMM + off) * zu / UMM; ctx.fillRect(railX + railW / 2 - hs / 2, hy - hs / 2, hs, hs); });
      // unit boundaries
      [0, 1].forEach(function (q) { var yy = base - q * zu; D.line(ctx, railX - 6, yy, railX + railW + 6, yy, P.blueprint, 1); });
      ctx.restore();
      // measuring tape (extends with this.tape)
      var tx = railX + railW + (mob ? 10 : 18), tl = zu * this.tape, tw = mob ? 10 : 14;
      var caseY = base + 2;
      ctx.fillStyle = P.warn; ctx.fillRect(tx, caseY - tl, tw, tl);
      ctx.fillStyle = U.rgba(P.bg0, 0.8);
      for (var mm = 0; mm <= 44.45 * this.tape; mm += 1) {
        var yy2 = caseY - mm * zu / UMM, len = mm % 10 === 0 ? tw * 0.7 : mm % 5 === 0 ? tw * 0.5 : tw * 0.28;
        if (zu / UMM > 1.3 || mm % 5 === 0) ctx.fillRect(tx, yy2, len, 0.8);
      }
      ctx.fillStyle = U.shade(P.warn, -0.4); ctx.fillRect(tx - 1, caseY - tl - 2, tw + 2, 2.5);
      D.box(ctx, tx - 5, caseY, tw + 10, mob ? 10 : 14, 3, U.shade(P.steel, -0.2), P.alu, 1);
      if (this.tape > 0.98 && !mob) {
        // hole spacing ⅝ ⅝ ½
        var hx = railX - 10;
        var hy0 = base - 6.35 * zu / UMM, hy1 = base - 22.225 * zu / UMM, hy2 = base - 38.1 * zu / UMM, hy3 = base - (UMM + 6.35) * zu / UMM;
        D.dim(ctx, hx, hy0, hx, hy1, '', {}); D.dim(ctx, hx, hy1, hx, hy2, '', {}); D.dim(ctx, hx, hy2, hx, hy3, '', {});
        [['5/8 in', hy0, hy1], ['5/8 in', hy1, hy2], ['1/2 in', hy2, hy3]].forEach(function (q) { D.text(ctx, q[0], hx - 6, (q[1] + q[2]) / 2, { size: 10, weight: 700, color: P.blueprint, align: 'right' }); });
        D.text(ctx, 'EIA-310 holes', bx + boxW - 10, by + boxH - 10, { size: 9, color: P.text3, align: 'right' });
      }
      var lx = tx + tw + (mob ? 8 : 14);
      ctx.globalAlpha = U.clamp(this.tape * 1.4 - 0.4, 0, 1);
      D.text(ctx, '1U', lx, base - zu * 0.62, { size: mob ? 14 : 20, weight: 800, color: P.text1 });
      D.text(ctx, '= 1.75 in', lx, base - zu * 0.62 + (mob ? 15 : 20), { size: mob ? 10 : 12, weight: 600, color: P.warn });
      D.text(ctx, '= 44.45 mm', lx, base - zu * 0.62 + (mob ? 28 : 37), { size: mob ? 10 : 12, weight: 600, color: P.warn });
      ctx.globalAlpha = 1;
    },

    drawSide: function (ctx, lvlCol) {
      var P = S.pal, S0 = this.side, st = this.st, mob = this.mobile, tb = this.tapeBox;
      var top = tb.y + tb.h + (mob ? 26 : 34), bottom = this.R.y + this.R.h + 5, availH = bottom - top - (mob ? 30 : 16);
      if (availH < 60) return;
      var sc = Math.min(availH / 2000, (S0.w - 24) / 1440), rw = 1000 * sc, rh = 2000 * sc;
      var footX = S0.x + (mob ? 6 : 60) + rw, footY = bottom;  // front-bottom pivot (front = right)
      D.text(ctx, 'SIDE VIEW', S0.x, top - 12, { size: 9, weight: 700, color: P.text3, ls: 1.2 });
      D.line(ctx, S0.x, footY, S0.x + S0.w, footY, U.rgba(P.text3, 0.6), 1);
      ctx.fillStyle = D.hatch(ctx, U.rgba(P.text3, 0.3), 5); ctx.fillRect(S0.x, footY, S0.w, 5);
      var ang = this.tilt * Math.PI / 180;
      ctx.save(); ctx.translate(footX, footY); ctx.rotate(ang);
      // frame (x from -rw..0, y from -rh..0)
      D.box(ctx, -rw, -rh, rw, rh, 2, U.rgba(P.bg0, 0.6), U.shade(P.steel, P.dark ? 0.15 : -0.2), 1.5);
      ctx.fillStyle = U.shade(P.steel, -0.1); ctx.fillRect(-rw, -rh, 3, rh); ctx.fillRect(-3, -rh, 3, rh);
      var self = this, topHeavy = null;
      this.placed.forEach(function (it) {
        var T = TYPES[it.type], depth = it.type === 'sw1' || it.type === 'blank' ? 300 : it.type === 'ups2' ? 600 : 760;
        var y0 = -(70 + (it.u - 1 + T.u) * UMM) * sc, hh = T.u * UMM * sc;
        var out = 0;
        if (st.level === 2 && T.kg >= 28 && (!topHeavy || it.u > topHeavy.u)) topHeavy = it;
        ctx.fillStyle = it.type === 'blank' ? U.rgba(P.steel, 0.4) : P.steel;
        ctx.fillRect(-depth * sc - 6 * sc, y0 + 0.5, depth * sc, Math.max(1, hh - 1));
      });
      if (topHeavy) {
        // the classic accident: heaviest top unit slid out on its rails
        var T = TYPES[topHeavy.type], y1 = -(70 + (topHeavy.u - 1 + T.u) * UMM) * sc, hh2 = T.u * UMM * sc;
        ctx.fillStyle = U.mix(P.steel, P.fault, 0.35); ctx.fillRect(-760 * sc * 0.45, y1, 760 * sc, hh2);
        ctx.strokeStyle = P.fault; ctx.lineWidth = 1; ctx.strokeRect(-760 * sc * 0.45, y1, 760 * sc, hh2);
      }
      // COG
      if (st.kg > 0) {
        var cgY = -(70 + (this.cogDisp == null ? st.cog : this.cogDisp) * UMM) * sc, cgX = -rw * 0.48;
        D.circle(ctx, cgX, cgY, 5, P.bg, lvlCol, 1.5);
        ctx.fillStyle = lvlCol; ctx.beginPath(); ctx.moveTo(cgX, cgY); ctx.arc(cgX, cgY, 5, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cgX, cgY); ctx.arc(cgX, cgY, 5, Math.PI / 2, Math.PI); ctx.closePath(); ctx.fill();
        ctx.setLineDash([2, 3]); D.line(ctx, cgX, cgY + 6, cgX, 0, U.rgba(lvlCol, 0.6), 1); ctx.setLineDash([]);
      }
      ctx.restore();
      D.text(ctx, 'FRONT →', footX + 4, footY + 12, { size: 8.5, color: P.text3 });
      if (st.level > 0) {
        D.g.warn(ctx, S0.x + 8, top + 8, 14, lvlCol);
        D.text(ctx, st.level === 2 ? 'TIPS FORWARD' : 'TOP-HEAVY', S0.x + 20, top + 8, { size: mob ? 9 : 10.5, weight: 800, color: lvlCol });
        if (!mob) D.text(ctx, st.level === 2 ? 'when a top unit slides out' : 'move heavy gear down', S0.x + 20, top + 22, { size: 9.5, color: P.text3 });
      } else {
        D.g.check(ctx, S0.x + 8, top + 8, 14, P.ok);
        D.text(ctx, 'STABLE', S0.x + 20, top + 8, { size: mob ? 9 : 10.5, weight: 800, color: P.ok });
        if (!mob) D.text(ctx, 'heavy gear at the bottom', S0.x + 20, top + 22, { size: 9.5, color: P.text3 });
      }
    }
  });
})(window.SRV);
