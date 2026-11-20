import {Mic, Square, Trash2, Upload, Video} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import {uploadMediaFile} from '../lib/api';

interface MediaRecorderWidgetProps {
  mode: 'audio' | 'video';
  label: string;
  currentUrl: string | null;
  onChangeUrl: (url: string | null) => void;
}

export function MediaRecorderWidget({
  mode,
  label,
  currentUrl,
  onChangeUrl,
}: MediaRecorderWidgetProps) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    setError('');
    try {
      const constraints =
        mode === 'video' ? {video: true, audio: true} : {audio: true};
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (mode === 'video' && liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play().catch(() => {});
      }

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const mimeType = mode === 'video' ? 'video/webm' : 'audio/webm';
        const ext = 'webm';
        const blob = new Blob(chunksRef.current, {type: mimeType});
        const file = new File([blob], `enregistrement-${mode}-${Date.now()}.${ext}`, {
          type: mimeType,
        });

        setUploading(true);
        try {
          const uploaded = await uploadMediaFile(file);
          onChangeUrl(uploaded.url);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Impossible de téléverser l’enregistrement.',
          );
        } finally {
          setUploading(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setError(
        mode === 'video'
          ? 'Caméra ou microphone indisponible. Vous pouvez importer un fichier vidéo ci-dessous.'
          : 'Microphone indisponible. Vous pouvez importer un fichier audio ci-dessous.',
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError('');
    setUploading(true);
    try {
      const uploaded = await uploadMediaFile(fileList[0]);
      onChangeUrl(uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur d’envoi du fichier.');
    } finally {
      setUploading(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          {mode === 'video' ? (
            <Video className="w-4 h-4 text-[#0B57D0]" />
          ) : (
            <Mic className="w-4 h-4 text-[#0B57D0]" />
          )}
          {label}
        </span>

        <div className="flex items-center gap-2">
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={uploading}
              className="px-3 py-1.5 bg-[#0B57D0] hover:bg-[#0842A0] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {mode === 'video' ? <Video className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              Enregistrer
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              Arrêter ({formatTimer(seconds)})
            </button>
          )}

          <label className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Importer
            <input
              type="file"
              accept={mode === 'video' ? 'video/*' : 'audio/*'}
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </label>
        </div>
      </div>

      {recording && mode === 'video' && (
        <video
          ref={liveVideoRef}
          muted
          playsInline
          className="w-full max-h-48 rounded-lg bg-slate-900 object-cover"
        />
      )}

      {uploading && (
        <p className="text-xs text-[#0B57D0] font-medium">
          Envoi du fichier en cours...
        </p>
      )}

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      {currentUrl && !recording && (
        <div className="flex flex-col gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
          {mode === 'video' ? (
            <video src={currentUrl} controls className="w-full max-h-56 rounded-lg bg-black" />
          ) : (
            <audio src={currentUrl} controls className="w-full" />
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onChangeUrl(null)}
              className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Retirer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
