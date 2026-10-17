/* Ch13 · Lights out, 3 AM. Left: a dark iso datacenter row of 40 identical servers; one is frozen
   (red fault blink). Its BMC, fed by standby power, is still awake. Right: your laptop on the couch
   with a code-drawn remote console, linked over a separate (blue) management network.
   Blink ID LED · Virtual console · Power cycle · Mount ISO · Sensors. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso;

  var RACKS = 4, SLOTS = 10, RW = 600, RD = 1000, RH = 2000, PITCH = 172, Z0 = 120, SH = 88;
  var TR = 1, TS = 6;                         // target rack / slot
  var VENDORS = { idrac: ['iDRAC 9', 'Dell'], ilo: ['iLO 6', 'HPE'], xcc: ['XClarity', 'Lenovo'], ipmi: ['IPMI · BMC', 'Supermicro'] };
  var PANIC = [
    '[ 8812.5512] BUG: unable to handle page fault',
    '[ 8812.5519] RIP: 0010:ext4_es_lookup_extent+0x4c',
    '[ 8812.5523] Call Trace:',
    '[ 8812.5525]  ext4_map_blocks+0x8f/0x5e0',
    '[ 8812.5531]  ext4_readahead+0x1d2/0x4a0',
    '[ 8812.5534] Kernel panic - not syncing:',
    '             Fatal exception in interrupt',
    '[ 8812.5540] ---[ end Kernel panic ]---'
  ];
  var POST = [
    [0.0, 'BMC: chassis power ON'],
    [0.5, 'Initializing firmware…'],
    [1.0, 'Memory training … 256 GB OK'],
    [1.7, 'PCIe: NIC 25GbE · NVMe ×2 · OK'],
    [2.3, 'Booting NVMe0 · GRUB'],
    [2.9, 'Ubuntu 24.04 LTS  web-17 tty1'],
    [3.5, 'web-17 login:']
  ];
  var TABS = [['id', 'ID'], ['console', 'Console'], ['power', 'Power'], ['media', 'Media'], ['sensors', 'Sensors']];

  S.defineVisual('bmc', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.host = 'frozen';         // frozen | off | post | ok
      this.view = 'summary';        // summary | console | sensors | media
      this.vendor = 'idrac';
      this.idOn = false; this.zf = 0; this.postT = 0; this.offT = 0;
      this.iso = { state: 'none', p: 0 };   // none | sending | mounted
      this.sens = { cpu: 71, fan: 9600, psu: 310 };
      this.beads = new Float32Array(10); for (var i = 0; i < 10; i++) this.beads[i] = i / 10;
      this.tmpPts = []; this.lanePts = []; this.laneLens = null; this.alongOut = {};
      var self = this;
      this.rackDecal = [];
      for (var r = 0; r < RACKS; r++) this.rackDecal.push(this.makeDecal(r));
      var g = this.ui.group('Remote console');
      this.bId = g.button('◉ Blink ID LED', function () { self.toggleId(); }, { pressed: false });
      g.button('▣ Virtual console', function () { self.setView('console'); });
      this.bPow = g.button('⏻ Power cycle', function () { self.powerCycle(); }, { kind: 'danger' });
      this.bIso = g.button('◎ Mount ISO', function () { self.mountIso(); });
      g.button('◔ Sensors', function () { self.setView('sensors'); });
      this.ui.br();
      this.ui.seg({ label: 'Badge', options: [['idrac', 'iDRAC · Dell'], ['ilo', 'iLO · HPE'], ['xcc', 'XClarity · Lenovo'], ['ipmi', 'IPMI · Supermicro']], value: 'idrac', onChange: function (v) { self.vendor = v; } });
      this.ui.spacer();
      g = this.ui.group('');
      g.button('↺ Reset', function () { self.reset(); });
      this.rHost = this.ui.readout('web-17', 'frozen', 'bad');
      this.pointer({
        down: function (p) {
          var hit = this.hits.query(p.x, p.y);
          if (!hit) return false;
          if (hit.id === 'tab') this.tabAction(hit.data);
          else if (hit.id === 'target') this.toggleId();
          return false;
        },
        hover: function (p) {
          var hit = this.hits.query(p.x, p.y);
          this.stage.style.cursor = hit ? 'pointer' : '';
          if (hit && hit.id === 'target') this.tipAt('<b>web-17</b> · rack R2 · U' + (TS * 4 + 3) + ' — the frozen one', p.x, p.y);
          else this.tipAt(null);
        }
      });
    },

    // ---------------------------------------------------------------- actions
    tabAction: function (k) {
      if (k === 'id') this.toggleId();
      else if (k === 'power') this.powerCycle();
      else if (k === 'media') this.mountIso();
      else this.setView(k);
    },
    setView: function (v) {
      this.view = v;
      if (v === 'console') this.announce(this.host === 'frozen' ? 'Virtual console: the server screen shows a kernel panic. It is frozen.' : 'Virtual console open.');
      if (v === 'sensors') this.announce('Sensors: CPU ' + Math.round(this.sens.cpu) + ' °C, fans ' + U.fmt(Math.round(this.sens.fan)) + ' rpm, power ' + Math.round(this.sens.psu) + ' W.');
    },
    toggleId: function () {
      this.idOn = !this.idOn;
      var self = this;
      this.tween({ from: this.zf, to: this.idOn ? 1 : 0, dur: 1.4, ease: 'camera', onUpdate: function (v) { self.zf = v; } });
      this.bId.setPressed(this.idOn);
      this.announce(this.idOn ? 'Identify LED blinking blue on web-17: one box among 40 is now easy to find.' : 'Identify LED off.');
    },
    powerCycle: function () {
      if (this.host === 'off' || this.host === 'post') return;
      this.host = 'off'; this.offT = 0; this.view = 'console';
      this.bPow.setDisabled(true);
      this.announce('Power cycle sent over the management network. The server is off, but its BMC is still awake.');
      if (this._paused) this.settle();
    },
    mountIso: function () {
      if (this.iso.state === 'sending') return;
      this.iso.state = 'sending'; this.iso.p = 0; this.view = 'media';
      this.bIso.setDisabled(true);
      this.announce('Mounting ubuntu ISO as a virtual CD over the management network.');
      if (this._paused) this.settle();
    },
    /** animation paused (reduced motion): jump straight to the end state */
    settle: function () {
      for (var i = 0; i < 200 && (this.host === 'off' || this.host === 'post' || this.iso.state === 'sending'); i++) this.update(0.05);
      for (var k = 0; k < 120; k++) this.update(0.05);
      this.invalidate();
    },
    reset: function () {
      this.host = 'frozen'; this.view = 'summary'; this.iso = { state: 'none', p: 0 };
      if (this.idOn) this.toggleId();
      this.bPow.setDisabled(false); this.bIso.setDisabled(false);
      this.announce('Reset: web-17 is frozen again.');
    },

    // ---------------------------------------------------------------- layout
    resize: function (w, h) {
      var m = this.mobile = w < 560;
      if (m) {
        this.dc = { x: 0, y: 0, w: w, h: h * 0.52 };
        this.home = { x: 0, y: h * 0.52, w: w, h: h * 0.48 };
        this.inset = { x: 8, y: this.dc.h - 92, w: 150, h: 84 };
      } else {
        this.dc = { x: 0, y: 0, w: w * 0.56, h: h };
        this.home = { x: w * 0.56, y: 0, w: w * 0.44, h: h };
        this.inset = { x: 14, y: h - 150, w: 222, h: 136 };
      }
      var dc = this.dc, Vb = this.Vb = I.view({ yaw: -0.3, S: 0.42, cx: 1280, cy: 500 });
      var bb = { x0: 0, y0: 0, z0: 0, x1: RACKS * 640 - 40, y1: RD, z1: RH };
      if (m) { Vb.fit(bb, dc.w - 150, dc.h - 30, 6); Vb.ox += 150; Vb.oy += 18; }
      else { Vb.fit(bb, dc.w - 30, dc.h - 120, 10); Vb.ox += 22; Vb.oy += 30; }
      this.V = I.view({ yaw: Vb.yaw, S: Vb.S, cx: Vb.cx, cy: Vb.cy, k: Vb.k, ox: Vb.ox, oy: Vb.oy });
      // laptop geometry
      var H = this.home;
      if (m) {
        var sw = Math.min(250, w * 0.64), sh = sw * 0.6;
        this.scr = { x: H.x + (w - sw) / 2 + 22, y: H.y + 34, w: sw, h: sh };
      } else {
        var sw2 = H.w * 0.8, sh2 = sw2 * 0.62;
        this.scr = { x: H.x + (H.w - sw2) / 2, y: H.y + H.h * 0.2, w: sw2, h: sh2 };
      }
    },
    /** 3D anchor of the target's front face */
    targetPt: function (V, out) {
      var x = TR * 640 + RW * 0.5, z = Z0 + TS * PITCH + SH * 0.5;
      return V.p(x, RD, z, out);
    },
    updateView: function () {
      var Vb = this.Vb, V = this.V, z = this.zf, dc = this.dc;
      var c = this.targetPt(Vb), fx = (c[0] - Vb.ox) / Vb.k, fy = (c[1] - Vb.oy) / Vb.k;
      var k2 = Vb.k * (this.mobile ? 2.4 : 2.7), cx = dc.x + dc.w * (this.mobile ? 0.58 : 0.55), cy = dc.y + dc.h * 0.42;
      V.k = U.lerp(Vb.k, k2, z); V.ox = U.lerp(Vb.ox, cx - fx * k2, z); V.oy = U.lerp(Vb.oy, cy - fy * k2, z);
    },

    // ---------------------------------------------------------------- simulation
    update: function (dt) {
      // host power state machine
      if (this.host === 'off') { this.offT += dt; if (this.offT > 1.8) { this.host = 'post'; this.postT = 0; } }
      else if (this.host === 'post') { this.postT += dt; if (this.postT > 4.2) { this.host = 'ok'; this.bPow.setDisabled(false); this.announce('web-17 booted and is healthy again. Fixed from the couch.'); } }
      if (this.iso.state === 'sending') { this.iso.p += dt / 2.6; if (this.iso.p >= 1) { this.iso.p = 1; this.iso.state = 'mounted'; this.bIso.setDisabled(false); this.announce('ISO mounted as a virtual CD. The server can now boot an installer from it.'); } }
      // sensors
      var b = S.build && S.build.get ? S.build.get() : null, okW = b && b.watts ? Math.round(b.watts * 0.55) : 240;
      var tgt = this.host === 'frozen' ? [71, 9600, 310] : this.host === 'off' ? [27, 0, 9] : this.host === 'post' ? [45, 12800, 380] : [48, 6200, okW];
      this.sens.cpu = U.damp(this.sens.cpu, tgt[0], this.host === 'off' ? 0.8 : 1.5, dt);
      this.sens.fan = U.damp(this.sens.fan, tgt[1], this.host === 'off' ? 1.4 : 2.5, dt);
      this.sens.psu = U.damp(this.sens.psu, tgt[2], 4, dt);
      for (var i = 0; i < this.beads.length; i++) { this.beads[i] += dt * 0.35; if (this.beads[i] > 1) this.beads[i] -= 1; }
      var cls = { frozen: 'bad', off: 'warn', post: 'warn', ok: 'ok' }[this.host];
      this.rHost.set({ frozen: 'frozen ✕', off: 'off (BMC on)', post: 'booting…', ok: 'healthy ✓' }[this.host], cls);
    },

    // ---------------------------------------------------------------- rack decal
    makeDecal: function (r) {
      var self = this;
      return function (c, w, h) {
        var P = S.pal, t = self.time, px = I.px;
        c.fillStyle = U.shade(P.plastic, P.dark ? -0.35 : -0.1); c.fillRect(0, 0, w, h);
        c.fillStyle = U.shade(P.steel, -0.3); c.fillRect(0, 0, 34, h); c.fillRect(w - 34, 0, 34, h);
        // top-of-rack switch
        var sv = h - 1840 - 44;
        c.fillStyle = U.shade(P.steel, -0.1); c.fillRect(40, sv, w - 80, 44);
        for (var k = 0; k < 12; k++) { c.fillStyle = U.rgba(P.silicon, 0.8); c.fillRect(60 + k * 38, sv + 8, 26, 18); D.led(c, 73 + k * 38, sv + 34, P.ok, 'activity', t * 1.2 + k * 1.7 + r * 3.1, 3.5); }
        for (var s = 0; s < SLOTS; s++) {
          var z = Z0 + s * PITCH, v = h - z - SH, tgt = r === TR && s === TS, st = tgt ? self.host : 'ok';
          c.fillStyle = U.shade(P.steel, P.dark ? -0.12 : 0.05); c.fillRect(40, v, w - 80, SH);
          c.fillStyle = U.rgba(P.silicon, 0.45);
          for (var d = 0; d < 8; d++) c.fillRect(56 + d * 50, v + 12, 40, SH - 24);
          var on = st !== 'off';
          D.led(c, w - 92, v + 22, P.ok, on ? 'solid' : 'off', t, 7);                                         // power
          if (st === 'frozen') D.led(c, w - 70, v + 22, P.fault, 'blink', t, 10);                             // fault
          else D.led(c, w - 70, v + 22, P.ok, on && st !== 'post' ? 'activity' : 'off', t * 0.9 + s * 1.37 + r * 2.3, 6);
          D.led(c, w - 48, v + 22, P.mgmt, tgt && self.idOn ? 'blink' : 'off', t * 1.5, 8);                      // ID (blue)
          if (st === 'post') D.led(c, w - 70, v + 22, P.warn, 'blink', t * 2, 4.5);
          c.lineWidth = px; c.strokeStyle = U.rgba(P.alu, 0.25); c.strokeRect(40, v, w - 80, SH);
        }
      };
    },

    // ---------------------------------------------------------------- drawing
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, t = this.time, m = this.mobile;
      D.clear(ctx, w, h);
      this.hits.clear();
      this.updateView();
      this.drawDatacenter(ctx, P, t);
      this.drawHome(ctx, P, t);
      this.drawInset(ctx, P, t);
      this.drawLane(ctx, P, t);
      this.drawLaptop(ctx, P, t);
      var d = { frozen: 'One server among 40 is frozen with a red fault light; its BMC is still awake on standby power.', off: 'The server is powered off remotely; only its BMC stays on.',
        post: 'The server is booting again: the console shows the power-on self test.', ok: 'The server is healthy again, fixed remotely from the couch.' }[this.host];
      this.setDesc(d + (this.idOn ? ' Its blue ID LED is blinking.' : '') + (this.iso.state === 'mounted' ? ' An install ISO is mounted as a virtual CD.' : ''));
      void m;
    },

    drawDatacenter: function (ctx, P, t) {
      var dc = this.dc, V = this.V, m = this.mobile;
      ctx.save(); ctx.beginPath(); ctx.rect(dc.x, dc.y, dc.w, dc.h); ctx.clip();
      ctx.fillStyle = U.rgba(P.bg0, P.dark ? 0.7 : 0.35); ctx.fillRect(dc.x, dc.y, dc.w, dc.h);
      I.floorGrid(ctx, V, -400, -200, RACKS * 640 + 200, RD + 800, 200, P.grid, 0.5);
      for (var r = 0; r < RACKS; r++) {
        var b = { x: r * 640, y: 0, z: 0, w: RW, d: RD, h: RH };
        I.shadow(ctx, V, b, 0.3);
        I.box(ctx, V, b, { color: 'plastic', decal: { left: this.rackDecal[r] } });
      }
      // target hit + ID sonar
      var tp = this.targetPt(V), idp = V.p(TR * 640 + RW - 48, RD, Z0 + TS * PITCH + SH - 22);
      this.tp = tp;
      this.hits.circle('target', tp[0], tp[1], Math.max(14, V.k * 120));
      if (this.zf > 0.01) {
        // spotlight: dim everything except the target
        ctx.beginPath(); ctx.rect(dc.x, dc.y, dc.w, dc.h); ctx.arc(tp[0], tp[1], 40 + V.k * 300, 0, U.TAU, true);
        ctx.fillStyle = U.rgba(P.bg0, 0.5 * this.zf); ctx.fill();
      }
      if (this.host === 'frozen') {
        var fp = V.p(TR * 640 + RW - 70, RD, Z0 + TS * PITCH + SH - 22);
        if ((t * 2 | 0) % 2 === 0) { D.glow(ctx, fp[0], fp[1], 9 + V.k * 30, P.fault, 0.95); D.circle(ctx, fp[0], fp[1], Math.max(1.6, V.k * 10), P.fault); }
      }
      if (this.idOn) {
        for (var k = 0; k < 3; k++) {
          var ph = ((t * 0.8 + k / 3) % 1), rr = 4 + ph * (m ? 40 : 60);
          D.circle(ctx, idp[0], idp[1], rr, null, U.rgba(P.mgmt, (1 - ph) * 0.9), 2);
        }
        D.glow(ctx, idp[0], idp[1], 18, P.mgmt, 0.9);
      }
      // labels
      D.text(ctx, 'DATACENTER · 03:07', dc.x + 12, dc.y + 14, { size: m ? 9 : 10.5, weight: 800, color: P.text2, ls: 1 });
      D.text(ctx, '40 identical servers · nobody on site', dc.x + 12, dc.y + (m ? 27 : 30), { size: m ? 8 : 9.5, color: P.text3 });
      var col = this.host === 'frozen' ? P.fault : this.host === 'ok' ? P.ok : P.warn;
      var lab = { frozen: '✕ web-17 · frozen', off: '⏻ web-17 · off', post: '… web-17 · booting', ok: '✓ web-17 · healthy' }[this.host];
      D.pill(ctx, lab, tp[0] + (m ? 22 : 30), tp[1] - (m ? 26 : 34) - this.zf * 10, { size: m ? 8.5 : 10, color: col });
      ctx.restore();
    },

    drawInset: function (ctx, P, t) {
      var b = this.inset, m = this.mobile, on = this.host !== 'off';
      // leader from target to inset
      var tp = this.tp;
      D.line(ctx, b.x + b.w * 0.7, b.y, tp[0], tp[1], U.rgba(P.blueprint, 0.6), 1, [3, 3]);
      D.circle(ctx, tp[0], tp[1], 3, P.blueprint);
      D.box(ctx, b.x, b.y, b.w, b.h, 8, U.rgba(P.panel, 0.95), U.rgba(P.mgmt, 0.6), 1.2);
      D.text(ctx, m ? 'INSIDE web-17' : 'INSIDE web-17 · the BMC', b.x + 10, b.y + 12, { size: m ? 8 : 9.5, weight: 800, color: P.text2, ls: 0.5 });
      var s = m ? 0.68 : 1;
      // board
      var bx = b.x + 10, by = b.y + 24 * s + 4, bw = b.w - 20, bh = b.h - 34 * s - 18;
      D.box(ctx, bx, by, bw, bh, 4, U.rgba(P.pcb, 0.9), U.rgba(P.alu, 0.3), 1);
      // PSU block (standby)
      var px = bx + 6, py = by + 6, pw = 34 * s, ph = bh - 12;
      D.box(ctx, px, py, pw, ph, 2, U.shade(P.steel, -0.1));
      D.text(ctx, 'PSU', px + pw / 2, py + ph / 2, { size: 8 * s + 1, weight: 700, color: P.text2, align: 'center' });
      // CPU
      var cx = bx + bw * 0.62, cy = by + bh * 0.5, cs = 26 * s;
      var cpuCol = this.host === 'frozen' ? P.fault : this.host === 'ok' ? P.ok : this.host === 'post' ? P.warn : P.text3;
      D.box(ctx, cx - cs / 2, cy - cs / 2, cs, cs, 2, U.rgba(P.silicon, 0.95), cpuCol, 1.3);
      D.text(ctx, 'CPU', cx, cy, { size: 7.5 * s + 1, weight: 700, color: cpuCol, align: 'center' });
      // BMC chip
      var mx = bx + bw * 0.34, my = by + bh * 0.66, ms = 18 * s;
      // main power to CPU (dies when off) and standby trickle to BMC (always)
      this.tmpPts.length = 0; this.tmpPts.push(px + pw, py + ph * 0.3, cx - cs / 2, py + ph * 0.3, cx - cs / 2, cy - cs * 0.2);
      D.flow(ctx, this.tmpPts, on ? P.power : U.rgba(P.text3, 0.5), t, { width: 1.8, speed: on ? 30 : 0, dash: [5, 5] });
      this.tmpPts.length = 0; this.tmpPts.push(px + pw, my, mx - ms / 2, my);
      D.flow(ctx, this.tmpPts, P.power, t, { width: 1, speed: 10, dash: [2, 4], base: 0.1 });
      var pulse = 0.6 + 0.4 * Math.sin(t * 2.4);
      D.glow(ctx, mx, my, ms * 1.6, P.mgmt, 0.5 * pulse);
      D.box(ctx, mx - ms / 2, my - ms / 2, ms, ms, 2, U.rgba(P.mgmt, 0.35), P.mgmt, 1.4);
      D.text(ctx, 'BMC', mx, my, { size: 7 * s + 1, weight: 800, color: P.text1, align: 'center' });
      // mgmt jack on the board edge
      this.jack = [bx + bw, my];
      D.box(ctx, bx + bw - 6, my - 5, 9, 10, 1, U.rgba(P.silicon, 0.9), P.mgmt, 1);
      this.tmpPts.length = 0; this.tmpPts.push(mx + ms / 2, my, bx + bw - 6, my);
      D.line(ctx, mx + ms / 2, my, bx + bw - 6, my, P.mgmt, 1.4);
      // captions
      var cy2 = b.y + b.h - 10;
      D.text(ctx, on ? 'standby trickle ⚡ keeps BMC awake' : 'server OFF · BMC still ON ✓', b.x + 10, cy2, { size: m ? 7.5 : 9, weight: 700, color: on ? P.power : P.ok, maxW: b.w - 18 });
    },

    drawHome: function (ctx, P, t) {
      var H = this.home, m = this.mobile, sc = this.scr;
      // room
      ctx.fillStyle = U.rgba(P.panel, P.dark ? 0.35 : 0.5); ctx.fillRect(H.x, H.y, H.w, H.h);
      D.line(ctx, H.x, H.y, H.x + (m ? H.w : 0), H.y + (m ? 0 : H.h), U.rgba(P.blueprint, 0.35), 1);
      D.text(ctx, 'HOME · on the couch', H.x + (m ? Math.max(12, sc.x - 18) : 12), H.y + 14, { size: m ? 9 : 10.5, weight: 800, color: P.text2, ls: 1 });
      if (m) {
        D.text(ctx, '03:07 · alarm: web-17 down', H.x + H.w - 10, H.y + 14, { size: 9, weight: 800, color: P.fault, align: 'right' });
      } else {
      // window with moon
      var wx = H.x + H.w - (m ? 70 : 100), wy = H.y + (m ? 8 : 28), ww = m ? 58 : 80, wh = m ? 40 : 62;
      D.box(ctx, wx, wy, ww, wh, 3, U.rgba(P.bg0, 0.8), U.rgba(P.alu, 0.5), 1.5);
      D.line(ctx, wx + ww / 2, wy, wx + ww / 2, wy + wh, U.rgba(P.alu, 0.5), 1.5);
      D.circle(ctx, wx + ww * 0.72, wy + wh * 0.32, wh * 0.15, P.warn);
      D.circle(ctx, wx + ww * 0.68, wy + wh * 0.28, wh * 0.13, U.rgba(P.bg0, 1));
      ctx.fillStyle = U.rgba(P.text1, 0.7); ctx.fillRect(wx + ww * 0.2, wy + wh * 0.3, 1.5, 1.5); ctx.fillRect(wx + ww * 0.35, wy + wh * 0.6, 1.5, 1.5); ctx.fillRect(wx + ww * 0.15, wy + wh * 0.75, 1.5, 1.5);
      D.text(ctx, '03:07', wx - 8, wy + 10, { size: m ? 10 : 13, weight: 800, color: P.fault, align: 'right' });
      D.text(ctx, 'alarm: web-17 down', wx - 8, wy + 26, { size: 9, color: P.text3, align: 'right' });
      }
      // couch (behind the laptop)
      var cyB = m ? H.y + H.h - 18 : sc.y + sc.h + sc.h * 0.55, cxL = H.x + (m ? 8 : 16), cxR = H.x + H.w - (m ? 8 : 16);
      var backTop = m ? sc.y + sc.h * 0.25 : sc.y + sc.h * 0.35;
      D.box(ctx, cxL + 14, backTop, cxR - cxL - 28, cyB - backTop, 14, U.shade(P.panel3, P.dark ? -0.1 : -0.05), U.rgba(P.blueprint, 0.25), 1);
      D.box(ctx, cxL, cyB - (m ? 44 : 70), 26, m ? 44 : 70, 10, U.shade(P.panel3, P.dark ? 0.08 : -0.12));
      D.box(ctx, cxR - 26, cyB - (m ? 44 : 70), 26, m ? 44 : 70, 10, U.shade(P.panel3, P.dark ? 0.08 : -0.12));
      D.box(ctx, cxL + 20, cyB - (m ? 22 : 34), cxR - cxL - 40, m ? 22 : 34, 8, U.shade(P.panel3, P.dark ? 0.05 : -0.08));
      // mug
      if (!m) { var mgx = cxR - 52, mgy = cyB - 46; D.box(ctx, mgx, mgy, 16, 18, 3, U.shade(P.alu, -0.2)); D.circle(ctx, mgx + 19, mgy + 9, 5, null, U.shade(P.alu, -0.2), 2); D.shimmer(ctx, mgx + 8, mgy - 2, 14, t, P.text3, 0.5); }
    },

    drawLaptop: function (ctx, P, t) {
      var sc = this.scr, m = this.mobile, x = sc.x, y = sc.y, w = sc.w, h = sc.h;
      // lid + base
      D.box(ctx, x - 7, y - 7, w + 14, h + 14, 8, U.shade(P.alu, P.dark ? -0.45 : -0.3), U.rgba(P.alu, 0.8), 1.2);
      D.poly(ctx, [x - 22, y + h + 8, x + w + 22, y + h + 8, x + w + 10, y + h + 20, x - 10, y + h + 20]);
      ctx.fillStyle = U.shade(P.alu, P.dark ? -0.2 : -0.1); ctx.fill();
      D.glow(ctx, x + w / 2, y + h / 2, w * 0.7, P.mgmt, P.dark ? 0.12 : 0.05);
      // screen
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.fillStyle = P.panel; ctx.fillRect(x, y, w, h);
      var fs = m ? 7.5 : 10, th = m ? 15 : 20, V = VENDORS[this.vendor];
      // title bar
      ctx.fillStyle = U.rgba(P.mgmt, 0.9); ctx.fillRect(x, y, w, th);
      D.text(ctx, V[0], x + 6, y + th / 2, { size: fs + 0.5, weight: 800, color: P.bg });
      D.text(ctx, 'web-17 · 10.0.50.17', x + w - 6, y + th / 2, { size: fs - 0.5, weight: 600, color: P.bg, align: 'right' });
      // tabs
      var ty = y + th, tbh = m ? 14 : 18, tw = w / TABS.length;
      ctx.fillStyle = U.rgba(P.panel3, 0.9); ctx.fillRect(x, ty, w, tbh);
      for (var i = 0; i < TABS.length; i++) {
        var k = TABS[i][0], act = (k === this.view) || (k === 'id' && this.view === 'summary' && this.idOn) || (k === 'power' && (this.host === 'off' || this.host === 'post') && this.view === 'console') || (k === 'media' && this.view === 'media');
        if (act) { ctx.fillStyle = U.rgba(P.mgmt, 0.25); ctx.fillRect(x + i * tw, ty, tw, tbh); ctx.fillStyle = P.mgmt; ctx.fillRect(x + i * tw, ty + tbh - 2, tw, 2); }
        D.text(ctx, TABS[i][1], x + i * tw + tw / 2, ty + tbh / 2, { size: fs - 0.5, weight: 700, color: act ? P.text1 : P.text2, align: 'center' });
        this.hits.rect('tab', x + i * tw, ty, tw, tbh, k);
      }
      var cy = ty + tbh, ch = h - th - tbh, pad = m ? 6 : 10;
      if (this.view === 'console') this.drawConsole(ctx, P, t, x, cy, w, ch, fs, pad);
      else if (this.view === 'sensors') this.drawSensors(ctx, P, x, cy, w, ch, fs, pad);
      else if (this.view === 'media') this.drawMedia(ctx, P, t, x, cy, w, ch, fs, pad);
      else this.drawSummary(ctx, P, t, x, cy, w, ch, fs, pad);
      ctx.restore();
      if (!m) D.text(ctx, 'remote console in a browser', x + w / 2, y + h + 34, { size: 9.5, color: P.text3, align: 'center' });
    },
    drawSummary: function (ctx, P, t, x, y, w, h, fs, pad) {
      var st = this.host, lh = fs * 1.75, yy = y + pad + fs * 0.6;
      var health = st === 'frozen' ? ['✕ CRITICAL', P.fault] : st === 'ok' ? ['✓ OK', P.ok] : ['… WORKING', P.warn];
      var rows = [
        ['Health', health[0], health[1]],
        ['Power', st === 'off' ? 'OFF (standby)' : 'ON', st === 'off' ? P.warn : P.text1],
        ['Host OS', st === 'frozen' ? 'not responding' : st === 'ok' ? 'running' : '—', st === 'frozen' ? P.fault : P.text1],
        ['Identify', this.idOn ? 'blinking ◉' : 'off', this.idOn ? P.mgmt : P.text2],
        ['Last event', st === 'frozen' ? 'CPU1 machine check' : st === 'ok' ? 'host booted OK' : 'power cycle', P.text2]
      ];
      for (var i = 0; i < rows.length; i++) {
        D.text(ctx, rows[i][0], x + pad, yy + i * lh, { size: fs, color: P.text3 });
        D.text(ctx, rows[i][1], x + pad + w * 0.36, yy + i * lh, { size: fs, weight: 700, color: rows[i][2] });
      }
      if (this.iso.state === 'mounted') D.text(ctx, '◎ virtual CD: ubuntu-24.04.iso', x + pad, yy + rows.length * lh, { size: fs - 0.5, weight: 700, color: P.net });
    },
    drawConsole: function (ctx, P, t, x, y, w, h, fs, pad) {
      ctx.fillStyle = P.dark ? P.bg0 : P.silicon; ctx.fillRect(x, y, w, h);
      var lh = fs * 1.32, yy = y + pad + fs * 0.5, f = fs - 0.5, max = Math.floor((h - pad) / lh), tx = x + pad;
      var txtCol = P.dark ? P.text1 : P.alu;
      if (this.host === 'frozen') {
        for (var i = 0; i < Math.min(PANIC.length, max); i++) D.text(ctx, PANIC[i], tx, yy + i * lh, { size: f, color: i >= 5 ? P.fault : txtCol, weight: i >= 5 ? 700 : 500, maxW: w - pad * 2 });
      } else if (this.host === 'off') {
        D.text(ctx, 'No signal — host powered off', tx, yy, { size: f, color: P.warn, weight: 700 });
        D.text(ctx, '(BMC still answering ✓)', tx, yy + lh, { size: f, color: P.ok });
      } else {
        var T = this.host === 'ok' ? 99 : this.postT, n = 0;
        for (var j = 0; j < POST.length; j++) if (T >= POST[j][0]) n = j + 1;
        var start = Math.max(0, n - max);
        for (var k = start; k < n; k++) D.text(ctx, POST[k][1], tx, yy + (k - start) * lh, { size: f, color: k === n - 1 && this.host === 'ok' ? P.ok : txtCol, maxW: w - pad * 2 });
        if (n && (t * 2 | 0) % 2) { var cw = D.measure(ctx, POST[n - 1][1], f, 500); ctx.fillStyle = txtCol; ctx.fillRect(Math.min(tx + cw + 4, x + w - pad), yy + (n - 1 - start) * lh - f * 0.5, f * 0.55, f); }
      }
    },
    drawSensors: function (ctx, P, x, y, w, h, fs, pad) {
      var r = Math.min(w / 8.5, h * 0.3), cy = y + h * 0.48, sn = this.sens;
      var items = [
        ['CPU °C', sn.cpu / 100, Math.round(sn.cpu) + '°', sn.cpu > 80 ? P.fault : sn.cpu > 65 ? P.warn : P.ok],
        ['FAN rpm', sn.fan / 14000, sn.fan > 50 ? (sn.fan / 1000).toFixed(1) + 'k' : '0', P.air],
        ['PSU W', sn.psu / 600, Math.round(sn.psu) + '', P.power]
      ];
      for (var i = 0; i < 3; i++) {
        var cx = x + w * (0.18 + 0.32 * i);
        D.gauge(ctx, cx, cy, r, items[i][1], items[i][3], { value: items[i][2], lw: Math.max(3, r * 0.18), size: fs + 1 });
        D.text(ctx, items[i][0], cx, cy + r + fs, { size: fs - 0.5, weight: 700, color: P.text2, align: 'center' });
      }
      if (this.host === 'off') D.text(ctx, 'standby: only the BMC draws power', x + w / 2, y + h - fs, { size: fs - 0.5, color: P.ok, align: 'center' });
    },
    drawMedia: function (ctx, P, t, x, y, w, h, fs, pad) {
      var yy = y + pad + fs * 0.6, lh = fs * 1.8;
      D.text(ctx, 'Virtual media', x + pad, yy, { size: fs, weight: 800, color: P.text1 });
      D.text(ctx, 'ubuntu-24.04-live-server.iso · 2.6 GB', x + pad, yy + lh, { size: fs - 0.5, color: P.text2, maxW: w - pad * 2 });
      var p = this.iso.state === 'none' ? 0 : this.iso.p;
      D.meter(ctx, x + pad, yy + lh * 1.7, w - pad * 2, Math.max(5, fs * 0.7), p, this.iso.state === 'mounted' ? P.ok : P.net);
      D.text(ctx, this.iso.state === 'mounted' ? '✓ mounted as virtual CD' : this.iso.state === 'sending' ? 'attaching… ' + Math.round(p * 100) + '%' : 'not mounted', x + pad, yy + lh * 2.7, { size: fs, weight: 700, color: this.iso.state === 'mounted' ? P.ok : P.text2 });
      if (this.iso.state === 'mounted') D.text(ctx, 'next boot: Virtual CD → install OS', x + pad, yy + lh * 3.6, { size: fs - 0.5, color: P.text2, maxW: w - pad * 2 });
      void t;
    },

    /** management network: laptop → VPN → … → BMC jack (separate blue lane) */
    drawLane: function (ctx, P, t) {
      var sc = this.scr, m = this.mobile, j = this.jack || [this.inset.x + this.inset.w, this.inset.y + this.inset.h / 2], pts = this.lanePts;
      pts.length = 0;
      var vx, vy;
      if (m) {
        vx = sc.x - 34; vy = sc.y + sc.h * 0.5;
        pts.push(sc.x - 8, vy, vx, vy, vx, this.home.y - 10, j[0] + 26, this.home.y - 10, j[0] + 26, j[1], j[0] + 3, j[1]);
      } else {
        var lane = this.h - 30, ex = this.home.x + 22, ey = sc.y + sc.h * 0.62;
        vx = this.home.x; vy = lane;
        pts.push(sc.x - 8, ey, ex, ey, ex, lane, j[0] + 30, lane, j[0] + 30, j[1], j[0] + 3, j[1]);
      }
      D.flow(ctx, pts, P.mgmt, t, { width: 2, speed: 22, dash: [10, 6], base: 0.22 });
      var L = this.laneLens = D.polyLen(pts), tot = L[L.length - 1], o = this.alongOut;
      // console frames stream back to the laptop
      if (this.view === 'console' || this.view === 'sensors') {
        for (var i = 0; i < this.beads.length; i++) { D.along(pts, L, tot * (1 - this.beads[i]), o); D.circle(ctx, o.x, o.y, 2.4, P.mgmt); }
      }
      // ISO disc travelling to the server
      if (this.iso.state === 'sending') {
        D.along(pts, L, tot * U.ease.inOutSine(this.iso.p), o);
        D.glow(ctx, o.x, o.y, 22, P.net, 0.7);
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(t * 6); D.g.disc(ctx, 0, 0, m ? 18 : 24, P.alu); ctx.restore();
      }
      // VPN node
      D.circle(ctx, vx, vy, m ? 10 : 13, P.panel, P.mgmt, 1.5);
      D.g.padlock(ctx, vx, vy, m ? 11 : 14, P.mgmt);
      D.text(ctx, m ? 'VPN · mgmt' : 'VPN gateway', vx + (m ? 0 : 18), vy + (m ? 17 : 0), { size: m ? 8 : 9, weight: 800, color: P.mgmt, align: m ? 'center' : 'left' });
      var lx = m ? vx + 6 : (j[0] + 30 + vx) / 2, ly = m ? this.home.y - 18 : this.h - 44;
      if (!m) D.text(ctx, 'MANAGEMENT NETWORK · separate · never on the internet', lx, ly, { size: m ? 8 : 9.5, weight: 700, color: P.mgmt, align: m ? 'left' : 'center' });
    }
  });
})(window.SRV);
