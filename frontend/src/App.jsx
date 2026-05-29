import { useEffect, useMemo, useState } from 'react';
import { BellRing, History, LogOut, RefreshCcw, ShieldCheck } from 'lucide-react';
import { AgentInput } from './components/AgentInput.jsx';
import { AdminPage } from './components/AdminPage.jsx';
import { AuthPage } from './components/AuthPage.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { TaskSection } from './components/TaskSection.jsx';
import { VoicePanel } from './components/VoicePanel.jsx';
import {
  completeTask,
  deleteTask,
  getCachedUser,
  fetchCurrentUser,
  fetchTasks,
  getAuthToken,
  notifyDueTasks,
  parseTask,
  signUpAccount,
  signInAccount,
  signInWithGoogleAccount,
  signOutAccount
} from './lib/api.js';
import { canUsePushNotifications, enablePushNotifications } from './lib/push.js';

const CATEGORY_ORDER = ['Travel', 'Office', 'Home', 'General'];
const ONE_TIME_TYPE = 'One-time';
const ADMIN_EMAIL = 'pratsa@gmail.com';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(getAuthToken()));
  const [tasks, setTasks] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [error, setError] = useState('');
  const [pushStatus, setPushStatus] = useState('');
  const [reminderType, setReminderType] = useState(ONE_TIME_TYPE);
  const canOpenAdmin = user?.is_admin && user.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!getAuthToken()) return;

    let isMounted = true;
    const cachedUser = getCachedUser();
    if (cachedUser && isMounted) {
      setUser(cachedUser);
      setAuthLoading(false);
    }

    fetchCurrentUser()
      .then((currentUser) => {
        if (isMounted) setUser(currentUser);
      })
      .catch((error) => {
        if (!isMounted) return;
        const message = String(error?.message || '');
        if (/please sign in first|no signed-in user|invalid|401/i.test(message)) {
          signOutAccount();
          setUser(null);
        } else if (!cachedUser) {
          setError('Could not restore your session. Please try again.');
        }
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
    if (!user) return undefined;

    let isChecking = false;
    const checkDueTasks = async () => {
      if (isChecking) return;
      isChecking = true;
      try {
        const dueTasks = await notifyDueTasks();
        if (dueTasks.length) {
          const titles = dueTasks.map((task) => task.title).join(', ');
          setPushStatus(`Reminder due: ${titles}`);
          if ('Notification' in window && Notification.permission === 'granted') {
            dueTasks.forEach((task) => {
              new Notification('Echo reminder', { body: task.title });
            });
          }
          await loadTasks(showHistory);
        }
      } catch {
        // Hosted free mode reminders should never interrupt normal app use.
      } finally {
        isChecking = false;
      }
    };

    checkDueTasks();
    const timer = window.setInterval(checkDueTasks, 1000);
    return () => window.clearInterval(timer);
  }, [showHistory, user]);

  async function handleSignIn(credentials) {
    const signedInUser = await signInAccount(credentials);
    setUser(signedInUser);
    setTasks([]);
  }

  async function handleSignUp(credentials) {
    const signedInUser = await signUpAccount(credentials);
    setUser(signedInUser);
    setTasks([]);
  }

  async function handleGoogleSignIn(idToken) {
    const signedInUser = await signInWithGoogleAccount(idToken);
    setUser(signedInUser);
    setTasks([]);
  }

  async function handleEnablePush() {
    setError('');
    setPushStatus('');
    try {
      await enablePushNotifications();
      setPushStatus('Phone push reminders are enabled on this device.');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function handleSignOut() {
    signOutAccount();
    setUser(null);
    setTasks([]);
    setPrompt('');
    setShowAdmin(false);
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
      setReminderType(ONE_TIME_TYPE);
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
    return <AuthPage onSignIn={handleSignIn} onSignUp={handleSignUp} onGoogleSignIn={handleGoogleSignIn} />;
  }

  if (showAdmin && canOpenAdmin) {
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
          {canOpenAdmin && (
            <button className="tool-button" onClick={() => setShowAdmin(true)} title="Open admin">
              <ShieldCheck size={17} aria-hidden="true" />
              Admin
            </button>
          )}
          {canUsePushNotifications() && (
            <button className="tool-button" onClick={handleEnablePush} title="Enable phone push reminders">
              <BellRing size={17} aria-hidden="true" />
              Phone push
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
      {pushStatus && <div className="notice notice--success">{pushStatus}</div>}
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
