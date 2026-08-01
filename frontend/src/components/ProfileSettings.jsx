import { useState } from 'react';
import { ArrowLeft, User, Mail, KeyRound, Save, Check, ShieldCheck } from 'lucide-react';

const BIO_LIMIT = 500;

const inputClass =
  'w-full p-3 bg-surface border border-transparent rounded-xl focus:outline-hidden focus:border-blue-500 focus:bg-card text-sm transition-all font-medium placeholder-muted/70';
const labelClass = 'block text-xs font-semibold text-muted mb-2';
const cardClass = 'bg-card p-6 rounded-2xl border border-line shadow-[0_4px_24px_rgba(0,0,0,0.02)]';
const buttonClass =
  'bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-900 disabled:opacity-50 text-white font-medium py-2.5 px-5 rounded-xl transition-all cursor-pointer inline-flex items-center justify-center gap-2 text-sm';

export default function ProfileSettings({ authFetch, BACKEND_URL, profile, onProfileChange, onBack }) {
  // Account form — seeded from the profile the parent already loaded
  const [username, setUsername] = useState(profile?.username || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [accountError, setAccountError] = useState('');
  const [accountNotice, setAccountNotice] = useState('');
  const [accountSaved, setAccountSaved] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Google-only accounts have no password yet — they're setting one, not changing it
  const hasPassword = profile?.has_password !== false;

  // Stale "Saved." / "No changes to save!" shouldn't linger while the user edits
  const clearAccountStatus = () => {
    setAccountNotice('');
    setAccountSaved(false);
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();
    setAccountError('');
    setAccountNotice('');
    setAccountSaved(false);

    // Compare against what the server would actually store (it trims, lowercases
    // the identifiers, and turns an empty bio into null) so an untouched form —
    // or one where only casing/whitespace changed — counts as no change.
    const unchanged =
      username.trim().toLowerCase() === (profile?.username || '') &&
      email.trim().toLowerCase() === (profile?.email || '') &&
      bio.trim() === (profile?.bio || '');
    if (unchanged) {
      setAccountNotice('No changes to save!');
      return;
    }

    setSavingAccount(true);
    try {
      const response = await authFetch(`${BACKEND_URL}/api/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, bio })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not save your changes.');
      }
      onProfileChange(data); // pushes the new username straight into the navbar
      setAccountSaved(true);
    } catch (err) {
      setAccountError(err.message);
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("Those passwords don't match.");
      return;
    }
    setSavingPassword(true);
    try {
      const response = await authFetch(`${BACKEND_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: hasPassword ? currentPassword : null,
          new_password: newPassword
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not update your password.');
      }
      setPasswordSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (!hasPassword) onProfileChange({ ...profile, has_password: true });
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fadeIn">
      <button
        onClick={onBack}
        className="text-muted hover:text-ink text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
      >
        <ArrowLeft size={13} /> Back
      </button>

      <div className="text-center space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Profile settings</h2>
        <p className="text-xs text-muted font-medium">Manage how you sign in and how others see you.</p>
      </div>

      {/* ---------------- Account ---------------- */}
      <section className={cardClass}>
        <h3 className="text-sm font-semibold tracking-wide text-ink uppercase mb-4 flex items-center gap-2">
          <User size={14} /> Account
        </h3>
        <form onSubmit={handleSaveAccount} className="space-y-4">
          <div>
            <label className={labelClass}>USERNAME</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); clearAccountStatus(); }}
              required
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9_]+"
              title="Letters, numbers and underscores only"
              className={inputClass}
            />
            <p className="text-[11px] text-faint mt-1.5">
              Letters, numbers and underscores. This is what your study group sees.
            </p>
          </div>

          <div>
            <label className={labelClass}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearAccountStatus(); }}
              required
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>ABOUT ME</label>
            <textarea
              value={bio}
              onChange={(e) => { setBio(e.target.value.slice(0, BIO_LIMIT)); clearAccountStatus(); }}
              rows={4}
              placeholder="What are you learning, and why? Your group can see this."
              className={`${inputClass} resize-y`}
            />
            <p className="text-[11px] text-faint mt-1.5 text-right">
              {bio.length}/{BIO_LIMIT}
            </p>
          </div>

          {accountError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50/60 dark:bg-rose-500/10 border border-rose-500/10 p-2.5 rounded-xl">
              {accountError}
            </p>
          )}
          {accountNotice && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50/60 dark:bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
              {accountNotice}
            </p>
          )}
          {accountSaved && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1.5">
              <Check size={13} /> Saved.
            </p>
          )}

          <button type="submit" disabled={savingAccount} className={buttonClass}>
            <Save size={14} /> {savingAccount ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </section>

      {/* ---------------- Password ---------------- */}
      <section className={cardClass}>
        <h3 className="text-sm font-semibold tracking-wide text-ink uppercase mb-4 flex items-center gap-2">
          <KeyRound size={14} /> {hasPassword ? 'Change password' : 'Set a password'}
        </h3>
        {!hasPassword && (
          <p className="text-xs text-muted font-medium mb-4">
            You signed up with Google. Setting a password lets you sign in with your username too.
          </p>
        )}
        <form onSubmit={handleSavePassword} className="space-y-4">
          {hasPassword && (
            <div>
              <label className={labelClass}>CURRENT PASSWORD</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className={inputClass}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>NEW PASSWORD</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Minimum 8 characters"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>CONFIRM NEW PASSWORD</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className={inputClass}
            />
          </div>

          {passwordError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50/60 dark:bg-rose-500/10 border border-rose-500/10 p-2.5 rounded-xl">
              {passwordError}
            </p>
          )}
          {passwordSaved && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium inline-flex items-center gap-1.5">
              <Check size={13} /> Password updated.
            </p>
          )}

          <button type="submit" disabled={savingPassword} className={buttonClass}>
            <KeyRound size={14} />{' '}
            {savingPassword ? 'Saving...' : hasPassword ? 'Update password' : 'Set password'}
          </button>
        </form>
      </section>

      {/* ---------------- Connected accounts ---------------- */}
      <section className={cardClass}>
        <h3 className="text-sm font-semibold tracking-wide text-ink uppercase mb-4 flex items-center gap-2">
          <ShieldCheck size={14} /> Connected accounts
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-soft font-medium inline-flex items-center gap-2">
            <Mail size={14} className="text-muted" /> Google
          </span>
          {profile?.has_google ? (
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full inline-flex items-center gap-1.5">
              <Check size={12} /> Connected
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-muted bg-surface border border-line px-3 py-1 rounded-full">
              Not connected
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
