import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const saas = readFileSync(new URL('../src/pages/Saas.jsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/components/layout/SidebarMenu.jsx', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../src/config/menuConfig.js', import.meta.url), 'utf8');

const checks = [
  ['Router location is observed', () => assert.match(saas, /const \{ hash \} = useLocation\(\)/)],
  ['Section derives from the current URL', () => assert.match(saas, /const requestedSection = hash\.slice\(1\)/)],
  ['No unreliable hashchange-only subscription', () => assert.doesNotMatch(saas, /addEventListener\(['"]hashchange/)],
  ['Console shortcuts use router navigation', () => assert.match(saas, /navigate\(\`\/Saas#\$\{target\}\`\)/)],
  ['Organization shortcut uses router navigation', () => assert.match(saas, /navigate\('\/Saas#organizations'\)/)],
  ['Sidebar uses router Links', () => assert.match(sidebar, /<Link[\s\S]*?to=\{\`\$\{createPageUrl\(item\.path\)\}/)],
  ['Platform guard remains restrictive', () => assert.match(saas, /<PageGuard allowedRoles=\{\['SUPER_ADMIN'\]\}>/)],
];

const sections = ['overview', 'organizations', 'commercial', 'health', 'audit', 'pilot'];
for (const section of sections) {
  checks.push(['Sidebar route exists: ' + section, () => assert.ok(menu.includes("hash: '" + section + "'"))]);
  checks.push(['Console route exists: ' + section, () => assert.ok(saas.includes("'" + section + "'"))]);
}

for (const [label, verify] of checks) {
  verify();
  process.stdout.write('PASS: ' + label + '\n');
}
process.stdout.write('PASS: ' + checks.length + '/' + checks.length + ' Super Admin hash-navigation contracts\n');
