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
  UserPlus,
  ShieldCheck,
} from 'lucide-react';

export const MENU_ITEMS = [
  // ── Sin categoría (siempre visible arriba) ──────────────────────────────────
  {
    label: 'Hoy',
    i18nKey: 'nav.today',
    path: 'MiDia',
    icon: Sun,
    category: null,
    anyCapabilities: ['TECHNICAL_WORK', 'TECHNICAL_SUPERVISION', 'FINANCIAL_READ'],
  },

  // ── VISIÓN DEL NEGOCIO ──────────────────────────────────────────────────────
  {
    label: 'Negocio',
    i18nKey: 'nav.business',
    path: 'Dashboard',
    icon: LayoutDashboard,
    category: 'NEGOCIO',
    anyCapabilities: ['FINANCIAL_READ'],
  },

  {
    label: 'Operación',
    i18nKey: 'nav.operation',
    path: 'Operacion',
    icon: Activity,
    category: 'NEGOCIO',
    anyCapabilities: ['TECHNICAL_SUPERVISION'],
  },
  // ── TALLER ──────────────────────────────────────────────────────────────────
  {
    label: 'Órdenes',
    i18nKey: 'nav.orders',
    path: 'OrdenesTrabajo',
    icon: Wrench,
    category: 'TALLER',
    anyCapabilities: ['RECEPTION_OPERATIONS', 'TECHNICAL_WORK'],
  },
  {
    label: 'Activos',
    i18nKey: 'nav.assets',
    path: 'Activos',
    icon: Laptop,
    category: 'TALLER',
    anyCapabilities: ['RECEPTION_OPERATIONS', 'TECHNICAL_WORK', 'TECHNICAL_SUPERVISION'],
  },
  {
    label: 'Onboarding',
    i18nKey: 'nav.onboarding',
    path: 'EnterpriseOnboarding',
    icon: UserPlus,
    category: 'TALLER',
    anyCapabilities: ['ENTERPRISE_ONBOARDING'],
  },
  {
    label: 'Offboarding',
    i18nKey: 'nav.offboarding',
    path: 'EnterpriseOffboarding',
    icon: UserMinus,
    category: 'TALLER',
    anyCapabilities: ['ENTERPRISE_OFFBOARDING'],
  },
  {
    label: 'Control Enterprise',
    i18nKey: 'nav.enterpriseControl',
    path: 'EnterpriseCommand',
    icon: ShieldCheck,
    category: 'NEGOCIO',
    anyCapabilities: ['ENTERPRISE_COMMAND_EVIDENCE'],
  },
  {
    label: 'Agenda',
    i18nKey: 'nav.agenda',
    path: 'Agenda',
    icon: Calendar,
    category: 'TALLER',
    anyCapabilities: ['AGENDA_OPERATIONS', 'TECHNICAL_WORK'],
  },

  // ── CLIENTES Y VENTAS ───────────────────────────────────────────────────────
  {
    label: 'Caja y Cobros',
    i18nKey: 'nav.checkout',
    path: 'PuntoVenta',
    icon: ShoppingCart,
    category: 'CLIENTES Y VENTAS',
    anyCapabilities: ['SALE_OPERATIONS'],
  },
  {
    label: 'Cotizaciones',
    i18nKey: 'nav.quotes',
    path: 'VentasCotizaciones',
    icon: FileText,
    category: 'CLIENTES Y VENTAS',
    anyCapabilities: ['QUOTE_OPERATIONS'],
  },
  {
    label: 'Garantías',
    i18nKey: 'nav.warranties',
    path: 'VentasGarantias',
    icon: ShieldAlert,
    category: 'CLIENTES Y VENTAS',
    anyCapabilities: ['DELIVERY_OPERATIONS'],
  },

  // ── CLIENTES ────────────────────────────────────────────────────────────────
  {
    label: 'Clientes',
    i18nKey: 'nav.customers',
    path: 'Clientes',
    icon: Users,
    category: 'CLIENTES Y VENTAS',
    anyCapabilities: ['CUSTOMER_SERVICE_OPERATIONS'],
  },

  // ── INVENTARIO ──────────────────────────────────────────────────────────────
  {
    label: 'Inventario',
    i18nKey: 'nav.inventory',
    path: 'Inventario',
    icon: Package,
    category: 'TALLER',
    anyCapabilities: ['INVENTORY_READ'],
  },

  // ── CONFIGURACIÓN (siempre al final) ────────────────────────────────────────
  {
    label: 'Configuración',
    i18nKey: 'nav.settings',
    path: 'Settings',
    icon: Settings,
    category: 'CONFIGURACIÓN',
    anyCapabilities: ['ORG_ADMINISTRATION'],
  },

  // ── SUPER_ADMIN — TRP Platform Console ──────────────────────────────────────
  {
    label: 'Resumen',
    i18nKey: 'nav.overview',
    path: 'Saas',
    hash: 'overview',
    icon: LayoutDashboard,
    category: null,
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Organizaciones',
    i18nKey: 'nav.organizations',
    path: 'Saas',
    hash: 'organizations',
    icon: Building2,
    category: 'PLATAFORMA',
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Comercial y planes',
    i18nKey: 'nav.commercial',
    path: 'Saas',
    hash: 'commercial',
    icon: CreditCard,
    category: 'PLATAFORMA',
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Estado de plataforma',
    i18nKey: 'nav.health',
    path: 'Saas',
    hash: 'health',
    icon: HeartPulse,
    category: 'CONTROL',
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Auditoría',
    i18nKey: 'nav.audit',
    path: 'Saas',
    hash: 'audit',
    icon: ScrollText,
    category: 'CONTROL',
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Control de piloto',
    i18nKey: 'nav.pilot',
    path: 'Saas',
    hash: 'pilot',
    icon: FlaskConical,
    category: 'CONTROL',
    platformRoles: ['SUPER_ADMIN'],
  },
  {
    label: 'Restablecimiento admin',
    i18nKey: 'nav.adminReset',
    path: 'AdminReset',
    icon: AlertCircle,
    category: 'SENSITIVE',
    platformRoles: ['SUPER_ADMIN'],
  },
];
