/* Tiny reactive store with derived values, batched notifications and optional persistence. */
;(function (S) {
  'use strict';
  function shallowEq(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) if (a[ka[i]] !== b[ka[i]]) return false;
    return true;
  }
  S.createStore = function (initial, opts) {
    opts = opts || {};
    var state = Object.assign({}, initial), derived = {}, subs = [], queued = false, saveT = 0;
    if (opts.persist) {
      var saved = S.storage.get(opts.persist, null);
      if (saved && typeof saved === 'object') Object.keys(saved).forEach(function (k) { if (k in state) state[k] = saved[k]; });
    }
    function recompute() { derived = opts.derive ? opts.derive(state) : {}; }
    recompute();
    function snapshot() { return Object.assign({}, state, derived); }
    function notify() {
      queued = false;
      var snap = snapshot();
      subs.forEach(function (s) {
        var sel = s.sel(snap);
        if (!shallowEq(sel, s.last)) { var old = s.last; s.last = sel; try { s.cb(sel, old); } catch (e) { console.error(e); } }
      });
    }
    var store = {
      get: snapshot,
      set: function (patch) {
        if (typeof patch === 'function') patch = patch(snapshot());
        var changed = false;
        Object.keys(patch).forEach(function (k) { if (state[k] !== patch[k]) { state[k] = patch[k]; changed = true; } });
        if (!changed) return;
        recompute();
        if (!queued) { queued = true; queueMicrotask(notify); }
        if (opts.persist) { clearTimeout(saveT); saveT = setTimeout(function () { S.storage.set(opts.persist, state); }, 400); }
      },
      subscribe: function (sel, cb, o) {
        if (typeof sel !== 'function') { var key = sel; sel = function (s) { return s[key]; }; }
        var s = { sel: sel, cb: cb, last: sel(snapshot()) };
        subs.push(s);
        if (o && o.immediate) cb(s.last, undefined);
        return function () { var i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
      },
      reset: function () { state = Object.assign({}, initial); recompute(); queueMicrotask(notify); if (opts.persist) S.storage.set(opts.persist, state); }
    };
    return store;
  };
})(window.SRV);
