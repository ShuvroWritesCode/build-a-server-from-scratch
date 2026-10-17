/* Global namespace. Classic scripts (not ES modules) so the page works from file://. */
;(function () {
  'use strict';
  var S = window.SRV = window.SRV || {};
  S.VERSION = '1.0.0';
  S.data = S.data || {};
  S.flags = {
    debug: /(^|[#&?])debug\b/.test(location.hash + location.search)
  };
  // tiny event bus
  var handlers = {};
  S.on = function (evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); return function () { S.off(evt, fn); }; };
  S.off = function (evt, fn) { var a = handlers[evt]; if (a) { var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } };
  S.emit = function (evt, payload) { (handlers[evt] || []).slice().forEach(function (fn) { try { fn(payload); } catch (e) { console.error(e); } }); };
})();
