import React, { useMemo, useState } from 'react';
import readXlsxFile from 'read-excel-file';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const COLUMNS = ['Tipo', 'SKU', 'Nombre', 'Descripcion', 'Categoria', 'PrecioVenta', 'CostoUnitario', 'Stock', 'Marca', 'Modelo', 'Proveedor', 'Ubicacion', 'FotoURL'];
const ALIASES = {
  tipo: ['tipo', 'type', 'clase'],
  sku: ['sku', 'codigo', 'codigoproducto', 'codigoarticulo', 'codigobarras', 'barcode'],
  nombre: ['nombre', 'producto', 'servicio', 'articulo', 'descripcionproducto', 'name'],
  descripcion: ['descripcion', 'detalle', 'description'],
  categoria: ['categoria', 'category', 'familia', 'rubro'],
  precio: ['precioventa', 'precio', 'preciofinal', 'preciounitario', 'price', 'pvp', 'tarifa'],
  costo: ['costounitario', 'costo', 'coste', 'cost', 'preciocosto'],
  stock: ['stock', 'existencia', 'existencias', 'cantidad', 'inventario', 'unidades'],
  marca: ['marca', 'brand'],
  modelo: ['modelo', 'model'],
  proveedor: ['proveedor', 'supplier'],
  ubicacion: ['ubicacion', 'bodega', 'location'],
  foto: ['fotourl', 'foto', 'imagen', 'imageurl'],
};
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
const clean = value => String(value ?? '').trim();
const number = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let x = clean(value).replace(/[\s₡$]/g, '');
  if (!x) return 0;
  const comma = x.lastIndexOf(','), dot = x.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) x = comma > dot ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (comma >= 0) x = /,\d{1,2}$/.test(x) ? x.replace(',', '.') : x.replace(/,/g, '');
  else if (dot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
};
function parseCSV(text) {
  const first = (text.replace(/^\uFEFF/, '').split(/\r?\n/).find(line => line.trim()) || '');
  const delimiters = [',', ';', '\t'];
  const delimiter = delimiters.sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [], row = [];
  let value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) { row.push(value); value = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value); if (row.some(v => clean(v))) rows.push(row.slice());
      row.length = 0; value = '';
    } else value += c;
  }
  row.push(value); if (row.some(v => clean(v))) rows.push(row);
  if (quoted) throw new Error('Archivo CSV con comillas sin cerrar');
  return rows;
}
function downloadTemplate() {
  const sample = [
    ['Producto', 'REP-001', 'Cable HDMI', 'Cable de 2 metros', 'Repuestos', '4500', '2000', '10', 'Genérica', '2m', '', 'Bodega principal', ''],
    ['Servicio', '', 'Mantenimiento preventivo', 'Limpieza y revisión', 'mantenimiento', '15000', '', '', '', '', '', '', ''],
  ];
  const csv = [COLUMNS, ...sample].map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'TRP-plantilla-productos-servicios.csv'; anchor.click();
  URL.revokeObjectURL(url);
}
const SERVICE_CATEGORIES = ['diagnostico', 'reparacion', 'mantenimiento', 'instalacion', 'otros'];

export default function ImportarCatalogo({ open, onOpenChange, organizationId, categorias = [], existingItems = [], onImported }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState('');
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [services, setServices] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [defaultType, setDefaultType] = useState('producto');
  const [defaultCategoryId, setDefaultCategoryId] = useState('');

  const openFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setConfirmed(false); setResult(null); setRows([]);
    try {
      if (!/\.(csv|xlsx)$/i.test(file.name)) throw new Error('Usá un archivo .csv o .xlsx');
      const cells = /\.xlsx$/i.test(file.name) ? await readXlsxFile(file) : parseCSV(await file.text());
      if (cells.length < 2) throw new Error('El archivo necesita encabezados y al menos una fila');
      if (cells.length > 1001) throw new Error('Máximo 1000 registros por importación. Dividí el archivo en lotes.');
      const detectedHeaders = cells[0].map(clean);
      const map = {};
      Object.entries(ALIASES).forEach(([field, alternatives]) => {
        const index = detectedHeaders.findIndex(h => alternatives.includes(norm(h)));
        map[field] = index < 0 ? '' : String(index);
      });
      setHeaders(detectedHeaders); setRows(cells.slice(1).filter(row => row.some(v => clean(v))));
      setMapping(map); setFileName(file.name);
      const [branchList, serviceList] = await Promise.all([
        base44.entities.Branch.filter({ organization_id: organizationId, active: true }, '-created_date', 100),
        base44.entities.Servicio.filter({ organization_id: organizationId }, '-created_date', 1000),
      ]);
      setBranches(branchList || []); setServices(serviceList || []);
      setBranchId(branchList?.length === 1 ? branchList[0].id : '');
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo leer el archivo', description: error.message });
    }
  };

  const preview = useMemo(() => {
    const existing = new Set(existingItems.flatMap(p => [p.sku ? 'sku:' + norm(p.sku) : null, 'product:' + norm(p.nombre)].filter(Boolean)));
    services.forEach(s => existing.add('service:' + norm(s.nombre)));
    const inFile = new Set();
    return rows.map((row, index) => {
      const field = key => mapping[key] === '' || mapping[key] == null ? '' : row[Number(mapping[key])];
      const kind = norm(field('tipo') || defaultType);
      const isService = ['servicio', 'service', 'servicios'].includes(kind);
      const name = clean(field('nombre')), sku = clean(field('sku')), category = clean(field('categoria'));
      const fallbackCategory = categorias.find(c => c.id === defaultCategoryId && c.activo !== false);
      const price = number(field('precio')), cost = number(field('costo')), stock = number(field('stock'));
      const categoryRecord = category ? categorias.find(c => norm(c.nombre) === norm(category) && c.activo !== false) : fallbackCategory;
      const duplicateKey = isService ? 'service:' + norm(name) : sku ? 'sku:' + norm(sku) : 'product:' + norm(name);
      let error = '';
      if (!name) error = 'Falta nombre';
      else if (!kind || !['producto', 'product', 'articulo', 'repuesto', 'servicio', 'service', 'servicios'].includes(kind)) error = 'Tipo: Producto o Servicio';
      else if (!Number.isFinite(price) || price <= 0) error = 'Precio de venta inválido';
      else if (!isService && (!Number.isFinite(cost) || cost < 0 || !Number.isInteger(stock) || stock < 0)) error = 'Costo o stock inválido';
      else if (!isService && !categoryRecord) error = 'Categoría de inventario no encontrada';
      else if (!isService && !categoryRecord.es_vendible) error = 'Categoría no permite ventas';
      else if (!isService && !categoryRecord.permite_stock && stock > 0) error = 'Categoría no permite stock';
      else if (!isService && !branchId) error = 'Seleccioná sucursal';
      else if (existing.has(duplicateKey) || inFile.has(duplicateKey) || (sku && (existing.has('sku:' + norm(sku)) || inFile.has('sku:' + norm(sku))))) error = 'Posible duplicado (omitido)';
      else if (clean(field('foto')) && !/^https:\/\/\S+$/i.test(clean(field('foto')))) error = 'FotoURL debe ser HTTPS';
      if (sku) inFile.add('sku:' + norm(sku));
      inFile.add(duplicateKey);
      return { index: index + 2, row, isService, name, sku, category, categoryRecord, price, cost, stock, error, field };
    });
  }, [rows, mapping, categorias, existingItems, services, branchId, defaultType, defaultCategoryId]);
  const eligible = preview.filter(x => !x.error);
  const invalid = preview.filter(x => !!x.error);
  const process = async () => {
    if (!confirmed || running || result !== null || !eligible.length || !organizationId) return;
    setRunning(true);
    let created = 0;
    const errors = [];
    for (const p of eligible) {
      try {
        if (p.isService) {
          const serviceCategory = norm(p.category);
          await base44.entities.Servicio.create({
            organization_id: organizationId,
            nombre: p.name, descripcion: clean(p.field('descripcion')),
            precio: p.price, activo: true,
            categoria: SERVICE_CATEGORIES.includes(serviceCategory) ? serviceCategory : 'otros',
          });
        } else {
          const photo = clean(p.field('foto'));
          const response = await base44.functions.invoke('createInventoryItem', {
            itemData: {
              organization_id: organizationId, branch_id: branchId,
              nombre: p.name, sku: p.sku || undefined,
              categoria_id: p.categoryRecord.id,
              descripcion: clean(p.field('descripcion')),
              costo_unitario: p.cost, precio_venta: p.price, cantidad_disponible: p.stock,
              marca: clean(p.field('marca')), modelo: clean(p.field('modelo')),
              proveedor: clean(p.field('proveedor')), ubicacion: clean(p.field('ubicacion')) || 'bodega',
              tipo_item: 'producto', estado: 'activo',
              foto_url: photo || null, galeria_fotos: photo ? [photo] : [],
            },
          });
          if (!response?.data?.success) throw new Error(response?.data?.error || 'No confirmado por servidor');
        }
        created++;
      } catch (error) {
        errors.push({ row: p.index, error: error.message || 'Error al importar' });
        // Fail closed to avoid flooding the backend with potentially invalid batch data.
        break;
      }
    }
    setResult({ created, errors });
    setConfirmed(false);
    setRunning(false);
    queryClient.invalidateQueries({ queryKey: ['inventario'] });
    queryClient.invalidateQueries({ queryKey: ['servicios-disponibles'] });
    queryClient.invalidateQueries({ queryKey: ['inventario-disponible'] });
    if (onImported) onImported();
  };

  return <Dialog open={open} onOpenChange={value => { if (!running) onOpenChange(value); }}>
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Importar productos y servicios</DialogTitle></DialogHeader>
      <p className="text-sm text-slate-600">Migrá tus listas de precios desde Excel (.xlsx) o CSV. Los productos se incorporan al inventario; los servicios se guardan en el catálogo de servicios existente.</p>
      <div className="flex flex-wrap gap-3 items-end">
        <Button type="button" variant="outline" onClick={downloadTemplate}><Download className="w-4 h-4 mr-2" /> Descargar plantilla</Button>
        <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm">
          <Upload className="h-4 w-4" /> Seleccionar Excel o CSV
          <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={openFile} disabled={running} />
        </Label>
        {fileName && <span className="text-xs text-slate-500">{fileName}</span>}
      </div>
      {!!rows.length && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['tipo','nombre','sku','categoria','precio','costo','stock','foto'].map(key =>
            <div key={key}><Label className="capitalize">{key}</Label>
              <Select value={mapping[key] ?? ''} onValueChange={v => {setMapping(old => ({...old,[key]:v === 'none' ? '' : v}));setConfirmed(false);}}>
                <SelectTrigger><SelectValue placeholder="Sin columna" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Sin columna</SelectItem>{headers.map((h,i) => <SelectItem value={String(i)} key={i}>{h || 'Columna ' + (i+1)}</SelectItem>)}</SelectContent>
              </Select></div>)}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Tipo si el archivo no tiene columna Tipo</Label>
            <Select value={defaultType} onValueChange={v => { setDefaultType(v); setConfirmed(false); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="producto">Productos</SelectItem><SelectItem value="servicio">Servicios</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Categoría de inventario si falta en el archivo</Label>
            <Select value={defaultCategoryId || 'none'} onValueChange={v => { setDefaultCategoryId(v === 'none' ? '' : v); setConfirmed(false); }}>
              <SelectTrigger><SelectValue placeholder="Elegí categoría existente" /></SelectTrigger>
              <SelectContent><SelectItem value="none">Ninguna</SelectItem>{categorias.filter(c => c.activo !== false).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Sucursal de destino para productos</Label>
          <Select value={branchId} onValueChange={v => {setBranchId(v);setConfirmed(false);}}>
            <SelectTrigger><SelectValue placeholder="Seleccioná la sucursal" /></SelectTrigger>
            <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name || b.nombre || b.id}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex gap-4 text-sm"><span className="text-emerald-700">{eligible.length} listos</span><span className="text-amber-700">{invalid.length} omitidos o con errores</span><span>{preview.length} filas</span></div>
        <div className="max-h-64 overflow-auto border rounded-lg">
          <table className="w-full text-xs"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2 text-left">Fila</th><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">Nombre</th><th className="p-2 text-right">Precio</th><th className="p-2 text-left">Validación</th></tr></thead>
            <tbody>{preview.map(p => <tr key={p.index} className="border-t"><td className="p-2">{p.index}</td><td className="p-2">{p.isService ? 'Servicio' : 'Producto'}</td><td className="p-2">{p.name}</td><td className="p-2 text-right">{p.price.toLocaleString('es-CR')}</td><td className={'p-2 ' + (p.error ? 'text-amber-700' : 'text-emerald-700')}>{p.error || 'Listo'}</td></tr>)}</tbody>
          </table>
        </div>
        {!!invalid.length && <p className="text-sm text-amber-800"><AlertTriangle className="w-4 h-4 inline mr-1" /> Los registros con errores no se importarán. Ajustá el archivo y volvé a cargarlo para corregirlos.</p>}
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={running} /> Confirmo importar únicamente los registros válidos al catálogo de esta empresa. Comprendo que esta acción crea registros.</label>
        <Button disabled={running || !confirmed || !eligible.length || result !== null} onClick={process}>{running ? 'Importando…' : 'Importar ' + eligible.length + ' registros válidos'}</Button>
      </>}
      {result && <div className="rounded-lg border p-3 text-sm">
        <p className="font-semibold"><CheckCircle2 className="h-4 w-4 inline mr-1" /> Registros creados: {result.created}</p>
        <p className="text-xs text-slate-600">Para importar otro lote o reintentar los pendientes, seleccioná nuevamente un archivo después de revisar los registros creados.</p>
        {!!result.errors.length && <p className="text-red-700">Se detuvo en la fila {result.errors[0].row}: {result.errors[0].error}. Los registros anteriores ya se guardaron; no repitas todo el lote sin revisar duplicados.</p>}
      </div>}
    </DialogContent>
  </Dialog>;
}
