/* SharperPlus phone app: screens, saving, and the Master Costings page. */
(function () {
  'use strict';
  var SP = window.SP, num = SP.num;
  var KEY = 'sharperplus_data';
  var data;

  // ---------------------------------------------------------------- saving
  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && saved.settings) {
        var fresh = SP.newData();
        saved.settings = Object.assign(fresh.settings, saved.settings);
        saved.settings.costs = Object.assign({}, fresh.settings.costs, saved.settings.costs || {});
        return Object.assign(fresh, saved);
      }
    } catch (e) {}
    return SP.newData();
  }
  function save() {
    derive(data.settings);
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  data = load();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  // the figures the desktop works out on save (read_settings)
  function derive(s) {
    // monthly wage typed in -> daily wage = monthly / working days (recipes use the daily)
    var days = num((s.costs || {}).work_days);
    (s.staff || []).forEach(function (p) {
      if (num(p[2]) > 0 && days > 0) p[1] = String(Math.round(num(p[2]) / days * 100) / 100);
    });
    var lines = months(s);
    var avg = s.elec_average === 'YES';
    var bill = SP.electricLeft(lines.map(function (l) {
      return [num(unitsOf(s, l)), num(l[2]), num(l[3])];
    }), avg)[0];
    s.costs.elec_bill = bill ? String(bill) : '';
    if (s.gas_type === 'METERED') {
      var newest = -1;
      for (var i = 0; i < lines.length; i++) if (num(s.gas_history[i]) > 0) { newest = i; break; }
      var paid = newest >= 0 ? num(s.gas_history[newest]) : 0;
      var used = newest >= 0 ? num(s.gas_units_history[newest]) : 0;
      s.costs.gas_bill = paid ? String(paid) : '';
      s.costs.gas_meter_units = used ? String(used) : '';
    }
  }
  function months(s) {
    s.elec_history = s.elec_history || []; s.gas_history = s.gas_history || [];
    s.gas_units_history = s.gas_units_history || [];
    s.elec_history.forEach(function (l, i) {
      while (l.length < 5) l.push('');
      if (s.gas_history[i] == null) s.gas_history[i] = '';
      if (s.gas_units_history[i] == null) s.gas_units_history[i] = '';
    });
    return s.elec_history;
  }
  function unitsOf(s, line) { return s.data_type === 'SALES' ? line[4] : line[1]; }

  // ---------------------------------------------------------------- PRODUCTION LOG + SALES CSV (as the desktop)
  var PROD_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function prodMonth(d) { d = d || new Date(); return PROD_MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function isoDay(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function sortMonthLines(s) {        // newest month first, at most 12 (same as Master Costings)
    var lines = months(s);
    var all = lines.map(function (l, i) { return { l: l, g: s.gas_history[i] || '', u: s.gas_units_history[i] || '', i: i }; });
    all.sort(function (a, b) {
      var pa = SP.parseMonth(a.l[0]), pb = SP.parseMonth(b.l[0]);
      if (pa && pb) return (pb[0] * 12 + pb[1]) - (pa[0] * 12 + pa[1]) || a.i - b.i;
      return pa ? -1 : pb ? 1 : a.i - b.i;
    });
    all = all.slice(0, SP.HISTORY_ROWS);
    s.elec_history = all.map(function (x) { var p = SP.parseMonth(x.l[0]); if (p) x.l[0] = SP.monthLabel(p[0], p[1]); return x.l; });
    s.gas_history = all.map(function (x) { return x.g; });
    s.gas_units_history = all.map(function (x) { return x.u; });
  }
  function monthLine(s, y, m) {       // that month's line in YOUR MONTHS, added if missing
    var find = function () { return months(s).filter(function (l) { var p = SP.parseMonth(l[0]); return p && p[0] === y && p[1] === m; })[0]; };
    if (!find()) { months(s).push([SP.monthLabel(y, m), '', '', '', '']); s.gas_history.push(''); s.gas_units_history.push(''); sortMonthLines(s); }
    return find() || null;
  }
  function logProduction(name, qty) { // every batch made is added (a second batch the same day adds on top)
    var log = data.production_log = data.production_log || [];
    log.push([isoDay(), name, String(qty), prodMonth()]);
  }
  function productionMonths() {       // {'2026-10': {recipe: qty}} from the log
    var out = {};
    (data.production_log || []).forEach(function (l) {
      var p = SP.parseMonth(String(l[3]).replace(' ', '-')); if (!p || num(l[2]) <= 0) return;
      var k = p[0] + '-' + p[1]; out[k] = out[k] || {}; out[k][l[1]] = (out[k][l[1]] || 0) + num(l[2]);
    });
    return out;
  }
  function monthRollover() {          // a finished month's total goes into its line; the new month starts again
    var s = data.settings, now = new Date(), thisM = prodMonth(now), changed = false;
    var logged = productionMonths();
    if (!s.produced_month) { s.produced_month = thisM; changed = true; }
    else if (s.produced_month !== thisM) {
      var last = SP.parseMonth(String(s.produced_month).replace(' ', '-'));
      if (last && num(s.units_produced) > 0) { var line = monthLine(s, last[0], last[1]); if (line && !String(line[1]).trim()) line[1] = String(num(s.units_produced)); }
      var so = logged[now.getFullYear() + '-' + (now.getMonth() + 1)] || {};
      s.units_produced = String(Math.floor(Object.keys(so).reduce(function (a, k) { return a + so[k]; }, 0) + 1e-9));
      s.produced_month = thisM; changed = true;
    }
    Object.keys(logged).forEach(function (k) {
      var y = +k.split('-')[0], m = +k.split('-')[1];
      if (y * 12 + m >= now.getFullYear() * 12 + now.getMonth() + 1) return;
      var line = monthLine(s, y, m), tot = Object.keys(logged[k]).reduce(function (a, r) { return a + logged[k][r]; }, 0);
      if (line && !String(line[1]).trim()) { line[1] = String(tot); changed = true; }
    });
    if (changed) save();
  }
  var productsSeen = null;
  function productionMade(r) {        // the chef changed the batch on a recipe: that batch is made today
    var qty = Math.floor(SP.costEverything(r, data.settings).products + 1e-9);
    if (qty === productsSeen) return;
    productsSeen = qty;
    addBatch(r);
  }
  function addBatch(r) {              // one batch of this recipe made today; whole portions (grams / portion size)
    monthRollover();
    var s = data.settings, name = String(r.recipe_name || '').trim();
    var qty = Math.floor(SP.costEverything(r, s).products + 1e-9);
    if (!name || qty <= 0) { notice('NOTICE', ['Please fill in the batch first, so SharperPlus knows how many portions it makes.']); return; }
    logProduction(name, qty);
    var total = Math.floor(num(s.units_produced) + qty + 1e-9);
    s.units_produced = String(total); save();
    function undo() {
      var log = data.production_log || [];
      for (var i = log.length - 1; i >= 0; i--) if (log[i][1] === name && num(log[i][2]) === qty) { log.splice(i, 1); break; }
      s.units_produced = String(Math.max(0, num(s.units_produced) - qty)); save();
      notice('UNDONE', [qty + ' ' + name.toUpperCase(), 'Taken off this month.']);
    }
    var lines = [qty + ' ' + name.toUpperCase(), 'Added to today\u2019s production.', '',
      'THIS MONTH SO FAR:  ' + SP.whole(total)];
    var go = s.hide_production_notice
      ? notice('BATCH ADDED', lines, ['OK', 'UNDO']).then(function (a) { if (a === 1) { undo(); return 'undone'; } })
      : notice('BATCH ADDED', lines.concat(['',
          'Every batch you make is added to MONTHLY UNITS PRODUCED in Master Costings, giving you a running total of everything your kitchen makes each month.', '',
          'Over time, this becomes your simple stock control system, allowing you to manage both your stock and sales levels.']),
          ['OK', 'UNDO', 'DON\'T SHOW THIS MESSAGE AGAIN']).then(function (a) {
            if (a === 1) { undo(); return 'undone'; }
            if (a === 2) { s.hide_production_notice = 'HIDE'; save(); }
          });
    go.then(function (x) {
      if (x !== 'undone' && num(s.units_produced) - num(s.units_sold) < 0)
        notice('STOCK ALERT', ['SALES HAVE OUTPERFORMED', 'PRODUCTION LEVELS', '', 'PLEASE CHECK YOUR', 'STOCK INVENTORY']);
    });
  }
  var CSV_ITEM_NAMES = ['item name', 'item', 'product', 'product name', 'name', 'menu item', 'description'];
  var CSV_SOLD_NAMES = ['items sold', 'units', 'units sold', 'sold', 'qty', 'quantity', 'quantity sold', 'qty sold', 'count'];
  function csvRows(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function salesCsvUnits(rows) {      // total units sold (desktop sales_csv_units); null if not recognised
    var start = -1, ci = -1, cs = -1;
    for (var r = 0; r < Math.min(rows.length, 20); r++) {
      var head = rows[r].slice(0, 20).map(function (c) { return String(c).trim().toLowerCase(); });
      ci = -1; cs = -1;
      CSV_ITEM_NAMES.some(function (n) { var k = head.indexOf(n); if (k >= 0) { ci = k; return true; } });
      CSV_SOLD_NAMES.some(function (n) { var k = head.indexOf(n); if (k >= 0) { cs = k; return true; } });
      if (ci >= 0 && cs >= 0) { start = r; break; }
    }
    if (start < 0) return null;
    var total = 0;
    rows.slice(start + 1).forEach(function (row) {
      if (row.length <= Math.max(ci, cs)) return;
      var t = String(row[cs]).replace(/,/g, '').trim().toLowerCase();
      var grams = /kg$/.test(t) ? 1000 : /g$/.test(t) ? 1 : 0;
      var sold = parseFloat(t.replace(/k?g$/, '').trim()); if (isNaN(sold)) return;
      if (grams) total += Math.ceil(sold * grams / 150);
      else if (String(row[ci]).toLowerCase().indexOf('by weight') >= 0) total += Math.ceil(sold / 150);
      else total += sold;
    });
    return total;
  }

  // ---------------------------------------------------------------- little helpers
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var toastBox = document.getElementById('toast'), toastTimer;
  function say(words, long) {
    toastBox.textContent = words; toastBox.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastBox.classList.remove('on'); }, long ? 3500 : 1900);
  }
  function notice(title, lines, buttons) {      // the gold popup, like the desktop
    return new Promise(function (done) {
      var shade = el('div', 'shade'), box = el('div', 'notice');
      box.appendChild(el('div', 'notice-head', title));
      var body = el('div', 'notice-body');
      lines.forEach(function (l) { body.appendChild(el('div', '', l || ' ')); });
      box.appendChild(body);
      var row = el('div', 'notice-btns');
      (buttons || ['OK']).forEach(function (b, i) {
        var btn = el('button', 'soft', b);
        btn.onclick = function () { document.body.removeChild(shade); done(i); };
        row.appendChild(btn);
      });
      box.appendChild(row); shade.appendChild(box); document.body.appendChild(shade);
    });
  }
  function ask(title, lines, hint, start) {
    return new Promise(function (done) {
      var shade = el('div', 'shade'), box = el('div', 'notice');
      box.appendChild(el('div', 'notice-head', title));
      var body = el('div', 'notice-body');
      lines.forEach(function (l) { body.appendChild(el('div', '', l)); });
      var input = el('input', 'cream'); input.placeholder = hint || ''; input.value = start || ''; body.appendChild(input);
      box.appendChild(body);
      var row = el('div', 'notice-btns');
      [['OK', true], ['CANCEL', false]].forEach(function (p) {
        var btn = el('button', 'soft', p[0]);
        btn.onclick = function () { document.body.removeChild(shade); done(p[1] ? input.value : null); };
        row.appendChild(btn);
      });
      box.appendChild(row); shade.appendChild(box); document.body.appendChild(shade);
      setTimeout(function () { input.focus(); }, 50);
    });
  }

  // ---------------------------------------------------------------- screens
  var screens = { menu: document.getElementById('menu') };
  var fromDash = false;          // opened a recipe from the dashboard: offer the way back
  function show(name) {
    if (name === 'method' && !isPremium()) { premiumBox(); return; }
    var now = Object.keys(screens).filter(function (k) { return !screens[k].hidden; })[0];
    if (now === 'dashboard' && (name === 'recipe' || name === 'method')) fromDash = true;
    if (name !== 'recipe' && name !== 'method') fromDash = false;
    if (!screens[name] && builders[name]) screens[name] = builders[name]();
    document.querySelectorAll('.backdash').forEach(function (b) { b.hidden = !fromDash; });
    if (!screens[name]) { say(name.toUpperCase() + ' – coming next'); return; }
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
    if (refreshers[name]) refreshers[name]();
    window.scrollTo(0, 0);
    if (PAGE_TOURS[name] && data.settings['guide_' + name] !== 'SEEN' && !document.querySelector('.toursheet'))
      (function wait(n) {           // wait for any popup (RECIPE CREATED etc.) to be closed first
        setTimeout(function () {
          if (!screens[name] || screens[name].hidden || document.querySelector('.toursheet')) return;
          if (document.querySelector('.shade') && n < 400) { wait(n + 1); return; }
          pageGuide(name);
        }, 450);
      })(0);
    if (location.hash !== '#' + name) history.pushState(null, '', name === 'menu' ? '#' : '#' + name);
  }
  window.addEventListener('popstate', function () {
    var name = location.hash.replace('#', '') || 'menu';
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
    if (!screens[name]) screens.menu.hidden = false;
  });
  var builders = {}, refreshers = {};

  function pageTop(title) {
    var page = el('section', 'page'); page.hidden = true;
    var bar = el('div', 'bar');
    var menuBtn = el('button', 'barbtn', 'MAIN MENU'); menuBtn.onclick = function () { save(); show('menu'); };
    var saveBtn = el('button', 'barbtn', 'SAVE');
    saveBtn.onclick = function () {
      if (save()) { saveBtn.textContent = '✔ SAVED'; saveBtn.classList.add('saved');
        setTimeout(function () { saveBtn.textContent = 'SAVE'; saveBtn.classList.remove('saved'); }, 1600); }
      else say('Could not save on this phone.');
    };
    bar.appendChild(menuBtn); bar.appendChild(saveBtn);
    var back = el('button', 'barbtn backdash', '\u25c0 DASHBOARD'); back.hidden = true;
    back.onclick = function () { save(); show('dashboard'); };
    bar.appendChild(back);
    page.appendChild(bar);
    page.appendChild(el('h1', 'pagetitle', title));
    document.getElementById('app').appendChild(page);
    return page;
  }

  // jump to section: one tap takes the chef straight to that part of a long page
  function jumpBox(page, list) {        // list: [card title, button words, colour]
    var jump = el('div', 'jumpbox');
    jump.appendChild(el('div', 'jumptitle', 'JUMP TO SECTION'));
    var grid = el('div', 'jumpgrid'); jump.appendChild(grid);
    list.forEach(function (j) {
      var b = el('button', 'jumpbtn', j[1]); b.style.background = j[2];
      b.onclick = function () {
        var target = page.querySelector('.card[data-guide="' + j[0] + '"]'); if (!target) return;
        var bar = page.querySelector('.bar'), off = (bar ? bar.offsetHeight : 0) + 8;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - off, behavior: 'smooth' });
        target.classList.add('flash'); setTimeout(function () { target.classList.remove('flash'); }, 1600);
      };
      grid.appendChild(b);
    });
    page.appendChild(jump);
  }
  var MASTER_HEADS = [['YOUR SETTINGS', 'SETTINGS', '#4F5A2E'], ['RENT & WORKING TIME', 'RENT & WORKING TIME', '#4A433C'],
    ['STAFF', 'STAFF', '#59445F'], ['MONTHLY UNITS', 'MONTHLY UNITS', '#185451'], ['ELECTRIC COSTING BLOCK', 'ELECTRIC', '#37566E'],
    ['MONTHLY GAS COSTING', 'GAS', '#37566E'], ['ELECTRIC & GAS MONTHS', 'YOUR MONTHS', '#2B4357'], ['COST PER DAY', 'COST PER DAY', '#20364D']];

  // ---------------------------------------------------------------- MASTER COSTINGS
  builders.master = function () {
    var s = data.settings, c = s.costs;
    var page = pageTop('OVERHEADS & COSTING FACTORS');
    guideButton(page, 'master');
    var helperBtn = el('button', 'guidebtn helperbtn', '\u270e  SET-UP HELPER: ANSWER A FEW QUESTIONS');
    helperBtn.onclick = function () { setupHelper(); }; page.appendChild(helperBtn);
    jumpBox(page, MASTER_HEADS);
    var outs = {}, inputs = [];

    function card(title) {
      var box = el('div', 'card');
      if (title) {
        var h = el('div', 'cardhead rhead', title);
        MASTER_HEADS.forEach(function (m) { if (m[0] === title) h.style.background = m[2]; });
        box.appendChild(h); box.setAttribute('data-guide', title);
      }
      page.appendChild(box);
      return box;
    }
    function field(box, label, get, set, opts) {
      opts = opts || {};
      var row = el('label', 'row');
      row.appendChild(el('span', 'lbl', label));
      var input = el('input', 'cream');
      input.inputMode = opts.text ? 'text' : 'decimal';
      input.value = get();
      input.oninput = function () { set(input.value); refresh(); };
      input.onchange = save;
      row.appendChild(input);
      if (opts.suffix) row.appendChild(el('span', 'suffix', opts.suffix));
      box.appendChild(row);
      inputs.push({ input: input, get: get });
      return row;
    }
    function costIn(box, label, key, opts) {
      return field(box, label, function () { return c[key] || ''; },
                   function (v) { c[key] = v; }, opts);
    }
    function out(box, label, key, strong) {
      var row = el('div', 'row');
      row.appendChild(el('span', 'lbl', label));
      var v = el('span', 'calc' + (strong ? ' strong' : ''));
      row.appendChild(v); box.appendChild(row); outs[key] = v;
      return row;
    }
    function pick(box, label, values, get, set, after) {
      var row = el('label', 'row');
      row.appendChild(el('span', 'lbl', label));
      var sel = el('select', 'cream');
      values.forEach(function (v) { var o = el('option', '', v); o.value = v; sel.appendChild(o); });
      sel.value = get();
      sel.onchange = function () { set(sel.value); save(); refresh(); if (after) after(sel.value); };
      row.appendChild(sel); box.appendChild(row);
      inputs.push({ input: sel, get: get });
      return row;
    }
    function buttons(box, list) {
      var row = el('div', 'btnrow');
      list.forEach(function (b) {
        var btn = el('button', 'soft', b[0]); btn.onclick = b[1]; row.appendChild(btn);
        if (b[2]) b[2](btn);
      });
      box.appendChild(row);
      return row;
    }

    // ---- your settings
    var set1 = card('YOUR SETTINGS');
    pick(set1, 'SELECT CURRENCY', Object.keys(SP.CURRENCIES),
         function () { return s.currency; }, function (v) { s.currency = v; });
    pick(set1, 'SELECT WEIGHTS', ['G / KG', 'OZ / LB'],
         function () { return s.weights === 'OZ / LB' ? 'OZ / LB' : 'G / KG'; },
         function (v) { s.weights = v; });
    field(set1, 'YOUR LOCAL VAT RATE', function () { return s.vat_percent; },
          function (v) { s.vat_percent = v; }, { suffix: '%' });

    // ---- rent and working time
    var rent = card('RENT & WORKING TIME');
    field(rent, 'WORKING DAYS PER MONTH', function () { return c.work_days || ''; },
          function (v) { c.work_days = v; if (drawStaff) drawStaff.update(); });
    costIn(rent, 'WORKING HOURS PER DAY', 'work_hours');
    costIn(rent, 'RENT COST', 'rent_cost');
    out(rent, 'RENT COST PER DAY', 'rent_day');
    out(rent, 'TOTAL RENT COST PER DISH', 'rent_dish', true);

    // ---- staff (the same list as the STAFF page)
    var staffCard = card('STAFF');
    staffCard.appendChild(el('div', 'note', 'Type each member of staff and their monthly wage.'));
    var staffBox = el('div', 'staffin'); staffCard.appendChild(staffBox);
    var drawStaff;

    // ---- units
    var units = card('MONTHLY UNITS');
    field(units, 'MONTHLY UNITS PRODUCED', function () { return s.units_produced; },
          function (v) { s.units_produced = v; });
    field(units, 'MONTHLY UNITS SOLD', function () { return s.units_sold; },
          function (v) { s.units_sold = v; });
    out(units, 'TOTAL STOCK HOLDING AFTER MONTHLY SALES', 'stock');
    field(units, 'PRODUCTION TARGET THIS MONTH', function () { return (s.prod_targets || {})[prodMonth()] || ''; },
          function (v) { s.prod_targets = s.prod_targets || {}; s.prod_targets[prodMonth()] = v; });
    out(units, 'PRODUCTION AGAINST TARGET', 'perf', true);
    units.appendChild(el('div', 'note', 'Every batch made on a recipe is added to UNITS PRODUCED for this month.'));
    buttons(units, [['ADD PRODUCED TO THIS MONTH', function () { unitsToMonth('produced'); }],
                    ['ADD SOLD TO THIS MONTH', function () { unitsToMonth('sold'); }]]);
    buttons(units, [['UPLOAD YOUR SALES CSV', uploadCsv], ['VIEW PRODUCTION HISTORY', viewProduction]]);

    function unitsToMonth(key) {      // put MONTHLY UNITS PRODUCED (or SOLD) into this month's line (desktop units_to_month)
      var v = num(key === 'produced' ? s.units_produced : s.units_sold);
      var what = key === 'produced' ? 'PRODUCTION' : 'SALES';
      if (v <= 0) { notice('NOTICE', ['NO ' + what + ' DATA IN SYSTEM.', 'PLEASE ADD MANUALLY TO EACH MONTH']); return; }
      notice('ADD ' + what + ' DATA FOR ELECTRIC AND GAS COST?', [String(v) + ' UNITS'], ['YES', 'NO']).then(function (a) {
        if (a !== 0) return;
        var d = new Date(), lines = months(s);
        var line = lines.filter(function (l) { var p = SP.parseMonth(l[0]); return p && p[0] === d.getFullYear() && p[1] === d.getMonth() + 1; })[0] || lines[0];
        if (!line) line = monthLine(s, d.getFullYear(), d.getMonth() + 1);
        var idx = key === 'produced' ? 1 : 4, old = String(line[idx] || '').trim();
        var go = old && num(old) !== v
          ? notice(key === 'produced' ? 'UNITS PRODUCED' : 'UNITS SOLD', [line[0] + ' already has ' + old + '.', '', 'Change it to ' + v + '?'], ['YES', 'NO'])
          : Promise.resolve(0);
        go.then(function (b) {
          if (b !== 0) return;
          line[idx] = String(v);
          setView(key === 'sold' ? 'SALES' : 'PRODUCTION');
          notice(what + ' DATA', [v + (key === 'produced' ? ' PRODUCTION' : ' SALES') + ' UNITS ADDED FOR', String(line[0]).replace('-', ' ').toUpperCase()]);
        });
      });
    }
    function uploadCsv() {            // desktop upload_csv: total units sold from a POS sales CSV
      var input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,text/csv';
      input.onchange = function () {
        var f = input.files && input.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          var total = salesCsvUnits(csvRows(String(rd.result || '').replace(/^\ufeff/, '')));
          if (total == null) { notice('UPLOAD FAILED', ['CSV format not recognised!', '', 'Please make sure your CSV has an item column', '(Item name or Product) and a sold column', '(Items sold, Units or Qty).']); return; }
          var d = new Date(), def = SP.monthLabel(d.getFullYear(), d.getMonth() + 1).toUpperCase();
          ask('SELECT DATA TYPE', ['YOU HAVE SELECTED UNIT SALES FOR:', def, 'IF YOU WISH TO ADD THIS TO A DIFFERENT MONTH', 'PLEASE ADD BELOW'], 'MMM-YYYY', def).then(function (text) {
            if (!text) { notice('CANCELLED', ['Sales upload cancelled.']); return; }
            var when = SP.parseMonth(text);
            if (!when) { notice('FORMAT ERROR', ['Could not recognise that month.', 'Please use MMM-YYYY (e.g. FEB-2026)']); return; }
            var line = monthLine(s, when[0], when[1]), units2 = String(Math.round(total));
            if (line) line[4] = units2;
            s.units_sold = units2; save();
            setView('SALES');
            refreshers.master();
            notice('UPLOAD COMPLETE', ['Sales CSV Uploaded!', '', 'Total Units Sold: ' + SP.whole(total), 'Month:', SP.monthLabel(when[0], when[1])]);
          });
        };
        rd.readAsText(f);
      };
      input.click();
    }
    function viewProduction() {       // every month's production, newest first; tap a month to see its recipes
      monthRollover();
      var logged = productionMonths(), d = new Date(), nowK = d.getFullYear() + '-' + (d.getMonth() + 1), all = {};
      months(s).forEach(function (l) { var p = SP.parseMonth(l[0]); if (p) all[p[0] + '-' + p[1]] = num(l[1]); });
      if (num(s.units_produced) > 0) all[nowK] = num(s.units_produced);
      Object.keys(logged).forEach(function (k) { if (all[k] == null) all[k] = Object.keys(logged[k]).reduce(function (a, r) { return a + logged[k][r]; }, 0); });
      var keys = Object.keys(all).sort(function (a, b) { var pa = a.split('-'), pb = b.split('-'); return (pb[0] * 12 + +pb[1]) - (pa[0] * 12 + +pa[1]); });
      var shade = el('div', 'shade'), box = el('div', 'notice');
      box.appendChild(el('div', 'notice-head', 'PRODUCTION HISTORY'));
      var body = el('div', 'notice-body');
      if (!keys.length) body.appendChild(el('div', '', 'No production yet. Change the batch on a recipe to start.'));
      keys.forEach(function (k) {
        var y = +k.split('-')[0], m = +k.split('-')[1];
        var label = SP.monthLabel(y, m) + (k === nowK ? '  (so far)' : '') + ':   ' + SP.whole(all[k]);
        if (logged[k]) {
          var b = el('button', 'soft wide', label + '  \u25b8');
          b.onclick = function () {
            var rec = logged[k], lines = Object.keys(rec).sort(function (a, c) { return rec[c] - rec[a]; })
              .map(function (n) { return n + ':   ' + SP.whole(rec[n]); });
            lines.push('', 'TOTAL:   ' + SP.whole(Object.keys(rec).reduce(function (a, n) { return a + rec[n]; }, 0)));
            notice(SP.monthLabel(y, m).toUpperCase() + ' PRODUCTION', lines);
          };
          body.appendChild(b);
        } else body.appendChild(el('div', 'histline', label));
      });
      box.appendChild(body);
      var row = el('div', 'notice-btns'), ok = el('button', 'soft', 'OK');
      ok.onclick = function () { document.body.removeChild(shade); }; row.appendChild(ok); box.appendChild(row);
      shade.appendChild(box); document.body.appendChild(shade);
    }

    // ---- electric costing block
    var elec = card('ELECTRIC COSTING BLOCK');
    var billRow = out(elec, 'ELECTRIC BILL (TOTAL PAID)', 'elec_bill_left');
    var toBill = el('button', 'jump', '\u270e  TYPE YOUR BILL HERE');
    toBill.onclick = function () { goToBill('MONTHLY ELECTRIC COST'); };
    billRow.onclick = toBill.onclick; elec.appendChild(toBill);
    costIn(elec, 'PLANNED ELECTRICITY', 'elec_planned');
    var hint = el('div', 'hint'); elec.appendChild(hint); outs.elec_planned = hint;
    out(elec, 'TOTAL COOKING ELECTRIC', 'elec_cooking');
    costIn(elec, 'TAX % ON YOUR BILL (OPTIONAL)', 'elec_tax', { suffix: '%' });
    out(elec, 'BILL BEFORE TAX', 'elec_net');
    out(elec, 'TAX', 'elec_tax_amount');
    out(elec, 'COST PER UNIT', 'elec_unit_show');
    out(elec, 'UNITS USED (FROM YOUR BILL)', 'elec_kwh');
    costIn(elec, 'BUFFER %', 'elec_buffer', { suffix: '%' });
    costIn(elec, 'FIXED BASELINE – LOWEST ELECTRIC BILL', 'elec_baseline');
    costIn(elec, 'SPLIT COOKING vs OVERHEADS (LIGHTS, AC, FRIDGES ETC.)', 'overhead_percent', { suffix: '%' });
    out(elec, 'OVERHEAD ELECTRIC (LIGHTS, AC, FRIDGES ETC.)', 'elec_overhead');
    var unitsRow = out(elec, 'MONTHLY UNITS PRODUCED', 'elec_units');
    out(elec, 'ELECTRICITY COST PER PORTION', 'elec_portion', true);
    out(elec, 'ELECTRIC COST PER MINUTE (USED BY RECIPES)', 'elec_per_minute', true);

    // ---- gas
    var gas = card('MONTHLY GAS COSTING');
    pick(gas, 'GAS TYPE', SP.GAS_TYPES, function () { return s.gas_type; },
         function (v) { s.gas_type = v; },
         function (v) {
           gasRows();
           notice('NOTICE', v === 'METERED'
             ? ['Gas METERED Mode Setup Complete!', '',
                'Type in your MONTHLY GAS BILL and GAS UNITS USED in the months below.']
             : ['Gas CANISTER Mode Setup Complete!']);
         });
    var canister = [
      costIn(gas, 'GAS CANISTER COST', 'gas_canister_cost'),
      costIn(gas, 'GAS CANISTER SIZE (KG)', 'gas_canister_kg'),
      out(gas, 'COST PER KG', 'gas_per_kg')];
    var metered = [
      costIn(gas, 'PLANNED GAS BILL', 'gas_planned'),
      costIn(gas, 'BUFFER % (OPTIONAL)', 'gas_buffer', { suffix: '%' }),
      out(gas, 'PLANNED GAS BILL WITH BUFFER', 'gas_planned_buffer'),
      (function () { var r = out(gas, 'GAS BILL (TOTAL PAID)', 'gas_bill_show');
        r.onclick = function () { goToBill('MONTHLY GAS COST'); }; return r; })(),
      out(gas, 'UNITS USED (FROM YOUR BILL)', 'gas_units_show'),
      costIn(gas, 'TAX % ON YOUR BILL (OPTIONAL)', 'gas_tax', { suffix: '%' }),
      out(gas, 'BILL BEFORE TAX', 'gas_net'),
      out(gas, 'TAX', 'gas_tax_amount'),
      out(gas, 'COST PER UNIT', 'gas_per_unit')];
    function gasRows() {
      var m = s.gas_type === 'METERED';
      canister.forEach(function (r) { r.hidden = m; });
      metered.forEach(function (r) { r.hidden = !m; });
    }
    gas.appendChild(el('div', 'sub', 'SELECT ONE OR A MIXTURE OF FLAMES'));
    var flames = el('div', 'flames');
    var flameBtns = {};
    [['LOW', 'flame_low'], ['MEDIUM', 'flame_medium'], ['HIGH', 'flame_high']].forEach(function (f) {
      var b = el('button', 'flame');
      b.innerHTML = '<span class="tick"></span><span>' + f[0] + ' FLAME</span>';
      b.onclick = function () { c[f[1]] = c[f[1]] === 'YES' ? 'NO' : 'YES'; save(); refresh(); flameSay(); };
      flames.appendChild(b); flameBtns[f[1]] = b;
    });
    gas.appendChild(flames);
    buttons(gas, [['SELECT ALL FLAMES', function () {
      c.flame_low = c.flame_medium = c.flame_high = 'YES'; save(); refresh(); flameSay(); }]]);
    out(gas, 'GAS COST PER MINUTE LOW FLAME', 'gas_low');
    out(gas, 'GAS COST PER MINUTE MEDIUM FLAME', 'gas_medium');
    out(gas, 'GAS COST PER MINUTE HIGH FLAME', 'gas_high');
    out(gas, 'GAS COST PER MINUTE (AVERAGE OF FLAMES)', 'gas_per_minute', true);
    function flameSay() {
      var picked = ['flame_low', 'flame_medium', 'flame_high'].filter(function (k) { return c[k] === 'YES'; });
      if (!picked.length) { notice('FLAME SELECTION', ['NO FLAME SELECTED']); return; }
      var r = SP.costEverything(SP.blankRecipe(), s);
      if (!r.gas_per_kg) return;
      var rates = SP.flameRates(s.gas_type), idx = { flame_low: 0, flame_medium: 1, flame_high: 2 };
      var costs = picked.map(function (k) { return r.gas_per_kg * rates[idx[k]] / 60; });
      var names = { flame_low: 'LOW FLAME:', flame_medium: 'MEDIUM FLAME:', flame_high: 'HIGH FLAME:' };
      notice('FLAME SELECTION', [picked.length === 1
        ? names[picked[0]] + ' ' + SP.money(costs[0]) + '/MIN'
        : 'AVERAGE OF ' + picked.length + ' FLAMES: ' +
          SP.money(costs.reduce(function (a, b) { return a + b; }, 0) / costs.length) + '/MIN']);
    }

    // ---- the months
    var mon = card('ELECTRIC & GAS MONTHS');
    mon.appendChild(el('div', 'note', 'ADD YOUR UNITS EACH MONTH FOR AN ACCURATE GAS AND ELECTRIC ' +
      'COST PER DISH. AFTER 12 MONTHS YOU CAN USE THE YEARLY AVERAGE.'));
    buttons(mon, [['ADD OWN DATA FOR ELECTRIC AND GAS', ownMonths],
                  ['ADD CURRENT MONTH AND YEAR', currentMonth]]);
    mon.appendChild(el('div', 'sub', 'SELECT AVERAGE YEARLY COST FOR ELECTRIC'));
    var avgRow = buttons(mon, [['YES', function () { setAverage('YES'); }],
                               ['NO', function () { setAverage('NO'); }]]);
    mon.appendChild(el('div', 'sub', 'MONTH TABLES SHOW'));
    var viewRow = buttons(mon, [['UNITS PRODUCED', function () { setView('PRODUCTION'); }],
                                ['UNITS SOLD', function () { setView('SALES'); }]]);
    mon.appendChild(el('div', 'note red', 'A RED FIGURE MEANS YOU ARE OVER YOUR PLANNED BILL'));
    var list = el('div', 'months'); mon.appendChild(list);
    mon.appendChild(el('div', 'small', 'Keep the newest month at the top. Recipes use the top ' +
      'month’s bill, or the average when YES is picked.'));

    function setAverage(answer) {
      s.elec_average = answer; save(); refresh();
      if (answer === 'YES') {
        var bills = months(s).map(function (l) { return num(l[3]); }).filter(function (b) { return b > 0; });
        if (bills.length) notice('AVERAGE ELECTRIC COST:',
          [SP.money(bills.reduce(function (a, b) { return a + b; }, 0) / bills.length)]);
        else notice('NOTICE', ['NO ELECTRIC DATA YET!', '', 'PLEASE ADD YOUR MONTHLY ELECTRIC BILLS']);
      } else notice('NOTICE', ['MONTHLY COSTING MODE SELECTED']);
    }
    function setView(which) { s.data_type = which; save(); drawMonths(); refresh(); }

    function sortMonths(lines) {          // newest month first, at most 12
      var all = lines.map(function (l, i) { return { l: l, g: s.gas_history[i] || '', u: s.gas_units_history[i] || '', i: i }; });
      all.sort(function (a, b) {
        var pa = SP.parseMonth(a.l[0]), pb = SP.parseMonth(b.l[0]);
        if (pa && pb) return (pb[0] * 12 + pb[1]) - (pa[0] * 12 + pa[1]) || a.i - b.i;
        return pa ? -1 : pb ? 1 : a.i - b.i;
      });
      all = all.slice(0, SP.HISTORY_ROWS);
      s.elec_history = all.map(function (x) {
        var p = SP.parseMonth(x.l[0]); if (p) x.l[0] = SP.monthLabel(p[0], p[1]); return x.l; });
      s.gas_history = all.map(function (x) { return x.g; });
      s.gas_units_history = all.map(function (x) { return x.u; });
    }
    function addMonth(y, m) {
      var lines = months(s);
      if (lines.some(function (l) { var p = SP.parseMonth(l[0]); return p && p[0] === y && p[1] === m; })) return false;
      lines.push([SP.monthLabel(y, m), '', '', '', '']); s.gas_history.push(''); s.gas_units_history.push('');
      sortMonths(lines); save(); drawMonths(); refresh();
      return true;
    }
    function currentMonth() {
      var d = new Date();
      addMonth(d.getFullYear(), d.getMonth() + 1);
      notice('CURRENT MONTH READY:', [SP.monthLabel(d.getFullYear(), d.getMonth() + 1).toUpperCase()]);
    }
    function ownMonths() {
      ask('SET UP HISTORICAL DATA', ['ENTER YOUR FIRST MONTH AND YEAR', 'EXAMPLE  MARCH 2025  OR  MAY 2025'],
          'MARCH 2025').then(function (text) {
        if (!text) return;
        var start = SP.parseMonth(text);
        if (!start) { notice('NOTICE', ['That is not a month I can read.', '', 'Type it like JAN-2026']); return; }
        var d = new Date(), count = (d.getFullYear() - start[0]) * 12 + (d.getMonth() + 1 - start[1]);
        if (count < 0) { notice('NOTICE', ['That month is in the future.']); return; }
        var go = months(s).length
          ? notice('PLEASE CHECK', ['This clears the electric and gas months and starts them again from ' +
                   SP.monthLabel(start[0], start[1]) + '.', '', 'Carry on?'], ['YES', 'NO'])
          : Promise.resolve(0);
        go.then(function (answer) {
          if (answer !== 0) return;
          var lines = [];
          for (var back = 0; back <= Math.min(count, SP.HISTORY_ROWS - 1); back++) {
            var total = d.getFullYear() * 12 + d.getMonth() - back;
            lines.push([SP.monthLabel(Math.floor(total / 12), total % 12 + 1), '', '', '', '']);
          }
          s.elec_history = lines; s.gas_history = lines.map(function () { return ''; });
          s.gas_units_history = lines.map(function () { return ''; });
          save(); drawMonths(); refresh();
          notice('SETUP COMPLETE', [lines.length + ' MONTHS CREATED.']).then(function () {
            notice('REMINDER', ['ONCE YOU RECEIVE YOUR CURRENT BILL FOR',
              SP.FULL_MONTHS[d.getMonth()].toUpperCase() + ' ' + d.getFullYear() + ' PLEASE COMPLETE THE TOP MONTH.']);
          });
        });
      });
    }

    function goToBill(label) {        // the bill is typed in the newest month, like the desktop
      if (!months(s).length) { var d = new Date(); addMonth(d.getFullYear(), d.getMonth() + 1); }
      var first = list.querySelector('.month');
      var rows = first ? first.querySelectorAll('.row') : [];
      for (var i = 0; i < rows.length; i++) {
        var l = rows[i].querySelector('.lbl');
        if (l && l.textContent === label) {
          var inp = rows[i].querySelector('input');
          rows[i].scrollIntoView({ block: 'center' });
          rows[i].classList.add('flash'); setTimeout(function (r) { r.classList.remove('flash'); }.bind(null, rows[i]), 1800);
          if (inp) setTimeout(function () { inp.focus(); }, 350);
          return;
        }
      }
    }
    var monthOuts = [];
    function drawMonths() {
      list.innerHTML = ''; monthOuts = [];
      var lines = months(s);
      if (!lines.length) {
        list.appendChild(el('div', 'empty', 'No months yet. Press ADD CURRENT MONTH AND YEAR to start.'));
        return;
      }
      var sales = s.data_type === 'SALES';
      lines.forEach(function (line, i) {
        var box = el('div', 'month');
        var head = el('div', 'monthhead');
        head.appendChild(el('span', '', line[0] || 'MONTH'));
        var del = el('button', 'del', '✕');
        del.setAttribute('aria-label', 'Remove this month');
        del.onclick = function () {
          notice('REMOVE MONTH', ['Remove ' + line[0] + ' and everything typed in it?'], ['REMOVE', 'CANCEL'])
            .then(function (a) {
              if (a !== 0) return;
              s.elec_history.splice(i, 1); s.gas_history.splice(i, 1); s.gas_units_history.splice(i, 1);
              save(); drawMonths(); refresh();
            });
        };
        head.appendChild(del); box.appendChild(head);
        function mIn(label, get, set, mark) {
          var r = field(box, label, get, set);
          if (mark) r.classList.add('mark');
        }
        mIn(sales ? 'UNITS SOLD' : 'UNITS PRODUCED',
            function () { return sales ? line[4] : line[1]; },
            function (v) { if (sales) line[4] = v; else line[1] = v; }, sales);
        mIn('ELECTRIC UNITS USED (kWh)', function () { return line[2]; }, function (v) { line[2] = v; });
        mIn('MONTHLY ELECTRIC COST', function () { return line[3]; }, function (v) { line[3] = v; });
        var o = {};
        o.ep = out(box, 'ELECTRIC COST PER PORTION', 'm' + i + 'ep');
        o.es = out(box, 'SURPLUS FUNDS FROM SET BUFFER', 'm' + i + 'es');
        o.eo = out(box, 'OVERHEADS OVER / UNDER', 'm' + i + 'eo');
        mIn('MONTHLY GAS COST', function () { return s.gas_history[i]; }, function (v) { s.gas_history[i] = v; });
        if (s.gas_type === 'METERED') {
          mIn('GAS UNITS USED (FROM BILL)', function () { return s.gas_units_history[i]; },
              function (v) { s.gas_units_history[i] = v; });
        }
        o.gp = out(box, 'GAS COST PER PORTION', 'm' + i + 'gp');
        o.gs = out(box, 'SURPLUS FUNDS FROM BUFFER', 'm' + i + 'gs');
        if (s.gas_type === 'METERED') o.gb = out(box, 'PLANNED GAS LESS BILL PAID', 'm' + i + 'gb');
        monthOuts.push(o);
        list.appendChild(box);
      });
    }

    function setOut(key, text, red) {
      var o = outs[key]; if (!o) return;
      o.textContent = text; o.classList.toggle('neg', !!red);
    }
    function cash(v) { return v == null ? '' : SP.money(v); }

    function refresh() {
      derive(s);
      SP.setUnits(s);
      var lines = months(s);
      var r = SP.costEverything(data.recipes[data.current] || SP.blankRecipe(), s);
      var avg = s.elec_average === 'YES';
      var left = SP.electricLeft(lines.map(function (l) { return [num(unitsOf(s, l)), num(l[2]), num(l[3])]; }), avg);
      var bill = left[0], kwh = left[1], sold = left[2];
      var split = SP.splitShare(num(c.overhead_percent));
      var autoPlan = SP.plannedElectric(num(c.elec_baseline), num(c.elec_buffer));
      var planned = num(c.elec_planned) || autoPlan;
      var days = num(c.work_days), cooking = bill * (1 - split);
      var rentDay = days ? num(c.rent_cost) / days : 0;
      setOut('rent_day', days ? SP.money(rentDay) : '');
      setOut('rent_dish', s.rent_method === 'NONE' ? 'NOT USED' : SP.money(r.rent));
      var stock = num(s.units_produced) - num(s.units_sold);
      setOut('stock', SP.whole(stock), stock < 0);
      var target = num((s.prod_targets || {})[prodMonth()]), made = num(s.units_produced);
      if (outs.perf) {
        outs.perf.classList.remove('pos');
        if (!target) setOut('perf', '');
        else if (made < target) setOut('perf', 'UNDER PERFORMED BY ' + SP.whole(target - made) + ' (' + Math.round(made / target * 100) + '%)', true);
        else { setOut('perf', (made > target ? 'OVER PERFORMED BY ' + SP.whole(made - target) : 'ON TARGET') + ' (' + Math.round(made / target * 100) + '%)'); outs.perf.classList.add('pos'); }
      }
      setOut('elec_bill_left', SP.money(bill));
      outs.elec_planned.textContent = num(c.elec_planned) ? '' : 'Empty = baseline + buffer: ' + SP.money(autoPlan);
      setOut('elec_cooking', SP.money(cooking));
      setOut('elec_kwh', bill ? SP.whole(kwh) : '');
      var net = bill / (1 + num(c.elec_tax) / 100);
      setOut('elec_net', bill ? SP.money(net) : '');
      setOut('elec_tax_amount', bill ? SP.money(bill - net) : '');
      setOut('elec_unit_show', bill && kwh ? SP.money(bill / kwh) : '');
      setOut('elec_overhead', SP.money(bill * split));
      unitsRow.firstChild.textContent = s.data_type === 'SALES' ? 'MONTHLY UNITS SOLD' : 'MONTHLY UNITS PRODUCED';
      setOut('elec_units', bill ? SP.whole(sold) : '');
      setOut('elec_portion', cooking > 0 && sold > 0 ? SP.money(cooking / sold) : '');
      setOut('elec_per_minute', E4(r.elec_minute));
      var gasPaid = num(c.gas_bill), gasUsed = num(c.gas_meter_units);
      setOut('gas_bill_show', gasPaid ? SP.money(gasPaid) : '');
      setOut('gas_units_show', gasUsed ? SP.commas(gasUsed, gasUsed % 1 ? 2 : 0) : '');
      var plannedGas = num(c.gas_planned), buffered = plannedGas * (1 + num(c.gas_buffer) / 100);
      setOut('gas_planned_buffer', plannedGas ? SP.money(buffered) : '');
      var gasNet = gasPaid / (1 + num(c.gas_tax) / 100);
      setOut('gas_net', gasPaid ? SP.money(gasNet) : '');
      setOut('gas_tax_amount', gasPaid ? SP.money(gasPaid - gasNet) : '');
      var perKg = r.gas_per_kg, isMetered = s.gas_type === 'METERED', rates = SP.flameRates(s.gas_type);
      setOut('gas_per_kg', SP.money(perKg)); setOut('gas_per_unit', SP.money(perKg));
      setOut('gas_low', SP.money(perKg * rates[0] / 60));
      setOut('gas_medium', SP.money(perKg * rates[1] / 60));
      setOut('gas_high', SP.money(perKg * rates[2] / 60));
      setOut('gas_per_minute', SP.money(r.gas_minute));
      Object.keys(flameBtns).forEach(function (k) {
        flameBtns[k].classList.toggle('on', c[k] === 'YES');
        flameBtns[k].firstChild.textContent = c[k] === 'YES' ? '✔' : '';
      });
      avgRow.children[0].classList.toggle('on', s.elec_average === 'YES');
      avgRow.children[1].classList.toggle('on', s.elec_average !== 'YES');
      viewRow.children[0].classList.toggle('on', s.data_type !== 'SALES');
      viewRow.children[1].classList.toggle('on', s.data_type === 'SALES');
      var canisterCost = SP.gasInputs(c, s.gas_type)[0];
      lines.forEach(function (line, i) {
        var o = monthOuts[i]; if (!o) return;
        var u = num(unitsOf(s, line));
        var res = SP.electricMonth(num(line[3]), u, planned, split);
        [[o.ep, res[0]], [o.es, res[1]], [o.eo, res[2]]].forEach(function (p) {
          var v = p[0].lastChild; v.textContent = cash(p[1]); v.classList.toggle('neg', p[1] != null && p[1] < 0);
        });
        var gc = num(s.gas_history[i]);
        var gm = SP.gasMonth(gc, u, r.gas_minute);
        var surplus = gm[1];
        if (isMetered) surplus = gc > 0 && plannedGas > 0 ? buffered - gc : null;
        o.gp.lastChild.textContent = cash(gm[0]);
        o.gs.lastChild.textContent = cash(surplus);
        o.gs.lastChild.classList.toggle('neg', surplus != null && surplus < 0);
        if (o.gb) {
          var left2 = gc > 0 && plannedGas > 0 ? plannedGas - gc : null;
          o.gb.lastChild.textContent = cash(left2);
          o.gb.lastChild.classList.toggle('neg', left2 != null && left2 < 0);
        }
      });
      var staffDay = (s.staff || []).filter(function (p) { return String(p[0] || '').trim(); })
        .reduce(function (a, p) { return a + num(p[1]); }, 0);
      var elecDay = days ? bill / days : 0, gasDay = days ? canisterCost / days : 0;
      setOut('sum_rent', SP.money(rentDay)); setOut('sum_elec', SP.money(elecDay));
      setOut('sum_gas', SP.money(gasDay)); setOut('sum_staff', SP.money(staffDay));
      setOut('sum_total', SP.money(rentDay + elecDay + gasDay + staffDay));
      gasRows();
    }
    function E4(v) { return SP.SYMBOL + SP.commas(v, 4); }

    // ---- per day: every cost added up, so it sits at the bottom
    var day = card('COST PER DAY');
    out(day, 'RENT COST PER DAY', 'sum_rent');
    out(day, 'ELECTRICITY COST PER DAY', 'sum_elec');
    out(day, 'GAS COST PER DAY', 'sum_gas');
    out(day, 'STAFF COST PER DAY', 'sum_staff');
    out(day, 'GRAND TOTAL PER DAY', 'sum_total', true);

    drawStaff = staffEditor(staffBox, function () { if (outs.sum_staff) refresh(); });
    drawStaff();
    drawMonths();
    refreshers.master = function () {
      monthRollover();
      drawStaff();
      inputs.forEach(function (x) { if (document.activeElement !== x.input) x.input.value = x.get() || ''; });
      drawMonths(); refresh();
    };
    return page;
  };

  // ---------------------------------------------------------------- STAFF WAGES
  // one staff list, used on the STAFF page and inside MASTER COSTINGS
  function staffEditor(parent, changed) {
    var s = data.settings;
    var daysNote = el('div', 'note red', 'Please fill in WORKING DAYS PER MONTH in Master Costings, so the daily wage can be worked out.');
    parent.appendChild(daysNote); daysNote.hidden = true;
    var list = el('div', 'staff'); parent.appendChild(list);
    var add = el('button', 'soft wide addstaff', '+ ADD STAFF'); parent.appendChild(add);
    var rates = [];
    function plain(v) { var n = num(v); return n ? String(n) : String(v || '').trim(); }
    function rateNow() {
      SP.setUnits(s);
      derive(s);
      rates.forEach(function (r) {
        var has = num(r[0][1]) > 0;
        r[2].textContent = has ? SP.money(num(r[0][1])) : '';
        r[1].textContent = has ? SP.money(SP.hourlyRate(num(r[0][1]))) : '';
      });
      if (daysNote) daysNote.hidden = num(s.costs.work_days) > 0 || !(s.staff || []).some(function (p) { return num(p[2]) > 0; });
      if (changed) changed();
    }
    function draw() {
      list.innerHTML = ''; rates = [];
      s.staff = s.staff || [];
      if (!s.staff.length) s.staff.push(['', '', '']);
      s.staff.forEach(function (p, i) {
        while (p.length < 3) p.push('');
        var box = el('div', 'person');
        var head = el('div', 'personhead');
        var name = el('input', 'cream name'); name.placeholder = 'STAFF NAME'; name.value = p[0];
        name.oninput = function () { p[0] = name.value; save(); rateNow(); };
        head.appendChild(name);
        var del = el('button', 'del', '\u2715'); del.setAttribute('aria-label', 'Remove');
        del.onclick = function () {
          notice('REMOVE STAFF', ['Remove ' + (p[0] || 'this line') + '?'], ['REMOVE', 'CANCEL']).then(function (a) {
            if (a !== 0) return; s.staff.splice(i, 1); save(); draw(); });
        };
        head.appendChild(del); box.appendChild(head);
        var grid = el('div', 'wages');
        [['MONTHLY WAGE', 2]].forEach(function (w) {
          var cell = el('label', 'wage');
          cell.appendChild(el('span', 'lbl', w[0]));
          var input = el('input', 'cream'); input.inputMode = 'decimal';
          var show = function () { input.value = num(p[w[1]]) ? SP.money(num(p[w[1]])) : (p[w[1]] || ''); };
          show();
          input.onfocus = function () { input.value = plain(p[w[1]]); };
          input.onblur = show;
          input.oninput = function () { p[w[1]] = plain(input.value); save(); rateNow(); };
          cell.appendChild(input); grid.appendChild(cell);
        });
        var dayCell = el('div', 'wage');
        dayCell.appendChild(el('span', 'lbl', 'DAILY WAGE'));
        var daily = el('span', 'calc'); dayCell.appendChild(daily); grid.appendChild(dayCell);
        var rateCell = el('div', 'wage');
        rateCell.appendChild(el('span', 'lbl', 'HOURLY RATE'));
        var rate = el('span', 'calc'); rateCell.appendChild(rate); grid.appendChild(rateCell);
        rates.push([p, rate, daily]);
        box.appendChild(grid); list.appendChild(box);
      });
      rateNow();
    }
    add.onclick = function () {
      s.staff.push(['', '', '']); save(); draw();
      var names = list.querySelectorAll('input.name'); names[names.length - 1].focus();
    };
    var api = function () {
      s.staff = (s.staff || []).filter(function (p, i, all) {
        return String(p[0] || '').trim() || String(p[1] || '').trim() || String(p[2] || '').trim() || i === all.length - 1;
      });
      draw();
    };
    api.update = rateNow;
    return api;
  }

  builders.stafflist = function () {
    var s = data.settings;
    var page = pageTop('STAFF WAGES');
    guideButton(page, 'stafflist');
    page.appendChild(el('div', 'note', 'Type each member of staff and their monthly wage. ' +
      'The daily wage is the monthly wage \u00f7 your working days, and the hourly rate is the daily wage \u00f7 8.'));
    var holder = el('div'); page.appendChild(holder);
    var total = el('div', 'card'); total.setAttribute('data-guide', 'STAFF TOTAL'); page.appendChild(total);
    function sums() {
      var named = (s.staff || []).filter(function (p) { return String(p[0] || '').trim(); });
      total.innerHTML = '';
      var row = el('div', 'row'); row.appendChild(el('span', 'lbl', 'STAFF COST PER DAY (' + named.length + ' STAFF)'));
      row.appendChild(el('span', 'calc strong', SP.money(named.reduce(function (a, p) { return a + num(p[1]); }, 0))));
      total.appendChild(row);
    }
    refreshers.stafflist = staffEditor(holder, sums);
    return page;
  };

  // ---------------------------------------------------------------- INGREDIENTS HISTORY HELPERS
  // the same rules as the desktop: a price is logged when it is new or has changed
  function costWhen() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function historyLine(name, price, when) {
    when = when || new Date();
    return [name, num(price) > 0 ? String(num(price)) : '', SP.FULL_MONTHS[when.getMonth()],
            String(when.getFullYear()), iso(when), '1'];
  }
  function lastPrice(history, name) {
    var w = String(name).trim().toLowerCase();
    for (var i = 0; i < history.length; i++)
      if (String(history[i][0]).trim().toLowerCase() === w && num(history[i][1]) > 0) return history[i][1];
    return '';
  }
  function inHistory(history, name) {
    var w = String(name).trim().toLowerCase();
    return history.some(function (l) { return String(l[0]).trim().toLowerCase() === w; });
  }
  function logPrice(history, name, price, when) {
    var w = String(name).trim().toLowerCase();
    var newest = null;
    for (var i = 0; i < history.length; i++) if (String(history[i][0]).trim().toLowerCase() === w) { newest = history[i]; break; }
    if (num(price) <= 0) { if (!newest) history.unshift(historyLine(name, '', when)); return; }
    if (newest && num(newest[1]) <= 0) {
      var fresh = historyLine(name, price, when);
      for (var k = 1; k < fresh.length; k++) newest[k] = fresh[k];
      history.splice(history.indexOf(newest), 1); history.unshift(newest); return;
    }
    if (num(lastPrice(history, name)) === num(price)) return;
    history.unshift(historyLine(name, price, when));
  }
  function addCheck(text, name) {
    var names = String(text || '').split(', ').filter(Boolean);
    if (names.indexOf(name.toUpperCase()) < 0) names.push(name.toUpperCase());
    return names.join(', ');
  }
  function tidyPrice(t) {
    t = String(t).trim();
    if (t.indexOf('.') >= 0 && t.split('.')[1].length > 2 && num(t)) return num(t).toFixed(2);
    return t;
  }
  function closeMatch(word, choices) {          // like Python difflib, cutoff 0.8
    function ratio(a, b) {
      function m(a, b) {
        if (!a.length || !b.length) return 0;
        var best = 0, bi = 0, bj = 0;
        for (var i = 0; i < a.length; i++) for (var j = 0; j < b.length; j++) {
          var k = 0; while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
          if (k > best) { best = k; bi = i; bj = j; }
        }
        if (!best) return 0;
        return best + m(a.slice(0, bi), b.slice(0, bj)) + m(a.slice(bi + best), b.slice(bj + best));
      }
      return 2 * m(a, b) / (a.length + b.length);
    }
    var top = null, score = 0.8;
    choices.forEach(function (c) { var r = ratio(word, c); if (r >= score) { score = r; top = c; } });
    return top;
  }
  var sessionUpdates = [];

  // ---------------------------------------------------------------- RECIPE
  function recipeNow() {
    if (!data.recipes.length) data.recipes.push(SP.blankRecipe());
    if (data.current == null || data.current >= data.recipes.length) data.current = 0;
    var r = data.recipes[data.current];
    r.costs = Object.assign(SP.recipeCosts(), r.costs || {});
    r.rows = r.rows || []; r.labour = r.labour || [];
    while (r.labour.length < 4) r.labour.push(['', '', '']);
    return r;
  }
  function nameTaken(name) {
    return data.recipes.some(function (r) { return String(r.recipe_name).trim().toUpperCase() === name.toUpperCase(); });
  }
  function newRecipe() {
    if (data.settings.guide_addrecipe !== 'SEEN') {
      data.settings.guide_addrecipe = 'SEEN'; save();
      runTour(ADD_TOUR, function () { return null; }, newRecipeBox, ' ', newRecipeBox);
      return;
    }
    newRecipeBox();
  }
  var ADD_TOUR = [
    ['', 'ADD A RECIPE', ['Enter the name of your recipe.', 'Your new recipe sheet then opens, ready for your ingredients.']]
  ];
  function newRecipeBox() {
    ask('ADD NEW RECIPE', ['Type the name of the recipe'], 'RECIPE NAME').then(function (name) {
      name = String(name || '').trim();
      if (!name) return;
      if (nameTaken(name)) { notice('NOTICE', ['RECIPE ALREADY EXISTS.']); return; }
      var r = SP.blankRecipe(); r.recipe_name = name.toUpperCase();
      data.recipes.push(r); data.current = data.recipes.length - 1; save();
      if (screens.recipe) refreshers.recipe();
      show('recipe');
      notice('RECIPE CREATED', ["'" + name.toUpperCase() + "' CREATED SUCCESSFULLY."]);
    });
  }

  builders.recipe = function () {
    var s = data.settings;
    var page = pageTop('RECIPE');
    guideButton(page, 'recipe');
    var outs = {}, ingList, labourBox;

    // ---- which recipe
    var top = el('div', 'card'); top.setAttribute('data-guide', 'RECIPE TOP');
    var nameRow = el('label', 'row'); nameRow.appendChild(el('span', 'lbl', 'RECIPE FOR'));
    var nameIn = el('input', 'cream name'); nameIn.style.width = '62%'; nameIn.style.maxWidth = 'none';
    nameIn.oninput = function () { recipeNow().recipe_name = nameIn.value.toUpperCase(); save(); };
    nameIn.onblur = function () { nameIn.value = recipeNow().recipe_name; fillPicker(); };
    nameRow.appendChild(nameIn); top.appendChild(nameRow);
    var pickRow = el('label', 'row'); pickRow.appendChild(el('span', 'lbl', 'SELECT RECIPE'));
    var picker = el('select', 'cream'); picker.setAttribute('data-names', ''); picker.style.width = '62%'; picker.style.maxWidth = 'none';
    picker.onchange = function () { save(); data.current = parseInt(picker.value, 10); save(); refreshers.recipe(); window.scrollTo(0, 0); };
    pickRow.appendChild(picker); top.appendChild(pickRow);
    var tb = el('div', 'btnrow');
    var addBtn = el('button', 'soft', '+ ADD RECIPE'); addBtn.onclick = addChoice; tb.appendChild(addBtn);
    var howBtn = el('button', 'soft howbtn', 'HOW TO MAKE IT \u2605'); howBtn.onclick = function () { save(); show('method'); }; tb.appendChild(howBtn);
    var sendBtn = el('button', 'soft', 'SEND TO MY COMPUTER'); sendBtn.onclick = function () { save(); sendRecipes([recipeNow()]); }; tb.appendChild(sendBtn);
    top.appendChild(tb);
    page.appendChild(top);
    function fillPicker() {
      picker.innerHTML = '';
      data.recipes.forEach(function (r, i) {
        var o = el('option', '', r.recipe_name || '(NO NAME)'); o.value = i; picker.appendChild(o);
      });
      picker.value = data.current;
    }

    var bound = [];          // inputs tied to the recipe, refilled when another recipe opens
    var HEADCOL = { 'PRODUCT': '#185451', 'INGREDIENTS': '#185451', 'LABOUR': '#59445F', 'ELECTRIC': '#37566E', 'GAS': '#37566E',
                    'PACKAGING': '#4A433C', 'RENT': '#4A433C', 'COST & SELLING PRICE': '#20364D' };
    function card(title) {
      var b = el('div', 'card');
      if (title) {
        var h = el('div', 'cardhead rhead', title); if (HEADCOL[title]) h.style.background = HEADCOL[title];
        b.appendChild(h); b.setAttribute('data-guide', title);
      }
      page.appendChild(b); return b;
    }
    jumpBox(page, Object.keys(HEADCOL).map(function (t) { return [t, t, HEADCOL[t]]; }));
    function inRow(box, label, get, set, opts) {
      opts = opts || {};
      var row = el('label', 'row'); row.appendChild(el('span', 'lbl', label));
      var input = el('input', 'cream'); input.inputMode = opts.text ? 'text' : 'decimal';
      input.oninput = function () { set(input.value); save(); calc(); };
      row.appendChild(input);
      if (opts.suffix) row.appendChild(el('span', 'suffix', opts.suffix));
      box.appendChild(row); bound.push({ input: input, get: get });
      return row;
    }
    function costRow(box, label, key, opts) {
      return inRow(box, label, function () { return recipeNow().costs[key] || ''; },
                   function (v) { recipeNow().costs[key] = v; }, opts);
    }
    function outRow(box, label, key, strong) {
      var row = el('div', 'row'); row.appendChild(el('span', 'lbl', label));
      var v = el('span', 'calc' + (strong ? ' strong' : '')); row.appendChild(v); box.appendChild(row);
      outs[key] = v; return row;
    }
    function pickRow2(box, label, values, get, set) {
      var row = el('label', 'row'); row.appendChild(el('span', 'lbl', label));
      var sel = el('select', 'cream');
      sel.onchange = function () { set(sel.value); save(); calc(); };
      row.appendChild(sel); box.appendChild(row);
      bound.push({ input: sel, get: get, values: values });
      return row;
    }
    function setOptions(sel, values) {
      var want = typeof values === 'function' ? values() : values;
      var have = Array.prototype.map.call(sel.options, function (o) { return o.value; }).join('|');
      if (have === want.map(function (v) { return v[0]; }).join('|')) return;
      sel.innerHTML = '';
      want.forEach(function (v) { var o = el('option', '', v[1]); o.value = v[0]; sel.appendChild(o); });
    }

    // ---- product
    var prod = card('PRODUCT');
    pickRow2(prod, 'PRODUCT MADE BY UNITS OR GRAMS', function () {
      return SP.US ? [['UNITS', 'UNITS'], ['GRAMS', 'OZ'], ['LB', 'LB']] : [['UNITS', 'UNITS'], ['GRAMS', 'GRAMS']];
    }, function () { return recipeNow().made_by || 'UNITS'; }, function (v) { recipeNow().made_by = v; });
    prod.appendChild(el('div', 'note', 'WE RECOMMEND YOU ADD YOUR INGREDIENTS FIRST, SO YOU CAN GET YOUR BATCH SIZE'));
    var weightIn = inRow(prod, 'TOTAL WEIGHT OF YOUR INGREDIENTS (USABLE)', function () { return recipeNow().total_weight || ''; },
                         function (v) { recipeNow().total_weight = v; });
    var batchIn = inRow(prod, 'BATCH SIZE', function () { return recipeNow().batch_size; }, function (v) { recipeNow().batch_size = v; });
    var sizeIn = inRow(prod, 'PRODUCT SIZE', function () { return recipeNow().product_size; }, function (v) { recipeNow().product_size = v; });
    var totIn = inRow(prod, 'TOTAL PRODUCTS', function () { return recipeNow().total_products || ''; },
                      function (v) { recipeNow().total_products = v; });
    // a change the chef makes to the batch counts as production for today (as the desktop)
    [weightIn, batchIn, sizeIn, totIn].forEach(function (row) {
      var inp = row.querySelector('input'); if (inp) inp.addEventListener('change', function () { productionMade(recipeNow()); });
    });
    var madeSel = prod.querySelector('select'); if (madeSel) madeSel.addEventListener('change', function () { productionMade(recipeNow()); });
    var again = el('button', 'jump', '\u2714  WE MADE ANOTHER BATCH TODAY');
    again.onclick = function () { save(); addBatch(recipeNow()); };
    prod.appendChild(again);
    outRow(prod, 'COST PER PORTION INGREDIENTS', 'portion');

    // ---- ingredients
    var ing = card('INGREDIENTS');
    // the price reminder, only for a recipe read from a photo (as the desktop)
    var remind = el('div', 'remind'); remind.hidden = true;
    remind.appendChild(el('div', 'remindhead', 'PRICE REMINDER'));
    var remindWords = el('div', 'remindwords'); remind.appendChild(remindWords);
    var never = el('button', 'remindnever', '\u2610  Don\'t show me again');
    never.onclick = function () {
      data.settings['hide_price_' + remind.kind] = 'YES'; save(); calc();
    };
    remind.appendChild(never); ing.appendChild(remind);
    var noPrice = el('div', 'note red'); noPrice.hidden = true; ing.appendChild(noPrice);
    ingList = el('div', 'ings'); ing.appendChild(ingList);
    var addIng = el('div', 'btnrow'); var addIngBtn = el('button', 'soft', '+ ADD INGREDIENT');
    addIngBtn.onclick = function () {
      recipeNow().rows.push(['', '', '', '']); save(); drawIngredients();
      var names = ingList.querySelectorAll('input.ingname'); names[names.length - 1].focus();
    };
    addIng.appendChild(addIngBtn); ing.appendChild(addIng);
    outRow(ing, 'SUB TOTAL', 'sub');
    var vatRow = outRow(ing, 'VAT', 'vat');
    outRow(ing, 'TOTAL', 'total', true);

    var ingOuts = [];
    function drawIngredients() {
      ingList.innerHTML = ''; ingOuts = [];
      var r = recipeNow();
      if (!r.rows.length) r.rows.push(['', '', '', '']);
      r.rows.forEach(function (row, i) {
        while (row.length < 4) row.push('');
        if (row[4] == null) row[4] = wastePct(row);
        var box = el('div', 'ing');
        var head = el('div', 'inghead');
        head.appendChild(el('span', 'ingno', String(i + 1)));
        var name = el('input', 'cream ingname'); name.placeholder = 'INGREDIENT'; name.value = row[0];
        name.autocomplete = 'off';
        var watch = { row: row, wasName: '', wasPrice: '' };
        name.onfocus = function () { watch.wasName = inHistory(data.ingredient_history, name.value) ? name.value.trim() : ''; };
        name.oninput = function () { row[0] = name.value; save(); suggest(watch, name, price); typedPrice(watch, price); calc(); };
        name.onblur = function () { setTimeout(function () { hideSuggest(); nameLeft(watch, name, price); }, 180); };
        head.appendChild(name);
        var del = el('button', 'del', '✕'); del.setAttribute('aria-label', 'Remove ingredient');
        del.onclick = function () {
          notice('REMOVE INGREDIENT', ['Remove ' + (row[0] || 'this line') + ' from this recipe?'], ['REMOVE', 'CANCEL'])
            .then(function (a) { if (a !== 0) return; r.rows.splice(i, 1); save(); drawIngredients(); calc(); });
        };
        head.appendChild(del); box.appendChild(head);
        var grid = el('div', 'inggrid');
        function cell(label, value, set, cls) {
          var c2 = el('label', 'wage'); c2.appendChild(el('span', 'lbl', label));
          var input = el('input', 'cream' + (cls ? ' ' + cls : '')); input.inputMode = 'decimal'; input.value = value;
          input.oninput = function () { set(input.value); save(); calc(); };
          c2.appendChild(input); grid.appendChild(c2); return input;
        }
        cell(SP.US ? 'QUANTITY (oz)' : 'QUANTITY (g)', row[1], function (v) { row[1] = v; wasteGrams(row); });
        var price = cell('UNIT PRICE ' + (SP.US ? 'PER LB' : 'PER KILO'), tidyPrice(row[2]), function (v) { row[2] = v; watch.pulled = null; });
        price.onfocus = function () { watch.wasPrice = price.value; };
        price.onblur = function () { setTimeout(function () { priceLeft(watch, price); }, 60); };
        cell('WASTE %', wastePct(row), function (v) { row[4] = String(v).replace('%', '').trim(); wasteGrams(row); });
        box.appendChild(grid);
        var o = el('div', 'ingouts');
        function small(label, cls) { var d = el('div', 'mini' + (cls ? ' ' + cls : '')); d.appendChild(el('span', '', label)); var v = el('b', ''); d.appendChild(v); o.appendChild(d); return v; }
        var outsRow = { gross: small('GROSS COST'), nett: small(SP.US ? 'YIELD (oz)' : 'YIELD (g)'),
                        kilo: small('NET COST ' + (SP.US ? 'PER LB' : 'PER KILO')), total: small('TOTAL COST', 'netcost') };
        box.appendChild(o);
        ingOuts.push(outsRow);
        ingList.appendChild(box);
      });
    }

    // the type-ahead list of ingredients already in the history
    var list = el('div', 'suggest'); list.hidden = true; document.body.appendChild(list);
    function hideSuggest() { list.hidden = true; }
    function suggest(watch, box, price) {
      var text = box.value.trim().toLowerCase();
      if (text.length < 2) return hideSuggest();
      var seen = {}, starts = [], inside = [];
      data.ingredient_history.forEach(function (l) {
        var n = String(l[0]).trim(), k = n.toLowerCase();
        if (!n || seen[k]) return; seen[k] = 1;
        if (k.indexOf(text) === 0) starts.push(n); else if (k.indexOf(text) > 0) inside.push(n);
      });
      var byName = function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; };
      var found = starts.sort(byName).concat(inside.sort(byName)).slice(0, 8);
      if (!found.length || (found.length === 1 && found[0].toLowerCase() === text)) return hideSuggest();
      list.innerHTML = '';
      found.forEach(function (n) {
        var p = lastPrice(data.ingredient_history, n);
        var item = el('button', 'suggestitem');
        item.appendChild(el('span', '', n));
        if (p) item.appendChild(el('b', '', SP.money(num(p))));
        item.onpointerdown = function (e) {
          e.preventDefault();
          box.value = n; watch.row[0] = n; hideSuggest(); typedPrice(watch, price); save(); calc();
          box.blur();
        };
        list.appendChild(item);
      });
      var r = box.getBoundingClientRect();
      list.style.left = (r.left + window.scrollX) + 'px';
      list.style.top = (r.bottom + window.scrollY + 4) + 'px';
      list.style.width = Math.max(r.width, 280) + 'px';
      list.hidden = false;
    }
    // as soon as the name matches the history, its last price fills in
    function typedPrice(watch, price) {
      var p = lastPrice(data.ingredient_history, watch.row[0]);
      if (!p) p = priceInRecipes(watch.row[0]);
      if (p && price.value !== tidyPrice(p) && (num(price.value) === 0 || num(price.value) === num(watch.pulled))) {
        price.value = tidyPrice(p); watch.row[2] = price.value; watch.wasPrice = price.value; watch.pulled = price.value; save();
      }
    }
    function priceInRecipes(name) {
      var w = String(name).trim().toLowerCase(); if (!w) return '';
      for (var i = 0; i < data.recipes.length; i++) {
        var rows = data.recipes[i].rows || [];
        for (var j = 0; j < rows.length; j++)
          if (String(rows[j][0]).trim().toLowerCase() === w && num(rows[j][2]) > 0) return rows[j][2];
      }
      return '';
    }

    var asking = false;
    function nameLeft(watch, box, price) {
      var name = box.value.trim();
      if (asking || name === watch.wasName) return;
      watch.wasName = name;
      if (!name) { price.value = ''; watch.row[2] = ''; save(); calc(); return; }
      var history = data.ingredient_history;
      var known = {};
      history.forEach(function (l) { var k = String(l[0]).trim().toLowerCase(); if (!(k in known)) known[k] = String(l[0]).trim(); });
      asking = true;
      var step = Promise.resolve();
      if (!(name.toLowerCase() in known)) {
        var close = closeMatch(name.toLowerCase(), Object.keys(known));
        if (close) step = notice('NOTICE', ["Did you mean '" + known[close] + "'", "instead of '" + name + "'?"], ['YES', 'NO'])
          .then(function (a) { if (a === 0) { name = known[close]; box.value = name; watch.row[0] = name; watch.wasName = name; save(); } });
      }
      step.then(function () {
        var same = recipeNow().rows.filter(function (r) { return r !== watch.row && String(r[0]).trim().toLowerCase() === name.toLowerCase(); });
        if (!same.length) return true;
        return notice('NOTICE', ["'" + name + "' already exists", 'in this recipe.', '', 'Keep duplicate?'], ['YES', 'NO'])
          .then(function (a) { if (a !== 0) { box.value = ''; watch.row[0] = ''; watch.wasName = ''; save(); return false; } return true; });
      }).then(function (go) {
        if (!go) return false;
        if (inHistory(history, name)) return true;
        return notice('NOTICE', ["New ingredient detected: '" + name + "'", '', 'Add to Ingredient History?'], ['YES', 'NO'])
          .then(function (a) {
            if (a !== 0) { box.value = ''; watch.row[0] = ''; watch.wasName = ''; save(); return false; }
            logPrice(history, name, price.value, costWhen()); save(); return true;
          });
      }).then(function (go) {
        if (go) {
          var p = lastPrice(history, name);
          if (p && !num(price.value)) { price.value = tidyPrice(p); watch.row[2] = price.value; watch.wasPrice = price.value; save(); }
        }
        asking = false; calc();
      });
    }
    function priceLeft(watch, price) {
      var name = String(watch.row[0]).trim();
      var neu = num(price.value), old = num(watch.wasPrice);
      if (asking || !name || neu <= 0 || neu === old) return;
      var history = data.ingredient_history;
      if (old <= 0) {
        if (num(lastPrice(history, name))) { watch.wasPrice = price.value; logPrice(history, name, neu, costWhen()); save(); return; }
        asking = true;
        notice('NEW INGREDIENT PRICE', [name.toUpperCase(), SP.money(neu) + (SP.US ? '  A LB' : '  A KILO'), '',
          'Click OK to add it to the ingredient history.'], ['OK', 'CANCEL']).then(function (a) {
          asking = false;
          if (a !== 0) { price.value = ''; watch.row[2] = ''; save(); calc(); return; }
          watch.wasPrice = price.value; logPrice(history, name, neu, costWhen()); save();
        });
        return;
      }
      var current = data.current;
      var others = data.recipes.filter(function (r, i) {
        return i !== current && (r.rows || []).some(function (x) { return String(x[0]).trim().toLowerCase() === name.toLowerCase(); });
      });
      var lines = [name.toUpperCase(), SP.money(old) + '   to   ' + SP.money(neu) + (SP.US ? '  A LB' : '  A KILO'), ''];
      if (others.length) {
        var names = others.map(function (r) { return r.recipe_name; });
        lines.push('Also used in ' + others.length + ' other recipe' + (others.length > 1 ? 's:' : ':'),
                   names.slice(0, 8).join(', ') + (names.length > 8 ? ' ...' : ''), '');
      }
      lines.push('Click OK to update the ingredient history', 'and ' + (others.length ? 'every recipe.' : 'this recipe.'));
      if (neu > old) lines.push('', 'These recipes will move to the TOP of the DASHBOARD', 'so you can check the selling price.');
      asking = true;
      notice('PRICE UPDATED', lines, ['OK', 'CANCEL']).then(function (a) {
        if (a !== 0) { price.value = watch.wasPrice; watch.row[2] = price.value; save(); calc(); asking = false; return; }
        watch.wasPrice = price.value;
        logPrice(history, name, neu, costWhen());
        if (sessionUpdates.indexOf(name) < 0) sessionUpdates.unshift(name);
        others.forEach(function (r) {
          r.rows.forEach(function (x) { if (String(x[0]).trim().toLowerCase() === name.toLowerCase()) x[2] = String(neu); });
          if (neu > old) { r.costs = r.costs || {}; r.costs.price_check = addCheck(r.costs.price_check, name); }
        });
        if (neu > old) recipeNow().costs.price_check = addCheck(recipeNow().costs.price_check, name);
        save(); calc();
        var all = [recipeNow().recipe_name || 'THIS RECIPE'].concat(others.map(function (r) { return r.recipe_name; }).filter(Boolean));
        var done = ['All recipes with ' + name.toUpperCase(), 'have been updated to ' + SP.money(neu) + (SP.US ? '  A LB.' : '  A KILO.'), '',
                    'Please go to your DASHBOARD and check the', 'selling price is still correct for:', ''];
        all.slice(0, 10).forEach(function (n) { done.push('•  ' + n); });
        if (all.length > 10) done.push('... and ' + (all.length - 10) + ' more');
        return notice('RECIPES UPDATED', done, ['GO TO DASHBOARD', 'OK']).then(function (b) {
          asking = false; if (b === 0) show('dashboard');
        });
      });
    }

    // ---- labour
    var lab = card('LABOUR');
    pickRow2(lab, 'MULTIPLE STAFF – HOW MANY STAFF', [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']],
             function () { return String(recipeNow().staff_count || '1'); },
             function (v) { recipeNow().staff_count = v; drawLabour(); });
    labourBox = el('div', ''); lab.appendChild(labourBox);
    outRow(lab, 'TOTAL STAFF WAGES PER HOUR', 'wage_sum');
    outRow(lab, 'TOTAL LABOUR COST PER BATCH', 'labour_batch');
    outRow(lab, 'TOTAL LABOUR COST PER SERVING', 'labour_serving', true);
    var labourOuts = [];
    function drawLabour() {
      labourBox.innerHTML = ''; labourOuts = [];
      var r = recipeNow(), count = Math.max(1, Math.min(4, Math.trunc(num(r.staff_count)) || 1));
      var names = [''].concat((s.staff || []).map(function (p) { return String(p[0] || '').trim(); }).filter(Boolean));
      for (var i = 0; i < count; i++) (function (slot) {
        var box = el('div', 'slot');
        box.appendChild(el('div', 'slothead', 'STAFF ' + (i + 1)));
        var row = el('label', 'row'); row.appendChild(el('span', 'lbl', 'STAFF'));
        var sel = el('select', 'cream'); sel.setAttribute('data-names', '');
        names.forEach(function (n) { var o = el('option', '', n || '— PICK —'); o.value = n; sel.appendChild(o); });
        if (slot[0] && names.indexOf(slot[0]) < 0) { var o2 = el('option', '', slot[0]); o2.value = slot[0]; sel.appendChild(o2); }
        sel.value = slot[0] || '';
        sel.onchange = function () { slot[0] = sel.value; save(); calc(); };
        row.appendChild(sel); box.appendChild(row);
        [['PREP HOURS', 1], ['PREP MINUTES', 2]].forEach(function (f) {
          var rr = el('label', 'row'); rr.appendChild(el('span', 'lbl', f[0]));
          var inp = el('input', 'cream'); inp.inputMode = 'decimal'; inp.value = slot[f[1]] || '';
          inp.oninput = function () { slot[f[1]] = inp.value; save(); calc(); };
          rr.appendChild(inp); box.appendChild(rr);
        });
        var o = {};
        ['WAGES PER HOUR', 'COST TO PREP'].forEach(function (t, k) {
          var rr = el('div', 'row'); rr.appendChild(el('span', 'lbl', t));
          var v = el('span', 'calc'); rr.appendChild(v); box.appendChild(rr); o[k] = v;
        });
        labourOuts.push(o); labourBox.appendChild(box);
      })(r.labour[i]);
      if (names.length === 1) labourBox.appendChild(el('div', 'note', 'Add your staff on the STAFF page first, then pick them here.'));
    }

    // ---- electric
    var elc = card('ELECTRIC');
    elc.appendChild(el('div', 'small', 'PLEASE SELECT THE MONTH. THIS GIVES YOU AN ACCURATE COSTING OF HOW MUCH EACH DISH ' +
      'COSTS AGAINST YOUR ELECTRIC BILL. ONCE YOU HAVE 12 MONTHS OF DATA, YOU CAN SELECT AVERAGE 12 MONTH COSTING.'));
    pickRow2(elc, 'SELECT MONTH FOR ELECTRIC CHARGE', function () {
      var list2 = [['', 'NEWEST MONTH']];
      (s.elec_history || []).forEach(function (l) { if (String(l[0] || '').trim()) list2.push([l[0], l[0]]); });
      list2.push([SP.AVERAGE_MONTHS, SP.AVERAGE_MONTHS]);
      return list2;
    }, function () { return recipeNow().costs.elec_month || ''; }, function (v) { recipeNow().costs.elec_month = v; });
    costRow(elc, 'ELECTRIC COOKING TIME PER BATCH – HOURS', 'elec_hours');
    costRow(elc, 'ELECTRIC COOKING TIME PER BATCH – MINUTES', 'elec_minutes');
    outRow(elc, 'MONTHLY ELECTRIC BILL', 'elec_bill');
    outRow(elc, 'TOTAL ELECTRIC COST PER MINUTE', 'elec_minute');
    outRow(elc, 'TOTAL ELECTRIC USED PER BATCH', 'elec_batch');
    outRow(elc, 'TOTAL COST PER SERVING', 'elec', true);
    outRow(elc, 'AVERAGE COST ACROSS ALL 12 MONTHS ELECTRIC', 'elec_average');

    // ---- gas
    var gs = card('GAS');
    costRow(gs, 'GAS COOKING TIME – HOURS', 'gas_hours');
    costRow(gs, 'GAS COOKING TIME – MINUTES', 'gas_minutes');
    outRow(gs, 'GAS COOKING COSTS PER HOUR', 'gas_hour');
    outRow(gs, 'GAS COOKING COSTS PER MIN', 'gas_minute');
    outRow(gs, 'GAS COOKING PER DISH', 'gas', true);

    // ---- packaging
    var pk = card('PACKAGING');
    costRow(pk, 'TOTAL COSTING OF PACKAGING', 'pack_cost');
    costRow(pk, 'TOTAL UNITS PER PACKAGING', 'pack_units');
    outRow(pk, 'PACKAGING COST PER SERVING', 'packaging', true);

    // ---- rent
    var rt = card('RENT');
    outRow(rt, 'RENT COST PER DAY', 'rent_day');
    var markupRow = costRow(rt, 'RENT FOR COOKING TIME MARK UP %', 'rent_markup', { suffix: '%' });
    outRow(rt, 'TOTAL RENT COST PER DISH', 'rent', true);

    // ---- price
    var pr = card('COST & SELLING PRICE');
    outRow(pr, 'TOTAL COST PER PORTION, INCLUDING LABOUR, GAS, ELECTRIC AND PACKAGING', 'total_portion', true);
    costRow(pr, 'SELLING PRICE', 'selling_price');
    outRow(pr, 'PROFIT MARGIN', 'margin');
    outRow(pr, 'PROFIT', 'profit');
    costRow(pr, 'SET LOWEST PROFIT MARGIN % TO TRIGGER ALERT', 'lowest_margin', { suffix: '%' });
    outRow(pr, 'LOWEST SELLING PRICE', 'min_price');
    outRow(pr, 'PROFIT DROP', 'min_profit');
    var alert = el('div', 'note'); pr.appendChild(alert);

    // waste is typed as a % of the quantity (70% of 1000 g = 700 g). The grams are kept
    // in the 4th box, as the desktop keeps them; the % is kept beside it.
    function wastePct(row) {
      if (row[4] != null && String(row[4]).trim() !== '') return row[4];
      var q = num(row[1]), w = num(row[3]);
      return q > 0 && w > 0 ? String(Math.round(w / q * 10000) / 100) : '';
    }
    function wasteGrams(row) {
      if (row[4] == null || String(row[4]).trim() === '') return;
      var pc = Math.max(0, Math.min(99.99, num(row[4])));
      var g = num(row[1]) * pc / 100;
      row[3] = g ? String(Math.round(g * 100) / 100) : '';
    }
    function put(key, text, cls) { var o = outs[key]; if (!o) return; o.textContent = text; o.classList.toggle('neg', cls === 'neg'); }
    function calc() {
      SP.setUnits(s);
      var r = recipeNow();
      r.rows.forEach(wasteGrams);
      var out = SP.costEverything(r, s);
      var m = SP.money;
      var ti = totIn.querySelector('input');             // grey = worked out; type to change it
      ti.placeholder = String(out.products_worked || 0);
      ti.onfocus = function () {
        if (!ti.value && ti.placeholder) { ti.value = ti.placeholder; recipeNow().total_products = ti.value; save(); ti.select(); }
      };
      put('portion', m(out.portion));
      var wi = weightIn.querySelector('input');          // grey = ingredients added up; type to change it
      wi.placeholder = out.weight_worked ? String(Math.round(out.weight_worked * 100) / 100) : '';
      wi.onfocus = function () {
        if (!wi.value && wi.placeholder) { wi.value = wi.placeholder; recipeNow().total_weight = wi.value; save(); wi.select(); }
      };
      var usable = out.weight;
      var bi = batchIn.querySelector('input');
      bi.placeholder = usable ? String(Math.round(usable * 100) / 100) : '';
      bi.onfocus = function () {          // tap the grey weight: it becomes a number you can change
        if (!bi.value && bi.placeholder) { bi.value = bi.placeholder; recipeNow().batch_size = bi.value; save(); calc(); bi.select(); }
      };
      ingOuts.forEach(function (o, i) {
        var row = r.rows[i] || [];
        var any = row.some(function (c) { return String(c || '').trim(); });
        var l = out.lines[i] || [0, 0, 0, 0, 0];
        o.gross.textContent = any ? m(l[0]) : '';
        o.nett.textContent = any ? (SP.US ? SP.commas(l[1], 2) : SP.commas(Math.round(l[1]), 0)) : '';
        o.kilo.textContent = any ? m(l[2]) : '';
        o.total.textContent = any ? m(l[4]) : '';
      });
      put('sub', m(out.sub)); vatRow.firstChild.textContent = 'VAT AT ' + (out.vat_percent || 0) + '%';
      put('vat', m(out.vat)); put('total', m(out.total));
      var missing = r.rows.filter(function (x) { return String(x[0] || '').trim() && num(x[2]) <= 0; }).length;
      var fromPhoto = photoRecipes[data.current];
      remind.kind = missing ? 'add' : 'check';
      var words = !fromPhoto ? '' : missing ? 'Please Update Prices, to compleate your recipe costing'
        : fromPhoto.prices ? 'If one of your ingredients has had a price increase, please update the price in your recipe. ' +
          'This could affect other recipes with the same ingredients.' : '';
      if (words && data.settings['hide_price_' + remind.kind] === 'YES') words = '';
      remindWords.textContent = words; remind.hidden = !words;
      noPrice.hidden = !missing;
      noPrice.textContent = missing > 1 ? missing + ' INGREDIENTS HAVE NO PRICE' : '1 INGREDIENT HAS NO PRICE';
      labourOuts.forEach(function (o, i) {
        var named = String(r.labour[i][0] || '').trim();
        o[0].textContent = named ? m(out.used[i] ? out.used[i][0] : 0) : '';
        o[1].textContent = named && out.preps[i] != null ? m(out.preps[i]) : '';
      });
      put('wage_sum', m(out.wage_sum)); put('labour_batch', m(SP.excelRound(out.labour_batch)));
      put('labour_serving', m(out.labour_serving));
      put('elec_bill', m(out.elec_bill)); put('elec_minute', m(out.elec_minute));
      put('elec_batch', m(out.elec_batch)); put('elec', m(out.elec)); put('elec_average', m(out.elec_average));
      put('gas_hour', m(out.gas_minute * 60)); put('gas_minute', m(out.gas_minute)); put('gas', m(out.gas));
      put('packaging', m(out.packaging));
      put('rent_day', m(out.rent_day));
      put('rent', s.rent_method === 'NONE' ? 'NOT USED' : m(out.rent));
      markupRow.hidden = !!s.rent_method && s.rent_method !== 'MARKUP';
      put('total_portion', m(out.total_portion));
      put('margin', out.price ? (out.margin * 100).toFixed(2) + '%' : '', out.alert ? 'neg' : '');
      put('profit', out.price ? m(out.profit) : '');
      put('min_price', m(out.min_price));
      put('min_profit', out.min_price ? m(out.min_price - out.total_portion) : '');
      var check = r.costs.price_check;
      var warn = out.alert ? 'RECIPE PRICE NEED AMENDING' :
        (check ? 'INGREDIENT PRICE CHANGED: ' + check + ' – CHECK SELLING PRICE ON THE DASHBOARD' : '');
      alert.textContent = warn || 'NO ALERTS'; alert.classList.toggle('red', !!warn);
    }

    page.querySelector('.bar .barbtn:nth-child(2)').addEventListener('click', function () {
      var f = photoRecipes[data.current]; if (f) { f.prices = false; calc(); }   // SAVE answers the check
    });
    refreshers.recipe = function () {
      var r = recipeNow();
      SP.setUnits(s);
      fillPicker();
      if (document.activeElement !== nameIn) nameIn.value = r.recipe_name;
      bound.forEach(function (b) {
        if (b.values) setOptions(b.input, b.values);
        if (document.activeElement !== b.input) b.input.value = b.get() || '';
      });
      drawIngredients(); drawLabour(); calc();
      productsSeen = Math.floor(SP.costEverything(r, s).products + 1e-9);
    };
    return page;
  };

  // ---------------------------------------------------------------- DASHBOARD
  function openRecipe(i) { data.current = i; save(); if (screens.recipe) refreshers.recipe(); show('recipe'); }
  function copyRecipe() {
    var src = data.recipes[data.current];
    if (!src) return;
    ask('NAME OF THE COPY', ['Type the name of the new recipe'], 'RECIPE NAME').then(function (name) {
      name = String(name || '').trim();
      if (!name) return;
      if (nameTaken(name)) { notice('NOTICE', ['RECIPE ALREADY EXISTS.']); return; }
      var r = JSON.parse(JSON.stringify(src)); r.recipe_name = name.toUpperCase();
      data.recipes.push(r); save(); refreshers.dashboard();
      notice('RECIPE CREATED', ["'" + name.toUpperCase() + "' CREATED SUCCESSFULLY."]);
    });
  }
  function deleteRecipe(i) {
    var name = String(data.recipes[i].recipe_name || '(NO NAME)').toUpperCase();
    notice('DELETE RECIPE', ['Are you sure you want to DELETE the recipe:', '', name, '',
      'This will permanently delete the recipe sheet and remove it from the directory.', '',
      'THIS CANNOT BE UNDONE!'], ['OK', 'CANCEL']).then(function (a) {
      if (a !== 0) return;
      return notice('FINAL WARNING', [name, '', 'Once this has been deleted the deletion cannot be undone!'], ['OK', 'CANCEL'])
        .then(function (b) {
          if (b !== 0) return;
          data.recipes.splice(i, 1);
          if (!data.recipes.length) data.recipes.push(SP.blankRecipe());
          if (data.current >= data.recipes.length || data.current === i) data.current = 0;
          else if (data.current > i) data.current--;
          save(); redrawOpen();
        });
    });
  }
  function confirmPrice(i) {
    var r = data.recipes[i], c = r.costs, out = SP.costEverything(r, data.settings);
    var lines = [r.recipe_name, '', 'Ingredient price changed:  ' + (c.price_check || ''), '',
                 'Cost per portion now:  ' + SP.money(out.total_portion)];
    if (out.price) lines.push('Selling price:  ' + SP.money(out.price), 'Profit margin:  ' + (out.margin * 100).toFixed(2) + '%');
    lines.push('', 'Keep this selling price?', '', 'YES  =  keep it', 'NO   =  type a new price in QUICK UPDATED PRICE');
    notice('CONFIRM SELLING PRICE', lines, ['YES', 'NO']).then(function (a) {
      if (a !== 0) return; c.price_check = ''; save(); redrawOpen();
    });
  }
  function quickPrice(i, value) {
    var p = num(value); if (p <= 0) return;
    var c = data.recipes[i].costs, d = new Date();
    c.selling_price = String(p);
    c.price_updated = ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
    c.price_check = '';
    save(); redrawOpen();
    say('NEW SELLING PRICE SAVED');
  }

  // one recipe's dashboard card: used on the DASHBOARD and inside PREMIUM
  function redrawOpen() {
    Object.keys(screens).forEach(function (k) { if (!screens[k].hidden && refreshers[k]) refreshers[k](); });
  }
  function dashCard(i, withButtons) {
    var s = data.settings; SP.setUnits(s);
    var r = data.recipes[i];
    r.costs = Object.assign(SP.recipeCosts(), r.costs || {});
    var name = r.recipe_name || '(NO NAME)';
        var out = SP.costEverything(r, s), c = r.costs;
        var box = el('div', 'dash');
        box.appendChild(el('div', 'dashhead', name));
        var grid = el('div', 'dashgrid');
        function fig(label, value, cls) {
          var d = el('div', 'mini' + (cls ? ' ' + cls : '')); d.appendChild(el('span', '', label));
          d.appendChild(el('b', '', value)); grid.appendChild(d); return d;
        }
        fig('UNITS', SP.commas(out.products, 2).replace(/\.?0+$/, '') || '0');
        fig('COST PER PORTION', SP.money(out.total_portion), 'netcost');
        fig('SELLING PRICE', out.price ? SP.money(out.price) : '');
        fig('PROFIT MARGIN %', (out.margin * 100).toFixed(2) + '%');
        fig('PROFIT MARGIN', SP.money(out.profit));
        var missing = (r.rows || []).filter(function (x) { return String(x[0] || '').trim() && num(x[2]) <= 0; }).length;
        var status;
        if (c.price_check) {
          status = el('button', 'status orange', 'PRICE CHANGED ' + c.price_check + ' – CONFIRM PRICE');
          status.onclick = function () { confirmPrice(i); };
        } else if (missing) {
          status = el('div', 'status orange', missing + (missing > 1 ? ' INGREDIENTS WITH NO PRICE' : ' INGREDIENT WITH NO PRICE'));
        } else if (out.alert || !out.price) {
          status = el('div', 'status red', 'RECIPE PRICE NEED AMENDING');
        } else {
          status = el('div', 'status ok', 'MARGIN ALERT AT ' + num(c.lowest_margin) + '%');
        }
        box.appendChild(grid); box.appendChild(status);
        var q = el('div', 'quick');
        q.appendChild(el('span', 'lbl', 'ADD QUICK UPDATED PRICE'));
        var qi = el('input', 'cream'); qi.inputMode = 'decimal'; qi.placeholder = out.price ? String(out.price) : '';
        var qb = el('button', 'soft', 'SET'); qb.onclick = function () { quickPrice(i, qi.value); };
        q.appendChild(qi); q.appendChild(qb); box.appendChild(q);
        if (c.price_updated) box.appendChild(el('div', 'small', 'LAST PRICE UPDATE: ' + c.price_updated));
        if (!withButtons) return box;
        var nameKey = (r.recipe_name || '').trim().toUpperCase();
        var tickRow = el('label', 'synctick');
        var tick = el('input'); tick.type = 'checkbox'; tick.checked = !!syncTicks[nameKey];
        tick.onchange = function () { if (tick.checked) syncTicks[nameKey] = 1; else delete syncTicks[nameKey]; };
        tickRow.appendChild(tick); tickRow.appendChild(el('span', '', 'TICK TO SEND TO MY COMPUTER'));
        box.appendChild(tickRow);
        var mark = (data.settings.sync_marks || {})[nameKey];
        if (mark) {
          var ml = el('div', 'small'); ml.appendChild(el('span', '', 'LAST SENT TO COMPUTER: '));
          var mw = el('span', '', mark); mw.setAttribute('data-notr', ''); ml.appendChild(mw); box.appendChild(ml);
        }
        var btns = el('div', 'btnrow');
        var open = el('button', 'soft', 'OPEN RECIPE'); open.onclick = function () { openRecipe(i); };
        var del = el('button', 'soft danger', 'DELETE'); del.onclick = function () { deleteRecipe(i); };
        btns.appendChild(open); btns.appendChild(del); box.appendChild(btns);
    return box;
  }

  builders.dashboard = function () {
    var page = pageTop('DASHBOARD');
    guideButton(page, 'dashboard');
    var tools = el('div', 'card'); tools.setAttribute('data-guide', 'DASH TOOLS');
    var findRow = el('label', 'row'); findRow.appendChild(el('span', 'lbl', 'FIND RECIPE'));
    var find = el('input', 'cream'); find.placeholder = 'NAME'; find.oninput = function () { draw(); };
    findRow.appendChild(find); tools.appendChild(findRow);
    var tb = el('div', 'btnrow');
    [['CLEAR SEARCH', function () { find.value = ''; draw(); }], ['+ ADD RECIPE', addChoice],
     ['COPY LAST OPENED RECIPE', copyRecipe]].forEach(function (b) {
      var x = el('button', 'soft', b[0]); x.onclick = b[1]; tb.appendChild(x); });
    tools.appendChild(tb);
    var sync = el('div', 'syncrow');                 // SYNC WITH MY COMPUTER: like push mail
    sync.appendChild(el('div', 'synctitle', 'SYNC WITH MY COMPUTER'));
    var syncSaid = el('div', 'syncsaid');
    var sendT = el('button', 'gobtn syncbtn', 'SEND TICKED RECIPES');
    sendT.onclick = function () {
      var pick = data.recipes.filter(function (r) { return syncTicks[(r.recipe_name || '').trim().toUpperCase()]; });
      sendRecipes(pick, syncSaid, function () { syncTicks = {}; draw(); });
    };
    var getB = el('button', 'gobtn syncbtn', 'GET MY COMPUTER RECIPES');
    getB.onclick = function () { syncGet(syncSaid, draw); };
    sync.appendChild(sendT); sync.appendChild(getB); sync.appendChild(syncSaid);
    tools.appendChild(sync);
    page.appendChild(tools);
    var list = el('div', ''); page.appendChild(list);

    function draw() {
      var s = data.settings; SP.setUnits(s);
      list.innerHTML = '';
      var want = find.value.trim().toUpperCase();
      var order = data.recipes.map(function (r, i) { return [i, r]; }).reverse();
      order.sort(function (a, b) { return (!a[1].costs || !a[1].costs.price_check) - (!b[1].costs || !b[1].costs.price_check); });
      var shown = 0;
      order.forEach(function (pair) {
        var i = pair[0], r = pair[1];
        r.costs = Object.assign(SP.recipeCosts(), r.costs || {});
        var name = r.recipe_name || '(NO NAME)';
        if (want && name.toUpperCase().indexOf(want) < 0) return;
        shown++;
        list.appendChild(dashCard(i, true));
      });
      if (!shown) list.appendChild(el('div', 'empty', want ? 'No recipe matches that name.' : 'No recipes yet. Press + ADD RECIPE.'));
    }
    refreshers.dashboard = draw;
    return page;
  };

  // ---------------------------------------------------------------- ADD RECIPE FROM PHOTO
  var READ_URL = 'https://sharperplus.com/wp-json/sp/v1/read-app';
  var photoRecipes = {};        // recipes made from a photo this session: they get the price reminder

  function shrink(file) {          // a phone photo is big: make it 1600 wide, as the desktop does
    return new Promise(function (done, fail) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        done(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); fail(new Error('That photo could not be opened. Please try another photo.')); };
      img.src = url;
    });
  }
  function readPhoto(image) { return readPhotoWith(image, []); }
  function readPhotoWith(image, names) {       // the reader gets busy: quietly try again, like the desktop
    var busy = /high demand|overloaded|try again later|unavailable|resource exhausted|rate limit|503|429/i;
    var waits = [0, 5000, 10000, 20000];
    function attempt(n) {
      return new Promise(function (r) { setTimeout(r, waits[n]); }).then(function () {
        return fetch(READ_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                 body: JSON.stringify({ image: image, names: names || [] }) });
      }).then(function (res) { return res.json(); }, function () {
        throw new Error('No internet connection. Please check your connection and try again.');
      }).then(function (answer) {
        if (answer && answer.ok) return answer;
        var why = (answer && (answer.error || answer.message)) || 'The photo could not be read.';
        if (busy.test(why) && n < waits.length - 1) return attempt(n + 1);
        throw new Error(busy.test(why) ? 'The photo reader is very busy right now. Please wait a minute and try again.' : why);
      });
    }
    return attempt(0);
  }
  function waiting(on, head, line) {
    var w = document.getElementById('waitbox');
    if (w && on && (w.__head || '') !== (head || '')) { if (w.parentNode) w.parentNode.removeChild(w); w = null; }
    if (!w) {
      w = el('div', 'shade'); w.id = 'waitbox';
      var box = el('div', 'notice');
      w.__head = head || '';
      box.appendChild(el('div', 'notice-head', head || 'Reading your recipe...'));
      var body = el('div', 'notice-body');
      body.appendChild(el('div', 'spinner'));
      body.appendChild(el('div', '', line || 'Handwriting can take a little longer.'));
      box.appendChild(body); w.appendChild(box);
    }
    if (on) document.body.appendChild(w); else if (w.parentNode) w.parentNode.removeChild(w);
  }
  function addChoice() {          // Premium: photo (recipe, or recipe and method together) or type it in
    var shade = el('div', 'shade'), box = el('div', 'notice');
    box.appendChild(el('div', 'notice-head', 'ADD A RECIPE'));
    var body = el('div', 'notice-body');
    body.appendChild(el('div', '', 'How would you like to add your recipe?'));
    body.appendChild(el('div', '', ' '));
    body.appendChild(el('div', '', 'If your photo includes both your recipe and your method, both will be added to your Premium account.'));
    box.appendChild(body);
    var row = el('div', 'notice-btns col');
    [['\ud83d\udcf7  TAKE A PHOTO OF RECIPE', photoClicked],
     ['\u270f\ufe0f  TYPE IN A RECIPE', newRecipe],
     ['CANCEL', null]].forEach(function (b) {
      var x = el('button', 'soft', b[0]);
      x.onclick = function () { document.body.removeChild(shade); if (b[1]) b[1](); };
      row.appendChild(x); });
    box.appendChild(row); shade.appendChild(box); document.body.appendChild(shade);
  }
  function photoClicked() {
    if (data.settings.guide_photo !== 'SEEN') photoGuide(photoPopup); else photoPopup();
  }
  function photoPopup() {
    var shade = el('div', 'shade'), box = el('div', 'notice');
    box.appendChild(el('div', 'notice-head', 'ADD RECIPE FROM PHOTO'));
    var body = el('div', 'notice-body');
    body.appendChild(el('div', '', 'Take a clear photo of your recipe sheet, straight on and in good light.'));
    box.appendChild(body);
    var how = el('button', 'guidebtn', '\u2753  HOW TO TAKE A GOOD PHOTO');
    how.onclick = function () { document.body.removeChild(shade); photoGuide(photoPopup); };
    box.appendChild(how);
    var row = el('div', 'notice-btns col');
    function pick(camera) {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      if (camera) input.setAttribute('capture', 'environment');
      input.onchange = function () { if (input.files && input.files[0]) gotPhoto(input.files[0]); };
      document.body.removeChild(shade); input.click();
    }
    [['📷  TAKE PHOTO', function () { pick(true); }],
     ['🖼  CHOOSE FROM PHOTOS', function () { pick(false); }],
     ['CANCEL', function () { document.body.removeChild(shade); }]].forEach(function (b) {
      var x = el('button', 'soft', b[0]); x.onclick = b[1]; row.appendChild(x); });
    box.appendChild(row); shade.appendChild(box); document.body.appendChild(shade);
  }
  function gotPhoto(file) {
    waiting(true);
    shrink(file).then(readPhoto).then(function (answer) {
      waiting(false);
      var ings = (answer.ingredients || []).filter(function (i) { return String(i.name || '').trim(); });
      var steps = (answer.steps || []).filter(function (st) { return String(st.text || '').trim(); });
      if (!ings.length && !steps.length) {
        notice('NOTICE', ['No ingredients or method were found in that photo.', '', 'Try a clearer, brighter photo.']);
        return;
      }
      var start = String(answer.recipe || '').toUpperCase().slice(0, 60);
      askName(start).then(function (name) {
        if (!name) return;
        var r = SP.blankRecipe(); r.recipe_name = name;
        var history = data.ingredient_history;
        r.rows = ings.slice(0, 31).map(function (i) {
          var nm = String(i.name).trim();
          var g = typeof i.grams === 'number' ? String(i.grams) : (num(i.grams) ? String(num(i.grams)) : '');
          return [nm, g, tidyPrice(lastPrice(history, nm)), '', ''];
        });
        if (answer.batch) { r.batch_size = String(answer.batch); r.made_by = 'GRAMS'; }
        var names = r.rows.map(function (x) { return x[0]; });
        r.method = steps.map(function (st) {
          var uses = (st.uses || []).map(function (u) {
            var k = String(u).trim().toLowerCase();
            var hit = names.filter(function (n) { return n.toLowerCase() === k; })[0] || closeMatch(k, names.map(function (n) { return n.toLowerCase(); }));
            return hit ? names.filter(function (n) { return n.toLowerCase() === String(hit).toLowerCase(); })[0] : null;
          }).filter(function (u, i, all) { return u && all.indexOf(u) === i; });
          return { text: String(st.text || ''), minutes: String(st.minutes || ''), temp: String(st.temp || ''),
                   tip: String(st.tip || ''), uses: uses };
        });
        data.recipes.push(r); data.current = data.recipes.length - 1;
        photoRecipes[data.current] = { prices: r.rows.some(function (x) { return num(x[2]) > 0; }) };
        save();
        if (screens.recipe) refreshers.recipe();
        show('recipe');
        notice('RECIPE READ', [ings.length + ' ingredient' + (ings.length === 1 ? '' : 's') +
          (steps.length ? ' and ' + steps.length + ' method step' + (steps.length === 1 ? '' : 's') : '') + ' read from your photo.', '',
          'Please check them against your photo, then add your prices.']);
      });
    }).catch(function (err) {
      waiting(false);
      notice('THE PHOTO COULD NOT BE READ', [err.message || 'Please try again.']);
    });
  }
  function askName(start) {
    return ask('NAME OF THE NEW RECIPE', ['Check the name read from your photo'], 'RECIPE NAME', start).then(function (name) {
      if (name == null) return null;
      name = String(name).trim();
      if (!name) return null;
      name = name.toUpperCase();
      if (nameTaken(name)) { return notice('NOTICE', ['RECIPE ALREADY EXISTS.', '', 'Please pick another name.']).then(function () { return askName(name + ' 2'); }); }
      return name;
    }).then(function (n) { return n; });
  }

  // ---------------------------------------------------------------- HOW TO MAKE IT (SHARPERPLUS PREMIUM)
  function methodStep(st) {
    st = st || {};
    return { text: String(st.text || ''), minutes: String(st.minutes || ''), temp: String(st.temp || ''),
             tip: String(st.tip || ''), uses: Array.isArray(st.uses) ? st.uses.map(String) : [] };
  }
  function methodKept(steps) {
    return (steps || []).map(methodStep).filter(function (s) {
      return [s.text, s.minutes, s.temp, s.tip].some(function (v) { return v.trim(); });
    });
  }
  function methodQty(q) {
    var v = num(q); if (!v) return String(q || '').trim();
    var r = function (x, p) { return String(Math.round(x * Math.pow(10, p)) / Math.pow(10, p)); };
    if (SP.US) return v >= 16 ? r(v / 16, 2) + ' lb' : r(v, 2) + ' oz';
    return v >= 1000 ? r(v / 1000, 3) + ' kg' : r(v, 1) + ' g';
  }
  function methodMakes(r) {
    var batch = String(r.batch_size || '').trim(), size = String(r.product_size || '').trim();
    if (!batch) return '';
    if (r.made_by === 'UNITS') return 'MAKES ' + batch;
    var t = 'BATCH ' + methodQty(batch);
    if (num(size) > 1) t += '   ·   PORTION ' + methodQty(size) + '   ·   MAKES ' + (Math.round(num(batch) / num(size) * 10) / 10);
    return t;
  }
  function shareText(r, note) {
    var deg = SP.US ? '°F' : '°C';
    var lines = ['*' + String(r.recipe_name || 'RECIPE').toUpperCase() + '*'];
    var T = SPT.T, makes = T(methodMakes(r)); if (makes) lines.push(makes);
    if (note && note.trim()) lines.push('', '📌 ' + note.trim());
    var rows = (r.rows || []).filter(function (x) { return String(x[0] || '').trim(); });
    if (rows.length) {
      lines.push('', '*' + T('INGREDIENTS') + '*');
      rows.forEach(function (x) { var q = String(x[1] || '').trim() ? methodQty(x[1]) : ''; lines.push('• ' + (q ? q + '  ' : '') + String(x[0]).trim()); });
    }
    var kept = methodKept(r.method);
    if (kept.length) {
      lines.push('', '*' + T('HOW TO MAKE IT') + '*');
      kept.forEach(function (st, i) {
        lines.push((i + 1) + '. ' + st.text.split(/\s+/).join(' ').trim());
        var bits = [];
        if (st.minutes.trim()) bits.push('⏱ ' + st.minutes.trim() + ' ' + T('MIN'));
        if (st.temp.trim()) bits.push('🌡 ' + st.temp.trim() + deg);
        if (bits.length) lines.push('    ' + bits.join('  ·  '));
        if (st.tip.trim()) lines.push('    💡 ' + T('CHEF\'S TIP') + ': ' + st.tip.trim());
      });
    }
    lines.push('', T('— SENT FROM SHARPERPLUS'));
    return lines.join('\n');
  }
  // ---- translate the recipe itself (Premium): the chef's own words, into the language picked
  var TR_URL = 'https://sharperplus.com/wp-json/sp/v1/translate';
  var TR_CODES = { 'ENGLISH': 'en', 'ไทย': 'th', 'FRANÇAIS': 'fr', 'DEUTSCH': 'de', 'ITALIANO': 'it', 'ESPAÑOL': 'es', '中文': 'zh', 'עברית': 'he', 'BAHASA MELAYU': 'ms' };
  function translatedRecipe(r, lang) {          // a copy of the recipe in that language (kept, so it is only paid for once)
    var code = TR_CODES[lang]; if (!code) return Promise.resolve(r);
    var rows = (r.rows || []).filter(function (x) { return String(x[0] || '').trim(); });
    var steps = methodKept(r.method);
    var texts = [String(r.recipe_name || '')].concat(rows.map(function (x) { return String(x[0]).trim(); }),
      steps.map(function (st) { return st.text; }), steps.map(function (st) { return st.tip; }));
    var src = JSON.stringify(texts);
    r.tr = r.tr || {};
    var have = r.tr[code];
    var get = have && have.src === src ? Promise.resolve(have.out) :
      fetch(TR_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: (data.settings.licence || {}).key || '', to: code, texts: texts.map(function (t) { return t || '-'; }) }) })
        .then(function (res) { return res.json(); }, function () { throw new Error('No internet connection. Please check your connection and try again.'); })
        .then(function (a) {
          if (!a || !a.ok) { var e = new Error(a && a.error === 'premium' ? 'Translating your recipe is part of SharperPlus Premium.' : ((a && a.error) || 'The recipe could not be translated.')); e.detail = a && a.detail; throw e; }
          r.tr[code] = { src: src, out: a.texts }; save(); return a.texts;
        });
    return get.then(function (out) {
      var i = 0, name = out[i++], nameOf = {};
      var copy = JSON.parse(JSON.stringify(r)); copy.recipe_name = texts[0] ? name : copy.recipe_name;
      rows.forEach(function (x) { nameOf[String(x[0]).trim()] = out[i++]; });
      copy.rows = (copy.rows || []).map(function (x) { var k = String(x[0] || '').trim(); return k && nameOf[k] ? [nameOf[k]].concat(x.slice(1)) : x; });
      var tx = out.slice(i, i + steps.length), tp = out.slice(i + steps.length);
      copy.method = steps.map(function (st, j) {
        return Object.assign({}, st, { text: st.text ? tx[j] : '', tip: st.tip ? tp[j] : '',
          uses: st.uses.map(function (u) { return nameOf[u] || u; }) });
      });
      return copy;
    });
  }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function cardHtml(r) {          // the kitchen card, as the desktop prints it
    var deg = SP.US ? '°F' : '°C', T = SPT.T;
    var ing = (r.rows || []).filter(function (x) { return String(x[0] || '').trim(); }).map(function (x) {
      return '<tr><td class="q">' + esc(String(x[1] || '').trim() ? methodQty(x[1]) : '') + '</td><td>' + esc(x[0]) + '</td></tr>';
    }).join('');
    var steps = methodKept(r.method).map(function (st) {
      var bits = [];
      if (st.minutes.trim()) bits.push('⏱ ' + esc(st.minutes) + ' ' + esc(T('MIN')));
      if (st.temp.trim()) bits.push('🌡 ' + esc(st.temp) + deg);
      if (st.uses.length) bits.push(esc(st.uses.join(', ')));
      return '<li><div class="t">' + esc(st.text).replace(/\n/g, '<br>') + '</div>' +
        (bits.length ? '<div class="m">' + bits.join(' &nbsp;·&nbsp; ') + '</div>' : '') +
        (st.tip.trim() ? '<div class="tip">' + esc(T('CHEF\'S TIP')) + ': ' + esc(st.tip) + '</div>' : '') + '</li>';
    }).join('');
    var logo = new URL('banner-phone.png', location.href).href;
    return '<!doctype html><html translate="no" lang="' + document.documentElement.lang + '" dir="' + document.documentElement.dir + '"><head><meta charset="utf-8"><meta name="google" content="notranslate"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(r.recipe_name || 'RECIPE') + ' - KITCHEN CARD</title><style>' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Arial,Helvetica,sans-serif;margin:0;background:#f4efe6;color:#1b1b1b}' +
      '.card{max-width:900px;margin:12px auto;background:#fff;border:3px solid #1b1b1b;padding:20px 24px}' +
      '.logo{display:block;width:calc(100% + 48px);margin:-20px -24px 14px}' +
      '.top{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:8px;border-bottom:4px solid #1b1b1b;padding-bottom:8px}' +
      'h1{font-size:30px;margin:0}.mk{font-size:16px;font-weight:bold}' +
      '.grid{display:grid;grid-template-columns:1fr 2fr;gap:24px;margin-top:18px}@media (max-width:600px){.grid{grid-template-columns:1fr}}' +
      'h2{font-size:18px;margin:0 0 8px;background:#1b1b1b;color:#fff;padding:6px 10px}' +
      'table{width:100%;border-collapse:collapse;font-size:17px}td{border-bottom:1px solid #ccc;padding:6px 4px}td.q{font-weight:bold;white-space:nowrap;width:1%;padding-right:12px}' +
      'ol{margin:0;padding-left:28px;font-size:18px}li{margin:0 0 14px}li::marker{font-weight:bold}.t{line-height:1.45}' +
      '.m{font-size:14px;font-weight:bold;color:#555;margin-top:4px}.tip{margin-top:6px;font-size:15px;font-weight:bold;color:#8a4b00;border-left:4px solid #8a4b00;padding-left:8px}' +
      '.foot{margin-top:20px;border-top:2px solid #1b1b1b;padding-top:6px;font-size:13px;color:#555;display:flex;justify-content:space-between}' +
      '.btn{display:block;margin:14px auto 0;font-size:20px;font-weight:bold;padding:12px 30px}' +
      '@page{size:' + (SP.US ? 'letter' : 'A4') + ';margin:12mm}@media print{body{background:#fff}.card{margin:0;border:0;max-width:none}.btn{display:none}.grid{grid-template-columns:1fr 2fr}}' +
      '</style></head><body><button class="btn" onclick="window.print()">' + esc(T('PRINT / SAVE AS PDF')) + '</button>' +
      '<div class="card"><img class="logo" src="' + logo + '" alt="SharperPlus"><div class="top"><h1>' + esc(r.recipe_name || 'RECIPE') + '</h1><div class="mk">' + esc(T(methodMakes(r))) + '</div></div>' +
      '<div class="grid"><div><h2>' + esc(T('INGREDIENTS')) + '</h2><table>' + (ing || '<tr><td></td></tr>') + '</table></div><div><h2>' + esc(T('HOW TO MAKE IT')) + '</h2><ol>' + steps + '</ol></div></div>' +
      '<div class="foot"><span>' + esc(T('KITCHEN CARD')) + '</span><span>SharperPlus</span></div></div></body></html>';
  }

  var ticks = {};
  builders.method = function () {
    var page = pageTop('HOW TO MAKE IT');
    var badge = el('span', 'badge', '★ PREMIUM'); page.querySelector('.pagetitle').appendChild(badge);
    var top = el('div', 'card');
    var pickRowM = el('label', 'row'); pickRowM.appendChild(el('span', 'lbl', 'RECIPE'));
    var picker = el('select', 'cream'); picker.setAttribute('data-names', ''); picker.style.width = '62%'; picker.style.maxWidth = 'none';
    picker.onchange = function () { data.current = parseInt(picker.value, 10); save(); refreshers.method(); };
    pickRowM.appendChild(picker); top.appendChild(pickRowM);
    var makes = el('div', 'makes'); top.appendChild(makes);
    var tb = el('div', 'btnrow');
    var fromPhoto = el('button', 'soft', '📷 METHOD FROM PHOTO');
    var sendBtn = el('button', 'soft', '📤 SEND OR PRINT');
    tb.appendChild(fromPhoto); tb.appendChild(sendBtn); top.appendChild(tb);
    page.appendChild(top);

    var ingCard = el('div', 'card'); ingCard.appendChild(el('div', 'cardhead', 'INGREDIENTS – TICK THEM OFF AS YOU PREP'));
    var ingList = el('div', 'ticklist'); ingCard.appendChild(ingList); page.appendChild(ingCard);
    var stepCard = el('div', 'card'); stepCard.appendChild(el('div', 'cardhead', 'METHOD'));
    var stepList = el('div', ''); stepCard.appendChild(stepList);
    var addRow = el('div', 'btnrow'); var addStep = el('button', 'soft', '+ ADD STEP'); addRow.appendChild(addStep);
    stepCard.appendChild(addRow); page.appendChild(stepCard);
    // what to do next: bright until done, then faded with a small UPDATE
    var next = el('div', 'nexttab'); page.insertBefore(next, top);
    var glance = el('div', 'glance'); top.after(glance);
    function drawGlance() {
      glance.innerHTML = '';
      if (!data.recipes[data.current]) return;
      glance.appendChild(el('div', 'glancehead', 'THIS RECIPE ON YOUR DASHBOARD'));
      glance.appendChild(dashCard(data.current, false));
    }
    function drawNext() {
      next.innerHTML = '';
      var st = setupDone();
      next.appendChild(el('div', 'nexthead', '\u2605  WELCOME TO PREMIUM'));
      var gives = el('div', 'gives');
      ['Read your recipe and method from one photo',
       'A step-by-step method for your kitchen',
       'Tick off your ingredients as you prep',
       'Send it to your team by WhatsApp, LINE or email, or print it'].forEach(function (t) {
        var g = el('div', 'give'); g.appendChild(el('span', 'givetick', '\u2714')); g.appendChild(el('span', '', t)); gives.appendChild(g);
      });
      next.appendChild(gives);
      next.appendChild(el('div', 'nextwords', st.recipe && st.master && st.staff
        ? 'All set up \u2013 you are getting the most out of SharperPlus Premium.'
        : 'Now add your cooking costs, Master Costings and staff to get the most out of Premium.'));
      [['RECIPE COSTING', 'recipe', 'c-green', st.recipe],
       ['MASTER COSTINGS', 'master', 'c-blue', st.master],
       ['STAFF', 'stafflist', 'c-purple', st.staff]].forEach(function (b) {
        var go = function () { save(); show(b[1]); };
        var box = el('div', 'stepbox ' + b[2] + (b[3] ? ' done' : ''));
        if (b[3]) {
          box.appendChild(el('span', 'stepname', '\u2714  ' + b[0]));
          var up = el('button', 'upd', 'UPDATE'); up.onclick = go; box.appendChild(up);
        } else {
          var big = el('button', 'stepgo', b[0]); big.onclick = go; box.appendChild(big);
          if (b[1] === 'master' && st.recipe)
            box.appendChild(el('div', 'stepnote', 'You\u2019ve set up your recipe. Want your true prices? Go to Master Costings.'));
        }
        next.appendChild(box);
      });
      var dash = el('div', 'stepbox c-dash');
      var dgo = el('button', 'stepgo', 'DASHBOARD'); dgo.onclick = function () { save(); show('dashboard'); };
      dash.appendChild(dgo); next.appendChild(dash);
    }

    function cur() {            // tidy each step in place, so open boxes stay tied to their step
      var r = recipeNow(); r.method = r.method || [];
      r.method.forEach(function (st, i) {
        if (!st || typeof st !== 'object') { r.method[i] = methodStep(st); return; }
        var t = methodStep(st); Object.keys(t).forEach(function (k) { if (k === 'uses' ? !Array.isArray(st.uses) : typeof st[k] !== 'string') st[k] = t[k]; });
      });
      return r;
    }
    function names() { return (cur().rows || []).map(function (x) { return String(x[0] || '').trim(); }).filter(Boolean); }

    function draw() {
      var r = cur(); SP.setUnits(data.settings);
      picker.innerHTML = '';
      data.recipes.forEach(function (x, i) { var o = el('option', '', x.recipe_name || '(NO NAME)'); o.value = i; picker.appendChild(o); });
      picker.value = data.current;
      makes.textContent = methodMakes(r); makes.hidden = !makes.textContent;
      // ingredients to tick
      ingList.innerHTML = '';
      var key = 'r' + data.current; ticks[key] = ticks[key] || {};
      var rows = (r.rows || []).filter(function (x) { return String(x[0] || '').trim(); });
      if (!rows.length) ingList.appendChild(el('div', 'empty', 'No ingredients yet. Add them on the recipe page.'));
      rows.forEach(function (x) {
        var n = String(x[0]).trim();
        var b = el('button', 'tick' + (ticks[key][n] ? ' done' : ''));
        b.appendChild(el('span', 'box', ticks[key][n] ? '✔' : ''));
        b.appendChild(el('span', 'qty', String(x[1] || '').trim() ? methodQty(x[1]) : ''));
        b.appendChild(el('span', 'nm', n));
        b.onclick = function () { ticks[key][n] = !ticks[key][n]; draw(); };
        ingList.appendChild(b);
      });
      // steps
      stepList.innerHTML = '';
      if (!r.method.length) stepList.appendChild(el('div', 'empty', 'No steps yet. Press + ADD STEP, or METHOD FROM PHOTO.'));
      r.method.forEach(function (st, i) {
        var box = el('div', 'step');
        var head = el('div', 'stephead');
        head.appendChild(el('span', 'stepno', String(i + 1)));
        var up = el('button', 'mv', '▲'), dn = el('button', 'mv', '▼'), del = el('button', 'del', '✕');
        up.disabled = i === 0; dn.disabled = i === r.method.length - 1;
        up.onclick = function () { var m = r.method; m.splice(i - 1, 0, m.splice(i, 1)[0]); save(); draw(); };
        dn.onclick = function () { var m = r.method; m.splice(i + 1, 0, m.splice(i, 1)[0]); save(); draw(); };
        del.onclick = function () {
          notice('REMOVE STEP', ['Remove step ' + (i + 1) + '?'], ['REMOVE', 'CANCEL']).then(function (a) {
            if (a !== 0) return; r.method.splice(i, 1); save(); draw(); });
        };
        head.appendChild(up); head.appendChild(dn); head.appendChild(del); box.appendChild(head);
        var text = el('textarea', 'cream steptext'); text.value = st.text; text.placeholder = 'What to do in this step';
        text.oninput = function () { st.text = text.value; save(); };
        box.appendChild(text);
        var row = el('div', 'stepfields');
        [['TIME (MIN)', 'minutes'], [SP.US ? '°F' : '°C', 'temp']].forEach(function (f) {
          var l = el('label', 'wage'); l.appendChild(el('span', 'lbl', f[0]));
          var inp = el('input', 'cream'); inp.inputMode = 'decimal'; inp.value = st[f[1]];
          inp.oninput = function () { st[f[1]] = inp.value; save(); };
          l.appendChild(inp); row.appendChild(l);
        });
        var usesBtn = el('button', 'soft uses', st.uses.length ? 'USES ' + st.uses.length + ' INGREDIENT' + (st.uses.length > 1 ? 'S' : '') : 'PICK INGREDIENTS');
        usesBtn.onclick = function () { pickUses(st); };
        row.appendChild(usesBtn); box.appendChild(row);
        var tipRow = el('label', 'row tiprow'); tipRow.appendChild(el('span', 'lbl', 'CHEF\'S TIP'));
        var tip = el('input', 'cream tip'); tip.value = st.tip; tip.oninput = function () { st.tip = tip.value; save(); };
        tipRow.appendChild(tip); box.appendChild(tipRow);
        stepList.appendChild(box);
      });
    }
    function pickUses(st) {
      var all = names();
      var shade = el('div', 'shade'), box = el('div', 'notice');
      box.appendChild(el('div', 'notice-head', 'WHICH INGREDIENTS?'));
      var body = el('div', 'notice-body ticklist');
      if (!all.length) body.appendChild(el('div', '', 'No ingredients on this recipe yet.'));
      var chosen = st.uses.slice();
      all.forEach(function (n) {
        var b = el('button', 'tick' + (chosen.indexOf(n) >= 0 ? ' done' : ''));
        var bx = el('span', 'box', chosen.indexOf(n) >= 0 ? '✔' : ''); b.appendChild(bx); b.appendChild(el('span', 'nm', n));
        b.onclick = function () {
          var k = chosen.indexOf(n); if (k >= 0) chosen.splice(k, 1); else chosen.push(n);
          b.classList.toggle('done', k < 0); bx.textContent = k < 0 ? '✔' : '';
        };
        body.appendChild(b);
      });
      box.appendChild(body);
      var row = el('div', 'notice-btns'); var ok = el('button', 'soft', 'DONE');
      ok.onclick = function () { st.uses = all.filter(function (n) { return chosen.indexOf(n) >= 0; }); document.body.removeChild(shade); save(); draw(); };
      row.appendChild(ok); box.appendChild(row); shade.appendChild(box); document.body.appendChild(shade);
    }
    addStep.onclick = function () {
      cur().method.push(methodStep()); save(); draw();
      var t = stepList.querySelectorAll('textarea'); if (t.length) t[t.length - 1].focus();
    };
    fromPhoto.onclick = function () {
      var input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
      input.onchange = function () {
        if (!input.files || !input.files[0]) return;
        waiting(true);
        var r = cur();
        shrink(input.files[0]).then(function (img) {
          return readPhotoWith(img, names());
        }).then(function (answer) {
          waiting(false);
          var steps = (answer.steps || []).filter(function (s) { return String(s.text || '').trim(); });
          var ns = names();
          steps = steps.map(function (s) {
            var st = methodStep(s);
            st.uses = st.uses.map(function (u) {
              var k = u.trim().toLowerCase();
              return ns.filter(function (n) { return n.toLowerCase() === k; })[0] ||
                (function (h) { return h ? ns.filter(function (n) { return n.toLowerCase() === h; })[0] : null; })(closeMatch(k, ns.map(function (n) { return n.toLowerCase(); })));
            }).filter(function (u, i, a) { return u && a.indexOf(u) === i; });
            return st;
          });
          if (!r.rows.some(function (x) { return String(x[0] || '').trim(); }) && answer.ingredients) {
            r.rows = answer.ingredients.filter(function (x) { return String(x.name || '').trim(); }).slice(0, 31).map(function (x) {
              var n = String(x.name).trim(); return [n, typeof x.grams === 'number' ? String(x.grams) : '', tidyPrice(lastPrice(data.ingredient_history, n)), '', ''];
            });
          }
          if (!steps.length) { notice('NOTICE', ['No method steps were found in that photo.']); return; }
          var have = methodKept(r.method);
          var go = have.length ? notice('YOU ALREADY HAVE STEPS', ['The photo has ' + steps.length + ' steps.'], ['REPLACE MINE', 'ADD AFTER MINE', 'CANCEL'])
                               : Promise.resolve(0);
          go.then(function (a) {
            if (a === 2) return;
            r.method = (a === 0 ? [] : have).concat(steps); save(); draw();
            notice('METHOD READ', [steps.length + ' steps read from your photo.', '', 'Check the steps against your photo.']);
          });
        }).catch(function (err) { waiting(false); notice('THE PHOTO COULD NOT BE READ', [err.message || 'Please try again.']); });
      };
      input.click();
    };
    sendBtn.onclick = function () {
      var r = cur();
      if (!methodKept(r.method).length) { notice('NOTICE', ['Add at least one step first.']); return; }
      var shade = el('div', 'shade'), box = el('div', 'notice');
      box.appendChild(el('div', 'notice-head', 'SEND OR PRINT'));
      var body = el('div', 'notice-body');
      body.appendChild(el('div', '', 'Send the recipe and method to your team.'));
      var lang = data.settings.language || 'ENGLISH';
      var trTick = el('label', 'trtick'), trBox = el('input'); trBox.type = 'checkbox'; trBox.checked = lang !== 'ENGLISH';
      var trWords = el('span', '', 'Translate my recipe into'); var trLang = el('b', ''); trLang.setAttribute('data-notr', ''); trLang.textContent = ' ' + lang;
      trTick.appendChild(trBox); trTick.appendChild(trWords); trTick.appendChild(trLang); body.appendChild(trTick);
      var note = el('input', 'cream'); note.placeholder = 'NOTE FOR THE TEAM (OPTIONAL)'; body.appendChild(note);
      box.appendChild(body);
      var row = el('div', 'notice-btns col');
      function close() { document.body.removeChild(shade); }
      function open(url) { close(); window.location.href = url; }
      var printWin = null;
      function ready(then) {        // the recipe, translated first when the box is ticked
        if (!trBox.checked) { then(r); return; }
        waiting(true, 'Translating your recipe...', 'This takes a few seconds.');
        translatedRecipe(r, lang).then(function (t) { waiting(false); then(t); }, function (err) {
          waiting(false); close();
          if (printWin) { try { printWin.close(); } catch (e) {} printWin = null; }
          if (/Premium/.test(err.message)) premiumBox(err.message);
          else notice('THE RECIPE COULD NOT BE TRANSLATED', [err.message].concat(err.detail ? ['', '(' + String(err.detail).slice(0, 200) + ')'] : []));
        });
      }
      var apps = [['WHATSAPP', 'wa', function () { ready(function (t) { open('https://wa.me/?text=' + encodeURIComponent(shareText(t, note.value))); }); }],
        ['LINE', 'line', function () { ready(function (t) { open('https://line.me/R/share?text=' + encodeURIComponent(shareText(t, note.value))); }); }],
        ['EMAIL', 'mail', function () { ready(function (t) { open('mailto:?subject=' + encodeURIComponent((t.recipe_name || 'RECIPE') + ' - ' + SPT.T('HOW TO MAKE IT')) + '&body=' + encodeURIComponent(shareText(t, note.value).replace(/\*/g, ''))); }); }]];
      if (navigator.share) apps.push(['MORE APPS (MESSENGER AND OTHERS)', 'more', function () {
        ready(function (t) { navigator.share({ title: t.recipe_name || 'RECIPE', text: shareText(t, note.value).replace(/\*/g, '') }).catch(function () {}); close(); }); }]);
      apps.push(['PRINT / SAVE AS PDF', 'print', function () {
        var w = printWin = window.open('', '_blank');
        if (!w) { notice('NOTICE', ['Please allow pop-ups to print.']); return; }
        ready(function (t) { close(); w.document.open(); w.document.write(cardHtml(t)); w.document.close(); });
      }]);
      apps.push(['CLOSE', '', close]);
      apps.forEach(function (a) { var b = el('button', 'soft share ' + a[1], a[0]); b.onclick = a[2]; row.appendChild(b); });
      box.appendChild(row); shade.appendChild(box); document.body.appendChild(shade);
    };
    refreshers.method = function () { draw(); drawNext(); drawGlance(); };
    return page;
  };

  // ---------------------------------------------------------------- what the user has set up
  function setupDone() {
    derive(data.settings);
    var r = data.recipes[data.current] || {}, c = data.settings.costs || {};
    var rows = (r.rows || []).filter(function (x) { return String(x[0] || '').trim(); });
    return {
      recipe: rows.length > 0 && rows.every(function (x) { return num(x[2]) > 0; }),
      master: [c.elec_bill, c.work_days, c.work_hours].every(function (v) { return String(v || '').trim(); }),
      staff: (data.settings.staff || []).some(function (p) { return String(p[0] || '').trim() && num(p[1]) > 0; })
    };
  }
  function billReminder() {          // once a month, after Master Costings is filled out
    if (!setupDone().master) return;
    var day = 86400000, now = Date.now(), last = data.settings.bills_checked;
    if (!last) { data.settings.bills_checked = now; save(); return; }
    if (now - last < 30 * day) return;
    notice('MONTHLY REMINDER', ['Have you updated your electric and gas bill this month?', '',
      'Keeping them up to date keeps every recipe cost right.'], ['UPDATE NOW', 'ALREADY DONE', 'REMIND ME LATER'])
      .then(function (i) {
        data.settings.bills_checked = i === 2 ? now - 23 * day : now; save();
        if (i === 0) show('master');
      });
  }

  // ---------------------------------------------------------------- the menu
  var targets = { 'MASTER COSTINGS': 'master', 'STAFF': 'stafflist', 'DASHBOARD': 'dashboard', 'PREMIUM': 'method' };
  // ---------------------------------------------------------------- CHANGE APPEARANCE (the same ten looks as the computer)
  var LOOKS = ["Classic", "Warm cream", "Soft stone", "Light grey", "Pale sage", "Mist blue", "Slate", "Charcoal", "Deep navy", "Dark olive"];
  var THEMES = {"Warm cream":{"mode":"light","page":"#F1EBDD","surface":"#FFFCF5","label":"#E9DFC8","text":"#383026","muted":"#655A4B","divider":"#D9CEB8","control":"#8A795F","input":"#FFFFFF","calculated":"#F8F2E6","primary":"#715331","on-primary":"#FFFFFF","primary-hover":"#5E4428","primary-pressed":"#4D3721","selected":"#EBDFC7","on-selected":"#383026","focus":"#6C4D2B"},"Soft stone":{"mode":"light","page":"#EAE7E2","surface":"#FAF9F6","label":"#DFDAD2","text":"#33302C","muted":"#625D55","divider":"#D0C8BD","control":"#817566","input":"#FFFFFF","calculated":"#F0EDE8","primary":"#655C50","on-primary":"#FFFFFF","primary-hover":"#534B40","primary-pressed":"#453D34","selected":"#E0D8CC","on-selected":"#33302C","focus":"#5B5144"},"Light grey":{"mode":"light","page":"#E8EBEE","surface":"#F8FAFC","label":"#DAE1E7","text":"#25313B","muted":"#50616F","divider":"#C8D1D9","control":"#6E8091","input":"#FFFFFF","calculated":"#EEF2F6","primary":"#405E75","on-primary":"#FFFFFF","primary-hover":"#344E63","primary-pressed":"#2A4052","selected":"#D6E1EB","on-selected":"#25313B","focus":"#365B78"},"Pale sage":{"mode":"light","page":"#E7EEE3","surface":"#F7F9F5","label":"#DCE7D5","text":"#243329","muted":"#4C6052","divider":"#C4D1BD","control":"#6B7D63","input":"#FFFFFF","calculated":"#EDF3E9","primary":"#3D6247","on-primary":"#FFFFFF","primary-hover":"#31523B","primary-pressed":"#284531","selected":"#D2E2CB","on-selected":"#243329","focus":"#305D3D"},"Mist blue":{"mode":"light","page":"#E4EEF5","surface":"#F6FAFD","label":"#D4E4EF","text":"#233B4B","muted":"#496478","divider":"#C1D4E2","control":"#657F93","input":"#FFFFFF","calculated":"#EAF3F9","primary":"#2D627F","on-primary":"#FFFFFF","primary-hover":"#245169","primary-pressed":"#1C4257","selected":"#CFE3EF","on-selected":"#233B4B","focus":"#245B7C"},"Slate":{"mode":"dark","page":"#343F4B","surface":"#404D5B","label":"#4A5A69","text":"#F4F7FA","muted":"#CED7E0","divider":"#5A6B7D","control":"#B8CADE","input":"#29343E","calculated":"#394755","primary":"#9EBBD3","on-primary":"#142737","primary-hover":"#B2CBDF","primary-pressed":"#8FABCA","selected":"#536E85","on-selected":"#FFFFFF","focus":"#BFD9ED"},"Charcoal":{"mode":"dark","page":"#25282C","surface":"#30343A","label":"#3C434A","text":"#F4F5F6","muted":"#C3CAD1","divider":"#505A65","control":"#A0AEBC","input":"#1D2125","calculated":"#2B3238","primary":"#BAC4CE","on-primary":"#212B35","primary-hover":"#D0D8DF","primary-pressed":"#A6B3BF","selected":"#485766","on-selected":"#FFFFFF","focus":"#D2DCE5"},"Deep navy":{"mode":"dark","page":"#172331","surface":"#223346","label":"#2D4359","text":"#F2F6FA","muted":"#C5D4E3","divider":"#425B73","control":"#93ABC1","input":"#101C28","calculated":"#1C2C3E","primary":"#8FB8DE","on-primary":"#122A40","primary-hover":"#AACDEB","primary-pressed":"#78A4CB","selected":"#355877","on-selected":"#FFFFFF","focus":"#B5D9F7"},"Dark olive":{"mode":"dark","page":"#2B3027","surface":"#363E30","label":"#45503C","text":"#F3F5ED","muted":"#CBD3C0","divider":"#56634A","control":"#B0C399","input":"#21271E","calculated":"#303A2A","primary":"#B5C59D","on-primary":"#26351D","primary-hover":"#CBD8B6","primary-pressed":"#A1B389","selected":"#526644","on-selected":"#FFFFFF","focus":"#D3E2BD"}};
  var RECOMMENDED_LOOK = "Pale sage";
  var LOOK_VARS = { '--bg': 'page', '--cell': 'surface', '--bright': 'label', '--light': 'calculated', '--input': 'input',
    '--edge': 'divider', '--line': 'control', '--ink': 'text', '--soft': 'primary', '--on-soft': 'on-primary',
    '--headbg': 'primary', '--headink': 'on-primary', '--notice': 'surface', '--strong': 'selected',
    '--top': 'primary', '--bottom': 'primary', '--press': 'selected' };
  function useLook(name) {
    var t = THEMES[name], st = document.documentElement.style;
    Object.keys(LOOK_VARS).forEach(function (v) { if (t) st.setProperty(v, t[LOOK_VARS[v]]); else st.removeProperty(v); });
    document.documentElement.setAttribute('data-mode', t ? t.mode : 'classic');
  }
  function pickLook() {
    var shade = el('div', 'shade'), box = el('div', 'notice');
    box.appendChild(el('div', 'notice-head', 'CHANGE APPEARANCE'));
    box.appendChild(el('div', 'notice-body', 'Tap a look and the whole of SharperPlus changes straight away.'));
    var list = el('div', 'looks');
    var now = data.settings.look || 'Classic';
    LOOKS.forEach(function (name) {
      var t = THEMES[name];
      var b = el('button', 'look' + (name === now ? ' on' : ''));
      var sw = el('span', 'swatch');
      sw.style.background = t ? t.page : '#A66600';
      [t ? t.surface : '#BE7F02', t ? t.calculated : '#FFCC66', t ? t.primary : '#F2B705'].forEach(function (c) {
        var dot = el('span', 'dot'); dot.style.background = c; sw.appendChild(dot); });
      b.appendChild(sw);
      var nm = el('span', 'lookname', name + (name === RECOMMENDED_LOOK ? '  \u2605' : '')); nm.setAttribute('data-notr', '');
      b.appendChild(nm);
      b.onclick = function () {
        data.settings.look = name; save(); useLook(name);
        list.querySelectorAll('.look').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on');
      };
      list.appendChild(b);
    });
    box.appendChild(list);
    var row = el('div', 'notice-btns');
    var close = el('button', 'soft', 'CLOSE'); close.onclick = function () { document.body.removeChild(shade); };
    row.appendChild(close); box.appendChild(row);
    shade.appendChild(box); document.body.appendChild(shade);
  }

  // ---------------------------------------------------------------- LANGUAGE (the same nine as the computer)
  function useLang(name) {
    SPT.setLang(name);
    document.getElementById('langbtn').textContent = SPT.lang();
  }
  function pickLanguage() {
    var shade = el('div', 'shade'), box = el('div', 'notice');
    box.appendChild(el('div', 'notice-head', 'LANGUAGE'));
    var row = el('div', 'notice-btns col');
    SPT.names.forEach(function (name) {
      var b = el('button', 'soft' + (name === SPT.lang() ? ' on' : ''), name); b.setAttribute('data-notr', '');
      b.onclick = function () {
        document.body.removeChild(shade);
        data.settings.language = name; useLang(name); save();
        var seen = String(data.settings.language_seen || '').split('|');
        var note = SPT.notes[name];
        if (note && seen.indexOf(name) < 0) {
          seen.push(name); data.settings.language_seen = seen.filter(Boolean).join('|'); save();
          var shade2 = el('div', 'shade'), box2 = el('div', 'notice hichef'); box2.setAttribute('data-notr', '');
          box2.appendChild(el('div', 'notice-head', note[0]));
          var body = el('div', 'notice-body'); body.appendChild(el('div', '', note[1])); box2.appendChild(body);
          var ok = el('button', 'soft', 'OK'); ok.onclick = function () { document.body.removeChild(shade2); };
          var r2 = el('div', 'notice-btns'); r2.appendChild(ok); box2.appendChild(r2);
          shade2.appendChild(box2); document.body.appendChild(shade2);
        }
      };
      row.appendChild(b);
    });
    var close = el('button', 'soft', 'CLOSE'); close.onclick = function () { document.body.removeChild(shade); };
    row.appendChild(close);
    box.appendChild(row); shade.appendChild(box); document.body.appendChild(shade);
  }

  (function () { var st = document.createElement('style'); st.textContent = "/* ---- welcome + user guide (phone layout) */\n.guidebtn{display:block;width:100%;margin:0 0 16px;padding:14px 10px;background:#000;color:#F2B705;border:3px solid #F2B705;border-radius:14px;font:bold 19px Arial,sans-serif}\n.welcomeshade{align-items:flex-start;overflow:auto;padding:16px 12px calc(24px + env(safe-area-inset-bottom))}\n.welcomebox{max-width:480px;margin:auto;padding:18px 16px 16px;text-align:center}\n.natbig{display:block;width:72%;max-width:260px;margin:0 auto 10px;border-radius:14px;background:#fff;border:3px solid #000}\n.welcomehead{background:var(--light);color:var(--ink);border:2px solid var(--line);border-radius:10px;\n  font:bold 23px/1.25 Arial,sans-serif;padding:12px 10px;margin:0 0 12px}\n.welcomebody{text-align:start;font:bold 18px/1.45 Arial,sans-serif;color:var(--ink)}\n.welcomebody p{margin:0 0 12px}\n.welcomebody .chef{font-size:21px;font-style:italic;text-align:center;margin:16px 0 10px}\n.welcomebox .gobtn{width:100%;margin:6px 0 12px}\n.welcomebox .soft.wide{margin:0 0 12px}\n.nevertick{display:flex;align-items:center;justify-content:center;gap:12px;font:bold 17px Arial,sans-serif;color:var(--ink);padding:6px}\n.nevertick input{width:28px;height:28px;margin:0}\n.tourshade{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:60}\nbody.touring{padding-bottom:62vh}\n.spot{position:relative;z-index:61;pointer-events:none;border-color:#F2B705;border-width:4px;\n  box-shadow:0 0 0 5px #000,0 0 22px 10px #F2B705;animation:glow 1.4s ease-in-out infinite}\n@keyframes glow{50%{box-shadow:0 0 0 5px #000,0 0 30px 16px #FFE27A}}\n.toursheet{position:fixed;left:0;right:0;bottom:0;z-index:62;background:var(--input);border-top:5px solid #F2B705;\n  border-radius:22px 22px 0 0;padding:16px 16px calc(14px + env(safe-area-inset-bottom));max-width:640px;margin:0 auto;\n  box-shadow:0 -8px 24px rgba(0,0,0,.4)}\n.tourtop{display:flex;align-items:center;gap:12px;margin-bottom:10px}\n.natface{width:64px;height:64px;flex-shrink:0}\n.tourheads{flex:1;min-width:0}\n.tourstep{font:bold 15px Arial,sans-serif;color:#A66600;letter-spacing:1px}\n.tourname{font:bold 22px/1.2 Arial,sans-serif;color:var(--ink)}\n.tourwords{font:bold 19px/1.45 Arial,sans-serif;color:var(--ink);max-height:34vh;overflow:auto}\n.tourpara{margin:0 0 10px}\n.keyshade{z-index:80;background:var(--bg)}\n.trtick{display:flex;align-items:center;gap:10px;justify-content:center;font:bold 18px Arial,sans-serif;margin:10px 0;padding:10px;border:2px solid #000;border-radius:12px;background:#FFF8E0}\n.trtick input{width:26px;height:26px;margin:0}\n.syncbtn{display:block;width:100%;margin:0 0 12px;box-sizing:border-box}\n.syncrow{border-top:2px solid var(--line);margin-top:12px;padding-top:12px}\n.synctitle{font:bold 17px Arial,sans-serif;color:var(--ink);margin:0 0 8px 2px}\n.synctick{display:flex;align-items:center;gap:12px;font:bold 17px Arial,sans-serif;color:var(--ink);padding:10px 12px}\n.synctick input{width:28px;height:28px;margin:0}\n.syncsaid{font:bold 17px/1.35 Arial,sans-serif;color:#8B0000;margin:8px 0 4px;min-height:1em}\n.synclast{font:bold 15px Arial,sans-serif;color:var(--ink);text-align:center;margin:4px 0}\n.premhead{font:bold 20px/1.3 Arial,sans-serif;color:#000;margin:12px 0 6px}\n.premstar{display:inline-block;font:bold 15px Arial,sans-serif;letter-spacing:1px;background:#000;color:#F2B705;border-radius:8px;padding:5px 12px;margin:0 0 10px}\n.premlist{list-style:none;margin:0 0 10px;padding:0}\n.premlist li{position:relative;padding:6px 0 6px 30px;font:bold 18px/1.35 Arial,sans-serif}\n.premlist li:before{content:'\\2714';position:absolute;left:4px;top:6px;color:#1E6B2E}\n.premprice{font:bold 46px Arial,sans-serif;color:#000;margin:6px 0 0}\n.premonce{font:bold 19px/1.35 Arial,sans-serif;color:#000;margin:4px 0 14px}\n.gobtn.premgo{display:block;text-decoration:none;text-align:center;width:100%;margin:0 0 8px;box-sizing:border-box}\n.savekey{display:block;width:100%;margin:0 0 12px;padding:16px 10px;border:3px solid #000;border-radius:14px;background:#F2B705;color:#000;font:bold 21px Arial,sans-serif}\n.savekey.done{background:#D4F5CC;color:#0B5D1E;border-color:#1E6B2E}\n.gobtn.faded{opacity:.35;filter:saturate(.4)}\n.keyin{display:block;width:100% !important;max-width:none !important;box-sizing:border-box;font:bold 24px 'Courier New',monospace;letter-spacing:2px;text-align:center;padding:14px 8px;margin:4px 0 14px;text-transform:uppercase}\n.keysaid{background:#FFE0E0;color:#8B0000;border:2px solid #C00;border-radius:10px;padding:10px;font-size:17px}\n.keylink{display:block;text-align:center;text-decoration:none;margin:0 0 12px}\n.helperbtn{background:#185451;color:#FFF8E7;border-color:#000}\n.setupbox{text-align:center}\n.setupask{font:bold 25px/1.3 Arial,sans-serif;color:var(--ink);margin:14px 4px 10px}\n.setuphelp{font:bold 18px/1.4 Arial,sans-serif;color:var(--ink);margin:0 0 6px}\n.setupchoice{display:block;width:100%;margin:10px 0;padding:16px 10px;border:2px solid #000;border-radius:12px;background:var(--bright);color:var(--ink);font:bold 21px Arial,sans-serif}\n.setupchoice.on{background:#1E6B2E;color:#fff}\n.setupline{display:flex;align-items:center;justify-content:center;gap:10px;margin:14px 0}\n.setupin{font:bold 32px Arial,sans-serif;width:60%;max-width:240px;text-align:center;padding:10px}\n.setupafter{font:bold 24px Arial,sans-serif;color:var(--ink)}\n.setupwarn{background:#FF0000;color:#fff;font:bold 17px Arial,sans-serif;padding:8px;border-radius:8px;margin:6px 0}\n.setupbtns{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:14px}\n.setupbtns .soft,.setupbtns .gobtn{flex:1 1 40%;width:auto;margin:0;font-size:18px;padding:14px 8px}\n.setupsum{display:flex;justify-content:space-between;gap:10px;text-align:start;font:bold 16px/1.35 Arial,sans-serif;color:var(--ink);padding:6px 2px;border-bottom:1px solid var(--line)}\n.setupsum b{text-align:end;white-space:nowrap}\n.calc.pos{background:#D4F5CC;color:#0B5D1E}\n.rhead{color:#FFF8E7;font-size:21px;letter-spacing:.5px;border-bottom:3px solid #000}\n.jumpbox{background:var(--cell);border:2px solid var(--line);border-radius:14px;padding:10px;margin:0 0 16px}\n.jumptitle{font:bold 17px Arial,sans-serif;color:var(--ink);margin:0 0 8px 2px}\n.jumpgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}\n.jumpbtn{color:#FFF8E7;border:2px solid #000;border-radius:10px;padding:12px 6px;font:bold 16px/1.2 Arial,sans-serif}\n.jumpbtn:last-child{grid-column:1/-1}\n.card.flash{box-shadow:0 0 0 5px #F2B705;transition:box-shadow .3s}\n.tourhead2{font:bold 20px/1.3 Arial,sans-serif;color:#A66600;margin:4px 0 2px}\n.tourlink{color:#0B5D1E;text-decoration:underline}\n.tourlater{font:bold 15px/1.35 Arial,sans-serif;color:#A66600;margin-top:10px}\n.tourbtns{display:flex;gap:12px;margin-top:14px}\n.tourbtns .soft{flex:1;font-size:19px;padding:14px}\n.tourbtns .gobtn.tournext{flex:1.4;width:auto;margin:0}\n.tourend{display:block;margin:12px auto 0;background:none;border:0;font:bold 17px Arial,sans-serif;color:var(--ink);\n  text-decoration:underline;padding:8px 16px}\n"; document.head.appendChild(st); })();
  // ---------------------------------------------------------------- WELCOME + USER GUIDE (the desktop's words, phone layout)
  function welcome() {
    var shade = el('div', 'shade welcomeshade'), box = el('div', 'notice welcomebox');
    var pic = el('img', 'natbig'); pic.src = 'nat_welcome.png'; pic.alt = ''; box.appendChild(pic);
    box.appendChild(el('div', 'welcomehead', 'Welcome to SharperPlus!'));
    var body = el('div', 'welcomebody');
    ['SharperPlus has been built by a restaurant, for a restaurant.',
     'We have tried our best to produce a User Guide that will help you navigate through each section of the software.',
     'As we understand that using SharperPlus for the first time may feel a little overwhelming, we recommend that you view the User Guide first. It will guide you through each section of the software when you open it for the first time.'
    ].forEach(function (t) { body.appendChild(el('p', '', t)); });
    body.appendChild(el('p', 'chef', 'From one chef to another...'));
    body.appendChild(el('p', '', 'Take your time. Don’t rush, and don’t feel that everything has to be added in one day. SharperPlus is not a magic wand, but once it is set up properly, you will truly start to see the rewards. Believe me, I know it takes time. It took me months to set it up for my own restaurant!'));
    body.appendChild(el('p', '', 'To open the User Guide, click below, or simply continue to the Main Menu.'));
    box.appendChild(body);
    var go = el('button', 'gobtn', 'OPEN USER GUIDE');
    var cont = el('button', 'soft wide', 'CONTINUE');
    var tick = el('label', 'nevertick');
    var cb = el('input'); cb.type = 'checkbox'; tick.appendChild(cb); tick.appendChild(el('span', '', "Don't show this again"));
    function close() {
      if (cb.checked) { data.settings.welcome_off = 'YES'; save(); }
      document.body.removeChild(shade);
    }
    go.onclick = function () { close(); startTour(); };
    cont.onclick = function () { close(); setTimeout(billReminder, 300); };
    box.appendChild(go); box.appendChild(cont); box.appendChild(tick);
    shade.appendChild(box); document.body.appendChild(shade);
  }

  var TOUR = [
    ['MASTER COSTINGS', 'MASTER COSTINGS', 'Start here. Add your electric, gas and rent, and SharperPlus shares them fairly across every dish, so you get a truer cost per dish. Take your time: nothing here is compulsory.'],
    ['STAFF', 'STAFF', 'Add your staff and their wages here. When you build a recipe, you simply pick who makes it from a drop-down, and their time is costed into the dish.'],
    ['ADD RECIPE', 'ADD A RECIPE', 'Click here, type the name of your dish, and a new recipe sheet opens for the full details. Every ingredient is remembered, so each new recipe gets faster to fill in.'],
    ['ADD RECIPE FROM PHOTO', 'TAKE A PHOTO OF RECIPE', 'Let’s be honest: after a hard day in the kitchen, nobody wants to type out recipes. Take a photo of your handwritten recipe and SharperPlus turns it into text. Then just check it, as handwriting is not always read perfectly.'],
    ['DASHBOARD', 'DASHBOARD', 'All your recipes in one place. Search for a dish, change a price, or open its full recipe sheet. Any dish that falls below the lowest margin you set is highlighted.']
  ];
  var MASTER_TOUR = [
    ['[data-guide="YOUR SETTINGS"]', 'YOUR SETTINGS', ['We recommend doing this before adding your first recipe.',
      'Choose your currency, the units you use to weigh ingredients and your VAT percentage.',
      'SharperPlus uses these settings for every recipe. This saves you entering the same details again and helps avoid mistakes with money and weights.']],
    ['[data-guide="RENT & WORKING TIME"]', 'RENT & WORKING TIME', ['Your selling prices need to help pay the rent as well as cover your ingredients. Including rent helps you see more of the cost of making each dish.',
      'Enter your monthly rent, how many days you work each month and how many hours you work each day.',
      'SharperPlus works out your rent per day, ready to include a share of it in your recipe costs.']],
    ['[data-guide="STAFF"]', 'STAFF', ['The time spent making a dish costs money too. Leaving this out can make a dish look cheaper to make than it really is.',
      'Add each staff member\u2019s name and monthly pay. SharperPlus works out their daily and hourly cost.',
      'When costing a recipe, we recommend including everyone who helps prepare it so their time is counted.']],
    ['[data-guide="MONTHLY UNITS"]', 'MONTHLY UNITS', ['See how many items or portions your kitchen makes each month.',
      { h: 'Understand your costs' },
      'SharperPlus shares the monthly costs you enter across the items you make. This shows how much each item needs to contribute towards your bills.',
      'For example, {CUR}10,000 in bills shared across 1,000 items means {CUR}10 per item towards those bills.',
      { h: 'Set a monthly target' },
      'Enter how many items you want your kitchen to make this month.',
      'SharperPlus compares this with how many you have made. You can see whether you are below, on or above your target.',
      'We recommend recording every batch in its recipe sheet. Each batch is added to your monthly total. This helps you stay in control of your costs and how much your kitchen produces.']],
    ['[data-guide="ELECTRIC COSTING BLOCK"]', 'ELECTRIC', ['Your electricity bill pays for cooking, but also for lights, air conditioning and fridges. These all cost money to run.',
      'Tap TYPE YOUR BILL HERE and enter your bill amount. Then choose how much is used for cooking and how much is used for everything else.',
      'This helps SharperPlus estimate the electricity cost to include in your dishes. We recommend keeping your bills updated so the figures reflect what you pay.']],
    ['[data-guide="MONTHLY GAS COSTING"]', 'GAS', ['Gas is another cost of cooking your food. Including it helps you allow for that cost when setting your selling prices.',
      'Choose canister or metered gas, then enter how much you pay. Tick the flames you use when cooking.',
      'We recommend choosing the flames you normally use. This helps SharperPlus estimate a gas cost per minute that matches how you cook.']],
    ['[data-guide="ELECTRIC & GAS MONTHS"]', 'YOUR MONTHS', ['Bills change throughout the year. We recommend adding them each month so you can see when your costs rise.',
      'A red figure means a bill is higher than the amount you planned, helping you spot costs that need attention.',
      'After entering 12 months of bills, you can use the average monthly cost. This reduces the effect of one unusually high or low month on your costing.']],
    ['[data-guide="COST PER DAY"]', 'COST PER DAY', ['This brings together the costs you have entered and shows what they add up to each day.',
      'It helps you understand the running costs your sales need to cover.',
      'We recommend adding as many of your costs as you can, so you get a fuller picture. You do not have to complete everything now. Start with what you know and add the rest as your bills arrive.']]
  ];
  var STAFF_TOUR = [
    ['.person', 'NAME & MONTHLY WAGE', 'Type the name of each member of staff and the monthly wage you pay them.'],
    ['.wages', 'DAILY WAGE & HOURLY RATE', ['You don\u2019t need to type these. SharperPlus works them out for you.',
      'The daily wage is the monthly wage divided by your working days. The hourly rate is the daily wage divided by 8 hours.']],
    ['.addstaff', '+ ADD STAFF', ['Tap + ADD STAFF to add the next person.',
      'Someone left? Tap the \u2715 at the top of their name to remove them.']],
    ['[data-guide="STAFF TOTAL"]', 'STAFF COST PER DAY', ['This is what your whole team costs you each day.',
      'When you cost a recipe, you choose who makes it, and SharperPlus adds their time to the cost of each portion.']]
  ];
  var PHOTO_TOUR = [
    ['', 'GOT YOUR RECIPE WRITTEN DOWN?', ['SharperPlus takes the hassle out of typing it all in!',
      'Simply take a clear photo of your handwritten or printed recipe, or upload a photo already saved on your phone or computer.',
      'Watch the magic as SharperPlus turns your recipe into text! Check the ingredients and quantities, make any corrections, then tap Save. That\u2019s your recipe entered!',
      'Using SharperPlus Premium? You can also upload your cooking method, ready to share with your whole team.']]
  ];
  function photoGuide(after) {
    data.settings.guide_photo = 'SEEN'; save();
    runTour(PHOTO_TOUR, function () { return null; }, after || function () {},
      'You can watch this again at any time: tap HOW TO TAKE A GOOD PHOTO.', after);
  }
  var RECIPE_TOUR = [
    ['[data-guide="RECIPE TOP"]', 'YOUR RECIPE', ['The name of the recipe you\u2019re working on appears here.',
      'To open a saved recipe, tap the arrow beside SELECT RECIPE and choose from your list. To start a new one, tap + ADD RECIPE.',
      'Using SharperPlus Premium? Tap HOW TO MAKE IT \u2605 to add or view your cooking method, ready to share with your team.']],
    ['[data-guide="PRODUCT"]', 'YOUR PRODUCT', ['Use the dropdown to choose UNITS for individual items, such as beigels or cakes, or GRAMS for products measured by weight.',
      'Add your ingredients first. SharperPlus can then calculate their total usable weight.',
      'Next, check your batch size and the number of portions it makes.',
      'Figures shown in grey are calculated automatically. You can change these if needed to match what your batch actually produces.']],
    ['[data-guide="INGREDIENTS"]', 'INGREDIENTS', ['Enter each ingredient\u2019s name, the quantity in grams and the price you pay per kilo.',
      'Use WASTE % to allow for losses such as peeling or trimming. SharperPlus calculates the usable weight and adjusts the cost per kilo to account for that waste.',
      'SharperPlus remembers each ingredient and its last entered price, so the price fills in automatically next time.',
      'Supplier changed the price? Simply update it before costing your recipe.']],
    ['[data-guide="LABOUR"]', 'LABOUR COSTS', ['Use the dropdown arrows to select up to four staff members who help make this recipe.',
      'Enter the time each person spends preparing the batch in hours and minutes.',
      'SharperPlus uses their hourly wages to calculate the total labour cost and includes it in the cost of each portion.',
      'Missing someone from the list? Add their name and wages in the STAFF section of the main menu.']],
    ['[data-guide="ELECTRIC"]', 'ELECTRICITY COSTS', ['Use the dropdown to select the month of the electricity bill you want to use.',
      'Enter how long your batch takes to cook using electrical equipment, in hours and minutes.',
      'SharperPlus uses these details to estimate the electricity cost for the batch and include it in the cost of each portion.',
      'Once you have entered 12 months of bills, you can choose the average across those months instead.']],
    ['[data-guide="GAS"]', 'GAS COSTS', ['Enter how long your batch takes to cook using gas, in hours and minutes.',
      'SharperPlus uses the gas details saved in MASTER COSTINGS to estimate the gas cost for your batch and include it in the cost of each portion.',
      'You can add or update your gas details in MASTER COSTINGS.',
      'If this recipe doesn\u2019t use gas, leave both time fields at 0.']],
    ['[data-guide="PACKAGING"]', 'PACKAGING', ['Selling this dish in a box, tub, bag or wrapper? Add the cost of your packaging here.',
      'In TOTAL COSTING OF PACKAGING, enter what you paid for one pack, for example {CUR}500 for a box of 100 tubs.',
      'In TOTAL UNITS PER PACKAGING, enter how many come in that pack, for example 100.',
      'SharperPlus works out the PACKAGING COST PER SERVING and adds it to the cost of each portion.',
      'If this recipe doesn\u2019t use packaging, leave both fields at 0.']],
    ['[data-guide="RENT"]', 'RENT COSTS', ['Your daily rent is taken automatically from the details entered in MASTER COSTINGS.',
      'Enter a percentage in MARK UP % to include an allowance for rent in this recipe.',
      'SharperPlus calculates the allowance and adds it to the cost of each portion, helping you account for rent when setting your selling price.']],
    ['[data-guide="COST & SELLING PRICE"]', 'COST & SELLING PRICE', ['Here you\u2019ll see your total cost per portion, based on the ingredients and other costs you\u2019ve entered.',
      'Enter your SELLING PRICE to see your profit per portion and profit margin.',
      'Set the lowest profit margin you\u2019re happy to accept. Any dish below this level is highlighted on your DASHBOARD, helping you spot costs or prices that need reviewing.',
      'When you\u2019ve finished entering your figures, tap SAVE to keep your changes.']]
  ];
  var DASH_TOUR = [
    ['', 'THE DASHBOARD', ['The dashboard brings all your recipes together in one place. From here, you can find and open any recipe to check its figures, make changes or update it whenever you need to.',
      'You\u2019ll see notifications of ingredient price increases and which recipe costs have been updated automatically.',
      'You can also open any recipe to update your latest production figures and review how many items you\u2019ve produced and sold each month.',
      'This is especially useful if you use SharperPlus Suites, our complete online business management system, bringing together POS, stock control, full reporting and much more.',
      ['Find out more at ', 'SharperPlus Suites', 'https://sharperplus.com/sharperplus-suites/', '.'],
      'Now let\u2019s take you through each part of your dashboard.']],
    ['[data-guide="DASH TOOLS"]', 'FIND YOUR RECIPES', ['Type all or part of a dish\u2019s name into FIND RECIPE, then tap OPEN RECIPE on the one you want to view or update.',
      'Tap CLEAR SEARCH to show all your recipes again.',
      'To start a new recipe, tap + ADD RECIPE.',
      'Making a variation of an existing dish? Open that recipe first, return to the dashboard and tap COPY LAST OPENED RECIPE. Give the copy a new name and adjust its ingredients or quantities. This saves you entering everything again!']],
    ['.dash .dashgrid', 'YOUR FIGURES', ['Each recipe shows how many units your batch makes, the cost per portion and your selling price.',
      'You\u2019ll also see your profit per portion as a money amount and your profit margin as a percentage of the selling price.',
      'These figures are based on the costs you\u2019ve entered, helping you compare recipes and see where costs or selling prices need reviewing.']],
    ['.dash .status', 'ALERTS', ['Your MARGIN ALERT shows the minimum profit margin you\u2019ve set for this recipe. The colours help you spot anything that needs attention.',
      'GREEN: Your recipe is above your minimum profit margin.',
      'ORANGE: A price is missing or has changed. Open the recipe to check its figures.',
      'RED: Your selling price needs reviewing. Check your costs and adjust the selling price if needed.']],
    ['.dash .quick', 'QUICK PRICE UPDATE', ['Need to change a selling price quickly? Type your new price in ADD QUICK UPDATED PRICE and tap SET.',
      'SharperPlus saves it straight away and updates your profit and margin, without you opening the full recipe.',
      'The date of your last price change shows underneath, so you always know when it was last updated.']],
    ['.dash .btnrow', 'MANAGING YOUR RECIPES', [{ h: 'Open or edit a recipe' },
      'Tap OPEN RECIPE to view your recipe or change its ingredients, quantities and costs.',
      { h: 'Record what you\u2019ve made' },
      'Each time you make a batch, open the recipe and update the batch size and size of each product. These figures help you track how many units your kitchen produces each month.',
      { h: 'Change an ingredient price' },
      'You only need to change an ingredient\u2019s price in one recipe. SharperPlus automatically uses the new price to recalculate the costs of every recipe containing that ingredient.',
      { h: 'Delete a recipe' },
      'Tap DELETE to remove a recipe you no longer need. Check that you\u2019ve selected the correct one, as deleting a recipe is permanent and cannot be undone.']]
  ];
  var PAGE_TOURS = { master: MASTER_TOUR, stafflist: STAFF_TOUR, recipe: RECIPE_TOUR, dashboard: DASH_TOUR };
  // ---------------------------------------------------------------- SET-UP HELPER (the desktop's 13 plain questions)
  var SKIP_HELP = 'If you do not know, tap SKIP. You can come back any time.';
  var SETUP_STEPS = [
    { key: 'currency', kind: 'choice', ask: 'Which money do you use?', help: 'Tap one.',
      choices: [['THB', '\u0e3f  Thai Baht'], ['USD', '$  US Dollar'], ['GBP', '\u00a3  British Pound'], ['EUR', '\u20ac  Euro'], ['RMB', '\u00a5  Chinese Yuan']] },
    { key: 'weights', kind: 'choice', ask: 'How do you weigh your food?', help: 'Tap one.',
      choices: [['G / KG', 'Grams and kilos'], ['OZ / LB', 'Ounces and pounds']] },
    { key: 'vat', kind: 'number', ask: 'What is your sales tax (VAT)?', after: '%', help: 'Type the number only.   Example:  7\nIf you do not charge tax, type 0.' },
    { key: 'work_days', kind: 'number', ask: 'How many days are you open each month?', after: 'days', help: 'Type the number only.   Example:  26' },
    { key: 'work_hours', kind: 'number', ask: 'How many hours are you open each day?', after: 'hours', help: 'Type the number only.   Example:  10' },
    { key: 'rent_cost', kind: 'number', ask: 'How much rent do you pay each month?', after: '', help: 'Type the number only.\nIf you pay no rent, leave it empty.' },
    { key: 'elec_bill', kind: 'number', ask: 'How much was your last electric bill?', after: '', help: 'Type the total you paid.\n' + SKIP_HELP },
    { key: 'elec_kwh', kind: 'number', ask: 'How many units did that electric bill say you used?', after: 'units', help: 'Look on your bill for this number.   Example:  2700\n' + SKIP_HELP },
    { key: 'elec_baseline', kind: 'number', ask: 'What is the lowest electric bill you normally get?', after: '', help: 'This is the least you expect to pay in a quiet month.\n' + SKIP_HELP },
    { key: 'overhead_percent', kind: 'number', ask: 'How much of your electric is for lights, air con and fridges, and not for cooking?', after: '%',
      short: 'How much electric is for lights, air con and fridges?', help: 'Type the number only.\nIf you are not sure, leave it at 25.' },
    { key: 'gas_type', kind: 'choice', ask: 'How do you buy your gas?', help: 'Tap one.', choices: [['GAS CANISTER', 'Gas bottles'], ['METERED', 'Gas from a meter']] },
    { key: 'gas_canister_cost', kind: 'number', when: 'GAS CANISTER', ask: 'How much does one gas bottle cost?', after: '', help: 'Type the number only.\n' + SKIP_HELP },
    { key: 'gas_canister_kg', kind: 'number', when: 'GAS CANISTER', ask: 'How big is the gas bottle?', after: 'WEIGHT', help: 'The size is printed on the bottle.   Example:  48\n' + SKIP_HELP },
    { key: 'gas_month_bill', kind: 'number', when: 'METERED', ask: 'How much was your last gas bill?', after: '', help: 'Type the total you paid.\n' + SKIP_HELP },
    { key: 'gas_month_units', kind: 'number', when: 'METERED', ask: 'How many units did that gas bill say you used?', after: 'units', help: 'Look on your bill for this number.\n' + SKIP_HELP }
  ];
  function setupHelper() {            // nothing is changed until FINISH is pressed
    var s = data.settings, c = s.costs, lines = months(s);
    var mi = -1; for (var k = 0; k < lines.length; k++) if (String(lines[k][0] || '').trim()) { mi = k; break; }
    var line = mi >= 0 ? lines[mi] : null;
    var answers = { currency: s.currency || 'THB', weights: s.weights === 'OZ / LB' ? 'OZ / LB' : 'G / KG', vat: s.vat_percent || '',
      work_days: c.work_days || '', work_hours: c.work_hours || '', rent_cost: c.rent_cost || '',
      elec_bill: line ? line[3] || '' : '', elec_kwh: line ? line[2] || '' : '',
      overhead_percent: c.overhead_percent || '', elec_baseline: c.elec_baseline || '', gas_type: s.gas_type === 'METERED' ? 'METERED' : 'GAS CANISTER',
      gas_canister_cost: c.gas_canister_cost || '', gas_canister_kg: c.gas_canister_kg || '',
      gas_month_bill: mi >= 0 ? s.gas_history[mi] || '' : '', gas_month_units: mi >= 0 ? s.gas_units_history[mi] || '' : '' };
    var steps = [], at = 0;
    function choose() { steps = SETUP_STEPS.filter(function (st) { return !st.when || st.when === answers.gas_type; }); }
    choose();
    var shade = el('div', 'shade welcomeshade'), box = el('div', 'notice welcomebox setupbox');
    var head = el('div', 'welcomehead'); box.appendChild(head);
    var body = el('div', 'setupbody'); box.appendChild(body);
    var warn = el('div', 'setupwarn'); box.appendChild(warn);
    var row = el('div', 'setupbtns'); box.appendChild(row);
    shade.appendChild(box); document.body.appendChild(shade);
    var input = null;
    function afterWords(st) { return st.after === 'WEIGHT' ? (answers.weights === 'OZ / LB' ? 'lb' : 'kg') : (st.after || ''); }
    function keep() {
      var st = steps[at];
      if (st && st.kind === 'number' && input) {
        var t = input.value.trim().replace(/,/g, '');
        if (t && isNaN(parseFloat(t))) return false;
        answers[st.key] = t;
      }
      return true;
    }
    function go(move) {
      if (move > 0 && !keep()) { warn.textContent = 'PLEASE TYPE A NUMBER ONLY, LIKE  26'; warn.hidden = false; return; }
      if (move < 0) keep();
      at = Math.max(0, Math.min(steps.length, at + move)); draw();
    }
    function btn(text, cls, fn) { var b = el('button', cls, text); b.onclick = fn; row.appendChild(b); return b; }
    function finish() {
      s.vat_percent = answers.vat;
      ['work_days', 'work_hours', 'rent_cost', 'overhead_percent', 'elec_baseline', 'gas_canister_cost', 'gas_canister_kg'].forEach(function (k2) { c[k2] = answers[k2]; });
      var typedMonth = ['elec_bill', 'elec_kwh', 'gas_month_bill', 'gas_month_units'].some(function (k2) { return String(answers[k2]).trim(); });
      if (typedMonth && mi < 0) { var d = new Date(); monthLine(s, d.getFullYear(), d.getMonth() + 1); lines = months(s); mi = 0; line = lines[0]; }
      if (line) {
        line[3] = answers.elec_bill; line[2] = answers.elec_kwh;
        if (answers.gas_type === 'METERED') { s.gas_history[mi] = answers.gas_month_bill; s.gas_units_history[mi] = answers.gas_month_units; }
      }
      s.gas_type = answers.gas_type; s.weights = answers.weights; s.currency = answers.currency;
      save(); document.body.removeChild(shade);
      if (refreshers.master) refreshers.master();
      window.scrollTo(0, 0);
    }
    function draw() {
      body.innerHTML = ''; row.innerHTML = ''; warn.hidden = true; input = null;
      if (at >= steps.length) {
        head.textContent = 'ALL DONE';
        body.appendChild(el('div', 'setupask', 'Here is what you told us.'));
        steps.forEach(function (st) {
          var v = answers[st.key];
          if (st.kind === 'choice') { var hit = st.choices.filter(function (ch) { return ch[0] === v; })[0]; v = hit ? hit[1] : v; }
          else if (v) v = v + (afterWords(st) ? '  ' + afterWords(st) : '');
          var r = el('div', 'setupsum'); r.appendChild(el('span', '', st.short || st.ask)); r.appendChild(el('b', '', v || '(not answered)'));
          body.appendChild(r);
        });
        body.appendChild(el('div', 'setuphelp', 'You can change any of these at any time on this page.'));
        btn('BACK', 'soft', function () { go(-1); }); btn('FINISH', 'gobtn', finish);
        return;
      }
      var st = steps[at];
      head.textContent = SPT.T('SET-UP HELPER     QUESTION {} OF {}').replace('{}', at + 1).replace('{}', steps.length);
      body.appendChild(el('div', 'setupask', st.ask));
      st.help.split('\n').forEach(function (h) { body.appendChild(el('div', 'setuphelp', h)); });
      if (st.kind === 'choice') {
        st.choices.forEach(function (ch) {
          var on = answers[st.key] === ch[0];
          var b = el('button', 'setupchoice' + (on ? ' on' : ''), (on ? '\u2714  ' : '') + ch[1]);
          b.onclick = function () { answers[st.key] = ch[0]; choose(); go(1); };
          body.appendChild(b);
        });
      } else {
        var line2 = el('div', 'setupline');
        input = el('input', 'cream setupin'); input.inputMode = 'decimal'; input.value = answers[st.key] || '';
        input.onkeydown = function (e) { if (e.key === 'Enter') go(1); };
        line2.appendChild(input);
        if (afterWords(st)) line2.appendChild(el('span', 'setupafter', afterWords(st)));
        body.appendChild(line2);
        setTimeout(function () { if (input) input.focus(); }, 50);
      }
      if (at) btn('BACK', 'soft', function () { go(-1); });
      btn('SKIP THIS QUESTION', 'soft', function () { at = Math.min(steps.length, at + 1); draw(); });
      if (st.kind === 'number') btn('NEXT', 'gobtn', function () { go(1); });
      var close = el('button', 'tourend', 'CLOSE WITHOUT SAVING'); close.onclick = function () { document.body.removeChild(shade); };
      row.appendChild(close);
    }
    draw();
  }

  function pageGuide(key) {
    data.settings['guide_' + key] = 'SEEN'; save();
    runTour(PAGE_TOURS[key], function (st) { return st[0] && screens[key] ? screens[key].querySelector(st[0]) : null; },
      key === 'master' ? function () { setTimeout(setupHelper, 300); } : function () {},
      key === 'master' ? 'To open this guide again, tap USER GUIDE FOR THIS PAGE at the top.' :
      key === 'dashboard' ? 'You can reopen this guide at any time by tapping USER GUIDE FOR THIS PAGE at the top.' :
      key === 'recipe' ? 'Need a reminder? You can reopen this guide at any time by tapping USER GUIDE FOR THIS PAGE at the top.'
                       : 'You can watch this again at any time: tap USER GUIDE FOR THIS PAGE at the top.');
  }
  function guideButton(page, key) {
    var b = el('button', 'guidebtn', '\u2753  USER GUIDE FOR THIS PAGE');
    b.onclick = function () { pageGuide(key); };
    page.appendChild(b);
  }
  function startTour() {
    show('menu');
    runTour(TOUR, function (s) { return document.querySelector('#menu [data-go="' + s[0] + '"]'); }, thankYou);
  }
  function runTour(TOUR, find, done, laterText, onEnd) {
    var at = 0, lit = null;
    var shade = el('div', 'tourshade');
    var sheet = el('div', 'toursheet');
    var top = el('div', 'tourtop');
    var face = el('img', 'natface'); face.src = 'nat_guide.png'; face.alt = '';
    var heads = el('div', 'tourheads');
    var stepNo = el('div', 'tourstep'); stepNo.setAttribute('data-notr', '');
    var name = el('div', 'tourname');
    heads.appendChild(stepNo); heads.appendChild(name);
    top.appendChild(face); top.appendChild(heads);
    var words = el('div', 'tourwords');
    var later = el('div', 'tourlater', laterText || 'You can come back to this guide at any time: click USER GUIDE on the main menu.');
    var row = el('div', 'tourbtns');
    var back = el('button', 'soft', 'BACK'), next = el('button', 'gobtn tournext', 'NEXT');
    row.appendChild(back); row.appendChild(next);
    var end = el('button', 'tourend', 'END TOUR');
    [top, words, later, row, end].forEach(function (x) { sheet.appendChild(x); });
    document.body.appendChild(shade); document.body.appendChild(sheet);
    document.body.classList.add('touring');

    function stop() {
      if (lit) lit.classList.remove('spot');
      document.body.classList.remove('touring');
      document.body.removeChild(shade); document.body.removeChild(sheet);
      window.scrollTo(0, 0);
    }
    function paint() {
      var s = TOUR[at];
      if (lit) lit.classList.remove('spot');
      lit = find(s);
      if (lit) {
        lit.classList.add('spot');
        var r = lit.getBoundingClientRect(), room = window.innerHeight - sheet.offsetHeight;
        window.scrollTo({ top: window.scrollY + r.top - Math.max(12, (room - r.height) / 2), behavior: 'smooth' });
      }
      stepNo.textContent = SPT.T('STEP {} OF {}').replace('{}', at + 1).replace('{}', TOUR.length);
      name.textContent = s[1];
      words.innerHTML = '';
      if (Array.isArray(s[2])) s[2].forEach(function (t) {
        if (t && t.h) { words.appendChild(el('div', 'tourhead2', t.h)); return; }
        if (!Array.isArray(t)) { SP.setUnits(data.settings); words.appendChild(el('p', 'tourpara', String(t).replace(/\{CUR\}/g, SP.SYMBOL))); return; }
        var para = el('p', 'tourpara'); para.appendChild(document.createTextNode(t[0]));
        var a = el('a', 'tourlink', t[1]); a.href = t[2]; a.target = '_blank'; a.rel = 'noopener';
        para.appendChild(a); para.appendChild(document.createTextNode(t[3] || '')); words.appendChild(para);
      });
      else words.textContent = s[2];
      stepNo.hidden = TOUR.length === 1;
      var laterAt = 0; for (var k = 0; k < TOUR.length; k++) { if (TOUR[k][0]) { laterAt = k; break; } }
      later.hidden = at !== laterAt || !later.textContent.trim();
      back.style.visibility = at === 0 ? 'hidden' : 'visible';
      next.textContent = at === TOUR.length - 1 ? 'FINISH' : 'NEXT';
      end.hidden = at === TOUR.length - 1;
    }
    back.onclick = function () { if (at > 0) { at--; paint(); } };
    next.onclick = function () {
      if (at < TOUR.length - 1) { at++; paint(); return; }
      stop(); done();
    };
    end.onclick = function () { stop(); if (onEnd) onEnd(); };
    shade.onclick = function () {};
    setTimeout(paint, 30);
  }
  function thankYou() {
    var shade = el('div', 'shade welcomeshade'), box = el('div', 'notice welcomebox');
    var pic = el('img', 'natbig'); pic.src = 'nat_welcome.png'; pic.alt = ''; box.appendChild(pic);
    box.appendChild(el('div', 'welcomehead', 'Thank you for choosing SharperPlus!'));
    var body = el('div', 'welcomebody');
    ['We have tried extremely hard to produce our software for ease of use.',
     'We hope you find SharperPlus as beneficial to your business as it has been to our business, London Beigel and Salt Beef Bar.'
    ].forEach(function (t) { body.appendChild(el('p', '', t)); });
    box.appendChild(body);
    var ok = el('button', 'gobtn', 'OK'); ok.onclick = function () { document.body.removeChild(shade); };
    box.appendChild(ok);
    shade.appendChild(box); document.body.appendChild(shade);
  }

  // ---------------------------------------------------------------- THE KEY (the phone's own licence slot)
  // Checked with sharperplus.com each time the app opens with internet. With no internet it keeps
  // working for 3 days on a free trial and 30 days on a paid key, then asks to connect.
  var KEY_URL = 'https://sharperplus.com/wp-json/sharperplus/v1/phone';
  var OFFLINE_DAYS = { trial: 3, paid: 30 }, DAY = 86400000;
  function deviceId() {
    var id = '';
    try { id = localStorage.getItem('sharperplus_device') || ''; } catch (e) {}
    if (!/^[a-f0-9]{32}$/.test(id)) {
      var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a);
      id = Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      try { localStorage.setItem('sharperplus_device', id); } catch (e) {}
    }
    return id;
  }
  function phoneName() {
    var u = navigator.userAgent || '', m = u.match(/Android[^;)]*;\s*([^;)]+?)(\sBuild|\))/);
    return m ? m[1] : /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : 'Phone';
  }
  function askServer(key, move) {
    return fetch(KEY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, device: deviceId(), phone: phoneName(), move: move ? 1 : 0 }) })
      .then(function (r) { return r.json(); });
  }
  var lockBox = null;
  function unlockScreen() { if (lockBox) { document.body.removeChild(lockBox); lockBox = null; } }
  function lockScreen(kind, then, said) {        // kind: 'key' | 'ended' | 'offline'
    unlockScreen();
    var lic = data.settings.licence || {};
    var shade = el('div', 'shade welcomeshade keyshade'), box = el('div', 'notice welcomebox');
    var pic = el('img', 'natbig'); pic.src = 'nat_welcome.png'; pic.alt = ''; box.appendChild(pic);
    var body = el('div', 'welcomebody');
    if (kind === 'ended') {
      box.appendChild(el('div', 'welcomehead', 'Your free trial has ended'));
      body.appendChild(el('p', '', 'Thank you for trying SharperPlus. Your recipes are all still saved on this phone.'));
      body.appendChild(el('p', '', 'Buy SharperPlus to carry on, then tap CHECK MY KEY AGAIN.'));
    } else if (kind === 'offline') {
      box.appendChild(el('div', 'welcomehead', 'Please connect to the internet'));
      body.appendChild(el('p', '', 'SharperPlus needs to check your key. Please turn on your Wi-Fi or mobile data, then tap CHECK MY KEY AGAIN.'));
      body.appendChild(el('p', '', 'Your recipes are all still saved on this phone.'));
    } else if (lic.fromLink && lic.key) {
      box.appendChild(el('div', 'welcomehead', 'Your SharperPlus key'));
      body.appendChild(el('p', '', 'Here is your own SharperPlus key. Keep it safe: it is also in the email we sent you.'));
      body.appendChild(el('p', '', 'Tap OPEN SHARPERPLUS to unlock it on this phone.'));
    } else {
      box.appendChild(el('div', 'welcomehead', 'Welcome to SharperPlus!'));
      body.appendChild(el('p', '', 'Please type your SharperPlus key. You will find it in the email we sent you.'));
    }
    if (said) body.appendChild(el('p', 'keysaid', said));
    box.appendChild(body);
    var input = null;
    if (kind === 'key') {
      input = el('input', 'cream keyin'); input.placeholder = 'SP-XXXX-XXXX-XXXX'; input.value = lic.key || '';
      input.autocapitalize = 'characters'; input.spellcheck = false;
      box.appendChild(input);
    }
    if (kind === 'key' && lic.fromLink && lic.key) {
      var saveKey = el('button', 'savekey', 'SAVE MY KEY');
      saveKey.onclick = function () {
        lic.saved = true; data.settings.licence = lic; save();
        saveKey.textContent = '\u2714  KEY SAVED'; saveKey.classList.add('done'); saveKey.disabled = true;
        go.disabled = false; go.classList.remove('faded');
      };
      box.appendChild(saveKey);
    }
    var go = el('button', 'gobtn', kind === 'key' ? 'OPEN SHARPERPLUS' : 'CHECK MY KEY AGAIN');
    if (kind === 'key' && lic.fromLink && lic.key && !lic.saved) { go.disabled = true; go.classList.add('faded'); }
    go.onclick = function () {
      if (input) {
        var k = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (k.length !== 14 || k.slice(0, 2) !== 'SP') { lockScreen('key', then, 'That does not look like a SharperPlus key. It starts with SP and has 12 letters and numbers after it.'); return; }
        lic.key = 'SP-' + k.slice(2, 6) + '-' + k.slice(6, 10) + '-' + k.slice(10, 14);
        lic.typed = true; data.settings.licence = lic; save();
      }
      go.disabled = true; go.textContent = '...';
      checkKey(then, true);
    };
    box.appendChild(go);
    if (kind !== 'offline') {
      var buy = el('a', 'soft wide keylink', 'BUY SHARPERPLUS'); buy.href = 'https://sharperplus.com/buy/'; buy.target = '_blank'; buy.rel = 'noopener';
      box.appendChild(buy);
    }
    if (kind === 'key' && !lic.fromLink) {
      var trial = el('a', 'soft wide keylink', 'GET A FREE 14-DAY KEY'); trial.href = 'https://sharperplus.com/free-trial/'; trial.target = '_blank'; trial.rel = 'noopener';
      box.appendChild(trial);
    }
    if (kind !== 'key') {
      var other = el('button', 'tourend', 'TYPE A DIFFERENT KEY'); other.onclick = function () { lockScreen('key', then); };
      box.appendChild(other);
    }
    shade.appendChild(box); document.body.appendChild(shade); lockBox = shade;
  }
  function fullScreen(then, a) {      // the key is on its phone(s) already: move it here, or Premium for a second phone
    unlockScreen();
    var lic = data.settings.licence || {};
    var shade = el('div', 'shade welcomeshade keyshade'), box = el('div', 'notice welcomebox');
    var pic = el('img', 'natbig'); pic.src = 'nat_welcome.png'; pic.alt = ''; box.appendChild(pic);
    var two = a.phones === 2;
    box.appendChild(el('div', 'welcomehead', two ? 'Your key is already on 2 phones' : 'Your key is already on another phone'));
    var body = el('div', 'welcomebody');
    body.appendChild(el('p', 'premhead', 'Got a new phone?'));
    if (a.can_move) {
      body.appendChild(el('p', '', 'Move SharperPlus to this phone. Your other phone will stop opening SharperPlus.'));
      box.appendChild(body);
      var mv = el('button', 'gobtn', 'MOVE SHARPERPLUS TO THIS PHONE');
      mv.onclick = function () {
        mv.disabled = true; mv.textContent = '...';
        askServer(lic.key, true).then(function (r) {
          if (r && r.ok) { lic.ok = true; lic.checked = Date.now(); lic.trial = !!r.trial; lic.premium = !!r.premium; lic.expires = r.expires || 0;
            lic.typed = true; data.settings.licence = lic; save(); unlockScreen(); then(); }
          else fullScreen(then, r || a);
        }).catch(function () { lockScreen('offline', then, 'We could not reach SharperPlus. Please check your internet.'); });
      };
      box.appendChild(mv);
    } else {
      var when = a.move_again ? new Date(a.move_again * 1000) : null;
      body.appendChild(el('p', '', 'Your key was moved to a phone in the last 7 days, so it cannot move again yet. Please email support@sharperplus.com and we will help you.'));
      if (when) { var d = el('p', 'premonce'); d.setAttribute('data-notr', ''); d.textContent = when.toLocaleDateString(); body.appendChild(d); }
      box.appendChild(body);
    }
    if (!a.premium && !two) {
      box.appendChild(el('p', 'premhead', 'Want SharperPlus on two phones?'));
      var see = el('button', 'soft wide', 'SEE WHAT PREMIUM GIVES YOU');
      see.onclick = function () { premiumBox(); };
      box.appendChild(see);
    }
    var other = el('button', 'tourend', 'TYPE A DIFFERENT KEY'); other.onclick = function () { lockScreen('key', then); };
    box.appendChild(other);
    shade.appendChild(box); document.body.appendChild(shade); lockBox = shade;
  }
  function checkKey(then, typed) {
    var lic = data.settings.licence || {};
    if (!lic.key) { lockScreen('key', then); return; }
    if (lic.fromLink && !lic.typed) { lockScreen('key', then); return; }   // a key from the scan code: the chef taps to unlock it
    var now = Date.now();
    function offline() {               // no answer from the website: allow a few days
      var allow = (lic.trial ? OFFLINE_DAYS.trial : OFFLINE_DAYS.paid) * DAY;
      if (lic.trial && lic.expires && now >= lic.expires * 1000) { lockScreen('ended', then); return; }
      if (lic.ok && lic.checked && now - lic.checked < allow) { unlockScreen(); then(); return; }
      lockScreen(typed ? 'offline' : (lic.ok ? 'offline' : 'key'), then, typed ? 'We could not reach SharperPlus. Please check your internet.' : '');
    }
    askServer(lic.key).then(function (a) {
      if (a && a.code === 'rest_no_route') { unlockScreen(); then(); return; }   // the website lock is not switched on yet
      if (!a || (a.ok !== true && !a.reason)) { offline(); return; }
      lic.trial = !!a.trial; lic.premium = !!a.premium; lic.expires = a.expires || 0;
      if (a.ok) {
        var first = !lic.welcomed;
        lic.ok = true; lic.checked = now; lic.welcomed = true; data.settings.licence = lic; save();
        unlockScreen();
        if (first) keyWelcome(lic, function () { homeScreenBox(then); }); else then();
        return;
      }
      lic.ok = false; data.settings.licence = lic; save();
      if (a.reason === 'busy' || a.reason === 'off') { offline(); return; }
      if (a.reason === 'ended') { lockScreen('ended', then); return; }
      if (a.reason === 'full') { lic.trial = !!a.trial; data.settings.licence = lic; save(); fullScreen(then, a); return; }
      lockScreen('key', then, ({
        unknown: 'That key was not found. Please check it against your email.',
        full: 'This key is already open on ' + (a.phones || 1) + (a.phones === 2 ? ' phones' : ' phone') + '. Please email ' + 'support@sharperplus.com to move it to this phone.',
        trial_used: 'This phone has already had a free trial. Please buy SharperPlus to carry on.'
      })[a.reason] || 'That key could not be opened. Please email support@sharperplus.com');
    }).catch(offline);
  }
  function keyWelcome(lic, next) {    // the first time a key opens SharperPlus on this phone
    var lines = lic.trial
      ? ['Your ' + 14 + ' day free trial has started.', 'Please check your email for your 14 day key. Keep it safe.']
      : ['Your SharperPlus key is now active on this phone.', 'Please check your email for your key. Keep it safe.'];
    var shade = el('div', 'shade welcomeshade'), box = el('div', 'notice welcomebox');
    var pic = el('img', 'natbig'); pic.src = 'nat_welcome.png'; pic.alt = ''; box.appendChild(pic);
    box.appendChild(el('div', 'welcomehead', 'Welcome to SharperPlus!'));
    var body = el('div', 'welcomebody'); lines.forEach(function (t) { body.appendChild(el('p', '', t)); }); box.appendChild(body);
    var ok = el('button', 'gobtn', 'OK'); ok.onclick = function () { document.body.removeChild(shade); next(); };
    box.appendChild(ok); shade.appendChild(box); document.body.appendChild(shade);
  }
  // put SharperPlus on the home screen, so it opens like an app
  var installEvent = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvent = e; });
  function installed() {
    return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function homeScreenBox(next) {
    if (installed()) { next(); return; }
    var apple = /iPhone|iPad|iPod/.test(navigator.userAgent);
    var shade = el('div', 'shade welcomeshade'), box = el('div', 'notice welcomebox');
    var pic = el('img', 'natbig'); pic.src = 'nat_welcome.png'; pic.alt = ''; box.appendChild(pic);
    box.appendChild(el('div', 'welcomehead', 'Put SharperPlus on your home screen'));
    var body = el('div', 'welcomebody');
    body.appendChild(el('p', '', 'SharperPlus will sit on your phone like an app, with its own icon. Just tap it to open SharperPlus any time.'));
    if (apple) body.appendChild(el('p', '', 'Tap the Share button at the bottom of the screen, then tap Add to Home Screen.'));
    else body.appendChild(el('p', '', 'Tap INSTALL below. SharperPlus will be added to your home screen.'));
    box.appendChild(body);
    function close() { document.body.removeChild(shade); next(); }
    if (!apple) {
      var inst = el('button', 'gobtn', 'INSTALL');
      inst.onclick = function () {
        if (installEvent) {
          installEvent.prompt();
          installEvent.userChoice.then(function () { installEvent = null; close(); }, close);
        } else {
          body.appendChild(el('p', 'keysaid', 'Tap the \u22ee menu at the top right of the screen, then tap Add to Home screen or Install app.'));
          inst.disabled = true; inst.classList.add('faded');
        }
      };
      box.appendChild(inst);
    }
    var later = el('button', 'tourend', apple ? 'OK' : 'NOT NOW'); later.onclick = close; box.appendChild(later);
    shade.appendChild(box); document.body.appendChild(shade);
  }
  // ---------------------------------------------------------------- SHARPERPLUS PREMIUM (not in the free trial)
  function isPremium() { var lic = data.settings.licence || {}; return lic.ok === true && lic.premium === true; }
  var PREMIUM_PRICE = { premium: { THB: '\u0e3f5,800', GBP: '\u00a3130', EUR: '\u20ac160', USD: '$175' },
                        upgrade: { THB: '\u0e3f1,800', GBP: '\u00a340',  EUR: '\u20ac50',  USD: '$55' } };
  function premiumBox(why) {
    var lic = data.settings.licence || {}, cur = PREMIUM_PRICE.premium[data.settings.currency] ? data.settings.currency : 'USD';
    var plan = lic.key && lic.trial === false ? 'upgrade' : 'premium';
    var shade = el('div', 'shade welcomeshade'), box = el('div', 'notice welcomebox');
    shade.style.zIndex = 90;
    box.appendChild(el('div', 'premstar', '\u2605 PREMIUM'));
    box.appendChild(el('div', 'welcomehead', 'SharperPlus Premium'));
    var body = el('div', 'welcomebody');
    if (why) body.appendChild(el('p', 'keysaid', why));
    body.appendChild(el('p', '', 'Everything in SharperPlus, plus:'));
    var ul = el('ul', 'premlist');
    ['The step-by-step cooking method for every recipe', 'Read your recipe and method from one photo',
     'Send it to your team by WhatsApp, LINE or email, or print it', 'Two computers and two phones'
    ].forEach(function (t) { ul.appendChild(el('li', '', t)); });
    body.appendChild(ul); box.appendChild(body);
    var price = el('div', 'premprice'); price.setAttribute('data-notr', ''); price.textContent = PREMIUM_PRICE[plan][cur];
    box.appendChild(price);
    box.appendChild(el('div', 'premonce', plan === 'upgrade' ? 'Upgrade your SharperPlus key. One payment, yours to keep' : 'One payment, yours to keep'));
    var go = el('a', 'gobtn premgo', plan === 'upgrade' ? 'UPGRADE NOW' : 'BUY PREMIUM');
    go.href = 'https://sharperplus.com/premium/' + (lic.key ? '?key=' + encodeURIComponent(lic.key) : ''); go.target = '_blank'; go.rel = 'noopener';
    box.appendChild(go);
    box.appendChild(el('div', 'premonce', 'Bought it? Come back and tap CHECK MY KEY AGAIN.'));
    var again = el('button', 'soft wide', 'CHECK MY KEY AGAIN');
    again.onclick = function () { document.body.removeChild(shade); checkKey(function () { if (isPremium()) show('method'); else premiumBox(); }); };
    box.appendChild(again);
    var close = el('button', 'tourend', 'NOT NOW'); close.onclick = function () { document.body.removeChild(shade); };
    box.appendChild(close);
    shade.appendChild(box); document.body.appendChild(shade);
  }
  var gateDone = false;
  function keyFromLink() {             // app.sharperplus.com/?key=SP-... (the scan code and the email carry the key)
    var m = location.search.match(/[?&]key=([^&#]+)/);
    if (!m) return;
    var k = decodeURIComponent(m[1]).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (k.length === 14 && k.slice(0, 2) === 'SP') {
      var lic = data.settings.licence || {}, tidy = 'SP-' + k.slice(2, 6) + '-' + k.slice(6, 10) + '-' + k.slice(10, 14);
      if (lic.key !== tidy || !lic.ok) { data.settings.licence = { key: tidy, fromLink: true }; save(); }
    }
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }
  function keyGate(then) {
    keyFromLink();
    checkKey(function () { if (!gateDone) { gateDone = true; then(); } });
    document.addEventListener('visibilitychange', function () {    // coming back to the app: check again
      if (document.visibilityState === 'visible' && gateDone) checkKey(function () {});
    });
  }

  // ---------------------------------------------------------------- SYNC WITH MY COMPUTER
  // Like push mail: nothing moves until the chef presses SEND. The recipes wait on
  // sharperplus.com under the key until the computer presses GET MY PHONE RECIPES.
  var SYNC_URL = 'https://sharperplus.com/wp-json/sharperplus/v1/sync';
  function syncCall(action, recipes) {
    var lic = data.settings.licence || {};
    return fetch(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: lic.key || '', side: 'phone', id: deviceId(), name: phoneName(),
                             action: action, recipes: recipes || [] }) })
      .then(function (r) { return r.json(); });
  }
  function syncWhy(d) {
    var r = d && d.reason;
    if (r === 'trial') return 'Sync comes with a bought SharperPlus key. It is not part of the free trial.';
    if (r === 'not_this_device' || r === 'unknown') return 'This phone is not opened with your key yet.';
    if (r === 'busy') return 'Too many tries. Please wait an hour and try again.';
    if (r === 'too_big') return 'Too many recipes to send in one go. Please email support@sharperplus.com';
    return 'Please connect to the internet and try again.';
  }
  function plainRecipe(r) {                 // a recipe without its photo, to send or to compare
    var c = JSON.parse(JSON.stringify(r)); c.costs = Object.assign({}, c.costs || {}); c.costs.image = '';
    delete c.tr; return c;
  }
  var syncTicks = {};                      // the recipes ticked on the dashboard, by name
  function syncTrial() {
    if (!(data.settings.licence || {}).trial) return false;
    notice('SYNC WITH MY COMPUTER', ['Sync comes with a bought SharperPlus key. It is not part of the free trial.'], ['OK']);
    return true;
  }
  function sendRecipes(recipes, said, after) {
    if (syncTrial()) return;
    var list = (recipes || []).filter(function (r) { return r && (r.recipe_name || '').trim(); }).map(plainRecipe);
    if (!list.length) { notice('SEND TO MY COMPUTER', ['Tick the recipes you want to send first.'], ['OK']); return; }
    if (said) said.textContent = 'Sending...'; else say('Sending...');
    syncCall('send', list).then(function (d) {
      if (said) said.textContent = '';
      if (!d || !d.ok) { notice('SEND TO MY COMPUTER', [syncWhy(d)], ['OK']); return; }
      var when = new Date().toLocaleDateString();
      data.settings.sync_marks = data.settings.sync_marks || {};
      list.forEach(function (r) { data.settings.sync_marks[r.recipe_name.trim().toUpperCase()] = when; });
      save();
      say('SENT ' + d.sent + ' RECIPES TO YOUR COMPUTER', true);
      notice('SENT TO YOUR COMPUTER', ['Now open SharperPlus on your computer and click GET MY PHONE RECIPES.'], ['OK']);
      if (after) after();
    }).catch(function () { if (said) said.textContent = ''; notice('SEND TO MY COMPUTER', [syncWhy(null)], ['OK']); });
  }
  function syncGet(said, done) {
    if (syncTrial()) return;
    said.textContent = 'Getting...';
    syncCall('get').then(function (d) {
      if (!d || !d.ok) { said.textContent = syncWhy(d); return; }
      said.textContent = '';
      var come = (d.recipes || []).filter(function (r) { return r && (r.recipe_name || '').trim(); });
      if (!come.length) { notice('GET MY COMPUTER RECIPES', ['Nothing has been sent from your computer yet.'], ['OK']); return; }
      var mine = {}; (data.recipes || []).forEach(function (r, i) { mine[(r.recipe_name || '').trim().toUpperCase()] = i; });
      var fresh = [], changed = [];
      come.forEach(function (r) {
        var at = mine[(r.recipe_name || '').trim().toUpperCase()];
        if (at === undefined) fresh.push(r);
        else if (JSON.stringify(plainRecipe(Object.assign(SP.blankRecipe(), data.recipes[at]))) !==
                 JSON.stringify(plainRecipe(Object.assign(SP.blankRecipe(), r)))) changed.push([at, r]);
      });
      if (!fresh.length && !changed.length) {
        notice('GET MY COMPUTER RECIPES', ['Your recipes are already the same as your computer.'], ['OK']); return;
      }
      var lines = [];
      if (fresh.length) lines.push(fresh.length + ' NEW RECIPES');
      if (changed.length) lines.push(changed.length + ' RECIPES ARE DIFFERENT ON YOUR COMPUTER');
      var btns = changed.length ? ['ADD NEW AND UPDATE CHANGED', 'ADD NEW ONLY', 'CANCEL'] : ['ADD THEM', 'CANCEL'];
      notice('GET MY COMPUTER RECIPES', lines, btns).then(function (pick) {
        if (btns[pick] === 'CANCEL') return;
        fresh.forEach(function (r) { data.recipes.push(Object.assign(SP.blankRecipe(), r)); });
        if (btns[pick] === 'ADD NEW AND UPDATE CHANGED') {
          changed.forEach(function (p) {
            var keep = ((data.recipes[p[0]].costs || {}).image) || '';
            var next = Object.assign(SP.blankRecipe(), p[1]);
            next.costs = Object.assign(SP.recipeCosts(), next.costs || {});
            if (!next.costs.image && keep) next.costs.image = keep;     // keep the photo on this phone
            data.recipes[p[0]] = next;
          });
        }
        data.settings.sync_got = new Date().toLocaleString();
        save(); redrawOpen(); say('RECIPES UPDATED');
        if (done) done();
      });
    }).catch(function () { said.textContent = syncWhy(null); });
  }
  function syncClicked() { save(); show('dashboard'); }

  var actions = { 'ADD RECIPE': newRecipe, 'ADD RECIPE FROM PHOTO': photoClicked, 'LANGUAGE': pickLanguage, 'CHANGE APPEARANCE': pickLook,
                  'USER GUIDE': startTour, 'SYNC': syncClicked };
  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.getAttribute('data-go');
      if (actions[name]) actions[name](); else if (targets[name]) show(targets[name]); else say(name + ' – coming next');
    });
  });
  useLook(data.settings.look || 'Classic');
  useLang(data.settings.language || 'ENGLISH'); SPT.start();
  var start = location.hash.replace('#', '');
  if (start && builders[start]) show(start);
  keyGate(function () {
    if (data.settings.welcome_off !== 'YES' && !(start && builders[start])) setTimeout(welcome, 400);
    else setTimeout(billReminder, 800);
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) { reg.update(); }).catch(function () {}); });
  }
})();
