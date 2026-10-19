/* SharperPlus costing engine for the phone.
   A line-for-line copy of the desktop sums (sharperplus.py), so both give the same answers. */
(function (root) {
  'use strict';

  var CURRENCIES = { THB: '฿', USD: '$', GBP: '£', EUR: '€', RMB: '¥' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                     'September', 'October', 'November', 'December'];
  var GAS_TYPES = ['GAS CANISTER', 'METERED'];
  var FLAME_RATES = { 'GAS CANISTER': [0.8, 1.5, 2.5], 'METERED': [1.5, 3.0, 5.0] };
  var AVERAGE_MONTHS = '12 MONTH AVERAGE';
  var HISTORY_ROWS = 12;
  var HOURS_PER_DAY = 8;
  var STAFF_SLOTS = 4;

  var E = { US: false, SYMBOL: CURRENCIES.THB, PER: 1000 };

  var SHARED_COSTS = {
    gas_canister_cost: '1300', gas_canister_kg: '48',
    flame_low: 'YES', flame_medium: 'YES', flame_high: 'YES',
    elec_bill: '10300', work_days: '20', work_hours: '10',
    overhead_percent: '25', rent_per_dish: '7.35',
    rent_cost: '22000', elec_buffer: '10', elec_baseline: '10300',
    elec_unit_cost: '5.35', elec_planned: '',
    gas_bill: '', gas_meter_units: '', elec_tax: '', gas_tax: '',
    gas_buffer: '', gas_planned: '', gas_unit_cost: ''
  };

  function recipeCosts() {
    var d = new Date();
    return {
      gas_hours: '0', gas_minutes: '0', elec_hours: '0', elec_minutes: '0',
      pack_cost: '', pack_units: '', selling_price: '', lowest_margin: '47',
      elec_month: '', avg_hours: '0', avg_minutes: '0', rent_markup: '13',
      price_updated: '', image: '', sync_stamp: '', sync_tag: '', price_check: '',
      cost_month: MONTHS[d.getMonth()].toUpperCase(), cost_year: String(d.getFullYear() % 100)
    };
  }

  function blankRecipe() {
    return {
      recipe_name: '', made_by: 'UNITS', batch_size: '', product_size: '1', rows: [],
      staff_count: '1', labour: [['', '', ''], ['', '', ''], ['', '', ''], ['', '', '']],
      costs: recipeCosts(), egg: ['', '', '', '', ''], packs: [], consumables: [], method: []
    };
  }

  function blankSettings() {           // a first start: nothing typed in yet
    var costs = {};
    Object.keys(SHARED_COSTS).forEach(function (k) { costs[k] = ''; });
    costs.flame_low = costs.flame_medium = costs.flame_high = 'YES';
    costs.overhead_percent = '25';
    costs.elec_buffer = '10';
    return {
      vat_percent: '', staff: [], costs: costs, elec_history: [], gas_history: [],
      gas_units_history: [], currency: 'THB', zoom: '100%', weights: 'G / KG',
      units_produced: '', units_sold: '', data_type: 'PRODUCTION', elec_average: 'NO',
      gas_type: 'GAS CANISTER', rent_method: ''
    };
  }

  function newData() {
    return { settings: blankSettings(), recipes: [blankRecipe()], current: 0,
             ingredient_history: [], production_log: [] };
  }

  function num(text) {
    var t = String(text == null ? '' : text).replace(/,/g, '');
    Object.keys(CURRENCIES).forEach(function (k) { t = t.split(CURRENCIES[k]).join(''); });
    t = t.trim();
    if (!t || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return 0;
    return parseFloat(t);
  }

  function excelRound(v) { return Math.floor(Math.abs(v) + 0.5) * (v >= 0 ? 1 : -1); }

  function round2(v) {                 // ROUND_HALF_UP to 2 places, like the desktop
    var s = Math.abs(v);
    var r = Math.round((s + 1e-9) * 100) / 100;
    return v < 0 ? -r : r;
  }

  function commas(v, places) {
    var parts = Math.abs(v).toFixed(places).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '-' : '') + parts.join('.');
  }

  function money(v) {
    var r = round2(v);
    return (r < 0 ? '-' : '') + E.SYMBOL + commas(Math.abs(r), 2);
  }

  function whole(v) { return commas(Math.round(v), 0); }

  function costRow(qty, price, waste) {
    var gross = (qty / E.PER) * price;
    var nett = qty - waste;
    var perKilo = nett === 0 ? 0 : price * qty / nett;
    var perGram = perKilo / E.PER;
    var total = (perKilo / E.PER) * qty;
    return [gross, nett, perKilo, perGram, total];
  }

  function costRecipe(rows, batch, size, vatPercent, madeBy) {
    var sub = 0;
    rows.forEach(function (r) { sub += costRow(r[0], r[1], r[2])[4]; });
    var vat = sub * vatPercent / 100;
    var total = sub + vat;
    madeBy = String(madeBy || 'GRAMS').trim().toUpperCase();
    if (madeBy === 'LB') { batch = batch * 16; madeBy = 'GRAMS'; }
    var products;
    // whole portions only: 30.4 -> 30, 30.6 -> 31 (a little left over is spread over the portions)
    if (madeBy !== 'GRAMS') products = size > 0 ? batch / size : batch;
    else if (size === 0) products = batch / (E.US ? 4 : 100);
    else products = batch / size;
    products = Math.round(products + 1e-9);
    var portion = products === 0 ? 0 : sub / products;
    return [sub, vat, total, products, portion];
  }

  function hourlyRate(wage) { return wage / HOURS_PER_DAY; }
  function costToPrep(rate, hours, minutes) { return rate * hours + (rate / 60) * minutes; }

  function costLabour(lines, products) {
    var preps = lines.map(function (l) { return costToPrep(l[0], l[1], l[2]); });
    var sum = preps.reduce(function (a, b) { return a + b; }, 0);
    var perServing = products === 0 ? 0 :
      preps.reduce(function (a, p) { return a + p / products; }, 0);
    return [preps, excelRound(sum), perServing];
  }

  function flameRates(gasType) {
    var r = (FLAME_RATES[gasType] || FLAME_RATES['GAS CANISTER']).slice();
    if (E.US && gasType !== 'METERED') r = r.map(function (x) { return x * 2.20462; });
    return r;
  }

  function gasCostPerMinute(cost, kg, low, medium, high, rates) {
    rates = rates || [0.8, 1.5, 2.5];
    if (cost <= 0 || kg <= 0) return [0, 0];
    var perKg = cost / kg, flames = [];
    if (low) flames.push(perKg * rates[0] / 60);
    if (medium) flames.push(perKg * rates[1] / 60);
    if (high) flames.push(perKg * rates[2] / 60);
    if (!flames.length) return [perKg, 0];
    return [perKg, flames.reduce(function (a, b) { return a + b; }, 0) / flames.length];
  }

  function gasPerDish(perMinute, hours, minutes, products) {
    return products === 0 ? 0 : (perMinute * (hours * 60 + minutes)) / products;
  }

  function costElectric(bill, days, hours, overhead, cookH, cookM, products) {
    var minutes = days * hours * 60;
    if (bill <= 0 || minutes <= 0) return [0, 0, 0];
    var split = overhead > 1 ? overhead / 100 : overhead;
    split = Math.max(0, Math.min(1, split));
    var perMinute = (bill * (1 - split)) / minutes;
    var perBatch = perMinute * (cookH * 60 + cookM);
    return [perMinute, perBatch, products > 0 ? perBatch / products : 0];
  }

  function packagingPerServing(cost, units) { return units ? cost / units : 0; }

  function costPrice(total, price, lowest) {
    var margin = price === 0 ? 0 : (price - total) / price;
    var profit = price * margin;
    var minPrice = lowest >= 100 ? 0 : total / (1 - lowest / 100);
    var minProfit = minPrice ? minPrice - total : 0;
    return [margin, profit, minPrice, minProfit, price > 0 && margin * 100 < lowest];
  }

  function plannedElectric(baseline, buffer) {
    if (baseline <= 0) return 0;
    return baseline * (1 + (buffer > 1 ? buffer / 100 : buffer));
  }

  function splitShare(overhead) {
    var s = overhead > 1 ? overhead / 100 : overhead;
    return Math.max(0, Math.min(1, s));
  }

  function electricMonth(bill, units, planned, split) {
    var cooking = bill > 0 ? bill * (1 - split) : 0;
    var perPortion = cooking > 0 && units > 0 ? cooking / units : null;
    var surplus = planned > 0 && bill > 0 ? planned - bill : null;
    var overUnder = split > 0 && bill > 0 && planned > 0 ? planned * split - bill * split : null;
    return [perPortion, surplus, overUnder];
  }

  function gasMonth(cost, units, perMinute) {
    if (cost <= 0 || units <= 0) return [null, null];
    return [cost / units, perMinute > 0 ? cost - perMinute * units : null];
  }

  function gasInputs(c, gasType) {
    if (gasType === 'METERED') return [num(c.gas_bill), num(c.gas_meter_units)];
    return [num(c.gas_canister_cost), num(c.gas_canister_kg)];
  }

  function electricLeft(lines, average) {   // lines = [units, kwh, bill], newest first
    if (average) {
      var mean = function (vals) {
        vals = vals.filter(function (v) { return v > 0; });
        return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
      };
      var bill = mean(lines.map(function (l) { return l[2]; }));
      if (bill) return [bill, mean(lines.map(function (l) { return l[1]; })),
                        mean(lines.map(function (l) { return l[0]; }))];
      return [0, 0, 0];
    }
    for (var i = 0; i < lines.length; i++) if (lines[i][2] > 0) return [lines[i][2], lines[i][1], lines[i][0]];
    return [0, 0, 0];
  }

  function parseMonth(text) {
    var parts = String(text).replace(/[-\/]/g, ' ').trim().split(/\s+/);
    if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return null;
    var year = parseInt(parts[1], 10), month;
    if (year < 100) year += 2000;
    if (/^\d+$/.test(parts[0])) month = parseInt(parts[0], 10);
    else {
      var s = parts[0].slice(0, 3);
      s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      month = MONTHS.indexOf(s) + 1;
      if (!month) return null;
    }
    if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
    return [year, month];
  }

  function monthLabel(year, month) { return MONTHS[month - 1] + '-' + year; }

  function consumableCost(price, meters, cm) {
    if (price <= 0 || meters <= 0 || cm <= 0) return 0;
    return price / (meters * 100) * cm;
  }

  function monthBill(settings, picked, normal) {
    var lines = (settings.elec_history || []).map(function (l) {
      return (l.concat(['', '', '', ''])).slice(0, 4);
    });
    if (picked === AVERAGE_MONTHS) {
      var bills = lines.map(function (l) { return num(l[3]); }).filter(function (b) { return b > 0; });
      return bills.length ? bills.reduce(function (a, b) { return a + b; }, 0) / bills.length : normal;
    }
    for (var i = 0; i < lines.length; i++) {
      if (picked && lines[i][0] === picked && num(lines[i][3]) > 0) return num(lines[i][3]);
    }
    return normal;
  }

  function costEverything(recipe, settings) {
    var out = {};
    var lines = (recipe.rows || []).map(function (row) {
      var r = (row.concat(['', '', '', ''])).slice(0, 4);
      return [num(r[1]), num(r[2]), num(r[3])];
    });
    out.lines = lines.map(function (l) { return costRow(l[0], l[1], l[2]); });
    var vatPercent = num(settings.vat_percent);
    out.weight_worked = out.lines.reduce(function (a, l) { return a + l[1]; }, 0);   // ingredients added up
    out.weight = num(recipe.total_weight) > 0 ? num(recipe.total_weight) : out.weight_worked;   // or typed by hand
    var batch = num(recipe.batch_size);
    if (!batch) batch = out.weight;                   // empty batch: the total weight
    var cr = costRecipe(lines, batch, num(recipe.product_size), vatPercent,
                        recipe.made_by || 'UNITS');
    var sub = cr[0], vat = cr[1], total = cr[2], products = cr[3], portion = cr[4];
    out.products_worked = products;                 // what the sums give
    if (num(recipe.total_products) > 0) {            // typed in by hand: use it
      products = num(recipe.total_products); portion = sub / products;
    }
    var used = (recipe.consumables || []).map(function (line) {
      var l = (line.concat(['', '', '', ''])).slice(0, 4);
      return consumableCost(num(l[1]), num(l[2]), num(l[3]));
    });
    var extra = used.reduce(function (a, b) { return a + b; }, 0);
    if (extra) {
      sub += extra; vat = sub * vatPercent / 100; total = sub + vat;
      portion = products ? sub / products : 0;
    }
    Object.assign(out, { vat_percent: vatPercent, sub: sub, vat: vat, total: total,
                         products: products, portion: portion, consumables: used,
                         consumables_total: extra });

    var rates = {};
    (settings.staff || []).forEach(function (p) {
      var name = String(p[0] || '').trim();
      if (name && !(name in rates)) rates[name] = hourlyRate(num(p[1]));
    });
    out.rates = rates;

    var count = Math.trunc(num(recipe.staff_count || '1')) || 1;
    count = Math.max(1, Math.min(STAFF_SLOTS, count));
    var usedStaff = (recipe.labour || []).slice(0, count).map(function (l) {
      return [rates[String(l[0] || '').trim()] || 0, num(l[1]), num(l[2])];
    });
    var lab = costLabour(usedStaff, products);
    Object.assign(out, { staff_count: count, used: usedStaff, preps: lab[0],
                         labour_batch: lab[1], labour_serving: lab[2] });

    var c = Object.assign({}, SHARED_COSTS, recipeCosts(), settings.costs || {}, recipe.costs || {});
    var gasType = settings.gas_type || 'GAS CANISTER';
    var gi = gasInputs(c, gasType);
    var g = gasCostPerMinute(gi[0], gi[1], c.flame_low === 'YES', c.flame_medium === 'YES',
                             c.flame_high === 'YES', flameRates(gasType));
    var gas = gasPerDish(g[1], num(c.gas_hours), num(c.gas_minutes), products);
    var bill = monthBill(settings, c.elec_month, num(c.elec_bill));
    var avgBill = monthBill(settings, AVERAGE_MONTHS, num(c.elec_bill));
    out.elec_average = costElectric(avgBill, num(c.work_days), num(c.work_hours),
      num(c.overhead_percent), num(c.elec_hours), num(c.elec_minutes), products)[2];
    out.elec_bill = bill;
    out.wage_sum = usedStaff.reduce(function (a, l) { return a + l[0]; }, 0);
    var el = costElectric(bill, num(c.work_days), num(c.work_hours), num(c.overhead_percent),
                          num(c.elec_hours), num(c.elec_minutes), products);

    var method = settings.rent_method || '';
    var days = num(c.work_days);
    var rentDay = days ? num(c.rent_cost) / days : 0;
    var markup = num(String(c.rent_markup).replace('%', ''));
    var rent;
    if (method === 'PRODUCTION') {
      var made = num(settings.units_produced); rent = made ? num(c.rent_cost) / made : 0;
    } else if (method === 'CSV') {
      var sold = num(settings.units_sold); rent = sold ? num(c.rent_cost) / sold : 0;
    } else if (method === 'CALCULATOR') rent = num(c.rent_per_dish);
    else if (method === 'NONE') { rent = 0; rentDay = 0; }
    else rent = products ? rentDay * markup / 100 / products : 0;
    out.rent_day = rentDay;
    var packaging = packagingPerServing(num(c.pack_cost), num(c.pack_units));
    Object.assign(out, { gas_per_kg: g[0], gas_minute: g[1], gas: gas, elec_minute: el[0],
                         elec_batch: el[1], elec: el[2], rent: rent, packaging: packaging });

    var totalPortion = portion + lab[2] + packaging + gas + el[2] + rent;
    var price = num(c.selling_price);
    var cp = costPrice(totalPortion, price, num(c.lowest_margin));
    var averageCost = products ? (g[1] * (num(c.avg_hours) + num(c.avg_minutes) / 60) / products + el[2]) : 0;
    Object.assign(out, { total_portion: totalPortion, price: price, margin: cp[0], profit: cp[1],
                         min_price: cp[2], min_profit: cp[3], alert: cp[4], average_cost: averageCost });
    return out;
  }

  function setUnits(settings) {          // currency and weights picked on MASTER COSTINGS
    E.SYMBOL = CURRENCIES[settings.currency] || CURRENCIES.THB;
    E.US = settings.weights === 'OZ / LB';
    E.PER = E.US ? 16 : 1000;
  }

  Object.assign(E, {
    CURRENCIES: CURRENCIES, MONTHS: MONTHS, FULL_MONTHS: FULL_MONTHS, GAS_TYPES: GAS_TYPES,
    AVERAGE_MONTHS: AVERAGE_MONTHS, HISTORY_ROWS: HISTORY_ROWS, SHARED_COSTS: SHARED_COSTS,
    blankRecipe: blankRecipe, blankSettings: blankSettings, newData: newData, recipeCosts: recipeCosts,
    num: num, money: money, whole: whole, commas: commas, excelRound: excelRound,
    costRow: costRow, costRecipe: costRecipe, hourlyRate: hourlyRate, costLabour: costLabour,
    flameRates: flameRates, gasCostPerMinute: gasCostPerMinute, gasPerDish: gasPerDish,
    costElectric: costElectric, costPrice: costPrice, plannedElectric: plannedElectric,
    splitShare: splitShare, electricMonth: electricMonth, gasMonth: gasMonth, gasInputs: gasInputs,
    electricLeft: electricLeft, parseMonth: parseMonth, monthLabel: monthLabel,
    monthBill: monthBill, costEverything: costEverything, setUnits: setUnits
  });
  root.SP = E;
  if (typeof module !== 'undefined') module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
