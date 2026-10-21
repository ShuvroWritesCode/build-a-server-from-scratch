/* Ch9 · RAID lab. A little code-drawn picture is cut into chunks (2×2 pixels = 12 real bytes each) and
   striped across drives. Parity uses real XOR (RAID 5) and real GF(2^8) Reed–Solomon "Q" (RAID 6).
   Kill drives, replace them, watch the rebuild recompute missing bytes — or delete the file and watch
   RAID faithfully delete it everywhere. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var IMG_W = 12, IMG_H = 8, CHUNK = 2, NCHUNK = (IMG_W / CHUNK) * (IMG_H / CHUNK); // 24 chunks × 12 bytes
  var TB = 8;

  // ---------- GF(2^8) arithmetic (poly 0x11d, generator 2) ----------
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255]; })();
  function gmul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }
  function gdiv(a, b) { return a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0; }
  function gpow(i) { return EXP[i % 255]; }

  function layout(level, n) {
    var rows = [], s, i, k;
    if (level === 0) { k = n; for (s = 0; s * k < NCHUNK; s++) { var r0 = []; for (i = 0; i < n; i++) r0.push(s * k + i < NCHUNK ? { t: 'd', i: s * k + i, k: i } : null); rows.push(r0); } }
    else if (level === 1) { for (s = 0; s < NCHUNK; s++) rows.push([{ t: 'd', i: s, k: 0 }, { t: 'm', i: s, k: 0 }]); }
    else if (level === 10) { var pairs = n / 2; for (s = 0; s * pairs < NCHUNK; s++) { var r1 = []; for (i = 0; i < pairs; i++) { var idx = s * pairs + i; r1.push(idx < NCHUNK ? { t: 'd', i: idx, k: i } : null, idx < NCHUNK ? { t: 'm', i: idx, k: i } : null); } rows.push(r1); } }
    else if (level === 5) {
      k = n - 1;
      for (s = 0; s * k < NCHUNK; s++) {
        var r5 = new Array(n).fill(null), pd = (n - 1) - (s % n);
        r5[pd] = { t: 'p' };
        for (i = 0; i < k; i++) { var d5 = (pd + 1 + i) % n, id5 = s * k + i; r5[d5] = id5 < NCHUNK ? { t: 'd', i: id5, k: i } : { t: 'z', k: i }; }
        rows.push(r5);
      }
    } else if (level === 6) {
      k = n - 2;
      for (s = 0; s * k < NCHUNK; s++) {
        var r6 = new Array(n).fill(null), p6 = (n - 1) - (s % n), q6 = (p6 + 1) % n;
        r6[p6] = { t: 'p' }; r6[q6] = { t: 'q' };
        for (i = 0; i < k; i++) { var d6 = (q6 + 1 + i) % n, id6 = s * k + i; r6[d6] = id6 < NCHUNK ? { t: 'd', i: id6, k: i } : { t: 'z', k: i }; }
        rows.push(r6);
      }
    }
    return rows;
  }

  S.defineVisual('raid', {
    init: function () {
      this.ctx = this.layer();
      this.level = 5; this.n = 4;
      // the picture → chunks of real bytes
      var art = D.pixelArt(IMG_W, IMG_H, 'raid-art');
      this.chunks = [];
      for (var cy = 0; cy < IMG_H / CHUNK; cy++) for (var cx = 0; cx < IMG_W / CHUNK; cx++) {
        var b = new Uint8Array(12), o = 0;
        for (var py = 0; py < CHUNK; py++) for (var px = 0; px < CHUNK; px++) { var c = U.parse(art[cy * CHUNK + py][cx * CHUNK + px]); b[o++] = c.r; b[o++] = c.g; b[o++] = c.b; }
        this.chunks.push(b);
      }
      this.deleted = 0; this.writeT = 1; this.rebuild = null; this.flash = {};
      var self = this;
      var g1 = this.ui.group('RAID level');
      this.segLevel = g1.seg({ label: 'Level', options: [[0, 'RAID 0'], [1, 'RAID 1'], [5, 'RAID 5'], [6, 'RAID 6'], [10, 'RAID 10']], value: 5, onChange: function (v) { self.setLevel(v, self.n); } });
      this.segN = g1.seg({ label: 'Drives', options: [[4, '4'], [5, '5'], [6, '6']], value: 4, onChange: function (v) { self.setLevel(self.level, v); } });
      this.ui.br();
      var g2 = this.ui.group('Break it');
      this.bKill = g2.button('✕ Kill a drive', function () { self.killRandom(); }, { kind: 'danger' });
      this.bReplace = g2.button('↻ Replace &amp; rebuild', function () { self.replace(); });
      g2.button('🗑 Oops — delete the file', function () { self.deleteFile(); }, { kind: 'danger' });
      g2.button('Reset', function () { self.setLevel(self.level, self.n); });
      this.ui.br();
      this.rStatus = this.ui.readout('Array', 'HEALTHY', 'ok');
      this.rCap = this.ui.readout('Usable', '');
      this.rTol = this.ui.readout('Survives', '');
      this.pointer({
        down: function (p) { var it = self.hits.query(p.x, p.y); if (it && it.id.indexOf('drive') === 0) { self.kill(it.data); } return false; },
        hover: function (p) {
          var it = self.hits.query(p.x, p.y);
          self.hover = it ? it.id : null;
          self.stage.style.cursor = it && it.id.indexOf('drive') === 0 ? 'pointer' : '';
          if (it && it.data && it.data.cellInfo) self.tipAt(it.data.cellInfo, p.x, p.y);
          else if (it && it.id.indexOf('drive') === 0) self.tipAt('<b>Drive ' + (it.data + 1) + '</b>Click to kill it', p.x, p.y);
          else self.tipAt(null);
          self.invalidate();
        }
      });
      this.setLevel(5, 4);
    },
    setLevel: function (level, n) {
      if (level === 1) n = 2; else if (level === 10) n = n % 2 ? n + 1 : n; else if (n < 3) n = 4;
      if (level === 10 && n > 6) n = 6;
      this.level = level; this.n = n;
      this.segN.buttons.forEach(function (b) { b.disabled = level === 1; });
      if (level !== 1) this.segN.set(n === 2 ? 4 : n, false);
      this.rows = layout(level, n);
      this.failed = new Array(n).fill(false);
      this.rebuild = null; this.deleted = 0;
      this.disks = []; for (var d = 0; d < n; d++) this.disks.push([]);
      this.writeAll();
      var self = this;
      this.writeT = 0;
      this.tween({ from: 0, to: 1, dur: 1.4, ease: 'linear', onUpdate: function (v) { self.writeT = v; } });
      this.updateStatus();
      this.announce('RAID ' + level + ' with ' + n + ' drives. ' + this.tolText() + '.');
    },
    writeAll: function () {
      var self = this, n = this.n;
      this.rows.forEach(function (row, s) {
        var data = [], k;
        row.forEach(function (c) { if (c && (c.t === 'd' || c.t === 'z')) data[c.k] = c.t === 'd' ? self.chunks[c.i] : new Uint8Array(12); });
        for (var d = 0; d < n; d++) {
          var c = row[d]; if (!c) { self.disks[d][s] = null; continue; }
          var b = new Uint8Array(12);
          if (c.t === 'd' || c.t === 'm') b.set(self.chunks[c.i]);
          else if (c.t === 'p') { for (k = 0; k < data.length; k++) for (var j = 0; j < 12; j++) b[j] ^= data[k][j]; }
          else if (c.t === 'q') { for (k = 0; k < data.length; k++) { var gk = gpow(k); for (var j2 = 0; j2 < 12; j2++) b[j2] ^= gmul(gk, data[k][j2]); } }
          self.disks[d][s] = b;
        }
      });
    },
    ok: function (d, s) { if (this.failed[d]) return false; if (this.rebuild && this.rebuild.d === d) return s < this.rebuild.cursor; return true; },
    /** recover the bytes of cell (d, s) from the other healthy cells, or null */
    recover: function (d, s) {
      var row = this.rows[s], n = this.n, self = this, cell = row[d];
      if (!cell) return null;
      if (cell.t === 'd' || cell.t === 'm') { // mirror copy?
        for (var e = 0; e < n; e++) if (e !== d && row[e] && (row[e].t === 'd' || row[e].t === 'm') && row[e].i === cell.i && self.ok(e, s)) return self.disks[e][s].slice();
      }
      if (this.level !== 5 && this.level !== 6) return null;
      var dataIdx = [], P = -1, Q = -1, missing = [];
      row.forEach(function (c, i) {
        if (!c) return;
        if (c.t === 'p') P = i; else if (c.t === 'q') Q = i; else dataIdx.push(i);
        if (i !== d && !self.ok(i, s)) missing.push(i);
      });
      missing.push(d);
      var miss = function (i) { return missing.indexOf(i) >= 0; };
      var out = new Uint8Array(12), j, i;
      var dataMissing = dataIdx.filter(miss);
      if (dataMissing.length === 0) { // only parity missing → recompute
        if (cell.t === 'p') { dataIdx.forEach(function (i2) { for (var j3 = 0; j3 < 12; j3++) out[j3] ^= self.disks[i2][s][j3]; }); return out; }
        if (cell.t === 'q') { dataIdx.forEach(function (i2) { var g = gpow(row[i2].k); for (var j3 = 0; j3 < 12; j3++) out[j3] ^= gmul(g, self.disks[i2][s][j3]); }); return out; }
      }
      if (dataMissing.length === 1 && cell.t !== 'p' && cell.t !== 'q') {
        var x = dataMissing[0];
        if (P >= 0 && !miss(P)) { // XOR recovery
          out.set(this.disks[P][s]);
          dataIdx.forEach(function (i2) { if (i2 !== x) for (var j3 = 0; j3 < 12; j3++) out[j3] ^= self.disks[i2][s][j3]; });
          return out;
        }
        if (Q >= 0 && !miss(Q)) { // Q recovery: Dx = (Q ⊕ Σ g^i Di) / g^x
          out.set(this.disks[Q][s]);
          dataIdx.forEach(function (i2) { if (i2 !== x) { var g = gpow(row[i2].k); for (var j3 = 0; j3 < 12; j3++) out[j3] ^= gmul(g, self.disks[i2][s][j3]); } });
          var gx = gpow(row[x].k); for (j = 0; j < 12; j++) out[j] = gdiv(out[j], gx);
          return out;
        }
        return null;
      }
      if (dataMissing.length === 2 && P >= 0 && Q >= 0 && !miss(P) && !miss(Q) && (cell.t === 'd' || cell.t === 'z')) {
        var a = dataMissing[0], b = dataMissing[1], ka = row[a].k, kb = row[b].k;
        var pxy = this.disks[P][s].slice(), qxy = this.disks[Q][s].slice();
        dataIdx.forEach(function (i2) { if (i2 !== a && i2 !== b) { var g = gpow(row[i2].k); for (var j3 = 0; j3 < 12; j3++) { pxy[j3] ^= self.disks[i2][s][j3]; qxy[j3] ^= gmul(g, self.disks[i2][s][j3]); } } });
        var ga = gpow(ka), gb = gpow(kb), den = ga ^ gb, da = new Uint8Array(12);
        for (j = 0; j < 12; j++) da[j] = gdiv(qxy[j] ^ gmul(gb, pxy[j]), den);
        if (d === a) return da;
        for (j = 0; j < 12; j++) out[j] = pxy[j] ^ da[j];
        return out;
      }
      return null;
    },
    readChunk: function (idx) {
      // find the stripe + disk holding chunk idx
      for (var s = 0; s < this.rows.length; s++) for (var d = 0; d < this.n; d++) {
        var c = this.rows[s][d];
        if (c && (c.t === 'd') && c.i === idx) {
          if (this.ok(d, s)) return this.disks[d][s];
          return this.recover(d, s);
        }
      }
      return null;
    },
    tolerance: function () { return { 0: 0, 1: 1, 5: 1, 6: 2, 10: 1 }[this.level]; },
    tolText: function () { return this.level === 10 ? 'Survives 1 failure per mirror pair' : 'Survives ' + this.tolerance() + ' drive failure' + (this.tolerance() === 1 ? '' : 's'); },
    usable: function () { var n = this.n; return { 0: n, 1: 1, 5: n - 1, 6: n - 2, 10: n / 2 }[this.level] * TB; },
    kill: function (d) {
      if (this.failed[d] || this.deleted) return;
      if (this.rebuild && this.rebuild.d === d) this.rebuild = null;
      this.failed[d] = true;
      this.flash['d' + d] = 1;
      var self = this;
      this.tween({ from: 1, to: 0, dur: 0.8, onUpdate: function (v) { self.flash['d' + d] = v; } });
      this.updateStatus();
      var st = this.status;
      S.audio.play('fanFail', { level: 0.5, rate: 1.4 });
      S.haptics.fail(st === 'FAILED' ? 'critical' : 'fail');
      this.announce('Drive ' + (d + 1) + ' failed. Array is ' + st.toLowerCase() + '.' + (st === 'FAILED' ? ' Data lost.' : ' Data is still readable' + (this.level >= 5 && this.level !== 10 ? ' — missing blocks are recomputed from parity.' : ' from the mirror.')));
    },
    killRandom: function () {
      var alive = []; for (var d = 0; d < this.n; d++) if (!this.failed[d] && !(this.rebuild && this.rebuild.d === d)) alive.push(d);
      if (this.rebuild) alive = alive.concat([]); // allow killing others during rebuild
      if (!alive.length) return;
      this.kill(this.rng.pick(alive));
    },
    replace: function () {
      var d = this.failed.indexOf(true);
      if (d < 0 || this.rebuild) return;
      this.failed[d] = false;
      // the new drive starts blank; rebuild recomputes stripe by stripe
      for (var s = 0; s < this.rows.length; s++) this.disks[d][s] = this.rows[s][d] ? new Uint8Array(12) : null;
      var self = this, rows = this.rows.length;
      this.rebuild = { d: d, cursor: 0 };
      this.announce('New drive inserted. Rebuilding: every missing block is recomputed from the other drives.');
      this.tween({
        from: 0, to: rows, dur: 1.2 + rows * 0.16, ease: 'linear',
        onUpdate: function (v) {
          if (!self.rebuild || self.rebuild.d !== d) return;
          var nc = Math.floor(v);
          while (self.rebuild.cursor < nc && self.rebuild.cursor < rows) {
            var s2 = self.rebuild.cursor, rec = self.recover(d, s2);
            if (self.rows[s2][d]) self.disks[d][s2] = rec || self.garbage();
            self.rebuild.cursor++;
          }
          self.rebuild.frac = v - nc;
          self.updateStatus();
        },
        onDone: function () { if (self.rebuild && self.rebuild.d === d) { self.rebuild = null; self.updateStatus(); self.announce('Rebuild complete. Array ' + self.status.toLowerCase() + '.'); } }
      });
      this.updateStatus();
    },
    garbage: function () { var b = new Uint8Array(12); for (var j = 0; j < 12; j++) b[j] = (this.rng.float() * 255) | 0; return b; },
    deleteFile: function () {
      if (this.deleted) return;
      var self = this;
      this.tween({ from: 0, to: 1, dur: 1.1, ease: 'inOutCubic', onUpdate: function (v) { self.deleted = Math.max(0.0001, v); } });
      S.haptics.fail('critical');
      this.announce('The file was deleted. RAID copied the deletion to every drive instantly. RAID is not a backup.');
    },
    updateStatus: function () {
      var lost = 0;
      for (var i = 0; i < NCHUNK; i++) if (!this.readChunk(i)) lost++;
      var anyFail = this.failed.some(Boolean);
      this.lost = lost;
      this.status = lost ? 'FAILED' : this.rebuild ? 'REBUILDING' : anyFail ? 'DEGRADED' : 'HEALTHY';
      this.rStatus.set(this.status + (lost ? ' · data lost' : ''), lost ? 'bad' : (this.rebuild || anyFail) ? 'warn' : 'ok');
      this.rCap.set(this.usable() + ' of ' + this.n * TB + ' TB');
      this.rTol.set(this.level === 10 ? '1 per pair' : this.tolerance() + ' drive' + (this.tolerance() === 1 ? '' : 's'));
      this.bReplace.setDisabled(!anyFail || !!this.rebuild);
      this.invalidate();
    },
    resize: function (w, h) { this.mobile = w < 620; },
    color: function (b, j) { return 'rgb(' + b[j * 3] + ',' + b[j * 3 + 1] + ',' + b[j * 3 + 2] + ')'; },
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, self = this, n = this.n, rows = this.rows.length, mob = this.mobile;
      D.clear(ctx, w, h);
      this.hits.clear();
      var del = this.deleted;
      // ---- picture as read back from the array
      var imgS = mob ? Math.min((w - 40) / IMG_W, 14) : Math.min(w * 0.26 / IMG_W, h * 0.36 / IMG_H);
      var ix = mob ? (w - imgS * IMG_W) / 2 : 28, iy = mob ? 34 : 54;
      D.text(ctx, 'YOUR FILE (read from the array)', ix, iy - 14, { size: 10, weight: 700, color: P.text3, ls: 1 });
      for (var c = 0; c < NCHUNK; c++) {
        var b = this.readChunk(c), cx = (c % (IMG_W / CHUNK)) * CHUNK, cy = Math.floor(c / (IMG_W / CHUNK)) * CHUNK;
        for (var j = 0; j < 4; j++) {
          var px = ix + (cx + (j % 2)) * imgS, py = iy + (cy + (j >> 1)) * imgS;
          if (b && !del) { ctx.fillStyle = this.color(b, j); ctx.fillRect(px, py, imgS - 0.5, imgS - 0.5); }
          else if (del) { ctx.fillStyle = U.rgba(P.panel3, 0.6); ctx.fillRect(px, py, imgS - 0.5, imgS - 0.5); if (b) { ctx.globalAlpha = 1 - del; ctx.fillStyle = this.color(b, j); ctx.fillRect(px, py, imgS - 0.5, imgS - 0.5); ctx.globalAlpha = 1; } }
          else { ctx.fillStyle = U.rng('n' + c + j + (this.time | 0)).chance(0.5) ? P.fault : P.bg; ctx.fillRect(px, py, imgS - 0.5, imgS - 0.5); }
        }
      }
      ctx.strokeStyle = U.rgba(P.blueprint, 0.6); ctx.lineWidth = 1; ctx.strokeRect(ix - 3, iy - 3, IMG_W * imgS + 6, IMG_H * imgS + 6);
      if (del > 0.6) {
        ctx.save(); ctx.translate(ix + IMG_W * imgS / 2, iy + IMG_H * imgS / 2); ctx.rotate(-0.12);
        D.pill(ctx, 'RAID IS NOT A BACKUP', 0, 0, { size: mob ? 11 : 13, color: P.fault, align: 'center', bg: U.rgba(P.bg, 0.92) });
        ctx.restore();
      }
      // ---- status + capacity panel (desktop: under picture; mobile: right of nothing)
      var sx = mob ? 16 : ix, sy = iy + IMG_H * imgS + 22, sw = mob ? w - 32 : IMG_W * imgS;
      if (!mob) {
        var lines = [
          ['Usable', this.usable() / (n * TB), P.ok, this.usable() + ' / ' + n * TB + ' TB'],
          ['Read', { 0: n, 1: 2, 5: n - 1, 6: n - 2, 10: n }[this.level] / 6, P.data, '×' + { 0: n, 1: 2, 5: n - 1, 6: n - 2, 10: n }[this.level]],
          ['Write', { 0: n, 1: 1, 5: n / 4, 6: n / 6, 10: n / 2 }[this.level] / 6, P.power, '×' + U.fmt({ 0: n, 1: 1, 5: n / 4, 6: n / 6, 10: n / 2 }[this.level], 1)]
        ];
        lines.forEach(function (L, i) {
          var y = sy + i * 30;
          D.text(ctx, L[0].toUpperCase(), sx, y, { size: 10, weight: 700, color: P.text3 });
          D.text(ctx, L[3], sx + sw, y, { size: 10, weight: 700, color: P.text1, align: 'right' });
          D.meter(ctx, sx, y + 9, sw, 6, L[1], L[2]);
        });
        D.text(ctx, this.tolText(), sx, sy + 98, { size: 10, color: P.text2 });
      }
      // ---- drive columns
      var gx = mob ? 12 : ix + IMG_W * imgS + 46, gy = mob ? iy + IMG_H * imgS + 26 : 40, gw = w - gx - (mob ? 12 : 24), gh = h - gy - (mob ? 14 : 22);
      var colW = gw / n, sledH = Math.min(46, gh * 0.12), blockArea = gh - sledH - 26;
      var bh = Math.min(mob ? 26 : 40, blockArea / rows), bw = Math.min(colW - (mob ? 8 : 18), 150);
      var cs = Math.max(2, Math.min(bw / 2 - 4, bh - 2) / 2) * 1;
      for (var d = 0; d < n; d++) {
        var x0 = gx + d * colW + (colW - bw) / 2, failed = this.failed[d], reb = this.rebuild && this.rebuild.d === d;
        // drive body
        D.box(ctx, x0 - 4, gy - 4, bw + 8, rows * bh + 8 + 6, 8, U.rgba(P.panel2, failed ? 0.4 : 0.7), U.rgba(failed ? P.fault : reb ? P.warn : P.blueprint, failed ? 0.7 : 0.35), 1);
        for (var s = 0; s < rows; s++) {
          var cell = this.rows[s][d]; if (!cell) continue;
          var y = gy + s * bh;
          var vis = U.clamp(this.writeT * rows * 1.3 - s, 0, 1);
          if (vis <= 0) continue;
          var bytes = this.disks[d][s], okc = this.ok(d, s);
          ctx.globalAlpha = vis * (del && (cell.t === 'd' || cell.t === 'm' || cell.t === 'p' || cell.t === 'q') ? 1 - del : 1);
          var isPar = cell.t === 'p' || cell.t === 'q';
          if (failed || (reb && !okc)) {
            ctx.fillStyle = U.rgba(P.panel3, 0.5); ctx.fillRect(x0, y + 1, bw, bh - 2);
            if (bh > 9) D.text(ctx, '?', x0 + bw / 2, y + bh / 2, { size: Math.min(10, bh - 2), color: P.text3, align: 'center' });
          } else if (cell.t === 'z') {
            ctx.fillStyle = U.rgba(P.panel3, 0.3); ctx.fillRect(x0, y + 1, bw, bh - 2);
          } else {
            // 4 pixels of the chunk (parity shows the XOR "noise" colours)
            var pw = (bw - 2) / 4;
            for (var j2 = 0; j2 < 4; j2++) { ctx.fillStyle = this.color(bytes, j2); ctx.fillRect(x0 + 1 + j2 * pw, y + 1, pw - 0.5, bh - 2); }
            if (isPar) {
              ctx.fillStyle = U.rgba(P.bg, 0.55); ctx.fillRect(x0, y + 1, bw, bh - 2);
              ctx.strokeStyle = cell.t === 'p' ? P.air : P.accent; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y + 1.5, bw - 1, bh - 3);
              if (bh > 9) D.text(ctx, cell.t === 'p' ? '⊕ P' : '⊗ Q', x0 + bw / 2, y + bh / 2 + 0.5, { size: Math.min(10, bh - 3), weight: 700, color: cell.t === 'p' ? P.air : P.accent, align: 'center' });
            } else if (cell.t === 'm' && bh > 9) {
              D.text(ctx, '⧉', x0 + bw - 7, y + bh / 2, { size: Math.min(9, bh - 3), color: P.text1, align: 'center' });
            }
          }
          ctx.globalAlpha = 1;
          if (!failed && cell.t !== 'z') {
            var info = isPar ? '<b>' + (cell.t === 'p' ? 'P parity (XOR)' : 'Q parity (Reed–Solomon)') + '</b>' + this.xorTip(s, d) :
              '<b>' + (cell.t === 'm' ? 'Mirror copy' : 'Data') + ' · chunk ' + (cell.i + 1) + '</b>First byte: ' + bytes[0].toString(2).padStart(8, '0');
            this.hits.rect('cell' + d + '-' + s, x0, y, bw, bh, { cellInfo: info });
          }
        }
        // rebuild cursor + beads from the other drives
        if (reb) {
          var ry = gy + this.rebuild.cursor * bh;
          D.line(ctx, x0 - 6, ry, x0 + bw + 6, ry, P.warn, 2);
          for (var o = 0; o < n; o++) {
            if (o === d || this.failed[o]) continue;
            var ox = gx + o * colW + colW / 2, f = this.rebuild.frac || 0;
            var bx = U.lerp(ox, x0 + bw / 2, f), by = ry + bh / 2 - Math.sin(f * Math.PI) * 20;
            D.circle(ctx, bx, by, 2.4, P.data); D.glow(ctx, bx, by, 8, P.data, 0.6);
          }
        }
        // sled + LED + label
        var sy2 = gy + rows * bh + 14;
        D.box(ctx, x0 - 4, sy2, bw + 8, sledH, 6, failed ? U.mix(P.plastic, P.fault, 0.3) : P.plastic, U.rgba(this.hover === 'drive' + d ? P.accent : P.alu, 0.5), this.hover === 'drive' + d ? 2 : 1);
        ctx.fillStyle = U.rgba('#000', 0.3); for (var v = 0; v < 5; v++) ctx.fillRect(x0 + 4 + v * 7, sy2 + 6, 4, sledH - 12);
        D.led(ctx, x0 + bw - 6, sy2 + sledH / 2, failed ? P.fault : reb ? P.warn : P.ok, failed ? 'blink' : 'activity', this.time + d, 2.4);
        D.text(ctx, failed ? 'DEAD' : reb ? Math.round(100 * this.rebuild.cursor / rows) + '%' : 'DRIVE ' + (d + 1), x0 + bw / 2, sy2 + sledH + 10, { size: 9, weight: 700, color: failed ? P.fault : reb ? P.warn : P.text3, align: 'center' });
        if (failed) D.g.cross(ctx, x0 + bw / 2 - 8, sy2 + sledH / 2, Math.min(18, sledH * 0.6), P.fault);
        if (this.flash['d' + d] > 0) D.glow(ctx, x0 + bw / 2, sy2 + sledH / 2, 60 * this.flash['d' + d], P.fault, this.flash['d' + d]);
        this.hits.rect('drive' + d, x0 - 4, sy2, bw + 8, sledH, d);
      }
      this.setActive(!!(this.rebuild || this.lost));
      this.setDesc('RAID ' + this.level + ' on ' + n + ' drives, ' + this.failed.filter(Boolean).length + ' failed. Array ' + this.status.toLowerCase() + (this.lost ? ', ' + this.lost + ' of ' + NCHUNK + ' chunks unreadable' : '') + (del ? '. The file was deleted from every drive.' : '.'));
    },
    xorTip: function (s, d) {
      var row = this.rows[s], self = this, lines = [];
      row.forEach(function (c, i) { if (c && (c.t === 'd' || c.t === 'z') && !self.failed[i]) lines.push('D' + (c.k) + ' ' + self.disks[i][s][0].toString(2).padStart(8, '0')); });
      var p = this.disks[d][s][0].toString(2).padStart(8, '0');
      return '<span style="font-family:var(--font-mono);font-size:11px">' + lines.join('<br>') + '<br>' + (row[d].t === 'p' ? '⊕ = ' : 'RS = ') + p + '</span>';
    },
    update: function () { }
  });
})(window.SRV);
