/**
 * SidebarMenu — navegación declarativa
 * Filtra MENU_ITEMS por effectiveRole del usuario.
 * No contiene if/else por rol.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { MENU_ITEMS } from '@/config/menuConfig';

export default function SidebarMenu({ effectiveRole, currentPageName, sidebarOpen, sectionsOpen, toggleSection }) {
  // Filtrar ítems permitidos para este rol
  const allowedItems = MENU_ITEMS.filter(item => item.roles.includes(effectiveRole));

  // Agrupar por categoría manteniendo orden de aparición
  const categories = [];
  const seenCats = new Set();
  for (const item of allowedItems) {
    const cat = item.category;
    if (!seenCats.has(cat)) {
      seenCats.add(cat);
      categories.push(cat);
    }
  }

  return (
    <div className="space-y-1">
      {categories.map((category, catIndex) => {
        const items = allowedItems.filter(item => item.category === category);
        const needsSeparator = catIndex > 0 && category !== null;
        const isOpen = category === null || sectionsOpen[category] !== false;

        return (
          <div key={category ?? '__home__'} className={needsSeparator ? 'pt-4 mt-4 border-t border-slate-200' : ''}>
            {/* Encabezado de sección colapsable */}
            {sidebarOpen && category && (
              <button
                onClick={() => toggleSection(category)}
                className="w-full px-3 mb-2 flex items-center gap-2 hover:bg-slate-50 rounded-lg py-1 transition-colors"
              >
                {isOpen
                  ? <ChevronDown className="w-4 h-4 text-slate-400" />
                  : <ChevronRight className="w-4 h-4 text-slate-400" />}
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {category}
                </p>
              </button>
            )}

            {/* Ítems de la sección */}
            {isOpen && items.map((item) => {
              const Icon = item.icon;
              const isActive = currentPageName === item.path;
              return (
                <Link
                  key={`${item.path}-${item.label}`}
                  to={createPageUrl(item.path)}
                  title={sidebarOpen && item.tooltip ? item.tooltip : undefined}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-emerald-500'}`} />
                  {sidebarOpen && (
                    <>
                      <span className="flex-1 font-medium truncate">{item.label}</span>
                      {isActive && <ChevronRight className="w-4 h-4" />}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}