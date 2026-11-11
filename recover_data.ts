/**
 * Script de diagnóstico y recuperación de datos para showrooms de El Ropero
 * 
 * Verifica si los documentos principales y las subcolecciones `sales` de Firestore
 * aún contienen documentos históricos de ventas.
 * 
 * Uso: npx tsx recover_data.ts
 */
import { collection, getDocs, doc, getDoc, query, orderBy, limit } from 'firebase/firestore';
import { db } from './services/firebase';

const SHOWROOM_IDS = ['ROPERO', 'EL-ROPERO-TEST'];

async function inspectShowroom(showroomId: string) {
  console.log(`\n==================================================`);
  console.log(`🔍 ANALIZANDO SHOWROOM: "${showroomId}"`);
  console.log(`==================================================\n`);

  // 1. Verificar estado del documento raíz
  const rootRef = doc(db, 'showrooms', showroomId);
  try {
    const rootSnap = await getDoc(rootRef);

    if (!rootSnap.exists()) {
      console.log(`❌ Documento raíz showrooms/${showroomId} NO EXISTE.`);
    } else {
      const data = rootSnap.data();
      console.log(`📄 Documento raíz showrooms/${showroomId} EXISTE:`);
      console.log(`   - inventory: ${(data.inventory || []).length} items`);
      console.log(`   - sales (buffer raíz): ${(data.sales || []).length} ventas`);
      console.log(`   - expenses: ${(data.expenses || []).length} egresos`);
      console.log(`   - giftCards: ${(data.giftCards || []).length} gift cards`);
      console.log(`   - closures: ${(data.closures || []).length} cierres`);
      console.log(`   - lastSync: ${data.lastSync ? new Date(data.lastSync).toLocaleString('es-AR') : 'N/A'}`);
      console.log(`   - webSettings: ${data.webSettings ? 'SÍ' : 'NO'}`);
    }
  } catch (err: any) {
    console.error(`Error al leer documento raíz showrooms/${showroomId}:`, err.message || err);
  }

  // 2. Verificar subcolección de ventas
  console.log(`\n🔍 Buscando ventas en subcolección showrooms/${showroomId}/sales...`);

  const salesCol = collection(db, 'showrooms', showroomId, 'sales');
  const salesQuery = query(salesCol, orderBy('fecha', 'desc'), limit(1000));

  try {
    const salesSnap = await getDocs(salesQuery);

    if (salesSnap.empty) {
      console.log(`❌ La subcolección showrooms/${showroomId}/sales está VACÍA.`);
    } else {
      console.log(`✅ ENCONTRADAS ${salesSnap.size} ventas en la subcolección showrooms/${showroomId}/sales!\n`);

      let totalMonto = 0;
      const ventasPorMes: Record<string, number> = {};

      salesSnap.docs.forEach(d => {
        const sale = d.data();
        totalMonto += sale.total || 0;
        if (sale.fecha) {
          const fecha = new Date(sale.fecha);
          const mesAnio = `${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()}`;
          ventasPorMes[mesAnio] = (ventasPorMes[mesAnio] || 0) + 1;
        }
      });

      console.log(`📊 Resumen de ventas en subcolección:`);
      console.log(`   - Total ventas encontradas: ${salesSnap.size}`);
      console.log(`   - Monto acumulado: $${totalMonto.toLocaleString('es-AR')}`);
      console.log(`   - Distribución por mes:`);
      Object.entries(ventasPorMes)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([mes, cant]) => {
          console.log(`     * Mes ${mes}: ${cant} ventas`);
        });

      console.log(`\n📋 Muestra de las 5 ventas más recientes en subcolección:`);
      salesSnap.docs.slice(0, 5).forEach((d, idx) => {
        const s = d.data();
        console.log(`   ${idx + 1}. [${s.fecha || 'Sin fecha'}] ID: ${d.id} | Tipo: ${s.tipo || 'venta'} | Total: $${s.total || 0} | Items: ${(s.items || []).length}`);
      });
    }
  } catch (err: any) {
    console.error(`Error al consultar subcolección showrooms/${showroomId}/sales:`, err.message || err);
  }
}

async function run() {
  console.log(`🚀 INICIANDO DIAGNÓSTICO DE RECUPERACIÓN DE VENTAS\n`);

  for (const id of SHOWROOM_IDS) {
    await inspectShowroom(id);
  }

  // 3. Listar todos los showrooms existentes en la colección
  console.log(`\n==================================================`);
  console.log(`🔍 EXPLORANDO TODOS LOS SHOWROOMS EN FIRESTORE`);
  console.log(`==================================================\n`);
  try {
    const showroomsCol = collection(db, 'showrooms');
    const showroomsSnap = await getDocs(showroomsCol);
    console.log(`📦 Se encontraron ${showroomsSnap.size} documento(s) en la colección 'showrooms':`);
    for (const d of showroomsSnap.docs) {
      const data = d.data();
      const invCount = (data.inventory || []).length;
      const salesCount = (data.sales || []).length;
      console.log(`   - ${d.id}: ${invCount} productos en inventario, ${salesCount} ventas en buffer del documento`);
    }
  } catch (err: any) {
    console.error('Error al listar showrooms:', err.message || err);
  }

  console.log(`\n Diagnóstico completado.`);
  process.exit(0);
}

run().catch(err => {
  console.error('Error fatal durante el diagnóstico:', err);
  process.exit(1);
});
