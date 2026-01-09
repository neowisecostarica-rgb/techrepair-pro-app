/**
 * Pruebas técnicas hardcodeadas por componente
 */
export const PRUEBAS_POR_COMPONENTE = {
  energia: [
    { id: 'voltaje_entrada', nombre: 'Voltaje de entrada correcto' },
    { id: 'fuente_alimentacion', nombre: 'Fuente de alimentación funcional' },
    { id: 'bateria_carga', nombre: 'Batería retiene carga' },
    { id: 'conexiones_energia', nombre: 'Conexiones de energía en buen estado' }
  ],
  almacenamiento: [
    { id: 'disco_detectado', nombre: 'Disco duro/SSD detectado' },
    { id: 'sectores_dañados', nombre: 'Sin sectores dañados' },
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