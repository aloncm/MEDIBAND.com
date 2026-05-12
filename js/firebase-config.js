import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDaiHnrIjc19v9fGJ7qRM-77z0W98UAHFQ",
    authDomain: "mediband-76164.firebaseapp.com",
    projectId: "mediband-76164",
    storageBucket: "mediband-76164.firebasestorage.app",
    messagingSenderId: "178817959706",
    appId: "1:178817959706:web:402276566b4f130f668ea3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
