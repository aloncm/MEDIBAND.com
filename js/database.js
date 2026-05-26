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
    setDoc,
    updateDoc,
    arrayUnion,
    onSnapshot
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
            specialty: data.specialty || "Médico General",
            primaryDoctorId: data.primaryDoctorId || "",
            primaryDoctorName: data.primaryDoctorName || "Sin Asignar",
            secondaryDoctors: data.secondaryDoctors || [],
            isPriority: data.isPriority || false,
            heartRate: "--",
            bloodPressure: "--/--",
            temp: "--",
            createdAt: serverTimestamp(),
            lastModifiedAt: serverTimestamp(),
            lastModifiedBy: data.lastModifiedBy || "Sistema"
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
export async function getAllPatients(doctorProfile = null) {
    try {
        const q = query(collection(db, "patients"), orderBy("name", "asc"));
        const querySnapshot = await getDocs(q);
        const patients = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Filter by specialty if doctorProfile is a doctor and not admin
            if (doctorProfile && doctorProfile.role === "doctor" && doctorProfile.department) {
                if (data.specialty === doctorProfile.department) {
                    patients.push({ id: doc.id, ...data });
                }
            } else {
                patients.push({ id: doc.id, ...data });
            }
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
            doctorShift: doctorProfile.shift || "matutino",
            ...noteData,
            timestamp: serverTimestamp()
        });
        
        // Update patient's current vitals in the patient document
        const patientRef = doc(db, "patients", patientDocId);
        await setDoc(patientRef, {
            heartRate: noteData.hr || "--",
            bloodPressure: noteData.bp || "--/--",
            temp: noteData.temp || "--",
            lastModifiedAt: serverTimestamp(),
            lastModifiedBy: doctorProfile.name
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
        const patientsRef = collection(db, "patients");
        const usersRef = collection(db, "users");
        
        // Seed Doctors
        const d1 = query(usersRef, where("email", "==", "cardio.matutino@mediband.com"));
        const snapshotD1 = await getDocs(d1);
        if (snapshotD1.empty) {
            await setDoc(doc(db, "users", "doc-cardio-mat"), {
                name: "Ramírez (Cardio-Mat)",
                email: "cardio.matutino@mediband.com",
                role: "doctor",
                department: "Cardiología",
                shift: "matutino"
            });
            await setDoc(doc(db, "users", "doc-cardio-noc"), {
                name: "García (Cardio-Noc)",
                email: "cardio.nocturno@mediband.com",
                role: "doctor",
                department: "Cardiología",
                shift: "nocturno"
            });
            await setDoc(doc(db, "users", "doc-neuro-mat"), {
                name: "Martínez (Neuro-Mat)",
                email: "neuro.matutino@mediband.com",
                role: "doctor",
                department: "Neurología",
                shift: "matutino"
            });
            console.log("Mock doctors seeded.");
        }

        // Seed Patient
        const p1 = query(patientsRef, where("patientId", "==", "MB-99201-X"));
        const snapshot = await getDocs(p1);
        
        if (snapshot.empty) {
            await addDoc(patientsRef, {
                patientId: "MB-99201-X",
                name: "James R. Thompson",
                dob: "1952-05-14",
                bloodType: "O+",
                height: "182 cm",
                weight: "84.5 kg",
                allergies: "Penicillin, Latex",
                heartRate: "78",
                bloodPressure: "120/80",
                temp: "36.7",
                specialty: "Cardiología",
                primaryDoctorId: "doc-cardio-mat",
                primaryDoctorName: "Ramírez (Cardio-Mat)",
                secondaryDoctors: ["doc-cardio-noc"],
                isPriority: true,
                createdAt: serverTimestamp(),
                lastModifiedAt: serverTimestamp(),
                lastModifiedBy: "Sistema"
            });
            console.log("Dummy patient seeded.");
        }
    } catch (error) {
        console.error("Error seeding dummy data", error);
    }
}

// Add Audit Log Entry (NOM-024)
export async function addAuditLog(patientDocId, action, doctorProfile) {
    try {
        if (!patientDocId || !doctorProfile) return false;
        await addDoc(collection(db, "audit_logs"), {
            patientDocId: patientDocId,
            doctorId: doctorProfile.uid || "",
            doctorName: doctorProfile.name || "Médico",
            doctorEmail: doctorProfile.email || "",
            doctorDept: doctorProfile.department || "General",
            action: action, // "consult", "edit", "create"
            timestamp: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error adding audit log:", error);
        return false;
    }
}

// Get Audit Logs for a Patient (NOM-024)
export async function getAuditLogs(patientDocId) {
    try {
        const q = query(
            collection(db, "audit_logs"),
            where("patientDocId", "==", patientDocId)
        );
        const querySnapshot = await getDocs(q);
        const logs = [];
        querySnapshot.forEach((doc) => {
            logs.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort in memory by timestamp descending
        return logs.sort((a, b) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeB - timeA;
        });
    } catch (error) {
        console.error("Error fetching audit logs:", error);
        return [];
    }
}

// Send Emergency Alert
export async function sendEmergencyAlert(alertData) {
    try {
        await addDoc(collection(db, "emergency_alerts"), {
            ...alertData,
            timestamp: serverTimestamp(),
            confirmedBy: [] // Array of doctor UIDs who confirmed reception
        });
        return true;
    } catch (error) {
        console.error("Error sending emergency alert:", error);
        return false;
    }
}

// Listen to Emergency Alerts in real-time (Specialty or Directed to Doctor)
export function listenEmergencyAlerts(specialty, doctorId, callback) {
    const q = query(collection(db, "emergency_alerts"));
    
    // Returns the unsubscribe function
    return onSnapshot(q, (snapshot) => {
        const alerts = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Filter by doctor's specialty department OR directly targeted to this doctor
            if (data.specialty === specialty || (doctorId && data.targetDoctorId === doctorId)) {
                alerts.push({ id: doc.id, ...data });
            }
        });
        
        // Sort in memory by timestamp (descending) to avoid needing Firestore Index
        alerts.sort((a, b) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeB - timeA;
        });
        
        callback(alerts);
    }, (error) => {
        console.error("Error listening to alerts:", error);
    });
}

// Confirm Emergency Alert Reception
export async function confirmAlertReception(alertId, doctorUid) {
    try {
        const alertRef = doc(db, "emergency_alerts", alertId);
        await updateDoc(alertRef, {
            confirmedBy: arrayUnion(doctorUid)
        });
        return true;
    } catch (error) {
        console.error("Error confirming alert:", error);
        return false;
    }
}

// Send Chat Message
export async function sendChatMessage(patientId, senderId, senderName, senderRole, text, primaryDoctorId = "") {
    try {
        await addDoc(collection(db, "messages"), {
            patientId,
            senderId,
            senderName,
            senderRole,
            text,
            primaryDoctorId,
            timestamp: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error sending message:", error);
        return false;
    }
}

// Listen to Chat Messages in real-time
export function listenChatMessages(patientId, callback) {
    const q = query(
        collection(db, "messages"),
        where("patientId", "==", patientId)
    );
    
    return onSnapshot(q, (snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort in memory by timestamp (ascending) to avoid needing Firestore Index
        messages.sort((a, b) => {
            const timeA = a.timestamp?.seconds || 0;
            const timeB = b.timestamp?.seconds || 0;
            return timeA - timeB;
        });
        
        callback(messages);
    }, (error) => {
        console.error("Error listening to messages:", error);
    });
}

// Listen to Doctor's assigned patients messages in real-time
export function listenDoctorMessages(doctorId, callback) {
    const q = query(
        collection(db, "messages"),
        where("primaryDoctorId", "==", doctorId)
    );
    
    return onSnapshot(q, (snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        callback(messages);
    }, (error) => {
        console.error("Error listening to doctor messages:", error);
    });
}

