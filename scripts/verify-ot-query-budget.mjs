import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const orders = read('src/pages/OrdenesTrabajo.jsx');
const admin = read('src/components/midia/MiDiaAdmin.jsx');
const record = read('src/pages/ExpedienteOT.jsx');
const projections = read('base44/functions/listWorkOrders/_shared/dataProjections.ts');

let passed = 0;
function check(label, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${label}`);
}
function section(source, start, end) {
  const a = source.indexOf(start);
  assert.ok(a >= 0, `No se encontró ${start}`);
  const b = source.indexOf(end, a + start.length);
  assert.ok(b > a, `No se encontró fin de bloque ${end}`);
  return source.slice(a, b);
}

check('lista OT usa un único endpoint de lectura paginada', () => {
  assert.equal((orders.match(/functions\.invoke\('listWorkOrders'/g) || []).length, 1);
});
check('DTO entrega cliente y equipo para la lista sin consultas adicionales', () => {
  assert.match(projections, /dto\.cliente_nombre_completo\s*=/);
  assert.match(projections, /dto\.equipo_display\s*=/);
  assert.match(orders, /orden\.cliente_nombre_completo/);
  assert.match(orders, /orden\.equipo_display/);
});
for (const [key, next] of [
  ["queryKey: ['clientes'", "queryKey: ['equipos'"],
  ["queryKey: ['equipos'", "queryKey: ['branches'"],
  ["queryKey: ['branches'", "queryKey: ['tecnicos'"],
  ["queryKey: ['terminos'", "useEffect(() =>"],
]) {
  check(`${key} solo se consulta al abrir formulario`, () => {
    assert.match(section(orders, key, next), /enabled:\s*!!effectiveOrgId && showModal/);
  });
}
check('órdenes espera 120 segundos, sin reintentos ni refrescos por foco', () => {
  const q = section(orders, "queryKey: ['ordenes'", "queryKey: ['clientes'");
  assert.match(q, /refetchInterval:\s*120 \* 1000/);
  assert.match(q, /refetchOnWindowFocus:\s*false/);
  assert.match(q, /retry:\s*false/);
});
check('Mi Día administrador elimina sondeo cada 10 segundos', () => {
  const q = section(admin, "queryKey: ['todas-ordenes'", "queryKey: ['ventas'");
  assert.match(q, /refetchInterval:\s*60 \* 1000/);
  assert.match(q, /retry:\s*false/);
  assert.doesNotMatch(q, /refetchInterval:\s*10 \* 1000/);
});
check('expediente reduce sondeo de OT y ventas y evita reintentos', () => {
  const q = section(record, "queryKey: ['expediente-ot'", "queryKey: ['expediente-cotizaciones'");
  assert.equal((q.match(/refetchInterval:\s*60 \* 1000/g) || []).length, 2);
  assert.equal((q.match(/retry:\s*false/g) || []).length, 2);
});
console.log(`\n${passed}/${passed} controles de presupuesto de consultas TRP PASS`);
