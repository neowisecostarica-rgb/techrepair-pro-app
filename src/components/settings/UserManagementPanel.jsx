import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Search, UserX, Trash2, Edit, UserCheck } from 'lucide-react';

export default function UserManagementPanel({ organizationId, currentUserId, branches }) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [inviting, setInviting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery({
    queryKey: ['userAccounts', organizationId],
    queryFn: () => base44.entities.UserAccount.filter({ organization_id: organizationId }),
    enabled: !!organizationId,
  });

  const inviteUserMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.UserAccount.create({
        user_email: data.user_email,
        organization_id: organizationId,
        branch_id: data.branch_id || null,
        role: data.role,
        active: false,
        user_id: `pending_${data.user_email}_${Date.now()}`,
      });

      await base44.users.inviteUser(data.user_email, 'user');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userAccounts'] });
      setShowInviteModal(false);
      setInviting(false);
    },
    onError: () => {
      setInviting(false);
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.UserAccount.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userAccounts'] });
      setShowEditModal(false);
      setEditingUser(null);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id) => base44.entities.UserAccount.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userAccounts'] });
      setDeleteConfirm(null);
    },
  });

  const handleInviteUser = (e) => {
    e.preventDefault();
    setInviting(true);
    const formData = new FormData(e.target);
    inviteUserMutation.mutate({
      user_email: formData.get('user_email'),
      branch_id: formData.get('branch_id') || null,
      role: formData.get('role'),
    });
  };

  const handleUpdateUser = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    updateUserMutation.mutate({
      id: editingUser.id,
      data: {
        role: formData.get('role'),
        branch_id: formData.get('branch_id') || null,
        active: formData.get('active') === 'true',
      },
    });
  };

  const handleDeactivate = (user) => {
    if (confirm(`¿Desactivar acceso de ${user.user_email}?\n\nEl usuario no podrá iniciar sesión pero su historial quedará intacto.`)) {
      updateUserMutation.mutate({
        id: user.id,
        data: { active: false },
      });
    }
  };

  const handleActivate = (user) => {
    updateUserMutation.mutate({
      id: user.id,
      data: { active: true },
    });
  };

  const handleDelete = (user) => {
    setDeleteConfirm(user);
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      deleteUserMutation.mutate(deleteConfirm.id);
    }
  };

  const getBranchName = (branchId) => {
    const branch = branches.find(b => b.id === branchId);
    return branch?.name || '-';
  };

  const filteredUsers = users.filter(u =>
    !searchTerm ||
    u.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle>Gestión de Usuarios</CardTitle>
            <Button onClick={() => setShowInviteModal(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Invitar Usuario
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Buscar por email o rol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Tabla de usuarios */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Rol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Sucursal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-900">{user.user_email}</td>
                    <td className="px-4 py-3">
                      <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">
                        {user.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {getBranchName(user.branch_id)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={user.active 
                        ? 'bg-emerald-100 text-emerald-700 border-0 text-xs' 
                        : 'bg-slate-100 text-slate-700 border-0 text-xs'}>
                        {user.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingUser(user);
                            setShowEditModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {user.active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivate(user)}
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            disabled={user.user_id === currentUserId}
                          >
                            <UserX className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleActivate(user)}
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          >
                            <UserCheck className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(user)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={user.user_id === currentUserId}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Invitar Usuario */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar Usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInviteUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user_email">Email *</Label>
              <Input id="user_email" name="user_email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rol *</Label>
              <Select name="role" required>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORG_ADMIN">Administrador Organización</SelectItem>
                  <SelectItem value="BRANCH_ADMIN">Administrador Sucursal</SelectItem>
                  <SelectItem value="TECHNICIAN">Técnico</SelectItem>
                  <SelectItem value="SALES">Ventas</SelectItem>
                  <SelectItem value="AUDITOR">Auditor</SelectItem>
                  <SelectItem value="CFO">CFO</SelectItem>
                  <SelectItem value="CEO">CEO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch_id">Sucursal (Opcional)</Label>
              <Select name="branch_id">
                <SelectTrigger>
                  <SelectValue placeholder="Sin sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowInviteModal(false)} disabled={inviting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={inviting}>
                {inviting ? 'Invitando...' : 'Invitar Usuario'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Usuario */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={editingUser.user_email} disabled className="bg-slate-50" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Rol *</Label>
                <Select name="role" defaultValue={editingUser.role} required>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORG_ADMIN">Administrador Organización</SelectItem>
                    <SelectItem value="BRANCH_ADMIN">Administrador Sucursal</SelectItem>
                    <SelectItem value="TECHNICIAN">Técnico</SelectItem>
                    <SelectItem value="SALES">Ventas</SelectItem>
                    <SelectItem value="AUDITOR">Auditor</SelectItem>
                    <SelectItem value="CFO">CFO</SelectItem>
                    <SelectItem value="CEO">CEO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch_id">Sucursal</Label>
                <Select name="branch_id" defaultValue={editingUser.branch_id || ''}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Sin sucursal</SelectItem>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="active">Estado *</Label>
                <Select name="active" defaultValue={editingUser.active ? 'true' : 'false'} required>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Activo</SelectItem>
                    <SelectItem value="false">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  Guardar Cambios
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Alert Dialog Eliminar Usuario */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Estás a punto de eliminar la cuenta de: <strong>{deleteConfirm?.user_email}</strong>
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-900">
                  ⚠️ Esta acción solo debe usarse para:
                </p>
                <ul className="list-disc list-inside text-sm text-amber-900 mt-2 space-y-1">
                  <li>Usuarios duplicados</li>
                  <li>Cuentas creadas por error</li>
                  <li>Usuarios sin datos asociados</li>
                </ul>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-sm text-emerald-900">
                  ✓ Los datos históricos (OT, ventas, clientes, diagnósticos) NO se eliminarán.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar Usuario
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}