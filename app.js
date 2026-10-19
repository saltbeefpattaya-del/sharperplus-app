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
      setTimeout(function () { pageGuide(name); }, 450);
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

  // ---------------------------------------------------------------- MASTER COSTINGS
  builders.master = function () {
    var s = data.settings, c = s.costs;
    var page = pageTop('OVERHEADS & COSTING FACTORS');
    guideButton(page, 'master');
    var outs = {}, inputs = [];

    function card(title) {
      var box = el('div', 'card');
      if (title) { box.appendChild(el('div', 'cardhead', title)); box.setAttribute('data-guide', title); }
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
    var outs = {}, ingList, labourBox;

    // ---- which recipe
    var top = el('div', 'card');
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
    function card(title) { var b = el('div', 'card'); if (title) b.appendChild(el('div', 'cardhead', title)); page.appendChild(b); return b; }
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
    inRow(prod, 'PRODUCT SIZE', function () { return recipeNow().product_size; }, function (v) { recipeNow().product_size = v; });
    var totIn = inRow(prod, 'TOTAL PRODUCTS', function () { return recipeNow().total_products || ''; },
                      function (v) { recipeNow().total_products = v; });
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
        var btns = el('div', 'btnrow');
        var open = el('button', 'soft', 'OPEN RECIPE'); open.onclick = function () { openRecipe(i); };
        var del = el('button', 'soft danger', 'DELETE'); del.onclick = function () { deleteRecipe(i); };
        btns.appendChild(open); btns.appendChild(del); box.appendChild(btns);
    return box;
  }

  builders.dashboard = function () {
    var page = pageTop('DASHBOARD');
    var tools = el('div', 'card');
    var findRow = el('label', 'row'); findRow.appendChild(el('span', 'lbl', 'FIND RECIPE'));
    var find = el('input', 'cream'); find.placeholder = 'NAME'; find.oninput = function () { draw(); };
    findRow.appendChild(find); tools.appendChild(findRow);
    var tb = el('div', 'btnrow');
    [['CLEAR SEARCH', function () { find.value = ''; draw(); }], ['+ ADD RECIPE', addChoice],
     ['COPY LAST OPENED RECIPE', copyRecipe]].forEach(function (b) {
      var x = el('button', 'soft', b[0]); x.onclick = b[1]; tb.appendChild(x); });
    tools.appendChild(tb); page.appendChild(tools);
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
  function waiting(on) {
    var w = document.getElementById('waitbox');
    if (!w) {
      w = el('div', 'shade'); w.id = 'waitbox';
      var box = el('div', 'notice');
      box.appendChild(el('div', 'notice-head', 'Reading your recipe...'));
      var body = el('div', 'notice-body');
      body.appendChild(el('div', 'spinner'));
      body.appendChild(el('div', '', 'Handwriting can take a little longer.'));
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
    return '<!doctype html><html lang="' + document.documentElement.lang + '" dir="' + document.documentElement.dir + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
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
      var note = el('input', 'cream'); note.placeholder = 'NOTE FOR THE TEAM (OPTIONAL)'; body.appendChild(note);
      box.appendChild(body);
      var row = el('div', 'notice-btns col');
      function close() { document.body.removeChild(shade); }
      function open(url) { close(); window.location.href = url; }
      var subject = (r.recipe_name || 'RECIPE') + ' - HOW TO MAKE IT';
      var apps = [['WHATSAPP', 'wa', function () { open('https://wa.me/?text=' + encodeURIComponent(shareText(r, note.value))); }],
        ['LINE', 'line', function () { open('https://line.me/R/share?text=' + encodeURIComponent(shareText(r, note.value))); }],
        ['EMAIL', 'mail', function () { open('mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(shareText(r, note.value).replace(/\*/g, ''))); }]];
      if (navigator.share) apps.push(['MORE APPS (MESSENGER AND OTHERS)', 'more', function () {
        navigator.share({ title: subject, text: shareText(r, note.value).replace(/\*/g, '') }).catch(function () {}); close(); }]);
      apps.push(['PRINT / SAVE AS PDF', 'print', function () {
        close(); var w = window.open('', '_blank');
        if (!w) { notice('NOTICE', ['Please allow pop-ups to print.']); return; }
        w.document.open(); w.document.write(cardHtml(r)); w.document.close();
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

  (function () { var st = document.createElement('style'); st.textContent = "/* ---- welcome + user guide (phone layout) */\n.guidebtn{display:block;width:100%;margin:0 0 16px;padding:14px 10px;background:#000;color:#F2B705;border:3px solid #F2B705;border-radius:14px;font:bold 19px Arial,sans-serif}\n.welcomeshade{align-items:flex-start;overflow:auto;padding:16px 12px calc(24px + env(safe-area-inset-bottom))}\n.welcomebox{max-width:480px;margin:auto;padding:18px 16px 16px;text-align:center}\n.natbig{display:block;width:72%;max-width:260px;margin:0 auto 10px;border-radius:14px;background:#fff;border:3px solid #000}\n.welcomehead{background:var(--light);color:var(--ink);border:2px solid var(--line);border-radius:10px;\n  font:bold 23px/1.25 Arial,sans-serif;padding:12px 10px;margin:0 0 12px}\n.welcomebody{text-align:start;font:bold 18px/1.45 Arial,sans-serif;color:var(--ink)}\n.welcomebody p{margin:0 0 12px}\n.welcomebody .chef{font-size:21px;font-style:italic;text-align:center;margin:16px 0 10px}\n.welcomebox .gobtn{width:100%;margin:6px 0 12px}\n.welcomebox .soft.wide{margin:0 0 12px}\n.nevertick{display:flex;align-items:center;justify-content:center;gap:12px;font:bold 17px Arial,sans-serif;color:var(--ink);padding:6px}\n.nevertick input{width:28px;height:28px;margin:0}\n.tourshade{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:60}\nbody.touring{padding-bottom:62vh}\n.spot{position:relative;z-index:61;pointer-events:none;border-color:#F2B705;border-width:4px;\n  box-shadow:0 0 0 5px #000,0 0 22px 10px #F2B705;animation:glow 1.4s ease-in-out infinite}\n@keyframes glow{50%{box-shadow:0 0 0 5px #000,0 0 30px 16px #FFE27A}}\n.toursheet{position:fixed;left:0;right:0;bottom:0;z-index:62;background:var(--input);border-top:5px solid #F2B705;\n  border-radius:22px 22px 0 0;padding:16px 16px calc(14px + env(safe-area-inset-bottom));max-width:640px;margin:0 auto;\n  box-shadow:0 -8px 24px rgba(0,0,0,.4)}\n.tourtop{display:flex;align-items:center;gap:12px;margin-bottom:10px}\n.natface{width:64px;height:64px;flex-shrink:0}\n.tourheads{flex:1;min-width:0}\n.tourstep{font:bold 15px Arial,sans-serif;color:#A66600;letter-spacing:1px}\n.tourname{font:bold 22px/1.2 Arial,sans-serif;color:var(--ink)}\n.tourwords{font:bold 19px/1.45 Arial,sans-serif;color:var(--ink);max-height:34vh;overflow:auto}\n.tourpara{margin:0 0 10px}\n.tourlater{font:bold 15px/1.35 Arial,sans-serif;color:#A66600;margin-top:10px}\n.tourbtns{display:flex;gap:12px;margin-top:14px}\n.tourbtns .soft{flex:1;font-size:19px;padding:14px}\n.tourbtns .gobtn.tournext{flex:1.4;width:auto;margin:0}\n.tourend{display:block;margin:12px auto 0;background:none;border:0;font:bold 17px Arial,sans-serif;color:var(--ink);\n  text-decoration:underline;padding:8px 16px}\n"; document.head.appendChild(st); })();
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
    ['[data-guide="YOUR SETTINGS"]', 'YOUR SETTINGS', 'Pick your currency and your weights, and type your local VAT rate. You only do this once, and every recipe follows it.'],
    ['[data-guide="RENT & WORKING TIME"]', 'RENT & WORKING TIME', 'Type how many days you work each month, your hours per day and your monthly rent. SharperPlus works out your rent per day and shares it across every dish.'],
    ['[data-guide="STAFF"]', 'STAFF', 'Type each member of staff and their monthly wage. SharperPlus works out their daily and hourly cost, ready to pick when you build a recipe.'],
    ['[data-guide="MONTHLY UNITS"]', 'MONTHLY UNITS', 'Roughly how many portions you make and sell in a month. This is how your bills are shared fairly across each dish.'],
    ['[data-guide="ELECTRIC COSTING BLOCK"]', 'ELECTRIC', 'Tap TYPE YOUR BILL HERE to add your electric bill. The split tells SharperPlus how much of your bill is cooking, and how much is lights, AC and fridges.'],
    ['[data-guide="MONTHLY GAS COSTING"]', 'GAS', 'Choose canister or metered gas and type your cost. Then tick the flames you cook on, and every recipe gets a true gas cost per minute.'],
    ['[data-guide="ELECTRIC & GAS MONTHS"]', 'YOUR MONTHS', 'Add your bills here each month. A red figure means you went over your planned bill. After 12 months you can use the yearly average.'],
    ['[data-guide="COST PER DAY"]', 'COST PER DAY', 'Everything added up: what it costs you to open your doors each day. Nothing here is compulsory. Fill in what you have, and come back as your bills arrive.']
  ];
  var STAFF_TOUR = [
    ['.person', 'NAME & MONTHLY WAGE', 'Type the name of each member of staff and their monthly wage, as you pay it.'],
    ['.wages', 'DAILY WAGE & HOURLY RATE', 'SharperPlus works these out for you: the daily wage is the monthly wage divided by your working days, then the hourly rate. You never type these.'],
    ['.addstaff', '+ ADD STAFF', 'Tap here to add the next person. The \u2715 at the top of a name removes someone who has left.'],
    ['[data-guide="STAFF TOTAL"]', 'STAFF COST PER DAY', 'What your whole team costs you each day. When you build a recipe, you pick who makes it, and their time is costed into the dish.']
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
  var PAGE_TOURS = { master: MASTER_TOUR, stafflist: STAFF_TOUR };
  function pageGuide(key) {
    data.settings['guide_' + key] = 'SEEN'; save();
    runTour(PAGE_TOURS[key], function (st) { return screens[key] && screens[key].querySelector(st[0]); }, function () {},
      'You can watch this again at any time: tap USER GUIDE FOR THIS PAGE at the top.');
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
      if (Array.isArray(s[2])) s[2].forEach(function (t) { words.appendChild(el('p', 'tourpara', t)); });
      else words.textContent = s[2];
      stepNo.hidden = TOUR.length === 1;
      later.hidden = at !== 0 || !later.textContent.trim();
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

  var actions = { 'ADD RECIPE': newRecipe, 'ADD RECIPE FROM PHOTO': photoClicked, 'LANGUAGE': pickLanguage, 'CHANGE APPEARANCE': pickLook,
                  'USER GUIDE': startTour };
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
  if (data.settings.welcome_off !== 'YES' && !(start && builders[start])) setTimeout(welcome, 400);
  else setTimeout(billReminder, 800);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) { reg.update(); }).catch(function () {}); });
  }
})();
