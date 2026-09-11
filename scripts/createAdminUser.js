import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "el-ropero-8989a",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || process.env.FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const email = process.env.ADMIN_EMAIL || process.argv[2];
const password = process.env.ADMIN_PASSWORD || process.argv[3];

if (!email || !password) {
  console.error("❌ Error: Debe especificar un email y contraseña.");
  console.error("Uso:");
  console.error("  ADMIN_EMAIL=admin@ejemplo.com ADMIN_PASSWORD=clave_segura node scripts/createAdminUser.js");
  console.error("  node scripts/createAdminUser.js admin@ejemplo.com clave_segura");
  process.exit(1);
}

createUserWithEmailAndPassword(auth, email, password)
  .then((userCredential) => {
    console.log("Admin user created successfully:", userCredential.user.email);
    process.exit(0);
  })
  .catch((error) => {
    if (error.code === 'auth/email-already-in-use') {
      console.log("The user already exists.");
      process.exit(0);
    }
    console.error("Error creating user:", error.message);
    process.exit(1);
  });

