// TRP-IMPORT-004: pure, read-only parsing of heterogeneous supplier/customer spreadsheets.
export const FIELDS = ['tipo','sku','codigo_barras','nombre','descripcion','categoria','precio','costo','stock','marca','modelo','proveedor','ubicacion','foto','numero_serie'];
export const ALIASES = {
  tipo: ['tipoproducto','tiporegistro','clasearticulo','producttype'],
  sku: ['sku','codigocliente','codigoarticulo','codigoproducto','codigointernoempresa','referencia'],
  codigo_barras: ['codigobarras','barcode','ean','upc','gtin'],
  nombre: ['nombre','producto','articulo','nombreproducto','descripcionproducto','name'],
  descripcion: ['descripcion','detalle','especificaciones','caracteristicas','description'],
  categoria: ['categoria','category','familia','rubro'],
  precio: ['precioventa','precio','preciofinal','preciounitario','price','pvp','tarifa'],
  costo: ['costounitario','costo','coste','cost','preciocosto'],
  stock: ['stock','existencia','existencias','cantidad','inventario','unidades'],
  marca: ['marca','brand'],
  modelo: ['modelo','model'],
  proveedor: ['proveedor','supplier'],
  ubicacion: ['ubicacion','bodega','location'],
  foto: ['fotourl','foto','imagen','imageurl'],
  numero_serie: ['numeroserie','serial','serie','serialnumber'],
};
export const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
export const clean = value => String(value ?? '').trim();
export function strictNumber(value) {
  if (value === null || value === undefined || !clean(value) || /^(n\/?a|n\.?d\.?|no disponible|sin dato|s\/d)$/i.test(clean(value))) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let x = clean(value).replace(/[\s₡$]/g, '');
  const comma = x.lastIndexOf(','), dot = x.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) x = comma > dot ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (comma >= 0) x = /,\d{1,2}$/.test(x) ? x.replace(',', '.') : x.replace(/,/g, '');
  else if (dot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
  const n = Number(x);
  return Number.isFinite(n) ? n : NaN;
}
const VALUE_TYPES = ['producto','product','articulo','repuesto','servicio','service','servicios'];
function findHeaderIndex(rows) {
  const count = Math.min(rows.length, 12);
  let best = 0, score = -1;
  for (let i=0;i<count;i++) {
    const values = rows[i] || [];
    const hits = values.filter(v=>Object.values(ALIASES).some(names=>names.includes(norm(v)))).length;
    if (hits > score) { score=hits; best=i; }
  }
  return best;
}
export function normalizeSheets(sheets) {
  const out=[];
  for (const sheet of sheets) {
    const cells=sheet.rows || [];
    if (!cells.length) continue;
    const headerIndex=findHeaderIndex(cells);
    const header=cells[headerIndex].map(norm);
    const cols={};
    for (const [key, aliases] of Object.entries(ALIASES)) cols[key]=header.findIndex(h=>aliases.includes(h));
    // A generic "Tipo" is often a condition (NUEVO/REF) or product subtype, NOT product/service.
    const genericTypeCol=header.indexOf('tipo');
    for (let r=headerIndex+1;r<cells.length;r++) {
      const row=cells[r]||[];
      if (!row.some(v=>clean(v))) continue;
      const get=key=>cols[key] >=0 ? row[cols[key]] : null;
      const typeRaw=clean(get('tipo'));
      const genericType=genericTypeCol>=0?clean(row[genericTypeCol]):'';
      const kind=VALUE_TYPES.includes(norm(typeRaw)) ? typeRaw : 'Producto';
      const condition=['nuevo','ref','refurbished','reacondicionado','usado'].includes(norm(genericType))?genericType:'';
      const nameSource=clean(get('nombre'));
      const brand=clean(get('marca')), model=clean(get('modelo'));
      const serial=clean(get('numero_serie'));
      const capacityCol=header.indexOf('capacidad');
      const capacity=capacityCol>=0?clean(row[capacityCol]):'';
      const parts=[brand,model,capacity].filter(Boolean);
      const fallback=parts.join(' ').trim() || (genericType && !condition ? genericType : '');
      const name=nameSource || (serial && fallback ? fallback+' · S/N '+serial : fallback);
      const specs=clean(get('descripcion'));
      const details=[specs, (!nameSource && genericType && !condition ? 'Tipo: '+genericType : ''), condition ? 'Condición: '+condition : ''].filter(Boolean).join(' | ');
      const sku=get('sku'), barcode=get('codigo_barras');
      out.push({
        sheet: sheet.name, line: r+1,
        data: {
          tipo:kind, sku: clean(sku), codigo_barras:clean(barcode), nombre:name, descripcion:details,
          categoria:clean(get('categoria'))||sheet.name, precio:get('precio'), costo:get('costo'), stock:get('stock'),
          marca:brand, modelo:model, proveedor:clean(get('proveedor')), ubicacion:clean(get('ubicacion')),
          foto:clean(get('foto')), numero_serie:serial,
        },
        warnings: [
          ...(typeof sku==='number' && !Number.isSafeInteger(sku)?['SKU numérico fuera de precisión segura']:[]),
          ...(typeof barcode==='number' && !Number.isSafeInteger(barcode)?['Código de barras fuera de precisión segura']:[]),
          ...(!nameSource && !!name?['Nombre compuesto para revisión']:[]),
        ],
      });
    }
  }
  return out;
}
export function validateImportRow(source,{categorias=[],defaultCategoryId='',branchId='',seen=new Set(),existing=new Set()}={}) {
  const d=source.data, isService=['servicio','service','servicios'].includes(norm(d.tipo));
  const price=strictNumber(d.precio),cost=strictNumber(d.costo),stock=strictNumber(d.stock);
  const cat=categorias.find(c=>c.activo!==false && (norm(c.nombre)===norm(d.categoria)||c.id===defaultCategoryId));
  const identifiers=[
    d.sku&&'sku:'+norm(d.sku),
    d.codigo_barras&&'barcode:'+norm(d.codigo_barras),
    d.numero_serie&&'serial:'+norm(d.numero_serie),
    (!d.sku && !d.codigo_barras && !d.numero_serie && d.nombre)&& (isService?'service:':'product:')+norm(d.nombre),
  ].filter(Boolean);
  let error='';
  if (!d.nombre) error='Falta nombre';
  else if (source.warnings?.some(w=>w.includes('precisión segura'))) error='Código numérico perdió precisión';
  else if (!Number.isFinite(price)||price<=0) error='Precio de venta no informado o inválido';
  else if (!isService && (cost===null || !Number.isFinite(cost) || cost<0)) error='Costo desconocido: completar antes de importar';
  else if (!isService && (stock===null || !Number.isInteger(stock) || stock<0)) error='Stock N/A o inválido: confirmar cantidad real';
  else if (!isService && !cat) error='Categoría no encontrada; asignar categoría existente';
  else if (!isService && !cat.es_vendible) error='Categoría no permite venta';
  else if (!isService && !cat.permite_stock && stock>0) error='Categoría no permite stock';
  else if (!isService && !branchId) error='Seleccioná sucursal';
  else if (identifiers.some(id=>seen.has(id)||existing.has(id))) error='Posible duplicado por código/serie/nombre';
  else if (d.foto && !/^https:\/\/\S+$/i.test(d.foto)) error='FotoURL debe ser HTTPS';
  identifiers.forEach(id=>seen.add(id));
  return {...source,isService,categoryRecord:cat,price,cost,stock,error};
}
