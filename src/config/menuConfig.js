/**
 * MENU DECLARATIVO — TRP / Technology Reliability Platform
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
  AlertCircle,
  Settings,
  FileText,
  Sun,
  ShieldAlert,
  Activity,
  Laptop,
  Building2,
  CreditCard,
  HeartPulse,
  ScrollText,
  FlaskConical,
  UserMinus,
  ShieldCheck,
} from 'lucide-react';

export const MENU_ITEMS = [
  // ── Sin categoría (siempre visible arriba) ──────────────────────────────────
  {
    label: 'Hoy',
    path: 'MiDia',
    icon: Sun,
    category: null,
    anyCapabilities: ['TECHNICAL_WORK', 'TECHNICAL_SUPERVISION', 'FINANCIAL_READ'],
  },

  // ── VISIÓN DEL NEGOCIO ──────────────────────────────────────────────────────
  {
    label: 'Negocio',
    path: 'Dashboard',
    icon: LayoutDashboard,
    category: 'NEGOCIO',
    anyCapabilities: ['FINANCIAL_READ'],
  },

  {
    label: 'Operación',
    path: 'Operacion',
    icon: Activity,
    category: 'NEGOCIO',
    anyCapabilities: ['TECHNICAL_SUPERVISION'],
  },
  // ── TALLER ──────────────────────────────────────────────────────────────────
  {
    label: 'Órdenes',
    path: 'OrdenesTrabajo',
    icon: Wrench,
    category: 'TALLER',
    anyCapabilities: ['RECEPTION_OPERATIONS', 'TECHNICAL_WORK'],
  },
  {
    label: 'Activos',
    path: 'Activos',
    icon: Laptop,
    category: 'TALLER',
    anyCapabilities: ['RECEPTION_OPERATIONS', 'TECHNICAL_WORK', 'TECHNICAL_SUPERVISION'],
  },
  {
    label: 'Offboarding',
    path: 'EnterpriseOffboarding',
    icon: UserMinus,
    category: 'TALLER',
    anyCapabilities: ['ORG_ADMINISTRATION'],
  },
  {
    label: 'Control Enterprise',
    path: 'EnterpriseCommand',
    icon: ShieldCheck,
    category: 'NEGOCIO',
    anyCapabilities: ['ORG_ADMINISTRATION'],
  },
  {
    label: 'Agenda',
    path: 'Agenda',
    icon: Calendar,
    category: 'TALLER',
    anyCapabilities: ['AGENDA_OPERATIONS', 'TECHNICAL_WORK'],
  },

  // ── CLIENTES Y VENTAS ───────────────────────────────────────────────────────
  {
    label: 'Caja y Cobros',
    path: 'PuntoVenta',
    icon: ShoppingCart,
    category: 'CLIENTES Y VENTAS',
    anyCapabilities: ['SALE_OPERATIONS'],
  },
  {
    label: 'Cotizaciones',
    path: 'VentasCotizaciones',
    icon: FileText,
    category: 'CLIENTES Y VENTAS',
    anyCapabilities: ['QUOTE_OPERATIONS'],
  },
  {
    label: 'Garantías',
    path: 'VentasGarantias',
    icon: ShieldAlert,
    category: 'CLIENTES Y VENTAS',
    anyCapabilities: ['DELIVERY_OPERATIONS'],
  },

  // ── CLIENTES ────────────────────────────────────────────────────────────────
  {
    label: 'Clientes',
    path: 'Clientes',
    icon: Users,
    category: 'CLIENTES Y VENTAS',
    anyCapabilities: ['CUSTOMER_SERVICE_OPERATIONS'],
  },

  // ── INVENTARIO ──────────────────────────────────────────────────────────────
  {
    label: 'Inventario',
    path: 'Inventario',
    icon: Package,
    category: 'TALLER',
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

  // ── SUPER_ADMIN — TRP Platform Console ──────────────────────────────────────
  {
    label: 'Resumen',
    path: 'Saas',
    hash: 'overview',
    icon: LayoutDashboard,
    category: null,
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Organizaciones',
    path: 'Saas',
    hash: 'organizations',
    icon: Building2,
    category: 'PLATAFORMA',
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Comercial y planes',
    path: 'Saas',
    hash: 'commercial',
    icon: CreditCard,
    category: 'PLATAFORMA',
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Estado de plataforma',
    path: 'Saas',
    hash: 'health',
    icon: HeartPulse,
    category: 'CONTROL',
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Auditoría',
    path: 'Saas',
    hash: 'audit',
    icon: ScrollText,
    category: 'CONTROL',
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Control de piloto',
    path: 'Saas',
    hash: 'pilot',
    icon: FlaskConical,
    category: 'CONTROL',
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Restablecimiento admin',
    path: 'AdminReset',
    icon: AlertCircle,
    category: 'SENSITIVE',
    platformRoles: ['SUPER_ADMIN'],
  },
];
