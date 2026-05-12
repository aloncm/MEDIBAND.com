import { loginUser, logoutUser, monitorAuthState, getCurrentProfile, registerNewDoctor } from './auth.js';
import { getPatientData, getPatientNotes, addClinicalNote, getAllDoctors, seedDummyData, createPatient, getAllPatients, updateClinicalNote, deleteClinicalNote, updatePatient, deletePatient } from './database.js';

// DOM Elements
const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const btnLogout = document.getElementById('btn-logout');
const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const nfcStatusBadge = document.getElementById('nfc-status-badge');
const patientsTableBody = document.getElementById('patients-table-body');
const directorySearch = document.getElementById('directory-search');

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const contentSections = document.querySelectorAll('.content-section');

// Patient View Elements
const noPatientView = document.getElementById('no-patient-view');
const patientDataView = document.getElementById('patient-data-view');
const notesContainer = document.getElementById('notes-container');

// Modal Elements
const noteModal = document.getElementById('note-modal');
const doctorModal = document.getElementById('doctor-modal');
const registerModal = document.getElementById('register-modal');
const btnAddNote = document.getElementById('btn-add-note');
const btnNewDoctor = document.getElementById('btn-new-doctor');
const btnOpenRegister = document.getElementById('btn-open-register');
const closeModals = document.querySelectorAll('.close-modal');
const noteForm = document.getElementById('note-form');
const doctorForm = document.getElementById('doctor-form');
const registerForm = document.getElementById('register-form');

// State
let currentPatientDocId = null;
let editingNoteId = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // Set current date
    const dateOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('es-ES', dateOptions);

    // Setup Event Listeners
    setupEventListeners();

    // Check NFC URL Parameter
    const urlParams = new URLSearchParams(window.location.search);
    const nfcPatientId = urlParams.get('patient');
    
    // Monitor Authentication
    monitorAuthState((user, profile) => {
        // ON LOGIN
        loginView.classList.remove('active');
        appView.classList.add('active');
        
        if (profile) {
            userNameEl.textContent = profile.name || user.email;
            userRoleEl.textContent = profile.department || 'Personal';
            
            // Show Admin section if role is admin
            if (profile.role === 'admin') {
                const adminNavItem = document.querySelector('.admin-only');
                if (adminNavItem) adminNavItem.style.display = 'flex';
                loadAdminData();
            }
            
            // Load Dashboard Stats
            loadDashboardStats();
            // Load Patient Directory
            loadPatientDirectory();
        } else {
            userNameEl.textContent = user.email;
        }

        // If NFC tag was scanned, load patient data automatically
        if (nfcPatientId) {
            nfcStatusBadge.style.display = 'inline-block';
            navigateTo('records-section');
            loadPatientDetails(nfcPatientId);
        }
        
    }, () => {
        // ON LOGOUT
        appView.classList.remove('active');
        loginView.classList.add('active');
    });
});

function setupEventListeners() {
    // Login Form
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const btn = document.getElementById('btn-login');
        const errorEl = document.getElementById('login-error');
        
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Autenticando...';
        btn.disabled = true;
        
        const result = await loginUser(email, pass);
        
        if (!result.success) {
            errorEl.textContent = result.message;
            btn.innerHTML = 'Entrar al Sistema <i class="fa-solid fa-arrow-right"></i>';
            btn.disabled = false;
        }
    });

    // Logout Button
    btnLogout.addEventListener('click', () => {
        logoutUser();
    });

    const mobileToggle = document.getElementById('mobile-nav-toggle');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (mobileToggle) {
        mobileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('mobile-active');
        });
    }

    // Close sidebar when clicking main content on mobile
    mainContent.addEventListener('click', () => {
        if (sidebar.classList.contains('mobile-active')) {
            sidebar.classList.remove('mobile-active');
        }
    });

    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-target');
            navigateTo(targetId);
            
            // Specific loads
            if (targetId === 'patients-section') loadPatientDirectory();
            if (targetId === 'dashboard-section') loadDashboardStats();
            
            // Close mobile sidebar on click
            if (sidebar.classList.contains('mobile-active')) {
                sidebar.classList.remove('mobile-active');
            }
        });
    });

    // Modal Triggers
    btnAddNote.addEventListener('click', () => {
        renderSpecialtyFields();
        noteModal.classList.add('active');
    });

    btnNewDoctor.addEventListener('click', () => {
        doctorModal.classList.add('active');
    });

    btnOpenRegister.addEventListener('click', () => {
        document.getElementById('register-modal-title').textContent = "Registrar Nuevo Paciente";
        document.getElementById('reg-doc-id').value = "";
        registerForm.reset();
        registerModal.classList.add('active');
    });

    const btnSimulateVitals = document.getElementById('btn-simulate-vitals');
    if (btnSimulateVitals) {
        btnSimulateVitals.addEventListener('click', () => {
            document.getElementById('note-hr').value = Math.floor(Math.random() * (100 - 60 + 1) + 60); // 60-100 bpm
            document.getElementById('note-bp').value = `${Math.floor(Math.random() * (135 - 110 + 1) + 110)}/${Math.floor(Math.random() * (85 - 70 + 1) + 70)}`; // 110-135/70-85 mmHg
            document.getElementById('note-temp').value = (Math.random() * (37.2 - 36.3) + 36.3).toFixed(1); // 36.3-37.2 °C
            document.getElementById('note-spo2').value = Math.floor(Math.random() * (100 - 95 + 1) + 95); // 95-100 %
            showToast("Signos vitales capturados de los sensores", "info");
        });
    }

    const privacyModal = document.getElementById('privacy-modal');
    const sidebarPrivacyLink = document.getElementById('sidebar-privacy-link');
    const formPrivacyLink = document.getElementById('form-privacy-link');
    const loginPrivacyLink = document.getElementById('login-privacy-link');
    
    if (sidebarPrivacyLink) {
        sidebarPrivacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (privacyModal) privacyModal.classList.add('active');
        });
    }
    
    if (formPrivacyLink) {
        formPrivacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (privacyModal) privacyModal.classList.add('active');
        });
    }
    
    if (loginPrivacyLink) {
        loginPrivacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (privacyModal) privacyModal.classList.add('active');
        });
    }

    closeModals.forEach(btn => {
        btn.addEventListener('click', () => {
            noteModal.classList.remove('active');
            doctorModal.classList.remove('active');
            registerModal.classList.remove('active');
            if (privacyModal) privacyModal.classList.remove('active');
            editingNoteId = null; // Clear edit mode
            noteForm.reset();
        });
    });


    // Handle Note Submission (Advanced)
    noteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const profile = getCurrentProfile();
        if (!currentPatientDocId || !profile) return;

        const noteData = {
            subjective: document.getElementById('note-subjective').value,
            diagnosis: document.getElementById('note-diagnosis').value,
            plan: document.getElementById('note-plan').value,
            hr: document.getElementById('note-hr').value,
            bp: document.getElementById('note-bp').value,
            temp: document.getElementById('note-temp').value,
            spo2: document.getElementById('note-spo2').value,
            specialtyData: {}
        };

        // Collect specialty fields
        const specialtyInputs = document.querySelectorAll('.spec-input');
        specialtyInputs.forEach(input => {
            noteData.specialtyData[input.getAttribute('data-field')] = input.value;
        });
        
        const btn = noteForm.querySelector('button');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
        btn.disabled = true;

        let success = false;
        if (editingNoteId) {
            success = await updateClinicalNote(editingNoteId, noteData);
        } else {
            success = await addClinicalNote(currentPatientDocId, profile, noteData);
        }
        
        if (success) {
            noteForm.reset();
            noteModal.classList.remove('active');
            showToast(editingNoteId ? "Evaluación actualizada" : "Evaluación guardada", "success");
            editingNoteId = null;
            
            // Explicitly reload to show the new note and updated vitals
            if (currentPatientDocId) {
                await loadPatientDetails(null, currentPatientDocId);
            }
        } else {
            showToast("Error al procesar la evaluación", "error");
        }
        
        btn.innerHTML = 'Guardar Evaluación Permanente';
        btn.disabled = false;
    });

    // Handle Doctor Creation
    doctorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('doc-name').value;
        const email = document.getElementById('doc-email').value;
        const pass = document.getElementById('doc-password').value;
        const dept = document.getElementById('doc-dept').value;
        const errorEl = document.getElementById('doc-error');
        
        const btn = doctorForm.querySelector('button');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando...';
        btn.disabled = true;
        errorEl.textContent = '';

        const result = await registerNewDoctor(name, email, pass, dept);
        
        if (result.success) {
            doctorForm.reset();
            doctorModal.classList.remove('active');
            // Refresh table
            await loadAdminData();
            alert(`Cuenta creada para ${name}`);
        } else {
            errorEl.textContent = result.message;
        }
        
        btn.innerHTML = 'Crear Cuenta';
        btn.disabled = false;
    });

    // Handle Patient Registration / Edit
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const docId = document.getElementById('reg-doc-id').value;
        const data = {
            name: document.getElementById('reg-name').value,
            patientId: document.getElementById('reg-id').value,
            dob: document.getElementById('reg-dob').value,
            bloodType: document.getElementById('reg-blood').value,
            allergies: document.getElementById('reg-allergies').value
        };
        
        const btn = registerForm.querySelector('button');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
        btn.disabled = true;

        let success = false;
        if (docId) {
            success = await updatePatient(docId, data);
        } else {
            success = await createPatient(data);
        }
        
        if (success) {
            registerForm.reset();
            registerModal.classList.remove('active');
            showToast(docId ? "Datos del paciente actualizados" : `Paciente ${data.name} registrado`);
            loadPatientDirectory();
            loadDashboardStats();
        } else {
            showToast("Error al procesar el registro del paciente", "error");
        }
        
        btn.innerHTML = 'Registrar en MediBand';
        btn.disabled = false;
    });
    
    // Directory Search
    directorySearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const rows = patientsTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    });
}

function navigateTo(targetId) {
    // Update nav classes
    navItems.forEach(nav => nav.classList.remove('active'));
    document.querySelector(`[data-target="${targetId}"]`)?.classList.add('active');

    // Update sections
    contentSections.forEach(section => section.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');
}

async function loadPatientDetails(patientIdStr, docId = null) {
    noPatientView.style.display = 'none';
    patientDataView.style.display = 'none';
    
    let patientData = null;
    if (docId) {
        // Find by doc reference if we have it
        patientData = await getPatientDataByDocId(docId); 
    } else {
        patientData = await getPatientData(patientIdStr);
    }
    
    if (patientData) {
        currentPatientDocId = patientData.id;
        
        // Populate UI
        document.getElementById('pat-name').textContent = patientData.name;
        document.getElementById('pat-id').textContent = `#${patientData.patientId}`;
        document.getElementById('pat-dob').textContent = patientData.dob;
        document.getElementById('pat-blood').textContent = patientData.bloodType;
        document.getElementById('pat-allergies').textContent = patientData.allergies || 'Ninguna';
        document.getElementById('pat-hr').innerHTML = `${patientData.heartRate || '--'} <span>lpm</span>`;
        document.getElementById('pat-bp').innerHTML = `${patientData.bloodPressure || '--/--'} <span>mmHg</span>`;
        document.getElementById('pat-temp').innerHTML = `${patientData.temp || '--'} <span>°C</span>`;
        
        patientDataView.style.display = 'block';
        await renderPatientNotes(currentPatientDocId);
    } else {
        noPatientView.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation text-danger"></i>
            <h3>Paciente No Encontrado</h3>
            <p>No se encontraron registros para el ID: ${patientIdStr}</p>
        `;
        noPatientView.style.display = 'flex';
    }
}

// Added missing helper to database.js context (conceptually)
async function getPatientDataByDocId(docId) {
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
    const { db } = await import("./firebase-config.js");
    const docSnap = await getDoc(doc(db, "patients", docId));
    if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() };
    return null;
}

async function renderPatientNotes(patientDocId) {
    notesContainer.innerHTML = '<div class="loading-spinner">Cargando historial...</div>';
    
    const profile = getCurrentProfile();
    const isAdmin = profile && profile.role === 'admin';
    
    const notes = await getPatientNotes(patientDocId);
    
    if (notes.length === 0) {
        notesContainer.innerHTML = '<p class="text-muted text-center" style="padding: 20px;">No hay evaluaciones clínicas registradas.</p>';
        return;
    }
    
    notesContainer.innerHTML = '';
    notes.forEach(note => {
        let dateStr = "Justo ahora";
        if (note.timestamp) {
            const date = note.timestamp.toDate();
            dateStr = date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' }) + ' - ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute:'2-digit' });
        }
        
        const noteEl = document.createElement('div');
        noteEl.className = 'note-item';
        
        // Create specialty details string
        let specDetails = "";
        if (note.specialtyData) {
            for (const [key, val] of Object.entries(note.specialtyData)) {
                if (val) specDetails += `<span class="badge" style="background:#f1f5f9; color:var(--text-muted); font-size:0.65rem; margin-right:5px;">${key}: ${val}</span>`;
            }
        }

        noteEl.innerHTML = `
            <div class="note-meta">
                <span>${dateStr}</span>
                <div>
                    <span class="badge badge-primary">${note.specialty || 'Gral'}</span>
                    <button class="btn-icon-sm" onclick="window.editNote('${note.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    ${isAdmin ? `<button class="btn-icon-sm text-danger" onclick="window.deleteNote('${note.id}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </div>
            <div class="note-content">
                <strong style="color:var(--primary)">DR. ${note.doctorName?.toUpperCase() || 'DESCONOCIDO'}</strong>
                <div style="display: flex; gap: 15px; margin: 8px 0; padding: 10px; background: white; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.75rem;">
                    <div><i class="fa-solid fa-heart-pulse text-danger"></i> <strong>HR:</strong> ${note.hr || '--'}</div>
                    <div><i class="fa-solid fa-stethoscope text-primary"></i> <strong>BP:</strong> ${note.bp || '--'}</div>
                    <div><i class="fa-solid fa-temperature-half"></i> <strong>Temp:</strong> ${note.temp || '--'}</div>
                    <div><i class="fa-solid fa-droplet" style="color:#0ea5e9"></i> <strong>SpO2:</strong> ${note.spo2 || '--'}%</div>
                </div>
                <p style="margin:5px 0"><strong>Subjetivo:</strong> ${note.subjective || '--'}</p>
                <p style="margin:5px 0"><strong>Diagnóstico:</strong> ${note.diagnosis || '--'}</p>
                <p style="margin:5px 0"><strong>Plan:</strong> ${note.plan || '--'}</p>
                <div style="margin-top:10px;">${specDetails}</div>
            </div>
        `;
        notesContainer.appendChild(noteEl);
    });
}

// Exposed Functions for Note Actions
window.editNote = async (noteId) => {
    const notes = await getPatientNotes(currentPatientDocId);
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    editingNoteId = noteId;
    renderSpecialtyFields();
    
    // Fill basic fields
    document.getElementById('note-subjective').value = note.subjective || "";
    document.getElementById('note-diagnosis').value = note.diagnosis || "";
    document.getElementById('note-plan').value = note.plan || "";
    document.getElementById('note-hr').value = note.hr || "";
    document.getElementById('note-bp').value = note.bp || "";
    document.getElementById('note-temp').value = note.temp || "";
    document.getElementById('note-spo2').value = note.spo2 || "";

    // Fill specialty fields
    setTimeout(() => {
        const specInputs = document.querySelectorAll('.spec-input');
        specInputs.forEach(input => {
            const field = input.getAttribute('data-field');
            if (note.specialtyData && note.specialtyData[field]) {
                input.value = note.specialtyData[field];
            }
        });
    }, 100);

    noteModal.classList.add('active');
};

window.deleteNote = async (noteId) => {
    if (confirm("¿Está seguro de eliminar esta evaluación permanentemente?")) {
        const success = await deleteClinicalNote(noteId);
        if (success) {
            showToast("Evaluación eliminada", "info");
            await loadPatientDetails(null, currentPatientDocId);
        } else {
            showToast("Error al eliminar", "error");
        }
    }
};

async function loadAdminData() {
    const tbody = document.getElementById('doctors-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">Cargando personal...</td></tr>';
    const doctors = await getAllDoctors();
    tbody.innerHTML = '';
    doctors.forEach(doc => {
        const initials = doc.name ? doc.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : 'DR';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="staff-name-cell">
                    <div class="staff-initials">${initials}</div>
                    <div>
                        <strong>Dr. ${doc.name}</strong><br>
                        <span style="font-size:0.75rem; color:var(--text-muted)">${doc.email}</span>
                    </div>
                </div>
            </td>
            <td>${doc.department || 'General'}</td>
            <td><span class="badge badge-success">ACTIVO</span></td>
        `;
        tbody.appendChild(tr);
    });
}

async function loadPatientDirectory() {
    if (!patientsTableBody) return;
    patientsTableBody.innerHTML = '<tr><td colspan="4">Cargando pacientes...</td></tr>';
    
    const profile = getCurrentProfile();
    const isAdmin = profile && profile.role === 'admin';
    
    const patients = await getAllPatients();
    patientsTableBody.innerHTML = '';
    
    if (patients.length === 0) {
        patientsTableBody.innerHTML = '<tr><td colspan="4" class="text-center">No hay pacientes registrados.</td></tr>';
        return;
    }

    patients.forEach(pat => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${pat.name}</strong></td>
            <td><code>${pat.patientId}</code></td>
            <td><span class="badge badge-danger">${pat.bloodType}</span></td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button class="btn-primary" style="padding: 5px 10px; font-size: 0.75rem;" onclick="window.viewPatient('${pat.patientId}')">
                        Expediente
                    </button>
                    <button class="btn-icon-sm" onclick="window.editPatient('${pat.id}')"><i class="fa-solid fa-pen"></i></button>
                    ${isAdmin ? `<button class="btn-icon-sm text-danger" onclick="window.deletePatient('${pat.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </td>
        `;
        patientsTableBody.appendChild(tr);
    });
}

// Expose Patient Directory Actions
window.editPatient = async (docId) => {
    const patients = await getAllPatients();
    const pat = patients.find(p => p.id === docId);
    if (!pat) return;

    document.getElementById('register-modal-title').textContent = "Editar Datos del Paciente";
    document.getElementById('reg-doc-id').value = docId;
    document.getElementById('reg-name').value = pat.name;
    document.getElementById('reg-id').value = pat.patientId;
    document.getElementById('reg-dob').value = pat.dob;
    document.getElementById('reg-blood').value = pat.bloodType;
    document.getElementById('reg-allergies').value = pat.allergies || "";

    registerModal.classList.add('active');
};

window.deletePatient = async (docId) => {
    if (confirm("¿Eliminar este paciente y todos sus registros permanentemente?")) {
        const success = await deletePatient(docId);
        if (success) {
            showToast("Paciente eliminado", "info");
            loadPatientDirectory();
            loadDashboardStats();
        } else {
            showToast("Error al eliminar", "error");
        }
    }
};

// Expose to global for onclick
window.viewPatient = (id) => {
    navigateTo('records-section');
    loadPatientDetails(id);
};

async function loadDashboardStats() {
    const patients = await getAllPatients();
    document.getElementById('stat-patients').textContent = patients.length;
    document.getElementById('stat-evals').textContent = Math.floor(Math.random() * 20) + 5; 
    loadRecentActivity(patients);
}

async function loadRecentActivity(patients) {
    const container = document.getElementById('recent-activity-list');
    if (!container) return;
    
    // Simulate/Fetch some recent activity
    container.innerHTML = '';
    const recent = patients.slice(0, 4);
    
    if (recent.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">No hay actividad reciente.</p>';
        return;
    }

    recent.forEach(p => {
        const item = document.createElement('div');
        item.style.cssText = "display:flex; align-items:center; gap:10px; padding:8px; background:var(--bg-color); border-radius:8px; border-left:3px solid var(--primary);";
        item.innerHTML = `
            <div style="font-size:1rem; color:var(--primary)"><i class="fa-solid fa-user-check"></i></div>
            <div style="flex:1">
                <p style="font-size:0.8rem; font-weight:600; margin:0;">${p.name}</p>
                <p style="font-size:0.7rem; color:var(--text-muted); margin:0;">Ingreso/Actualización registrada</p>
            </div>
            <div style="font-size:0.65rem; color:var(--text-muted)">Hoy</div>
        `;
        container.appendChild(item);
    });
}

function renderSpecialtyFields() {
    const profile = getCurrentProfile();
    const container = document.getElementById('specialty-fields');
    const inputsDiv = document.getElementById('specialty-inputs');
    const label = document.getElementById('specialty-label');
    
    if (!profile || !profile.department) {
        container.style.display = 'none';
        return;
    }

    inputsDiv.innerHTML = '';
    let fields = [];
    
    if (profile.department === 'Cardiología') {
        fields = [
            { id: 'heart-rhythm', label: 'Ritmo Cardíaco', placeholder: 'Regular/Irregular' },
            { id: 'murmurs', label: 'Soplos', placeholder: 'Presentes/Ausentes' },
            { id: 'edema', label: 'Edema', placeholder: 'Grado...' }
        ];
    } else if (profile.department === 'Pediatría') {
        fields = [
            { id: 'head-circ', label: 'Perímetro Cefálico', placeholder: 'cm' },
            { id: 'weight-p', label: 'Percentil Peso', placeholder: '...' },
            { id: 'psychomotor', label: 'Desarrollo Psicomotor', placeholder: 'Normal/Retraso' }
        ];
    } else if (profile.department === 'Urgencias') {
        fields = [
            { id: 'glasgow', label: 'Escala Glasgow', placeholder: '/15' },
            { id: 'triage', label: 'Nivel Triage', placeholder: '1-5' }
        ];
    }

    if (fields.length > 0) {
        label.textContent = `CAMPOS DE ${profile.department.toUpperCase()}`;
        fields.forEach(f => {
            const div = document.createElement('div');
            div.className = 'input-group';
            div.innerHTML = `
                <label style="font-size:0.6rem;">${f.label}</label>
                <input type="text" class="spec-input" data-field="${f.label}" placeholder="${f.placeholder}" style="padding:8px; border-radius:4px; border:1px solid var(--border-color); width:100%;">
            `;
            inputsDiv.appendChild(div);
        });
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        background: var(--bg-card);
        color: var(--text-main);
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        border-left: 4px solid ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s ease-out;
        backdrop-filter: blur(10px);
        font-size: 0.85rem;
    `;
    
    const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info';
    toast.innerHTML = `
        <i class="fa-solid ${icon}" style="color: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

