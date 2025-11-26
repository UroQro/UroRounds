import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  onSnapshot, 
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { 
  Activity, User, FileText, Plus, LogOut, Save, Search, Download, 
  CheckCircle, AlertCircle, Users, Lock, BedDouble, ClipboardList, 
  Stethoscope, Calendar, Link as LinkIcon, ExternalLink, Clock, 
  Edit2, AlertTriangle, HeartPulse, Syringe, ChevronRight
} from 'lucide-react';

// --- CONFIGURACIÓN DINÁMICA DE FIREBASE ---
let firebaseConfig;
let isVercel = false;

try {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) {
    firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };
    isVercel = true;
  } 
  else if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
  }
} catch (e) {
  console.warn("Configuración de entorno no detectada, usando fallback.");
}

const app = initializeApp(firebaseConfig || {});
const auth = getAuth(app);
const db = getFirestore(app);

// Helper para rutas (Compatible Vercel y Local)
const getCollectionRef = (collName) => {
  if (isVercel) {
    return collection(db, collName);
  } else {
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    return collection(db, 'artifacts', appId, 'public', 'data', collName);
  }
};

const calculateAge = (dobString) => {
  if (!dobString) return 0;
  const today = new Date();
  const birthDate = new Date(dobString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const calculateLOS = (admissionDate, dischargeDate, status) => {
  if (!admissionDate) return 0;
  const start = new Date(admissionDate);
  const end = (status === 'egresado' && dischargeDate) ? new Date(dischargeDate) : new Date();
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
  return diffDays;
};

const renderTextWithLinks = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline hover:text-blue-800 break-all inline-flex items-center gap-1 font-medium" onClick={(e) => e.stopPropagation()}>
          {part} <ExternalLink size={12} />
        </a>
      );
    }
    return part;
  });
};

export default function UroRoundsApp() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null); 
  const [authLoading, setAuthLoading] = useState(true);
  const [patients, setPatients] = useState([]);
  const [view, setView] = useState('login');
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDischarged, setShowDischarged] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [newUserForm, setNewUserForm] = useState({ username: '', password: '', fullName: '', masterPassword: '' });
  const [newPatientForm, setNewPatientForm] = useState({
    bedNumber: '', recordNumber: '', fullName: '', dob: '', admissionDate: '', diagnosis: '', surgery: '', serviceType: 'HO',
    medicalHistory: { dm: false, has: false, allergies: '', others: '' }
  });
  const [editPatientForm, setEditPatientForm] = useState(null);
  const [newNote, setNewNote] = useState('');
  const [newNoteType, setNewNoteType] = useState('evolucion');

  const showFeedback = (type, text) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch((error) => console.error(error));
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!firebaseUser || !currentUser || !db) return;
    const q = getCollectionRef('patients');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedPatients = snapshot.docs.map(doc => {
        const data = doc.data();
        if (!data.medicalHistory) data.medicalHistory = { dm: false, has: false, allergies: '', others: '' };
        return { id: doc.id, ...data };
      });
      loadedPatients.sort((a, b) => {
          const numA = parseInt(a.bedNumber);
          const numB = parseInt(b.bedNumber);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.bedNumber.localeCompare(b.bedNumber);
      });
      setPatients(loadedPatients);
    }, (error) => showFeedback('error', 'Error de conexión'));
    return () => unsubscribe();
  }, [firebaseUser, currentUser]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!db) return;
    try {
      const usersRef = getCollectionRef('app_users');
      const snapshot = await getDocs(usersRef);
      const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const foundUser = users.find(u => u.username === loginForm.username && u.password === loginForm.password);
      if (foundUser) {
        setCurrentUser(foundUser);
        setView('list');
        setLoginForm({ username: '', password: '' });
      } else {
        showFeedback('error', "Usuario o contraseña incorrectos.");
      }
    } catch (err) {
      showFeedback('error', "Error de conexión.");
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (newUserForm.masterPassword !== 'urotec123') {
      showFeedback('error', "Contraseña maestra incorrecta.");
      return;
    }
    if (!db) return;
    try {
      await addDoc(getCollectionRef('app_users'), {
        username: newUserForm.username,
        password: newUserForm.password,
        fullName: newUserForm.fullName,
        role: 'doctor',
        createdAt: serverTimestamp()
      });
      showFeedback('success', "Usuario creado exitosamente.");
      setView('login');
      setNewUserForm({ username: '', password: '', fullName: '', masterPassword: '' });
    } catch (err) {
      showFeedback('error', "Error creando usuario.");
    }
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    if (!currentUser || !db) return;
    const calculatedAge = calculateAge(newPatientForm.dob || '');
    try {
      const newPatientData = {
        ...newPatientForm,
        age: calculatedAge, 
        status: 'hospitalizado',
        notes: [],
        admittedBy: currentUser.fullName,
        createdAt: serverTimestamp()
      };
      await addDoc(getCollectionRef('patients'), newPatientData);
      setNewPatientForm({
        bedNumber: '', recordNumber: '', fullName: '', dob: '', admissionDate: '', diagnosis: '', surgery: '', serviceType: 'HO',
        medicalHistory: { dm: false, has: false, allergies: '', others: '' }
      });
      showFeedback('success', 'Paciente ingresado');
      const modal = document.getElementById('add-patient-modal');
      if (modal) modal.close();
    } catch (err) {
      showFeedback('error', "Error ingresando paciente.");
    }
  };

  const handleEditPatient = async (e) => {
    e.preventDefault();
    if (!editPatientForm || !editPatientForm.id || !db) return;
    try {
      const collRef = getCollectionRef('patients');
      const patientRef = doc(collRef, editPatientForm.id);
      const calculatedAge = calculateAge(editPatientForm.dob || '');
      await updateDoc(patientRef, {
        fullName: editPatientForm.fullName,
        bedNumber: editPatientForm.bedNumber,
        recordNumber: editPatientForm.recordNumber,
        dob: editPatientForm.dob,
        age: calculatedAge,
        diagnosis: editPatientForm.diagnosis,
        surgery: editPatientForm.surgery,
        serviceType: editPatientForm.serviceType,
        medicalHistory: editPatientForm.medicalHistory
      });
      showFeedback('success', 'Ficha actualizada');
      setEditPatientForm(null); 
      const modal = document.getElementById('edit-patient-modal');
      if (modal) modal.close();
    } catch (err) {
      showFeedback('error', "Error actualizando.");
    }
  };

  const openEditModal = (patient) => {
    setEditPatientForm({ ...patient });
    const modal = document.getElementById('edit-patient-modal');
    if (modal) modal.showModal();
  };

  const handleAddNote = async () => {
    if (!selectedPatientId || !newNote.trim() || !currentUser || !db) return;
    const collRef = getCollectionRef('patients');
    const patientRef = doc(collRef, selectedPatientId);
    const selectedPatient = patients.find(p => p.id === selectedPatientId);
    if (!selectedPatient) return;
    const noteObject = {
      id: crypto.randomUUID(),
      content: newNote,
      author: currentUser.fullName,
      createdAt: new Date().toISOString(), 
      type: newNoteType
    };
    const updatedNotes = [...(selectedPatient.notes || []), noteObject];
    try {
      await updateDoc(patientRef, { notes: updatedNotes });
      setNewNote('');
      showFeedback('success', 'Nota guardada');
    } catch (err) {
      showFeedback('error', "Error guardando nota.");
    }
  };

  const confirmDischarge = async () => {
    if (!selectedPatientId || !db) return;
    try {
      const collRef = getCollectionRef('patients');
      const patientRef = doc(collRef, selectedPatientId);
      await updateDoc(patientRef, { 
        status: 'egresado',
        dischargeDate: new Date().toISOString(),
        dischargedBy: currentUser?.fullName
      });
      setShowDischargeModal(false);
      setSelectedPatientId(null);
      setView('list');
      showFeedback('success', 'Paciente egresado');
    } catch (err) {
      showFeedback('error', "Error al egresar.");
    }
  };

  const downloadCSV = () => {
    const activePatients = patients.filter(p => p.status === 'hospitalizado');
    if (activePatients.length === 0) {
      showFeedback('error', "No hay pacientes.");
      return;
    }
    const headers = ["Servicio", "Cama", "Expediente", "Nombre", "Edad", "Diagnóstico", "Cirugía", "DM", "HAS", "Alergias", "Otros Ant.", "Fecha Ingreso", "Días Estancia"];
    const rows = activePatients.map(p => [
      p.serviceType,
      p.bedNumber,
      p.recordNumber,
      p.fullName,
      p.age,
      `"${p.diagnosis}"`, 
      `"${p.surgery}"`,
      p.medicalHistory?.dm ? 'Sí' : 'No',
      p.medicalHistory?.has ? 'Sí' : 'No',
      `"${p.medicalHistory?.allergies || 'Negadas'}"`,
      `"${p.medicalHistory?.others || ''}"`,
      p.admissionDate,
      calculateLOS(p.admissionDate, undefined, 'hospitalizado')
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `urorounds_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredPatients = useMemo(() => {
    let list = patients;
    if (!showDischarged) list = list.filter(p => p.status === 'hospitalizado');
    else list = list.filter(p => p.status === 'egresado');
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(p => 
        p.fullName.toLowerCase().includes(term) || 
        p.bedNumber.toLowerCase().includes(term) ||
        p.diagnosis.toLowerCase().includes(term)
      );
    }
    return list;
  }, [patients, searchTerm, showDischarged]);

  const activePatient = patients.find(p => p.id === selectedPatientId);

  const FeedbackToast = () => {
    if (!feedbackMsg) return null;
    return (
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-bounce-in max-w-[90vw] whitespace-nowrap
        ${feedbackMsg.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
        {feedbackMsg.type === 'error' ? <AlertCircle size={20}/> : <CheckCircle size={20}/>}
        <span className="font-medium text-sm">{feedbackMsg.text}</span>
      </div>
    );
  };

  const ServiceBadge = ({ type }) => {
    if (type === 'IC') return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">IC</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">HO</span>;
  };

  if (authLoading) return <div className="h-screen w-full flex items-center justify-center bg-slate-100 text-slate-500">Cargando...</div>;

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <FeedbackToast />
        <div className="bg-white p-6 md:p-8 rounded-xl shadow-lg w-full max-w-sm border-t-4 border-blue-600">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-100 p-4 rounded-full">
              <Activity size={40} className="text-blue-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-slate-800 mb-1">UroRounds</h1>
          <p className="text-center text-slate-400 mb-8 text-xs uppercase tracking-widest font-bold">Censo Médico Digital</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label>
              <input type="text" required className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base"
                value={loginForm.username} onChange={e => setLoginForm({...loginForm, username: e.target.value})} placeholder="Usuario" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
              <input type="password" required className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base"
                value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} placeholder="••••••" />
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg transition-colors shadow-lg shadow-blue-200 active:scale-95 transform transition-transform">
              Iniciar Sesión
            </button>
          </form>
          <div className="mt-6 text-center">
            <button onClick={() => setView('addUser')} className="text-sm text-slate-400 hover:text-blue-600 py-2">Registrar nuevo usuario</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'addUser') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <FeedbackToast />
        <div className="bg-white p-6 md:p-8 rounded-xl shadow-lg w-full max-w-sm">
          <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Users className="text-blue-600" /> Nuevo Usuario</h2>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div><label className="block text-sm font-medium text-slate-700">Nombre</label>
              <input type="text" required className="w-full px-3 py-3 border rounded-lg text-base" value={newUserForm.fullName} onChange={e => setNewUserForm({...newUserForm, fullName: e.target.value})} /></div>
            <div><label className="block text-sm font-medium text-slate-700">Usuario</label>
              <input type="text" required className="w-full px-3 py-3 border rounded-lg text-base" value={newUserForm.username} onChange={e => setNewUserForm({...newUserForm, username: e.target.value})} /></div>
            <div><label className="block text-sm font-medium text-slate-700">Contraseña</label>
              <input type="password" required className="w-full px-3 py-3 border rounded-lg text-base" value={newUserForm.password} onChange={e => setNewUserForm({...newUserForm, password: e.target.value})} /></div>
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-sm font-bold text-red-500 mb-1 flex items-center gap-1"><Lock size={14}/> Contraseña Maestra</label>
              <input type="password" required className="w-full px-3 py-3 border border-red-200 rounded-lg bg-red-50 focus:ring-red-500 text-base" value={newUserForm.masterPassword} onChange={e => setNewUserForm({...newUserForm, masterPassword: e.target.value})} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setView('login')} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 py-3 rounded-lg font-medium">Cancelar</button>
              <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold">Crear</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const Header = () => (
    <header className="bg-white shadow-sm sticky top-0 z-30 pb-safe">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => {if(view!=='list') setView('list'); setSelectedPatientId(null);}}>
          <div className="bg-blue-600 text-white p-1.5 rounded-lg">
            <Activity size={18} />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 leading-none text-lg">UroRounds</h1>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Censo Médico</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:block text-right">
            <p className="text-sm font-medium text-slate-800">{currentUser?.fullName}</p>
            <p className="text-xs text-slate-500 capitalize">{currentUser?.role}</p>
          </div>
          <button onClick={() => { setCurrentUser(null); setView('login'); }} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-colors" title="Cerrar Sesión"><LogOut size={18} /></button>
        </div>
      </div>
    </header>
  );

  if (view === 'detail' && activePatient) {
    const los = calculateLOS(activePatient.admissionDate, activePatient.dischargeDate, activePatient.status);
    return (
      <div className="min-h-screen bg-slate-100 pb-20">
        <Header />
        <FeedbackToast />
        {showDischargeModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
             <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl p-6 w-full max-w-sm mb-0 sm:mb-auto animate-slide-up sm:animate-none">
               <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2"><AlertCircle className="text-red-500" /> Confirmar Egreso</h3>
               <p className="text-slate-600 mb-6 text-sm">¿Desea egresar a <strong>{activePatient.fullName}</strong>?</p>
               <div className="flex gap-3 justify-end">
                 <button onClick={() => setShowDischargeModal(false)} className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium">Cancelar</button>
                 <button onClick={confirmDischarge} className="flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-bold shadow-lg shadow-red-200">Sí, Egresar</button>
               </div>
             </div>
          </div>
        )}
        <main className="max-w-5xl mx-auto px-4 py-4 md:py-6">
          <button onClick={() => { setView('list'); setSelectedPatientId(null); }} className="mb-4 text-slate-500 hover:text-blue-600 flex items-center gap-1 text-sm font-medium py-2 active:opacity-60">
             <ChevronRight className="rotate-180" size={16}/> Volver
          </button>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 relative">
             {activePatient.status === 'hospitalizado' && (
                <button onClick={() => openEditModal(activePatient)} className="absolute top-3 right-3 p-2 text-slate-400 bg-white/80 backdrop-blur rounded-full border border-slate-200 hover:text-blue-600 hover:bg-blue-50 transition-colors z-10 shadow-sm" title="Editar">
                  <Edit2 size={18} />
                </button>
             )}
            <div className={`px-4 md:px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${activePatient.status === 'egresado' ? 'bg-gray-100' : 'bg-blue-50/50'}`}>
              <div className="flex items-start gap-4 w-full">
                <div className={`h-14 w-14 md:h-16 md:w-16 rounded-full flex items-center justify-center flex-shrink-0 ${activePatient.status === 'egresado' ? 'bg-gray-200 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>
                  <User size={28} />
                </div>
                <div className="pr-8 flex-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <h2 className="text-xl md:text-2xl font-bold text-slate-800 leading-tight">{activePatient.fullName}</h2>
                    {activePatient.status === 'egresado' && <span className="px-2 py-0.5 bg-gray-600 text-white text-[10px] rounded-full font-bold uppercase">Egresado</span>}
                    <ServiceBadge type={activePatient.serviceType} />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2 mb-2">
                     {activePatient.medicalHistory?.dm && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200"><Syringe size={10}/> DM</span>}
                     {activePatient.medicalHistory?.has && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-pink-100 text-pink-700 border border-pink-200"><HeartPulse size={10}/> HAS</span>}
                     {activePatient.medicalHistory?.allergies && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200"><AlertTriangle size={10}/> Alergia</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm text-slate-600 mt-1">
                    <span className="flex items-center gap-1"><BedDouble size={14}/> Cama: <strong>{activePatient.bedNumber}</strong></span>
                    <span className="flex items-center gap-1"><ClipboardList size={14}/> Exp: {activePatient.recordNumber}</span>
                    <span className="flex items-center gap-1"><Calendar size={14}/> {activePatient.age} años</span>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold ml-auto md:ml-0 ${los > 7 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white border-slate-200 text-slate-600'}`}>
                       <Clock size={10}/> {los} días
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {(activePatient.medicalHistory?.allergies || activePatient.medicalHistory?.others) && (
                <div className="px-4 md:px-6 py-2 bg-red-50/50 border-b border-red-100 text-xs text-slate-700 grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
                    {activePatient.medicalHistory?.allergies && (
                        <div className="flex gap-2 items-start">
                            <span className="font-bold text-red-600 uppercase w-16 shrink-0">Alergias:</span>
                            <span className="font-medium">{activePatient.medicalHistory.allergies}</span>
                        </div>
                    )}
                    {activePatient.medicalHistory?.others && (
                        <div className="flex gap-2 items-start">
                            <span className="font-bold text-slate-600 uppercase w-16 shrink-0">Otros:</span>
                            <span>{activePatient.medicalHistory.others}</span>
                        </div>
                    )}
                </div>
            )}
            <div className="px-4 md:px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 bg-white">
              <div className="bg-slate-50 p-3 md:p-4 rounded-lg border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Diagnóstico</p>
                <p className="text-slate-800 font-medium text-sm md:text-base">{activePatient.diagnosis}</p>
              </div>
              <div className="bg-slate-50 p-3 md:p-4 rounded-lg border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Cirugía</p>
                <p className="text-slate-800 font-medium text-sm md:text-base">{activePatient.surgery || 'Sin cirugía registrada'}</p>
              </div>
              <div className="text-xs text-slate-400 md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-slate-50 md:border-none md:pt-0">
                <div><strong>Ingreso:</strong><br/>{new Date(activePatient.admissionDate).toLocaleString('es-MX', {dateStyle: 'short', timeStyle: 'short'})}</div>
                <div><strong>F. Nacimiento:</strong><br/>{activePatient.dob}</div>
                {activePatient.status === 'egresado' && (
                    <div className="col-span-2 md:col-span-2 bg-red-50 p-2 rounded border border-red-100 text-red-800">
                        <strong>Fecha de Egreso:</strong><br/>
                        {activePatient.dischargeDate ? new Date(activePatient.dischargeDate).toLocaleString('es-MX') : 'No registrada'}
                    </div>
                )}
              </div>
              {activePatient.status === 'hospitalizado' && (
                <button onClick={() => setShowDischargeModal(true)} className="md:hidden mt-2 w-full bg-white border border-red-200 text-red-600 hover:bg-red-50 px-4 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm">
                  <LogOut size={16} /> Egresar Paciente
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-wide px-1"><FileText className="text-blue-600" size={16}/> Notas</h3>
              <div className="space-y-4 pb-24 lg:pb-0">
                {activePatient.notes && activePatient.notes.length > 0 ? (
                  [...activePatient.notes].reverse().map((note, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 relative pl-4 md:pl-10 group">
                      <div className="hidden md:block absolute left-4 top-5 w-2 h-2 rounded-full bg-slate-300 group-hover:bg-blue-500"></div>
                      <div className="hidden md:block absolute left-[19px] top-8 bottom-[-16px] w-[1px] bg-slate-200 group-last:hidden"></div>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider
                            ${note.type === 'laboratorio' ? 'bg-purple-100 text-purple-700' : 
                              note.type === 'procedimiento' ? 'bg-orange-100 text-orange-700' : 
                              'bg-green-100 text-green-700'}`}>{note.type}</span>
                          <span className="text-[10px] text-slate-400">{new Date(note.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{note.author}</span>
                      </div>
                      <p className="text-slate-800 text-sm md:text-base whitespace-pre-wrap leading-relaxed">
                        {renderTextWithLinks(note.content)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 bg-white rounded-lg border border-dashed border-slate-300 text-slate-400">
                    <Stethoscope size={32} className="mx-auto mb-2 opacity-50"/>
                    <p className="text-sm">No hay notas registradas.</p>
                  </div>
                )}
              </div>
            </div>
            {activePatient.status === 'hospitalizado' && (
              <div className="lg:col-span-1 fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20 lg:static lg:bg-transparent lg:border-none lg:shadow-none lg:p-0">
                <div className="max-w-5xl mx-auto lg:bg-white lg:p-5 lg:rounded-xl lg:shadow-sm lg:border lg:border-slate-200 lg:sticky lg:top-24">
                  <h3 className="hidden lg:flex font-bold text-slate-800 mb-4 items-center gap-2"><Plus className="text-blue-600" size={18}/> Agregar Nota</h3>
                  <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
                    {['evolucion', 'laboratorio', 'procedimiento'].map(t => (
                      <button key={t} onClick={() => setNewNoteType(t)} className={`flex-1 text-xs py-2 px-3 rounded-lg capitalize border transition-all whitespace-nowrap active:scale-95
                          ${newNoteType === t ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-md' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>{t}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <textarea className="w-full border border-slate-300 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none min-h-[50px] lg:min-h-[120px] max-h-[150px] resize-none"
                        placeholder={`Nota de ${newNoteType}...`} value={newNote} onChange={e => setNewNote(e.target.value)}></textarea>
                    <button onClick={handleAddNote} disabled={!newNote.trim()} className="lg:w-full lg:mt-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold px-4 py-2 lg:py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-200 disabled:shadow-none h-auto">
                        <Save size={20} className="lg:w-4 lg:h-4" /> <span className="hidden lg:inline">Guardar</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col pb-safe">
      <Header />
      <FeedbackToast />
      <main className="flex-1 max-w-7xl mx-auto px-4 py-4 md:py-6 w-full">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4 md:mb-6">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input type="text" placeholder="Buscar paciente..." className="w-full pl-10 pr-4 py-3 md:py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none text-base shadow-sm"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button onClick={() => setShowDischarged(!showDischarged)} className={`flex-1 md:flex-none px-4 py-3 md:py-2 rounded-xl text-sm font-medium transition-colors border shadow-sm ${showDischarged ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'}`}>
              {showDischarged ? 'Ver Activos' : 'Ver Egreso'}
            </button>
            <button onClick={() => { const modal = document.getElementById('add-patient-modal'); if(modal) modal.showModal(); }} className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 md:py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md shadow-blue-200 active:scale-95 transition-transform">
              <Plus size={18} /> Ingreso
            </button>
          </div>
        </div>
        <div className="space-y-3 md:space-y-0">
            <div className="md:hidden space-y-3">
                {filteredPatients.length > 0 ? (
                    filteredPatients.map(patient => {
                        const los = calculateLOS(patient.admissionDate, patient.dischargeDate, patient.status);
                        return (
                            <div key={patient.id} onClick={() => { setSelectedPatientId(patient.id); setView('detail'); }} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 active:scale-[0.98] transition-transform">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded text-sm">{patient.bedNumber}</span>
                                        <ServiceBadge type={patient.serviceType} />
                                    </div>
                                    {patient.status === 'hospitalizado' ? (
                                        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${los > 7 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                            <Clock size={10}/> {los}d
                                        </div>
                                    ) : (
                                        <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">EGRESADO</span>
                                    )}
                                </div>
                                <h3 className="text-lg font-bold text-blue-700 mb-1">{patient.fullName}</h3>
                                <p className="text-sm text-slate-600 line-clamp-1 mb-2">{patient.diagnosis}</p>
                                <div className="flex items-center gap-3 text-xs text-slate-400">
                                    <span>{patient.age} años</span>
                                    <span>•</span>
                                    <span>Exp: {patient.recordNumber}</span>
                                </div>
                            </div>
                        )
                    })
                ) : (
                   <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                      <BedDouble size={40} className="mx-auto mb-2 opacity-20"/>
                      <p>No hay pacientes.</p>
                    </div> 
                )}
            </div>
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold w-20">Cama</th>
                    <th className="px-6 py-4 font-bold">Paciente</th>
                    <th className="px-6 py-4 font-bold">Diagnóstico</th>
                    <th className="px-6 py-4 font-bold text-center">Estancia</th>
                    <th className="px-6 py-4 font-bold text-center">Estado</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredPatients.length > 0 ? (
                    filteredPatients.map(patient => {
                        const los = calculateLOS(patient.admissionDate, patient.dischargeDate, patient.status);
                        return (
                        <tr key={patient.id} onClick={() => { setSelectedPatientId(patient.id); setView('detail'); }} className="hover:bg-blue-50/50 cursor-pointer transition-colors group">
                            <td className="px-6 py-4">
                            <div className="flex flex-col items-center gap-1">
                                <span className="font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded border border-slate-200 block text-center w-full">{patient.bedNumber}</span>
                                <ServiceBadge type={patient.serviceType} />
                            </div>
                            </td>
                            <td className="px-6 py-4">
                            <div>
                                <p className="font-bold text-blue-700 group-hover:text-blue-800">{patient.fullName}</p>
                                <p className="text-xs text-slate-500">Exp: {patient.recordNumber} • {patient.age} años</p>
                                <div className="flex gap-1 mt-1">
                                    {patient.medicalHistory?.dm && <span className="w-2 h-2 rounded-full bg-purple-500" title="DM"></span>}
                                    {patient.medicalHistory?.has && <span className="w-2 h-2 rounded-full bg-pink-500" title="HAS"></span>}
                                    {patient.medicalHistory?.allergies && <span className="w-2 h-2 rounded-full bg-red-500" title="Alergias"></span>}
                                </div>
                            </div>
                            </td>
                            <td className="px-6 py-4">
                            <p className="text-sm text-slate-700 truncate max-w-xs">{patient.diagnosis}</p>
                            <p className="text-xs text-slate-400 truncate max-w-xs">{patient.surgery}</p>
                            </td>
                            <td className="px-6 py-4 text-center">
                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border mb-1 ${los > 7 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                <Clock size={10}/> {los} días
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono block">Ingreso: {new Date(patient.admissionDate).toLocaleDateString()}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                            {patient.status === 'hospitalizado' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle size={12} /> Activo</span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><LogOut size={12} /> Egresado</span>
                            )}
                            </td>
                        </tr>
                        );
                    })
                    ) : (
                    <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2"><BedDouble size={40} className="opacity-20"/><p>No se encontraron pacientes.</p></div>
                        </td>
                    </tr>
                    )}
                </tbody>
                </table>
            </div>
            </div>
        </div>
        <div className="mt-6 flex justify-center md:justify-end pb-12 md:pb-0">
            <button onClick={downloadCSV} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 hover:underline decoration-slate-300 py-4"><Download size={14} /> Descargar censo (.csv)</button>
        </div>
      </main>
      <dialog id="add-patient-modal" className="modal p-0 rounded-xl shadow-2xl backdrop:bg-slate-900/60 w-full max-w-2xl open:animate-fade-in m-4 md:m-auto h-[85vh] md:h-auto">
        <div className="bg-white p-5 md:p-6 h-full overflow-y-auto">
          <div className="flex justify-between items-center mb-6 sticky top-0 bg-white z-10 pb-2 border-b border-slate-50">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Plus className="text-blue-600"/> Ingreso Paciente</h3>
            <button onClick={() => (document.getElementById('add-patient-modal')).close()} className="text-slate-400 hover:text-slate-600 p-2">✕</button>
          </div>
          <form onSubmit={handleAddPatient} className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
            <div className="md:col-span-2 flex gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer p-1">
                    <input type="radio" name="serviceType" checked={newPatientForm.serviceType === 'HO'} onChange={() => setNewPatientForm({...newPatientForm, serviceType: 'HO'})} className="text-blue-600 focus:ring-blue-500 w-5 h-5" />
                    <span className="text-sm font-bold text-slate-700">Urología (HO)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer p-1">
                    <input type="radio" name="serviceType" checked={newPatientForm.serviceType === 'IC'} onChange={() => setNewPatientForm({...newPatientForm, serviceType: 'IC'})} className="text-amber-600 focus:ring-amber-500 w-5 h-5" />
                    <span className="text-sm font-bold text-slate-700">Interconsulta (IC)</span>
                </label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre Completo</label>
              <input required type="text" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={newPatientForm.fullName} onChange={e => setNewPatientForm({...newPatientForm, fullName: e.target.value})} placeholder="Apellidos y Nombres" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cama</label>
              <input required type="text" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={newPatientForm.bedNumber} onChange={e => setNewPatientForm({...newPatientForm, bedNumber: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Expediente</label>
              <input required type="text" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={newPatientForm.recordNumber} onChange={e => setNewPatientForm({...newPatientForm, recordNumber: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">F. Nacimiento</label>
              <input required type="date" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={newPatientForm.dob} onChange={e => setNewPatientForm({...newPatientForm, dob: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha Ingreso</label>
              <input required type="datetime-local" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={newPatientForm.admissionDate} onChange={e => setNewPatientForm({...newPatientForm, admissionDate: e.target.value})} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Diagnóstico de Ingreso</label>
              <input required type="text" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={newPatientForm.diagnosis} onChange={e => setNewPatientForm({...newPatientForm, diagnosis: e.target.value})} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cirugía Programada / Realizada</label>
              <input type="text" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={newPatientForm.surgery} onChange={e => setNewPatientForm({...newPatientForm, surgery: e.target.value})} />
            </div>
             <div className="md:col-span-2 mt-2 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><ClipboardList size={16}/> Antecedentes</h4>
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-3">
                         <label className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 cursor-pointer active:bg-slate-100">
                            <input type="checkbox" checked={newPatientForm.medicalHistory?.dm} 
                                onChange={e => setNewPatientForm({
                                    ...newPatientForm, 
                                    medicalHistory: { ...newPatientForm.medicalHistory, dm: e.target.checked }
                                })} 
                                className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500" />
                            <span className="text-sm font-medium text-slate-700">Diabetes</span>
                        </label>
                        <label className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 cursor-pointer active:bg-slate-100">
                            <input type="checkbox" checked={newPatientForm.medicalHistory?.has} 
                                onChange={e => setNewPatientForm({
                                    ...newPatientForm, 
                                    medicalHistory: { ...newPatientForm.medicalHistory, has: e.target.checked }
                                })} 
                                className="w-5 h-5 text-pink-600 rounded focus:ring-pink-500" />
                            <span className="text-sm font-medium text-slate-700">Hipertensión</span>
                        </label>
                    </div>
                    <div className="flex flex-col gap-3">
                        <div>
                            <label className="block text-xs font-bold text-red-500 uppercase mb-1">Alergias</label>
                            <input type="text" placeholder="Especifique..." className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:ring-red-500"
                                value={newPatientForm.medicalHistory?.allergies}
                                onChange={e => setNewPatientForm({
                                    ...newPatientForm,
                                    medicalHistory: { ...newPatientForm.medicalHistory, allergies: e.target.value }
                                })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Otros</label>
                            <input type="text" placeholder="Otros..." className="w-full border rounded-lg px-3 py-2 text-sm"
                                value={newPatientForm.medicalHistory?.others}
                                onChange={e => setNewPatientForm({
                                    ...newPatientForm,
                                    medicalHistory: { ...newPatientForm.medicalHistory, others: e.target.value }
                                })}
                            />
                        </div>
                    </div>
                </div>
            </div>
            <div className="md:col-span-2 flex gap-3 mt-6 pt-4 border-t sticky bottom-0 bg-white">
              <button type="button" onClick={() => (document.getElementById('add-patient-modal')).close()} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium">Cancelar</button>
              <button type="submit" className="flex-1 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200">Guardar</button>
            </div>
          </form>
        </div>
      </dialog>
       {editPatientForm && (
        <dialog id="edit-patient-modal" className="modal p-0 rounded-xl shadow-2xl backdrop:bg-slate-900/60 w-full max-w-2xl open:animate-fade-in m-4 md:m-auto h-[85vh] md:h-auto">
            <div className="bg-white p-5 md:p-6 h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-white z-10 pb-2 border-b border-slate-50">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Edit2 className="text-blue-600"/> Editar Ficha</h3>
                <button onClick={() => setEditPatientForm(null)} className="text-slate-400 hover:text-slate-600 p-2">✕</button>
            </div>
            <form onSubmit={handleEditPatient} className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                <div className="md:col-span-2 flex gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <label className="flex items-center gap-2 cursor-pointer p-1">
                        <input type="radio" name="editServiceType" checked={editPatientForm.serviceType === 'HO'} onChange={() => setEditPatientForm({...editPatientForm, serviceType: 'HO'})} className="text-blue-600 focus:ring-blue-500 w-5 h-5" />
                        <span className="text-sm font-bold text-slate-700">Urología (HO)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer p-1">
                        <input type="radio" name="editServiceType" checked={editPatientForm.serviceType === 'IC'} onChange={() => setEditPatientForm({...editPatientForm, serviceType: 'IC'})} className="text-amber-600 focus:ring-amber-500 w-5 h-5" />
                        <span className="text-sm font-bold text-slate-700">Interconsulta (IC)</span>
                    </label>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre Completo</label>
                    <input required type="text" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={editPatientForm.fullName} onChange={e => setEditPatientForm({...editPatientForm, fullName: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cama</label>
                    <input required type="text" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={editPatientForm.bedNumber} onChange={e => setEditPatientForm({...editPatientForm, bedNumber: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Expediente</label>
                    <input required type="text" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={editPatientForm.recordNumber} onChange={e => setEditPatientForm({...editPatientForm, recordNumber: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">F. Nacimiento</label>
                    <input required type="date" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={editPatientForm.dob} onChange={e => setEditPatientForm({...editPatientForm, dob: e.target.value})} />
                </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fecha Ingreso</label>
                   <input disabled type="text" className="w-full border rounded-lg px-3 py-3 md:py-2 bg-slate-100 text-slate-500" value={new Date(editPatientForm.admissionDate || '').toLocaleString()} />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Diagnóstico</label>
                    <input required type="text" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={editPatientForm.diagnosis} onChange={e => setEditPatientForm({...editPatientForm, diagnosis: e.target.value})} />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cirugía</label>
                    <input type="text" className="w-full border rounded-lg px-3 py-3 md:py-2 text-base" value={editPatientForm.surgery} onChange={e => setEditPatientForm({...editPatientForm, surgery: e.target.value})} />
                </div>
                <div className="md:col-span-2 mt-2 pt-4 border-t border-slate-100">
                    <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><ClipboardList size={16}/> Antecedentes</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-3">
                            <label className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 cursor-pointer active:bg-slate-100">
                                <input type="checkbox" checked={editPatientForm.medicalHistory?.dm} 
                                    onChange={e => setEditPatientForm({
                                        ...editPatientForm, 
                                        medicalHistory: { ...editPatientForm.medicalHistory, dm: e.target.checked }
                                    })} 
                                    className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500" />
                                <span className="text-sm font-medium text-slate-700">Diabetes</span>
                            </label>
                            <label className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 cursor-pointer active:bg-slate-100">
                                <input type="checkbox" checked={editPatientForm.medicalHistory?.has} 
                                    onChange={e => setEditPatientForm({
                                        ...editPatientForm, 
                                        medicalHistory: { ...editPatientForm.medicalHistory, has: e.target.checked }
                                    })} 
                                    className="w-5 h-5 text-pink-600 rounded focus:ring-pink-500" />
                                <span className="text-sm font-medium text-slate-700">Hipertensión</span>
                            </label>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className="block text-xs font-bold text-red-500 uppercase mb-1">Alergias</label>
                                <input type="text" className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:ring-red-500"
                                    value={editPatientForm.medicalHistory?.allergies}
                                    onChange={e => setEditPatientForm({
                                        ...editPatientForm, 
                                        medicalHistory: { ...editPatientForm.medicalHistory, allergies: e.target.value }
                                    })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Otros</label>
                                <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={editPatientForm.medicalHistory?.others}
                                    onChange={e => setEditPatientForm({
                                        ...editPatientForm, 
                                        medicalHistory: { ...editPatientForm.medicalHistory, others: e.target.value }
                                    })}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="md:col-span-2 flex gap-3 mt-6 pt-4 border-t sticky bottom-0 bg-white">
                    <button type="button" onClick={() => setEditPatientForm(null)} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium">Cancelar</button>
                    <button type="submit" className="flex-1 px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200">Guardar</button>
                </div>
            </form>
            </div>
        </dialog>
       )}
    </div>
  );
}