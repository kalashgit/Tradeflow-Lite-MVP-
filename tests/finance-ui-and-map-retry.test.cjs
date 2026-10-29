'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8'),css=fs.readFileSync('public/style.css','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
assert.ok(app.includes('data-action="tfFinanceMenu" data-menu="import"'),'Finance Import button');
assert.ok(app.includes('data-action="tfFinanceMenu" data-menu="export"'),'Finance Export button');
assert.ok(app.includes("tfFinanceMenu=tfFinanceMenu===el.dataset.menu?'':el.dataset.menu"),'Finance toggle actions work');
assert.ok(app.includes('data-action="tfFinanceMenuClose"'),'Finance menu can close');
for(const option of ['Income CSV','Expenses CSV','All transactions CSV']){
 assert.ok(app.includes(option),'Finance CSV menu option: '+option);
}
assert.ok(!app.includes('>Income photo</button>')&&!app.includes('>Expense photo</button>'),'Finance CSV menus exclude photo actions');
assert.ok(app.includes('data-action="tfPhotoStart"'),'Photo capture remains accessible from record workflows');
assert.ok(app.includes("if(action==='tfFinanceCSVExport')"),'Export handler exists');
assert.ok(app.includes("tfCashRows({payments:await all('payments'),expenses:await all('expenses')})"),'Export reads locally saved income/expense records');
assert.ok(app.includes("fields.map(f=>csvCell(r[f]))"),'Finance CSV escapes cell contents');
assert.ok(css.includes('--tf-income-neon:#00ed64')&&css.includes('--tf-expense-neon:#ff334d'),'Trading-style finance indicator colors');
assert.ok(app.includes("sum.net<0?'negative':'positive'"),'Net flow uses income green or expense red based on sign');
assert.ok(app.includes("format=jsonv2&addressdetails=1&limit=5"),'Geocoding matches structured address evidence');
assert.ok(app.includes("tab='map';await render();/* Map opens immediately"),'View Map does not silently send all addresses to a third party');
assert.ok(!app.includes("r.map_location_status==='no_address')return false"),'No-address status cannot permanently block a newly repaired address');
assert.ok(app.includes("record.map_location_status=raw?'address_review':'no_address'"),'Only missing addresses are explicitly marked no_address');
assert.ok(app.includes("opportunityGeoCacheId='tf-opportunity-geocode-cache-v2'"),'Retain structured geocoding response cache');
assert.ok(sw.includes('appearance-theme.css')&&sw.includes('appearance-theme.js'),'Appearance assets are cached for offline availability');
console.log('PASS: Finance Import and Export menus, neon money direction, correct net colors, full-map retry after address repair');
