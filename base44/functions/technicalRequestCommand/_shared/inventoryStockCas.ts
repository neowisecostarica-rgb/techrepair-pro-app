export async function applyInventoryStockCas(entity, input) {
  return applyInventoryProjectionCas(entity, {
    inventoryId: input.inventoryId,
    organizationId: input.organizationId,
    branchId: input.branchId,
    expectedAvailable: input.expectedStock,
    expectedReserved: input.expectedReserved ?? 0,
    newAvailable: input.newStock,
    newReserved: input.newReserved ?? input.expectedReserved ?? 0,
    movementDate: input.movementDate,
    operationKey: input.operationKey,
    movementKey: input.operationId,
    legacySaleId: input.operationId,
    legacySaleOperationKey: input.operationKey,
  });
}

export async function rollbackInventoryStockCas(entity, input) {
  return rollbackInventoryProjectionCas(entity, {
    inventoryId: input.inventoryId,
    organizationId: input.organizationId,
    branchId: input.branchId,
    expectedAvailable: input.expectedCurrentStock,
    expectedReserved: input.expectedCurrentReserved ?? 0,
    previousAvailable: input.previousStock,
    previousReserved: input.previousReserved ?? input.expectedCurrentReserved ?? 0,
    previousMovementDate: input.previousMovementDate,
    operationKey: input.operationKey,
    movementKey: input.operationId,
    legacySaleId: input.operationId,
    legacySaleOperationKey: input.operationKey,
  });
}

export async function applyInventoryProjectionCas(entity, input) {
  const query = {
    id: input.inventoryId,
    organization_id: input.organizationId,
    cantidad_disponible: input.expectedAvailable,
  };
  if (Number(input.expectedReserved) === 0) {
    query.$or = [
      { cantidad_reservada: 0 },
      { cantidad_reservada: null },
      { cantidad_reservada: { $exists: false } },
    ];
  } else query.cantidad_reservada = input.expectedReserved;
  if (input.branchId) query.branch_id = input.branchId;
  const set = {
    cantidad_disponible: input.newAvailable,
    cantidad_reservada: input.newReserved,
    fecha_ultimo_movimiento: input.movementDate,
    last_inventory_operation_key: input.operationKey,
    last_inventory_movement_key: input.movementKey,
  };
  if (input.legacySaleId) set.last_sale_id = input.legacySaleId;
  if (input.legacySaleOperationKey) set.last_sale_operation_key = input.legacySaleOperationKey;
  return entity.updateMany(query, { $set: set });
}

export async function rollbackInventoryProjectionCas(entity, input) {
  const query = {
    id: input.inventoryId,
    organization_id: input.organizationId,
    cantidad_disponible: input.expectedAvailable,
    last_inventory_operation_key: input.operationKey,
    last_inventory_movement_key: input.movementKey,
  };
  if (Number(input.expectedReserved) === 0) {
    query.$or = [
      { cantidad_reservada: 0 },
      { cantidad_reservada: null },
      { cantidad_reservada: { $exists: false } },
    ];
  } else query.cantidad_reservada = input.expectedReserved;
  if (input.branchId) query.branch_id = input.branchId;
  const unset = {
    last_inventory_operation_key: '',
    last_inventory_movement_key: '',
  };
  if (input.legacySaleId) unset.last_sale_id = '';
  if (input.legacySaleOperationKey) unset.last_sale_operation_key = '';
  return entity.updateMany(query, {
    $set: {
      cantidad_disponible: input.previousAvailable,
      cantidad_reservada: input.previousReserved,
      fecha_ultimo_movimiento: input.previousMovementDate ?? null,
    },
    $unset: unset,
  });
}
