// Where the app is running, decided once at load.

// True inside the Capacitor iOS shell, which injects window.Capacitor into the page
export const IS_NATIVE_APP = Boolean(window.Capacitor?.isNativePlatform?.());

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
export const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID;

// The website needs the web client ID; the iOS app signs in natively and also
// needs the iOS client ID. Without them the button (and its "or" divider) hide.
export const GOOGLE_SIGN_IN_AVAILABLE =
  Boolean(GOOGLE_CLIENT_ID) && (!IS_NATIVE_APP || Boolean(GOOGLE_IOS_CLIENT_ID));
