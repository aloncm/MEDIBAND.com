import { db } from './firebase-config.js';
import { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    addDoc, 
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Fetch User Profile (Doctor/Admin)
export async function getUserProfile(uid) {
    try {
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            return userDoc.data();
        } else {
            console.error("No user profile found!");
            return null;
        }
    } catch (error) {
        console.error("Error getting user profile:", error);
        return null;
    }
}

// Create User Profile in Firestore
export async function createUserProfile(uid, data) {
    try {
        await setDoc(doc(db, "users", uid), data);
        return true;
    } catch (error) {
        console.error("Error creating user profile:", error);
        throw error;
    }
}

// Create New Patient Record
export async function createPatient(data) {
    try {
        await addDoc(collection(db, "patients"), {
            ...data,
            heartRate: "--",
            bloodPressure: "--/--",
            temp: "--",
            createdAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error creating patient:", error);
        return false;
    }
}

// Fetch Patient Data by NFC ID
export async function getPatientData(patientId) {
    try {
        const q = query(collection(db, "patients"), where("patientId", "==", patientId));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const doc = querySnapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error fetching patient:", error);
        return null;
    }
}

// Fetch All Patients (For Directory)
export async function getAllPatients() {
    try {
        const q = query(collection(db, "patients"), orderBy("name", "asc"));
        const querySnapshot = await getDocs(q);
        const patients = [];
        querySnapshot.forEach((doc) => {
            patients.push({ id: doc.id, ...doc.data() });
        });
        return patients;
    } catch (error) {
        console.error("Error fetching patients list:", error);
        return [];
    }
}

// Fetch Clinical Notes for a Patient
export async function getPatientNotes(patientDocId) {
    try {
        const q = query(
            collection(db, "records"), 
            where("patientDocId", "==", patientDocId)
        );
        const querySnapshot = await getDocs(q);
        const notes = [];
        querySnapshot.forEach((doc) => {
            notes.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort in memory by timestamp (descending) to avoid needing a Firestore Index
        return notes.sort((a, b) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeB - timeA;
        });
    } catch (error) {
        console.error("Error fetching notes:", error);
        return [];
    }
}

// Add a New Clinical Note (Structured)
export async function addClinicalNote(patientDocId, doctorProfile, noteData) {
    try {
        await addDoc(collection(db, "records"), {
            patientDocId: patientDocId,
            doctorId: doctorProfile.uid || "",
            doctorName: doctorProfile.name,
            specialty: doctorProfile.department,
            ...noteData,
            timestamp: serverTimestamp()
        });
        
        // Update patient's current vitals in the patient document
        const patientRef = doc(db, "patients", patientDocId);
        await setDoc(patientRef, {
            heartRate: noteData.hr || "--",
            bloodPressure: noteData.bp || "--/--",
            temp: noteData.temp || "--"
        }, { merge: true });

        return true;
    } catch (error) {
        console.error("Error adding note:", error);
        return false;
    }
}

// Update a Clinical Note
export async function updateClinicalNote(noteId, data) {
    try {
        const noteRef = doc(db, "records", noteId);
        await setDoc(noteRef, data, { merge: true });
        return true;
    } catch (error) {
        console.error("Error updating note:", error);
        return false;
    }
}

// Delete a Clinical Note
export async function deleteClinicalNote(noteId) {
    try {
        const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
        await deleteDoc(doc(db, "records", noteId));
        return true;
    } catch (error) {
        console.error("Error deleting note:", error);
        return false;
    }
}

// Update Patient Profile
export async function updatePatient(docId, data) {
    try {
        const patientRef = doc(db, "patients", docId);
        await setDoc(patientRef, data, { merge: true });
        return true;
    } catch (error) {
        console.error("Error updating patient:", error);
        return false;
    }
}

// Delete Patient (and potentially their notes)
export async function deletePatient(docId) {
    try {
        const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
        await deleteDoc(doc(db, "patients", docId));
        return true;
    } catch (error) {
        console.error("Error deleting patient:", error);
        return false;
    }
}

// Get All Doctors (For Admin Panel)
export async function getAllDoctors() {
    try {
        const q = query(collection(db, "users"), where("role", "==", "doctor"));
        const querySnapshot = await getDocs(q);
        const doctors = [];
        querySnapshot.forEach((doc) => {
            doctors.push({ id: doc.id, ...doc.data() });
        });
        return doctors;
    } catch (error) {
        console.error("Error fetching doctors:", error);
        return [];
    }
}

// Seed Initial Data (Helper function to setup the DB)
export async function seedDummyData() {
    try {
        // Only run this manually if DB is empty
        const patientsRef = collection(db, "patients");
        const p1 = query(patientsRef, where("patientId", "==", "MB-99201-X"));
        const snapshot = await getDocs(p1);
        
        if (snapshot.empty) {
            await addDoc(patientsRef, {
                patientId: "MB-99201-X",
                name: "James R. Thompson",
                dob: "1952-05-14",
                bloodType: "O Positive (O+)",
                height: "182 cm",
                weight: "84.5 kg",
                allergies: "Penicillin, Latex, Peanuts",
                heartRate: "78",
                bloodPressure: "120/80",
                temp: "36.7"
            });
            console.log("Dummy patient seeded.");
        }
    } catch (error) {
        console.error("Error seeding dummy data", error);
    }
}
