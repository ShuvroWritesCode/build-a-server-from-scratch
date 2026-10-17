/* Ch7 · Cosmic ray vs ECC. A bank balance ($1,024.00 = 102,400 cents) lives in a 32-bit memory word on a
   DIMM. A cosmic ray flips one bit. ECC on: 7 check bits (real Hamming SECDED maths) spot the flip and the
   syndrome points straight at it → corrected. ECC off: the balance silently changes. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var START = 102400; // cents

  // Hamming(38,32) positions + overall parity → SECDED (39,32)
  var DPOS = [];
  (function () { for (var p = 3; DPOS.length < 32; p++) if ((p & (p - 1)) !== 0) DPOS.push(p); })();
  function checks(word) {
    var c = [0, 0, 0, 0, 0, 0], all = 0;
    for (var i = 0; i < 32; i++) {
      if (!((word >>> i) & 1)) continue;
      all ^= 1;
      for (var k = 0; k < 6; k++) if (DPOS[i] & (1 << k)) c[k] ^= 1;
    }
    for (k = 0; k < 6; k++) all ^= c[k];
    c.push(all);
    return c;
  }
  function money(c) { return '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  S.defineVisual('ecc', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.ecc = true;
      this.word = START; this.chk = checks(START); this.shown = START;
      this.flash = new Float32Array(32);
      this.cflash = new Float32Array(7);
      this.ray = { on: false, t: 0, x0: 0, y0: 0, x1: 0, y1: 0, bit: 0 };
      this.ring = 0; this.ringBit = 0;
      this.phase = 'idle';      // idle | flight | checking | fixed | silent
      this.corr = 0;            // correction sweep 0..1
      this.glitch = 0;
      this.syn = null;          // {bits:[6], pos, bit}
      this.lastDelta = 0;
      this.autoT = 2.2;
      this.n = { fired: 0, fixed: 0, silent: 0 };
      var self = this;
      var g = this.ui.group('Cosmic ray');
      this.bFire = g.button('☄ Fire cosmic ray', function () { self.fire(); }, { kind: 'primary' });
      this.tEcc = g.toggle({ label: 'ECC memory', value: true, onChange: function (v) { self.setEcc(v); } });
      g.button('↺ Reset balance', function () { self.reset(); });
      this.ui.br();
      this.rBal = this.ui.readout('Balance read', money(START), 'ok');
      this.rFix = this.ui.readout('Corrected', '0');
      this.rSil = this.ui.readout('Silent errors', '0');
      this.setDesc(this.describe());
    },
    describe: function () {
      if (this.phase === 'silent') return 'ECC is off. A cosmic ray flipped one bit and the balance silently changed to ' + money(this.shown) + '.';
      if (this.phase === 'fixed') return 'ECC is on. A cosmic ray flipped one bit; the check bits located it and corrected it. Balance still ' + money(this.shown) + '.';
      return 'A memory chip holds a bank balance of ' + money(this.shown) + ' as 32 bits. ECC is ' + (this.ecc ? 'on (7 check bits).' : 'off (no check bits).');
    },
    setEcc: function (on) {
      this.ecc = on;
      if (on) { this.chk = checks(this.word); }
      this.phase = 'idle'; this.syn = null;
      this.announce(on ? 'ECC on. Seven check bits now guard the word.' : 'ECC off. Nothing checks the word any more.');
      this.setDesc(this.describe());
    },
    reset: function () {
      this.word = START; this.chk = checks(START); this.shown = START; this.phase = 'idle'; this.syn = null; this.lastDelta = 0;
      this.syncReadouts();
      this.announce('Balance reset to ' + money(START) + '.');
      this.setDesc(this.describe());
    },
    syncReadouts: function () {
      this.rBal.set(money(this.shown), this.shown === START ? 'ok' : 'bad');
      this.rFix.set(String(this.n.fixed), this.n.fixed ? 'ok' : '');
      this.rSil.set(String(this.n.silent), this.n.silent ? 'bad' : '');
    },
    cellCenter: function (bit) {
      var L = this.L, idx = 31 - bit, row = (idx / 16) | 0, col = idx % 16;
      return { x: L.gx + col * (L.cz + L.cg) + L.cz / 2, y: L.gy + row * (L.cz + L.cg) + L.cz / 2 };
    },
    fire: function () {
      if (this.phase === 'flight' || this.phase === 'checking' || !this.L) return;
      var self = this, bit = this.rng.int(6, 22);
      var c = this.cellCenter(bit), L = this.L;
      var r = this.ray;
      r.on = true; r.bit = bit; r.x1 = c.x; r.y1 = c.y;
      r.x0 = Math.min(this.w + 30, c.x + (this.mobile ? 160 : 300)); r.y0 = -30;
      r.t = 0;
      this.phase = 'flight'; this.syn = null;
      this.n.fired++;
      this.autoT = 5.5;
      void L;
      this.tween({ from: 0, to: 1, dur: 0.75, ease: 'inQuad', onUpdate: function (v) { r.t = v; }, onDone: function () { self.hit(); } });
    },
    hit: function () {
      var self = this, bit = this.ray.bit, before = this.word;
      this.ray.on = false;
      this.word = (this.word ^ (1 << bit)) >>> 0;
      this.lastDelta = this.word - before;
      this.ringBit = bit;
      this.tween({ from: 1, to: 0, dur: 1.4, ease: 'outCubic', onUpdate: function (v) { self.flash[bit] = v; } });
      this.tween({ from: 0, to: 1, dur: 0.7, ease: 'outCubic', onUpdate: function (v) { self.ring = v; } });
      if (this.ecc) {
        this.phase = 'checking';
        var now = checks(this.word), bits = [], pos = 0;
        for (var k = 0; k < 6; k++) { bits.push(now[k] ^ this.chk[k]); if (bits[k]) pos |= (1 << k); }
        this.syn = { bits: bits, pos: pos, bit: DPOS.indexOf(pos) };
        this.corr = 0;
        this.tween({ from: 0, to: 1, dur: 1.1, delay: 0.35, ease: 'inOutSine', onUpdate: function (v) {
          self.corr = v;
          for (var j = 0; j < 6; j++) self.cflash[j] = bits[j] ? Math.sin(v * Math.PI) : 0;
        }, onDone: function () {
          self.word = (self.word ^ (1 << bit)) >>> 0;
          self.phase = 'fixed'; self.n.fixed++;
          self.tween({ from: 1, to: 0, dur: 0.9, onUpdate: function (v) { self.flash[bit] = v; } });
          self.syncReadouts();
          self.announce('One bit flipped. ECC located it at position ' + pos + ' and corrected it. Balance unchanged.');
          self.setDesc(self.describe());
        } });
      } else {
        this.phase = 'silent';
        this.tween({ from: 0, to: 1, dur: 0.3, delay: 0.35, onUpdate: function (v, e, k) {
          if (k > 0 && self.shown !== self.word) { self.shown = self.word; self.n.silent++; self.syncReadouts(); }
          self.glitch = 1 - v;
        }, onDone: function () {
          self.announce('One bit flipped with no ECC. The balance silently changed to ' + money(self.shown) + '.');
          self.setDesc(self.describe());
        } });
      }
    },
    update: function (dt) {
      if (this.phase === 'flight' || this.phase === 'checking') return;
      this.autoT -= dt;
      if (this.autoT <= 0) this.fire();
    },

    resize: function (w, h) {
      var m = this.mobile = w < 560, L = this.L = {};
      var pad = m ? 12 : 18;
      L.pad = pad;
      L.lx = pad; L.lw = m ? w - pad * 2 : Math.round(w * 0.58) - pad;
      L.cg = m ? 2 : 3;
      L.cz = Math.min(m ? 22 : 28, (L.lw - 15 * L.cg) / 16);
      L.kz = Math.min(L.cz, m ? 20 : 24);
      L.bh = m ? 54 : 48; L.by = h - L.bh - (m ? 10 : 14);
      var dh = m ? 34 : U.clamp(h * 0.13, 40, 60);
      var natural = dh + (m ? 34 : 46) + 2 * L.cz + L.cg + (m ? 24 : 30) + L.kz + (m ? 0 : 12);
      var top = m ? 50 : 36, avail = (m ? L.by - 150 : L.by - 14) - top;
      var spare = Math.max(0, avail - natural);
      L.dh = dh;
      L.dy = top + spare * (m ? 0 : 0.25);
      L.gx = L.lx + (L.lw - (16 * L.cz + 15 * L.cg)) / 2;
      L.gy = L.dy + L.dh + (m ? 34 : 46) + spare * (m ? 0 : 0.3);
      L.ky = L.gy + 2 * L.cz + L.cg + (m ? 24 : 30) + spare * (m ? 0 : 0.15);
      if (m) {
        L.sx = pad; L.sw = w - pad * 2; L.sy = L.ky + L.kz + 26; L.sh = Math.max(64, L.by - 10 - L.sy);
      } else {
        L.sx = Math.round(w * 0.62); L.sw = w - L.sx - pad; L.sy = L.dy; L.sh = U.clamp(L.gy + 2 * L.cz - L.sy, 110, 170);
      }
    },

    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, L = this.L, m = this.mobile, t = this.time;
      D.clear(ctx, w, h);
      var ecc = this.ecc;
      // ---- DIMM
      D.text(ctx, ecc ? 'ECC RDIMM · 8 DATA CHIPS + 1 ECC CHIP' : 'NON-ECC DIMM · 8 DATA CHIPS', L.lx, L.dy - 12, { size: m ? 8.5 : 10, weight: 700, color: P.text3, ls: 1.2 });
      var dx = L.lx, dy = L.dy, dw = L.lw, dh = L.dh;
      D.box(ctx, dx, dy, dw, dh, 3, P.pcb, U.rgba('#000', 0.3), 1);
      // gold fingers + notch
      var fy = dy + dh - 7, nf = m ? 40 : 64, fw = dw / nf;
      for (var i = 0; i < nf; i++) if (Math.abs(i - nf * 0.45) > 0.8) { ctx.fillStyle = P.gold; ctx.fillRect(dx + i * fw + fw * 0.2, fy, fw * 0.6, 6); }
      var nchips = 9, chw = (dw - 24) / nchips, chh = dh - 18, targetChip = (31 - this.ray.bit) >> 2;
      var hitChip = this.phase !== 'idle' ? Math.floor((31 - (this.ray.bit)) / 4) : -1;
      for (i = 0; i < nchips; i++) {
        var cxp = dx + 12 + i * chw + chw * 0.1, cw = chw * 0.8;
        if (i === 8 && !ecc) { D.box(ctx, cxp, dy + 5, cw, chh, 2, null, U.rgba(P.text3, 0.6), 1); D.line(ctx, cxp + 3, dy + 8, cxp + cw - 3, dy + chh + 2, U.rgba(P.text3, 0.5), 1); continue; }
        var isE = i === 8;
        D.box(ctx, cxp, dy + 5, cw, chh, 2, isE ? U.mix(P.silicon, P.ok, 0.35) : P.silicon, isE ? P.ok : U.rgba(P.alu, 0.3), 1);
        if (!m || isE) D.text(ctx, isE ? 'ECC' : 'D' + i, cxp + cw / 2, dy + 5 + chh / 2, { size: m ? 7.5 : 9, weight: 700, color: isE ? P.ok : P.text3, align: 'center' });
        if (i === hitChip && this.flash[this.ray.bit] > 0.01) D.glow(ctx, cxp + cw / 2, dy + 5 + chh / 2, 26, P.air, this.flash[this.ray.bit]);
      }
      void targetChip;
      // zoom callout from chip (hit chip or D3 by default) to grid
      var zc = hitChip >= 0 ? hitChip : 3;
      var zx = dx + 12 + zc * chw + chw * 0.1, zw = chw * 0.8;
      var gw = 16 * L.cz + 15 * L.cg, gh = 2 * L.cz + L.cg;
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = U.rgba(P.blueprint, 0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(zx, dy + dh - 8); ctx.lineTo(L.gx - 6, L.gy - 20); ctx.moveTo(zx + zw, dy + dh - 8); ctx.lineTo(L.gx + gw + 6, L.gy - 20); ctx.stroke(); ctx.restore();
      // ---- memory word grid
      D.box(ctx, L.gx - 8, L.gy - 22, gw + 16, gh + 30, 6, U.rgba(P.panel, 0.7), U.rgba(P.blueprint, 0.4), 1);
      D.text(ctx, 'MEMORY WORD · ' + U.fmt(this.word) + ' ¢', L.gx, L.gy - 11, { size: m ? 8.5 : 10, weight: 700, color: P.text2, ls: 0.5 });
      if (!m) D.text(ctx, 'bit 31 … 0', L.gx + gw, L.gy - 11, { size: 9, color: P.text3, align: 'right' });
      for (var b = 31; b >= 0; b--) {
        var idx = 31 - b, row = (idx / 16) | 0, col = idx % 16;
        var x = L.gx + col * (L.cz + L.cg), y = L.gy + row * (L.cz + L.cg), v = (this.word >>> b) & 1, f = this.flash[b];
        var good = (START >>> b) & 1, wrong = v !== good && !ecc;
        var fill = v ? U.rgba(P.data, 0.75) : U.rgba(P.panel3, 0.8);
        if (wrong) fill = v ? U.rgba(P.fault, 0.85) : U.rgba(P.fault, 0.25);
        D.box(ctx, x, y, L.cz, L.cz, 3, fill, f > 0.02 ? U.rgba(P.air, f) : U.rgba(P.blueprint, 0.25), f > 0.02 ? 2 : 1);
        D.text(ctx, String(v), x + L.cz / 2, y + L.cz / 2 + 0.5, { size: m ? 9 : 11, weight: 700, color: v ? (P.dark ? '#06121f' : '#ffffff') : P.text3, align: 'center' });
        if (f > 0.02) D.glow(ctx, x + L.cz / 2, y + L.cz / 2, L.cz * 1.4, P.air, f * 0.9);
      }
      // ---- check bits row
      var kz = L.kz, kg = L.cg + 1, kw = 7 * kz + 6 * kg, kx = L.gx;
      var klabel = ecc ? '7 CHECK BITS · stored in the ECC chip' : 'NO CHECK BITS';
      D.text(ctx, klabel, kx, L.ky - 10, { size: m ? 8.5 : 9.5, weight: 700, color: ecc ? P.ok : P.text3, ls: 0.5 });
      var names = ['c1', 'c2', 'c4', 'c8', 'c16', 'c32', 'all'];
      for (i = 0; i < 7; i++) {
        var kxx = kx + i * (kz + kg);
        if (!ecc) { D.box(ctx, kxx, L.ky, kz, kz, 3, null, U.rgba(P.text3, 0.4), 1); continue; }
        var cf = this.cflash[i];
        D.box(ctx, kxx, L.ky, kz, kz, 3, U.rgba(P.ok, 0.25 + 0.15 * this.chk[i]), cf > 0.05 ? U.rgba(P.fault, cf) : U.rgba(P.ok, 0.6), cf > 0.05 ? 2 : 1);
        D.text(ctx, String(this.chk[i]), kxx + kz / 2, L.ky + kz / 2 + 0.5, { size: m ? 9 : 10.5, weight: 700, color: P.text1, align: 'center' });
        if (!m) D.text(ctx, names[i], kxx + kz / 2, L.ky + kz + 9, { size: 8, color: P.text3, align: 'center' });
      }
      if (!m) D.text(ctx, ecc ? '32 data + 7 check = 39 bits stored' : 'only the 32 data bits are stored', kx + kw + 12, L.ky + kz / 2, { size: 9.5, color: P.text3 });

      // ---- impact ring
      if (this.ring > 0 && this.ring < 1) {
        var rc = this.cellCenter(this.ringBit);
        D.circle(ctx, rc.x, rc.y, 6 + this.ring * 34, null, U.rgba(P.air, 1 - this.ring), 2);
      }
      // ---- screen (bank app)
      this.drawScreen(ctx);
      // ---- strip
      this.drawStrip(ctx);
      // ---- ray
      var r = this.ray;
      if (r.on) {
        var px = U.lerp(r.x0, r.x1, r.t), py = U.lerp(r.y0, r.y1, r.t);
        var ang = Math.atan2(r.y1 - r.y0, r.x1 - r.x0), tl = 90;
        var g = ctx.createLinearGradient(px, py, px - Math.cos(ang) * tl, py - Math.sin(ang) * tl);
        g.addColorStop(0, U.rgba(P.air, 0.95)); g.addColorStop(1, U.rgba(P.air, 0));
        ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(ang) * tl, py - Math.sin(ang) * tl); ctx.stroke(); ctx.lineCap = 'butt';
        D.circle(ctx, px, py, 3.5, P.air);
        D.glow(ctx, px, py, 18, P.air, 0.9);
        D.text(ctx, 'cosmic ray', px + 10, py - 8, { size: 9, weight: 600, color: P.air, alpha: 0.8 });
      }
      void t;
    },

    drawScreen: function (ctx) {
      var P = S.pal, L = this.L, m = this.mobile;
      var x = L.sx, y = L.sy, w = L.sw, h = L.sh, ph = this.phase;
      // monitor
      D.box(ctx, x, y, w, h, 8, U.shade(P.steel, P.dark ? -0.45 : 0.3), U.rgba(P.alu, 0.45), 1.2);
      D.box(ctx, x + 6, y + 6, w - 12, h - 12, 5, P.dark ? '#08101d' : U.shade(P.panel, -0.02), null);
      var bad = this.shown !== START;
      D.text(ctx, 'MY BANK · ACCOUNT BALANCE', x + 16, y + (m ? 18 : 22), { size: m ? 8.5 : 9.5, weight: 700, color: P.text3, ls: 1 });
      var gl = this.glitch, tx = x + 16 + (gl > 0.05 ? Math.sin(this.time * 90) * gl * 4 : 0);
      D.text(ctx, money(this.shown), tx, y + h * (m ? 0.55 : 0.5), { size: m ? 22 : Math.min(34, w * 0.12), weight: 800, color: bad ? P.fault : P.text1 });
      if (gl > 0.05) { ctx.fillStyle = U.rgba(P.fault, gl * 0.25); ctx.fillRect(x + 6, y + h * 0.35, w - 12, h * 0.3); }
      var sub = bad ? 'should be ' + money(START) + (this.ecc ? '' : '  (' + (this.lastDelta > 0 ? '+' : '−') + money(Math.abs(this.lastDelta)) + ' from 1 bit)') : 'correct ✓';
      D.text(ctx, sub, x + 16, y + h - (m ? 14 : 20), { size: m ? 9 : 10, weight: 600, color: bad ? P.fault : P.ok, maxW: w - 32 });
      // status chip under/beside
      var st, col;
      if (ph === 'checking') { st = 'ECC: checking…'; col = P.mgmt; }
      else if (ph === 'fixed') { st = '1 bit flipped → corrected ✓'; col = P.ok; }
      else if (ph === 'silent') { st = (m ? '⚠ ' : '') + 'changed silently · no alarm'; col = P.fault; }
      else if (ph === 'flight') { st = 'incoming…'; col = P.air; }
      else { st = this.ecc ? 'ECC on · every read is checked' : 'ECC off · nothing checks'; col = this.ecc ? P.ok : P.warn; }
      if (!m) {
        var cy = y + h + 26;
        if (this.ecc) D.g.shield(ctx, x + 14, cy, 22, ph === 'checking' ? P.mgmt : P.ok);
        else D.g.warn(ctx, x + 14, cy, 18, P.warn);
        D.text(ctx, st, x + 32, cy, { size: 11.5, weight: 700, color: col, maxW: w - 34 });
        D.text(ctx, 'Rays ' + this.n.fired + ' · corrected ' + this.n.fixed + ' · silent ' + this.n.silent, x + 32, cy + 18, { size: 9.5, color: P.text3 });
      } else {
        D.pill(ctx, st, x + w - 8, y - 10, { color: col, size: 9, align: 'right' });
      }
    },

    drawStrip: function (ctx) {
      var P = S.pal, L = this.L, m = this.mobile;
      var x = L.pad, y = L.by, w = this.w - L.pad * 2, h = L.bh;
      D.box(ctx, x, y, w, h, 6, U.rgba(P.panel, 0.6), U.rgba(P.blueprint, 0.25), 1);
      var syn = this.syn, ph = this.phase, fs = m ? 9 : 10;
      var lines;
      if (!this.ecc) {
        lines = ph === 'silent' ? ['No check bits, so nothing can compare.', 'The wrong number is simply read — and used.'] :
          ['Without ECC a flipped bit is invisible:', 'the CPU reads whatever is stored.'];
        if (!m) lines = [lines.join(' ')];
      } else if (syn && (ph === 'checking' || ph === 'fixed')) {
        var sb = '';
        for (var k = 5; k >= 0; k--) sb += syn.bits[k];
        var done = ph === 'fixed';
        lines = m ? ['Failed checks spell ' + sb + '₂ = position ' + syn.pos, done ? '→ data bit ' + syn.bit + ' flipped back ✓' : '→ locating…'] :
          ['Recheck: failed checks spell ' + sb + '₂ = position ' + syn.pos + (done ? ' → that’s data bit ' + syn.bit + ' → flip it back ✓' : ' → locating…')];
      } else {
        lines = m ? ['Each check bit = parity of a group of bits.', 'One flip → failed checks give its address.'] :
          ['How: each check bit is the parity of an overlapping group of data bits. One flip → the checks that fail spell the bad bit’s address.'];
      }
      var col = this.ecc ? (ph === 'fixed' ? P.ok : P.text2) : (ph === 'silent' ? P.fault : P.text2);
      var lh = fs + 5, y0 = y + h / 2 - (lines.length - 1) * lh / 2;
      for (var i = 0; i < lines.length; i++) D.text(ctx, lines[i], x + 12, y0 + i * lh, { size: fs, weight: i === 0 ? 600 : 500, color: col, maxW: w - 24 });
    }
  });
})(window.SRV);
