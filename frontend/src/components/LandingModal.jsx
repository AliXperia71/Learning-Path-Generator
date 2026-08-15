import { useEffect, useRef } from 'react';
import { X, EyeOff } from 'lucide-react';

// Full-screen "About Course Forge" pop-up. The marketing page is a standalone
// document under public/landing/ shown in an iframe — it carries its own design
// system, which would collide with Tailwind's if it were inlined into the app.
// See public/landing/README.md.
//
//   onClose      — dismiss for now; the modal comes back on the next sign-in
//   onNeverShow  — dismiss for good
export default function LandingModal({ theme, onClose, onNeverShow }) {
  const iframeRef = useRef(null);

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

  // The landing page's sign-up buttons post back here so a call-to-action click
  // lands the user on the real form instead of doing nothing.
  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'cf-landing-close') onClose();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onClose]);

  // Theme toggle stays usable behind the modal — keep the iframe in step with it
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'cf-theme', theme },
      window.location.origin
    );
  }, [theme]);

  const buttonBase =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border';

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-0 sm:p-6 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="About Course Forge"
    >
      <div className="relative w-full h-full max-w-6xl mx-auto overflow-hidden sm:rounded-2xl shadow-2xl">
        <iframe
          ref={iframeRef}
          // Loaded with the current theme so it paints correctly on the first frame
          src={`/landing/index.html?embed=1&theme=${theme === 'dark' ? 'dark' : 'light'}`}
          title="About Course Forge"
          className="w-full h-full border-0 block"
        />

        <div className="absolute top-4 right-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onNeverShow}
            title="Don't open this automatically again"
            className={`${buttonBase} bg-card/90 backdrop-blur-md text-ink-soft border-line-strong/40 hover:bg-card`}
          >
            <EyeOff size={13} /> Do not show again
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className={`${buttonBase} bg-brand text-brand-fg border-brand hover:opacity-90`}
          >
            <X size={13} /> Close
          </button>
        </div>
      </div>
    </div>
  );
}
