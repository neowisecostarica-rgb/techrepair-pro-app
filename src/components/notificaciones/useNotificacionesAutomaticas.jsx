// Notification production is backend-owned. The former hook inferred workflow
// state and wrote Notificacion from the browser, which is not an authority
// boundary. Rendering and acknowledgement remain in NotificacionesPanel.
export function useNotificacionesAutomaticas() {
  return null;
}
