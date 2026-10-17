/* Ch18 · A packet's journey. Neighbourhood map: subnet = street, IP = house number, gateway = post
   office, DNS = phone-book kiosk. DHCP (paper badge with a lease) vs Static (bolted nameplate).
   "Visit example.com" traces DNS → ARP → gateway → internet and back. Break the mask, gateway or DNS. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var EX_IP = '93.184.215.14';
  var LEASE = 24 * 3600;               // 24 h lease
  var SIM = 3600;                      // 1 s shown = 1 h

  function bubble(ctx, x, y, str, col, alpha, size, below) {
    if (alpha <= 0.01) return;
    size = size || 10;
    var tw = D.measure(ctx, str, size, 600) + 14, th = size + 10, P = S.pal;
    var bx = x - tw / 2, by = below ? y + 8 : y - th - 8;
    ctx.globalAlpha = alpha;
    D.box(ctx, bx, by, tw, th, 6, U.rgba(P.panel, 0.96), col, 1.2);
    ctx.beginPath();
    if (below) { ctx.moveTo(x - 5, by); ctx.lineTo(x, by - 6); ctx.lineTo(x + 5, by); }
    else { ctx.moveTo(x - 5, by + th); ctx.lineTo(x, by + th + 6); ctx.lineTo(x + 5, by + th); }
    ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 1;
    D.text(ctx, str, x, by + th / 2 + 0.5, { size: size, weight: 600, color: P.text1, align: 'center', alpha: alpha });
  }

  S.defineVisual('network', {
    init: function () {
      var self = this;
      this.ctx = this.layer();
      this.mode = 'static';
      this.brk = { mask: false, gw: false, dns: false };
      this.host = 20;
      this.lease = LEASE;
      this.plateT = 1;           // plate / badge appear 0..1
      this.badgeFly = -1;        // -1 none, 0..1 badge travelling from post office
      this.maskT = 0; this.gwT = 1; this.dnsT = 1;
      this.seq = null; this.si = 0; this.st = 0; this.itemStarted = false;
      this.pk = { x: 0, y: 0, on: false, alpha: 1, label: '', color: null, pts: null, lens: null, dur: 1, wander: false };
      this.tmp = {};
      this.rings = []; this.bubbles = [];
      this.log = [];
      this.book = 0;             // kiosk book highlight
      this.result = null;

      var g = this.ui.group('Address');
      this.segMode = g.seg({ label: 'Address', options: [['dhcp', 'DHCP'], ['static', 'Static']], value: 'static', onChange: function (v) { self.setMode(v); } });
      this.bVisit = this.ui.button('▶ Visit example.com', function () { self.visit(); }, { kind: 'primary' });
      this.ui.br();
      var b = this.ui.group('Break it');
      b.text('<span class="ctl-label">Break it</span>');
      b.toggle({ label: 'Wrong subnet mask', value: false, onChange: function (v) { self.setBreak('mask', v); } });
      b.toggle({ label: 'No gateway', value: false, onChange: function (v) { self.setBreak('gw', v); } });
      b.toggle({ label: 'No DNS', value: false, onChange: function (v) { self.setBreak('dns', v); } });
      this.ui.spacer();
      this.rRes = this.ui.readout('Result', '—');
    },

    // ------------------------------------------------------------ state changes
    setMode: function (v) {
      if (v === this.mode) return;
      var self = this, L = this.L;
      this.mode = v;
      if (v === 'dhcp') {
        this.plateT = 0; this.lease = LEASE; this.host = 20;
        var sp = this.srvPos();
        this.addRing(sp.x, sp.y - sp.h * 0.5, this.P().net, 1.1, 'big');
        this.addBubble(sp.x, sp.y - sp.h - 4, 'DHCP: who am I?', this.P().net, 1.6);
        this.tween({ from: 0, to: 1, dur: 0.01, delay: 0.8, onDone: function () {
          self.addBubble(L.gx, L.gTop - 4, 'you are .20 · lease 24 h', self.P().ok, 1.6);
          self.badgeFly = 0;
          self.tween({ from: 0, to: 1, dur: 0.9, ease: 'camera', onUpdate: function (k) { self.badgeFly = k; }, onDone: function () { self.badgeFly = -1; self.plateT = 1; } });
        } });
        this.announce('DHCP: the server asks the router for an address and gets 192.168.1.20 on a 24 hour lease.');
      } else {
        this.host = 20; this.plateT = 0; this.badgeFly = -1;
        this.tween({ from: 0, to: 1, dur: 0.7, ease: 'snap', onUpdate: function (k) { self.plateT = k; } });
        this.announce('Static: the address 192.168.1.20 is bolted on and never changes.');
      }
      this.wakeUp();
    },
    setBreak: function (k, v) {
      var self = this;
      this.brk[k] = v;
      var key = k === 'mask' ? 'maskT' : k === 'gw' ? 'gwT' : 'dnsT';
      var to = k === 'mask' ? (v ? 1 : 0) : (v ? 0 : 1);
      this.tween({ from: this[key], to: to, dur: 0.7, ease: 'camera', onUpdate: function (x) { self[key] = x; } });
      this.cancelTrace();
      this.announce(k === 'mask' ? (v ? 'Wrong subnet mask: the server now thinks its street is only .16 to .31, so the gateway and DNS are not on its street.' : 'Subnet mask fixed: /24.') :
        k === 'gw' ? (v ? 'Gateway removed: the street is a dead end.' : 'Gateway restored.') : (v ? 'DNS removed: the phone book is blank.' : 'DNS restored.'));
    },
    cancelTrace: function () { this.seq = null; this.pk.on = false; this.bVisit.setDisabled(false); },
    wakeUp: function () { this.setActive(true); },
    P: function () { return S.pal; },

    addRing: function (x, y, col, dur, big) { this.rings.push({ x: x, y: y, t: 0, dur: dur, col: col, big: big }); this.wakeUp(); },
    addBubble: function (x, y, text, col, dur, below) { this.bubbles.push({ x: x, y: y, text: text, t: 0, dur: dur, col: col, below: below }); this.wakeUp(); },

    // ------------------------------------------------------------ trace script
    visit: function () {
      if (this.seq) return;
      var self = this, P = S.pal, ok = P.ok, bad = P.fault;
      var q = [];
      this.log.length = 0; this.result = null;
      this.rRes.set('tracing…', '');
      function log(t) { q.push({ k: 'log', text: t }); }
      function mark(c, r) { q.push({ k: 'mark', cls: c, res: r }); }
      function move(pathFn, label, col, extra) { var it = { k: 'move', path: pathFn, label: label, col: col || P.net }; if (extra) for (var e in extra) it[e] = extra[e]; q.push(it); }
      function wait(d, fn) { q.push({ k: 'wait', dur: d, fn: fn }); }

      if (this.brk.mask) {
        log('① DNS  where is 192.168.1.53?');
        move(function (L) { return self.pathWander(L); }, 'DNS?', P.net, { wander: true });
        log('✕ .53 and .1 are not on my street (/28 = .16–.31)');
        mark('bad', 'Lost: wrong subnet mask');
      } else if (this.brk.dns) {
        log('① DNS  example.com → ?');
        move(function (L) { return self.pathKiosk(L, false); }, 'example.com?', P.net);
        wait(0.9, function () { self.book = -1; self.addBubble(self.L.kx, self.L.kTop - 4, 'blank page…', P.fault, 1.6); });
        log('✕ Temporary failure in name resolution');
        mark('bad', 'Failed: no DNS, name not resolved');
      } else {
        log('① DNS  example.com → ?');
        move(function (L) { return self.pathKiosk(L, false); }, 'example.com?', P.net);
        wait(0.5, function () { self.book = 1; });
        move(function (L) { return self.pathKiosk(L, true); }, EX_IP, P.data);
        q.push({ k: 'mark', cls: 'ok', text: '① DNS  example.com → ' + EX_IP });
        if (this.brk.gw) {
          log('② no gateway set — where is the exit?');
          move(function (L) { return self.pathDeadEnd(L); }, '→ ' + EX_IP, P.net, { bounce: true });
          log('✕ connect: Network is unreachable');
          mark('bad', 'Failed: no gateway, dead end');
        } else {
          log('② ARP  who has 192.168.1.1?');
          wait(0.01, function () { var sp = self.srvPos(); self.addRing(sp.x, self.L.streetY, P.warn, 1.3); self.addBubble(sp.x + 40 * self.L.s, sp.y - sp.h - 4, 'who has .1?', P.warn, 1.6); });
          wait(1.0, function () { self.addBubble(self.L.gx, self.L.gTop - 4, '.1 is-at 3c:52:82:1a:0f:01', P.ok, 1.8); });
          wait(0.6);
          q.push({ k: 'mark', cls: 'ok', text: '② ARP  192.168.1.1 is-at 3c:52:82:1a:0f:01' });
          log('③ to gateway 192.168.1.1 (post office)');
          move(function (L) { return self.pathToGw(L); }, '→ ' + EX_IP + ':443', P.net);
          mark('ok');
          log('④ internet  ~11 hops → ' + EX_IP);
          move(function (L) { return self.pathOut(L); }, 'GET /', P.net);
          wait(0.35);
          mark('ok');
          log('⑤ reply  200 OK · 38 ms round trip');
          move(function (L) { return self.pathBack(L); }, '200 OK', P.ok);
          mark('ok', 'Loaded example.com ✓');
        }
      }
      this.seq = q; this.si = 0; this.st = 0; this.itemStarted = false;
      this.bVisit.setDisabled(true);
      this.book = 0;
      this.wakeUp();
    },

    srvPos: function () { var L = this.L; return { x: L.sx, y: L.houseBase, w: L.srvW, h: L.srvH }; },
    maskRect: function () {
      var L = this.L, k = U.ease.inOutSine(this.maskT), o = this.tmpR || (this.tmpR = {});
      var top = L.houseBase - L.srvH - 2, bot = L.streetY + L.rh + 5 * L.s;
      o.x0 = U.lerp(L.x0 - 4, L.sx - L.srvW * 0.85, k); o.x1 = U.lerp(L.gx + L.gW * 0.5 + 4, L.sx + L.srvW * 0.85, k);
      o.y0 = U.lerp(top - 18 * L.s, top, k); o.y1 = bot;
      return o;
    },
    drawMask: function (ctx) {
      var P = S.pal, L = this.L, r = this.maskRect(), bad = this.maskT > 0.5, col = bad ? P.fault : P.blueprint;
      ctx.setLineDash([6, 5]);
      D.box(ctx, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 10, U.rgba(col, bad ? 0.07 : 0.025), U.rgba(col, bad ? 0.9 : 0.4), 1.2);
      ctx.setLineDash([]);
      var t = bad ? '/28: my street = .16–.31' : (this.mobile ? '/24 mask' : '/24 mask = how far "my street" goes');
      if (!this.mobile || bad) D.text(ctx, t, r.x0 + 8, r.y1 + 9 * L.s + (bad ? 0 : 0), { size: L.fs * 0.8, weight: 700, color: col });
    },
    pathKiosk: function (L, back) {
      var sp = this.srvPos(), y = L.streetY - L.rh * 0.45, y2 = L.streetY + L.rh * 0.45;
      return back ? [L.kx, L.kTop, L.kx, y2, sp.x + 6, y2, sp.x + 6, sp.y] : [sp.x - 6, sp.y, sp.x - 6, y, L.kx, y, L.kx, L.kTop];
    },
    pathToGw: function (L) { var sp = this.srvPos(), y = L.streetY - L.rh * 0.45; return [sp.x, sp.y, sp.x, y, L.gx - L.gW * 0.5, y]; },
    pathDeadEnd: function (L) { var sp = this.srvPos(), y = L.streetY - L.rh * 0.45; return [sp.x, sp.y, sp.x, y, L.gx - L.gW * 0.55, y, L.gx - L.gW * 0.55 - 50 * L.s, y + 4]; },
    pathOut: function (L) { var c = L.road; var out = [L.gx - L.gW * 0.5, L.streetY - L.rh * 0.45]; for (var i = 0; i < c.length; i++) out.push(c[i]); out.push(L.cx, L.cy, L.exX, L.exY + 10); return out; },
    pathBack: function (L) {
      var sp = this.srvPos(), y2 = L.streetY + L.rh * 0.45, c = L.road, out = [L.exX, L.exY + 10, L.cx, L.cy];
      for (var i = c.length - 2; i >= 0; i -= 2) out.push(c[i], c[i + 1]);
      out.push(L.gx - L.gW * 0.5, y2, sp.x + 6, y2, sp.x + 6, sp.y);
      return out;
    },
    pathWander: function (L) {
      var sp = this.srvPos(), r = this.maskRect(), y = L.streetY - L.rh * 0.45, a = r.x0 + 10, b = r.x1 - 10;
      return [sp.x, sp.y, sp.x, y, b, y, a, y + 6, b - 14 * L.s, y + 2, a + 20 * L.s, y + 8, sp.x, y];
    },

    // ------------------------------------------------------------ layout
    resize: function (w, h) {
      var m = this.mobile = w < 560;
      var s = m ? U.clamp(w / 380, 0.78, 1.1) : U.clamp(Math.min(w / 900, h / 506), 0.7, 1.4);
      var L = this.L = { s: s, fs: m ? 9.5 : 11 * Math.min(1.15, Math.max(0.9, s)) };
      L.rh = (m ? 12 : 15) * s;
      L.streetY = h * (m ? 0.37 : 0.5);
      L.x0 = m ? 6 : 16;
      L.houseW = (m ? 44 : 58) * s; L.houseH = (m ? 42 : 54) * s;
      L.srvW = (m ? 62 : 86) * s; L.srvH = (m ? 56 : 74) * s;
      L.houseBase = L.streetY - L.rh - 3;
      L.houses = m ? [[0.10, '.10', 'laptop'], [0.58, '.42', 'NAS']] : [[0.08, '.10', 'laptop'], [0.39, '.31', 'printer'], [0.52, '.42', 'NAS']];
      L.sx = w * (m ? 0.34 : 0.235);
      L.kx = w * (m ? 0.22 : 0.36); L.kTop = L.streetY + L.rh + 8 * s; L.kH = (m ? 40 : 50) * s;
      L.gx = w * (m ? 0.85 : 0.70); L.gW = (m ? 66 : 96) * s; L.gH = (m ? 56 : 78) * s; L.gTop = L.streetY + L.rh - L.gH - 6 * s;
      L.cx = w * (m ? 0.80 : 0.875); L.cy = h * (m ? 0.115 : 0.27); L.cs = (m ? 104 : 160) * s;
      L.exX = L.cx + L.cs * 0.02; L.exY = L.cy - L.cs * 0.33;
      if (m) { L.exX = L.cx - L.cs * 0.62; L.exY = L.cy - 6; }
      // road from post office to cloud
      var gx = L.gx + L.gW * 0.5, gy = L.streetY;
      L.road = [];
      for (var i = 0; i <= 8; i++) {
        var t = i / 8, x0 = gx - (m ? 6 : 0), cx = m ? L.cx - 10 : L.cx, cy = L.cy + L.cs * 0.28;
        var x = U.lerp(x0 + 10, cx, t) + Math.sin(t * Math.PI) * 30 * s * (m ? 0.3 : 1), y = U.lerp(gy, cy, U.ease.inOutSine(t));
        L.road.push(x, y);
      }
      if (m) {
        L.card = { x: 8, y: h * 0.575, w: w - 16, h: 70 };
        L.logp = { x: 8, y: L.card.y + L.card.h + 8, w: w - 16 }; L.logp.h = h - L.logp.y - 8;
      } else {
        L.card = { x: 16, y: h * 0.70, w: Math.min(280, w * 0.3) }; L.card.h = Math.min(h - L.card.y - 14, 140);
        L.logp = { x: L.card.x + L.card.w + 14, y: L.card.y, w: w - L.card.x - L.card.w - 30, h: L.card.h };
      }
    },

    // ------------------------------------------------------------ simulation
    update: function (dt) {
      var P = S.pal;
      if (this.reduced() && this.seq) dt *= 2;
      // lease clock
      if (this.mode === 'dhcp' && this.plateT >= 1 && !this.reduced()) {
        this.lease -= dt * SIM;
        if (this.lease <= 0) {
          var old = this.host;
          do { this.host = 21 + Math.floor(this.rng.float() * 180); } while (this.host === old);
          this.lease = LEASE; this.plateT = 0;
          var self = this;
          this.tween({ from: 0, to: 1, dur: 0.6, ease: 'snap', onUpdate: function (k) { self.plateT = k; } });
          var L = this.L, sp = this.srvPos();
          this.addBubble(sp.x, sp.y - sp.h - 4, 'lease expired → new address .' + this.host, P.warn, 2.6);
          var hx = this.mobile ? this.W(0.10) : this.W(0.08);
          this.addBubble(hx + 14 * L.s, L.houseBase - L.houseH - 6, 'ssh .' + old + ' ✕ No route to host', P.fault, 3.2);
          this.announce('The DHCP lease expired and the server got a new address, 192.168.1.' + this.host + '. Anyone still using .' + old + ' cannot reach it.');
        }
      }
      // rings + bubbles
      for (var i = this.rings.length - 1; i >= 0; i--) { this.rings[i].t += dt; if (this.rings[i].t >= this.rings[i].dur) this.rings.splice(i, 1); }
      for (var j = this.bubbles.length - 1; j >= 0; j--) { this.bubbles[j].t += dt; if (this.bubbles[j].t >= this.bubbles[j].dur) this.bubbles.splice(j, 1); }
      // trace script
      if (this.seq) this.stepSeq(dt);
      var need = this.mode === 'dhcp' || !!this.seq || this.rings.length || this.bubbles.length;
      if (!need) this.setActive(false);
    },
    W: function (f) { return this.w * f; },
    stepSeq: function (dt) {
      var it = this.seq[this.si], pk = this.pk;
      if (!it) { this.finishSeq(); return; }
      if (!this.itemStarted) {
        this.itemStarted = true; this.st = 0;
        if (it.k === 'log') { this.log.push({ text: it.text, cls: 'run' }); if (this.log.length > 5) this.log.shift(); this.next(); return; }
        if (it.k === 'mark') {
          var last = this.log[this.log.length - 1];
          if (last) { last.cls = it.cls; if (it.text) last.text = it.text; }
          if (it.res) this.result = { text: it.res, cls: it.cls };
          this.next(); return;
        }
        if (it.k === 'move') {
          pk.pts = it.path(this.L); pk.lens = D.polyLen(pk.pts);
          pk.dur = Math.max(0.5, pk.lens[pk.lens.length - 1] / (240 * this.L.s));
          if (it.wander) pk.dur *= 1.6;
          pk.on = true; pk.alpha = 1; pk.label = it.label; pk.color = it.col; pk.wander = !!it.wander; pk.bounce = !!it.bounce;
        }
      }
      this.st += dt;
      if (it.k === 'move') {
        var k = U.clamp(this.st / pk.dur, 0, 1), total = pk.lens[pk.lens.length - 1];
        var e = pk.wander ? k : U.ease.inOutSine(k);
        D.along(pk.pts, pk.lens, e * total, this.tmp);
        pk.x = this.tmp.x; pk.y = this.tmp.y;
        if (pk.wander) pk.alpha = 1 - U.smoothstep(0.75, 1, k);
        if (pk.bounce) pk.alpha = 1 - U.smoothstep(0.85, 1, k);
        if (k >= 1) { if (pk.wander || pk.bounce) { pk.on = false; } this.next(); }
      } else if (it.k === 'wait') {
        if (it.fn && !it.fired) { it.fired = true; it.fn(); }
        if (this.st >= it.dur) this.next();
      }
    },
    next: function () { this.si++; this.itemStarted = false; },
    finishSeq: function () {
      this.seq = null; this.pk.on = false; this.bVisit.setDisabled(false);
      var r = this.result || { text: 'done', cls: 'ok' };
      this.rRes.set(r.text, r.cls === 'ok' ? 'ok' : 'bad');
      this.announce(r.text + '. ' + this.log.map(function (l) { return l.text; }).join('. '));
      if (this.book === 1) { var self = this; this.tween({ from: 1, to: 0, dur: 1.5, delay: 1.5, onUpdate: function (v) { if (self.book > 0) self.book = v; } }); }
    },

    // ------------------------------------------------------------ drawing
    drawHouse: function (ctx, x, by, w, h, num, name, hi) {
      var P = S.pal, L = this.L, bodyH = h * 0.62, bodyY = by - bodyH;
      var col = hi ? P.accent : P.blueprint;
      D.box(ctx, x - w / 2, bodyY, w, bodyH, 2, U.mix(P.panel2, col, hi ? 0.1 : 0.04), U.rgba(col, hi ? 0.95 : 0.55), hi ? 1.6 : 1.1);
      D.poly(ctx, [x - w / 2 - 5 * L.s, bodyY, x, by - h, x + w / 2 + 5 * L.s, bodyY]);
      ctx.fillStyle = U.mix(P.panel3, col, hi ? 0.18 : 0.08); ctx.fill(); ctx.strokeStyle = U.rgba(col, hi ? 0.95 : 0.55); ctx.lineWidth = hi ? 1.6 : 1.1; ctx.stroke();
      // door
      var dw = w * 0.2, dh = bodyH * 0.55;
      D.box(ctx, x - dw / 2, by - dh, dw, dh, 1.5, U.rgba(col, 0.35));
      // window
      if (!hi) D.box(ctx, x + w * 0.16, bodyY + bodyH * 0.2, w * 0.2, bodyH * 0.26, 1, U.rgba(P.data, 0.25), U.rgba(col, 0.5), 1);
      if (num) {
        D.text(ctx, num, x - w * 0.27, bodyY + bodyH * 0.32, { size: L.fs * 0.95, weight: 700, color: P.text1, align: 'center' });
        D.text(ctx, name, x, by - h - 8 * L.s, { size: L.fs * 0.85, color: P.text3, align: 'center' });
      }
    },
    drawServerHouse: function (ctx) {
      var P = S.pal, L = this.L, sp = this.srvPos(), x = sp.x, by = sp.y, w = L.srvW, h = L.srvH, t = this.time;
      this.drawHouse(ctx, x, by, w, h, null, null, true);
      var bodyH = h * 0.62, bodyY = by - bodyH;
      // rack in the window
      var rx = x + w * 0.1, ry = bodyY + bodyH * 0.14, rw = w * 0.32, rhh = bodyH * 0.42;
      D.box(ctx, rx, ry, rw, rhh, 1.5, U.rgba(P.bg0, 0.6), U.rgba(P.accent, 0.6), 1);
      for (var i = 0; i < 3; i++) {
        var yy = ry + 3 + i * (rhh - 6) / 3;
        ctx.fillStyle = U.rgba(P.steel, 0.9); ctx.fillRect(rx + 3, yy, rw - 6, (rhh - 6) / 3 - 2);
        D.led(ctx, rx + rw - 6, yy + (rhh - 6) / 6 - 1, P.ok, 'activity', t + i * 3, 1.3);
      }
      // address plate: hangs above the roof like a sign
      var ip = '192.168.1.' + this.host;
      var fs = L.fs * 0.95, pw = D.measure(ctx, ip, fs, 700) + 16, ph = fs + 10;
      var px = x - pw / 2, py = by - h - ph - 6 * L.s;
      D.text(ctx, 'SERVER', x, py - 10 * L.s - (this.mode === 'dhcp' ? 0 : 0), { size: L.fs * 0.9, weight: 700, color: P.accent, align: 'center', ls: 1.5 });
      var k = this.plateT;
      if (this.badgeFly >= 0) {
        var fx = U.lerp(L.gx - pw / 2, px, this.badgeFly), fy = U.lerp(L.gTop, py, this.badgeFly) - Math.sin(this.badgeFly * Math.PI) * 60 * L.s;
        this.drawBadge(ctx, fx, fy, pw, ph, ip, fs, 1, null);
      } else if (k > 0.01) {
        if (this.mode === 'static') this.drawPlate(ctx, px, py - (1 - k) * 18, pw, ph, ip, fs, k);
        else this.drawBadge(ctx, px, py, pw, ph, ip, fs, k, this.lease);
      }
    },
    drawPlate: function (ctx, x, y, w, h, ip, fs, a) {
      var P = S.pal;
      ctx.globalAlpha = U.clamp(a, 0, 1);
      D.box(ctx, x, y, w, h, 3, U.mix(P.alu, P.panel, 0.25), U.shade(P.alu, -0.35), 1.2);
      D.box(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 2, null, U.rgba(P.text1, 0.18), 1);
      var bolt = [x + 3.5, y + 3.5, x + w - 3.5, y + 3.5, x + 3.5, y + h - 3.5, x + w - 3.5, y + h - 3.5];
      for (var i = 0; i < 8; i += 2) D.circle(ctx, bolt[i], bolt[i + 1], 1.5, U.shade(P.alu, -0.45));
      D.text(ctx, ip, x + w / 2, y + h / 2 + 0.5, { size: fs, weight: 700, color: P.dark ? P.bg0 : P.text1, align: 'center' });
      ctx.globalAlpha = 1;
      if (!this.mobile) D.text(ctx, 'STATIC · bolted on', x + w + 8, y + h / 2, { size: fs * 0.8, weight: 600, color: P.ok, alpha: a });
    },
    drawBadge: function (ctx, x, y, w, h, ip, fs, a, lease) {
      var P = S.pal, cx = x + w / 2;
      ctx.save(); ctx.globalAlpha = U.clamp(a, 0, 1);
      ctx.translate(cx, y + h / 2); ctx.rotate(-0.06);
      var hh = lease != null ? h * 1.75 : h;
      D.box(ctx, -w / 2, -h / 2, w, hh, 1, P.dark ? U.mix(P.text1, P.power, 0.1) : U.mix(P.panel, P.power, 0.12), U.rgba(P.power, 0.8), 1);
      D.circle(ctx, 0, -h / 2 + 2, 2.2, P.fault);
      D.text(ctx, ip, 0, 1, { size: fs, weight: 700, color: P.dark ? P.bg0 : P.text1, align: 'center' });
      if (lease != null) {
        var hrs = Math.max(0, lease) / 3600, hh2 = Math.floor(hrs), mm = Math.floor((hrs - hh2) * 60);
        var str = 'lease ' + (hh2 < 10 ? '0' : '') + hh2 + ':' + (mm < 10 ? '0' : '') + mm;
        D.text(ctx, str, 0, h * 0.78, { size: fs * 0.8, weight: 600, color: lease < 4 * 3600 ? P.fault : U.shade(P.power, -0.4), align: 'center' });
      }
      ctx.restore();
      if (lease != null && !this.mobile) D.text(ctx, 'DHCP · paper badge', x + w + 8, y + h / 2, { size: fs * 0.8, weight: 600, color: P.power, alpha: a });
    },
    drawKiosk: function (ctx) {
      var P = S.pal, L = this.L, x = L.kx, y = L.kTop, h = L.kH, w = h * 1.0, a = U.lerp(0.35, 1, this.dnsT);
      ctx.globalAlpha = a;
      D.line(ctx, x, y + h * 0.55, x, y + h, U.rgba(P.blueprint, 0.6), 2);
      D.box(ctx, x - w / 2, y, w, h * 0.6, 4, U.mix(P.panel2, P.data, 0.08), U.rgba(P.data, 0.8), 1.3);
      // open book
      var bw = w * 0.36, bh = h * 0.38, bx = x, byy = y + h * 0.1;
      var lit = this.book > 0 ? this.book : 0;
      D.poly(ctx, [bx - bw, byy + 2, bx, byy + 5, bx + bw, byy + 2, bx + bw, byy + bh, bx, byy + bh + 3, bx - bw, byy + bh]);
      ctx.fillStyle = U.mix(P.text1, P.data, 0.15 + lit * 0.3); ctx.fill(); ctx.strokeStyle = U.shade(P.data, -0.3); ctx.lineWidth = 1; ctx.stroke();
      D.line(ctx, bx, byy + 5, bx, byy + bh + 3, U.shade(P.data, -0.3), 1);
      if (this.dnsT > 0.5) for (var i = 0; i < 3; i++) {
        var ly = byy + 9 + i * (bh - 10) / 3;
        D.line(ctx, bx - bw + 4, ly, bx - 3, ly + 1, U.rgba(P.bg0, 0.55), 1);
        D.line(ctx, bx + 3, ly + 1, bx + bw - 4, ly, U.rgba(P.bg0, 0.55), 1);
      }
      ctx.globalAlpha = 1;
      D.text(ctx, 'DNS · 192.168.1.53', x, y + h + 9 * L.s, { size: L.fs * 0.88, weight: 700, color: this.brk.dns ? P.fault : P.data, align: 'center' });
      D.text(ctx, this.brk.dns ? '✕ blank phone book' : 'phone book: name → number', x, y + h + 9 * L.s + L.fs + 2, { size: L.fs * 0.8, color: this.brk.dns ? P.fault : P.text3, align: 'center' });
      if (lit > 0.05) bubbleAt(ctx, x, y, 'example.com = ' + EX_IP, P.data, lit, L.fs * 0.9);
    },
    drawPost: function (ctx) {
      var P = S.pal, L = this.L, x = L.gx, w = L.gW, h = L.gH, by = L.streetY + L.rh + 2, top = by - h;
      var a = this.gwT;
      if (a > 0.02) {
        ctx.globalAlpha = a;
        D.box(ctx, x - w / 2, top + h * 0.22, w, h * 0.78, 2, U.mix(P.panel2, P.mgmt, 0.1), U.rgba(P.mgmt, 0.9), 1.4);
        D.poly(ctx, [x - w / 2 - 4, top + h * 0.24, x - w / 2 + 8, top, x + w / 2 - 8, top, x + w / 2 + 4, top + h * 0.24]);
        ctx.fillStyle = U.mix(P.panel3, P.mgmt, 0.2); ctx.fill(); ctx.strokeStyle = U.rgba(P.mgmt, 0.9); ctx.stroke();
        D.g.envelope(ctx, x, top + h * 0.12, h * 0.2, P.text1);
        // door + columns
        D.box(ctx, x - w * 0.12, by - h * 0.42, w * 0.24, h * 0.42, 2, U.rgba(P.mgmt, 0.4));
        for (var i = -1; i <= 1; i += 2) D.line(ctx, x + i * w * 0.3, top + h * 0.3, x + i * w * 0.3, by - 2, U.rgba(P.mgmt, 0.6), 2);
        D.led(ctx, x + w * 0.38, top + h * 0.36, P.ok, 'activity', this.time, 1.6);
        ctx.globalAlpha = 1;
      }
      if (a < 0.98) {
        // dead-end barricade
        var bx = x - w * 0.55, bh = L.rh * 2.4;
        ctx.globalAlpha = 1 - a;
        D.box(ctx, bx - 6, L.streetY - bh / 2, 12, bh, 2, P.fault);
        ctx.fillStyle = D.hatch(ctx, U.rgba(P.bg, 0.8), 5); D.rr(ctx, bx - 6, L.streetY - bh / 2, 12, bh, 2); ctx.fill();
        D.pill(ctx, 'DEAD END', bx, L.streetY - bh / 2 - 12, { color: P.fault, size: L.fs * 0.85, align: 'center' });
        D.box(ctx, x - w / 2, top + h * 0.22, w, h * 0.78, 2, null, U.rgba(P.blueprint, 0.35), 1);
        ctx.globalAlpha = 1;
      }
      var lc = this.brk.gw ? P.fault : P.mgmt;
      var lx = this.mobile ? this.w - 6 : x, al = this.mobile ? 'right' : 'center';
      D.text(ctx, this.brk.gw ? '✕ no gateway' : (this.mobile ? 'GATEWAY .1' : 'GATEWAY · 192.168.1.1'), lx, top - 20 * L.s, { size: L.fs * 0.88, weight: 700, color: lc, align: al });
      D.text(ctx, this.mobile ? 'post office' : 'post office = router', lx, top - 20 * L.s + L.fs + 2, { size: L.fs * 0.8, color: P.text3, align: al });
    },
    draw: function () {
      if (this.w < 160 || this.h < 120) { D.clear(this.ctx, this.w, this.h); return; }
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, t = this.time, self = this, s = L.s, m = this.mobile;
      D.clear(ctx, w, h);
      // internet road
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      D.poly(ctx, L.road, false); ctx.strokeStyle = U.rgba(P.panel3, 0.95); ctx.lineWidth = L.rh * 1.1; ctx.stroke();
      D.poly(ctx, L.road, false); ctx.strokeStyle = U.rgba(P.blueprint, 0.35); ctx.lineWidth = 1; ctx.setLineDash([5, 6]); ctx.stroke(); ctx.setLineDash([]);
      // street
      var sx0 = L.x0, sx1 = L.gx;
      D.box(ctx, sx0, L.streetY - L.rh, sx1 - sx0, L.rh * 2, L.rh, P.panel3, U.rgba(P.blueprint, 0.3), 1);
      D.line(ctx, sx0 + L.rh, L.streetY, sx1 - L.gW * 0.6, L.streetY, U.rgba(P.text3, 0.6), 1.2, [8, 7]);
      var sname = m ? 'STREET 192.168.1.0/24' : 'STREET = SUBNET · 192.168.1.0/24 · houses .1–.254';
      var snx = m ? L.x0 + 8 : (L.sx + w * 0.39) / 2 + 10, snw = D.measure(ctx, sname, L.fs * 0.8, 700) + 12;
      if (m) snx = L.x0 + 10;
      D.box(ctx, snx - 6, L.streetY - L.fs * 0.6 - 2, snw, L.fs * 1.2 + 4, 3, P.panel3);
      D.text(ctx, sname, snx, L.streetY + 0.5, { size: L.fs * 0.8, weight: 700, color: P.blueprint, ls: 0.5 });
      if (!m) {
        var lg = [['house number', 'IP address'], ['street', 'subnet'], ['post office', 'gateway'], ['phone book', 'DNS']];
        D.text(ctx, 'THE MAP', 18, 22, { size: L.fs * 0.8, weight: 700, color: P.text3, ls: 1.5 });
        lg.forEach(function (r, i) {
          D.text(ctx, r[0], 18, 42 + i * (L.fs + 6), { size: L.fs * 0.85, color: P.text2 });
          D.text(ctx, '= ' + r[1], 18 + 92 * Math.max(0.9, s), 42 + i * (L.fs + 6), { size: L.fs * 0.85, weight: 700, color: P.text1 });
        });
      }
      // other houses
      L.houses.forEach(function (hs) { self.drawHouse(ctx, w * hs[0], L.houseBase, L.houseW, L.houseH, hs[1], hs[2], false); });
      this.drawMask(ctx);
      this.drawKiosk(ctx);
      this.drawPost(ctx);
      // cloud + destination
      D.g.cloud(ctx, L.cx, L.cy, L.cs, P.blueprint);
      D.text(ctx, 'INTERNET', L.cx, L.cy + L.cs * 0.03, { size: L.fs * 0.95, weight: 700, color: P.blueprint, align: 'center', ls: 2 });
      D.g.serverFront(ctx, L.exX, L.exY, (m ? 34 : 44) * s, P.steel, t, P.ok);
      if (m) {
        D.text(ctx, 'example.com', L.exX, L.exY - 13 * s, { size: L.fs * 0.85, weight: 700, color: P.text1, align: 'center' });
      } else {
        D.text(ctx, 'example.com', L.exX + 30 * s, L.exY - 3, { size: L.fs * 0.9, weight: 700, color: P.text1 });
        D.text(ctx, EX_IP, L.exX + 30 * s, L.exY + L.fs, { size: L.fs * 0.8, color: P.text3 });
      }
      this.drawServerHouse(ctx);
      // rings (ARP shout / DHCP shout)
      this.rings.forEach(function (r) {
        var k = r.t / r.dur, rad = k * (r.big ? 90 * s : w * 0.45);
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, Math.max(1, rad), Math.max(1, rad * (r.big ? 0.75 : 0.08)), 0, 0, U.TAU);
        ctx.strokeStyle = r.col; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(r.x, r.y, Math.max(1, rad * 0.7), Math.max(1, rad * (r.big ? 0.52 : 0.05)), 0, 0, U.TAU); ctx.lineWidth = 1; ctx.stroke();
        ctx.globalAlpha = 1;
      });
      // packet
      var pk = this.pk;
      if (pk.on) {
        D.glow(ctx, pk.x, pk.y, 14, pk.color, 0.7 * pk.alpha);
        ctx.globalAlpha = pk.alpha;
        D.g.envelope(ctx, pk.x, pk.y, 14, pk.color);
        ctx.globalAlpha = 1;
        D.pill(ctx, pk.label, pk.x, pk.y - 17, { color: pk.color, size: L.fs * 0.82, align: 'center', alpha: pk.alpha });
        if (pk.wander && pk.alpha < 0.95) D.text(ctx, '?', pk.x + 12, pk.y - 4, { size: 16, weight: 700, color: P.fault, alpha: 1 - pk.alpha });
      }
      this.bubbles.forEach(function (b) {
        var k = b.t / b.dur, a = U.smoothstep(0, 0.12, k) * (1 - U.smoothstep(0.8, 1, k));
        bubble(ctx, b.x, b.y, b.text, b.col, a, L.fs * 0.88, b.below);
      });
      this.drawCard(ctx);
      this.drawLog(ctx);
      if (this.mode === 'dhcp') D.text(ctx, '⏱ 1 s shown = 1 h', w - 10, h - 9, { size: L.fs * 0.78, color: P.text3, align: 'right' });
      this.setDesc(this.describe());
    },
    drawCard: function (ctx) {
      var P = S.pal, L = this.L, c = L.card, fs = L.fs * (this.mobile ? 0.95 : 0.95), lh = this.mobile ? 13 : Math.min(19, (c.h - 30) / 4);
      D.box(ctx, c.x, c.y, c.w, c.h, 8, U.rgba(P.panel, 0.94), U.rgba(P.blueprint, 0.35), 1);
      D.text(ctx, 'NETWORK SETTINGS', c.x + 12, c.y + 13, { size: fs * 0.82, weight: 700, color: P.text3, ls: 1.5 });
      var chip = this.mode === 'dhcp' ? 'DHCP · leased' : 'STATIC';
      D.pill(ctx, chip, c.x + c.w - 10, c.y + 13, { color: this.mode === 'dhcp' ? P.power : P.ok, size: fs * 0.78, align: 'right' });
      var rows = [
        ['address', '192.168.1.' + this.host + (this.brk.mask ? '/28' : '/24'), this.brk.mask ? 'bad' : ''],
        ['gateway', this.brk.gw ? '— (none)' : '192.168.1.1', this.brk.gw ? 'bad' : ''],
        ['dns', this.brk.dns ? '— (none)' : '192.168.1.53', this.brk.dns ? 'bad' : '']
      ];
      if (this.mobile) {
        var colW = (c.w - 24) / 3;
        rows.forEach(function (r, i) {
          var x = c.x + 12 + i * colW;
          D.text(ctx, r[0], x, c.y + 34, { size: fs * 0.8, color: P.text3 });
          D.text(ctx, r[1], x, c.y + 50, { size: fs * 0.9, weight: 700, color: r[2] ? P.fault : P.text1 });
        });
        if (this.brk.mask) D.text(ctx, 'mask /28 = 255.255.255.240 ✕', c.x + 12, c.y + c.h - 9, { size: fs * 0.8, color: P.fault });
        else D.text(ctx, 'mask /24 = 255.255.255.0', c.x + 12, c.y + c.h - 9, { size: fs * 0.8, color: P.text3 });
        return;
      }
      var y0 = c.y + 32;
      rows.splice(1, 0, ['mask', this.brk.mask ? '255.255.255.240 ✕' : '255.255.255.0', this.brk.mask ? 'bad' : '']);
      rows.forEach(function (r, i) {
        var y = y0 + i * lh;
        D.text(ctx, r[0], c.x + 12, y, { size: fs, color: P.text3 });
        D.text(ctx, r[1], c.x + 12 + 9 * fs * 0.62, y, { size: fs, weight: 700, color: r[2] ? P.fault : P.text1 });
      });
    },
    drawLog: function (ctx) {
      var P = S.pal, L = this.L, c = L.logp, fs = L.fs * 0.92, lh = this.mobile ? 14 : Math.min(18, (c.h - 28) / 5);
      D.box(ctx, c.x, c.y, c.w, c.h, 8, U.rgba(P.panel, 0.94), U.rgba(P.net, 0.35), 1);
      D.text(ctx, 'TRACE · visit example.com', c.x + 12, c.y + 13, { size: fs * 0.85, weight: 700, color: P.text3, ls: 1.5 });
      if (!this.log.length) {
        D.text(ctx, 'Press “Visit example.com” to follow one packet.', c.x + 12, c.y + 34, { size: fs, color: P.text2, maxW: c.w - 24 });
        return;
      }
      var self = this;
      this.log.forEach(function (l, i) {
        var y = c.y + 32 + i * lh, col = l.cls === 'bad' ? P.fault : l.cls === 'ok' ? P.text1 : P.net;
        var g = l.cls === 'ok' ? '✓' : l.cls === 'bad' ? '' : (Math.floor(self.time * 3) % 2 ? '›' : ' ');
        D.text(ctx, g, c.x + 12, y, { size: fs, weight: 700, color: l.cls === 'ok' ? P.ok : P.net });
        D.text(ctx, l.text, c.x + 26, y, { size: fs, weight: l.cls === 'bad' ? 700 : 500, color: col, maxW: c.w - 36 });
      });
    },
    describe: function () {
      var b = [];
      if (this.brk.mask) b.push('wrong subnet mask');
      if (this.brk.gw) b.push('no gateway');
      if (this.brk.dns) b.push('no DNS');
      return 'Server at 192.168.1.' + this.host + ' (' + (this.mode === 'dhcp' ? 'DHCP lease' : 'static') + ')' + (b.length ? ', broken: ' + b.join(', ') : ', network settings correct') + (this.result ? '. Last trace: ' + this.result.text : '') + '.';
    }
  });

  function bubbleAt(ctx, x, y, str, col, a, fs) { bubble(ctx, x, y, str, col, a, fs, false); }
})(window.SRV);
