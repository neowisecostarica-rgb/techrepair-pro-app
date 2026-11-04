import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getRoleCapabilities } from '../base44/functions/_shared/roleCapabilities.ts';
import { MENU_ITEMS } from '../src/config/menuConfig.js';
import { isMenuItemEligible } from '../src/components/layout/SidebarMenu.jsx';

test('warranties menu matches actual allowed page roles', () => {
  const warranty = MENU_ITEMS.find(item => item.path === 'VentasGarantias');
  assert.ok(warranty);
  const roles = ['ORG_ADMIN','BRANCH_ADMIN','SALES','CUSTOMER_SERVICE','TECHNICIAN','INVENTORY'];
  const source = readFileSync(new URL('../src/pages/VentasGarantias.jsx', import.meta.url), 'utf8');
  const allowed = [...source.match(/PageGuard allowedRoles=\{\[([^\]]+)\]\}/)[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  for (const role of roles) {
    const visible = isMenuItemEligible(warranty, { effectiveRole: role, capabilities: getRoleCapabilities(role) });
    assert.equal(visible, allowed.includes(role), role);
  }
  assert.equal(isMenuItemEligible(warranty, { effectiveRole: 'CUSTOMER_SERVICE', capabilities: getRoleCapabilities('CUSTOMER_SERVICE') }), false);
});
