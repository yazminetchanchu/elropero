import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDdAh_WOyh_ug0sBO_2SJrYEJKm3eakirY",
  authDomain: "el-ropero-8989a.firebaseapp.com",
  projectId: "el-ropero-8989a",
  storageBucket: "el-ropero-8989a.firebasestorage.app",
  messagingSenderId: "196603513172",
  appId: "1:196603513172:web:1c2bc7d66031752b70a0c1",
  measurementId: "G-KXEC670TDR"
};

// Inicializamos Firebase
const app = initializeApp(firebaseConfig);

// Exportamos los servicios para usarlos en tus componentes
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
import { getFunctions } from "firebase/functions";
export const functions = getFunctions(app, "us-central1");

export default app;