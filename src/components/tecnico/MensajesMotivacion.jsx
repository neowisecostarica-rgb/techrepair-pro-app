import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Heart, Award } from 'lucide-react';

const MENSAJES_POR_ROL = {
  TECHNICIAN: [
    "Un paso a la vez. Hoy importa avanzar bien.",
    "La calidad de hoy evita problemas mañana.",
    "Hazlo bien, no rápido.",
    "Tu trabajo deja huella aunque nadie lo vea.",
    "Menos prisa, más criterio.",
    "Hoy cuenta el proceso, no el ruido.",
    "Resolver bien es también cuidar al cliente.",
    "La calma también es productividad.",
    "Cada detalle bien hecho suma.",
    "No todo es urgente. Prioriza.",
    "Hoy enfócate en terminar bien.",
    "La experiencia se nota en los pequeños gestos.",
    "Mejor claro que apresurado.",
    "Tu orden ayuda a todo el equipo.",
    "Hoy vale más hacer menos, pero mejor.",
    "Resolver problemas también es pensar.",
    "La calidad es tu mejor firma.",
    "Paso firme, aunque sea corto.",
    "Un buen cierre empieza con criterio.",
    "Hoy cuida el proceso.",
    "La constancia construye confianza.",
    "No corras, decide.",
    "Tu enfoque hace la diferencia.",
    "El cliente siente cuando el trabajo es bien hecho.",
    "Menos errores es más tiempo después.",
    "Hoy suma claridad.",
    "Resolver bien es profesionalismo.",
    "La calma también es parte del trabajo.",
    "Orden hoy, fluidez mañana.",
    "Hoy importa hacerlo correcto.",
    "Buen trabajo también es saber cuándo parar.",
  ],
  SALES: [
    "Primero entender, luego vender.",
    "Escuchar bien hoy abre puertas mañana.",
    "Claridad genera confianza.",
    "No presiones, acompaña.",
    "Cada conversación bien hecha suma.",
    "El seguimiento vale más que la insistencia.",
    "Hoy enfócate en entender necesidades.",
    "Vender es resolver, no empujar.",
    "La confianza se construye paso a paso.",
    "Preguntar bien es vender mejor.",
    "Hoy prioriza relaciones.",
    "Menos discurso, más escucha.",
    "El cliente recuerda cómo lo hiciste sentir.",
    "Hoy busca claridad, no cierre.",
    "Una buena venta empieza con empatía.",
    "El proceso importa tanto como el resultado.",
    "Acompañar también es vender.",
    "La honestidad siempre cierra mejor.",
    "Hoy suma valor, no presión.",
    "El seguimiento oportuno marca la diferencia.",
    "Entender bien evita reprocesos.",
    "Hoy cuida la experiencia.",
    "Vender bien es pensar a largo plazo.",
    "No todos los sí son hoy.",
    "La claridad ahorra tiempo después.",
    "Hoy construye confianza.",
    "Resolver dudas es avanzar.",
    "El cliente siente cuando hay interés real.",
    "Menos promesas, más cumplimiento.",
    "Hoy enfócate en ayudar.",
    "Buen cierre empieza con buen trato.",
  ],
  ORG_ADMIN: [
    "Prioridad clara hoy evita urgencias mañana.",
    "No todo lo urgente es importante.",
    "Decide con calma.",
    "Menos fricción, más claridad.",
    "Orden hoy facilita el mañana.",
    "Un sistema claro reduce errores.",
    "Hoy revisa lo esencial.",
    "La claridad ahorra energía.",
    "Decidir menos también es liderazgo.",
    "Hoy cuida el enfoque del equipo.",
    "La consistencia vale más que la velocidad.",
    "Buenas decisiones sostienen el sistema.",
    "Hoy elimina ruido.",
    "Menos excepciones, más reglas claras.",
    "El orden también es cultura.",
    "Hoy prioriza impacto.",
    "Liderar es simplificar.",
    "La claridad baja la presión del equipo.",
    "Hoy revisa procesos, no personas.",
    "Un sistema sano respira mejor.",
    "La previsión evita crisis.",
    "Hoy observa antes de actuar.",
    "Menos correcciones, mejores decisiones.",
    "El sistema refleja tus prioridades.",
    "Hoy refuerza lo importante.",
    "La claridad es liderazgo silencioso.",
    "Menos urgencia, más dirección.",
    "Hoy ordena para mañana.",
    "Las decisiones claras escalan mejor.",
    "Un buen sistema se siente.",
    "Hoy deja el sistema mejor que ayer.",
  ],
  BRANCH_ADMIN: [
    "Prioridad clara hoy evita urgencias mañana.",
    "No todo lo urgente es importante.",
    "Decide con calma.",
    "Menos fricción, más claridad.",
    "Orden hoy facilita el mañana.",
    "Un sistema claro reduce errores.",
    "Hoy revisa lo esencial.",
    "La claridad ahorra energía.",
    "Decidir menos también es liderazgo.",
    "Hoy cuida el enfoque del equipo.",
    "La consistencia vale más que la velocidad.",
    "Buenas decisiones sostienen el sistema.",
    "Hoy elimina ruido.",
    "Menos excepciones, más reglas claras.",
    "El orden también es cultura.",
    "Hoy prioriza impacto.",
    "Liderar es simplificar.",
    "La claridad baja la presión del equipo.",
    "Hoy revisa procesos, no personas.",
    "Un sistema sano respira mejor.",
    "La previsión evita crisis.",
    "Hoy observa antes de actuar.",
    "Menos correcciones, mejores decisiones.",
    "El sistema refleja tus prioridades.",
    "Hoy refuerza lo importante.",
    "La claridad es liderazgo silencioso.",
    "Menos urgencia, más dirección.",
    "Hoy ordena para mañana.",
    "Las decisiones claras escalan mejor.",
    "Un buen sistema se siente.",
    "Hoy deja el sistema mejor que ayer.",
  ],
};

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

export default function MensajesMotivacion({ tipo, contexto, role }) {
  const [fraseDelDia] = useState(() => {
    const dia = new Date().getDate(); // 1-31
    const index = dia - 1; // 0-30
    const mensajes = MENSAJES_POR_ROL[role] || MENSAJES_POR_ROL.TECHNICIAN;
    return mensajes[index] || mensajes[0];
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