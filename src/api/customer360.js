import { base44 } from '@/api/base44Client';

export const customer360QueryKeys = {
  detail: (clienteId) => ['customer-360', clienteId],
};

function unwrap(response, fallbackMessage) {
  const data = response?.data ?? response;
  if (!data || data.error) {
    throw new Error(data?.error || fallbackMessage);
  }
  return data;
}

export async function getCustomer360(clienteId) {
  const response = await base44.functions.invoke('customer360Gateway', {
    action: 'get',
    cliente_id: clienteId,
  });
  return unwrap(response, 'No se pudo cargar el expediente del cliente');
}

export async function recordCustomerMessage(clienteId, message) {
  const response = await base44.functions.invoke('customer360Gateway', {
    action: 'recordMessage',
    cliente_id: clienteId,
    message,
  });
  return unwrap(response, 'No se pudo registrar el mensaje');
}
