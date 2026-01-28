import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuthContext } from '@/components/contexts/AuthContext';

export default function BorradoMasivoNotificaciones({ organizationId }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const queryClient = useQueryClient();
  const { effectiveRole } = useAuthContext();

  // Solo SUPER_ADMIN y ORG_ADMIN
  const canDelete = ['SUPER_ADMIN', 'ORG_ADMIN'].includes(effectiveRole);

  // Contar notificaciones antes de borrar
  const { data: count = 0 } = useQuery({
    queryKey: ['notificaciones-count', organizationId],
    queryFn: async () => {
      const items = await base44.entities.Notificacion.filter({ organization_id: organizationId });
      return items.length;
    },
    enabled: open && !!organizationId,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Usar delete con query filter
      await base44.entities.Notificacion.delete({ 
        query: { organization_id: organizationId } 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
      setOpen(false);
      setConfirmed(false);
    },
  });

  if (!canDelete) return null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Borrar Notificaciones
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Borrado Masivo de Notificaciones
            </DialogTitle>
            <DialogDescription>
              Esta acción eliminará TODAS las notificaciones de esta organización.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert className="bg-red-50 border-red-300">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <AlertDescription className="text-red-800 text-sm">
                <strong>Acción irreversible</strong>
                <p className="mt-1">
                  Se eliminarán <strong>{count} notificaciones</strong> de forma permanente.
                  Esta acción no se puede deshacer.
                </p>
              </AlertDescription>
            </Alert>

            {!confirmed ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  ¿Estás seguro de que deseas continuar?
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => setConfirmed(true)}
                    className="flex-1 bg-red-600 hover:bg-red-700"
                  >
                    Sí, continuar
                  </Button>
                  <Button
                    onClick={() => setOpen(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Alert className="bg-amber-50 border-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 text-sm">
                    <strong>Última confirmación</strong>
                    <p className="mt-1">
                      Confirma que deseas eliminar {count} notificaciones de forma permanente.
                    </p>
                  </AlertDescription>
                </Alert>

                <div className="flex gap-3">
                  <Button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="flex-1 bg-red-600 hover:bg-red-700"
                  >
                    {deleteMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Eliminando...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Confirmar Eliminación
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => {
                      setConfirmed(false);
                      setOpen(false);
                    }}
                    variant="outline"
                    className="flex-1"
                    disabled={deleteMutation.isPending}
                  >
                    Cancelar
                  </Button>
                </div>

                {deleteMutation.isError && (
                  <Alert className="bg-red-50 border-red-300">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <AlertDescription className="text-red-800 text-sm">
                      Error al eliminar notificaciones: {deleteMutation.error?.message}
                    </AlertDescription>
                  </Alert>
                )}

                {deleteMutation.isSuccess && (
                  <Alert className="bg-emerald-50 border-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <AlertDescription className="text-emerald-800 text-sm">
                      Notificaciones eliminadas exitosamente
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}