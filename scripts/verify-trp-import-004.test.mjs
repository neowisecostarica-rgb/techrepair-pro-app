import assert from 'node:assert/strict';
import { normalizeSheets,validateImportRow,strictNumber } from '../src/components/inventario/catalogImportUtils.mjs';
const tests=[];
function test(name,fn){try{fn();tests.push(['PASS',name]);}catch(e){tests.push(['FAIL',name,e.message]);}}
const sheetNames=['HDDs','Laptops','CPUS','Monitores','Combos','Insumos','POS','Encapsulador','Docking Stations','Quemadores'];
const mixed=sheetNames.map((name,i)=>({
  name,
  rows:i===0?[
    ['Tipo',null,null,'Marca',null,null,'Capacidad',null,'Serial',null,null,null,'Cantidad',null,'Precio'],
    ['HDD para Laptop/PC',null,null,'Seagate',null,null,'500 GB',null,'SERIAL-1',null,null,null,1,null,10000]
  ]:[
    ['Marca',null,'Modelo',null,null,'Especificaciones',null,null,null,null,null,null,null,null,null,'Precio'],
    ['HP',null,'Sample '+i,null,null,'Equipo de prueba',null,null,null,null,null,null,null,null,null,i<7?150000:null]
  ]
}));
const rows=normalizeSheets(mixed);
const cat=sheetNames.map((name,i)=>({id:'cat'+i,nombre:name,es_vendible:true,permite_stock:true,activo:true}));
test('ten distinct sheets in one normalized preview',()=>assert.deepEqual([...new Set(rows.map(x=>x.sheet))],sheetNames));
test('HDD serial separated, not SKU',()=>{assert.equal(rows[0].data.numero_serie,'SERIAL-1');assert.equal(rows[0].data.sku,'');assert.equal(rows[0].data.stock,1);});
test('sale price never becomes purchase cost',()=>{assert.equal(rows[0].data.precio,10000);assert.equal(rows[0].data.costo,null);});
test('missing cost blocked',()=>assert.match(validateImportRow(rows[0],{categorias:cat,branchId:'test'}).error,/Costo desconocido/));
test('N/A is not zero',()=>{assert.equal(strictNumber('N/A'),null);assert.equal(strictNumber(''),null);assert.equal(strictNumber('0'),0);});
test('missing price blocked',()=>assert.match(validateImportRow(rows.at(-1),{categorias:cat,branchId:'test'}).error,/Precio/));
test('explicit zero cost and stock are allowed after review',()=>{
 const x={...rows[0],data:{...rows[0].data,costo:0,stock:0}};
 assert.equal(validateImportRow(x,{categorias:cat,branchId:'test'}).error,'');
});
test('duplicate customer SKU is blocked',()=>{
 const x={...rows[0],data:{...rows[0].data,sku:'CLIENT-123',costo:2000}};
 const seen=new Set();assert.equal(validateImportRow(x,{categorias:cat,branchId:'test',seen}).error,'');
 assert.match(validateImportRow(x,{categorias:cat,branchId:'test',seen}).error,/duplicado/);
});
test('barcode remains distinct from SKU',()=>{
 const x={...rows[0],data:{...rows[0].data,sku:'ABC',codigo_barras:'00098765',costo:2000}};
 assert.equal(validateImportRow(x,{categorias:cat,branchId:'test'}).data.codigo_barras,'00098765');
});
test('condition REF is not mistaken for Servicio',()=>{
 const x=normalizeSheets([{name:'Laptops',rows:[['Marca','Tipo','Modelo','Precio'],['Dell','REF','5420',150000]]}])[0];
 assert.equal(x.data.tipo,'Producto');assert.match(x.data.descripcion,/Condición: REF/);
});
test('numeric barcode exceeding safe integer is blocked',()=>{
 const x={...rows[0],warnings:['Código de barras fuera de precisión segura'],data:{...rows[0].data,costo:2000}};
 assert.match(validateImportRow(x,{categorias:cat,branchId:'test'}).error,/precisión/);
});
test('official template Servicio stays servicio',()=>{
 const x=normalizeSheets([{name:'Productos y servicios',rows:[['Tipo','SKU','Nombre','PrecioVenta'],['Servicio','','Revisión preventiva',10000]]}])[0];
 assert.equal(x.data.tipo,'Servicio');
});
test('explicit N/A quantity blocks rather than converting zero',()=>{
 const x={...rows[0],data:{...rows[0].data,costo:1000,stock:'N/A'}};
 assert.match(validateImportRow(x,{categorias:cat,branchId:'test'}).error,/Stock N\/A/);
});
test('duplicate external barcode blocked',()=>{
 const x={...rows[0],data:{...rows[0].data,costo:1000,codigo_barras:'000089'}};
 assert.match(validateImportRow(x,{categorias:cat,branchId:'test',existing:new Set(['barcode:000089'])}).error,/duplicado/);
});
test('branch must be explicitly assigned for stock',()=>{
 const x={...rows[0],data:{...rows[0].data,costo:1000}};
 assert.match(validateImportRow(x,{categorias:cat}).error,/sucursal/);
});
for(const [status,name,detail] of tests)console.log(status,name,detail||'');
if(tests.some(([status])=>status==='FAIL'))process.exit(1);
console.log('TOTAL',tests.length,'PASS; no live Base44 API writes');
