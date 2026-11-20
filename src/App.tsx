import {LogOut, RefreshCw, User} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
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

interface ServerCapabilities {
  persistent: boolean;
  realtime: boolean;
}

interface RoleCacheSnapshot {
  patientDossiers?: MedicalDossier[];
  patientConsultations?: ConsultationSheet[];
  patientHistory?: HistoryEvent[];
  doctorDossiers?: MedicalDossier[];
  doctorConsultations?: ConsultationSheet[];
  adminDoctors?: DoctorRecord[];
}

function readRoleCache(userId: string): RoleCacheSnapshot {
  try {
    const raw = localStorage.getItem(`rayen_med_cache_${userId}`);
    if (!raw) return {};
    return JSON.parse(raw) as RoleCacheSnapshot;
  } catch {
    return {};
  }
}

function writeRoleCache(userId: string, patch: RoleCacheSnapshot) {
  try {
    const prev = readRoleCache(userId);
    localStorage.setItem(
      `rayen_med_cache_${userId}`,
      JSON.stringify({...prev, ...patch}),
    );
  } catch {
    // Ignore storage quota errors
  }
}

function mergeDossiersMonotonic(
  current: MedicalDossier[],
  incoming: MedicalDossier[],
): MedicalDossier[] {
  const map = new Map<string, MedicalDossier>();
  for (const d of current) {
    map.set(d.id, d);
  }
  for (const inc of incoming) {
    const prev = map.get(inc.id);
    if (!prev) {
      map.set(inc.id, inc);
      continue;
    }
    const respMap = new Map(prev.responses.map((r) => [r.id, r]));
    for (const r of inc.responses) {
      respMap.set(r.id, r);
    }
    const mergedResponses = Array.from(respMap.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const incNewer =
      new Date(inc.updatedAt).getTime() >= new Date(prev.updatedAt).getTime();
    map.set(inc.id, {
      ...(incNewer ? inc : prev),
      responses: mergedResponses,
      status: incNewer ? inc.status : prev.status,
      updatedAt: incNewer ? inc.updatedAt : prev.updatedAt,
    });
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function mergeByIdDesc<T extends {id: string; createdAt: string}>(
  current: T[],
  incoming: T[],
): T[] {
  const map = new Map<string, T>();
  for (const item of current) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function mergeHistoryDesc(
  current: HistoryEvent[],
  incoming: HistoryEvent[],
): HistoryEvent[] {
  const map = new Map<string, HistoryEvent>();
  for (const item of current) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<AppTab>('atlas3d');
  const [serverCaps, setServerCaps] = useState<ServerCapabilities>({
    persistent: true,
    realtime: false,
  });
  const [capsReady, setCapsReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Stability guards: prevent stale async overwrites & redundant React re-renders
  const lastDigestRef = useRef<Record<string, string>>({});
  const mutationEpochRef = useRef(0);
  const deletedDoctorIdsRef = useRef<Set<string>>(new Set());
  const capsRef = useRef<ServerCapabilities>({persistent: true, realtime: false});
  const inFlightRef = useRef<Promise<void> | null>(null);

  const setIfChanged = useCallback(
    <T,>(key: string, value: T, setter: (v: T) => void) => {
      const digest = JSON.stringify(value);
      if (lastDigestRef.current[key] === digest) {
        return;
      }
      lastDigestRef.current[key] = digest;
      setter(value);
    },
    [],
  );

  const loadRoleData = useCallback(
    async (currentUser: AuthUser, forcePersistentMode?: boolean) => {
      if (inFlightRef.current) {
        return inFlightRef.current;
      }

      const startEpoch = mutationEpochRef.current;
      const persistent =
        forcePersistentMode !== undefined
          ? forcePersistentMode
          : capsRef.current.persistent;

      const task = (async () => {
        try {
          if (currentUser.role === 'patient') {
            const [dosRes, conRes, histRes] = await Promise.all([
              api.getMyDossiers(),
              api.getMyConsultations(),
              api.getMyHistory(),
            ]);
            if (mutationEpochRef.current !== startEpoch) return;

            if (!persistent) {
              const cached = readRoleCache(currentUser.id);
              const nextDossiers = mergeDossiersMonotonic(
                cached.patientDossiers || [],
                dosRes.dossiers,
              );
              const nextConsultations = mergeByIdDesc(
                cached.patientConsultations || [],
                conRes.consultations,
              );
              const nextHistory = mergeHistoryDesc(
                cached.patientHistory || [],
                histRes.history,
              );
              writeRoleCache(currentUser.id, {
                patientDossiers: nextDossiers,
                patientConsultations: nextConsultations,
                patientHistory: nextHistory,
              });
              setIfChanged('patientDossiers', nextDossiers, setPatientDossiers);
              setIfChanged(
                'patientConsultations',
                nextConsultations,
                setPatientConsultations,
              );
              setIfChanged('patientHistory', nextHistory, setPatientHistory);
            } else {
              setIfChanged('patientDossiers', dosRes.dossiers, setPatientDossiers);
              setIfChanged(
                'patientConsultations',
                conRes.consultations,
                setPatientConsultations,
              );
              setIfChanged('patientHistory', histRes.history, setPatientHistory);
            }
          } else if (currentUser.role === 'doctor') {
            const [dosRes, conRes] = await Promise.all([
              api.getDoctorDossiers(),
              api.getDoctorConsultations(),
            ]);
            if (mutationEpochRef.current !== startEpoch) return;

            if (!persistent) {
              const cached = readRoleCache(currentUser.id);
              const nextDossiers = mergeDossiersMonotonic(
                cached.doctorDossiers || [],
                dosRes.dossiers,
              );
              const nextConsultations = mergeByIdDesc(
                cached.doctorConsultations || [],
                conRes.consultations,
              );
              writeRoleCache(currentUser.id, {
                doctorDossiers: nextDossiers,
                doctorConsultations: nextConsultations,
              });
              setIfChanged('doctorDossiers', nextDossiers, setDoctorDossiers);
              setIfChanged(
                'doctorConsultations',
                nextConsultations,
                setDoctorConsultations,
              );
            } else {
              setIfChanged('doctorDossiers', dosRes.dossiers, setDoctorDossiers);
              setIfChanged(
                'doctorConsultations',
                conRes.consultations,
                setDoctorConsultations,
              );
            }
          } else if (currentUser.role === 'admin') {
            const [docRes, ovRes] = await Promise.all([
              api.getAdminDoctors(),
              api.getAdminOverview(),
            ]);
            if (mutationEpochRef.current !== startEpoch) return;

            if (!persistent) {
              const cached = readRoleCache(currentUser.id);
              const docMap = new Map<string, DoctorRecord>();
              for (const d of cached.adminDoctors || []) {
                if (!deletedDoctorIdsRef.current.has(d.id)) {
                  docMap.set(d.id, d);
                }
              }
              for (const d of docRes.doctors) {
                if (!deletedDoctorIdsRef.current.has(d.id)) {
                  docMap.set(d.id, d);
                }
              }
              const nextDoctors = Array.from(docMap.values());
              writeRoleCache(currentUser.id, {adminDoctors: nextDoctors});
              setIfChanged('adminDoctors', nextDoctors, setAdminDoctors);
              setIfChanged(
                'adminOverview',
                {
                  totalDoctors: Math.max(ovRes.totalDoctors, nextDoctors.length),
                  activeDoctors: Math.max(
                    ovRes.activeDoctors,
                    nextDoctors.filter((d) => d.status === 'active').length,
                  ),
                  totalPatients: ovRes.totalPatients,
                  totalDossiers: ovRes.totalDossiers,
                  totalConsultations: ovRes.totalConsultations,
                },
                setAdminOverview,
              );
            } else {
              setIfChanged('adminDoctors', docRes.doctors, setAdminDoctors);
              setIfChanged('adminOverview', ovRes, setAdminOverview);
            }
          }
        } catch {
          // Ignore transient refresh errors without wiping displayed state
        } finally {
          inFlightRef.current = null;
        }
      })();

      inFlightRef.current = task;
      return task;
    },
    [setIfChanged],
  );

  // Discover server capabilities & restore active session once
  useEffect(() => {
    let active = true;
    (async () => {
      let caps: ServerCapabilities = {persistent: true, realtime: false};
      try {
        const health = await api.health();
        caps = {
          persistent: Boolean(health.persistent),
          realtime: Boolean(health.realtime),
        };
      } catch {
        caps = {persistent: true, realtime: false};
      }
      if (!active) return;
      capsRef.current = caps;
      setServerCaps(caps);
      setCapsReady(true);

      const token = getStoredToken();
      if (!token) return;
      try {
        const res = await api.me();
        if (!active) return;
        setUser(res.user);
        await loadRoleData(res.user, caps.persistent);
      } catch {
        if (!active) return;
        setStoredToken(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadRoleData]);

  // Capability-aware synchronization:
  // - Single Node server (realtime=true): SSE push only + debounced window focus (NO 3.5s polling loop!)
  // - Persistent serverless with KV (realtime=false, persistent=true): gentle 8s visible poll + focus
  // - Ephemeral serverless without KV (persistent=false): NO background polling (eliminates cold-lambda flicker!)
  useEffect(() => {
    if (!user || !capsReady) return;
    const token = getStoredToken();
    let eventSource: EventSource | null = null;
    let intervalId: number | null = null;
    let focusTimer: number | null = null;

    if (serverCaps.realtime && token && typeof EventSource !== 'undefined') {
      eventSource = new EventSource(
        `/api/events?token=${encodeURIComponent(token)}`,
      );
      eventSource.addEventListener('sync', () => {
        void loadRoleData(user);
      });
    } else if (serverCaps.persistent) {
      intervalId = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          void loadRoleData(user);
        }
      }, 8000);
    }

    const onFocus = () => {
      if (!serverCaps.persistent) return;
      if (focusTimer) window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        void loadRoleData(user);
      }, 400);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      if (eventSource) eventSource.close();
      if (intervalId !== null) window.clearInterval(intervalId);
      if (focusTimer !== null) window.clearTimeout(focusTimer);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, capsReady, serverCaps, loadRoleData]);

  const handleManualRefresh = async () => {
    if (!user || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await loadRoleData(user);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Immediate confirmed mutation handlers so submitted data never disappears
  const handlePatientDossierCreated = useCallback(
    (newDossier: MedicalDossier) => {
      if (!user) return;
      mutationEpochRef.current += 1;
      const newEvt: HistoryEvent = {
        id: `evt-dossier-${newDossier.id}`,
        type: 'dossier',
        date: newDossier.createdAt,
        category: newDossier.category,
        title: `Dossier soumis (${newDossier.referenceCode})`,
        summary:
          newDossier.symptoms ||
          newDossier.healthDetails ||
          (newDossier.mriImages.length > 0
            ? `${newDossier.mriImages.length} image(s) IRM/Radio transmise(s)`
            : newDossier.videoUrl
              ? 'Vidéo explicative transmise'
              : 'Documents médicaux transmis'),
        dossier: newDossier,
      };
      setPatientDossiers((prev) => {
        const next = mergeDossiersMonotonic(prev, [newDossier]);
        lastDigestRef.current.patientDossiers = JSON.stringify(next);
        if (!capsRef.current.persistent) {
          writeRoleCache(user.id, {patientDossiers: next});
        }
        return next;
      });
      setPatientHistory((prev) => {
        const next = mergeHistoryDesc(prev, [newEvt]);
        lastDigestRef.current.patientHistory = JSON.stringify(next);
        if (!capsRef.current.persistent) {
          writeRoleCache(user.id, {patientHistory: next});
        }
        return next;
      });
    },
    [user],
  );

  const handleDoctorDossierUpdated = useCallback(
    (updatedDossier: MedicalDossier) => {
      if (!user) return;
      mutationEpochRef.current += 1;
      setDoctorDossiers((prev) => {
        const next = mergeDossiersMonotonic(prev, [updatedDossier]);
        lastDigestRef.current.doctorDossiers = JSON.stringify(next);
        if (!capsRef.current.persistent) {
          writeRoleCache(user.id, {doctorDossiers: next});
        }
        return next;
      });
    },
    [user],
  );

  const handleDoctorConsultationCreated = useCallback(
    (sheet: ConsultationSheet) => {
      if (!user) return;
      mutationEpochRef.current += 1;
      setDoctorConsultations((prev) => {
        const next = mergeByIdDesc(prev, [sheet]);
        lastDigestRef.current.doctorConsultations = JSON.stringify(next);
        if (!capsRef.current.persistent) {
          writeRoleCache(user.id, {doctorConsultations: next});
        }
        return next;
      });
      if (sheet.dossierId) {
        setDoctorDossiers((prev) => {
          const next = prev.map((d) =>
            d.id === sheet.dossierId
              ? {
                  ...d,
                  status: 'consultation_requise' as const,
                  updatedAt: sheet.createdAt,
                }
              : d,
          );
          lastDigestRef.current.doctorDossiers = JSON.stringify(next);
          if (!capsRef.current.persistent) {
            writeRoleCache(user.id, {doctorDossiers: next});
          }
          return next;
        });
      }
    },
    [user],
  );

  const handleAdminDoctorCreated = useCallback(
    (doctor: DoctorRecord) => {
      if (!user) return;
      mutationEpochRef.current += 1;
      deletedDoctorIdsRef.current.delete(doctor.id);
      setAdminDoctors((prev) => {
        const next = [...prev.filter((d) => d.id !== doctor.id), doctor];
        lastDigestRef.current.adminDoctors = JSON.stringify(next);
        if (!capsRef.current.persistent) {
          writeRoleCache(user.id, {adminDoctors: next});
        }
        return next;
      });
    },
    [user],
  );

  const handleAdminDoctorUpdated = useCallback(
    (doctor: DoctorRecord) => {
      if (!user) return;
      mutationEpochRef.current += 1;
      setAdminDoctors((prev) => {
        const next = prev.map((d) => (d.id === doctor.id ? doctor : d));
        lastDigestRef.current.adminDoctors = JSON.stringify(next);
        if (!capsRef.current.persistent) {
          writeRoleCache(user.id, {adminDoctors: next});
        }
        return next;
      });
    },
    [user],
  );

  const handleAdminDoctorDeleted = useCallback(
    (doctorId: string) => {
      if (!user) return;
      mutationEpochRef.current += 1;
      deletedDoctorIdsRef.current.add(doctorId);
      setAdminDoctors((prev) => {
        const next = prev.filter((d) => d.id !== doctorId);
        lastDigestRef.current.adminDoctors = JSON.stringify(next);
        if (!capsRef.current.persistent) {
          writeRoleCache(user.id, {adminDoctors: next});
        }
        return next;
      });
    },
    [user],
  );

  const handleAuthSuccess = (loggedInUser: AuthUser) => {
    lastDigestRef.current = {};
    deletedDoctorIdsRef.current.clear();
    setUser(loggedInUser);
    void loadRoleData(loggedInUser);
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
    lastDigestRef.current = {};
    deletedDoctorIdsRef.current.clear();
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

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  title="Actualiser les dossiers"
                  className="p-2 text-slate-500 hover:text-[#0B57D0] hover:bg-blue-50 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#0B57D0]' : ''}`}
                  />
                </button>

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
              onDossierCreated={handlePatientDossierCreated}
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
              onDossierUpdated={handleDoctorDossierUpdated}
              onConsultationCreated={handleDoctorConsultationCreated}
              onRefresh={() => loadRoleData(user)}
            />
          )}

        {user?.role === 'admin' && activeTab === 'admin' && (
          <AdminWorkspace
            doctors={adminDoctors}
            overview={adminOverview}
            onDoctorCreated={handleAdminDoctorCreated}
            onDoctorUpdated={handleAdminDoctorUpdated}
            onDoctorDeleted={handleAdminDoctorDeleted}
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
