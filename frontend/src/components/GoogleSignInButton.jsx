import { useEffect, useRef } from 'react';

/**
 * Renders Google's official "Sign in with Google" button.
 *
 * Uses Google Identity Services straight from their CDN rather than a wrapper
 * package — no npm dependency, and nothing to break when React majors change.
 *
 * If VITE_GOOGLE_CLIENT_ID isn't set this renders nothing at all, so the sign-in
 * page stays clean until the OAuth client actually exists.
 */
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GIS_SRC = 'https://accounts.google.com/gsi/client';

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();

    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function GoogleSignInButton({ onCredential, theme }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    loadGisScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => onCredential(response.credential)
        });
        containerRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width: 300
        });
      })
      .catch(() => {
        // Offline or the script is blocked — password sign-in still works
      });

    return () => {
      cancelled = true;
    };
    // Re-render the button when the theme flips so it doesn't clash with the page
  }, [onCredential, theme]);

  if (!CLIENT_ID) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
