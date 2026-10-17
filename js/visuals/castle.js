/* Ch18 · Castle of ports. The server as a fortress with one door per listening service. Brick up the
   services you don't need (mortar animation) and the attack-surface meter shrinks. Unpatched bugs
   show up as cracks with real CVE names; updates fill them. Little scanner bots probe open doors and
   slip in through cracked ones. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var SV = [
    { port: 22, name: 'SSH', need: true, risk: 2, cve: 'CVE-2024-6387', nick: 'regreSSHion' },
    { port: 443, name: 'HTTPS', need: true, risk: 2, cve: 'CVE-2014-0160', nick: 'Heartbleed' },
    { port: 21, name: 'FTP', need: false, risk: 6, cve: 'CVE-2011-2523', nick: 'vsftpd backdoor' },
    { port: 23, name: 'Telnet', need: false, risk: 9, cve: 'CVE-2020-10188', nick: 'telnetd overflow' },
    { port: 445, name: 'SMB', need: false, risk: 9, cve: 'MS17-010', nick: 'EternalBlue' },
    { port: 3389, name: 'RDP', need: false, risk: 8, cve: 'CVE-2019-0708', nick: 'BlueKeep' },
    { port: 3306, name: 'MySQL', need: false, risk: 7, cve: 'CVE-2012-2122', nick: 'auth bypass' },
    { port: 8080, name: 'old admin', need: false, risk: 8, cve: 'CVE-2017-5638', nick: 'Struts RCE' }
  ];
  var N = SV.length, NB = 6;
  var MAXRISK = SV.reduce(function (a, s) { return a + s.risk + 4; }, 0);

  S.defineVisual('castle', {
    continuous: true,
    init: function () {
      var self = this;
      this.ctx = this.layer();
      this.open = SV.map(function () { return true; });
      this.brick = new Float32Array(N);        // 0 open … 1 bricked
      this.crack = new Float32Array(N);        // 0 none … 1 fully cracked (unpatched)
      this.patch = new Float32Array(N);        // mortar fill progress when patched
      this.cracked = SV.map(function () { return false; });
      this.flash = new Float32Array(N);
      this.crack[0] = 1; this.cracked[0] = true; this.crack[4] = 1; this.cracked[4] = true;
      this.bugT = 7; this.breaches = 0; this.banner = null; this.bannerT = 0;
      this.autoUpd = false; this.meter = 0;
      this.bots = [];
      for (var i = 0; i < NB; i++) this.bots.push({ on: false, x: 0, tx: 0, door: 0, st: 'walk', t: 0, probes: 0, a: 1, res: '' });
      this.spawnT = 0.5;
      this.crackShapes = [];
      var r = U.rng('castle-cracks');
      for (var k = 0; k < N; k++) { var pts = []; for (var j = 0; j < 6; j++) pts.push(r.range(-0.5, 0.5), j / 5); this.crackShapes.push(pts); }

      var g = this.ui.group('Quick actions');
      g.button('🧱 Close what you don’t need', function () { self.closeUnneeded(); }, { kind: 'primary' });
      g.button('Open everything', function () { self.setAll(true); });
      this.bUpd = g.button('⟳ Apply updates', function () { self.applyUpdates(); });
      this.tAuto = g.toggle({ label: 'Automatic updates', value: false, onChange: function (v) { self.autoUpd = v; if (v) self.applyUpdates(); } });
      this.ui.br();
      var s = this.ui.group('Services running');
      s.text('<span class="ctl-label">Services</span>');
      this.toggles = SV.map(function (sv, i) {
        return s.toggle({ label: sv.name + ' ' + sv.port, value: true, onChange: function (v) { self.setDoor(i, v); } });
      });
      this.ui.spacer();
      this.rSurf = this.ui.readout('Attack surface', '—', 'bad');
    },
    setDoor: function (i, on, quiet, delay) {
      if (this.open[i] === on) return;
      var self = this;
      this.open[i] = on;
      this.toggles[i].set(on, false);
      this.tween({ from: this.brick[i], to: on ? 0 : 1, dur: on ? 0.5 : 1.1, delay: delay || 0, ease: on ? 'settle' : 'linear', onUpdate: function (v) { self.brick[i] = v; } });
      if (!quiet) this.announce(SV[i].name + ' port ' + SV[i].port + (on ? ' opened. Its door is back.' : ' disabled. Its door is bricked up' + (this.cracked[i] && this.patch[i] < 1 ? ', and the bug in it no longer matters.' : '.')));
    },
    closeUnneeded: function () {
      var self = this, d = 0;
      SV.forEach(function (sv, i) { if (!sv.need && self.open[i]) { self.setDoor(i, false, true, d); d += 0.12; } });
      this.announce('Disabled every service except SSH and HTTPS. Six doors bricked up; the attack surface shrinks.');
    },
    setAll: function (on) { for (var i = 0; i < N; i++) this.setDoor(i, on, true); this.announce(on ? 'All eight services are running again.' : ''); },
    applyUpdates: function () {
      var self = this, n = 0, d = 0;
      for (var i = 0; i < N; i++) {
        if (this.cracked[i] && this.patch[i] < 1) {
          (function (k) { self.tween({ from: self.patch[k], to: 1, dur: 0.9, delay: d, ease: 'inOutSine', onUpdate: function (v) { self.patch[k] = v; }, onDone: function () { self.cracked[k] = false; self.crack[k] = 0; self.patch[k] = 0; } }); })(i);
          d += 0.25; n++;
        }
      }
      this.announce(n ? 'Updates applied: ' + n + ' known bug' + (n > 1 ? 's' : '') + ' patched.' : 'Already up to date.');
    },
    unpatched: function (i) { return this.cracked[i] && this.patch[i] < 0.95; },

    // ------------------------------------------------------------ layout
    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      L.fs = m ? 9 : U.clamp(w / 88, 9.5, 12);
      L.ground = h * (m ? 0.5 : 0.8);
      L.W0 = m ? 14 : 30; L.W1 = m ? w - 14 : w * 0.72;
      L.wallTop = m ? h * 0.22 : h * 0.36;
      L.towerW = m ? 22 : 40;
      L.doorSpan = (L.W1 - L.W0 - L.towerW * 2) / N;
      L.dw = Math.min(L.doorSpan * 0.62, m ? 30 : 58); L.dh = Math.min((L.ground - L.wallTop) * 0.6, m ? 52 : 108);
      L.botY = L.ground + (m ? 14 : 22);
      L.panel = m ? { x: 10, y: h * 0.64, w: w - 20, h: h * 0.34 } : { x: w * 0.75, y: 52, w: w * 0.25 - 16, h: h - 64 };
    },
    doorX: function (i) { var L = this.L; return L.W0 + L.towerW + L.doorSpan * (i + 0.5); },

    // ------------------------------------------------------------ simulation
    update: function (dt) {
      var r = this.rng, L = this.L, i, b;
      // bugs appear over time
      this.bugT -= dt;
      if (this.bugT <= 0) {
        this.bugT = 6 + r.float() * 5;
        var cand = []; for (i = 0; i < N; i++) if (!this.cracked[i]) cand.push(i);
        if (cand.length) {
          var k = r.pick(cand), self = this;
          this.cracked[k] = true; this.patch[k] = 0;
          this.tween({ from: 0, to: 1, dur: 0.6, onUpdate: function (v) { self.crack[k] = v; } });
          if (this.open[k]) this.announce('New bug found in ' + SV[k].name + ': ' + SV[k].cve + ' (' + SV[k].nick + ').');
          if (this.autoUpd) this.tween({ from: 0, to: 1, dur: 0.01, delay: 2.2, onDone: function () { self.applyUpdates(); } });
        }
      }
      // bots
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 1.4 + r.float() * 1.5;
        for (i = 0; i < NB; i++) if (!this.bots[i].on) {
          b = this.bots[i]; b.on = true; b.x = r.chance(0.5) ? -10 : this.w * (this.mobile ? 1 : 0.73) + 10; b.st = 'walk'; b.probes = 0; b.a = 1; b.res = '';
          b.door = this.pickDoor(); b.tx = this.doorX(b.door); break;
        }
      }
      for (i = 0; i < NB; i++) {
        b = this.bots[i]; if (!b.on) continue;
        b.t += dt;
        if (b.st === 'walk') {
          var dir = Math.sign(b.tx - b.x), sp = 70 * dt;
          if (Math.abs(b.tx - b.x) <= sp) { b.x = b.tx; b.st = 'probe'; b.t = 0; }
          else b.x += dir * sp;
        } else if (b.st === 'probe') {
          if (b.t > 0.8) {
            var d = b.door; b.probes++; b.t = 0;
            if (this.brick[d] > 0.9) { b.res = '✕'; b.st = 'next'; }
            else if (this.unpatched(d) && this.crack[d] > 0.9) {
              b.st = 'breach'; b.res = '!'; this.breaches++; this.flash[d] = 1;
              this.banner = { text: 'BREACH via ' + SV[d].name + ' :' + SV[d].port + ' · ' + SV[d].cve + ' ' + SV[d].nick, d: d }; this.bannerT = 3.2;
              this.announce('A scanner got in through ' + SV[d].name + ' using ' + SV[d].nick + '. Patch it or close the port.');
            } else { b.res = '…'; b.st = 'next'; }
          }
        } else if (b.st === 'next') {
          if (b.t > 0.5) {
            b.res = '';
            if (b.probes >= 3) { b.st = 'leave'; b.tx = b.x < this.w * 0.36 ? -20 : this.w * (this.mobile ? 1 : 0.73) + 20; }
            else { b.door = this.pickDoor(); b.tx = this.doorX(b.door); b.st = 'walk'; }
          }
        } else if (b.st === 'breach') {
          b.a -= dt * 1.4; if (b.a <= 0) b.on = false;
        } else if (b.st === 'leave') {
          var sp2 = 80 * dt; b.x += Math.sign(b.tx - b.x) * sp2;
          if (Math.abs(b.tx - b.x) < sp2 + 1) b.on = false;
        }
      }
      for (i = 0; i < N; i++) this.flash[i] *= Math.exp(-dt * 3);
      if (this.banner) { this.bannerT -= dt; if (this.bannerT <= 0) this.banner = null; }
    },
    // scanners find the weak spots: half the time they head for an open, unpatched door
    pickDoor: function () {
      if (this.rng.chance(0.5)) {
        var c = [];
        for (var i = 0; i < N; i++) if (this.brick[i] < 0.5 && this.unpatched(i)) c.push(i);
        if (c.length) return this.rng.pick(c);
      }
      return this.rng.int(0, N - 1);
    },
    surface: function () {
      var s = 0;
      for (var i = 0; i < N; i++) { var o = 1 - this.brick[i]; s += o * (SV[i].risk + (this.unpatched(i) ? 4 * this.crack[i] : 0)); }
      return s / MAXRISK;
    },

    // ------------------------------------------------------------ drawing
    stoneWall: function (ctx, x, y, w, h, P) {
      D.box(ctx, x, y, w, h, 0, U.mix(P.panel2, P.steel, 0.25), U.rgba(P.blueprint, 0.55), 1);
      ctx.strokeStyle = U.rgba(P.blueprint, 0.16); ctx.lineWidth = 1; ctx.beginPath();
      var bh = 12, bw = 26;
      for (var yy = y + bh, row = 0; yy < y + h; yy += bh, row++) {
        ctx.moveTo(x, yy); ctx.lineTo(x + w, yy);
        for (var xx = x + (row % 2 ? bw / 2 : 0); xx < x + w; xx += bw) { ctx.moveTo(xx, yy - bh); ctx.lineTo(xx, yy); }
      }
      ctx.stroke();
    },
    merlons: function (ctx, x, y, w, size, P) {
      var n = Math.max(2, Math.floor(w / (size * 1.6)));
      var step = w / n;
      for (var i = 0; i < n; i++) D.box(ctx, x + i * step + step * 0.2, y - size, step * 0.6, size, 0, U.mix(P.panel2, P.steel, 0.25), U.rgba(P.blueprint, 0.55), 1);
    },
    archPath: function (ctx, x, y, w, h) {
      var r = w / 2;
      ctx.beginPath(); ctx.moveTo(x - r, y + h); ctx.lineTo(x - r, y + r); ctx.arc(x, y + r, r, Math.PI, 0); ctx.lineTo(x + r, y + h); ctx.closePath();
    },
    draw: function () {
      if (this.w < 160 || this.h < 120) { D.clear(this.ctx, this.w, this.h); return; }
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, t = this.time, self = this, m = this.mobile, fs = L.fs;
      D.clear(ctx, w, h);
      var wt = L.wallTop, g = L.ground;
      // keep behind the wall
      var kx = (L.W0 + L.W1) / 2, kw = m ? 70 : 120, kTop = wt - (m ? 42 : 74);
      this.stoneWall(ctx, kx - kw / 2, kTop, kw, wt - kTop + 4, P);
      this.merlons(ctx, kx - kw / 2, kTop, kw, m ? 7 : 10, P);
      D.line(ctx, kx, kTop - (m ? 8 : 10), kx, kTop - (m ? 26 : 40), P.text3, 1.4);
      var wave = Math.sin(t * 3) * 3;
      D.poly(ctx, [kx, kTop - (m ? 26 : 40), kx + (m ? 16 : 24), kTop - (m ? 22 : 34) + wave * 0.3, kx, kTop - (m ? 17 : 28)]); ctx.fillStyle = P.accent; ctx.fill();
      D.g.serverFront(ctx, kx, kTop + (m ? 14 : 24), kw * 0.6, P.steel, t, P.ok);
      if (!m) D.text(ctx, 'YOUR SERVER', kx, kTop + 44, { size: fs * 0.8, weight: 700, color: P.text2, align: 'center', ls: 1.5 });
      // wall + towers
      this.stoneWall(ctx, L.W0, wt, L.W1 - L.W0, g - wt, P);
      this.merlons(ctx, L.W0, wt, L.W1 - L.W0, m ? 7 : 10, P);
      [L.W0 - (m ? 4 : 8), L.W1 - L.towerW + (m ? 4 : 8)].forEach(function (tx) {
        var tt = wt - (m ? 22 : 40);
        self.stoneWall(ctx, tx, tt, L.towerW, g - tt, P);
        self.merlons(ctx, tx - 3, tt, L.towerW + 6, m ? 7 : 10, P);
        D.box(ctx, tx + L.towerW / 2 - 2, tt + 16, 4, 14, 2, U.rgba(P.bg0, 0.8));
      });
      // ground
      D.line(ctx, 0, g, m ? w : w * 0.73, g, U.rgba(P.blueprint, 0.45), 1.2);
      // doors
      for (var i = 0; i < N; i++) this.drawDoor(ctx, i);
      // bots
      for (var b = 0; b < NB; b++) {
        var bt = this.bots[b]; if (!bt.on) continue;
        var by = L.botY + (bt.st === 'walk' || bt.st === 'leave' ? Math.abs(Math.sin(t * 10 + b)) * -2 : 0);
        var bxp = bt.x, bs = m ? 11 : 15;
        if (bt.st === 'breach') { by = U.lerp(g - L.dh * 0.4, L.botY, bt.a); }
        ctx.globalAlpha = Math.max(0, bt.a);
        D.box(ctx, bxp - bs * 0.35, by - bs * 0.8, bs * 0.7, bs * 0.5, 2, U.shade(P.alu, -0.3), P.alu, 1);
        D.circle(ctx, bxp - bs * 0.13, by - bs * 0.55, 1.3, P.fault); D.circle(ctx, bxp + bs * 0.13, by - bs * 0.55, 1.3, P.fault);
        D.box(ctx, bxp - bs * 0.25, by - bs * 0.28, bs * 0.5, bs * 0.4, 2, U.shade(P.alu, -0.45), P.alu, 1);
        D.line(ctx, bxp, by - bs * 0.8, bxp, by - bs, P.alu, 1);
        ctx.globalAlpha = 1;
        if (bt.st === 'probe') {
          var k = bt.t / 0.8;
          ctx.globalAlpha = 1 - k; D.circle(ctx, bxp, g - L.dh * 0.45, 6 + k * 18, null, P.net, 1.4); ctx.globalAlpha = 1;
          if (!m) D.text(ctx, ':' + SV[bt.door].port + '?', bxp, by - bs - 8, { size: fs * 0.8, weight: 700, color: P.net, align: 'center' });
        }
        if (bt.res) D.text(ctx, bt.res, bxp, by - bs - 8, { size: fs * 1.2, weight: 700, color: bt.res === '!' ? P.fault : bt.res === '✕' ? P.ok : P.text3, align: 'center' });
      }
      this.drawPanel(ctx);
      if (this.banner) D.pill(ctx, '✕ ' + this.banner.text, m ? w / 2 : (L.W0 + L.W1) / 2, m ? h * 0.585 : g + (h - g) * 0.72, { color: P.fault, size: fs * 0.9, align: 'center', bg: U.rgba(P.panel, 0.97) });
      this.setDesc(this.describe());
    },
    drawDoor: function (ctx, i) {
      var P = S.pal, L = this.L, x = this.doorX(i), g = L.ground, dw = L.dw, dh = L.dh, y = g - dh, sv = SV[i], fs = L.fs, m = this.mobile;
      var bk = this.brick[i], open = bk < 0.5;
      // cracks (above-left of the door)
      if (this.cracked[i] && this.crack[i] > 0.01) {
        var pts = this.crackShapes[i], cx = x - dw * 0.15, cy0 = y - (m ? 6 : 10), ch = Math.min(y - L.wallTop - (m ? 4 : 8), m ? 30 : 46);
        var n = Math.max(2, Math.ceil(pts.length / 2 * this.crack[i]));
        var vis = 1 - bk * 0.85;
        ctx.globalAlpha = vis;
        ctx.beginPath();
        for (var k = 0; k < n; k++) { var px = cx + pts[k * 2] * dw * 0.7, py = cy0 - pts[k * 2 + 1] * ch; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        var pf = this.patch[i];
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = U.rgba(P.bg0, 0.9); ctx.lineWidth = 3.2; ctx.stroke();
        ctx.strokeStyle = U.mix(P.fault, P.alu, pf); ctx.lineWidth = 1.4 + pf * 2.6; ctx.stroke();
        ctx.lineCap = 'butt';
        if (pf < 0.95 && open && !m) D.text(ctx, sv.cve, cx + dw * 0.4, cy0 - ch * 0.75, { size: fs * 0.7, weight: 700, color: P.fault });
        if (pf > 0 && pf < 1) D.glow(ctx, cx, cy0 - ch * pf, 10, P.accent, 0.6);
        ctx.globalAlpha = 1;
      }
      // doorway
      this.archPath(ctx, x, y, dw, dh);
      ctx.fillStyle = U.rgba(P.bg0, 0.92); ctx.fill();
      if (this.flash[i] > 0.03) { ctx.fillStyle = U.rgba(P.fault, this.flash[i] * 0.6); ctx.fill(); }
      ctx.strokeStyle = U.rgba(sv.need ? P.ok : P.blueprint, 0.8); ctx.lineWidth = 1.4; ctx.stroke();
      if (bk < 0.02) {
        // light from inside the open door
        D.glow(ctx, x, g - dh * 0.35, dw * 0.6, sv.need ? P.ok : P.warn, 0.18);
      }
      // bricks with mortar
      if (bk > 0.01) {
        ctx.save(); this.archPath(ctx, x, y, dw, dh); ctx.clip();
        var rows = Math.ceil(dh / (m ? 7 : 9)), rh = dh / rows, bw = dw / 2.5;
        for (var r = 0; r < rows; r++) {
          var kk = U.clamp(bk * rows - r, 0, 1); if (kk <= 0) break;
          var yy = g - (r + 1) * rh;
          ctx.fillStyle = U.mix(P.copper, P.panel3, 0.35); ctx.fillRect(x - dw / 2, yy, dw * kk, rh);
          ctx.strokeStyle = U.rgba(P.alu, 0.7); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x - dw / 2, yy); ctx.lineTo(x - dw / 2 + dw * kk, yy);
          for (var bx = x - dw / 2 + (r % 2 ? bw / 2 : 0); bx < x - dw / 2 + dw * kk; bx += bw) { ctx.moveTo(bx, yy); ctx.lineTo(bx, yy + rh); }
          ctx.stroke();
        }
        ctx.restore();
      }
      // plaque + name
      var plc = open ? (sv.need ? P.ok : P.warn) : P.text3;
      D.pill(ctx, String(sv.port), x, y - (m ? 7 : 10), { color: plc, size: fs * (m ? 0.82 : 0.85), align: 'center', pad: m ? 3 : 5 });
      D.text(ctx, sv.name, x, g + (m ? 30 : 42), { size: fs * (m ? 0.78 : 0.85), weight: 600, color: open ? P.text1 : P.text3, align: 'center', maxW: L.doorSpan - 2 });
      if (!open) D.line(ctx, x - D.measure(ctx, sv.name, fs * (m ? 0.78 : 0.85), 600) / 2, g + (m ? 30 : 42), x + D.measure(ctx, sv.name, fs * (m ? 0.78 : 0.85), 600) / 2, g + (m ? 30 : 42), P.text3, 1);
    },
    drawPanel: function (ctx) {
      var P = S.pal, L = this.L, R = L.panel, fs = L.fs, m = this.mobile;
      var surf = this.surface();
      this.meter = surf;
      var col = surf > 0.45 ? P.fault : surf > 0.2 ? P.warn : P.ok, word = surf > 0.45 ? 'HIGH' : surf > 0.2 ? 'MEDIUM' : 'LOW';
      var openN = 0, bugs = 0; for (var i = 0; i < N; i++) { if (this.brick[i] < 0.5) { openN++; if (this.unpatched(i)) bugs++; } }
      this.rSurf.set(Math.round(surf * 100) + '% · ' + openN + ' doors open', surf > 0.45 ? 'bad' : surf > 0.2 ? 'warn' : 'ok');
      D.box(ctx, R.x, R.y, R.w, R.h, 10, U.rgba(P.panel, 0.92), U.rgba(col, 0.4), 1);
      D.text(ctx, 'ATTACK SURFACE', R.x + 12, R.y + 15, { size: fs * 0.82, weight: 700, color: P.text3, ls: 1.5 });
      if (m) {
        D.text(ctx, Math.round(surf * 100) + '%', R.x + 12, R.y + 40, { size: 22, weight: 700, color: col });
        D.text(ctx, word, R.x + 74, R.y + 40, { size: fs, weight: 700, color: col });
        D.meter(ctx, R.x + 12, R.y + 58, R.w - 24, 8, surf, col);
        var st = [['open doors', openN + '/' + N], ['unpatched', String(bugs)], ['breaches', String(this.breaches)]];
        st.forEach(function (s, k) {
          var x = R.x + 12 + k * (R.w - 24) / 3;
          D.text(ctx, s[0], x, R.y + 82, { size: fs * 0.85, color: P.text3 });
          D.text(ctx, s[1], x, R.y + 98, { size: fs * 1.25, weight: 700, color: k === 0 ? P.text1 : (s[1] !== '0' ? P.fault : P.ok) });
        });
        return;
      }
      D.text(ctx, Math.round(surf * 100) + '%', R.x + 12, R.y + 46, { size: 30, weight: 700, color: col });
      D.text(ctx, word, R.x + 12, R.y + 72, { size: fs, weight: 700, color: col, ls: 1.5 });
      // vertical gauge
      var gx = R.x + R.w - 34, gy = R.y + 30, gh = R.h * 0.5;
      D.box(ctx, gx, gy, 16, gh, 8, U.rgba(P.panel3, 0.9));
      var fh = gh * U.clamp(surf, 0, 1);
      if (fh > 1) D.box(ctx, gx, gy + gh - fh, 16, fh, 8, col);
      for (var tk = 1; tk < 4; tk++) D.line(ctx, gx - 4, gy + gh * tk / 4, gx, gy + gh * tk / 4, U.rgba(P.text3, 0.6), 1);
      var rows = [['open doors', openN + ' / ' + N, P.text1], ['unpatched bugs', String(bugs), bugs ? P.fault : P.ok], ['breaches', U.fmt(this.breaches), this.breaches ? P.fault : P.ok]];
      var y0 = R.y + R.h * 0.62;
      rows.forEach(function (r, k) {
        var y = y0 + k * Math.min(26, R.h * 0.11);
        D.text(ctx, r[0], R.x + 12, y, { size: fs * 0.85, color: P.text3 });
        D.text(ctx, r[1], R.x + R.w - 12, y, { size: fs, weight: 700, color: r[2], align: 'right' });
      });
    },
    describe: function () {
      var o = [], bugs = 0;
      for (var i = 0; i < N; i++) { if (this.open[i]) o.push(SV[i].name); if (this.open[i] && this.unpatched(i)) bugs++; }
      return o.length + ' of 8 doors open (' + o.join(', ') + '), ' + bugs + ' unpatched bugs on open doors, attack surface ' + Math.round(this.meter * 100) + '%, ' + this.breaches + ' breaches.';
    }
  });
})(window.SRV);
