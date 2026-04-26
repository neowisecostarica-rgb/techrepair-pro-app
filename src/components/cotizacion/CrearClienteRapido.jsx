import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserPlus, AlertCircle } from 'lucide-react';

const BACKEND_URL = 'https://techrepairpro-core-1.onrender.com';

export default function CrearClienteRapido({ open, onClose, onClienteCreado, effectiveOrgId, clientes = [] }) {
  const [formData, setFormData] = useState({
    nombre_completo: '',
    telefono: '',
    email: '',
    identificacion: '',
    direccion: ''
  });
  const [advertencia, setAdvertencia] = useState(null);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const handleClose = () => {
    setFormData({
      nombre_completo: '',
      telefono: '',
      email: '',
      identificacion: '',
      direccion: ''
    });
    setAdvertencia(null);
    onClose();
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    if (field === 'telefono' && value.length >= 8) {
      const existente = clientes.find(c => c.telefono === value);
      if (existente) {
        setAdvertencia({ tipo: 'telefono', cliente: existente });
      } else {
        setAdvertencia(null);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.nombre_completo || !formData.telefono) {
      alert('Nombre y teléfono son obligatorios');
      return;
    }

    if (formData.telefono.length < 8) {
      alert('El teléfono debe tener al menos 8 dígitos');
      return;
    }

    if (!effectiveOrgId) {
      alert('Organization no definida');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${BACKEND_URL}/v1/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': effectiveOrgId
        },
        body: JSON.stringify({
          full_name: formData.nombre_completo,
          phone: formData.telefono,
          email: formData.email,
          id_number: formData.identificacion,
          client_type: 'individual',
          notes: formData.direccion
        })
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || `Error ${response.status}`);
      }

      const nuevoCliente = resData.data;
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['clientes-cot'] });
      onClienteCreado(nuevoCliente);
      handleClose();
    } catch (error) {
      alert('Error al crear cliente: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const seleccionarExistente = () => {
    if (advertencia?.cliente) {
      onClienteCreado(advertencia.cliente);
      handleClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-600" />
            Crear Cliente Rápido
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {advertencia && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-sm">
                <p className="font-medium mb-2">Cliente existente encontrado</p>
                <p className="text-xs mb-2">
                  Ya existe un cliente con este teléfono: <strong>{advertencia.cliente.nombre_completo}</strong>
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={seleccionarExistente}
                  className="bg-amber-100 border-amber-300 hover:bg-amber-200"
                >
                  Usar cliente existente
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Nombre Completo *</Label>
            <Input
              value={formData.nombre_completo}
              onChange={(e) => handleChange('nombre_completo', e.target.value)}
              placeholder="Juan Pérez"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Teléfono *</Label>
            <Input
              value={formData.telefono}
              onChange={(e) => handleChange('telefono', e.target.value)}
              placeholder="8888-8888"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="cliente@ejemplo.com"
            />
          </div>

          <div className="space-y-2">
            <Label>Identificación</Label>
            <Input
              value={formData.identificacion}
              onChange={(e) => handleChange('identificacion', e.target.value)}
              placeholder="Cédula, pasaporte o ID"
            />
          </div>

          <div className="space-y-2">
            <Label>Dirección</Label>
            <Input
              value={formData.direccion}
              onChange={(e) => handleChange('direccion', e.target.value)}
              placeholder="Dirección física"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? 'Creando...' : 'Crear Cliente'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}