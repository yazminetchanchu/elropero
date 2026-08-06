import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from './services/firebase';

async function run() {
  const q = query(collection(db, 'mail'), orderBy('message.subject', 'desc'), limit(5));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    console.log(`Email ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
  process.exit(0);
}

run().catch(console.error);
