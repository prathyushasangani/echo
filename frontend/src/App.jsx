import { useEffect, useMemo, useState } from 'react';
import { History, LogOut, RefreshCcw, ShieldCheck } from 'lucide-react';
import { AgentInput } from './components/AgentInput.jsx';
import { AdminPage } from './components/AdminPage.jsx';
import { AuthPage } from './components/AuthPage.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { TaskSection } from './components/TaskSection.jsx';
import { VoicePanel } from './components/VoicePanel.jsx';
import {
  completeTask,
  claimAdminAccount,
  deleteTask,
  fetchAdminStatus,
  fetchCurrentUser,
  fetchTasks,
  getAuthToken,
  parseTask,
  signInAccount,
  signOutAccount,
  signUpAccount
} from './lib/api.js';

const CATEGORY_ORDER = ['Travel', 'Office', 'Home', 'General'];
const ONE_TIME_TYPE = 'One-time';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(getAuthToken()));
  const [tasks, setTasks] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminClaimAvailable, setAdminClaimAvailable] = useState(false);
  const [error, setError] = useState('');
  const [reminderType, setReminderType] = useState(ONE_TIME_TYPE);

  useEffect(() => {
    if (!getAuthToken()) return;

    let isMounted = true;
    fetchCurrentUser()
      .then((currentUser) => {
        if (isMounted) setUser(currentUser);
      })
      .catch(() => {
        signOutAccount();
      })
      .finally(() => {
        if (isMounted) setAuthLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function loadTasks(includeCompleted = showHistory) {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      setTasks(await fetchTasks(includeCompleted));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks(showHistory);
  }, [showHistory, user]);

  useEffect(() => {
    if (!user || user.is_admin) {
      setAdminClaimAvailable(false);
      return;
    }

    let isMounted = true;
    fetchAdminStatus()
      .then((status) => {
        if (isMounted) setAdminClaimAvailable(!status.has_admin);
      })
      .catch(() => {
        if (isMounted) setAdminClaimAvailable(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  async function handleSignIn(credentials) {
    const signedInUser = await signInAccount(credentials);
    setUser(signedInUser);
    setTasks([]);
  }

  async function handleSignUp(details) {
    const signedInUser = await signUpAccount(details);
    setUser(signedInUser);
    setTasks([]);
  }

  function handleSignOut() {
    signOutAccount();
    setUser(null);
    setTasks([]);
    setPrompt('');
    setShowAdmin(false);
  }

  async function handleClaimAdmin() {
    setError('');
    try {
      setUser(await claimAdminAccount());
      setAdminClaimAvailable(false);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!prompt.trim()) return;

    setSubmitting(true);
    setError('');
    try {
      const isOneTime = reminderType === ONE_TIME_TYPE;
      await parseTask(prompt, {
        category: isOneTime ? 'General' : reminderType,
        is_recurring: !isOneTime
      });
      setPrompt('');
      await loadTasks(showHistory);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(task) {
    await completeTask(task.id);
    await loadTasks(showHistory);
  }

  async function handleDelete(id) {
    await deleteTask(id);
    await loadTasks(showHistory);
  }

  const { routineGroups, routineCount, oneTime, history } = useMemo(() => {
    const routines = tasks.filter((task) => task.is_recurring && task.status === 'pending');
    const routineGroups = CATEGORY_ORDER.map((category) => ({
      category,
      tasks: routines.filter((task) => (task.category || 'General') === category)
    }));

    return {
      routineGroups,
      routineCount: routines.length,
      oneTime: tasks.filter((task) => !task.is_recurring && task.status === 'pending'),
      history: tasks.filter((task) => task.status === 'completed')
    };
  }, [tasks]);

  if (authLoading) {
    return <main className="app-shell"><div className="loading">Checking account...</div></main>;
  }

  if (!user) {
    return <AuthPage onSignIn={handleSignIn} onSignUp={handleSignUp} />;
  }

  if (showAdmin && user.is_admin) {
    return <AdminPage onBack={() => setShowAdmin(false)} />;
  }

  return (
    <main className="app-shell">
      <div className="jarvis-bg" aria-hidden="true">
        <span className="glow glow--blue" />
        <span className="glow glow--violet" />
        <span className="scan-ring scan-ring--one" />
        <span className="scan-ring scan-ring--two" />
        <span className="tech-cube tech-cube--one" />
        <span className="tech-cube tech-cube--two" />
      </div>
      <header className="topbar topbar--compact">
        <div className="brand-mark">
          <span>E</span>
          <div>
            <strong>Echo</strong>
            <small>{user.name}'s reminder assistant</small>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="tool-button" onClick={() => loadTasks(showHistory)} title="Refresh reminders">
            <RefreshCcw size={17} aria-hidden="true" />
            Refresh
          </button>
          <label className="history-toggle">
            <input type="checkbox" checked={showHistory} onChange={(event) => setShowHistory(event.target.checked)} />
            <History size={16} aria-hidden="true" />
            History
          </label>
          {user.is_admin && (
            <button className="tool-button" onClick={() => setShowAdmin(true)} title="Open admin">
              <ShieldCheck size={17} aria-hidden="true" />
              Admin
            </button>
          )}
          {adminClaimAvailable && (
            <button className="tool-button" onClick={handleClaimAdmin} title="Claim admin access">
              <ShieldCheck size={17} aria-hidden="true" />
              Claim Admin
            </button>
          )}
          <button className="tool-button" onClick={handleSignOut} title="Sign out">
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </header>

      <AgentInput
        value={prompt}
        onChange={setPrompt}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
        reminderType={reminderType}
        onReminderTypeChange={setReminderType}
      />

      {error && <div className="notice">{error}</div>}
      {loading && <div className="loading">Loading reminders...</div>}

      <VoicePanel onTasksChanged={() => loadTasks(showHistory)} />

      <div className="board">
        <div className="tasks-column">
          <section className="task-section">
            <header>
              <div>
                <h2>Daily Routines</h2>
                <p>Recurring reminders stay grouped and move forward after completion.</p>
              </div>
              <span>{routineCount}</span>
            </header>
            <div className="category-grid">
              {routineGroups.map((group) => (
                <TaskSection
                  key={group.category}
                  title={group.category}
                  subtitle=""
                  tasks={group.tasks}
                  emptyText={`No ${group.category.toLowerCase()} routines.`}
                  onComplete={handleComplete}
                  onDelete={handleDelete}
                  compact
                />
              ))}
            </div>
          </section>
          <TaskSection
            title="One-Time Reminders"
            subtitle="Completed reminders are archived into history."
            tasks={oneTime}
            emptyText="No one-time reminders due."
            onComplete={handleComplete}
            onDelete={handleDelete}
          />
        </div>
        <ChatPanel onTasksChanged={() => loadTasks(showHistory)} />
      </div>

      {showHistory && (
        <TaskSection
          title="History"
          subtitle="Completed one-time reminders."
          tasks={history}
          emptyText="No archived reminders yet."
          onComplete={handleComplete}
          onDelete={handleDelete}
        />
      )}
    </main>
  );
}
