// Search & common UI keys — merged into the main i18n messages.
// MB10-C: Eliminates fallback-only keys for search and common UI literals.

export const searchMessages = {
  es: {
    search: {
      page: 'Página',
      pages: 'Páginas',
      workOrders: 'Órdenes de Trabajo',
      customers: 'Clientes',
      equipment: 'Equipos',
      inventory: 'Inventario',
      placeholder: 'Buscar órdenes, clientes, equipos, inventario o páginas...',
      typeToSearch: 'Escribe para buscar en toda la plataforma',
      scopeHint: 'Órdenes · Clientes · Equipos · Inventario · Páginas',
      noResults: 'Sin resultados para "{q}"',
    },
    common: {
      optional: 'opcional',
      cancel: 'Cancelar',
    },
    reviewQueue: {
      assignNotConfirmed: 'La asignación no fue confirmada por el servidor',
      errorAssign: 'Error al asignar técnico',
      noAssigned: 'No hay órdenes asignadas',
      reasonPlaceholder: 'Ej: Técnico con mayor especialización, carga de trabajo...',
      assigning: 'Asignando...',
    },
    settings: {
      errorCreateBranch: 'No se pudo crear la sucursal',
      errorChangeBranch: 'No se pudo cambiar la sucursal',
    },
    suppliers: {
      notFound: 'No se encontraron proveedores',
      tryOtherSearch: 'Intenta con otra búsqueda',
      registerFirst: 'Registra tu primer proveedor usando el botón superior',
    },
    assetDetail: {
      economicContext: 'Contexto económico disponible',
      noExtraordinarySignals: 'Sin señales operativas extraordinarias',
      noLocationConfirmed: 'Sin ubicación confirmada',
      unknownBranch: 'Sucursal no identificada',
      conditionOnAssign: 'Condición al entregar',
      conditionOnReturn: 'Condición al devolver',
    },
    customerPortal: {
      orderNotFound: 'Orden no encontrada',
      errorApproval: 'No se pudo registrar la aprobación',
      errorRejection: 'No se pudo registrar el rechazo',
    },
    crm: {
      idPlaceholder: 'Cédula o identificación',
    },
    inventory: {
      adminOnlyField: 'Solo la administración principal puede modificar este campo',
    },
    otLayer: {
      waitingReview: 'En espera de revisión',
      readyForDelivery: 'Lista para entrega',
      pendingPayment: 'Pendiente de pago',
      enabled: '✓ Habilitado',
      review: 'Revisión:',
      paymentPendingBadge: '⚠ Pago pendiente',
    },
    otTimeline: {
      recepcion: 'Recepción', diagnostico: 'Diagnóstico', cotizacion: 'Cotización', reparacion: 'Reparación', pruebas: 'Pruebas', entrega: 'Entrega',
    },
    otBadge: {
      unassigned: 'Sin asignar', waitingCustomer: 'Esperando cliente', cancelled: 'Cancelada',
    },
    enterprise: {
      assetsInCustody: 'Activos en custodia',
      accessConfirmations: 'Confirmaciones de acceso',
    },
  },
  en: {
    search: {
      page: 'Page',
      pages: 'Pages',
      workOrders: 'Work Orders',
      customers: 'Customers',
      equipment: 'Equipment',
      inventory: 'Inventory',
      placeholder: 'Search work orders, customers, equipment, inventory or pages...',
      typeToSearch: 'Type to search across the platform',
      scopeHint: 'Work orders · Customers · Equipment · Inventory · Pages',
      noResults: 'No results for "{q}"',
    },
    common: {
      optional: 'optional',
      cancel: 'Cancel',
    },
    reviewQueue: {
      assignNotConfirmed: 'Assignment was not confirmed by the server',
      errorAssign: 'Error assigning technician',
      noAssigned: 'No assigned work orders',
      reasonPlaceholder: 'E.g. Technician with more expertise, workload...',
      assigning: 'Assigning...',
    },
    settings: {
      errorCreateBranch: 'Could not create branch',
      errorChangeBranch: 'Could not change branch',
    },
    suppliers: {
      notFound: 'No suppliers found',
      tryOtherSearch: 'Try another search',
      registerFirst: 'Register your first supplier using the button above',
    },
    assetDetail: {
      economicContext: 'Economic context available',
      noExtraordinarySignals: 'No extraordinary operational signals',
      noLocationConfirmed: 'No confirmed location',
      unknownBranch: 'Unidentified branch',
      conditionOnAssign: 'Condition on delivery',
      conditionOnReturn: 'Condition on return',
    },
    customerPortal: {
      orderNotFound: 'Work order not found',
      errorApproval: 'Could not register approval',
      errorRejection: 'Could not register rejection',
    },
    crm: {
      idPlaceholder: 'ID or identification',
    },
    inventory: {
      adminOnlyField: 'Only main administration can modify this field',
    },
    otLayer: {
      waitingReview: 'Waiting for review',
      readyForDelivery: 'Ready for delivery',
      pendingPayment: 'Pending payment',
      enabled: '✓ Enabled',
      review: 'Review:',
      paymentPendingBadge: '⚠ Payment pending',
    },
    otTimeline: {
      recepcion: 'Reception', diagnostico: 'Diagnosis', cotizacion: 'Quote', reparacion: 'Repair', pruebas: 'Testing', entrega: 'Delivery',
    },
    otBadge: {
      unassigned: 'Unassigned', waitingCustomer: 'Waiting for customer', cancelled: 'Cancelled',
    },
    enterprise: {
      assetsInCustody: 'Assets in custody',
      accessConfirmations: 'Access confirmations',
    },
  },
  pt: {
    search: {
      page: 'Página',
      pages: 'Páginas',
      workOrders: 'Ordens de Trabalho',
      customers: 'Clientes',
      equipment: 'Equipamentos',
      inventory: 'Inventário',
      placeholder: 'Buscar ordens, clientes, equipamentos, inventário ou páginas...',
      typeToSearch: 'Digite para buscar em toda a plataforma',
      scopeHint: 'Ordens · Clientes · Equipamentos · Inventário · Páginas',
      noResults: 'Sem resultados para "{q}"',
    },
    common: {
      optional: 'opcional',
      cancel: 'Cancelar',
    },
    reviewQueue: {
      assignNotConfirmed: 'A atribuição não foi confirmada pelo servidor',
      errorAssign: 'Erro ao atribuir técnico',
      noAssigned: 'Não há ordens atribuídas',
      reasonPlaceholder: 'Ex: Técnico com mais especialização, carga de trabalho...',
      assigning: 'Atribuindo...',
    },
    settings: {
      errorCreateBranch: 'Não foi possível criar a filial',
      errorChangeBranch: 'Não foi possível alterar a filial',
    },
    suppliers: {
      notFound: 'Nenhum fornecedor encontrado',
      tryOtherSearch: 'Tente outra busca',
      registerFirst: 'Registre seu primeiro fornecedor usando o botão superior',
    },
    assetDetail: {
      economicContext: 'Contexto econômico disponível',
      noExtraordinarySignals: 'Sem sinais operativos extraordinários',
      noLocationConfirmed: 'Sem localização confirmada',
      unknownBranch: 'Filial não identificada',
      conditionOnAssign: 'Condição ao entregar',
      conditionOnReturn: 'Condição ao devolver',
    },
    customerPortal: {
      orderNotFound: 'Ordem não encontrada',
      errorApproval: 'Não foi possível registrar a aprovação',
      errorRejection: 'Não foi possível registrar a rejeição',
    },
    crm: {
      idPlaceholder: 'CPF ou identificação',
    },
    inventory: {
      adminOnlyField: 'Apenas a administração principal pode modificar este campo',
    },
    otLayer: {
      waitingReview: 'Em espera por revisão',
      readyForDelivery: 'Lista para entrega',
      pendingPayment: 'Pendente de pagamento',
      enabled: '✓ Habilitado',
      review: 'Revisão:',
      paymentPendingBadge: '⚠ Pagamento pendente',
    },
    otTimeline: {
      recepcion: 'Recepção', diagnostico: 'Diagnóstico', cotizacion: 'Cotação', reparacion: 'Reparação', pruebas: 'Testes', entrega: 'Entrega',
    },
    otBadge: {
      unassigned: 'Sem atribuição', waitingCustomer: 'Aguardando cliente', cancelled: 'Cancelada',
    },
    enterprise: {
      assetsInCustody: 'Ativos em custódia',
      accessConfirmations: 'Confirmações de acesso',
    },
  },
  fr: {
    search: {
      page: 'Page',
      pages: 'Pages',
      workOrders: 'Ordres de Travail',
      customers: 'Clients',
      equipment: 'Équipements',
      inventory: 'Inventaire',
      placeholder: 'Rechercher ordres, clients, équipements, inventaire ou pages...',
      typeToSearch: 'Tapez pour rechercher sur toute la plateforme',
      scopeHint: 'Ordres · Clients · Équipements · Inventaire · Pages',
      noResults: 'Aucun résultat pour "{q}"',
    },
    common: {
      optional: 'facultatif',
      cancel: 'Annuler',
    },
    reviewQueue: {
      assignNotConfirmed: 'L\'attribution n\'a pas été confirmée par le serveur',
      errorAssign: 'Erreur lors de l\'attribution du technicien',
      noAssigned: 'Aucun ordre attribué',
      reasonPlaceholder: 'Ex. Technicien plus spécialisé, charge de travail...',
      assigning: 'Attribution...',
    },
    settings: {
      errorCreateBranch: 'Impossible de créer la succursale',
      errorChangeBranch: 'Impossible de modifier la succursale',
    },
    suppliers: {
      notFound: 'Aucun fournisseur trouvé',
      tryOtherSearch: 'Essayez une autre recherche',
      registerFirst: 'Enregistrez votre premier fournisseur avec le bouton supérieur',
    },
    assetDetail: {
      economicContext: 'Contexte économique disponible',
      noExtraordinarySignals: 'Aucun signal opérationnel extraordinaire',
      noLocationConfirmed: 'Aucune localisation confirmée',
      unknownBranch: 'Succursale non identifiée',
      conditionOnAssign: 'État à la remise',
      conditionOnReturn: 'État au retour',
    },
    customerPortal: {
      orderNotFound: 'Ordre introuvable',
      errorApproval: 'Impossible d\'enregistrer l\'approbation',
      errorRejection: 'Impossible d\'enregistrer le refus',
    },
    crm: {
      idPlaceholder: 'Pièce d\'identité ou identification',
    },
    inventory: {
      adminOnlyField: 'Seule l\'administration principale peut modifier ce champ',
    },
    otLayer: {
      waitingReview: 'En attente de révision',
      readyForDelivery: 'Prêt pour la livraison',
      pendingPayment: 'Paiement en attente',
      enabled: '✓ Activé',
      review: 'Révision :',
      paymentPendingBadge: '⚠ Paiement en attente',
    },
    otTimeline: {
      recepcion: 'Réception', diagnostico: 'Diagnostic', cotizacion: 'Devis', reparacion: 'Réparation', pruebas: 'Tests', entrega: 'Livraison',
    },
    otBadge: {
      unassigned: 'Non attribué', waitingCustomer: 'En attente client', cancelled: 'Annulée',
    },
    enterprise: {
      assetsInCustody: 'Actifs en garde',
      accessConfirmations: 'Confirmations d\'accès',
    },
  },
  no: {
    search: {
      page: 'Side',
      pages: 'Sider',
      workOrders: 'Arbeidsordrer',
      customers: 'Kunder',
      equipment: 'Utstyr',
      inventory: 'Lager',
      placeholder: 'Søk arbeidsordrer, kunder, utstyr, lager eller sider...',
      typeToSearch: 'Skriv for å søke på hele plattformen',
      scopeHint: 'Arbeidsordrer · Kunder · Utstyr · Lager · Sider',
      noResults: 'Ingen resultater for "{q}"',
    },
    common: {
      optional: 'valgfritt',
      cancel: 'Avbryt',
    },
    reviewQueue: {
      assignNotConfirmed: 'Tildelingen ble ikke bekreftet av serveren',
      errorAssign: 'Feil ved tildeling av tekniker',
      noAssigned: 'Ingen tildelte arbeidsordrer',
      reasonPlaceholder: 'F.eks. Tekniker med mer spesialisering, arbeidsmengde...',
      assigning: 'Tildeler...',
    },
    settings: {
      errorCreateBranch: 'Kunne ikke opprette avdeling',
      errorChangeBranch: 'Kunne ikke endre avdeling',
    },
    suppliers: {
      notFound: 'Ingen leverandører funnet',
      tryOtherSearch: 'Prøv et annet søk',
      registerFirst: 'Registrer din første leverandør med knappen ovenfor',
    },
    assetDetail: {
      economicContext: 'Økonomisk kontekst tilgjengelig',
      noExtraordinarySignals: 'Ingen ekstraordinære operative signaler',
      noLocationConfirmed: 'Ingen bekreftet plassering',
      unknownBranch: 'Uidentifisert avdeling',
      conditionOnAssign: 'Tilstand ved levering',
      conditionOnReturn: 'Tilstand ved retur',
    },
    customerPortal: {
      orderNotFound: 'Arbeidsordre ikke funnet',
      errorApproval: 'Kunne ikke registrere godkjenning',
      errorRejection: 'Kunne ikke registrere avslag',
    },
    crm: {
      idPlaceholder: 'ID eller identifikasjon',
    },
    inventory: {
      adminOnlyField: 'Bare hovedadministrasjonen kan endre dette feltet',
    },
    otLayer: {
      waitingReview: 'Venter på gjennomgang',
      readyForDelivery: 'Klar for levering',
      pendingPayment: 'Venter på betaling',
      enabled: '✓ Aktivert',
      review: 'Gjennomgang:',
      paymentPendingBadge: '⚠ Betaling venter',
    },
    otTimeline: {
      recepcion: 'Mottak', diagnostico: 'Diagnose', cotizacion: 'Tilbud', reparacion: 'Reparasjon', pruebas: 'Tester', entrega: 'Levering',
    },
    otBadge: {
      unassigned: 'Ikke tildelt', waitingCustomer: 'Venter på kunde', cancelled: 'Kansellert',
    },
    enterprise: {
      assetsInCustody: 'Eiendeler i forvaring',
      accessConfirmations: 'Tilgangsbekreftelser',
    },
  },
};