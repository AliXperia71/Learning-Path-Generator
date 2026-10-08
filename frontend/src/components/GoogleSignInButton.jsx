import { useEffect, useRef, useState } from 'react';
import {
  IS_NATIVE_APP,
  GOOGLE_CLIENT_ID as CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID as IOS_CLIENT_ID,
  GOOGLE_SIGN_IN_AVAILABLE
} from '../utils/platform';
import { loadGis } from '../utils/googleScripts';

/**
 * Renders Google's official "Sign in with Google" button.
 *
 * Uses Google Identity Services straight from their CDN rather than a wrapper
 * package — no npm dependency, and nothing to break when React majors change.
 *
 * If VITE_GOOGLE_CLIENT_ID isn't set this renders nothing at all, so the sign-in
 * page stays clean until the OAuth client actually exists.
 */

// Inside the iOS app GIS can't work: its popup finishes by messaging
// window.opener, and in the app that popup opens outside the webview, so it hangs
// on a blank accounts.google.com page. The app uses the native Google sheet
// instead and sends the resulting ID token to the same /api/auth/google.

let socialLoginReady = null;
function nativeSocialLogin() {
  // Loaded only in the app, so the website bundle never pulls it in
  socialLoginReady ??= import('@capgo/capacitor-social-login').then(async ({ SocialLogin }) => {
    await SocialLogin.initialize({
      google: {
        iOSClientId: IOS_CLIENT_ID,
        // The web client as the server client makes the ID token's audience the
        // web client, which the backend already verifies
        iOSServerClientId: CLIENT_ID,
        mode: 'online'
      }
    });
    return SocialLogin;
  });
  return socialLoginReady;
}

function NativeGoogleButton({ onCredential }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    setBusy(true);
    setError('');
    try {
      const SocialLogin = await nativeSocialLogin();
      const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
      const idToken = res?.result?.idToken;
      if (!idToken) throw new Error('no idToken');
      await onCredential(idToken);
    } catch (e) {
      // Closing the Google sheet is a choice, not an error worth showing
      if (!/cancel/i.test(String(e?.message || e))) setError('Google sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="flex items-center justify-center gap-2.5 w-[300px] h-10 rounded-full border border-line-strong bg-card text-ink text-sm font-medium transition-all cursor-pointer hover:bg-line disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
        </svg>
        {busy ? 'Signing in…' : 'Continue with Google'}
      </button>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

export default function GoogleSignInButton({ onCredential, theme }) {
  if (IS_NATIVE_APP) {
    return GOOGLE_SIGN_IN_AVAILABLE ? <NativeGoogleButton onCredential={onCredential} /> : null;
  }
  return <WebGoogleButton onCredential={onCredential} theme={theme} />;
}

function WebGoogleButton({ onCredential, theme }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    loadGis()
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

  // gis-button: see index.css — clips the white halo Google's iframe paints.
  return <div ref={containerRef} className="gis-button flex justify-center" />;
}
