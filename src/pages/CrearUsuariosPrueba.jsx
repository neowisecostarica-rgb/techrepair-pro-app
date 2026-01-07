import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';

export default function CrearUsuariosPrueba() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);

  const usuarios = [
    { email: 'ventas@compustorecr.com', role: 'user', userRole: 'SALES' },
    { email: 'alejandro@compustorecr.com', role: 'user', userRole: 'TECHNICIAN' },
    { email: 'gustavo@compustorecr.com', role: 'user', userRole: 'ORG_ADMIN' }
  ];

  const crearUsuarios = async () => {
    setLoading(true);
    const resultados = [];

    for (const usuario of usuarios) {
      try {
        // Invitar usuario
        await base44.users.inviteUser(usuario.email, usuario.role);
        
        // Esperar un momento para que se cree el usuario
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Obtener el user actual para obtener su ID
        const me = await base44.auth.me();
        
        // Crear UserAccount
        await base44.entities.UserAccount.create({
          user_email: usuario.email,
          organization_id: '695ddcc8ce671f4a7a101b74',
          role: usuario.userRole,
          active: true,
          user_id: `pending_${usuario.email}` // Temporal hasta que el usuario complete registro
        });

        resultados.push({
          email: usuario.email,
          status: 'success',
          message: 'Usuario invitado. UserAccount creado (se actualizará user_id cuando complete registro)'
        });
      } catch (error) {
        resultados.push({
          email: usuario.email,
          status: 'error',
          message: error.message
        });
      }
    }

    setResults(resultados);
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Crear Usuarios de Prueba</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold">Usuarios a crear:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-slate-600">
              <li>ventas@compustorecr.com - Role: SALES</li>
              <li>alejandro@compustorecr.com - Role: TECHNICIAN</li>
              <li>gustavo@compustorecr.com - Role: ORG_ADMIN</li>
            </ul>
          </div>

          <Button
            onClick={crearUsuarios}
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-blue-500"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creando usuarios...
              </>
            ) : (
              'Crear Usuarios'
            )}
          </Button>

          {results.length > 0 && (
            <div className="space-y-2 mt-4">
              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg ${
                    result.status === 'success'
                      ? 'bg-emerald-50 border border-emerald-200'
                      : 'bg-red-50 border border-red-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {result.status === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <div className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5">✕</div>
                    )}
                    <div>
                      <p className="font-medium text-sm">{result.email}</p>
                      <p className="text-xs text-slate-600">{result.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}