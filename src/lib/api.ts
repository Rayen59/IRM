import type {
  AuthUser,
  ConsultationSheet,
  DoctorRecord,
  DossierStatus,
  HistoryEvent,
  MediaAttachment,
  MedicalCategoryId,
  MedicalDossier,
} from '../types/medical';

const TOKEN_KEY = 'rayen_med_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {...options, headers});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as {error?: string}).error || 'Erreur serveur.');
  }
  return data as T;
}

export async function uploadMediaFile(file: File): Promise<MediaAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<MediaAttachment>('/api/upload', {
    method: 'POST',
    body: formData,
  });
}

export const api = {
  register: (payload: {name: string; email: string; phone: string; password: string}) =>
    apiRequest<{token: string; user: AuthUser}>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: {email: string; password: string}) =>
    apiRequest<{token: string; user: AuthUser}>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  me: () => apiRequest<{user: AuthUser}>('/api/auth/me'),

  logout: () => apiRequest<{ok: boolean}>('/api/auth/logout', {method: 'POST'}),

  // Patient
  getMyDossiers: () => apiRequest<{dossiers: MedicalDossier[]}>('/api/dossiers'),

  createDossier: (payload: {
    category: MedicalCategoryId;
    anatomicalZone: string;
    symptoms: string;
    healthDetails: string;
    mriImages: MediaAttachment[];
    documents: MediaAttachment[];
    videoUrl: string | null;
  }) =>
    apiRequest<{dossier: MedicalDossier}>('/api/dossiers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMyConsultations: () =>
    apiRequest<{consultations: ConsultationSheet[]}>('/api/consultations'),

  getMyHistory: () => apiRequest<{history: HistoryEvent[]}>('/api/history'),

  // Doctor
  getDoctorDossiers: () =>
    apiRequest<{dossiers: MedicalDossier[]}>('/api/doctor/dossiers'),

  getDoctorPatientHistory: (patientId: string) =>
    apiRequest<{history: HistoryEvent[]}>(`/api/doctor/patients/${patientId}/history`),

  respondToDossier: (
    dossierId: string,
    payload: {
      textResponse: string;
      audioUrl: string | null;
      videoUrl: string | null;
      status: DossierStatus;
    },
  ) =>
    apiRequest<{dossier: MedicalDossier}>(`/api/doctor/dossiers/${dossierId}/respond`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDoctorConsultations: () =>
    apiRequest<{consultations: ConsultationSheet[]}>('/api/doctor/consultations'),

  createConsultationSheet: (payload: {
    patientId: string;
    dossierId: string | null;
    appointmentDate: string;
    appointmentTime: string;
    clinicLocation: string;
    itemsToBring: string[];
    doctorNotes: string;
    handwrittenSignature: string;
  }) =>
    apiRequest<{consultation: ConsultationSheet}>('/api/doctor/consultations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Super Admin
  getAdminDoctors: () => apiRequest<{doctors: DoctorRecord[]}>('/api/admin/doctors'),

  createDoctor: (payload: {
    name: string;
    category: MedicalCategoryId;
    email: string;
    password: string;
  }) =>
    apiRequest<{doctor: DoctorRecord}>('/api/admin/doctors', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateDoctor: (
    id: string,
    payload: {
      status?: 'active' | 'suspended';
      category?: MedicalCategoryId;
      password?: string;
    },
  ) =>
    apiRequest<{doctor: DoctorRecord}>(`/api/admin/doctors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteDoctor: (id: string) =>
    apiRequest<{ok: boolean}>(`/api/admin/doctors/${id}`, {
      method: 'DELETE',
    }),

  getAdminOverview: () =>
    apiRequest<{
      totalDoctors: number;
      activeDoctors: number;
      totalPatients: number;
      totalDossiers: number;
      totalConsultations: number;
      dossiers: Array<{
        id: string;
        referenceCode: string;
        patientName: string;
        category: MedicalCategoryId;
        status: DossierStatus;
        createdAt: string;
      }>;
    }>('/api/admin/overview'),
};
