import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Shield,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {useState, type FormEvent} from 'react';
import {api} from '../lib/api';
import {
  MEDICAL_CATEGORIES,
  type DoctorRecord,
  type MedicalCategoryId,
} from '../types/medical';

interface AdminWorkspaceProps {
  doctors: DoctorRecord[];
  overview: {
    totalDoctors: number;
    activeDoctors: number;
    totalPatients: number;
    totalDossiers: number;
    totalConsultations: number;
  };
  onDoctorCreated: (doctor: DoctorRecord) => void;
  onDoctorUpdated: (doctor: DoctorRecord) => void;
  onDoctorDeleted: (doctorId: string) => void;
  onRefresh: () => Promise<void>;
}

export function AdminWorkspace({
  doctors,
  overview,
  onDoctorCreated,
  onDoctorUpdated,
  onDoctorDeleted,
  onRefresh,
}: AdminWorkspaceProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MedicalCategoryId>('Cardiologie');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const generateCredentials = () => {
    const slug = (name || 'medecin')
      .toLowerCase()
      .replace(/^dr\.?\s*/i, '')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/(^\.|\.$)/g, '') || 'medecin';
    const randNum = Math.floor(100 + Math.random() * 900);
    setEmail(`${slug}.${randNum}@clinique-rayen.med`);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pwd = 'Med';
    for (let i = 0; i < 8; i++) {
      pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    setPassword(pwd);
  };

  const handleCreateDoctor = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setCreating(true);
    try {
      const res = await api.createDoctor({
        name: name.startsWith('Dr.') ? name : `Dr. ${name}`,
        category,
        email,
        password,
      });
      onDoctorCreated(res.doctor);
      setSuccessMsg(
        `Compte créé pour ${res.doctor.name} (${res.doctor.category}). Ses identifiants sont enregistrés ci-dessous pour envoi et contrôle.`,
      );
      setName('');
      setEmail('');
      setPassword('');
      void onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (doc: DoctorRecord) => {
    const res = await api.updateDoctor(doc.id, {
      status: doc.status === 'active' ? 'suspended' : 'active',
    });
    onDoctorUpdated(res.doctor);
    void onRefresh();
  };

  const handleDeleteDoctor = async (doc: DoctorRecord) => {
    await api.deleteDoctor(doc.id);
    onDoctorDeleted(doc.id);
    void onRefresh();
  };

  const copyCredentials = (doc: DoctorRecord) => {
    const text = `Accès Médecin — Dr.Med Rayen Bouazizi\nNom : ${doc.name}\nCatégorie : ${doc.category}\nE-mail : ${doc.email}\nMot de passe : ${doc.plainPassword || ''}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(doc.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Super Admin Status Banner matching Screenshot 2 */}
      <div className="bg-[#EEF4FF] border border-blue-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0B57D0] text-white flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              Mode Super Administrateur actif
            </p>
            <p className="text-xs text-slate-600 mt-0.5 max-w-xl">
              Créez des comptes médecins par spécialité, générez leurs identifiants (e-mail et mot de passe) et conservez le contrôle total de leurs accès.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[#DBEAFE] text-[#0B57D0] rounded-xl px-4 py-2 text-center">
            <p className="font-mono-tabular text-base font-bold">{overview.totalDoctors}</p>
            <p className="text-[11px] font-semibold">Médecins</p>
          </div>
          <div className="bg-white border border-blue-200 text-slate-800 rounded-xl px-4 py-2 text-center">
            <p className="font-mono-tabular text-base font-bold">{overview.totalPatients}</p>
            <p className="text-[11px] font-semibold">Patients</p>
          </div>
          <div className="bg-white border border-blue-200 text-slate-800 rounded-xl px-4 py-2 text-center">
            <p className="font-mono-tabular text-base font-bold">{overview.totalDossiers}</p>
            <p className="text-[11px] font-semibold">Dossiers</p>
          </div>
        </div>
      </div>

      {/* Create Doctor Form Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#059669]" />
              Créer un Compte Médecin
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chaque médecin ne reçoit que les dossiers de sa catégorie et ses identifiants restent stockés dans votre espace de contrôle.
            </p>
          </div>
          <button
            type="button"
            onClick={generateCredentials}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Générer E-mail & Mot de passe
          </button>
        </div>

        <form onSubmit={handleCreateDoctor} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-medium text-emerald-800">
              {successMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nom du Médecin
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Amine Benali"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Catégorie / Spécialité
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MedicalCategoryId)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl bg-white"
              >
                {MEDICAL_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} — {c.subtitle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                E-mail attribué au médecin
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="medecin@clinique-rayen.med"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Mot de passe attribué
              </label>
              <input
                type="text"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe sécurisé"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl font-mono-tabular"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {creating ? 'Création...' : 'Créer le Compte Médecin'}
            </button>
          </div>
        </form>
      </div>

      {/* Stored Doctors Directory & Control */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            Comptes Médecins Enregistrés ({doctors.length})
          </h3>
        </div>

        {doctors.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Aucun compte médecin créé pour le moment. Utilisez le formulaire ci-dessus pour créer et stocker votre premier compte médecin.
          </p>
        ) : (
          <div className="space-y-3">
            {doctors.map((doc) => {
              const showPwd = Boolean(visiblePasswords[doc.id]);
              return (
                <div
                  key={doc.id}
                  className="border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{doc.name}</span>
                      <span className="text-xs font-semibold text-[#0B57D0]">
                        · {doc.category}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          doc.status === 'active' ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        · {doc.status === 'active' ? 'Actif' : 'Suspendu'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 font-mono-tabular">
                      <span>E-mail : {doc.email}</span>
                      <span className="flex items-center gap-1.5">
                        Mot de passe :{' '}
                        {showPwd ? doc.plainPassword || '••••••' : '••••••••'}
                        <button
                          type="button"
                          onClick={() =>
                            setVisiblePasswords((p) => ({
                              ...p,
                              [doc.id]: !p[doc.id],
                            }))
                          }
                          className="text-slate-500 hover:text-slate-900 cursor-pointer"
                          title={showPwd ? 'Masquer' : 'Afficher'}
                        >
                          {showPwd ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyCredentials(doc)}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#0B57D0] text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedId === doc.id ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Copié
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Copier accès
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleStatus(doc)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      {doc.status === 'active' ? 'Suspendre' : 'Réactiver'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteDoctor(doc)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                      title="Supprimer le compte"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
