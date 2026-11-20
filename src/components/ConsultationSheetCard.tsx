import {Calendar, CheckSquare, Clock, Download, MapPin, UserCheck} from 'lucide-react';
import {downloadConsultationPdf} from '../lib/pdfGenerator';
import type {ConsultationSheet} from '../types/medical';

interface ConsultationSheetCardProps {
  sheet: ConsultationSheet;
}

export function ConsultationSheetCard({sheet}: ConsultationSheetCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Platform Header Strip matching page design */}
      <div className="bg-[#0B57D0] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1 bg-white text-[#0B57D0] font-display font-bold text-sm rounded-lg">
            DR
          </div>
          <div>
            <p className="text-base font-bold tracking-tight">
              Dr.Med Rayen Bouazizi
            </p>
            <p className="text-xs text-blue-100">
              Fiche Officielle de Consultation Réelle
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono-tabular text-xs text-blue-100">
            Réf : {sheet.referenceCode}
          </span>
          <button
            type="button"
            onClick={() => downloadConsultationPdf(sheet)}
            className="px-3.5 py-2 bg-white text-[#0B57D0] hover:bg-blue-50 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Télécharger PDF
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Doctor + Patient + Appointment Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-5 border-b border-slate-100">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Médecin & Spécialité
            </p>
            <p className="text-base font-bold text-slate-900">{sheet.doctorName}</p>
            <p className="text-sm font-medium text-[#0B57D0]">{sheet.doctorCategory}</p>
            <p className="text-xs text-slate-600 flex items-center gap-1.5 pt-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              {sheet.clinicLocation}
            </p>
          </div>

          <div className="space-y-1.5 md:text-right">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Patient & Rendez-vous
            </p>
            <p className="text-base font-bold text-slate-900 flex items-center md:justify-end gap-1.5">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              {sheet.patientName}
            </p>
            <div className="flex flex-wrap md:justify-end items-center gap-3 text-xs font-semibold text-emerald-700 pt-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {sheet.appointmentDate}
              </span>
              <span className="flex items-center gap-1 font-mono-tabular">
                <Clock className="w-3.5 h-3.5" />
                {sheet.appointmentTime}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono-tabular">
              {sheet.patientPhone} · {sheet.patientEmail}
            </p>
          </div>
        </div>

        {/* Items to bring to the real consultation */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Éléments à apporter lors de la consultation réelle
          </h4>
          {sheet.itemsToBring.length === 0 ? (
            <p className="text-sm text-slate-600">
              Aucun document complémentaire précisé.
            </p>
          ) : (
            <ul className="space-y-2">
              {sheet.itemsToBring.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 text-sm text-slate-800 bg-slate-50 border border-slate-200/70 rounded-xl px-3.5 py-2.5"
                >
                  <CheckSquare className="w-4 h-4 text-[#0B57D0] shrink-0 mt-0.5" />
                  <span className="font-handwriting text-xl leading-snug text-slate-900">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Doctor Handwritten Notes & Signature */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-2">
          <div className="md:col-span-2 bg-[#F8FAFC] border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Note manuscrite du médecin
            </p>
            <p className="font-handwriting text-2xl text-slate-900 leading-relaxed whitespace-pre-line">
              {sheet.doctorNotes || 'Merci de vous présenter 10 minutes avant l’heure du rendez-vous.'}
            </p>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 text-center bg-white">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Signature du Médecin
            </p>
            <p className="font-handwriting text-3xl text-[#0B57D0] mt-2">
              {sheet.handwrittenSignature || sheet.doctorName}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">{sheet.doctorCategory}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
