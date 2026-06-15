/**
 * MENU DECLARATIVO — TechRepairPro
 * Fuente única de verdad para navegación.
 * El Layout filtra por `roles` del ítem vs effectiveRole del usuario.
 * category: null = sin sección (aparece arriba sin encabezado)
 */

import {
  LayoutDashboard,
  Wrench,
  Package,
  Users,
  ShoppingCart,
  Calendar,
  Recycle,
  AlertCircle,
  Settings,
  FileText,
  Sun,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';

// Roles que pueden acceder a cada ítem
const ALL_ORG = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'SUPPORT'];
const ADMIN_ONLY = ['ORG_ADMIN', 'BRANCH_ADMIN'];
const ORG_ADMIN_ONLY = ['ORG_ADMIN'];
const TECH_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'];
const SALES_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'];
const SUPER_ADMIN_ONLY = ['SUPER_ADMIN'];

export const MENU_ITEMS = [
  // ── Sin categoría (siempre visible arriba) ──────────────────────────────────
  {
    label: 'Mi Día',
    path: 'MiDia',
    icon: Sun,
    category: null,
    roles: ALL_ORG,
  },
  {
    label: 'Mis Ventas',
    path: 'MisVentas',
    icon: TrendingUp,
    category: null,
    roles: ['SALES'],
  },

  // ── VISIÓN DEL NEGOCIO ──────────────────────────────────────────────────────
  {
    label: 'Resumen del Negocio',
    path: 'Dashboard',
    icon: LayoutDashboard,
    category: 'VISIÓN DEL NEGOCIO',
    roles: ADMIN_ONLY,
    tooltip: 'Antes: Dashboard',
  },
  {
    label: 'Estado Financiero',
    path: 'Finanzas',
    icon: LayoutDashboard,
    category: 'VISIÓN DEL NEGOCIO',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Ventas y Ganancias',
    path: 'VentasMetricas',
    icon: LayoutDashboard,
    category: 'VISIÓN DEL NEGOCIO',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Rendimiento del Equipo',
    path: 'ProductividadTecnicos',
    icon: Users,
    category: 'VISIÓN DEL NEGOCIO',
    roles: ORG_ADMIN_ONLY,
  },
  {
    label: 'Análisis de Operaciones',
    path: 'AnalisisTrabajo',
    icon: FileText,
    category: 'VISIÓN DEL NEGOCIO',
    roles: ORG_ADMIN_ONLY,
  },
  {
    label: 'Supervisión en Vivo',
    path: 'Operacion',
    icon: Wrench,
    category: 'VISIÓN DEL NEGOCIO',
    roles: ADMIN_ONLY,
  },
  {
    label: 'Mis Estadísticas',
    path: 'Dashboard',
    icon: LayoutDashboard,
    category: 'VISIÓN DEL NEGOCIO',
    roles: ['TECHNICIAN'],
  },

  // ── TALLER ──────────────────────────────────────────────────────────────────
  {
    label: 'Órdenes de Trabajo',
    path: 'OrdenesTrabajo',
    icon: Wrench,
    category: 'TALLER',
    roles: [...TECH_ROLES, 'SALES'],
  },
  {
    label: 'Cola de Revisión',
    path: 'ColaRevision',
    icon: FileText,
    category: 'TALLER',
    roles: SALES_ROLES,
  },
  {
    label: 'Agenda',
    path: 'Agenda',
    icon: Calendar,
    category: 'TALLER',
    roles: [...TECH_ROLES, 'SALES'],
  },
  {
    label: 'Reciclaje',
    path: 'Reciclaje',
    icon: Recycle,
    category: 'TALLER',
    roles: ADMIN_ONLY,
  },
  {
    label: 'No Conformidades',
    path: 'Calidad',
    icon: AlertCircle,
    category: 'TALLER',
    roles: ADMIN_ONLY,
  },

  // ── VENTAS ──────────────────────────────────────────────────────────────────
  {
    label: 'Caja y Cobros',
    path: 'PuntoVenta',
    icon: ShoppingCart,
    category: 'VENTAS',
    roles: SALES_ROLES,
    tooltip: 'Antes: Punto de Venta',
  },
  {
    label: 'Historial de Ventas',
    path: 'VentasHistorial',
    icon: FileText,
    category: 'VENTAS',
    roles: SALES_ROLES,
  },
  {
    label: 'Cotizaciones',
    path: 'VentasCotizaciones',
    icon: FileText,
    category: 'VENTAS',
    roles: SALES_ROLES,
  },
  {
    label: 'Garantías',
    path: 'VentasGarantias',
    icon: ShieldAlert,
    category: 'VENTAS',
    roles: SALES_ROLES,
  },

  // ── CLIENTES ────────────────────────────────────────────────────────────────
  {
    label: 'Clientes',
    path: 'Clientes',
    icon: Users,
    category: 'CLIENTES',
    roles: [...SALES_ROLES, 'SUPPORT'],
  },
  {
    label: 'Gestión de Leads',
    path: 'CRM',
    icon: Users,
    category: 'CLIENTES',
    roles: SALES_ROLES,
    tooltip: 'Antes: CRM',
  },

  // ── INVENTARIO ──────────────────────────────────────────────────────────────
  {
    label: 'Inventario',
    path: 'Inventario',
    icon: Package,
    category: 'INVENTARIO',
    roles: [...ADMIN_ONLY, 'INVENTORY', 'TECHNICIAN'],
  },

  // ── CONFIGURACIÓN (siempre al final) ────────────────────────────────────────
  {
    label: 'Configuración',
    path: 'Settings',
    icon: Settings,
    category: 'CONFIGURACIÓN',
    roles: ORG_ADMIN_ONLY,
  },

  // ── SUPER_ADMIN (panel SaaS) ────────────────────────────────────────────────
  {
    label: 'Panel SaaS',
    path: 'Saas',
    icon: LayoutDashboard,
    category: null,
    roles: SUPER_ADMIN_ONLY,
  },
  {
    label: 'Admin Reset',
    path: 'AdminReset',
    icon: AlertCircle,
    category: null,
    roles: SUPER_ADMIN_ONLY,
  },
];