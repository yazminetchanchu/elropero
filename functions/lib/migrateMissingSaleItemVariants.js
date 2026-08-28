"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateMissingSaleItemVariants = void 0;
exports.parseVariantFromDescripcion = parseVariantFromDescripcion;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
/** Helper to extract size (talle) and color from description */
function parseVariantFromDescripcion(descripcion) {
    if (!descripcion)
        return {};
    // Extrae talle: busca 'T:' y captura hasta encontrar 'C:' o el cierre ')'
    const talleMatch = descripcion.match(/\(.*?T:([^)]*?)(?:\s+C:|\))/i);
    // Extrae color: busca 'C:' y captura hasta encontrar 'T:' o el cierre ')'
    const colorMatch = descripcion.match(/\(.*?C:([^)]*?)(?:\s+T:|\))/i);
    const talle = talleMatch && talleMatch[1].trim() ? talleMatch[1].trim().toUpperCase() : undefined;
    const color = colorMatch && colorMatch[1].trim() ? colorMatch[1].trim().toUpperCase() : undefined;
    return { talle, color };
}
/**
 * Callable Cloud Function that back‑fills missing `talle` and `color` fields on historic SaleItem records.
 * It scans all showrooms, iterates through each sale's items and, when a variant field is empty,
 * parses it from the `descripcion` string and updates the document.
 *
 * Guarded: only users with admin privileges (or a designated service account) may invoke it.
 */
exports.migrateMissingSaleItemVariants = functions.https.onCall(async (data, context) => {
    var _a;
    // Simple admin guard – adjust according to your auth model.
    if (!context.auth || !(((_a = context.auth.token) === null || _a === void 0 ? void 0 : _a.admin) || context.auth.uid === 'service-account')) {
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
        const sales = showroomData.sales || [];
        let salesChanged = false;
        const newSales = sales.map((sale) => {
            if (!sale.items)
                return sale;
            const newItems = sale.items.map((item) => {
                const missingTalle = !item.talle || item.talle === '';
                const missingColor = !item.color || item.color === '';
                if (!missingTalle && !missingColor)
                    return item; // nothing to update
                const parsed = parseVariantFromDescripcion(item.descripcion || '');
                const updated = Object.assign({}, item);
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
                return Object.assign(Object.assign({}, sale), { items: newItems });
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
//# sourceMappingURL=migrateMissingSaleItemVariants.js.map