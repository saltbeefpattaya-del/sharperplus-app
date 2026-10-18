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

  // ---------------------------------------------------------------- the menu
  var targets = { 'MASTER COSTINGS': 'master' };
  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.getAttribute('data-go');
      if (targets[name]) show(targets[name]); else say(name + ' – coming next');
    });
  });
  var start = location.hash.replace('#', '');
  if (start && builders[start]) show(start);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
