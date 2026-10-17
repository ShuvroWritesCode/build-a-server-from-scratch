/* Ch10 · Pull the plug. Iso rear view of a 2U server with two hot-swap PSUs, each fed from its own
   PDU on its own breaker. Pull a PSU or trip a breaker and the other PSU carries 100%. Mistake mode
   puts both cords on circuit A; overload mode shows "redundant" only works if ONE PSU can carry it all. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso;

  var RATING = 1100;                                   // W per PSU
  var SB = { x: 0, y: 0, z: 0, w: 440, d: 600, h: 88 }; // chassis; rear = +y face (faces the viewer)
  var BAY = [{ x: 8, z: 4, w: 86, h: 40 }, { x: 346, z: 4, w: 86, h: 40 }];
  var PULL = 200;                                      // mm a module travels when fully pulled
  var tmp = [0, 0];

  function bez(out, x0, y0, x1, y1, x2, y2, x3, y3, n) {
    out.length = 0;
    for (var i = 0; i <= n; i++) {
      var t = i / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3);
    }
    return out;
  }
  function fmtW(w) { return U.fmt(Math.round(w)) + ' W'; }

  S.defineVisual('psu', {
    continuous: true,
    init: function () {
      this.ctx = this.layer();
      this.st = { brA: true, brB: true, mistake: false, load: 650, pulled: [false, false] };
      this.off = [0, 0];           // module slide-out (mm)
      this.plug = [0, 0];          // 0 = cord plugged in, 1 = dangling
      this.mx = 0;                 // mistake re-route animation 0..1
      this.wPsu = [325, 325];      // smoothed watts per PSU
      this.wFeed = [325, 325];     // smoothed watts per cord
      this.wBr = [325, 325];       // smoothed watts per breaker/PDU
      this.wBoard = 650;
      this.fan = 1; this.fanAng = 0;
      this.cord = [[], []]; this.pathTmp = [];
      this.lastMode = 'ok2';
      var self = this;

      var g = this.ui.group('Break the power');
      this.bPull = g.button('⇤ Pull PSU 1', function () { self.setPulled(0, !self.st.pulled[0]); }, { kind: 'danger' });
      this.bTrip = g.button('⚡ Trip breaker A', function () { self.setBreaker('A', !self.st.brA); }, { kind: 'danger' });
      g.button('↺ Reset', function () { self.reset(); });
      this.ui.br();
      this.tMistake = this.ui.toggle({ label: 'Mistake mode: both PSUs on circuit A', value: false, onChange: function (v) { self.setMistake(v); } });
      this.sLoad = this.ui.slider({ label: 'Server load', min: 300, max: 1500, step: 10, value: 650, fmt: fmtW,
        onInput: function (v) { self.st.load = v; self.evaluate(true); } });
      this.ui.spacer();
      this.rState = this.ui.readout('Server', 'running', 'ok');

      this.pointer({
        down: function (p) {
          var hit = this.hits.query(p.x, p.y);
          if (!hit) return false;
          if (hit.id === 'brA' || hit.id === 'brB') { this.setBreaker(hit.id === 'brA' ? 'A' : 'B', !(hit.id === 'brA' ? this.st.brA : this.st.brB)); return false; }
          if (hit.id === 'psu0') { this.drag = { x: p.x, y: p.y, off0: this.off[0] }; if (this.offTw) this.offTw.cancel(); return true; }
          if (hit.id === 'psu1') { this.tipAt('PSU 2 stays in — <b>drag PSU 1</b> out instead.', p.x, p.y); }
          return false;
        },
        move: function (p) {
          if (!this.drag) return;
          var a = this.V.p(0, 0, 0), b = this.V.p(0, 1, 0), ux = b[0] - a[0], uy = b[1] - a[1], L = Math.hypot(ux, uy) || 1;
          var dmm = ((p.x - this.drag.x) * ux + (p.y - this.drag.y) * uy) / (L * L);
          this.off[0] = U.clamp(this.drag.off0 + dmm, 0, PULL);
          var want = this.off[0] > PULL * 0.45;
          if (want !== this.st.pulled[0]) { this.st.pulled[0] = want; this.evaluate(true); }
        },
        up: function () {
          if (!this.drag) return;
          this.drag = null;
          this.setPulled(0, this.off[0] > PULL * 0.45, true);
        },
        hover: function (p) {
          var hit = this.hits.query(p.x, p.y);
          this.stage.style.cursor = hit ? (hit.id === 'psu0' ? 'grab' : 'pointer') : '';
          var hp = !!(hit && hit.id === 'psu0'); if (hp !== this.hoverPsu) { this.hoverPsu = hp; this.invalidate(); }
          if (hit && hit.data) this.tipAt(hit.data, p.x, p.y); else this.tipAt(null);
        },
        leave: function () { this.stage.style.cursor = ''; this.hoverPsu = false; }
      });
      this.evaluate(false);
    },

    // ---------------------------------------------------------------- state changes
    setPulled: function (i, v, fromDrag) {
      this.st.pulled[i] = v;
      var self = this;
      if (this.offTw) this.offTw.cancel();
      this.offTw = this.tween({ from: this.off[i], to: v ? PULL : 0, dur: fromDrag ? 0.35 : 0.8, ease: v ? 'settle' : 'snap', onUpdate: function (x) { self.off[i] = x; } });
      this.tween({ from: this.plug[i], to: v ? 1 : 0, dur: 0.6, delay: v ? 0.15 : 0, ease: v ? 'outBounce' : 'settle', onUpdate: function (x) { self.plug[i] = x; } });
      this.bPull.setLabel(this.st.pulled[0] ? '⇥ Reinsert PSU 1' : '⇤ Pull PSU 1');
      this.evaluate(true);
    },
    setBreaker: function (which, on) {
      if (which === 'A') this.st.brA = on; else this.st.brB = on;
      this.bTrip.setLabel(this.st.brA ? '⚡ Trip breaker A' : '↺ Reset breaker A');
      this.evaluate(true);
    },
    setMistake: function (v) {
      this.st.mistake = v;
      var self = this;
      this.tween({ from: this.mx, to: v ? 1 : 0, dur: 0.9, ease: 'camera', onUpdate: function (x) { self.mx = x; } });
      if (this.tMistake.get() !== v) this.tMistake.set(v);
      this.evaluate(true);
    },
    reset: function () {
      this.st.brA = this.st.brB = true;
      if (this.st.pulled[0]) this.setPulled(0, false);
      this.setMistake(false);
      this.st.load = 650; this.sLoad.set(650);
      this.bTrip.setLabel('⚡ Trip breaker A');
      this.evaluate(false);
      this.announce('Reset: both power supplies plugged into separate circuits, sharing 650 W.');
    },
    /** derive who is powered and the overall mode */
    evaluate: function (speak) {
      var st = this.st;
      var src = ['A', st.mistake ? 'A' : 'B'];
      var inPow = [0, 1].map(function (i) { return !st.pulled[i] && (src[i] === 'A' ? st.brA : st.brB); });
      var live = (inPow[0] ? 1 : 0) + (inPow[1] ? 1 : 0);
      var mode;
      if (live === 0) mode = 'out';
      else if (live === 1) mode = st.load > RATING ? 'trip' : 'ok1';
      else mode = st.load > RATING ? 'over' : 'ok2';
      var on = mode === 'ok1' || mode === 'ok2' || mode === 'over';
      this.src = src; this.inPow = inPow; this.live = live; this.mode = mode; this.on = on;
      // instantaneous targets (watts)
      this.tPsu = [0, 1].map(function (i) { return on && inPow[i] ? st.load / live : 0; });
      // a pulled module's cord is unplugged; an inserted-but-off one carries 0
      this.tFeed = this.tPsu.slice();
      this.tBr = [0, 0];
      for (var i = 0; i < 2; i++) this.tBr[src[i] === 'A' ? 0 : 1] += this.tFeed[i];
      this.tBoard = on ? st.load : 0;
      if (this._paused && this.wPsu) {   // reduced motion: no smoothing loop runs, so snap to the new state
        for (var j = 0; j < 2; j++) { this.wPsu[j] = this.tPsu[j]; this.wFeed[j] = this.tFeed[j]; this.wBr[j] = this.tBr[j]; }
        this.wBoard = this.tBoard; this.fan = on ? 1 : 0;
      }

      var cls = mode === 'ok2' ? 'ok' : mode === 'ok1' ? 'ok' : mode === 'over' ? 'warn' : 'bad';
      var txt = { ok2: 'running · redundant', ok1: 'still running ✓', over: 'running · not redundant', trip: 'OFF · overload', out: 'OFF · outage' }[mode];
      this.rState.set(txt, cls);
      if (speak && mode !== this.lastMode) {
        var survivor = inPow[0] ? 1 : 2;
        var msg = {
          ok2: 'Both power supplies share the load, ' + fmtW(st.load / 2) + ' each.',
          ok1: 'One supply lost. PSU ' + survivor + ' now carries all ' + fmtW(st.load) + '. The server keeps running.',
          over: 'Warning: ' + fmtW(st.load) + ' is more than one ' + RATING + ' W supply can carry. Lose either one and the server dies.',
          trip: 'Not actually redundant: ' + fmtW(st.load) + ' is more than the surviving ' + RATING + ' W supply. The server shuts off.',
          out: st.mistake ? 'Both supplies were on circuit A. Tripping A cut all power: outage.' : 'Outage: no power reaches either supply.'
        }[mode];
        this.announce(msg);
      }
      this.lastMode = mode;
    },

    // ---------------------------------------------------------------- layout
    resize: function (w, h) {
      var m = this.mobile = w < 560;
      this.s = m ? Math.min(1, w / 380) : Math.min(1.15, w / 900);
      var V = this.V = I.view({ yaw: -0.4, S: 0.3, cx: 220, cy: 300 });
      var bb = { x0: 0, y0: 0, z0: 0, x1: SB.w, y1: SB.d + PULL * (m ? 1 : 0.7), z1: SB.h };
      if (m) {
        this.panel = { x: 12, y: 12, w: Math.min(176, w * 0.5 - 18), h: 74 };
        this.fanBox = { x: w * 0.5 + 6, y: 12, w: w * 0.5 - 18, h: 74 };
        var pdy = h - 182;
        this.pdu = [{ x: 18, y: pdy, w: w - 36, h: 20, horiz: true }, { x: 18, y: pdy + 26, w: w - 36, h: 20, horiz: true }];
        V.fit(bb, w - 16, pdy - 106, 4); V.ox += 8; V.oy += 98;
        this.gy = h - 74; this.banY = h - 16;
      } else {
        this.panel = { x: 22, y: 20, w: 200, h: 112 };
        this.fanBox = { x: w - 258, y: 18, w: 238, h: 84 };
        var py0 = 168, py1 = h - 46;
        this.pdu = [{ x: 44, y: py0, w: 34, h: py1 - py0 }, { x: 136, y: py0, w: 34, h: py1 - py0 }];
        var rx0 = w * 0.25, rw = w * 0.7, ry0 = h * 0.2, rh = h * 0.56;
        V.fit(bb, rw, rh, 10); V.ox += rx0; V.oy += ry0;
        this.gy = h - 70; this.banY = 136;
      }
    },
    outlet: function (pdu, idx) {
      var P = this.pdu[pdu], n = 6;
      if (P.horiz) { var ox = P.x + 22 + (P.w - 74) * (idx + 0.5) / n; return { x: ox, y: P.y + P.h / 2, ex: ox, ey: P.y }; }
      var oy = P.y + 26 + (P.h - 40) * (idx + 0.5) / n; return { x: P.x + P.w / 2, y: oy, ex: P.x + P.w, ey: oy };
    },

    // ---------------------------------------------------------------- simulation
    update: function (dt) {
      var k = 7;
      for (var i = 0; i < 2; i++) {
        this.wPsu[i] = U.damp(this.wPsu[i], this.tPsu[i], k, dt);
        this.wFeed[i] = U.damp(this.wFeed[i], this.tFeed[i], k, dt);
        this.wBr[i] = U.damp(this.wBr[i], this.tBr[i], k, dt);
      }
      this.wBoard = U.damp(this.wBoard, this.tBoard, k, dt);
      // fans: quick spin-up, slow inertial coast-down
      this.fan = U.damp(this.fan, this.on ? 1 : 0, this.on ? 2.2 : 0.55, dt);
      if (!this.on && this.fan < 0.004) this.fan = 0;
      this.fanAng += dt * this.fan * 38;
    },

    // ---------------------------------------------------------------- drawing
    draw: function () {
      var ctx = this.ctx, w = this.w, h = this.h, P = S.pal, t = this.time, self = this;
      D.clear(ctx, w, h);
      this.hits.clear();
      this.drawPanel(ctx, P, t);
      this.drawPdus(ctx, P, t);
      this.drawServer(ctx, P, t);
      this.drawCords(ctx, P, t);
      this.drawGauges(ctx, P);
      this.drawFans(ctx, P);
      this.drawBanner(ctx, P, t);
      var m = this.mode;
      this.setDesc({
        ok2: 'Both power supplies are plugged into separate circuits and share ' + fmtW(this.st.load) + ' half and half.',
        ok1: 'One power supply is out; the other carries 100% of ' + fmtW(this.st.load) + ' and the fans keep spinning.',
        over: 'Both supplies run, but ' + fmtW(this.st.load) + ' is more than one supply can carry alone, so this is not truly redundant.',
        trip: 'The surviving supply cannot carry ' + fmtW(this.st.load) + ', so the server shut down.',
        out: 'No power reaches either supply: the server is off and the fans have stopped.'
      }[m]);
      void self;
    },

    flowW: function (ctx, pts, watts, t, wdt) {
      var P = S.pal, on = watts > 4;
      D.flow(ctx, pts, on ? P.power : U.rgba(P.text3, 0.5), t, { width: wdt || 2, speed: on ? 14 + watts * 0.07 : 0, dash: [7, 7], base: on ? 0.16 : 0.1 });
    },

    drawPanel: function (ctx, P, t) {
      var b = this.panel, m = this.mobile, s = m ? 0.85 : 1;
      // utility feed
      var gx = b.x + b.w / 2;
      D.line(ctx, gx, 0, gx, b.y, U.rgba(P.power, 0.8), 2);
      D.box(ctx, b.x, b.y, b.w, b.h, 8, U.rgba(P.panel2, 0.95), U.rgba(P.blueprint, 0.45), 1);
      D.text(ctx, 'BREAKER PANEL', b.x + 10, b.y + 13, { size: 10 * s, weight: 700, color: P.text2, ls: 1 });
      if (!m) D.text(ctx, '230 V', b.x + b.w - 10, b.y + 13, { size: 9, color: P.text3, align: 'right' });
      var names = ['A', 'B'], ons = [this.st.brA, this.st.brB];
      for (var i = 0; i < 2; i++) {
        var bw = m ? 30 : 38, bh = m ? 38 : 56, bx = b.x + b.w * (i ? 0.7 : 0.3) - bw / 2, by = b.y + (m ? 26 : 30);
        var on = ons[i], col = on ? P.ok : P.fault;
        D.box(ctx, bx, by, bw, bh, 4, U.rgba(P.silicon, 0.7), U.rgba(col, 0.8), 1.4);
        // lever
        var lh = bh * 0.38, ly = on ? by + 5 : by + bh - 5 - lh;
        D.box(ctx, bx + bw * 0.25, ly, bw * 0.5, lh, 3, on ? P.alu : U.mix(P.alu, P.fault, 0.45));
        D.text(ctx, names[i], bx - (m ? 9 : 12), by + bh / 2, { size: 13 * s, weight: 800, color: P.text1, align: 'center' });
        D.text(ctx, on ? 'ON' : 'TRIPPED', bx + bw / 2, by + bh + (m ? 8 : 11), { size: 9 * s, weight: 700, color: col, align: 'center' });
        if (!on) D.g.cross(ctx, bx + bw + 9, by + 8, 12, P.fault);
        this.hits.rect(i ? 'brB' : 'brA', bx - 14, by - 4, bw + 28, bh + 22, 'Circuit ' + names[i] + ' breaker — click to ' + (on ? 'trip' : 'reset'));
        // breaker → PDU feed
        var pd = this.pdu[i], pts = this.pathTmp; pts.length = 0;
        var fx = bx + bw / 2, fy = by + bh + (m ? 12 : 18);
        if (pd.horiz) { var side = i ? pd.x + pd.w + 6 : pd.x - 6; pts.push(fx, fy, side, fy, side, pd.y + pd.h / 2, i ? pd.x + pd.w : pd.x, pd.y + pd.h / 2); }
        else pts.push(fx, fy, fx, fy + 14, pd.x + pd.w / 2, fy + 14, pd.x + pd.w / 2, pd.y);
        this.flowW(ctx, pts, on ? this.wBr[i] : 0, t, 2);
      }
    },

    drawPdus: function (ctx, P, t) {
      var m = this.mobile, mx = this.mx;
      for (var i = 0; i < 2; i++) {
        var p = this.pdu[i], live = i === 0 ? this.st.brA : this.st.brB;
        D.box(ctx, p.x, p.y, p.w, p.h, 4, U.shade(P.plastic, S.pal.dark ? 0.05 : 0.2), U.rgba(P.blueprint, 0.4), 1);
        // display window
        if (p.horiz) {
          D.box(ctx, p.x + 3, p.y + 3, 15, p.h - 6, 2, U.rgba(P.silicon, 0.85));
          D.text(ctx, 'PDU ' + (i ? 'B' : 'A'), p.x + p.w - 6, p.y + p.h / 2 + 0.5, { size: 9, weight: 800, color: P.text1, align: 'right' });
        } else {
          D.box(ctx, p.x + 4, p.y + 4, p.w - 8, 16, 2, U.rgba(P.silicon, 0.85));
          D.text(ctx, live ? (this.wBr[i] / 230).toFixed(1) : '--', p.x + p.w / 2, p.y + 12.5, { size: 9, weight: 700, color: live ? P.power : P.text3, align: 'center' });
          D.text(ctx, 'PDU ' + (i ? 'B' : 'A'), p.x + p.w / 2, p.y + p.h + 12, { size: 11, weight: 800, color: P.text1, align: 'center' });
          D.text(ctx, 'circuit ' + (i ? 'B' : 'A'), p.x + p.w / 2, p.y + p.h + 25, { size: 9, color: P.text3, align: 'center' });
        }
        for (var o = 0; o < 6; o++) {
          var q = this.outlet(i, o), used = (i === 0 && (o === 2 || (o === 4 && mx > 0.5))) || (i === 1 && o === 3 && mx < 0.5);
          var ow = p.horiz ? 12 : 16, oh = p.horiz ? 10 : 12;
          D.box(ctx, q.x - ow / 2, q.y - oh / 2, ow, oh, 2, U.rgba(P.silicon, 0.8), U.rgba(P.alu, used ? 0.7 : 0.3), 1);
          if (used) D.circle(ctx, q.x, q.y, 1.6, live ? P.ok : U.rgba(P.text3, 0.6));
        }
        if (p.horiz && live) D.text(ctx, (this.wBr[i] / 230).toFixed(1), p.x + 10.5, p.y + p.h / 2 + 0.5, { size: 7, weight: 700, color: P.power, align: 'center' });
      }
      if (!m) D.text(ctx, 'amps', this.pdu[0].x + this.pdu[0].w / 2, this.pdu[0].y + 28, { size: 7, color: P.text3, align: 'center' });
    },

    /** state for the LED of PSU i */
    psuLed: function (i) {
      var P = S.pal;
      if (this.mode === 'out') return this.st.pulled[i] ? [P.power, 'blink'] : [P.power, 'off'];
      if (this.st.pulled[i] || !this.inPow[i]) return [P.power, 'blink'];
      if (this.mode === 'trip') return [P.power, 'blink'];
      return [P.ok, 'solid'];
    },

    drawServer: function (ctx, P, t) {
      var V = this.V, self = this, on = this.on, off = this.off;
      I.shadow(ctx, V, SB, 0.28);
      // ---- chassis
      I.box(ctx, V, SB, { color: 'steel', decal: {
        left: function (c, w, hh) {
          var px = I.px;
          c.fillStyle = U.shade(P.steel, -0.38); c.fillRect(2, 2, w - 4, hh - 4);
          // honeycomb vents (top band)
          c.fillStyle = U.rgba(P.silicon, 0.55);
          for (var y = 8; y < 30; y += 7) for (var x = 104 + ((y / 7) % 2) * 3.5; x < 336; x += 7) { c.beginPath(); c.arc(x, y, 2.1, 0, U.TAU); c.fill(); }
          // PCIe slot covers
          for (var k = 0; k < 3; k++) { c.fillStyle = U.shade(P.steel, -0.1); c.fillRect(110 + k * 76, 34, 66, 22); c.fillStyle = U.rgba(P.silicon, 0.4); for (var v = 0; v < 6; v++) c.fillRect(116 + k * 76 + v * 10, 38, 5, 14); }
          // IO row: 4 RJ45 + BMC port + VGA + USB
          for (var n = 0; n < 4; n++) {
            var nx = 112 + n * 26;
            c.fillStyle = U.rgba(P.silicon, 0.9); c.fillRect(nx, 64, 20, 16);
            D.led(c, nx + 4, 61, P.ok, on ? 'activity' : 'off', t * 1.3 + n * 2.1, 1.6);
            D.led(c, nx + 16, 61, P.power, on ? 'solid' : 'off', t, 1.6);
          }
          c.fillStyle = U.rgba(P.silicon, 0.9); c.fillRect(226, 64, 20, 16);
          c.fillStyle = U.rgba(P.mgmt, 0.6); c.fillRect(226, 81, 20, 2.5);
          D.led(c, 230, 61, P.mgmt, 'heartbeat', t, 1.6);   // BMC stays alive on standby
          c.fillStyle = U.rgba(P.data, 0.35); c.fillRect(256, 66, 30, 12);
          c.fillStyle = U.rgba(P.silicon, 0.9); c.fillRect(294, 66, 12, 12); c.fillRect(310, 66, 12, 12);
          // empty bays behind each module
          for (var i = 0; i < 2; i++) { var B = BAY[i]; c.fillStyle = U.rgba(P.silicon, 0.95); c.fillRect(B.x - 1, hh - B.z - B.h - 1, B.w + 2, B.h + 2); }
          // system health LED
          D.led(c, 330, 8, on ? P.ok : P.fault, on ? 'solid' : 'off', t, 2.4);
          c.lineWidth = px; c.strokeStyle = U.rgba(P.alu, 0.25); c.strokeRect(2, 2, w - 4, hh - 4);
        },
        top: function (c, w, d) {
          var px = I.px;
          c.strokeStyle = U.rgba(P.alu, 0.18); c.lineWidth = px;
          c.strokeRect(6, 6, w - 12, d - 12);
          // x-ray outlines of the inside (dashed blueprint)
          c.setLineDash([6 * px, 5 * px]); c.strokeStyle = U.rgba(P.blueprint, 0.42);
          c.strokeRect(BAY[0].x, 300, BAY[0].w, 296); c.strokeRect(BAY[1].x, 300, BAY[1].w, 296);
          for (var f = 0; f < 6; f++) c.strokeRect(18 + f * 70, 150, 60, 34);
          c.strokeRect(150, 250, 140, 120);
          c.setLineDash([]);
        }
      } });
      // board + fan x-ray labels/flows on top face
      var pts = this.pathTmp;
      for (var i = 0; i < 2; i++) {
        var cx = BAY[i].x + BAY[i].w / 2;
        pts.length = 0;
        [[cx, 590], [cx, 330], [i ? 290 : 150, 330]].forEach(function (q) { V.p(q[0], q[1], SB.h, tmp); pts.push(tmp[0], tmp[1]); });
        this.flowW(ctx, pts, this.wPsu[i], t, 1.8);
      }
      pts.length = 0;
      [[220, 250], [220, 184]].forEach(function (q) { V.p(q[0], q[1], SB.h, tmp); pts.push(tmp[0], tmp[1]); });
      this.flowW(ctx, pts, this.wBoard, t, 1.8);
      V.p(220, 310, SB.h, tmp);
      D.pill(ctx, '12 V · ' + fmtW(this.wBoard), tmp[0], tmp[1], { size: this.mobile ? 8 : 9, align: 'center', color: this.wBoard > 4 ? P.power : P.text3 });
      if (!this.mobile) { V.p(20, 167, SB.h, tmp); D.text(ctx, 'fans', tmp[0] - 8, tmp[1] - 8, { size: 9, color: P.blueprint, align: 'right' }); }

      // ---- PSU modules (protruding part + rear panel)
      for (var j = 0; j < 2; j++) {
        var B = BAY[j], o = off[j], led = this.psuLed(j);
        var mb = { x: B.x, y: SB.d, z: B.z, w: B.w, d: Math.max(0.6, o), h: B.h };
        var grabbed = j === 0 && (this.drag || o > 1);
        I.box(ctx, V, mb, { color: 'steel', highlight: j === 0 && this.hoverPsu ? P.accent : null, decal: {
          left: (function (L, jj) {
            return function (c, w, hh) {
              c.fillStyle = U.shade(P.steel, -0.2); c.fillRect(0, 0, w, hh);
              // fan grill
              c.strokeStyle = U.rgba(P.silicon, 0.6); c.lineWidth = 1.2 * I.px;
              for (var r = 4; r <= 14; r += 4) { c.beginPath(); c.arc(w * 0.62, hh * 0.5, r, 0, U.TAU); c.stroke(); }
              // C14 inlet
              c.fillStyle = U.rgba(P.silicon, 0.92); c.fillRect(6, hh * 0.25, 18, 16);
              c.fillStyle = U.rgba(P.alu, 0.7); c.fillRect(10, hh * 0.25 + 5, 2, 6); c.fillRect(14, hh * 0.25 + 3, 2, 6); c.fillRect(18, hh * 0.25 + 5, 2, 6);
              // release handle (lime grip on the draggable one)
              c.fillStyle = jj === 0 ? U.rgba(P.accent, 0.9) : P.alu; c.fillRect(w - 10, 4, 6, hh - 8);
              D.led(c, w * 0.62, hh - 6, L[0], L[1], t, 2.2);
            };
          })(led, j)
        } });
        V.p(B.x + B.w * 0.18, SB.d + o, B.z + B.h * 0.5, tmp);
        this['inlet' + j] = [tmp[0], tmp[1]];
        this.hits.poly('psu' + j, I.hull(V, { x: B.x, y: SB.d - 2, z: B.z, w: B.w, d: Math.max(6, o + 2), h: B.h }), j === 0 ? 'PSU 1 · drag it out (or use the button)' : 'PSU 2 · 1100 W hot-swap');
        void grabbed;
      }
    },

    drawCords: function (ctx, P, t) {
      var m = this.mobile, mx = this.mx;
      for (var i = 0; i < 2; i++) {
        // source outlet: PSU 1 → A#2; PSU 2 → B#3 (normal) or A#4 (mistake)
        var a = i === 0 ? this.outlet(0, 2) : this.outlet(1, 3);
        if (i === 1) { var b2 = this.outlet(0, 4); a = { x: U.lerp(a.ex, b2.ex, mx), y: U.lerp(a.ey, b2.ey, mx) }; } else a = { x: a.ex, y: a.ey };
        // mid-reroute: lift the plug up in an arc
        var lift = i === 1 ? Math.sin(mx * Math.PI) * 40 : 0;
        a.y -= lift * (m ? 0.4 : 1);
        var inl = this['inlet' + i], pl = this.plug[i];
        var ex = inl[0] - 26 * pl, ey = inl[1] + 46 * pl;
        var c1x, c1y, c2x, c2y;
        if (m) { c1x = a.x; c1y = a.y - 34; c2x = ex - 16; c2y = ey + 40; }
        else { c1x = a.x + 90; c1y = a.y + 30; c2x = ex - 90; c2y = ey + 70; }
        var pts = bez(this.cord[i], a.x, a.y, c1x, c1y, c2x, c2y, ex, ey, 22);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        D.poly(ctx, pts, false); ctx.strokeStyle = U.shade(P.cable, P.dark ? 0.12 : -0.1); ctx.lineWidth = 4.5; ctx.stroke();
        ctx.lineCap = 'butt';
        if (pl < 0.5) this.flowW(ctx, pts, this.wFeed[i], t, 1.6);
        // plug body at the PSU end
        D.box(ctx, ex - 7, ey - 5, 12, 10, 2, U.shade(P.plastic, 0.15), U.rgba(P.alu, 0.5), 1);
        if (pl > 0.6) D.text(ctx, 'unplugged', Math.max(56, ex - 12), ey + 1, { size: 9, color: P.power, align: 'right', alpha: (pl - 0.6) / 0.4 });
        // cord labels
        if (!m) {
          var mid = Math.floor(pts.length / 4) * 2;
          D.text(ctx, 'cord ' + (i + 1) + ' · ' + (i === 0 || mx < 0.5 ? (i ? 'B' : 'A') : 'A'), pts[mid] + 6, pts[mid + 1] - 10, { size: 9, color: (i === 1 && mx > 0.5) ? P.fault : P.text3 });
        }
      }
    },

    drawGauges: function (ctx, P) {
      var m = this.mobile, r = m ? 22 : 28, load = this.st.load;
      for (var i = 0; i < 2; i++) {
        var inl = this['inlet' + i], gx, gy;
        if (m) { gx = this.w * (i ? 0.72 : 0.28); gy = this.gy; }
        else { gx = i ? Math.min(this.w - 60, inl[0] + 120) : Math.max(this.pdu[1].x + 110, inl[0] - 20); gy = this.gy - (i ? 0 : 0); }
        var tripped = this.mode === 'trip' && this.inPow[i];
        var watts = tripped ? load : this.wPsu[i], share = load > 0 ? watts / load : 0, over = watts > RATING + 1;
        var col = over ? P.fault : (watts > 4 ? P.power : P.text3);
        // leader from module to gauge
        ctx.globalAlpha = 0.6; D.line(ctx, inl[0] + (i ? 30 : 10), inl[1] + 6, gx, gy - r - 8, U.rgba(P.blueprint, 0.7), 1, [3, 3]); ctx.globalAlpha = 1;
        D.circle(ctx, gx, gy, r + 9, U.rgba(P.panel, 0.92), U.rgba(P.blueprint, 0.3), 1);
        D.gauge(ctx, gx, gy, r, share, col, { value: Math.round(share * 100) + '%', lw: m ? 5 : 6, size: m ? 11 : 13 });
        D.text(ctx, 'PSU ' + (i + 1), gx, gy - r - 16, { size: m ? 9 : 10, weight: 800, color: P.text1, align: 'center' });
        D.text(ctx, fmtW(watts) + (m ? '' : ' / ' + U.fmt(RATING)), gx, gy + r + 14, { size: m ? 8.5 : 9.5, weight: 600, color: over ? P.fault : P.text2, align: 'center' });
        if (over) { D.g.warn(ctx, gx + r + 8, gy - r, 14, P.fault); if (tripped && !m) D.pill(ctx, 'OVERLOAD · shut off', gx, gy + r + (m ? 28 : 30), { size: m ? 8 : 9, align: 'center', color: P.fault }); }
      }
    },

    drawFans: function (ctx, P) {
      var b = this.fanBox, m = this.mobile, n = m ? 4 : 6, fan = this.fan;
      D.box(ctx, b.x, b.y, b.w, b.h, 8, U.rgba(P.panel2, 0.95), U.rgba(P.blueprint, 0.45), 1);
      D.text(ctx, 'FAN WALL', b.x + 10, b.y + 12, { size: m ? 9 : 10, weight: 700, color: P.text2, ls: 1 });
      var rpm = Math.round(fan * (8200 + this.st.load * 1.6) / 10) * 10;
      D.text(ctx, U.fmt(rpm) + ' rpm', b.x + b.w - 10, b.y + 12, { size: m ? 9 : 10, weight: 700, color: fan > 0.2 ? P.air : P.fault, align: 'right' });
      var fr = Math.min((b.w - 20) / n / 2 - 3, (b.h - (m ? 44 : 30)) / 2), y = b.y + 24 + fr + (m ? 0 : 2);
      for (var i = 0; i < n; i++) {
        var x = b.x + 10 + (b.w - 20) * (i + 0.5) / n;
        D.fan2d(ctx, x, y, fr, this.fanAng * (1 + i * 0.04) + i, { blur: fan > 0.55 ? 1 : 0, color: P.plastic });
      }
      var txt = this.on ? (this.mode === 'ok1' ? 'still spinning ✓' : 'spinning') : (fan > 0.02 ? 'coasting down…' : 'stopped ✕');
      D.text(ctx, txt, b.x + b.w / 2, m ? b.y + b.h - 9 : b.y + b.h + 11, { size: 9, weight: 700, color: this.on ? P.ok : P.fault, align: 'center' });
    },

    drawBanner: function (ctx, P, t) {
      var m = this.mode, mob = this.mobile, x = mob ? this.w / 2 : this.fanBox.x + this.fanBox.w / 2, y = this.banY;
      var L = this.st.load, blink = (Math.floor(t * 2) % 2) ? 1 : 0.55;
      var o = { size: mob ? 10 : 11, weight: 800, align: 'center' };
      if (m === 'ok2') { o.color = P.ok; D.pill(ctx, '✓ REDUNDANT · 50 / 50', x, y, o); }
      else if (m === 'ok1') { o.color = P.ok; D.pill(ctx, '✓ STILL RUNNING · one PSU carries 100%', x, y, o); }
      else if (m === 'over') { o.color = P.warn; D.pill(ctx, '⚠ ' + U.fmt(L) + ' W > one PSU (' + U.fmt(RATING) + ' W)', x, y, o); }
      else if (m === 'trip') {
        o.color = P.fault; o.bg = U.rgba(P.fault, 0.14 * blink + 0.06);
        D.pill(ctx, '✕ NOT ACTUALLY REDUNDANT', x, y - (mob ? 0 : 0), o);
        if (!mob) D.text(ctx, U.fmt(L) + ' W load > ' + U.fmt(RATING) + ' W single PSU', x, y + 20, { size: 10, weight: 600, color: P.fault, align: 'center' });
      } else { o.color = P.fault; o.bg = U.rgba(P.fault, 0.14 * blink + 0.06); D.pill(ctx, '✕ OUTAGE · server dark', x, y, o); }
      if (!mob) {
        var lw = D.measure(ctx, 'power flow · speed ∝ watts', 9), g0 = this.inlet0, g1 = this.inlet1;
        var lx = g0 && g1 ? (Math.max(this.pdu[1].x + 110, g0[0] - 20) + Math.min(this.w - 60, g1[0] + 120)) / 2 : this.w / 2, ly = this.h - 16;
        D.line(ctx, lx - lw / 2 - 30, ly, lx - lw / 2 - 6, ly, P.power, 2, [6, 5]);
        D.text(ctx, 'power flow · speed ∝ watts', lx - lw / 2, ly, { size: 9, color: P.text3 });
      }
      if (this.st.mistake && !mob) D.text(ctx, '⚠ both cords', this.pdu[1].x + this.pdu[1].w + 8, this.pdu[1].y + 10, { size: 10, weight: 700, color: P.fault });
      if (this.st.mistake && !mob) D.text(ctx, 'on circuit A', this.pdu[1].x + this.pdu[1].w + 8, this.pdu[1].y + 24, { size: 10, weight: 700, color: P.fault });
      if (this.st.mistake && mob) D.text(ctx, '⚠ both cords on A', this.w - 18, this.pdu[1].y + this.pdu[1].h + 9, { size: 9, weight: 700, color: P.fault, align: 'right' });
    }
  });
})(window.SRV);
