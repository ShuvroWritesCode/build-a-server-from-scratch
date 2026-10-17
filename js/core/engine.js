/* Mini engine: prefs/theme, one rAF scheduler, tweens, lazy-loaded Visual instances,
   HiDPI layers, controls, pointer + hit-testing, scroll progress, announcements. */
;(function (S) {
  'use strict';
  var U = S.util;
  var doc = document, root = doc.documentElement;

  // ---------------------------------------------------------------- storage
  S.storage = {
    get: function (k, d) { try { var v = localStorage.getItem('srv.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('srv.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };

  // ---------------------------------------------------------------- prefs + palette
  S.prefs = {
    theme: root.getAttribute('data-theme') || 'dark',
    motion: root.getAttribute('data-motion') || 'full',
    pausedAll: false
  };
  var PAL_KEYS = ['bg0', 'bg', 'panel', 'panel2', 'panel3', 'grid', 'blueprint', 'text1', 'text2', 'text3', 'label',
    'power', 'data', 'net', 'air', 'heat', 'mgmt', 'ok', 'warn', 'fault', 'accent',
    'steel', 'alu', 'pcb', 'copper', 'silicon', 'gold', 'plastic', 'cable'];
  function readPalette() {
    var cs = getComputedStyle(root), p = {};
    PAL_KEYS.forEach(function (k) { p[k] = cs.getPropertyValue('--c-' + k).trim() || '#ff00ff'; });
    p.dark = S.prefs.theme !== 'light';
    p.mono = cs.getPropertyValue('--font-mono').trim() || 'monospace';
    p.sans = cs.getPropertyValue('--font-sans').trim() || 'sans-serif';
    S.pal = p;
  }
  readPalette();
  S.font = function (size, weight, mono) { return (weight || 400) + ' ' + size + 'px ' + (mono === false ? S.pal.sans : S.pal.mono); };
  S.setPref = function (k, v) {
    S.prefs[k] = v;
    if (k !== 'pausedAll') S.storage.set(k, v);
    root.setAttribute('data-theme', S.prefs.theme);
    root.setAttribute('data-motion', S.prefs.motion);
    if (k === 'theme') { readPalette(); instances.forEach(function (v) { safe(v, 'onTheme'); v.invalidate(); }); }
    if (k === 'motion') instances.forEach(function (v) { if (v.continuous && !v._userPlayed) v.setPaused(S.prefs.motion !== 'full'); safe(v, 'onMotion'); v.invalidate(); });
    if (k === 'pausedAll') instances.forEach(function (v) { v._syncPlayBtn(); });
    S.emit('prefs', S.prefs);
    wake();
  };
  S.reduced = function () { return S.prefs.motion !== 'full'; };

  // ---------------------------------------------------------------- scheduler
  var running = new Set(), dirty = new Set(), tweens = [], frameHooks = new Set();
  var raf = 0, last = 0, fpsAvg = 60, frameMs = 0;
  function wake() { if (!raf) raf = requestAnimationFrame(frame); }
  S.wake = wake;
  /** register fn(dt) called every frame while it returns true */
  S.everyFrame = function (fn) { frameHooks.add(fn); wake(); };

  function frame(now) {
    raf = 0;
    var dt = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    if (dt > 0.05) dt = 0.05;
    var t0 = performance.now();
    var keep = false;

    if (scrollSample(dt)) keep = true;
    if (stepTweens(dt)) keep = true;
    frameHooks.forEach(function (fn) { var r; try { r = fn(dt); } catch (e) { console.error(e); r = false; } if (r) keep = true; else frameHooks.delete(fn); });

    if (!S.prefs.pausedAll) {
      running.forEach(function (v) {
        if (v._paused) return;
        v.time += dt;
        if (v.update) { try { v.update(dt); } catch (e) { fail(v, e); return; } }
        dirty.add(v);
        keep = true;
      });
    }
    var list = Array.from(dirty); dirty.clear();
    list.forEach(function (v) { if (v._state === 'error' || !v.w || !v.draw) return; try { v.draw(); } catch (e) { fail(v, e); } });

    frameMs = performance.now() - t0;
    if (dt > 0) fpsAvg = fpsAvg * 0.95 + (1 / dt) * 0.05;
    S.quality.observe(frameMs);
    if (S.flags.debug) debugDraw();
    if (keep || dirty.size) wake(); else last = 0;
  }
  doc.addEventListener('visibilitychange', function () { last = 0; if (!doc.hidden) wake(); });

  // adaptive quality
  S.quality = {
    level: 0, scale: 1, _bad: 0, _good: 0,
    observe: function (ms) {
      if (ms > 14) { this._bad++; this._good = 0; } else if (ms < 6) { this._good++; this._bad = Math.max(0, this._bad - 1); }
      if (this._bad > 45 && this.level < 2) { this.level++; this._bad = 0; this._apply(); }
      else if (this._good > 600 && this.level > 0) { this.level--; this._good = 0; this._apply(); }
    },
    _apply: function () { this.scale = [1, 0.8, 0.6][this.level]; instances.forEach(function (v) { safe(v, 'onQuality'); layout(v); }); }
  };
  /** particle multiplier helper */
  S.q = function (n) { return Math.max(1, Math.round(n * [1, 0.6, 0.3][S.quality.level])); };

  // ---------------------------------------------------------------- tweens
  /** S.tween({from, to, dur, ease, delay, onUpdate(v,k), onDone}) → {cancel, done} */
  S.tween = function (o) {
    var dur = o.dur == null ? 0.6 : o.dur;
    if (S.prefs.motion === 'off') dur = 0; else if (S.prefs.motion === 'calm') dur = Math.min(dur * 0.5, 0.3);
    var tw = { o: o, t: -(o.delay || 0), dur: dur, ease: typeof o.ease === 'function' ? o.ease : U.ease[o.ease || 'settle'], dead: false };
    var handle = { cancel: function () { tw.dead = true; }, tw: tw };
    if (dur <= 0 && !o.delay) { apply(tw, 1); if (o.onDone) o.onDone(); return handle; }
    tweens.push(tw); wake();
    return handle;
  };
  function apply(tw, k) {
    var o = tw.o, e = tw.ease(k), v = e;
    if (typeof o.from === 'number') v = o.from + (o.to - o.from) * e;
    if (o.onUpdate) o.onUpdate(v, e, k);
  }
  function stepTweens(dt) {
    if (!tweens.length) return false;
    for (var i = tweens.length - 1; i >= 0; i--) {
      var tw = tweens[i];
      if (tw.dead) { tweens.splice(i, 1); continue; }
      tw.t += dt;
      if (tw.t < 0) continue;
      var k = tw.dur > 0 ? Math.min(1, tw.t / tw.dur) : 1;
      try { apply(tw, k); } catch (e) { console.error(e); tw.dead = true; }
      if (k >= 1) { tweens.splice(i, 1); if (tw.o.onDone) try { tw.o.onDone(); } catch (e) { console.error(e); } }
    }
    return true;
  }

  // ---------------------------------------------------------------- tooltip
  var tipEl = null;
  S.tip = function (html, cx, cy) {
    tipEl = tipEl || doc.getElementById('srv-tip');
    if (!tipEl) return;
    if (!html) { tipEl.classList.remove('on'); return; }
    tipEl.innerHTML = html;
    var r = tipEl.getBoundingClientRect(), x = cx + 14, y = cy + 14;
    if (x + r.width > innerWidth - 8) x = cx - r.width - 14;
    if (y + r.height > innerHeight - 8) y = cy - r.height - 14;
    tipEl.style.left = Math.max(8, x) + 'px'; tipEl.style.top = Math.max(8, y) + 'px';
    tipEl.classList.add('on');
  };

  // ---------------------------------------------------------------- hit list
  function Hits() { this.items = []; }
  Hits.prototype.clear = function () { this.items.length = 0; };
  Hits.prototype.rect = function (id, x, y, w, h, data) { this.items.push({ id: id, t: 0, x: x, y: y, w: w, h: h, data: data }); };
  Hits.prototype.circle = function (id, cx, cy, r, data) { this.items.push({ id: id, t: 1, x: cx, y: cy, r: r, data: data }); };
  Hits.prototype.poly = function (id, pts, data) { this.items.push({ id: id, t: 2, pts: pts.slice(), data: data }); };
  Hits.prototype.query = function (x, y) {
    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      if (it.t === 0 && x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h) return it;
      if (it.t === 1 && (x - it.x) * (x - it.x) + (y - it.y) * (y - it.y) <= it.r * it.r) return it;
      if (it.t === 2 && pip(it.pts, x, y)) return it;
    }
    return null;
  };
  function pip(p, x, y) {
    var inside = false;
    for (var i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      var xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  S.Hits = Hits;

  // ---------------------------------------------------------------- controls (accessible DOM)
  var uid = 0;
  function el(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  S.el = el;
  function UI(container, v) { this.c = container; this.v = v; }
  UI.prototype.group = function (label) {
    var g = el('div', 'grp'); if (label) { g.setAttribute('role', 'group'); g.setAttribute('aria-label', label); }
    this.c.appendChild(g); return new UI(g, this.v);
  };
  UI.prototype.br = function () { this.c.appendChild(el('div', 'sep')); return this; };
  UI.prototype.spacer = function () { this.c.appendChild(el('div', 'spacer')); return this; };
  UI.prototype.button = function (label, fn, opts) {
    opts = opts || {};
    var b = el('button', 'btn' + (opts.kind ? ' ' + opts.kind : ''), label);
    b.type = 'button';
    if (opts.title) b.title = opts.title;
    if (opts.pressed != null) b.setAttribute('aria-pressed', String(!!opts.pressed));
    var v = this.v;
    b.addEventListener('click', function (e) { try { fn.call(v, e, b); } catch (err) { fail(v, err); } v.invalidate(); });
    b.setLabel = function (t) { b.innerHTML = t; };
    b.setPressed = function (p) { b.setAttribute('aria-pressed', String(!!p)); };
    b.setDisabled = function (d) { b.disabled = !!d; };
    this.c.appendChild(b); return b;
  };
  UI.prototype.slider = function (o) {
    var v = this.v, id = 'srv-s' + (++uid);
    var wrap = el('div', 'ctl');
    var lab = el('label', 'ctl-label', o.label); lab.htmlFor = id;
    var inp = el('input', 'slider'); inp.type = 'range'; inp.id = id;
    inp.min = o.min; inp.max = o.max; inp.step = o.step || 1; inp.value = o.value;
    var out = el('span', 'ctl-val'); out.setAttribute('aria-hidden', 'true');
    var fmt = o.fmt || function (x) { return String(x); };
    function sync() {
      var x = parseFloat(inp.value);
      out.textContent = fmt(x);
      inp.setAttribute('aria-valuetext', (o.valueText || fmt)(x));
      inp.style.setProperty('--fill', (100 * (x - o.min) / (o.max - o.min)) + '%');
    }
    inp.addEventListener('input', function () { sync(); try { o.onInput && o.onInput.call(v, parseFloat(inp.value)); } catch (e) { fail(v, e); } v.invalidate(); });
    wrap.appendChild(lab); wrap.appendChild(inp); wrap.appendChild(out);
    this.c.appendChild(wrap); sync();
    return { el: wrap, input: inp, get: function () { return parseFloat(inp.value); }, set: function (x, fire) { inp.value = x; sync(); if (fire && o.onInput) o.onInput.call(v, parseFloat(inp.value)); } };
  };
  UI.prototype.toggle = function (o) {
    var v = this.v;
    var lab = el('label', 'switch');
    var inp = el('input'); inp.type = 'checkbox'; inp.checked = !!o.value; inp.setAttribute('role', 'switch');
    lab.appendChild(inp); lab.appendChild(el('span', 'track')); lab.appendChild(el('span', '', o.label));
    inp.addEventListener('change', function () { try { o.onChange && o.onChange.call(v, inp.checked); } catch (e) { fail(v, e); } v.invalidate(); });
    this.c.appendChild(lab);
    return { el: lab, get: function () { return inp.checked; }, set: function (x, fire) { inp.checked = !!x; if (fire && o.onChange) o.onChange.call(v, inp.checked); } };
  };
  UI.prototype.seg = function (o) {
    var v = this.v, wrap = el('div', 'ctl');
    if (o.label) wrap.appendChild(el('span', 'ctl-label', o.label));
    var box = el('div', 'seg'); box.setAttribute('role', 'radiogroup'); if (o.label) box.setAttribute('aria-label', o.label.replace(/<[^>]+>/g, ''));
    var btns = [], cur = o.value;
    o.options.forEach(function (opt) {
      var val = Array.isArray(opt) ? opt[0] : opt, txt = Array.isArray(opt) ? opt[1] : String(opt);
      var b = el('button', '', txt); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.val = String(val); b._val = val;
      b.addEventListener('click', function () { set(val, true); });
      b.addEventListener('keydown', function (e) {
        var i = btns.indexOf(b), n = btns.length;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % n].click(); btns[(i + 1) % n].focus(); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + n) % n].click(); btns[(i - 1 + n) % n].focus(); }
      });
      btns.push(b); box.appendChild(b);
    });
    function set(val, fire) {
      cur = val;
      btns.forEach(function (b) { var on = b._val === val; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
      if (fire) { try { o.onChange && o.onChange.call(v, val); } catch (e) { fail(v, e); } v.invalidate(); }
    }
    set(cur, false);
    wrap.appendChild(box); this.c.appendChild(wrap);
    return { el: wrap, get: function () { return cur; }, set: set, buttons: btns };
  };
  UI.prototype.readout = function (k, val, cls) {
    var r = el('div', 'readout' + (cls ? ' ' + cls : ''));
    var kk = el('span', 'k', k), vv = el('span', 'v', val == null ? '–' : val);
    r.appendChild(kk); r.appendChild(vv); this.c.appendChild(r);
    return { el: r, set: function (x, c) { if (vv.textContent !== String(x)) vv.textContent = x; r.className = 'readout' + (c ? ' ' + c : ''); } };
  };
  UI.prototype.select = function (o) {
    var v = this.v, id = 'srv-sel' + (++uid), wrap = el('div', 'ctl');
    var lab = el('label', 'ctl-label', o.label); lab.htmlFor = id;
    var s = el('select', 'btn'); s.id = id;
    o.options.forEach(function (opt) { var op = el('option', '', Array.isArray(opt) ? opt[1] : opt); op.value = Array.isArray(opt) ? opt[0] : opt; s.appendChild(op); });
    s.value = o.value;
    s.addEventListener('change', function () { try { o.onChange && o.onChange.call(v, s.value); } catch (e) { fail(v, e); } v.invalidate(); });
    wrap.appendChild(lab); wrap.appendChild(s); this.c.appendChild(wrap);
    return { el: wrap, get: function () { return s.value; }, set: function (x) { s.value = x; } };
  };
  UI.prototype.text = function (html, cls) { var p = el('span', cls || 'ctl', html); this.c.appendChild(p); return p; };
  S.UI = UI;

  // ---------------------------------------------------------------- visual registry + base
  var defs = {}, waiting = {}, instances = [], loading = {};
  S.instances = instances;

  var Base = {
    continuous: false,
    /** create a stacked layer; type 'canvas' (default) or 'svg' */
    layer: function (opts) {
      opts = opts || {};
      if (opts.type === 'svg') {
        var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'layer'); svg.setAttribute('aria-hidden', opts.ariaHidden === false ? 'false' : 'true');
        this.stage.appendChild(svg); this._layers.push({ svg: svg, opts: opts });
        if (this.w) svg.setAttribute('viewBox', '0 0 ' + this.w + ' ' + this.h);
        return svg;
      }
      var c = doc.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
      var ctx = c.getContext('2d', { alpha: true });
      this.stage.appendChild(c);
      var L = { canvas: c, ctx: ctx, opts: opts };
      this._layers.push(L);
      if (this.w) sizeLayer(this, L);
      return ctx;
    },
    invalidate: function () { if (this._state === 'error') return; dirty.add(this); wake(); },
    /** run update() each frame (in addition to continuous visuals) */
    setActive: function (on) { this._active = !!on; syncRunning(this); },
    setPaused: function (p) { this._paused = !!p; this._syncPlayBtn(); syncRunning(this); this.invalidate(); },
    _syncPlayBtn: function () {
      if (!this._playBtn) return;
      var paused = this._paused || S.prefs.pausedAll;
      this._playBtn.setAttribute('aria-pressed', String(!paused));
      this._playBtn.innerHTML = paused ? '▶ Play' : '❚❚ Pause';
      this._playBtn.setAttribute('aria-label', (paused ? 'Play' : 'Pause') + ' animation');
    },
    announce: function (msg) {
      var self = this; this._pendingMsg = msg;
      if (this._annT) return;
      this._annT = setTimeout(function () { self._annT = 0; if (self.liveEl) self.liveEl.textContent = self._pendingMsg; }, 650);
    },
    /** update the 'current state' text alternative */
    setDesc: function (text) { if (this._nowEl && this._nowEl.textContent !== text) this._nowEl.textContent = 'Right now: ' + text; },
    tween: function (o) {
      var self = this, up = o.onUpdate, done = o.onDone;
      o.onUpdate = function (v, e, k) { if (up) up.call(self, v, e, k); self.invalidate(); };
      o.onDone = function () { if (done) done.call(self); self.invalidate(); };
      return S.tween(o);
    },
    on: function (target, type, fn, opts) {
      var self = this;
      opts = Object.assign({ signal: this._ac.signal }, opts || {});
      target.addEventListener(type, function (e) { try { fn.call(self, e); } catch (err) { fail(self, err); } }, opts);
    },
    /** pointer helper: handlers {down(p,e)->bool, move(p,e), up(p,e), hover(p,e), leave()} */
    pointer: function (h, target) {
      var self = this, t = target || this.stage, drag = false, rect = null;
      function pos(e) { if (!rect || !drag) rect = t.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top, cx: e.clientX, cy: e.clientY }; }
      this.on(t, 'pointerdown', function (e) {
        rect = t.getBoundingClientRect();
        var p = pos(e);
        if (h.down && h.down.call(self, p, e) === true) {
          drag = true;
          try { t.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
          self.stage.classList.add('dragging');
          S.tip(null);
        }
        self.invalidate();
      });
      this.on(t, 'pointermove', function (e) {
        var p = pos(e);
        if (drag) { if (h.move) h.move.call(self, p, e); self.invalidate(); }
        else if (h.hover && e.pointerType !== 'touch') { h.hover.call(self, p, e); }
      });
      function end(e) {
        if (!drag) return; drag = false; self.stage.classList.remove('dragging');
        if (h.up) h.up.call(self, pos(e), e); self.invalidate();
      }
      this.on(t, 'pointerup', end); this.on(t, 'pointercancel', end);
      this.on(t, 'pointerleave', function () { if (!drag) { S.tip(null); if (h.leave) h.leave.call(self); self.invalidate(); } });
    },
    /** show tooltip at stage-local coords */
    tipAt: function (html, x, y) {
      if (!html) return S.tip(null);
      var r = this.stage.getBoundingClientRect(); S.tip(html, r.left + x, r.top + y);
    },
    reduced: function () { return S.prefs.motion !== 'full'; }
  };

  function safe(v, fn) { if (v[fn]) { try { v[fn](); } catch (e) { fail(v, e); } } }
  function fail(v, e) {
    console.error('[visual ' + (v && v.id) + ']', e);
    if (!v || v._state === 'error') return;
    v._state = 'error'; running.delete(v);
    var d = v.host && v.host.querySelector('details.viz-alt'); if (d) d.open = true;
    if (v.stage) { var m = el('div', 'err', 'This drawing hit a snag — the description below covers it.'); v.stage.appendChild(m); }
  }
  S.fail = fail;

  function syncRunning(v) {
    var should = v._state === 'ready' && v.visible && (v.continuous || v._active) && !v._paused;
    if (should) { running.add(v); wake(); } else running.delete(v);
  }

  S.defineVisual = function (id, def) {
    defs[id] = def;
    var hosts = waiting[id] || []; delete waiting[id];
    hosts.forEach(instantiate);
  };

  function instantiate(host) {
    if (host._srv) return;
    var id = host.getAttribute('data-visual'), def = defs[id];
    var v = Object.create(Base);
    Object.keys(def).forEach(function (k) { v[k] = def[k]; });
    host._srv = v;
    v.id = id; v.host = host;
    v.stage = host.querySelector('.viz-stage');
    v.stage.classList.remove('loading');
    v.ctrl = host.querySelector('.viz-controls') || el('div');
    v.liveEl = host.querySelector('.viz-live');
    v.ui = new UI(v.ctrl, v);
    v.hits = new Hits();
    v.rng = U.rng(id);
    v.time = 0; v.w = 0; v.h = 0; v.dpr = 1;
    v._layers = []; v._ac = new AbortController(); v._state = 'init'; v.visible = false;
    v._paused = !!v.continuous && S.prefs.motion !== 'full';
    var alt = host.querySelector('details.viz-alt');
    if (alt) { v._nowEl = el('p', 'now'); alt.appendChild(v._nowEl); }
    if (v.continuous) {
      var b = el('button', 'viz-play'); b.type = 'button';
      b.addEventListener('click', function () {
        if (S.prefs.pausedAll) { S.setPref('pausedAll', false); var pb = doc.getElementById('pause-btn'); if (pb) pb.setAttribute('aria-pressed', 'false'); v.setPaused(false); }
        else v.setPaused(!v._paused);
        v._userPlayed = true;
      });
      v.stage.appendChild(b); v._playBtn = b; v._syncPlayBtn();
    }
    instances.push(v);
    try { if (v.init) v.init(); v._state = 'ready'; } catch (e) { fail(v, e); return; }
    ro.observe(v.stage);
    visObs.observe(host);
    if (host.closest('[data-scrolly]') && v.onProgress) registerScrolly(v);
    layout(v);
    if (v.describe) { try { v.setDesc(v.describe()); } catch (e) { /* ignore */ } }
  }

  function sizeLayer(v, L) {
    var dpr = Math.min(window.devicePixelRatio || 1, v.maxDpr || 2) * S.quality.scale;
    if (L.opts.dpr) dpr = Math.min(dpr, L.opts.dpr);
    var pw = Math.max(1, Math.round(v.w * dpr)), ph = Math.max(1, Math.round(v.h * dpr));
    if (L.canvas.width !== pw || L.canvas.height !== ph) { L.canvas.width = pw; L.canvas.height = ph; }
    L.ctx.setTransform(pw / v.w, 0, 0, ph / v.h, 0, 0);
    L.dpr = dpr;
  }
  function layout(v) {
    if (!v.stage || v._state === 'error') return;
    var w = v.stage.clientWidth, h = v.stage.clientHeight;
    if (w < 120 || h < 80) return; // transient tiny layouts during fast scrolling
    v.w = w; v.h = h; v.dpr = Math.min(window.devicePixelRatio || 1, 2);
    v._layers.forEach(function (L) {
      if (L.svg) L.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      else sizeLayer(v, L);
    });
    if (v.resize) { try { v.resize(w, h); } catch (e) { fail(v, e); } }
    v.invalidate();
  }
  var ro = new ResizeObserver(function (entries) {
    entries.forEach(function (e) { var host = e.target.closest('.viz'); if (host && host._srv) layout(host._srv); });
    scrollGeom();
  });

  var visObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var v = e.target._srv; if (!v) return;
      var vis = e.isIntersecting;
      if (vis === v.visible) return;
      v.visible = vis;
      if (vis) { safe(v, 'onVisible'); v.invalidate(); } else { safe(v, 'onHidden'); S.tip(null); }
      syncRunning(v);
    });
  }, { rootMargin: '40px 0px' });

  function loadScript(id) {
    if (loading[id]) return; loading[id] = 1;
    var s = doc.createElement('script');
    s.src = 'js/visuals/' + id + '.js';
    s.async = true;
    s.onerror = function () {
      (waiting[id] || []).forEach(function (h) { var st = h.querySelector('.viz-stage'); if (st) { st.classList.remove('loading'); st.appendChild(el('div', 'err', 'Visual “' + id + '” is not built yet.')); } });
    };
    doc.head.appendChild(s);
  }
  var preObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      preObs.unobserve(e.target);
      var id = e.target.getAttribute('data-visual');
      if (defs[id]) instantiate(e.target);
      else { (waiting[id] = waiting[id] || []).push(e.target); var st = e.target.querySelector('.viz-stage'); if (st) st.classList.add('loading'); loadScript(id); }
    });
  }, { rootMargin: '120% 0px 120% 0px' });

  S.scanVisuals = function () {
    doc.querySelectorAll('.viz[data-visual]').forEach(function (h) { preObs.observe(h); });
  };

  // ---------------------------------------------------------------- scroll progress
  var scrollies = [], scrollDirty = true, scrollY = 0;
  function registerScrolly(v) {
    var c = v.host.closest('[data-scrolly]');
    var s = { v: v, el: c, top: 0, h: 1, p: -1, target: 0 };
    scrollies.push(s); scrollGeom(); scrollDirty = true; wake();
  }
  function scrollGeom() {
    var sy = window.scrollY;
    scrollies.forEach(function (s) { var r = s.el.getBoundingClientRect(); s.top = r.top + sy; s.h = s.el.offsetHeight; });
    scrollDirty = true;
  }
  S.scrollGeom = scrollGeom;
  window.addEventListener('scroll', function () { scrollDirty = true; wake(); }, { passive: true });
  window.addEventListener('resize', function () { scrollGeom(); wake(); });
  /** returns true if still animating */
  function scrollSample(dt) {
    if (!scrollies.length) return false;
    var moving = false, vh = window.innerHeight;
    if (scrollDirty) { scrollY = window.scrollY; scrollDirty = false; }
    scrollies.forEach(function (s) {
      if (!s.v.visible && s.p >= 0) return;
      // progress: 0 when container top hits top of viewport, 1 when its bottom hits bottom
      var span = Math.max(1, s.h - vh);
      s.target = U.clamp((scrollY - s.top + (s.v.scrollOffset || 0) * vh) / span, 0, 1);
      var np = (S.prefs.motion !== 'full' || s.p < 0) ? s.target : U.damp(s.p, s.target, 9, dt);
      if (Math.abs(np - s.target) < 0.0005) np = s.target;
      if (np !== s.p) { s.p = np; try { s.v.onProgress(np); } catch (e) { fail(s.v, e); } s.v.invalidate(); }
      if (np !== s.target) moving = true;
    });
    return moving;
  }

  // ---------------------------------------------------------------- debug overlay
  var dbg = null;
  function debugDraw() {
    if (!dbg) { dbg = el('div'); dbg.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font:11px/1.4 monospace;background:rgba(0,0,0,.75);color:#9f9;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre'; doc.body.appendChild(dbg); }
    dbg.textContent = S.debug.statsText();
  }
  S.debug = {
    stats: function () {
      return {
        fps: Math.round(fpsAvg), frameMs: +frameMs.toFixed(2), running: Array.from(running).map(function (v) { return v.id; }),
        instances: instances.map(function (v) { return { id: v.id, state: v._state, visible: v.visible, paused: v._paused }; }),
        errored: instances.filter(function (v) { return v._state === 'error'; }).map(function (v) { return v.id; }),
        quality: S.quality.level
      };
    },
    statsText: function () { var s = this.stats(); return 'fps ' + s.fps + '  frame ' + s.frameMs + 'ms  q' + s.quality + '\nrunning: ' + s.running.join(', ') + '\ninited: ' + s.instances.length + (s.errored.length ? '\nERR: ' + s.errored.join(',') : ''); }
  };
})(window.SRV);
