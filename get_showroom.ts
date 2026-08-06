import { collection, getDocs } from 'firebase/firestore';
import { db } from './services/firebase';

async function run() {
  const col = collection(db, 'showrooms');
  const snap = await getDocs(col);
  if (snap.empty) {
    console.error('No showrooms found');
    process.exit(1);
  }
  
  for (const sr of snap.docs) {
    const data = sr.data();
    const inventory = data.inventory || [];
    if (inventory.length > 0) {
      console.log(`Found showroom with inventory: ${sr.id}`);
      console.log(`Found inventory item: ${inventory[0].id}`);
      console.log(JSON.stringify(inventory[0], null, 2));
      process.exit(0);
    }
  }
  
  console.log('No inventory in any showroom');
  process.exit(0);
}

run().catch(console.error);
