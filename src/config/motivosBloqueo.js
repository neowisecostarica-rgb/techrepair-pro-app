/**
 * Catálogo controlado de motivos de bloqueo de diagnóstico.
 * Fuente de verdad para UI y backend.
 * Sincronizado con el enum motivo_bloqueo_diagnostico en OrdenTrabajo.
 */
export const MOTIVOS_BLOQUEO = {
  PENDIENTE_PAGO: {
    label: 'Pendiente de Pago',
    descripcion: 'La revisión diagnóstica requiere pago previo antes de proceder.',
    accion: 'Registrar cobro de revisión en Punto de Venta',
    rol_responsable: 'SALES',
    color: 'amber',
  },
  PENDIENTE_AUTORIZACION_GERENCIA: {
    label: 'Autorización Gerencial Requerida',
    descripcion: 'Esta OT requiere aprobación explícita de un administrador antes de diagnósticar.',
    accion: 'Contactar al administrador de sucursal para habilitar',
    rol_responsable: 'BRANCH_ADMIN',
    color: 'orange',
  },
  EN_GARANTIA_VERIFICACION: {
    label: 'Verificación de Garantía en Curso',
    descripcion: 'Se está validando si el equipo aplica para cobertura de garantía.',
    accion: 'Esperar resolución del proceso de garantía',
    rol_responsable: 'BRANCH_ADMIN',
    color: 'blue',
  },
  CLIENTE_CORPORATIVO_CREDITO: {
    label: 'Aprobación de Crédito Corporativo',
    descripcion: 'Cliente corporativo requiere autorización de crédito para proceder.',
    accion: 'Gestionar aprobación con el área comercial',
    rol_responsable: 'SALES',
    color: 'purple',
  },
  OTRO: {
    label: 'Bloqueo Administrativo',
    descripcion: 'El diagnóstico está bloqueado por razones administrativas.',
    accion: 'Contactar administración para resolver el bloqueo',
    rol_responsable: 'ORG_ADMIN',
    color: 'slate',
  },
};

/**
 * Opciones para select/dropdown en UI
 */
export const MOTIVOS_BLOQUEO_OPTIONS = Object.entries(MOTIVOS_BLOQUEO).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}));