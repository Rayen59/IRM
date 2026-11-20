import {jsPDF} from 'jspdf';
import type {ConsultationSheet} from '../types/medical';

export function downloadConsultationPdf(sheet: ConsultationSheet) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 18;

  // Top medical header bar matching platform branding
  doc.setFillColor(11, 87, 208); // #0B57D0
  doc.rect(0, 0, pageWidth, 34, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Dr.Med Rayen Bouazizi', 16, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('FICHE OFFICIELLE DE CONSULTATION RÉELLE', 16, 22);
  doc.text(`Réf : ${sheet.referenceCode}`, pageWidth - 16, 15, {align: 'right'});
  doc.text(
    `Émise le ${new Date(sheet.createdAt).toLocaleDateString('fr-FR')}`,
    pageWidth - 16,
    22,
    {align: 'right'},
  );

  y = 46;

  // Doctor & Specialty Card
  doc.setFillColor(244, 247, 251);
  doc.setDrawColor(219, 228, 240);
  doc.roundedRect(16, y, pageWidth - 32, 26, 3, 3, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Médecin traitant : ${sheet.doctorName}`, 22, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Spécialité : ${sheet.doctorCategory}`, 22, y + 16);
  doc.text(`Lieu : ${sheet.clinicLocation}`, 22, y + 22);

  y += 34;

  // Patient & Appointment Grid
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(16, y, pageWidth - 32, 32, 3, 3, 'FD');

  doc.setTextColor(11, 87, 208);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('INFORMATIONS DU PATIENT & RENDEZ-VOUS', 22, y + 8);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(`Patient : ${sheet.patientName}`, 22, y + 16);
  doc.text(`Téléphone : ${sheet.patientPhone || 'Non précisé'}`, 22, y + 22);
  doc.text(`E-mail : ${sheet.patientEmail}`, 22, y + 28);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(5, 150, 105); // Emerald accent
  doc.text(
    `Date : ${sheet.appointmentDate}`,
    pageWidth - 22,
    y + 16,
    {align: 'right'},
  );
  doc.text(
    `Heure : ${sheet.appointmentTime}`,
    pageWidth - 22,
    y + 22,
    {align: 'right'},
  );

  y += 42;

  // Items to bring checklist
  doc.setTextColor(11, 87, 208);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text('ÉLÉMENTS À APPORTER LORS DE LA CONSULTATION RÉELLE', 16, y);
  y += 4;
  doc.setDrawColor(11, 87, 208);
  doc.setLineWidth(0.5);
  doc.line(16, y, pageWidth - 16, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);

  if (sheet.itemsToBring.length === 0) {
    doc.text('Aucun document spécifique exigé hormis votre pièce d’identité.', 20, y);
    y += 8;
  } else {
    for (const item of sheet.itemsToBring) {
      if (y > 245) {
        doc.addPage();
        y = 20;
      }
      doc.setDrawColor(100, 116, 139);
      doc.rect(18, y - 3.5, 4, 4);
      const wrapped = doc.splitTextToSize(item, pageWidth - 46) as string[];
      doc.text(wrapped, 26, y);
      y += wrapped.length * 5.5 + 2.5;
    }
  }

  y += 6;

  // Doctor's handwritten-style notes block
  if (sheet.doctorNotes) {
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(11, 87, 208);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('CONSIGNES & NOTES DU MÉDECIN', 16, y);
    y += 5;

    const noteLines = doc.splitTextToSize(sheet.doctorNotes, pageWidth - 44) as string[];
    const boxHeight = Math.max(24, noteLines.length * 6 + 12);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(16, y, pageWidth - 32, boxHeight, 3, 3, 'FD');

    doc.setFont('times', 'italic');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text(noteLines, 22, y + 9);
    y += boxHeight + 12;
  }

  // Signature Block
  if (y > 245) {
    doc.addPage();
    y = 24;
  }
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(pageWidth - 96, y, 80, 34, 3, 3, 'S');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Signature & Cachet du Médecin', pageWidth - 56, y + 7, {align: 'center'});

  doc.setFont('times', 'italic');
  doc.setFontSize(16);
  doc.setTextColor(11, 87, 208);
  doc.text(sheet.handwrittenSignature || sheet.doctorName, pageWidth - 56, y + 20, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(sheet.doctorCategory, pageWidth - 56, y + 28, {align: 'center'});

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Document médical généré via la plateforme Dr.Med Rayen Bouazizi — À présenter lors de votre consultation.',
    pageWidth / 2,
    285,
    {align: 'center'},
  );

  doc.save(`Fiche-Consultation-${sheet.referenceCode}.pdf`);
}
