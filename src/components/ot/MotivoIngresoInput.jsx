import React, { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const MOTIVOS_COMUNES = [
  { value: 'Revisión general', label: 'Revisión general' },
  { value: 'Cambio de pantalla', label: 'Cambio de pantalla' },
  { value: 'Problema de encendido', label: 'Problema de encendido' },
  { value: 'Batería', label: 'Batería' },
  { value: 'Lento / Rendimiento', label: 'Lento / Rendimiento' },
  { value: '__otro__', label: 'Otro...' },
];

/**
 * Campo de motivo de ingreso: select con opciones comunes + texto libre si elige "Otro".
 * Llama a onChange(value) con el texto final.
 */
export default function MotivoIngresoInput({ value, onChange, disabled = false }) {
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');

  // Hidratar desde valor externo (modo edición)
  useEffect(() => {
    if (!value) return;
    const match = MOTIVOS_COMUNES.find(m => m.value === value && m.value !== '__otro__');
    if (match) {
      setSelected(match.value);
    } else if (value) {
      setSelected('__otro__');
      setCustom(value);
    }
  }, []);  // Solo al montar

  const handleSelectChange = (val) => {
    setSelected(val);
    if (val !== '__otro__') {
      setCustom('');
      onChange(val);
    } else {
      onChange(custom);
    }
  };

  const handleCustomChange = (e) => {
    setCustom(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div className="space-y-2">
      <Select value={selected} onValueChange={handleSelectChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Seleccionar motivo..." />
        </SelectTrigger>
        <SelectContent>
          {MOTIVOS_COMUNES.map(m => (
            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected === '__otro__' && (
        <Textarea
          value={custom}
          onChange={handleCustomChange}
          placeholder="Describe el motivo de ingreso..."
          rows={2}
          disabled={disabled}
          autoFocus
        />
      )}
    </div>
  );
}