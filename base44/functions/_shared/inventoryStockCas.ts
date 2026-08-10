export async function applyInventoryStockCas(entity, input) {
  return entity.updateMany({
    id: input.inventoryId,
    organization_id: input.organizationId,
    cantidad_disponible: input.expectedStock,
  }, {
    $set: {
      cantidad_disponible: input.newStock,
      fecha_ultimo_movimiento: input.movementDate,
      last_sale_id: input.operationId,
      last_sale_operation_key: input.operationKey,
    },
  });
}

export async function rollbackInventoryStockCas(entity, input) {
  return entity.updateMany({
    id: input.inventoryId,
    organization_id: input.organizationId,
    cantidad_disponible: input.expectedCurrentStock,
    last_sale_id: input.operationId,
    last_sale_operation_key: input.operationKey,
  }, {
    $set: {
      cantidad_disponible: input.previousStock,
      fecha_ultimo_movimiento: input.previousMovementDate ?? null,
    },
    $unset: { last_sale_id: '', last_sale_operation_key: '' },
  });
}
