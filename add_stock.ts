import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './services/firebase';

async function run() {
  const showroomId = '3c358e23-02ce-4eee-b9b0-973bbec85e6a';
  const srRef = doc(db, 'showrooms', showroomId);
  const snap = await getDoc(srRef);
  if (!snap.exists()) {
    console.error('Showroom not found');
    process.exit(1);
  }
  const data = snap.data();
  const inventory = data.inventory || [];
  
  const itemIndex = inventory.findIndex((i: any) => i.id === 'inv_1769355065152');
  if (itemIndex > -1) {
    inventory[itemIndex].cantidad += 10; // add 10 stock
    await updateDoc(srRef, { inventory });
    console.log('Stock added successfully');
  } else {
    console.log('Item not found');
  }
  process.exit(0);
}

run().catch(console.error);
