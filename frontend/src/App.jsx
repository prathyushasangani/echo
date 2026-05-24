import { useEffect, useMemo, useState } from 'react';
import { History, RefreshCcw } from 'lucide-react';
import { AgentInput } from './components/AgentInput.jsx';
import { ChatPanel } from './components/ChatPanel.jsx';
import { TaskSection } from './components/TaskSection.jsx';
import { VoicePanel } from './components/VoicePanel.jsx';
import { completeTask, deleteTask, fetchTasks, parseTask } from './lib/api.js';

const CATEGORY_ORDER = ['Travel', 'Office', 'Home', 'General'];
const ONE_TIME_TYPE = 'One-time';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState('');
  const [reminderType, setReminderType] = useState(ONE_TIME_TYPE);

  async function loadTasks(includeCompleted = showHistory) {
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
  }, [showHistory]);

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
            <small>Personal Reminder Assistant</small>
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
