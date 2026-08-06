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
  const sales = data.sales || [];
  console.log(`Showroom ${showroomId} has ${sales.length} sales.`);
  const jsonStr = JSON.stringify(data);
  console.log(`Document size: ${(jsonStr.length / 1024 / 1024).toFixed(2)} MB`);
  process.exit(0);
}

run().catch(console.error);
