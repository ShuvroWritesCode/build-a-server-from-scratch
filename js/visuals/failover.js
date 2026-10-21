/* Ch1 · Break a part: desktop vs server. Clients send request dots; the desktop dies on a single
   failure while the server fails over to its spare and keeps answering. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso;

  S.defineVisual('failover', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.packets = [];
      this.spawnT = 0;
      this.broken = null;           // null | 'psu' | 'drive'
      this.desk = { up: true, served: 0, failed: 0, fade: 1 };
      this.srv = { up: true, served: 0, failed: 0, spare: 0 };
      var self = this;
      var g = this.ui.group('Break something');
      this.bPsu = g.button('⚡ Kill a power supply', function () { self.breakPart('psu'); }, { kind: 'danger' });
      this.bDrive = g.button('✕ Kill a drive', function () { self.breakPart('drive'); }, { kind: 'danger' });
      g.button('↺ Repair both', function () { self.repair(); });
      this.ui.spacer();
      this.rDesk = this.ui.readout('Desktop answered', '0');
      this.rSrv = this.ui.readout('Server answered', '0');
    },
    breakPart: function (kind) {
      if (this.broken) return;
      this.broken = kind;
      this.desk.up = false;
      var self = this;
      this.tween({ from: 1, to: 0, dur: 0.8, ease: 'fail', onUpdate: function (v) { self.desk.fade = v; } });
      this.tween({ from: 0, to: 1, dur: 0.6, onUpdate: function (v) { self.srv.spare = v; } });
      S.audio.play('fanFail', { level: 0.5, rate: kind === 'psu' ? 0.8 : 1.3 });
      S.haptics.fail('fail');
      this.announce(kind === 'psu' ? 'Power supply failed. The desktop is dead. The server switched to its second power supply and keeps serving.' :
        'A drive failed. The desktop lost its only drive. The server keeps running on its mirrored drive.');
      this.bPsu.setDisabled(true); this.bDrive.setDisabled(true);
    },
    repair: function () {
      this.broken = null; this.desk.up = true;
      var self = this;
      this.tween({ from: this.desk.fade, to: 1, dur: 0.5, onUpdate: function (v) { self.desk.fade = v; } });
      this.tween({ from: this.srv.spare, to: 0, dur: 0.5, onUpdate: function (v) { self.srv.spare = v; } });
      this.bPsu.setDisabled(false); this.bDrive.setDisabled(false);
      this.announce('Both machines repaired.');
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      // client positions along the top, machine positions bottom
      var n = this.mobile ? 4 : 6;
      this.clients = [];
      for (var i = 0; i < n; i++) this.clients.push({ x: w * (0.12 + 0.76 * i / (n - 1)), y: h * 0.13, kind: i % 3 === 1 ? 'phone' : 'laptop' });
      this.deskPos = { x: w * 0.27, y: h * 0.7 };
      this.srvPos = { x: w * 0.73, y: h * 0.7 };
      this.s = Math.min(w / 640, h / 380);
    },
    update: function (dt) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 0.22 + this.rng.float() * 0.25;
        var c = this.rng.pick(this.clients), toSrv = this.rng.chance(0.5);
        this.packets.push({ c: c, to: toSrv ? 'srv' : 'desk', t: 0, back: false, dead: false });
      }
      for (var i = this.packets.length - 1; i >= 0; i--) {
        var p = this.packets[i];
        p.t += dt * 0.9;
        if (p.t >= 1) {
          var m = p.to === 'srv' ? this.srv : this.desk;
          if (!p.back) {
            if (m.up) { p.back = true; p.t = 0; }
            else { p.dead = true; p.t = 0; p.back = true; m.failed++; }
          } else {
            if (!p.dead) m.served++;
            this.packets.splice(i, 1);
          }
        }
      }
      this.rDesk.set(U.fmt(this.desk.served) + (this.desk.failed ? ' · ' + this.desk.failed + ' lost' : ''), this.desk.failed && !this.desk.up ? 'bad' : '');
      this.rSrv.set(U.fmt(this.srv.served), 'ok');
    },
    drawMachine: function (ctx, kind, pos, alive) {
      var s = this.s, P = S.pal, t = this.time;
      var V = I.view({ k: 0.42 * s, ox: pos.x, oy: pos.y });
      var fade = kind === 'desk' ? this.desk.fade : 1;
      if (kind === 'desk') {
        var b = { x: -100, y: -220, z: 0, w: 200, d: 440, h: 430 };
        I.shadow(ctx, V, b, 0.3);
        I.box(ctx, V, b, { color: U.mix(P.plastic, P.bg, (1 - fade) * 0.5), decal: {
          left: function (c, w, h) {
            c.fillStyle = U.rgba('#000', 0.3); for (var y = 40; y < 140; y += 12) c.fillRect(30, y, w - 60, 5);
            D.led(c, w - 30, h - 40, alive ? P.ok : P.fault, alive ? 'solid' : 'blink', t, 6);
          }
        } });
        var lp = V.p(0, 220, 470);
        D.text(ctx, 'DESKTOP', lp[0], lp[1] - 10, { size: 11, weight: 700, color: P.text2, align: 'center', ls: 1.5 });
        D.text(ctx, '1 PSU · 1 drive', lp[0], lp[1] + 6, { size: 10, color: P.text3, align: 'center' });
        if (!alive) { var c = V.p(0, 220, 260); D.g.cross(ctx, c[0], c[1], 40 * s, P.fault); }
      } else {
        var sb = { x: -230, y: -190, z: 0, w: 460, d: 380, h: 88 };
        var b2 = { x: -230, y: -190, z: 96, w: 460, d: 380, h: 88 };
        I.shadow(ctx, V, sb, 0.3);
        var spare = this.srv.spare, broken = this.broken;
        [sb, b2].forEach(function (bb, row) {
          I.box(ctx, V, bb, { color: 'steel', decal: {
            left: function (c, w, h) {
              for (var i = 0; i < 6; i++) {
                c.fillStyle = U.shade(P.plastic, -0.2); c.fillRect(12 + i * 62, 12, 56, h - 24);
                var dead = broken === 'drive' && row === 1 && i === 0;
                D.led(c, 60 + i * 62, h / 2, dead ? P.fault : P.ok, dead ? 'blink' : 'activity', t + i + row, 5);
              }
            },
            right: function (c, w, h) {
              // two PSUs on the side (rear)
              for (var k = 0; k < 2; k++) {
                var dead = broken === 'psu' && k === 0 && row === 0;
                c.fillStyle = dead ? U.mix(P.steel, P.fault, 0.4) : U.shade(P.steel, -0.25); c.fillRect(20 + k * 120, 14, 100, h - 28);
                D.led(c, 30 + k * 120, h / 2, dead ? P.fault : P.ok, dead ? 'blink' : 'solid', t, 5);
              }
            }
          } });
        });
        var lp2 = V.p(0, 190, 230);
        D.text(ctx, 'SERVER', lp2[0], lp2[1] - 10, { size: 11, weight: 700, color: P.text2, align: 'center', ls: 1.5 });
        D.text(ctx, '2 PSUs · mirrored drives', lp2[0], lp2[1] + 6, { size: 10, color: P.text3, align: 'center' });
        if (spare > 0.01) {
          var q = V.p(230, -190, 150);
          D.pill(ctx, broken === 'psu' ? 'SPARE PSU TOOK OVER' : 'MIRROR DRIVE TOOK OVER', q[0] + 6, q[1] - 20, { color: P.ok, size: 10, alpha: spare });
        }
      }
    },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, self = this;
      D.clear(ctx, w, h);
      // network lines
      this.clients.forEach(function (c) {
        [self.deskPos, self.srvPos].forEach(function (m) { D.line(ctx, c.x, c.y + 16, m.x, m.y - 90 * self.s, U.rgba(P.net, 0.12), 1); });
      });
      this.drawMachine(ctx, 'desk', this.deskPos, this.desk.up);
      this.drawMachine(ctx, 'srv', this.srvPos, true);
      // clients
      this.clients.forEach(function (c) { D.g[c.kind](ctx, c.x, c.y, 34 * Math.max(0.8, self.s), P.alu); });
      // packets
      this.packets.forEach(function (p) {
        var m = p.to === 'srv' ? self.srvPos : self.deskPos;
        var ax = p.c.x, ay = p.c.y + 16, bx = m.x, by = m.y - 90 * self.s;
        var k = U.ease.inOutSine(p.t);
        var x, y;
        if (!p.back) { x = U.lerp(ax, bx, k); y = U.lerp(ay, by, k); D.circle(ctx, x, y, 3.2, P.net); D.glow(ctx, x, y, 10, P.net, 0.6); }
        else if (!p.dead) { x = U.lerp(bx, ax, k); y = U.lerp(by, ay, k); D.circle(ctx, x, y, 3, P.ok); D.glow(ctx, x, y, 9, P.ok, 0.5); }
        else { x = bx + (ax - bx) * 0.08 * k; y = by - 18 * k; ctx.globalAlpha = 1 - p.t; D.g.cross(ctx, x, y, 12, P.fault); ctx.globalAlpha = 1; }
      });
      // legend
      D.text(ctx, '● request', 14, h - 16, { size: 10, color: P.net });
      D.text(ctx, '● answer', 92, h - 16, { size: 10, color: P.ok });
      this.setDesc(this.broken ? 'A ' + (this.broken === 'psu' ? 'power supply' : 'drive') + ' failed: the desktop is down, the server is still answering.' : 'Both machines are answering requests.');
    }
  });
})(window.SRV);
