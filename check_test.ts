import { doc, getDoc } from 'firebase/firestore';
import { db } from './services/firebase';

async function run() {
  const showroomId = 'EL-ROPERO-TEST';
  const srRef = doc(db, 'showrooms', showroomId);
  const snap = await getDoc(srRef);
  if (!snap.exists()) {
    console.error('Showroom not found');
    process.exit(1);
  }
  const data = snap.data();
  console.log(`Inventory length: ${data.inventory?.length || 0}`);
  console.log(`Sales length: ${data.sales?.length || 0}`);
  console.log(`Gastos length: ${data.gastos?.length || 0}`);
  console.log(`GiftCards length: ${data.giftCards?.length || 0}`);
  console.log(`Total keys in document: ${Object.keys(data).length}`);
  
  let totalObjects = 0;
  function countObjects(obj: any) {
    if (obj && typeof obj === 'object') {
      totalObjects++;
      for (const k in obj) {
        countObjects(obj[k]);
      }
    }
  }
  countObjects(data);
  console.log(`Total nested objects/fields (rough index count): ${totalObjects}`);
  process.exit(0);
}

run().catch(console.error);
