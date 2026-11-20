import {ArrowLeft, Contrast, RotateCcw, X, ZoomIn, ZoomOut} from 'lucide-react';
import {useEffect, useState} from 'react';

interface ImageLightboxModalProps {
  imageUrl: string | null;
  imageName: string;
  onClose: () => void;
}

export function ImageLightboxModal({
  imageUrl,
  imageName,
  onClose,
}: ImageLightboxModalProps) {
  const [zoom, setZoom] = useState(1);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    if (!imageUrl) return;
    setZoom(1);
    setHighContrast(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [imageUrl, onClose]);

  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      {/* Top Bar with prominent Sortir / Fermer button */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-slate-900 border-b border-slate-800 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 bg-white text-slate-900 hover:bg-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Sortir de l’image
          </button>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">
              {imageName || 'Imagerie IRM / Radio'}
            </p>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Visualisation haute clarté · Appuyez sur Échap ou cliquez à l’extérieur pour sortir
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
            title="Dézoomer"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono-tabular text-xs w-11 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
            title="Zoomer"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setHighContrast((c) => !c)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
              highContrast
                ? 'bg-[#0B57D0] text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Contrast className="w-4 h-4" />
            <span className="hidden sm:inline">Contraste IRM</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setHighContrast(false);
            }}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer"
            title="Réinitialiser"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Fermer</span>
          </button>
        </div>
      </div>

      {/* Clicking outside the image exits immediately */}
      <div
        onClick={onClose}
        className="flex-1 overflow-auto flex items-center justify-center p-4 sm:p-6 cursor-zoom-out"
      >
        <img
          src={imageUrl}
          alt={imageName || 'Image médicale'}
          referrerPolicy="no-referrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: `scale(${zoom})`,
            filter: highContrast ? 'contrast(1.45) brightness(1.08)' : 'none',
          }}
          className="max-w-full max-h-full object-contain transition-transform duration-150 rounded-lg cursor-default"
        />
      </div>
    </div>
  );
}
