/* Ch18 · The gatekeeper. Port-labelled packets from the admin LAN, the internet, a port scanner and a
   brute-force burst arrive at a gate. An ordered rule list is checked top → bottom (first match wins,
   real CIDR matching); a highlight sweeps down per packet. ACCEPT → green to the service, DROP → red
   into the bin. Presets, default policy, and keyboard-accessible rule reordering. Pooled packets. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var POOL = 56;

  function ip2n(s) { var p = s.split('.'); return (((+p[0]) << 24) | ((+p[1]) << 16) | ((+p[2]) << 8) | (+p[3])) >>> 0; }
  function cidr(str) { var a = str.split('/'); return { net: ip2n(a[0]), bits: +(a[1] || 32) }; }
  function inCidr(ip, r) { return r.bits === 0 || ((ip ^ r.net) >>> (32 - r.bits)) === 0; }

  var PORTS = [
    { port: 22, name: 'SSH', risky: false },
    { port: 80, name: 'HTTP', risky: false },
    { port: 443, name: 'HTTPS', risky: false },
    { port: 3306, name: 'MySQL', risky: true },
    { port: 5432, name: 'Postgres', risky: true },
    { port: 3389, name: 'RDP', risky: true },
    { port: 23, name: 'telnet', risky: true }
  ];
  var PORT_ROW = {}; PORTS.forEach(function (p, i) { PORT_ROW[p.port] = i; });

  // sources: who sends what
  var SRC = [
    { key: 'admin', name: 'ADMIN LAPTOP', short: 'ADMIN', range: '192.168.1.10', lan: true },
    { key: 'users', name: 'VISITORS', short: 'VISITORS', range: 'internet', lan: false },
    { key: 'scan', name: 'PORT SCANNER', short: 'SCANNER', range: '45.155.205.x', lan: false },
    { key: 'brute', name: 'BRUTE FORCE', short: 'BRUTE', range: '203.0.113.0/24', lan: false }
  ];

  var PRESETS = {
    open: { policy: 'ACCEPT', rules: [['ACCEPT', '0.0.0.0/0', null, 'allow everything']] },
    sensible: { policy: 'DROP', rules: [
      ['ACCEPT', '0.0.0.0/0', 443, 'HTTPS for everyone'],
      ['ACCEPT', '192.168.1.0/24', 22, 'SSH from home LAN only'],
      ['DROP', '203.0.113.0/24', null, 'block-list: attacker range']
    ] },
    locked: { policy: 'DROP', rules: [['ACCEPT', '0.0.0.0/0', 443, 'HTTPS… (forgot to allow 22!)']] }
  };

  S.defineVisual('firewall', {
    continuous: true,
    init: function () {
      var self = this;
      this.ctx = this.layer();
      this.pool = [];
      for (var i = 0; i < POOL; i++) this.pool.push({ alive: false, phase: 0, x: 0, y: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 1, src: 0, ip: 0, ipStr: '', port: 0, portStr: '', qi: 0, verdict: 0, rule: -1 });
      this.queue = new Int16Array(64); this.qHead = 0; this.qLen = 0; this.qAbs = 0;
      this.cur = -1; this.evalRow = 0; this.evalT = 0; this.matched = -1; this.holdT = 0;
      this.spawnT = 0.2; this.burstT = 6; this.burstLeft = 0; this.burstGap = 0;
      this.allowed = 0; this.blocked = 0; this.binShake = 0; this.gateOpen = 0; this.gateFlash = 0; this.flashCol = null;
      this.rowFlash = new Float32Array(PORTS.length); this.rowBad = new Float32Array(PORTS.length);
      this.srcPulse = new Float32Array(SRC.length);
      this.banner = null; this.bannerT = 0;
      this.sel = 0; this.preset = 'sensible';
      this.sum = { a: 0, b: 0, brute: 0, t: 0 };
      this.tmp = {};

      var g = this.ui.group('Presets');
      this.segPreset = g.seg({ label: 'Preset', options: [['open', 'Wide open'], ['sensible', 'Sensible default'], ['locked', 'Oops — locked out']], value: 'sensible', onChange: function (v) { self.loadPreset(v); } });
      this.segPolicy = this.ui.seg({ label: 'Default policy', options: [['ACCEPT', 'Accept'], ['DROP', 'Deny']], value: 'DROP', onChange: function (v) { self.policy = v; self.markCustom(); self.announce('Default policy is now ' + (v === 'DROP' ? 'deny' : 'accept') + ': anything no rule matches is ' + (v === 'DROP' ? 'dropped.' : 'let in.')); } });
      this.ui.br();
      var r = this.ui.group('Reorder rules');
      this.selRule = r.select({ label: 'Rule', options: [['0', '1']], value: '0', onChange: function (v) { self.sel = +v; } });
      this.bUp = r.button('▲ Move up', function () { self.move(-1); }, { title: 'Move the selected rule up' });
      this.bDn = r.button('▼ Move down', function () { self.move(1); }, { title: 'Move the selected rule down' });
      this.bBurst = this.ui.button('⚡ Brute-force burst', function () { self.burstLeft = 14; self.burstGap = 0; self.announce('A brute-force burst starts from 203.0.113.0/24.'); }, { kind: 'danger' });
      this.ui.spacer();
      this.rA = this.ui.readout('Allowed', '0', 'ok');
      this.rB = this.ui.readout('Blocked', '0', 'bad');
      this.loadPreset('sensible', true);

      this.pointer({
        down: function (p) { var hit = self.hits.query(p.x, p.y); if (hit && hit.id === 'row') { self.select(hit.data); } return false; },
        hover: function (p) {
          var hit = self.hits.query(p.x, p.y);
          self.stage.style.cursor = hit ? 'pointer' : '';
          if (hit && hit.id === 'row') self.tipAt('Click to select rule ' + (hit.data + 1) + ', then move it with ▲ / ▼ below', p.x, p.y); else self.tipAt(null);
        }
      });
    },

    // ------------------------------------------------------------ rules
    loadPreset: function (k, quiet) {
      var pr = PRESETS[k];
      this.preset = k;
      this.rules = pr.rules.map(function (r) { var c = cidr(r[1]); return { act: r[0], src: r[1], net: c.net, bits: c.bits, port: r[2], note: r[3], hits: 0, flash: 0 }; });
      this.policy = pr.policy; this.policyHits = 0; this.policyFlash = 0;
      this.segPolicy.set(pr.policy, false);
      this.sel = Math.min(this.sel, this.rules.length - 1);
      this.allowed = this.blocked = 0;
      // flush in-flight evaluation so the new rules apply immediately
      if (this.cur >= 0 && this.pool) this.pool[this.cur].alive = false;
      this.cur = -1; this.matched = -1;
      this.banner = null;
      this.syncSelect();
      if (!quiet) this.announce(k === 'open' ? 'Wide open: everything is accepted, including scanners reaching remote desktop and databases.' :
        k === 'sensible' ? 'Sensible default: HTTPS from anywhere, SSH only from the home network, everything else denied.' :
        'Oops: default deny with only HTTPS allowed. Your own SSH connection is now dropped — you are locked out.');
    },
    markCustom: function () { this.preset = 'custom'; this.segPreset.set(null, false); },
    ruleText: function (r, i) { return (i + 1) + ' ' + r.act + ' ' + (r.port ? 'tcp/' + r.port : 'all') + ' from ' + (r.bits === 0 ? 'anywhere' : r.src); },
    syncSelect: function () {
      var s = this.selRule.el.querySelector('select'), self = this;
      s.innerHTML = '';
      this.rules.forEach(function (r, i) { var o = document.createElement('option'); o.value = String(i); o.textContent = self.ruleText(r, i); s.appendChild(o); });
      s.value = String(this.sel);
      this.bUp.setDisabled(this.sel <= 0); this.bDn.setDisabled(this.sel >= this.rules.length - 1);
    },
    select: function (i) { this.sel = i; this.syncSelect(); this.invalidate(); },
    move: function (d) {
      var i = this.sel, j = i + d;
      if (j < 0 || j >= this.rules.length) return;
      var t = this.rules[i]; this.rules[i] = this.rules[j]; this.rules[j] = t;
      this.sel = j; this.markCustom(); this.syncSelect();
      this.rules[j].flash = 1;
      this.announce('Moved to position ' + (j + 1) + ': ' + this.ruleText(this.rules[j], j) + '. Rules are checked top to bottom; the first match wins.');
    },
    matchRule: function (p, r) { return (r.port == null || r.port === p.port) && inCidr(p.ip, r); },

    // ------------------------------------------------------------ layout
    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      L.fs = m ? 9.5 : U.clamp(w / 85, 10, 12.5);
      L.top = m ? 0.5 : 0.56;            // fraction for the yard
      var yh = h * L.top;
      L.gx = w * (m ? 0.5 : 0.47); L.gy = yh * 0.5; L.gTop = yh * 0.1; L.gBot = yh * 0.86;
      L.srcX = m ? 8 : 16; L.srcW = m ? w * 0.27 : Math.min(200, w * 0.22);
      L.srcY = []; var sh = (L.gBot - L.gTop) / SRC.length;
      for (var i = 0; i < SRC.length; i++) L.srcY.push(L.gTop + sh * (i + 0.5));
      L.srcH = Math.min(sh - 8, m ? 40 : 46);
      L.svX = m ? w * 0.70 : w * 0.73; L.svW = w - L.svX - (m ? 8 : 16);
      L.svTop = Math.max(L.gTop, 50); L.svBot = L.gBot;
      L.rowH = (L.svBot - L.svTop - (m ? 22 : 26)) / PORTS.length;
      L.binX = L.gx; L.binY = yh * 0.98;
      L.tbl = { x: m ? 8 : 16, y: yh + (m ? 26 : 30), w: w - (m ? 16 : 32) };
      L.tbl.h = h - L.tbl.y - (m ? 8 : 12);
    },
    rowY: function (i) { var L = this.L; return L.svTop + (this.mobile ? 22 : 26) + L.rowH * (i + 0.5); },

    // ------------------------------------------------------------ simulation
    spawn: function (srcIdx, port) {
      var p = null;
      for (var i = 0; i < POOL; i++) if (!this.pool[i].alive) { p = this.pool[i]; break; }
      if (!p) return;
      var r = this.rng, L = this.L, ipStr;
      if (srcIdx === 0) ipStr = '192.168.1.10';
      else if (srcIdx === 1) ipStr = r.pick(['81.2.69.', '151.101.4.', '24.48.112.', '89.160.20.']) + r.int(2, 250);
      else if (srcIdx === 2) ipStr = '45.155.205.' + r.int(2, 250);
      else ipStr = '203.0.113.' + r.int(2, 250);
      p.alive = true; p.phase = 0; p.src = srcIdx; p.ipStr = ipStr; p.ip = ip2n(ipStr); p.port = port; p.portStr = String(port);
      p.x0 = L.srcX + L.srcW; p.y0 = L.srcY[srcIdx]; p.x = p.x0; p.y = p.y0;
      p.x1 = L.gx - 30; p.y1 = L.gy; p.t = 0; p.dur = 0.9 + r.float() * 0.4; p.verdict = 0; p.rule = -1;
      this.srcPulse[srcIdx] = 1;
    },
    update: function (dt) {
      var r = this.rng, L = this.L, i, p;
      // traffic generator
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 0.32 + r.float() * 0.35;
        var roll = r.float();
        if (roll < 0.16) this.spawn(0, r.chance(0.8) ? 22 : 443);
        else if (roll < 0.62) this.spawn(1, r.chance(0.86) ? 443 : 80);
        else this.spawn(2, r.pick([23, 3389, 3306, 5432, 22, 80, 3389, 23]));
      }
      this.burstT -= dt;
      if (this.burstT <= 0) { this.burstT = 14 + r.float() * 6; this.burstLeft = 10; }
      if (this.burstLeft > 0) {
        this.burstGap -= dt;
        if (this.burstGap <= 0) { this.burstGap = 0.12; this.burstLeft--; this.spawn(3, r.chance(0.75) ? 22 : 443); }
      }
      // packets
      for (i = 0; i < POOL; i++) {
        p = this.pool[i]; if (!p.alive) continue;
        if (p.phase === 0) {
          p.t += dt / p.dur;
          var k = U.ease.inOutSine(Math.min(1, p.t));
          p.x = U.lerp(p.x0, p.x1, k); p.y = U.lerp(p.y0, p.y1, k);
          if (p.t >= 1) {
            if (this.qLen < this.queue.length) { this.queue[(this.qHead + this.qLen) % this.queue.length] = i; this.qLen++; p.qi = this.qAbs + this.qLen - 1; p.phase = 1; }
            else p.alive = false;
          }
        } else if (p.phase === 1) {
          var pos = p.qi - this.qAbs, tx = L.gx - 24 - pos * (this.mobile ? 11 : 15), ty = L.gy + (pos % 2 ? 4 : -4) * (pos > 0 ? 1 : 0);
          p.x = U.damp(p.x, tx, 10, dt); p.y = U.damp(p.y, ty, 10, dt);
        } else if (p.phase === 3 || p.phase === 4) {
          p.t += dt / p.dur;
          var e = Math.min(1, p.t);
          if (p.phase === 3) { var ke = U.ease.inOutSine(e); p.x = U.lerp(p.x0, p.x1, ke); p.y = U.lerp(p.y0, p.y1, ke); }
          else { p.x = U.lerp(p.x0, p.x1, e); p.y = U.lerp(p.y0, p.y1, e * e) - Math.sin(e * Math.PI) * 26; }
          if (p.t >= 1) {
            p.alive = false;
            if (p.phase === 3) {
              var ri = PORT_ROW[p.port];
              if (ri != null) { this.rowFlash[ri] = 1; if (PORTS[ri].risky && !SRC[p.src].lan) this.rowBad[ri] = 1; }
            } else this.binShake = 1;
          }
        }
      }
      // gate evaluation (one packet at a time; sweep speeds up when the queue is long)
      if (this.cur < 0 && this.qLen > 0) {
        this.cur = this.queue[this.qHead]; this.qHead = (this.qHead + 1) % this.queue.length; this.qLen--; this.qAbs++;
        p = this.pool[this.cur]; p.phase = 2; this.evalRow = 0; this.evalT = 0; this.matched = -1; this.holdT = 0;
      }
      if (this.cur >= 0) {
        p = this.pool[this.cur];
        p.x = U.damp(p.x, L.gx - 12, 14, dt); p.y = U.damp(p.y, L.gy, 14, dt);
        var step = 0.075 / (1 + this.qLen * 0.18);
        if (this.reduced()) step = 0.02;
        if (this.matched < 0) {
          this.evalT += dt;
          while (this.evalT >= step && this.matched < 0) {
            this.evalT -= step;
            if (this.evalRow < this.rules.length && this.matchRule(p, this.rules[this.evalRow])) this.matched = this.evalRow;
            else if (this.evalRow >= this.rules.length) this.matched = this.rules.length;
            else this.evalRow++;
          }
        } else {
          this.holdT += dt;
          if (this.holdT >= Math.max(0.08, 0.22 / (1 + this.qLen * 0.2))) this.decide(p);
        }
      }
      // decay
      var dk = Math.exp(-dt * 3);
      for (i = 0; i < PORTS.length; i++) { this.rowFlash[i] *= dk; this.rowBad[i] = Math.max(0, this.rowBad[i] - dt * 0.35); }
      for (i = 0; i < SRC.length; i++) this.srcPulse[i] *= dk;
      for (i = 0; i < this.rules.length; i++) this.rules[i].flash *= dk;
      this.policyFlash *= dk; this.binShake *= Math.exp(-dt * 6); this.gateFlash *= Math.exp(-dt * 5);
      this.gateOpen = U.damp(this.gateOpen, 0, 4, dt);
      if (this.banner) { this.bannerT -= dt; if (this.bannerT <= 0) this.banner = null; }
      // throttled live summary
      this.sum.t += dt;
      if (this.sum.t > 4) {
        if (this.sum.a + this.sum.b > 0) this.announce('Last 4 seconds: ' + this.sum.a + ' allowed, ' + this.sum.b + ' blocked' + (this.sum.brute ? ' (' + this.sum.brute + ' from the brute-force range got through)' : '') + '.');
        this.sum.a = this.sum.b = this.sum.brute = 0; this.sum.t = 0;
      }
      this.rA.set(U.fmt(this.allowed), 'ok'); this.rB.set(U.fmt(this.blocked), 'bad');
    },
    decide: function (p) {
      var L = this.L, m = this.matched, act, rule = null;
      if (m < this.rules.length) { rule = this.rules[m]; act = rule.act; rule.hits++; rule.flash = 1; }
      else { act = this.policy; this.policyHits++; this.policyFlash = 1; }
      p.rule = m; p.t = 0; p.x0 = p.x; p.y0 = p.y;
      if (act === 'ACCEPT') {
        p.phase = 3; p.verdict = 1; p.dur = 0.75;
        var ri = PORT_ROW[p.port];
        p.x1 = L.svX + 2; p.y1 = this.rowY(ri == null ? 0 : ri);
        this.allowed++; this.sum.a++; this.gateOpen = 1; this.gateFlash = 1; this.flashCol = 'ok';
        if (p.src === 3) {
          this.sum.brute++;
          var bl = -1; for (var i = 0; i < this.rules.length; i++) if (this.rules[i].act === 'DROP' && this.rules[i].bits === 24 && this.rules[i].net === ip2n('203.0.113.0')) bl = i;
          if (bl > m) this.setBanner('warn', 'Attacker got in on :' + p.port + ' — rule ' + (m + 1) + ' matched first. Move rule ' + (bl + 1) + ' up.');
        } else if (!SRC[p.src].lan && PORTS[PORT_ROW[p.port]] && PORTS[PORT_ROW[p.port]].risky) this.setBanner('bad', 'Scanner reached ' + PORTS[PORT_ROW[p.port]].name + ' :' + p.port + ' from the internet');
      } else {
        p.phase = 4; p.verdict = 2; p.dur = 0.6;
        p.x1 = L.binX + (this.rng.float() - 0.5) * 18; p.y1 = L.binY - 6;
        this.blocked++; this.sum.b++; this.gateFlash = 1; this.flashCol = 'fault';
        if (p.src === 0 && p.port === 22) this.setBanner('bad', 'LOCKED OUT — your own SSH (192.168.1.10 → :22) was dropped');
      }
      this.cur = -1; this.matched = -1;
    },
    setBanner: function (kind, text) {
      if (this.banner && this.banner.text === text) { this.bannerT = 3; return; }
      var first = !this.banner;
      this.banner = { kind: kind, text: text }; this.bannerT = 3;
      if (first) this.announce(text);
    },

    // ------------------------------------------------------------ drawing
    draw: function () {
      if (this.w < 160 || this.h < 120) { D.clear(this.ctx, this.w, this.h); return; }
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, t = this.time, self = this, m = this.mobile, fs = L.fs;
      D.clear(ctx, w, h);
      this.hits.clear();
      // lanes from sources to gate
      for (var s = 0; s < SRC.length; s++) {
        D.line(ctx, L.srcX + L.srcW, L.srcY[s], L.gx - 30, L.gy, U.rgba(P.net, 0.1 + this.srcPulse[s] * 0.15), 1, [3, 5]);
      }
      // sources
      SRC.forEach(function (src, i) {
        var y = L.srcY[i], x = L.srcX, bw = L.srcW, bh = L.srcH, col = src.lan ? P.ok : i === 3 ? P.fault : i === 2 ? P.warn : P.net;
        var bursting = i === 3 && self.burstLeft > 0;
        D.box(ctx, x, y - bh / 2, bw, bh, 7, U.rgba(P.panel, 0.94), U.rgba(col, 0.35 + self.srcPulse[i] * 0.4 + (bursting ? 0.3 : 0)), bursting ? 1.6 : 1);
        var ix = x + bh * 0.5, gs = bh * 0.62;
        if (i === 0) D.g.laptop(ctx, ix, y + 2, gs, P.alu);
        else if (i === 1) D.g.cloud(ctx, ix, y + 3, gs * 1.05, P.net);
        else if (i === 2) D.g.bug(ctx, ix, y + 1, gs * 0.85, P.warn);
        else D.g.bolt(ctx, ix, y, gs * 0.9, P.fault);
        D.text(ctx, m ? src.short : src.name, x + bh, y - fs * 0.55, { size: fs * 0.9, weight: 700, color: P.text1, maxW: bw - bh - 4 });
        D.text(ctx, src.lan ? (m ? '.1.10 LAN' : '192.168.1.10 · LAN') : src.range, x + bh, y + fs * 0.6, { size: fs * 0.8, color: P.text3, maxW: bw - bh - 4 });
      });
      // wall + gate
      var gx = L.gx, gw = m ? 12 : 16, open = (m ? 18 : 22);
      var wallCol = U.rgba(P.blueprint, 0.55);
      [[L.gTop, L.gy - open], [L.gy + open, L.gBot]].forEach(function (seg) {
        D.box(ctx, gx - gw / 2, seg[0], gw, seg[1] - seg[0], 2, P.panel3, wallCol, 1);
        ctx.fillStyle = D.hatch(ctx, U.rgba(P.blueprint, 0.25), 6); D.rr(ctx, gx - gw / 2, seg[0], gw, seg[1] - seg[0], 2); ctx.fill();
      });
      var fc = this.flashCol === 'ok' ? P.ok : P.fault;
      var leaf = open * (1 - this.gateOpen * 0.9);
      D.line(ctx, gx, L.gy - open, gx, L.gy - open + leaf, U.mix(P.blueprint, fc, this.gateFlash), 3);
      D.line(ctx, gx, L.gy + open, gx, L.gy + open - leaf, U.mix(P.blueprint, fc, this.gateFlash), 3);
      if (this.gateFlash > 0.05) D.glow(ctx, gx, L.gy, 30, fc, this.gateFlash * 0.5);
      D.text(ctx, 'FIREWALL', gx, L.gTop - (m ? 8 : 10), { size: fs * 0.85, weight: 700, color: P.blueprint, align: 'center', ls: 1.5 });
      D.text(ctx, m ? 'top → bottom' : 'checks rules top → bottom', gx, L.gBot + (m ? 9 : 11), { size: fs * 0.78, color: P.text3, align: 'center' });
      // bin
      var bx = L.binX + Math.sin(t * 60) * this.binShake * 3, by = L.binY, bwid = m ? 46 : 64, bht = m ? 14 : 16;
      D.box(ctx, bx - bwid / 2, by - bht, bwid, bht, 3, U.rgba(P.fault, 0.12), U.rgba(P.fault, 0.7), 1.2);
      D.g.cross(ctx, bx - bwid / 2 + 9, by - bht / 2, 11, P.fault);
      D.text(ctx, U.fmt(this.blocked), bx + 6, by - bht / 2 + 0.5, { size: fs * 0.9, weight: 700, color: P.fault, align: 'center' });
      // server with ports
      var sx = L.svX, sw = L.svW;
      D.box(ctx, sx, L.svTop, sw, L.svBot - L.svTop, 8, U.rgba(P.panel, 0.94), U.rgba(P.blueprint, 0.4), 1);
      D.text(ctx, m ? 'SERVER PORTS' : 'YOUR SERVER · listening ports', sx + 10, L.svTop + (m ? 11 : 13), { size: fs * 0.8, weight: 700, color: P.text3, ls: 1, maxW: sw - 16 });
      PORTS.forEach(function (pp, i) {
        var y = self.rowY(i), f = self.rowFlash[i], bad = self.rowBad[i];
        if (f > 0.03 || bad > 0.03) D.box(ctx, sx + 3, y - L.rowH / 2 + 1, sw - 6, L.rowH - 2, 4, U.rgba(bad > 0.03 ? P.fault : P.ok, Math.max(f * 0.22, bad * 0.18)));
        D.led(ctx, sx + 11, y, bad > 0.03 ? P.fault : P.ok, f > 0.2 ? 'solid' : 'off', t, 2.4);
        D.text(ctx, ':' + pp.port, sx + 20, y + 0.5, { size: fs * 0.95, weight: 700, color: P.text1 });
        D.text(ctx, pp.name, sx + 20 + fs * 3.4, y + 0.5, { size: fs * 0.85, color: pp.risky ? P.text3 : P.text2, maxW: sw - fs * 3.4 - 26 });
        if (bad > 0.03 && !m) D.text(ctx, '⚠ exposed', sx + sw - 8, y + 0.5, { size: fs * 0.78, weight: 700, color: P.fault, align: 'right', alpha: Math.min(1, bad * 2) });
      });
      // packets
      for (var i = 0; i < POOL; i++) {
        var p = this.pool[i]; if (!p.alive) continue;
        var col = p.verdict === 1 ? P.ok : p.verdict === 2 ? P.fault : P.net;
        var a = p.phase === 4 ? 1 - U.smoothstep(0.7, 1, p.t) : 1;
        this.drawPacket(ctx, p.x, p.y, col, (p.phase === 1 && p.qi - this.qAbs > 1) ? '' : p.portStr, a, p.phase === 2, p.verdict === 2 ? 1 : 0);
      }
      this.drawTable(ctx);
      this.setDesc(this.describe());
    },
    drawPacket: function (ctx, x, y, col, label, a, evaluating, dropped) {
      var P = S.pal, fs = this.L.fs * 0.8;
      if (a <= 0.02) return;
      ctx.globalAlpha = a;
      if (evaluating) D.glow(ctx, x, y, 20, P.accent, 0.5);
      // chevron packet
      var s = this.mobile ? 6 : 7;
      D.poly(ctx, [x - s, y - s * 0.75, x + s * 0.4, y - s * 0.75, x + s * 1.2, y, x + s * 0.4, y + s * 0.75, x - s, y + s * 0.75, x - s * 0.4, y]);
      ctx.fillStyle = col; ctx.fill();
      if (label) D.text(ctx, label, x - 1, y - s - fs * 0.6, { size: fs, weight: 700, color: col, align: 'center' });
      if (dropped) D.g.cross(ctx, x + s + 6, y - s, 9, P.fault);
      ctx.globalAlpha = 1;
    },
    drawTable: function (ctx) {
      var P = S.pal, L = this.L, T = L.tbl, m = this.mobile, fs = L.fs, self = this;
      var n = this.rules.length + 1, headH = m ? 18 : 22, rh = Math.min(m ? 26 : 34, (T.h - headH - 6) / n);
      // "checking" line
      var cp = this.cur >= 0 ? this.pool[this.cur] : null;
      var chk = cp ? 'checking  tcp ' + cp.ipStr + ' → :' + cp.port : 'waiting for packets…';
      if (this.banner) {
        var bc = this.banner.kind === 'bad' ? P.fault : P.warn, ba = Math.min(1, this.bannerT * 2);
        if (!m) D.text(ctx, 'RULES', T.x, T.y - 16, { size: fs * 0.82, weight: 700, color: P.text3, ls: 1.5 });
        D.pill(ctx, (this.banner.kind === 'bad' ? '✕ ' : '⚠ ') + this.banner.text, m ? T.x : T.x + T.w / 2, T.y - (m ? 13 : 16), { color: bc, size: fs * (m ? 0.82 : 0.9), align: m ? 'left' : 'center', alpha: ba, bg: U.rgba(P.panel, 0.97) });
      } else {
        D.text(ctx, 'RULES · first match wins', T.x, T.y - (m ? 14 : 16), { size: fs * 0.82, weight: 700, color: P.text3, ls: 1.5 });
        if (!m) D.text(ctx, chk, T.x + T.w, T.y - 16, { size: fs * 0.88, weight: 600, color: cp ? P.accent : P.text3, align: 'right' });
        else if (cp) D.text(ctx, cp.ipStr + ' → :' + cp.port, T.x + T.w, T.y - 14, { size: fs * 0.85, weight: 600, color: P.accent, align: 'right' });
      }
      D.box(ctx, T.x, T.y, T.w, headH + rh * n + 4, 8, U.rgba(P.panel, 0.95), U.rgba(P.blueprint, 0.35), 1);
      // columns
      var cols = m ? [['#', 0.0], ['ACTION', 0.08], ['SOURCE', 0.33], ['PORT', 0.70], ['HITS', 1.0]] :
        [['#', 0.0], ['ACTION', 0.05], ['PROTO', 0.17], ['SOURCE', 0.27], ['PORT', 0.47], ['NOTE', 0.58], ['HITS', 1.0]];
      var cx = function (f) { return T.x + 12 + (T.w - 24) * f; };
      cols.forEach(function (c) { D.text(ctx, c[0], cx(c[1]), T.y + headH / 2 + 1, { size: fs * 0.75, weight: 700, color: P.text3, align: c[1] === 1 ? 'right' : 'left', ls: 1 }); });
      var evalRow = this.cur >= 0 ? (this.matched >= 0 ? this.matched : this.evalRow) : -1;
      for (var i = 0; i < n; i++) {
        var y = T.y + headH + i * rh + 2, isPol = i === this.rules.length, r = isPol ? null : this.rules[i];
        var act = isPol ? this.policy : r.act, aCol = act === 'ACCEPT' ? P.ok : P.fault;
        var flash = isPol ? this.policyFlash : r.flash;
        if (i % 2 === 0) D.box(ctx, T.x + 3, y, T.w - 6, rh - 2, 4, U.rgba(P.panel2, 0.6));
        if (flash > 0.04) D.box(ctx, T.x + 3, y, T.w - 6, rh - 2, 4, U.rgba(aCol, flash * 0.28));
        if (i === evalRow) {
          var done = this.matched >= 0;
          D.box(ctx, T.x + 3, y, T.w - 6, rh - 2, 4, done ? U.rgba(aCol, 0.25) : U.rgba(P.accent, 0.13), done ? aCol : U.rgba(P.accent, 0.8), 1.4);
          D.text(ctx, '▶', T.x - 1, y + rh / 2, { size: fs * 0.9, color: done ? aCol : P.accent, align: 'center' });
        }
        if (!isPol && i === this.sel) D.box(ctx, T.x + 2, y - 1, T.w - 4, rh, 5, null, U.rgba(P.accent, 0.55), 1);
        var ty = y + rh / 2 - 0.5;
        D.text(ctx, isPol ? '*' : String(i + 1), cx(cols[0][1]), ty, { size: fs, weight: 700, color: P.text2 });
        D.pill(ctx, (act === 'ACCEPT' ? '✓ ' : '✕ ') + (isPol ? (m ? act : 'DEFAULT ' + act) : act), cx(cols[1][1]), ty, { color: aCol, size: fs * 0.78, pad: 5 });
        if (isPol) {
          D.text(ctx, m ? 'nothing matched' : 'policy · for anything no rule above matched', cx(cols[2][1]), ty, { size: fs * 0.85, color: P.text3, maxW: cx(m ? 0.95 : 0.9) - cx(cols[2][1]) });
        } else {
          var srcTxt = r.bits === 0 ? (m ? 'anywhere' : 'anywhere') : r.src;
          if (m) {
            D.text(ctx, srcTxt, cx(0.33), ty, { size: fs * 0.9, color: P.text1, maxW: cx(0.68) - cx(0.33) });
            D.text(ctx, r.port ? String(r.port) : 'any', cx(0.70), ty, { size: fs * 0.9, weight: 700, color: P.text1 });
          } else {
            D.text(ctx, 'tcp', cx(0.17), ty, { size: fs * 0.9, color: P.text2 });
            D.text(ctx, srcTxt, cx(0.27), ty, { size: fs * 0.92, color: P.text1 });
            D.text(ctx, r.port ? String(r.port) : 'any', cx(0.47), ty, { size: fs * 0.92, weight: 700, color: P.text1 });
            D.text(ctx, '# ' + r.note, cx(0.58), ty, { size: fs * 0.85, color: P.text3, maxW: cx(0.9) - cx(0.58) });
          }
        }
        D.text(ctx, U.fmt(isPol ? this.policyHits : r.hits), cx(1), ty, { size: fs * 0.92, weight: 700, color: P.text1, align: 'right' });
        if (!isPol) this.hits.rect('row', T.x, y, T.w, rh, i);
      }
    },
    describe: function () {
      var r = this.rules.map(function (x, i) { return (i + 1) + ': ' + x.act + ' ' + (x.port ? 'port ' + x.port : 'all') + ' from ' + (x.bits === 0 ? 'anywhere' : x.src); }).join('; ');
      return 'Rules ' + r + '; default ' + this.policy + '. ' + this.allowed + ' allowed, ' + this.blocked + ' blocked.';
    }
  });
})(window.SRV);
