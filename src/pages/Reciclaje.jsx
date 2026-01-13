import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Recycle, Plus, Leaf, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

// Factores ecológicos del sistema (hardcoded, siempre disponibles)
const ECO_FACTORS = {
  electronico: { co2_por_kg: 2.5, valor_por_kg: 5000 },
  plastico: { co2_por_kg: 1.8, valor_por_kg: 800 },
  metal: { co2_por_kg: 3.0, valor_por_kg: 1500 },
  papel: { co2_por_kg: 0.9, valor_por_kg: 400 },
  bateria: { co2_por_kg: 4.5, valor_por_kg: 3000 },
  otro: { co2_por_kg: 1.0, valor_por_kg: 500 }
};

export default function Reciclaje() {
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const queryClient = useQueryClient();

  const { data: registros = [] } = useQuery({
    queryKey: ['reciclaje'],
    queryFn: () => base44.entities.Reciclaje.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Reciclaje.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reciclaje'] });
      setShowModal(false);
      setEditingItem(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Reciclaje.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reciclaje'] });
      setShowModal(false);
      setEditingItem(null);
    },
  });

  const handleSubmit = (data) => {
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Calcular métricas
  const totalPeso = registros.reduce((sum, r) => sum + (r.peso_kg || 0), 0);
  const totalCarbono = registros.reduce((sum, r) => sum + (r.huella_carbono_evitada_kg || 0), 0);
  const totalValor = registros.reduce((sum, r) => sum + (r.valor_recuperado || 0), 0);
  const reutilizados = registros.filter(r => r.accion === 'reutilizado').length;
  const porcentajeReutilizacion = registros.length > 0 ? (reutilizados / registros.length * 100) : 0;

  // Datos para gráfico
  const residuosPorTipo = registros.reduce((acc, r) => {
    const tipo = r.tipo_residuo || 'otro';
    acc[tipo] = (acc[tipo] || 0) + 1;
    return acc;
  }, {});

  const chartData = Object.entries(residuosPorTipo).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Reciclaje y Sostenibilidad</h1>
          <p className="text-slate-500">Gestión de desechos e impacto ecológico</p>
        </div>
        <Button
          onClick={() => { setEditingItem(null); setShowModal(true); }}
          className="bg-gradient-to-r from-green-600 to-emerald-500 hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Registro
        </Button>
      </div>

      {/* KPIs Ecológicos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Peso Total Reciclado</p>
                <p className="text-3xl font-bold text-green-700">{totalPeso.toFixed(1)} kg</p>
              </div>
              <Recycle className="w-10 h-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-cyan-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">CO₂ Evitado</p>
                <p className="text-3xl font-bold text-blue-700">{totalCarbono.toFixed(1)} kg</p>
              </div>
              <Leaf className="w-10 h-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">% Reutilización</p>
                <p className="text-3xl font-bold text-purple-700">{porcentajeReutilizacion.toFixed(1)}%</p>
              </div>
              <TrendingUp className="w-10 h-10 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Valor Recuperado</p>
                <p className="text-3xl font-bold text-amber-700">₡{totalValor.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-10 h-10 text-amber-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico y Registros */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-semibold">Distribución por Tipo</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-0 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-semibold">Registros Recientes</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {registros.slice(0, 10).map((registro) => (
                <div
                  key={registro.id}
                  className="p-4 border border-slate-200 rounded-lg hover:border-emerald-500 transition-colors cursor-pointer"
                  onClick={() => { setEditingItem(registro); setShowModal(true); }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-green-100 text-green-700 border-0 capitalize">
                          {registro.tipo_residuo}
                        </Badge>
                        <Badge className={`${
                          registro.accion === 'reciclado' ? 'bg-emerald-100 text-emerald-700' :
                          registro.accion === 'reutilizado' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-700'
                        } border-0`}>
                          {registro.accion}
                        </Badge>
                      </div>
                      <p className="font-medium text-slate-900">{registro.descripcion}</p>
                      <div className="flex gap-4 mt-2 text-xs text-slate-500">
                        <span>Peso: {registro.peso_kg} kg</span>
                        {registro.huella_carbono_evitada_kg > 0 && (
                          <span className="text-green-600">
                            CO₂ evitado: {registro.huella_carbono_evitada_kg} kg
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {registros.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <Recycle className="w-16 h-16 mx-auto mb-3 opacity-20" />
                  <p>No hay registros de reciclaje</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal Crear/Editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingItem ? 'Editar Registro' : 'Nuevo Registro de Reciclaje'}
            </DialogTitle>
          </DialogHeader>

          <ReciclajeForm 
            editingItem={editingItem}
            onSubmit={handleSubmit}
            onCancel={() => setShowModal(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =====================================================
// COMPONENTE: Formulario de Reciclaje con cálculo automático
// =====================================================
function ReciclajeForm({ editingItem, onSubmit, onCancel }) {
  const [tipoResiduo, setTipoResiduo] = useState(editingItem?.tipo_residuo || '');
  const [pesoKg, setPesoKg] = useState(editingItem?.peso_kg || 0);
  const [accion, setAccion] = useState(editingItem?.accion || 'pendiente');
  const [calculatedValues, setCalculatedValues] = useState({
    co2_evitado: editingItem?.huella_carbono_evitada_kg || 0,
    valor_recuperado: editingItem?.valor_recuperado || 0
  });

  // Calcular valores automáticamente cuando cambien los inputs relevantes
  useEffect(() => {
    // Si no hay tipo de residuo o peso, poner a 0
    if (!tipoResiduo || !pesoKg || pesoKg <= 0) {
      setCalculatedValues({ co2_evitado: 0, valor_recuperado: 0 });
      return;
    }

    // Si la acción es desecho_seguro o pendiente, poner a 0
    if (accion === 'desecho_seguro' || accion === 'pendiente') {
      setCalculatedValues({ co2_evitado: 0, valor_recuperado: 0 });
      return;
    }

    // Obtener el factor ecológico (SIEMPRE existe, fallback a 'otro')
    const factor = ECO_FACTORS[tipoResiduo] || ECO_FACTORS.otro;

    // Calcular valores
    const co2 = pesoKg * factor.co2_por_kg;
    const valor = pesoKg * factor.valor_por_kg;

    setCalculatedValues({
      co2_evitado: parseFloat(co2.toFixed(2)),
      valor_recuperado: parseFloat(valor.toFixed(2))
    });
  }, [tipoResiduo, pesoKg, accion]);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    // Normalizar peso (replace comas por puntos)
    const pesoInput = formData.get('peso_kg');
    const pesoNormalizado = pesoInput ? parseFloat(pesoInput.toString().replace(',', '.')) : 0;

    const data = {
      tipo_residuo: formData.get('tipo_residuo'),
      descripcion: formData.get('descripcion'),
      peso_kg: pesoNormalizado,
      cantidad_unidades: parseInt(formData.get('cantidad_unidades')) || 0,
      origen: formData.get('origen'),
      accion: formData.get('accion'),
      destino: formData.get('destino'),
      empresa_recicladora: formData.get('empresa_recicladora'),
      huella_carbono_evitada_kg: calculatedValues.co2_evitado,
      valor_recuperado: calculatedValues.valor_recuperado,
      notas: formData.get('notas'),
    };

    onSubmit(data);
  };

  const formatMoneda = (valor) => {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: 'CRC',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(valor).replace('CRC', '₡');
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tipo_residuo">Tipo de Residuo *</Label>
          <Select 
            name="tipo_residuo" 
            value={tipoResiduo}
            onValueChange={setTipoResiduo}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="electronico">Electrónico</SelectItem>
              <SelectItem value="plastico">Plástico</SelectItem>
              <SelectItem value="metal">Metal</SelectItem>
              <SelectItem value="papel">Papel</SelectItem>
              <SelectItem value="bateria">Batería</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="accion">Acción *</Label>
          <Select 
            name="accion" 
            value={accion}
            onValueChange={setAccion}
            required
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reciclado">Reciclado</SelectItem>
              <SelectItem value="reutilizado">Reutilizado</SelectItem>
              <SelectItem value="donado">Donado</SelectItem>
              <SelectItem value="desecho_seguro">Desecho Seguro</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 col-span-2">
          <Label htmlFor="descripcion">Descripción *</Label>
          <Textarea
            id="descripcion"
            name="descripcion"
            defaultValue={editingItem?.descripcion}
            placeholder="Descripción del residuo..."
            rows={2}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="peso_kg">Peso (kg)</Label>
          <Input
            type="text"
            id="peso_kg"
            name="peso_kg"
            value={pesoKg}
            onChange={(e) => {
              const normalized = e.target.value.replace(',', '.');
              setPesoKg(parseFloat(normalized) || 0);
            }}
            placeholder="0.0"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cantidad_unidades">Cantidad Unidades</Label>
          <Input
            type="number"
            id="cantidad_unidades"
            name="cantidad_unidades"
            defaultValue={editingItem?.cantidad_unidades}
            min="0"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="origen">Origen</Label>
          <Select name="origen" defaultValue={editingItem?.origen}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reparacion">Reparación</SelectItem>
              <SelectItem value="desecho_cliente">Desecho Cliente</SelectItem>
              <SelectItem value="equipo_obsoleto">Equipo Obsoleto</SelectItem>
              <SelectItem value="otros">Otros</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="destino">Destino</Label>
          <Input
            id="destino"
            name="destino"
            defaultValue={editingItem?.destino}
            placeholder="Destino final..."
          />
        </div>

        <div className="space-y-2 col-span-2">
          <Label htmlFor="empresa_recicladora">Empresa Recicladora</Label>
          <Input
            id="empresa_recicladora"
            name="empresa_recicladora"
            defaultValue={editingItem?.empresa_recicladora}
          />
        </div>

        {/* Campos calculados automáticamente - READONLY */}
        <div className="space-y-2">
          <Label htmlFor="huella_carbono_evitada_kg" className="text-slate-600">
            CO₂ Evitado (kg)
          </Label>
          <div className="relative">
            <Input
              type="text"
              value={calculatedValues.co2_evitado}
              readOnly
              disabled
              className="bg-slate-100 text-slate-700 font-semibold border-slate-300"
            />
          </div>
          <p className="text-xs text-slate-500 italic">
            ✨ Calculado automáticamente según tipo, peso y acción
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="valor_recuperado" className="text-slate-600">
            Valor Recuperado
          </Label>
          <div className="relative">
            <Input
              type="text"
              value={formatMoneda(calculatedValues.valor_recuperado)}
              readOnly
              disabled
              className="bg-slate-100 text-slate-700 font-semibold border-slate-300"
            />
          </div>
          <p className="text-xs text-slate-500 italic">
            💰 Calculado automáticamente por el sistema
          </p>
        </div>

        <div className="space-y-2 col-span-2">
          <Label htmlFor="notas">Notas</Label>
          <Textarea
            id="notas"
            name="notas"
            defaultValue={editingItem?.notas}
            rows={2}
          />
        </div>
      </div>

      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" className="bg-gradient-to-r from-green-600 to-emerald-500">
          {editingItem ? 'Actualizar' : 'Crear'} Registro
        </Button>
      </div>
    </form>
  );
}