/* Persistent build tracker: a mini 2U server whose parts ink in from blueprint as chapters are completed.
   Doubles as navigation: hover a part to see its chapter, click to jump there. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, I = S.iso, M = S.models, doc = document;

  var LAYERS = [
    { ch: 16, label: 'Firmware & BIOS', color: 'blueprint' },
    { ch: 17, label: 'Operating system', color: 'ok' },
    { ch: 18, label: 'Network & security', color: 'net' },
    { ch: 19, label: 'Monitoring & backups', color: 'power' }
  ];

  S.initTracker = function () {
    var box = doc.getElementById('tracker'), stage = doc.getElementById('tracker-stage');
    if (!box || !stage) return;
    var canvas = doc.createElement('canvas'); stage.appendChild(canvas);
    canvas.setAttribute('role', 'img');
    var ctx = canvas.getContext('2d');
    var parts = M.server({ drives: 12, dimms: 12, gpu: true, cut: true });
    var ink = {}, hits = new S.Hits(), hover = null, w = 0, h = 0;
    Object.keys(M.groups).forEach(function (g) { ink[g] = 0; });
    LAYERS.forEach(function (l) { ink['L' + l.ch] = 0; });

    function groupDone(g, done) { var info = M.groups[g]; return info && !!done[info.ch]; }

    function resize() {
      var r = stage.getBoundingClientRect(); w = r.width; h = r.height; if (!w || !h) return;
      var dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
    }
    var V = I.view();
    function draw() {
      if (!w) return;
      ctx.clearRect(0, 0, w, h);
      var mobile = w > h * 3;
      var bb = { x0: -20, y0: 0, z0: 0, x1: M.W + 20, y1: M.D, z1: mobile ? M.H : 260 };
      V.fit(bb, mobile ? Math.min(w, h * 2.2) : w, h, 6);
      if (mobile) V.ox += (w - Math.min(w, h * 2.2)) / 2;
      hits.clear();
      M.fanAngle = 0.4; M.fanBlur = ink.fans > 0.9 ? 1 : 0; M.t = 0; M.driveState = null; M.fanDead = null; M.dataFlow = false;
      M.draw(ctx, V, parts, {
        hits: hits,
        state: function (p) {
          if (p.group === 'shroud' || p.group === 'lid') return { hidden: true };
          var k = ink[p.group] || 0;
          return { inkT: k, state: k > 0 ? 'solid' : 'blueprint', highlight: hover && hover.group === p.group ? true : null };
        }
      });
      // software layers floating above
      if (!mobile) LAYERS.forEach(function (L, i) {
        var k = ink['L' + L.ch];
        var b = { x: 20, y: 20, z: M.H + 30 + i * 36, w: M.W - 40, d: M.D - 40, h: 6 };
        I.box(ctx, V, b, { color: L.color, inkT: k, state: k > 0 ? 'solid' : 'blueprint', alpha: k > 0 ? 0.65 : 0.5, highlight: hover && hover.ch === L.ch ? true : null, noStroke: k === 0 });
        hits.poly('L' + L.ch, I.hull(V, b), { ch: L.ch, label: L.label });
      });
      // power LED once PSUs are in
      if (ink.psu > 0.9) { var p = V.p(M.W - 10, M.D, 70); D.led(ctx, p[0], p[1], S.pal.ok, 'solid', 0, 1.4); }
      if (ink.bmc > 0.9) { var q = V.p(M.W - 30, M.D, 70); D.led(ctx, q[0], q[1], S.pal.mgmt, 'solid', 0, 1.4); }
    }

    function sync(done) {
      var n = Object.keys(done).length;
      doc.getElementById('tracker-count').textContent = n + '/20';
      Object.keys(M.groups).forEach(function (g) { animateInk(g, groupDone(g, done) ? 1 : 0); });
      LAYERS.forEach(function (l) { animateInk('L' + l.ch, done[l.ch] ? 1 : 0); });
      var next = S.chapters.find(function (c) { return !done[c.dataset.ch]; });
      var a = doc.getElementById('tracker-next');
      if (next) { a.href = '#' + next.id; a.textContent = 'Next: ' + next.dataset.short; }
      else { a.href = '#ch20'; a.textContent = 'Built! Every chapter complete ✓'; }
      canvas.setAttribute('aria-label', 'Your server: ' + n + ' of 20 chapters complete.');
    }
    function animateInk(key, target) {
      if (ink[key] === target) return;
      var from = ink[key];
      S.tween({ from: from, to: target, dur: 0.6, ease: 'snap', onUpdate: function (v) { ink[key] = U.clamp(v, 0, 1); draw(); } });
    }

    canvas.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect(), it = hits.query(e.clientX - r.left, e.clientY - r.top);
      var nh = null;
      if (it) {
        if (it.data && it.data.ch) nh = { ch: it.data.ch, label: it.data.label };
        else if (it.data && M.groups[it.data.group]) nh = { group: it.data.group, ch: M.groups[it.data.group].ch, label: M.groups[it.data.group].label };
      }
      if ((nh && nh.label) !== (hover && hover.label)) { hover = nh; draw(); }
      canvas.style.cursor = hover ? 'pointer' : '';
      if (hover) S.tip('<b>Chapter ' + hover.ch + '</b>' + hover.label + (S.progress.get().done[hover.ch] ? ' ✓' : ' — not yet built'), e.clientX, e.clientY);
      else S.tip(null);
    });
    canvas.addEventListener('pointerleave', function () { hover = null; S.tip(null); draw(); });
    canvas.addEventListener('click', function () {
      if (!hover) return;
      var sec = doc.getElementById('ch' + hover.ch); if (sec) sec.scrollIntoView({ behavior: S.reduced() ? 'auto' : 'smooth' });
    });
    doc.getElementById('tracker-min').addEventListener('click', function () {
      var min = box.classList.toggle('min'); this.textContent = min ? '+' : '–'; this.setAttribute('aria-expanded', String(!min));
      this.setAttribute('aria-label', min ? 'Expand build tracker' : 'Minimise build tracker');
      if (!min) requestAnimationFrame(resize);
    });

    // hide while the hero is on screen
    var hero = doc.querySelector('.hero');
    var tocEl = doc.getElementById('toc');
    function vis() { var r = hero ? hero.getBoundingClientRect() : { bottom: 0 }, inHero = r.bottom > innerHeight * 0.6; box.classList.toggle('hidden', inHero); if (tocEl) tocEl.classList.toggle('in-hero', inHero); }
    addEventListener('scroll', vis, { passive: true }); addEventListener('load', vis); addEventListener('resize', vis); vis();

    // below the TOC-rail breakpoint the tracker would cover content: start minimised unless the reader opened it
    var minBtn = doc.getElementById('tracker-min'), pref = S.storage.get('trackerMin', null);
    if (pref === true || (pref === null && innerWidth < 1280)) { box.classList.add('min'); minBtn.textContent = '+'; minBtn.setAttribute('aria-expanded', 'false'); minBtn.setAttribute('aria-label', 'Expand build tracker'); }
    minBtn.addEventListener('click', function () { S.storage.set('trackerMin', box.classList.contains('min')); });
    new ResizeObserver(resize).observe(stage);
    S.on('prefs', draw);
    S.progress.subscribe('done', sync, { immediate: true });
    // snap initial state without animation
    var done0 = S.progress.get().done;
    Object.keys(M.groups).forEach(function (g) { ink[g] = groupDone(g, done0) ? 1 : 0; });
    LAYERS.forEach(function (l) { ink['L' + l.ch] = done0[l.ch] ? 1 : 0; });
    resize();
  };
})(window.SRV);
