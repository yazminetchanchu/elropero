import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const getEnv = (key: string, fallback: string = ''): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  return fallback;
};

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY', 'AIzaSyDdAh_WOyh_ug0sBO_2SJrYEJKm3eakirY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', 'el-ropero-8989a.firebaseapp.com'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID', 'el-ropero-8989a'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET', 'el-ropero-8989a.firebasestorage.app'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', '196603513172'),
  appId: getEnv('VITE_FIREBASE_APP_ID', '1:196603513172:web:1c2bc7d66031752b70a0c1'),
  measurementId: getEnv('VITE_FIREBASE_MEASUREMENT_ID', 'G-KXEC670TDR')
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