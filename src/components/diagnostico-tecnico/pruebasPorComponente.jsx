/**
 * Pruebas técnicas por componente — i18n-aware (MB10-C)
 * Convertido de constantes a funciones que reciben t() para soporte multi-idioma.
 */
export function getPruebasPorComponente(t) {
  return {
    energia: [
      { id: 'voltaje_entrada', nombre: t('diagTest.voltajeEntrada','Voltaje de entrada correcto') },
      { id: 'fuente_alimentacion', nombre: t('diagTest.fuenteAlimentacion','Fuente de alimentación funcional') },
      { id: 'bateria_carga', nombre: t('diagTest.bateriaCarga','Batería retiene carga') },
      { id: 'conexiones_energia', nombre: t('diagTest.conexionesEnergia','Conexiones de energía en buen estado') }
    ],
    almacenamiento: [
      { id: 'disco_detectado', nombre: t('diagTest.discoDetectado','Disco duro/SSD detectado') },
      { id: 'sectores_danados', nombre: t('diagTest.sectoresDanados','Sin sectores dañados') },
      { id: 'velocidad_lectura', nombre: t('diagTest.velocidadLectura','Velocidad de lectura normal') },
      { id: 'smart_status', nombre: t('diagTest.smartStatus','SMART status saludable') }
    ],
    memoria: [
      { id: 'ram_detectada', nombre: t('diagTest.ramDetectada','RAM detectada correctamente') },
      { id: 'test_memoria', nombre: t('diagTest.testMemoria','Test de memoria sin errores') },
      { id: 'modulos_estables', nombre: t('diagTest.modulosEstables','Módulos de memoria estables') }
    ],
    pantalla: [
      { id: 'imagen_visible', nombre: t('diagTest.imagenVisible','Imagen visible correctamente') },
      { id: 'pixeles_muertos', nombre: t('diagTest.pixelesMuertos','Sin pixeles muertos') },
      { id: 'retroiluminacion', nombre: t('diagTest.retroiluminacion','Retroiluminación funcional') },
      { id: 'conexion_video', nombre: t('diagTest.conexionVideo','Conexión de video correcta') }
    ],
    temperatura: [
      { id: 'ventiladores', nombre: t('diagTest.ventiladores','Ventiladores funcionando') },
      { id: 'temp_cpu', nombre: t('diagTest.tempCpu','Temperatura CPU normal') },
      { id: 'temp_gpu', nombre: t('diagTest.tempGpu','Temperatura GPU normal') },
      { id: 'pasta_termica', nombre: t('diagTest.pastaTermica','Pasta térmica en buen estado') }
    ],
    software: [
      { id: 'sistema_arranca', nombre: t('diagTest.sistemaArranca','Sistema operativo arranca') },
      { id: 'drivers_instalados', nombre: t('diagTest.driversInstalados','Drivers correctamente instalados') },
      { id: 'actualizaciones', nombre: t('diagTest.actualizaciones','Sistema actualizado') },
      { id: 'malware', nombre: t('diagTest.malware','Sin malware detectado') }
    ],
    red: [
      { id: 'wifi_funciona', nombre: t('diagTest.wifiFunciona','WiFi funcional') },
      { id: 'ethernet_funciona', nombre: t('diagTest.ethernetFunciona','Ethernet funcional') },
      { id: 'bluetooth', nombre: t('diagTest.bluetooth','Bluetooth funcional') },
      { id: 'velocidad_red', nombre: t('diagTest.velocidadRed','Velocidad de red normal') }
    ],
    otros: [
      { id: 'puertos_usb', nombre: t('diagTest.puertosUsb','Puertos USB funcionando') },
      { id: 'audio', nombre: t('diagTest.audio','Audio funcional') },
      { id: 'webcam', nombre: t('diagTest.webcam','Webcam funcional') },
      { id: 'teclado_mouse', nombre: t('diagTest.tecladoMouse','Teclado/Mouse funcionando') }
    ]
  };
}

export function getComponentesDisponibles(t) {
  return [
    { id: 'energia', label: t('diagTest.compEnergia','Energía') },
    { id: 'almacenamiento', label: t('diagTest.compAlmacenamiento','Almacenamiento') },
    { id: 'memoria', label: t('diagTest.compMemoria','Memoria RAM') },
    { id: 'pantalla', label: t('diagTest.compPantalla','Pantalla') },
    { id: 'temperatura', label: t('diagTest.compTemperatura','Temperatura / Ventilación') },
    { id: 'software', label: t('diagTest.compSoftware','Software / Sistema') },
    { id: 'red', label: t('diagTest.compRed','Red / Conectividad') },
    { id: 'otros', label: t('diagTest.compOtros','Otros componentes') }
  ];
}

// Legacy constants for backward compatibility (ES only)
export const PRUEBAS_POR_COMPONENTE = {
  energia: [
    { id: 'voltaje_entrada', nombre: 'Voltaje de entrada correcto' },
    { id: 'fuente_alimentacion', nombre: 'Fuente de alimentación funcional' },
    { id: 'bateria_carga', nombre: 'Batería retiene carga' },
    { id: 'conexiones_energia', nombre: 'Conexiones de energía en buen estado' }
  ],
  almacenamiento: [
    { id: 'disco_detectado', nombre: 'Disco duro/SSD detectado' },
    { id: 'sectores_danados', nombre: 'Sin sectores dañados' },
    { id: 'velocidad_lectura', nombre: 'Velocidad de lectura normal' },
    { id: 'smart_status', nombre: 'SMART status saludable' }
  ],
  memoria: [
    { id: 'ram_detectada', nombre: 'RAM detectada correctamente' },
    { id: 'test_memoria', nombre: 'Test de memoria sin errores' },
    { id: 'modulos_estables', nombre: 'Módulos de memoria estables' }
  ],
  pantalla: [
    { id: 'imagen_visible', nombre: 'Imagen visible correctamente' },
    { id: 'pixeles_muertos', nombre: 'Sin pixeles muertos' },
    { id: 'retroiluminacion', nombre: 'Retroiluminación funcional' },
    { id: 'conexion_video', nombre: 'Conexión de video correcta' }
  ],
  temperatura: [
    { id: 'ventiladores', nombre: 'Ventiladores funcionando' },
    { id: 'temp_cpu', nombre: 'Temperatura CPU normal' },
    { id: 'temp_gpu', nombre: 'Temperatura GPU normal' },
    { id: 'pasta_termica', nombre: 'Pasta térmica en buen estado' }
  ],
  software: [
    { id: 'sistema_arranca', nombre: 'Sistema operativo arranca' },
    { id: 'drivers_instalados', nombre: 'Drivers correctamente instalados' },
    { id: 'actualizaciones', nombre: 'Sistema actualizado' },
    { id: 'malware', nombre: 'Sin malware detectado' }
  ],
  red: [
    { id: 'wifi_funciona', nombre: 'WiFi funcional' },
    { id: 'ethernet_funciona', nombre: 'Ethernet funcional' },
    { id: 'bluetooth', nombre: 'Bluetooth funcional' },
    { id: 'velocidad_red', nombre: 'Velocidad de red normal' }
  ],
  otros: [
    { id: 'puertos_usb', nombre: 'Puertos USB funcionando' },
    { id: 'audio', nombre: 'Audio funcional' },
    { id: 'webcam', nombre: 'Webcam funcional' },
    { id: 'teclado_mouse', nombre: 'Teclado/Mouse funcionando' }
  ]
};

export const COMPONENTES_DISPONIBLES = [
  { id: 'energia', label: 'Energía' },
  { id: 'almacenamiento', label: 'Almacenamiento' },
  { id: 'memoria', label: 'Memoria RAM' },
  { id: 'pantalla', label: 'Pantalla' },
  { id: 'temperatura', label: 'Temperatura / Ventilación' },
  { id: 'software', label: 'Software / Sistema' },
  { id: 'red', label: 'Red / Conectividad' },
  { id: 'otros', label: 'Otros componentes' }
];