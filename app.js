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
  function ask(title, lines, hint) {
    return new Promise(function (done) {
      var shade = el('div', 'shade'), box = el('div', 'notice');
      box.appendChild(el('div', 'notice-head', title));
      var body = el('div', 'notice-body');
      lines.forEach(function (l) { body.appendChild(el('div', '', l)); });
      var input = el('input', 'cream'); input.placeholder = hint || ''; body.appendChild(input);
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
  function show(name) {
    if (!screens[name] && builders[name]) screens[name] = builders[name]();
    if (!screens[name]) { say(name.toUpperCase() + ' – coming next'); return; }
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
    if (refreshers[name]) refreshers[name]();
    window.scrollTo(0, 0);
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
    page.appendChild(bar);
    page.appendChild(el('h1', 'pagetitle', title));
    document.getElementById('app').appendChild(page);
    return page;
  }

  // ---------------------------------------------------------------- MASTER COSTINGS
  builders.master = function () {
    var s = data.settings, c = s.costs;
    var page = pageTop('OVERHEADS & COSTING FACTORS');
    var outs = {}, inputs = [];

    function card(title) {
      var box = el('div', 'card');
      if (title) box.appendChild(el('div', 'cardhead', title));
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
    costIn(rent, 'WORKING DAYS PER MONTH', 'work_days');
    costIn(rent, 'WORKING HOURS PER DAY', 'work_hours');
    costIn(rent, 'RENT COST', 'rent_cost');
    out(rent, 'RENT COST PER DAY', 'rent_day');
    out(rent, 'TOTAL RENT COST PER DISH', 'rent_dish', true);

    // ---- units
    var units = card('MONTHLY UNITS');
    field(units, 'MONTHLY UNITS PRODUCED', function () { return s.units_produced; },
          function (v) { s.units_produced = v; });
    field(units, 'MONTHLY UNITS SOLD', function () { return s.units_sold; },
          function (v) { s.units_sold = v; });
    out(units, 'TOTAL STOCK HOLDING AFTER MONTHLY SALES', 'stock');

    // ---- electric costing block
    var elec = card('ELECTRIC COSTING BLOCK');
    out(elec, 'ELECTRIC BILL (TOTAL PAID)', 'elec_bill_left');
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
      out(gas, 'GAS BILL (TOTAL PAID)', 'gas_bill_show'),
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
      b.innerHTML = '<span class="tick"></span><span>' + f[0] + '<br>FLAME</span>';
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

    // ---- per day
    var day = card('COST PER DAY');
    out(day, 'RENT COST PER DAY', 'sum_rent');
    out(day, 'ELECTRICITY COST PER DAY', 'sum_elec');
    out(day, 'GAS COST PER DAY', 'sum_gas');
    out(day, 'STAFF COST PER DAY', 'sum_staff');
    out(day, 'GRAND TOTAL PER DAY', 'sum_total', true);

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

    drawMonths();
    refreshers.master = function () {
      inputs.forEach(function (x) { if (document.activeElement !== x.input) x.input.value = x.get() || ''; });
      drawMonths(); refresh();
    };
    return page;
  };

  // ---------------------------------------------------------------- STAFF WAGES
  builders.stafflist = function () {
    var s = data.settings;
    var page = pageTop('STAFF WAGES');
    page.appendChild(el('div', 'note', 'Type each member of staff and their daily wage. ' +
      'The hourly rate is the daily wage \u00f7 8, and recipes use it for labour.'));
    var list = el('div', 'staff'); page.appendChild(list);
    var add = el('button', 'soft wide', '+ ADD STAFF'); page.appendChild(add);
    var total = el('div', 'card'); page.appendChild(total);
    var rates = [];

    function plain(v) { var n = num(v); return n ? String(n) : String(v || '').trim(); }
    function draw() {
      list.innerHTML = ''; rates = [];
      s.staff = s.staff || [];
      if (!s.staff.length) s.staff.push(['', '', '']);
      s.staff.forEach(function (p, i) {
        while (p.length < 3) p.push('');
        var box = el('div', 'person');
        var head = el('div', 'personhead');
        var name = el('input', 'cream name'); name.placeholder = 'STAFF NAME'; name.value = p[0];
        name.oninput = function () { p[0] = name.value; save(); sums(); };
        head.appendChild(name);
        var del = el('button', 'del', '\u2715'); del.setAttribute('aria-label', 'Remove');
        del.onclick = function () {
          notice('REMOVE STAFF', ['Remove ' + (p[0] || 'this line') + '?'], ['REMOVE', 'CANCEL']).then(function (a) {
            if (a !== 0) return; s.staff.splice(i, 1); save(); draw(); });
        };
        head.appendChild(del); box.appendChild(head);
        var grid = el('div', 'wages');
        [['DAILY WAGE', 1], ['MONTHLY WAGE', 2]].forEach(function (w) {
          var cell = el('label', 'wage');
          cell.appendChild(el('span', 'lbl', w[0]));
          var input = el('input', 'cream'); input.inputMode = 'decimal';
          var show = function () { input.value = num(p[w[1]]) ? SP.money(num(p[w[1]])) : (p[w[1]] || ''); };
          show();
          input.onfocus = function () { input.value = plain(p[w[1]]); };
          input.onblur = show;
          input.oninput = function () { p[w[1]] = plain(input.value); save(); sums(); };
          cell.appendChild(input); grid.appendChild(cell);
        });
        var rateCell = el('div', 'wage');
        rateCell.appendChild(el('span', 'lbl', 'HOURLY RATE'));
        var rate = el('span', 'calc'); rateCell.appendChild(rate); grid.appendChild(rateCell);
        rates.push([p, rate]);
        box.appendChild(grid); list.appendChild(box);
      });
      sums();
    }
    function sums() {
      SP.setUnits(s);
      rates.forEach(function (r) {
        r[1].textContent = String(r[0][0] || '').trim() ? SP.money(SP.hourlyRate(num(r[0][1]))) : '';
      });
      var named = s.staff.filter(function (p) { return String(p[0] || '').trim(); });
      total.innerHTML = '';
      var row = el('div', 'row'); row.appendChild(el('span', 'lbl', 'STAFF COST PER DAY (' + named.length + ' STAFF)'));
      var v = el('span', 'calc strong', SP.money(named.reduce(function (a, p) { return a + num(p[1]); }, 0)));
      row.appendChild(v); total.appendChild(row);
    }
    add.onclick = function () {
      s.staff.push(['', '', '']); save(); draw();
      var names = list.querySelectorAll('input.name'); names[names.length - 1].focus();
    };
    refreshers.stafflist = function () {
      s.staff = (s.staff || []).filter(function (p, i, all) {
        return String(p[0] || '').trim() || String(p[1] || '').trim() || String(p[2] || '').trim() || i === all.length - 1;
      });
      draw();
    };
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
    var pickRow = el('label', 'row'); pickRow.appendChild(el('span', 'lbl', 'OPEN RECIPE'));
    var picker = el('select', 'cream'); picker.style.width = '62%'; picker.style.maxWidth = 'none';
    picker.onchange = function () { save(); data.current = parseInt(picker.value, 10); save(); refreshers.recipe(); window.scrollTo(0, 0); };
    pickRow.appendChild(picker); top.appendChild(pickRow);
    var tb = el('div', 'btnrow');
    var addBtn = el('button', 'soft', '+ ADD RECIPE'); addBtn.onclick = newRecipe; tb.appendChild(addBtn);
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
    outRow(prod, 'TOTAL WEIGHT OF YOUR INGREDIENTS (USABLE)', 'weight');
    inRow(prod, 'BATCH SIZE', function () { return recipeNow().batch_size; }, function (v) { recipeNow().batch_size = v; });
    inRow(prod, 'PRODUCT SIZE', function () { return recipeNow().product_size; }, function (v) { recipeNow().product_size = v; });
    outRow(prod, 'TOTAL PRODUCTS', 'products');
    outRow(prod, 'COST PER PORTION INGREDIENTS', 'portion');

    // ---- ingredients
    var ing = card('INGREDIENTS');
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
        var sel = el('select', 'cream');
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
      put('products', SP.commas(out.products, 2).replace(/\.?0+$/, '') || '0');
      put('portion', m(out.portion));
      var usable = out.lines.reduce(function (a, l) { return a + l[1]; }, 0);
      put('weight', SP.US ? SP.commas(usable, 2) + ' oz' : SP.commas(Math.round(usable), 0) + ' g');
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
          save(); refreshers.dashboard();
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
      if (a !== 0) return; c.price_check = ''; save(); refreshers.dashboard();
    });
  }
  function quickPrice(i, value) {
    var p = num(value); if (p <= 0) return;
    var c = data.recipes[i].costs, d = new Date();
    c.selling_price = String(p);
    c.price_updated = ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
    c.price_check = '';
    save(); refreshers.dashboard();
    say('NEW SELLING PRICE SAVED');
  }

  builders.dashboard = function () {
    var page = pageTop('DASHBOARD');
    var tools = el('div', 'card');
    var findRow = el('label', 'row'); findRow.appendChild(el('span', 'lbl', 'FIND RECIPE'));
    var find = el('input', 'cream'); find.placeholder = 'NAME'; find.oninput = function () { draw(); };
    findRow.appendChild(find); tools.appendChild(findRow);
    var tb = el('div', 'btnrow');
    [['CLEAR SEARCH', function () { find.value = ''; draw(); }], ['+ ADD RECIPE', newRecipe],
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
        var btns = el('div', 'btnrow');
        var open = el('button', 'soft', 'OPEN RECIPE'); open.onclick = function () { openRecipe(i); };
        var del = el('button', 'soft danger', 'DELETE'); del.onclick = function () { deleteRecipe(i); };
        btns.appendChild(open); btns.appendChild(del); box.appendChild(btns);
        list.appendChild(box);
      });
      if (!shown) list.appendChild(el('div', 'empty', want ? 'No recipe matches that name.' : 'No recipes yet. Press + ADD RECIPE.'));
    }
    refreshers.dashboard = draw;
    return page;
  };

  // ---------------------------------------------------------------- the menu
  var targets = { 'MASTER COSTINGS': 'master', 'STAFF': 'stafflist', 'DASHBOARD': 'dashboard' };
  var actions = { 'ADD RECIPE': newRecipe };
  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.getAttribute('data-go');
      if (actions[name]) actions[name](); else if (targets[name]) show(targets[name]); else say(name + ' – coming next');
    });
  });
  var start = location.hash.replace('#', '');
  if (start && builders[start]) show(start);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) { reg.update(); }).catch(function () {}); });
  }
})();
