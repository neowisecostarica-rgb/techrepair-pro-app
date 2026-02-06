import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Users, Wrench, Eye, UserCog, Power } from 'lucide-react';

export default function OrganizationCard({ 
  organization, 
  stats, 
  planInfo,
  partnerName,
  onViewDetails, 
  onImpersonate,
  onToggleStatus 
}) {
  return (
    <Card className="border-0 shadow-md hover:shadow-xl transition-all">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold">
              {organization.name?.charAt(0) || 'O'}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">{organization.name}</h3>
              <p className="text-sm text-slate-500">
                {organization.country} • {organization.currency}
                {partnerName && <span className="text-purple-600 ml-2">• 🤝 {partnerName}</span>}
              </p>
            </div>
          </div>
          <Badge className={`${
            organization.status === 'active' 
              ? 'bg-emerald-100 text-emerald-700' 
              : 'bg-red-100 text-red-700'
          } border-0`}>
            {organization.status}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-blue-500" />
              <p className="text-xs text-slate-500">Usuarios</p>
            </div>
            <p className="font-bold text-slate-900">{stats?.users || 0}</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="w-4 h-4 text-purple-500" />
              <p className="text-xs text-slate-500">OT Activas</p>
            </div>
            <p className="font-bold text-slate-900">{stats?.activeOrders || 0}</p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-emerald-500" />
              <p className="text-xs text-slate-500">Plan</p>
            </div>
            <p className="font-bold text-slate-900">{planInfo?.name || organization.plan}</p>
            {planInfo?.price && (
              <p className="text-xs text-slate-500 mt-1">{planInfo.price} {planInfo.currency}/mes</p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(organization)}
            className="flex-1"
          >
            <Eye className="w-4 h-4 mr-2" />
            Ver
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onImpersonate(organization)}
            className="flex-1 border-orange-500 text-orange-700 hover:bg-orange-50"
          >
            <UserCog className="w-4 h-4 mr-2" />
            Soporte
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleStatus(organization)}
            className={`${
              organization.status === 'active'
                ? 'border-red-500 text-red-700 hover:bg-red-50'
                : 'border-emerald-500 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <Power className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}