import { collection, getDocs, query, limit, where } from 'firebase/firestore';
import { db } from './services/firebase';

async function run() {
  const q = query(collection(db, 'mail'), limit(20));
  const snap = await getDocs(q);
  let foundDelivery = false;
  snap.forEach(doc => {
    const data = doc.data();
    if (data.delivery) {
      console.log(`Email ID: ${doc.id} has delivery state: ${data.delivery.state}`);
      foundDelivery = true;
    }
  });
  if (!foundDelivery) {
    console.log('No delivery fields found in the first 20 emails.');
  }
  process.exit(0);
}

run().catch(console.error);
