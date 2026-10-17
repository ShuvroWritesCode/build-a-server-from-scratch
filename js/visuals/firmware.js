/* Ch16 · Firmware stack + RAID vs HBA. Five bricks (BMC → BIOS → storage controller → NIC → drives)
   reflash bottom-up in the recommended order with progress fill, check and reboot glyphs. Beside it,
   the storage controller in RAID mode hides the drives behind ONE virtual disk; in HBA mode it passes
   all 8 raw disks through so ZFS can checksum and heal them. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var BRICKS = [
    { name: 'BMC', sub: 'management controller', from: '2.84', to: '3.10', reboot: 'bmc', note: 'first: it runs the other updates' },
    { name: 'BIOS / UEFI', sub: 'system firmware', from: '1.6.2', to: '2.3.1', reboot: 'host', note: 'host reboot' },
    { name: 'Storage controller', sub: 'RAID / HBA card', from: '51.14', to: '52.26', reboot: 'host', note: 'host reboot' },
    { name: 'Network card', sub: '25 GbE NIC', from: '21.5', to: '22.31', reboot: 'host', note: 'host reboot' },
    { name: 'Drives ×8', sub: 'SSD / HDD firmware', from: '2.1', to: '2.4', reboot: 'cycle', note: 'power-cycle' }
  ];
  var DUR = 1.5, RB = 0.6; // seconds per brick flash, reboot spin

  S.defineVisual('firmware', {
    onVisible: function () { this.setActive(this.updating || !this.reduced()); },
    onMotion: function () { this.setActive(this.updating || !this.reduced()); this.invalidate(); },
    init: function () {
      this.ctx = this.layer();
      this.mode = 'raid'; this.mk = 0; // 0 = RAID, 1 = HBA
      this.resetFw();
      var self = this;
      var g = this.ui.group('Firmware');
      this.bUp = g.button('▶ Update all in order', function () { self.startUpdate(); }, { kind: 'primary' });
      g.button('↺ Old versions', function () { self.resetFw(); self.announce('Firmware set back to old versions.'); });
      this.ui.seg({ label: 'Controller mode', options: [['raid', 'RAID mode'], ['hba', 'HBA mode (for ZFS)']], value: 'raid', onChange: function (v) { self.setMode(v); } });
      this.ui.spacer();
      this.rFw = this.ui.readout('Updated', '0 / 5');
      this.rOs = this.ui.readout('OS sees', '1 disk');
    },
    resetFw: function () {
      this.fw = BRICKS.map(function () { return { p: 0, rb: 0, done: false }; });
      this.cur = -1; this.updating = false;
      if (this.bUp) { this.bUp.setDisabled(false); this.bUp.setLabel('▶ Update all in order'); }
      this.syncR(); this.invalidate();
    },
    startUpdate: function () {
      if (this.updating) return;
      if (this.fw[4].done) this.resetFw();
      this.updating = true; this.cur = 0; this.bUp.setDisabled(true);
      this.announce('Updating firmware in order: BMC first, then BIOS, storage controller, network card and drives.');
      if (this.reduced()) { this.fw.forEach(function (f) { f.p = 1; f.rb = 1; f.done = true; }); this.finishUpdate(); return; }
      this.setActive(true);
    },
    finishUpdate: function () {
      this.updating = false; this.cur = -1; this.setActive(!this.reduced());
      this.bUp.setDisabled(false); this.bUp.setLabel('✓ All up to date');
      this.announce('All five firmware updates done, in the right order.');
      this.syncR();
    },
    setMode: function (m) {
      var self = this; this.mode = m;
      this.tween({ from: this.mk, to: m === 'hba' ? 1 : 0, dur: 0.8, ease: 'inOutSine', onUpdate: function (v) { self.mk = v; } });
      this.announce(m === 'hba' ? 'HBA mode: the operating system sees all 8 raw disks; ZFS builds its own pool and can checksum and repair every disk.' :
        'RAID mode: the controller hides the 8 drives and shows the operating system one virtual disk. Never put ZFS on top of this.');
      this.syncR();
    },
    syncR: function () {
      if (!this.rFw) return;
      var n = this.fw.filter(function (f) { return f.done; }).length;
      this.rFw.set(n + ' / 5', n === 5 ? 'ok' : n ? 'warn' : '');
      this.rOs.set(this.mode === 'hba' ? '8 disks → ZFS' : '1 virtual disk', this.mode === 'hba' ? 'ok' : '');
    },
    update: function (dt) {
      if (!this.updating || this.cur < 0) return;
      var f = this.fw[this.cur], b = BRICKS[this.cur];
      if (f.p < 1) { f.p = Math.min(1, f.p + dt / DUR); }
      else if (f.rb < 1) { f.rb = Math.min(1, f.rb + dt / RB); }
      if (f.p >= 1 && f.rb >= 1 && !f.done) {
        f.done = true; this.syncR();
        this.announce(b.name + ' updated to ' + b.to + '.');
        if (this.cur < 4) this.cur++; else this.finishUpdate();
      }
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      var pad = this.mobile ? 12 : 24;
      if (this.mobile) {
        var mid = Math.round(h * 0.5);
        this.L = { x: pad, y: 8, w: w - pad * 2, h: mid - 12 };
        this.R = { x: pad, y: mid + 4, w: w - pad * 2, h: h - mid - 12 };
      } else {
        var sp = Math.round(w * 0.46);
        this.L = { x: pad, y: 14, w: sp - pad - 12, h: h - 28 };
        this.R = { x: sp + 12, y: 14, w: w - sp - 12 - pad, h: h - 28 };
      }
    },
    reboot: function (ctx, x, y, r, col, spin) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(spin * Math.PI * 2);
      ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI * 0.35, Math.PI * 1.35); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
      var a = -Math.PI * 0.35, ex = Math.cos(a) * r, ey = Math.sin(a) * r;
      D.poly(ctx, [ex + 3.5, ey - 1, ex - 2, ey - 3.5, ex - 0.5, ey + 3]); ctx.fillStyle = col; ctx.fill();
      ctx.restore();
    },
    drawStack: function (ctx) {
      var P = S.pal, R = this.L, mob = this.mobile;
      D.text(ctx, 'FIRMWARE STACK', R.x, R.y + 8, { size: mob ? 9.5 : 10.5, weight: 700, color: P.text3, ls: 1.2 });
      D.text(ctx, 'update bottom → top', R.x + R.w, R.y + 8, { size: mob ? 9 : 10, weight: 600, color: P.accent, align: 'right' });
      var top = R.y + 24, dep = mob ? 8 : 12, gap = mob ? 4 : 7;
      var bh = (R.h - (top - R.y) - dep - gap * 4) / 5, bw = R.w - dep - 4, x = R.x;
      for (var i = 0; i < 5; i++) {
        var b = BRICKS[i], f = this.fw[i], y = top + dep + (4 - i) * (bh + gap);
        var active = this.cur === i && this.updating, base = f.done ? U.mix(P.panel2, P.ok, 0.12) : P.panel2;
        // oblique top + side
        D.poly(ctx, [x, y, x + dep, y - dep, x + bw + dep, y - dep, x + bw, y]); ctx.fillStyle = U.shade(base, P.dark ? 0.12 : 0.06); ctx.fill();
        D.poly(ctx, [x + bw, y, x + bw + dep, y - dep, x + bw + dep, y + bh - dep, x + bw, y + bh]); ctx.fillStyle = U.shade(base, -0.25); ctx.fill();
        D.box(ctx, x, y, bw, bh, 2, base, active ? P.accent : f.done ? U.rgba(P.ok, 0.7) : U.rgba(P.blueprint, 0.45), active ? 1.6 : 1);
        // progress fill
        if (f.p > 0 && !f.done) {
          var col = f.p < 0.45 ? P.data : P.power;
          ctx.fillStyle = U.rgba(col, 0.18); ctx.fillRect(x + 1, y + 1, (bw - 2) * f.p, bh - 2);
          D.line(ctx, x + (bw - 2) * f.p, y + 1, x + (bw - 2) * f.p, y + bh - 1, col, 2);
        }
        // number
        var cy = y + bh / 2, nr = Math.min(11, bh * 0.3), fs = mob ? 10 : 12;
        D.circle(ctx, x + 10 + nr, cy, nr, f.done ? P.ok : active ? P.accent : U.rgba(P.text3, 0.25));
        D.text(ctx, String(i + 1), x + 10 + nr, cy + 0.5, { size: nr * 1.1, weight: 800, color: f.done || active ? P.bg : P.text2, align: 'center' });
        var tx = x + 18 + nr * 2;
        D.text(ctx, b.name, tx, cy - (bh > 34 ? 7 : 0), { size: fs, weight: 700, color: P.text1 });
        if (bh > 34) D.text(ctx, active ? (f.p < 0.45 ? 'uploading…' : f.p < 1 ? 'flashing · do not power off' : 'rebooting…') : f.done ? b.note : b.sub, tx, cy + 8, { size: mob ? 8.5 : 9.5, color: active ? (f.p < 0.45 ? P.data : P.power) : P.text3 });
        // drive tiles in brick 5
        if (i === 4 && !mob) {
          var dx0 = tx + 112, dw = 9;
          for (var k = 0; k < 8; k++) {
            var on = f.done || (active && f.p > (k + 1) / 9);
            D.box(ctx, dx0 + k * (dw + 3), cy - 7, dw, 14, 1.5, on ? U.rgba(P.ok, 0.6) : U.rgba(P.text3, 0.25), null);
          }
        }
        // version badge
        var vx = x + bw - (mob ? 34 : 46), vs = mob ? 9 : 10.5;
        var newV = f.done, vtxt = newV ? 'v' + b.to : 'v' + b.from;
        D.pill(ctx, vtxt, vx, cy, { size: vs, color: newV ? P.ok : P.text2, align: 'right', bg: U.rgba(P.bg, 0.7) });
        if (!mob && !newV) D.text(ctx, '→ v' + b.to, vx - D.measure(ctx, vtxt, vs, 600) - 20, cy, { size: 9, color: P.text3, align: 'right' });
        // check / reboot glyph
        var gx = x + bw - (mob ? 17 : 22);
        if (f.done) D.g.check(ctx, gx, cy, 16, P.ok);
        else if (active && f.p >= 1) this.reboot(ctx, gx, cy, 7, b.reboot === 'bmc' ? P.mgmt : P.warn, f.rb);
        else this.reboot(ctx, gx, cy, 6, U.rgba(b.reboot === 'bmc' ? P.mgmt : P.text3, 0.7), 0);
      }
    },
    drawModes: function (ctx) {
      var P = S.pal, R = this.R, mob = this.mobile, k = this.mk, t = this.time, i;
      var hba = k > 0.5;
      D.box(ctx, R.x, R.y, R.w, R.h, 10, U.rgba(P.panel, 0.55), U.rgba(P.blueprint, 0.3), 1);
      D.text(ctx, hba ? 'HBA MODE · pass-through' : 'RAID MODE · controller hides drives', R.x + 12, R.y + 14, { size: mob ? 9.5 : 10.5, weight: 700, color: hba ? P.ok : P.text2, ls: 0.8 });
      var cx = R.x + R.w / 2, pad = 14;
      var osY = R.y + (mob ? 30 : 36), osH = mob ? 54 : 64, osW = R.w - pad * 2;
      var bot = R.y + R.h - (mob ? 40 : 42);
      var drY = bot - (mob ? 28 : 36), drH = mob ? 26 : 34;
      var ctY = (osY + osH + drY) / 2 - 12, ctH = mob ? 22 : 26, ctW = Math.min(R.w * 0.5, 220);
      // drives
      var n = 8, dgap = mob ? 5 : 8, dW = Math.min(30, (osW - dgap * 7) / 8), span = n * dW + (n - 1) * dgap, dx0 = cx - span / 2;
      var drives = [];
      for (i = 0; i < n; i++) drives.push(dx0 + i * (dW + dgap) + dW / 2);
      // OS disk targets
      var sdW = Math.min(36, (osW - 40) / 8 - 6), tgt = [];
      for (i = 0; i < n; i++) {
        var hx = cx - (n * (sdW + 6) - 6) / 2 + i * (sdW + 6) + sdW / 2;
        tgt.push(U.lerp(cx, hx, k));
      }
      // lines + beads (behind)
      var osBot = osY + osH;
      for (i = 0; i < n; i++) {
        var pts = [drives[i], drY, drives[i], ctY + ctH + 6, U.lerp(cx, drives[i], k), ctY + ctH, U.lerp(cx, drives[i], k), ctY, tgt[i], osBot + 2];
        D.poly(ctx, pts, false); ctx.strokeStyle = U.rgba(P.data, 0.35 + 0.25 * k); ctx.lineWidth = 1.3; ctx.stroke();
        var lens = D.polyLen(pts), tot = lens[lens.length - 1], o = {};
        D.along(pts, lens, tot * ((t * 0.45 + i * 0.13) % 1), o); D.circle(ctx, o.x, o.y, 2.4, P.data);
      }
      if (k < 0.5) { D.line(ctx, cx, ctY, cx, osBot + 2, P.data, 4 * (1 - k * 2) + 1.3); }
      // controller
      D.box(ctx, cx - ctW / 2, ctY, ctW, ctH, 4, U.mix(P.pcb, P.bg, 0.2), hba ? P.ok : P.blueprint, 1.2);
      D.text(ctx, hba ? 'HBA · just passes disks through' : 'RAID controller · cache + battery', cx, ctY + ctH / 2, { size: mob ? 8.5 : 9.5, weight: 700, color: P.text1, align: 'center' });
      // drives
      if (k < 0.99) {
        ctx.globalAlpha = 1 - k;
        ctx.setLineDash([4, 3]);
        D.box(ctx, dx0 - 8, drY - 8, span + 16, drH + 16, 6, U.rgba(P.blueprint, 0.06), P.blueprint, 1);
        ctx.setLineDash([]);
        D.text(ctx, 'RAID 6 array · hidden from the OS', cx, drY + drH + (mob ? 13 : 17), { size: mob ? 8.5 : 9.5, weight: 600, color: P.blueprint, align: 'center' });
        ctx.globalAlpha = 1;
      }
      if (k > 0.01) { ctx.globalAlpha = k; D.text(ctx, '8 raw disks, each visible', cx, drY + drH + (mob ? 13 : 17), { size: mob ? 8.5 : 9.5, weight: 600, color: P.ok, align: 'center' }); ctx.globalAlpha = 1; }
      for (i = 0; i < n; i++) {
        var x = drives[i] - dW / 2;
        D.box(ctx, x, drY, dW, drH, 3, P.steel, U.shade(P.steel, 0.3), 1);
        D.led(ctx, x + dW / 2, drY + drH - 6, P.ok, 'activity', t + i, 1.8);
        D.text(ctx, '6T', x + dW / 2, drY + 9, { size: 8, weight: 700, color: P.text2, align: 'center' });
      }
      // OS box
      D.box(ctx, cx - osW / 2, osY, osW, osH, 6, U.rgba(P.bg0, 0.7), U.rgba(P.text2, 0.5), 1);
      D.text(ctx, 'WHAT THE OS SEES', cx - osW / 2 + 10, osY + 11, { size: 8.5, weight: 700, color: P.text3, ls: 1 });
      var rowY = osY + osH / 2 + 6;
      if (k < 0.99) {
        ctx.globalAlpha = 1 - k;
        D.g.disc(ctx, cx - 50, rowY, 26, P.alu);
        D.text(ctx, '/dev/sda', cx - 30, rowY - 7, { size: mob ? 10 : 11, weight: 700, color: P.text1 });
        D.text(ctx, '1 virtual disk · 36 TB', cx - 30, rowY + 8, { size: mob ? 8.5 : 9.5, color: P.text2 });
        ctx.globalAlpha = 1;
      }
      if (k > 0.01) {
        ctx.globalAlpha = k;
        var gw = n * (sdW + 6) + 6;
        D.box(ctx, cx - gw / 2, rowY - 16, gw, 32, 5, U.rgba(P.ok, 0.08), U.rgba(P.ok, 0.7), 1);
        for (i = 0; i < n; i++) { D.g.disc(ctx, tgt[i], rowY - 3, Math.min(18, sdW), P.alu); D.text(ctx, 'sd' + 'abcdefgh'[i], tgt[i], rowY + 10, { size: 7.5, weight: 600, color: P.text2, align: 'center' }); }
        D.pill(ctx, 'ZFS pool · raidz2', cx + osW / 2 - 10, osY + 11, { size: 8.5, color: P.ok, align: 'right' });
        ctx.globalAlpha = 1;
      }
      // verdict
      var vy = R.y + R.h - 13, vs = mob ? 9 : 10;
      if (!hba) { D.g.warn(ctx, R.x + 18, vy, 13, P.warn); D.text(ctx, mob ? 'Never put ZFS on top of hardware RAID' : 'Never put ZFS on top of hardware RAID — it can’t see or heal the real disks', R.x + 30, vy, { size: vs, weight: 700, color: P.warn }); }
      else { D.g.check(ctx, R.x + 18, vy, 13, P.ok); D.text(ctx, mob ? 'ZFS checksums and heals every disk' : 'ZFS sees every disk: checksums every block and self-heals', R.x + 30, vy, { size: vs, weight: 700, color: P.ok }); }
    },
    draw: function () {
      var ctx = this.ctx;
      D.clear(ctx, this.w, this.h);
      if (!this.L) return;
      this.drawStack(ctx);
      this.drawModes(ctx);
      var n = this.fw.filter(function (f) { return f.done; }).length;
      this.setDesc(n + ' of 5 firmware parts updated' + (this.updating ? ', now flashing ' + BRICKS[this.cur].name : '') + '. Storage controller in ' +
        (this.mode === 'hba' ? 'HBA mode: the OS sees 8 raw disks in a ZFS pool.' : 'RAID mode: the OS sees one virtual disk.'));
    }
  });
})(window.SRV);
