export type UserRole = 'patient' | 'doctor' | 'admin';

export type MedicalCategoryId =
  | 'Cardiologie'
  | 'Neurologie'
  | 'Pneumologie'
  | 'Orthopédie'
  | 'Gastro-entérologie'
  | 'Ophtalmologie / ORL'
  | 'Dermatologie'
  | 'Médecine Générale';

export interface MedicalCategoryInfo {
  id: MedicalCategoryId;
  label: string;
  subtitle: string;
  has3DModel: boolean;
}

export const MEDICAL_CATEGORIES: MedicalCategoryInfo[] = [
  {
    id: 'Cardiologie',
    label: 'Cardiologie',
    subtitle: 'Cœur, valves et gros vaisseaux',
    has3DModel: true,
  },
  {
    id: 'Neurologie',
    label: 'Neurologie',
    subtitle: 'Cerveau, cervelet et tronc cérébral',
    has3DModel: true,
  },
  {
    id: 'Pneumologie',
    label: 'Pneumologie',
    subtitle: 'Poumons, trachée et bronches',
    has3DModel: true,
  },
  {
    id: 'Orthopédie',
    label: 'Orthopédie',
    subtitle: 'Colonne vertébrale et disques',
    has3DModel: true,
  },
  {
    id: 'Gastro-entérologie',
    label: 'Gastro-entérologie',
    subtitle: 'Estomac, foie et intestins',
    has3DModel: true,
  },
  {
    id: 'Ophtalmologie / ORL',
    label: 'Ophtalmologie / ORL',
    subtitle: 'Globe oculaire et nerf optique',
    has3DModel: true,
  },
  {
    id: 'Dermatologie',
    label: 'Dermatologie',
    subtitle: 'Peau, lésions et tissus cutanés',
    has3DModel: false,
  },
  {
    id: 'Médecine Générale',
    label: 'Médecine Générale',
    subtitle: 'Orientation clinique et bilan global',
    has3DModel: false,
  },
];

export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
  email: string;
  phone?: string;
  category?: MedicalCategoryId;
}

export interface DoctorRecord {
  id: string;
  name: string;
  email: string;
  category: MedicalCategoryId;
  status: 'active' | 'suspended';
  createdAt: string;
  plainPassword?: string;
}

export interface MediaAttachment {
  url: string;
  name: string;
  mimeType?: string;
}

export type DossierStatus =
  | 'en_attente'
  | 'en_analyse'
  | 'traite'
  | 'consultation_requise';

export interface DoctorResponse {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorCategory: MedicalCategoryId;
  textResponse: string;
  audioUrl: string | null;
  videoUrl: string | null;
  createdAt: string;
}

export interface MedicalDossier {
  id: string;
  referenceCode: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  category: MedicalCategoryId;
  anatomicalZone: string;
  symptoms: string;
  healthDetails: string;
  mriImages: MediaAttachment[];
  documents: MediaAttachment[];
  videoUrl: string | null;
  status: DossierStatus;
  responses: DoctorResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface ConsultationSheet {
  id: string;
  referenceCode: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientEmail: string;
  dossierId: string | null;
  doctorId: string;
  doctorName: string;
  doctorCategory: MedicalCategoryId;
  appointmentDate: string;
  appointmentTime: string;
  clinicLocation: string;
  itemsToBring: string[];
  doctorNotes: string;
  handwrittenSignature: string;
  createdAt: string;
}

export interface HistoryEvent {
  id: string;
  type: 'dossier' | 'response' | 'consultation';
  date: string;
  category: MedicalCategoryId;
  title: string;
  summary: string;
  dossier?: MedicalDossier;
  response?: DoctorResponse;
  consultation?: ConsultationSheet;
}
