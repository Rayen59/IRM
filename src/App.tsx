import {LogOut, User} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import {AdminWorkspace} from './components/AdminWorkspace';
import {Anatomy3DViewer} from './components/Anatomy3DViewer';
import {AuthModal} from './components/AuthModal';
import {DoctorWorkspace} from './components/DoctorWorkspace';
import {PatientWorkspace} from './components/PatientWorkspace';
import {api, getStoredToken, setStoredToken} from './lib/api';
import type {
  AuthUser,
  ConsultationSheet,
  DoctorRecord,
  HistoryEvent,
  MedicalCategoryId,
  MedicalDossier,
} from './types/medical';

type AppTab =
  | 'atlas3d'
  | 'patient_dossiers'
  | 'patient_history'
  | 'patient_consultations'
  | 'doctor_dossiers'
  | 'doctor_consultations'
  | 'admin';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<AppTab>('atlas3d');

  // 3D Viewer & Dossier prefill state
  const [selectedCategory, setSelectedCategory] =
    useState<MedicalCategoryId>('Cardiologie');
  const [preselectedZone, setPreselectedZone] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  // Patient Data
  const [patientDossiers, setPatientDossiers] = useState<MedicalDossier[]>([]);
  const [patientConsultations, setPatientConsultations] = useState<
    ConsultationSheet[]
  >([]);
  const [patientHistory, setPatientHistory] = useState<HistoryEvent[]>([]);

  // Doctor Data
  const [doctorDossiers, setDoctorDossiers] = useState<MedicalDossier[]>([]);
  const [doctorConsultations, setDoctorConsultations] = useState<
    ConsultationSheet[]
  >([]);

  // Super Admin Data
  const [adminDoctors, setAdminDoctors] = useState<DoctorRecord[]>([]);
  const [adminOverview, setAdminOverview] = useState({
    totalDoctors: 0,
    activeDoctors: 0,
    totalPatients: 0,
    totalDossiers: 0,
    totalConsultations: 0,
  });

  const loadRoleData = useCallback(async (currentUser: AuthUser) => {
    try {
      if (currentUser.role === 'patient') {
        const [dosRes, conRes, histRes] = await Promise.all([
          api.getMyDossiers(),
          api.getMyConsultations(),
          api.getMyHistory(),
        ]);
        setPatientDossiers(dosRes.dossiers);
        setPatientConsultations(conRes.consultations);
        setPatientHistory(histRes.history);
      } else if (currentUser.role === 'doctor') {
        const [dosRes, conRes] = await Promise.all([
          api.getDoctorDossiers(),
          api.getDoctorConsultations(),
        ]);
        setDoctorDossiers(dosRes.dossiers);
        setDoctorConsultations(conRes.consultations);
      } else if (currentUser.role === 'admin') {
        const [docRes, ovRes] = await Promise.all([
          api.getAdminDoctors(),
          api.getAdminOverview(),
        ]);
        setAdminDoctors(docRes.doctors);
        setAdminOverview(ovRes);
      }
    } catch {
      // Ignore transient refresh errors
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    api
      .me()
      .then((res) => {
        setUser(res.user);
        loadRoleData(res.user);
      })
      .catch(() => {
        setStoredToken(null);
      });
  }, [loadRoleData]);

  const handleAuthSuccess = (loggedInUser: AuthUser) => {
    setUser(loggedInUser);
    loadRoleData(loggedInUser);
    if (loggedInUser.role === 'admin') {
      setActiveTab('admin');
    } else if (loggedInUser.role === 'doctor') {
      setActiveTab('doctor_dossiers');
    } else {
      setActiveTab('patient_dossiers');
    }
  };

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    setStoredToken(null);
    setUser(null);
    setPatientDossiers([]);
    setPatientConsultations([]);
    setPatientHistory([]);
    setDoctorDossiers([]);
    setDoctorConsultations([]);
    setAdminDoctors([]);
    setActiveTab('atlas3d');
  };

  const handleSelectZoneForDossier = (
    category: MedicalCategoryId,
    zoneName: string,
  ) => {
    setSelectedCategory(category);
    setPreselectedZone(zoneName);
    if (!user) {
      setAuthTab('register');
      setAuthModalOpen(true);
      return;
    }
    if (user.role === 'patient') {
      setActiveTab('patient_dossiers');
      setComposerOpen(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FB]">
      {/* Top Bar matching reference screenshots + Dr.Med Rayen Bouazizi branding */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('atlas3d')}
            className="flex items-center gap-3 cursor-pointer shrink-0"
          >
            <div className="px-2.5 py-1 bg-[#0B57D0] text-white font-display font-bold text-sm rounded-lg tracking-tight">
              DR
            </div>
            <span className="font-display font-bold text-base sm:text-lg text-slate-900 whitespace-nowrap">
              Dr.Med Rayen Bouazizi
            </span>
          </button>

          <div className="flex items-center gap-3 shrink-0">
            {!user ? (
              <button
                type="button"
                onClick={() => {
                  setAuthTab('login');
                  setAuthModalOpen(true);
                }}
                className="px-4 py-2 bg-[#0B57D0] hover:bg-[#0842A0] text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <User className="w-4 h-4" />
                Connexion
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-full">
                  <span className="w-6 h-6 rounded-full bg-[#0B57D0] text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xs font-bold text-slate-800 max-w-[160px] truncate">
                    {user.name}
                  </span>
                  {user.role === 'doctor' && user.category && (
                    <span className="hidden sm:inline text-[11px] font-semibold text-[#0B57D0]">
                      · {user.category}
                    </span>
                  )}
                  {user.role === 'admin' && (
                    <span className="hidden sm:inline text-[11px] font-semibold text-red-600">
                      · Super Admin
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  title="Déconnexion"
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sub-navigation Tabs Strip matching Screenshots 2 & 3 */}
        <div className="bg-white border-t border-slate-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto py-2">
            <button
              type="button"
              onClick={() => setActiveTab('atlas3d')}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === 'atlas3d'
                  ? 'bg-slate-100 text-[#0B57D0]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Modèles 3D
            </button>

            {user?.role === 'patient' && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('patient_dossiers')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    activeTab === 'patient_dossiers'
                      ? 'bg-slate-100 text-[#0B57D0]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Mes Dossiers
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('patient_history')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    activeTab === 'patient_history'
                      ? 'bg-slate-100 text-[#0B57D0]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Historique Médical
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('patient_consultations')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    activeTab === 'patient_consultations'
                      ? 'bg-slate-100 text-[#0B57D0]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Fiches Consultation
                </button>
              </>
            )}

            {user?.role === 'doctor' && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('doctor_dossiers')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    activeTab === 'doctor_dossiers'
                      ? 'bg-slate-100 text-[#0B57D0]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Dossiers Catégorie
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('doctor_consultations')}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    activeTab === 'doctor_consultations'
                      ? 'bg-slate-100 text-[#0B57D0]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  Consultations Réelles
                </button>
              </>
            )}

            {user?.role === 'admin' && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-red-50 text-red-600'
                    : 'text-red-600 hover:bg-red-50'
                }`}
              >
                Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'atlas3d' && (
          <Anatomy3DViewer
            selectedCategory={selectedCategory}
            onSelectCategory={(cat) => setSelectedCategory(cat)}
            onSelectZoneForDossier={handleSelectZoneForDossier}
          />
        )}

        {user?.role === 'patient' &&
          (activeTab === 'patient_dossiers' ||
            activeTab === 'patient_history' ||
            activeTab === 'patient_consultations') && (
            <PatientWorkspace
              activeSection={
                activeTab === 'patient_dossiers'
                  ? 'dossiers'
                  : activeTab === 'patient_history'
                    ? 'history'
                    : 'consultations'
              }
              dossiers={patientDossiers}
              consultations={patientConsultations}
              history={patientHistory}
              composerOpen={composerOpen}
              preselectedCategory={selectedCategory}
              preselectedZone={preselectedZone}
              onOpenComposer={() => setComposerOpen(true)}
              onCloseComposer={() => setComposerOpen(false)}
              onRefresh={() => loadRoleData(user)}
            />
          )}

        {user?.role === 'doctor' &&
          (activeTab === 'doctor_dossiers' ||
            activeTab === 'doctor_consultations') && (
            <DoctorWorkspace
              user={user}
              activeSection={
                activeTab === 'doctor_dossiers' ? 'dossiers' : 'consultations'
              }
              dossiers={doctorDossiers}
              consultations={doctorConsultations}
              onRefresh={() => loadRoleData(user)}
            />
          )}

        {user?.role === 'admin' && activeTab === 'admin' && (
          <AdminWorkspace
            doctors={adminDoctors}
            overview={adminOverview}
            onRefresh={() => loadRoleData(user)}
          />
        )}
      </main>

      <AuthModal
        open={authModalOpen}
        initialTab={authTab}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}
