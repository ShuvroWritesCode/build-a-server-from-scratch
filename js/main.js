/* Boot sequence: UI chrome → tracker → lazy visual scan. */
;(function (S) {
  'use strict';
  function boot() {
    try { S.initUI(); } catch (e) { console.error('UI init failed', e); }
    try { S.initTracker(); } catch (e) { console.error('Tracker init failed', e); }
    // QA helpers: ?y=1234 scrolls on load, ?el=<visual id> scrolls a visual into view, ?theme=light
    var q = new URLSearchParams(location.search);
    if (q.get('theme')) S.setPref('theme', q.get('theme'));
    if (q.get('motion')) S.setPref('motion', q.get('motion'));
    if (q.get('y')) window.scrollTo(0, +q.get('y'));
    if (q.get('el')) { var target = document.querySelector('[data-visual="' + q.get('el') + '"]'); if (target) target.scrollIntoView({ block: 'center' }); }
    S.scanVisuals();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { S.scrollGeom(); });
    window.addEventListener('load', function () { S.scrollGeom(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.SRV);
