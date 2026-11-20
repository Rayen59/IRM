import {
  Camera,
  Check,
  FlipHorizontal,
  Microscope,
  Radio,
  RotateCcw,
  ScanLine,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {uploadMediaFile} from '../lib/api';
import type {MediaAttachment} from '../types/medical';

export type ScanModality = 'radio' | 'irm' | 'neurones' | 'cellules';

interface MedicalCameraScannerProps {
  open: boolean;
  onClose: () => void;
  onAttachScan: (attachment: MediaAttachment) => void;
}

const MODALITY_OPTIONS: Array<{
  id: ScanModality;
  label: string;
  desc: string;
  badge: string;
}> = [
  {
    id: 'irm',
    label: 'IRM',
    desc: 'Contraste tissus mous & coupes haute définition',
    badge: 'IRM · T1/T2',
  },
  {
    id: 'radio',
    label: 'Radio (Rayons X)',
    desc: 'Radiographie osseuse & contours structurels',
    badge: 'RADIOGRAPHIE X',
  },
  {
    id: 'neurones',
    label: 'Neuro-Imagerie',
    desc: 'Étude des neurones, tractographie & faisceaux',
    badge: 'NEURO-SCAN DTI',
  },
  {
    id: 'cellules',
    label: 'Cellules & Tissus',
    desc: 'Imagerie cellulaire haute précision & histologie',
    badge: 'CYTO-SCAN 100µm',
  },
];

function applyMedicalTransform(
  sourceCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  modality: ScanModality,
  contrastVal: number,
  edgeStrength: number,
) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (!w || !h) return;

  targetCanvas.width = w;
  targetCanvas.height = h;

  const sCtx = sourceCanvas.getContext('2d');
  const tCtx = targetCanvas.getContext('2d');
  if (!sCtx || !tCtx) return;

  const srcData = sCtx.getImageData(0, 0, w, h);
  const src = srcData.data;
  const out = tCtx.createImageData(w, h);
  const dst = out.data;

  // Precompute luminance buffer for Sobel edge / ridge detection
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    lum[i] = 0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2];
  }

  const contrastFactor = 0.8 + (contrastVal / 100) * 1.6;
  const edgeMult = (edgeStrength / 100) * 1.4;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const idx = p * 4;

      // Sobel gradient for anatomical boundaries / neural fibers / cellular membranes
      let grad = 0;
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
        const tl = lum[(y - 1) * w + (x - 1)];
        const tc = lum[(y - 1) * w + x];
        const tr = lum[(y - 1) * w + (x + 1)];
        const ml = lum[y * w + (x - 1)];
        const mr = lum[y * w + (x + 1)];
        const bl = lum[(y + 1) * w + (x - 1)];
        const bc = lum[(y + 1) * w + x];
        const br = lum[(y + 1) * w + (x + 1)];
        const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        grad = Math.min(255, Math.sqrt(gx * gx + gy * gy) * 0.45);
      }

      // Normalized luminance with contrast S-curve
      let norm = lum[p] / 255;
      norm = (norm - 0.5) * contrastFactor + 0.5;
      norm = Math.max(0, Math.min(1, norm));

      // Circular medical FOV vignette
      const dx = (x / w - 0.5) * 2;
      const dy = (y / h - 0.5) * 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vignette = Math.max(0.18, 1 - Math.pow(Math.max(0, dist - 0.55), 2) * 1.4);

      if (modality === 'radio') {
        // X-Ray bone/structure negative + crisp white bone edges
        const inverted = 1 - norm;
        const bone = Math.pow(inverted, 1.35) * 230 + grad * edgeMult * 0.7;
        const val = Math.min(255, Math.max(0, bone * vignette));
        dst[idx] = val * 0.92;
        dst[idx + 1] = val * 0.96;
        dst[idx + 2] = Math.min(255, val * 1.05);
      } else if (modality === 'irm') {
        // MRI T1/T2 soft-tissue slice contrast + sharp internal boundaries
        const tissue = Math.pow(norm, 1.15) * 215 + grad * edgeMult * 0.85;
        const val = Math.min(255, Math.max(0, tissue * vignette));
        dst[idx] = val;
        dst[idx + 1] = val;
        dst[idx + 2] = Math.min(255, val * 1.03);
      } else if (modality === 'neurones') {
        // Tractography / Neuronal fiber mapping (dark neural field + luminous axonal ridges)
        const ridge = Math.min(255, grad * (1.2 + edgeMult * 1.1));
        const base = norm * 42;
        const activity = Math.pow(norm, 2.2) * 140;
        dst[idx] = Math.min(255, (base * 0.4 + activity * 0.95) * vignette);
        dst[idx + 1] = Math.min(255, (base + ridge * 0.85 + activity * 0.45) * vignette);
        dst[idx + 2] = Math.min(255, (base * 1.8 + ridge * 1.25 + 16) * vignette);
      } else {
        // Cellules / Fluorescence & Histological Microscopy
        const membrane = Math.min(255, grad * (1.1 + edgeMult));
        const r = src[idx] / 255;
        const g = src[idx + 1] / 255;
        const b = src[idx + 2] / 255;
        const nuclei = Math.pow(1 - norm, 1.8) * 165;
        dst[idx] = Math.min(255, (nuclei * 0.85 + r * 70 + membrane * 0.55) * vignette);
        dst[idx + 1] = Math.min(255, (g * 95 + membrane * 1.05) * vignette);
        dst[idx + 2] = Math.min(255, (nuclei * 1.2 + b * 110 + membrane * 0.85) * vignette);
      }
      dst[idx + 3] = 255;
    }
  }

  tCtx.putImageData(out, 0, 0);

  // Subtle diagnostic calibration overlay (scale & modality tag)
  tCtx.save();
  tCtx.strokeStyle =
    modality === 'neurones'
      ? 'rgba(56, 189, 248, 0.55)'
      : modality === 'cellules'
        ? 'rgba(52, 211, 153, 0.55)'
        : 'rgba(226, 232, 240, 0.55)';
  tCtx.lineWidth = Math.max(1, w * 0.002);

  // Calibration ruler ticks on right edge
  const tickX = w - Math.max(18, w * 0.03);
  for (let i = 0; i <= 10; i++) {
    const ty = h * 0.25 + (h * 0.5 * i) / 10;
    const len = i % 5 === 0 ? Math.max(12, w * 0.022) : Math.max(6, w * 0.011);
    tCtx.beginPath();
    tCtx.moveTo(tickX - len, ty);
    tCtx.lineTo(tickX, ty);
    tCtx.stroke();
  }

  // Modality watermark stamp in top-left corner
  const fontSize = Math.max(12, Math.round(w * 0.02));
  tCtx.font = `bold ${fontSize}px monospace`;
  tCtx.fillStyle = 'rgba(248, 250, 252, 0.85)';
  const tag =
    MODALITY_OPTIONS.find((m) => m.id === modality)?.badge || 'SCAN MÉDICAL';
  tCtx.fillText(tag, Math.max(14, w * 0.025), Math.max(22, h * 0.045));
  tCtx.font = `${Math.round(fontSize * 0.8)}px monospace`;
  tCtx.fillStyle = 'rgba(203, 213, 225, 0.78)';
  tCtx.fillText(
    `DR.MED RAYEN BOUAZIZI · ${new Date().toLocaleDateString('fr-FR')}`,
    Math.max(14, w * 0.025),
    Math.max(22, h * 0.045) + fontSize * 1.25,
  );
  tCtx.restore();
}

export function MedicalCameraScanner({
  open,
  onClose,
  onAttachScan,
}: MedicalCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState('');
  const [captured, setCaptured] = useState(false);
  const [modality, setModality] = useState<ScanModality>('irm');
  const [contrast, setContrast] = useState(55);
  const [edgeStrength, setEdgeStrength] = useState(65);
  const [showOriginal, setShowOriginal] = useState(false);
  const [uploading, setUploading] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {ideal: facingMode},
          width: {ideal: 1280},
          height: {ideal: 960},
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraError(
        'Accès caméra bloqué ou indisponible sur cet appareil. Utilisez le bouton « Photo téléphone / Importer » ci-dessous.',
      );
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (open && !captured) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [open, captured, startCamera, stopCamera]);

  useEffect(() => {
    if (!captured || !rawCanvasRef.current || !processedCanvasRef.current) return;
    applyMedicalTransform(
      rawCanvasRef.current,
      processedCanvasRef.current,
      modality,
      contrast,
      edgeStrength,
    );
  }, [captured, modality, contrast, edgeStrength]);

  if (!open) return null;

  const captureFromLiveCamera = () => {
    const video = videoRef.current;
    const raw = rawCanvasRef.current;
    if (!video || !raw || !video.videoWidth) return;

    const maxDim = 1024;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    raw.width = Math.round(video.videoWidth * scale);
    raw.height = Math.round(video.videoHeight * scale);
    const ctx = raw.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, raw.width, raw.height);
    setCaptured(true);
    setShowOriginal(false);
  };

  const handlePhotoFile = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const img = new Image();
    const url = URL.createObjectURL(files[0]);
    img.onload = () => {
      const raw = rawCanvasRef.current;
      if (!raw) return;
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      raw.width = Math.round(img.width * scale);
      raw.height = Math.round(img.height * scale);
      const ctx = raw.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, raw.width, raw.height);
        setCaptured(true);
        setShowOriginal(false);
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleConfirmSend = async () => {
    const canvas = processedCanvasRef.current;
    if (!canvas) return;
    setUploading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png', 0.95),
      );
      if (!blob) throw new Error('Échec de génération de l’image.');
      const modLabel =
        MODALITY_OPTIONS.find((m) => m.id === modality)?.label || 'Scan';
      const file = new File(
        [blob],
        `${modLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`,
        {type: 'image/png'},
      );
      const uploaded = await uploadMediaFile(file);
      onAttachScan(uploaded);
      setCaptured(false);
      onClose();
    } catch (err) {
      setCameraError(
        err instanceof Error ? err.message : 'Erreur lors de l’envoi.',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 bg-[#0B57D0] text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ScanLine className="w-5 h-5" />
            <div>
              <h3 className="text-base font-bold">
                Capture Caméra & Transformation IRM / Radio
              </h3>
              <p className="text-xs text-blue-100">
                Prenez une photo de la zone appropriée, choisissez le type d’imagerie puis envoyez.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setCaptured(false);
              onClose();
            }}
            className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
            Sortir
          </button>
        </div>

        <div className="p-5 space-y-4">
          {cameraError && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-medium text-amber-800">
              {cameraError}
            </div>
          )}

          {/* Modality Selector */}
          <div>
            <p className="text-xs font-bold text-slate-700 mb-2">
              Type de transformation médicale :
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MODALITY_OPTIONS.map((opt) => {
                const active = modality === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setModality(opt.id)}
                    className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#EEF4FF] border-[#0B57D0] text-[#0B57D0]'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold">
                      {opt.id === 'irm' && <ScanLine className="w-3.5 h-3.5" />}
                      {opt.id === 'radio' && <Radio className="w-3.5 h-3.5" />}
                      {opt.id === 'neurones' && <Sparkles className="w-3.5 h-3.5" />}
                      {opt.id === 'cellules' && <Microscope className="w-3.5 h-3.5" />}
                      <span>{opt.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Camera View OR Transformed Preview */}
          <div className="relative bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 aspect-[4/3] flex items-center justify-center">
            {!captured ? (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Anatomical Alignment Reticle */}
                <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-sky-400/70 rounded-2xl flex items-end justify-center pb-3">
                  <span className="bg-slate-900/75 text-sky-200 text-[11px] font-semibold px-3 py-1 rounded-full">
                    Cadrez la zone anatomique appropriée
                  </span>
                </div>
              </>
            ) : (
              <>
                <canvas
                  ref={processedCanvasRef}
                  className={`w-full h-full object-contain ${showOriginal ? 'hidden' : 'block'}`}
                />
              </>
            )}

            {/* Hidden raw source canvas (visible only when toggling showOriginal) */}
            <canvas
              ref={rawCanvasRef}
              className={`w-full h-full object-contain ${captured && showOriginal ? 'block' : 'hidden'}`}
            />
          </div>

          {/* Controls */}
          {!captured ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))
                  }
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                >
                  <FlipHorizontal className="w-4 h-4" />
                  Changer caméra
                </button>

                <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Photo téléphone / Importer
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handlePhotoFile(e.target.files)}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={captureFromLiveCamera}
                disabled={Boolean(cameraError)}
                className="px-5 py-2.5 bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white text-sm font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                Capturer & Transformer
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span>Contraste médical</span>
                    <span className="font-mono-tabular">{contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full accent-[#0B57D0] cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span>Netteté neurones / contours</span>
                    <span className="font-mono-tabular">{edgeStrength}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={edgeStrength}
                    onChange={(e) => setEdgeStrength(Number(e.target.value))}
                    className="w-full accent-[#0B57D0] cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCaptured(false)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reprendre
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOriginal((v) => !v)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    {showOriginal ? 'Voir Transformée' : 'Voir Photo Originale'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmSend}
                  disabled={uploading}
                  className="px-5 py-2.5 bg-[#059669] hover:bg-[#047857] disabled:opacity-50 text-white text-sm font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  {uploading ? 'Envoi en cours...' : 'Valider & Ajouter au Dossier'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
