import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    projectId: "rec-a-hr-erp-92837482",
    appId: "1:668239486880:web:35e477eb09cffb0d4dcec5",
    storageBucket: "rec-a-hr-erp-92837482.firebasestorage.app",
    apiKey: "AIzaSyCZ_nZUGHKyR8p-NBV2m3A6RFUi8438NQk",
    authDomain: "rec-a-hr-erp-92837482.firebaseapp.com",
    messagingSenderId: "668239486880"
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

export { app, db, auth, storage };
