import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDdAh_WOyh_ug0sBO_2SJrYEJKm3eakirY",
  authDomain: "el-ropero-8989a.firebaseapp.com",
  projectId: "el-ropero-8989a",
  storageBucket: "el-ropero-8989a.firebasestorage.app",
  messagingSenderId: "196603513172",
  appId: "1:196603513172:web:1c2bc7d66031752b70a0c1",
  measurementId: "G-KXEC670TDR"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

createUserWithEmailAndPassword(auth, "elropero.informacion@gmail.com", "Danisa0302")
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
