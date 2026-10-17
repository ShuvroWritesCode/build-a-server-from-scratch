/* Ch16 · BIOS setup. A classic text-mode setup screen built from real DOM inside the stage:
   focus it and drive it with the keyboard (←→ tabs, ↑↓ items, Enter/Space change, +/− reorder,
   F9 defaults, F10 save, Esc), or click. The help column explains the highlighted setting;
   ★ marks the recommended value and a score tracks how many match. Tab key is never trapped. */
;(function (S) {
  'use strict';
  var U = S.util;

  var TABS = ['Main', 'Advanced', 'Boot', 'Security', 'Exit'];
  var BOOT_DEV = ['NVMe boot mirror', 'USB stick', 'Network (PXE)', 'Data RAID volume'];
  var FACTORY = { virt: 'Disabled', iommu: 'Disabled', sriov: 'Disabled', power: 'Performance', smt: 'Enabled', mode: 'UEFI',
    order: [1, 2, 0, 3], secure: 'Disabled', tpm: 'Enabled', pw: 'Not set' };
  var ITEMS = {
    Main: [
      { t: 'info', label: 'BIOS version', val: '2.21.0 (2025-03-18)' },
      { t: 'info', label: 'Processor', val: '32 cores @ 2.8 GHz' },
      { t: 'info', label: 'Memory', val: '256 GB DDR5-4800 ECC' },
      { t: 'info', label: 'BMC IP address', val: '10.0.99.21' },
      { t: 'info', label: 'System time', val: '08:14:02 UTC' }
    ],
    Advanced: [
      { t: 'head', label: 'CPU configuration' },
      { k: 'virt', label: 'Virtualization (VT-x / AMD-V)', opts: ['Disabled', 'Enabled'], rec: 'Enabled', help: 'Needed for virtual machines. Off = hypervisors refuse to start VMs.' },
      { k: 'iommu', label: 'IOMMU (VT-d / AMD-Vi)', opts: ['Disabled', 'Enabled'], rec: 'Enabled', help: 'Lets a VM safely own a real device (GPU, NIC). Needed for passthrough.' },
      { k: 'smt', label: 'Hyper-threading (SMT)', opts: ['Enabled', 'Disabled'], rec: 'Enabled', help: 'Two threads per core: roughly +25% throughput for most server jobs.' },
      { t: 'head', label: 'Devices & power' },
      { k: 'sriov', label: 'SR-IOV', opts: ['Disabled', 'Enabled'], rec: 'Enabled', help: 'One network card appears as many, so each VM gets near-native speed.' },
      { k: 'power', label: 'Power profile', opts: ['Performance', 'Balanced', 'Power saver'], rec: 'Balanced',
        helpBy: { Performance: 'Max clocks all the time: lowest latency, highest power bill.', Balanced: 'Clocks up when busy, idles down when quiet. Best default.', 'Power saver': 'Caps clocks to save watts. Noticeably slower under load.' } }
    ],
    Boot: [
      { k: 'mode', label: 'Boot mode', opts: ['UEFI', 'Legacy (CSM)'], rec: 'UEFI', help: 'UEFI is modern: disks over 2 TB, Secure Boot, faster. Legacy is for very old OSes.' },
      { t: 'head', label: 'Boot order (first match wins)' },
      { t: 'order', i: 0 }, { t: 'order', i: 1 }, { t: 'order', i: 2 }, { t: 'order', i: 3 }
    ],
    Security: [
      { k: 'secure', label: 'Secure Boot', opts: ['Disabled', 'Enabled'], rec: 'Enabled', help: 'Only boots signed loaders, so boot-time malware can’t sneak in. Needs UEFI.' },
      { k: 'tpm', label: 'TPM 2.0', opts: ['Enabled', 'Disabled'], rec: 'Enabled', help: 'Security chip that stores disk-encryption keys and measures the boot.' },
      { k: 'pw', label: 'Administrator password', opts: ['Not set', 'Set ●●●●●●'], rec: 'Set ●●●●●●', help: 'Stops anyone with a keyboard from changing these settings.' }
    ],
    Exit: [
      { t: 'act', a: 'save', label: 'Save changes and reset', help: 'Writes your settings and reboots. Shortcut: F10.' },
      { t: 'act', a: 'discard', label: 'Discard changes and exit', help: 'Throws away everything since the last save.' },
      { t: 'act', a: 'defaults', label: 'Load optimized defaults', help: 'Back to factory settings. Shortcut: F9.' },
      { t: 'act', a: 'rec', label: 'Load recommended (this course)', help: 'Sets every ★ value: VMs on, UEFI + Secure Boot, balanced power.' }
    ]
  };
  var REC_KEYS = ['virt', 'iommu', 'smt', 'sriov', 'power', 'mode', 'order', 'secure', 'tpm', 'pw'];

  function clone(o) { return { virt: o.virt, iommu: o.iommu, sriov: o.sriov, power: o.power, smt: o.smt, mode: o.mode, order: o.order.slice(), secure: o.secure, tpm: o.tpm, pw: o.pw }; }
  function recState() { var r = clone(FACTORY); REC_KEYS.forEach(function (k) { if (k !== 'order') r[k] = findItem(k).rec; }); r.order = [0, 1, 2, 3]; return r; }
  function findItem(k) { for (var t in ITEMS) for (var i = 0; i < ITEMS[t].length; i++) if (ITEMS[t][i].k === k) return ITEMS[t][i]; return null; }

  S.defineVisual('bios', {
    init: function () {
      this.st = clone(FACTORY); this.saved = clone(FACTORY);
      this.tab = 1; this.sel = 1; this.dlg = null; this.flash = '';
      var self = this;
      var wrap = S.el('div'); wrap.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
      var scr = S.el('div'); scr.tabIndex = 0;
      scr.setAttribute('role', 'application');
      scr.setAttribute('aria-roledescription', 'BIOS setup screen');
      scr.setAttribute('aria-label', 'BIOS setup. Left and right arrows switch tabs, up and down choose a setting, Enter or Space changes it, plus and minus reorder boot devices, Escape goes to Exit. Press Tab to leave.');
      wrap.appendChild(scr); this.stage.appendChild(wrap);
      this.wrap = wrap; this.scr = scr;
      this.on(scr, 'keydown', this.onKey);
      this.on(scr, 'focus', function () { this.focused = true; this.render(); this.announce(this.describeSel()); });
      this.on(scr, 'blur', function () { this.focused = false; this.render(); });
      this.on(scr, 'click', this.onClick);
      var g = this.ui.group('Presets');
      g.button('★ Load recommended', function () { self.doAct('rec'); }, { kind: 'primary' });
      g.button('↺ Factory defaults', function () { self.doAct('defaults'); });
      g.button('⌨ Focus the screen', function () { self.scr.focus(); });
      this.ui.spacer();
      this.rScore = this.ui.readout('Matches ★ recommended', '–');
      this.rState = this.ui.readout('Status', 'not saved');
      this.render();
    },
    items: function () { return ITEMS[TABS[this.tab]]; },
    selectable: function (it) { return it && it.t !== 'head' && it.t !== 'info'; },
    firstSel: function () { var L = this.items(); for (var i = 0; i < L.length; i++) if (this.selectable(L[i])) return i; return 0; },
    moveSel: function (d) {
      var L = this.items(), i = this.sel;
      for (var n = 0; n < L.length; n++) { i = (i + d + L.length) % L.length; if (this.selectable(L[i])) { this.sel = i; return; } }
    },
    score: function () {
      var s = this.st, n = 0;
      REC_KEYS.forEach(function (k) { if (k === 'order') { if (s.order[0] === 0) n++; } else if (s[k] === findItem(k).rec) n++; });
      return n;
    },
    valueOf: function (it) { return this.st[it.k]; },
    disabledReason: function (it) { return it.k === 'secure' && this.st.mode !== 'UEFI' ? 'Requires UEFI' : ''; },
    change: function (dir, key) {
      var it = this.items()[this.sel];
      if (!it) return;
      if (it.t === 'act') { this.doAct(it.a); return; }
      if (it.t === 'order') { this.reorder(it.i, key === 'minus' ? 1 : -1); return; }
      if (this.disabledReason(it)) { this.flash = it.label + ': ' + this.disabledReason(it); this.announce(this.flash); this.render(); return; }
      var o = it.opts, i = o.indexOf(this.st[it.k]);
      this.st[it.k] = o[(i + (dir || 1) + o.length) % o.length];
      if (it.k === 'mode' && this.st.mode !== 'UEFI') this.st.secure = 'Disabled';
      this.flash = '';
      this.after(it.label + ' set to ' + this.st[it.k] + '. ' + this.helpOf(it));
    },
    reorder: function (pos, d) {
      var o = this.st.order, j = pos + d;
      if (j < 0 || j >= o.length) { this.announce(BOOT_DEV[o[pos]] + (j < 0 ? ' is already first.' : ' is already last.')); return; }
      var t = o[pos]; o[pos] = o[j]; o[j] = t;
      this.sel = this.items().findIndex(function (x) { return x.t === 'order' && x.i === j; });
      this.after(BOOT_DEV[t] + ' moved to position ' + (j + 1) + ' of the boot order.');
    },
    after: function (msg) { this.dirty = true; this.announce(msg); this.render(); },
    doAct: function (a) {
      if (a === 'save') { this.dlg = { kind: 'save', yes: true }; this.announce('Save configuration and reset? Yes or No. Use left and right, then Enter.'); }
      else if (a === 'discard') { this.st = clone(this.saved); this.flash = 'Changes discarded.'; this.announce(this.flash); }
      else if (a === 'defaults') { this.st = clone(FACTORY); this.flash = 'Optimized defaults loaded.'; this.announce(this.flash + ' ' + this.score() + ' of 10 match the recommendation.'); }
      else if (a === 'rec') { this.st = recState(); this.flash = 'Recommended values loaded ★'; this.announce('Recommended values loaded. 10 of 10 match.'); }
      this.render();
    },
    confirm: function (yes) {
      var self = this;
      this.dlg = null;
      if (yes) {
        this.saved = clone(this.st); this.flash = 'Saved. Resetting…'; this.rebootT = 1;
        this.announce('Configuration saved. The server resets to apply it.');
        this.tween({ from: 1, to: 0, dur: 1.6, ease: 'linear', onUpdate: function (v) { self.rebootT = v; self.render(); }, onDone: function () { self.flash = 'Settings applied ✓'; self.render(); } });
      } else this.announce('Cancelled.');
      this.render();
    },
    helpOf: function (it) {
      if (!it) return '';
      if (it.helpBy) return it.helpBy[this.st[it.k]];
      if (it.t === 'order') return 'The first bootable device wins. Put the NVMe boot mirror first so a stray USB stick can’t hijack the boot.';
      return it.help || '';
    },
    describeSel: function () {
      var it = this.items()[this.sel];
      if (!it) return TABS[this.tab] + ' tab.';
      var name = it.t === 'order' ? 'Boot option ' + (it.i + 1) + ': ' + BOOT_DEV[this.st.order[it.i]] : it.label;
      var val = it.k ? ', ' + (this.disabledReason(it) || this.st[it.k]) : '';
      return TABS[this.tab] + ' tab. ' + name + val + '. ' + this.helpOf(it);
    },
    onKey: function (e) {
      var k = e.key, handled = true;
      if (this.dlg) {
        if (k === 'ArrowLeft' || k === 'ArrowRight') this.dlg.yes = !this.dlg.yes;
        else if (k === 'Enter' || k === ' ') this.confirm(this.dlg.yes);
        else if (k === 'Escape') this.confirm(false);
        else if (k === 'y' || k === 'Y') this.confirm(true);
        else if (k === 'n' || k === 'N') this.confirm(false);
        else handled = false;
        if (handled) { e.preventDefault(); this.render(); }
        return;
      }
      if (k === 'ArrowRight' || k === 'ArrowLeft') { this.tab = (this.tab + (k === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length; this.sel = this.firstSel(); this.flash = ''; }
      else if (k === 'ArrowDown') this.moveSel(1);
      else if (k === 'ArrowUp') this.moveSel(-1);
      else if (k === 'Enter' || k === ' ') { this.change(1); e.preventDefault(); return; }
      else if (k === '+' || k === '=' || k === 'PageUp') { this.change(-1, 'plus'); e.preventDefault(); return; }
      else if (k === '-' || k === '_' || k === 'PageDown') { this.change(1, 'minus'); e.preventDefault(); return; }
      else if (k === 'Escape') { this.tab = 4; this.sel = this.firstSel(); }
      else if (k === 'F9') { this.doAct('defaults'); e.preventDefault(); return; }
      else if (k === 'F10') { this.doAct('save'); e.preventDefault(); return; }
      else handled = false;
      if (handled) { e.preventDefault(); this.render(); this.announce(this.describeSel()); }
    },
    onClick: function (e) {
      var el = e.target.closest('[data-a]'); if (!el) return;
      var a = el.getAttribute('data-a'), n = +el.getAttribute('data-n');
      this.scr.focus({ preventScroll: true });
      if (a === 'tab') { this.tab = n; this.sel = this.firstSel(); this.flash = ''; this.render(); this.announce(this.describeSel()); }
      else if (a === 'row') { if (this.sel === n) this.change(1); else { this.sel = n; this.render(); this.announce(this.describeSel()); } }
      else if (a === 'val') { this.sel = n; this.change(1); }
      else if (a === 'up' || a === 'dn') { this.sel = n; this.reorder(this.items()[n].i, a === 'up' ? -1 : 1); }
      else if (a === 'yes' || a === 'no') this.confirm(a === 'yes');
    },
    onTheme: function () { this.render(); },
    resize: function (w, h) { this.mobile = w < 560; this.fs = U.clamp(Math.round(Math.min(w / 56, h / 28)), 10, 17); this.render(); },
    colors: function () {
      var P = S.pal, lift = P.dark ? 0 : 0.35;
      return {
        blue: U.shade(P.mgmt, -0.62), blue2: U.shade(P.mgmt, -0.5), grey: P.dark ? U.shade(P.alu, 0.38) : P.alu, ink: U.shade(P.mgmt, -0.78),
        text: U.shade(P.alu, 0.5), val: U.shade(P.alu, 0.85), dim: U.shade(P.alu, -0.1), sel: U.mix(P.data, U.shade(P.mgmt, -0.62), P.dark ? 0.35 : 0.2),
        ok: U.shade(P.ok, lift), warn: U.shade(P.warn, P.dark ? 0 : 0.5), bad: U.shade(P.fault, P.dark ? 0.1 : 0.3), accent: P.accent, hint: P.dark ? P.accent : U.shade(P.accent, 0.55), mono: P.mono
      };
    },
    render: function () {
      if (!this.scr) return;
      var C = this.colors(), fs = this.fs || 13, mob = this.mobile, self = this, st = this.st;
      var pad = mob ? 6 : Math.round(this.w * 0.03) || 12;
      this.wrap.style.padding = pad + 'px';
      this.scr.style.cssText = 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;border-radius:6px;outline:none;' +
        'background:' + C.blue + ';color:' + C.text + ';font:500 ' + fs + 'px/1.45 ' + C.mono + ';cursor:default;' +
        'box-shadow:0 0 0 ' + (this.focused ? 3 : 1) + 'px ' + (this.focused ? C.accent : U.rgba(C.grey, 0.5)) + ', 0 0 0 ' + (this.focused ? 6 : 0) + 'px ' + U.rgba(C.accent, 0.25) + ';';
      var cell = 'padding:0 ' + (mob ? 6 : 10) + 'px;';
      var h = [];
      // title
      h.push('<div style="background:' + C.grey + ';color:' + C.ink + ';text-align:center;font-weight:700;letter-spacing:.06em;' + cell + '">Server Setup Utility · v2.21</div>');
      // tabs
      h.push('<div style="display:flex;gap:' + (mob ? 0 : 4) + 'px;background:' + C.blue2 + ';' + cell + 'border-bottom:1px solid ' + U.rgba(C.grey, 0.5) + '">');
      TABS.forEach(function (t, i) {
        var on = i === self.tab;
        h.push('<span data-a="tab" data-n="' + i + '" style="cursor:pointer;padding:1px ' + (mob ? 5 : 10) + 'px;' + (on ? 'background:' + C.grey + ';color:' + C.ink + ';font-weight:700;' : 'color:' + C.text + ';') + '">' + t + '</span>');
      });
      h.push('</div>');
      // body
      h.push('<div style="flex:1;display:flex;flex-direction:' + (mob ? 'column' : 'row') + ';min-height:0;">');
      h.push('<div style="display:flex;flex-direction:column;flex:' + (mob ? '0 0 auto' : '1.8 1 0%') + ';min-width:0;padding:' + (mob ? 4 : 8) + 'px 0;overflow:hidden;border:1px solid ' + U.rgba(C.grey, 0.45) + ';margin:' + (mob ? 4 : 8) + 'px;">');
      var L = this.items();
      L.forEach(function (it, i) {
        var on = i === self.sel && self.selectable(it);
        var row = 'display:flex;align-items:center;gap:8px;' + cell + (on ? 'background:' + C.sel + ';color:' + C.val + ';' : '');
        if (it.t === 'head') { h.push('<div style="' + cell + 'color:' + C.warn + ';font-weight:700;margin-top:' + (i ? 4 : 0) + 'px">▸ ' + it.label + '</div>'); return; }
        if (it.t === 'info') { h.push('<div style="' + row + '"><span style="flex:1;color:' + C.text + '">' + it.label + '</span><span style="color:' + C.val + '">' + it.val + '</span></div>'); return; }
        if (it.t === 'act') { h.push('<div data-a="row" data-n="' + i + '" style="' + row + 'cursor:pointer"><span style="flex:1">' + (on ? '› ' : '  ') + it.label + '</span>' + (it.a === 'rec' ? '<span style="color:' + C.ok + '">★</span>' : '') + '</div>'); return; }
        if (it.t === 'order') {
          var dev = st.order[it.i], good = it.i === 0 && dev === 0;
          h.push('<div data-a="row" data-n="' + i + '" style="' + row + 'cursor:pointer"><span style="flex:1">' + (it.i + 1) + '. ' + BOOT_DEV[dev] + (dev === 0 ? ' <span style="color:' + C.ok + '">★</span>' : '') + '</span>' +
            '<span data-a="up" data-n="' + i + '" title="Move up" style="cursor:pointer;padding:0 4px;color:' + C.val + '">▲</span><span data-a="dn" data-n="' + i + '" title="Move down" style="cursor:pointer;padding:0 4px;color:' + C.val + '">▼</span>' +
            (good ? '' : '') + '</div>');
          return;
        }
        var dis = self.disabledReason(it), v = dis || st[it.k], isRec = !dis && v === it.rec;
        h.push('<div data-a="row" data-n="' + i + '" style="' + row + 'cursor:pointer"><span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + it.label + '</span>' +
          '<span data-a="val" data-n="' + i + '" style="white-space:nowrap;color:' + (dis ? C.dim : on ? C.val : C.val) + '">[' + v + ']</span>' +
          '<span style="width:1.1em;text-align:center;color:' + (isRec ? C.ok : C.warn) + '">' + (isRec ? '★' : dis ? '' : '·') + '</span></div>');
      });
      if (!this.focused) h.push('<div style="margin:' + (mob ? '6px' : 'auto') + ' 8px 2px auto;padding:2px 10px;border-radius:999px;background:' + U.rgba(C.ink, 0.85) + ';color:' + C.hint + ';border:1px solid ' + C.hint + ';font-size:' + (fs - 2) + 'px;pointer-events:none;white-space:nowrap">click or Tab here, then use the arrow keys</div>');
      h.push('</div>');
      // help column
      var cur = L[this.sel], help = this.selectable(cur) ? this.helpOf(cur) : '';
      var recLine = '';
      if (cur && cur.k) {
        var ok = st[cur.k] === cur.rec && !this.disabledReason(cur);
        recLine = '<div style="margin-top:.6em;color:' + (ok ? C.ok : C.warn) + '">' + (ok ? '✓ Recommended' : '⚠ Recommended: ' + cur.rec) + '</div>';
      } else if (cur && cur.t === 'order') {
        var okO = st.order[0] === 0;
        recLine = '<div style="margin-top:.6em;color:' + (okO ? C.ok : C.warn) + '">' + (okO ? '✓ Boot mirror is first' : '⚠ Recommended: NVMe boot mirror first') + '</div>';
      }
      h.push('<div style="flex:' + (mob ? '1 1 auto' : '1 1 0%') + ';min-width:0;background:' + U.rgba(C.grey, 0.14) + ';border:1px solid ' + U.rgba(C.grey, 0.45) + ';margin:' + (mob ? '0 4px 4px' : '8px 8px 8px 0') + ';padding:' + (mob ? '4px 8px' : '8px 12px') + ';min-height:' + (mob ? '5.6em' : '0') + '">' +
        '<div style="color:' + C.val + ';font-weight:700;border-bottom:1px solid ' + U.rgba(C.grey, 0.4) + ';margin-bottom:.4em">Item help</div>' +
        '<div style="color:' + C.text + '">' + (help || (this.tab === 0 ? 'Read-only system summary. Use → for settings.' : '')) + '</div>' + recLine +
        (this.flash ? '<div style="margin-top:.6em;color:' + C.ok + ';font-weight:700">' + this.flash + '</div>' : '') + '</div>');
      h.push('</div>');
      // footer
      var keys = mob ? '←→ tab  ↑↓ item  ⏎ change  +/− order  Esc exit' : '←→ Select tab   ↑↓ Select item   Enter/Space Change   +/− Reorder   F9 Defaults   F10 Save   Esc Exit';
      h.push('<div style="background:' + C.grey + ';color:' + C.ink + ';' + cell + 'font-size:' + (fs - (mob ? 2 : 1)) + 'px;white-space:' + (mob ? 'normal' : 'nowrap') + ';overflow:hidden">' + keys + '</div>');
      // dialog
      if (this.dlg) {
        var y = this.dlg.yes;
        h.push('<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:' + U.rgba(C.ink, 0.45) + '">' +
          '<div role="alertdialog" style="background:' + C.grey + ';color:' + C.ink + ';padding:10px 16px;border:2px solid ' + C.ink + ';box-shadow:6px 6px 0 ' + U.rgba(C.ink, 0.6) + ';text-align:center;max-width:90%">' +
          '<div style="font-weight:700;margin-bottom:8px">Save configuration and reset?</div>' +
          '<span data-a="yes" style="cursor:pointer;padding:1px 14px;margin:0 6px;' + (y ? 'background:' + C.blue + ';color:' + C.val + ';' : '') + '">[ Yes ]</span>' +
          '<span data-a="no" style="cursor:pointer;padding:1px 14px;margin:0 6px;' + (!y ? 'background:' + C.blue + ';color:' + C.val + ';' : '') + '">[ No ]</span></div></div>');
      }
      if (this.rebootT > 0.01) h.push('<div style="position:absolute;inset:0;background:' + U.rgba(C.ink, Math.min(1, this.rebootT * 1.4)) + ';display:flex;align-items:center;justify-content:center;color:' + C.val + '">resetting…</div>');
      this.scr.innerHTML = h.join('');
      var sc = this.score();
      this.rScore.set(sc + ' / 10', sc === 10 ? 'ok' : sc >= 6 ? 'warn' : 'bad');
      var same = JSON.stringify(this.st) === JSON.stringify(this.saved);
      this.rState.set(same ? (this.rebootT > 0 || this.flash === 'Settings applied ✓' ? 'saved ✓' : 'no changes') : 'unsaved changes', same ? 'ok' : 'warn');
      this.setDesc('BIOS setup, ' + TABS[this.tab] + ' tab. ' + sc + ' of 10 settings match the recommended values. Highlighted: ' + this.describeSel());
    },
    draw: function () { }
  });
})(window.SRV);
