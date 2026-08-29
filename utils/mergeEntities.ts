/**
 * @deprecated
 * ADVERTENCIA DE ARQUITECTURA (Bug 5):
 * El merge manual de entidades en el cliente (navegador) genera dos problemas graves:
 * 1. Resurrección de productos borrados localmente (al estar en el servidor, vuelven a fusionarse).
 * 2. Sobreescritura de stock vendido por la tienda web con el stock viejo del cliente.
 * 
 * En su lugar, se utilizan suscripciones en tiempo real con Firestore (`onSnapshot`) como
 * única fuente de verdad y mutaciones transaccionales/granulares (`runTransaction`, `arrayUnion`).
 * Se conserva esta función únicamente para retrocompatibilidad y pruebas históricas.
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
