import { loginUser, logoutUser, monitorAuthState, getCurrentProfile, registerNewDoctor } from './auth.js';
import { 
    getPatientData, 
    getPatientNotes, 
    addClinicalNote, 
    getAllDoctors, 
    seedDummyData, 
    createPatient, 
    getAllPatients, 
    updateClinicalNote, 
    deleteClinicalNote, 
    updatePatient, 
    deletePatient, 
    addAuditLog, 
    getAuditLogs,
    sendEmergencyAlert,
    listenEmergencyAlerts,
    confirmAlertReception,
    sendChatMessage,
    listenChatMessages,
    listenDoctorMessages
} from './database.js';

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
let currentLoginType = 'doctor'; // 'doctor' or 'patient'

// Real-time listener unsubscribers
let alertsUnsubscribe = null;
let currentChatUnsubscribe = null;
let patientProfileUnsubscribe = null;
let doctorMessagesUnsubscribe = null;
let lastKnownDoctorMessageCount = -1;

// Audio context & generators
let audioCtx = null;
let alarmInterval = null;
let simulatedCallInterval = null;
let lastPatientPortalMessageId = null;
let lastDoctorChatMessageId = null;

function ensureAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playAudioTone(frequency = 880, duration = 0.14, type = 'sine') {
    try {
        ensureAudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = frequency;
        osc.type = type;
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.24, audioCtx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + duration + 0.02);
    } catch (err) {
        console.error('Audio tone error:', err);
    }
}

function playMessageSentSound() {
    playAudioTone(1080, 0.12, 'triangle');
}

function playMessageReceivedSound() {
    playAudioTone(740, 0.14, 'triangle');
}

// Play alternating premium clinical beeps (Web Audio API)
function playClinicalAlarm() {
    if (alarmInterval) return;
    ensureAudioContext();
    let alternating = true;
    alarmInterval = setInterval(() => {
        try {
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            osc.frequency.value = alternating ? 880 : 1000;
            alternating = !alternating;
            osc.type = 'sine';
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.35, audioCtx.currentTime + 0.04);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        } catch (err) {
            console.error("Clinical Audio error:", err);
        }
    }, 450);
}

function stopClinicalAlarm() {
    if (alarmInterval) {
        clearInterval(alarmInterval);
        alarmInterval = null;
    }
}

// Play simulated ringing tone for emergency calls (dual-frequency US signal)
function playRingingTone() {
    if (simulatedCallInterval) return;
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    simulatedCallInterval = setInterval(() => {
        try {
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc1.connect(gainNode);
            osc2.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            osc1.frequency.value = 440;
            osc2.frequency.value = 480;
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.8);
            osc1.start();
            osc2.start();
            osc1.stop(audioCtx.currentTime + 1.9);
            osc2.stop(audioCtx.currentTime + 1.9);
        } catch (err) {
            console.error("Ringing Audio error:", err);
        }
    }, 2000);
}

function stopRingingTone() {
    if (simulatedCallInterval) {
        clearInterval(simulatedCallInterval);
        simulatedCallInterval = null;
    }
}

// Cleans up all listeners to avoid performance degradation
function cleanupActiveListeners() {
    if (alertsUnsubscribe) {
        alertsUnsubscribe();
        alertsUnsubscribe = null;
    }
    if (currentChatUnsubscribe) {
        currentChatUnsubscribe();
        currentChatUnsubscribe = null;
    }
    if (patientProfileUnsubscribe) {
        patientProfileUnsubscribe();
        patientProfileUnsubscribe = null;
    }
    if (doctorMessagesUnsubscribe) {
        doctorMessagesUnsubscribe();
        doctorMessagesUnsubscribe = null;
    }
    lastKnownDoctorMessageCount = -1;
    stopClinicalAlarm();
    stopRingingTone();
}

// Start emergency alert listener for Doctors
function startDoctorAlertsListener(specialty, doctorId) {
    if (alertsUnsubscribe) return;
    alertsUnsubscribe = listenEmergencyAlerts(specialty, doctorId, (alerts) => {
        const profile = getCurrentProfile();
        if (!profile || profile.role !== 'doctor') return;
        
        // Find an active alert in the last 15 minutes that this doctor has not confirmed yet
        const fifteenMinutesAgo = Date.now() - 900000;
        const activeAlert = alerts.find(a => {
            const timestampMs = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : Date.now();
            return timestampMs > fifteenMinutesAgo && !a.confirmedBy.includes(profile.uid);
        });
        
        if (activeAlert) {
            const modal = document.getElementById('emergency-alert-modal');
            modal.style.display = 'flex';
            
            document.getElementById('emergency-alert-specialty').textContent = activeAlert.specialty || specialty;
            document.getElementById('emergency-alert-patient').textContent = activeAlert.patientName || 'Desconocido';
            document.getElementById('emergency-alert-procedure').textContent = activeAlert.procedure || 'Emergencia';
            document.getElementById('emergency-alert-treatment').textContent = activeAlert.medications || 'Revisar expediente';
            document.getElementById('emergency-alert-doctor').textContent = activeAlert.authorizedBy || 'Guardia';
            
            playClinicalAlarm();
            if (navigator.vibrate) {
                navigator.vibrate([400, 200, 400, 200, 400]);
            }
            
            const confirmBtn = document.getElementById('btn-confirm-emergency');
            confirmBtn.onclick = async () => {
                confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Confirmando...';
                confirmBtn.disabled = true;
                await confirmAlertReception(activeAlert.id, profile.uid);
                confirmBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> CONFIRMAR RECEPCIÓN DE ALERTA';
                confirmBtn.disabled = false;
                stopClinicalAlarm();
                modal.style.display = 'none';
            };
        } else {
            stopClinicalAlarm();
            document.getElementById('emergency-alert-modal').style.display = 'none';
        }
    });
}

// Start real-time messages listener for Doctor's assigned patients
function startDoctorMessagesListener(doctorId) {
    if (doctorMessagesUnsubscribe || !doctorId) return;
    
    lastKnownDoctorMessageCount = -1;
    doctorMessagesUnsubscribe = listenDoctorMessages(doctorId, (messages) => {
        // If first load, establish base count and return
        if (lastKnownDoctorMessageCount === -1) {
            lastKnownDoctorMessageCount = messages.length;
            return;
        }
        
        // If a new message arrived
        if (messages.length > lastKnownDoctorMessageCount) {
            // Sort in memory to get the latest message
            messages.sort((a, b) => {
                const timeA = a.timestamp?.seconds || 0;
                const timeB = b.timestamp?.seconds || 0;
                return timeB - timeA;
            });
            const latestMsg = messages[0];
            
            // Only alert if the logged-in doctor is NOT the sender of this message
            if (latestMsg && latestMsg.senderId !== doctorId) {
                playMessageReceivedSound();
                showToast(`Mensaje Clínico de ${latestMsg.senderName}: "${latestMsg.text.substring(0, 30)}..."`, "info");
            }
        }
        lastKnownDoctorMessageCount = messages.length;
    });
}

// Populate Primary Doctors Select based on specialty
async function populatePrimaryDoctorsSelect(specialtyValue, selectEl, selectedDocId = "") {
    selectEl.innerHTML = '<option value="">Cargando médicos...</option>';
    const doctors = await getAllDoctors();
    const deptDocs = doctors.filter(doc => doc.department === specialtyValue);
    
    selectEl.innerHTML = '';
    if (deptDocs.length === 0) {
        selectEl.innerHTML = '<option value="">Sin médicos en esta especialidad</option>';
        return;
    }
    
    deptDocs.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = `Dr. ${doc.name} (${doc.shift || 'matutino'})`;
        if (doc.id === selectedDocId) {
            option.selected = true;
        }
        selectEl.appendChild(option);
    });
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    const dateOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('es-ES', dateOptions);

    // Seed dummy database entries
    seedDummyData();

    // Setup Event Listeners
    setupEventListeners();

    // Check NFC URL Parameter
    const urlParams = new URLSearchParams(window.location.search);
    const nfcPatientId = urlParams.get('patient');
    
    // Monitor Authentication State
    monitorAuthState((user, profile) => {
        // ON LOGIN
        loginView.classList.remove('active');
        appView.classList.add('active');
        
        cleanupActiveListeners();
        
        if (profile) {
            userNameEl.textContent = profile.name || user.email;
            userRoleEl.textContent = profile.role === 'patient' ? 'Paciente' : (profile.department || 'Personal');
            
            if (profile.role === 'patient') {
                // Adjust Patient Layout
                document.getElementById('doctor-nav').style.display = 'none';
                document.getElementById('patient-nav').style.display = 'flex';
                document.querySelector('.search-bar').style.display = 'none';
                document.getElementById('btn-open-register').style.display = 'none';
                
                navigateTo('patient-portal-section');
                startPatientPortal(profile);
            } else {
                // Adjust Doctor Layout
                document.getElementById('doctor-nav').style.display = 'flex';
                document.getElementById('patient-nav').style.display = 'none';
                document.querySelector('.search-bar').style.display = 'flex';
                document.getElementById('btn-open-register').style.display = 'block';
                
                if (profile.role === 'admin') {
                    const adminNavItem = document.querySelector('.admin-only');
                    if (adminNavItem) adminNavItem.style.display = 'flex';
                    loadAdminData();
                } else {
                    const adminNavItem = document.querySelector('.admin-only');
                    if (adminNavItem) adminNavItem.style.display = 'none';
                }
                
                navigateTo('dashboard-section');
                loadDashboardStats();
                loadPatientDirectory();
                
                // Monitor alerts and messages for Doctor
                if (profile.department) {
                    startDoctorAlertsListener(profile.department, profile.uid);
                }
                startDoctorMessagesListener(profile.uid);
            }
        } else {
            userNameEl.textContent = user.email;
        }

        // If NFC tag was scanned and user is DOCTOR/ADMIN, load patient data automatically
        if (nfcPatientId && profile && profile.role !== 'patient') {
            nfcStatusBadge.style.display = 'inline-block';
            navigateTo('records-section');
            loadPatientDetails(nfcPatientId);
        }
        
    }, () => {
        // ON LOGOUT
        cleanupActiveListeners();
        appView.classList.remove('active');
        loginView.classList.add('active');
        
        const newUrl = new URL(window.location.href);
        if (newUrl.searchParams.has('patient')) {
            newUrl.searchParams.delete('patient');
            window.history.replaceState({}, '', newUrl.href);
        }
        nfcStatusBadge.style.display = 'none';
    });

    window.addEventListener('popstate', (e) => {
        const urlParams = new URLSearchParams(window.location.search);
        const patientId = urlParams.get('patient');
        const profile = getCurrentProfile();
        if (profile && profile.role !== 'patient') {
            if (patientId) {
                navigateTo('records-section');
                loadPatientDetails(patientId);
            } else {
                navigateTo('dashboard-section');
                loadDashboardStats();
            }
        }
    });
});

function setupEventListeners() {
    // Sliding Login Tab Selector
    const selectorDoctor = document.getElementById('selector-doctor');
    const selectorPatient = document.getElementById('selector-patient');
    const doctorFields = document.getElementById('doctor-login-fields');
    const patientFields = document.getElementById('patient-login-fields');

    if (selectorDoctor && selectorPatient) {
        selectorDoctor.addEventListener('click', () => {
            currentLoginType = 'doctor';
            selectorDoctor.classList.add('active');
            selectorPatient.classList.remove('active');
            selectorDoctor.style.background = 'var(--card-bg)';
            selectorDoctor.style.color = 'var(--primary)';
            selectorPatient.style.background = 'transparent';
            selectorPatient.style.color = 'var(--text-muted)';
            doctorFields.style.display = 'block';
            patientFields.style.display = 'none';
        });

        selectorPatient.addEventListener('click', () => {
            currentLoginType = 'patient';
            selectorPatient.classList.add('active');
            selectorDoctor.classList.remove('active');
            selectorPatient.style.background = 'var(--card-bg)';
            selectorPatient.style.color = 'var(--primary)';
            selectorDoctor.style.background = 'transparent';
            selectorDoctor.style.color = 'var(--text-muted)';
            doctorFields.style.display = 'none';
            patientFields.style.display = 'block';
        });
    }

    // Login Form Submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-login');
        const errorEl = document.getElementById('login-error');
        
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Autenticando...';
        btn.disabled = true;
        errorEl.textContent = '';
        
        if (currentLoginType === 'doctor') {
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            const result = await loginUser(email, pass);
            if (!result.success) {
                errorEl.textContent = result.message;
                btn.innerHTML = 'Entrar al Sistema <i class="fa-solid fa-arrow-right"></i>';
                btn.disabled = false;
            }
        } else {
            const patientIdRaw = document.getElementById('patient-login-id').value;
            const patientId = patientIdRaw.trim().replace(/^#/, '');
            const dob = document.getElementById('patient-login-dob').value;
            if (!patientId || !dob) {
                errorEl.textContent = "Por favor ingrese el ID NFC y la Fecha de Nacimiento.";
                btn.innerHTML = 'Entrar al Sistema <i class="fa-solid fa-arrow-right"></i>';
                btn.disabled = false;
                return;
            }
            try {
                const result = await loginPatient(patientId, dob);
                if (!result.success) {
                    errorEl.textContent = result.message;
                    btn.innerHTML = 'Entrar al Sistema <i class="fa-solid fa-arrow-right"></i>';
                    btn.disabled = false;
                }
            } catch (err) {
                console.error("Login submission error:", err);
                errorEl.textContent = "Error al iniciar sesión. Compruebe la conexión.";
                btn.innerHTML = 'Entrar al Sistema <i class="fa-solid fa-arrow-right"></i>';
                btn.disabled = false;
            }
        }
    });

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

    mainContent.addEventListener('click', () => {
        if (sidebar.classList.contains('mobile-active')) {
            sidebar.classList.remove('mobile-active');
        }
    });

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-target');
            navigateTo(targetId);
            
            if (targetId === 'patients-section') loadPatientDirectory();
            if (targetId === 'dashboard-section') loadDashboardStats();
            
            if (sidebar.classList.contains('mobile-active')) {
                sidebar.classList.remove('mobile-active');
            }
        });
    });

    btnAddNote.addEventListener('click', () => {
        renderSpecialtyFields();
        noteModal.classList.add('active');
    });

    btnNewDoctor.addEventListener('click', () => {
        doctorModal.classList.add('active');
    });

    const regSpecialty = document.getElementById('reg-specialty');
    const regPrimaryDoc = document.getElementById('reg-primary-doc');
    if (regSpecialty && regPrimaryDoc) {
        regSpecialty.addEventListener('change', (e) => {
            populatePrimaryDoctorsSelect(e.target.value, regPrimaryDoc);
        });
    }

    btnOpenRegister.addEventListener('click', () => {
        document.getElementById('register-modal-title').textContent = "Registrar Nuevo Paciente";
        document.getElementById('reg-doc-id').value = "";
        registerForm.reset();
        
        populatePrimaryDoctorsSelect(regSpecialty.value, regPrimaryDoc);
        
        registerModal.classList.add('active');
        setTimeout(() => {
            if (window.resizeSignatureCanvas) window.resizeSignatureCanvas();
            if (window.loadSignatureDataUrl) window.loadSignatureDataUrl("");
        }, 200);
    });

    const btnSimulateVitals = document.getElementById('btn-simulate-vitals');
    if (btnSimulateVitals) {
        btnSimulateVitals.addEventListener('click', () => {
            document.getElementById('note-hr').value = Math.floor(Math.random() * (100 - 60 + 1) + 60);
            document.getElementById('note-bp').value = `${Math.floor(Math.random() * (135 - 110 + 1) + 110)}/${Math.floor(Math.random() * (85 - 70 + 1) + 70)}`;
            document.getElementById('note-temp').value = (Math.random() * (37.2 - 36.3) + 36.3).toFixed(1);
            document.getElementById('note-spo2').value = Math.floor(Math.random() * (100 - 95 + 1) + 95);
            showToast("Signos vitales capturados de los sensores", "info");
            calculateTriageManchester();
        });
    }

    const privacyModal = document.getElementById('privacy-modal');
    const sidebarPrivacyLink = document.getElementById('sidebar-privacy-link');
    const formPrivacyLink = document.getElementById('form-privacy-link');
    const loginPrivacyLink = document.getElementById('login-privacy-link');
    const loginPrivacyLinkHeader = document.getElementById('login-privacy-link-header');
    
    const openPrivacy = (e) => {
        e.preventDefault();
        if (privacyModal) privacyModal.classList.add('active');
    };
    
    if (sidebarPrivacyLink) sidebarPrivacyLink.addEventListener('click', openPrivacy);
    if (formPrivacyLink) formPrivacyLink.addEventListener('click', openPrivacy);
    if (loginPrivacyLink) loginPrivacyLink.addEventListener('click', openPrivacy);
    if (loginPrivacyLinkHeader) loginPrivacyLinkHeader.addEventListener('click', openPrivacy);

    closeModals.forEach(btn => {
        btn.addEventListener('click', () => {
            noteModal.classList.remove('active');
            doctorModal.classList.remove('active');
            registerModal.classList.remove('active');
            const sigModal = document.getElementById('signature-modal');
            if (sigModal) sigModal.classList.remove('active');
            if (privacyModal) privacyModal.classList.remove('active');
            editingNoteId = null;
            noteForm.reset();

            const badge = document.getElementById('triage-suggested-badge');
            if (badge) {
                badge.textContent = 'SIN EVALUAR';
                badge.style.backgroundColor = '#64748b';
                badge.setAttribute('data-triage-level', 'no_eval');
            }
        });
    });

    // Handle Note Submission (with shift override compliance check)
    noteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const profile = getCurrentProfile();
        if (!currentPatientDocId || !profile) return;

        const triageBadge = document.getElementById('triage-suggested-badge');
        const triageLevel = triageBadge ? triageBadge.getAttribute('data-triage-level') : 'no_eval';
        const triageLabel = triageBadge ? triageBadge.textContent : 'SIN EVALUAR';

        const noteData = {
            subjective: document.getElementById('note-subjective').value,
            diagnosis: document.getElementById('note-diagnosis').value,
            plan: document.getElementById('note-plan').value,
            hr: document.getElementById('note-hr').value,
            bp: document.getElementById('note-bp').value,
            temp: document.getElementById('note-temp').value,
            spo2: document.getElementById('note-spo2').value,
            triageLevel: triageLevel,
            triageLabel: triageLabel,
            specialtyData: {}
        };

        const specialtyInputs = document.querySelectorAll('.spec-input');
        specialtyInputs.forEach(input => {
            noteData.specialtyData[input.getAttribute('data-field')] = input.value;
        });
        
        const btn = noteForm.querySelector('button');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
        btn.disabled = true;

        // Shift Override NOM-024 Check
        const overridePanel = document.getElementById('shift-override-panel');
        if (overridePanel && overridePanel.style.display === 'block') {
            const justification = document.getElementById('override-justification-input').value.trim();
            if (!justification) {
                showToast("Se requiere una justificación (NOM-024) para modificar la nota de otro turno.", "error");
                btn.innerHTML = 'Guardar Evaluación Permanente';
                btn.disabled = false;
                return;
            }
            noteData.overrideJustification = justification;
            await addAuditLog(currentPatientDocId, `NOM-024 Shift Override justification: ${justification}`, profile);
        }

        let success = false;
        if (editingNoteId) {
            success = await updateClinicalNote(editingNoteId, noteData);
        } else {
            success = await addClinicalNote(currentPatientDocId, profile, noteData);
            
            // Check if we need to dispatch a high-priority clinical emergency alert
            const eventType = document.getElementById('note-event-type').value;
            if (eventType === "Cirugía" || eventType === "Cambio de Medicamento" || eventType === "Operación Urgente") {
                const patientSnap = await getPatientDataByDocId(currentPatientDocId);
                if (patientSnap) {
                    await sendEmergencyAlert({
                        patientId: currentPatientDocId,
                        patientName: patientSnap.name,
                        procedure: eventType,
                        medications: noteData.plan,
                        authorizedBy: profile.name,
                        specialty: profile.department || "Cardiología"
                    });
                }
            }
        }
        
        if (success) {
            noteForm.reset();
            noteModal.classList.remove('active');
            if (profile) {
                await addAuditLog(currentPatientDocId, editingNoteId ? "edit" : "create", profile);
            }
            if (currentPatientDocId) {
                await loadPatientDetails(null, currentPatientDocId);
            }
            showToast(editingNoteId ? "Evaluación clínica modificada" : "Nueva evaluación clínica registrada");
        } else {
            showToast("Error al procesar la evaluación", "error");
        }
        
        btn.innerHTML = 'Guardar Evaluación Permanente';
        btn.disabled = false;
    });

    // Handle Doctor Account Creation
    doctorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('doc-name').value;
        const email = document.getElementById('doc-email').value;
        const pass = document.getElementById('doc-password').value;
        const dept = document.getElementById('doc-dept').value;
        const shift = document.getElementById('doc-shift').value;
        const errorEl = document.getElementById('doc-error');
        
        const btn = doctorForm.querySelector('button');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando...';
        btn.disabled = true;
        errorEl.textContent = '';

        const result = await registerNewDoctor(name, email, pass, dept, shift);
        
        if (result.success) {
            doctorForm.reset();
            doctorModal.classList.remove('active');
            await loadAdminData();
            showToast(`Cuenta creada para Dr. ${name}`);
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
        const signatureUrl = window.getSignatureDataUrl ? window.getSignatureDataUrl() : "";
        
        const regPrimaryDocSelect = document.getElementById('reg-primary-doc');
        const selectedDocOption = regPrimaryDocSelect.options[regPrimaryDocSelect.selectedIndex];

        const data = {
            name: document.getElementById('reg-name').value,
            patientId: document.getElementById('reg-id').value,
            dob: document.getElementById('reg-dob').value,
            bloodType: document.getElementById('reg-blood').value,
            allergies: document.getElementById('reg-allergies').value,
            specialty: document.getElementById('reg-specialty').value,
            primaryDoctorId: regPrimaryDocSelect.value,
            primaryDoctorName: selectedDocOption ? selectedDocOption.textContent.split(' (')[0] : "Sin Asignar",
            secondaryDoctors: []
        };

        if (signatureUrl) {
            data.signatureUrl = signatureUrl;
        }
        
        const btn = registerForm.querySelector('button');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
        btn.disabled = true;

        // Auto-compute authorized collaborative doctors of the same department
        const doctors = await getAllDoctors();
        const specialtyDocs = doctors.filter(d => d.department === data.specialty && d.id !== data.primaryDoctorId);
        data.secondaryDoctors = specialtyDocs.map(d => d.id);

        let success = false;
        if (docId) {
            success = await updatePatient(docId, data);
        } else {
            success = await createPatient(data);
        }
        
        if (success) {
            const profile = getCurrentProfile();
            if (profile) {
                const tempPat = await getPatientData(data.patientId);
                if (tempPat) {
                    await addAuditLog(tempPat.id, docId ? "edit" : "create", profile);
                }
            }
            if (window.loadSignatureDataUrl) window.loadSignatureDataUrl("");

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
    
    directorySearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const rows = patientsTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    });

    const searchPatientInput = document.getElementById('search-patient');
    if (searchPatientInput) {
        searchPatientInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = e.target.value.trim();
                if (query) {
                    navigateTo('records-section');
                    loadPatientDetails(query);
                    e.target.value = '';
                }
            }
        });
    }

    // Drawing Canvas logic for Signatures
    const canvas = document.getElementById('signature-canvas');
    const clearBtn = document.getElementById('btn-clear-signature');
    const placeholder = document.getElementById('signature-placeholder');
    let isDrawing = false;
    let ctx = null;
    let lastX = 0;
    let lastY = 0;
    
    if (canvas) {
        ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * (window.devicePixelRatio || 1);
            canvas.height = rect.height * (window.devicePixelRatio || 1);
            ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        };
        
        window.addEventListener('resize', resizeCanvas);
        
        const getCoordinates = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const startDrawing = (e) => {
            isDrawing = true;
            const coords = getCoordinates(e);
            lastX = coords.x;
            lastY = coords.y;
            placeholder.style.display = 'none';
        };

        const draw = (e) => {
            if (!isDrawing) return;
            e.preventDefault();
            const coords = getCoordinates(e);
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
            lastX = coords.x;
            lastY = coords.y;
        };

        const stopDrawing = () => {
            isDrawing = false;
        };

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);

        canvas.addEventListener('touchstart', startDrawing);
        canvas.addEventListener('touchmove', draw);
        canvas.addEventListener('touchend', stopDrawing);
        canvas.addEventListener('touchcancel', stopDrawing);

        clearBtn.addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            placeholder.style.display = 'flex';
        });
        
        window.getSignatureDataUrl = () => {
            const blank = document.createElement('canvas');
            blank.width = canvas.width;
            blank.height = canvas.height;
            if (canvas.toDataURL() === blank.toDataURL()) {
                return "";
            }
            return canvas.toDataURL('image/png');
        };
        
        window.loadSignatureDataUrl = (dataUrl) => {
            if (!dataUrl) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                placeholder.style.display = 'flex';
                return;
            }
            placeholder.style.display = 'none';
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
            };
            img.src = dataUrl;
        };
        
        window.resizeSignatureCanvas = resizeCanvas;
    }

    ['note-hr', 'note-bp', 'note-temp', 'note-spo2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', calculateTriageManchester);
        }
    });

    const btnExportFhir = document.getElementById('btn-export-fhir');
    if (btnExportFhir) {
        btnExportFhir.addEventListener('click', async () => {
            if (currentPatientDocId) {
                const patientSnap = await getPatientDataByDocId(currentPatientDocId);
                if (patientSnap) {
                    const notes = await getPatientNotes(currentPatientDocId);
                    exportPatientToFHIR(patientSnap, notes);
                }
            }
        });
    }
}

function navigateTo(targetId) {
    navItems.forEach(nav => nav.classList.remove('active'));
    document.querySelector(`[data-target="${targetId}"]`)?.classList.add('active');

    contentSections.forEach(section => section.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');

    if (targetId !== 'records-section') {
        const newUrl = new URL(window.location.href);
        if (newUrl.searchParams.has('patient')) {
            newUrl.searchParams.delete('patient');
            window.history.pushState({}, '', newUrl.href);
        }
    }
}

// Loads and monitors Patient Portal (called when a patient logs in)
async function startPatientPortal(patientProfile) {
    const { doc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
    const { db } = await import("./firebase-config.js");
    
    // 1. Listen to real-time changes in patient profile
    const docRef = doc(db, "patients", patientProfile.uid);
    patientProfileUnsubscribe = onSnapshot(docRef, async (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        
        document.getElementById('portal-pat-name').textContent = data.name;
        document.getElementById('portal-pat-id').textContent = `#${data.patientId}`;
        document.getElementById('portal-pat-dob').textContent = data.dob;
        document.getElementById('portal-pat-blood').textContent = data.bloodType;
        document.getElementById('portal-pat-allergies').textContent = data.allergies || 'Ninguna';
        
        document.getElementById('portal-pat-specialty').textContent = data.specialty || 'General';
        document.getElementById('portal-pat-doctor').textContent = data.primaryDoctorName || 'Sin Asignar';
        
        document.getElementById('portal-pat-hr').innerHTML = `${data.heartRate || '--'} <span>lpm</span>`;
        document.getElementById('portal-pat-bp').innerHTML = `${data.bloodPressure || '--/--'} <span>mmHg</span>`;
        document.getElementById('portal-pat-temp').innerHTML = `${data.temp || '--'} <span>°C</span>`;
        
        // Priority Control to Lock/Unlock Patient Messaging
        const isPriority = data.isPriority || false;
        const lockedAlert = document.getElementById('portal-chat-locked-alert');
        const inputText = document.getElementById('portal-chat-input-text');
        const submitBtn = document.getElementById('portal-chat-submit-btn');
        
        if (isPriority) {
            lockedAlert.style.display = 'none';
            inputText.disabled = false;
            submitBtn.disabled = false;
            inputText.placeholder = "Escribe tu mensaje para el equipo médico...";
        } else {
            lockedAlert.style.display = 'block';
            inputText.disabled = true;
            submitBtn.disabled = true;
            inputText.placeholder = "Chat bloqueado (No Prioritario)";
        }
        
        await renderPatientPortalNotes(patientProfile.uid);
    });
    
    // 2. Real-time patient messages listener
    if (currentChatUnsubscribe) currentChatUnsubscribe();
    lastPatientPortalMessageId = null;
    currentChatUnsubscribe = listenChatMessages(patientProfile.patientId, (messages) => {
        renderPatientChat(messages);
    });
    
    // 3. Chat form handler
    const chatForm = document.getElementById('portal-chat-send-form');
    chatForm.onsubmit = async (e) => {
        e.preventDefault();
        const chatInput = document.getElementById('portal-chat-input-text');
        const text = chatInput.value.trim();
        if (!text) return;
        
        const success = await sendChatMessage(patientProfile.patientId, patientProfile.uid, patientProfile.name, 'patient', text, patientProfile.primaryDoctorId || "");
        if (success) {
            playMessageSentSound();
            chatInput.value = '';
        } else {
            showToast('No se pudo enviar el mensaje. Intenta de nuevo.', 'error');
        }
    };

    // 4. Emergency Call Button inside Patient Portal
    const callBtn = document.getElementById('btn-patient-emergency-call');
    const navCallBtn = document.getElementById('nav-btn-call-doctor');
    
    const triggerCall = () => {
        const specialty = patientProfile.specialty || 'General';
        const modal = document.getElementById('simulated-call-modal');
        document.getElementById('call-specialty-name').textContent = specialty.toUpperCase();
        modal.style.display = 'flex';
        
        playRingingTone();
        
        // Trigger high-priority clinical alert targeted specifically to their primary doctor
        sendEmergencyAlert({
            patientId: patientProfile.uid,
            patientName: patientProfile.name,
            procedure: "LLAMADA DE EMERGENCIA EN CAMA",
            medications: "El paciente ha activado el botón de emergencia en su Portal.",
            authorizedBy: "Auto-Llamado Paciente",
            specialty: specialty,
            targetDoctorId: patientProfile.primaryDoctorId || ""
        });
        
        document.getElementById('btn-cancel-call').onclick = () => {
            stopRingingTone();
            modal.style.display = 'none';
        };
    };
    
    if (callBtn) callBtn.onclick = triggerCall;
    if (navCallBtn) navCallBtn.onclick = triggerCall;
}

async function renderPatientPortalNotes(patientDocId) {
    const container = document.getElementById('portal-notes-container');
    if (!container) return;
    
    const notes = await getPatientNotes(patientDocId);
    
    if (notes.length === 0) {
        container.innerHTML = '<p class="text-muted text-center" style="padding: 20px;">No hay notas clínicas registradas.</p>';
        return;
    }
    
    container.innerHTML = '';
    notes.forEach(note => {
        let dateStr = "Justo ahora";
        if (note.timestamp) {
            const date = note.timestamp.toDate();
            dateStr = date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' }) + ' - ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute:'2-digit' });
        }
        
        const noteEl = document.createElement('div');
        noteEl.className = 'note-item';
        
        let specDetails = "";
        if (note.specialtyData) {
            for (const [key, val] of Object.entries(note.specialtyData)) {
                if (val) specDetails += `<span class="badge" style="background:#f1f5f9; color:var(--text-muted); font-size:0.65rem; margin-right:5px;">${key}: ${val}</span>`;
            }
        }
        
        noteEl.innerHTML = `
            <div class="note-meta">
                <span>${dateStr}</span>
                <span class="badge badge-primary">${note.specialty || 'General'}</span>
            </div>
            <div class="note-content">
                <strong style="color:var(--primary)">DIAGNÓSTICO: ${note.diagnosis || '--'}</strong>
                <p style="margin:8px 0"><strong>Indicaciones de Tratamiento:</strong> ${note.plan || '--'}</p>
                <div style="font-size: 0.72rem; color: var(--text-muted); border-top: 1px dashed var(--border-color); padding-top: 8px; margin-top: 8px;">
                    Atendido por: <strong>Dr. ${note.doctorName}</strong> en Turno ${note.doctorShift || 'Matutino'}
                </div>
                <div style="margin-top:10px;">${specDetails}</div>
            </div>
        `;
        container.appendChild(noteEl);
    });
}

function renderPatientChat(messages) {
    const display = document.getElementById('portal-chat-messages-display');
    if (!display) return;
    
    display.innerHTML = '';
    if (messages.length === 0) {
        display.innerHTML = '<p class="text-muted text-center" style="padding: 15px; font-size: 0.8rem;">No hay mensajes en este canal. Escribe tu duda o consulta.</p>';
        lastPatientPortalMessageId = null;
        return;
    }

    const latestMessage = messages[messages.length - 1];
    if (latestMessage.id !== lastPatientPortalMessageId) {
        if (lastPatientPortalMessageId !== null && latestMessage.senderRole === 'doctor') {
            playMessageReceivedSound();
        }
        lastPatientPortalMessageId = latestMessage.id;
    }
    
    messages.forEach(msg => {
        const msgEl = document.createElement('div');
        const isDoctor = msg.senderRole === 'doctor';
        
        msgEl.style.cssText = `
            max-width: 80%;
            padding: 10px 14px;
            border-radius: 12px;
            font-size: 0.82rem;
            line-height: 1.4;
            margin-bottom: 8px;
            ${!isDoctor 
                ? 'align-self: flex-end; background: var(--primary); color: white; border-bottom-right-radius: 2px;' 
                : 'align-self: flex-start; background: #e2e8f0; color: var(--text-main); border-bottom-left-radius: 2px;'
            }
        `;
        
        msgEl.innerHTML = `
            <strong style="display:block; font-size:0.68rem; margin-bottom:3px; ${!isDoctor ? 'color:#bfdbfe' : 'color:var(--text-muted)'}">
                ${isDoctor ? 'Equipo Médico' : 'Tú'}
            </strong>
            <span>${msg.text}</span>
        `;
        display.appendChild(msgEl);
    });
    
    display.scrollTop = display.scrollHeight;
}

// Fetch Patient Details inside Doctor View
async function loadPatientDetails(patientIdStr, docId = null) {
    noPatientView.style.display = 'none';
    patientDataView.style.display = 'none';
    
    let patientData = null;
    if (docId) {
        patientData = await getPatientDataByDocId(docId); 
    } else {
        patientData = await getPatientData(patientIdStr);
    }
    
    if (patientData) {
        currentPatientDocId = patientData.id;
        
        document.getElementById('pat-name').textContent = patientData.name;
        document.getElementById('pat-id').textContent = `#${patientData.patientId}`;
        document.getElementById('pat-dob').textContent = patientData.dob;
        document.getElementById('pat-blood').textContent = patientData.bloodType;
        document.getElementById('pat-allergies').textContent = patientData.allergies || 'Ninguna';
        document.getElementById('pat-hr').innerHTML = `${patientData.heartRate || '--'} <span>lpm</span>`;
        document.getElementById('pat-bp').innerHTML = `${patientData.bloodPressure || '--/--'} <span>mmHg</span>`;
        document.getElementById('pat-temp').innerHTML = `${patientData.temp || '--'} <span>°C</span>`;
        
        // Render proprietary team detail card
        document.getElementById('pat-specialty').textContent = patientData.specialty || 'General';
        document.getElementById('pat-primary-doc').textContent = patientData.primaryDoctorName || 'Sin Asignar';
        
        // Show collaborative doctors list
        const secDocsEl = document.getElementById('pat-secondary-docs');
        if (secDocsEl) {
            if (patientData.secondaryDoctors && patientData.secondaryDoctors.length > 0) {
                const doctorsList = await getAllDoctors();
                const matchedNames = patientData.secondaryDoctors.map(uid => {
                    const found = doctorsList.find(d => d.id === uid);
                    return found ? `Dr. ${found.name}` : null;
                }).filter(Boolean);
                secDocsEl.textContent = matchedNames.join(', ') || 'Ninguno';
            } else {
                secDocsEl.textContent = 'Ninguno';
            }
        }
        
        const lastModEl = document.getElementById('pat-last-mod');
        if (lastModEl) {
            let lastModStr = "Por: Sistema";
            if (patientData.lastModifiedAt) {
                const modDate = patientData.lastModifiedAt.toDate();
                lastModStr = `Por: ${patientData.lastModifiedBy || 'Sistema'} el ${modDate.toLocaleDateString('es-ES')} a las ${modDate.toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'})}`;
            }
            lastModEl.textContent = lastModStr;
        }

        patientDataView.style.display = 'block';
        await renderPatientNotes(currentPatientDocId);
        await renderAuditLogs(currentPatientDocId);

        // Security log audit
        const doctorProfile = getCurrentProfile();
        if (doctorProfile) {
            await addAuditLog(patientData.id, "consult", doctorProfile);
        }

        // Call Doctor in Charge Button for Interconsultation
        const callDocInChargeBtn = document.getElementById('btn-call-doctor-in-charge');
        if (callDocInChargeBtn) {
            if (doctorProfile && doctorProfile.role === 'doctor' && patientData.primaryDoctorId && patientData.primaryDoctorId !== doctorProfile.uid) {
                callDocInChargeBtn.style.display = 'inline-flex';
                callDocInChargeBtn.onclick = () => {
                    const specialty = patientData.specialty || 'General';
                    const modal = document.getElementById('simulated-call-modal');
                    document.getElementById('call-specialty-name').textContent = `DR. ${patientData.primaryDoctorName.toUpperCase()}`;
                    modal.style.display = 'flex';
                    
                    playRingingTone();
                    
                    // Trigger high-priority clinical interconsultation alert directly to the primary doctor!
                    sendEmergencyAlert({
                        patientId: patientData.id,
                        patientName: patientData.name,
                        procedure: "INTERCONSULTA CLÍNICA DE URGENCIA",
                        medications: `El Dr. ${doctorProfile.name} ha escaneado la pulsera y solicita tu apoyo inmediato.`,
                        authorizedBy: `Dr. ${doctorProfile.name}`,
                        specialty: specialty,
                        targetDoctorId: patientData.primaryDoctorId
                    });
                    
                    document.getElementById('btn-cancel-call').onclick = () => {
                        stopRingingTone();
                        modal.style.display = 'none';
                    };
                };
            } else {
                callDocInChargeBtn.style.display = 'none';
            }
        }

        // Signature consent display
        const consentArea = document.getElementById('consent-signature-area');
        const viewSigBtn = document.getElementById('btn-view-signature');
        if (consentArea && viewSigBtn) {
            if (patientData.signatureUrl) {
                consentArea.style.display = 'flex';
                viewSigBtn.onclick = () => {
                    const sigModal = document.getElementById('signature-modal');
                    const sigPreview = document.getElementById('signature-img-preview');
                    if (sigModal && sigPreview) {
                        sigPreview.src = patientData.signatureUrl;
                        sigModal.classList.add('active');
                    }
                };
            } else {
                consentArea.style.display = 'none';
            }
        }

        // Live Chat Panel setup for Doctors
        const chatSectionCard = document.getElementById('chat-section-card');
        const patPriorityCheckbox = document.getElementById('pat-priority-checkbox');
        
        if (chatSectionCard) {
            chatSectionCard.style.display = 'block';
            if (currentChatUnsubscribe) currentChatUnsubscribe();
            lastDoctorChatMessageId = null;
            currentChatUnsubscribe = listenChatMessages(patientData.patientId, (messages) => {
                renderDoctorChat(messages, patientData.patientId);
            });
            
            const chatSendForm = document.getElementById('chat-send-form');
            chatSendForm.onsubmit = async (e) => {
                e.preventDefault();
                const chatInput = document.getElementById('chat-input-text');
                const text = chatInput.value.trim();
                if (!text) return;
                
                const profile = getCurrentProfile();
                const success = await sendChatMessage(patientData.patientId, profile.uid, profile.name, 'doctor', text, patientData.primaryDoctorId || "");
                if (success) {
                    playMessageSentSound();
                    chatInput.value = '';
                } else {
                    showToast('No se pudo enviar el mensaje. Intenta de nuevo.', 'error');
                }
            };
        }
        
        if (patPriorityCheckbox) {
            patPriorityCheckbox.checked = patientData.isPriority || false;
            patPriorityCheckbox.onchange = async () => {
                const checked = patPriorityCheckbox.checked;
                await updatePatient(patientData.id, { isPriority: checked });
                showToast(checked ? "Paciente marcado como Prioritario. Chat habilitado." : "Prioridad removida. Chat deshabilitado.", "info");
            };
        }

        const newUrl = new URL(window.location.href);
        if (newUrl.searchParams.get('patient') !== patientData.patientId) {
            newUrl.searchParams.set('patient', patientData.patientId);
            window.history.pushState({ patientId: patientData.patientId }, '', newUrl.href);
        }
    } else {
        noPatientView.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation text-danger"></i>
            <h3>Paciente No Encontrado</h3>
            <p>No se encontraron registros para el ID: ${patientIdStr}</p>
        `;
        noPatientView.style.display = 'flex';
    }
}

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
        
        let specDetails = "";
        if (note.specialtyData) {
            for (const [key, val] of Object.entries(note.specialtyData)) {
                if (val) specDetails += `<span class="badge" style="background:#f1f5f9; color:var(--text-muted); font-size:0.65rem; margin-right:5px;">${key}: ${val}</span>`;
            }
        }

        let triageTag = "";
        if (note.triageLevel && note.triageLevel !== 'no_eval') {
            const colors = {
                red: '#ef4444',
                orange: '#f97316',
                yellow: '#eab308',
                green: '#22c55e',
                blue: '#3b82f6'
            };
            const color = colors[note.triageLevel] || '#64748b';
            triageTag = `<span class="badge" style="background:${color}; color:white; font-size:0.65rem; margin-right:5px; font-weight:bold; text-transform:uppercase;">TRIAGE: ${note.triageLabel || 'Evaluado'}</span>`;
        }

        noteEl.innerHTML = `
            <div class="note-meta">
                <span>${dateStr}</span>
                <div>
                    ${triageTag}
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

function renderDoctorChat(messages, patientId) {
    const display = document.getElementById('chat-messages-display');
    if (!display) return;
    
    display.innerHTML = '';
    if (messages.length === 0) {
        display.innerHTML = '<p class="text-muted text-center" style="padding: 10px; font-size: 0.72rem;">No hay mensajes en este canal clínico.</p>';
        lastDoctorChatMessageId = null;
        return;
    }

    const latestMessage = messages[messages.length - 1];
    if (latestMessage.id !== lastDoctorChatMessageId) {
        if (lastDoctorChatMessageId !== null && latestMessage.senderRole === 'patient') {
            playMessageReceivedSound();
        }
        lastDoctorChatMessageId = latestMessage.id;
    }
    
    messages.forEach(msg => {
        const msgEl = document.createElement('div');
        const isDoctor = msg.senderRole === 'doctor';
        
        msgEl.style.cssText = `
            max-width: 80%;
            padding: 8px 12px;
            border-radius: 12px;
            font-size: 0.78rem;
            line-height: 1.4;
            margin-bottom: 5px;
            ${isDoctor 
                ? 'align-self: flex-end; background: var(--primary); color: white; border-bottom-right-radius: 2px;' 
                : 'align-self: flex-start; background: #e2e8f0; color: var(--text-main); border-bottom-left-radius: 2px;'
            }
        `;
        
        msgEl.innerHTML = `
            <strong style="display:block; font-size:0.65rem; margin-bottom:2px; ${isDoctor ? 'color:#bfdbfe' : 'color:var(--text-muted)'}">
                ${msg.senderName} (${isDoctor ? 'Médico' : 'Paciente'})
            </strong>
            <span>${msg.text}</span>
        `;
        display.appendChild(msgEl);
    });
    
    display.scrollTop = display.scrollHeight;
}

// Exposed Functions for Note Actions (with NOM-024 validation)
window.editNote = async (noteId) => {
    const notes = await getPatientNotes(currentPatientDocId);
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    const profile = getCurrentProfile();
    if (!profile) return;

    editingNoteId = noteId;
    renderSpecialtyFields();
    
    document.getElementById('note-subjective').value = note.subjective || "";
    document.getElementById('note-diagnosis').value = note.diagnosis || "";
    document.getElementById('note-plan').value = note.plan || "";
    document.getElementById('note-hr').value = note.hr || "";
    document.getElementById('note-bp').value = note.bp || "";
    document.getElementById('note-temp').value = note.temp || "";
    document.getElementById('note-spo2').value = note.spo2 || "";

    // Clear override panel
    const overridePanel = document.getElementById('shift-override-panel');
    overridePanel.style.display = 'none';
    document.getElementById('override-justification-input').value = '';

    // NOM-024 shift override check: 
    // Author or co-médico on SAME shift & specialty do NOT need authorization. Otherwise, lock input and require shift justification.
    const isAuthor = note.doctorId === profile.uid;
    const isSameShiftAndDept = note.specialty === profile.department && (note.doctorShift || "matutino") === (profile.shift || "matutino");
    
    if (!isAuthor && !isSameShiftAndDept) {
        overridePanel.style.display = 'block';
        document.getElementById('override-note-author').textContent = note.doctorName || 'Médico';
        document.getElementById('override-note-shift').textContent = note.doctorShift || 'Matutino';
    }

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

// Loads Patient Directory based on Doctor Specialty
async function loadPatientDirectory() {
    if (!patientsTableBody) return;
    patientsTableBody.innerHTML = '<tr><td colspan="4">Cargando pacientes...</td></tr>';
    
    const profile = getCurrentProfile();
    const isAdmin = profile && profile.role === 'admin';
    const patients = await getAllPatients(profile);
    patientsTableBody.innerHTML = '';
    
    if (patients.length === 0) {
        patientsTableBody.innerHTML = '<tr><td colspan="4" class="text-center">No hay pacientes registrados en tu departamento.</td></tr>';
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

    const regSpecialty = document.getElementById('reg-specialty');
    const regPrimaryDoc = document.getElementById('reg-primary-doc');
    if (regSpecialty && regPrimaryDoc) {
        regSpecialty.value = pat.specialty || "Cardiología";
        await populatePrimaryDoctorsSelect(regSpecialty.value, regPrimaryDoc, pat.primaryDoctorId);
    }

    registerModal.classList.add('active');
    setTimeout(() => {
        if (window.resizeSignatureCanvas) window.resizeSignatureCanvas();
        if (window.loadSignatureDataUrl) window.loadSignatureDataUrl(pat.signatureUrl || "");
    }, 200);
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

window.viewPatient = (id) => {
    navigateTo('records-section');
    loadPatientDetails(id);
};

async function loadDashboardStats() {
    const profile = getCurrentProfile();
    const patients = await getAllPatients(profile);
    document.getElementById('stat-patients').textContent = patients.length;
    document.getElementById('stat-evals').textContent = Math.floor(Math.random() * 15) + 3; 
    loadRecentActivity(patients);
}

async function loadRecentActivity(patients) {
    const container = document.getElementById('recent-activity-list');
    if (!container) return;
    container.innerHTML = '';
    const recent = patients.slice(0, 4);
    
    if (recent.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">No hay actividad reciente en tu área.</p>';
        return;
    }

    recent.forEach(p => {
        const item = document.createElement('div');
        item.style.cssText = "display:flex; align-items:center; gap:10px; padding:8px; background:var(--bg-color); border-radius:8px; border-left:3px solid var(--primary);";
        item.innerHTML = `
            <div style="font-size:1rem; color:var(--primary)"><i class="fa-solid fa-user-check"></i></div>
            <div style="flex:1">
                <p style="font-size:0.8rem; font-weight:600; margin:0;">${p.name}</p>
                <p style="font-size:0.7rem; color:var(--text-muted); margin:0;">Registro de especialidad activo</p>
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
    } else if (profile.department === 'Neurología') {
        fields = [
            { id: 'reflexes', label: 'Reflejos Motores', placeholder: 'Normal/Disminuido' },
            { id: 'pupils', label: 'Reflejo Pupilar', placeholder: 'Isocóricas/Anisocóricas' },
            { id: 'coordination', label: 'Coordinación', placeholder: 'Estable/Inestable' }
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

function calculateTriageManchester() {
    const hrVal = parseInt(document.getElementById('note-hr').value) || 0;
    const bpVal = document.getElementById('note-bp').value || "";
    const tempVal = parseFloat(document.getElementById('note-temp').value) || 0;
    const spo2Val = parseInt(document.getElementById('note-spo2').value) || 0;
    
    let level = 'no_eval';
    let label = 'Sin Evaluar';
    let color = '#64748b';
    
    let systolic = 0;
    if (bpVal && bpVal.includes('/')) {
        systolic = parseInt(bpVal.split('/')[0]) || 0;
    }

    if (spo2Val > 0 || hrVal > 0 || tempVal > 0 || systolic > 0) {
        if ((spo2Val > 0 && spo2Val < 90) || hrVal > 140 || (hrVal > 0 && hrVal < 40) || (systolic > 0 && (systolic > 200 || systolic < 80))) {
            level = 'red';
            label = 'Rojo (Resucitación)';
            color = '#ef4444';
        } else if ((spo2Val >= 90 && spo2Val <= 93) || tempVal >= 39.0 || (tempVal > 0 && tempVal <= 35.0)) {
            level = 'orange';
            label = 'Naranja (Emergencia)';
            color = '#f97316';
        } else if ((spo2Val >= 94 && spo2Val <= 95) || (hrVal >= 100 && hrVal <= 139) || tempVal >= 37.8) {
            level = 'yellow';
            label = 'Amarillo (Urgente)';
            color = '#eab308';
        } else if ((spo2Val >= 96) || (hrVal >= 50 && hrVal <= 99) || (tempVal > 35.0 && tempVal < 37.8)) {
            level = 'green';
            label = 'Verde (Urgencia Menor)';
            color = '#22c55e';
        } else {
            level = 'blue';
            label = 'Azul (No Urgente)';
            color = '#3b82f6';
        }
    }

    const badge = document.getElementById('triage-suggested-badge');
    if (badge) {
        badge.textContent = label.toUpperCase();
        badge.style.backgroundColor = color;
        badge.style.color = '#ffffff';
        badge.setAttribute('data-triage-level', level);
    }
}

function exportPatientToFHIR(patientData, notes = []) {
    if (!patientData) return;

    const fhirPatient = {
        resourceType: "Patient",
        id: patientData.patientId || "anonymous",
        active: true,
        name: [
            {
                use: "official",
                text: patientData.name || "Paciente Anónimo"
            }
        ],
        birthDate: patientData.dob || "",
        extension: []
    };

    if (patientData.bloodType) {
        fhirPatient.extension.push({
            url: "http://hl7.org/fhir/StructureDefinition/patient-bloodType",
            valueCodeableConcept: {
                coding: [
                    {
                        system: "http://snomed.info/sct",
                        code: "112144000",
                        display: `Grupo Sanguíneo: ${patientData.bloodType}`
                    }
                ]
            }
        });
    }

    const fhirAllergies = [];
    if (patientData.allergies && patientData.allergies !== "Ninguna") {
        patientData.allergies.split(',').forEach((allergy, i) => {
            fhirAllergies.push({
                resourceType: "AllergyIntolerance",
                id: `allergy-${i}`,
                clinicalStatus: {
                    coding: [
                        {
                            system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                            code: "active"
                        }
                    ]
                },
                verificationStatus: {
                    coding: [
                        {
                            system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
                            code: "confirmed"
                        }
                    ]
                },
                category: ["biological"],
                criticality: "high",
                code: {
                    text: allergy.trim()
                },
                patient: {
                    reference: `Patient/${fhirPatient.id}`
                }
            });
        });
    }

    const fhirObservations = [];
    if (patientData.heartRate && patientData.heartRate !== "--") {
        fhirObservations.push({
            resourceType: "Observation",
            id: "obs-heart-rate",
            status: "final",
            category: [
                {
                    coding: [
                        {
                            system: "http://terminology.hl7.org/CodeSystem/observation-category",
                            code: "vital-signs",
                            display: "Vital Signs"
                        }
                    ]
                }
            ],
            code: {
                coding: [
                    {
                        system: "http://loinc.org",
                        code: "8867-4",
                        display: "Heart rate"
                    }
                ]
            },
            subject: {
                reference: `Patient/${fhirPatient.id}`
            },
            effectiveDateTime: new Date().toISOString(),
            valueQuantity: {
                value: parseFloat(patientData.heartRate),
                unit: "beats/minute",
                system: "http://unitsofmeasure.org",
                code: "/min"
            }
        });
    }

    if (patientData.temp && patientData.temp !== "--") {
        fhirObservations.push({
            resourceType: "Observation",
            id: "obs-body-temp",
            status: "final",
            category: [
                {
                    coding: [
                        {
                            system: "http://terminology.hl7.org/CodeSystem/observation-category",
                            code: "vital-signs",
                            display: "Vital Signs"
                        }
                    ]
                }
            ],
            code: {
                coding: [
                    {
                        system: "http://loinc.org",
                        code: "8310-5",
                        display: "Body temperature"
                    }
                ]
            },
            subject: {
                reference: `Patient/${fhirPatient.id}`
            },
            effectiveDateTime: new Date().toISOString(),
            valueQuantity: {
                value: parseFloat(patientData.temp),
                unit: "C",
                system: "http://unitsofmeasure.org",
                code: "Cel"
            }
        });
    }

    const fhirBundle = {
        resourceType: "Bundle",
        type: "collection",
        timestamp: new Date().toISOString(),
        entry: [
            { resource: fhirPatient },
            ...fhirAllergies.map(r => ({ resource: r })),
            ...fhirObservations.map(r => ({ resource: r }))
        ]
    };

    const jsonString = JSON.stringify(fhirBundle, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FHIR_Patient_${patientData.patientId || 'unknown'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Expediente exportado en formato FHIR HL7 JSON", "success");
}

async function renderAuditLogs(patientDocId) {
    const container = document.getElementById('audit-logs-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner">Cargando bitácora...</div>';
    const logs = await getAuditLogs(patientDocId);
    
    if (logs.length === 0) {
        container.innerHTML = '<p class="text-muted text-center" style="padding: 20px; font-size: 0.8rem;">No hay registros de acceso en la bitácora.</p>';
        return;
    }
    
    container.innerHTML = '';
    logs.forEach(log => {
        let dateStr = "Justo ahora";
        if (log.timestamp) {
            const date = log.timestamp.toDate();
            dateStr = date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute:'2-digit', second:'2-digit' });
        }
        
        const item = document.createElement('div');
        item.style.cssText = "padding: 8px 12px; margin-bottom: 8px; background: white; border-radius: 6px; border: 1px solid var(--border-color); font-size: 0.72rem; display: flex; align-items: flex-start; gap: 8px;";
        
        let icon = '<i class="fa-solid fa-eye" style="color: #64748b; margin-top: 2px;"></i>';
        let actionText = "consultó el expediente";
        
        if (log.action.includes("justification:")) {
            icon = '<i class="fa-solid fa-triangle-exclamation" style="color: #eab308; margin-top: 2px;"></i>';
            actionText = `activó protocolo NOM-024: "${log.action.split('justification: ')[1]}"`;
        } else if (log.action === "edit") {
            icon = '<i class="fa-solid fa-user-pen" style="color: #f97316; margin-top: 2px;"></i>';
            actionText = "modificó el expediente";
        } else if (log.action === "create") {
            icon = '<i class="fa-solid fa-user-plus" style="color: #22c55e; margin-top: 2px;"></i>';
            actionText = "creó el expediente";
        }
        
        item.innerHTML = `
            ${icon}
            <div style="flex:1">
                <p style="margin: 0; font-weight: 600; color: var(--text-main); font-size: 0.7rem;">Dr. ${log.doctorName?.toUpperCase()} (${log.doctorDept})</p>
                <p style="margin: 2px 0 0 0; color: var(--text-muted); font-size: 0.65rem;">${actionText}</p>
            </div>
            <div style="color: var(--text-muted); font-size: 0.65rem; white-space: nowrap;">${dateStr}</div>
        `;
        container.appendChild(item);
    });
}
