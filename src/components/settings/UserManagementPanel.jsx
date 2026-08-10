import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Search, UserX, Edit, UserCheck } from 'lucide-react';
import { isCanonicalActiveUserAccount } from '../../../base44/functions/_shared/userAuthorization.ts';

export default function UserManagementPanel({ organizationId, currentUserId, branches }) {
  const { effectiveRole, status } = useAuthContext();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [inviting, setInviting] = useState(false);
  const queryClient = useQueryClient();

  // Wait for auth to be ready
  const isReady = status === 'ready';

  const { data: users = [] } = useQuery({
    queryKey: ['userAccounts', organizationId],
    queryFn: () => base44.entities.UserAccount.filter({ organization_id: organizationId }),
    enabled: !!organizationId && isReady,
  });

  // P0.1 TENANT ZERO: Calculate active ORG_ADMIN count
  const activeOrgAdmins = users.filter(u =>
    u.role === 'ORG_ADMIN' && isCanonicalActiveUserAccount(u)
  );
  const isLastActiveOrgAdmin = (user) => {
    const isActive = isCanonicalActiveUserAccount(user);
    return user.role === 'ORG_ADMIN' && isActive && activeOrgAdmins.length === 1;
  };

  const inviteUserMutation = useMutation({
    mutationFn: async (data) => {
      if (!organizationId) {
        throw new Error('No se puede invitar usuarios sin un tenant válido');
      }
      const response = await base44.functions.invoke('manageOrgUser', {
        action: 'invite',
        organizationId,
        data,
      });
      if (!response?.data?.success) throw new Error(response?.data?.error || 'No se pudo invitar al usuario');
      return { ...response.data, email: data.user_email };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['userAccounts'] });
      setShowInviteModal(false);
      setInviting(false);
      
      // FEEDBACK DIFERENCIADO
      if (result.action === 'created') {
        alert(`✅ Invitación enviada exitosamente a ${result.email}\n\nEl usuario podrá acceder al iniciar sesión.`);
      } else {
        alert(`✅ Invitación actualizada para ${result.email}\n\nSe ha actualizado su rol y sucursal asignados.`);
      }
    },
    onError: (error) => {
      setInviting(false);
      alert(`❌ Error al invitar usuario: ${error.message}`);
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const response = await base44.functions.invoke('manageOrgUser', {
        action: 'updateAccount',
        organizationId,
        targetAccountId: id,
        data: { role: data.role, branch_id: data.branch_id, status: data.status },
      });
      if (!response?.data?.success) throw new Error(response?.data?.error || 'No se pudo actualizar el usuario');
      return response.data.account;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userAccounts'] });
      setShowEditModal(false);
      setEditingUser(null);
    },
    onError: (error) => alert(`❌ Error al actualizar usuario: ${error.message}`),
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
    const newStatus = formData.get('status');
    updateUserMutation.mutate({
      id: editingUser.id,
      data: {
        role: formData.get('role'),
        branch_id: formData.get('branch_id') || null,
        status: newStatus,
        active: newStatus !== 'suspended',
      },
    });
  };

  const handleDeactivate = (user) => {
    if (isLastActiveOrgAdmin(user)) {
      alert('⚠️ Esta empresa debe tener al menos un administrador activo.\n\nNo puedes suspender el último ORG_ADMIN.');
      return;
    }
    if (confirm(`¿Suspender acceso de ${user.user_email}?\n\nEl usuario no podrá iniciar sesión pero su historial quedará intacto.`)) {
      updateUserMutation.mutate({
        id: user.id,
        data: { role: user.role, branch_id: user.branch_id || null, status: 'suspended' },
      });
    }
  };

  const handleActivate = (user) => {
    updateUserMutation.mutate({
      id: user.id,
      data: { role: user.role, branch_id: user.branch_id || null, status: 'active' },
    });
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

  // Determine available roles based on current user's effectiveRole
  const getAvailableRoles = () => {
    if (effectiveRole === 'ORG_ADMIN') {
      return [
        { value: 'ORG_ADMIN', label: 'Administrador de Organización' },
        { value: 'BRANCH_ADMIN', label: 'Administrador Sucursal' },
        { value: 'TECHNICIAN', label: 'Técnico' },
        { value: 'SALES', label: 'Ventas' },
        { value: 'INVENTORY', label: 'Inventario' },
        { value: 'SUPPORT', label: 'Soporte' },
      ];
    }
    return [];
  };

  const availableRoles = getAvailableRoles();

  if (!isReady) {
    return <div className="p-6 text-center text-slate-500">Cargando...</div>;
  }

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
                      <Badge className={
                        isCanonicalActiveUserAccount(user)
                          ? 'bg-emerald-100 text-emerald-700 border-0 text-xs'
                          : user.status === 'invited'
                          ? 'bg-blue-100 text-blue-700 border-0 text-xs'
                          : 'bg-red-100 text-red-600 border-0 text-xs'
                      }>
                        {user.status === 'invited' ? 'Invitado' : user.status === 'suspended' ? 'Suspendido' : 'Activo'}
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
                          disabled={isLastActiveOrgAdmin(user)}
                          title={isLastActiveOrgAdmin(user) ? 'Esta empresa debe tener al menos un administrador activo' : ''}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {user.active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivate(user)}
                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            disabled={user.user_id === currentUserId || isLastActiveOrgAdmin(user)}
                            title={isLastActiveOrgAdmin(user) ? 'Esta empresa debe tener al menos un administrador activo' : ''}
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
                  {availableRoles.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
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

              {/* P0.1 TENANT ZERO: Warning for last ORG_ADMIN */}
              {isLastActiveOrgAdmin(editingUser) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm text-amber-800 font-medium">
                    ⚠️ Este es el único administrador activo de la empresa.
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    No puedes cambiar el rol ni desactivar este usuario. Invita a otro administrador primero.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="role">Rol *</Label>
                <Select 
                  name="role" 
                  defaultValue={editingUser.role} 
                  required
                  disabled={isLastActiveOrgAdmin(editingUser)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map(role => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
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
                <Label htmlFor="status">Estado *</Label>
                <Select
                  name="status"
                  defaultValue={editingUser.status || (editingUser.active ? 'active' : 'suspended')}
                  required
                  disabled={isLastActiveOrgAdmin(editingUser)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="invited">Invitado (pendiente)</SelectItem>
                    <SelectItem value="suspended">Suspendido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="submit"
                  disabled={isLastActiveOrgAdmin(editingUser)}
                >
                  Guardar Cambios
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
