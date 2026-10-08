// Loads Google's browser SDKs straight from their CDN on first use — no npm
// dependency, and the bundle never carries them for users who don't need them.

export const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const GAPI_SRC = 'https://apis.google.com/js/api.js';

// Resolves once the script at `src` has loaded. Safe to call repeatedly: a script
// already on the page is reused instead of injected twice.
export function loadScript(src, isReady = () => false) {
  return new Promise((resolve, reject) => {
    if (isReady()) return resolve();

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded) return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Google Identity Services — sign-in button and OAuth access tokens
export const loadGis = () => loadScript(GIS_SRC, () => Boolean(window.google?.accounts));
