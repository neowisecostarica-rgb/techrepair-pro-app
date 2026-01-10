import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * Formulario canónico de cliente - ÚNICO componente para crear/editar clientes
 * Usado tanto en módulo Clientes como en OT
 */
export default function FormularioCliente({ 
  cliente = null, 
  efectiveOrgId, 
  onGuardar, 
  onCancelar 
}) {
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [clienteExistente, setClienteExistente] = useState(null);
  const [formData, setFormData] = useState({
    nombre_completo: '',
    identificacion: '',
    tipo_cliente: 'individual',
    telefono: '',
    email: '',
    direccion: '',
    notas: ''
  });

  useEffect(() => {
    if (cliente) {
      setFormData({
        nombre_completo: cliente.nombre_completo || '',
        identificacion: cliente.identificacion || '',
        tipo_cliente: cliente.tipo_cliente || 'individual',
        telefono: cliente.telefono || '',
        email: cliente.email || '',
        direccion: cliente.direccion || '',
        notas: cliente.notas || ''
      });
    }
  }, [cliente]);

  const validarIdentificacion = async (identificacion) => {
    if (!identificacion || identificacion.length < 3) {
      setClienteExistente(null);
      return;
    }

    setChecking(true);
    try {
      const existentes = await base44.entities.Cliente.filter({
        organization_id: efectiveOrgId,
        identificacion: identificacion
      });

      if (existentes.length > 0 && (!cliente || existentes[0].id !== cliente.id)) {
        setClienteExistente(existentes[0]);
      } else {
        setClienteExistente(null);
      }
    } catch (error) {
      console.error('Error validando identificación:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleIdentificacionChange = (value) => {
    setFormData({ ...formData, identificacion: value });
    
    // Validar después de 500ms de inactividad
    const timer = setTimeout(() => {
      validarIdentificacion(value);
    }, 500);

    return () => clearTimeout(timer);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.nombre_completo || !formData.identificacion || !formData.telefono) {
      alert('Nombre completo, identificación y teléfono son obligatorios');
      return;
    }

    if (clienteExistente) {
      alert('Ya existe un cliente con esta identificación. Por favor usa el cliente existente.');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        organization_id: efectiveOrgId
      };

      let clienteGuardado;
      if (cliente) {
        clienteGuardado = await base44.entities.Cliente.update(cliente.id, data);
      } else {
        clienteGuardado = await base44.entities.Cliente.create(data);
      }

      onGuardar(clienteGuardado);
    } catch (error) {
      console.error('Error guardando cliente:', error);
      alert('Error al guardar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const usarClienteExistente = () => {
    if (clienteExistente) {
      onGuardar(clienteExistente);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Alert className="bg-blue-50 border-blue-200">
        <AlertCircle className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          La <strong>identificación</strong> es obligatoria para evitar confusión de clientes y equipos. 
          Clientes con el mismo nombre pueden causar errores operativos.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nombre Completo *</Label>
          <Input
            value={formData.nombre_completo}
            onChange={(e) => setFormData({ ...formData, nombre_completo: e.target.value })}
            placeholder="Nombre completo del cliente"
            required
          />
        </div>

        <div className="space-y-2">
          <Label>Identificación (Cédula/Pasaporte/RUT) *</Label>
          <div className="relative">
            <Input
              value={formData.identificacion}
              onChange={(e) => handleIdentificacionChange(e.target.value)}
              placeholder="ID único del cliente"
              required
              disabled={!!cliente}
            />
            {checking && (
              <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-slate-400" />
            )}
          </div>
          {cliente && (
            <p className="text-xs text-slate-500">
              La identificación no puede modificarse después de crear el cliente
            </p>
          )}
        </div>
      </div>

      {clienteExistente && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-900">
            <strong>Este cliente ya existe:</strong> {clienteExistente.nombre_completo}
            <br />
            <span className="text-sm">
              Teléfono: {clienteExistente.telefono} | Email: {clienteExistente.email || 'No registrado'}
            </span>
            <div className="mt-2">
              <Button
                type="button"
                size="sm"
                onClick={usarClienteExistente}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Usar este cliente existente
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipo de Cliente *</Label>
          <Select
            value={formData.tipo_cliente}
            onValueChange={(value) => setFormData({ ...formData, tipo_cliente: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Individual</SelectItem>
              <SelectItem value="empresa">Empresa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Teléfono *</Label>
          <Input
            value={formData.telefono}
            onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
            placeholder="+56 9 1234 5678"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Email</Label>
        <Input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="correo@ejemplo.com"
        />
      </div>

      <div className="space-y-2">
        <Label>Dirección</Label>
        <Input
          value={formData.direccion}
          onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
          placeholder="Dirección física del cliente"
        />
      </div>

      <div className="space-y-2">
        <Label>Notas</Label>
        <Textarea
          value={formData.notas}
          onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
          placeholder="Información adicional sobre el cliente"
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancelar} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || !!clienteExistente} className="bg-emerald-600">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {cliente ? 'Actualizar Cliente' : 'Crear Cliente'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}