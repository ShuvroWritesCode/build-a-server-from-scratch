/* Ch20 · Your first request. Laptop → switch → server NIC → firewall (443 allowed) → OS → web server
   container, and back. Step through ARP, TCP, TLS and HTTP, then a mini browser renders
   "Hello from my server!" with pixel confetti. Toggle "Firewall blocks 443" to watch it time out. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var NODES = [
    { key: 'laptop', name: 'LAPTOP', sub: 'browser · 192.168.1.10' },
    { key: 'switch', name: 'SWITCH', sub: 'forwards by MAC address' },
    { key: 'nic', name: 'NIC', sub: 'eth0 · 192.168.1.20' },
    { key: 'fw', name: 'FIREWALL', sub: 'allow tcp/443' },
    { key: 'os', name: 'OS', sub: 'kernel · TCP/IP stack' },
    { key: 'web', name: 'WEB SERVER', sub: 'nginx container · :443' }
  ];
  var STEPS = [
    { tag: 'ARP', to: 2, back: true, out: 'who has 192.168.1.20?', ret: 'is-at 3c:ec:ef:12:34:56', dur: 1.6 },
    { tag: 'TCP', to: 4, back: true, out: 'SYN → :443', ret: 'SYN-ACK ✓', dur: 2.2, fw: true },
    { tag: 'TLS', to: 5, back: true, out: 'ClientHello', ret: 'certificate ✓ keys agreed', dur: 2.4 },
    { tag: 'HTTP', to: 5, back: false, out: 'GET / HTTP/1.1', dur: 1.6 },
    { tag: 'HTTP', from: 5, to: 0, back: false, out: '200 OK · 1.2 kB html', dur: 1.8, resp: true },
    { tag: 'PAGE', render: true, dur: 0.6 }
  ];
  var NC = 90;
  var EXPLAIN = [
    ['ARP · find the MAC address', 'The laptop knows the IP but needs the network card’s hardware address. It shouts “who has 192.168.1.20?” and the NIC answers.'],
    ['TCP · open a connection', 'SYN → SYN-ACK → ACK: both sides agree to talk on port 443. The firewall checks its rules before the OS ever sees it.'],
    ['TLS · encrypt it', 'The server shows its certificate and both sides agree on secret keys. From here on everything is scrambled for eavesdroppers.'],
    ['HTTP · ask for the page', 'The browser sends GET /. The kernel hands it to nginx, running in its own container.'],
    ['HTTP · the answer', 'nginx replies 200 OK with 1.2 kB of HTML — back through the same hops in reverse.'],
    ['Render · done!', 'The browser draws the page. Your server just served its first request.']
  ];

  S.defineVisual('journey', {
    init: function () {
      var self = this;
      this.ctx = this.layer();
      this.step = -1; this.k = 0; this.done = -1; this.auto = false; this.busy = false;
      this.block = false; this.failed = false; this.retry = 0; this.page = 0; this.gear = 0;
      this.tmp = {};
      this.conf = [];
      for (var i = 0; i < NC; i++) this.conf.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, c: 0, r: 0, life: 0 });
      this.bSend = this.ui.button('▶ Send request', function () { self.play(true); }, { kind: 'primary' });
      this.bStep = this.ui.button('Step ›', function () { self.play(false); });
      this.ui.button('↺ Reset', function () { self.reset(); });
      this.ui.toggle({ label: 'Firewall blocks 443', value: false, onChange: function (v) { self.block = v; self.reset(); self.announce(v ? 'The firewall now drops port 443. Try sending the request.' : 'Port 443 allowed again.'); } });
      this.ui.spacer();
      this.rStep = this.ui.readout('Step', '—');
    },
    reset: function () {
      if (this.tw) this.tw.cancel();
      this.step = -1; this.k = 0; this.done = -1; this.busy = false; this.failed = false; this.page = 0; this.retry = 0; this.auto = false;
      for (var i = 0; i < NC; i++) this.conf[i].on = false;
      this.bSend.setDisabled(false); this.bStep.setDisabled(false);
      this.rStep.set('—', '');
      this.invalidate();
    },
    play: function (auto) {
      if (this.busy) return;
      if (this.done >= STEPS.length - 1 || this.failed) this.reset();
      this.auto = auto;
      this.runStep(this.done + 1);
    },
    runStep: function (i) {
      var self = this, st = STEPS[i];
      if (!st) return;
      this.step = i; this.k = 0; this.busy = true;
      this.bSend.setDisabled(true); this.bStep.setDisabled(true);
      this.rStep.set((i + 1) + '/' + STEPS.length + ' · ' + st.tag, '');
      var blockedHere = st.fw && this.block;
      var dur = blockedHere ? 1.4 : st.dur;
      this.announce(this.stepText(i));
      this.tw = this.tween({ from: 0, to: 1, dur: dur, ease: 'linear', onUpdate: function (v) { self.k = v; }, onDone: function () {
        if (blockedHere) { self.timeout(); return; }
        self.done = i; self.busy = false;
        if (st.render) self.render();
        if (i >= STEPS.length - 1) { self.bSend.setDisabled(false); self.bStep.setDisabled(true); self.bSend.setLabel('▶ Send again'); return; }
        if (self.auto) self.tween({ from: 0, to: 1, dur: 0.01, delay: 0.25, onDone: function () { self.runStep(i + 1); } });
        else { self.bStep.setDisabled(false); self.bSend.setDisabled(false); }
      } });
    },
    timeout: function () {
      var self = this;
      this.retry++;
      if (this.retry < 3) {
        this.announce('No answer. The laptop retransmits the SYN (attempt ' + (this.retry + 1) + ').');
        this.tween({ from: 0, to: 1, dur: 0.01, delay: 0.4, onDone: function () { self.runStep(self.step); } });
        return;
      }
      this.failed = true; this.busy = false; this.page = 0;
      this.tween({ from: 0, to: 1, dur: 0.5, onUpdate: function (v) { self.page = v; } });
      this.bSend.setDisabled(false); this.bStep.setDisabled(true);
      this.rStep.set('timed out ✕', 'bad');
      this.announce('This site can’t be reached: ERR_CONNECTION_TIMED_OUT. The firewall silently dropped every packet to port 443.');
    },
    render: function () {
      var self = this, B = this.L.browser;
      this.page = 0;
      this.tween({ from: 0, to: 1, dur: 0.6, onUpdate: function (v) { self.page = v; } });
      this.rStep.set('page loaded ✓', 'ok');
      this.announce('Hello from my server! The page arrived: ARP, TCP, TLS and HTTP all worked.');
      if (this.reduced()) return;
      var cols = ['accent', 'data', 'net', 'power', 'ok'];
      for (var i = 0; i < NC; i++) {
        var c = this.conf[i];
        c.on = true; c.x = B.x + B.w * (0.2 + this.rng.float() * 0.6); c.y = B.y + B.h * 0.55;
        c.vx = this.rng.range(-90, 90); c.vy = this.rng.range(-230, -80); c.c = cols[i % cols.length]; c.r = this.rng.range(2, 4); c.life = this.rng.range(1.2, 2.2);
      }
      this.setActive(true);
    },
    stepText: function (i) {
      var st = STEPS[i];
      if (st.render) return 'The browser draws the page.';
      if (st.fw && this.block) return 'TCP SYN to port 443 reaches the firewall…';
      return st.tag + ': ' + st.out + (st.ret ? ' → ' + st.ret : '');
    },

    // ------------------------------------------------------------ layout
    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      L.fs = m ? 9.5 : U.clamp(w / 85, 10, 12);
      L.s = m ? U.clamp(w / 380, 0.8, 1.1) : U.clamp(Math.min(w / 980, h / 430), 0.75, 1.3);
      L.pos = [];
      if (m) {
        var y0 = 34, y1 = h * 0.6;
        for (var i = 0; i < NODES.length; i++) L.pos.push({ x: w * 0.2, y: y0 + (y1 - y0) * i / (NODES.length - 1) });
        L.browser = { x: 10, y: h * 0.67, w: w - 20, h: h * 0.31 };
      } else {
        var xs = [0.09, 0.27, 0.45, 0.6, 0.75, 0.9], yy = h * 0.6;
        for (var j = 0; j < NODES.length; j++) L.pos.push({ x: w * xs[j], y: yy });
        L.browser = { x: 14, y: 14, w: Math.min(300, w * 0.32), h: Math.min(h * 0.4, 150) };
        L.explain = { x: L.browser.x + L.browser.w + 24, y: 18, w: w - (L.browser.x + L.browser.w + 24) - 16, h: L.browser.h };
      }
      L.ns = (m ? 30 : 46) * L.s;
      var p = L.pos;
      L.server = m ? { x: p[2].x - L.ns * 0.9, y: p[2].y - L.ns * 1.25, w: w - p[2].x + L.ns * 0.9 - 10, h: p[5].y - p[2].y + L.ns * 1.95 }
        : { x: p[2].x - L.ns * 1.1, y: p[2].y - L.ns * 1.6, w: p[5].x - p[2].x + L.ns * 2.2, h: L.ns * 3.3 };
    },

    update: function (dt) {
      var any = false, g = 420;
      for (var i = 0; i < NC; i++) {
        var c = this.conf[i]; if (!c.on) continue;
        c.vy += g * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt;
        if (c.life <= 0) c.on = false; else any = true;
      }
      if (!any) this.setActive(false);
    },

    // ------------------------------------------------------------ drawing
    nodeGlyph: function (ctx, i, x, y, s, lit) {
      var P = S.pal, t = this.time;
      var col = lit ? P.accent : P.blueprint;
      if (i === 0) D.g.laptop(ctx, x, y, s * 1.3, P.alu);
      else if (i === 1) D.g.switchBox(ctx, x, y, s * 1.3, P.steel, t);
      else if (i === 2) {
        D.box(ctx, x - s * 0.55, y - s * 0.3, s * 1.1, s * 0.55, 3, P.pcb, U.shade(P.pcb, 0.4), 1);
        for (var k = 0; k < 7; k++) D.box(ctx, x - s * 0.45 + k * s * 0.13, y + s * 0.25, s * 0.08, s * 0.1, 1, P.gold);
        D.box(ctx, x + s * 0.15, y - s * 0.2, s * 0.3, s * 0.25, 2, U.shade(P.steel, -0.2), P.alu, 1);
        D.box(ctx, x - s * 0.4, y - s * 0.18, s * 0.35, s * 0.3, 2, P.silicon);
      } else if (i === 3) {
        var bad = this.block;
        D.box(ctx, x - s * 0.5, y - s * 0.4, s, s * 0.8, 3, U.mix(P.copper, P.panel3, 0.4), bad ? P.fault : P.ok, 1.4);
        ctx.strokeStyle = U.rgba(P.alu, 0.6); ctx.lineWidth = 1; ctx.beginPath();
        for (var r = 1; r < 4; r++) { var yy = y - s * 0.4 + r * s * 0.2; ctx.moveTo(x - s * 0.5, yy); ctx.lineTo(x + s * 0.5, yy); for (var c = 0; c < 3; c++) { var xx = x - s * 0.5 + (c + (r % 2 ? 0.5 : 0)) * s * 0.33; ctx.moveTo(xx, yy - s * 0.2); ctx.lineTo(xx, yy); } }
        ctx.stroke();
        D.pill(ctx, bad ? '443 ✕' : '443 ✓', x, y + s * 0.02, { color: bad ? P.fault : P.ok, size: this.L.fs * 0.78, align: 'center', pad: 3 });
      } else if (i === 4) {
        D.box(ctx, x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.9, 4, P.silicon, col, 1.2);
        for (var q = 0; q < 4; q++) { D.line(ctx, x - s * 0.55, y - s * 0.3 + q * s * 0.2, x - s * 0.45, y - s * 0.3 + q * s * 0.2, P.gold, 1.4); D.line(ctx, x + s * 0.45, y - s * 0.3 + q * s * 0.2, x + s * 0.55, y - s * 0.3 + q * s * 0.2, P.gold, 1.4); }
        D.text(ctx, 'OS', x, y + 0.5, { size: s * 0.3, weight: 700, color: P.text1, align: 'center' });
      } else {
        // shipping container
        D.box(ctx, x - s * 0.6, y - s * 0.35, s * 1.2, s * 0.7, 2, U.mix(P.data, P.panel3, 0.55), P.data, 1.2);
        for (var cc = 1; cc < 8; cc++) D.line(ctx, x - s * 0.6 + cc * s * 0.15, y - s * 0.3, x - s * 0.6 + cc * s * 0.15, y + s * 0.3, U.rgba(P.data, 0.6), 1);
        if (lit) { ctx.save(); ctx.translate(x + s * 0.42, y - s * 0.38); D.g.gear(ctx, 0, 0, s * 0.42, P.accent); ctx.restore(); }
        D.text(ctx, 'nginx', x, y + 0.5, { size: s * 0.24, weight: 700, color: P.text1, align: 'center' });
      }
    },
    pathFor: function (st) {
      var p = this.L.pos, pts = [], a = st.from != null ? st.from : 0, b = st.to;
      var dir = b >= a ? 1 : -1;
      for (var i = a; dir > 0 ? i <= b : i >= b; i += dir) pts.push(p[i].x, p[i].y);
      return pts;
    },
    draw: function () {
      if (this.w < 160 || this.h < 120) { D.clear(this.ctx, this.w, this.h); return; }
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, fs = L.fs, m = this.mobile, self = this;
      D.clear(ctx, w, h);
      var p = L.pos;
      // server enclosure
      var sv = L.server;
      ctx.setLineDash([6, 5]);
      D.box(ctx, sv.x, sv.y, sv.w, sv.h, 12, U.rgba(P.accent, 0.03), U.rgba(P.accent, 0.5), 1);
      ctx.setLineDash([]);
      D.text(ctx, 'YOUR SERVER · 192.168.1.20', sv.x + 10, sv.y + 12, { size: fs * 0.8, weight: 700, color: P.accent, ls: 1.2 });
      // cables / links
      for (var i = 0; i < p.length - 1; i++) {
        var inside = i >= 2;
        if (inside) D.line(ctx, p[i].x, p[i].y, p[i + 1].x, p[i + 1].y, U.rgba(P.blueprint, 0.35), 1.5, [3, 4]);
        else { D.line(ctx, p[i].x, p[i].y, p[i + 1].x, p[i + 1].y, P.cable, 4); D.line(ctx, p[i].x, p[i].y, p[i + 1].x, p[i + 1].y, U.rgba(P.net, 0.25), 1.2); }
      }
      if (!m) D.text(ctx, 'Cat6 · 1 Gb/s', (p[0].x + p[1].x) / 2, p[0].y - 10, { size: fs * 0.72, color: P.text3, align: 'center' });
      // nodes
      var cur = this.step >= 0 ? STEPS[this.step] : null;
      var hot = this.activeNode();
      NODES.forEach(function (n, k) {
        var lit = hot === k;
        if (lit) D.glow(ctx, p[k].x, p[k].y, L.ns * 1.1, P.accent, 0.35);
        self.nodeGlyph(ctx, k, p[k].x, p[k].y, L.ns, lit);
        if (m) {
          D.text(ctx, n.name, p[k].x + L.ns * 0.95, p[k].y - 5, { size: fs * 0.9, weight: 700, color: lit ? P.accent : P.text1 });
          D.text(ctx, n.sub, p[k].x + L.ns * 0.95, p[k].y + 8, { size: fs * 0.78, color: P.text3 });
        } else {
          D.text(ctx, n.name, p[k].x, p[k].y + L.ns * 0.8, { size: fs * 0.88, weight: 700, color: lit ? P.accent : P.text1, align: 'center' });
          D.text(ctx, n.sub, p[k].x, p[k].y + L.ns * 0.8 + fs + 3, { size: fs * 0.75, color: P.text3, align: 'center' });
        }
      });
      // TLS padlock on the connection once established
      if (this.done >= 2 && !this.failed) {
        var mx = m ? p[0].x - L.ns * 0.75 : (p[0].x + p[1].x) / 2, my = m ? (p[0].y + p[1].y) / 2 : p[0].y + 16;
        D.g.padlock(ctx, mx, my, 14, P.ok, false);
      }
      // packet
      if (cur && !cur.render && this.busy) this.drawPacket(ctx, cur);
      // step rail
      this.drawRail(ctx);
      this.drawBrowser(ctx);
      if (!m) this.drawExplain(ctx);
      // confetti
      for (var c = 0; c < NC; c++) {
        var cf = this.conf[c]; if (!cf.on) continue;
        ctx.globalAlpha = U.clamp(cf.life, 0, 1);
        ctx.fillStyle = P[cf.c]; ctx.fillRect(cf.x - cf.r / 2, cf.y - cf.r / 2, cf.r, cf.r);
      }
      ctx.globalAlpha = 1;
      this.setDesc(this.describe());
    },
    activeNode: function () {
      if (!this.busy || this.step < 0) return -1;
      var st = STEPS[this.step]; if (st.render) return 0;
      var pts = this.pathFor(st), n = pts.length / 2;
      var k = this.k, blocked = st.fw && this.block;
      if (blocked) { var stop = 3; return Math.min(stop, Math.round(U.clamp(k / 0.7, 0, 1) * stop)); }
      var f = st.back ? (k < 0.5 ? k * 2 : (1 - k) * 2) : k;
      var idx = Math.round(f * (n - 1));
      return st.from != null ? st.from - idx : idx;
    },
    drawPacket: function (ctx, st) {
      var P = S.pal, L = this.L, fs = L.fs, k = this.k, pts = this.pathFor(st), lens = D.polyLen(pts), total = lens[lens.length - 1];
      var blocked = st.fw && this.block, fwDist = 0, back = false, s, label, col = st.resp ? P.ok : P.net;
      if (blocked) {
        var fp = L.pos[3]; fwDist = Math.abs(fp.x - L.pos[0].x) + Math.abs(fp.y - L.pos[0].y);
        s = U.ease.inOutSine(U.clamp(k / 0.7, 0, 1)) * fwDist;
        label = this.retry ? 'SYN (retry ' + this.retry + ')' : st.out;
      } else if (st.back) {
        back = k >= 0.5;
        var f = U.ease.inOutSine(back ? (k - 0.5) * 2 : k * 2);
        s = back ? (1 - f) * total : f * total;
        label = back ? st.ret : st.out; if (back) col = P.ok;
      } else { s = U.ease.inOutSine(k) * total; label = st.out; }
      D.along(pts, lens, s, this.tmp);
      var x = this.tmp.x, y = this.tmp.y;
      if (blocked && k > 0.7) {
        var a = 1 - U.segment(k, 0.7, 1);
        D.g.cross(ctx, x, y - 2, 18, P.fault);
        D.pill(ctx, 'DROP tcp/443 · no reply', x, y - (this.mobile ? 0 : 40), { color: P.fault, size: fs * 0.82, align: this.mobile ? 'left' : 'center' });
        ctx.globalAlpha = a; D.circle(ctx, x, y, 5, P.fault); ctx.globalAlpha = 1;
        return;
      }
      D.glow(ctx, x, y, 16, col, 0.7);
      D.circle(ctx, x, y, 5, col, U.rgba(P.bg, 0.8), 1.2);
      var tag = st.tag + ' ' + label;
      if (this.mobile) D.pill(ctx, tag, x + L.ns * 0.95 + 4, y + 24, { color: col, size: fs * 0.82, align: 'left' });
      else D.pill(ctx, tag, x, y - L.ns * 0.95, { color: col, size: fs * 0.85, align: 'center' });
      if (st.fw && !this.block && Math.abs(x - L.pos[3].x) < 30 && Math.abs(y - L.pos[3].y) < 30) D.pill(ctx, 'ACCEPT ✓', L.pos[3].x, L.pos[3].y + (this.mobile ? -L.ns * 0.6 : -L.ns * 1.75), { color: P.ok, size: fs * 0.8, align: 'center' });
    },
    drawRail: function (ctx) {
      var P = S.pal, L = this.L, fs = L.fs, m = this.mobile, w = this.w, h = this.h, self = this;
      if (m) return;
      var y = h - 22, x0 = 16, gap = (w - 32) / STEPS.length;
      STEPS.forEach(function (st, i) {
        var x = x0 + i * gap, done = i <= self.done, active = i === self.step && self.busy, bad = self.failed && i === self.step;
        var col = bad ? P.fault : done ? P.ok : active ? P.accent : P.text3;
        D.circle(ctx, x + 8, y, 7, done || active || bad ? U.rgba(col, 0.2) : null, col, 1.4);
        D.text(ctx, bad ? '✕' : done ? '✓' : String(i + 1), x + 8, y + 0.5, { size: fs * 0.75, weight: 700, color: col, align: 'center' });
        var txt = st.render ? 'render page' : st.tag === 'ARP' ? 'ARP find MAC' : st.tag === 'TCP' ? 'TCP handshake' : st.tag === 'TLS' ? 'TLS encrypt' : st.resp ? '200 OK back' : 'HTTP GET /';
        D.text(ctx, txt, x + 20, y + 0.5, { size: fs * 0.82, weight: active ? 700 : 500, color: done || active ? P.text1 : P.text3 });
        if (i < STEPS.length - 1) D.line(ctx, x + 22 + D.measure(ctx, txt, fs * 0.82, active ? 700 : 500) + 4, y, x + gap - 4, y, U.rgba(P.text3, 0.35), 1);
      });
    },
    drawBrowser: function (ctx) {
      var P = S.pal, B = this.L.browser, fs = this.L.fs, m = this.mobile, a = this.page;
      D.box(ctx, B.x, B.y, B.w, B.h, 8, P.panel, U.rgba(P.blueprint, 0.6), 1);
      D.box(ctx, B.x, B.y, B.w, 22, 8, P.panel2);
      ctx.fillStyle = P.panel2; ctx.fillRect(B.x, B.y + 14, B.w, 8);
      var dc = [P.fault, P.warn, P.ok];
      for (var i = 0; i < 3; i++) D.circle(ctx, B.x + 12 + i * 11, B.y + 11, 3.2, dc[i]);
      D.box(ctx, B.x + 48, B.y + 4, B.w - 56, 14, 7, P.bg);
      var lock = this.done >= 2 && !this.failed;
      if (lock) D.g.padlock(ctx, B.x + 58, B.y + 10, 10, P.ok, false);
      D.text(ctx, 'https://192.168.1.20', B.x + (lock ? 66 : 56), B.y + 11.5, { size: fs * 0.78, color: P.text2, maxW: B.w - 76 });
      var cx = B.x + B.w / 2, cy = B.y + 22 + (B.h - 22) / 2;
      if (this.failed) {
        ctx.globalAlpha = a;
        D.g.cross(ctx, cx, cy - 18, 18, P.text3);
        D.text(ctx, 'This site can’t be reached', cx, cy + 4, { size: fs * 1.05, weight: 700, color: P.text1, align: 'center', sans: true });
        D.text(ctx, 'ERR_CONNECTION_TIMED_OUT', cx, cy + 22, { size: fs * 0.8, color: P.fault, align: 'center' });
        ctx.globalAlpha = 1;
      } else if (this.done >= STEPS.length - 1) {
        var k = U.ease.outBack(a);
        ctx.save(); ctx.translate(cx, cy - 4); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); ctx.globalAlpha = U.clamp(a * 1.5, 0, 1);
        D.text(ctx, 'Hello from my server!', 0, 0, { size: m ? 17 : Math.min(20, B.w / 14), weight: 800, color: P.text1, align: 'center', sans: true });
        D.text(ctx, 'served by nginx · 1.2 kB · 14 ms', 0, 20, { size: fs * 0.8, color: P.text3, align: 'center' });
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (this.busy || this.done >= 0) {
        // loading spinner
        var t = this.time + this.k * 6;
        for (var s = 0; s < 8; s++) { var an = s / 8 * U.TAU + t * 3; D.circle(ctx, cx + Math.cos(an) * 10, cy + Math.sin(an) * 10, 1.8, U.rgba(P.text3, (s + 1) / 8)); }
        D.text(ctx, 'waiting for 192.168.1.20…', cx, cy + 24, { size: fs * 0.8, color: P.text3, align: 'center' });
      } else {
        D.text(ctx, 'press Send request', cx, cy, { size: fs * 0.85, color: P.text3, align: 'center' });
      }
    },
    drawExplain: function (ctx) {
      var P = S.pal, E = this.L.explain, fs = this.L.fs, i = this.step;
      if (E.w < 160) return;
      var title, body, col = P.accent;
      if (this.failed) { title = 'Timed out · port 443 is blocked'; body = 'The firewall silently drops every SYN. The laptop retries a few times, then gives up. Nothing reached nginx.'; col = P.fault; }
      else if (i < 0) { title = 'One click, six steps'; body = 'Press Send request (or Step ›) to follow one web request from your laptop into the server and back.'; col = P.text2; }
      else if (STEPS[i].fw && this.block && this.busy) { title = 'TCP · SYN to port 443…'; body = 'The firewall rule for 443 is gone, so the packet is dropped without a reply.'; col = P.warn; }
      else { title = 'Step ' + (i + 1) + ' · ' + EXPLAIN[i][0]; body = EXPLAIN[i][1]; }
      D.text(ctx, title, E.x, E.y + 10, { size: fs * 1.05, weight: 700, color: col });
      var words = body.split(' '), line = '', y = E.y + 34, lh = fs * 1.5, maxW = Math.min(E.w, 520);
      for (var k = 0; k < words.length; k++) {
        var test = line ? line + ' ' + words[k] : words[k];
        if (D.measure(ctx, test, fs * 0.95, 500, true) > maxW && line) { D.text(ctx, line, E.x, y, { size: fs * 0.95, color: P.text2, sans: true }); line = words[k]; y += lh; }
        else line = test;
      }
      if (line) D.text(ctx, line, E.x, y, { size: fs * 0.95, color: P.text2, sans: true });
    },
    describe: function () {
      if (this.failed) return 'The request timed out: the firewall drops port 443.';
      if (this.done >= STEPS.length - 1) return 'The page loaded: Hello from my server!';
      if (this.step >= 0) return 'Step ' + (this.step + 1) + ' of ' + STEPS.length + ': ' + this.stepText(this.step);
      return 'Ready to send a request from the laptop to the server.';
    }
  });
})(window.SRV);
