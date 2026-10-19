/* SharperPlus phone: the languages. The same words as the computer version (lang.js),
   plus the phone's own words. Every word on screen is looked up as it appears;
   words it does not know stay in English, exactly as the desktop does. */
(function (root) {
  'use strict';
  var L = root.SP_LANG || { names: ['ENGLISH'], langs: {}, notes: {} };
  var lang = 'ENGLISH', table = null;
  var english = new WeakMap();          // text node -> its English words
  var mine = new WeakMap();             // text node -> the words we put there
  var misses = root.__trMiss = root.__trMiss || {};
  var hits = root.__trHit = root.__trHit || {};

  function key(s) { return String(s).split(/\s+/).join(' ').trim().toUpperCase(); }
  var NUM = /[฿$£€¥]?[-+]?\d[\d,]*(\.\d+)?/g;
  function look(text) {                 // the words in the picked language, or null
    if (!table) return null;
    var k = key(text);
    if (!k || !/[A-Z]/.test(k)) return null;
    if (table[k] != null) { hits[k] = 1; return table[k]; }
    var nums = k.match(NUM);
    if (nums) {                          // "5 INGREDIENTS HAVE NO PRICE" -> "{0} INGREDIENTS HAVE NO PRICE"
      var i = 0, pat = k.replace(NUM, function () { return '{' + (i++) + '}'; });
      var t = table[pat];
      if (t != null) { hits[pat] = 1; return t.replace(/\{(\d+)\}/g, function (m, n) { return nums[+n]; }); }
    }
    misses[k] = 1;
    return null;
  }
  function T(text) { var t = look(text); return t == null ? text : t; }

  function skip(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (e.hasAttribute && e.hasAttribute('data-notr')) return true;
      var tag = e.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA') return true;
      if (tag === 'OPTION') return !!(e.value && e.parentNode && e.parentNode.hasAttribute('data-names'));
      if (e.classList && (e.classList.contains('nm') || e.classList.contains('dashhead') ||
          e.classList.contains('monthhead') || e.classList.contains('qty'))) return true;
    }
    return false;
  }
  function doText(node) {
    var now = node.nodeValue;
    if (mine.get(node) !== now) english.set(node, now);       // the app wrote new words
    var en = english.get(node);
    if (en == null || !/[A-Za-z]/.test(en) || skip(node.parentNode)) return;
    var t = lang === 'ENGLISH' ? en : look(en);
    var want = t == null ? en : (/^\s/.test(en) ? ' ' : '') + t + (/\s$/.test(en) ? ' ' : '');
    if (want !== now) { mine.set(node, want); node.nodeValue = want; } else mine.set(node, now);
  }
  function doAll(el) {                   // a button whose words are split over spans: look up the whole
    if (!el.__en) {
      el.__shown = '';
      var parts = el.children.length ? Array.prototype.map.call(el.children, function (c) { return c.textContent; }) : [el.textContent];
      el.__en = { html: el.innerHTML, text: parts.join(' ').replace(/\s+/g, ' ').trim() };
    }
    var t = lang === 'ENGLISH' ? null : look(el.__en.text);
    var shown = t == null ? '' : t;               // what this button shows now ('' = English)
    if (el.__shown === shown) return;
    el.__shown = shown;
    if (t == null) { el.innerHTML = el.__en.html; return; }
    var first = el.querySelector('span'), cls = first ? first.className : '';
    el.innerHTML = '<span' + (cls ? ' class="' + cls + '"' : '') + ' data-notr="">' + esc(t) + '</span>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function doAttrs(el) {
    ['placeholder', 'aria-label', 'title'].forEach(function (a) {
      if (!el.hasAttribute || !el.hasAttribute(a)) return;
      var store = el.__enA || (el.__enA = {});
      var v = el.getAttribute(a);
      if (store[a + '_mine'] !== v) store[a] = v;
      var en = store[a], t = lang === 'ENGLISH' ? en : T(en);
      if (t !== v) { store[a + '_mine'] = t; el.setAttribute(a, t); } else store[a + '_mine'] = v;
    });
  }
  function walk(rootEl) {
    if (!rootEl) return;
    if (rootEl.nodeType === 3) { doText(rootEl); return; }
    if (rootEl.nodeType !== 1) return;
    if (rootEl.hasAttribute('data-trall')) { doAll(rootEl); return; }
    doAttrs(rootEl);
    var all = rootEl.querySelectorAll('[data-trall]');
    for (var i = 0; i < all.length; i++) doAll(all[i]);
    var w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) return n.hasAttribute('data-trall') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      } });
    var n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(doText);
    var withAttr = rootEl.querySelectorAll('[placeholder],[aria-label],[title]');
    for (var j = 0; j < withAttr.length; j++) doAttrs(withAttr[j]);
  }

  var busy = false;
  var watcher = new MutationObserver(function (records) {
    if (busy) return; busy = true;
    try {
      records.forEach(function (r) {
        if (r.type === 'characterData') doText(r.target);
        else if (r.type === 'attributes') doAttrs(r.target);
        else r.addedNodes.forEach(function (n) {
          var up = n.parentNode && n.parentNode.closest && n.parentNode.closest('[data-trall]');
          if (up) doAll(up); else walk(n);
        });
      });
    } finally { busy = false; }
  });

  function setLang(name) {
    lang = L.langs[name] ? name : 'ENGLISH';
    table = lang === 'ENGLISH' ? null : L.langs[lang];
    document.documentElement.lang = ({ 'ไทย': 'th', 'FRANÇAIS': 'fr', 'DEUTSCH': 'de', 'ITALIANO': 'it', 'ESPAÑOL': 'es',
      '中文': 'zh', 'עברית': 'he', 'BAHASA MELAYU': 'ms' })[lang] || 'en';
    document.documentElement.dir = lang === 'עברית' ? 'rtl' : 'ltr';
    busy = true; try { walk(document.body); } finally { busy = false; }
  }
  function start() {
    watcher.observe(document.body, { childList: true, subtree: true, characterData: true,
                                     attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] });
  }

  root.SPT = { T: T, setLang: setLang, start: start, names: L.names, notes: L.notes || {},
               lang: function () { return lang; } };
})(this);
