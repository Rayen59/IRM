import {
  Camera,
  Clock,
  FileText,
  FolderPlus,
  History,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Stethoscope,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {useEffect, useState, type FormEvent} from 'react';
import {api, uploadMediaFile} from '../lib/api';
import {
  MEDICAL_CATEGORIES,
  type ConsultationSheet,
  type DossierStatus,
  type HistoryEvent,
  type MediaAttachment,
  type MedicalCategoryId,
  type MedicalDossier,
} from '../types/medical';
import {ConsultationSheetCard} from './ConsultationSheetCard';
import {ImageLightboxModal} from './ImageLightboxModal';
import {MediaRecorderWidget} from './MediaRecorderWidget';
import {MedicalCameraScanner} from './MedicalCameraScanner';

interface PatientWorkspaceProps {
  activeSection: 'dossiers' | 'history' | 'consultations';
  dossiers: MedicalDossier[];
  consultations: ConsultationSheet[];
  history: HistoryEvent[];
  composerOpen: boolean;
  preselectedCategory: MedicalCategoryId;
  preselectedZone: string;
  onOpenComposer: () => void;
  onCloseComposer: () => void;
  onDossierCreated: (dossier: MedicalDossier) => void;
  onRefresh: () => Promise<void>;
}

const STATUS_LABELS: Record<DossierStatus, {label: string; cls: string}> = {
  en_attente: {label: 'En attente d’analyse', cls: 'text-amber-700 bg-amber-50 border-amber-200'},
  en_analyse: {label: 'En cours d’analyse', cls: 'text-blue-700 bg-blue-50 border-blue-200'},
  traite: {label: 'Diagnostic & traitement reçus', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200'},
  consultation_requise: {
    label: 'Consultation réelle programmée',
    cls: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  },
};

export function PatientWorkspace({
  activeSection,
  dossiers,
  consultations,
  history,
  composerOpen,
  preselectedCategory,
  preselectedZone,
  onOpenComposer,
  onCloseComposer,
  onDossierCreated,
  onRefresh,
}: PatientWorkspaceProps) {
  const [category, setCategory] = useState<MedicalCategoryId>(preselectedCategory);
  const [anatomicalZone, setAnatomicalZone] = useState(preselectedZone);
  const [symptoms, setSymptoms] = useState('');
  const [healthDetails, setHealthDetails] = useState('');
  const [mriImages, setMriImages] = useState<MediaAttachment[]>([]);
  const [documents, setDocuments] = useState<MediaAttachment[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [lightbox, setLightbox] = useState<{url: string; name: string} | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Sync preselected category/zone cleanly when composer opens from 3D viewer
  useEffect(() => {
    if (composerOpen) {
      setCategory(preselectedCategory);
      setAnatomicalZone(preselectedZone);
    }
  }, [composerOpen, preselectedCategory, preselectedZone]);

  const handleMriUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFiles(true);
    setFormError('');
    try {
      const uploaded = await Promise.all(
        Array.from(files).map((file) => uploadMediaFile(file)),
      );
      setMriImages((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur d’envoi d’image.');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleDocUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFiles(true);
    setFormError('');
    try {
      const uploaded = await Promise.all(
        Array.from(files).map((file) => uploadMediaFile(file)),
      );
      setDocuments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur d’envoi de document.');
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const res = await api.createDossier({
        category,
        anatomicalZone,
        symptoms,
        healthDetails,
        mriImages,
        documents,
        videoUrl,
      });
      onDossierCreated(res.dossier);
      setSymptoms('');
      setHealthDetails('');
      setAnatomicalZone('');
      setMriImages([]);
      setDocuments([]);
      setVideoUrl(null);
      onCloseComposer();
      void onRefresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la soumission.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Card (matches Screenshot 2 white hero card) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {activeSection === 'dossiers' && 'Mes Dossiers Médicaux'}
            {activeSection === 'history' && 'Mon Historique Médical'}
            {activeSection === 'consultations' && 'Mes Fiches de Consultation Réelle'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {activeSection === 'dossiers' &&
              'Espace strictement privé : vous seul et les médecins de la spécialité concernée accédez à votre traitement.'}
            {activeSection === 'history' &&
              'Suivi chronologique complet de vos dossiers, diagnostics reçus et consultations programmées.'}
            {activeSection === 'consultations' &&
              'Consultez et téléchargez en PDF vos feuilles officielles de rendez-vous en cabinet.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenComposer}
          className="px-4 py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nouveau Dossier Médical
        </button>
      </div>

      {/* SECTION 1: PATIENT DOSSIERS */}
      {activeSection === 'dossiers' && (
        <>
          {dossiers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0B57D0] flex items-center justify-center mx-auto mb-3">
                <FolderPlus className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Aucun dossier médical envoyé pour le moment
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Choisissez votre catégorie médicale et transmettez un texte, une image IRM/Radio, une ordonnance ou une vidéo explicative.
              </p>
              <button
                type="button"
                onClick={onOpenComposer}
                className="mt-5 px-5 py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold rounded-xl transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Créer mon premier dossier
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {dossiers.map((dossier) => {
                const st = STATUS_LABELS[dossier.status];
                return (
                  <div
                    key={dossier.id}
                    className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono-tabular font-semibold text-slate-700">
                            {dossier.referenceCode}
                          </span>
                          <span>·</span>
                          <span className="font-semibold text-[#0B57D0]">
                            {dossier.category}
                          </span>
                          {dossier.anatomicalZone && (
                            <>
                              <span>·</span>
                              <span>Zone 3D : {dossier.anatomicalZone}</span>
                            </>
                          )}
                          <span>·</span>
                          <span className="font-mono-tabular">
                            {new Date(dossier.createdAt).toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 mt-1.5">
                          {dossier.symptoms || 'Dossier médical transmis par média'}
                        </h3>
                      </div>

                      <span
                        className={`px-3 py-1 rounded-lg border text-xs font-semibold ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </div>

                    {dossier.healthDetails && (
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                        {dossier.healthDetails}
                      </p>
                    )}

                    {/* Attached MRI/X-Ray Images */}
                    {dossier.mriImages.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                          Images IRM & Radio ({dossier.mriImages.length})
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {dossier.mriImages.map((img, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setLightbox({url: img.url, name: img.name})}
                              className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-950 cursor-pointer"
                            >
                              <img
                                src={img.url}
                                alt={img.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <span className="absolute bottom-1.5 left-1.5 right-1.5 bg-slate-900/80 text-white text-[10px] px-2 py-0.5 rounded truncate">
                                {img.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Attached Prescriptions / Medical Documents */}
                    {dossier.documents.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {dossier.documents.map((doc, i) => {
                          const isImage =
                            doc.mimeType?.startsWith('image/') ||
                            /\.(png|jpe?g|webp|gif)$/i.test(doc.name);
                          return isImage ? (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setLightbox({url: doc.url, name: doc.name})}
                              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
                            >
                              <ImageIcon className="w-4 h-4 text-[#0B57D0]" />
                              {doc.name}
                            </button>
                          ) : (
                            <a
                              key={i}
                              href={doc.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
                            >
                              <FileText className="w-4 h-4 text-[#0B57D0]" />
                              {doc.name}
                            </a>
                          );
                        })}
                      </div>
                    )}

                    {/* Patient Explanatory Video */}
                    {dossier.videoUrl && (
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                          Votre vidéo explicative
                        </p>
                        <video
                          src={dossier.videoUrl}
                          controls
                          className="w-full max-w-lg rounded-xl bg-black border border-slate-200"
                        />
                      </div>
                    )}

                    {/* Doctor Responses (Private to this patient) */}
                    {dossier.responses.length > 0 && (
                      <div className="pt-4 border-t border-slate-100 space-y-3">
                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Stethoscope className="w-4 h-4" />
                          Traitement & Réponse du Médecin
                        </p>
                        {dossier.responses.map((resp) => (
                          <div
                            key={resp.id}
                            className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-4 space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                              <span className="font-bold text-slate-900">
                                {resp.doctorName} · {resp.doctorCategory}
                              </span>
                              <span className="font-mono-tabular">
                                {new Date(resp.createdAt).toLocaleString('fr-FR')}
                              </span>
                            </div>

                            {resp.textResponse && (
                              <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                                {resp.textResponse}
                              </p>
                            )}

                            {resp.audioUrl && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600 mb-1">
                                  Message vocal explicatif du médecin :
                                </p>
                                <audio src={resp.audioUrl} controls className="w-full max-w-md" />
                              </div>
                            )}

                            {resp.videoUrl && (
                              <div>
                                <p className="text-xs font-semibold text-slate-600 mb-1">
                                  Vidéo explicative du traitement :
                                </p>
                                <video
                                  src={resp.videoUrl}
                                  controls
                                  className="w-full max-w-lg rounded-xl bg-black"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* SECTION 2: MEDICAL HISTORY */}
      {activeSection === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          {history.length === 0 ? (
            <div className="py-10 text-center">
              <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-base font-bold text-slate-900">
                Historique médical vierge
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Tous vos dossiers, réponses des médecins et fiches de consultation apparaîtront ici chronologiquement.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-b-0 last:pb-0"
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      evt.type === 'dossier'
                        ? 'bg-blue-50 text-[#0B57D0]'
                        : evt.type === 'response'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-indigo-50 text-indigo-700'
                    }`}
                  >
                    {evt.type === 'dossier' && <FileText className="w-4 h-4" />}
                    {evt.type === 'response' && <MessageSquare className="w-4 h-4" />}
                    {evt.type === 'consultation' && <Clock className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">{evt.title}</p>
                      <span className="font-mono-tabular text-xs text-slate-500">
                        {new Date(evt.date).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[#0B57D0] mt-0.5">
                      {evt.category}
                    </p>
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">
                      {evt.summary}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: REAL CONSULTATION SHEETS */}
      {activeSection === 'consultations' && (
        <>
          {consultations.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-base font-bold text-slate-900">
                Aucune fiche de consultation réelle reçue
              </p>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Lorsqu’un médecin organise une consultation en personne, votre fiche officielle apparaîtra ici avec le bouton de téléchargement PDF.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {consultations.map((sheet) => (
                <ConsultationSheetCard key={sheet.id} sheet={sheet} />
              ))}
            </div>
          )}
        </>
      )}

      {/* COMPOSER MODAL: NEW MEDICAL DOSSIER */}
      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Nouveau Dossier Médical
                </h3>
                <p className="text-xs text-slate-500">
                  Envoyez uniquement ce dont vous disposez : texte, image IRM/Radio, ordonnance ou vidéo.
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseComposer}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
                  {formError}
                </div>
              )}

              {/* Category selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Catégorie médicale concernée
                </label>
                <div className="flex flex-wrap gap-2">
                  {MEDICAL_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                        category === cat.id
                          ? 'bg-[#0B57D0] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional 3D Zone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Zone anatomique ciblée (optionnel)
                </label>
                <input
                  type="text"
                  value={anatomicalZone}
                  onChange={(e) => setAnatomicalZone(e.target.value)}
                  placeholder="Ex. Ventricule Gauche, Disque Intervertébral, Poumon Droit..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/30"
                />
              </div>

              {/* Written Symptoms & Health Details */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Symptômes principaux (optionnel si vidéo ou image jointe)
                  </label>
                  <input
                    type="text"
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    placeholder="Décrivez brièvement vos symptômes..."
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Détails de votre état de santé (optionnel)
                  </label>
                  <textarea
                    rows={3}
                    value={healthDetails}
                    onChange={(e) => setHealthDetails(e.target.value)}
                    placeholder="Durée des symptômes, antécédents, douleurs, traitements en cours..."
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0B57D0]/30"
                  />
                </div>
              </div>

              {/* Dedicated Clear MRI / X-Ray Uploader + Camera Scanner */}
              <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-[#0B57D0] flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4" />
                      Images IRM, Radio, Neuro & Cellules (Haute Clarté)
                    </p>
                    <p className="text-[11px] text-slate-600">
                      Importez vos clichés ou utilisez la caméra pour transformer une photo en IRM, Radio, Neuro-scan ou Cellules.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setScannerOpen(true)}
                      className="px-3 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Scanner Caméra (IRM / Radio)
                    </button>
                    <label className="px-3 py-1.5 bg-[#0B57D0] hover:bg-[#0842A0] text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      Importer IRM / Radio
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleMriUpload(e.target.files)}
                      />
                    </label>
                  </div>
                </div>

                {mriImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {mriImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-300 bg-black"
                      >
                        <img
                          src={img.url}
                          alt={img.name}
                          referrerPolicy="no-referrer"
                          onClick={() => setLightbox({url: img.url, name: img.name})}
                          className="w-full h-full object-cover cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setMriImages((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="absolute top-1 right-1 p-0.5 bg-red-600 text-white rounded cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Prescriptions & Medical Files */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-slate-500" />
                      Ordonnances & Dossiers Médicaux (optionnel)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Comptes-rendus, bilans sanguins ou ordonnances (PDF ou photo).
                    </p>
                  </div>
                  <label className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    Ajouter document
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handleDocUpload(e.target.files)}
                    />
                  </label>
                </div>

                {documents.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {documents.map((doc, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-xs text-slate-700"
                      >
                        {doc.name}
                        <button
                          type="button"
                          onClick={() =>
                            setDocuments((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Explanatory Video */}
              <MediaRecorderWidget
                mode="video"
                label="Vidéo explicative de votre situation (optionnel)"
                currentUrl={videoUrl}
                onChangeUrl={setVideoUrl}
              />

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onCloseComposer}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploadingFiles}
                  className="px-5 py-2.5 bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  {submitting
                    ? 'Envoi en cours...'
                    : uploadingFiles
                      ? 'Chargement des fichiers...'
                      : 'Envoyer le Dossier Médical'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ImageLightboxModal
        imageUrl={lightbox?.url || null}
        imageName={lightbox?.name || ''}
        onClose={() => setLightbox(null)}
      />

      <MedicalCameraScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onAttachScan={(scan) => setMriImages((prev) => [...prev, scan])}
      />
    </div>
  );
}
