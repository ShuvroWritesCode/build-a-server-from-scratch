/* Ch16 · The boot relay. A runner carries the baton through ten legs of a server's first boot
   (memory training is the long one) while a synced POST terminal types what the firmware reports.
   Faults: no DIMMs → halts at memory training with a beep code; no boot device → halts at leg 8. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var LEGS = [
    { id: 'pwr', lab: ['Power', 'button'], real: 0.5, icon: 'power' },
    { id: 'bmc', lab: ['BMC', 'wakes'], real: 2, icon: 'bmc' },
    { id: 'psu', lab: ['PSU', 'power-good'], real: 0.5, icon: 'bolt' },
    { id: 'cpu', lab: ['CPU', 'reset'], real: 1.5, icon: 'cpu' },
    { id: 'mem', lab: ['Memory', 'training'], real: 75, icon: 'dimm' },
    { id: 'pcie', lab: ['PCIe', 'enumeration'], real: 12, icon: 'tree' },
    { id: 'rom', lab: ['Option', 'ROMs'], real: 15, icon: 'rom' },
    { id: 'dev', lab: ['Boot', 'device'], real: 3, icon: 'disk' },
    { id: 'ldr', lab: ['Boot-', 'loader'], real: 3, icon: 'loader' },
    { id: 'krn', lab: ['Kernel', 'starts'], real: 8, icon: 'kernel' }
  ];
  var CH = 'ABCDEFGH';
  var NAMES = ['Power button', 'BMC wakes', 'PSU power-good', 'CPU reset', 'Memory training', 'PCIe enumeration', 'Option ROMs', 'Boot device', 'Bootloader', 'Kernel starts'];

  function script(i, f) {
    var L = [];
    function a(t, s, c) { L.push({ t: t, s: s, c: c || 'ok' }); }
    switch (i) {
      case 0: a(0.1, '[BMC] power button pressed'); break;
      case 1: a(0.15, '[BMC] firmware 3.10 · chassis power ON'); break;
      case 2: a(0.1, 'PSU1 800 W OK   PSU2 800 W OK'); a(0.8, 'PWR_OK asserted'); break;
      case 3: a(0.1, 'CPU0 reset released · 32 cores'); a(0.7, 'microcode update loaded'); break;
      case 4:
        if (f.nodimm) { a(0.03, 'memory training…', 'text'); a(0.25, 'ERROR: no memory detected', 'fault'); a(0.42, 'system halted · beep code: 3 short', 'fault'); break; }
        a(0.01, 'memory training… (first boot is slow)', 'text');
        for (var k = 0; k < 8; k++) a(0.03 + (k + 1) * 0.115, 'ch ' + CH[k] + '  DIMM ' + CH[k] + '1  32 GB DDR5-4800  trained');
        a(0.98, 'memory: 256 GB OK (8 × 32 GB, ECC)'); break;
      case 5:
        a(0.05, 'PCIe enumeration…', 'text');
        if (!f.noboot) { a(0.25, '  01:00.0 NVMe SSD 960 GB'); a(0.4, '  02:00.0 NVMe SSD 960 GB'); }
        else a(0.3, '  (no NVMe boot drives found)', 'warn');
        a(0.55, '  17:00.0 RAID / HBA controller'); a(0.7, '  31:00.0 25 GbE NIC (2 ports)'); a(0.85, '  03:00.0 BMC VGA'); break;
      case 6: a(0.05, 'RAID controller BIOS v7.27', 'text'); a(0.25, '  press <Ctrl+R> to configure'); a(0.55, 'Network boot agent (PXE) v1.5', 'text'); a(0.75, '  press <Ctrl+S> for setup'); break;
      case 7:
        if (f.noboot) { a(0.1, 'try NVMe mirror … not found', 'warn'); a(0.3, 'try USB … not found', 'warn'); a(0.5, 'try network PXE … no offer', 'warn'); a(0.7, 'No bootable device -- insert boot', 'fault'); a(0.72, 'media and press any key', 'fault'); break; }
        a(0.15, 'boot order: NVMe mirror → USB → PXE'); a(0.7, 'booting NVMe mirror (UEFI)'); break;
      case 8: a(0.1, 'GRUB loading…', 'text'); a(0.6, 'booting Ubuntu Server 24.04 LTS'); break;
      case 9: a(0.05, 'Linux 6.8 · 64 CPUs · 256 GB'); a(0.4, '[  OK  ] reached target network'); a(0.7, '[  OK  ] started OpenSSH server'); a(0.95, 'server01 login: _', 'text1'); break;
    }
    return L;
  }

  S.defineVisual('boot', {
    init: function () {
      this.ctx = this.layer();
      this.speed = 20; this.f = { nodimm: false, noboot: false };
      var self = this;
      var g = this.ui.group('Power');
      this.bPow = g.button('⏻ Power on', function () { self.powerOn(); }, { kind: 'primary' });
      g.button('↺ Reset', function () { self.reset(); self.announce('Powered off.'); });
      this.ui.seg({ label: 'Speed', options: [[10, '10×'], [20, '20×'], [40, '40×']], value: 20, onChange: function (v) { self.speed = v; } });
      this.ui.br();
      var f = this.ui.group('Inject a fault');
      f.text('<span class="ctl-label">Inject a fault ›</span>', 'ctl');
      f.toggle({ label: 'Remove all DIMMs', value: false, onChange: function (v) { self.f.nodimm = v; self.reset(); } });
      f.toggle({ label: 'No boot device', value: false, onChange: function (v) { self.f.noboot = v; self.reset(); } });
      this.ui.spacer();
      this.rT = this.ui.readout('Real boot time', '0:00');
      this.rLeg = this.ui.readout('Stage', 'off');
      this.reset();
    },
    reset: function () {
      this.phase = 'off'; this.leg = 0; this.legT = 0; this.real = 0;
      this.lines = []; this.queue = []; this.typed = 0; this.emitted = 0; this.cursor = 0;
      this.setActive(false);
      if (this.bPow) { this.bPow.setDisabled(false); this.bPow.setLabel('⏻ Power on'); }
      this.sync(); this.invalidate();
    },
    powerOn: function () {
      if (this.phase === 'run') return;
      this.reset();
      this.phase = 'run'; this.bPow.setDisabled(true);
      this.legScript = script(0, this.f); this.emitted = 0;
      this.announce('Power on. Boot started.');
      if (this.reduced()) { var n = 0; while (this.phase === 'run' && n++ < 20000) this.step(0.05, true); this.typed = 1e9; this.flushTyping(); this.invalidate(); }
      else this.setActive(true);
    },
    haltAt: function () { return this.f.nodimm ? { leg: 4, p: 0.5 } : this.f.noboot ? { leg: 7, p: 0.85 } : null; },
    step: function (dt, instant) {
      if (this.phase !== 'run') return;
      var L = LEGS[this.leg], dReal = dt * this.speed;
      this.legT += dReal; this.real += dReal;
      var p = this.legT / L.real, halt = this.haltAt();
      // emit scripted lines
      while (this.emitted < this.legScript.length && this.legScript[this.emitted].t <= p) { this.queue.push(this.legScript[this.emitted]); this.emitted++; }
      if (halt && halt.leg === this.leg && p >= halt.p) {
        this.legT = L.real * halt.p; this.phase = 'fault'; this.setActiveSoon();
        this.bPow.setDisabled(false); this.bPow.setLabel('⏻ Power on again');
        this.announce(this.f.nodimm ? 'Boot halted at memory training: no memory found. Three short beeps.' : 'Boot halted: no bootable device found.');
      } else if (p >= 1) {
        while (this.emitted < this.legScript.length) { this.queue.push(this.legScript[this.emitted]); this.emitted++; }
        this.real -= (this.legT - L.real);
        if (this.leg < LEGS.length - 1) { this.leg++; this.legT = 0; this.legScript = script(this.leg, this.f); this.emitted = 0; }
        else { this.legT = L.real; this.phase = 'done'; this.setActiveSoon(); this.bPow.setDisabled(false); this.bPow.setLabel('⏻ Power on again'); this.announce('Booted. The login prompt appeared after about 2 minutes of real time.'); }
      }
      if (!instant) this.sync();
    },
    setActiveSoon: function () { this._stopAt = this.time + 3; },
    update: function (dt) {
      this.step(dt);
      // typist: chars per second (animation time)
      this.typed += dt * (this.reduced() ? 1e5 : 260);
      this.flushTyping();
      if (this.phase !== 'run' && this._stopAt && this.time > this._stopAt && !this.queue.length) { this._stopAt = 0; if (this.phase === 'done') this.setActive(false); }
      this.sync();
    },
    flushTyping: function () {
      while (this.queue.length && this.typed > 0) {
        var q = this.queue[0];
        if (!q.started) { q.started = true; q.n = 0; this.lines.push(q); if (this.lines.length > 40) this.lines.shift(); }
        var need = q.s.length - q.n;
        if (this.typed >= need) { this.typed -= need; q.n = q.s.length; this.queue.shift(); }
        else { q.n += Math.floor(this.typed); this.typed -= Math.floor(this.typed); break; }
      }
      if (!this.queue.length) this.typed = Math.min(this.typed, 20);
    },
    sync: function () {
      if (!this.rT) return;
      var s = Math.round(this.real), m = Math.floor(s / 60);
      this.rT.set(m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60), this.phase === 'fault' ? 'bad' : this.phase === 'done' ? 'ok' : '');
      this.rLeg.set(this.phase === 'off' ? 'off' : this.phase === 'done' ? 'booted ✓' : (this.phase === 'fault' ? '✕ ' : '') + NAMES[this.leg], this.phase === 'fault' ? 'bad' : this.phase === 'done' ? 'ok' : '');
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      var pad = this.mobile ? 12 : 24;
      var tot = 0, ws = LEGS.map(function (L) { var x = 1 + Math.sqrt(L.real) * 0.6; tot += x; return x; });
      var x0 = pad + (this.mobile ? 4 : 10), x1 = w - pad - (this.mobile ? 4 : 10), acc = x0;
      this.legX = ws.map(function (x) { var a = acc; acc += (x1 - x0) * x / tot; return [a, acc]; });
      this.trackY = this.mobile ? 58 : Math.max(86, h * 0.2);
      var top = this.mobile ? this.trackY + 64 : this.trackY + 78;
      if (this.mobile) {
        var mid = top + (h - top) * 0.46;
        this.det = { x: pad, y: top, w: w - pad * 2, h: mid - top - 8 };
        this.term = { x: pad, y: mid, w: w - pad * 2, h: h - mid - pad };
      } else {
        var split = Math.round(w * 0.54);
        this.det = { x: pad, y: top, w: split - pad - 10, h: h - top - pad };
        this.term = { x: split + 10, y: top, w: w - split - 10 - pad, h: h - top - pad };
      }
    },
    icon: function (ctx, kind, x, y, s, col) {
      var P = S.pal;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      if (kind === 'power') { ctx.beginPath(); ctx.arc(x, y + 1, s * 0.32, -Math.PI * 0.32, Math.PI * 1.32); ctx.stroke(); D.line(ctx, x, y - s * 0.4, x, y - s * 0.02, col, 1.8); }
      else if (kind === 'bmc') { D.box(ctx, x - s * 0.32, y - s * 0.32, s * 0.64, s * 0.64, 2, null, col, 1.5); D.text(ctx, 'BMC', x, y + 0.5, { size: s * 0.24, weight: 800, color: col, align: 'center' }); }
      else if (kind === 'bolt') D.g.bolt(ctx, x, y, s * 0.85, col);
      else if (kind === 'cpu') { D.box(ctx, x - s * 0.28, y - s * 0.28, s * 0.56, s * 0.56, 2, null, col, 1.5); D.box(ctx, x - s * 0.12, y - s * 0.12, s * 0.24, s * 0.24, 1, col); for (var i = -1; i <= 1; i++) { D.line(ctx, x + i * s * 0.14, y - s * 0.42, x + i * s * 0.14, y - s * 0.3, col, 1.2); D.line(ctx, x + i * s * 0.14, y + s * 0.3, x + i * s * 0.14, y + s * 0.42, col, 1.2); } }
      else if (kind === 'dimm') { D.box(ctx, x - s * 0.42, y - s * 0.16, s * 0.84, s * 0.3, 1.5, null, col, 1.4); for (var j = 0; j < 4; j++) ctx.fillRect(x - s * 0.34 + j * s * 0.18, y - s * 0.08, s * 0.12, s * 0.12); }
      else if (kind === 'tree') { D.circle(ctx, x - s * 0.3, y, s * 0.08, col); [-0.3, 0, 0.3].forEach(function (k) { ctx.beginPath(); ctx.moveTo(x - s * 0.3, y); ctx.lineTo(x - s * 0.05, y); ctx.lineTo(x - s * 0.05, y + k * s); ctx.lineTo(x + s * 0.2, y + k * s); ctx.stroke(); D.circle(ctx, x + s * 0.28, y + k * s, s * 0.08, col); }); }
      else if (kind === 'rom') { D.box(ctx, x - s * 0.38, y - s * 0.26, s * 0.76, s * 0.52, 2, null, col, 1.4); ctx.fillRect(x - s * 0.38, y - s * 0.26, s * 0.76, s * 0.14); D.line(ctx, x - s * 0.26, y + s * 0.04, x + s * 0.2, y + s * 0.04, col, 1.2); D.line(ctx, x - s * 0.26, y + s * 0.15, x + s * 0.08, y + s * 0.15, col, 1.2); }
      else if (kind === 'disk') { D.box(ctx, x - s * 0.3, y - s * 0.36, s * 0.6, s * 0.72, 2, null, col, 1.4); D.circle(ctx, x, y - s * 0.04, s * 0.18, null, col, 1.4); D.circle(ctx, x, y - s * 0.04, s * 0.04, col); }
      else if (kind === 'loader') { D.box(ctx, x - s * 0.38, y - s * 0.28, s * 0.76, s * 0.56, 2, null, col, 1.4); ctx.beginPath(); ctx.moveTo(x - s * 0.2, y - s * 0.1); ctx.lineTo(x - s * 0.04, y + s * 0.02); ctx.lineTo(x - s * 0.2, y + s * 0.14); ctx.stroke(); D.line(ctx, x + s * 0.02, y + s * 0.14, x + s * 0.2, y + s * 0.14, col, 1.4); }
      else if (kind === 'kernel') D.g.gear(ctx, x, y, s * 0.8, col);
      ctx.lineCap = 'butt';

    },
    drawTrack: function (ctx) {
      var P = S.pal, self = this, ty = this.trackY, mob = this.mobile, t = this.time;
      var phase = this.phase, cur = this.leg;
      this.legX.forEach(function (X, i) {
        var done = phase === 'done' || (phase !== 'off' && i < cur), now = phase !== 'off' && i === cur && phase !== 'done';
        var fault = phase === 'fault' && i === cur;
        var col = fault ? P.fault : done ? P.ok : now ? P.accent : U.rgba(P.blueprint, 0.6);
        var a = X[0] + 3, b = X[1] - 3;
        if (done) D.line(ctx, a, ty, b, ty, P.ok, 4);
        else if (now) {
          var p = U.clamp(self.legT / LEGS[i].real, 0, 1), m = U.lerp(a, b, p);
          D.line(ctx, a, ty, b, ty, U.rgba(P.blueprint, 0.35), 4);
          D.line(ctx, a, ty, m, ty, fault ? P.fault : P.accent, 4);
          if (fault) { ctx.fillStyle = D.hatch(ctx, U.rgba(P.fault, 0.6), 4); ctx.fillRect(a, ty - 6, b - a, 12); }
        } else D.line(ctx, a, ty, b, ty, U.rgba(P.blueprint, 0.45), 2, [4, 4]);
        // station tick
        D.line(ctx, X[0], ty - 7, X[0], ty + 7, U.rgba(P.text3, 0.8), 1);
        if (i === LEGS.length - 1) D.line(ctx, X[1], ty - 7, X[1], ty + 7, U.rgba(P.text3, 0.8), 1);
        var cx = (X[0] + X[1]) / 2;
        if (!mob) {
          var gy = ty - 34, r = 15;
          D.circle(ctx, cx, gy, r, U.rgba(col, done || now ? 0.16 : 0.06), col, 1.3);
          self.icon(ctx, LEGS[i].icon, cx, gy, 26, col);
          var lc = done ? P.text2 : now ? P.text1 : P.text3;
          D.text(ctx, LEGS[i].lab[0], cx, ty + 17, { size: 9.5, weight: 700, color: lc, align: 'center' });
          D.text(ctx, LEGS[i].lab[1], cx, ty + 29, { size: 9.5, weight: 500, color: lc, align: 'center' });
          D.text(ctx, (LEGS[i].real < 1 ? '<1' : LEGS[i].real) + ' s', cx, ty + 43, { size: 9, weight: 600, color: i === 4 ? P.power : U.rgba(P.text3, 0.9), align: 'center' });
        } else {
          D.text(ctx, String(i + 1), cx, ty + 14, { size: 8.5, weight: 700, color: done ? P.ok : now ? col : P.text3, align: 'center' });
        }
      });
      if (!mob) D.dim(ctx, this.legX[4][0] + 4, ty + 56, this.legX[4][1] - 4, ty + 56, 'the long leg', { size: 9, color: P.power, bg: P.bg });
      // runner + baton
      var bx;
      if (phase === 'off') bx = this.legX[0][0];
      else if (phase === 'done') bx = this.legX[LEGS.length - 1][1];
      else { var X2 = this.legX[cur]; bx = U.lerp(X2[0] + 3, X2[1] - 3, U.clamp(this.legT / LEGS[cur].real, 0, 1)); }
      var running = phase === 'run', bob = running ? Math.abs(Math.sin(t * 12)) * 2 : 0, rc = phase === 'fault' ? P.fault : phase === 'done' ? P.ok : P.text1;
      var ps = mob ? 22 : 26;
      if (mob || true) {
        var py = mob ? ty - 18 : ty - 34;
        if (!mob) py = ty - 62;
        D.g.person(ctx, bx, py - bob, ps, rc, { arm: running ? Math.sin(t * 12) : phase === 'done' ? -1 : 0 });
      }
      var bc = phase === 'fault' ? P.fault : P.accent, blink = phase === 'fault' ? (Math.floor(t * 2) % 2 ? 1 : 0.25) : 1;
      ctx.globalAlpha = blink;
      D.box(ctx, bx - 7, ty - 3, 14, 6, 3, bc);
      D.glow(ctx, bx, ty, 18, bc, 0.8);
      ctx.globalAlpha = 1;
      // time-scale badge
      if (!mob) D.pill(ctx, '⏱ 1 s shown as ' + Math.round(1000 / this.speed) + ' ms', this.w - 24, 22, { color: P.text2, size: 9.5, align: 'right' });
      else D.text(ctx, '⏱ ' + this.speed + '× faster than real', this.w - 12, 16, { size: 8.5, color: P.text3, align: 'right' });
      if (mob) {
        var nm = phase === 'off' ? 'Press Power on' : phase === 'done' ? 'Booted ✓' : (phase === 'fault' ? '✕ Halted: ' : (cur + 1) + '/10 · ') + NAMES[cur];
        D.text(ctx, nm, 12, ty + 36, { size: 12, weight: 700, color: phase === 'fault' ? P.fault : phase === 'done' ? P.ok : P.text1 });
      }
    },
    panel: function (ctx, R, title) {
      var P = S.pal;
      D.box(ctx, R.x, R.y, R.w, R.h, 10, U.rgba(P.panel, 0.65), U.rgba(P.blueprint, 0.3), 1);
      if (title) D.text(ctx, title, R.x + 12, R.y + 14, { size: 9.5, weight: 700, color: P.text3, ls: 1 });
    },
    drawDetail: function (ctx) {
      var P = S.pal, R = this.det, t = this.time, mob = this.mobile, f = this.f;
      var leg = this.phase === 'off' ? -1 : this.phase === 'done' ? 10 : this.leg;
      var p = leg >= 0 && leg < 10 ? U.clamp(this.legT / LEGS[leg].real, 0, 1) : 1;
      var title = leg < 0 ? 'STANDBY' : leg >= 10 ? 'READY' : NAMES[leg].toUpperCase();
      this.panel(ctx, R, mob ? null : title);
      var x = R.x + 14, y = R.y + (mob ? 10 : 28), w = R.w - 28, h = R.h - (mob ? 20 : 40), cx = x + w / 2, cy = y + h / 2, fs = mob ? 9 : 10.5;
      var fault = this.phase === 'fault';
      if (leg < 0) {
        this.icon(ctx, 'power', cx, cy - 8, 48, U.rgba(P.text3, 0.9));
        D.led(ctx, cx + 40, cy - 30, P.mgmt, 'heartbeat', t, 3);
        D.text(ctx, 'Off · only the BMC is awake on standby power', cx, cy + 34, { size: fs, color: P.text2, align: 'center' });
        return;
      }
      if (leg <= 3) {
        var k = leg, ic = LEGS[k].icon, col = k === 1 ? P.mgmt : k === 2 ? P.power : P.accent;
        var ring = (t * 1.2) % 1;
        D.circle(ctx, cx, cy - 10, 30 + ring * 30, null, U.rgba(col, 1 - ring), 1.5);
        D.circle(ctx, cx, cy - 10, 30, U.rgba(col, 0.12), col, 1.5);
        this.icon(ctx, ic, cx, cy - 10, 44, col);
        var msg = ['You press the button; the BMC hears it', 'BMC (always on) starts the power sequence', 'Both PSUs report clean power: PWR_OK', 'CPUs leave reset and load microcode'][k];
        D.text(ctx, msg, cx, cy + 46, { size: fs, weight: 600, color: P.text1, align: 'center' });
        if (k === 2) { D.flow(ctx, [cx - w * 0.4, cy - 10, cx - 34, cy - 10], P.power, t, { width: 2 }); D.flow(ctx, [cx + 34, cy - 10, cx + w * 0.4, cy - 10], P.power, t, { width: 2 }); D.led(ctx, cx + w * 0.4 + 8, cy - 10, p > 0.8 ? P.ok : P.warn, 'solid', t, 3); }
        return;
      }
      if (leg === 4) {
        // memory channels scanned one by one
        var rows = 8, rh = h / rows, lw = mob ? 30 : 40, sw = Math.min(w * 0.42, 220), ex = x + lw + sw + 16, ew = Math.min(70, w - (ex - x) - 40);
        for (var i = 0; i < rows; i++) {
          var ry = y + i * rh + rh / 2, a0 = 0.03 + i * 0.115, a1 = a0 + 0.115;
          var st = f.nodimm ? (p > 0.25 ? 'fail' : p > i * 0.03 ? 'scan' : 'wait') : (p >= a1 ? 'ok' : p >= a0 ? 'scan' : 'wait');
          if (this.phase === 'done' || leg < this.leg) st = 'ok';
          D.text(ctx, 'CH ' + CH[i], x, ry, { size: fs, weight: 700, color: st === 'ok' ? P.ok : st === 'scan' ? P.accent : st === 'fail' ? P.fault : P.text3 });
          var sx = x + lw, sh = Math.min(rh * 0.62, 18);
          if (f.nodimm) {
            ctx.setLineDash([3, 3]); D.box(ctx, sx, ry - sh / 2, sw, sh, 2, null, U.rgba(st === 'fail' ? P.fault : P.text3, 0.8), 1); ctx.setLineDash([]);
            D.text(ctx, 'empty slot', sx + sw / 2, ry, { size: fs - 1, color: st === 'fail' ? P.fault : P.text3, align: 'center' });
          } else {
            D.box(ctx, sx, ry - sh / 2, sw, sh, 2, U.mix(P.pcb, P.bg, 0.2), U.rgba(P.alu, 0.35), 1);
            ctx.fillStyle = P.silicon; for (var c = 0; c < 8; c++) ctx.fillRect(sx + 6 + c * (sw - 12) / 8, ry - sh / 2 + 3, (sw - 12) / 8 - 4, sh - 7);
            ctx.fillStyle = P.gold; ctx.fillRect(sx + 4, ry + sh / 2 - 2, sw - 8, 2);
            if (st === 'scan') {
              var q = (p - a0) / (a1 - a0), lx = sx + sw * ((q * 3) % 1);
              D.line(ctx, lx, ry - sh / 2 - 2, lx, ry + sh / 2 + 2, P.accent, 2); D.glow(ctx, lx, ry, 14, P.accent, 0.6);
            }
          }
          // eye diagram
          if (!mob || ew > 30) {
            var eh = Math.min(rh * 0.7, 20), ey = ry;
            D.box(ctx, ex, ey - eh / 2, ew, eh, 2, U.rgba(P.bg0, 0.8), U.rgba(P.blueprint, 0.3), 1);
            if (st !== 'wait' && !f.nodimm) {
              var open = st === 'ok' ? 1 : U.clamp((p - a0) / (a1 - a0), 0, 1);
              ctx.strokeStyle = U.rgba(st === 'ok' ? P.ok : P.data, 0.7); ctx.lineWidth = 1; ctx.beginPath();
              for (var tr = 0; tr < 6; tr++) {
                var j = (1 - open) * (U.hash(tr, i) - 0.5) * eh * 0.9, s1 = tr % 2 ? 1 : -1;
                ctx.moveTo(ex + 2, ey + s1 * eh * 0.36 + j);
                ctx.bezierCurveTo(ex + ew * 0.35, ey + s1 * eh * 0.36 + j, ex + ew * 0.4, ey - s1 * eh * 0.36 - j, ex + ew / 2, ey - s1 * eh * 0.36 - j * 0.5);
                ctx.bezierCurveTo(ex + ew * 0.6, ey - s1 * eh * 0.36, ex + ew * 0.65, ey + s1 * eh * 0.36, ex + ew - 2, ey + s1 * eh * 0.36 + j);
              }
              ctx.stroke();
            }
          }
          var gx = ex + ew + 14;
          if (st === 'ok') D.g.check(ctx, gx, ry, 14, P.ok);
          else if (st === 'fail') { if (Math.floor(t * 2) % 2) D.g.cross(ctx, gx, ry, 14, P.fault); }
        }
        if (!mob) D.text(ctx, 'eye', ex + ew / 2, y - 10, { size: 8.5, color: P.text3, align: 'center' });
        if (f.nodimm && p > 0.3) {
          // beep code glyph
          var bxp = x + w - 46, byp = y + h * 0.5, beat = (t % 1.6) / 1.6, on = beat < 0.6 && (beat * 5) % 1 < 0.6;
          D.box(ctx, bxp - 60, byp - 52, 104, 104, 10, U.rgba(P.panel, 0.96), P.fault, 1.5);
          ctx.fillStyle = P.text1; D.poly(ctx, [bxp - 30, byp - 18, bxp - 20, byp - 18, bxp - 6, byp - 30, bxp - 6, byp + 6, bxp - 20, byp - 6, bxp - 30, byp - 6]); ctx.fill();
          if (on) for (var a = 1; a <= 3; a++) { ctx.beginPath(); ctx.arc(bxp - 4, byp - 12, a * 7, -0.7, 0.7); ctx.strokeStyle = P.fault; ctx.lineWidth = 2; ctx.stroke(); }
          for (var bb = 0; bb < 3; bb++) D.circle(ctx, bxp - 26 + bb * 14, byp + 24, 4, beat < 0.6 && Math.floor(beat * 5) >= bb ? P.fault : U.rgba(P.fault, 0.25));
          D.text(ctx, '3 short beeps', bxp - 8, byp + 40, { size: 9, weight: 700, color: P.fault, align: 'center' });
        }
        return;
      }
      if (leg === 5) {
        var nodes = [['CPU root complex', 0], ['NVMe SSD 960 GB', 0.25, 'nv'], ['NVMe SSD 960 GB', 0.4, 'nv'], ['RAID / HBA controller', 0.55], ['25 GbE NIC', 0.7], ['BMC VGA', 0.85]];
        var rx = x + 6, rw = Math.min(150, w * 0.36), nx = x + w * 0.46, nw = Math.min(w * 0.5, 210), kids = nodes.length - 1, nh = Math.min(26, h / kids - 6);
        var showP = leg < this.leg || this.phase === 'done' ? 1 : p;
        D.box(ctx, rx, cy - 15, rw, 30, 6, U.rgba(P.accent, 0.12), P.accent, 1.3);
        D.text(ctx, mob ? 'CPU root' : 'CPU root complex', rx + rw / 2, cy, { size: fs, weight: 700, color: P.text1, align: 'center' });
        for (var n = 1; n < nodes.length; n++) {
          var nd = nodes[n], k2 = U.clamp((showP - nd[1]) / 0.08, 0, 1);
          if (k2 <= 0) continue;
          var ny = y + (n - 0.5) * (h / kids), missing = nd[2] === 'nv' && f.noboot;
          ctx.globalAlpha = k2;
          var mx2 = (rx + rw + nx) / 2;
          ctx.beginPath(); ctx.moveTo(rx + rw, cy); ctx.lineTo(mx2, cy); ctx.lineTo(mx2, ny); ctx.lineTo(nx, ny);
          ctx.strokeStyle = missing ? U.rgba(P.text3, 0.6) : P.data; ctx.lineWidth = 1.3; if (missing) ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
          D.box(ctx, nx + (1 - k2) * 20, ny - nh / 2, nw, nh, 5, missing ? null : U.rgba(P.data, 0.1), missing ? U.rgba(P.text3, 0.7) : P.data, 1);
          D.text(ctx, missing ? '(empty bay)' : nd[0], nx + 10 + (1 - k2) * 20, ny, { size: fs - 0.5, weight: 600, color: missing ? P.text3 : P.text1 });
          ctx.globalAlpha = 1;
        }
        return;
      }
      if (leg === 6) {
        var bh = Math.min(h * 0.4, 72), bw2 = Math.min(w, 340);
        [['RAID CONTROLLER BIOS v7.27', 'Press <Ctrl+R> to configure', 0.05], ['NETWORK BOOT AGENT (PXE) v1.5', 'Press <Ctrl+S> for setup', 0.55]].forEach(function (B, i2) {
          var k3 = U.clamp((((leg < this.leg || this.phase === 'done') ? 1 : p) - B[2]) / 0.12, 0, 1);
          if (k3 <= 0) return;
          var by2 = y + i2 * (bh + 12) + 4, bx2 = cx - bw2 / 2 + (1 - U.ease.outCubic(k3)) * 40;
          ctx.globalAlpha = k3;
          D.box(ctx, bx2, by2, bw2, bh, 6, U.rgba(P.bg0, 0.9), i2 ? P.net : P.data, 1.3);
          ctx.fillStyle = U.rgba(i2 ? P.net : P.data, 0.85); ctx.fillRect(bx2 + 1, by2 + 1, bw2 - 2, 20);
          D.text(ctx, B[0], bx2 + 10, by2 + 11, { size: fs - 0.5, weight: 800, color: P.bg });
          D.text(ctx, B[1], bx2 + 10, by2 + 20 + (bh - 20) / 2, { size: fs, color: P.text1 });
          ctx.globalAlpha = 1;
        }, this);
        return;
      }
      if (leg === 7) {
        var opts = ['NVMe mirror (UEFI)', 'USB stick', 'Network (PXE)'], lh = Math.min(30, (h - 30 - (f.noboot ? 34 : 0)) / 3);
        var tried = f.noboot ? Math.floor(U.clamp((p - 0.1) / 0.2, 0, 3)) : 0;
        D.text(ctx, 'Boot order', x + 6, y + 8, { size: fs, weight: 700, color: P.text2 });
        opts.forEach(function (o, i3) {
          var oy = y + 26 + i3 * lh, sel = f.noboot ? i3 === Math.min(2, tried) && p < 0.7 : i3 === 0;
          var bad = f.noboot && (i3 < tried || p >= 0.7);
          D.box(ctx, x + 6, oy, Math.min(w - 12, 300), lh - 6, 5, sel ? U.rgba(P.accent, 0.12) : null, sel ? P.accent : U.rgba(P.text3, 0.5), 1);
          D.text(ctx, (i3 + 1) + '. ' + o, x + 16, oy + (lh - 6) / 2, { size: fs, weight: 600, color: bad ? P.text3 : P.text1 });
          var gx2 = x + Math.min(w - 12, 300) - 10;
          if (bad) D.g.cross(ctx, gx2, oy + (lh - 6) / 2, 13, P.fault);
          else if (!f.noboot && i3 === 0 && p > 0.6) D.g.check(ctx, gx2, oy + (lh - 6) / 2, 13, P.ok);
        });
        if (fault) {
          var fy = y + 26 + 3 * lh + 8, fl = Math.floor(t * 2) % 2;
          D.box(ctx, x + 6, fy, Math.min(w - 12, 300), 28, 5, U.rgba(P.fault, fl ? 0.18 : 0.08), P.fault, 1.3);
          D.text(ctx, 'No bootable device', x + 16, fy + 14, { size: fs + 0.5, weight: 800, color: P.fault });
        }
        return;
      }
      if (leg === 8) {
        var mw = Math.min(w, 330), mx3 = cx - mw / 2, my = y + 6, mh = Math.min(h - 12, 130);
        D.box(ctx, mx3, my, mw, mh, 6, U.rgba(P.bg0, 0.92), U.rgba(P.text2, 0.6), 1);
        D.text(ctx, 'GRUB 2.12', mx3 + mw / 2, my + 14, { size: fs, weight: 700, color: P.text2, align: 'center' });
        ['Ubuntu Server 24.04', 'Advanced options', 'UEFI firmware settings'].forEach(function (o, i4) {
          var oy = my + 32 + i4 * 20;
          if (i4 === 0) { ctx.fillStyle = U.rgba(P.text1, 0.9); ctx.fillRect(mx3 + 10, oy - 9, mw - 20, 18); }
          D.text(ctx, (i4 === 0 ? '*' : ' ') + o, mx3 + 16, oy, { size: fs, weight: 600, color: i4 === 0 ? P.bg : P.text2 });
        });
        D.text(ctx, 'booting in ' + Math.max(0, Math.ceil(3 * (1 - p))) + 's…', mx3 + mw / 2, my + mh - 12, { size: fs - 0.5, color: P.text3, align: 'center' });
        return;
      }
      // kernel / ready
      var kp = leg >= 10 ? 1 : p;
      D.g.gear(ctx, cx - 70, cy - 6, 44, U.rgba(P.ok, 0.85));
      D.meter(ctx, cx - 30, cy - 12, Math.min(160, w * 0.4), 8, kp, P.ok);
      D.text(ctx, leg >= 10 ? 'Ready — log in over SSH' : 'Kernel loading drivers…', cx - 30, cy + 12, { size: fs + 1, weight: 700, color: leg >= 10 ? P.ok : P.text1 });
      if (leg >= 10) D.text(ctx, 'first boot ≈ 2 min · later boots are faster', cx - 30, cy + 30, { size: fs - 0.5, color: P.text3 });
    },
    drawTerm: function (ctx) {
      var P = S.pal, R = this.term, mob = this.mobile;
      D.box(ctx, R.x, R.y, R.w, R.h, 10, U.rgba(P.bg0, 0.92), U.rgba(P.blueprint, 0.3), 1);
      D.circle(ctx, R.x + 14, R.y + 12, 3.5, U.rgba(P.fault, 0.7)); D.circle(ctx, R.x + 26, R.y + 12, 3.5, U.rgba(P.warn, 0.7)); D.circle(ctx, R.x + 38, R.y + 12, 3.5, U.rgba(P.ok, 0.7));
      D.text(ctx, 'POST · serial console', R.x + R.w - 12, R.y + 12, { size: 9, weight: 600, color: P.text3, align: 'right' });
      var fs = mob ? 9.5 : 11, lh = fs * 1.55, top = R.y + 30, maxL = Math.max(1, Math.floor((R.h - 38) / lh));
      var L = this.lines, s0 = Math.max(0, L.length - maxL);
      ctx.save(); ctx.beginPath(); ctx.rect(R.x + 4, R.y + 22, R.w - 8, R.h - 26); ctx.clip();
      for (var i = s0; i < L.length; i++) {
        var q = L[i], col = q.c === 'fault' ? P.fault : q.c === 'warn' ? P.warn : q.c === 'text' ? P.text2 : q.c === 'text1' ? P.text1 : P.ok;
        D.text(ctx, q.s.slice(0, q.n), R.x + 12, top + (i - s0) * lh + lh / 2, { size: fs, weight: 500, color: col });
      }
      // cursor
      var last = L[L.length - 1], cyy = top + (Math.max(0, L.length - 1 - s0)) * lh + lh / 2;
      if (Math.floor(this.time * 2) % 2 || this.phase === 'run') {
        var cxp = R.x + 12 + (last ? D.measure(ctx, last.s.slice(0, last.n), fs, 500) + 2 : 0);
        if (!last) cyy = top + lh / 2;
        ctx.fillStyle = P.ok; ctx.fillRect(cxp, cyy - fs * 0.5, fs * 0.55, fs);
      }
      ctx.restore();
      if (!L.length) D.text(ctx, 'waiting for power…', R.x + 24, top + lh / 2, { size: fs, color: P.text3 });
    },
    draw: function () {
      var ctx = this.ctx;
      D.clear(ctx, this.w, this.h);
      if (!this.legX) return;
      this.drawTrack(ctx);
      this.drawDetail(ctx);
      this.drawTerm(ctx);
      var d = this.phase === 'off' ? 'Server is off. Press Power on to start the boot relay.' :
        this.phase === 'done' ? 'Boot finished: all ten stages passed and the login prompt is shown.' :
        this.phase === 'fault' ? 'Boot halted at ' + NAMES[this.leg] + (this.f.nodimm ? ': no memory found, three short beeps.' : ': no bootable device.') :
        'Stage ' + (this.leg + 1) + ' of 10: ' + NAMES[this.leg] + '.';
      this.setDesc(d);
    }
  });
})(window.SRV);
