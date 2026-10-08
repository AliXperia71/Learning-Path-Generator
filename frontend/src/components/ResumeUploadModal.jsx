import { useEffect, useRef, useState } from 'react';
import { CloudUpload, FileText, LoaderCircle, X } from 'lucide-react';
import { GOOGLE_DRIVE_AVAILABLE } from '../utils/platform';
import { pickResumeFromDrive } from '../utils/googleDrive';

// Mirrors what backend/services/resume_service.py can parse
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.webp'];
// Same cap as MAX_UPLOAD_BYTES in backend/routes/resume.py
const MAX_BYTES = 5 * 1024 * 1024;
// Brave Shields blocks the Picker's cross-site docs.google.com frame, and the
// failure happens inside Google's popup where we can't catch it — so just warn
const IS_BRAVE = Boolean(navigator.brave);

function validate(file) {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(ext)) return 'That file type isn’t supported — use PDF, DOCX, TXT, or an image.';
  if (file.size > MAX_BYTES) return 'That file is over 5MB — try a smaller export.';
  if (file.size === 0) return 'That file is empty.';
  return '';
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Google Drive's triangle mark, inlined like the "G" on the sign-in button
function DriveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 87.3 78" aria-hidden="true">
      <path fill="#0066DA" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" />
      <path fill="#00AC47" d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9.06 9.06 0 0 0 0 53h27.5z" />
      <path fill="#EA4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" />
      <path fill="#00832D" d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684FC" d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#FFBA00" d="M73.4 26.5 60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  );
}

// Career Boost upload dialog: drag & drop, browse the device, or import from Drive.
//
//   onClose   — dismiss without changing the current pick
//   onSelect  — called with the chosen File when the user confirms
export default function ResumeUploadModal({ onClose, onSelect }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);

  // Esc closes, and the page behind stays put instead of scrolling under the overlay
  useEffect(() => {
    const onKeyDown = (e) => e.key === 'Escape' && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const choose = (candidate) => {
    if (!candidate) return;
    const problem = validate(candidate);
    setError(problem);
    setFile(problem ? null : candidate);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    choose(e.dataTransfer.files?.[0]);
  };

  // dragleave also fires when the pointer crosses onto a child — only clear the
  // highlight once it has actually left the zone
  const onDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  };

  const importFromDrive = async () => {
    setDriveBusy(true);
    setError('');
    try {
      choose(await pickResumeFromDrive());
    } catch (err) {
      setError(err.message || 'Google Drive import failed. Please try again.');
    } finally {
      setDriveBusy(false);
    }
  };

  const confirm = () => {
    onSelect(file);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-upload-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md bg-card border border-line rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="resume-upload-title" className="text-sm font-semibold tracking-wide text-ink uppercase">
            Upload resume
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="p-1.5 -m-1.5 rounded-lg text-muted hover:text-ink hover:bg-line transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-2 px-4 py-10 rounded-xl border-2 border-dashed text-center transition-all ${
            dragging ? 'border-accent bg-accent/10' : 'border-line-strong bg-surface'
          }`}
        >
          <CloudUpload size={28} className={dragging ? 'text-accent' : 'text-muted'} />
          <p className="text-xs font-medium text-ink-soft">
            Drag & drop your resume or{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-accent font-semibold underline underline-offset-2 hover:text-accent-hover cursor-pointer"
            >
              Browse
            </button>
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={(e) => {
              choose(e.target.files?.[0]);
              // Reset so re-picking the same file after clearing it still fires onChange
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>

        {GOOGLE_DRIVE_AVAILABLE && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-line" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">or</span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <button
              type="button"
              onClick={importFromDrive}
              disabled={driveBusy}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-line-strong bg-card hover:bg-line text-xs font-medium text-ink transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            >
              {driveBusy ? <LoaderCircle size={16} className="animate-spin" /> : <DriveIcon />}
              {driveBusy ? 'Connecting to Drive…' : 'Import from Google Drive'}
            </button>
            {IS_BRAVE && (
              <p className="mt-2 text-[11px] text-muted text-center">
                Using Brave? If Drive doesn’t open, turn Shields off for this site.
              </p>
            )}
          </>
        )}

        <div className="flex items-center justify-between gap-3 mt-3 text-[11px] text-muted">
          <span>Supported: PDF, DOCX, TXT, PNG, JPG, WEBP</span>
          <span className="shrink-0">Max size: 5MB</span>
        </div>

        {file && (
          <div className="flex items-center gap-2.5 mt-4 p-3 rounded-xl border border-line bg-surface">
            <FileText size={16} className="shrink-0 text-accent" />
            <span className="flex-1 min-w-0 truncate text-xs font-medium text-ink">{file.name}</span>
            <span className="shrink-0 text-[11px] text-muted">{formatSize(file.size)}</span>
            <button
              type="button"
              onClick={() => setFile(null)}
              title="Remove"
              className="shrink-0 p-1 rounded-md text-muted hover:text-ink hover:bg-line transition-all cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-ink-soft hover:bg-line transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!file}
            className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-brand-fg text-xs font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Use this file
          </button>
        </div>
      </div>
    </div>
  );
}
