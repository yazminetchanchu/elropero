import { doc, getDoc, updateDoc } from 'firebase/firestore';
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
  let sales = data.sales || [];
  
  if (sales.length > 50) {
    sales = sales.slice(-50); // Keep only last 50 sales
    await updateDoc(srRef, { sales });
    console.log('Truncated sales to 50 items to avoid size limits.');
  } else {
    console.log('Sales array is small enough.');
  }
  process.exit(0);
}

run().catch(console.error);
