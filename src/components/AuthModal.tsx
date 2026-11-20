import {Lock, Mail, Phone, User, X} from 'lucide-react';
import {useState, type FormEvent} from 'react';
import {api, setStoredToken} from '../lib/api';
import type {AuthUser} from '../types/medical';

interface AuthModalProps {
  open: boolean;
  initialTab?: 'login' | 'register';
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

export function AuthModal({
  open,
  initialTab = 'login',
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'login') {
        const res = await api.login({email, password});
        setStoredToken(res.token);
        onSuccess(res.user);
      } else {
        const res = await api.register({name, email, phone, password});
        setStoredToken(res.token);
        onSuccess(res.user);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Top Modal Header matching reference screenshot */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="px-2.5 py-1 bg-[#0B57D0] text-white font-display font-bold text-sm rounded-lg tracking-tight shrink-0">
                DR
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 leading-tight">
                  Portail Médical
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Diagnostic Anatomique 3D · Dr.Med Rayen Bouazizi
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Two-tab switch matching reference screenshot */}
          <div className="grid grid-cols-2 mt-5 border-b border-slate-200">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError('');
              }}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                tab === 'login'
                  ? 'border-[#0B57D0] text-[#0B57D0]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Se Connecter
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setError('');
              }}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                tab === 'register'
                  ? 'border-[#0B57D0] text-[#0B57D0]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Créer un Compte
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {tab === 'register' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nom Complet
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Prénom et Nom"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/30 focus:border-[#0B57D0]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Adresse E-mail
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@exemple.com"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/30 focus:border-[#0B57D0]"
              />
            </div>
            {tab === 'register' && (
              <p className="text-[11px] text-slate-500 mt-1">
                Unicité stricte : une adresse e-mail ne peut être utilisée qu’une seule fois.
              </p>
            )}
          </div>

          {tab === 'register' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Numéro de Téléphone
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+216 00 000 000"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/30 focus:border-[#0B57D0]"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Numéro unique requis pour garantir la sécurité de votre dossier médical.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Mot de Passe
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/30 focus:border-[#0B57D0]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#0B57D0] hover:bg-[#0842A0] disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer"
          >
            {loading
              ? 'Traitement...'
              : tab === 'login'
                ? 'Connexion'
                : 'Créer mon Compte Patient'}
          </button>
        </form>
      </div>
    </div>
  );
}
