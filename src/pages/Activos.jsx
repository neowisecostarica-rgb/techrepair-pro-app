import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '@/components/contexts/AuthContext';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Laptop, Search, History, MapPin, User, ArrowRight, PackageOpen, UserRoundCheck, Undo2, AlertTriangle } from 'lucide-react';

export default function Activos() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'TECHNICIAN', 'CUSTOMER_SERVICE']}>
      <ActivosContent />
    </PageGuard>
  );
}

function ActivosContent() {
  const navigate = useNavigate();
  const { effectiveOrgId } = useAuthContext();
  const [search, setSearch] = React.useState('');
  const [view, setView] = React.useState('assets');

  const { data: equipos = [], isLoading } = useQuery({
    queryKey: ['asset-lifecycle-equipos', effectiveOrgId],
    queryFn: () => base44.entities.Equipo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ['asset-lifecycle-clientes', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });
  const { data: ordenes = [] } = useQuery({
    queryKey: ['asset-lifecycle-ordenes', effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['enterprise-custody', effectiveOrgId],
    queryFn: () => base44.entities.AssetAssignment.filter({ organization_id: effectiveOrgId }, '-assigned_at', 500),
    enabled: !!effectiveOrgId,
  });

  const clienteById = React.useMemo(() => Object.fromEntries(clientes.map(c => [c.id, c])), [clientes]);
  const ordenesByEquipo = React.useMemo(() => {
    const map = {};
    ordenes.forEach(ot => { (map[ot.equipo_id] ||= []).push(ot); });
    Object.values(map).forEach(list => list.sort((a,b) => new Date(b.fecha_ingreso || b.created_date) - new Date(a.fecha_ingreso || a.created_date)));
    return map;
  }, [ordenes]);

  const equipoById = React.useMemo(() => Object.fromEntries(equipos.map(e => [e.id, e])), [equipos]);
  const activeAssignments = assignments.filter(a => a.status === 'ACTIVE');
  const people = React.useMemo(() => {
    const map = new Map();
    activeAssignments.forEach(a => {
      const key = (a.assignee_reference || a.assignee_email || a.assignee_name || '').trim().toLowerCase();
      if (!key) return;
      const item = map.get(key) || { key, name:a.assignee_name, email:a.assignee_email, type:a.assignee_type, assignments:[] };
      item.assignments.push(a); map.set(key,item);
    });
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }, [assignments]);
  const overdueAssignments = activeAssignments.filter(a => a.expected_return_at && new Date(a.expected_return_at).getTime() < Date.now());
  const filteredPeople = people.filter(person => !search || [person.name,person.email,...person.assignments.flatMap(a=>{const e=equipoById[a.equipo_id]||{};return [e.marca,e.modelo,e.serie]})].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()));

  const activos = equipos.filter(e => {
    const owner = clienteById[e.cliente_id]?.nombre_completo || '';
    const haystack = [e.tipo, e.marca, e.modelo, e.serie, owner].filter(Boolean).join(' ').toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Technology Asset Operations</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Activos</h1>
          <p className="text-slate-500 mt-1">Identidad, custodia, responsable e historial operativo de cada equipo.</p>
        </div>
        <Button onClick={() => navigate('/OrdenesTrabajo?activation=first_work_order')}>
          <PackageOpen className="w-4 h-4 mr-2" /> Registrar recepción
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Card className="border-slate-200"><CardContent className="p-4"><p className="text-2xl font-bold">{equipos.length}</p><p className="text-xs text-slate-500">Activos registrados</p></CardContent></Card><Card className="border-slate-200"><CardContent className="p-4"><p className="text-2xl font-bold">{activeAssignments.length}</p><p className="text-xs text-slate-500">En custodia</p></CardContent></Card><Card className="border-slate-200"><CardContent className="p-4"><p className="text-2xl font-bold">{people.length}</p><p className="text-xs text-slate-500">Responsables con activos</p></CardContent></Card><Card className={overdueAssignments.length?'border-amber-200 bg-amber-50':'border-slate-200'}><CardContent className="p-4"><p className="text-2xl font-bold">{overdueAssignments.length}</p><p className="text-xs text-slate-500">Devoluciones vencidas</p></CardContent></Card></div>

      <div className="flex flex-wrap gap-2"><Button variant={view==='assets'?'default':'outline'} onClick={()=>setView('assets')}><Laptop className="w-4 h-4 mr-2"/>Por activo</Button><Button variant={view==='people'?'default':'outline'} onClick={()=>setView('people')}><UserRoundCheck className="w-4 h-4 mr-2"/>Por responsable</Button>{overdueAssignments.length>0&&<Badge className="self-center bg-amber-100 text-amber-800 border-0"><AlertTriangle className="w-3 h-3 mr-1"/>{overdueAssignments.length} pendiente{overdueAssignments.length===1?'':'s'} vencido{overdueAssignments.length===1?'':'s'}</Badge>}</div>

      <Card className="border border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por activo, serie, marca, modelo o responsable..." />
          </div>
        </CardContent>
      </Card>

      {view === 'assets' && (isLoading ? <p className="text-slate-500">Cargando activos...</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {activos.map(equipo => {
            const historial = ordenesByEquipo[equipo.id] || [];
            const ultimaOT = historial[0];
            const owner = clienteById[equipo.cliente_id];
            return (
              <Card key={equipo.id} className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/activo/${equipo.id}`)}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0"><Laptop className="w-5 h-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-950">{[equipo.marca, equipo.modelo].filter(Boolean).join(' ') || equipo.tipo || 'Activo'}</h3>
                        <Badge variant="outline" className="capitalize">{equipo.tipo || 'equipo'}</Badge>
                      </div>
                      <p className="text-xs font-mono text-slate-500 mt-1">{equipo.serie ? `Serie ${equipo.serie}` : `ID ${equipo.id}`}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-slate-50 p-3"><div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1"><User className="w-3 h-3" /> Responsable</div><p className="font-medium text-slate-800 truncate">{owner?.nombre_completo || 'Sin responsable visible'}</p></div>
                    <div className="rounded-lg bg-slate-50 p-3"><div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1"><MapPin className="w-3 h-3" /> Ubicación</div><p className="font-medium text-slate-800">{ultimaOT?.branch_id ? 'Sucursal de última OT' : 'Sin ubicación operativa'}</p></div>
                  </div>

                  <div className="flex items-center justify-between border-t pt-3">
                    <div className="flex items-center gap-2 text-sm text-slate-600"><History className="w-4 h-4" /><span><strong>{historial.length}</strong> {historial.length === 1 ? 'intervención' : 'intervenciones'}</span>{ultimaOT && <Badge className="bg-slate-100 text-slate-700 border-0">{ultimaOT.estado}</Badge>}</div>
                    <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); navigate(`/activo/${equipo.id}`); }}>Ver activo <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}

      {view === 'people' && (assignmentsLoading ? <p className="text-slate-500">Cargando custodia...</p> : <div className="space-y-4">{filteredPeople.map(person=><Card key={person.key} className="border-slate-200"><CardContent className="p-5"><div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4"><div><h3 className="font-semibold text-slate-950">{person.name}</h3><p className="text-sm text-slate-500">{person.email || 'Sin correo registrado'} · {person.assignments.length} activo{person.assignments.length===1?'':'s'} en custodia</p></div></div><div className="grid gap-2 md:grid-cols-2">{person.assignments.map(a=>{const e=equipoById[a.equipo_id]||{};const overdue=a.expected_return_at&&new Date(a.expected_return_at).getTime()<Date.now();return <button key={a.id} onClick={()=>navigate(`/activo/${a.equipo_id}`)} className="text-left rounded-xl border p-4 hover:bg-slate-50"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{[e.marca,e.modelo].filter(Boolean).join(' ')||e.tipo||'Activo'}</p><p className="text-xs text-slate-500 mt-1">{e.serie?`Serie ${e.serie}`:'Sin serie'} · Asignado {new Intl.DateTimeFormat('es-CR',{dateStyle:'medium'}).format(new Date(a.assigned_at))}</p></div>{overdue?<Badge className="bg-amber-100 text-amber-800 border-0"><Undo2 className="w-3 h-3 mr-1"/>Vencido</Badge>:<ArrowRight className="w-4 h-4 text-slate-400"/>}</div></button>})}</div></CardContent></Card>)}{filteredPeople.length===0&&<Card className="border-dashed"><CardContent className="py-12 text-center"><UserRoundCheck className="w-10 h-10 mx-auto text-slate-300 mb-3"/><h3 className="font-semibold">Sin custodias activas</h3><p className="text-sm text-slate-500 mt-1">Las asignaciones aparecerán aquí agrupadas por responsable.</p></CardContent></Card>}</div>)}

      {view === 'assets' && !isLoading && activos.length === 0 && <Card className="border-dashed"><CardContent className="py-14 text-center"><Laptop className="w-10 h-10 mx-auto text-slate-300 mb-3" /><h3 className="font-semibold text-slate-800">No hay activos que mostrar</h3><p className="text-sm text-slate-500 mt-1">Los activos nacen de una recepción real; no necesitas mantener un catálogo paralelo.</p></CardContent></Card>}
    </div>
  );
}
