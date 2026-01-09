import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function FiltroFechas({ days, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <Label className="text-sm font-medium">Periodo:</Label>
      <Select value={String(days)} onValueChange={(val) => onChange(Number(val))}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7">Últimos 7 días</SelectItem>
          <SelectItem value="30">Últimos 30 días</SelectItem>
          <SelectItem value="90">Últimos 90 días</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}