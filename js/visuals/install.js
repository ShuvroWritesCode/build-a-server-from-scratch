/* Ch17 · Install path. The ISO travels from a laptop by USB stick into the front port, or over the
   blue management network into the BMC's virtual media. The installer then writes to two mirrored
   boot drives (RAID 1: every write lands on both) while the data drives stay untouched. Below: the
   boot drive's partition bar with draggable dividers and an ext4 / XFS / ZFS choice. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var DISK = 480, EFI = 1, BOOT = 2;
  var FS = { ext4: 'ext4 · the safe, simple Linux default', xfs: 'XFS · fast with big files; 4 allocation groups write in parallel', zfs: 'ZFS · checksums every block ✓ catches silent corruption, snapshots built in' };

  S.defineVisual('install', {
    init: function () {
      this.ctx = this.layer();
      this.via = 'usb'; this.fs = 'ext4'; this.root = 64; this.swap = 8;
      this.phase = 'idle'; this.pt = 0; this.pw = 0;
      var self = this;
      var g = this.ui.group('Install');
      this.segVia = g.seg({ label: 'ISO via', options: [['usb', 'USB stick'], ['bmc', 'BMC virtual media']], value: 'usb', onChange: function (v) { self.via = v; self.resetRun(); } });
      this.bGo = g.button('▶ Install', function () { self.run(); }, { kind: 'primary' });
      this.ui.br();
      var p = this.ui.group('Partitions');
      p.seg({ label: 'Filesystem', options: [['ext4', 'ext4'], ['xfs', 'XFS'], ['zfs', 'ZFS']], value: 'ext4', onChange: function (v) { self.fs = v; self.announce(FS[v]); } });
      this.sRoot = p.slider({ label: 'Root /', min: 16, max: 300, step: 4, value: 64, fmt: function (v) { return v + ' GB'; }, onInput: function (v) { self.setRoot(v); } });
      this.sSwap = p.slider({ label: 'Swap', min: 0, max: 64, step: 2, value: 8, fmt: function (v) { return v + ' GB'; }, onInput: function (v) { self.setSwap(v); } });
      this.ui.spacer();
      this.rData = this.ui.readout('/srv data', '–');
      this.pointer({
        down: function (q) { var hit = self.hits.query(q.x, q.y); if (hit && hit.data && hit.data.div) { self.drag = hit.data.div; return true; } return false; },
        move: function (q) { if (!self.drag) return; var gb = self.xToGB(q.x); if (self.drag === 1) self.setRoot(gb - EFI - BOOT, true); else self.setSwap(gb - EFI - BOOT - self.root, true); },
        up: function () { self.drag = 0; self.announce(self.partDesc()); },
        hover: function (q) { var hit = self.hits.query(q.x, q.y); self.stage.style.cursor = hit && hit.data && hit.data.div ? 'ew-resize' : ''; },
        leave: function () { self.stage.style.cursor = ''; }
      });
      this.syncR();
    },
    data: function () { return DISK - EFI - BOOT - this.root - this.swap; },
    setRoot: function (v, fromDrag) {
      v = U.clamp(Math.round(v / 4) * 4, 16, Math.min(300, DISK - EFI - BOOT - this.swap - 20));
      this.root = v; if (fromDrag) this.sRoot.set(v);
      this.syncR(); this.invalidate();
    },
    setSwap: function (v, fromDrag) {
      v = U.clamp(Math.round(v / 2) * 2, 0, Math.min(64, DISK - EFI - BOOT - this.root - 20));
      this.swap = v; if (fromDrag) this.sSwap.set(v);
      this.syncR(); this.invalidate();
    },
    syncR: function () { this.rData.set(this.data() + ' GB', this.data() < 60 ? 'warn' : ''); },
    partDesc: function () { return 'Boot drive: EFI 1 GB, boot 2 GB, root ' + this.root + ' GB, swap ' + this.swap + ' GB, data ' + this.data() + ' GB, formatted ' + this.fs + '.'; },
    resetRun: function () { this.phase = 'idle'; this.pt = 0; this.pw = 0; this.bGo.setDisabled(false); this.bGo.setLabel('▶ Install'); this.setActive(false); this.invalidate(); },
    run: function () {
      if (this.phase === 'travel' || this.phase === 'write') return;
      this.phase = 'travel'; this.pt = 0; this.pw = 0; this.bGo.setDisabled(true);
      this.announce(this.via === 'usb' ? 'The installer ISO travels on a USB stick into the front port.' : 'The installer ISO streams over the management network to the BMC, which presents it as a virtual DVD.');
      if (this.reduced()) { this.pt = 1; this.pw = 1; this.finish(); return; }
      this.setActive(true);
    },
    finish: function () {
      this.phase = 'done'; this.bGo.setDisabled(false); this.bGo.setLabel('↺ Install again'); this.setActive(false);
      this.announce('Installed onto both mirrored boot drives. The 8 data drives were never touched.');
      this.invalidate();
    },
    update: function (dt) {
      if (this.phase === 'travel') { this.pt += dt / (this.via === 'usb' ? 1.8 : 2.4); if (this.pt >= 1) { this.pt = 1; this.phase = 'write'; this.announce('Installing: every write goes to both boot drives at once.'); } }
      else if (this.phase === 'write') { this.pw += dt / 3; if (this.pw >= 1) { this.pw = 1; this.finish(); } }
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      var mob = this.mobile, pad = mob ? 12 : 24;
      this.pad = pad;
      var topH = mob ? h * 0.5 : h * 0.52;
      // server front elevation
      var sx = mob ? pad : Math.max(260, w * 0.36), sw = w - pad - sx, sh = mob ? Math.min(92, topH * 0.38) : Math.min(120, topH * 0.48);
      var sy = mob ? topH - sh - 24 : topH * 0.36;
      this.srv = { x: sx, y: sy, w: sw, h: sh };
      this.lap = mob ? { x: w * 0.42, y: 52 } : { x: pad + 56, y: sy + sh * 0.25 };
      this.bar = { x: pad, y: topH + (mob ? 40 : 50), w: w - pad * 2, h: mob ? 60 : 62 };
    },
    layoutServer: function () {
      var S2 = this.srv, mob = this.mobile;
      var ear = 10, x0 = S2.x + ear, w0 = S2.w - ear * 2;
      var portX = x0 + 14, bootX = x0 + (mob ? 30 : 40), bootW = mob ? 30 : 40, bootH = (S2.h - 22) / 2;
      var dataX = bootX + bootW + (mob ? 14 : 22), dataW = (x0 + w0 - 10 - dataX) / 8;
      return {
        usb: { x: portX, y: S2.y + S2.h * 0.68 },
        bmc: { x: portX, y: S2.y + S2.h * 0.3 },
        boot: [{ x: bootX, y: S2.y + 8, w: bootW, h: bootH }, { x: bootX, y: S2.y + 14 + bootH, w: bootW, h: bootH }],
        data: (function () { var a = []; for (var i = 0; i < 8; i++) a.push({ x: dataX + i * dataW + 2, y: S2.y + 8, w: dataW - 4, h: S2.h - 16 }); return a; })()
      };
    },
    xToGB: function (x) {
      var B = this.bar, fixW = this.fixW, lx = B.x + fixW * 2, lw = B.w - fixW * 2;
      return EFI + BOOT + U.clamp((x - lx) / lw, 0, 1) * (DISK - EFI - BOOT);
    },
    drawPath: function (ctx) {
      var P = S.pal, mob = this.mobile, t = this.time, L = this.layoutServer(), lap = this.lap, S2 = this.srv, usb = this.via === 'usb';
      // laptop
      D.g.laptop(ctx, lap.x, lap.y, mob ? 46 : 64, P.alu);
      D.text(ctx, 'your laptop', lap.x, lap.y + (mob ? 26 : 34), { size: mob ? 9 : 10, weight: 700, color: P.text2, align: 'center' });
      if (!mob) D.text(ctx, 'ubuntu-24.04.iso', lap.x, lap.y + 48, { size: 9, color: P.text3, align: 'center' });
      // route
      var pts, col = usb ? P.accent : P.mgmt;
      if (usb) {
        var ux = L.usb.x, uy = L.usb.y;
        pts = mob ? [lap.x - 28, lap.y + 4, ux, lap.y + 4, ux, uy - 6] : [lap.x + 34, lap.y + 6, lap.x + 90, lap.y + 6, lap.x + 90, uy, ux - 8, uy];
        D.poly(ctx, pts, false); ctx.strokeStyle = U.rgba(col, 0.5); ctx.setLineDash([3, 5]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
        if (!mob) D.text(ctx, 'carry it over', lap.x + 96, (lap.y + uy) / 2, { size: 9, color: P.text3 });
      } else {
        var bx = L.bmc.x, by = L.bmc.y, swx = mob ? this.w - 70 : (lap.x + bx) / 2 + 20, swy = mob ? lap.y + 4 : lap.y - 26;
        pts = mob ? [lap.x + 28, lap.y + 4, swx + 34, lap.y + 4, swx + 34, S2.y - 16, bx, S2.y - 16, bx, by - 7] : [lap.x + 34, lap.y - 4, swx - 30, swy, swx + 30, swy, bx - 30, swy, bx - 30, by, bx - 8, by];
        D.flow(ctx, pts, P.mgmt, t, { width: 2, speed: 20, dash: [6, 6], base: 0.25 });
        D.g.switchBox(ctx, swx, swy, mob ? 40 : 56, P.steel, t);
        D.text(ctx, 'management network', swx, swy - (mob ? 12 : 16), { size: mob ? 8.5 : 9.5, weight: 700, color: P.mgmt, align: 'center' });
      }
      // server chassis (front elevation)
      D.box(ctx, S2.x, S2.y, S2.w, S2.h, 4, P.steel, U.shade(P.steel, 0.25), 1);
      ctx.fillStyle = U.shade(P.steel, -0.2); ctx.fillRect(S2.x, S2.y, 10, S2.h); ctx.fillRect(S2.x + S2.w - 10, S2.y, 10, S2.h);
      // ports
      D.box(ctx, L.usb.x - 6, L.usb.y - 3, 12, 6, 1, P.silicon, usb ? P.accent : U.rgba(P.alu, 0.5), 1);
      D.box(ctx, L.bmc.x - 6, L.bmc.y - 5, 12, 10, 1, P.silicon, !usb ? P.mgmt : U.rgba(P.alu, 0.5), 1);
      if (!mob) { D.text(ctx, 'USB', L.usb.x, L.usb.y + 12, { size: 7.5, weight: 700, color: P.text3, align: 'center' }); D.text(ctx, 'BMC', L.bmc.x, L.bmc.y - 12, { size: 7.5, weight: 700, color: !usb ? P.mgmt : P.text3, align: 'center' }); }
      if (!usb) D.led(ctx, L.bmc.x + 10, L.bmc.y, P.mgmt, 'heartbeat', t, 1.8);
      // data drives
      var installing = this.phase === 'write' || this.phase === 'done';
      L.data.forEach(function (d, i) {
        D.box(ctx, d.x, d.y, d.w, d.h, 2, U.shade(P.plastic, 0.05), U.rgba(P.alu, 0.3), 1);
        for (var k = 0; k < 4; k++) D.line(ctx, d.x + 3, d.y + 6 + k * 4, d.x + d.w - 3, d.y + 6 + k * 4, U.rgba(P.alu, 0.18), 1);
        D.led(ctx, d.x + d.w / 2, d.y + d.h - 7, P.ok, 'solid', t + i, 1.6);
      });
      var dl = L.data[0], dr = L.data[7];
      if (installing) {
        D.g.padlock(ctx, (dl.x + dr.x + dr.w) / 2, S2.y + S2.h / 2 - 2, mob ? 18 : 24, P.gold);
      }
      D.text(ctx, 'DATA DRIVES ×8 · untouched', (dl.x + dr.x + dr.w) / 2, S2.y + S2.h + (mob ? 12 : 16), { size: mob ? 8.5 : 9.5, weight: 700, color: installing ? P.gold : P.text3, align: 'center' });
      // boot drives
      var pw = this.pw, self = this;
      L.boot.forEach(function (d, i) {
        D.box(ctx, d.x, d.y, d.w, d.h, 2, P.plastic, installing ? P.ok : U.rgba(P.data, 0.7), installing ? 1.4 : 1.2);
        if (pw > 0) { ctx.fillStyle = U.rgba(P.data, 0.45); ctx.fillRect(d.x + 2, d.y + 2, (d.w - 4) * pw, d.h - 4); }
        D.text(ctx, 'BOOT ' + 'AB'[i], d.x + d.w / 2, d.y + d.h / 2, { size: mob ? 7 : 8, weight: 800, color: P.text1, align: 'center' });
        if (self.phase === 'done') D.g.check(ctx, d.x + d.w + 8, d.y + d.h / 2, 11, P.ok);
      });
      var b0 = L.boot[0], b1 = L.boot[1];
      if (mob) D.text(ctx, 'RAID 1 mirror', S2.x, S2.y + S2.h + 12, { size: 8.5, weight: 700, color: P.data });
      else D.text(ctx, 'RAID 1 mirror', b0.x + b0.w / 2, S2.y - 10, { size: 9.5, weight: 700, color: P.data, align: 'center' });
      // travelling ISO
      var lens = D.polyLen(pts), tot = lens[lens.length - 1];
      if (this.phase === 'travel') {
        var o = D.along(pts, lens, tot * U.ease.inOutSine(this.pt), {});
        if (usb) { D.box(ctx, o.x - 12, o.y - 6, 24, 12, 3, P.alu, U.shade(P.alu, -0.3), 1); D.box(ctx, o.x + 12, o.y - 4, 7, 8, 1, P.steel); D.glow(ctx, o.x, o.y, 18, P.accent, 0.5); }
        else { D.g.disc(ctx, o.x, o.y, 20, P.alu); var r = (t * 1.5) % 1; D.circle(ctx, o.x, o.y, 8 + r * 18, null, U.rgba(P.mgmt, 1 - r), 1.5); }
      } else if (this.phase !== 'idle') {
        var end = { x: pts[pts.length - 2], y: pts[pts.length - 1] };
        if (usb) { if (mob) D.box(ctx, end.x - 6, end.y - 26, 12, 22, 3, P.alu, U.shade(P.alu, -0.3), 1); else D.box(ctx, end.x - 26, end.y - 6, 24, 12, 3, P.alu, U.shade(P.alu, -0.3), 1); }
        else { D.pill(ctx, 'virtual DVD', mob ? S2.x + S2.w : end.x + 4, mob ? S2.y - 30 : S2.y + S2.h + 32, { size: 8.5, color: P.mgmt, align: mob ? 'right' : 'left' }); }
      }
      // mirrored writes: beads to both boot drives
      if (this.phase === 'write') {
        var src = usb ? L.usb : L.bmc, mx = src.x + (b0.x - src.x) * 0.5;
        [b0, b1].forEach(function (d) {
          var q = [src.x + 6, src.y, mx, src.y, mx, d.y + d.h / 2, d.x, d.y + d.h / 2], ll = D.polyLen(q), tt = ll[ll.length - 1];
          D.poly(ctx, q, false); ctx.strokeStyle = U.rgba(P.data, 0.4); ctx.lineWidth = 1; ctx.stroke();
          for (var k = 0; k < 3; k++) { var oo = D.along(q, ll, tt * ((t * 1.6 + k / 3) % 1), {}); D.circle(ctx, oo.x, oo.y, 2.2, P.data); }
        });
      }
      // status line
      var st = this.phase === 'idle' ? 'Press Install' : this.phase === 'travel' ? (usb ? 'Walking the USB stick to the server…' : 'Streaming the ISO over the BMC network…') : this.phase === 'write' ? 'Installing · ' + Math.round(this.pw * 100) + '% · each block written to A and B' : 'Installed on both boot drives ✓';
      D.text(ctx, st, mob ? this.pad : S2.x, mob ? 14 : S2.y - 34, { size: mob ? 10 : 11.5, weight: 700, color: this.phase === 'done' ? P.ok : P.text1, align: mob ? 'left' : 'left' });
    },
    drawBar: function (ctx) {
      var P = S.pal, B = this.bar, mob = this.mobile, fs = this.fs, self = this;
      this.hits.clear();
      this.fixW = mob ? 36 : 66;
      var lw = B.w - this.fixW * 2, per = lw / (DISK - EFI - BOOT);
      var parts = [
        { n: 'EFI', m: '/boot/efi', gb: EFI, w: this.fixW, f: 'FAT32', c: P.power },
        { n: 'boot', m: '/boot', gb: BOOT, w: this.fixW, f: fs === 'zfs' ? 'ZFS' : fs, c: P.net },
        { n: 'root', m: '/', gb: this.root, w: this.root * per, f: fs, c: P.data, blocks: true },
        { n: 'swap', m: 'swap', gb: this.swap, w: this.swap * per, f: 'swap', c: P.warn },
        { n: 'data', m: '/srv', gb: this.data(), w: this.data() * per, f: fs, c: P.ok, blocks: true }
      ];
      D.text(ctx, 'BOOT DRIVE · ' + DISK + ' GB (mirrored, so A and B are identical)', B.x, B.y - (mob ? 22 : 26), { size: mob ? 9 : 10, weight: 700, color: P.text3, ls: 0.6 });
      var x = B.x;
      parts.forEach(function (p, i) {
        if (p.w < 0.5) { p.x = x; return; }
        p.x = x;
        D.box(ctx, x, B.y, p.w, B.h, i === 0 ? 4 : 0, U.rgba(p.c, 0.18), null);
        ctx.fillStyle = U.rgba(p.c, 0.85); ctx.fillRect(x, B.y, p.w, 3);
        if (p.blocks && p.w > 12) self.blocks(ctx, x + 3, B.y + 7, p.w - 6, B.h - 11, p.c);
        D.line(ctx, x, B.y, x, B.y + B.h, U.rgba(P.bg, 0.9), 1.5);
        // labels below bar
        if (p.w > (mob ? 26 : 40) || i < 2) {
          var cx = x + p.w / 2;
          D.text(ctx, p.n, cx, B.y + B.h + 12, { size: mob ? 8.5 : 10, weight: 700, color: p.c, align: 'center' });
          if (p.w > (mob ? 40 : 52) || i < 2) D.text(ctx, p.gb + ' GB', cx, B.y + B.h + (mob ? 23 : 26), { size: mob ? 8 : 9.5, color: P.text2, align: 'center' });
          if (!mob && (p.w > 60 || i < 2)) { D.text(ctx, p.m, cx, B.y + B.h + 39, { size: 8.5, color: P.text3, align: 'center' }); D.text(ctx, p.f, cx, B.y + B.h + 51, { size: 8.5, weight: 700, color: P.text3, align: 'center' }); }
        }
        x += p.w;
      });
      // not-to-scale break between fixed and linear parts
      var bx = B.x + this.fixW * 2;
      D.line(ctx, bx - 3, B.y - 4, bx + 3, B.y + B.h + 4, P.text3, 1);
      if (!mob) D.text(ctx, '(not to scale)', B.x + this.fixW, B.y - 9, { size: 8, color: P.text3, align: 'center' });
      D.box(ctx, B.x, B.y, B.w, B.h, 4, null, U.rgba(P.alu, 0.45), 1);
      // drag handles
      [[parts[3].x, 1], [parts[4].x, 2]].forEach(function (d) {
        var hx = d[0], on = self.drag === d[1], top = d[1] === 1, gy = top ? B.y - 16 : B.y + B.h + 4;
        D.line(ctx, hx, B.y - 4, hx, B.y + B.h + 4, P.accent, on ? 2.5 : 2);
        D.box(ctx, hx - 7, gy, 14, 12, 3, P.accent);
        D.line(ctx, hx - 2, gy + 3, hx - 2, gy + 9, P.bg, 1); D.line(ctx, hx + 2, gy + 3, hx + 2, gy + 9, P.bg, 1);
        self.hits.rect('div' + d[1], hx - 12, top ? B.y - 20 : B.y + B.h * 0.5, 24, top ? B.h * 0.5 + 20 : B.h * 0.5 + 20, { div: d[1] });
      });
      // filesystem note
      var ny = B.y + B.h + (mob ? 40 : 72);
      D.text(ctx, FS[fs], B.x, ny, { size: mob ? 9 : 10.5, weight: 600, color: fs === 'zfs' ? P.ok : P.text2, maxW: B.w });
      D.text(ctx, 'drag the ‖ handles (or use the sliders) to resize root and swap', B.x, ny + (mob ? 16 : 18), { size: mob ? 8.5 : 9.5, color: P.text3, maxW: B.w });
    },
    blocks: function (ctx, x, y, w, h, col) {
      var P = S.pal, fs = this.fs, cs = this.mobile ? 7 : 9, g = 2;
      var cols = Math.max(1, Math.floor((w + g) / (cs + g))), rows = Math.max(1, Math.floor((h + g) / (cs + g)));
      var ox = x + (w - (cols * (cs + g) - g)) / 2, n = 0;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var bx = ox + c * (cs + g), by = y + r * (cs + g);
        var filled = U.hash(c * 3 + 1, r * 7 + 2) < 0.55;
        ctx.fillStyle = filled ? U.rgba(col, 0.55) : U.rgba(col, 0.14); ctx.fillRect(bx, by, cs, cs);
        if (fs === 'zfs' && filled && cs >= 7) { ctx.beginPath(); ctx.moveTo(bx + 1.5, by + cs * 0.55); ctx.lineTo(bx + cs * 0.4, by + cs - 1.8); ctx.lineTo(bx + cs - 1.2, by + 1.6); ctx.strokeStyle = P.text1; ctx.lineWidth = 1.1; ctx.stroke(); }
        n++;
      }
      if (fs === 'xfs' && w > 40) {
        for (var a = 1; a < 4; a++) { var ax = x + (w * a) / 4; D.line(ctx, ax, y - 2, ax, y + h + 2, U.rgba(P.text1, 0.7), 1, [2, 2]); }
        if (w > 120) for (var a2 = 0; a2 < 4; a2++) D.text(ctx, 'AG' + a2, x + (w * (a2 + 0.5)) / 4, y + h / 2, { size: 8, weight: 800, color: P.text1, align: 'center' });
      }
      return n;
    },
    draw: function () {
      var ctx = this.ctx;
      D.clear(ctx, this.w, this.h);
      if (!this.srv) return;
      this.drawPath(ctx);
      this.drawBar(ctx);
      this.setDesc((this.phase === 'done' ? 'Installed via ' + (this.via === 'usb' ? 'USB stick' : 'BMC virtual media') + ' onto two mirrored boot drives; data drives untouched. ' : 'Installer ready to travel via ' + (this.via === 'usb' ? 'USB stick. ' : 'BMC virtual media. ')) + this.partDesc());
    }
  });
})(window.SRV);
