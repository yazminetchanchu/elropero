import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDdAh_W0yh_ug0sB0_2SJrYEJKm3eakirY",
  authDomain: "el-ropero-8989a.firebaseapp.com",
  projectId: "el-ropero-8989a",
  storageBucket: "el-ropero-8989a.firebasestorage.app",
  messagingSenderId: "196603513172",
  appId: "1:196603513172:web:1c2bc7d66031752b70a0c1"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

