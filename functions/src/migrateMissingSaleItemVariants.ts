import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/** Helper to extract size (talle) and color from description */
function parseVariantFromDescripcion(descripcion: string): { talle?: string; color?: string } {
  const talleMatch = descripcion.match(/\(.*?T:([^\s)]+)/i);
  const colorMatch = descripcion.match(/\(.*?C:([^\s)]+)/i);
  return {
    talle: talleMatch?.[1]?.trim(),
    color: colorMatch?.[1]?.trim().toUpperCase(),
  };
}

/**
 * Callable Cloud Function that back‑fills missing `talle` and `color` fields on historic SaleItem records.
 * It scans all showrooms, iterates through each sale's items and, when a variant field is empty,
 * parses it from the `descripcion` string and updates the document.
 *
 * Guarded: only users with admin privileges (or a designated service account) may invoke it.
 */
export const migrateMissingSaleItemVariants = functions.https.onCall(async (data, context) => {
  // Simple admin guard – adjust according to your auth model.
  if (!context.auth || !(context.auth.token?.admin || context.auth.uid === 'service-account')) {
    throw new functions.https.HttpsError('permission-denied', 'Only administrators can run this migration');
  }

  const db = admin.firestore();
  const showroomsSnap = await db.collection('showrooms').get();
  let totalProcessed = 0;
  let totalUpdated = 0;
  const batchLimit = 500;
  let batch = db.batch();
  let batchOps = 0;

  for (const showroomDoc of showroomsSnap.docs) {
    const showroomData = showroomDoc.data();
    const sales: any[] = showroomData.sales || [];
    let salesChanged = false;

    const newSales = sales.map((sale) => {
      if (!sale.items) return sale;
      const newItems = sale.items.map((item: any) => {
        const missingTalle = !item.talle || item.talle === '';
        const missingColor = !item.color || item.color === '';
        if (!missingTalle && !missingColor) return item; // nothing to update

        const parsed = parseVariantFromDescripcion(item.descripcion || '');
        const updated: any = { ...item };
        if (missingTalle && parsed.talle) {
          updated.talle = parsed.talle;
        }
        if (missingColor && parsed.color) {
          updated.color = parsed.color;
        }
        if (updated.talle !== item.talle || updated.color !== item.color) {
          totalUpdated++;
        }
        totalProcessed++;
        return updated;
      });
      if (newItems !== sale.items) {
        salesChanged = true;
        return { ...sale, items: newItems };
      }
      return sale;
    });

    if (salesChanged) {
      batch.update(showroomDoc.ref, { sales: newSales });
      batchOps++;
      if (batchOps >= batchLimit) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  return { message: 'Migration completed', totalProcessed, totalUpdated };
});
