/* Ch19 · 3-2-1 survival game. Build your copies (snapshots, RAID, a plugged-in USB drive, an offline /
   immutable copy, an offsite cloud across the river), then roll disasters: a drive dies, an oops-delete,
   ransomware (scrambles every CONNECTED copy) and fire / flood (everything on site). Scoreboard + a
   restore animation with a real RTO estimate for 2 TB. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var GLYPHS = '#%&@$*?!x9Z0QW§¥ƒ∆¤'.split('');
  var DIS = [
    { key: 'drive', name: 'Drive dies', icon: '💥' },
    { key: 'delete', name: 'Oops, deleted', icon: '🗑' },
    { key: 'ransom', name: 'Ransomware', icon: '🔒' },
    { key: 'fire', name: 'Fire / flood', icon: '🔥' }
  ];
  // restore time for 2 TB from each copy
  var RTO = { snap: 60, usb: 2e12 / 200e6, offline: 2e12 / 200e6 + 1800, cloud: 2e12 * 8 / 500e6 };
  var RTO_TXT = { snap: 'roll back a snapshot', usb: 'USB 3 drive · 200 MB/s', offline: 'fetch the offline drive + copy', cloud: 'download 2 TB at 500 Mb/s' };

  S.defineVisual('backup', {
    continuous: true,
    init: function () {
      var self = this;
      this.ctx = this.layer();
      this.has = { snap: true, raid: true, usb: true, offline: false, cloud: false, imm: false };
      this.st = null;            // per-copy status after a disaster
      this.dis = null; this.disT = 0;
      this.score = {}; this.restoreT = -1; this.restoreFrom = null;
      this.cellN = 8;

      var c = this.ui.group('Your copies');
      c.text('<span class="ctl-label">Copies</span>');
      this.tg = {};
      var opts = [['snap', 'Snapshots on server'], ['raid', 'RAID mirror'], ['usb', 'USB drive (plugged in)'], ['offline', 'Offline / immutable copy'], ['cloud', 'Cloud offsite'], ['imm', 'Cloud is immutable']];
      opts.forEach(function (o) { self.tg[o[0]] = c.toggle({ label: o[1], value: self.has[o[0]], onChange: function (v) { self.setHas(o[0], v); } }); });
      this.ui.br();
      var d = this.ui.group('Roll a disaster');
      d.text('<span class="ctl-label">Disaster</span>');
      this.dBtns = DIS.map(function (x) { return d.button(x.icon + ' ' + x.name, function () { self.disaster(x.key); }, { kind: 'danger' }); });
      this.bRestore = this.ui.button('⟲ Restore', function () { self.restore(); }, { kind: 'primary' });
      this.ui.button('↺ Reset', function () { self.clear(true); });
      this.ui.spacer();
      this.rRes = this.ui.readout('Result', 'roll a disaster');
      this.bRestore.setDisabled(true);
    },
    setHas: function (k, v) {
      this.has[k] = v;
      if (k === 'imm' && v && !this.has.cloud) { this.has.cloud = true; this.tg.cloud.set(true); }
      if (k === 'cloud' && !v && this.has.imm) { this.has.imm = false; this.tg.imm.set(false); }
      this.score = {}; this.clear(false);
      var r = this.rule();
      this.announce((v ? 'Added ' : 'Removed ') + k + '. ' + (r.met ? '3-2-1 rule met.' : '3-2-1: ' + r.copies + ' copies, ' + r.media + ' kinds of media, ' + r.off + ' offsite.'));
    },
    rule: function () {
      var h = this.has, copies = 1 + (h.usb ? 1 : 0) + (h.offline ? 1 : 0) + (h.cloud ? 1 : 0);
      var media = 1 + ((h.usb || h.offline) ? 1 : 0) + (h.cloud ? 1 : 0);
      var off = h.cloud ? 1 : 0;
      return { copies: copies, media: media, off: off, met: copies >= 3 && media >= 2 && off >= 1, air: h.offline || h.imm };
    },
    clear: function (say) {
      this.st = null; this.dis = null; this.restoreT = -1; this.restoreFrom = null;
      this.dBtns.forEach(function (b) { b.setDisabled(false); });
      this.bRestore.setDisabled(true);
      this.rRes.set('roll a disaster', '');
      if (say) this.announce('Reset. All copies healthy.');
    },
    // what happens to each copy
    outcome: function (key) {
      var h = this.has, st = { live: 'ok', snap: h.snap ? 'ok' : 'none', usb: h.usb ? 'ok' : 'none', offline: h.offline ? 'ok' : 'none', cloud: h.cloud ? 'ok' : 'none', raidNote: '' };
      if (key === 'drive') {
        if (h.raid) { st.raidNote = 'RAID: one disk died, mirror carries on ✓'; }
        else { st.live = 'dead'; if (h.snap) st.snap = 'dead'; st.raidNote = 'no RAID: the only disk is gone'; }
      } else if (key === 'delete') {
        st.live = 'gone'; st.raidNote = h.raid ? 'RAID mirrored the delete too' : '';
      } else if (key === 'ransom') {
        st.live = 'enc'; if (h.snap) st.snap = 'enc';
        if (h.usb) st.usb = 'enc';
        if (h.cloud && !h.imm) st.cloud = 'enc';
        st.raidNote = 'every connected copy got encrypted';
      } else if (key === 'fire') {
        st.live = 'burnt'; if (h.snap) st.snap = 'burnt'; if (h.usb) st.usb = 'burnt'; if (h.offline) st.offline = 'burnt';
        st.raidNote = 'everything in the building is lost';
      }
      return st;
    },
    best: function (st) {
      var order = ['snap', 'usb', 'offline', 'cloud'];
      for (var i = 0; i < order.length; i++) if (st[order[i]] === 'ok') return order[i];
      return null;
    },
    disaster: function (key) {
      var self = this;
      this.clear(false);
      this.dis = key; this.st = this.outcome(key); this.disT = 0;
      var survived = this.st.live === 'ok' || !!this.best(this.st);
      this.score[key] = survived;
      this.tween({ from: 0, to: 1, dur: 1.4, ease: 'linear', onUpdate: function (v) { self.disT = v; } });
      var b = this.best(this.st), name = DIS.filter(function (d) { return d.key === key; })[0].name;
      var msg;
      if (this.st.live === 'ok') msg = name + ': RAID kept the server running. No restore needed.';
      else if (b) msg = name + ': the live copy is lost, but your ' + this.label(b) + ' survived. Press Restore.';
      else msg = name + ': every copy is lost. The data is gone.';
      this.rRes.set(this.st.live === 'ok' ? 'survived ✓ (RAID)' : b ? 'survived ✓ · restore from ' + this.label(b) : 'DATA LOST ✕', b || this.st.live === 'ok' ? 'ok' : 'bad');
      this.bRestore.setDisabled(!b || this.st.live === 'ok');
      this.announce(msg);
    },
    label: function (k) { return { snap: 'snapshot', usb: 'USB drive', offline: 'offline copy', cloud: 'cloud copy', live: 'server' }[k]; },
    restore: function () {
      var b = this.st && this.best(this.st); if (!b) return;
      var self = this;
      this.restoreFrom = b; this.restoreT = 0;
      this.bRestore.setDisabled(true);
      this.tween({ from: 0, to: 1, dur: b === 'snap' ? 1.6 : 3.4, ease: 'inOutSine', onUpdate: function (v) { self.restoreT = v; }, onDone: function () {
        self.restoreT = 1;
        self.announce('Restored 2 TB from the ' + self.label(b) + ' in about ' + U.fmtTime(RTO[b]) + '.');
        self.tween({ from: 0, to: 1, dur: 0.01, delay: 1.8, onDone: function () { var keep = self.score; self.clear(false); self.score = keep; } });
      } });
    },

    // ------------------------------------------------------------ layout
    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      L.fs = m ? 9 : U.clamp(w / 88, 9.5, 12);
      L.s = m ? U.clamp(w / 380, 0.8, 1.1) : U.clamp(Math.min(w / 980, h / 550), 0.75, 1.3);
      if (m) {
        L.site = { x: 8, y: 40, w: w - 16, h: h * 0.56 - 40 };
        L.river = { x0: 0, x1: w, y0: h * 0.585, y1: h * 0.64, horiz: true };
        L.n = {
          live: { x: w * 0.25, y: L.site.y + L.site.h * 0.42 },
          usb: { x: w * 0.73, y: L.site.y + L.site.h * 0.22 },
          offline: { x: w * 0.73, y: L.site.y + L.site.h * 0.7 },
          cloud: { x: w * 0.27, y: h * 0.8 }
        };
        L.score = { x: w * 0.53, y: h * 0.67, w: w * 0.47 - 8, h: h * 0.33 - 8 };
      } else {
        L.site = { x: 16, y: 44, w: w * 0.6, h: h - 58 };
        L.river = { x0: w * 0.635, x1: w * 0.69, y0: 0, y1: h, horiz: false };
        L.n = {
          live: { x: L.site.x + L.site.w * 0.22, y: L.site.y + L.site.h * 0.45 },
          usb: { x: L.site.x + L.site.w * 0.72, y: L.site.y + L.site.h * 0.24 },
          offline: { x: L.site.x + L.site.w * 0.72, y: L.site.y + L.site.h * 0.72 },
          cloud: { x: w * 0.845, y: L.site.y + L.site.h * 0.45 - 30 }
        };
        L.score = { x: w * 0.72, y: h * 0.62, w: w * 0.28 - 16, h: h * 0.38 - 14 };
      }
      L.nw = (m ? 100 : 184) * L.s; L.nh = (m ? 70 : 112) * L.s;
    },
    update: function () { /* flows + scramble are time-driven in draw */ },

    // ------------------------------------------------------------ drawing
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, t = this.time, fs = L.fs, m = this.mobile, self = this;
      D.clear(ctx, w, h);
      var site = L.site, n = L.n, h0 = this.has;
      // building outline
      ctx.setLineDash([6, 5]);
      D.box(ctx, site.x, site.y, site.w, site.h, 12, U.rgba(P.blueprint, 0.03), U.rgba(P.blueprint, 0.45), 1);
      ctx.setLineDash([]);
      D.text(ctx, m ? 'ON SITE' : 'ON SITE · your building', site.x + 12, site.y - 10, { size: fs * 0.85, weight: 700, color: P.text3, ls: 1.5 });
      // river
      this.drawRiver(ctx);
      D.text(ctx, 'OFFSITE', m ? 12 : L.river.x1 + 16, m ? L.river.y1 + 12 : site.y - 10, { size: fs * 0.85, weight: 700, color: P.text3, ls: 1.5 });
      // backup flows
      var fl = function (a, b, col, on, dash) {
        var pts = [a.x, a.y, b.x, b.y];
        if (on) D.flow(ctx, pts, col, t, { width: 1.6, speed: 24, dash: dash || [3, 7] });
        else D.line(ctx, a.x, a.y, b.x, b.y, U.rgba(P.text3, 0.3), 1, [2, 6]);
      };
      var live = n.live;
      var off = L.nw * 0.55;
      if (h0.usb) fl({ x: live.x + off * 0.9, y: live.y - 10 }, { x: n.usb.x - off, y: n.usb.y }, P.data, true);
      if (h0.cloud) {
        var cpts = m ? [live.x, live.y + L.nh * 0.55, live.x, n.cloud.y - L.nh * 0.55] : [live.x + off * 0.9, live.y + 4, n.cloud.x - off * 0.9, n.cloud.y + 4];
        D.flow(ctx, cpts, h0.imm ? P.ok : P.data, t, { width: 1.6, speed: 24, dash: [3, 7] });
        var mx = U.lerp(cpts[0], cpts[2], m ? 0.5 : 0.62), my = U.lerp(cpts[1], cpts[3], m ? 0.5 : 0.62);
        D.pill(ctx, h0.imm ? 'nightly · object-lock' : 'nightly sync', mx, my - 12, { color: h0.imm ? P.ok : P.data, size: fs * 0.75, align: 'center' });
      }
      if (h0.offline) {
        // weekly copy then unplugged: an air gap in the line
        var a = { x: live.x + off * 0.9, y: live.y + 16 }, b = { x: n.offline.x - off, y: n.offline.y };
        var gx = U.lerp(a.x, b.x, 0.62), gy = U.lerp(a.y, b.y, 0.62);
        D.line(ctx, a.x, a.y, U.lerp(a.x, b.x, 0.55), U.lerp(a.y, b.y, 0.55), U.rgba(P.text3, 0.6), 1.2, [3, 4]);
        D.line(ctx, U.lerp(a.x, b.x, 0.7), U.lerp(a.y, b.y, 0.7), b.x, b.y, U.rgba(P.text3, 0.6), 1.2, [3, 4]);
        if (!m) D.text(ctx, 'air gap', gx + 8, gy + 2, { size: fs * 0.75, weight: 700, color: P.ok });
      }
      // nodes
      this.drawNode(ctx, 'live', live, 'SERVER', 'live copy · 2 TB', true);
      this.drawNode(ctx, 'usb', n.usb, 'USB DRIVE', h0.usb ? 'plugged in · 2nd media' : 'not set up', h0.usb);
      this.drawNode(ctx, 'offline', n.offline, 'OFFLINE COPY', h0.offline ? 'unplugged · in a safe' : 'not set up', h0.offline);
      this.drawNode(ctx, 'cloud', n.cloud, 'CLOUD', h0.cloud ? (h0.imm ? 'other city · immutable' : 'other city · synced') : 'not set up', h0.cloud);
      // disaster overlays
      if (this.dis && !(this.restoreFrom && this.restoreT >= 0)) this.drawDisaster(ctx);
      // restore flow
      if (this.restoreFrom && this.restoreT >= 0) this.drawRestore(ctx);
      this.drawBadge(ctx);
      this.drawScore(ctx);
      this.setDesc(this.describe());
    },
    drawRiver: function (ctx) {
      var P = S.pal, R = this.L.river, t = this.time;
      if (R.horiz) {
        D.box(ctx, 0, R.y0, this.w, R.y1 - R.y0, 0, U.rgba(P.data, 0.12));
        for (var k = 0; k < 3; k++) {
          ctx.beginPath();
          for (var x = 0; x <= this.w; x += 8) { var y = U.lerp(R.y0, R.y1, (k + 1) / 4) + Math.sin(x * 0.05 + t * 1.5 + k) * 2; if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.strokeStyle = U.rgba(P.data, 0.45); ctx.lineWidth = 1; ctx.stroke();
        }
      } else {
        D.box(ctx, R.x0, 0, R.x1 - R.x0, this.h, 0, U.rgba(P.data, 0.1));
        for (var j = 0; j < 3; j++) {
          ctx.beginPath();
          for (var y2 = 0; y2 <= this.h; y2 += 8) { var x2 = U.lerp(R.x0, R.x1, (j + 1) / 4) + Math.sin(y2 * 0.05 + t * 1.5 + j) * 2.5; if (y2) ctx.lineTo(x2, y2); else ctx.moveTo(x2, y2); }
          ctx.strokeStyle = U.rgba(P.data, 0.45); ctx.lineWidth = 1; ctx.stroke();
        }
        D.text(ctx, 'river', (R.x0 + R.x1) / 2, this.h - 12, { size: this.L.fs * 0.75, color: P.data, align: 'center' });
      }
    },
    status: function (k) {
      if (k === 'live' && this.restoreFrom && this.restoreT >= 0) return this.restoreT >= 1 ? 'ok' : 'restoring';
      if (!this.st) return (k === 'live' || this.has[k]) ? 'ok' : 'none';
      return this.st[k];
    },
    drawNode: function (ctx, k, p, title, sub, present) {
      var P = S.pal, L = this.L, fs = L.fs, m = this.mobile, w = L.nw, h = L.nh, x = p.x - w / 2, y = p.y - h / 2, t = this.time;
      var st = this.status(k);
      var bad = st === 'gone' || st === 'enc' || st === 'burnt' || st === 'dead';
      var col = !present ? P.text3 : bad ? P.fault : k === 'cloud' && this.has.imm ? P.ok : k === 'offline' ? P.ok : P.data;
      if (!present) ctx.setLineDash([4, 4]);
      D.box(ctx, x, y, w, h, 8, present ? U.rgba(P.panel, 0.95) : U.rgba(P.panel, 0.4), U.rgba(col, present ? 0.7 : 0.4), 1.2);
      ctx.setLineDash([]);
      // icon
      var ix = x + (m ? 14 : 20), iy = y + (m ? 15 : 20), is = m ? 20 : 28;
      ctx.globalAlpha = present ? 1 : 0.4;
      if (k === 'live') {
        D.g.serverFront(ctx, ix + 2, iy, is * 1.1, P.steel, st === 'ok' || st === 'restoring' ? t : null, st === 'ok' ? P.ok : P.fault);
      } else if (k === 'usb') {
        D.box(ctx, ix - is * 0.32, iy - is * 0.22, is * 0.64, is * 0.44, 3, U.shade(P.plastic, 0.1), P.alu, 1);
        D.box(ctx, ix + is * 0.32, iy - is * 0.1, is * 0.14, is * 0.2, 1, P.alu);
      } else if (k === 'offline') {
        D.box(ctx, ix - is * 0.36, iy - is * 0.32, is * 0.72, is * 0.64, 3, U.shade(P.steel, -0.1), P.alu, 1.2);
        D.circle(ctx, ix, iy, is * 0.16, null, P.alu, 1.4);
        D.line(ctx, ix, iy, ix + is * 0.1, iy - is * 0.1, P.alu, 1.4);
      } else {
        D.g.cloud(ctx, ix, iy + 2, is * 1.2, col);
      }
      ctx.globalAlpha = 1;
      D.text(ctx, title, ix + is * 0.75, y + (m ? 12 : 16), { size: fs * 0.88, weight: 700, color: present ? P.text1 : P.text3, maxW: w - is - 16 });
      D.text(ctx, sub, ix + is * 0.75, y + (m ? 24 : 31), { size: fs * 0.72, color: P.text3, maxW: w - is - 16 });
      if (!present) return;
      // data card: 8 cells
      var cw = (w - 20) / 8, ch = m ? 12 : 16, cy = y + h - ch - (k === 'live' ? (m ? 18 : 24) : 9);
      for (var i = 0; i < 8; i++) {
        var cx = x + 10 + i * cw;
        var fill = st === 'restoring' ? (i / 8 < this.restoreT ? 'ok' : 'empty') : st;
        if (fill === 'ok') D.box(ctx, cx + 1, cy, cw - 2, ch, 2, U.rgba(P.data, 0.55), U.rgba(P.data, 0.9), 1);
        else if (fill === 'gone' || fill === 'empty') { ctx.setLineDash([2, 2]); D.box(ctx, cx + 1, cy, cw - 2, ch, 2, null, U.rgba(P.text3, 0.6), 1); ctx.setLineDash([]); }
        else if (fill === 'enc') {
          D.box(ctx, cx + 1, cy, cw - 2, ch, 2, U.rgba(P.fault, 0.18), U.rgba(P.fault, 0.7), 1);
          var gi = Math.floor(U.hash(i + k.length * 13, Math.floor(t * 9)) * GLYPHS.length);
          D.text(ctx, GLYPHS[gi], cx + cw / 2, cy + ch / 2 + 0.5, { size: ch * 0.75, weight: 700, color: P.fault, align: 'center' });
        } else if (fill === 'burnt' || fill === 'dead') D.box(ctx, cx + 1, cy, cw - 2, ch, 2, U.rgba(P.bg0, 0.8), U.rgba(P.fault, 0.5), 1);
      }
      // server extras: snapshots + RAID
      if (k === 'live') {
        var sy = y + h - (m ? 9 : 11), snapSt = this.status('snap');
        if (this.has.snap) {
          var sc = snapSt === 'ok' ? P.accent : P.fault;
          D.text(ctx, (m ? 'snap ' : '◷ snapshots ') + (snapSt === 'ok' ? '✓' : '✕'), x + 10, sy, { size: fs * 0.72, weight: 700, color: sc });
        }
        if (this.has.raid) {
          var rx = x + w - 12, dead = this.dis === 'drive';
          for (var dk = 0; dk < 2; dk++) {
            var dx = rx - dk * 12;
            D.box(ctx, dx - 4, sy - 5, 8, 10, 1.5, U.rgba(dk === 0 && dead ? P.fault : P.ok, 0.3), dk === 0 && dead ? P.fault : P.ok, 1);
          }
          if (!m) D.text(ctx, 'RAID', rx - 30, sy, { size: fs * 0.72, weight: 700, color: P.text3, align: 'right' });
        }
      }
      // status stamp
      if (this.st && bad) {
        var lab = st === 'enc' ? 'ENCRYPTED' : st === 'gone' ? 'DELETED' : st === 'burnt' ? 'DESTROYED' : 'DEAD';
        D.pill(ctx, '✕ ' + lab, x + w - 6, y - 2, { color: P.fault, size: fs * 0.72, align: 'right', pad: 4 });
      } else if (this.st && st === 'ok' && k !== 'live') {
        D.pill(ctx, '✓ SAFE', x + w - 6, y - 2, { color: P.ok, size: fs * 0.72, align: 'right', pad: 4 });
      }
    },
    drawDisaster: function (ctx) {
      var P = S.pal, L = this.L, k = this.disT, t = this.time, site = L.site, n = L.n, fs = L.fs;
      if (this.dis === 'fire') {
        var a = U.smoothstep(0, 0.4, k);
        D.box(ctx, site.x, site.y, site.w, site.h, 12, U.rgba(P.heat, 0.1 * a));
        var cols = this.mobile ? 6 : 9;
        for (var i = 0; i < cols; i++) {
          var fx = site.x + site.w * (i + 0.5) / cols, fy = site.y + site.h - 14;
          var s = (16 + 10 * U.hash(i, 3)) * a * (this.mobile ? 0.8 : 1);
          if (s > 1) D.g.flame(ctx, fx, fy - s * 0.3, s, t + i);
        }
      } else if (this.dis === 'ransom') {
        // red wave spreading along the cables from the server
        var r = k * Math.max(this.w, this.h) * 0.9;
        ctx.globalAlpha = (1 - k) * 0.7;
        D.circle(ctx, n.live.x, n.live.y, r, null, P.fault, 2);
        ctx.globalAlpha = 1;
        var ra = U.smoothstep(0.1, 0.3, k);
        if (ra > 0) { ctx.globalAlpha = ra; D.g.padlock(ctx, n.live.x - 44, n.live.y - L.nh * 0.5 - 13, 14, P.fault, false); ctx.globalAlpha = 1; }
        D.text(ctx, 'PAY 2 BTC TO UNLOCK', n.live.x + 6, n.live.y - L.nh * 0.5 - 12, { size: fs * 0.8, weight: 700, color: P.fault, align: 'center', alpha: ra });
      } else if (this.dis === 'drive') {
        var sp = 1 - U.smoothstep(0, 0.6, k);
        if (sp > 0) D.glow(ctx, n.live.x + L.nw * 0.3, n.live.y + L.nh * 0.4, 30 * sp + 6, P.power, sp);
      }
      if (this.st && this.st.raidNote) D.text(ctx, this.st.raidNote, n.live.x, n.live.y + L.nh * 0.5 + 12, { size: fs * 0.78, weight: 700, color: this.st.live === 'ok' ? P.ok : P.fault, align: 'center', alpha: U.smoothstep(0.2, 0.5, k), maxW: L.site.w * 0.5 });
    },
    drawRestore: function (ctx) {
      var P = S.pal, L = this.L, from = this.restoreFrom, fs = L.fs, k = this.restoreT, t = this.time;
      var a = from === 'snap' ? L.n.live : L.n[from], b = L.n.live;
      if (from !== 'snap') {
        D.flow(ctx, [a.x, a.y, b.x, b.y], P.ok, t * 3, { width: 2.4, speed: 50, dash: [2, 6] });
        for (var i = 0; i < 6; i++) {
          var q = (k * 4 + i / 6) % 1;
          D.circle(ctx, U.lerp(a.x, b.x, q), U.lerp(a.y, b.y, q), 3, P.ok);
        }
      }
      var secs = RTO[from] * k;
      D.pill(ctx, '⏱ RTO ' + U.fmtTime(secs) + (k >= 1 ? ' ✓' : ''), b.x, b.y - L.nh * 0.5 - 16, { color: P.ok, size: fs * 0.9, align: 'center' });
      if (!this.mobile) D.text(ctx, RTO_TXT[from], b.x, b.y - L.nh * 0.5 - 36, { size: fs * 0.75, color: P.text3, align: 'center' });
    },
    drawBadge: function (ctx) {
      var P = S.pal, L = this.L, fs = L.fs, r = this.rule(), m = this.mobile;
      var x = this.w - (m ? 8 : 16), y = m ? 14 : 18;
      var txt = r.met ? '3-2-1 MET ✓' + (r.air ? ' +1 offline' : '') : '3-2-1 · ' + r.copies + ' copies · ' + r.media + ' media · ' + r.off + ' offsite';
      if (m) x = 8;
      D.pill(ctx, txt, x, y, { color: r.met ? P.ok : P.warn, size: fs * 0.88, align: m ? 'left' : 'right' });
    },
    drawScore: function (ctx) {
      var P = S.pal, L = this.L, R = L.score, fs = L.fs, m = this.mobile, self = this;
      D.box(ctx, R.x, R.y, R.w, R.h, 8, U.rgba(P.panel, 0.94), U.rgba(P.blueprint, 0.35), 1);
      D.text(ctx, 'SCOREBOARD', R.x + 10, R.y + 13, { size: fs * 0.8, weight: 700, color: P.text3, ls: 1.5 });
      var rh = Math.min(m ? 19 : 24, (R.h - 44) / 4);
      if (this.st) {
        var b = this.best(this.st), lt = this.st.live === 'ok' ? '→ no restore needed' : b ? '→ restore: ' + this.label(b) + ' · ' + U.fmtTime(RTO[b]) : '→ nothing left to restore';
        D.text(ctx, lt, R.x + 10, R.y + 30 + 4 * rh + 4, { size: fs * 0.8, weight: 700, color: this.st.live === 'ok' || b ? P.ok : P.fault, maxW: R.w - 20 });
      }
      DIS.forEach(function (d, i) {
        var y = R.y + 30 + i * rh, sc = self.score[d.key];
        D.text(ctx, d.name, R.x + 10, y, { size: fs * 0.85, color: self.dis === d.key ? P.text1 : P.text2, weight: self.dis === d.key ? 700 : 500, maxW: R.w - 50 });
        D.text(ctx, sc == null ? '·' : sc ? '✓' : '✕', R.x + R.w - 14, y, { size: fs * 1.15, weight: 700, color: sc == null ? P.text3 : sc ? P.ok : P.fault, align: 'right' });
      });
    },
    describe: function () {
      var r = this.rule(), h = this.has;
      var s = 'Copies: server' + (h.snap ? ' with snapshots' : '') + (h.raid ? ' on RAID' : '') + (h.usb ? ', USB drive' : '') + (h.offline ? ', offline copy' : '') + (h.cloud ? ', cloud' + (h.imm ? ' (immutable)' : '') : '') + '. 3-2-1 ' + (r.met ? 'met' : 'not met') + '.';
      if (this.dis) { var b = this.best(this.st); s += ' After ' + this.dis + ': ' + (this.st.live === 'ok' ? 'server still running.' : b ? 'restore from ' + this.label(b) + '.' : 'all data lost.'); }
      return s;
    }
  });
})(window.SRV);
