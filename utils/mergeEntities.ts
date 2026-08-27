/**
 * Realiza una unión por ID entre dos listas de entidades (local y servidor).
 * Preserva primero todo lo remoto (evitando sobreescritura de ventas web / datos del server)
 * y suma o actualiza con las modificaciones locales.
 */
export const mergeEntities = <T extends { id: string }>(
  localList: T[] = [],
  serverList: T[] = []
): T[] => {
  const entityMap = new Map<string, T>();
  // Preservar primero todo lo remoto
  (serverList || []).forEach((item) => {
    if (item && item.id) {
      entityMap.set(item.id, item);
    }
  });
  // Sumar o actualizar con las modificaciones locales
  (localList || []).forEach((item) => {
    if (item && item.id) {
      entityMap.set(item.id, item);
    }
  });
  return Array.from(entityMap.values());
};
