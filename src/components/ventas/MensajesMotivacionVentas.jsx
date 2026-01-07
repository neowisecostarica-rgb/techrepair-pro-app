import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Heart, Award } from 'lucide-react';

const FRASES_DIARIAS = [
  "Tu atención al cliente construye relaciones duraderas.",
  "Cada cotización clara es un paso hacia la confianza del cliente.",
  "Tu seguimiento marca la diferencia en la experiencia del cliente.",
  "La comunicación oportuna que brindas es valiosa para el negocio.",
  "Tu profesionalismo en ventas refleja la calidad del servicio.",
  "Cada cliente satisfecho es resultado de tu dedicación.",
  "Tu gestión comercial conecta soluciones con necesidades reales.",
  "El tiempo que dedicas al seguimiento se refleja en la satisfacción.",
  "Tu criterio comercial es esencial para el crecimiento del equipo.",
  "El orden en tus cotizaciones refleja tu compromiso profesional.",
];

const MENSAJES_RECONOCIMIENTO = {
  cotizacion: [
    "✅ Cotización registrada correctamente. Excelente trabajo.",
    "🎯 Bien hecho. Tu precisión en la cotización es valiosa.",
    "👏 Cotización completa. Gracias por el detalle.",
  ],
  seguimiento: [
    "🌟 Seguimiento realizado. Tu constancia marca la diferencia.",
    "✨ Excelente gestión. El cliente apreciará tu atención.",
    "🏆 Seguimiento completado. Profesional como siempre.",
  ],
  venta: [
    "🎉 Venta registrada correctamente. Gran gestión comercial.",
    "✨ Excelente cierre. Tu trabajo suma al equipo.",
    "🏆 Venta completada con éxito. Bien hecho.",
  ],
};

export default function MensajesMotivacionVentas({ tipo, contexto }) {
  const [fraseDelDia] = useState(() => {
    const index = new Date().getDate() % FRASES_DIARIAS.length;
    return FRASES_DIARIAS[index];
  });

  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (tipo === 'reconocimiento') {
      const timer = setTimeout(() => setVisible(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [tipo]);

  if (!visible && tipo !== 'diaria') return null;

  const renderContenido = () => {
    switch (tipo) {
      case 'diaria':
        return (
          <Card className="border-0 bg-gradient-to-r from-blue-50 to-purple-50 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <p className="text-sm text-slate-700 italic">{fraseDelDia}</p>
              </div>
            </CardContent>
          </Card>
        );

      case 'reconocimiento':
        const mensajes = MENSAJES_RECONOCIMIENTO[contexto] || [];
        const mensajeAleatorio = mensajes[Math.floor(Math.random() * mensajes.length)];
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

      default:
        return null;
    }
  };

  return renderContenido();
}