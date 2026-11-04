import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/components/layout/SidebarMenu.jsx', import.meta.url), 'utf8');

test('route change resets document scroll to top centrally', () => {
  assert.match(app, /function ScrollToTopOnModuleChange\(\)/);
  assert.match(app, /useLayoutEffect\(\(\) =>/);
  assert.match(app, /window\.scrollTo\(\{ top: 0, left: 0/);
  assert.match(app, /document\.scrollingElement\.scrollTop = 0/);
  assert.match(app, /\}, \[pathname\]\)/);
  assert.match(app, /<ScrollToTopOnModuleChange \/>/);
});
test('scroll reset retains native anchor/hash semantics', () => {
  assert.match(app, /if \(hash\) return;/);
});
test('sidebar keeps independent overflow scroll', () => {
  const layout = readFileSync(new URL('../src/Layout.jsx', import.meta.url), 'utf8');
  assert.match(layout, /<nav className="flex-1 overflow-y-auto p-4">/);
  assert.match(sidebar, /<Link/);
});
