import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../src/i18n/index.jsx';
import SidebarMenu from '../src/components/layout/SidebarMenu.jsx';
import { MENU_ITEMS } from '../src/config/menuConfig.js';
import { getRoleCapabilities } from '../base44/functions/_shared/roleCapabilities.ts';

assert.ok(MENU_ITEMS.some(item => item.i18nKey === null && item.path === 'CRM'), 'reproduce CRM null i18nKey');
assert.ok(MENU_ITEMS.some(item => item.i18nKey === null && item.path === 'ColaRevision'), 'reproduce review-queue null i18nKey');
for (const role of ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'TECHNICIAN', 'INVENTORY', 'CUSTOMER_SERVICE']) {
  const markup = renderToStaticMarkup(
    React.createElement(I18nProvider,null,
      React.createElement(MemoryRouter,null,
        React.createElement(SidebarMenu, {
          effectiveRole:role,
          capabilities:getRoleCapabilities(role),
          currentPageName:'MiDia',
          sidebarOpen:true,
          sectionsOpen:{},
          toggleSection:()=>{},
        })
      )
    )
  );
  assert.ok(markup.includes('Hoy') || markup.includes('Órdenes') || markup.includes('Inventario'), role + ' renders a menu');
  if (role === 'SALES' || role === 'ORG_ADMIN' || role === 'BRANCH_ADMIN') {
    assert.ok(markup.includes('CRM'), role + ' CRM should render without t(null)');
  }
  if (role === 'TECHNICIAN') assert.ok(!markup.includes('CRM'), 'no role escalation');
  console.log('PASS server render: '+role);
}
console.log('SEC-020 PASS: null i18nKey fallback displays labels, other menu permissions intact');
