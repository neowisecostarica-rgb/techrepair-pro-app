/**
 * MENU DECLARATIVO — TechRepairPro
 * Fuente única de verdad para navegación.
 * El Layout filtra por capacidades resueltas por el backend.
 * Esta configuración es solo UX; cada comando sigue autorizado en backend.
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

export const MENU_ITEMS = [
  // ── Sin categoría (siempre visible arriba) ──────────────────────────────────
  {
    label: 'Mi Día',
    path: 'MiDia',
    icon: Sun,
    category: null,
    anyCapabilities: ['TECHNICAL_WORK'],
  },
  {
    label: 'Mis Ventas',
    path: 'MisVentas',
    icon: TrendingUp,
    category: null,
    anyCapabilities: ['SALE_OPERATIONS'],
  },

  // ── VISIÓN DEL NEGOCIO ──────────────────────────────────────────────────────
  {
    label: 'Resumen del Negocio',
    path: 'Dashboard',
    icon: LayoutDashboard,
    category: 'VISIÓN DEL NEGOCIO',
    anyCapabilities: ['FINANCIAL_READ'],
    tooltip: 'Antes: Dashboard',
  },
  {
    label: 'Estado Financiero',
    path: 'Finanzas',
    icon: LayoutDashboard,
    category: 'VISIÓN DEL NEGOCIO',
    anyCapabilities: ['FINANCIAL_READ'],
  },
  {
    label: 'Ventas y Ganancias',
    path: 'VentasMetricas',
    icon: LayoutDashboard,
    category: 'VISIÓN DEL NEGOCIO',
    anyCapabilities: ['FINANCIAL_READ'],
  },
  {
    label: 'Rendimiento del Equipo',
    path: 'ProductividadTecnicos',
    icon: Users,
    category: 'VISIÓN DEL NEGOCIO',
    anyCapabilities: ['TECHNICAL_SUPERVISION'],
  },
  {
    label: 'Análisis de Operaciones',
    path: 'AnalisisTrabajo',
    icon: FileText,
    category: 'VISIÓN DEL NEGOCIO',
    anyCapabilities: ['TECHNICAL_SUPERVISION'],
  },
  {
    label: 'Supervisión en Vivo',
    path: 'Operacion',
    icon: Wrench,
    category: 'VISIÓN DEL NEGOCIO',
    anyCapabilities: ['TECHNICAL_SUPERVISION'],
  },
  // ── TALLER ──────────────────────────────────────────────────────────────────
  {
    label: 'Órdenes de Trabajo',
    path: 'OrdenesTrabajo',
    icon: Wrench,
    category: 'TALLER',
    anyCapabilities: ['RECEPTION_OPERATIONS', 'TECHNICAL_WORK'],
  },
  {
    label: 'Cola de Revisión',
    path: 'ColaRevision',
    icon: FileText,
    category: 'TALLER',
    anyCapabilities: ['TECHNICAL_ASSIGNMENT'],
  },
  {
    label: 'Agenda',
    path: 'Agenda',
    icon: Calendar,
    category: 'TALLER',
    anyCapabilities: ['AGENDA_OPERATIONS', 'TECHNICAL_WORK'],
  },
  {
    label: 'Reciclaje',
    path: 'Reciclaje',
    icon: Recycle,
    category: 'TALLER',
    anyCapabilities: ['TECHNICAL_SUPERVISION'],
  },
  {
    label: 'No Conformidades',
    path: 'Calidad',
    icon: AlertCircle,
    category: 'TALLER',
    anyCapabilities: ['TECHNICAL_SUPERVISION'],
  },

  // ── VENTAS ──────────────────────────────────────────────────────────────────
  {
    label: 'Caja y Cobros',
    path: 'PuntoVenta',
    icon: ShoppingCart,
    category: 'VENTAS',
    anyCapabilities: ['SALE_OPERATIONS'],
    tooltip: 'Antes: Punto de Venta',
  },
  {
    label: 'Historial de Ventas',
    path: 'VentasHistorial',
    icon: FileText,
    category: 'VENTAS',
    anyCapabilities: ['SALE_OPERATIONS'],
  },
  {
    label: 'Cotizaciones',
    path: 'VentasCotizaciones',
    icon: FileText,
    category: 'VENTAS',
    anyCapabilities: ['QUOTE_OPERATIONS'],
  },
  {
    label: 'Garantías',
    path: 'VentasGarantias',
    icon: ShieldAlert,
    category: 'VENTAS',
    anyCapabilities: ['DELIVERY_OPERATIONS'],
  },

  // ── CLIENTES ────────────────────────────────────────────────────────────────
  {
    label: 'Clientes',
    path: 'Clientes',
    icon: Users,
    category: 'CLIENTES',
    anyCapabilities: ['CUSTOMER_SERVICE_OPERATIONS'],
  },
  {
    label: 'Gestión de Leads',
    path: 'CRM',
    icon: Users,
    category: 'CLIENTES',
    anyCapabilities: ['CRM_OPERATIONS'],
    tooltip: 'Antes: CRM',
  },

  // ── INVENTARIO ──────────────────────────────────────────────────────────────
  {
    label: 'Inventario',
    path: 'Inventario',
    icon: Package,
    category: 'INVENTARIO',
    anyCapabilities: ['INVENTORY_READ'],
  },

  // ── CONFIGURACIÓN (siempre al final) ────────────────────────────────────────
  {
    label: 'Configuración',
    path: 'Settings',
    icon: Settings,
    category: 'CONFIGURACIÓN',
    anyCapabilities: ['ORG_ADMINISTRATION'],
  },

  // ── SUPER_ADMIN (panel SaaS) ────────────────────────────────────────────────
  {
    label: 'Panel SaaS',
    path: 'Saas',
    icon: LayoutDashboard,
    category: null,
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Admin Reset',
    path: 'AdminReset',
    icon: AlertCircle,
    category: null,
    platformRoles: ['SUPER_ADMIN'],
  },
];
