import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Layers,
  Clock,
  Calendar,
  BookOpen,
  Flag,
  CheckCircle2,
  XCircle,
  X,
  ArrowRight,
  RotateCcw,
  Video, // NEW: Imported Video icon to distinguish live YouTube streaming items
  LogOut,
  Lock,
  Download,
  FileText,
  Upload,
  ScanSearch,
  History,
  Plus,
  Trash2,
  Users,
  Sun,
  Moon,
  User,
  KeyRound,
  Mail
} from 'lucide-react';
import LoadingScreen from './components/LoadingScreen';
import CareerReport from './components/CareerReport';
import GroupSkills from './components/GroupSkills';
import ProfileSettings from './components/ProfileSettings';
import GoogleSignInButton from './components/GoogleSignInButton';
import LandingModal from './components/LandingModal';
import Logo from './components/Logo';
import { downloadRoadmapMarkdown, printRoadmapPdf } from './utils/roadmapExport';

// `??`, not `||`: an empty string is a meaningful value here — it means
// same-origin, which is how the Docker build runs (nginx proxies /api to the
// backend). `||` would treat "" as unset and send every call to 127.0.0.1.
// Unset (plain `npm run dev`) still falls through to the local backend.
const BACKEND_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

// Set once the user clicks "Do not show again" on the landing pop-up. Plain
// "Close" leaves it unset, so the page returns on the next sign-in.
const LANDING_HIDDEN_KEY = 'cf_landing_hidden';

// Google sign-in is opt-in: without a client ID the button and its divider are
// left out entirely rather than rendering something that can't work.
const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

// FastAPI sends `detail` as a string for our own HTTPExceptions but as a list of
// objects for validation failures — flatten both into something showable.
function readError(data, fallback) {
  if (typeof data?.detail === 'string') return data.detail;
  if (Array.isArray(data?.detail) && data.detail[0]?.msg) return data.detail[0].msg;
  return fallback;
}

// Step scripts for the animated loading page — one per long-running action
const ROADMAP_STEPS = [
  'Gauging topic complexity',
  'Calculating your optimal timeline',
  'Structuring weekly milestones',
  'Sourcing live video resources',
  'Polishing the blueprint',
];
const QUIZ_STEPS = ['Reviewing the milestone', 'Writing challenge questions', 'Calibrating difficulty'];
const GRADE_STEPS = ['Checking your answers', 'Writing per-question feedback', 'Scoring the assessment'];
const RESUME_STEPS = ['Parsing your resume', 'Running the ATS scan', 'Drafting enhancements', 'Matching job roles'];

export default function App() {
  // =========================================================================
  // NEW: Account session states — JWT persisted in localStorage
  // =========================================================================
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('cf_token'));
  // Full profile {id, email, username, bio, has_password, has_google} — cached in
  // localStorage so the navbar has a name to show before /auth/me comes back
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cf_user')) || null;
    } catch {
      return null;
    }
  });
  // login | register | forgot | reset
  const [authMode, setAuthMode] = useState(() =>
    new URLSearchParams(window.location.search).get('reset') ? 'reset' : 'login'
  );
  const [authIdentifier, setAuthIdentifier] = useState(''); // username OR email at login
  const [authEmail, setAuthEmail] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  // Reset token arrives in the emailed link as ?reset=<jwt>
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('reset') || '');

  // Dark mode — stored choice wins, otherwise follow the OS preference
  const [theme, setTheme] = useState(() =>
    localStorage.getItem('cf_theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // setItem here (not in the effect) so cf_theme stays unset until the user
  // explicitly toggles — keeps the system-preference default working
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('cf_theme', next);
  };

  // "About CourseForge" pop-up — opened automatically for signed-out visitors,
  // and on demand from the link above the sign-in card
  const [showLanding, setShowLanding] = useState(false);
  const closeLanding = () => setShowLanding(false);
  const neverShowLanding = () => {
    localStorage.setItem(LANDING_HIDDEN_KEY, '1');
    setShowLanding(false);
  };

  // Show a first-time visitor what CourseForge is before asking them to sign up.
  // Mount-only on purpose: authToken is lazily rehydrated from localStorage on
  // the first render, so an already-signed-in user returning to the tab is
  // recognised here and never interrupted. "Do not show again" is permanent;
  // plain "Close" lets it return on a later visit.
  useEffect(() => {
    if (localStorage.getItem('cf_token')) return;
    if (localStorage.getItem(LANDING_HIDDEN_KEY) === '1') return;
    setShowLanding(true);
  }, []);

  // Input Form States
  const [goal, setGoal] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('beginner');

  // =========================================================================
  // CHANGED: Tracking "Hours Per Day" intervals to align with backend service contracts
  // =========================================================================
  const [hoursPerDay, setHoursPerDay] = useState(2);

  // UI Flow Control States
  const [viewState, setViewState] = useState('prompt'); // prompt | loading | roadmap | quiz | career | groups | profile
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingSteps, setLoadingSteps] = useState(ROADMAP_STEPS);

  // Data Payload Storage States
  const [roadmapData, setRoadmapData] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({}); // { question_number: string }
  const [quizResult, setQuizResult] = useState(null);

  // NEW: Career Boost states — resume file + ATS scan report
  const [resumeFile, setResumeFile] = useState(null);
  const [careerReport, setCareerReport] = useState(null);

  // NEW: Saved session states — every generated roadmap persists server-side
  const [savedPaths, setSavedPaths] = useState([]);
  const [activePathId, setActivePathId] = useState(null);

  // Everything interactive locks while a generation request is in flight
  const isBusy = viewState === 'loading';

  // =========================================================================
  // NEW: Session history — fetch the user's saved roadmaps on login
  // =========================================================================
  const refreshSavedPaths = async (token = authToken) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/paths`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) setSavedPaths(await response.json());
    } catch {
      // History is a convenience — never block the app if it can't load
    }
  };

  useEffect(() => {
    if (authToken) refreshSavedPaths();
  }, [authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull the authoritative profile on login/reload — the token deliberately
  // carries no email or username, so the DB is the only source of truth
  useEffect(() => {
    if (!authToken) return;
    (async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        if (!response.ok) return;
        const data = await response.json();
        setProfile(data);
        localStorage.setItem('cf_user', JSON.stringify(data));
      } catch {
        // Fall back to the cached profile — never block the app on this
      }
    })();
  }, [authToken]);

  // Action: Load a past session — restores the roadmap and its original parameters
  const handleLoadPath = async (pathId) => {
    if (isBusy) return;
    try {
      const response = await authFetch(`${BACKEND_URL}/api/paths/${pathId}`);
      if (!response.ok) throw new Error('Could not load that session.');
      const record = await response.json();
      setRoadmapData(record.roadmap);
      setGoal(record.topic);
      setExperienceLevel(record.experience_level);
      setHoursPerDay(record.hours_per_day);
      setActivePathId(record.id);
      setActiveQuiz(null);
      setQuizResult(null);
      setViewState('roadmap');
    } catch (err) {
      alert(err.message);
    }
  };

  // Clear everything handleLoadPath filled in, so the prompt page is a blank
  // compose surface rather than the last path's leftovers.
  //
  // roadmapData has to go too, not just the view: CareerReport's back button
  // reads `roadmapData ? 'roadmap' : 'prompt'`, so a stale roadmap would
  // resurrect itself the moment you visited Career Boost and came back.
  //
  // experienceLevel and hoursPerDay deliberately survive — they read as
  // settings you carry between generations, not as part of one path.
  const clearActivePath = () => {
    setGoal('');
    setRoadmapData(null);
    setActivePathId(null);
    setActiveQuiz(null);
    setQuizResult(null);
    setViewState('prompt');
  };

  // The button form. The guard belongs here, not in clearActivePath — deleting
  // the open path must always reset, whatever else is in flight.
  const startNewPath = () => {
    if (!isBusy) clearActivePath();
  };

  // Action: Delete a saved session
  const handleDeletePath = async (e, pathId) => {
    e.stopPropagation(); // don't also trigger the row's load handler
    if (!confirm('Delete this learning path? This cannot be undone.')) return;
    try {
      await authFetch(`${BACKEND_URL}/api/paths/${pathId}`, { method: 'DELETE' });
      setSavedPaths(savedPaths.filter((p) => p.id !== pathId));
      // Deleting the path you're looking at leaves the same stale prompt text
      // behind as "+ New Path" used to, so it gets the same clean reset.
      if (pathId === activePathId) clearActivePath();
    } catch {
      alert('Failed to delete the session.');
    }
  };

  // Stores a freshly issued session and drops the user into the app
  const startSession = (data) => {
    const user = { email: data.email, username: data.username };
    localStorage.setItem('cf_token', data.access_token);
    localStorage.setItem('cf_user', JSON.stringify(user));
    setAuthToken(data.access_token);
    setProfile(user);
    setAuthPassword('');
    // Strip ?reset=... so a refresh doesn't drop back into the reset form
    window.history.replaceState({}, '', window.location.pathname);

    // The landing page deliberately does NOT open here. A visitor should see
    // what CourseForge is *before* being asked to make an account, so the
    // trigger lives in a mount effect gated on being signed out — see above.
    setShowLanding(false);
  };

  // Action: Register or log in, then persist the session token
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const body =
        authMode === 'register'
          ? { email: authEmail, username: authUsername, password: authPassword }
          : { identifier: authIdentifier, password: authPassword };

      const response = await fetch(`${BACKEND_URL}/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(readError(data, 'Authentication failed. Check your details.'));
      startSession(data);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Action: Exchange a Google ID token for a Course Forge session
  const handleGoogleCredential = async (credential) => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(readError(data, 'Google sign-in failed.'));
      startSession(data);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Action: Ask for a reset link / username reminder. The backend answers the
  // same way whether or not the account exists, so the UI shows one message.
  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');
    setAuthLoading(true);
    try {
      await Promise.all(
        ['forgot-password', 'forgot-username'].map((path) =>
          fetch(`${BACKEND_URL}/api/auth/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: authEmail })
          })
        )
      );
      setAuthNotice(
        "If that email is registered, we've sent your username and a link to reset your password."
      );
    } catch {
      setAuthError('Could not reach the server. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Action: Apply a new password using the token from the emailed link
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');
    setAuthLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, new_password: authPassword })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(readError(data, 'Could not reset your password.'));
      setAuthNotice('Password updated — sign in with it below.');
      setAuthPassword('');
      setAuthMode('login');
      window.history.replaceState({}, '', window.location.pathname);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Switch between login/register/forgot without carrying stale messages over
  const switchAuthMode = (mode) => {
    setAuthMode(mode);
    setAuthError('');
    setAuthNotice('');
  };

  // Action: Clear the session and return to the login gate
  const handleLogout = () => {
    localStorage.removeItem('cf_token');
    localStorage.removeItem('cf_email'); // legacy key from before profiles existed
    localStorage.removeItem('cf_user');
    setAuthToken(null);
    setProfile(null);
    setRoadmapData(null);
    setActiveQuiz(null);
    setCareerReport(null);
    setResumeFile(null);
    setSavedPaths([]);
    setActivePathId(null);
    setViewState('prompt');
  };

  // Wrapper around fetch that attaches the JWT and logs out on expired/invalid sessions
  const authFetch = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${authToken}` }
    });
    if (response.status === 401) {
      handleLogout();
      throw new Error('Your session expired — please log in again.');
    }
    return response;
  };

  // Action: Trigger Dynamic AI Roadmap Generation
  const handleGeneratePath = async (e) => {
    e.preventDefault();
    if (isBusy) return; // guard against double-submits interrupting an active run
    setLoadingMessage('Architecting your journey with Azure OpenAI');
    setLoadingSteps(ROADMAP_STEPS);
    setViewState('loading');

    try {
      // =========================================================================
      // CHANGED: Endpoint matched to production API path `/api/generate`
      // CHANGED: Parameters updated to pass `hours_per_day` instead of `weekly_hours`
      // =========================================================================
      const response = await authFetch(`${BACKEND_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: goal,
          experience_level: experienceLevel,
          hours_per_day: hoursPerDay
        })
      });

      if (!response.ok) throw new Error('Network validation fail');
      const data = await response.json();
      setRoadmapData(data);
      setActivePathId(data.path_id || null);
      refreshSavedPaths(); // the backend auto-saved this run as a new session
      setViewState('roadmap');

    } catch (err) {
      alert(`Frontend Error: ${err.message}`);
      setViewState('prompt');
    }
  };

  // Action: Fetch Dynamic Quiz Schema
  const handleFetchQuiz = async (milestone, weekNum) => {
    if (isBusy) return;
    setLoadingMessage('Assembling milestone assessment');
    setLoadingSteps(QUIZ_STEPS);
    setViewState('loading');

    try {
      const response = await authFetch(`${BACKEND_URL}/api/quiz/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone, week_number: weekNum })
      });
      const data = await response.json();
      setActiveQuiz(data);
      setQuizAnswers({});
      setQuizResult(null);
      setViewState('quiz');
    } catch (err) {
      alert('Failed to load quiz details.');
      setViewState('roadmap');
    }
  };

  // Action: Post Quiz Answers for AI Grading
  const handleQuizSubmit = async (e) => {
    e.preventDefault();
    if (isBusy) return;
    setLoadingMessage('Analyzing answers and writing deep feedback');
    setLoadingSteps(GRADE_STEPS);
    setViewState('loading');

    const formattedAnswers = activeQuiz.questions.map(q => ({
      question_number: q.question_number,
      answer: quizAnswers[q.question_number] || ''
    }));

    try {
      const response = await authFetch(`${BACKEND_URL}/api/quiz/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Server grades against the questions it stored at generation time —
        // we only send back which quiz and the user's answers.
        body: JSON.stringify({
          quiz_id: activeQuiz.quiz_id,
          answers: formattedAnswers
        })
      });
      const data = await response.json();
      setQuizResult(data);
      setViewState('quiz');
    } catch (err) {
      alert('Submission error encountered.');
      setViewState('roadmap');
    }
  };

  // =========================================================================
  // NEW: Career Boost — upload resume, run the GPT-5 ATS scan, show the report
  // =========================================================================
  const handleAnalyzeResume = async () => {
    if (!resumeFile || isBusy) return;
    setLoadingMessage('Auditing your resume with GPT-5');
    setLoadingSteps(RESUME_STEPS);
    setViewState('loading');

    try {
      const formData = new FormData();
      formData.append('file', resumeFile);
      // No Content-Type header — the browser sets the multipart boundary itself
      const response = await authFetch(`${BACKEND_URL}/api/resume/analyze`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Resume analysis failed.');
      setCareerReport(data);
      setViewState('career');
    } catch (err) {
      alert(`Resume scan failed: ${err.message}`);
      setViewState('prompt');
    }
  };

  // =========================================================================
  // NEW: Roadmap export actions — Markdown file + print-to-PDF
  // =========================================================================
  const exportMeta = { level: experienceLevel, hoursPerDay };

  // =========================================================================
  // NEW: Account gate — unauthenticated visitors see the login/register card
  // =========================================================================
  if (!authToken) {
    const fieldClass =
      'w-full p-3 bg-surface border border-transparent rounded-xl focus:outline-hidden focus:border-accent focus:bg-card text-sm transition-all font-medium placeholder-muted/70';
    const labelClass = 'block text-xs font-semibold text-muted mb-2';

    // One card, four modes — the heading and form body swap, the chrome doesn't
    const headings = {
      login: { title: "Welcome back, let's get learning!", sub: 'Sign in to pick up where you left off.' },
      register: { title: 'Create your account', sub: 'Start building your first learning path.' },
      forgot: { title: 'Forgot your details?', sub: "Enter your email and we'll send your username and a reset link." },
      reset: { title: 'Choose a new password', sub: 'Pick something you haven\'t used before.' }
    };
    const heading = headings[authMode];

    return (
      // flex-col so the About link stacks above the card instead of beside it
      <div className="bg-surface text-ink min-h-screen flex flex-col items-center justify-center font-sans p-4">
        {showLanding && (
          <LandingModal theme={theme} onClose={closeLanding} onNeverShow={neverShowLanding} />
        )}

        <button
          type="button"
          onClick={() => setShowLanding(true)}
          className="mb-4 text-xs text-accent font-semibold hover:underline cursor-pointer"
        >
          About CourseForge
        </button>

        <div className="bg-card border border-line rounded-2xl p-8 w-full max-w-sm shadow-[0_4px_24px_rgba(0,0,0,0.04)] space-y-6">
          <div className="text-center space-y-2">
            {/* The full lockup, not a tile — sign-in is the one screen with room
                for the wordmark, and it's the first thing a new user sees. */}
            <Logo theme={theme} variant="full" className="h-24 w-auto mx-auto mb-1" />
            <h1 className="font-brand text-lg font-bold tracking-tight">{heading.title}</h1>
            <p className="text-xs text-muted font-medium">{heading.sub}</p>
          </div>

          {/* ---------- Forgot username / password ---------- */}
          {authMode === 'forgot' && (
            <>
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div>
                  <label className={labelClass}>EMAIL</label>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className={fieldClass}
                  />
                </div>

                {authError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50/60 dark:bg-rose-500/10 border border-rose-500/10 p-2.5 rounded-xl">{authError}</p>
                )}
                {authNotice && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium bg-emerald-50/60 dark:bg-emerald-500/10 border border-emerald-500/10 p-2.5 rounded-xl">{authNotice}</p>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-brand hover:bg-brand-hover text-brand-fg disabled:opacity-50 font-medium py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 text-sm"
                >
                  <Mail size={14} /> {authLoading ? 'Sending...' : 'Send recovery email'}
                </button>
              </form>

              <p className="text-xs text-center text-muted font-medium">
                Remembered it?{' '}
                <button
                  type="button"
                  onClick={() => switchAuthMode('login')}
                  className="text-accent font-semibold hover:underline cursor-pointer"
                >
                  Back to sign in
                </button>
              </p>
            </>
          )}

          {/* ---------- Set a new password from the emailed link ---------- */}
          {authMode === 'reset' && (
            <>
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div>
                  <label className={labelClass}>NEW PASSWORD</label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                    className={fieldClass}
                  />
                </div>

                {authError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50/60 dark:bg-rose-500/10 border border-rose-500/10 p-2.5 rounded-xl">{authError}</p>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-brand hover:bg-brand-hover text-brand-fg disabled:opacity-50 font-medium py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 text-sm"
                >
                  <KeyRound size={14} /> {authLoading ? 'Saving...' : 'Set new password'}
                </button>
              </form>

              <p className="text-xs text-center text-muted font-medium">
                <button
                  type="button"
                  onClick={() => switchAuthMode('login')}
                  className="text-accent font-semibold hover:underline cursor-pointer"
                >
                  Back to sign in
                </button>
              </p>
            </>
          )}

          {/* ---------- Sign in / Create account ---------- */}
          {(authMode === 'login' || authMode === 'register') && (
            <>
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === 'login' ? (
                  <div>
                    <label className={labelClass}>USERNAME OR EMAIL</label>
                    <input
                      type="text"
                      value={authIdentifier}
                      onChange={(e) => setAuthIdentifier(e.target.value)}
                      required
                      autoComplete="username"
                      placeholder="yourname or you@example.com"
                      className={fieldClass}
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className={labelClass}>EMAIL</label>
                      <input
                        type="email"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        required
                        placeholder="you@example.com"
                        className={fieldClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>USERNAME</label>
                      <input
                        type="text"
                        value={authUsername}
                        onChange={(e) => setAuthUsername(e.target.value)}
                        required
                        minLength={3}
                        maxLength={32}
                        pattern="[a-zA-Z0-9_]+"
                        title="Letters, numbers and underscores only"
                        placeholder="yourname"
                        className={fieldClass}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className={labelClass}>PASSWORD</label>
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                    placeholder="Minimum 8 characters"
                    className={fieldClass}
                  />
                </div>

                {authError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50/60 dark:bg-rose-500/10 border border-rose-500/10 p-2.5 rounded-xl">{authError}</p>
                )}
                {authNotice && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium bg-emerald-50/60 dark:bg-emerald-500/10 border border-emerald-500/10 p-2.5 rounded-xl">{authNotice}</p>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-brand hover:bg-brand-hover text-brand-fg disabled:opacity-50 font-medium py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 text-sm"
                >
                  <Lock size={14} /> {authLoading ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
                </button>

                {authMode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchAuthMode('forgot')}
                    className="w-full text-xs text-muted hover:text-ink font-medium cursor-pointer"
                  >
                    Forgot username or password?
                  </button>
                )}
              </form>

              {/* Renders nothing at all unless VITE_GOOGLE_CLIENT_ID is configured */}
              {GOOGLE_ENABLED && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-[10px] font-semibold text-faint uppercase tracking-wide">or</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <GoogleSignInButton onCredential={handleGoogleCredential} theme={theme} />
                </div>
              )}

              <p className="text-xs text-center text-muted font-medium">
                {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => switchAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="text-accent font-semibold hover:underline cursor-pointer"
                >
                  {authMode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // Shared parameters form card — full-width on the prompt page, sidebar in
  // the workspace. Every control locks while a request is in flight.
  // =========================================================================
  const parametersCard = (
    <section className="bg-card p-6 rounded-2xl border border-line shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
      <h2 className="text-sm font-semibold tracking-wide text-ink uppercase mb-4 flex items-center gap-1.5">
        Parameters
      </h2>
      <form onSubmit={handleGeneratePath} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-muted mb-2">TARGET EXPERTISE</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            required
            disabled={isBusy}
            placeholder="e.g., Python backend development with FastAPI, building relational SQL databases, and setting up Docker container systems..."
            className="w-full p-3 bg-surface border border-transparent rounded-xl focus:outline-hidden focus:border-accent focus:bg-card text-sm transition-all resize-none placeholder-muted/70 font-medium disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted mb-2">EXPERIENCE PROFILE</label>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-surface rounded-xl border border-line/40">
            {['beginner', 'intermediate', 'advanced'].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setExperienceLevel(lvl)}
                disabled={isBusy}
                className={`text-xs py-2 rounded-lg font-medium capitalize transition-all cursor-pointer disabled:opacity-50 ${
                  experienceLevel === lvl
                    ? 'bg-card text-ink shadow-xs border border-line'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            {/* =========================================================================
                CHANGED: UI label and slider constraints updated to manage Daily Commitment
                ========================================================================= */}
            <label className="block text-xs font-semibold text-muted">DAILY TIME COMMITMENT</label>
            <span className="text-xs font-bold text-accent">{hoursPerDay} hrs/day</span>
          </div>
          <input
            type="range"
            min={1}
            max={8}
            value={hoursPerDay}
            disabled={isBusy}
            onChange={(e) => setHoursPerDay(parseInt(e.target.value))}
            className="w-full h-1 bg-line rounded-lg appearance-none cursor-pointer accent-ember disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={isBusy}
          className="w-full bg-brand hover:bg-brand-hover text-brand-fg disabled:opacity-50 disabled:cursor-not-allowed font-medium py-3 rounded-xl transition-all shadow-md shadow-ink/10 cursor-pointer flex items-center justify-center gap-2 text-sm"
        >
          <Sparkles size={16} /> {isBusy ? 'Generating...' : 'Generate Roadmap'}
        </button>
      </form>
    </section>
  );

  // NEW: Career Boost upload card — lives on the prompt page under Parameters
  const careerBoostCard = (
    <section className="bg-card p-6 rounded-2xl border border-line shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
      <h2 className="text-sm font-semibold tracking-wide text-ink uppercase mb-1 flex items-center gap-1.5">
        Career Boost
      </h2>
      <p className="text-xs text-muted font-medium mb-4 leading-relaxed">
        Upload your resume — GPT-5 runs an ATS error scan, suggests enhancements, and matches you to live LinkedIn & Indeed job searches.
      </p>
      <div className="flex flex-col sm:flex-row gap-2.5">
        <label className={`flex-1 flex items-center justify-center gap-2 p-3 bg-surface hover:bg-line/60 border border-dashed border-line-strong rounded-xl text-xs font-medium text-ink-soft transition-all ${isBusy ? 'opacity-50' : 'cursor-pointer'}`}>
          <Upload size={14} className="shrink-0" />
          <span className="truncate">{resumeFile ? resumeFile.name : 'Choose file (PDF, DOCX, TXT, or image)'}</span>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
            disabled={isBusy}
            onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
            className="hidden"
          />
        </label>
        <button
          type="button"
          onClick={handleAnalyzeResume}
          disabled={!resumeFile || isBusy}
          className="bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-accent-fg font-medium px-4 py-3 rounded-xl transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 text-xs"
        >
          <ScanSearch size={14} /> Scan Resume
        </button>
      </div>
    </section>
  );

  // =========================================================================
  // NEW: Session history card — chat-style tabs for every saved roadmap.
  // Click a row to reopen it, trash to delete, "+ New Path" for a fresh start.
  // =========================================================================
  const sessionsCard = savedPaths.length > 0 && (
    <section className="bg-card p-5 rounded-2xl border border-line shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-wide text-ink uppercase flex items-center gap-1.5">
          <History size={14} className="text-muted" /> Your Paths
        </h2>
        {viewState !== 'prompt' && (
          <button
            onClick={startNewPath}
            className="text-[11px] font-semibold text-accent hover:underline cursor-pointer inline-flex items-center gap-0.5"
          >
            <Plus size={12} /> New Path
          </button>
        )}
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {savedPaths.map((p) => (
          <div
            key={p.id}
            onClick={() => handleLoadPath(p.id)}
            className={`group flex items-center justify-between gap-2 p-2.5 rounded-xl cursor-pointer border text-xs font-medium transition-all ${
              p.id === activePathId
                ? 'bg-ember/10 dark:bg-ember/15 border-accent/40 text-accent dark:text-ember-soft'
                : 'bg-surface border-transparent hover:bg-line/60 text-ink-soft'
            }`}
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">{p.title}</p>
              <p className="text-[10px] text-muted font-medium capitalize">
                {p.experience_level} · {p.hours_per_day} hrs/day · {new Date(p.created_at + 'Z').toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={(e) => handleDeletePath(e, p.id)}
              title="Delete this path"
              className="opacity-0 group-hover:opacity-100 text-muted hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded-md transition-all cursor-pointer shrink-0"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="bg-surface text-ink min-h-screen flex flex-col font-sans selection:bg-ember/25">

      {/* Opens itself right after sign-in unless the user has switched it off */}
      {showLanding && (
        <LandingModal theme={theme} onClose={closeLanding} onNeverShow={neverShowLanding} />
      )}

      {/* Premium Apple-Style Glassmorphism Navbar */}
      <header className="sticky top-0 z-50 bg-card/70 backdrop-blur-md border-b border-line-strong/30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Logo doubles as a home button back to the prompt page (unless a request is running) */}
          <button
            onClick={() => !isBusy && setViewState('prompt')}
            title="New path / Career Boost"
            className="flex items-center gap-2.5 cursor-pointer text-left"
          >
            {/* The mark carries itself — no tile behind it. */}
            <Logo theme={theme} className="h-9 w-auto shrink-0" />
            <div>
              <h1 className="font-brand text-base font-bold tracking-tight text-ink leading-none">CourseForge</h1>
              <p className="text-[10px] text-muted font-medium tracking-wide uppercase mt-1">AI Systems</p>
            </div>
          </button>
          
          
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => !isBusy && setViewState('groups')}
              title="Group Skills"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border ${
                viewState === 'groups'
                  ? 'bg-brand text-brand-fg border-brand'
                  : 'bg-surface text-ink-soft border-transparent hover:bg-line'
              }`}
            >
              <Users size={13} /> <span className="hidden sm:inline">Group Skills</span>
            </button>
            {/* Active session identity — doubles as the entry point to profile settings */}
            <button
              onClick={() => !isBusy && setViewState('profile')}
              title="Profile settings"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border max-w-[180px] ${
                viewState === 'profile'
                  ? 'bg-brand text-brand-fg border-brand'
                  : 'bg-surface text-ink-soft border-transparent hover:bg-line'
              }`}
            >
              <User size={13} className="shrink-0" />
              <span className="truncate">{profile?.username || 'Account'}</span>
            </button>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="text-muted hover:text-ink p-1.5 bg-surface hover:bg-line rounded-full transition-all cursor-pointer"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="text-muted hover:text-ink p-1.5 bg-surface hover:bg-line rounded-full transition-all cursor-pointer"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          NEW: Prompt-first landing — right after sign-in the user sees only the
          parameters card (plus Career Boost), centered. The workspace grid only
          appears once there's something to show.
          ========================================================================= */}
      {viewState === 'prompt' && (
        <main className="flex-1 w-full max-w-xl mx-auto px-4 py-12 space-y-5 animate-fadeIn">
          <div className="text-center space-y-1.5 mb-8">
            <h2 className="font-brand text-2xl font-bold tracking-tight text-ink">What do you want to master?</h2>
            <p className="text-xs text-muted font-medium">Describe your goal and CourseForge will architect a week-by-week blueprint.</p>
          </div>
          {parametersCard}
          {careerBoostCard}
          {sessionsCard}
        </main>
      )}

      {/* View Container: Animated Loading Transition Page */}
      {viewState === 'loading' && (
        <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-12">
          <LoadingScreen title={loadingMessage} steps={loadingSteps} />
        </main>
      )}

      {/* View Container: ATS Career Report */}
      {viewState === 'career' && careerReport && (
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-8">
          <CareerReport
            report={careerReport}
            onBack={() => setViewState(roadmapData ? 'roadmap' : 'prompt')}
          />
        </main>
      )}

      {/* View Container: Group Skills */}
      {viewState === 'groups' && (
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-8">
          <GroupSkills authFetch={authFetch} BACKEND_URL={BACKEND_URL} />
        </main>
      )}

      {/* View Container: Profile Settings */}
      {viewState === 'profile' && (
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-8">
          <ProfileSettings
            authFetch={authFetch}
            BACKEND_URL={BACKEND_URL}
            profile={profile}
            onProfileChange={(updated) => {
              setProfile(updated);
              localStorage.setItem('cf_user', JSON.stringify(updated));
            }}
            onBack={() => setViewState('prompt')}
          />
        </main>
      )}

      {/* Main Container Workspace — roadmap & quiz views keep the sidebar */}
      {(viewState === 'roadmap' || viewState === 'quiz') && (
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">

          {/* Left Interactive Control Panel Card */}
          <div className="md:col-span-4 sticky top-24 space-y-5">
            {parametersCard}
            {sessionsCard}
          </div>

          {/* Right Output Layout Stream */}
          <section className="md:col-span-8 min-h-[450px]">

            {/* View Container: Beautiful Dynamic Roadmap Stream */}
            {viewState === 'roadmap' && roadmapData && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-slab p-6 rounded-2xl text-slab-fg shadow-xs relative overflow-hidden">
                {/* NEW: Export controls — save the roadmap as PDF or Markdown */}
                <div className="absolute top-5 right-5 flex gap-1.5">
                  <button
                    onClick={() => printRoadmapPdf(roadmapData, exportMeta)}
                    title="Download as PDF"
                    className="text-slab-muted hover:text-slab-fg p-2 bg-slab-fill hover:bg-slab-fill-hover rounded-lg transition-all cursor-pointer"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={() => downloadRoadmapMarkdown(roadmapData, exportMeta)}
                    title="Download as Markdown"
                    className="text-slab-muted hover:text-slab-fg p-2 bg-slab-fill hover:bg-slab-fill-hover rounded-lg transition-all cursor-pointer"
                  >
                    <FileText size={14} />
                  </button>
                </div>
                <span className="text-[10px] font-bold tracking-widest text-ember uppercase">Target Blueprint</span>
                {/* =========================================================================
                    CHANGED: Extracted backend data nodes (`title` and `calculated_total_weeks`)
                    ========================================================================= */}
                <h2 className="font-brand text-lg font-bold mt-1 tracking-tight pr-24">{roadmapData.title}</h2>
                <div className="flex flex-wrap gap-5 mt-4 text-[11px] text-slab-muted font-medium border-t border-slab-line pt-4">
                  <div className="flex items-center gap-1.5 text-slab-muted"><Layers size={13} /> Level: <span className="text-slab-fg capitalize font-semibold">{experienceLevel}</span></div>
                  <div className="flex items-center gap-1.5 text-slab-muted"><Clock size={13} /> Commitment: <span className="text-slab-fg font-semibold">{hoursPerDay} hrs/day</span></div>
                  <div className="flex items-center gap-1.5 text-slab-muted"><Calendar size={13} /> Duration: <span className="text-slab-fg font-semibold">{roadmapData.calculated_total_weeks} Weeks</span></div>
                </div>
              </div>

              <div className="space-y-4">
                {/* =========================================================================
                    CHANGED: Swapped `milestones` processing node out for the calculated `weeks` payload array
                    ========================================================================= */}
                {roadmapData.weeks?.map((wk, i) => (
                  <div key={i} className="bg-card border border-line rounded-2xl p-5 hover:border-line-strong hover:shadow-xs transition-all flex flex-col gap-4">

                    {/* Upper Core Node Metas */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="bg-surface text-ink text-xs font-bold w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 border border-line/50">
                          <span className="text-[9px] uppercase tracking-wider font-semibold text-muted">Wk</span>
                          <span className="text-sm mt-[-2px]">{wk.week_number || (i + 1)}</span>
                        </div>
                        <div className="space-y-2">
                          {/* CHANGED: Swapped `wk.title` for `wk.focus` to capture core focus headings */}
                          <h4 className="font-semibold text-ink text-sm tracking-tight leading-snug">{wk.focus}</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {/* CHANGED: Swapped `wk.key_topics` for `wk.topics` targeting technical modules */}
                            {wk.topics?.map((topic, tIdx) => (
                              <span key={tIdx} className="bg-surface text-ink-soft text-[11px] px-2.5 py-0.5 rounded-md font-medium border border-line inline-flex items-center gap-1">
                                <BookOpen size={11} className="text-muted" /> {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleFetchQuiz(wk.focus, wk.week_number || (i + 1))}
                        className="sm:self-center bg-surface hover:bg-line text-ink text-xs font-medium px-3.5 py-2 rounded-xl transition-all cursor-pointer inline-flex items-center justify-center gap-1 border border-line"
                      >
                        Quiz <ArrowRight size={13} />
                      </button>
                    </div>

                    {/* =========================================================================
                        NEW: Legitimate Live Resource Link Blocks Container
                        Renders hyper-targeted clickable streaming titles sourced directly from YouTube
                        ========================================================================= */}
                    {wk.live_resources && wk.live_resources.length > 0 && (
                      <div className="border-t border-surface pt-3.5 mt-0.5">
                        <span className="text-[10px] font-bold tracking-wider text-muted uppercase block mb-2">Live Educational Context Modules</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {wk.live_resources.map((res, rIdx) => (
                            <a
                              key={rIdx}
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2.5 p-2.5 bg-surface hover:bg-line/60 border border-line/50 rounded-xl text-xs font-medium text-ink transition-all hover:text-accent group"
                            >
                              <div className="bg-red-500/10 text-red-600 dark:text-red-400 p-1.5 rounded-lg shrink-0 group-hover:bg-red-500 group-hover:text-white transition-all">
                                <Video size={13} />
                              </div>
                              <span className="truncate pr-2 font-medium">{res.title}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* =========================================================================
                        NEW: Practical Execution Task Checklists Area
                        ========================================================================= */}
                    {wk.practice && wk.practice.length > 0 && (
                      <div className="bg-surface/40 border border-line/40 rounded-xl p-3 text-[11px] text-ink-soft space-y-1.5">
                        <span className="font-bold text-ink-soft block text-[10px] tracking-wider uppercase">Weekly Sandbox Drills</span>
                        <ul className="list-disc list-inside space-y-1 pl-1 text-ink-soft/90 font-medium">
                          {wk.practice.map((task, pIdx) => (
                            <li key={pIdx} className="leading-relaxed">{task}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* =========================================================================
                        NEW: Comprehensive Weekly Assessment Assignment Metric Card Block
                        ========================================================================= */}
                    {wk.mini_exercise && (
                      <p className="text-[11px] text-ink-soft leading-relaxed bg-ember/5 border border-accent/20 p-3 rounded-xl font-medium">
                        <span className="font-semibold text-accent dark:text-ember inline-flex items-center gap-0.5">
                          <Flag size={11} /> Milestone Capstone Assignment:
                        </span>{' '}
                        {wk.mini_exercise}
                      </p>
                    )}

                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View Container: Assessment Mode Card */}
          {viewState === 'quiz' && activeQuiz && (
            <div className="bg-card border border-line rounded-2xl p-6 shadow-xs space-y-6 animate-fadeIn">

              {/* Header Context Bar */}
              <div className="flex items-center justify-between border-b border-surface pb-4">
                <div>
                  <span className="text-[10px] font-bold tracking-wider text-accent uppercase">Week {activeQuiz.week_number} Evaluation</span>
                  <h3 className="text-base font-semibold text-ink tracking-tight">{activeQuiz.milestone}</h3>
                </div>
                <button
                  onClick={() => setViewState('roadmap')}
                  className="text-muted hover:text-ink p-1.5 bg-surface hover:bg-line rounded-full transition-all cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Dynamic Sub-State Conditional Rendering: Interactive Questions vs Output Grading Report */}
              {!quizResult ? (
                <form onSubmit={handleQuizSubmit} className="space-y-6">
                  {activeQuiz.questions?.map((q) => (
                    <div key={q.question_number} className="space-y-3 border-b border-surface pb-5 last:border-0 last:pb-0">
                      <h4 className="text-sm font-semibold text-ink flex items-start gap-1.5 leading-snug">
                        <span className="text-muted font-mono text-xs mt-0.5">{q.question_number}.</span>
                        {q.question}
                      </h4>

                      {q.type === 'multiple_choice' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {q.options?.map((opt, oIdx) => (
                            <label
                              key={oIdx}
                              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border text-xs font-medium transition-all ${
                                quizAnswers[q.question_number] === opt
                                  ? 'bg-ember/10 dark:bg-ember/15 border-accent text-accent dark:text-ember-soft'
                                  : 'bg-surface border-transparent hover:bg-line/60 text-ink-soft'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q-${q.question_number}`}
                                value={opt}
                                checked={quizAnswers[q.question_number] === opt}
                                onChange={() => setQuizAnswers({ ...quizAnswers, [q.question_number]: opt })}
                                required
                                className="accent-ember h-3.5 w-3.5"
                              />
                              {opt}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          rows={3}
                          required
                          value={quizAnswers[q.question_number] || ''}
                          onChange={(e) => setQuizAnswers({ ...quizAnswers, [q.question_number]: e.target.value })}
                          placeholder="Provide your text evaluation breakdown response..."
                          className="w-full p-3 bg-surface border border-transparent rounded-xl focus:outline-hidden focus:border-accent focus:bg-card text-xs font-medium transition-all resize-none placeholder-muted/60"
                        />
                      )}
                    </div>
                  ))}
                  <button type="submit" className="bg-brand hover:bg-brand-hover text-brand-fg font-medium text-xs px-5 py-3 rounded-xl transition-all cursor-pointer">
                    Submit Evaluation
                  </button>
                </form>
              ) : (
                <div className="space-y-6">
                  {/* Grading Status Splash Header */}
                  <div className="text-center py-4 border-b border-surface space-y-2">
                    <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full">
                      {quizResult?.passed ? <CheckCircle2 size={40} className="text-emerald-500" /> : <XCircle size={40} className="text-rose-500" />}
                    </div>
                    <h4 className="text-base font-semibold text-ink">
                      {quizResult?.passed ? 'Assessment Successfully Completed' : 'Review Criteria Not Met'}
                    </h4>
                    <div className={`text-2xl font-bold ${quizResult?.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {quizResult?.score} <span className="text-sm font-medium text-muted">/ {quizResult?.total || 0} Correct</span>
                    </div>
                    {quizResult?.overall_feedback && (
                      <p className="text-xs text-ink-soft max-w-md mx-auto italic font-medium leading-relaxed bg-surface p-3 rounded-xl border border-line/40">
                        "{quizResult.overall_feedback}"
                      </p>
                    )}
                  </div>

                  {/* Individual Question AI Breakdown Cards */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-bold text-muted tracking-wider uppercase">Itemized Audit</h5>
                    {quizResult?.feedback?.map((fb, idx) => (
                      <div
                        key={idx}
                        className={`p-4 border rounded-xl text-xs font-medium ${
                          fb.correct
                            ? 'border-emerald-500/10 bg-emerald-50/20 dark:bg-emerald-500/10'
                            : 'border-rose-500/10 bg-rose-50/20 dark:bg-rose-500/10'
                        }`}
                      >
                        <div className={`flex items-center gap-1.5 font-semibold text-sm ${fb.correct ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
                          {fb.correct ? <CheckCircle2 size={14} /> : <XCircle size={14} />} Question {fb.question_number}
                        </div>
                        <p className="text-ink-soft mt-2 text-xs leading-relaxed">
                          <strong className="text-ink font-semibold">AI Feedback:</strong> {fb.explanation}
                        </p>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setViewState('roadmap')}
                    className="w-full bg-brand hover:bg-brand-hover text-brand-fg font-medium p-3 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw size={14} /> Return to Roadmap Overview
                  </button>
                </div>
              )}
            </div>
          )}

          </section>
        </main>
      )}
    </div>
  );
}
