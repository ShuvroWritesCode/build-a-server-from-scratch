/* Ch7 ★ · The latency race at human scale. 1 ns is shown as 1 s. Five runners fetch one piece of data
   from L1, L3, RAM, an NVMe SSD and a hard disk. The track is log-scaled; the race clock runs in real
   time for the first second and then fast-forwards, so the HDD runner plods on for "months" while a
   calendar flips its pages. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;
  var LN10 = Math.LN10;
  var LO = -0.45, HI = 7.18;          // log10 of human seconds shown on the track
  var K = 0.82;                       // decades of human time per real second after t = 1 s
  var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'];
  var LANES = [
    { name: 'L1 CACHE', short: 'L1', real: '1 ns', human: '1 s', H: 1, analogy: 'a heartbeat', col: 'accent', where: 'inside the core' },
    { name: 'L3 CACHE', short: 'L3', real: '10 ns', human: '10 s', H: 10, analogy: 'tie your shoes', col: 'ok', where: 'shared on the CPU' },
    { name: 'RAM', short: 'RAM', real: '90 ns', human: '1.5 min', H: 90, analogy: 'brew a coffee', col: 'data', where: 'DIMMs beside the CPU' },
    { name: 'NVMe SSD', short: 'NVMe', real: '100 µs', human: '~1 day', H: 1e5, analogy: 'sleep on it', col: 'net', where: 'flash over PCIe' },
    { name: 'HARD DISK', short: 'HDD', real: '10 ms', human: '~4 months', H: 1e7, analogy: 'a whole school term', col: 'power', where: 'spinning platter + moving arm' }
  ];
  var TICKS_H = [[1, '1 s'], [10, '10 s'], [60, '1 min'], [3600, '1 h'], [86400, '1 day'], [604800, '1 wk'], [2.63e6, '1 mo'], [1.05e7, '4 mo']];
  var TICKS_H_M = [[1, '1 s'], [60, '1 min'], [3600, '1 h'], [86400, '1 day'], [1.05e7, '4 mo']];
  var TICKS_R = [[1, '1 ns'], [10, '10 ns'], [100, '100 ns'], [1e3, '1 µs'], [1e4, '10 µs'], [1e5, '100 µs'], [1e6, '1 ms'], [1e7, '10 ms']];
  var TICKS_R_M = [[1, '1 ns'], [100, '100 ns'], [1e4, '10 µs'], [1e6, '1 ms'], [1e7, '10 ms']];

  function humanClock(H) {
    if (H < 60) return U.fmt(H, 1) + ' s';
    if (H < 3600) return Math.floor(H / 60) + ' min ' + pad(Math.floor(H % 60)) + ' s';
    if (H < 86400) return Math.floor(H / 3600) + ' h ' + pad(Math.floor((H % 3600) / 60)) + ' min';
    var d = H / 86400;
    if (d < 31) return Math.floor(d) + (Math.floor(d) === 1 ? ' day ' : ' days ') + pad(Math.floor((H % 86400) / 3600)) + ' h';
    var mo = Math.floor(d / 30.4);
    return mo + (mo === 1 ? ' month ' : ' months ') + Math.floor(d - mo * 30.4) + ' d';
  }
  function realClock(H) { // H human s == real ns
    if (H < 1000) return U.fmt(H, H < 10 ? 2 : 1) + ' ns';
    if (H < 1e6) return U.fmt(H / 1000, H < 1e4 ? 2 : 1) + ' µs';
    return U.fmt(H / 1e6, 2) + ' ms';
  }
  function pad(v) { return v < 10 ? '0' + v : String(v); }
  function fmtX(f) { return f >= 1e6 ? U.fmt(f / 1e6, 1) + 'M' : f >= 1e3 ? U.fmt(f / 1e3, f < 1e4 ? 1 : 0) + 'k' : U.fmt(f, 0); }

  S.defineVisual('latency', {
    continuous: false,
    init: function () {
      this.ctx = this.layer();
      this.state = 'idle';      // idle | wait | run | done
      this.rt = 0; this.H = 0; this.units = 'human';
      this.ph = [0, 0, 0, 0, 0]; this.fin = [0, 0, 0, 0, 0]; this.finT = [0, 0, 0, 0, 0];
      this.lastMonth = 0; this.flip = 0; this.hover = -1; this.autoDone = false;
      var self = this;
      var g = this.ui.group('Race');
      this.bRace = g.button('▶ Race', function () { self.start(); }, { kind: 'primary' });
      g.button('↺ Reset', function () { self.reset(); });
      this.ui.seg({
        label: 'Units', value: 'human', options: [['human', 'Human time'], ['real', 'Real units']],
        onChange: function (v) { self.units = v; self.announce(v === 'human' ? 'Showing human time: 1 nanosecond is shown as 1 second.' : 'Showing real units: nanoseconds to milliseconds.'); self.describe2(); }
      });
      this.ui.spacer();
      this.rClock = this.ui.readout('Clock', '0 s');
      this.pointer({
        hover: function (p) {
          var hit = self.hits.query(p.x, p.y), i = hit ? hit.data : -1;
          if (i !== self.hover) { self.hover = i; self.invalidate(); }
          if (hit) {
            var L = LANES[i];
            self.tipAt('<b>' + L.name + '</b> · ' + L.where + '<br>Real: <b>' + L.real + '</b> &nbsp;·&nbsp; At human scale: <b>' + L.human + '</b><br>≈ ' + L.analogy, p.x, p.y);
          } else self.tipAt(null);
        },
        leave: function () { self.hover = -1; },
        down: function () { if (self.state === 'idle' || self.state === 'done') self.start(); return false; }
      });
      this.describe2();
    },
    onVisible: function () {
      if (this.autoDone || this.state !== 'idle') return;
      this.autoDone = true;
      if (this.reduced()) return;
      this.state = 'wait'; this.rt = -0.9; this.setActive(true);
    },
    start: function () {
      this.rt = 0; this.H = 0; this.state = 'run'; this.lastMonth = 0; this.flip = 0;
      for (var i = 0; i < 5; i++) { this.fin[i] = 0; this.finT[i] = 0; }
      this.bRace.setLabel('▶ Race again');
      if (this.reduced()) { this.finishAll(); return; }
      this.setActive(true);
      this.announce('Race started. One nanosecond is shown as one second.');
    },
    finishAll: function () {
      this.H = LANES[4].H; this.state = 'done';
      for (var i = 0; i < 5; i++) { this.fin[i] = 1; this.finT[i] = 1; }
      this.lastMonth = 3; this.flip = 0; this.setActive(false); this.invalidate();
      this.announce('Results at human scale: L1 cache 1 second, L3 10 seconds, RAM a minute and a half, NVMe SSD about a day, hard disk about four months.');
      this.describe2();
    },
    reset: function () {
      this.state = 'idle'; this.rt = 0; this.H = 0; this.lastMonth = 0; this.flip = 0;
      for (var i = 0; i < 5; i++) { this.fin[i] = 0; this.finT[i] = 0; this.ph[i] = 0; }
      this.setActive(false); this.bRace.setLabel('▶ Race'); this.describe2(); this.invalidate();
    },
    describe2: function () {
      var t = this.state === 'done' ? 'Race finished. ' : this.state === 'run' ? 'Race running. ' : 'Runners at the start. ';
      this.setDesc(t + 'At human scale (1 ns = 1 s): L1 1 s, L3 10 s, RAM 1.5 min, NVMe about 1 day, hard disk about 4 months.');
    },
    update: function (dt) {
      if (this.state === 'wait') { this.rt += dt; if (this.rt >= 0) this.start(); return; }
      if (this.state === 'done' && this.tail > 0) {
        this.tail -= dt;
        for (var j = 0; j < 5; j++) this.finT[j] = Math.min(1, this.finT[j] + dt * 2.2);
        this.flip = Math.max(0, this.flip - dt * 3.2);
        if (this.tail <= 0) { this.flip = 0; this.setActive(false); }
        return;
      }
      if (this.state !== 'run') { this.setActive(false); return; }
      this.rt += dt;
      var t = this.rt;
      this.H = t < 1 ? t : Math.pow(10, (t - 1) * K);
      var any = false;
      for (var i = 0; i < 5; i++) {
        var L = LANES[i];
        if (!this.fin[i] && this.H >= L.H) {
          this.fin[i] = 1;
          if (i < 4) this.announce(L.name + ' answered: ' + L.real + ' real, ' + L.human + ' at human scale.');
        }
        if (this.fin[i]) this.finT[i] = Math.min(1, this.finT[i] + dt * 2.2);
        else {
          any = true;
          // cadence: steady sprint, but the HDD runner tires as the days pass
          var tired = i === 4 ? U.clamp((Math.log(Math.max(1, this.H)) / LN10 - 4) / 3, 0, 1) : 0;
          this.ph[i] += dt * (11 - tired * 5.5);
        }
      }
      var days = this.H / 86400, month = Math.floor(days / 30.4);
      if (month !== this.lastMonth) { this.lastMonth = month; this.flip = 1; }
      this.flip = Math.max(0, this.flip - dt * 3.2);
      if (!any) {
        this.H = LANES[4].H;
        this.state = 'done'; this.tail = 1.2;
        this.announce('Hard disk finally answered after about four months at human scale. That is ten million times slower than the L1 cache.');
        this.describe2();
      }
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      var m = this.mobile;
      this.head = m ? 70 : 58;
      this.axisY = this.head + (m ? 8 : 12);
      this.lx0 = m ? 14 : 150;
      this.lx1 = w - (m ? 18 : 56);
      this.top = this.axisY + 14;
      this.bot = h - (m ? 34 : 30);
      this.laneH = (this.bot - this.top) / 5;
    },
    xOf: function (H) {
      var lg = Math.log(Math.max(H, Math.pow(10, LO))) / LN10;
      return this.lx0 + (lg - LO) / (HI - LO) * (this.lx1 - this.lx0);
    },

    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, m = this.mobile, self = this;
      D.clear(ctx, w, h);
      this.hits.clear();
      var human = this.units === 'human';
      var H = this.H;

      // ---------- header: time-dilation badge + clock
      var badge = human ? '⏱ 1 ns shown as 1 s' : '⏱ real time, slowed 1,000,000,000×';
      D.pill(ctx, badge, 14, m ? 18 : 22, { color: P.power, size: m ? 10 : 11, weight: 700 });
      var clock = this.state === 'idle' || this.state === 'wait' ? (human ? '0.0 s' : '0.00 ns') : (human ? humanClock(H) : realClock(H));
      var cx = m ? 14 : w / 2, ca = m ? 'left' : 'center', cyy = m ? 48 : 26;
      D.text(ctx, 'CLOCK', cx + (m ? 0 : -1), cyy - (m ? 0 : 14), { size: 9, color: P.text3, align: ca, ls: 1.5, alpha: m ? 0 : 1 });
      D.text(ctx, clock, m ? 14 : cx, cyy + (m ? 0 : 6), { size: m ? 17 : 20, weight: 700, color: P.text1, align: ca });
      if (this.state === 'run' && this.rt > 1) {
        var ff = H * K * LN10; // human seconds per real second
        var ffs = '⏩ fast-forward ×' + fmtX(ff);
        if (m) D.text(ctx, ffs, w - 14, cyy, { size: 10, color: P.accent, align: 'right', weight: 700 });
        else D.text(ctx, ffs, cx + 110, cyy + 6, { size: 11, color: P.accent, weight: 700 });
      } else if (this.state === 'run') {
        D.text(ctx, '▶ real time', m ? w - 14 : cx + 110, m ? cyy : cyy + 6, { size: m ? 10 : 11, color: P.text2, align: m ? 'right' : 'left', weight: 600 });
      }
      this.rClock.set(clock);

      // ---------- axis ticks (log scale)
      var ticks = human ? (m ? TICKS_H_M : TICKS_H) : (m ? TICKS_R_M : TICKS_R);
      for (var i = 0; i < ticks.length; i++) {
        var tx = Math.round(this.xOf(ticks[i][0])) + 0.5;
        D.line(ctx, tx, this.top - 2, tx, this.bot, U.rgba(P.grid, 0.75), 1, [1, 4]);
        D.text(ctx, ticks[i][1], tx, this.axisY, { size: m ? 9 : 9.5, color: P.text3, align: i === ticks.length - 1 && m ? 'right' : 'center' });
      }
      if (!m) D.text(ctx, 'LOG SCALE →', this.lx0 - 12, this.axisY, { size: 9, color: P.text3, align: 'right', ls: 1 });

      // ---------- sweep line ("now")
      var started = this.state === 'run' || this.state === 'done';
      if (this.state === 'run') {
        var nx = this.xOf(Math.max(H, 0.36));
        D.line(ctx, nx, this.top - 4, nx, this.bot, U.rgba(P.blueprint, 0.55), 1);
        D.glow(ctx, nx, this.top - 4, 8, P.blueprint, 0.5);
      }

      // ---------- lanes
      for (i = 0; i < 5; i++) this.drawLane(ctx, i, started);

      // ---------- footer punchline
      if (this.state === 'done') {
        var msg = m ? 'HDD: 10,000,000× slower than L1' : 'Same question, five answers: the hard disk took 10,000,000× longer than L1 cache.';
        D.pill(ctx, msg, w / 2, h - 14, { color: P.power, size: m ? 10 : 11, align: 'center', weight: 700 });
      } else if (this.state === 'idle') {
        D.text(ctx, m ? 'Tap ▶ Race to start' : 'Press ▶ Race (or click the track). Hover a lane for real numbers.', w / 2, h - 14, { size: m ? 10 : 10.5, color: P.text3, align: 'center' });
      }
    },

    drawLane: function (ctx, i, started) {
      var P = S.pal, m = this.mobile, L = LANES[i], col = P[L.col];
      var y0 = this.top + i * this.laneH, lh = this.laneH;
      var labelH = m ? 15 : 0;
      var ty0 = y0 + labelH + 3, ty1 = y0 + lh - 3, ground = ty1 - (m ? 6 : 8);
      var human = this.units === 'human', fin = this.fin[i], ft = this.finT[i];
      var hov = this.hover === i;

      // lane surface
      D.box(ctx, this.lx0 - 6, ty0, this.lx1 - this.lx0 + 12, ty1 - ty0, 6, U.rgba(hov ? P.panel3 : P.panel2, hov ? 0.7 : 0.5), U.rgba(col, hov ? 0.6 : 0.18), 1);
      D.line(ctx, this.lx0 - 2, ground + 0.5, this.lx1 + 4, ground + 0.5, U.rgba(P.text3, 0.35), 1, [6, 6]);
      // start line
      D.line(ctx, this.lx0, ty0 + 3, this.lx0, ty1 - 3, U.rgba(P.text2, 0.8), 2);
      this.hits.rect('lane' + i, this.lx0 - 6 - (m ? 0 : 140), y0, this.lx1 - this.lx0 + 12 + (m ? 0 : 140), lh, i);

      // lane label
      if (m) {
        D.text(ctx, L.name, this.lx0, y0 + 8, { size: 10, weight: 700, color: col });
        D.text(ctx, human ? L.human : L.real, this.lx0 + D.measure(ctx, L.name, 10, 700) + 8, y0 + 8, { size: 10, color: P.text2 });
      } else {
        D.box(ctx, 14, (ty0 + ty1) / 2 - 15, 4, 30, 2, col);
        D.text(ctx, L.name, 26, (ty0 + ty1) / 2 - 7, { size: 11, weight: 700, color: P.text1, ls: 0.5 });
        D.text(ctx, human ? L.human + '  (' + L.real + ')' : L.real + '  (' + L.human + ')', 26, (ty0 + ty1) / 2 + 9, { size: 10, color: P.text2 });
      }

      // finish flag at this lane's latency
      var fx = this.xOf(L.H), fy = ground;
      var poleTop = ty0 + 4;
      D.line(ctx, fx, poleTop, fx, fy, U.rgba(P.text2, 0.9), 1.4);
      var fw = m ? 12 : 15, fh = m ? 8 : 10, cs = fw / 4;
      for (var r = 0; r < 2; r++) for (var c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 ? P.text1 : col;
        ctx.fillRect(fx + 1 + c * cs, poleTop + r * (fh / 2), cs, fh / 2);
      }

      // runner position
      var Hn = started ? Math.min(this.H, L.H) : 0;
      var rx = started ? this.xOf(Math.max(Hn, 0.36)) : this.lx0 + 2;
      if (!started) rx = this.lx0 + 10;
      var s = Math.min((ground - ty0) * 0.7, m ? 40 : 50);
      var mode = fin ? 'cheer' : this.state === 'run' ? 'run' : 'idle';
      this.runner(ctx, rx - (fin ? s * 0.28 * ft + 3 : 0), ground, s, col, this.ph[i], mode, ft, i === 4 && !fin && this.state === 'run' ? U.clamp((Math.log(Math.max(1, this.H)) / LN10 - 4) / 3, 0, 1) : 0);

      // finished: result pill
      if (fin) {
        var txt = '✓ ' + (human ? L.human + (m ? '' : ' · ' + L.analogy) : L.real);
        var tw = D.measure(ctx, txt, m ? 9.5 : 10.5, 700) + 12;
        var px = fx + 12, py = (ty0 + ground) / 2 - (m ? 2 : 4);
        if (px + tw > this.w - 6) px = fx - s * 0.6 - tw - 4;
        ctx.globalAlpha = ft;
        D.pill(ctx, txt, px, py, { color: col, size: m ? 9.5 : 10.5, weight: 700 });
        ctx.globalAlpha = 1;
      }

      // HDD: calendar flipping its pages as the months go by
      if (i === 4 && human && started && this.H >= 86400 * 0.6 && !(m && fin)) {
        var cw = m ? 26 : 32, cxp = rx + s * 0.32;
        if (cxp < fx + 6 && cxp + cw > fx - 2) cxp = fx + 8;
        if (cxp + cw > this.w - 6) cxp = rx - s * 0.62 - cw;
        this.calendar(ctx, cxp, ty0 + (m ? 1 : 2), cw, col);
      }
      // NVMe: a little moon while it waits overnight
      if (i === 3 && this.state === 'run' && !fin && this.H > 3600 * 6) {
        var mx = rx + s * 0.45, my = ty0 + 10;
        D.circle(ctx, mx, my, 5, U.rgba(P.air, 0.85));
        D.circle(ctx, mx + 2.5, my - 1.5, 4.4, P.panel2);
      }
    },

    /** code-drawn stick runner standing on ground y; s = height in px */
    runner: function (ctx, x, gy, s, col, ph, mode, cheerT, tired) {
      var P = S.pal, lw = Math.max(2, s * 0.085);
      var bob = 0, lean = 0;
      if (mode === 'run') { bob = Math.abs(Math.sin(ph)) * s * 0.05; lean = s * (0.1 + tired * 0.12); }
      if (mode === 'cheer') bob = Math.abs(Math.sin(this.time * 6 + x)) * s * 0.06 * cheerT;
      // shadow
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.ellipse(x, gy + 1, s * 0.22, s * 0.05, 0, 0, U.TAU); ctx.fillStyle = S.pal.dark ? '#000' : U.rgba(P.text3, 0.6); ctx.fill(); ctx.globalAlpha = 1;
      var hipX = x, hipY = gy - s * 0.42 - bob, shX = x + lean, shY = gy - s * 0.74 - bob;
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      // legs
      if (mode === 'run') {
        for (var k = 0; k < 2; k++) {
          var a = Math.sin(ph + k * Math.PI);
          var kx = hipX + a * s * 0.17, ky = hipY + s * 0.2;
          var fx = hipX + a * s * 0.26 - (a < 0 ? s * 0.1 : 0), fy = gy - Math.max(0, -Math.cos(ph + k * Math.PI)) * s * 0.08;
          ctx.moveTo(hipX, hipY); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy);
        }
      } else {
        ctx.moveTo(hipX, hipY); ctx.lineTo(hipX - s * 0.08, gy);
        ctx.moveTo(hipX, hipY); ctx.lineTo(hipX + s * 0.08, gy);
      }
      // torso
      ctx.moveTo(hipX, hipY); ctx.lineTo(shX, shY);
      // arms
      if (mode === 'run') {
        var b = Math.sin(ph);
        ctx.moveTo(shX, shY + s * 0.03); ctx.lineTo(shX - b * s * 0.15, shY + s * 0.17); ctx.lineTo(shX - b * s * 0.08 + s * 0.08, shY + s * 0.25);
        ctx.moveTo(shX, shY + s * 0.03); ctx.lineTo(shX + b * s * 0.15, shY + s * 0.17); ctx.lineTo(shX + b * s * 0.22, shY + s * 0.08);
      } else if (mode === 'cheer') {
        var up = cheerT;
        ctx.moveTo(shX, shY + s * 0.03); ctx.lineTo(shX - s * 0.16, shY - s * 0.14 * up + s * 0.12 * (1 - up));
        ctx.moveTo(shX, shY + s * 0.03); ctx.lineTo(shX + s * 0.16, shY - s * 0.14 * up + s * 0.12 * (1 - up));
      } else {
        ctx.moveTo(shX, shY + s * 0.03); ctx.lineTo(shX - s * 0.1, shY + s * 0.26);
        ctx.moveTo(shX, shY + s * 0.03); ctx.lineTo(shX + s * 0.1, shY + s * 0.26);
      }
      ctx.stroke(); ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
      // head
      var hx = shX + lean * 0.4, hy = shY - s * 0.13;
      D.circle(ctx, hx, hy, s * 0.11, col);
      // carried data bead (fetched) above head when cheering
      if (mode === 'cheer') {
        var by = hy - s * 0.3 - bob;
        D.glow(ctx, hx, by, s * 0.32 * cheerT, P.data, 0.75);
        D.circle(ctx, hx, by, Math.max(2.5, s * 0.08) * cheerT, P.data);
      }
      // sweat drops for the tired HDD runner
      if (tired > 0.25) {
        var d = (this.time * 2.5) % 1;
        ctx.globalAlpha = (1 - d) * tired;
        D.circle(ctx, hx - s * 0.16 - d * s * 0.1, hy - s * 0.02 + d * s * 0.18, Math.max(1.4, s * 0.03), P.air);
        ctx.globalAlpha = 1;
      }
    },

    /** desk calendar: month header + day number; the top page flips over when the month changes */
    calendar: function (ctx, x, y, s, col) {
      var P = S.pal, days = this.H / 86400, mo = Math.min(5, Math.floor(days / 30.4)), day = Math.max(1, Math.floor(days - mo * 30.4) + 1);
      var w = s, h = s * 1.05, head = h * 0.3;
      D.box(ctx, x + 2, y + 2, w, h, 3, U.rgba(P.text3, 0.35));
      D.box(ctx, x, y, w, h, 3, P.panel, U.rgba(col, 0.8), 1);
      D.box(ctx, x, y, w, head, 3, col);
      D.text(ctx, MONTHS[mo], x + w / 2, y + head / 2 + 0.5, { size: s * 0.26, weight: 800, color: P.bg, align: 'center' });
      D.text(ctx, String(day), x + w / 2, y + head + (h - head) / 2 + 1, { size: s * 0.4, weight: 800, color: P.text1, align: 'center' });
      // rings
      D.circle(ctx, x + w * 0.3, y, 1.6, P.text2); D.circle(ctx, x + w * 0.7, y, 1.6, P.text2);
      // flipping page (previous month) folding up from the top binding
      if (this.flip > 0 && mo > 0) {
        var f = this.flip, ph2 = h * f;
        ctx.globalAlpha = 0.95;
        D.box(ctx, x, y, w, ph2, 3, U.mix(P.panel, col, 0.25), U.rgba(col, 0.9), 1);
        if (ph2 > head) D.text(ctx, MONTHS[mo - 1], x + w / 2, y + head / 2, { size: s * 0.26, weight: 800, color: P.text1, align: 'center' });
        ctx.globalAlpha = 1;
      }
      D.text(ctx, 'DAY ' + Math.floor(days), x + w / 2, y + h + 8, { size: 8.5, weight: 700, color: col, align: 'center' });
    }
  });
})(window.SRV);
