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
export interface MergeableEntity {
  id: string;
  updatedAt?: string | number;
  isDeleted?: boolean;
  deleted?: boolean;
  deletedAt?: string | number;
  webDiscount?: number | null;
  [key: string]: any;
}

/**
 * Sincronización segura de entidades locales y remotas.
 * - Filtra entidades marcadas como eliminadas (isDeleted, deleted, deletedAt).
 * - Evita la resurrección de elementos eliminados localmente.
 * - Resuelve conflictos comparando updatedAt / timestamps.
 * - Preserva propiedades específicas de la web como webDiscount.
 */
export const mergeEntities = <T extends MergeableEntity>(
  localList: T[] = [],
  serverList: T[] = []
): T[] => {
  const entityMap = new Map<string, T>();

  // 1. Cargar entidades remotas válidas (no eliminadas)
  (serverList || []).forEach((remote) => {
    if (remote && remote.id && !remote.isDeleted && !remote.deleted && !remote.deletedAt) {
      entityMap.set(remote.id, remote);
    }
  });

  // 2. Resolver conflictos respetando marcas de borrado y fechas de modificación
  (localList || []).forEach((local) => {
    if (!local || !local.id) return;

    if (local.isDeleted || local.deleted || local.deletedAt) {
      // Si fue eliminado en local, se elimina del resultado final
      entityMap.delete(local.id);
      return;
    }

    const existing = entityMap.get(local.id);

    if (!existing) {
      entityMap.set(local.id, local);
    } else {
      // Comparar timestamps para conservar la versión más reciente
      const localTime = new Date((local as any).updatedAt || (local as any).fechaModificacion || (local as any).fecha || 0).getTime();
      const remoteTime = new Date((existing as any).updatedAt || (existing as any).fechaModificacion || (existing as any).fecha || 0).getTime();

      if (localTime >= remoteTime) {
        // Preservar configuraciones de descuentos web durante la unión
        entityMap.set(local.id, {
          ...existing,
          ...local,
          webDiscount: (local as any).webDiscount ?? (existing as any).webDiscount
        });
      } else {
        entityMap.set(local.id, {
          ...local,
          ...existing,
          webDiscount: (existing as any).webDiscount ?? (local as any).webDiscount
        });
      }
    }
  });

  return Array.from(entityMap.values());
};
