import {
  CalendarPlus,
  FileText,
  FolderOpen,
  History,
  MessageSquarePlus,
  Phone,
  Send,
  Stethoscope,
  X,
} from 'lucide-react';
import {useState, type FormEvent} from 'react';
import {api} from '../lib/api';
import type {
  AuthUser,
  ConsultationSheet,
  DossierStatus,
  HistoryEvent,
  MedicalDossier,
} from '../types/medical';
import {ConsultationSheetCard} from './ConsultationSheetCard';
import {ImageLightboxModal} from './ImageLightboxModal';
import {MediaRecorderWidget} from './MediaRecorderWidget';

interface DoctorWorkspaceProps {
  user: AuthUser;
  activeSection: 'dossiers' | 'consultations';
  dossiers: MedicalDossier[];
  consultations: ConsultationSheet[];
  onDossierUpdated: (dossier: MedicalDossier) => void;
  onConsultationCreated: (consultation: ConsultationSheet) => void;
  onRefresh: () => Promise<void>;
}

export function DoctorWorkspace({
  user,
  activeSection,
  dossiers,
  consultations,
  onDossierUpdated,
  onConsultationCreated,
  onRefresh,
}: DoctorWorkspaceProps) {
  const [selectedDossier, setSelectedDossier] = useState<MedicalDossier | null>(null);
  const [textResponse, setTextResponse] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [responseStatus, setResponseStatus] = useState<DossierStatus>('traite');
  const [sendingResponse, setSendingResponse] = useState(false);
  const [responseError, setResponseError] = useState('');

  // Patient History Drawer
  const [historyPatient, setHistoryPatient] = useState<{
    name: string;
    events: HistoryEvent[];
  } | null>(null);

  // Real Consultation Sheet Modal
  const [sheetTarget, setSheetTarget] = useState<MedicalDossier | null>(null);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('10:00');
  const [clinicLocation, setClinicLocation] = useState(
    'Cabinet Médical — Dr.Med Rayen Bouazizi',
  );
  const [itemsText, setItemsText] = useState(
    'Clichés originaux IRM / Radiographie\nOrdonnances et bilans sanguins récents\nPièce d’identité',
  );
  const [doctorNotes, setDoctorNotes] = useState('');
  const [handwrittenSignature, setHandwrittenSignature] = useState(user.name);
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [sheetError, setSheetError] = useState('');

  const [lightbox, setLightbox] = useState<{url: string; name: string} | null>(null);

  const openPatientHistory = async (dossier: MedicalDossier) => {
    try {
      const res = await api.getDoctorPatientHistory(dossier.patientId);
      setHistoryPatient({name: dossier.patientName, events: res.history});
    } catch {
      setHistoryPatient({name: dossier.patientName, events: []});
    }
  };

  const handleSendResponse = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDossier) return;
    setResponseError('');
    setSendingResponse(true);
    try {
      const res = await api.respondToDossier(selectedDossier.id, {
        textResponse,
        audioUrl,
        videoUrl,
        status: responseStatus,
      });
      onDossierUpdated(res.dossier);
      setTextResponse('');
      setAudioUrl(null);
      setVideoUrl(null);
      setSelectedDossier(null);
      void onRefresh();
    } catch (err) {
      setResponseError(err instanceof Error ? err.message : 'Erreur d’envoi.');
    } finally {
      setSendingResponse(false);
    }
  };

  const handleCreateSheet = async (e: FormEvent) => {
    e.preventDefault();
    if (!sheetTarget) return;
    setSheetError('');
    setCreatingSheet(true);
    try {
      const itemsToBring = itemsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const res = await api.createConsultationSheet({
        patientId: sheetTarget.patientId,
        dossierId: sheetTarget.id,
        appointmentDate,
        appointmentTime,
        clinicLocation,
        itemsToBring,
        doctorNotes,
        handwrittenSignature,
      });
      onConsultationCreated(res.consultation);
      setSheetTarget(null);
      setDoctorNotes('');
      void onRefresh();
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setCreatingSheet(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Category Scope Banner */}
      <div className="bg-[#EEF4FF] border border-blue-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0B57D0] text-white flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              Espace Médecin · Spécialité : {user.category}
            </p>
            <p className="text-xs text-slate-600">
              Vous recevez exclusivement les dossiers médicaux correspondant à votre catégorie ({user.category}).
            </p>
          </div>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl px-4 py-2 text-center">
          <p className="font-mono-tabular text-lg font-bold text-[#0B57D0]">
            {dossiers.length}
          </p>
          <p className="text-[11px] font-semibold text-slate-500">
            Dossier(s) reçu(s)
          </p>
        </div>
      </div>

      {activeSection === 'dossiers' && (
        <>
          {dossiers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm">
              <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">
                Aucun dossier en attente dans la catégorie {user.category}
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Dès qu’un patient soumet un cas en {user.category}, il apparaîtra ici avec ses images IRM/Radio, vidéos et historique.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {dossiers.map((dossier) => (
                <div
                  key={dossier.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono-tabular font-bold text-[#0B57D0]">
                          {dossier.referenceCode}
                        </span>
                        <span>·</span>
                        <span className="font-bold text-slate-900">
                          Patient : {dossier.patientName}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1 font-mono-tabular">
                          <Phone className="w-3 h-3" />
                          {dossier.patientPhone}
                        </span>
                        <span>·</span>
                        <span className="font-mono-tabular">
                          {new Date(dossier.createdAt).toLocaleString('fr-FR')}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mt-1.5">
                        {dossier.symptoms || 'Dossier médical transmis par média'}
                      </h3>
                      {dossier.anatomicalZone && (
                        <p className="text-xs font-semibold text-emerald-700 mt-1">
                          Zone anatomique 3D signalée : {dossier.anatomicalZone}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openPatientHistory(dossier)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5" />
                        Historique
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDossier(dossier);
                          setResponseError('');
                        }}
                        className="px-3.5 py-1.5 bg-[#0B57D0] hover:bg-[#0842A0] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                        Répondre (Audio/Vidéo/Texte)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSheetTarget(dossier);
                          setSheetError('');
                          setHandwrittenSignature(user.name);
                        }}
                        className="px-3.5 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        Fiche Consultation Réelle
                      </button>
                    </div>
                  </div>

                  {dossier.healthDetails && (
                    <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                      {dossier.healthDetails}
                    </p>
                  )}

                  {/* High-clarity MRI & X-Ray Images */}
                  {dossier.mriImages.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-[#0B57D0] uppercase tracking-wider mb-2">
                        Clichés IRM & Radio (cliquer pour agrandir et ajuster le contraste)
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {dossier.mriImages.map((img, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setLightbox({url: img.url, name: img.name})}
                            className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-black cursor-pointer"
                          >
                            <img
                              src={img.url}
                              alt={img.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <span className="absolute bottom-1.5 left-1.5 right-1.5 bg-slate-900/85 text-white text-[10px] px-2 py-0.5 rounded truncate">
                              Inspecter : {img.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

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
                            <FileText className="w-4 h-4 text-[#0B57D0]" />
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

                  {dossier.videoUrl && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Vidéo explicative du patient
                      </p>
                      <video
                        src={dossier.videoUrl}
                        controls
                        className="w-full max-w-lg rounded-xl bg-black border border-slate-200"
                      />
                    </div>
                  )}

                  {dossier.responses.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                        Vos réponses envoyées ({dossier.responses.length})
                      </p>
                      {dossier.responses.map((r) => (
                        <div
                          key={r.id}
                          className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 space-y-2"
                        >
                          {r.textResponse && <p className="text-sm">{r.textResponse}</p>}
                          {r.audioUrl && <audio src={r.audioUrl} controls className="w-full max-w-md" />}
                          {r.videoUrl && (
                            <video src={r.videoUrl} controls className="w-full max-w-md rounded-lg bg-black" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeSection === 'consultations' && (
        <>
          {consultations.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-sm">
              <CalendarPlus className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">
                Aucune fiche de consultation réelle créée
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Ouvrez un dossier patient dans l’onglet « Dossiers Catégorie » pour générer immédiatement sa fiche de consultation réelle.
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

      {/* MODAL: DOCTOR RESPONSE (TEXT / VOICE / VIDEO) */}
      {selectedDossier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Répondre au patient : {selectedDossier.patientName}
                </h3>
                <p className="text-xs text-slate-500">
                  Envoyez une explication écrite, un message vocal et/ou une vidéo de traitement.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDossier(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendResponse} className="p-6 space-y-4">
              {responseError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
                  {responseError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Statut du dossier
                </label>
                <select
                  value={responseStatus}
                  onChange={(e) => setResponseStatus(e.target.value as DossierStatus)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                >
                  <option value="en_analyse">En cours d’analyse</option>
                  <option value="traite">Diagnostic & traitement envoyé</option>
                  <option value="consultation_requise">Consultation réelle recommandée</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Diagnostic & Prescription écrite (optionnel si vocal ou vidéo)
                </label>
                <textarea
                  rows={4}
                  value={textResponse}
                  onChange={(e) => setTextResponse(e.target.value)}
                  placeholder="Expliquez clairement le diagnostic et le protocole de traitement..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <MediaRecorderWidget
                mode="audio"
                label="Message vocal explicatif (optionnel)"
                currentUrl={audioUrl}
                onChangeUrl={setAudioUrl}
              />

              <MediaRecorderWidget
                mode="video"
                label="Vidéo explicative du traitement (optionnel)"
                currentUrl={videoUrl}
                onChangeUrl={setVideoUrl}
              />

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedDossier(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={sendingResponse}
                  className="px-5 py-2.5 bg-[#0B57D0] hover:bg-[#0842A0] text-white text-sm font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  {sendingResponse ? 'Envoi...' : 'Envoyer au patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE REAL CONSULTATION SHEET */}
      {sheetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8">
            <div className="bg-[#0B57D0] text-white px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-100 font-semibold">
                  Dr.Med Rayen Bouazizi · Nouvelle Fiche Patient
                </p>
                <h3 className="text-lg font-bold">
                  Organiser une Consultation Réelle — {sheetTarget.patientName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSheetTarget(null)}
                className="p-1.5 text-white/80 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSheet} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {sheetError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-700">
                  {sheetError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Date de la consultation réelle
                  </label>
                  <input
                    type="date"
                    required
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Heure du rendez-vous
                  </label>
                  <input
                    type="time"
                    required
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Lieu / Cabinet médical
                </label>
                <input
                  type="text"
                  required
                  value={clinicLocation}
                  onChange={(e) => setClinicLocation(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Éléments que le patient doit apporter lors de la consultation (un par ligne)
                </label>
                <textarea
                  rows={4}
                  value={itemsText}
                  onChange={(e) => setItemsText(e.target.value)}
                  placeholder="Ex. CD de l'IRM cérébrale&#10;Bilan sanguin complet à jeun&#10;Anciennes ordonnances..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl font-handwriting text-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Consignes & Écriture du médecin sur la fiche
                </label>
                <textarea
                  rows={3}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  placeholder="Rédigez vos recommandations personnalisées..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl font-handwriting text-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Signature manuscrite affichée sur la fiche
                </label>
                <input
                  type="text"
                  required
                  value={handwrittenSignature}
                  onChange={(e) => setHandwrittenSignature(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl font-handwriting text-2xl text-[#0B57D0]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSheetTarget(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creatingSheet}
                  className="px-5 py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-sm font-semibold rounded-xl cursor-pointer"
                >
                  {creatingSheet ? 'Création...' : 'Envoyer la Fiche au Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PATIENT MEDICAL HISTORY */}
      {historyPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Historique Médical — {historyPatient.name}
              </h3>
              <button
                type="button"
                onClick={() => setHistoryPatient(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-3">
              {historyPatient.events.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun événement enregistré.</p>
              ) : (
                historyPatient.events.map((evt) => (
                  <div key={evt.id} className="border border-slate-200 rounded-xl p-3.5">
                    <div className="flex justify-between gap-2 text-xs text-slate-500">
                      <span className="font-bold text-slate-900">{evt.title}</span>
                      <span className="font-mono-tabular">
                        {new Date(evt.date).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1">{evt.summary}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ImageLightboxModal
        imageUrl={lightbox?.url || null}
        imageName={lightbox?.name || ''}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
