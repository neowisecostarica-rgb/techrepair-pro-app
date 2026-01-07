import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Heart, Award } from 'lucide-react';

const FRASES_DIARIAS = [
  "Tu trabajo hace la diferencia. Cada reparación cuenta.",
  "El detalle técnico que aplicas marca la calidad del servicio.",
  "Tu conocimiento resuelve problemas reales de personas reales.",
  "Cada diagnóstico preciso es un paso hacia la excelencia.",
  "Tu profesionalismo construye confianza con cada cliente.",
  "El tiempo que dedicas a cada equipo se nota en el resultado.",
  "Tu experiencia es valiosa. Gracias por compartirla.",
  "Cada equipo que sale bien es un logro tuyo.",
  "Tu criterio técnico es esencial para este equipo.",
  "El orden en tu trabajo refleja tu compromiso profesional.",
];

const MENSAJES_AGRADECIMIENTO = {
  diagnostico: [
    "✅ Diagnóstico registrado. Excelente trabajo documentando el caso.",
    "🎯 Bien hecho. Tu precisión técnica es valiosa.",
    "👏 Diagnóstico completo. Gracias por el detalle.",
  ],
  cierre: [
    "🎉 OT completada correctamente. Gran trabajo.",
    "✨ Excelente ejecución. El cliente notará la calidad.",
    "🏆 Trabajo finalizado con éxito. Profesional como siempre.",
  ],
};

const MENSAJES_PROTECCION = {
  falta_aprobacion: "🛡️ Bloqueo registrado. No se te atribuirá este tiempo de espera.",
  falta_repuesto: "🛡️ Retraso documentado. Tu trabajo está protegido mientras llega el material.",
  espera_cliente: "🛡️ Espera justificada. El tiempo de pausa está registrado correctamente.",
};

export default function MensajesMotivacion({ tipo, contexto }) {
  const [fraseDelDia] = useState(() => {
    const index = new Date().getDate() % FRASES_DIARIAS.length;
    return FRASES_DIARIAS[index];
  });

  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (tipo === 'agradecimiento' || tipo === 'proteccion') {
      const timer = setTimeout(() => setVisible(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [tipo]);

  if (!visible && tipo !== 'diaria') return null;

  const renderContenido = () => {
    switch (tipo) {
      case 'diaria':
        return (
          <Card className="border-0 bg-gradient-to-r from-emerald-50 to-blue-50 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                <p className="text-sm text-slate-700 italic">{fraseDelDia}</p>
              </div>
            </CardContent>
          </Card>
        );

      case 'agradecimiento':
        const mensajesAgradecimiento = MENSAJES_AGRADECIMIENTO[contexto] || [];
        const mensajeAleatorio = mensajesAgradecimiento[Math.floor(Math.random() * mensajesAgradecimiento.length)];
        return (
          <Card className="border-0 bg-gradient-to-r from-green-50 to-emerald-50 shadow-md animate-in fade-in slide-in-from-top-4 duration-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Heart className="w-5 h-5 text-green-600" />
                <p className="text-sm font-medium text-green-800">{mensajeAleatorio}</p>
              </div>
            </CardContent>
          </Card>
        );

      case 'proteccion':
        const mensajeProteccion = MENSAJES_PROTECCION[contexto] || "🛡️ Situación registrada correctamente.";
        return (
          <Card className="border-0 bg-gradient-to-r from-blue-50 to-indigo-50 shadow-md animate-in fade-in slide-in-from-top-4 duration-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Award className="w-5 h-5 text-blue-600" />
                <p className="text-sm font-medium text-blue-800">{mensajeProteccion}</p>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return renderContenido();
}