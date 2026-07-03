import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

/**
 * Formulario canónico de cliente - ÚNICO componente para crear/editar clientes
 * Usado tanto en módulo Clientes como en OT
 * mode="quick" → nombre_completo, identificacion, telefono, email (opcional), tipo_cliente — 1 columna, mobile-first
 * mode="full"  → todos los campos (default)
 */
export default function FormularioCliente({ 
  cliente = null, 
  onGuardar, 
  onCancelar,
  mode = 'full'
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [showNoEmailWarning, setShowNoEmailWarning] = useState(false);
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

  const handleFieldChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
    setIsDirty(true);
  };

  const doCreate = async () => {
    setSaving(true);
    try {
      const response = await base44.functions.invoke('createClient', {
        nombre_completo: formData.nombre_completo,
        identificacion: formData.identificacion,
        tipo_cliente: formData.tipo_cliente,
        telefono: formData.telefono,
        email: formData.email || undefined,
        direccion: formData.direccion || undefined,
        notas: formData.notas || undefined,
      });
      onGuardar(response.data);
    } catch (error) {
      console.error('Error creando cliente:', error);
      setApiError('Error al crear cliente: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);

    if (!formData.nombre_completo || !formData.identificacion || !formData.telefono) {
      setApiError('Nombre completo, identificación y teléfono son obligatorios.');
      return;
    }

    if (cliente) {
      // EDICIÓN
      setSaving(true);
      try {
        const response = await base44.functions.invoke('updateClient', {
          cliente_id: cliente.id,
          nombre_completo: formData.nombre_completo,
          tipo_cliente: formData.tipo_cliente,
          telefono: formData.telefono,
          email: formData.email || undefined,
          direccion: formData.direccion || undefined,
          notas: formData.notas || undefined,
        });
        toast({ title: 'Cliente actualizado', description: `${formData.nombre_completo} fue actualizado correctamente.` });
        onGuardar(response.data);
      } catch (error) {
        console.error('Error actualizando cliente:', error);
        setApiError('Error al actualizar cliente: ' + error.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    // CREACIÓN — advertencia suave si no hay email en mode quick
    if (mode === 'quick' && !formData.email) {
      setShowNoEmailWarning(true);
      return;
    }

    await doCreate();
  };

  const isQuick = mode === 'quick';

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {apiError && (
          <Alert className="bg-red-50 border-red-200">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <AlertDescription className="text-red-800">{apiError}</AlertDescription>
          </Alert>
        )}

        {isQuick ? (
          /* ── QUICK: 1 columna, mobile-first, orden conversacional ── */
          <>
            <div className="space-y-2">
              <Label>Nombre Completo *</Label>
              <Input
                value={formData.nombre_completo}
                onChange={(e) => handleFieldChange('nombre_completo', e.target.value)}
                placeholder="Nombre completo del cliente"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Identificación *</Label>
              <Input
                value={formData.identificacion}
                onChange={(e) => handleFieldChange('identificacion', e.target.value)}
                placeholder="ID único del cliente"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Teléfono *</Label>
              <Input
                value={formData.telefono}
                onChange={(e) => handleFieldChange('telefono', e.target.value)}
                placeholder="+506 8888-8888"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Correo Electrónico</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                placeholder="correo@ejemplo.com"
              />
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Info className="w-3 h-3 flex-shrink-0" />
                Recomendado para portal del cliente y notificaciones.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Cliente *</Label>
              <Select
                value={formData.tipo_cliente}
                onValueChange={(value) => handleFieldChange('tipo_cliente', value)}
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
          </>
        ) : (
          /* ── FULL: layout 2 columnas original ── */
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre Completo *</Label>
                <Input
                  value={formData.nombre_completo}
                  onChange={(e) => handleFieldChange('nombre_completo', e.target.value)}
                  placeholder="Nombre completo del cliente"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Identificación *</Label>
                <Input
                  value={formData.identificacion}
                  onChange={(e) => handleFieldChange('identificacion', e.target.value)}
                  placeholder="ID único del cliente"
                  required
                  disabled={!!cliente}
                />
                {cliente && (
                  <p className="text-xs text-slate-500">
                    La identificación no puede modificarse después de crear el cliente
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Cliente *</Label>
                <Select
                  value={formData.tipo_cliente}
                  onValueChange={(value) => handleFieldChange('tipo_cliente', value)}
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
                  onChange={(e) => handleFieldChange('telefono', e.target.value)}
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
                onChange={(e) => handleFieldChange('email', e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input
                value={formData.direccion}
                onChange={(e) => handleFieldChange('direccion', e.target.value)}
                placeholder="Dirección física del cliente"
              />
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={formData.notas}
                onChange={(e) => handleFieldChange('notas', e.target.value)}
                placeholder="Información adicional sobre el cliente"
                rows={3}
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => {
              if (isDirty && !saving) {
                if (window.confirm('¿Descartar los cambios sin guardar?')) {
                  onCancelar();
                }
              } else {
                onCancelar();
              }
            }} 
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
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

      {/* Advertencia suave — sin email en mode quick */}
      <AlertDialog open={showNoEmailWarning} onOpenChange={setShowNoEmailWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este cliente no tendrá correo registrado</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Sin correo electrónico, este cliente no tendrá acceso a:</p>
                <ul className="space-y-1 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                    Portal del Cliente
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                    Notificaciones por correo
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                    Recuperación de acceso
                  </li>
                </ul>
                <p className="text-slate-500">¿Desea continuar de todas formas?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowNoEmailWarning(false)}>
              Volver y agregar correo
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowNoEmailWarning(false);
                await doCreate();
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Continuar sin correo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}