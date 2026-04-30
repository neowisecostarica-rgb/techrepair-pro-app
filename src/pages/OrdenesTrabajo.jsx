import { useEffect, useState } from "react";
import { useAuthContext } from "@/components/contexts/AuthContext";
import { sotFetch } from "@/lib/sotFetch";

import FormularioCliente from "@/components/clientes/FormularioCliente";
import QuickCreateEquipo from "@/components/ot/QuickCreateEquipo";
import crearOrdenTrabajo from "@/components/ot/crearOrdenTrabajo";
import transicionarEstadoOT from "@/components/ot/transicionarEstadoOT";

export default function OrdenesTrabajo() {
  const { effectiveOrgId } = useAuthContext();

  const [ordenes, setOrdenes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos] = useState([]);

  const [loading, setLoading] = useState(false);

  /*
  ========================================
  LOAD DATA (SOT)
  ========================================
  */
  async function loadData() {
    if (!effectiveOrgId) return;

    setLoading(true);

    try {
      const [ordenesData, clientesData, equiposData] = await Promise.all([
        sotFetch("/v1/work-orders", effectiveOrgId),
        sotFetch("/v1/clients", effectiveOrgId),
        sotFetch("/v1/equipment", effectiveOrgId),
      ]);

      setOrdenes(ordenesData || []);
      setClientes(clientesData || []);
      setEquipos(equiposData || []);
    } catch (error) {
      console.error("Error cargando datos:", error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [effectiveOrgId]);

  /*
  ========================================
  CREAR EQUIPO INLINE (SOT)
  ========================================
  */
  async function crearEquipoInline(payload) {
    try {
      await sotFetch("/v1/equipment", effectiveOrgId, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      await loadData();
    } catch (error) {
      console.error("Error creando equipo:", error.message);
    }
  }

  /*
  ========================================
  CREAR ORDEN DE TRABAJO
  ========================================
  */
  async function handleCrearOT(payload) {
    try {
      await crearOrdenTrabajo(payload, effectiveOrgId);
      await loadData();
    } catch (error) {
      console.error("Error creando OT:", error.message);
    }
  }

  /*
  ========================================
  CAMBIAR ESTADO OT
  ========================================
  */
  async function handleCambiarEstado(otId, nuevoEstado) {
    try {
      await transicionarEstadoOT({
        otId,
        nuevoEstado,
        organization_id: effectiveOrgId,
      });

      await loadData();
    } catch (error) {
      console.error("Error cambiando estado:", error.message);
    }
  }

  /*
  ========================================
  RENDER
  ========================================
  */
  if (loading) {
    return <div>Cargando órdenes...</div>;
  }

  return (
    <div>
      <h1>Órdenes de Trabajo</h1>

      {/* Crear Cliente */}
      <FormularioCliente efectiveOrgId={effectiveOrgId} />

      {/* Crear Equipo */}
      <QuickCreateEquipo
        effectiveOrgId={effectiveOrgId}
        onCreated={loadData}
      />

      {/* Crear OT */}
      <button
        onClick={() =>
          handleCrearOT({
            client_id: clientes[0]?.id,
            equipment_id: equipos[0]?.id,
            problem: "Diagnóstico inicial",
          })
        }
      >
        Crear OT rápida
      </button>

      {/* LISTADO */}
      <ul>
        {ordenes.map((ot) => (
          <li key={ot.id}>
            {ot.client_name} — {ot.status}
            <button
              onClick={() =>
                handleCambiarEstado(ot.id, "EN_PROCESO")
              }
            >
              Avanzar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}