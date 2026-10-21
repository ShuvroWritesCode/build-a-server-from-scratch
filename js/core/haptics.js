/* Haptics: a short vibration when the reader breaks something, on phones and tablets only.
   Uses the Vibration API (Android Chrome/Firefox). iOS Safari has no vibration API, so it is a
   silent no-op there, as it is on every desktop. Never fires for success states. */
;(function (S) {
  'use strict';
  var nav = navigator;
  var canVibrate = !!(nav && typeof nav.vibrate === 'function');
  function isMobile() {
    try {
      if (matchMedia('(pointer: coarse)').matches) return true;
    } catch (e) { /* ignore */ }
    return nav.maxTouchPoints > 0 && /Android|Mobi|Tablet/i.test(nav.userAgent || '');
  }
  var PATTERNS = {
    fail: [45, 60, 45],                  // something broke (a fan, a drive, a cord)
    critical: [90, 50, 90, 50, 160]      // the whole system is down or data is gone
  };
  var lastAt = 0;
  S.haptics = {
    supported: canVibrate && isMobile(),
    /** kind: 'fail' (default) | 'critical'. Rate-limited so a burst of failures is one buzz. */
    fail: function (kind) {
      if (!S.haptics.supported) return false;
      var t = performance.now();
      if (t - lastAt < 250) return false;
      lastAt = t;
      try { return !!nav.vibrate(PATTERNS[kind] || PATTERNS.fail); } catch (e) { return false; }
    }
  };
})(window.SRV);
