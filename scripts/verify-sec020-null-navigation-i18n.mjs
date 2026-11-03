import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const i18n = readFileSync('src/i18n/index.jsx', 'utf8');
const sidebar = readFileSync('src/components/layout/SidebarMenu.jsx', 'utf8');
const search = readFileSync('src/components/search/GlobalSearch.jsx', 'utf8');
const config = readFileSync('src/config/menuConfig.js', 'utf8');
assert.ok(i18n.includes("typeof path === 'string' && path.length > 0 ? path.split('.')"), 'i18n getter must reject null/undefined/non-string keys before split');
assert.ok(sidebar.includes('{categoryKey[category] ? t(categoryKey[category], category) : category}'), 'unmapped categories must fall back without invalid translation key');
assert.ok(sidebar.includes("item.i18nKey ? t(item.i18nKey, item.label) : item.label"), 'items with null translation key keep literal label');
assert.ok(search.includes("matches(item.i18nKey ? t(item.i18nKey, item.label) : item.label, needle)"));
assert.ok(search.includes("label: item.i18nKey ? t(item.i18nKey, item.label) : item.label"));
assert.ok(config.includes("i18nKey: null"), 'test case actually exists in declarative navigation');
// Test exact null-handling helper from implementation without needing a browser.
const extraction = i18n.match(/const get=\(obj,path\)=>([^;]+);/);
assert.ok(extraction, 'translation getter should be extractable');
const get = new Function('obj', 'path', 'return ' + extraction[1]);
const catalog = { nav: { today: 'Hoy' } };
assert.equal(get(catalog, 'nav.today'), 'Hoy');
for (const missing of [null, undefined, 0, {}, '']) {
  assert.equal(get(catalog, missing), undefined, 'invalid i18n key must not throw: ' + String(missing));
}
assert.equal(get(catalog, 'nav.absent'), undefined);
console.log('PASS SEC-020: null/undefined i18n keys cannot crash menu; valid keys work; search and sidebar fallback tested');
