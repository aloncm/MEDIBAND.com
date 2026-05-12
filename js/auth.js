import { auth, firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    createUserWithEmailAndPassword, 
    getAuth 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getUserProfile, createUserProfile } from './database.js';

let currentUserProfile = null;

// Handle Login Form
export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        let errorMsg = "Login failed. Please check your credentials.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMsg = "Invalid email or password.";
        }
        return { success: false, message: errorMsg };
    }
}

// Handle Logout
export async function logoutUser() {
    try {
        await signOut(auth);
        currentUserProfile = null;
        return true;
    } catch (error) {
        console.error("Error signing out:", error);
        return false;
    }
}

// Monitor Auth State
export function monitorAuthState(onLogin, onLogout) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Fetch additional profile data from Firestore
            const profile = await getUserProfile(user.uid);
            currentUserProfile = profile;
            onLogin(user, profile);
        } else {
            currentUserProfile = null;
            onLogout();
        }
    });
}

// Register New Doctor (As Admin)
export async function registerNewDoctor(name, email, password, department) {
    // We use a secondary Firebase app instance to avoid logging out the current admin
    const secondaryApp = initializeApp(firebaseConfig, "Secondary");
    const secondaryAuth = getAuth(secondaryApp);
    
    try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const uid = userCredential.user.uid;
        
        // Create Firestore Profile
        await createUserProfile(uid, {
            name: name,
            email: email,
            role: "doctor",
            department: department
        });
        
        // Sign out from the secondary instance and delete app
        await signOut(secondaryAuth);
        
        return { success: true };
    } catch (error) {
        console.error("Registration error:", error);
        return { success: false, message: error.message };
    }
}

// Get Current Profile Sync
export function getCurrentProfile() {
    return currentUserProfile;
}
