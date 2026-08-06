import { doc, getDoc } from 'firebase/firestore';
import { db } from './services/firebase';

async function run() {
  const checkShowroom = async (id: string) => {
    const srRef = doc(db, 'showrooms', id);
    const snap = await getDoc(srRef);
    if (!snap.exists()) return console.log(`${id}: No existe`);
    const inv = snap.data().inventory || [];
    const itemWithStock = inv.find((i: any) => i.cantidad > 0);
    console.log(`${id}: ${inv.length} items. First item with stock:`, itemWithStock ? JSON.stringify(itemWithStock, null, 2) : 'none');
  };
  await checkShowroom('EL-ROPERO-TEST');
  process.exit(0);
}

run().catch(console.error);
