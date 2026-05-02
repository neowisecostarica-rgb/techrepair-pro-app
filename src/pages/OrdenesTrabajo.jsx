import React, { useEffect, useState } from "react";
import { useAuthContext } from "@/components/contexts/AuthContext";
import { sotFetch } from "@/lib/sotFetch";

import FormularioCliente from "@/components/clientes/FormularioCliente";
import QuickCreateEquipo from "@/components/ot/QuickCreateEquipo";

// 🔥 IMPORTS CORREGIDOS (AQUÍ ESTABA EL ERROR)
import { crearOrdenTrabajo } from "@/components/ot/crearOrdenTrabajo";
import { transicionarEstadoOT } from "@/components/ot/transicionarEstadoOT";

export default function OrdenesTrabajo() {
  const { effectiveOrgId } = useAuthContext();

  const [ordenes, setOrdenes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos] = useState([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!effectiveOrgId) return;

    async function loadData() {
      try {
        setLoading(true);

        const [ordenesData, clientesData, equiposData] = await Promise.all([
          sotFetch("/v1/work-orders", effectiveOrgId),
          sotFetch("/v1/clients", effectiveOrgId),
          sotFetch("/v1/equipment", effectiveOrgId),
        ]);

        setOrdenes(ordenesData || []);
        setClientes(clientesData || []);
        setEquipos(equiposData || []);
      } catch (error) {
        console.error("Error cargando datos:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [effectiveOrgId]);

  // =========================
  // CREAR ORDEN
  // =========================
  const handleCrearOrden = async () => {
    try {
      const nuevaOrden = await crearOrdenTrabajo(
        {
          cliente_id: clientes[0]?.id,
          equipo_id: equipos[0]?.id,
          motivo_ingreso: "Prueba",
        },
        effectiveOrgId
      );

      setOrdenes((prev) => [nuevaOrden, ...prev]);
    } catch (error) {
      console.error("Error creando OT:", error);
    }
  };

  // =========================
  // CAMBIAR ESTADO
  // =========================
  const handleCambiarEstado = async (id) => {
    try {
      await transicionarEstadoOT({
        ordenTrabajoId: id,
        nuevoEstado: "EN_REVISION",
        effectiveOrgId,
      });

      setOrdenes((prev) =>
        prev.map((o) =>
          o.id === id ? { ...o, estado: "EN_REVISION" } : o
        )
      );
    } catch (error) {
      console.error("Error cambiando estado:", error);
    }
  };

  // =========================
  // RENDER
  // =========================
  if (loading) return <div>Cargando...</div>;

  return (
    <div>
      <h1>Órdenes de Trabajo</h1>

      <button onClick={handleCrearOrden}>
        Crear Orden de Prueba
      </button>

      <ul>
        {ordenes.map((orden) => (
          <li key={orden.id}>
            <strong>{orden.motivo_ingreso}</strong> - {orden.estado}
            <button onClick={() => handleCambiarEstado(orden.id)}>
              Avanzar Estado
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}