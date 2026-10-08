import { GOOGLE_CLIENT_ID, GOOGLE_API_KEY, GOOGLE_APP_ID } from './platform';
import { GAPI_SRC, loadGis, loadScript } from './googleScripts';

/**
 * Lets the user pick their resume out of Google Drive and hands it back as a
 * plain File, so the rest of the app can't tell it apart from a local upload.
 *
 * Scope is drive.file — the narrowest one, and non-sensitive in Google's eyes:
 * the app only ever sees the single file the user picks, nothing else in Drive.
 */
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_DOC = 'application/vnd.google-apps.document';

// What the backend can parse, plus native Google Docs (exported to PDF below)
const PICKABLE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
  GOOGLE_DOC
].join(',');

// Access tokens last about an hour — keep one in memory so a second pick in the
// same session doesn't flash the consent popup again
let cachedToken = null;

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  await loadGis();

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (res) => {
        if (res.error) return reject(new Error(res.error_description || res.error));
        cachedToken = { value: res.access_token, expiresAt: Date.now() + Number(res.expires_in) * 1000 };
        resolve(res.access_token);
      },
      // Fires when the popup is closed or blocked — closing it is a choice, not an error
      error_callback: (err) => reject(err?.type === 'popup_closed' ? new DriveCancelled() : new Error(err?.message || 'Google authorization failed.'))
    });
    client.requestAccessToken();
  });
}

class DriveCancelled extends Error {}

let pickerReady = null;
function loadPicker() {
  pickerReady ??= loadScript(GAPI_SRC, () => Boolean(window.gapi)).then(
    () => new Promise((resolve) => window.gapi.load('picker', resolve))
  );
  return pickerReady;
}

function showPicker(token) {
  return new Promise((resolve) => {
    const { picker } = window.google;
    const view = new picker.DocsView(picker.ViewId.DOCS).setMimeTypes(PICKABLE_TYPES).setMode(picker.DocsViewMode.LIST);

    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_API_KEY)
      // Without the app ID, drive.file doesn't grant access to the picked file
      .setAppId(GOOGLE_APP_ID)
      .setTitle('Choose your resume')
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs[0]);
        else if (data.action === picker.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}

async function download(doc, token) {
  const isGoogleDoc = doc.mimeType === GOOGLE_DOC;
  const url = isGoogleDoc
    ? `${DRIVE_FILES}/${doc.id}/export?mimeType=application/pdf`
    : `${DRIVE_FILES}/${doc.id}?alt=media`;

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Couldn't download "${doc.name}" from Drive.`);

  const blob = await response.blob();
  const name = isGoogleDoc ? `${doc.name}.pdf` : doc.name;
  return new File([blob], name, { type: isGoogleDoc ? 'application/pdf' : doc.mimeType });
}

// Resolves to a File, or null if the user backs out at any step
export async function pickResumeFromDrive() {
  try {
    const [token] = await Promise.all([getAccessToken(), loadPicker()]);
    const doc = await showPicker(token);
    return doc ? await download(doc, token) : null;
  } catch (err) {
    if (err instanceof DriveCancelled) return null;
    throw err;
  }
}
