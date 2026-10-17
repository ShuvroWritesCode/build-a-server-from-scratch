/* Ch17 · Which OS? Three yes/no questions as clickable nodes; the chosen path lights up and a
   travelling dot runs along it to a leaf: TrueNAS Community, Proxmox VE, Windows Server 2025 or
   Ubuntu Server LTS. The leaf card shows a code-drawn mini "screen" (stylised UI, no logos) + notes. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw;

  var QS = [['Mostly storing', 'files?'], ['Many virtual', 'machines?'], ['Need Microsoft', 'Active Directory?']];
  var QFULL = ['Is it mostly for storing and sharing files?', 'Will it run many virtual machines?', 'Do you need Microsoft Active Directory?'];
  var OS = [
    { id: 'truenas', name: 'TrueNAS Community', tag: 'NAS-first: share files, ZFS built in', col: 'data',
      notes: [['check', 'Free'], ['check', 'ZFS snapshots + self-healing'], ['warn', 'Wants an HBA and ECC RAM']] },
    { id: 'proxmox', name: 'Proxmox VE', tag: 'One server → many VMs + containers', col: 'power',
      notes: [['check', 'Free (paid support optional)'], ['check', 'Web UI, ZFS and backups built in'], ['warn', 'You still patch each VM’s OS']] },
    { id: 'windows', name: 'Windows Server 2025', tag: 'Active Directory + Microsoft apps', col: 'mgmt',
      notes: [['warn', 'Licensed per CPU core'], ['warn', '16-core minimum + client CALs'], ['check', 'Native AD, Group Policy, Hyper-V']] },
    { id: 'ubuntu', name: 'Ubuntu Server LTS', tag: 'General Linux for apps & containers', col: 'heat',
      notes: [['check', 'Free'], ['check', '5 years of security updates'], ['check', 'Huge community, Docker-ready']] }
  ];

  S.defineVisual('ostree', {
    init: function () {
      this.ctx = this.layer();
      this.ans = [null, null, null];
      this.drawn = 0; this.reveal = 0;
      var self = this;
      var g = this.ui.group('Answer the question');
      this.qText = g.text('', 'ctl');
      this.bYes = g.button('Yes', function () { self.answer(self.curQ(), true); }, { kind: 'primary' });
      this.bNo = g.button('No', function () { self.answer(self.curQ(), false); });
      g.button('↺ Start over', function () { self.answer(0, null); });
      this.ui.br();
      var j = this.ui.group('Jump to an answer');
      j.text('<span class="ctl-label">Or jump to</span>', 'ctl');
      this.jb = OS.map(function (o, i) { return j.button(o.name.replace(' Community', '').replace(' 2025', '').replace(' LTS', ''), function () { self.jump(i); }); });
      this.pointer({
        down: function (p) { var hit = self.hits.query(p.x, p.y); if (hit) { self.answer(hit.data.q, hit.data.v); } return false; },
        hover: function (p) { var hit = self.hits.query(p.x, p.y); self.stage.style.cursor = hit ? 'pointer' : ''; },
        leave: function () { self.stage.style.cursor = ''; }
      });
      this.syncUI();
    },
    curQ: function () { if (this.ans[0] === null) return 0; if (this.ans[0]) return -1; if (this.ans[1] === null) return 1; if (this.ans[1]) return -1; if (this.ans[2] === null) return 2; return -1; },
    leaf: function () { var a = this.ans; if (a[0] === true) return 0; if (a[0] === false && a[1] === true) return 1; if (a[0] === false && a[1] === false && a[2] !== null) return a[2] ? 2 : 3; return -1; },
    answer: function (q, v) {
      if (q < 0) return;
      for (var i = q; i < 3; i++) this.ans[i] = null;
      if (v !== null) this.ans[q] = v;
      this.afterChange(v === null ? 'Start over. ' + QFULL[0] : null);
    },
    jump: function (i) {
      this.ans = [[true, null, null], [false, true, null], [false, false, true], [false, false, false]][i];
      this.afterChange(null);
    },
    afterChange: function (msg) {
      var self = this, L = this.leaf();
      this.computePath();
      var from = Math.min(this.drawn, this.pathLen);
      if (this._tw) this._tw.cancel();
      this._tw = this.tween({ from: from, to: this.pathLen, dur: Math.max(0.35, (this.pathLen - from) / 500), ease: 'inOutSine', onUpdate: function (v) { self.drawn = v; } });
      this.reveal = 0;
      if (L >= 0) this.tween({ from: 0, to: 1, dur: 0.6, delay: 0.25, ease: 'outCubic', onUpdate: function (v) { self.reveal = v; } });
      this.syncUI();
      if (msg) this.announce(msg);
      else if (L >= 0) this.announce('Recommendation: ' + OS[L].name + '. ' + OS[L].tag + '.');
      else this.announce(QFULL[this.curQ()]);
    },
    syncUI: function () {
      var q = this.curQ(), L = this.leaf();
      this.qText.innerHTML = q >= 0 ? '<b style="color:var(--c-text1)">Q' + (q + 1) + '.</b>&nbsp;' + QFULL[q] : '<span style="color:var(--c-ok)">✓ Answer found.</span>';
      this.bYes.setDisabled(q < 0); this.bNo.setDisabled(q < 0);
      this.jb.forEach(function (b, i) { b.setPressed(i === L); });
    },
    resize: function (w, h) {
      this.mobile = w < 560;
      var mob = this.mobile, pad = mob ? 12 : 24;
      var T = mob ? { x: pad, y: 10, w: w - pad * 2, h: h * 0.56 - 10 } : { x: pad, y: 16, w: w * 0.56 - pad, h: h - 32 };
      this.card = mob ? { x: pad, y: T.y + T.h + 8, w: w - pad * 2, h: h - T.y - T.h - 8 - pad } : { x: w * 0.58, y: 16, w: w * 0.42 - pad, h: h - 32 };
      var qw = mob ? Math.min(T.w * 0.5, 170) : Math.min(T.w * 0.44, 240), qh = mob ? 34 : 46;
      var lw = mob ? T.w * 0.42 : Math.min(T.w * 0.4, 230), lh = mob ? 30 : 40;
      var rows = 4, rowH = (T.h - qh) / (rows - 1);
      var qx = T.x, lx = T.x + T.w - lw;
      this.T = T;
      this.qn = []; this.ln = [];
      for (var i = 0; i < 3; i++) this.qn.push({ x: qx, y: T.y + i * rowH, w: qw, h: qh });
      for (var j = 0; j < 4; j++) this.ln.push({ x: lx, y: T.y + j * rowH + (qh - lh) / 2, w: lw, h: lh });
      this.computePath();
      this.drawn = Math.min(this.drawn, this.pathLen);
    },
    /** edges as polylines (flat arrays) */
    edge: function (q, yes) {
      var n = this.qn[q];
      if (yes) { var L = this.ln[q]; return [n.x + n.w, n.y + n.h / 2, L.x, L.y + L.h / 2]; }
      if (q < 2) { var m = this.qn[q + 1]; return [n.x + n.w * 0.3, n.y + n.h, m.x + m.w * 0.3, m.y]; }
      var U2 = this.ln[3]; return [n.x + n.w * 0.3, n.y + n.h, n.x + n.w * 0.3, U2.y + U2.h / 2, U2.x, U2.y + U2.h / 2];
    },
    computePath: function () {
      if (!this.qn) { this.path = []; this.pathLen = 0; return; }
      var pts = [], a = this.ans, self = this;
      var start = this.qn[0];
      pts.push(start.x - 10, start.y + start.h / 2);
      function add(e) { for (var i = 0; i < e.length; i += 2) pts.push(e[i], e[i + 1]); }
      for (var q = 0; q < 3; q++) {
        var n = self.qn[q];
        if (q > 0) pts.push(n.x + n.w * 0.3, n.y);
        pts.push(n.x + n.w * 0.3, n.y + n.h / 2);
        if (a[q] === null) break;
        add(self.edge(q, a[q]));
        if (a[q]) break;
      }
      this.path = pts; this.lens = D.polyLen(pts); this.pathLen = this.lens[this.lens.length - 1];
    },
    drawNode: function (ctx, n, lines, state, kind, col) {
      var P = S.pal, mob = this.mobile, on = state === 'on', cur = state === 'cur', dim = state === 'off';
      var c = col || P.blueprint;
      D.box(ctx, n.x, n.y, n.w, n.h, kind === 'q' ? 10 : 8, P.panel);
      D.box(ctx, n.x, n.y, n.w, n.h, kind === 'q' ? 10 : 8, on || cur ? U.rgba(c, 0.13) : U.rgba(P.panel2, 0.5), on ? c : cur ? P.accent : U.rgba(c, dim ? 0.3 : 0.55), on || cur ? 1.8 : 1);
      if (cur) D.glow(ctx, n.x + 10, n.y + 10, 16, P.accent, 0.4 + 0.3 * Math.sin(this.time * 4));
      var fs = mob ? 9.5 : 11.5, tx = n.x + (kind === 'q' ? (mob ? 26 : 34) : 12);
      if (kind === 'q') {
        D.circle(ctx, n.x + (mob ? 13 : 17), n.y + n.h / 2, mob ? 8 : 10, on || cur ? (cur ? P.accent : c) : U.rgba(P.text3, 0.3));
        D.text(ctx, '?', n.x + (mob ? 13 : 17), n.y + n.h / 2 + 0.5, { size: mob ? 10 : 12, weight: 800, color: on || cur ? P.bg : P.text2, align: 'center' });
        D.text(ctx, lines[0], tx, n.y + n.h / 2 - fs * 0.62, { size: fs, weight: 700, color: dim ? P.text3 : P.text1 });
        D.text(ctx, lines[1], tx, n.y + n.h / 2 + fs * 0.62, { size: fs, weight: 700, color: dim ? P.text3 : P.text1 });
      } else {
        D.text(ctx, lines[0], tx, n.y + n.h / 2 - (mob ? 0 : 6), { size: fs, weight: 800, color: on ? c : dim ? P.text3 : P.text1 });
        if (!mob) D.text(ctx, lines[1], tx, n.y + n.h / 2 + 9, { size: 9, color: dim ? U.rgba(P.text3, 0.7) : P.text3 });
        if (on) D.g.check(ctx, n.x + n.w - 14, n.y + n.h / 2, 14, c);
      }
    },
    chip: function (ctx, x, y, txt, q, v, chosen, live) {
      var P = S.pal, col = chosen ? P.accent : live ? P.text1 : P.text3;
      var r = D.pill(ctx, txt, x, y, { size: this.mobile ? 8.5 : 9.5, color: col, align: 'center', bg: chosen ? U.rgba(P.accent, 0.18) : U.rgba(P.bg, 0.92), border: chosen ? P.accent : live ? U.rgba(P.text2, 0.7) : U.rgba(P.text3, 0.4) });
      this.hits.rect('a' + q + v, r.x - 6, r.y - 6, r.w + 12, r.h + 12, { q: q, v: v });
    },
    drawTree: function (ctx) {
      var P = S.pal, a = this.ans, self = this, cq = this.curQ(), L = this.leaf(), mob = this.mobile;
      this.hits.clear();
      // all edges (base)
      for (var q = 0; q < 3; q++) [true, false].forEach(function (v) {
        var e = self.edge(q, v);
        D.poly(ctx, e, false); ctx.strokeStyle = U.rgba(P.blueprint, 0.35); ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
        var reach = q === 0 || (q === 1 && a[0] === false) || (q === 2 && a[0] === false && a[1] === false);
        var mx = v ? (e[0] + e[2]) / 2 : e[0], my = v ? e[1] : (q < 2 ? (e[1] + e[3]) / 2 : e[1] + 18);
        self.chip(ctx, mx, my, v ? 'YES' : 'NO', q, v, a[q] === v, reach);
      });
      // lit path
      if (this.path && this.path.length > 3 && this.drawn > 0) {
        ctx.save();
        ctx.setLineDash([this.drawn, 1e5]);
        D.poly(ctx, this.path, false); ctx.strokeStyle = P.accent; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.restore();
        var o = D.along(this.path, this.lens, this.drawn, {});
        D.glow(ctx, o.x, o.y, 16, P.accent, 0.9); D.circle(ctx, o.x, o.y, 4, P.accent);
      }
      // redraw chips on top of path for the chosen ones
      for (var q2 = 0; q2 < 3; q2++) if (a[q2] !== null) {
        var e2 = this.edge(q2, a[q2]), v2 = a[q2];
        this.chip(ctx, v2 ? (e2[0] + e2[2]) / 2 : e2[0], v2 ? e2[1] : (q2 < 2 ? (e2[1] + e2[3]) / 2 : e2[1] + 18), v2 ? 'YES' : 'NO', q2, v2, true, true);
      }
      // nodes
      for (var i = 0; i < 3; i++) {
        var reach = i === 0 || (i === 1 && a[0] === false) || (i === 2 && a[0] === false && a[1] === false);
        var st = cq === i ? 'cur' : a[i] !== null && reach ? 'on' : reach ? 'idle' : 'off';
        this.drawNode(ctx, this.qn[i], QS[i], st, 'q', P.accent);
      }
      OS.forEach(function (o, j) {
        var st = L === j ? 'on' : L >= 0 ? 'off' : 'idle';
        var nm = mob ? o.name.replace(' Community', '').replace(' Server 2025', ' Server').replace(' Server LTS', ' Server') : o.name;
        self.drawNode(ctx, self.ln[j], [nm, j === 2 ? 'per-core licence' : 'free'], st, 'leaf', P[o.col]);
      });
    },
    // ---------- mini screens ----------
    screen: function (ctx, id, x, y, w, h, k) {
      var P = S.pal, t = this.time, i;
      D.box(ctx, x, y, w, h, 6, P.bg0, U.rgba(P.alu, 0.5), 1.2);
      ctx.save(); ctx.beginPath(); ctx.rect(x + 1, y + 1, w - 2, h - 2); ctx.clip();
      ctx.globalAlpha *= k;
      var ga = ctx.globalAlpha, led = function (x2, y2, c2, m2, t2, r2) { if (ga < 0.99) D.circle(ctx, x2, y2, r2, c2); else D.led(ctx, x2, y2, c2, m2, t2, r2); };
      var top = 14;
      if (id !== 'ubuntu') {
        ctx.fillStyle = U.rgba(P.alu, 0.18); ctx.fillRect(x, y, w, top);
        for (i = 0; i < 3; i++) D.circle(ctx, x + 8 + i * 8, y + 7, 2.2, U.rgba(P.alu, 0.6));
        D.box(ctx, x + 36, y + 3, w * 0.45, 8, 4, U.rgba(P.alu, 0.14));
      }
      var bx = x + 1, by = y + top, bw = w - 2, bh = h - top - 1;
      if (id === 'truenas') {
        ctx.fillStyle = U.rgba(P.data, 0.12); ctx.fillRect(bx, by, bw * 0.22, bh);
        for (i = 0; i < 5; i++) D.box(ctx, bx + 6, by + 8 + i * 12, bw * 0.22 - 12, 6, 2, U.rgba(P.data, i === 1 ? 0.7 : 0.25));
        var dcx = bx + bw * 0.42, dcy = by + bh * 0.42, r = Math.min(bh * 0.28, bw * 0.12);
        ctx.lineWidth = r * 0.45; ctx.beginPath(); ctx.arc(dcx, dcy, r, 0, Math.PI * 2); ctx.strokeStyle = U.rgba(P.data, 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(dcx, dcy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.62 * k); ctx.strokeStyle = P.data; ctx.stroke();
        D.text(ctx, '62%', dcx, dcy, { size: 9, weight: 700, color: P.text1, align: 'center' });
        D.text(ctx, 'pool ONLINE', dcx, dcy + r + 14, { size: 8.5, weight: 700, color: P.ok, align: 'center' });
        var gx = bx + bw * 0.62, gy = by + 10, cw = (bw * 0.34) / 4 - 4;
        for (i = 0; i < 8; i++) { D.box(ctx, gx + (i % 4) * (cw + 4), gy + Math.floor(i / 4) * (cw * 1.3 + 6), cw, cw * 1.3, 2, U.rgba(P.steel, 0.9)); led(gx + (i % 4) * (cw + 4) + cw / 2, gy + Math.floor(i / 4) * (cw * 1.3 + 6) + cw, P.ok, 'activity', t + i, 1.4); }
        D.text(ctx, 'raidz2 · 8 disks', gx, gy + cw * 2.6 + 18, { size: 8, color: P.text3 });
      } else if (id === 'proxmox') {
        ctx.fillStyle = U.rgba(P.power, 0.08); ctx.fillRect(bx, by, bw * 0.34, bh);
        var items = ['Datacenter', ' pve01', '  100 web', '  101 db', '  102 git', '  103 k8s'];
        items.forEach(function (s2, j) { D.text(ctx, s2, bx + 6, by + 10 + j * 13, { size: 8.5, weight: j < 2 ? 700 : 500, color: j < 2 ? P.text2 : P.text1 }); if (j > 1) led(bx + bw * 0.34 - 10, by + 10 + j * 13, P.ok, 'solid', t, 1.6); });
        var cx2 = bx + bw * 0.38, cw2 = bw * 0.58;
        D.text(ctx, 'CPU', cx2, by + 10, { size: 8, weight: 700, color: P.text3 });
        ctx.beginPath();
        for (i = 0; i <= 30; i++) { var xx = cx2 + i * cw2 / 30, yy = by + 40 - (0.3 + 0.5 * U.noise1(i * 0.5 + t * 0.6)) * 26; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
        ctx.strokeStyle = P.power; ctx.lineWidth = 1.5; ctx.stroke();
        D.text(ctx, 'RAM 148 / 256 GB', cx2, by + 54, { size: 8, weight: 700, color: P.text3 });
        D.meter(ctx, cx2, by + 62, cw2, 6, 0.58 * k, P.power);
        D.text(ctx, '4 VMs · 2 containers', cx2, by + 80, { size: 8, color: P.text2 });
      } else if (id === 'windows') {
        ctx.fillStyle = U.rgba(P.mgmt, 0.85); ctx.fillRect(bx, by, bw, 14);
        D.text(ctx, 'Server Manager › Dashboard', bx + 6, by + 7, { size: 8, weight: 700, color: P.bg });
        ctx.fillStyle = U.rgba(P.mgmt, 0.12); ctx.fillRect(bx, by + 14, bw * 0.3, bh - 14);
        ['Dashboard', 'Local Server', 'All Servers', 'AD DS', 'DNS'].forEach(function (s2, j) { D.text(ctx, s2, bx + 5, by + 24 + j * 11, { maxW: bw * 0.3 - 8, size: 7.5, weight: j === 0 ? 700 : 500, color: j === 0 ? P.text1 : P.text2 }); });
        var tl = [['AD DS', P.mgmt], ['DNS', P.data], ['File', P.ok], ['IIS', P.power]], tx = bx + bw * 0.33, tw = (bw * 0.65 - 10) / 2, th = (bh - 22) / 2 - 4;
        tl.forEach(function (q, j) {
          var qx = tx + (j % 2) * (tw + 6), qy = by + 18 + Math.floor(j / 2) * (th + 6);
          D.box(ctx, qx, qy, tw, th, 2, U.rgba(q[1], 0.16)); ctx.fillStyle = q[1]; ctx.fillRect(qx, qy, tw, 3);
          D.text(ctx, q[0], qx + 6, qy + 12, { size: 8.5, weight: 700, color: P.text1 });
          D.text(ctx, '1 server ✓', qx + 6, qy + th - 8, { size: 7.5, color: P.text3 });
        });
      } else {
        var lines = ['$ ssh admin@server01', 'Welcome to Ubuntu 24.04 LTS', '$ sudo apt update && sudo apt upgrade', '$ docker compose up -d', ' ✔ web    Started', ' ✔ db     Started', '$ '];
        var n = Math.max(1, Math.floor(lines.length * k + 0.01));
        for (i = 0; i < n; i++) D.text(ctx, lines[i], bx + 8, by + 6 + i * 13, { size: 8.5, color: i === 1 ? P.text2 : P.ok });
        if (Math.floor(t * 2) % 2) { ctx.fillStyle = P.ok; ctx.fillRect(bx + 8 + D.measure(ctx, '$ ', 8.5, 500), by + 6 + (n - 1) * 13 - 5, 5, 10); }
      }
      ctx.restore();
    },
    drawCard: function (ctx) {
      var P = S.pal, C = this.card, L = this.leaf(), mob = this.mobile, k = this.reveal;
      D.box(ctx, C.x, C.y, C.w, C.h, 12, U.rgba(P.panel, 0.7), U.rgba(L >= 0 ? P[OS[L].col] : P.blueprint, L >= 0 ? 0.7 : 0.3), 1.2);
      if (L < 0) {
        // preview of the four possible answers, faded
        var cols = 2, gx = 14, top = C.y + (mob ? 10 : 40), cw = (C.w - gx * 3) / cols, chh = (C.y + C.h - top - (mob ? 8 : 40)) / 2;
        if (!mob) D.text(ctx, mob ? '' : '← Answer the questions · 4 possible results', C.x + C.w / 2, C.y + 22, { size: 11, weight: 700, color: P.text2, align: 'center' });
        var self = this;
        OS.forEach(function (o2, i) {
          var x = C.x + gx + (i % cols) * (cw + gx), y = top + Math.floor(i / cols) * chh, sh2 = chh - (mob ? 20 : 26);
          ctx.globalAlpha = 0.38; self.screen(ctx, o2.id, x, y, cw, sh2, 1); ctx.globalAlpha = 1;
          D.text(ctx, mob ? o2.name.replace(' Community', '').replace(' Server 2025', ' Server').replace(' Server LTS', ' Server') : o2.name, x + cw / 2, y + sh2 + (mob ? 9 : 12), { size: mob ? 8.5 : 10, weight: 700, color: U.rgba(P[o2.col], 0.9), align: 'center' });
        });
        return;
      }
      var o = OS[L], col = P[o.col], sx, sy, sw, sh;
      if (mob) {
        sw = Math.min(C.w * 0.46, 170); sh = C.h - 24; sx = C.x + 12; sy = C.y + 12;
        this.screen(ctx, o.id, sx, sy, sw, sh, k);
        var tx = sx + sw + 12;
        D.text(ctx, o.name.replace(' Community', ''), tx, C.y + 22, { size: 12, weight: 800, color: col, alpha: k });
        ctx.globalAlpha = k;
        o.notes.forEach(function (nn, i) { D.g[nn[0]](ctx, tx + 5, C.y + 46 + i * 20, 11, nn[0] === 'check' ? P.ok : P.warn); D.text(ctx, nn[1], tx + 15, C.y + 46 + i * 20, { size: 8.5, color: P.text1, maxW: C.x + C.w - tx - 22 }); });
        ctx.globalAlpha = 1;
      } else {
        D.text(ctx, o.name, C.x + 18, C.y + 26, { size: 17, weight: 800, color: col, alpha: k });
        D.text(ctx, o.tag, C.x + 18, C.y + 46, { size: 11, color: P.text2, alpha: k, sans: true });
        sx = C.x + 18; sy = C.y + 62; sw = C.w - 36; sh = Math.min(C.h * 0.44, sw * 0.5);
        this.screen(ctx, o.id, sx, sy, sw, sh, k);
        ctx.globalAlpha = k;
        o.notes.forEach(function (nn, i) { var ny = sy + sh + 22 + i * 21; D.g[nn[0]](ctx, sx + 6, ny, 13, nn[0] === 'check' ? P.ok : P.warn); D.text(ctx, nn[1], sx + 20, ny, { size: 11, weight: 600, color: P.text1 }); });
        ctx.globalAlpha = 1;
      }
    },
    draw: function () {
      var ctx = this.ctx;
      D.clear(ctx, this.w, this.h);
      if (!this.qn) return;
      this.drawTree(ctx);
      this.drawCard(ctx);
      var L = this.leaf(), q = this.curQ();
      this.setDesc(L >= 0 ? 'Recommendation: ' + OS[L].name + ' — ' + OS[L].tag + '.' : 'Question ' + (q + 1) + ': ' + QFULL[q]);
      if (this.curQ() >= 0 && !this.reduced() && !this._pulse) { this._pulse = true; this.setActive(true); }
    }
  });
})(window.SRV);
