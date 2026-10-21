/* Page chrome: header controls, TOC + scrollspy, progress bar, scrolly step highlighting,
   chapter completion, glossary search, checklist, brand mark. */
;(function (S) {
  'use strict';
  var U = S.util, D = S.draw, doc = document;

  S.initUI = function () {
    var chapters = Array.prototype.slice.call(doc.querySelectorAll('.chapter[data-ch]'));
    S.chapters = chapters;

    // ---------- TOC ----------
    function buildToc(nav) {
      var html = '', part = '';
      chapters.forEach(function (c) {
        if (c.dataset.part !== part) { if (part) html += '</ol>'; part = c.dataset.part; html += '<p class="toc-part">' + part + '</p><ol>'; }
        html += '<li><a href="#' + c.id + '" data-ch="' + c.dataset.ch + '"><span class="n">' + String(c.dataset.ch).padStart(2, '0') + '</span><span>' + c.dataset.short + '</span></a></li>';
      });
      nav.innerHTML = html + '</ol>';
    }
    var toc = doc.getElementById('toc'), tocM = doc.getElementById('toc-mobile');
    buildToc(toc); buildToc(tocM);
    var dlg = doc.getElementById('toc-dialog');
    doc.getElementById('toc-open').addEventListener('click', function () { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); });
    doc.getElementById('toc-close').addEventListener('click', function () { dlg.close(); });
    tocM.addEventListener('click', function (e) { if (e.target.closest('a')) dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    // move focus to heading on TOC jump
    [toc, tocM].forEach(function (n) {
      n.addEventListener('click', function (e) {
        var a = e.target.closest('a'); if (!a) return;
        var sec = doc.querySelector(a.getAttribute('href')); var h = sec && sec.querySelector('h2');
        if (h) { h.setAttribute('tabindex', '-1'); setTimeout(function () { h.focus({ preventScroll: true }); }, 400); }
      });
    });

    // scrollspy
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var ch = e.target.dataset.ch;
        doc.querySelectorAll('.toc a').forEach(function (a) { if (a.dataset.ch === ch) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
        S.currentChapter = +ch; S.emit('chapter', +ch);
      });
    }, { rootMargin: '-35% 0px -60% 0px' });
    chapters.forEach(function (c) { spy.observe(c); });

    // scrolly step cards
    var stepObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.target.classList.toggle('is-active', e.isIntersecting); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    doc.querySelectorAll('.step').forEach(function (s) { stepObs.observe(s); });

    // ---------- progress bar + completion ----------
    var bar = doc.getElementById('progress'), ticking = false;
    function onScroll() {
      ticking = false;
      var h = doc.documentElement.scrollHeight - innerHeight;
      bar.style.transform = 'scaleX(' + (h > 0 ? U.clamp(scrollY / h, 0, 1) : 0) + ')';
      var vh = innerHeight;
      if (scrollY < innerHeight) return; // never auto-complete chapters from the hero
      chapters.forEach(function (c) {
        if (c._done) return;
        var r = c.getBoundingClientRect();
        if (r.bottom < vh * 0.55 && r.height > 0) S.markDone(+c.dataset.ch);
      });
    }
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();
    // interacting with a chapter's visual also counts
    chapters.forEach(function (c) {
      c.addEventListener('pointerdown', function (e) { if (e.target.closest('.viz')) S.markDone(+c.dataset.ch); });
      c.addEventListener('input', function () { S.markDone(+c.dataset.ch); });
    });
    S.progress.subscribe('done', function (done) {
      chapters.forEach(function (c) { var d = !!done[c.dataset.ch]; c._done = d; c.classList.toggle('done', d); });
      doc.querySelectorAll('.toc a').forEach(function (a) { a.classList.toggle('done', !!done[a.dataset.ch]); });
    }, { immediate: true });

    // ---------- header controls ----------
    var motionBtn = doc.getElementById('motion-btn'), motionVal = doc.getElementById('motion-val');
    var levels = ['full', 'calm', 'off'], names = { full: 'Full', calm: 'Calm', off: 'Off' };
    function syncMotion() { motionVal.textContent = names[S.prefs.motion]; motionBtn.setAttribute('aria-label', 'Animation level: ' + names[S.prefs.motion] + '. Click to change.'); }
    motionBtn.addEventListener('click', function () { S.setPref('motion', levels[(levels.indexOf(S.prefs.motion) + 1) % 3]); syncMotion(); });
    syncMotion();
    var pauseBtn = doc.getElementById('pause-btn');
    pauseBtn.addEventListener('click', function () { var p = !S.prefs.pausedAll; S.setPref('pausedAll', p); pauseBtn.setAttribute('aria-pressed', String(p)); });
    var themeBtn = doc.getElementById('theme-btn');
    function syncTheme() { themeBtn.setAttribute('aria-label', 'Switch to ' + (S.prefs.theme === 'dark' ? 'light' : 'dark') + ' theme'); }
    themeBtn.addEventListener('click', function () { S.setPref('theme', S.prefs.theme === 'dark' ? 'light' : 'dark'); syncTheme(); drawBrand(); });
    syncTheme();
    var soundBtn = doc.getElementById('sound-btn');
    function syncSound() {
      var on = S.audio.enabled;
      soundBtn.setAttribute('aria-pressed', String(on));
      soundBtn.setAttribute('aria-label', (on ? 'Turn sound effects off' : 'Turn sound effects on') + (S.audio.supported ? '' : ' (not supported in this browser)'));
    }
    if (!S.audio.supported) soundBtn.disabled = true;
    soundBtn.addEventListener('click', function () { S.audio.setEnabled(!S.audio.enabled); syncSound(); });
    S.on('sound', syncSound);
    syncSound();

    // ---------- glossary ----------
    var gl = doc.getElementById('glossary'), q = doc.getElementById('glossary-q');
    if (gl) {
      gl.innerHTML = S.data.glossary.map(function (g) { return '<div><dt>' + g[0] + '</dt><dd>' + g[1] + '</dd></div>'; }).join('');
      q.placeholder = 'Search ' + S.data.glossary.length + ' terms… (try “ECC” or “IOPS”)';
      q.addEventListener('input', function () {
        var s = q.value.trim().toLowerCase();
        Array.prototype.forEach.call(gl.children, function (d) { d.hidden = !!s && d.textContent.toLowerCase().indexOf(s) < 0; });
      });
    }
    // ---------- checklist ----------
    var cl = doc.getElementById('checklist');
    if (cl) {
      var saved = S.storage.get('checklist', {});
      cl.innerHTML = S.data.checklist.map(function (t, i) { return '<li><label><input type="checkbox" data-i="' + i + '"' + (saved[i] ? ' checked' : '') + '><span>' + t + '</span></label></li>'; }).join('');
      cl.addEventListener('change', function (e) { var i = e.target.dataset.i; if (i == null) return; saved[i] = e.target.checked; S.storage.set('checklist', saved); });
    }

    // ---------- brand mark (tiny iso server) ----------
    function drawBrand() {
      var c = doc.getElementById('brand-mark'); if (!c) return;
      var ctx = c.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, 26, 26);
      var V = S.iso.view({ k: 0.034 });
      V.fit({ x0: 0, y0: 0, z0: 0, x1: 440, y1: 640, z1: 180 }, 26, 26, 1);
      S.iso.box(ctx, V, { x: 0, y: 0, z: 0, w: 440, d: 640, h: 80 }, { color: 'steel', noStroke: true });
      S.iso.box(ctx, V, { x: 0, y: 0, z: 90, w: 440, d: 640, h: 80 }, { state: 'blueprint', inkT: 0 });
      var p = V.p(400, 640, 40); D.circle(ctx, p[0], p[1], 1.2, S.pal.accent);
    }
    drawBrand();
    S.on('prefs', drawBrand);

    // ---------- hero POST line ----------
    var post = doc.getElementById('hero-post');
    if (post) {
      var full = 'POST… CPU OK · memory 384 GB OK · 12 drives found · 20 chapters loaded', i = 0;
      if (S.reduced()) post.innerHTML = full + ' <span class="caret"></span>';
      else (function type() {
        i += 2; post.innerHTML = full.slice(0, i) + '<span class="caret"></span>';
        if (i < full.length) setTimeout(type, full[i] === '·' ? 220 : 28);
      })();
    }
  };
})(window.SRV);
