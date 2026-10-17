/* Ch7 · Channel puzzle: a 12-channel CPU with 2 DIMM slots per channel. Click slots (or use the
   preset buttons) to populate 32 GB sticks. Bandwidth = populated channels × MT/s × 8 B; a second
   stick per channel drops the speed; uneven layouts hatch yellow; mixing RDIMM + LRDIMM won't boot. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var NCH = 12, GB = 32, LETTERS = 'ABCDEFGHIJKL';

  S.defineVisual('channels', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.slot = [];   // logical: null | 'R' | 'L'   (index = ch*2 + s)
      this.vis = [];    // type being drawn (kept during removal animation)
      this.ins = [];    // insertion progress 0..1
      for (var i = 0; i < NCH * 2; i++) { this.slot.push(null); this.vis.push(null); this.ins.push(0); }
      this.hover = -1;
      this.flash = 0;   // red pulse on boot error
      this.paths = [];
      this.bwShown = 0;
      var self = this;
      var g = this.ui.group('Populate memory');
      g.button('Fill 1 per channel', function () { self.preset('one'); }, { kind: 'primary' });
      g.button('Fill 6 (unbalanced)', function () { self.preset('six'); });
      g.button('Fill 2 per channel', function () { self.preset('two'); });
      g.button('Mix in an LRDIMM', function () { self.preset('mix'); }, { kind: 'danger' });
      g.button('Clear', function () { self.preset('clear'); });
      this.ui.br();
      this.rCap = this.ui.readout('Capacity', '–');
      this.rBw = this.ui.readout('Bandwidth', '–');
      this.rSpd = this.ui.readout('Speed', '–');
      this.rStat = this.ui.readout('Status', '–');

      this.pointer({
        down: function (p) {
          var hit = this.hits.query(p.x, p.y);
          if (hit) { this.toggleSlot(hit.data); return false; }
          return false;
        },
        hover: function (p) {
          var hit = this.hits.query(p.x, p.y), idx = hit ? hit.data : -1;
          if (idx !== this.hover) { this.hover = idx; this.invalidate(); }
          this.stage.style.cursor = hit ? 'pointer' : '';
          if (hit) {
            var ch = idx >> 1, s = idx & 1, t = this.slot[idx];
            this.tipAt('<b>Channel ' + LETTERS[ch] + ' · slot ' + (s + 1) + '</b><br>' +
              (t ? '32 GB ' + (t === 'L' ? 'LRDIMM' : 'RDIMM') + ' · click to remove' : 'Empty · click to add a 32 GB RDIMM'), p.x, p.y);
          } else this.tipAt(null);
        },
        leave: function () { this.hover = -1; this.stage.style.cursor = ''; }
      });
      this.setSlot(0, 'R', 0);
      this.refresh(true);
    },

    // ------------------------------------------------------------ state
    setSlot: function (i, type, delay) {
      var prev = this.slot[i];
      if (prev === type) return;
      this.slot[i] = type;
      var self = this;
      if (this._tw && this._tw[i]) this._tw[i].cancel();
      this._tw = this._tw || [];
      if (type) {
        this.vis[i] = type;
        if (prev) this.ins[i] = 0.3;
        this._tw[i] = this.tween({ from: this.ins[i], to: 1, dur: 0.45, delay: delay || 0, ease: 'outBack', onUpdate: function (v) { self.ins[i] = v; } });
      } else {
        this._tw[i] = this.tween({ from: this.ins[i], to: 0, dur: 0.25, delay: delay || 0, ease: 'outCubic', onUpdate: function (v) { self.ins[i] = v; },
          onDone: function () { if (!self.slot[i]) self.vis[i] = null; } });
      }
    },
    toggleSlot: function (i) {
      this.setSlot(i, this.slot[i] ? null : 'R', 0);
      this.refresh();
    },
    preset: function (kind) {
      var i, k = 0;
      if (kind === 'mix') {
        for (i = 0; i < NCH; i++) if (!this.slot[i * 2] && i !== 5) this.setSlot(i * 2, 'R', (k++) * 0.03);
        this.setSlot(5 * 2, 'L', 0.15);
      } else {
        for (i = 0; i < NCH * 2; i++) {
          var ch = i >> 1, s = i & 1, want = null;
          if (kind === 'one') want = s === 0 ? 'R' : null;
          else if (kind === 'two') want = 'R';
          else if (kind === 'six') want = (s === 0 && ch < 6) ? 'R' : null;
          if (want !== this.slot[i]) this.setSlot(i, want, (k++) * 0.03);
        }
      }
      this.refresh();
    },
    stats: function () {
      var st = { sticks: 0, chans: 0, two: false, R: 0, L: 0, counts: [], max: 0 };
      for (var c = 0; c < NCH; c++) {
        var n = 0;
        for (var s = 0; s < 2; s++) { var t = this.slot[c * 2 + s]; if (t) { n++; st[t]++; } }
        st.counts.push(n); st.sticks += n; if (n) st.chans++; if (n === 2) st.two = true; if (n > st.max) st.max = n;
      }
      st.mixed = st.R > 0 && st.L > 0;
      st.balanced = st.sticks > 0 && st.counts.every(function (n) { return n === st.counts[0]; });
      st.mts = st.two ? 5200 : 6400;
      st.bw = st.mixed ? 0 : st.chans * st.mts * 8 / 1000;
      st.state = st.sticks === 0 ? 'none' : st.mixed ? 'boot' : st.balanced ? 'ok' : 'unbal';
      return st;
    },
    refresh: function (silent) {
      var st = this.st = this.stats(), self = this;
      this.rCap.set(st.sticks ? (st.sticks * GB) + ' GB' : '0 GB');
      this.rBw.set(st.state === 'boot' || st.state === 'none' ? '—' : U.fmt(st.bw, 0) + ' GB/s', st.state === 'ok' ? 'ok' : st.state === 'unbal' ? 'warn' : 'bad');
      this.rSpd.set(st.sticks ? 'DDR5-' + st.mts + (st.two ? ' (2 per ch)' : '') : '—', st.two ? 'warn' : '');
      this.rStat.set(st.state === 'ok' ? 'Balanced ✓' : st.state === 'unbal' ? 'Unbalanced ⚠' : st.state === 'boot' ? 'Won’t boot ✕' : 'No memory ✕',
        st.state === 'ok' ? 'ok' : st.state === 'unbal' ? 'warn' : 'bad');
      if (st.state === 'boot') this.tween({ from: 1, to: 0, dur: 1.6, ease: 'outCubic', onUpdate: function (v) { self.flash = v; } });
      var from = this.bwShown;
      this.tween({ from: from, to: st.bw, dur: 0.7, onUpdate: function (v) { self.bwShown = v; } });
      if (!silent) this.announce(this.describe());
      this.setDesc(this.describe());
    },
    describe: function () {
      var st = this.st || this.stats();
      if (st.state === 'none') return 'No memory installed: the server will not start.';
      if (st.state === 'boot') return 'RDIMMs and an LRDIMM are mixed: the server will not boot.';
      return st.sticks + ' sticks (' + st.sticks * GB + ' GB) on ' + st.chans + ' of 12 channels at DDR5-' + st.mts + ': ' + U.fmt(st.bw, 0) + ' GB/s, ' + (st.state === 'ok' ? 'balanced.' : 'unbalanced.');
    },

    // ------------------------------------------------------------ layout
    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      if (m) {
        L.bx = 8; L.by = 8; L.bw = w - 16; L.bh = Math.round(h * 0.64);
        L.ix = 8; L.iy = L.by + L.bh + 8; L.iw = w - 16; L.ih = h - L.iy - 8;
      } else {
        L.bx = 14; L.by = 14; L.bw = Math.round(w * 0.62) - 20; L.bh = h - 28;
        L.ix = L.bx + L.bw + 12; L.iy = 14; L.iw = w - L.ix - 14; L.ih = h - 28;
      }
      var lsp = U.clamp(L.bh * 0.026, 4, 8);
      L.lsp = lsp;
      L.sy0 = L.by + (m ? 52 : 48);
      L.sy1 = L.by + L.bh - (m ? 14 : 20) - 6 * lsp - 10;
      L.cs = Math.min(L.bw * (m ? 0.2 : 0.2), (L.sy1 - L.sy0) * 0.62);
      L.cx = L.bx + L.bw / 2; L.cy = (L.sy0 + L.sy1) / 2;
      var gap = m ? 8 : 16, pad = m ? 8 : 16;
      var bankW = (L.cx - L.cs / 2 - gap) - (L.bx + pad);
      var cw = bankW / 6;
      L.sw = Math.max(5, Math.min(cw * 0.34, 16));
      L.sgap = Math.max(2, cw * 0.1);
      L.cw = cw;
      // slot x positions
      L.sx = [];
      L.chx = [];
      for (var c = 0; c < NCH; c++) {
        var left = c < 6, j = left ? c : c - 6;           // A..F left bank outer→inner, G..L right bank inner→outer
        var x0 = left ? L.bx + pad + j * cw : L.cx + L.cs / 2 + gap + j * cw;
        var mid = x0 + cw / 2;
        L.chx.push(mid);
        L.sx.push(mid - L.sgap / 2 - L.sw, mid + L.sgap / 2);
      }
      // trace paths: CPU bottom edge → bus lane → up into the channel
      this.paths = [];
      var bottom = L.cy + L.cs / 2;
      for (c = 0; c < NCH; c++) {
        var lft = c < 6, d = lft ? 5 - c : c - 6;         // d = 0 innermost
        var xs = lft ? L.cx - L.cs / 2 + L.cs * 0.1 + d * L.cs * 0.055 : L.cx + L.cs / 2 - L.cs * 0.1 - d * L.cs * 0.055;
        var ly = L.sy1 + 10 + d * lsp;
        var pts = [xs, bottom, xs, ly, L.chx[c], ly, L.chx[c], L.sy1 + 2];
        this.paths.push({ pts: pts, lens: D.polyLen(pts) });
      }
      this.tmp = {};
    },

    // ------------------------------------------------------------ draw
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, st = this.st, m = this.mobile, t = this.time, self = this;
      D.clear(ctx, w, h);
      this.hits.clear();
      // board
      D.box(ctx, L.bx, L.by, L.bw, L.bh, 10, U.rgba(P.pcb, P.dark ? 0.22 : 0.12), U.rgba(P.blueprint, 0.35), 1);
      D.text(ctx, 'CPU SOCKET · 12 MEMORY CHANNELS × 2 SLOTS', L.bx + 10, L.by + (m ? 11 : 13), { size: m ? 8.5 : 10, weight: 700, color: P.text3, ls: 1.2 });
      if (st.state === 'boot' && this.flash > 0) { D.box(ctx, L.bx, L.by, L.bw, L.bh, 10, U.rgba(P.fault, 0.12 * this.flash)); }

      // traces + beads
      var live = st.state === 'ok' || st.state === 'unbal';
      for (var c = 0; c < NCH; c++) {
        var pth = this.paths[c], n = st.counts[c];
        var on = n > 0 && live;
        D.poly(ctx, pth.pts, false);
        ctx.strokeStyle = on ? U.rgba(P.data, 0.55) : U.rgba(P.blueprint, 0.22); ctx.lineWidth = on ? 1.6 : 1; ctx.lineJoin = 'round'; ctx.stroke();
        // T into both slots
        var tx = L.chx[c];
        D.line(ctx, L.sx[c * 2] + L.sw / 2, L.sy1 + 2, L.sx[c * 2 + 1] + L.sw / 2, L.sy1 + 2, on ? U.rgba(P.data, 0.55) : U.rgba(P.blueprint, 0.22), on ? 1.6 : 1);
        if (on) {
          var total = pth.lens[pth.lens.length - 1], speed = 70 * (st.mts / 6400), nb = 4, o = this.tmp;
          for (var k = 0; k < nb; k++) {
            var s = ((t * speed + k * total / nb + c * 13) % total);
            if (k % 2) s = total - s;
            D.along(pth.pts, pth.lens, s, o);
            D.circle(ctx, o.x, o.y, 2.2, P.data);
            D.glow(ctx, o.x, o.y, 7, P.data, 0.5);
          }
        }
        void tx;
      }

      // CPU package
      var cs = L.cs, x0 = L.cx - cs / 2, y0 = L.cy - cs / 2;
      D.box(ctx, x0 - 4, y0 - 4, cs + 8, cs + 8, 6, U.rgba(P.steel, 0.35), U.rgba(P.blueprint, 0.5), 1);
      D.box(ctx, x0, y0, cs, cs, 4, U.shade(P.silicon, P.dark ? -0.1 : 0.1), U.rgba(P.alu, 0.5), 1);
      // chiplets: IO die + 8 CCDs
      var io = cs * 0.34;
      D.box(ctx, L.cx - io / 2, L.cy - io * 0.7, io, io * 1.4, 2, U.shade(P.silicon, 0.25), null);
      for (var q = 0; q < 8; q++) {
        var side = q < 4 ? -1 : 1, row = q % 4, cwid = cs * 0.17, chh = cs * 0.16;
        var ccx = L.cx + side * (io / 2 + cs * 0.06 + cwid / 2), ccy = y0 + cs * 0.12 + row * (cs * 0.76 / 3.4) + chh / 2;
        D.box(ctx, ccx - cwid / 2, ccy - chh / 2, cwid, chh, 1.5, U.shade(P.silicon, 0.12), null);
      }
      D.text(ctx, 'CPU', L.cx, L.cy - 4, { size: m ? 9 : 11, weight: 800, color: P.text1, align: 'center', ls: 1 });
      D.text(ctx, '12 ch', L.cx, L.cy + (m ? 7 : 9), { size: m ? 7.5 : 9, weight: 600, color: P.text2, align: 'center' });

      // channels + slots
      var slotH = L.sy1 - L.sy0;
      for (c = 0; c < NCH; c++) {
        var cnt = st.counts[c];
        var cx0 = L.chx[c] - L.cw / 2 + 2, cwid2 = L.cw - 4;
        var unb = st.state === 'unbal' && cnt !== st.max;
        if (unb) {
          ctx.save(); D.rr(ctx, cx0, L.sy0 - 6, cwid2, slotH + 12, 4);
          ctx.fillStyle = U.rgba(P.warn, 0.05); ctx.fill();
          ctx.fillStyle = D.hatch(ctx, U.rgba(P.warn, 0.22), 7); ctx.fill();
          ctx.strokeStyle = U.rgba(P.warn, 0.4); ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        }
        D.text(ctx, LETTERS[c], L.chx[c], L.sy0 - (m ? 11 : 15), { size: m ? 9 : 11, weight: 700, align: 'center',
          color: unb ? P.warn : cnt ? P.data : P.text3 });
        for (var s2 = 0; s2 < 2; s2++) {
          var idx = c * 2 + s2, sx = L.sx[idx];
          this.drawSlot(ctx, sx, L.sy0, L.sw, slotH, idx);
          this.hits.rect('slot', sx - 2, L.sy0 - 4, L.sw + 4, slotH + 8, idx);
        }
      }
      // bank captions
      if (!m) {
        D.text(ctx, '1st slot of each pair = slot 1 · fill those first', L.bx + L.bw / 2, L.by + L.bh - 10, { size: 9, color: P.text3, align: 'center' });
      }

      if (st.state === 'boot') {
        var bw2 = Math.min(L.bw - 20, m ? 250 : 300);
        var by2 = L.cy - 30;
        D.box(ctx, L.cx - bw2 / 2, by2, bw2, 60, 8, U.rgba(P.panel, 0.95), P.fault, 1.5);
        ctx.save(); D.rr(ctx, L.cx - bw2 / 2, by2, bw2, 60, 8); ctx.clip();
        ctx.fillStyle = D.hatch(ctx, U.rgba(P.fault, 0.18), 7, true); ctx.fillRect(L.cx - bw2 / 2, by2, bw2, 60); ctx.restore();
        D.g.cross(ctx, L.cx - bw2 / 2 + 24, by2 + 30, 26, P.fault);
        D.text(ctx, 'WON’T BOOT', L.cx - bw2 / 2 + 44, by2 + 21, { size: m ? 13 : 15, weight: 800, color: P.fault, ls: 1 });
        D.text(ctx, 'RDIMM + LRDIMM can’t mix', L.cx - bw2 / 2 + 44, by2 + 41, { size: m ? 9.5 : 10.5, weight: 600, color: P.text1 });
      }

      this.drawInfo(ctx);
      void self; void w; void h;
    },

    drawSlot: function (ctx, x, y, sw, sh, idx) {
      var P = S.pal, type = this.vis[idx], k = this.ins[idx], hov = this.hover === idx, first = (idx & 1) === 0;
      // socket body
      D.box(ctx, x, y, sw, sh, 2, U.shade(P.plastic, P.dark ? -0.35 : 0.25), U.rgba(first ? P.blueprint : P.alu, hov ? 0.9 : 0.35), hov ? 1.5 : 1);
      // latches
      var lw = sw + 4, lh = Math.max(4, sw * 0.5);
      var open = 1 - U.clamp(k, 0, 1);
      ctx.fillStyle = first ? U.shade(P.blueprint, P.dark ? -0.3 : 0.1) : U.shade(P.alu, -0.2);
      ctx.fillRect(x - 2 - open * 2, y - lh + 1, lw, lh - 1);
      ctx.fillRect(x - 2 + open * 2, y + sh, lw, lh - 1);
      if (!type || k <= 0.01) {
        D.line(ctx, x + sw / 2, y + 6, x + sw / 2, y + sh - 6, U.rgba(P.text3, 0.4), 1, [2, 3]);
        if (hov) D.text(ctx, '+', x + sw / 2, y + sh / 2, { size: 13, weight: 700, color: P.accent, align: 'center' });
        return;
      }
      // stick drops in from above
      var off = (1 - k) * -26, a = U.clamp(k * 1.5, 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      var mx = x + 1, my = y + 2 + off, mw = sw - 2, mh = sh - 4;
      var isL = type === 'L';
      var bad = isL && this.st.state === 'boot';
      D.box(ctx, mx, my, mw, mh, 1.5, isL ? U.mix(P.copper, P.gold, 0.4) : P.pcb, U.rgba('#000', 0.25), 1);
      // chips
      var nchip = 9, ch = (mh - 8) / nchip;
      for (var i = 0; i < nchip; i++) {
        D.box(ctx, mx + mw * 0.18, my + 4 + i * ch + ch * 0.12, mw * 0.64, ch * 0.76, 1, isL ? U.shade(P.copper, -0.35) : U.shade(P.silicon, -0.1));
      }
      if (isL) {
        D.box(ctx, mx + mw * 0.1, my + mh * 0.44, mw * 0.8, mh * 0.12, 1, P.silicon);
        if (sw >= 10) D.text(ctx, 'LR', mx + mw / 2, my + mh * 0.5, { size: 7, weight: 800, color: P.text1, align: 'center' });
      }
      // gold contact edge at the bottom
      ctx.fillStyle = P.gold; ctx.fillRect(mx + 1, my + mh - 3, mw - 2, 2);
      if (bad) {
        ctx.fillStyle = D.hatch(ctx, U.rgba(P.fault, 0.8), 4, true); D.rr(ctx, mx, my, mw, mh, 1.5); ctx.fill();
        D.box(ctx, mx - 1, my - 1, mw + 2, mh + 2, 2, null, P.fault, 1.5);
      }
      if (hov) D.box(ctx, mx - 2, my - 2, mw + 4, mh + 4, 3, null, P.accent, 1.5);
      ctx.restore();
    },

    drawInfo: function (ctx) {
      var P = S.pal, L = this.L, st = this.st, m = this.mobile;
      var x = L.ix, y = L.iy, w = L.iw, h = L.ih;
      D.box(ctx, x, y, w, h, 10, U.rgba(P.panel, 0.55), U.rgba(P.blueprint, 0.25), 1);
      var pad = m ? 10 : 16, cx = x + pad, iw = w - pad * 2;
      var stCol = st.state === 'ok' ? P.ok : st.state === 'unbal' ? P.warn : P.fault;
      var stTxt = st.state === 'ok' ? 'BALANCED ✓' : st.state === 'unbal' ? 'UNBALANCED ⚠' : st.state === 'boot' ? 'WON’T BOOT ✕' : 'NO MEMORY ✕';
      var bwTxt = (st.state === 'ok' || st.state === 'unbal') ? U.fmt(this.bwShown, 0) : '—';
      var frac = this.bwShown / 614.4;

      if (m) {
        // two columns: capacity / speed  |  bandwidth big
        var colW = iw / 2;
        D.text(ctx, 'CAPACITY', cx, y + 14, { size: 8.5, weight: 700, color: P.text3, ls: 1 });
        D.text(ctx, (st.sticks * GB) + ' GB', cx, y + 32, { size: 17, weight: 800, color: P.text1 });
        D.text(ctx, st.sticks + ' × 32 GB', cx, y + 48, { size: 9, color: P.text2 });
        D.text(ctx, 'SPEED', cx + colW, y + 14, { size: 8.5, weight: 700, color: P.text3, ls: 1 });
        D.text(ctx, st.sticks ? 'DDR5-' + st.mts : '—', cx + colW, y + 32, { size: 15, weight: 800, color: st.two ? P.warn : P.text1 });
        D.text(ctx, st.two ? '2 per channel ↓' : '1 per channel', cx + colW, y + 48, { size: 9, color: st.two ? P.warn : P.text2 });
        var by = y + 64;
        D.text(ctx, 'BANDWIDTH', cx, by, { size: 8.5, weight: 700, color: P.text3, ls: 1 });
        D.text(ctx, bwTxt + ' GB/s', cx + iw, by, { size: 13, weight: 800, color: st.bw ? P.data : P.text3, align: 'right' });
        this.drawMeter(ctx, cx, by + 12, iw, 9, frac, st);
        var pill = D.pill(ctx, stTxt, cx, by + 50, { color: stCol, size: 10, align: 'left' });
        D.text(ctx, st.chans + '/12 ch × ' + U.fmt(st.mts) + ' MT/s × 8 B', pill.x + pill.w + 8, by + 50, { size: 8.5, color: P.text3, maxW: iw - pill.w - 8 });
        return;
      }
      var yy = y + 22;
      D.text(ctx, 'CAPACITY', cx, yy, { size: 10, weight: 700, color: P.text3, ls: 1.5 });
      D.text(ctx, (st.sticks * GB) + ' GB', cx, yy + 26, { size: 26, weight: 800, color: P.text1 });
      D.text(ctx, st.sticks + ' stick' + (st.sticks === 1 ? '' : 's') + ' × 32 GB', cx, yy + 48, { size: 10, color: P.text2 });
      yy += 76;
      D.text(ctx, 'BANDWIDTH', cx, yy, { size: 10, weight: 700, color: P.text3, ls: 1.5 });
      D.text(ctx, bwTxt, cx, yy + 26, { size: 26, weight: 800, color: st.bw ? P.data : P.text3 });
      D.text(ctx, 'GB/s', cx + D.measure(ctx, bwTxt, 26, 800) + 6, yy + 30, { size: 11, weight: 600, color: P.text2 });
      this.drawMeter(ctx, cx, yy + 46, iw, 10, frac, st);
      D.text(ctx, st.chans + ' ch × ' + U.fmt(st.mts) + ' MT/s × 8 B', cx, yy + 82, { size: 10, color: P.text2, maxW: iw });
      yy += 106;
      D.text(ctx, 'SPEED', cx, yy, { size: 10, weight: 700, color: P.text3, ls: 1.5 });
      D.text(ctx, st.sticks ? 'DDR5-' + st.mts : '—', cx, yy + 22, { size: 18, weight: 800, color: st.two ? P.warn : P.text1 });
      if (st.two) D.text(ctx, '↓ 2 sticks per channel', cx, yy + 42, { size: 10, weight: 600, color: P.warn, maxW: iw });
      else D.text(ctx, '1 stick per channel', cx, yy + 42, { size: 10, color: P.text2 });
      var py = Math.min(y + h - 24, yy + 72);
      D.pill(ctx, stTxt, cx, py, { color: stCol, size: 12, align: 'left', pad: 8 });
    },

    drawMeter: function (ctx, x, y, w, h, frac, st) {
      var P = S.pal;
      D.box(ctx, x, y, w, h, h / 2, U.rgba(P.panel3, 0.9));
      if (frac > 0.001) {
        D.box(ctx, x, y, Math.max(h, w * U.clamp(frac, 0, 1)), h, h / 2, st.state === 'unbal' ? U.mix(P.data, P.warn, 0.35) : P.data);
      }
      // ticks: 1 ch, 6 ch, 12 ch
      [[51.2, '51'], [307.2, '307'], [614.4, '614']].forEach(function (tk) {
        var tx = x + w * tk[0] / 614.4;
        D.line(ctx, tx, y - 3, tx, y + h + 3, U.rgba(P.text2, 0.6), 1);
        D.text(ctx, tk[1], tx, y + h + 11, { size: 8.5, color: P.text3, align: tk[0] > 600 ? 'right' : 'center' });
      });
    }
  });
})(window.SRV);
