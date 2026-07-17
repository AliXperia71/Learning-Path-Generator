import { useEffect, useState } from 'react';
import {
  Users,
  Plus,
  LogIn,
  Copy,
  Check,
  Trophy,
  Lock,
  ArrowLeft,
  Clock,
  Flame,
  Target,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  DoorOpen,
  Trash2,
} from 'lucide-react';
import LoadingScreen from './LoadingScreen';

// Silent background refresh while a group is open, so points/rank update without
// a manual reopen. No new infra (websockets) needed for this cadence to feel live.
const LEADERBOARD_POLL_MS = 12000;

const QUIZ_STEPS = ['Reviewing the milestone', 'Writing challenge questions', 'Calibrating difficulty'];
const GRADE_STEPS = ['Checking your answers', 'Writing per-question feedback', 'Scoring the assessment'];

// Rank badge — quiet everywhere except the top 3, which is this feature's one
// deliberate visual accent (see frontend-design: spend boldness in one place).
const RANK_STYLES = {
  1: 'bg-amber-400/15 text-amber-700 dark:text-amber-300 border-amber-400/30',
  2: 'bg-line text-ink-soft border-line-strong',
  3: 'bg-orange-400/10 text-orange-700 dark:text-orange-300 border-orange-400/25',
};

export default function GroupSkills({ authFetch, BACKEND_URL }) {
  // groups-list | create | join | detail | set-hours | quiz | quiz-result
  const [view, setView] = useState('groups-list');
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [error, setError] = useState('');

  // Create / join forms
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupTopic, setNewGroupTopic] = useState('');
  const [newGroupLevel, setNewGroupLevel] = useState('beginner');
  const [joinCode, setJoinCode] = useState('');
  const [formBusy, setFormBusy] = useState(false);

  // Active group detail
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [board, setBoard] = useState(null); // { group, leaderboard, average_current_week }
  const [mine, setMine] = useState(null); // my private membership
  const [hoursInput, setHoursInput] = useState(2);
  const [copiedCode, setCopiedCode] = useState(false);

  // Inline quiz-and-report flow
  const [quizLoading, setQuizLoading] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [pointsEarned, setPointsEarned] = useState(null);

  const refreshGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await authFetch(`${BACKEND_URL}/api/groups`);
      if (res.ok) setGroups(await res.json());
    } catch {
      // Non-fatal — the list just stays empty
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshGroups();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openGroup = async (groupId) => {
    setError('');
    setActiveGroupId(groupId);
    setView('detail');
    await refreshGroupDetail(groupId);
  };

  const refreshGroupDetail = async (groupId = activeGroupId, silent = false) => {
    try {
      const [boardRes, mineRes] = await Promise.all([
        authFetch(`${BACKEND_URL}/api/groups/${groupId}/leaderboard`),
        authFetch(`${BACKEND_URL}/api/groups/${groupId}/me`),
      ]);
      if (boardRes.ok) setBoard(await boardRes.json());
      if (mineRes.ok) setMine(await mineRes.json());
    } catch {
      // A silent background poll failing shouldn't flash an error banner —
      // only surface it for the explicit, user-initiated load.
      if (!silent) setError('Could not load this group right now.');
    }
  };

  // Background refresh while a group is open — points/rank update without a manual
  // reopen. Paused during the quiz flow so it can't overwrite in-progress answers.
  useEffect(() => {
    if (view !== 'detail' || !activeGroupId) return;
    const id = setInterval(() => {
      refreshGroupDetail(activeGroupId, true);
    }, LEADERBOARD_POLL_MS);
    return () => clearInterval(id);
  }, [view, activeGroupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLeaveGroup = async () => {
    if (!confirm('Leave this group? You\u2019ll lose your progress and points in it.')) return;
    try {
      const res = await authFetch(`${BACKEND_URL}/api/groups/${activeGroupId}/leave`, { method: 'POST' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Could not leave the group.');
      }
      await refreshGroups();
      setActiveGroupId(null);
      setBoard(null);
      setMine(null);
      setView('groups-list');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteGroup = async () => {
    if (!confirm('Delete this group for everyone? This can\u2019t be undone.')) return;
    try {
      const res = await authFetch(`${BACKEND_URL}/api/groups/${activeGroupId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Could not delete the group.');
      }
      await refreshGroups();
      setActiveGroupId(null);
      setBoard(null);
      setMine(null);
      setView('groups-list');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setFormBusy(true);
    setError('');
    try {
      const res = await authFetch(`${BACKEND_URL}/api/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName,
          skill_topic: newGroupTopic,
          experience_level: newGroupLevel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not create the group.');
      setNewGroupName('');
      setNewGroupTopic('');
      await refreshGroups();
      openGroup(data.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setFormBusy(false);
    }
  };

  const handleJoinGroup = async (e) => {
    e.preventDefault();
    setFormBusy(true);
    setError('');
    try {
      const res = await authFetch(`${BACKEND_URL}/api/groups/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: joinCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'That invite code did not work.');
      setJoinCode('');
      await refreshGroups();
      openGroup(data.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setFormBusy(false);
    }
  };

  const handleSetHours = async (e) => {
    e.preventDefault();
    setFormBusy(true);
    setError('');
    try {
      const res = await authFetch(`${BACKEND_URL}/api/groups/${activeGroupId}/hours`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hourly_commitment: hoursInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not set your hours — try a different value.');
      await refreshGroupDetail();
      setView('detail');
    } catch (err) {
      setError(err.message);
    } finally {
      setFormBusy(false);
    }
  };

  const copyInviteCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  };

  // Reuses the existing /api/quiz endpoints, then reports the graded score
  // into the group so points and rank update.
  const handleTakeWeeklyQuiz = async () => {
    const weekIdx = mine.current_week; // 0-indexed: next week to complete
    const wk = mine.roadmap?.weeks?.[weekIdx];
    if (!wk) return;

    setQuizLoading(true);
    setView('quiz');
    try {
      const res = await authFetch(`${BACKEND_URL}/api/quiz/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone: wk.focus, week_number: weekIdx + 1 }),
      });
      const data = await res.json();
      setActiveQuiz(data);
      setQuizAnswers({});
      setQuizResult(null);
      setPointsEarned(null);
    } catch {
      setError('Failed to load this week\u2019s quiz.');
      setView('detail');
    } finally {
      setQuizLoading(false);
    }
  };

  const handleQuizSubmit = async (e) => {
    e.preventDefault();
    setQuizLoading(true);
    const formattedAnswers = activeQuiz.questions.map((q) => ({
      question_number: q.question_number,
      answer: quizAnswers[q.question_number] || '',
    }));

    try {
      const res = await authFetch(`${BACKEND_URL}/api/quiz/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_number: activeQuiz.week_number,
          milestone: activeQuiz.milestone,
          questions: activeQuiz.questions,
          answers: formattedAnswers,
        }),
      });
      const graded = await res.json();
      setQuizResult(graded);

      // Report the graded result into the group so points/rank update
      const beforePoints = mine.total_points;
      const completeRes = await authFetch(`${BACKEND_URL}/api/groups/${activeGroupId}/complete-week`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week_number: activeQuiz.week_number,
          quiz_score: graded.score,
          quiz_total: graded.total,
        }),
      });
      if (completeRes.ok) {
        const updatedMine = await completeRes.json();
        setPointsEarned(updatedMine.total_points - beforePoints);
        setMine(updatedMine);
      }
    } catch {
      setError('Could not submit this quiz — try again.');
    } finally {
      setQuizLoading(false);
    }
  };

  const finishQuizFlow = async () => {
    await refreshGroupDetail();
    setActiveQuiz(null);
    setQuizResult(null);
    setPointsEarned(null);
    setView('detail');
  };

  // =========================================================================
  // Groups list
  // =========================================================================
  if (view === 'groups-list') {
    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-fadeIn">
        <div className="text-center space-y-1.5 mb-2">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Group Skills</h2>
          <p className="text-xs text-muted font-medium">
            Team up on a skill, race the leaderboard. Everyone sets their own pace — privately.
          </p>
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={() => setView('create')}
            className="flex-1 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-900 text-white font-medium py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-sm"
          >
            <Plus size={15} /> Create a group
          </button>
          <button
            onClick={() => setView('join')}
            className="flex-1 bg-card hover:bg-surface text-ink font-medium py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-sm border border-line"
          >
            <LogIn size={15} /> Join with a code
          </button>
        </div>

        {loadingGroups ? (
          <div className="text-center py-10 text-xs text-muted font-medium">Loading your groups…</div>
        ) : groups.length === 0 ? (
          <div className="bg-card border border-dashed border-line-strong rounded-2xl p-10 text-center">
            <Users size={24} className="mx-auto text-ghost mb-2" />
            <p className="text-sm font-semibold text-ink">No groups yet</p>
            <p className="text-xs text-muted font-medium mt-1">Create one or join a friend’s with their invite code.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => openGroup(g.id)}
                className="w-full text-left bg-card border border-line hover:border-line-strong hover:shadow-xs rounded-2xl p-4 transition-all cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{g.name}</p>
                  <p className="text-xs text-muted font-medium truncate mt-0.5">{g.skill_topic}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] font-semibold text-muted bg-surface px-2.5 py-1 rounded-full border border-line/60">
                    {g.member_count}/{g.max_members}
                  </span>
                  <ChevronRight size={15} className="text-ghost" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // Create group
  // =========================================================================
  if (view === 'create') {
    return (
      <div className="max-w-md mx-auto space-y-5 animate-fadeIn">
        <button
          onClick={() => setView('groups-list')}
          className="text-muted hover:text-ink text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft size={13} /> Back
        </button>
        <section className="bg-card p-6 rounded-2xl border border-line shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <h2 className="text-sm font-semibold tracking-wide text-ink uppercase mb-4">Create a group</h2>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-2">GROUP NAME</label>
              <input
                type="text"
                required
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Weekend Warriors"
                className="w-full p-3 bg-surface border border-transparent rounded-xl focus:outline-hidden focus:border-blue-500 focus:bg-card text-sm transition-all placeholder-muted/70 font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-2">SKILL TO LEARN</label>
              <input
                type="text"
                required
                value={newGroupTopic}
                onChange={(e) => setNewGroupTopic(e.target.value)}
                placeholder="Python backend development"
                className="w-full p-3 bg-surface border border-transparent rounded-xl focus:outline-hidden focus:border-blue-500 focus:bg-card text-sm transition-all placeholder-muted/70 font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-2">EXPERIENCE PROFILE</label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-surface rounded-xl border border-line/40">
                {['beginner', 'intermediate', 'advanced'].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setNewGroupLevel(lvl)}
                    className={`text-xs py-2 rounded-lg font-medium capitalize transition-all cursor-pointer ${
                      newGroupLevel === lvl
                        ? 'bg-card text-ink shadow-xs border border-line'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
            <button
              type="submit"
              disabled={formBusy}
              className="w-full bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-900 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-all cursor-pointer text-sm"
            >
              {formBusy ? 'Creating\u2026' : 'Create group'}
            </button>
          </form>
        </section>
      </div>
    );
  }

  // =========================================================================
  // Join group
  // =========================================================================
  if (view === 'join') {
    return (
      <div className="max-w-md mx-auto space-y-5 animate-fadeIn">
        <button
          onClick={() => setView('groups-list')}
          className="text-muted hover:text-ink text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft size={13} /> Back
        </button>
        <section className="bg-card p-6 rounded-2xl border border-line shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <h2 className="text-sm font-semibold tracking-wide text-ink uppercase mb-4">Join with a code</h2>
          <form onSubmit={handleJoinGroup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted mb-2">INVITE CODE</label>
              <input
                type="text"
                required
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="e.g. ae3f5bb4"
                className="w-full p-3 bg-surface border border-transparent rounded-xl focus:outline-hidden focus:border-blue-500 focus:bg-card text-sm transition-all placeholder-muted/70 font-medium font-mono"
              />
            </div>
            {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
            <button
              type="submit"
              disabled={formBusy}
              className="w-full bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-900 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-all cursor-pointer text-sm"
            >
              {formBusy ? 'Joining\u2026' : 'Join group'}
            </button>
          </form>
        </section>
      </div>
    );
  }

  // =========================================================================
  // Group detail — everything below requires board + mine to be loaded
  // =========================================================================
  if (view === 'detail' || view === 'set-hours' || view === 'quiz') {
    if (!board || !mine) {
      return <div className="text-center py-16 text-xs text-muted font-medium">Loading group…</div>;
    }

    const needsHours = mine.hourly_commitment === null || mine.hourly_commitment === undefined;

    // ---- Set hours (private) ----
    if (needsHours || view === 'set-hours') {
      return (
        <div className="max-w-md mx-auto space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setView('groups-list')}
              className="text-muted hover:text-ink text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft size={13} /> All groups
            </button>
            {mine.is_creator ? (
              <button
                onClick={handleDeleteGroup}
                title="Delete group"
                className="text-muted hover:text-rose-600 dark:hover:text-rose-400 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={13} /> Delete group
              </button>
            ) : (
              <button
                onClick={handleLeaveGroup}
                title="Leave group"
                className="text-muted hover:text-rose-600 dark:hover:text-rose-400 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <DoorOpen size={13} /> Leave group
              </button>
            )}
          </div>
          <section className="bg-card p-6 rounded-2xl border border-line shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2 mb-1">
              <Lock size={13} className="text-muted" />
              <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">Your daily commitment</h2>
            </div>
            <p className="text-xs text-muted font-medium mb-5 leading-relaxed">
              Only you can see this number — not your groupmates. It sets your own personal pace, and the
              leaderboard only shows points and progress, never hours.
            </p>
            <form onSubmit={handleSetHours} className="space-y-5">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-muted">HOURS PER DAY</label>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{hoursInput} hrs/day</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={8}
                  step={0.5}
                  value={hoursInput}
                  onChange={(e) => setHoursInput(parseFloat(e.target.value))}
                  className="w-full h-1 bg-line rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
              {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
              <button
                type="submit"
                disabled={formBusy}
                className="w-full bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-900 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-all cursor-pointer text-sm flex items-center justify-center gap-1.5"
              >
                <Sparkles size={15} /> {formBusy ? 'Building your roadmap\u2026' : 'Lock in my pace'}
              </button>
            </form>
          </section>
        </div>
      );
    }

    // ---- Quiz flow (inline, reports back to the group on submit) ----
    if (view === 'quiz') {
      if (quizLoading && !activeQuiz) {
        return (
          <div className="max-w-2xl mx-auto py-8">
            <LoadingScreen title="Assembling this week's assessment" steps={QUIZ_STEPS} />
          </div>
        );
      }
      if (!activeQuiz) return null;

      return (
        <div className="max-w-2xl mx-auto bg-card border border-line rounded-2xl p-6 shadow-xs space-y-6 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-surface pb-4">
            <div>
              <span className="text-[10px] font-bold tracking-wider text-blue-600 dark:text-blue-400 uppercase">
                Week {activeQuiz.week_number} evaluation
              </span>
              <h3 className="text-base font-semibold text-ink tracking-tight">{activeQuiz.milestone}</h3>
            </div>
          </div>

          {quizLoading ? (
            <LoadingScreen title="Scoring your answers" steps={GRADE_STEPS} />
          ) : !quizResult ? (
            <form onSubmit={handleQuizSubmit} className="space-y-6">
              {activeQuiz.questions?.map((q) => (
                <div key={q.question_number} className="space-y-3 border-b border-surface pb-5 last:border-0 last:pb-0">
                  <h4 className="text-sm font-semibold text-ink flex items-start gap-1.5 leading-snug">
                    <span className="text-faint font-mono text-xs mt-0.5">{q.question_number}.</span>
                    {q.question}
                  </h4>
                  {q.type === 'multiple_choice' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options?.map((opt, oIdx) => (
                        <label
                          key={oIdx}
                          className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border text-xs font-medium transition-all ${
                            quizAnswers[q.question_number] === opt
                              ? 'bg-blue-50/50 dark:bg-blue-500/10 border-blue-500 text-blue-900 dark:text-blue-300'
                              : 'bg-surface border-transparent hover:bg-line/60 text-ink-soft'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`gq-${q.question_number}`}
                            value={opt}
                            checked={quizAnswers[q.question_number] === opt}
                            onChange={() => setQuizAnswers({ ...quizAnswers, [q.question_number]: opt })}
                            required
                            className="accent-blue-600 h-3.5 w-3.5"
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
                      placeholder="Your answer\u2026"
                      className="w-full p-3 bg-surface border border-transparent rounded-xl focus:outline-hidden focus:border-blue-500 focus:bg-card text-xs font-medium transition-all resize-none placeholder-muted/60"
                    />
                  )}
                </div>
              ))}
              <button type="submit" className="bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-900 text-white font-medium text-xs px-5 py-3 rounded-xl transition-all cursor-pointer">
                Submit and log this week
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="text-center py-4 border-b border-surface space-y-2">
                {quizResult.passed ? (
                  <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
                ) : (
                  <XCircle size={40} className="mx-auto text-rose-500" />
                )}
                <h4 className="text-base font-semibold text-ink">
                  {quizResult.passed ? 'Week logged' : 'Week logged \u2014 room to review'}
                </h4>
                <div className={`text-2xl font-bold ${quizResult.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {quizResult.score} <span className="text-sm font-medium text-muted">/ {quizResult.total} correct</span>
                </div>
                {pointsEarned !== null && (
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1">
                    <Trophy size={13} /> +{pointsEarned} points
                  </p>
                )}
              </div>
              <button
                onClick={finishQuizFlow}
                className="w-full bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-900 text-white font-medium p-3 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={14} /> Back to group
              </button>
            </div>
          )}
        </div>
      );
    }

    // ---- Main group detail: my progress + leaderboard ----
    const nextWeek = mine.roadmap?.weeks?.[mine.current_week];
    const isDone = mine.status === 'completed';

    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-fadeIn">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setView('groups-list')}
            className="text-muted hover:text-ink text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft size={13} /> All groups
          </button>
          {mine.is_creator ? (
            <button
              onClick={handleDeleteGroup}
              title="Delete group"
              className="text-muted hover:text-rose-600 dark:hover:text-rose-400 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <Trash2 size={13} /> Delete group
            </button>
          ) : (
            <button
              onClick={handleLeaveGroup}
              title="Leave group"
              className="text-muted hover:text-rose-600 dark:hover:text-rose-400 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <DoorOpen size={13} /> Leave group
            </button>
          )}
        </div>

        {/* Group header */}
        <div className="bg-neutral-900 p-6 rounded-2xl text-white relative overflow-hidden">
          <span className="text-[10px] font-bold tracking-widest text-blue-400 uppercase">{board.group.skill_topic}</span>
          <h2 className="text-lg font-semibold mt-1 tracking-tight">{board.group.name}</h2>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-[11px] text-neutral-400 font-medium border-t border-neutral-800 pt-4">
            <div className="flex items-center gap-1.5 text-neutral-400">
              <Users size={13} /> {board.group.member_count}/{board.group.max_members} members
            </div>
            <button
              onClick={() => copyInviteCode(board.group.invite_code)}
              className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              {copiedCode ? <Check size={13} /> : <Copy size={13} />}
              <span className="font-mono">{board.group.invite_code}</span>
            </button>
          </div>
        </div>

        {/* My private progress card */}
        <section className="bg-card p-5 rounded-2xl border border-line shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-muted tracking-wider uppercase flex items-center gap-1.5">
              <Target size={13} /> Your progress
            </h3>
            <span className="text-[10px] font-semibold text-muted bg-surface px-2 py-0.5 rounded-full border border-line/60 inline-flex items-center gap-1">
              <Lock size={9} /> Private
            </span>
          </div>

          {isDone ? (
            <div className="text-center py-4">
              <Trophy size={28} className="mx-auto text-amber-500 mb-2" />
              <p className="text-sm font-semibold text-ink">Course complete</p>
              <p className="text-xs text-muted font-medium mt-1">{mine.total_points} total points earned</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                  <Clock size={13} className="text-muted" /> {mine.hourly_commitment} hrs/day
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                  <Flame size={13} className="text-muted" /> Week {mine.current_week + 1} of {mine.calculated_weeks}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                  <Trophy size={13} className="text-muted" /> {mine.total_points} pts
                </div>
              </div>
              {nextWeek && (
                <div className="bg-surface/60 border border-line/50 rounded-xl p-4 mb-4">
                  <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Next up</p>
                  <p className="text-sm font-semibold text-ink">{nextWeek.focus}</p>
                </div>
              )}
              <button
                onClick={handleTakeWeeklyQuiz}
                className="w-full bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-900 text-white font-medium py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-sm"
              >
                <Sparkles size={15} /> Take this week's quiz
              </button>
            </>
          )}
        </section>

        {/* Public leaderboard — hours are never present here */}
        <section className="bg-card p-5 rounded-2xl border border-line shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-muted tracking-wider uppercase flex items-center gap-1.5">
              <Trophy size={13} /> Leaderboard
            </h3>
            <span className="text-[10px] font-medium text-muted">
              Group averaging week {Math.round(board.average_current_week * 10) / 10}
            </span>
          </div>
          <div className="space-y-1.5">
            {board.leaderboard.map((entry) => (
              <div
                key={entry.user_id}
                className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-xs font-medium ${
                  entry.is_me ? 'bg-blue-50/50 dark:bg-blue-500/10 border-blue-500/30' : 'bg-surface/60 border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border shrink-0 ${
                      RANK_STYLES[entry.rank] || 'bg-card text-muted border-line'
                    }`}
                  >
                    {entry.rank}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {entry.display_name}
                      {entry.is_me && <span className="text-blue-600 dark:text-blue-400"> (you)</span>}
                    </p>
                    <p className="text-[10px] text-muted font-medium capitalize">
                      Week {entry.current_week} · {entry.status}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-ink shrink-0">{entry.total_points}</span>
              </div>
            ))}
          </div>
        </section>

        {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium text-center">{error}</p>}
      </div>
    );
  }

  return null;
}