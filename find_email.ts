import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './services/firebase';

async function run() {
  const q = query(collection(db, 'mail'));
  const snap = await getDocs(q);
  let found = false;
  snap.forEach(doc => {
    const data = doc.data();
    if (data.message && data.message.subject && data.message.subject.includes('Nueva Compra')) {
      console.log(`Email ID: ${doc.id}`);
      console.log(JSON.stringify(data, null, 2));
      found = true;
    }
  });
  if (!found) {
    console.log('No emails found with "Nueva Compra" in the subject.');
  }
  process.exit(0);
}

run().catch(console.error);
