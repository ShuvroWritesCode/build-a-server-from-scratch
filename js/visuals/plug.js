/* Ch12 · Plug it in. A NIC bracket (face-on) with RJ45, SFP+ and QSFP28 ports and a tray of cables
   drawn end-on so the SHAPES must match: Cat6 (RJ45 plug), SFP+ DAC twinax, fibre + SFP+ SR optic,
   QSFP28 DAC. Match → clicks in, link LED + speed. Mismatch → shake + reason.
   A fibre cutaway shows light zig-zagging down the core by total internal reflection. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var PORTS = [
    { key: 'rj45', name: 'RJ45', sub: '10GBASE-T', w: 40, h: 34 },
    { key: 'sfp', name: 'SFP+', sub: '10 Gb/s cage', w: 52, h: 20 },
    { key: 'qsfp', name: 'QSFP28', sub: '100 Gb/s cage', w: 68, h: 24 }
  ];
  var CABLES = [
    { key: 'cat6', name: 'Cat6', sub: 'RJ45 plug', fits: 'rj45', speed: '10 Gb/s', w: 36, h: 30, col: 'blueprint', lw: 6 },
    { key: 'dac', name: 'DAC twinax', sub: 'SFP+ ends', fits: 'sfp', speed: '10 Gb/s', w: 48, h: 16, col: 'cable', lw: 5 },
    { key: 'fiber', name: 'Fiber + SR optic', sub: 'SFP+ transceiver', fits: 'sfp', speed: '10 Gb/s', w: 48, h: 16, col: 'air', lw: 3 },
    { key: 'qdac', name: 'QSFP28 DAC', sub: '4 lanes × 25G', fits: 'qsfp', speed: '100 Gb/s', w: 64, h: 20, col: 'cable', lw: 7 }
  ];
  var WHY = {
    'cat6>sfp': 'RJ45 plug won’t fit an SFP cage', 'cat6>qsfp': 'RJ45 plug won’t fit a QSFP cage',
    'dac>rj45': 'SFP module ≠ Ethernet jack', 'dac>qsfp': 'SFP+ is too narrow for QSFP28',
    'fiber>rj45': 'optic module ≠ Ethernet jack', 'fiber>qsfp': 'SFP+ optic too narrow for QSFP28',
    'qdac>rj45': 'QSFP28 ≠ Ethernet jack', 'qdac>sfp': 'QSFP28 is too wide for SFP+'
  };

  S.defineVisual('plug', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.sel = 0;
      this.cab = CABLES.map(function () { return { port: -1, x: 0, y: 0, shake: 0, lift: 0 }; });
      this.portCab = [-1, -1, -1];
      this.click = [0, 0, 0];
      this.msg = null;
      var self = this;
      var g = this.ui.group('Pick a cable');
      this.segCable = g.seg({ label: 'Cable', options: CABLES.map(function (c, i) { return [i, c.name]; }), value: 0, onChange: function (v) { self.select(v); } });
      this.ui.br();
      var g2 = this.ui.group('Plug into');
      PORTS.forEach(function (p, i) { g2.button('→ ' + p.name, function () { self.attempt(self.sel, i); }); });
      g2.button('↺ Unplug all', function () { self.unplugAll(); });
      this.ui.spacer();
      this.rLinks = this.ui.readout('Links up', '0 / 3');
      this.pointer({
        down: function (p) {
          var hit = this.hits.query(p.x, p.y);
          if (!hit) return false;
          if (hit.id === 'cable') {
            var c = this.cab[hit.data];
            if (c.port >= 0) { this.unplug(hit.data, true); return false; }
            this.select(hit.data); this.segCable.set(hit.data);
            this.drag = { i: hit.data, dx: c.x - p.x, dy: c.y - p.y };
            return true;
          }
          if (hit.id === 'port') { this.attempt(this.sel, hit.data); return false; }
          return false;
        },
        move: function (p) { if (!this.drag) return; var c = this.cab[this.drag.i]; c.x = p.x + this.drag.dx; c.y = p.y + this.drag.dy; },
        up: function (p) {
          if (!this.drag) return;
          var i = this.drag.i; this.drag = null;
          var hit = null, list = this.portHits;
          for (var k = 0; k < list.length; k++) { var q = list[k]; if (Math.abs(p.x - q.x) < q.w / 2 + 26 && Math.abs(p.y - q.y) < q.h / 2 + 30) hit = k; }
          if (hit != null) this.attempt(i, hit, true); else this.home(i);
        },
        hover: function (p) {
          var hit = this.hits.query(p.x, p.y);
          this.stage.style.cursor = hit ? (hit.id === 'cable' ? 'grab' : 'pointer') : '';
          if (hit && hit.id === 'cable') this.tipAt('<b>' + CABLES[hit.data].name + '</b> · ' + CABLES[hit.data].sub + (this.cab[hit.data].port >= 0 ? ' — click to unplug' : ' — drag it to a port'), p.x, p.y);
          else if (hit && hit.id === 'port') this.tipAt('<b>' + PORTS[hit.data].name + '</b> port · ' + PORTS[hit.data].sub, p.x, p.y);
          else this.tipAt(null);
        }
      });
    },
    select: function (i) { this.sel = i; var self = this; this.cab.forEach(function (c, k) { var to = k === i && c.port < 0 ? 1 : 0; if (c.lift !== to) self.tween({ from: c.lift, to: to, dur: 0.3, onUpdate: function (v) { c.lift = v; } }); }); },
    trayPos: function (i) { return this.tray[i]; },
    home: function (i, delay) {
      var c = this.cab[i], t = this.trayPos(i), self = this;
      c.port = -1;
      this.tween({ from: 0, to: 1, dur: 0.5, delay: delay || 0, ease: 'settle', onUpdate: (function (x0, y0) { return function (k) { c.x = U.lerp(x0, t.x, k); c.y = U.lerp(y0, t.y, k); }; })(c.x, c.y) });
      void self;
    },
    unplug: function (i, speak) {
      var c = this.cab[i];
      if (c.port >= 0) this.portCab[c.port] = -1;
      this.home(i);
      if (speak) this.announce(CABLES[i].name + ' unplugged.');
      this.links();
    },
    unplugAll: function () { for (var i = 0; i < CABLES.length; i++) if (this.cab[i].port >= 0) this.unplug(i); this.msg = null; this.announce('All cables back in the tray.'); },
    attempt: function (i, pi, dragged) {
      var C = CABLES[i], Pt = PORTS[pi], c = this.cab[i], q = this.portHits[pi], self = this;
      if (c.port === pi) return;
      if (c.port >= 0) { this.portCab[c.port] = -1; c.port = -1; }
      if (C.fits === Pt.key) {
        var prev = this.portCab[pi];
        if (prev >= 0 && prev !== i) this.unplug(prev);
        this.portCab[pi] = i; c.port = pi;
        this.tween({ from: 0, to: 1, dur: dragged ? 0.25 : 0.55, ease: 'snap', onUpdate: (function (x0, y0) { return function (k) { c.x = U.lerp(x0, q.x, k); c.y = U.lerp(y0, q.y, k); }; })(c.x, c.y),
          onDone: function () { self.tween({ from: 1, to: 0, dur: 0.6, ease: 'outCubic', onUpdate: function (v) { self.click[pi] = v; } }); } });
        c.lift = 0;
        this.msg = { ok: true, text: '✓ click · link up ' + C.speed, pi: pi, t: this.time };
        this.announce(C.name + ' clicks into the ' + Pt.name + ' port. Link up at ' + C.speed + '.');
      } else {
        var why = WHY[C.key + '>' + Pt.key] || 'wrong shape';
        // fly up to the port, bump short of it, shake, fall back to the tray
        this.tween({ from: 0, to: 1, dur: dragged ? 0.15 : 0.4, ease: 'outCubic', onUpdate: (function (x0, y0) { return function (k) { c.x = U.lerp(x0, q.x, k); c.y = U.lerp(y0, q.y + q.h * 0.9 + 14, k); }; })(c.x, c.y),
          onDone: function () { self.tween({ from: 1, to: 0, dur: 0.55, ease: 'linear', onUpdate: function (v) { c.shake = v; }, onDone: function () { self.home(i); } }); } });
        this.msg = { ok: false, text: '✕ ' + why, pi: pi, t: this.time };
        this.announce('Does not fit: ' + why + '.');
      }
      this.links();
    },
    links: function () {
      var n = 0; for (var k = 0; k < 3; k++) if (this.portCab[k] >= 0) n++;
      this.rLinks.set(n + ' / 3', n ? 'ok' : '');
    },

    resize: function (w, h) {
      var m = this.mobile = w < 560, i;
      this.s = m ? Math.min(0.9, w / 400) : Math.min(1.35, w / 720);
      var s = this.s;
      if (m) {
        this.br = { x: 10, y: 46, w: w - 20, h: 74 * s + 18 };
        this.portHits = PORTS.map(function (p, k) { return { x: w * (0.2 + 0.3 * k), y: 46 + (74 * s + 18) / 2, w: p.w * s, h: p.h * s }; });
        this.trayBox = { x: 10, y: this.br.y + this.br.h + 52, w: w - 20, h: 112 };
        this.fib = { x: 10, y: this.trayBox.y + this.trayBox.h + 14, w: w - 20, h: h - (this.trayBox.y + this.trayBox.h + 14) - 10 };
      } else {
        var lw = w * 0.64;
        this.br = { x: 24, y: 56, w: lw - 40, h: 120 * s * 0.75 };
        this.portHits = PORTS.map(function (p, k) { return { x: 24 + (lw - 40) * (0.2 + 0.3 * k), y: 56 + 60 * s * 0.75, w: p.w * s, h: p.h * s }; });
        this.trayBox = { x: 24, y: h * 0.58, w: lw - 40, h: h * 0.4 - 12 };
        this.fib = { x: lw + 4, y: 14, w: w - lw - 18, h: h - 28 };
      }
      var tb = this.trayBox;
      this.tray = CABLES.map(function (c, k) { return { x: tb.x + tb.w * (0.125 + 0.25 * k), y: tb.y + (m ? 72 : Math.max(86, tb.h * 0.56)) }; });
      for (i = 0; i < CABLES.length; i++) {
        var c = this.cab[i];
        if (c.port >= 0) { c.x = this.portHits[c.port].x; c.y = this.portHits[c.port].y; } else { c.x = this.tray[i].x; c.y = this.tray[i].y; }
      }
    },

    update: function () {},

    // ---------------------------------------------------------------- drawing
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, t = this.time, s = this.s, m = this.mobile, i;
      D.clear(ctx, w, h);
      this.hits.clear();
      // --- bracket
      var b = this.br;
      D.text(ctx, 'NIC BRACKET · rear of the server', b.x, b.y - (m ? 30 : 34), { size: m ? 9 : 10, weight: 700, color: P.text2, ls: 1 });
      D.box(ctx, b.x, b.y, b.w, b.h, 4, U.shade(P.alu, P.dark ? -0.35 : -0.05), U.rgba(P.alu, 0.7), 1.2);
      ctx.fillStyle = U.rgba(P.silicon, 0.35);
      for (var vx = b.x + 12; vx < b.x + b.w - 12; vx += 9) { if (this.nearPort(vx)) continue; ctx.fillRect(vx, b.y + 8, 4, b.h - 16); }
      D.circle(ctx, b.x + 10, b.y + b.h / 2, 4, U.rgba(P.silicon, 0.6), U.rgba(P.alu, 0.6), 1);
      for (i = 0; i < PORTS.length; i++) this.drawPort(ctx, P, i, t);
      // plugged cable tails (behind the tray)
      for (i = 0; i < CABLES.length; i++) if (this.cab[i].port >= 0) this.drawTail(ctx, P, i, true);
      // --- tray
      var tb = this.trayBox;
      D.box(ctx, tb.x, tb.y, tb.w, tb.h, 8, P.panel2, U.rgba(P.blueprint, 0.4), 1);
      D.text(ctx, 'CABLE TRAY · pick one, then a port (or drag)', tb.x + 10, tb.y + 12, { size: m ? 8.5 : 9.5, weight: 700, color: P.text3, ls: 0.5 });
      ctx.save(); ctx.beginPath(); ctx.rect(tb.x, tb.y + 1, tb.w, tb.h - 2); ctx.clip();
      for (i = 0; i < CABLES.length; i++) if (this.cab[i].port < 0 && !(this.drag && this.drag.i === i)) this.drawTail(ctx, P, i, false);
      ctx.restore();
      for (i = 0; i < CABLES.length; i++) {
        var tp = this.tray[i], C = CABLES[i];
        D.text(ctx, C.name, tp.x, tb.y + (m ? 28 : 34), { size: m ? 8.5 : 10.5, weight: 800, color: i === this.sel ? P.accent : P.text1, align: 'center', maxW: tb.w / 4 - 4 });
        D.text(ctx, C.sub, tp.x, tb.y + (m ? 40 : 49), { size: m ? 7.5 : 9, color: P.text3, align: 'center', maxW: tb.w / 4 - 4 });
      }
      // heads
      for (i = 0; i < CABLES.length; i++) if (!(this.drag && this.drag.i === i)) this.drawHead(ctx, P, i);
      if (this.drag) { this.drawTail(ctx, P, this.drag.i, false); this.drawHead(ctx, P, this.drag.i); }
      // message
      if (this.msg && t - this.msg.t < 3.2) {
        var q = this.portHits[this.msg.pi], a = U.clamp((3.2 - (t - this.msg.t)) / 0.5, 0, 1);
        ctx.globalAlpha = a;
        D.pill(ctx, this.msg.text, U.clamp(q.x, 110, (m ? w : this.fib.x) - 110), b.y + b.h + (m ? 16 : 20), { size: m ? 9 : 10.5, align: 'center', color: this.msg.ok ? P.ok : P.fault, bg: U.rgba(this.msg.ok ? P.ok : P.fault, 0.12) });
        ctx.globalAlpha = 1;
      }
      this.drawFiber(ctx, P, t);
      var up = this.portCab.filter(function (x) { return x >= 0; }).length;
      this.setDesc(up ? up + ' of 3 ports have a matching cable and a lit link LED.' : 'No cables plugged in yet. Each port only accepts the matching connector shape.');
    },
    nearPort: function (x) { for (var k = 0; k < 3; k++) { var q = this.portHits[k]; if (Math.abs(x - q.x) < q.w / 2 + 14) return true; } return false; },

    drawPort: function (ctx, P, i, t) {
      var p = PORTS[i], q = this.portHits[i], s = this.s, m = this.mobile, pw = q.w, ph = q.h, x = q.x - pw / 2, y = q.y - ph / 2;
      var cab = this.portCab[i], linked = cab >= 0;
      // cage / jack
      if (p.key === 'rj45') {
        D.box(ctx, x - 3, y - 3, pw + 6, ph + 6, 3, U.shade(P.steel, -0.2), U.rgba(P.alu, 0.6), 1);
        D.box(ctx, x, y, pw, ph, 2, U.rgba(P.silicon, 0.95));
        ctx.fillStyle = U.rgba(P.silicon, 0.95); ctx.fillRect(q.x - pw * 0.18, y + ph, pw * 0.36, 4 * s);
        ctx.fillStyle = U.rgba(P.gold, 0.8); for (var k = 0; k < 8; k++) ctx.fillRect(x + pw * 0.15 + k * pw * 0.09, y + 3, pw * 0.04, ph * 0.22);
        D.led(ctx, x + 4, y - 7, P.ok, linked ? 'solid' : 'off', t, 2.2);
        D.led(ctx, x + pw - 4, y - 7, P.power, linked ? 'activity' : 'off', t * 1.4, 2.2);
      } else {
        D.box(ctx, x - 4, y - 4, pw + 8, ph + 8, 2, U.shade(P.alu, P.dark ? -0.15 : -0.1), U.rgba(P.alu, 0.9), 1);
        D.box(ctx, x, y, pw, ph, 1, U.rgba(P.silicon, 0.95));
        ctx.fillStyle = U.rgba(P.alu, 0.55); for (var f = 0; f < 5; f++) ctx.fillRect(x + pw * (0.1 + f * 0.2), y - 4, pw * 0.08, 2);
        D.led(ctx, q.x, y - 10, P.ok, linked ? 'solid' : 'off', t, 2.4);
        if (linked) D.led(ctx, q.x + 10, y - 10, P.ok, 'activity', t * 1.3, 2);
      }
      // labels
      var ly = this.br.y - (m ? 10 : 12);
      D.text(ctx, p.name + (m ? '' : ' · ' + (linked ? '● ' + CABLES[cab].speed + ' link' : p.sub)), q.x, ly, { size: m ? 10 : 11, weight: 800, color: linked ? P.ok : P.text1, align: 'center' });
      if (m && linked) D.text(ctx, '● ' + CABLES[cab].speed, q.x, this.br.y + this.br.h + 10, { size: 8.5, weight: 700, color: P.ok, align: 'center' });
      // click flash
      if (this.click[i] > 0.01) { ctx.globalAlpha = this.click[i]; D.box(ctx, x - 8, y - 8, pw + 16, ph + 16, 4, null, P.accent, 2); ctx.globalAlpha = 1; }
      this.hits.rect('port', x - 6, y - 14, pw + 12, ph + 20, i);
    },

    drawTail: function (ctx, P, i, plugged) {
      var C = CABLES[i], c = this.cab[i], s = this.s, col = P[C.col];
      var hx = c.x + this.shakeX(c), hy = c.y - c.lift * 8 + C.h * s / 2;
      var ex = hx + (plugged ? (i - 1.5) * 18 : 10), ey = this.h + 30;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      ctx.bezierCurveTo(hx, hy + 40, ex, ey - 80, ex, ey);
      ctx.lineCap = 'round';
      ctx.strokeStyle = U.shade(col, P.dark ? -0.1 : -0.15); ctx.lineWidth = C.lw * s + 1.5; ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = C.lw * s; ctx.stroke();
      ctx.lineCap = 'butt';
    },
    shakeX: function (c) { return c.shake > 0 ? Math.sin(c.shake * 40) * 7 * c.shake : 0; },

    drawHead: function (ctx, P, i) {
      var C = CABLES[i], c = this.cab[i], s = this.s, x = c.x + this.shakeX(c), y = c.y - c.lift * 8, hw = C.w * s, hh = C.h * s;
      var x0 = x - hw / 2, y0 = y - hh / 2;
      if (i === this.sel && c.port < 0) { D.box(ctx, x0 - 6, y0 - 6, hw + 12, hh + 12, 5, null, P.accent, 1.5); }
      if (C.key === 'cat6') {
        D.box(ctx, x0, y0, hw, hh, 3, U.rgba(P.air, P.dark ? 0.32 : 0.55), U.rgba(P.air, 0.9), 1.2);
        ctx.fillStyle = P.gold; for (var k = 0; k < 8; k++) ctx.fillRect(x0 + hw * 0.14 + k * hw * 0.1, y0 + 3, hw * 0.05, hh * 0.25);
        D.box(ctx, x - hw * 0.15, y0 + hh - 2, hw * 0.3, 6 * s, 1, U.rgba(P.air, 0.6));
        ctx.fillStyle = U.rgba(P.blueprint, 0.7); ctx.fillRect(x0 + 3, y0 + hh * 0.55, hw - 6, hh * 0.35);
      } else {
        // metal SFP/QSFP shell
        D.box(ctx, x0, y0, hw, hh, 2, U.shade(P.alu, P.dark ? 0 : -0.05), U.shade(P.alu, -0.4), 1);
        ctx.fillStyle = U.rgba(P.silicon, 0.35); ctx.fillRect(x0 + 3, y0 + 3, hw - 6, 2);
        if (C.key === 'fiber') {
          // duplex LC receptacle
          for (var d = -1; d <= 1; d += 2) {
            D.box(ctx, x + d * hw * 0.2 - hw * 0.13, y0 + hh * 0.2, hw * 0.26, hh * 0.62, 1, U.rgba(P.silicon, 0.85));
            D.circle(ctx, x + d * hw * 0.2, y, Math.max(1.5, hh * 0.13), P.air);
          }
          D.box(ctx, x0 - 3, y0 + hh - 1, hw + 6, 4 * s, 2, P.blueprint);   // bale latch
        } else {
          D.box(ctx, x0 + hw * 0.1, y0 + hh * 0.3, hw * 0.8, hh * 0.4, 1, U.rgba(P.silicon, 0.6));
          D.box(ctx, x - hw * 0.25, y0 + hh - 1, hw * 0.5, 6 * s, 2, U.shade(P.plastic, 0.1));  // pull tab
        }
      }
      if (c.port < 0 || (this.drag && this.drag.i === i)) {
        var pad = 10;
        this.hits.rect('cable', x0 - pad, y0 - pad, hw + pad * 2, hh + pad * 2 + 20, i);
      } else this.hits.rect('cable', x0 - 4, y0 - 4, hw + 8, hh + 8, i);
    },

    drawFiber: function (ctx, P, t) {
      var f = this.fib, m = this.mobile, live = this.portCab[1] === 2;
      D.box(ctx, f.x, f.y, f.w, f.h, 10, P.panel2, U.rgba(P.blueprint, 0.35), 1);
      D.text(ctx, 'INSIDE A FIBER', f.x + 12, f.y + 14, { size: m ? 9 : 10, weight: 800, color: P.text2, ls: 1 });
      D.text(ctx, live ? '● link up · 10 Gb/s' : 'light, not electricity', f.x + f.w - 12, f.y + 14, { size: m ? 8.5 : 9.5, weight: 700, color: live ? P.ok : P.text3, align: 'right' });
      // cross-section (core / cladding / jacket) — desktop only
      var cutY, cutH, x0 = f.x + 16, x1 = f.x + f.w - 16;
      if (!m) {
        var cx = f.x + f.w / 2, cy = f.y + 30 + f.h * 0.17, R = Math.min(f.h * 0.15, f.w * 0.2);
        D.circle(ctx, cx, cy, R, U.rgba(P.air, 0.25), U.rgba(P.air, 0.9), 1.5);
        D.circle(ctx, cx, cy, R * 0.62, U.rgba(P.text1, P.dark ? 0.12 : 0.3), U.rgba(P.text2, 0.6), 1);
        D.circle(ctx, cx, cy, R * 0.25, U.rgba(P.net, 0.55), P.net, 1.2);
        D.leader(ctx, cx + R * 0.15, cy - R * 0.1, cx + R + 26, cy - R * 0.55, 'core 50 µm', { color: P.net, size: 10 });
        D.leader(ctx, cx - R * 0.45, cy + R * 0.3, cx - R - 26, cy + R * 0.7, 'cladding 125 µm', { color: P.text2, size: 10 });
        D.leader(ctx, cx + R * 0.8, cy + R * 0.5, cx + R + 26, cy + R * 0.8, 'jacket', { color: P.air, size: 10 });
        cutY = f.y + f.h * 0.62; cutH = Math.min(110, f.h * 0.36);
      } else { cutY = f.y + 22 + (f.h - 22) / 2; cutH = Math.min(64, f.h - 34); }
      // longitudinal cutaway
      var ch = cutH * 0.36, cy2 = cutY;
      D.box(ctx, x0, cy2 - cutH / 2, x1 - x0, cutH, 4, U.rgba(P.air, 0.14), U.rgba(P.air, 0.7), 1);
      ctx.fillStyle = U.rgba(P.text1, P.dark ? 0.06 : 0.25); ctx.fillRect(x0, cy2 - cutH * 0.36, x1 - x0, cutH * 0.72);
      ctx.fillStyle = U.rgba(P.net, P.dark ? 0.1 : 0.12); ctx.fillRect(x0, cy2 - ch / 2, x1 - x0, ch);
      D.line(ctx, x0, cy2 - ch / 2, x1, cy2 - ch / 2, U.rgba(P.net, 0.6), 1);
      D.line(ctx, x0, cy2 + ch / 2, x1, cy2 + ch / 2, U.rgba(P.net, 0.6), 1);
      // pulses: zig-zag, reflecting off the core/cladding boundary
      var L = x1 - x0, period = Math.max(30, ch * 2.4), n = live ? 4 : 2, speed = live ? 150 : 90, trail = Math.min(L * 0.5, 120);
      ctx.save(); ctx.beginPath(); ctx.rect(x0, cy2 - ch, L, ch * 2); ctx.clip();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var k = 0; k < n; k++) {
        var head = ((t * speed + k * (L + trail) / n) % (L + trail));
        var segs = 10;
        for (var j = 0; j < segs; j++) {
          var a0 = head - trail * (j + 1) / segs, a1 = head - trail * j / segs;
          if (a1 < 0 || a0 > L) continue;
          a0 = Math.max(0, a0); a1 = Math.min(L, a1);
          ctx.beginPath();
          for (var xx = a0; xx <= a1 + 0.1; xx += 3) {
            var ph = (xx / period) % 1, tri = ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4;
            var yy = cy2 + tri * (ch / 2 - 1.5);
            if (xx === a0) ctx.moveTo(x0 + xx, yy); else ctx.lineTo(x0 + xx, yy);
          }
          ctx.strokeStyle = P.net; ctx.globalAlpha = 1 - j / segs; ctx.lineWidth = 2.2 - j * 0.12; ctx.stroke();
        }
        if (head <= L) { var hp = (head / period) % 1, ht = hp < 0.5 ? hp * 4 - 1 : 3 - hp * 4; ctx.globalAlpha = 1; D.glow(ctx, x0 + head, cy2 + ht * (ch / 2 - 1.5), 10, P.net, 0.9); }
      }
      ctx.globalAlpha = 1; ctx.restore();
      // emitter / detector
      D.box(ctx, x0 - 8, cy2 - ch * 0.8, 8, ch * 1.6, 2, live ? P.net : U.rgba(P.text3, 0.5));
      D.text(ctx, 'laser', x0, cy2 + cutH / 2 + 11, { size: 9, color: P.text3 });
      D.text(ctx, 'detector', x1, cy2 + cutH / 2 + 11, { size: 9, color: P.text3, align: 'right' });
      if (!m) {
        D.text(ctx, 'glass core · light bounces off the', f.x + f.w / 2, f.y + f.h - 34, { size: 10, color: P.text2, align: 'center' });
        D.text(ctx, 'cladding: total internal reflection', f.x + f.w / 2, f.y + f.h - 20, { size: 10, weight: 700, color: P.text1, align: 'center' });
      }
    }
  });
})(window.SRV);
