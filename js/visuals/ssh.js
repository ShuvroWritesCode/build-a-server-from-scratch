/* Ch18 · Lock & key (SSH). Generate a key pair (padlock = public, key = private), copy the padlock to
   three servers (authorized_keys), then log in: the server sends a challenge locked with your padlock
   that only your private key opens. Beside it, a password door is hammered by bots (continuous);
   fail2ban jails repeat offenders, and disabling password login bricks the door up. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var NB = 8, CELLS = 4;
  var CREDS = ['root / 123456', 'admin / admin', 'ubuntu / ubuntu', 'pi / raspberry', 'root / toor', 'test / test', 'oracle / oracle', 'user / password1', 'admin / 1234', 'git / git'];
  var SERVERS = ['web-01', 'nas-01', 'db-01'];
  var SEQ = 5.6;

  function bot(ctx, x, y, s, col, P, eyes, t) {
    // little robot: antenna, square head, body
    D.line(ctx, x, y - s * 0.95, x, y - s * 0.72, col, 1.2);
    D.circle(ctx, x, y - s * 1.0, s * 0.09, P.fault);
    D.box(ctx, x - s * 0.34, y - s * 0.72, s * 0.68, s * 0.5, s * 0.1, U.shade(col, -0.2), col, 1);
    D.circle(ctx, x - s * 0.14, y - s * 0.48, s * 0.07, eyes || P.fault);
    D.circle(ctx, x + s * 0.14, y - s * 0.48, s * 0.07, eyes || P.fault);
    D.box(ctx, x - s * 0.26, y - s * 0.2, s * 0.52, s * 0.42, s * 0.06, U.shade(col, -0.35), col, 1);
    var leg = Math.sin((t || 0) * 14) * s * 0.08;
    D.line(ctx, x - s * 0.12, y + s * 0.22, x - s * 0.12 + leg, y + s * 0.38, col, 1.4);
    D.line(ctx, x + s * 0.12, y + s * 0.22, x + s * 0.12 - leg, y + s * 0.38, col, 1.4);
  }

  S.defineVisual('ssh', {
    continuous: true,
    init: function () {
      var self = this;
      this.ctx = this.layer();
      this.genT = 0; this.copyT = 0; this.seqT = -1; this.actor = 'me'; this.loggedIn = false; this.doorOpen = 0; this.denyT = 0;
      this.challenge = '7f3a9c';
      // password door sim
      this.bots = [];
      for (var i = 0; i < NB; i++) this.bots.push({ on: false, st: 'walk', x: 0, y: 0, tx: 0, t: 0, tries: 0, cell: -1, ip: '', bump: 0, slot: 0, ban: 0 });
      this.cells = new Int8Array(CELLS).fill(-1);
      this.attempts = 0; this.banned = 0; this.spawnT = 0.3; this.cred = ''; this.credT = 0; this.knockFlash = 0;
      this.f2b = false; this.noPw = false; this.brickT = 0;
      this.logLines = [];

      var g = this.ui.group('Key login steps');
      this.b1 = g.button('① Generate key pair', function () { self.generate(); }, { kind: 'primary' });
      this.b2 = g.button('② Copy public key', function () { self.copyKey(); });
      this.b3 = g.button('③ Log in', function () { self.login('me'); });
      this.b4 = g.button('Stranger tries', function () { self.login('stranger'); }, { title: 'Someone without your private key tries to log in' });
      g.button('↺', function () { self.resetKeys(); }, { title: 'Start the key steps again' });
      this.ui.br();
      var p = this.ui.group('Password door');
      this.tF = p.toggle({ label: 'fail2ban', value: false, onChange: function (v) { self.f2b = v; self.announce(v ? 'fail2ban on: an address that fails 5 times is banned for 10 minutes.' : 'fail2ban off.'); } });
      this.tP = p.toggle({ label: 'Disable password login', value: false, onChange: function (v) { self.setNoPw(v); } });
      this.ui.spacer();
      this.rAtt = this.ui.readout('Password guesses', '0', 'bad');
      this.syncButtons();
    },
    syncButtons: function () {
      var busy = this.seqT >= 0 && this.seqT < SEQ;
      this.b1.setDisabled(this.genT > 0);
      this.b2.setDisabled(this.genT < 1 || this.copyT > 0);
      this.b3.setDisabled(this.copyT < 1 || busy);
      this.b4.setDisabled(this.copyT < 1 || busy);
      this.b1.className = 'btn' + (this.genT === 0 ? ' primary' : '');
      this.b2.className = 'btn' + (this.genT >= 1 && this.copyT === 0 ? ' primary' : '');
      this.b3.className = 'btn' + (this.copyT >= 1 && !this.loggedIn ? ' primary' : '');
    },
    generate: function () {
      var self = this;
      this.tween({ from: 0, to: 1, dur: 1.8, ease: 'inOutSine', onUpdate: function (v) { self.genT = v; }, onDone: function () { self.syncButtons(); } });
      this.genT = 0.001; this.syncButtons();
      this.announce('ssh-keygen made a key pair: the padlock is your public key, safe to share. The key is your private key; it never leaves the laptop.');
    },
    copyKey: function () {
      var self = this;
      this.copyT = 0.001; this.syncButtons();
      this.tween({ from: 0, to: 1, dur: 2.0, ease: 'linear', onUpdate: function (v) { self.copyT = Math.max(0.001, v); }, onDone: function () { self.syncButtons(); } });
      this.announce('ssh-copy-id put a copy of your padlock on three servers, in a file called authorized_keys.');
    },
    login: function (who) {
      var self = this;
      this.actor = who; this.seqT = 0; this.loggedIn = false; this.doorOpen = 0;
      this.challenge = (this.rng.int(0, 0xffffff) | 0x100000).toString(16);
      this.syncButtons();
      this.tween({ from: 0, to: SEQ, dur: SEQ, ease: 'linear', onUpdate: function (v) { self.seqT = v; }, onDone: function () {
        self.seqT = SEQ;
        if (who === 'me') { self.loggedIn = true; self.announce('Logged in to web-01. The server sent a challenge locked with your padlock; only your private key could open it.'); }
        else self.announce('Permission denied (publickey). The stranger has no private key, so the challenge box stays locked.');
        self.syncButtons();
      } });
    },
    resetKeys: function () { this.genT = 0; this.copyT = 0; this.seqT = -1; this.loggedIn = false; this.syncButtons(); this.announce('Key steps reset.'); },
    setNoPw: function (v) {
      var self = this;
      this.noPw = v;
      this.tween({ from: this.brickT, to: v ? 1 : 0, dur: v ? 1.6 : 0.6, ease: v ? 'linear' : 'settle', onUpdate: function (x) { self.brickT = x; } });
      this.announce(v ? 'Password login disabled. The door is bricked up: guessing passwords is now pointless. Only keys work.' : 'Password login re-enabled.');
    },

    // ------------------------------------------------------------ layout
    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      L.fs = m ? 9.5 : U.clamp(w / 85, 10, 12);
      L.s = m ? U.clamp(w / 380, 0.8, 1.1) : U.clamp(Math.min(w / 980, h / 550), 0.75, 1.3);
      var A = L.A = m ? { x: 8, y: 8, w: w - 16, h: h * 0.57 } : { x: 16, y: 12, w: w * 0.6, h: h - 24 };
      L.lx = A.x + A.w * (m ? 0.2 : 0.16); L.ly = A.y + A.h * (m ? 0.5 : 0.5);
      L.ls = (m ? 60 : 100) * L.s;
      L.genX = L.lx; L.genY = L.ly - L.ls * 0.95;
      L.pubX = L.lx + L.ls * 0.7; L.pubY = L.ly - L.ls * 0.95;
      L.privX = L.lx - L.ls * 0.05; L.privY = L.ly + L.ls * 0.62;
      L.strX = L.lx; L.strY = A.y + A.h * (m ? 0.8 : 0.8);
      L.doors = [];
      var dx = A.x + A.w * (m ? 0.74 : 0.8);
      for (var i = 0; i < 3; i++) L.doors.push({ x: dx, y: A.y + A.h * (m ? 0.27 + i * 0.25 : 0.2 + i * 0.27) });
      L.dw = (m ? 22 : 40) * L.s; L.dh = (m ? 30 : 54) * L.s;
      L.R = m ? { x: 8, y: h * 0.6, w: w - 16, h: h * 0.4 - 8 } : { x: w * 0.64, y: 54, w: w * 0.36 - 16, h: h - 66 };
      var R = L.R;
      L.pdX = R.x + R.w * (m ? 0.2 : 0.24); L.ground = R.y + R.h * (m ? 0.6 : 0.58);
      L.pdW = (m ? 30 : 44) * L.s; L.pdH = (m ? 44 : 66) * L.s;
      L.cellY = R.y + R.h * (m ? 0.74 : 0.74); L.cellW = Math.min((R.w - 24) / CELLS, 70); L.cellH = (m ? 26 : 38) * L.s;
      L.cellX0 = R.x + R.w - 12 - L.cellW * CELLS;
      L.bs = (m ? 15 : 20) * L.s;
    },

    // ------------------------------------------------------------ password-door simulation
    update: function (dt) {
      var L = this.L, R = L.R, r = this.rng, i, b;
      this.spawnT -= dt;
      var active = 0; for (i = 0; i < NB; i++) if (this.bots[i].on && this.bots[i].st !== 'jail') active++;
      if (this.spawnT <= 0 && active < (this.mobile ? 4 : 5)) {
        this.spawnT = 0.9 + r.float() * 1.2;
        for (i = 0; i < NB; i++) if (!this.bots[i].on) { this.spawnBot(this.bots[i]); break; }
      }
      // queue slots
      var slot = 0;
      for (i = 0; i < NB; i++) {
        b = this.bots[i]; if (!b.on) continue;
        if (b.st === 'walk' || b.st === 'knock') { b.slot = slot++; b.tx = L.pdX + L.pdW * 0.5 + L.bs * 0.7 + b.slot * L.bs * 1.15; }
      }
      for (i = 0; i < NB; i++) {
        b = this.bots[i]; if (!b.on) continue;
        b.t += dt; b.bump *= Math.exp(-dt * 10);
        if (b.st === 'walk') {
          b.x -= 60 * L.s * dt;
          if (b.x <= b.tx) { b.x = b.tx; b.st = this.noPw ? 'confused' : 'knock'; b.t = 0; if (this.noPw) this.logLine('Connection closed by ' + b.ip + ' port ' + r.int(32768, 60999) + ' [preauth] · no password prompt'); }
        } else if (b.st === 'knock') {
          b.x = U.damp(b.x, b.tx, 8, dt);
          if (this.noPw) { b.st = 'confused'; b.t = 0; continue; }
          if (b.slot === 0 && b.t > 0.45) {
            b.t = 0; b.tries++; b.bump = 1; this.attempts++; this.knockFlash = 1;
            this.cred = r.pick(CREDS); this.credT = 0.9;
            this.logLine('Failed password for ' + this.cred.split(' / ')[0] + ' from ' + b.ip + ' port ' + r.int(32768, 60999) + ' ssh2');
            if (this.f2b && b.tries >= 5) this.jail(b);
            else if (b.tries > 24) { b.st = 'leave'; }
          } else if (b.slot > 0 && b.t > 0.7 && !this.f2b) {
            // bots further back also hammer (shared door, many connections)
            b.t = 0; b.tries++; b.bump = 1; this.attempts++;
            if (b.tries > 24) b.st = 'leave';
          }
        } else if (b.st === 'toJail') {
          var c = this.cellPos(b.cell);
          b.x = U.damp(b.x, c.x, 5, dt); b.y = U.damp(b.y, c.y, 5, dt);
          if (Math.abs(b.x - c.x) < 1.5 && Math.abs(b.y - c.y) < 1.5) { b.st = 'jail'; b.t = 0; }
        } else if (b.st === 'jail') {
          b.ban -= dt;
          if (b.ban <= 0) { this.cells[b.cell] = -1; b.cell = -1; b.st = 'leave'; b.y = L.ground; }
        } else if (b.st === 'confused') {
          if (b.t > 1.1) b.st = 'leave';
        } else if (b.st === 'leave') {
          b.x += 70 * L.s * dt; b.y = U.damp(b.y, L.ground, 6, dt);
          if (b.x > R.x + R.w + 20) b.on = false;
        }
      }
      if (this.credT > 0) this.credT -= dt;
      this.knockFlash *= Math.exp(-dt * 8);
      this.rAtt.set(U.fmt(this.attempts) + (this.noPw ? ' · pointless' : this.f2b ? ' · ' + this.banned + ' banned' : ''), this.noPw ? 'ok' : 'bad');
    },
    spawnBot: function (b) {
      var L = this.L, R = L.R, r = this.rng;
      b.on = true; b.st = 'walk'; b.x = R.x + R.w + 14; b.y = L.ground; b.t = 0; b.tries = 0; b.cell = -1; b.bump = 0;
      b.ip = r.pick(['45.83.', '61.177.', '218.92.', '141.98.', '193.32.', '179.43.']) + r.int(1, 254) + '.' + r.int(1, 254);
    },
    jail: function (b) {
      var c = -1, i;
      for (i = 0; i < CELLS; i++) if (this.cells[i] < 0) { c = i; break; }
      if (c < 0) { // free the oldest
        var oldest = null; for (i = 0; i < NB; i++) { var o = this.bots[i]; if (o.on && o.st === 'jail' && (!oldest || o.ban < oldest.ban)) oldest = o; }
        if (oldest) { c = oldest.cell; oldest.st = 'leave'; oldest.cell = -1; oldest.y = this.L.ground; }
      }
      if (c < 0) { b.st = 'leave'; return; }
      this.cells[c] = this.bots.indexOf(b);
      b.cell = c; b.st = 'toJail'; b.ban = 12; this.banned++;
      this.logLine('fail2ban.actions [sshd] Ban ' + b.ip);
      if (this.banned === 1) this.announce('fail2ban banned ' + b.ip + ' after 5 failed passwords.');
    },
    logLine: function (str) { this.logLines.push(str); if (this.logLines.length > 4) this.logLines.shift(); },
    cellPos: function (c) { var L = this.L; return { x: L.cellX0 + L.cellW * (c + 0.5), y: L.cellY + L.cellH * 0.32 }; },

    // ------------------------------------------------------------ drawing
    draw: function () {
      if (this.w < 160 || this.h < 120) { D.clear(this.ctx, this.w, this.h); return; }
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L;
      D.clear(ctx, w, h);
      this.drawKeyScene(ctx);
      this.drawPasswordPanel(ctx);
      this.setDesc(this.describe());
    },
    drawDoor: function (ctx, i, d) {
      var P = S.pal, L = this.L, fs = L.fs, dw = L.dw, dh = L.dh;
      var open = i === 0 ? this.doorOpen : 0, deny = i === 0 ? this.denyT : 0;
      var bw = dw * 2.3, bh = dh * 1.25, bx = d.x - bw / 2 + dw * 0.35, by = d.y - bh * 0.6;
      D.box(ctx, bx, by, bw, bh, 5, U.rgba(P.panel2, 0.9), U.rgba(open > 0.5 ? P.ok : P.blueprint, 0.55), 1);
      D.text(ctx, SERVERS[i], bx + bw / 2, by - 8, { size: fs * 0.9, weight: 700, color: P.text1, align: 'center' });
      var x0 = d.x - dw / 2 + dw * 0.35, y0 = d.y - dh / 2 + bh * 0.08;
      // doorway
      D.box(ctx, x0, y0, dw, dh, 2, open > 0.02 ? U.rgba(P.ok, 0.25 * open) : U.rgba(P.bg0, 0.6), U.rgba(P.blueprint, 0.6), 1);
      if (open > 0.02) D.glow(ctx, x0 + dw / 2, y0 + dh / 2, dw, P.ok, open * 0.35);
      // door leaf swinging in (narrows)
      var lw = dw * (1 - open * 0.78);
      D.box(ctx, x0, y0, lw, dh, 2, U.mix(P.steel, deny > 0 ? P.fault : P.panel3, deny > 0 ? deny * 0.6 : 0.2), U.shade(P.steel, 0.3), 1);
      D.circle(ctx, x0 + lw - 5, y0 + dh * 0.55, 1.8, P.gold);
      if (open > 0.6) D.g.check(ctx, x0 + dw / 2 + dw * 0.4, y0 - 2, 16, P.ok);
      // padlock slot (authorized_keys)
      var k = this.copyArrive(i);
      var sx = x0 - dw * 0.45, sy = y0 + dh * 0.3;
      if (k >= 1) D.g.padlock(ctx, sx, sy, dw * 0.55, P.gold, false);
      else { ctx.setLineDash([2, 3]); D.box(ctx, sx - dw * 0.18, sy - dw * 0.1, dw * 0.36, dw * 0.32, 2, null, U.rgba(P.text3, 0.6), 1); ctx.setLineDash([]); }
      if (k >= 1 && !this.mobile) D.text(ctx, 'authorized_keys', bx + bw / 2, by + bh + 9, { size: fs * 0.72, color: P.gold, align: 'center' });
    },
    copyArrive: function (i) { return U.clamp((this.copyT - i * 0.18) / 0.62, 0, 1); },
    drawKeyScene: function (ctx) {
      var P = S.pal, L = this.L, A = L.A, fs = L.fs, m = this.mobile, t = this.time, self = this;
      D.text(ctx, 'KEY LOGIN', A.x, A.y + 8, { size: fs * 0.82, weight: 700, color: P.text3, ls: 1.5 });
      // laptop
      D.g.laptop(ctx, L.lx, L.ly, L.ls, P.alu);
      D.text(ctx, 'your laptop', L.lx, L.ly + L.ls * 0.36, { size: fs * 0.85, color: P.text3, align: 'center' });
      // doors
      L.doors.forEach(function (d, i) { self.drawDoor(ctx, i, d); });
      // key pair
      var g = this.genT, kx, ky;
      if (g <= 0) {
        ctx.setLineDash([4, 4]);
        D.box(ctx, L.genX - L.ls * 0.3, L.genY - L.ls * 0.2, L.ls * 0.6, L.ls * 0.4, 6, null, U.rgba(P.text3, 0.6), 1);
        ctx.setLineDash([]);
        D.text(ctx, 'no key yet', L.genX, L.genY, { size: fs * 0.8, color: P.text3, align: 'center' });
      } else {
        var split = U.smoothstep(0.45, 1, g), pop = U.ease.outBack(U.clamp(g / 0.4, 0, 1));
        var gs = L.ls * 0.42 * pop;
        if (split < 0.02) {
          // fused key pair glyph
          D.glow(ctx, L.genX, L.genY, gs * 1.4, P.accent, 0.4 * pop);
          D.g.padlock(ctx, L.genX - gs * 0.18, L.genY, gs, P.gold, false);
          D.g.key(ctx, L.genX + gs * 0.15, L.genY + gs * 0.12, gs, P.accent);
          D.text(ctx, 'ssh-keygen -t ed25519', L.genX, L.genY - gs * 0.8 - 4, { size: fs * 0.8, weight: 600, color: P.accent, align: 'center', alpha: pop });
        } else {
          var px = U.lerp(L.genX, L.pubX, split), py = U.lerp(L.genY, L.pubY, split) - Math.sin(split * Math.PI) * 10;
          kx = U.lerp(L.genX, L.privX, split); ky = U.lerp(L.genY, L.privY, split);
          D.g.padlock(ctx, px, py, gs, P.gold, false);
          if (split > 0.9) {
            var la = U.smoothstep(0.9, 1, split);
            D.text(ctx, m ? 'public' : 'public key · id_ed25519.pub', px + gs * 0.5, py - 1, { size: fs * 0.8, weight: 700, color: P.gold, alpha: la });
            if (!m) D.text(ctx, 'a padlock: share it freely', px + gs * 0.5, py + fs + 1, { size: fs * 0.75, color: P.text3, alpha: la });
          }
          // private key stays unless it's being used
          var use = this.actor === 'me' ? U.segment(this.seqT, 2.7, 3.0) * (1 - U.segment(this.seqT, 3.6, 3.9)) : 0;
          var bxp = this.boxPos(), kkx = U.lerp(kx, bxp.x - 6, use), kky = U.lerp(ky, bxp.y + (this.mobile ? 26 : 42) * L.s * 0.75, use);
          var rot = U.segment(this.seqT, 3.0, 3.4) * Math.PI * 0.5 * (this.actor === 'me' ? 1 : 0);
          ctx.save(); ctx.translate(kkx, kky); ctx.rotate(-rot);
          D.glow(ctx, 0, 0, gs, P.accent, 0.3);
          D.g.key(ctx, 0, 0, gs, P.accent);
          ctx.restore();
          if (split > 0.9 && use < 0.05) {
            var la2 = U.smoothstep(0.9, 1, split);
            D.text(ctx, m ? 'private' : 'private key · id_ed25519', kx + gs * 0.6, ky - 1, { size: fs * 0.8, weight: 700, color: P.accent, alpha: la2 });
            if (!m) D.text(ctx, 'never leaves this laptop', kx + gs * 0.6, ky + fs + 1, { size: fs * 0.75, color: P.text3, alpha: la2 });
          }
        }
      }
      // copies flying to doors
      if (this.copyT > 0 && this.copyT < 1) {
        L.doors.forEach(function (d, i) {
          var k = self.copyArrive(i); if (k <= 0 || k >= 1) return;
          var e = U.ease.inOutSine(k), tx = d.x - L.dw / 2 + L.dw * 0.35 - L.dw * 0.45, ty = d.y - L.dh / 2 + L.dh * 0.3 + L.dh * 0.1;
          var x = U.lerp(L.pubX, tx, e), y = U.lerp(L.pubY, ty, e) - Math.sin(e * Math.PI) * 40 * L.s;
          D.g.padlock(ctx, x, y, L.dw * 0.55, P.gold, false);
        });
        D.pill(ctx, 'ssh-copy-id matt@server', (L.pubX + L.doors[1].x) / 2, L.doors[0].y - L.dh * 0.9, { color: P.gold, size: fs * 0.8, align: 'center' });
      }
      // stranger
      if (this.copyT >= 1) {
        var sa = this.actor === 'stranger' && this.seqT >= 0 ? 1 : 0.45;
        D.g.person(ctx, L.strX - L.ls * 0.25, L.strY, L.ls * 0.34, P.text3, {});
        D.g.laptop(ctx, L.strX + L.ls * 0.12, L.strY + 2, L.ls * 0.42, U.mix(P.alu, P.bg, 1 - sa));
        D.text(ctx, 'stranger · no private key', L.strX + L.ls * 0.42, L.strY, { size: fs * 0.75, color: P.text3, alpha: sa });
      }
      if (this.seqT >= 0) this.drawLoginSeq(ctx);
      var cap = this.caption();
      D.text(ctx, cap[0], A.x, A.y + A.h - 8, { size: fs * (m ? 0.85 : 0.95), weight: 700, color: cap[1], maxW: A.w - 8 });
    },
    caption: function () {
      var P = S.pal, t = this.seqT, me = this.actor === 'me';
      if (this.genT <= 0) return ['Step ① · make a key pair on your laptop', P.text2];
      if (this.genT < 1) return ['ssh-keygen: one padlock + the only key that opens it', P.accent];
      if (this.copyT <= 0) return ['Step ② · copy the padlock (public key) to your servers', P.text2];
      if (this.copyT < 1) return ['the padlock goes into ~/.ssh/authorized_keys', P.gold];
      if (t < 0) return ['Step ③ · log in, and watch the challenge', P.text2];
      if (t < 0.9) return [me ? 'you: “I’m matt, let me in”' : 'stranger: “let me in”', P.net];
      if (t < 2.7) return ['server: a random challenge, locked with YOUR padlock', P.gold];
      if (!me) return t < 4.2 ? ['no private key → the box stays shut', P.fault] : ['✕ Permission denied (publickey)', P.fault];
      if (t < 3.7) return ['only your private key opens it', P.accent];
      if (t < 4.7) return ['send back the answer · the key never left the laptop', P.ok];
      return ['✓ in — and no password ever crossed the network', P.ok];
    },
    boxPos: function () {
      var L = this.L, d = L.doors[0], who = this.actor === 'me' ? { x: L.lx + L.ls * 0.66, y: L.ly - L.ls * 0.42 } : { x: L.strX + L.ls * 0.35, y: L.strY - L.ls * 0.1 };
      var door = { x: d.x - L.dw * 0.6, y: d.y };
      var k = U.ease.inOutSine(U.segment(this.seqT, 1.6, 2.7));
      return { x: U.lerp(door.x, who.x, k), y: U.lerp(door.y, who.y, k) - Math.sin(k * Math.PI) * 24 * L.s, at: who, door: door };
    },
    drawLoginSeq: function (ctx) {
      var P = S.pal, L = this.L, fs = L.fs, t = this.seqT, me = this.actor === 'me', d = L.doors[0];
      var src = me ? { x: L.lx + L.ls * 0.3, y: L.ly - L.ls * 0.2 } : { x: L.strX + L.ls * 0.35, y: L.strY - L.ls * 0.15 };
      var door = { x: d.x - L.dw * 0.6, y: d.y };
      // 1) hello
      if (t < 0.95) {
        var k = U.ease.inOutSine(U.segment(t, 0, 0.9)), x = U.lerp(src.x, door.x, k), y = U.lerp(src.y, door.y, k);
        D.glow(ctx, x, y, 12, P.net, 0.6); D.g.envelope(ctx, x, y, 14, P.net);
        D.pill(ctx, me ? 'ssh matt@web-01' : 'ssh root@web-01', x, y - 15, { color: P.net, size: fs * 0.8, align: 'center' });
      }
      // 2) challenge box
      if (t >= 0.9 && t < 3.9 + (me ? 0 : 1.6)) {
        var bp = this.boxPos(), bs = (this.mobile ? 26 : 42) * L.s;
        var appear = U.ease.outBack(U.segment(t, 0.9, 1.25));
        var lockOn = U.segment(t, 1.25, 1.55);
        var opened = me ? U.segment(t, 3.3, 3.5) : 0;
        var jiggle = !me && t > 2.8 && t < 3.8 ? Math.sin(t * 50) * 2 : 0;
        ctx.save(); ctx.translate(bp.x + jiggle, bp.y); ctx.scale(appear, appear);
        // lid
        var lidUp = opened * bs * 0.35;
        D.box(ctx, -bs / 2, -bs * 0.32, bs, bs * 0.66, 3, U.mix(P.copper, P.panel, 0.2), U.shade(P.copper, 0.3), 1.2);
        D.box(ctx, -bs / 2 - 2, -bs * 0.42 - lidUp, bs + 4, bs * 0.16, 2, U.shade(P.copper, 0.15), U.shade(P.copper, 0.35), 1);
        if (opened > 0.5) D.text(ctx, this.challenge, 0, -bs * 0.05, { size: fs * 0.82, weight: 700, color: P.text1, align: 'center' });
        else D.text(ctx, '? ? ?', 0, -bs * 0.02, { size: fs * 0.75, weight: 700, color: U.rgba(P.text1, 0.6), align: 'center' });
        if (lockOn > 0) D.g.padlock(ctx, 0, bs * 0.38 - (1 - lockOn) * 14, bs * 0.45, P.gold, opened > 0.5);
        ctx.restore();
        if (t > 1.3 && t < 2.6) D.pill(ctx, 'prove it: open this', bp.x, bp.y - bs * 0.75, { color: P.gold, size: fs * 0.8, align: 'center' });
        if (!me && t > 2.8) {
          D.g.cross(ctx, bp.x + bs * 0.6, bp.y - bs * 0.5, 16, P.fault);
          D.pill(ctx, 'can’t open: no private key', bp.x, bp.y - bs * 0.85, { color: P.fault, size: fs * 0.8, align: 'center' });
        }
      }
      // 3) answer back
      if (me && t >= 3.6 && t < 4.75) {
        var k2 = U.ease.inOutSine(U.segment(t, 3.7, 4.7)), ax = U.lerp(src.x, door.x, k2), ay = U.lerp(src.y, door.y, k2);
        D.glow(ctx, ax, ay, 12, P.ok, 0.6); D.g.envelope(ctx, ax, ay, 14, P.ok);
        D.pill(ctx, 'answer: ' + this.challenge + ' ✓', ax, ay - 15, { color: P.ok, size: fs * 0.8, align: 'center' });
      }
      // 4) door
      this.doorOpen = me ? U.ease.outCubic(U.segment(t, 4.7, 5.3)) : 0;
      this.denyT = !me && t > 4.2 ? 1 - U.segment(t, 5.2, SEQ) * 0.5 : 0;
      if (me && t >= 5.2 && !this.mobile) D.pill(ctx, '✓ Welcome to web-01', d.x, d.y + L.dh * 0.95, { color: P.ok, size: fs * 0.85, align: 'center' });
      if (!me && t >= 4.2 && !this.mobile) D.pill(ctx, '✕ Permission denied (publickey)', d.x - L.dw * 0.6, d.y + L.dh * 0.95, { color: P.fault, size: fs * 0.8, align: 'center' });
    },
    drawPasswordPanel: function (ctx) {
      var P = S.pal, L = this.L, R = L.R, fs = L.fs, m = this.mobile, t = this.time, self = this;
      D.box(ctx, R.x, R.y, R.w, R.h, 10, U.rgba(P.panel, 0.9), U.rgba(this.noPw ? P.ok : P.fault, 0.35), 1);
      D.text(ctx, m ? 'PASSWORD LOGIN' : 'PASSWORD LOGIN · open to the internet', R.x + 12, R.y + 14, { size: fs * 0.82, weight: 700, color: P.text3, ls: 1.2, maxW: R.w - 24 });
      // attempt counter
      var cy = R.y + (m ? 32 : 40);
      D.text(ctx, U.fmt(this.attempts), R.x + 12, cy, { size: (m ? 18 : 24), weight: 700, color: this.noPw ? P.text3 : U.mix(P.fault, P.text1, 1 - this.knockFlash * 0.6) });
      var cw = D.measure(ctx, U.fmt(this.attempts), m ? 18 : 24, 700);
      if (this.noPw) D.line(ctx, R.x + 10, cy, R.x + 14 + cw, cy, P.text3, 1.5);
      D.text(ctx, this.noPw ? 'guesses — all pointless now' : 'failed password guesses', R.x + 18 + cw, cy + 1, { size: fs * 0.8, color: this.noPw ? P.ok : P.text2, maxW: R.w - cw - 30 });
      // ground
      D.line(ctx, R.x + 10, L.ground + L.bs * 0.4, R.x + R.w - 10, L.ground + L.bs * 0.4, U.rgba(P.blueprint, 0.3), 1);
      // door
      var dx = L.pdX - L.pdW / 2, dy = L.ground + L.bs * 0.4 - L.pdH;
      D.box(ctx, dx - 6, dy - 6, L.pdW + 12, L.pdH + 6, 3, U.rgba(P.panel3, 0.9), U.rgba(P.blueprint, 0.5), 1);
      D.box(ctx, dx, dy, L.pdW, L.pdH, 2, U.mix(P.steel, P.fault, this.knockFlash * 0.3), U.shade(P.steel, 0.3), 1);
      // keypad
      for (var r2 = 0; r2 < 3; r2++) for (var c2 = 0; c2 < 3; c2++) D.box(ctx, dx + L.pdW * 0.22 + c2 * L.pdW * 0.2, dy + L.pdH * 0.3 + r2 * L.pdW * 0.2, L.pdW * 0.14, L.pdW * 0.14, 1, U.rgba(P.text2, 0.5));
      D.text(ctx, ':22', L.pdX, dy - 14, { size: fs * 0.85, weight: 700, color: P.text2, align: 'center' });
      // bricks
      if (this.brickT > 0.001) {
        var rows = 7, rhh = (L.pdH + 6) / rows, bw = (L.pdW + 12) / 3;
        for (var i = 0; i < rows; i++) {
          var k = U.clamp(this.brickT * rows - i, 0, 1); if (k <= 0) continue;
          var yy = dy + L.pdH - (i + 1) * rhh;
          for (var j = -1; j < 3; j++) {
            var bx = dx - 6 + j * bw + (i % 2 ? bw / 2 : 0);
            var x0 = Math.max(dx - 6, bx), x1 = Math.min(dx + L.pdW + 6, bx + bw);
            if (x1 - x0 < 1) continue;
            ctx.globalAlpha = k;
            D.box(ctx, x0 + 0.8, yy + 0.8, (x1 - x0 - 1.6) * Math.min(1, k * 1.5), rhh - 1.6, 1, U.mix(P.copper, P.fault, 0.25), null);
            ctx.globalAlpha = 1;
          }
        }
        if (this.brickT >= 1) D.text(ctx, m ? 'keys only' : 'PasswordAuthentication no', L.pdX, L.ground + L.bs * 0.4 + 12, { size: fs * 0.75, weight: 700, color: P.ok, align: 'center' });
      }
      // credential guess bubble
      if (this.credT > 0 && !this.noPw) {
        D.pill(ctx, this.cred + '  ✕', L.pdX + L.pdW * 0.5 + (m ? 6 : 10), dy + 4, { color: P.fault, size: fs * 0.8, align: 'left', alpha: Math.min(1, this.credT * 3) });
      }
      // jail
      if (this.f2b || this.banned) {
        D.text(ctx, m ? 'fail2ban jail' : 'fail2ban jail · 5 fails → banned 10 min', L.cellX0, L.cellY - 9, { size: fs * 0.75, weight: 700, color: this.f2b ? P.warn : P.text3 });
        for (var c = 0; c < CELLS; c++) {
          var cx = L.cellX0 + c * L.cellW;
          D.box(ctx, cx + 2, L.cellY, L.cellW - 4, L.cellH, 3, U.rgba(P.bg0, 0.4), U.rgba(P.warn, this.f2b ? 0.6 : 0.25), 1);
        }
      }
      // auth.log tail
      if (!m) {
        var ly0 = L.cellY + L.cellH + 26, lh = fs * 1.25;
        if (ly0 + lh < R.y + R.h - 4) {
          D.text(ctx, '/var/log/auth.log', R.x + 12, ly0, { size: fs * 0.72, weight: 700, color: P.text3, ls: 1 });
          for (var li = 0; li < this.logLines.length && ly0 + (li + 1.6) * lh < R.y + R.h - 6; li++) {
            var ln = this.logLines[li];
            D.text(ctx, ln, R.x + 12, ly0 + (li + 1.2) * lh, { size: fs * 0.7, color: ln.indexOf('Ban') > 0 ? P.warn : ln.indexOf('closed') >= 0 ? P.ok : U.mix(P.fault, P.text2, 0.4), maxW: R.w - 24, alpha: 0.5 + 0.5 * (li + 1) / this.logLines.length });
          }
        }
      }
      // bots
      for (var b = 0; b < NB; b++) {
        var bt = this.bots[b]; if (!bt.on) continue;
        var bxp = bt.x - bt.bump * 4, col = bt.st === 'jail' || bt.st === 'toJail' ? P.text3 : P.alu;
        bot(ctx, bxp, bt.y, L.bs, col, P, bt.st === 'jail' ? P.text3 : P.fault, bt.st === 'walk' || bt.st === 'leave' ? t + b : 0);
        if (bt.st === 'confused') D.text(ctx, '?', bxp, bt.y - L.bs * 1.3, { size: fs * 1.3, weight: 700, color: P.warn, align: 'center' });
        if (bt.st === 'jail') {
          // bars over the bot
          var cpos = this.cellPos(bt.cell);
          for (var bb = -2; bb <= 2; bb++) D.line(ctx, cpos.x + bb * L.cellW * 0.16, L.cellY + 1, cpos.x + bb * L.cellW * 0.16, L.cellY + L.cellH - 1, P.warn, 1.4);
          if (!m) D.text(ctx, bt.ip, cpos.x, L.cellY + L.cellH + 8, { size: fs * 0.62, color: P.text3, align: 'center' });
        }
        if (bt.slot === 0 && bt.st === 'knock' && this.f2b) {
          for (var q = 0; q < 5; q++) D.circle(ctx, bxp - L.bs * 0.4 + q * L.bs * 0.2, bt.y - L.bs * 1.25, 2, q < bt.tries ? P.fault : U.rgba(P.text3, 0.5));
        }
      }
    },
    describe: function () {
      var k = this.genT < 1 ? 'No key pair yet' : this.copyT < 1 ? 'Key pair made; public key not copied yet' : this.loggedIn ? 'Logged in with the key' : 'Public key is on three servers';
      return k + '. Password door: ' + this.attempts + ' guesses' + (this.noPw ? ', but password login is disabled' : this.f2b ? ', fail2ban has banned ' + this.banned : '') + '.';
    }
  });
})(window.SRV);
