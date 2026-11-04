import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function ProductPhotoUploader({ fotos = [], onChange, max = 5, disabled = false }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const space = max - fotos.length;
    if (space <= 0) {
      toast({ variant: 'destructive', title: 'Límite de fotos alcanzado', description: `Puedes subir hasta ${max} fotos por producto.` });
      return;
    }

    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files.slice(0, space)) {
        const res = await base44.integrations.Core.UploadPublicFile({ file });
        if (res?.file_url) uploaded.push(res.file_url);
      }
      onChange([...fotos, ...uploaded]);
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo subir la foto', description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (url) => {
    onChange(fotos.filter(photo => photo !== url));
  };

  return (
    <div className="space-y-2">
      <Label>Fotos del producto</Label>
      <div className="flex flex-wrap gap-3">
        {fotos.map((url, index) => (
          <div key={url} className="relative group">
            <img
              src={url}
              alt={`Foto ${index + 1}`}
              className="w-20 h-20 rounded-lg object-cover border border-slate-200 bg-slate-50"
            />
            {index === 0 && (
              <span className="absolute bottom-1 left-1 rounded bg-teal-700/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Principal
              </span>
            )}
            {!disabled && (
              <button
                type="button"
                onClick={() => removePhoto(url)}
                className="absolute -top-2 -right-2 rounded-full bg-white border border-slate-200 shadow-sm p-1 text-slate-500 hover:text-red-600"
                title="Quitar foto"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}

        {!disabled && fotos.length < max && (
          <label className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 cursor-pointer text-slate-500 hover:border-teal-500 hover:text-teal-700 transition-colors">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
            <span className="text-[10px] font-medium">{uploading ? 'Subiendo' : 'Agregar'}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFiles}
              disabled={uploading}
            />
          </label>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Hasta {max} fotos. La primera se muestra como principal en el catálogo, cotizaciones y punto de venta.
        (las imágenes se guardan públicamente — cualquiera con el enlace puede abrirlas)
      </p>
    </div>
  );
}