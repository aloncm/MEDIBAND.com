import { auth, firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    createUserWithEmailAndPassword, 
    getAuth 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getUserProfile, createUserProfile, getPatientData } from './database.js';

let currentUserProfile = null;
let currentPatientProfile = null;
let customAuthCallback = null;

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

// Handle Patient Login (NFC ID + Birthdate)
export async function loginPatient(patientId, dob) {
    try {
        const patient = await getPatientData(patientId);
        if (patient && patient.dob === dob) {
            currentPatientProfile = {
                uid: patient.id,
                name: patient.name,
                patientId: patient.patientId,
                role: "patient",
                dob: patient.dob,
                bloodType: patient.bloodType,
                allergies: patient.allergies || "",
                signatureUrl: patient.signatureUrl || "",
                isPriority: patient.isPriority || false,
                specialty: patient.specialty || "Médico General",
                primaryDoctorId: patient.primaryDoctorId || "",
                primaryDoctorName: patient.primaryDoctorName || "Sin Asignar"
            };
            if (customAuthCallback) {
                customAuthCallback({ email: patient.patientId }, currentPatientProfile);
            }
            return { success: true, patient: currentPatientProfile };
        }
        return { success: false, message: "ID NFC o Fecha de Nacimiento incorrectos." };
    } catch (error) {
        console.error("Patient login error:", error);
        return { success: false, message: "Error al iniciar sesión." };
    }
}

// Handle Logout
export async function logoutUser() {
    try {
        await signOut(auth);
        currentUserProfile = null;
        currentPatientProfile = null;
        return true;
    } catch (error) {
        console.error("Error signing out:", error);
        return false;
    }
}

// Monitor Auth State
export function monitorAuthState(onLogin, onLogout) {
    customAuthCallback = onLogin;
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Fetch additional profile data from Firestore
            const profile = await getUserProfile(user.uid);
            if (profile) {
                profile.uid = user.uid;
            }
            currentUserProfile = profile;
            onLogin(user, profile);
        } else {
            currentUserProfile = null;
            if (!currentPatientProfile) {
                onLogout();
            }
        }
    });
}

// Register New Doctor (As Admin)
export async function registerNewDoctor(name, email, password, department, shift) {
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
            department: department,
            shift: shift || "matutino"
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
    return currentUserProfile || currentPatientProfile;
}
