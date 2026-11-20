import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import type {
  AuthUser,
  ConsultationSheet,
  DoctorRecord,
  DoctorResponse,
  DossierStatus,
  HistoryEvent,
  MedicalCategoryId,
  MedicalDossier,
} from '../src/types/medical.ts';

const IS_VERCEL = process.env.VERCEL === '1';
const DATA_DIR = IS_VERCEL
  ? '/tmp/rayen-med-data'
  : path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const SUPER_ADMIN_EMAIL = 'admin123@gmail.com';
const SUPER_ADMIN_PASSWORD = '321321321aaadddmmmiiinnn123';
const TOKEN_SECRET =
  process.env.AUTH_SECRET || 'rayen-bouazizi-med-3d-secret-key-2026';

interface StoredPatient {
  id: string;
  name: string;
  email: string;
  normalizedEmail: string;
  phone: string;
  normalizedPhone: string;
  passwordHash: string;
  createdAt: string;
}

interface StoredDoctor extends DoctorRecord {
  normalizedEmail: string;
  passwordHash: string;
  plainPassword: string;
}

interface DatabaseSchema {
  patients: StoredPatient[];
  doctors: StoredDoctor[];
  dossiers: MedicalDossier[];
  consultations: ConsultationSheet[];
}

// In-memory cache for sub-millisecond reads & writes
let dbCache: DatabaseSchema | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Real-time SSE clients registry
interface SseClient {
  id: string;
  user: AuthUser;
  res: express.Response;
}
const sseClients = new Map<string, SseClient>();

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }
  if (!IS_VERCEL && !fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, {recursive: true});
  }
}

function loadDatabase(): DatabaseSchema {
  if (dbCache) return dbCache;
  ensureDirectories();
  if (!fs.existsSync(DB_FILE)) {
    const initial: DatabaseSchema = {
      patients: [],
      doctors: [],
      dossiers: [],
      consultations: [],
    };
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    } catch {
      // Ignore write failures on ephemeral FS
    }
    dbCache = initial;
    return dbCache;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    dbCache = {
      patients: Array.isArray(parsed.patients) ? parsed.patients : [],
      doctors: Array.isArray(parsed.doctors) ? parsed.doctors : [],
      dossiers: Array.isArray(parsed.dossiers) ? parsed.dossiers : [],
      consultations: Array.isArray(parsed.consultations) ? parsed.consultations : [],
    };
    return dbCache;
  } catch {
    dbCache = {patients: [], doctors: [], dossiers: [], consultations: []};
    return dbCache;
  }
}

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KV_KEY = 'rayen_med_db_v1';

async function hydrateFromRemoteKv(): Promise<void> {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    const res = await fetch(`${KV_URL}/get/${KV_KEY}`, {
      headers: {Authorization: `Bearer ${KV_TOKEN}`},
    });
    if (!res.ok) return;
    const data = (await res.json()) as {result?: string | null};
    if (data.result) {
      const parsed = JSON.parse(data.result) as Partial<DatabaseSchema>;
      dbCache = {
        patients: Array.isArray(parsed.patients) ? parsed.patients : [],
        doctors: Array.isArray(parsed.doctors) ? parsed.doctors : [],
        dossiers: Array.isArray(parsed.dossiers) ? parsed.dossiers : [],
        consultations: Array.isArray(parsed.consultations)
          ? parsed.consultations
          : [],
      };
    } else if (!dbCache) {
      dbCache = {patients: [], doctors: [], dossiers: [], consultations: []};
    }
  } catch {
    // Fallback to local /tmp or disk
  }
}

function saveToRemoteKv(db: DatabaseSchema) {
  if (!KV_URL || !KV_TOKEN) return;
  fetch(`${KV_URL}/set/${KV_KEY}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(JSON.stringify(db)),
  }).catch(() => {});
}

function saveDatabase(db: DatabaseSchema) {
  dbCache = db;
  saveToRemoteKv(db);

  if (IS_VERCEL) {
    try {
      ensureDirectories();
      fs.writeFileSync(DB_FILE, JSON.stringify(db), 'utf-8');
    } catch {
      // Ignore ephemeral write failures
    }
    return;
  }

  // Debounced async disk flush so HTTP responses return instantaneously (<1ms)
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    try {
      ensureDirectories();
      fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8', () => {});
    } catch {
      // Ignore
    }
  }, 50);
}

function broadcastEvent(
  eventName: string,
  payload: Record<string, unknown>,
  filter?: (user: AuthUser) => boolean,
) {
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients.values()) {
    if (!filter || filter(client.user)) {
      try {
        client.res.write(data);
      } catch {
        sseClients.delete(client.id);
      }
    }
  }
}

// Stateless HMAC-SHA256 signed tokens (works instantaneously across restarts & Vercel lambdas)
function signToken(user: AuthUser): string {
  const payload = {
    ...user,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): AuthUser | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf-8'),
    ) as AuthUser & {exp?: number};
    if (decoded.exp && Date.now() > decoded.exp) return null;
    return {
      id: decoded.id,
      role: decoded.role,
      name: decoded.name,
      email: decoded.email,
      phone: decoded.phone,
      category: decoded.category,
    };
  } catch {
    return null;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-().]/g, '').trim();
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function generateReferenceCode(prefix: string): string {
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `${prefix}-${datePart}-${random}`;
}

function buildHistoryForPatient(
  db: DatabaseSchema,
  patientId: string,
  categoryFilter?: MedicalCategoryId,
): HistoryEvent[] {
  const events: HistoryEvent[] = [];

  const patientDossiers = db.dossiers.filter(
    (d) => d.patientId === patientId && (!categoryFilter || d.category === categoryFilter),
  );

  for (const dossier of patientDossiers) {
    events.push({
      id: `evt-dossier-${dossier.id}`,
      type: 'dossier',
      date: dossier.createdAt,
      category: dossier.category,
      title: `Dossier soumis (${dossier.referenceCode})`,
      summary:
        dossier.symptoms ||
        dossier.healthDetails ||
        (dossier.mriImages.length > 0
          ? `${dossier.mriImages.length} image(s) IRM/Radio transmise(s)`
          : dossier.videoUrl
            ? 'Vidéo explicative transmise'
            : 'Documents médicaux transmis'),
      dossier,
    });

    for (const resp of dossier.responses) {
      events.push({
        id: `evt-resp-${resp.id}`,
        type: 'response',
        date: resp.createdAt,
        category: resp.doctorCategory,
        title: `Réponse médicale — ${resp.doctorName}`,
        summary:
          resp.textResponse ||
          (resp.audioUrl && resp.videoUrl
            ? 'Message vocal et vidéo explicative envoyés'
            : resp.audioUrl
              ? 'Message vocal explicatif envoyé'
              : 'Vidéo explicative envoyée'),
        dossier,
        response: resp,
      });
    }
  }

  const patientConsultations = db.consultations.filter(
    (c) => c.patientId === patientId && (!categoryFilter || c.doctorCategory === categoryFilter),
  );

  for (const sheet of patientConsultations) {
    events.push({
      id: `evt-consult-${sheet.id}`,
      type: 'consultation',
      date: sheet.createdAt,
      category: sheet.doctorCategory,
      title: `Consultation réelle programmée — ${sheet.doctorName}`,
      summary: `Rendez-vous le ${sheet.appointmentDate} à ${sheet.appointmentTime} · ${sheet.itemsToBring.length} élément(s) à apporter`,
      consultation: sheet,
    });
  }

  return events.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function createApiApp() {
  const app = express();
  app.use(express.json({limit: '25mb'}));

  // Hydrate from remote KV on Vercel when configured
  app.use('/api', async (_req, _res, next) => {
    if (KV_URL && KV_TOKEN) {
      await hydrateFromRemoteKv();
    }
    next();
  });

  const storage = IS_VERCEL
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (_req, _file, cb) => {
          ensureDirectories();
          cb(null, UPLOADS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname) || '.bin';
          const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '');
          const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`;
          cb(null, uniqueName);
        },
      });

  const upload = multer({
    storage,
    limits: {fileSize: IS_VERCEL ? 4 * 1024 * 1024 : 100 * 1024 * 1024},
  });

  if (!IS_VERCEL) {
    ensureDirectories();
    app.use('/uploads', express.static(UPLOADS_DIR));
  }

  function getAuthUser(req: express.Request): AuthUser | null {
    const authHeader = req.headers.authorization;
    const queryToken =
      typeof req.query.token === 'string' ? req.query.token : null;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : queryToken;
    if (!token) return null;

    const user = verifyToken(token);
    if (!user) return null;

    if (user.role === 'doctor') {
      const db = loadDatabase();
      const doctor = db.doctors.find((d) => d.id === user.id);
      if (doctor) {
        if (doctor.status === 'suspended') return null;
        return {
          id: doctor.id,
          role: 'doctor',
          name: doctor.name,
          email: doctor.email,
          category: doctor.category,
        };
      }
    }

    return user;
  }

  function requireAuth(
    roles?: Array<'patient' | 'doctor' | 'admin'>,
  ): express.RequestHandler {
    return (req, res, next) => {
      const user = getAuthUser(req);
      if (!user) {
        res.status(401).json({error: 'Authentification requise.'});
        return;
      }
      if (roles && !roles.includes(user.role)) {
        res.status(403).json({error: 'Accès non autorisé pour ce profil.'});
        return;
      }
      (req as express.Request & {authUser: AuthUser}).authUser = user;
      next();
    };
  }

  // --- REAL-TIME SSE STREAM ---
  app.get('/api/events', (req, res) => {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({error: 'Non authentifié.'});
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientId = crypto.randomUUID();
    sseClients.set(clientId, {id: clientId, user, res});
    res.write(`event: connected\ndata: ${JSON.stringify({ok: true})}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(clientId);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(clientId);
    });
  });

  // --- AUTH ENDPOINTS ---
  app.post('/api/auth/register', (req, res) => {
    const {name, email, phone, password} = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
    };

    if (!name?.trim() || !email?.trim() || !phone?.trim() || !password) {
      res.status(400).json({
        error:
          'Veuillez renseigner votre nom, e-mail, numéro de téléphone et mot de passe.',
      });
      return;
    }

    const normEmail = normalizeEmail(email);
    const normPhone = normalizePhone(phone);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) {
      res.status(400).json({error: 'Adresse e-mail invalide.'});
      return;
    }

    if (normPhone.replace(/\+/g, '').length < 7) {
      res.status(400).json({
        error: 'Numéro de téléphone invalide (minimum 7 chiffres requis).',
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        error: 'Le mot de passe doit contenir au moins 6 caractères.',
      });
      return;
    }

    const db = loadDatabase();

    if (
      normEmail === SUPER_ADMIN_EMAIL ||
      db.patients.some((p) => p.normalizedEmail === normEmail) ||
      db.doctors.some((d) => d.normalizedEmail === normEmail)
    ) {
      res.status(409).json({
        error:
          "Cette adresse e-mail est déjà utilisée. Chaque adresse e-mail ne peut être utilisée qu'une seule fois.",
      });
      return;
    }

    if (db.patients.some((p) => p.normalizedPhone === normPhone)) {
      res.status(409).json({
        error:
          'Ce numéro de téléphone est déjà enregistré sur la plateforme. Unicité requise pour garantir votre sécurité.',
      });
      return;
    }

    const newPatient: StoredPatient = {
      id: `pat-${crypto.randomUUID()}`,
      name: name.trim(),
      email: email.trim(),
      normalizedEmail: normEmail,
      phone: phone.trim(),
      normalizedPhone: normPhone,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    db.patients.push(newPatient);
    saveDatabase(db);

    const authUser: AuthUser = {
      id: newPatient.id,
      role: 'patient',
      name: newPatient.name,
      email: newPatient.email,
      phone: newPatient.phone,
    };

    const token = signToken(authUser);
    broadcastEvent('sync', {scope: 'admin'}, (u) => u.role === 'admin');
    res.status(201).json({token, user: authUser});
  });

  app.post('/api/auth/login', (req, res) => {
    const {email, password} = req.body as {email?: string; password?: string};
    if (!email?.trim() || !password) {
      res
        .status(400)
        .json({error: 'Veuillez saisir votre e-mail et votre mot de passe.'});
      return;
    }

    const normEmail = normalizeEmail(email);

    // 1. Super Admin
    if (normEmail === SUPER_ADMIN_EMAIL) {
      if (password !== SUPER_ADMIN_PASSWORD) {
        res.status(401).json({error: 'Identifiants administrateur incorrects.'});
        return;
      }
      const adminUser: AuthUser = {
        id: 'super-admin',
        role: 'admin',
        name: 'Super Administrateur',
        email: SUPER_ADMIN_EMAIL,
      };
      const token = signToken(adminUser);
      res.json({token, user: adminUser});
      return;
    }

    const db = loadDatabase();

    // 2. Doctor
    const doctor = db.doctors.find((d) => d.normalizedEmail === normEmail);
    if (doctor) {
      if (doctor.status === 'suspended') {
        res.status(403).json({
          error:
            "Ce compte médecin est actuellement suspendu par l'administrateur.",
        });
        return;
      }
      if (!verifyPassword(password, doctor.passwordHash)) {
        res.status(401).json({error: 'Mot de passe incorrect.'});
        return;
      }
      const docUser: AuthUser = {
        id: doctor.id,
        role: 'doctor',
        name: doctor.name,
        email: doctor.email,
        category: doctor.category,
      };
      const token = signToken(docUser);
      res.json({token, user: docUser});
      return;
    }

    // 3. Patient
    const patient = db.patients.find((p) => p.normalizedEmail === normEmail);
    if (!patient || !verifyPassword(password, patient.passwordHash)) {
      res
        .status(401)
        .json({error: 'Adresse e-mail ou mot de passe incorrect.'});
      return;
    }

    const patientUser: AuthUser = {
      id: patient.id,
      role: 'patient',
      name: patient.name,
      email: patient.email,
      phone: patient.phone,
    };

    const token = signToken(patientUser);
    res.json({token, user: patientUser});
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({error: 'Session expirée ou invalide.'});
      return;
    }
    res.json({user});
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.json({ok: true});
  });

  // --- FILE UPLOAD ---
  app.post('/api/upload', requireAuth(), upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({error: 'Aucun fichier reçu.'});
      return;
    }

    if (IS_VERCEL && req.file.buffer) {
      const mime = req.file.mimetype || 'application/octet-stream';
      const base64 = req.file.buffer.toString('base64');
      res.json({
        url: `data:${mime};base64,${base64}`,
        name: req.file.originalname,
        mimeType: mime,
        size: req.file.size,
      });
      return;
    }

    res.json({
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  });

  // --- SUPER ADMIN ENDPOINTS ---
  app.get('/api/admin/doctors', requireAuth(['admin']), (_req, res) => {
    const db = loadDatabase();
    const doctors = db.doctors.map((d) => ({
      id: d.id,
      name: d.name,
      email: d.email,
      category: d.category,
      status: d.status,
      createdAt: d.createdAt,
      plainPassword: d.plainPassword,
    }));
    res.json({doctors});
  });

  app.post('/api/admin/doctors', requireAuth(['admin']), (req, res) => {
    const {name, category, email, password} = req.body as {
      name?: string;
      category?: MedicalCategoryId;
      email?: string;
      password?: string;
    };

    if (!name?.trim() || !category || !email?.trim() || !password?.trim()) {
      res.status(400).json({
        error:
          'Veuillez renseigner le nom du médecin, sa catégorie, son e-mail et son mot de passe.',
      });
      return;
    }

    const normEmail = normalizeEmail(email);
    const db = loadDatabase();

    if (
      normEmail === SUPER_ADMIN_EMAIL ||
      db.patients.some((p) => p.normalizedEmail === normEmail) ||
      db.doctors.some((d) => d.normalizedEmail === normEmail)
    ) {
      res.status(409).json({
        error: "Cette adresse e-mail est déjà utilisée sur la plateforme.",
      });
      return;
    }

    const newDoctor: StoredDoctor = {
      id: `doc-${crypto.randomUUID()}`,
      name: name.trim(),
      email: email.trim(),
      normalizedEmail: normEmail,
      category,
      status: 'active',
      passwordHash: hashPassword(password),
      plainPassword: password,
      createdAt: new Date().toISOString(),
    };

    db.doctors.push(newDoctor);
    saveDatabase(db);

    broadcastEvent('sync', {scope: 'admin'}, (u) => u.role === 'admin');

    res.status(201).json({
      doctor: {
        id: newDoctor.id,
        name: newDoctor.name,
        email: newDoctor.email,
        category: newDoctor.category,
        status: newDoctor.status,
        createdAt: newDoctor.createdAt,
        plainPassword: newDoctor.plainPassword,
      },
    });
  });

  app.patch('/api/admin/doctors/:id', requireAuth(['admin']), (req, res) => {
    const {id} = req.params;
    const {status, category, password} = req.body as {
      status?: 'active' | 'suspended';
      category?: MedicalCategoryId;
      password?: string;
    };

    const db = loadDatabase();
    const doctor = db.doctors.find((d) => d.id === id);
    if (!doctor) {
      res.status(404).json({error: 'Médecin introuvable.'});
      return;
    }

    if (status) doctor.status = status;
    if (category) doctor.category = category;
    if (password && password.trim().length >= 6) {
      doctor.passwordHash = hashPassword(password.trim());
      doctor.plainPassword = password.trim();
    }

    saveDatabase(db);
    broadcastEvent('sync', {scope: 'admin'}, (u) => u.role === 'admin');

    res.json({
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        category: doctor.category,
        status: doctor.status,
        createdAt: doctor.createdAt,
        plainPassword: doctor.plainPassword,
      },
    });
  });

  app.delete('/api/admin/doctors/:id', requireAuth(['admin']), (req, res) => {
    const {id} = req.params;
    const db = loadDatabase();
    const index = db.doctors.findIndex((d) => d.id === id);
    if (index === -1) {
      res.status(404).json({error: 'Médecin introuvable.'});
      return;
    }
    db.doctors.splice(index, 1);
    saveDatabase(db);
    broadcastEvent('sync', {scope: 'admin'}, (u) => u.role === 'admin');
    res.json({ok: true});
  });

  app.get('/api/admin/overview', requireAuth(['admin']), (_req, res) => {
    const db = loadDatabase();
    res.json({
      totalDoctors: db.doctors.length,
      activeDoctors: db.doctors.filter((d) => d.status === 'active').length,
      totalPatients: db.patients.length,
      totalDossiers: db.dossiers.length,
      totalConsultations: db.consultations.length,
      dossiers: db.dossiers.map((d) => ({
        id: d.id,
        referenceCode: d.referenceCode,
        patientName: d.patientName,
        category: d.category,
        status: d.status,
        createdAt: d.createdAt,
      })),
    });
  });

  // --- PATIENT ENDPOINTS ---
  app.get('/api/dossiers', requireAuth(['patient']), (req, res) => {
    const user = (req as express.Request & {authUser: AuthUser}).authUser;
    const db = loadDatabase();
    const dossiers = db.dossiers
      .filter((d) => d.patientId === user.id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    res.json({dossiers});
  });

  app.post('/api/dossiers', requireAuth(['patient']), (req, res) => {
    const user = (req as express.Request & {authUser: AuthUser}).authUser;
    const {
      category,
      anatomicalZone,
      symptoms,
      healthDetails,
      mriImages,
      documents,
      videoUrl,
    } = req.body as {
      category?: MedicalCategoryId;
      anatomicalZone?: string;
      symptoms?: string;
      healthDetails?: string;
      mriImages?: Array<{url: string; name: string; mimeType?: string}>;
      documents?: Array<{url: string; name: string; mimeType?: string}>;
      videoUrl?: string | null;
    };

    if (!category) {
      res.status(400).json({error: 'Veuillez choisir une catégorie médicale.'});
      return;
    }

    const cleanSymptoms = (symptoms || '').trim();
    const cleanDetails = (healthDetails || '').trim();
    const cleanMri = Array.isArray(mriImages) ? mriImages : [];
    const cleanDocs = Array.isArray(documents) ? documents : [];
    const cleanVideo = videoUrl || null;

    const hasAnyContent =
      Boolean(cleanSymptoms) ||
      Boolean(cleanDetails) ||
      cleanMri.length > 0 ||
      cleanDocs.length > 0 ||
      Boolean(cleanVideo);

    if (!hasAnyContent) {
      res.status(400).json({
        error:
          'Veuillez fournir au moins un élément : une description écrite, une image IRM/Radio, un document ou une vidéo explicative.',
      });
      return;
    }

    const db = loadDatabase();
    const now = new Date().toISOString();

    const newDossier: MedicalDossier = {
      id: `dos-${crypto.randomUUID()}`,
      referenceCode: generateReferenceCode('MED'),
      patientId: user.id,
      patientName: user.name,
      patientEmail: user.email,
      patientPhone: user.phone || '',
      category,
      anatomicalZone: (anatomicalZone || '').trim(),
      symptoms: cleanSymptoms,
      healthDetails: cleanDetails,
      mriImages: cleanMri,
      documents: cleanDocs,
      videoUrl: cleanVideo,
      status: 'en_attente',
      responses: [],
      createdAt: now,
      updatedAt: now,
    };

    db.dossiers.push(newDossier);
    saveDatabase(db);

    // Instant real-time broadcast to doctors in this category, the patient, and admin
    broadcastEvent(
      'sync',
      {scope: 'dossier', category: newDossier.category},
      (u) =>
        u.role === 'admin' ||
        (u.role === 'patient' && u.id === user.id) ||
        (u.role === 'doctor' && u.category === newDossier.category),
    );

    res.status(201).json({dossier: newDossier});
  });

  app.get('/api/consultations', requireAuth(['patient']), (req, res) => {
    const user = (req as express.Request & {authUser: AuthUser}).authUser;
    const db = loadDatabase();
    const consultations = db.consultations
      .filter((c) => c.patientId === user.id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    res.json({consultations});
  });

  app.get('/api/history', requireAuth(['patient']), (req, res) => {
    const user = (req as express.Request & {authUser: AuthUser}).authUser;
    const db = loadDatabase();
    const history = buildHistoryForPatient(db, user.id);
    res.json({history});
  });

  // --- DOCTOR ENDPOINTS ---
  app.get('/api/doctor/dossiers', requireAuth(['doctor']), (req, res) => {
    const user = (req as express.Request & {authUser: AuthUser}).authUser;
    const db = loadDatabase();
    const dossiers = db.dossiers
      .filter((d) => d.category === user.category)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    res.json({dossiers});
  });

  app.get(
    '/api/doctor/patients/:patientId/history',
    requireAuth(['doctor']),
    (req, res) => {
      const user = (req as express.Request & {authUser: AuthUser}).authUser;
      const {patientId} = req.params;
      const db = loadDatabase();
      const hasDossierInCategory = db.dossiers.some(
        (d) => d.patientId === patientId && d.category === user.category,
      );
      if (!hasDossierInCategory) {
        res.status(403).json({
          error:
            'Ce patient ne possède pas de dossier dans votre catégorie médicale.',
        });
        return;
      }
      const history = buildHistoryForPatient(db, patientId, user.category);
      res.json({history});
    },
  );

  app.post(
    '/api/doctor/dossiers/:id/respond',
    requireAuth(['doctor']),
    (req, res) => {
      const user = (req as express.Request & {authUser: AuthUser}).authUser;
      const {id} = req.params;
      const {textResponse, audioUrl, videoUrl, status} = req.body as {
        textResponse?: string;
        audioUrl?: string | null;
        videoUrl?: string | null;
        status?: DossierStatus;
      };

      const cleanText = (textResponse || '').trim();
      const cleanAudio = audioUrl || null;
      const cleanVideo = videoUrl || null;

      if (!cleanText && !cleanAudio && !cleanVideo) {
        res.status(400).json({
          error:
            'Veuillez fournir au moins une réponse écrite, un message vocal ou une vidéo explicative.',
        });
        return;
      }

      const db = loadDatabase();
      const dossier = db.dossiers.find((d) => d.id === id);
      if (!dossier) {
        res.status(404).json({error: 'Dossier médical introuvable.'});
        return;
      }

      if (dossier.category !== user.category) {
        res.status(403).json({
          error:
            'Vous ne pouvez répondre qu’aux dossiers de votre catégorie médicale.',
        });
        return;
      }

      const newResponse: DoctorResponse = {
        id: `resp-${crypto.randomUUID()}`,
        doctorId: user.id,
        doctorName: user.name,
        doctorCategory: user.category!,
        textResponse: cleanText,
        audioUrl: cleanAudio,
        videoUrl: cleanVideo,
        createdAt: new Date().toISOString(),
      };

      dossier.responses.push(newResponse);
      dossier.status = status || 'traite';
      dossier.updatedAt = new Date().toISOString();
      saveDatabase(db);

      // Instant push to that specific patient & category doctors
      broadcastEvent(
        'sync',
        {scope: 'response', dossierId: dossier.id},
        (u) =>
          (u.role === 'patient' && u.id === dossier.patientId) ||
          (u.role === 'doctor' && u.category === dossier.category),
      );

      res.status(201).json({dossier, response: newResponse});
    },
  );

  app.get('/api/doctor/consultations', requireAuth(['doctor']), (req, res) => {
    const user = (req as express.Request & {authUser: AuthUser}).authUser;
    const db = loadDatabase();
    const consultations = db.consultations
      .filter((c) => c.doctorCategory === user.category)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    res.json({consultations});
  });

  app.post('/api/doctor/consultations', requireAuth(['doctor']), (req, res) => {
    const user = (req as express.Request & {authUser: AuthUser}).authUser;
    const {
      patientId,
      dossierId,
      appointmentDate,
      appointmentTime,
      clinicLocation,
      itemsToBring,
      doctorNotes,
      handwrittenSignature,
    } = req.body as {
      patientId?: string;
      dossierId?: string | null;
      appointmentDate?: string;
      appointmentTime?: string;
      clinicLocation?: string;
      itemsToBring?: string[];
      doctorNotes?: string;
      handwrittenSignature?: string;
    };

    if (!patientId || !appointmentDate?.trim() || !appointmentTime?.trim()) {
      res.status(400).json({
        error:
          'Veuillez sélectionner le patient et préciser la date et l’heure du rendez-vous.',
      });
      return;
    }

    const db = loadDatabase();
    const patient = db.patients.find((p) => p.id === patientId);
    const fallbackDossier = dossierId
      ? db.dossiers.find((d) => d.id === dossierId)
      : db.dossiers.find((d) => d.patientId === patientId);

    const pName = patient?.name || fallbackDossier?.patientName;
    const pPhone = patient?.phone || fallbackDossier?.patientPhone || '';
    const pEmail = patient?.email || fallbackDossier?.patientEmail || '';

    if (!pName) {
      res.status(404).json({error: 'Patient introuvable.'});
      return;
    }

    const cleanItems = Array.isArray(itemsToBring)
      ? itemsToBring.map((i) => i.trim()).filter(Boolean)
      : [];

    if (cleanItems.length === 0 && !(doctorNotes || '').trim()) {
      res.status(400).json({
        error:
          'Veuillez indiquer les documents/éléments à apporter ou des consignes pour la consultation réelle.',
      });
      return;
    }

    const newSheet: ConsultationSheet = {
      id: `con-${crypto.randomUUID()}`,
      referenceCode: generateReferenceCode('CON'),
      patientId,
      patientName: pName,
      patientPhone: pPhone,
      patientEmail: pEmail,
      dossierId: dossierId || null,
      doctorId: user.id,
      doctorName: user.name,
      doctorCategory: user.category!,
      appointmentDate: appointmentDate.trim(),
      appointmentTime: appointmentTime.trim(),
      clinicLocation: (
        clinicLocation || 'Cabinet Médical Dr.Med Rayen Bouazizi'
      ).trim(),
      itemsToBring: cleanItems,
      doctorNotes: (doctorNotes || '').trim(),
      handwrittenSignature: (handwrittenSignature || user.name).trim(),
      createdAt: new Date().toISOString(),
    };

    db.consultations.push(newSheet);

    if (dossierId) {
      const dossier = db.dossiers.find((d) => d.id === dossierId);
      if (dossier && dossier.category === user.category) {
        dossier.status = 'consultation_requise';
        dossier.updatedAt = new Date().toISOString();
      }
    }

    saveDatabase(db);

    broadcastEvent(
      'sync',
      {scope: 'consultation', consultationId: newSheet.id},
      (u) =>
        u.role === 'admin' ||
        (u.role === 'patient' && u.id === patientId) ||
        (u.role === 'doctor' && u.category === user.category),
    );

    res.status(201).json({consultation: newSheet});
  });

  return app;
}
